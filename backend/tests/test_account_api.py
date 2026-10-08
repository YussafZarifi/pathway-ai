"""GET /api/me/export and DELETE /api/me (ADR-022). No network: the
in-memory repository and a stubbed user; token parsing has its own tests."""

import logging
import time

import psycopg
import pytest
from fastapi.testclient import TestClient

import config
import db
import main
import rate_limit
from auth import AuthUser, current_user, password_time
from conftest import SECRET
from repositories.account import InMemoryAccountRepository
from routers import account as account_router

USER_ID = "00000000-0000-4000-8000-00000000000a"


def user(password_age=60):
    at = None if password_age is None else int(time.time()) - password_age
    return AuthUser(id=USER_ID, email="a@example.com", password_at=at)


@pytest.fixture
def repo():
    r = InMemoryAccountRepository()
    r.data[USER_ID] = {
        "quiz_submissions": [{"id": "q1", "user_id": USER_ID, "answers": {"goal": SECRET}, "answers_version": 2}],
        "roadmaps": [{"id": "r1", "user_id": USER_ID, "career": "Data Analyst"}],
        "coach_messages": [{"id": "m1", "user_id": USER_ID, "role": "user", "content": "hi"}],
    }
    return r


@pytest.fixture
def box():
    return {"user": user()}


@pytest.fixture
def client(monkeypatch, repo, box):
    monkeypatch.setattr(rate_limit, "account_limiter", rate_limit.RateLimiter(
        1000, 1000, 1000, short_scope="hour", short_period=rate_limit.HOUR))
    monkeypatch.setattr(rate_limit, "deletion_limiter", rate_limit.RateLimiter(
        1000, 1000, 1000, short_scope="hour", short_period=rate_limit.HOUR))
    main.app.dependency_overrides[current_user] = lambda: box["user"]
    main.app.dependency_overrides[account_router.get_repository] = lambda: repo
    yield TestClient(main.app)
    main.app.dependency_overrides.clear()


# --- amr parsing -------------------------------------------------------------------

def test_password_time_reads_the_latest_password_sign_in():
    claims = {"amr": [{"method": "password", "timestamp": 100}, {"method": "otp", "timestamp": 500},
                      {"method": "password", "timestamp": 300}]}
    assert password_time(claims) == 300


@pytest.mark.parametrize("claims", [{}, {"amr": None}, {"amr": "password"}, {"amr": [{"method": "recovery", "timestamp": 1}]},
                                    {"amr": [{"method": "password", "timestamp": "1"}]}, {"amr": [{"method": "password", "timestamp": True}]}])
def test_password_time_is_none_without_a_password_sign_in(claims):
    assert password_time(claims) is None


# --- Export ----------------------------------------------------------------------

def test_export_returns_every_table_without_internal_user_ids(client):
    r = client.get("/api/me/export")
    assert r.status_code == 200
    assert r.headers["content-disposition"] == 'attachment; filename="pathwayai-export.json"'
    assert r.headers["cache-control"] == "no-store"
    data = r.json()
    assert data["format"] == "pathwayai-export-1"
    assert data["account"] == {"id": USER_ID, "email": "a@example.com"}
    assert set(data) >= {"quiz_submissions", "roadmaps", "roadmap_steps", "step_progress", "resume_analyses",
                         "coach_threads", "coach_messages"}
    assert data["quiz_submissions"][0]["answers"] == {"goal": SECRET}  # server-only answers included
    assert all("user_id" not in row for name in ("quiz_submissions", "roadmaps", "coach_messages") for row in data[name])


def test_export_logs_nothing_from_the_data(client, caplog):
    caplog.set_level(logging.DEBUG)
    client.get("/api/me/export")
    assert "Export served" in caplog.text
    assert SECRET not in caplog.text and USER_ID not in caplog.text


def test_export_needs_a_token(client, monkeypatch):
    del main.app.dependency_overrides[current_user]
    monkeypatch.setattr(config, "SUPABASE_URL", "https://example.supabase.co")
    assert client.get("/api/me/export").status_code == 401


