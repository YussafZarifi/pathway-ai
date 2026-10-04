"""Saved roadmaps for signed-in users (ADR-019).

FastAPI is the only writer of AI-generated content: these routes generate a
roadmap (Gemini + YouTube, no database transaction open), then save it
through the repository as the pathwayai_api role, scoped to the verified
user. The browser reads saved roadmaps directly through RLS; there are no
GET routes here.

Errors: 401 bad/missing token · 404 a roadmap that doesn't exist or isn't
yours (same answer) · 409 a roadmap without saved answers can't be
regenerated · 422 invalid body · 429 rate limit · 503 accounts or database
not configured, database down, or generation succeeded but saving failed.
"""

import logging
import uuid

import psycopg
from fastapi import APIRouter, Depends, HTTPException
from pydantic import TypeAdapter, ValidationError

import db
from ai_output import Career
from auth import AuthUser, current_user
from generation import generate_roadmap, prompt_version
from rate_limit import limit_ai_requests
from repositories.roadmaps import PostgresRoadmapRepository, RoadmapRepository
from schemas import QuizAnswers, SaveRoadmapRequest

logger = logging.getLogger("pathwayai.roadmaps")

router = APIRouter(prefix="/api/roadmaps", tags=["roadmaps"])

NOT_CONFIGURED = "Saving roadmaps to your account isn't available right now."
DB_UNAVAILABLE = "We couldn't reach your saved roadmaps right now. Please try again."
SAVE_FAILED = "Your roadmap was generated but couldn't be saved to your account. Please try again."
NOT_FOUND = "We couldn't find that roadmap."
CANT_REGENERATE = (
    "This roadmap can't be regenerated because its quiz answers weren't saved. "
    "Retake the quiz to get a new one."
)
INVALID_CAREER = "The selected career's details are invalid. Please pick a career again."

_answers_adapter = TypeAdapter(QuizAnswers)


def get_repository() -> RoadmapRepository:
    """FastAPI dependency; tests override it with the in-memory repository."""
    if not db.configured():
        raise HTTPException(status_code=503, detail=NOT_CONFIGURED)
    return PostgresRoadmapRepository()


def valid_career_data(raw: dict | None) -> dict | None:
    if raw is None:
        return None
    try:
        return Career.model_validate(raw).model_dump()
    except ValidationError:
        raise HTTPException(status_code=422, detail=INVALID_CAREER) from None


def _save(action: str, fn, *args, **kwargs):
    """Run a repository write after a successful generation."""
    try:
        return fn(*args, **kwargs)
    except (db.DatabaseUnavailable, psycopg.Error) as e:
        # Type only: never values, which may contain user answers.
        logger.error("Saving roadmap failed (%s): %s", action, type(e).__name__)
        raise HTTPException(status_code=503, detail=SAVE_FAILED) from None


# Dependencies run in this order: a signed-in user, a configured database,
# then the AI rate limit, so rejected requests don't spend the caller's quota.
@router.post("", status_code=201)
def create_roadmap(
    payload: SaveRoadmapRequest,
    user: AuthUser = Depends(current_user),
    repo: RoadmapRepository = Depends(get_repository),
    _limit: None = Depends(limit_ai_requests),
):
    """Generate a roadmap for the chosen career and save it as the user's
    current roadmap (the previous one is archived)."""
    career_data = valid_career_data(payload.career_data)
    result = generate_roadmap(payload.answers, payload.career)
    return _save(
        "create", repo.create, user.id,
        answers=payload.answers.model_dump(), answers_version=payload.answers.version,
        career=payload.career, career_data=career_data,
        prompt_version=prompt_version(payload.answers), steps=result["roadmap"],
    )


@router.post("/{roadmap_id}/regenerate", status_code=201)
def regenerate_roadmap(
    roadmap_id: uuid.UUID,
    user: AuthUser = Depends(current_user),
    repo: RoadmapRepository = Depends(get_repository),
    _limit: None = Depends(limit_ai_requests),
):
    """A new roadmap from the same saved answers and career; it becomes the
    current one and the previous current one is archived."""
    try:
        source = repo.get_source(user.id, str(roadmap_id))
    except (db.DatabaseUnavailable, psycopg.Error) as e:
        logger.error("Loading roadmap failed: %s", type(e).__name__)
        raise HTTPException(status_code=503, detail=DB_UNAVAILABLE) from None
    if source is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    if not source.get("answers"):
        raise HTTPException(status_code=409, detail=CANT_REGENERATE)

    try:
        answers = _answers_adapter.validate_python(source["answers"])
    except ValidationError:
        logger.warning("Stored answers no longer validate (version %s)", source.get("answers_version"))
        raise HTTPException(status_code=409, detail=CANT_REGENERATE) from None

    result = generate_roadmap(answers, source["career"])
    return _save(
        "regenerate", repo.add_regenerated, user.id,
        source=source, prompt_version=prompt_version(answers), steps=result["roadmap"],
    )
