"""Résumé analyses (ADR-020): the target read from the user's active roadmap
and the saved structured analysis.

Only FastAPI writes analyses (as pathwayai_api, select + insert); the
browser reads and deletes its own through RLS. Every method runs in
`db.transaction(user_id)`, so RLS limits it to that user's rows on top of
the explicit `user_id` filters. Nothing from the uploaded file is ever
passed here: only the validated analysis and its metadata.

`PostgresResumeAnalysisRepository` is the real one;
`InMemoryResumeAnalysisRepository` implements the same contract for tests.
"""

import uuid
from datetime import datetime, timezone
from typing import Protocol

from psycopg.types.json import Jsonb

import db
from repositories.roadmaps import _iso

ANALYSIS_COLUMNS = "id, roadmap_id, career, analysis, prompt_version, model, created_at"


class ResumeAnalysisRepository(Protocol):
    def active_target(self, user_id: str) -> dict | None:
        """{roadmap_id, career, skills, steps} from the user's active roadmap
        (skills from its career card, step titles in order), or None."""

    def create(self, user_id: str, *, roadmap_id: str | None, career: str, analysis: dict,
               prompt_version: str, model: str) -> dict:
        """Save one analysis (a single insert in one transaction)."""


def analysis_out(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "roadmap_id": str(row["roadmap_id"]) if row["roadmap_id"] else None,
        "career": row["career"],
        "analysis": row["analysis"],
        "prompt_version": row["prompt_version"],
        "model": row["model"],
        "created_at": _iso(row["created_at"]),
    }


def _skills(career_data) -> list[str]:
    skills = career_data.get("skills") if isinstance(career_data, dict) else None
    return [s for s in skills if isinstance(s, str)] if isinstance(skills, list) else []


class PostgresResumeAnalysisRepository:
    def active_target(self, user_id):
        with db.transaction(user_id) as conn:
            row = conn.execute(
                "select r.id, r.career, r.career_data, "
                "coalesce(array_agg(s.title order by s.position) filter (where s.id is not null), '{}') as steps "
                "from public.roadmaps r "
                "left join public.roadmap_steps s on s.roadmap_id = r.id and s.user_id = r.user_id "
                "where r.user_id = %s and r.status = 'active' "
                "group by r.id",
                (user_id,),
            ).fetchone()
        if row is None:
            return None
        return {
            "roadmap_id": str(row["id"]),
            "career": row["career"],
            "skills": _skills(row["career_data"]),
            "steps": list(row["steps"]),
        }

    def create(self, user_id, *, roadmap_id, career, analysis, prompt_version, model):
        with db.transaction(user_id) as conn:
            row = conn.execute(
                "insert into public.resume_analyses "
                "(user_id, roadmap_id, career, analysis, prompt_version, model) "
                f"values (%s, %s, %s, %s, %s, %s) returning {ANALYSIS_COLUMNS}",
                (user_id, roadmap_id, career, Jsonb(analysis), prompt_version, model),
            ).fetchone()
        return analysis_out(row)


class InMemoryResumeAnalysisRepository:
    """Same contract, no database (tests)."""

    def __init__(self):
        self.targets: dict[str, dict] = {}  # user_id -> active target
        self.analyses: dict[str, dict] = {}
        self.fail_next = None  # an exception to raise on the next write
        self.fail_lookup = None  # an exception to raise on the next lookup

    def active_target(self, user_id):
        if self.fail_lookup is not None:
            error, self.fail_lookup = self.fail_lookup, None
            raise error
        target = self.targets.get(user_id)
        return dict(target) if target else None

    def create(self, user_id, *, roadmap_id, career, analysis, prompt_version, model):
        if self.fail_next is not None:
            error, self.fail_next = self.fail_next, None
            raise error  # nothing stored: like a rolled-back transaction
        row = {
            "id": str(uuid.uuid4()), "user_id": user_id, "roadmap_id": roadmap_id, "career": career,
            "analysis": analysis, "prompt_version": prompt_version, "model": model,
            "created_at": datetime.now(timezone.utc),
        }
        self.analyses[row["id"]] = row
        return analysis_out(row)
