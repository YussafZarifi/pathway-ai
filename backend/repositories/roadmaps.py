"""Saved roadmaps: quiz submissions, roadmaps, their steps and imported
progress (ADR-019).

Only FastAPI writes this AI-generated content; the browser reads it (and
writes step_progress) directly through RLS. Every method takes the verified
user's id and runs in `db.transaction(user_id)`, so RLS limits it to that
user's rows on top of the explicit `user_id` filters below.

Callers keep transactions short: Gemini/YouTube calls happen before any
method here is called. Writes for one user are serialized with a
transaction-scoped advisory lock, so concurrent saves (two tabs) never race
on the one-active-roadmap index or on an import's local_id.

`PostgresRoadmapRepository` is the real one; `InMemoryRoadmapRepository`
implements the same contract for tests (no network).
"""

import uuid
from datetime import datetime, timezone
from typing import Protocol

from psycopg.types.json import Jsonb

import db

ROADMAP_COLUMNS = "id, career, career_data, status, source, quiz_submission_id, created_at"
STEP_COLUMNS = (
    "id, position, title, description, time_estimate, tasks, resources, "
    "video_query, video_search_url, videos"
)


class RoadmapRepository(Protocol):
    def create(self, user_id: str, *, answers: dict, answers_version: int, career: str,
               career_data: dict | None, prompt_version: str, steps: list[dict]) -> dict:
        """Save a quiz submission and a new active roadmap with its steps;
        archive the previous active roadmap in the same transaction."""

    def get_source(self, user_id: str, roadmap_id: str) -> dict | None:
        """The user's roadmap with its stored answers (for regenerate), or None."""

    def add_regenerated(self, user_id: str, *, source: dict, prompt_version: str,
                        steps: list[dict]) -> dict:
        """Save a new active roadmap from `source`'s submission; archive the
        previous active one."""

    def import_local(self, user_id: str, *, local_id: str, career: str, career_data: dict | None,
                     answers: dict | None, answers_version: int | None, created_at: datetime,
                     steps: list[dict], completed: list[tuple[int, datetime]]) -> tuple[dict, bool]:
        """Import a browser-saved roadmap once per (user, local_id).

        Returns (roadmap, created). It becomes active only when it is newer
        than the account's active roadmap; otherwise it is stored archived."""


# --- Output shape ------------------------------------------------------------

def _iso(value) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def step_out(row: dict) -> dict:
    """A stored step in the API's roadmap-step shape (`time`, not `time_estimate`)."""
    return {
        "id": str(row["id"]),
        "position": row["position"],
        "title": row["title"],
        "description": row["description"],
        "time": row["time_estimate"],
        "resources": row["resources"] or [],
        "tasks": row["tasks"] or [],
        "video_query": row["video_query"],
        "videos": row["videos"] or [],
        "video_search_url": row["video_search_url"],
    }


def roadmap_out(row: dict, steps: list[dict]) -> dict:
    return {
        "id": str(row["id"]),
        "career": row["career"],
        "career_data": row["career_data"],
        "status": row["status"],
        "source": row["source"],
        "can_regenerate": row["quiz_submission_id"] is not None,
        "created_at": _iso(row["created_at"]),
        "roadmap": [step_out(s) for s in sorted(steps, key=lambda s: s["position"])],
    }


def _step_values(step: dict) -> dict:
    """An API/AI step dict → column values."""
    return {
        "title": step["title"],
        "description": step.get("description") or "",
        "time_estimate": step.get("time") or "",
        "tasks": step.get("tasks") or [],
        "resources": step.get("resources") or [],
        "video_query": step.get("video_query") or "",
        "video_search_url": step.get("video_search_url") or None,
        "videos": step.get("videos") or [],
    }


def _lock_user(conn, user_id) -> None:
    """Serialize this user's roadmap writes until the transaction ends.
    Transaction-scoped, so it works through the transaction pooler and is
    always released at commit or rollback."""
    conn.execute(
        "select pg_advisory_xact_lock(hashtextextended(%s, 0))", (f"pathwayai.roadmaps:{user_id}",)
    )


# --- Postgres ------------------------------------------------------------------

