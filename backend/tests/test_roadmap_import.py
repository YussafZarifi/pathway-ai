"""POST /api/roadmaps/import (ADR-019): a browser-saved roadmap is imported
once per (user, local_id). No network: in-memory repository, stubbed user."""

import json
import time
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

import config
import db
import main
import rate_limit
from auth import AuthUser, current_user
from conftest import ANSWERS, ANSWERS_V2
from repositories.roadmaps import InMemoryRoadmapRepository
from routers import roadmaps as roadmaps_router

USER = AuthUser(id="00000000-0000-4000-8000-00000000000a", email="a@example.com")
NOW_MS = int(time.time() * 1000)
DAY_MS = 24 * 60 * 60 * 1000


def local_step(n, **overrides):
    step = {
        "step": n + 1,  # extra keys from the browser are ignored
        "title": f"Step {n + 1}",
        "description": "Do the thing.",
        "time": "2 weeks",
        "resources": [{"name": "Docs", "url": "https://example.com/docs"}],
        "tasks": ["Task A", "Task B"],
        "video_query": "thing tutorial",
        "videos": [{"id": "abc123", "title": "Video", "channel": "Ch",
                    "thumbnail": "https://i.ytimg.com/vi/abc123/mqdefault.jpg",
                    "url": "https://www.youtube.com/watch?v=abc123"}],
        "video_search_url": "https://www.youtube.com/results?search_query=thing",
    }
    step.update(overrides)
    return step


def payload(**overrides):
    body = {
        "local_id": "mg8x2k1abcdef",
        "career": "Web Developer",
        "career_data": {"title": "Web Developer", "match_score": 84, "skills": ["HTML"]},
        "answers": ANSWERS_V2,
        "generated_at": NOW_MS - 2 * DAY_MS,
        "steps": [local_step(i) for i in range(3)],
        "completed": [{"position": 0, "completed_at": NOW_MS - DAY_MS}],
    }
    body.update(overrides)
    return body


@pytest.fixture
def repo():
    return InMemoryRoadmapRepository()


@pytest.fixture
def client(monkeypatch, repo):
    monkeypatch.setattr(rate_limit, "import_limiter", rate_limit.RateLimiter(1000, 1000, 1000))
    main.app.dependency_overrides[current_user] = lambda: USER
    main.app.dependency_overrides[roadmaps_router.get_repository] = lambda: repo
    yield TestClient(main.app)
    main.app.dependency_overrides.clear()


def test_import_creates_then_is_idempotent(client, repo):
    first = client.post("/api/roadmaps/import", json=payload())
    assert first.status_code == 201
    data = first.json()
    assert data["source"] == "imported" and data["status"] == "active" and data["can_regenerate"]
    assert [s["title"] for s in data["roadmap"]] == ["Step 1", "Step 2", "Step 3"]
    assert data["roadmap"][0]["videos"][0]["id"] == "abc123"

    again = client.post("/api/roadmaps/import", json=payload())
    assert again.status_code == 200 and again.json()["id"] == data["id"]
    assert len(repo.roadmaps) == 1


def test_completions_are_saved_with_their_time(client, repo):
    data = client.post("/api/roadmaps/import", json=payload()).json()
    done = repo.progress[data["roadmap"][0]["id"]]
    assert abs(done.timestamp() * 1000 - (NOW_MS - DAY_MS)) < 1000
    assert len(repo.progress) == 1


def test_completions_for_missing_steps_are_ignored(client, repo):
    client.post("/api/roadmaps/import", json=payload(completed=[
        {"position": 1, "completed_at": NOW_MS}, {"position": 8, "completed_at": NOW_MS},
    ]))
    assert len(repo.progress) == 1


def test_dates_are_clamped(client, repo):
    data = client.post("/api/roadmaps/import", json=payload(
        generated_at=NOW_MS + 30 * DAY_MS,
        completed=[{"position": 0, "completed_at": 0}],
    )).json()
    now = datetime.now(timezone.utc)
    assert repo.roadmaps[data["id"]]["created_at"] <= now
    done = repo.progress[data["roadmap"][0]["id"]]
    assert now - timedelta(days=366) < done < now - timedelta(days=364)


def test_older_import_does_not_replace_a_newer_current_roadmap(client, repo):
    current = repo.create(USER.id, answers=ANSWERS_V2, answers_version=2, career="Data",
                          career_data=None, prompt_version="v2", steps=[{"title": "T"}])
    data = client.post("/api/roadmaps/import", json=payload()).json()  # generated 2 days ago
    assert data["status"] == "archived"
    assert repo.roadmaps[current["id"]]["status"] == "active"


