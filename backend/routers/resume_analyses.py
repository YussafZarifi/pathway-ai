"""Résumé analysis routes for signed-in users (ADR-020).

GET /api/resume-analyses/availability tells the /resume page whether it may
offer an upload: {available, reason, career, roadmap_id}. `reason` is one of
"feature_disabled", "no_active_roadmap" or "unavailable" (accounts'
database not configured) and null when available; `career` is the active
roadmap's career the résumé would be reviewed against and `roadmap_id`
its id (so the page can link a review's gaps to that roadmap's steps).
Nothing else (no
limits, quotas or configuration) is exposed. 401 without a valid token, 503
when the user's roadmap can't be read right now.

POST /api/resume-analyses: analyze a résumé PDF against the signed-in
user's current roadmap and save the structured result.

The body is the raw PDF (`Content-Type: application/pdf`), not multipart.
Dependencies run in this order, and all of them before any of the body is
read (an upload declared over 2 MB is already refused by the body-limit
middleware, before this route runs):

  token (401/503) → database configured (503) → feature switch (503) →
  Content-Type (415) → per-user rate limit (429) → active roadmap (409/503)

Then the body is read (2 MB, counted while it arrives: 413), checked
(422), sent to Gemini (502/503) and the validated analysis is saved in one
insert (503 if saving fails). The PDF lives only in this request's memory:
it is never stored or logged, nor its text, file name or a hash of it.
Logs record outcome, size and timing only.
"""

import logging
import time

import psycopg
from fastapi import APIRouter, Depends, Header, HTTPException, Request

import config
import db
import llm
import resume_ai
from auth import AuthUser, current_user
from body_limit import TOO_LARGE
from generation import ai_http_error
from rate_limit import limit_resume_requests
from repositories.resume_analyses import PostgresResumeAnalysisRepository, ResumeAnalysisRepository

logger = logging.getLogger("pathwayai.resume")

router = APIRouter(prefix="/api/resume-analyses", tags=["resume"])

NOT_CONFIGURED = "Résumé analysis isn't available right now."
DISABLED = "Résumé analysis isn't available yet."
WRONG_TYPE = "Please upload your résumé as a PDF file."
NO_ROADMAP = "Create a roadmap first: your résumé is reviewed against your current roadmap's career."
DB_UNAVAILABLE = "We couldn't reach your account right now. Please try again."
SAVE_FAILED = "Your résumé was analyzed but the result couldn't be saved. Please try again."
ANALYSIS_FAILED = "We couldn't analyze your résumé right now. Please try again."
INPUT_ERRORS = {
    "too_large": (413, "Your PDF is larger than 2 MB. Please upload a smaller file."),
    "too_small": (422, "This file is too small to be a résumé PDF."),
    "not_pdf": (422, "This file isn't a valid PDF. Please export your résumé as a PDF and try again."),
    "not_resume": (422, "This PDF doesn't look like a résumé, or its text can't be read. "
                        "Please upload a text-based résumé PDF."),
}


def get_repository() -> ResumeAnalysisRepository:
    """FastAPI dependency; tests override it with the in-memory repository."""
    if not db.configured():
        raise HTTPException(status_code=503, detail=NOT_CONFIGURED)
    return PostgresResumeAnalysisRepository()


def require_enabled() -> None:
    """The privacy switch (ADR-020): off unless RESUME_ANALYSIS_ENABLED."""
    if not config.RESUME_ANALYSIS_ENABLED:
        raise HTTPException(status_code=503, detail=DISABLED)


def require_pdf(content_type: str | None = Header(default=None)) -> None:
    media_type = (content_type or "").split(";")[0].strip().lower()
    if media_type != "application/pdf":
        raise HTTPException(status_code=415, detail=WRONG_TYPE)


def limit_requests(user: AuthUser = Depends(current_user)) -> None:
    limit_resume_requests(user.id)


