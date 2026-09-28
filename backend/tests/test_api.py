import logging

import pytest
from fastapi.testclient import TestClient

import main
import rate_limit
from conftest import ANSWERS, SECRET, career_reply, roadmap_reply
from test_llm import per_day_quota, per_minute_quota

ORIGIN = {"Origin": "http://localhost:5173"}


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(rate_limit, "limiter", rate_limit.RateLimiter(1000, 1000, 1000))
    return TestClient(main.app)


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200 and r.json() == {"status": "ok"}
    assert r.headers["X-Request-ID"]


def test_roadmap_success_shape(client, fake_gemini):
    fake_gemini(roadmap_reply())
    r = client.post("/api/ai/roadmap", json={"answers": ANSWERS, "career": "DevOps Engineer"}, headers=ORIGIN)
    assert r.status_code == 200
    step = r.json()["roadmap"][0]
    assert set(step) >= {"title", "description", "time", "resources", "tasks", "video_query", "videos", "video_search_url"}
    assert step["videos"] == []  # no YouTube key in tests
    assert r.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_careers_success(client, fake_gemini):
    fake_gemini(career_reply())
    r = client.post("/api/ai/career", json={"answers": ANSWERS})
    assert r.status_code == 200
    assert r.json()["careers"][0]["title"] == "Cloud Engineer"


@pytest.mark.parametrize("script, status, text", [
    (("bad", "bad"), 502, "couldn't generate"),
    ((per_day_quota(),), 503, "usage limit"),
    ((per_minute_quota("40s"),), 503, "busy"),
])
def test_ai_failures_are_user_friendly(client, fake_gemini, caplog, script, status, text):
    caplog.set_level(logging.INFO)
    fake_gemini(*script)
    r = client.post("/api/ai/roadmap", json={"answers": ANSWERS, "career": "DevOps Engineer"}, headers=ORIGIN)
    assert r.status_code == status
    assert text in r.json()["detail"]
    assert r.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert SECRET not in r.text and SECRET not in caplog.text
    assert "bad" not in r.text  # raw model output is never returned


def test_busy_sets_retry_after(client, fake_gemini):
    fake_gemini(per_minute_quota("40s"))
    r = client.post("/api/ai/career", json={"answers": ANSWERS})
    assert r.headers["Retry-After"] == "41"


def test_invalid_answers_are_rejected_before_gemini(client, fake_gemini, caplog):
    caplog.set_level(logging.INFO)
    models = fake_gemini()
    r = client.post("/api/ai/career", json={"answers": {**ANSWERS, "experience_level": 99}})
    assert r.status_code == 422
    assert models.calls == 0
    assert "answers.v1.experience_level" in caplog.text and SECRET not in caplog.text


def test_rate_limit(client, fake_gemini, monkeypatch):
    monkeypatch.setattr(rate_limit, "limiter", rate_limit.RateLimiter(2, 100, 100))
    fake_gemini(career_reply(), career_reply())
    codes = [client.post("/api/ai/career", json={"answers": ANSWERS}).status_code for _ in range(3)]
    assert codes == [200, 200, 429]


def test_disallowed_origin_gets_no_cors_header(client, fake_gemini):
    fake_gemini(career_reply())
    r = client.post("/api/ai/career", json={"answers": ANSWERS}, headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in r.headers
