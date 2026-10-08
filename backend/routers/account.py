"""Account data routes for signed-in users (ADR-022).

GET /api/me/export: one JSON file with everything PathwayAI stores about
the user, including the quiz answers the browser can't read.

DELETE /api/me {"confirm": "DELETE"}: deletes the account and, by cascade,
all its data. Needs a recent password confirmation: the token's `amr`
claim must show a password sign-in within RECENT_PASSWORD_SECONDS (the page
asks for the password again just before), so a stolen access token alone
can't delete an account.

Both: token (401/503) → database (503) → per-user limit (429; export and
deletion have separate budgets, so exporting first never blocks a
deletion). Logs never contain the exported data or the user's id or email.
"""

import logging
import time
from datetime import datetime, timezone
from typing import Literal

import psycopg
from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict

import db
from auth import CLOCK_SKEW_SECONDS, AuthUser, current_user
from rate_limit import limit_account_requests, limit_deletion_requests
from repositories.account import AccountRepository, PostgresAccountRepository

logger = logging.getLogger("pathwayai.account")

router = APIRouter(prefix="/api/me", tags=["account"])

RECENT_PASSWORD_SECONDS = 5 * 60

NOT_CONFIGURED = "Account data isn't available right now."
DB_UNAVAILABLE = "We couldn't reach your account right now. Please try again."
CONFIRM_PASSWORD = "Please confirm your password and try again."


class DeleteAccountRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    confirm: Literal["DELETE"]


def get_repository() -> AccountRepository:
    """FastAPI dependency; tests override it with the in-memory repository."""
    if not db.configured():
        raise HTTPException(status_code=503, detail=NOT_CONFIGURED)
    return PostgresAccountRepository()


def limit_requests(user: AuthUser = Depends(current_user)) -> None:
    limit_account_requests(user.id)


def limit_deletions(user: AuthUser = Depends(current_user)) -> None:
    limit_deletion_requests(user.id)


@router.get("/export")
def export_data(
    user: AuthUser = Depends(current_user),
    repo: AccountRepository = Depends(get_repository),
    _limit: None = Depends(limit_requests),
):
    try:
        tables = repo.export(user.id)
    except (db.DatabaseUnavailable, psycopg.Error) as e:
        logger.error("Export failed: %s", type(e).__name__)
        raise HTTPException(status_code=503, detail=DB_UNAVAILABLE) from None

    body = {
        "format": "pathwayai-export-1",
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "account": {"id": user.id, "email": user.email},
        **tables,
    }
    logger.info("Export served (%d tables)", len(tables))
    return JSONResponse(
        content=jsonable_encoder(body),
        headers={
            "Content-Disposition": 'attachment; filename="pathwayai-export.json"',
            "Cache-Control": "no-store",
        },
    )


@router.delete("", status_code=204)
def delete_account(
    payload: DeleteAccountRequest,
    user: AuthUser = Depends(current_user),
    repo: AccountRepository = Depends(get_repository),
    _limit: None = Depends(limit_deletions),
):
    now = time.time()
    if user.password_at is None or not (
        now - RECENT_PASSWORD_SECONDS <= user.password_at <= now + CLOCK_SKEW_SECONDS
    ):
        raise HTTPException(status_code=403, detail=CONFIRM_PASSWORD)
    try:
        deleted = repo.delete(user.id)
    except (db.DatabaseUnavailable, psycopg.Error) as e:
        logger.error("Account deletion failed: %s", type(e).__name__)
        raise HTTPException(status_code=503, detail=DB_UNAVAILABLE) from None
    logger.info("Account deletion: %s", "deleted" if deleted else "already gone")
    return Response(status_code=204)
