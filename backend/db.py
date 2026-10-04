"""Postgres access for signed-in users' saved roadmaps (ADR-019).

FastAPI connects as the least-privilege `pathwayai_api` role through
Supabase's transaction pooler. Every query runs inside `transaction(user_id)`,
which sets the verified user's claims for that transaction only, so the
row-level-security policies (`private.request_user_id()`) limit it to that
user's rows. Claims are transaction-local (`is_local = true`): they can never
leak to another request that reuses the pooled connection.

The pool is created on first use; without DATABASE_URL nothing connects and
`configured()` is False. Nothing here logs the URL, queries' values or rows.
"""

import json
import logging
import threading
from contextlib import contextmanager

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool, PoolTimeout

import config

logger = logging.getLogger("pathwayai.db")

# Wait at most this long for a free connection before giving up (503).
POOL_TIMEOUT_SECONDS = 10


class DatabaseUnavailable(Exception):
    """The database is not configured or can't be reached right now."""


_pool: ConnectionPool | None = None
_pool_lock = threading.Lock()


def configured() -> bool:
    return bool(config.DATABASE_URL)


def _get_pool() -> ConnectionPool:
    global _pool
    if not configured():
        raise DatabaseUnavailable("DATABASE_URL is not set")
    with _pool_lock:
        if _pool is None:
            _pool = ConnectionPool(
                config.DATABASE_URL,
                min_size=1,
                max_size=max(1, config.DB_POOL_MAX),
                timeout=POOL_TIMEOUT_SECONDS,
                # The transaction pooler doesn't support prepared statements.
                kwargs={"prepare_threshold": None, "row_factory": dict_row, "connect_timeout": 10},
                # Pooled server connections can be closed by the pooler while
                # idle; check each one before handing it out.
                check=ConnectionPool.check_connection,
                name="pathwayai",
                open=False,
            )
            # Don't block startup or the first request on min_size connections.
            _pool.open(wait=False)
    return _pool


def close() -> None:
    """Close the pool (app shutdown). Safe to call when it was never opened."""
    global _pool
    with _pool_lock:
        if _pool is not None:
            _pool.close()
            _pool = None


def claims_json(user_id: str) -> str:
    # The same shape PostgREST sets for browser requests; the policies only
    # read "sub".
    return json.dumps({"sub": str(user_id), "role": "authenticated"})


@contextmanager
def transaction(user_id: str):
    """Yield a connection inside one transaction scoped to `user_id`.

    Commits when the block finishes, rolls back on any exception. Connection
    problems become DatabaseUnavailable; other database errors (constraint
    violations, RLS refusals) propagate unchanged for the caller to handle.
    """
    pool = _get_pool()
    try:
        with pool.connection() as conn:
            with conn.transaction():
                conn.execute(
                    "select set_config('request.jwt.claims', %s, true)", (claims_json(user_id),)
                )
                yield conn
    except PoolTimeout:
        logger.warning("Database pool timeout")
        raise DatabaseUnavailable("pool timeout") from None
    except psycopg.OperationalError as e:
        logger.warning("Database unavailable: %s", type(e).__name__)
        raise DatabaseUnavailable("operational error") from None