def active_target(
    user: AuthUser = Depends(current_user),
    repo: ResumeAnalysisRepository = Depends(get_repository),
) -> dict:
    try:
        target = repo.active_target(user.id)
    except (db.DatabaseUnavailable, psycopg.Error) as e:
        logger.error("Loading the résumé target failed: %s", type(e).__name__)
        raise HTTPException(status_code=503, detail=DB_UNAVAILABLE) from None
    if target is None:
        raise HTTPException(status_code=409, detail=NO_ROADMAP)
    return target


async def read_pdf(request: Request) -> bytes:
    """The raw body, at most MAX_PDF_BYTES, counted while it is received
    (the body-limit middleware enforces the same limit; this is a second
    guard that doesn't depend on its configuration)."""
    chunks, size = [], 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > resume_ai.MAX_PDF_BYTES:
            raise HTTPException(status_code=413, detail=TOO_LARGE)
        chunks.append(chunk)
    return b"".join(chunks)


def optional_repository() -> ResumeAnalysisRepository | None:
    """Like get_repository, but None instead of 503 when there's no database
    (the availability check reports that as a reason). Tests override it."""
    return PostgresResumeAnalysisRepository() if db.configured() else None


@router.get("/availability")
def availability(
    user: AuthUser = Depends(current_user),
    repo: ResumeAnalysisRepository | None = Depends(optional_repository),
):
    """Whether the signed-in user can analyze a résumé right now. The
    feature switch comes first, so a disabled feature never touches the
    database."""
    if not config.RESUME_ANALYSIS_ENABLED:
        return {"available": False, "reason": "feature_disabled", "career": None, "roadmap_id": None}
    if repo is None:
        return {"available": False, "reason": "unavailable", "career": None, "roadmap_id": None}
    try:
        target = repo.active_target(user.id)
    except (db.DatabaseUnavailable, psycopg.Error) as e:
        logger.error("Loading the résumé target failed: %s", type(e).__name__)
        raise HTTPException(status_code=503, detail=DB_UNAVAILABLE) from None
    if target is None:
        return {"available": False, "reason": "no_active_roadmap", "career": None, "roadmap_id": None}
    return {"available": True, "reason": None, "career": target["career"],
            "roadmap_id": target["roadmap_id"]}


# Parameter order is the check order (FastAPI resolves dependencies in
# order); `pdf` comes last so nothing is read before the checks pass.
@router.post("", status_code=201)
def create_analysis(
    user: AuthUser = Depends(current_user),
    repo: ResumeAnalysisRepository = Depends(get_repository),
    _enabled: None = Depends(require_enabled),
    _pdf_type: None = Depends(require_pdf),
    _limit: None = Depends(limit_requests),
    target: dict = Depends(active_target),
    pdf: bytes = Depends(read_pdf),
):
    started = time.perf_counter()
    size = len(pdf)
    try:
        result = resume_ai.analyze_resume(pdf, target["career"], target["skills"], target["steps"])
    except resume_ai.ResumeInputError as e:
        logger.info("Résumé rejected: %s (%d bytes)", e.kind, size)
        status, detail = INPUT_ERRORS[e.kind]
        raise HTTPException(status_code=status, detail=detail) from None
    except llm.AIServiceError as e:
        logger.warning("Résumé analysis failed: %s (%d bytes, %.1fs)", e.kind, size,
                       time.perf_counter() - started)
        raise ai_http_error(e, ANALYSIS_FAILED) from None

    try:
        saved = repo.create(user.id, roadmap_id=target["roadmap_id"], **result)
    except (db.DatabaseUnavailable, psycopg.Error) as e:
        # Type only: a database error's message could quote the values.
        logger.error("Saving the résumé analysis failed: %s", type(e).__name__)
        raise HTTPException(status_code=503, detail=SAVE_FAILED) from None

    logger.info("Résumé analysis saved (%d bytes, %.1fs)", size, time.perf_counter() - started)
    return saved
