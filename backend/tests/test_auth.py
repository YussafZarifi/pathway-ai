"""Supabase access-token verification (auth.py, GET /api/me). No network:
tokens are signed with a local EC key and the JWKS client is faked."""

import logging
import time
from types import SimpleNamespace

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient

import auth
import config
import main

PROJECT = "https://testproject.supabase.co"
KID = "test-key"
USER_ID = "5b0c7a4e-1111-4222-8333-944455556666"

PRIVATE_KEY = ec.generate_private_key(ec.SECP256R1())
OTHER_KEY = ec.generate_private_key(ec.SECP256R1())


def claims(**overrides):
    now = int(time.time())
    base = {
        "iss": f"{PROJECT}/auth/v1",
        "aud": "authenticated",
        "sub": USER_ID,
        "email": "learner@example.com",
        "role": "authenticated",
        "iat": now,
        "exp": now + 3600,
        "is_anonymous": False,
    }
    base.update(overrides)
    return {k: v for k, v in base.items() if v is not None}


def token(key=PRIVATE_KEY, algorithm="ES256", **overrides):
    return jwt.encode(claims(**overrides), key, algorithm=algorithm, headers={"kid": KID})


class FakeJWKS:
    """Returns the test public key for our kid, like PyJWKClient would."""

    def __init__(self, error=None):
        self.error = error

    def get_signing_key_from_jwt(self, raw):
        if self.error:
            raise self.error
        if jwt.get_unverified_header(raw).get("kid") != KID:
            raise jwt.PyJWKClientError("Unable to find a signing key")
        return SimpleNamespace(key=PRIVATE_KEY.public_key())


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(config, "SUPABASE_URL", PROJECT)
    monkeypatch.setattr(auth, "_jwks_client", FakeJWKS())
    return TestClient(main.app)


def bearer(raw):
    return {"Authorization": f"Bearer {raw}"}


def test_valid_token_returns_the_user(client):
    r = client.get("/api/me", headers=bearer(token()))
    assert r.status_code == 200
    assert r.json() == {"id": USER_ID, "email": "learner@example.com"}


@pytest.mark.parametrize("headers", [
    {},
    {"Authorization": ""},
    {"Authorization": "Bearer "},
    {"Authorization": "Basic abc"},
    {"Authorization": "Bearer not-a-jwt"},
])
def test_missing_or_malformed_header_is_401(client, headers):
    r = client.get("/api/me", headers=headers)
    assert r.status_code == 401
    assert r.headers["WWW-Authenticate"] == "Bearer"
    assert r.json() == {"detail": auth.SIGN_IN}


@pytest.mark.parametrize("raw", [
    pytest.param(token(exp=int(time.time()) - 10), id="expired"),
    pytest.param(token(aud="anon"), id="wrong-audience"),
    pytest.param(token(iss="https://other.supabase.co/auth/v1"), id="wrong-issuer"),
    pytest.param(token(key=OTHER_KEY), id="wrong-signature"),
    pytest.param(token(role="anon"), id="anon-role"),
    pytest.param(token(is_anonymous=True), id="anonymous-user"),
    pytest.param(token(sub=None), id="no-subject"),
    pytest.param(token(key="a-shared-secret-at-least-32-bytes-long", algorithm="HS256"), id="hs256-confusion"),
])
def test_bad_tokens_are_401(client, raw):
    r = client.get("/api/me", headers=bearer(raw))
    assert r.status_code == 401


def test_unknown_key_id_is_401(client):
    raw = jwt.encode(claims(), PRIVATE_KEY, algorithm="ES256", headers={"kid": "rotated-away"})
    assert client.get("/api/me", headers=bearer(raw)).status_code == 401


def test_jwks_unreachable_is_503(client, monkeypatch):
    monkeypatch.setattr(auth, "_jwks_client", FakeJWKS(jwt.PyJWKClientConnectionError("down")))
    r = client.get("/api/me", headers=bearer(token()))
    assert r.status_code == 503
    assert r.json() == {"detail": auth.UNAVAILABLE}


def test_accounts_off_without_supabase_url(client, monkeypatch):
    monkeypatch.setattr(config, "SUPABASE_URL", "")
    r = client.get("/api/me", headers=bearer(token()))
    assert r.status_code == 503
    assert r.json() == {"detail": auth.NOT_CONFIGURED}


def test_tokens_and_claims_are_never_logged(client, caplog):
    caplog.set_level(logging.DEBUG)
    good, bad = token(), token(exp=int(time.time()) - 10)
    client.get("/api/me", headers=bearer(good))
    client.get("/api/me", headers=bearer(bad))
    for secret in (good, bad, "learner@example.com", USER_ID):
        assert secret not in caplog.text


def test_cors_allows_the_authorization_header(client, monkeypatch):
    r = client.options(
        "/api/me",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization",
        },
    )
    if "http://localhost:5173" not in config.ALLOWED_ORIGINS:
        pytest.skip("local ALLOWED_ORIGINS doesn't include the Vite origin")
    assert r.status_code == 200
    assert "authorization" in r.headers["access-control-allow-headers"].lower()


def test_guests_can_still_use_the_ai_routes(client, fake_gemini, monkeypatch):
    import rate_limit
    from conftest import ANSWERS, career_reply

    monkeypatch.setattr(rate_limit, "limiter", rate_limit.RateLimiter(1000, 1000, 1000))
    fake_gemini(career_reply())
    r = client.post("/api/ai/career", json={"answers": ANSWERS})
    assert r.status_code == 200