def test_v1_answers_are_kept(client, repo):
    data = client.post("/api/roadmaps/import", json=payload(answers=ANSWERS)).json()
    source = repo.get_source(USER.id, data["id"])
    assert source["answers_version"] == 1 and data["can_regenerate"]


@pytest.mark.parametrize("answers", [None, {"weekly_hours": "lots"}, {}])
def test_missing_or_invalid_answers_still_import_but_cannot_regenerate(client, answers):
    r = client.post("/api/roadmaps/import", json=payload(answers=answers))
    assert r.status_code == 201 and r.json()["can_regenerate"] is False


def test_invalid_career_data_is_dropped(client):
    r = client.post("/api/roadmaps/import", json=payload(career_data={"title": ""}))
    assert r.status_code == 201 and r.json()["career_data"] is None


def test_long_text_is_truncated_like_ai_output(client):
    data = client.post("/api/roadmaps/import", json=payload(steps=[local_step(0, title="x" * 250)])).json()
    assert data["roadmap"][0]["title"] == "x" * 200


def test_unsafe_links_are_dropped(client):
    step = local_step(0, resources=[{"name": "x", "url": "javascript:alert(1)"}],
                      videos=[{"id": "v", "url": "javascript:alert(1)"}],
                      video_search_url="data:text/html,hi")
    data = client.post("/api/roadmaps/import", json=payload(steps=[step], completed=[])).json()
    s = data["roadmap"][0]
    assert s["resources"] == [] and s["videos"] == [] and s["video_search_url"] is None


@pytest.mark.parametrize("override", [
    {"steps": []},
    {"steps": [local_step(i) for i in range(6)]},
    {"steps": [local_step(0, title="")]},
    {"steps": [local_step(0, title=None)]},
    {"local_id": "has spaces"},
    {"local_id": ""},
    {"career": ""},
    {"completed": [{"position": 10, "completed_at": NOW_MS}]},
    {"completed": [{"position": 0, "completed_at": NOW_MS}] * 11},
])
def test_invalid_payloads_are_422(client, repo, override):
    assert client.post("/api/roadmaps/import", json=payload(**override)).status_code == 422
    assert not repo.roadmaps


def test_body_limit_is_64kb_for_import_only(client):
    # ~30 KB: over the default 16 KB limit, under the import's 64 KB.
    big_step = local_step(0, description="d" * 900, tasks=["t" * 290] * 8,
                          resources=[{"name": "n" * 190, "url": "https://example.com/" + "p" * 400}] * 8)
    body = payload(steps=[big_step] * 5, completed=[])
    size = len(json.dumps(body))
    assert 16 * 1024 < size < 64 * 1024
    assert client.post("/api/roadmaps/import", json=body).status_code == 201
    # The same size on another route is still refused.
    assert client.post("/api/roadmaps", json={**body, "answers": ANSWERS_V2}).status_code == 413

    huge = payload(steps=[big_step] * 5, career_data={"title": "x", "match_score": 1, "reason": "r" * 40000})
    assert client.post("/api/roadmaps/import", json=huge).status_code == 413


def test_database_failure_is_503_and_keeps_nothing(client, repo):
    repo.fail_next = db.DatabaseUnavailable("down")
    r = client.post("/api/roadmaps/import", json=payload())
    assert r.status_code == 503 and "unchanged" in r.json()["detail"]
    assert not repo.roadmaps


def test_requires_sign_in(monkeypatch):
    monkeypatch.setattr(config, "SUPABASE_URL", "https://testproject.supabase.co")
    assert TestClient(main.app).post("/api/roadmaps/import", json=payload()).status_code == 401


def test_database_not_configured_is_503(monkeypatch):
    monkeypatch.setattr(config, "DATABASE_URL", "")
    main.app.dependency_overrides[current_user] = lambda: USER
    try:
        r = TestClient(main.app).post("/api/roadmaps/import", json=payload())
    finally:
        main.app.dependency_overrides.clear()
    assert r.status_code == 503


def test_import_has_its_own_rate_limit(client, monkeypatch, fake_gemini):
    monkeypatch.setattr(rate_limit, "import_limiter", rate_limit.RateLimiter(2, 100, 100))
    codes = [client.post("/api/roadmaps/import", json=payload(local_id=f"id{i}")).status_code
             for i in range(3)]
    assert codes == [201, 201, 429]
    # The AI limit is untouched by imports.
    assert rate_limit.limiter.check("someone-else") == (0, "")