class PostgresRoadmapRepository:
    def create(self, user_id, *, answers, answers_version, career, career_data, prompt_version, steps):
        with db.transaction(user_id) as conn:
            _lock_user(conn, user_id)
            submission_id = self._insert_submission(conn, user_id, answers, answers_version)
            self._archive_active(conn, user_id)
            row = self._insert_roadmap(
                conn, user_id, submission_id=submission_id, career=career,
                career_data=career_data, prompt_version=prompt_version,
            )
            return roadmap_out(row, self._insert_steps(conn, user_id, row["id"], steps))

    def get_source(self, user_id, roadmap_id):
        with db.transaction(user_id) as conn:
            return conn.execute(
                "select r.id, r.career, r.career_data, r.quiz_submission_id, "
                "s.answers, s.answers_version "
                "from public.roadmaps r "
                "left join public.quiz_submissions s on s.id = r.quiz_submission_id "
                "where r.id = %s and r.user_id = %s",
                (roadmap_id, user_id),
            ).fetchone()

    def add_regenerated(self, user_id, *, source, prompt_version, steps):
        with db.transaction(user_id) as conn:
            _lock_user(conn, user_id)
            self._archive_active(conn, user_id)
            row = self._insert_roadmap(
                conn, user_id, submission_id=source["quiz_submission_id"],
                career=source["career"], career_data=source["career_data"],
                prompt_version=prompt_version,
            )
            return roadmap_out(row, self._insert_steps(conn, user_id, row["id"], steps))

    def import_local(self, user_id, *, local_id, career, career_data, answers, answers_version,
                     created_at, steps, completed):
        with db.transaction(user_id) as conn:
            # Under the lock, a concurrent import of the same roadmap (two
            # tabs, a retry) waits and then finds this one: no duplicate.
            _lock_user(conn, user_id)
            existing = conn.execute(
                "select id from public.roadmaps where user_id = %s and local_id = %s",
                (user_id, local_id),
            ).fetchone()
            if existing:
                return self._load(conn, user_id, existing["id"]), False

            submission_id = (
                self._insert_submission(conn, user_id, answers, answers_version) if answers else None
            )
            active = conn.execute(
                "select created_at from public.roadmaps where user_id = %s and status = 'active'",
                (user_id,),
            ).fetchone()
            make_active = active is None or created_at > active["created_at"]
            if make_active:
                self._archive_active(conn, user_id)
            row = self._insert_roadmap(
                conn, user_id, submission_id=submission_id, career=career,
                career_data=career_data, prompt_version=None, source="imported",
                status="active" if make_active else "archived",
                local_id=local_id, created_at=created_at,
            )
            step_rows = self._insert_steps(conn, user_id, row["id"], steps)
            by_position = {s["position"]: s["id"] for s in step_rows}
            for position, completed_at in completed:
                if position in by_position:
                    conn.execute(
                        "insert into public.step_progress (step_id, user_id, completed_at) "
                        "values (%s, %s, %s)",
                        (by_position[position], user_id, completed_at),
                    )
            return roadmap_out(row, step_rows), True

    # -- helpers ----------------------------------------------------------------

    @staticmethod
    def _insert_submission(conn, user_id, answers, answers_version):
        return conn.execute(
            "insert into public.quiz_submissions (user_id, answers, answers_version) "
            "values (%s, %s, %s) returning id",
            (user_id, Jsonb(answers), answers_version),
        ).fetchone()["id"]

    @staticmethod
    def _archive_active(conn, user_id):
        conn.execute(
            "update public.roadmaps set status = 'archived' "
            "where user_id = %s and status = 'active'",
            (user_id,),
        )

    @staticmethod
    def _insert_roadmap(conn, user_id, *, submission_id, career, career_data, prompt_version,
                        source="generated", status="active", local_id=None, created_at=None):
        return conn.execute(
            "insert into public.roadmaps "
            "(user_id, quiz_submission_id, career, career_data, prompt_version, source, status, "
            "local_id, created_at) "
            f"values (%s, %s, %s, %s, %s, %s, %s, %s, coalesce(%s, now())) returning {ROADMAP_COLUMNS}",
            (user_id, submission_id, career, Jsonb(career_data) if career_data is not None else None,
             prompt_version, source, status, local_id, created_at),
        ).fetchone()

    @staticmethod
    def _insert_steps(conn, user_id, roadmap_id, steps):
        rows = []
        for position, step in enumerate(steps):
            v = _step_values(step)
            rows.append(conn.execute(
                "insert into public.roadmap_steps "
                "(roadmap_id, user_id, position, title, description, time_estimate, tasks, "
                "resources, video_query, video_search_url, videos) "
                f"values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) returning {STEP_COLUMNS}",
                (roadmap_id, user_id, position, v["title"], v["description"], v["time_estimate"],
                 Jsonb(v["tasks"]), Jsonb(v["resources"]), v["video_query"],
                 v["video_search_url"], Jsonb(v["videos"])),
            ).fetchone())
        return rows

    @staticmethod
    def _load(conn, user_id, roadmap_id):
        row = conn.execute(
            f"select {ROADMAP_COLUMNS} from public.roadmaps where id = %s and user_id = %s",
            (roadmap_id, user_id),
        ).fetchone()
        steps = conn.execute(
            f"select {STEP_COLUMNS} from public.roadmap_steps "
            "where roadmap_id = %s and user_id = %s order by position",
            (roadmap_id, user_id),
        ).fetchall()
        return roadmap_out(row, steps)