def test_export_without_a_database_is_503(client, monkeypatch):
    del main.app.dependency_overrides[account_router.get_repository]
    monkeypatch.setattr(config, "DATABASE_URL", "")
    assert client.get("/api/me/export").json()["detail"] == account_router.NOT_CONFIGURED


def test_export_database_failure_is_503(client, repo, caplog):
    repo.fail_next = psycopg.OperationalError(SECRET)
    r = client.get("/api/me/export")
    assert (r.status_code, r.json()["detail"]) == (503, account_router.DB_UNAVAILABLE)
    assert SECRET not in caplog.text


def test_export_is_rate_limited_per_user(client, monkeypatch):
    monkeypatch.setattr(rate_limit, "account_limiter", rate_limit.RateLimiter(
        2, 100, 100, short_scope="hour", short_period=rate_limit.HOUR))
    assert client.get("/api/me/export").status_code == 200
    assert client.get("/api/me/export").status_code == 200
    r = client.get("/api/me/export")
    assert r.status_code == 429 and "Retry-After" in r.headers


# --- Delete ----------------------------------------------------------------------------

def test_delete_with_a_recent_password_and_confirmation(client, repo):
    r = client.request("DELETE", "/api/me", json={"confirm": "DELETE"})
    assert r.status_code == 204 and r.content == b""
    assert repo.deleted == [USER_ID] and USER_ID not in repo.data


def test_delete_twice_is_still_204(client, repo):
    client.request("DELETE", "/api/me", json={"confirm": "DELETE"})
    assert client.request("DELETE", "/api/me", json={"confirm": "DELETE"}).status_code == 204


@pytest.mark.parametrize("age", [None, 301, 3600, -120])
def test_delete_needs_a_recent_password_sign_in(client, repo, box, age):
    box["user"] = user(password_age=age)
    r = client.request("DELETE", "/api/me", json={"confirm": "DELETE"})
    assert (r.status_code, r.json()["detail"]) == (403, account_router.CONFIRM_PASSWORD)
    assert repo.deleted == []


@pytest.mark.parametrize("body", [None, {}, {"confirm": "delete"}, {"confirm": "yes"}, {"confirm": "DELETE", "extra": 1}])
def test_delete_needs_the_exact_confirmation(client, repo, body):
    r = client.request("DELETE", "/api/me", json=body) if body is not None else client.request("DELETE", "/api/me")
    assert r.status_code == 422
    assert repo.deleted == []


def test_delete_needs_a_token(client, repo, monkeypatch):
    del main.app.dependency_overrides[current_user]
    monkeypatch.setattr(config, "SUPABASE_URL", "https://example.supabase.co")
    assert client.request("DELETE", "/api/me", json={"confirm": "DELETE"}).status_code == 401
    assert repo.deleted == []


def test_delete_failure_is_503_and_logs_no_ids(client, repo, caplog):
    repo.fail_next = db.DatabaseUnavailable("down")
    r = client.request("DELETE", "/api/me", json={"confirm": "DELETE"})
    assert r.status_code == 503
    assert USER_ID not in caplog.text and "a@example.com" not in caplog.text


def test_cors_allows_delete_from_the_frontend(client):
    if "http://localhost:5173" not in config.ALLOWED_ORIGINS:
        pytest.skip("local ALLOWED_ORIGINS doesn't include the Vite origin")
    r = client.options("/api/me", headers={
        "Origin": "http://localhost:5173",
        "Access-Control-Request-Method": "DELETE",
        "Access-Control-Request-Headers": "authorization,content-type",
    })
    assert r.status_code == 200 and "DELETE" in r.headers["access-control-allow-methods"]


def test_exports_never_use_up_the_deletion_budget(client, repo, monkeypatch):
    # Regression (browser QA 2026-10-07): exporting before deleting hit the
    # shared limit and the deletion was refused with 429.
    monkeypatch.setattr(rate_limit, "account_limiter", rate_limit.RateLimiter(
        2, 100, 100, short_scope="hour", short_period=rate_limit.HOUR))
    for _ in range(3):
        client.get("/api/me/export")
    assert client.get("/api/me/export").status_code == 429
    assert client.request("DELETE", "/api/me", json={"confirm": "DELETE"}).status_code == 204
