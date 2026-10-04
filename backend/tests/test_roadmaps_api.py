"""POST /api/roadmaps and /api/roadmaps/{id}/regenerate (ADR-019). No network:
fake Gemini, the in-memory repository, and a stubbed signed-in user."""

import logging
import uuid

import psycopg
import pytest
from fastapi.testclient import TestClient

import config
import db
import main
import rate_limit
from auth import AuthUser, current_user
from conftest import ANSWERS, ANSWERS_V2, SECRET, roadmap_reply
from repositories.roadmaps import InMemoryRoadmapRepository
from routers import roadmaps as roadmaps_router

USER = AuthUser(id="00000000-0000-4000-8000-00000000000a", email="a@example.com")
OTHER = "00000000-0000-4000-8000-00000000000b"

CAREER_DATA = {
    "title": "Data Engineer", "reason": "Fits.", "match_score": 88, "salary_range": "$90k",
    "growth_rate": "+10%", "education": "Bachelor's", "skills": ["SQL", "Python"],
}


@pytest.fixture
def repo():
    return InMemoryRoadmapRepository()


@pytest.fixture
def client(monkeypatch, repo):
    monkeypatch.setattr(rate_limit, "limiter", rate_limit.RateLimiter(1000, 1000, 1000))
    main.app.dependency_overrides[current_user] = lambda: USER
    main.app.dependency_overrides[roadmaps_router.get_repository] = lambda: repo
    yield TestClient(main.app)
    main.app.dependency_overrides.clear()


def body(**overrides):
    return {"answers": ANSWERS_V2, "career": "Data Engineer", "career_data": CAREER_DATA, **overrides}


def test_create_saves_and_returns_roadmap_with_step_ids(client, repo, fake_gemini):
    models = fake_gemini(roadmap_reply())
    r = client.post("/api/roadmaps", json=body())
    assert r.status_code == 201
    data = r.json()
    assert data["career"] == "Data Engineer" and data["status"] == "active"
    assert data["career_data"]["match_score"] == 88 and data["can_regenerate"] is True
    step = data["roadmap"][0]
    assert step["id"] and step["position"] == 0 and step["title"] == "Linux basics"
    assert step["videos"] == [] and step["video_search_url"].startswith("https://www.youtube.com/")
    assert models.calls == 1
    saved = repo.roadmaps[data["id"]]
    assert saved["user_id"] == USER.id and saved["prompt_version"] == "v2"
    submission = repo.submissions[saved["quiz_submission_id"]]
    assert submission["answers_version"] == 2 and submission["answers"]["weekly_hours"] == 10


def test_v1_answers_are_saved_with_their_version(client, repo, fake_gemini):
    fake_gemini(roadmap_reply())
    data = client.post("/api/roadmaps", json=body(answers=ANSWERS)).json()
    saved = repo.roadmaps[data["id"]]
    assert saved["prompt_version"] == "v1"
    assert repo.submissions[saved["quiz_submission_id"]]["answers_version"] == 1


def test_create_archives_previous(client, repo, fake_gemini):
    fake_gemini(roadmap_reply(), roadmap_reply())
    first = client.post("/api/roadmaps", json=body()).json()
    second = client.post("/api/roadmaps", json=body(career="Web Developer")).json()
    assert repo.roadmaps[first["id"]]["status"] == "archived"
    assert repo.roadmaps[second["id"]]["status"] == "active"


def test_invalid_career_data_is_rejected_before_gemini(client, fake_gemini):
    models = fake_gemini()
    r = client.post("/api/roadmaps", json=body(career_data={"title": "", "match_score": "lots"}))
    assert r.status_code == 422 and models.calls == 0


def test_invalid_answers_are_rejected_before_gemini(client, fake_gemini):
    models = fake_gemini()
    r = client.post("/api/roadmaps", json=body(answers={**ANSWERS_V2, "weekly_hours": 7}))
    assert r.status_code == 422 and models.calls == 0


def test_save_failure_after_generation_is_an_honest_503(client, repo, fake_gemini, caplog):
    caplog.set_level(logging.INFO)
    models = fake_gemini(roadmap_reply())
    repo.fail_next = psycopg.OperationalError("connection lost")
    r = client.post("/api/roadmaps", json=body())
    assert r.status_code == 503 and "couldn't be saved" in r.json()["detail"]
    assert models.calls == 1 and not repo.roadmaps
    assert SECRET not in caplog.text and SECRET not in r.text


def test_database_down_is_503(client, repo, fake_gemini):
    fake_gemini(roadmap_reply())
    repo.fail_next = db.DatabaseUnavailable("down")
    assert client.post("/api/roadmaps", json=body()).status_code == 503


