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

NOT_CONFIGURED = "Accounts are not available on this server."
SIGN_IN = "Please sign in again."
UNAVAILABLE = "We couldn't check your sign-in right now. Please try again."


@dataclass(frozen=True)
class AuthUser:
    id: str
    email: str | None


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
            options={"require": ["exp", "iat", "sub", "aud", "iss"]},
        )
    except jwt.InvalidTokenError as e:
        logger.info("Rejected access token: %s", type(e).__name__)
        raise _unauthorized() from None

    if claims.get("role") != "authenticated" or claims.get("is_anonymous") is True:
        raise _unauthorized()

    return AuthUser(id=claims["sub"], email=claims.get("email") or None)


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
