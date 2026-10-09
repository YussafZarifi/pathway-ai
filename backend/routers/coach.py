"""AI Coach routes for signed-in users (ADR-021).

GET /api/coach/availability: {available, reason} for the /coach page;
reason is "feature_disabled" or "unavailable" (accounts' database not
configured), null when available.

POST /api/coach/messages {thread_id?, message}: one coach reply. Checks run
in this order: token (401/503) → database configured (503) → COACH_ENABLED
(503) → per-user rate limit (429) → message (422, also when it contains an
email address or phone number) → thread is the user's (404) and not full
(409) → Gemini (502/503) → both messages saved in one transaction (503).
Nothing is saved when generation fails.

The browser reads threads and messages and deletes threads directly
through Supabase (RLS); there are no other routes. Logs record outcome,
sizes and timings only, never message text, titles or context.
"""

import logging
import time

import psycopg
from fastapi import APIRouter, Depends, HTTPException

import coach_ai
import config
import db
import llm
from auth import AuthUser, current_user
from session_check import live_user
from generation import ai_http_error
from rate_limit import limit_coach_requests
from repositories.coach import CoachRepository, PostgresCoachRepository, ThreadFull, ThreadNotFound
from schemas import CoachMessageRequest
from strict_ai import contains_contact_details

logger = logging.getLogger("pathwayai.coach")

router = APIRouter(prefix="/api/coach", tags=["coach"])

MAX_MESSAGES_PER_THREAD = 200
TITLE_LENGTH = 60

NOT_CONFIGURED = "The AI Coach isn't available right now."
DISABLED = "The AI Coach isn't available yet."
PERSONAL_DATA = "Please remove email addresses and phone numbers from your message. The coach doesn't need them."
NOT_FOUND = "We couldn't find that conversation."
THREAD_FULL = "This conversation is long enough. Please start a new one."
DB_UNAVAILABLE = "We couldn't reach your account right now. Please try again."
SAVE_FAILED = "The coach replied but the conversation couldn't be saved. Please try again."
COACH_FAILED = "The coach couldn't reply right now. Please try again."


def get_repository() -> CoachRepository:
    """FastAPI dependency; tests override it with the in-memory repository."""
    if not db.configured():
        raise HTTPException(status_code=503, detail=NOT_CONFIGURED)
    return PostgresCoachRepository()


def require_enabled() -> None:
    if not config.COACH_ENABLED:
        raise HTTPException(status_code=503, detail=DISABLED)


def limit_requests(user: AuthUser = Depends(current_user)) -> None:
    limit_coach_requests(user.id)


def optional_repository() -> CoachRepository | None:
    """Like get_repository, but None instead of 503 when there's no database
    (the availability check reports that as a reason). Tests override it."""
    return PostgresCoachRepository() if db.configured() else None


@router.get("/availability")
def availability(
    user: AuthUser = Depends(current_user),
    repo: CoachRepository | None = Depends(optional_repository),
):
    """Whether the signed-in user can chat with the coach right now."""
    if not config.COACH_ENABLED:
        return {"available": False, "reason": "feature_disabled"}
    if repo is None:
        return {"available": False, "reason": "unavailable"}
    return {"available": True, "reason": None}


def _title(message: str) -> str:
    text = " ".join(message.split())
    return text if len(text) <= TITLE_LENGTH else text[: TITLE_LENGTH - 1].rstrip() + "…"


# Parameter order is the check order (FastAPI resolves dependencies in order).
@router.post("/messages", status_code=201)
def post_message(
    payload: CoachMessageRequest,
    user: AuthUser = Depends(live_user),
    repo: CoachRepository = Depends(get_repository),
    _enabled: None = Depends(require_enabled),
    _limit: None = Depends(limit_requests),
):
    started = time.perf_counter()
    if contains_contact_details(payload.message):
        logger.info("Coach message refused: contact details")
        raise HTTPException(status_code=422, detail=PERSONAL_DATA)

    thread_id = str(payload.thread_id) if payload.thread_id else None
    try:
        loaded = repo.load(user.id, thread_id, history=coach_ai.HISTORY_MESSAGES,
                           max_messages=MAX_MESSAGES_PER_THREAD)
    except ThreadNotFound:
        raise HTTPException(status_code=404, detail=NOT_FOUND) from None
    except ThreadFull:
        raise HTTPException(status_code=409, detail=THREAD_FULL) from None
    except (db.DatabaseUnavailable, psycopg.Error) as e:
        logger.error("Loading the coach context failed: %s", type(e).__name__)
        raise HTTPException(status_code=503, detail=DB_UNAVAILABLE) from None

    context = loaded["context"]
    try:
        result = coach_ai.coach_reply(payload.message, loaded["history"], context)
    except llm.AIServiceError as e:
        logger.warning("Coach reply failed: %s (%.1fs)", e.kind, time.perf_counter() - started)
        raise ai_http_error(e, COACH_FAILED) from None

    try:
        saved = repo.save_exchange(
            user.id,
            thread_id=thread_id,
            roadmap_id=context["roadmap_id"] if context else None,
            title=_title(payload.message),
            message=payload.message,
            reply=result["reply"],
            actions=result["actions"],
        )
    except ThreadNotFound:  # deleted while the coach was replying
        raise HTTPException(status_code=404, detail=NOT_FOUND) from None
    except (db.DatabaseUnavailable, psycopg.Error) as e:
        logger.error("Saving the coach exchange failed: %s", type(e).__name__)
        raise HTTPException(status_code=503, detail=SAVE_FAILED) from None

    logger.info(
        "Coach reply saved (%s thread, history=%d, actions=%d, %.1fs)",
        "new" if thread_id is None else "existing", len(loaded["history"]),
        len(result["actions"]), time.perf_counter() - started,
    )
    return saved