# --- In memory (tests) -------------------------------------------------------------

class InMemoryRoadmapRepository:
    """Same contract as PostgresRoadmapRepository, without a database.

    Mirrors the constraints that matter to callers: one active roadmap per
    user, idempotent imports per (user, local_id), rows scoped by user."""

    def __init__(self):
        self.submissions: dict[str, dict] = {}
        self.roadmaps: dict[str, dict] = {}
        self.steps: dict[str, list[dict]] = {}
        self.progress: dict[str, datetime] = {}  # step_id -> completed_at
        self.fail_next = None  # an exception to raise on the next write

    def _maybe_fail(self):
        if self.fail_next is not None:
            error, self.fail_next = self.fail_next, None
            raise error

    def _now(self):
        return datetime.now(timezone.utc)

    def _archive_active(self, user_id):
        for r in self.roadmaps.values():
            if r["user_id"] == user_id and r["status"] == "active":
                r["status"] = "archived"

    def _add(self, user_id, *, submission_id, career, career_data, prompt_version, steps,
             source="generated", status="active", local_id=None, created_at=None):
        rid = str(uuid.uuid4())
        row = {
            "id": rid, "user_id": user_id, "career": career, "career_data": career_data,
            "status": status, "source": source, "quiz_submission_id": submission_id,
            "prompt_version": prompt_version, "local_id": local_id,
            "created_at": created_at or self._now(),
        }
        self.roadmaps[rid] = row
        self.steps[rid] = []
        for position, step in enumerate(steps):
            v = _step_values(step)
            self.steps[rid].append({"id": str(uuid.uuid4()), "position": position, **v})
        return row

    def _out(self, rid):
        return roadmap_out(self.roadmaps[rid], self.steps[rid])

    def create(self, user_id, *, answers, answers_version, career, career_data, prompt_version, steps):
        self._maybe_fail()
        sid = str(uuid.uuid4())
        self.submissions[sid] = {"user_id": user_id, "answers": answers,
                                 "answers_version": answers_version, "created_at": self._now()}
        self._archive_active(user_id)
        row = self._add(user_id, submission_id=sid, career=career, career_data=career_data,
                        prompt_version=prompt_version, steps=steps)
        return self._out(row["id"])

    def get_source(self, user_id, roadmap_id):
        r = self.roadmaps.get(str(roadmap_id))
        if not r or r["user_id"] != user_id:
            return None
        s = self.submissions.get(r["quiz_submission_id"]) if r["quiz_submission_id"] else None
        return {
            "id": r["id"], "career": r["career"], "career_data": r["career_data"],
            "quiz_submission_id": r["quiz_submission_id"],
            "answers": s["answers"] if s else None,
            "answers_version": s["answers_version"] if s else None,
        }

    def add_regenerated(self, user_id, *, source, prompt_version, steps):
        self._maybe_fail()
        self._archive_active(user_id)
        row = self._add(user_id, submission_id=source["quiz_submission_id"], career=source["career"],
                        career_data=source["career_data"], prompt_version=prompt_version, steps=steps)
        return self._out(row["id"])

    def import_local(self, user_id, *, local_id, career, career_data, answers, answers_version,
                     created_at, steps, completed):
        for r in self.roadmaps.values():
            if r["user_id"] == user_id and r["local_id"] == local_id:
                return self._out(r["id"]), False
        self._maybe_fail()
        sid = None
        if answers:
            sid = str(uuid.uuid4())
            self.submissions[sid] = {"user_id": user_id, "answers": answers,
                                     "answers_version": answers_version, "created_at": self._now()}
        active = [r for r in self.roadmaps.values() if r["user_id"] == user_id and r["status"] == "active"]
        make_active = not active or created_at > active[0]["created_at"]
        if make_active:
            self._archive_active(user_id)
        row = self._add(user_id, submission_id=sid, career=career, career_data=career_data,
                        prompt_version=None, steps=steps, source="imported",
                        status="active" if make_active else "archived",
                        local_id=local_id, created_at=created_at)
        by_position = {s["position"]: s["id"] for s in self.steps[row["id"]]}
        for position, completed_at in completed:
            if position in by_position:
                self.progress[by_position[position]] = completed_at
        return self._out(row["id"]), True
