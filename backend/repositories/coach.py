"""AI Coach conversations (ADR-021).

`load` reads, in one transaction, everything a reply needs: the thread (only
the user's own; RLS and an explicit user_id filter), its last messages, the
active roadmap with each step's done state, the career card's skills and
the gap skills of the latest résumé review of that roadmap. `save_exchange`
writes the user's message and the coach's reply (and the thread, for a new
conversation) in one transaction, so a conversation never holds a question
without its answer. Only FastAPI writes here, as pathwayai_api.

`PostgresCoachRepository` is the real one; `InMemoryCoachRepository`
implements the same contract for tests.
"""

import uuid
from datetime import datetime, timezone
from typing import Protocol

from psycopg.types.json import Jsonb

import db
from repositories.roadmaps import _iso

MESSAGE_COLUMNS = "id, role, content, actions, created_at"


class ThreadNotFound(Exception):
    """The thread doesn't exist or belongs to someone else (same answer)."""


class ThreadFull(Exception):
    """The thread reached its message limit; start a new one."""


class CoachRepository(Protocol):
    def load(self, user_id: str, thread_id: str | None, *, history: int, max_messages: int) -> dict:
        """{"thread": {id, title}|None, "history": [{role, content}], "context":
        {roadmap_id, career, skills, steps: [{number, title, done}], resume_gaps}|None}.
        Raises ThreadNotFound or ThreadFull."""

    def save_exchange(self, user_id: str, *, thread_id: str | None, roadmap_id: str | None, title: str,
                      message: str, reply: str, actions: list[dict]) -> dict:
        """Save both messages (and a new thread when thread_id is None).
        Returns {"thread_id", "title", "messages": [user, assistant]}."""


def message_out(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "role": row["role"],
        "content": row["content"],
        "actions": row["actions"] or [],
        "created_at": _iso(row["created_at"]),
    }


def _skills(career_data) -> list[str]:
    skills = career_data.get("skills") if isinstance(career_data, dict) else None
    return [s for s in skills if isinstance(s, str)] if isinstance(skills, list) else []


def _gaps(analysis) -> list[str]:
    gaps = analysis.get("gaps") if isinstance(analysis, dict) else None
    return [g["skill"] for g in gaps if isinstance(g, dict) and isinstance(g.get("skill"), str)] \
        if isinstance(gaps, list) else []


