"""Body size limits hold for chunked bodies (no Content-Length), not just for
a declared Content-Length (audit finding 2026-10-04). No network."""

import json

import pytest
from fastapi.testclient import TestClient

import main
import rate_limit
from auth import AuthUser, current_user
from conftest import ANSWERS_V2, career_reply
from repositories.roadmaps import InMemoryRoadmapRepository
from routers import roadmaps as roadmaps_router

ORIGIN = {"Origin": "http://localhost:5173"}


def chunked(payload: dict, chunk: int = 4096):
    """The JSON body as a generator: httpx then sends it chunked, without
    a Content-Length header."""
    raw = json.dumps(payload).encode()

    def gen():
        for i in range(0, len(raw), chunk):
            yield raw[i:i + chunk]

    return gen(), len(raw)


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(rate_limit, "limiter", rate_limit.RateLimiter(1000, 1000, 1000))
    monkeypatch.setattr(rate_limit, "import_limiter", rate_limit.RateLimiter(1000, 1000, 1000))
    repo = InMemoryRoadmapRepository()
    main.app.dependency_overrides[current_user] = lambda: AuthUser(id="00000000-0000-4000-8000-00000000000a", email=None)
    main.app.dependency_overrides[roadmaps_router.get_repository] = lambda: repo
    yield TestClient(main.app)
    main.app.dependency_overrides.clear()


def test_small_chunked_body_still_works(client, fake_gemini):
    fake_gemini(career_reply())
    body, size = chunked({"answers": ANSWERS_V2})
    r = client.post("/api/ai/career", content=body, headers={"Content-Type": "application/json", **ORIGIN})
    assert size < main.MAX_BODY_BYTES
    assert r.status_code == 200


def test_large_chunked_body_is_413_and_never_reaches_gemini(client, fake_gemini):
    models = fake_gemini()
    body, size = chunked({"answers": ANSWERS_V2, "pad": "p" * 2_000_000})
    r = client.post("/api/ai/career", content=body, headers={"Content-Type": "application/json", **ORIGIN})
    assert size > 2_000_000
    assert r.status_code == 413
    assert r.json() == {"detail": "Request is too large."}
    assert models.calls == 0
    assert r.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_chunked_body_just_over_the_default_limit_is_413(client, fake_gemini):
    models = fake_gemini()
    pad = main.MAX_BODY_BYTES  # with the answers the body ends up just over the limit
    body, size = chunked({"answers": ANSWERS_V2, "pad": "p" * pad}, chunk=1024)
    r = client.post("/api/ai/career", content=body, headers={"Content-Type": "application/json"})
    assert size > main.MAX_BODY_BYTES
    assert r.status_code == 413 and models.calls == 0


def test_import_path_keeps_its_larger_limit_when_chunked(client):
    step = {"title": "Step", "description": "d" * 900, "tasks": ["t" * 290] * 8,
            "resources": [{"name": "n" * 190, "url": "https://example.com/" + "p" * 400}] * 8}
    payload = {"local_id": "chunked1", "career": "Web Developer", "steps": [step] * 5}
    body, size = chunked(payload)
    assert main.MAX_BODY_BYTES < size < main.MAX_BODY_BYTES_BY_PATH["/api/roadmaps/import"]
    r = client.post("/api/roadmaps/import", content=body, headers={"Content-Type": "application/json"})
    assert r.status_code == 201


def test_import_path_chunked_over_64kb_is_413(client):
    payload = {"local_id": "chunked2", "career": "Web Developer", "steps": [{"title": "t"}],
               "career_data": {"title": "x", "match_score": 1, "reason": "r" * 70_000}}
    body, size = chunked(payload)
    assert size > main.MAX_BODY_BYTES_BY_PATH["/api/roadmaps/import"]
    r = client.post("/api/roadmaps/import", content=body, headers={"Content-Type": "application/json"})
    assert r.status_code == 413


def test_declared_content_length_over_limit_is_413_without_reading(client, fake_gemini):
    models = fake_gemini()
    r = client.post("/api/ai/career", json={"answers": ANSWERS_V2, "pad": "p" * 20_000})
    assert r.status_code == 413 and models.calls == 0


def test_invalid_content_length_is_413(client):
    r = client.post("/api/ai/career", content=b"{}", headers={"Content-Type": "application/json", "Content-Length": "abc"})
    assert r.status_code == 413
