"""Supabase access-token verification (ADR-018).

The browser signs in with Supabase Auth and sends its access token as
`Authorization: Bearer <jwt>`. The project signs tokens with an asymmetric
key (ES256), so the API verifies them locally against the project's public
JWKS: no shared secret and no call to Supabase per request. The AI routes do
not use this; guests keep working without an account.
"""

import logging
from dataclasses import dataclass

import jwt
from fastapi import Header, HTTPException

import config

logger = logging.getLogger("pathwayai.auth")

# Only asymmetric algorithms: an HS256 token could be forged by anyone who
# guessed or leaked a shared secret, and accepting "none" would skip checks.
ALGORITHMS = ["ES256", "RS256"]
AUDIENCE = "authenticated"

# Tolerated clock difference between Supabase (which issues tokens) and this
# server, applied by PyJWT to iat, nbf and exp. Without it a token used in the
# first moments after sign-in or refresh is rejected as "not yet valid" on a
# server whose clock runs slightly behind (measured: ~2 s on a dev PC). An
# expired token stays usable for at most this much longer (tokens last 1 h).
CLOCK_SKEW_SECONDS = 30

NOT_CONFIGURED = "Accounts are not available on this server."
SIGN_IN = "Please sign in again."
UNAVAILABLE = "We couldn't check your sign-in right now. Please try again."


@dataclass(frozen=True)
class AuthUser:
    id: str
    email: str | None
    # When the user last proved their password (Unix seconds), from the
    # token's `amr` claim; kept across token refreshes. None when the session
    # came from another method (e.g. a recovery link). Used for actions that
    # need a recent password confirmation (account deletion, ADR-022).
    password_at: int | None = None
    # The Supabase session the token belongs to (`session_id` claim); the
    # session_check module refuses tokens whose session has ended.
    session_id: str | None = None


def password_time(claims: dict) -> int | None:
    """The latest password sign-in time in the `amr` claim, if any."""
    times = [
        entry.get("timestamp")
        for entry in claims.get("amr") or []
        if isinstance(entry, dict) and entry.get("method") == "password"
    ]
    times = [t for t in times if isinstance(t, int) and not isinstance(t, bool)]
    return max(times) if times else None


def issuer() -> str:
    return f"{config.SUPABASE_URL}/auth/v1"


_jwks_client = None


def jwks_client():
    """The project's JWKS client, created on first use. Keys are cached for
    10 minutes (the same as Supabase's edge cache), so a rotated key is
    picked up without restarting the server."""
    global _jwks_client
    if _jwks_client is None:
        _jwks_client = jwt.PyJWKClient(
            f"{issuer()}/.well-known/jwks.json", cache_keys=True, lifespan=600, timeout=5
        )
    return _jwks_client


def verify_token(token: str) -> AuthUser:
    """Check signature, expiry, issuer and audience; return the user.

    Raises HTTPException 401 for any bad token and 503 when the keys can't
    be fetched. Never logs the token or its claims.
    """
    try:
        signing_key = jwks_client().get_signing_key_from_jwt(token)
    except jwt.PyJWKClientConnectionError:
        logger.warning("JWKS fetch failed")
        raise HTTPException(status_code=503, detail=UNAVAILABLE) from None
    except (jwt.PyJWKClientError, jwt.InvalidTokenError):
        # Unknown kid, malformed token or header.
        raise _unauthorized() from None

    try:
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=ALGORITHMS,
            audience=AUDIENCE,
            issuer=issuer(),
            leeway=CLOCK_SKEW_SECONDS,
            options={"require": ["exp", "iat", "sub", "aud", "iss"]},
        )
    except jwt.InvalidTokenError as e:
        logger.info("Rejected access token: %s", type(e).__name__)
        raise _unauthorized() from None

    if claims.get("role") != "authenticated" or claims.get("is_anonymous") is True:
        raise _unauthorized()

    session_id = claims.get("session_id")
    return AuthUser(
        id=claims["sub"],
        email=claims.get("email") or None,
        password_at=password_time(claims),
        session_id=session_id if isinstance(session_id, str) else None,
    )


def current_user(authorization: str | None = Header(default=None)) -> AuthUser:
    """FastAPI dependency for routes that need a signed-in user."""
    if not config.SUPABASE_URL:
        raise HTTPException(status_code=503, detail=NOT_CONFIGURED)

    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise _unauthorized()
    return verify_token(token.strip())


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=401, detail=SIGN_IN, headers={"WWW-Authenticate": "Bearer"}
    )
