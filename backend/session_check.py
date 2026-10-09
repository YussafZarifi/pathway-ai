"""Refuse access tokens whose Supabase session has ended (ADR-022 amendment).

Access tokens are verified offline (auth.py) and stay valid until they
expire, up to an hour, even after "Sign out everywhere" or account deletion
removed their session. `live_user` is used instead of `current_user` on
routes that spend AI quota, write data or return the account's data: it asks
the database whether the token's session still exists, through
private.session_is_active(), which only answers for the user in the
transaction's claims.
"""
import logging
import uuid

import psycopg
from fastapi import Depends, HTTPException

import db
from auth import SIGN_IN, AuthUser, current_user

logger = logging.getLogger("pathwayai.auth")

UNAVAILABLE = "We couldn't check your sign-in right now. Please try again in a moment."


def session_active(user: AuthUser) -> bool:
    """True while the token's session exists. Tokens without a valid
    session_id claim never count as active."""
    try:
        session_id = str(uuid.UUID(user.session_id or ""))
    except ValueError:
        return False
    with db.transaction(user.id) as conn:
        row = conn.execute(
            "select private.session_is_active(%s::uuid) as active", (session_id,)
        ).fetchone()
    return bool(row and row["active"])


def live_user(user: AuthUser = Depends(current_user)) -> AuthUser:
    """FastAPI dependency: `current_user`, plus a live session. Without a
    database the check is skipped; every route using it needs the database
    and answers 503 on its own."""
    if not db.configured():
        return user
    try:
        active = session_active(user)
    except (db.DatabaseUnavailable, psycopg.Error) as e:
        logger.warning("Session check failed: %s", type(e).__name__)
        raise HTTPException(status_code=503, detail=UNAVAILABLE) from None
    if not active:
        logger.info("Rejected a token whose session has ended")
        raise HTTPException(status_code=401, detail=SIGN_IN, headers={"WWW-Authenticate": "Bearer"})
    return user