class PostgresCoachRepository:
    def load(self, user_id, thread_id, *, history, max_messages):
        with db.transaction(user_id) as conn:
            thread = None
            messages = []
            if thread_id is not None:
                thread = conn.execute(
                    "select id, title from public.coach_threads where id = %s and user_id = %s",
                    (thread_id, user_id),
                ).fetchone()
                if thread is None:
                    raise ThreadNotFound()
                count = conn.execute(
                    "select count(*) as n from public.coach_messages where thread_id = %s and user_id = %s",
                    (thread_id, user_id),
                ).fetchone()["n"]
                if count + 2 > max_messages:
                    raise ThreadFull()
                messages = conn.execute(
                    "select role, content from ("
                    " select role, content, created_at from public.coach_messages"
                    " where thread_id = %s and user_id = %s order by created_at desc limit %s"
                    ") recent order by created_at",
                    (thread_id, user_id, history),
                ).fetchall()

            roadmap = conn.execute(
                "select id, career, career_data from public.roadmaps"
                " where user_id = %s and status = 'active'",
                (user_id,),
            ).fetchone()
            context = None
            if roadmap is not None:
                steps = conn.execute(
                    "select s.position, s.title, (p.step_id is not null) as done"
                    " from public.roadmap_steps s"
                    " left join public.step_progress p on p.step_id = s.id and p.user_id = s.user_id"
                    " where s.roadmap_id = %s and s.user_id = %s order by s.position",
                    (roadmap["id"], user_id),
                ).fetchall()
                review = conn.execute(
                    "select analysis from public.resume_analyses"
                    " where user_id = %s and roadmap_id = %s order by created_at desc limit 1",
                    (user_id, roadmap["id"]),
                ).fetchone()
                context = {
                    "roadmap_id": str(roadmap["id"]),
                    "career": roadmap["career"],
                    "skills": _skills(roadmap["career_data"]),
                    "steps": [{"number": i + 1, "title": s["title"], "done": s["done"]} for i, s in enumerate(steps)],
                    "resume_gaps": _gaps(review["analysis"]) if review else [],
                }
        return {
            "thread": {"id": str(thread["id"]), "title": thread["title"]} if thread else None,
            "history": [{"role": m["role"], "content": m["content"]} for m in messages],
            "context": context,
        }

    def save_exchange(self, user_id, *, thread_id, roadmap_id, title, message, reply, actions):
        with db.transaction(user_id) as conn:
            if thread_id is None:
                row = conn.execute(
                    "insert into public.coach_threads (user_id, roadmap_id, title)"
                    " values (%s, %s, %s) returning id, title",
                    (user_id, roadmap_id, title),
                ).fetchone()
                thread_id, title = str(row["id"]), row["title"]
            else:
                row = conn.execute(
                    "update public.coach_threads set updated_at = now()"
                    " where id = %s and user_id = %s returning id",
                    (thread_id, user_id),
                ).fetchone()
                if row is None:
                    raise ThreadNotFound()
            # clock_timestamp() so the reply always sorts after the question.
            question = conn.execute(
                "insert into public.coach_messages (thread_id, user_id, role, content, created_at)"
                f" values (%s, %s, 'user', %s, clock_timestamp()) returning {MESSAGE_COLUMNS}",
                (thread_id, user_id, message),
            ).fetchone()
            answer = conn.execute(
                "insert into public.coach_messages (thread_id, user_id, role, content, actions, created_at)"
                f" values (%s, %s, 'assistant', %s, %s, clock_timestamp()) returning {MESSAGE_COLUMNS}",
                (thread_id, user_id, reply, Jsonb(actions)),
            ).fetchone()
        return {"thread_id": str(thread_id), "title": title,
                "messages": [message_out(question), message_out(answer)]}


class InMemoryCoachRepository:
    """Same contract, no database (tests)."""

    def __init__(self):
        self.contexts: dict[str, dict] = {}  # user_id -> context
        self.threads: dict[str, dict] = {}
        self.messages: list[dict] = []
        self.fail_load = None
        self.fail_save = None

    def load(self, user_id, thread_id, *, history, max_messages):
        if self.fail_load is not None:
            error, self.fail_load = self.fail_load, None
            raise error
        thread = None
        messages = []
        if thread_id is not None:
            thread = self.threads.get(str(thread_id))
            if thread is None or thread["user_id"] != user_id:
                raise ThreadNotFound()
            own = [m for m in self.messages if m["thread_id"] == thread["id"]]
            if len(own) + 2 > max_messages:
                raise ThreadFull()
            messages = own[-history:]
        context = self.contexts.get(user_id)
        return {
            "thread": {"id": thread["id"], "title": thread["title"]} if thread else None,
            "history": [{"role": m["role"], "content": m["content"]} for m in messages],
            "context": dict(context) if context else None,
        }

    def save_exchange(self, user_id, *, thread_id, roadmap_id, title, message, reply, actions):
        if self.fail_save is not None:
            error, self.fail_save = self.fail_save, None
            raise error  # nothing stored: like a rolled-back transaction
        now = datetime.now(timezone.utc)
        if thread_id is None:
            thread_id = str(uuid.uuid4())
            self.threads[thread_id] = {"id": thread_id, "user_id": user_id, "roadmap_id": roadmap_id,
                                       "title": title, "updated_at": now}
        else:
            thread_id = str(thread_id)
            thread = self.threads.get(thread_id)
            if thread is None or thread["user_id"] != user_id:
                raise ThreadNotFound()
            thread["updated_at"] = now
            title = thread["title"]
        rows = []
        for role, content, acts in (("user", message, []), ("assistant", reply, actions)):
            row = {"id": str(uuid.uuid4()), "thread_id": thread_id, "user_id": user_id, "role": role,
                   "content": content, "actions": acts, "created_at": now}
            self.messages.append(row)
            rows.append(message_out(row))
        return {"thread_id": thread_id, "title": title, "messages": rows}
