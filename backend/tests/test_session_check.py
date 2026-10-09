"""Tokens whose Supabase session has ended (sign out everywhere, deleted
account) are refused before any AI call, write or export (session_check.py,
ADR-022 amendment). No network, no database: the check itself is faked."""

import logging
import uuid

import pytest
from fastapi.testclient import TestClient

import auth
import config
import db
import main
import session_check
from auth import AuthUser, current_user
from tests.test_auth import FakeJWKS, PROJECT, bearer, token

USER = AuthUser(id="00000000-0000-4000-8000-00000000000a", email=None,
                session_id="11111111-2222-4333-8444-555555555555")
ANSWERS = {
    "interests": ["Building apps"], "problem_style": "Dig in until I find the root cause",
    "experience": "Built a few projects", "weekly_hours": 5, "goal": "Get my first tech job",
}
RID = str(uuid.uuid4())

# Every route that spends AI quota, writes data or returns account data.
GUARDED = [
    ("POST", "/api/roadmaps", {"json": {"answers": ANSWERS, "career": "Data Analyst"}}),
    ("POST", "/api/roadmaps/import", {"json": {"local_id": "x", "career": "x", "steps": [{"title": "s"}]}}),
    ("POST", f"/api/roadmaps/{RID}/regenerate", {}),
    ("POST", f"/api/roadmaps/{RID}/activate", {}),
    ("POST", "/api/resume-analyses", {"content": b"%PDF-1.7", "headers": {"Content-Type": "application/pdf"}}),
    ("POST", "/api/coach/messages", {"json": {"message": "hi"}}),
    ("GET", "/api/me/export", {}),
    ("DELETE", "/api/me", {"json": {"confirm": "DELETE"}}),
]


@pytest.fixture
def client(monkeypatch):
    main.app.dependency_overrides[current_user] = lambda: USER
    monkeypatch.setattr(db, "configured", lambda: True)
    yield TestClient(main.app)
    main.app.dependency_overrides.pop(current_user, None)


@pytest.mark.parametrize("method,path,kw", GUARDED)
def test_ended_session_is_401_before_any_work(client, monkeypatch, fake_gemini, method, path, kw):
    models = fake_gemini()
    seen = []
    monkeypatch.setattr(session_check, "session_active", lambda user: seen.append(user.id) or False)
    r = client.request(method, path, **kw)
    assert r.status_code == 401
    assert r.json() == {"detail": auth.SIGN_IN}
    assert seen == [USER.id]
    assert models.calls == 0


@pytest.mark.parametrize("method,path,kw", GUARDED)
def test_database_error_during_the_check_is_503(client, monkeypatch, method, path, kw):
    def broken(user):
        raise db.DatabaseUnavailable("down")

    monkeypatch.setattr(session_check, "session_active", broken)
    r = client.request(method, path, **kw)
    assert r.status_code == 503
    assert r.json() == {"detail": session_check.UNAVAILABLE}


def test_live_session_passes_through(client, monkeypatch):
    monkeypatch.setattr(session_check, "session_active", lambda user: True)
    # Past the session check, the next dependency runs (here: the export's
    # repository, which needs a real DATABASE_URL and answers 503).
    r = client.get("/api/me/export")
    assert r.status_code != 401


def test_check_is_skipped_without_a_database(monkeypatch):
    monkeypatch.setattr(db, "configured", lambda: False)
    monkeypatch.setattr(session_check, "session_active", lambda user: pytest.fail("no database, no check"))
    assert session_check.live_user(USER) is USER


@pytest.mark.parametrize("session_id", [None, "", "not-a-uuid", "1' or '1'='1"])
def test_missing_or_malformed_session_id_never_counts_as_active(monkeypatch, session_id):
    monkeypatch.setattr(db, "transaction", lambda user_id: pytest.fail("no query for a bad session id"))
    assert session_check.session_active(AuthUser(id=USER.id, email=None, session_id=session_id)) is False


def test_session_active_asks_the_database_with_the_users_claims(monkeypatch):
    calls = []

    class Conn:
        def execute(self, sql, params):
            calls.append((sql, params))
            return self

        def fetchone(self):
            return {"active": True}

    class Tx:
        def __init__(self, user_id):
            calls.append(("claims", user_id))

        def __enter__(self):
            return Conn()

        def __exit__(self, *exc):
            return False

    monkeypatch.setattr(db, "transaction", Tx)
    assert session_check.session_active(USER) is True
    assert calls[0] == ("claims", USER.id)
    assert "private.session_is_active" in calls[1][0]
    assert calls[1][1] == (USER.session_id,)


def test_read_only_routes_keep_working_without_the_check(client, monkeypatch):
    monkeypatch.setattr(session_check, "session_active", lambda user: pytest.fail("not checked here"))
    monkeypatch.setattr(db, "configured", lambda: False)
    assert client.get("/api/me").status_code == 200


def test_session_id_claim_reaches_the_user(monkeypatch, caplog):
    monkeypatch.setattr(config, "SUPABASE_URL", PROJECT)
    monkeypatch.setattr(auth, "_jwks_client", FakeJWKS())
    sid = str(uuid.uuid4())
    with caplog.at_level(logging.DEBUG):
        user = auth.verify_token(token(session_id=sid))
    assert user.session_id == sid
    assert sid not in caplog.text
    assert auth.verify_token(token()).session_id is None
    assert auth.verify_token(token(session_id=123)).session_id is None