def test_ai_failure_saves_nothing(client, repo, fake_gemini):
    fake_gemini("bad", "bad")
    r = client.post("/api/roadmaps", json=body())
    assert r.status_code == 502 and not repo.roadmaps


# --- regenerate --------------------------------------------------------------

def test_regenerate_uses_saved_answers_and_archives(client, repo, fake_gemini):
    models = fake_gemini(roadmap_reply(), roadmap_reply(title="Docker"))
    first = client.post("/api/roadmaps", json=body()).json()
    r = client.post(f"/api/roadmaps/{first['id']}/regenerate")
    assert r.status_code == 201
    new = r.json()
    assert new["id"] != first["id"] and new["roadmap"][0]["title"] == "Docker"
    assert new["career"] == "Data Engineer" and new["career_data"]["match_score"] == 88
    assert repo.roadmaps[first["id"]]["status"] == "archived"
    assert repo.roadmaps[new["id"]]["quiz_submission_id"] == repo.roadmaps[first["id"]]["quiz_submission_id"]
    # The regenerate prompt was built from the stored answers.
    assert "Get my first tech job" in models.prompts[1]


def test_regenerate_someone_elses_roadmap_is_404(client, repo, fake_gemini):
    models = fake_gemini()
    theirs = repo.create(OTHER, answers=ANSWERS_V2, answers_version=2, career="X",
                         career_data=None, prompt_version="v2", steps=[{"title": "T"}])
    r = client.post(f"/api/roadmaps/{theirs['id']}/regenerate")
    assert r.status_code == 404 and models.calls == 0
    assert repo.roadmaps[theirs["id"]]["status"] == "active"


def test_regenerate_unknown_and_malformed_ids(client, fake_gemini):
    fake_gemini()
    assert client.post(f"/api/roadmaps/{uuid.uuid4()}/regenerate").status_code == 404
    assert client.post("/api/roadmaps/not-a-uuid/regenerate").status_code == 422


def test_regenerate_without_saved_answers_is_409(client, repo, fake_gemini):
    from datetime import datetime, timezone
    models = fake_gemini()
    imported, _ = repo.import_local(USER.id, local_id="l1", career="X", career_data=None,
                                    answers=None, answers_version=None,
                                    created_at=datetime.now(timezone.utc),
                                    steps=[{"title": "T"}], completed=[])
    r = client.post(f"/api/roadmaps/{imported['id']}/regenerate")
    assert r.status_code == 409 and models.calls == 0


# --- auth, configuration, limits --------------------------------------------------

def test_requires_sign_in(monkeypatch, fake_gemini):
    models = fake_gemini()
    monkeypatch.setattr(config, "SUPABASE_URL", "https://testproject.supabase.co")
    client = TestClient(main.app)
    assert client.post("/api/roadmaps", json=body()).status_code == 401
    assert client.post(f"/api/roadmaps/{uuid.uuid4()}/regenerate").status_code == 401
    assert models.calls == 0


def test_accounts_not_configured_is_503(monkeypatch, fake_gemini):
    fake_gemini()
    monkeypatch.setattr(config, "SUPABASE_URL", "")
    assert TestClient(main.app).post("/api/roadmaps", json=body()).status_code == 503


def test_database_not_configured_is_503_before_gemini(monkeypatch, fake_gemini):
    models = fake_gemini()
    monkeypatch.setattr(config, "DATABASE_URL", "")
    main.app.dependency_overrides[current_user] = lambda: USER
    try:
        r = TestClient(main.app).post("/api/roadmaps", json=body())
    finally:
        main.app.dependency_overrides.clear()
    assert r.status_code == 503 and "isn't available" in r.json()["detail"]
    assert models.calls == 0


def test_rate_limited(client, monkeypatch, fake_gemini):
    monkeypatch.setattr(rate_limit, "limiter", rate_limit.RateLimiter(1, 100, 100))
    fake_gemini(roadmap_reply())
    codes = [client.post("/api/roadmaps", json=body()).status_code for _ in range(2)]
    assert codes == [201, 429]


def test_unauthenticated_requests_dont_spend_the_rate_limit(monkeypatch, fake_gemini):
    monkeypatch.setattr(config, "SUPABASE_URL", "https://testproject.supabase.co")
    monkeypatch.setattr(rate_limit, "limiter", rate_limit.RateLimiter(1, 100, 100))
    client = TestClient(main.app)
    for _ in range(3):
        assert client.post("/api/roadmaps", json=body()).status_code == 401
    fake_gemini()
    assert rate_limit.limiter.check("testclient") == (0, "")


def test_guest_roadmap_route_is_unchanged(client, repo, fake_gemini):
    fake_gemini(roadmap_reply())
    r = client.post("/api/ai/roadmap", json={"answers": ANSWERS, "career": "DevOps Engineer"})
    assert r.status_code == 200 and "id" not in r.json() and not repo.roadmaps
