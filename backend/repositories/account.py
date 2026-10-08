"""A user's whole account data: export and deletion (ADR-022).

Both run as pathwayai_api inside `db.transaction(user_id)`, so RLS limits
every read to the user's own rows (on top of the explicit filters), and
deletion goes through `private.delete_current_user()`, which can only
delete the user whose claims the transaction carries.

`PostgresAccountRepository` is the real one; `InMemoryAccountRepository`
implements the same contract for tests.
"""

from typing import Protocol

import db


class AccountRepository(Protocol):
    def export(self, user_id: str) -> dict:
        """Everything stored about the user (without internal user ids)."""

    def delete(self, user_id: str) -> bool:
        """Delete the user and, by cascade, all their rows. False if already gone."""


# Table → order; every table is read with the user's claims (RLS).
EXPORT_QUERIES = {
    "quiz_submissions": "select * from public.quiz_submissions where user_id = %s order by created_at",
    "roadmaps": "select * from public.roadmaps where user_id = %s order by created_at",
    "roadmap_steps": "select * from public.roadmap_steps where user_id = %s order by roadmap_id, position",
    "step_progress": "select * from public.step_progress where user_id = %s order by completed_at",
    "resume_analyses": "select * from public.resume_analyses where user_id = %s order by created_at",
    "coach_threads": "select * from public.coach_threads where user_id = %s order by created_at",
    "coach_messages": "select * from public.coach_messages where user_id = %s order by thread_id, created_at",
}


def _without_user(rows: list[dict]) -> list[dict]:
    return [{k: v for k, v in row.items() if k != "user_id"} for row in rows]


class PostgresAccountRepository:
    def export(self, user_id):
        with db.transaction(user_id) as conn:
            return {name: _without_user(conn.execute(sql, (user_id,)).fetchall())
                    for name, sql in EXPORT_QUERIES.items()}

    def delete(self, user_id):
        with db.transaction(user_id) as conn:
            row = conn.execute("select private.delete_current_user() as deleted").fetchone()
        return bool(row["deleted"])


class InMemoryAccountRepository:
    """Same contract, no database (tests)."""

    def __init__(self):
        self.data: dict[str, dict] = {}  # user_id -> {table: rows}
        self.deleted: list[str] = []
        self.fail_next = None

    def _maybe_fail(self):
        if self.fail_next is not None:
            error, self.fail_next = self.fail_next, None
            raise error

    def export(self, user_id):
        self._maybe_fail()
        tables = self.data.get(user_id, {})
        return {name: _without_user(list(tables.get(name, []))) for name in EXPORT_QUERIES}

    def delete(self, user_id):
        self._maybe_fail()
        if user_id in self.deleted:
            return False
        self.deleted.append(user_id)
        self.data.pop(user_id, None)
        return True
