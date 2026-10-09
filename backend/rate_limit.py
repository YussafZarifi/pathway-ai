"""In-memory rate limiting for the AI endpoints.

Every AI request spends Gemini quota (and a roadmap also spends YouTube
quota), so the endpoints are limited per client IP (per minute and per
day) and globally per day. The global cap bounds the worst case even if
many IPs are used.

State lives in this process: it resets on restart and is not shared
between instances. That fits one Render instance; move it to Redis (Render
Key Value) before running more than one. Memory is bounded: only allowed
requests are stored, and the global daily cap limits how many there are.
"""

import ipaddress
import logging
import math
import threading
import time
from collections import deque

from fastapi import HTTPException, Request

import config

MINUTE = 60
HOUR = 60 * 60
DAY = 24 * 60 * 60

MESSAGES = {
    "minute": "Too many requests. Please wait a minute and try again.",
    "day": "You've reached today's limit for AI requests. Please try again tomorrow.",
    "global": "PathwayAI has reached its daily limit for AI requests. Please try again tomorrow.",
}

logger = logging.getLogger("pathwayai.rate_limit")


class SlidingWindow:
    """Allows at most `limit` hits per key within `period` seconds."""

    def __init__(self, limit: int, period: int):
        self.limit = limit
        self.period = period
        self._hits: dict[str, deque] = {}

    def retry_after(self, key: str, now: float) -> int:
        """Seconds until `key` may hit again; 0 if it may hit now."""
        hits = self._hits.get(key)
        if hits is None:
            return 0
        while hits and hits[0] <= now - self.period:
            hits.popleft()
        if not hits:
            del self._hits[key]
            return 0
        if len(hits) < self.limit:
            return 0
        return max(1, math.ceil(hits[0] + self.period - now))

    def hit(self, key: str, now: float) -> None:
        self._hits.setdefault(key, deque()).append(now)


class RateLimiter:
    """Per-key limits (a short window and a day) plus a global daily cap.
    The key is a client IP, or a user id for per-user limits. The short
    window is a minute unless `short_scope` names another ("hour")."""

    def __init__(self, per_minute: int, per_day: int, global_per_day: int, *,
                 short_scope: str = "minute", short_period: int = MINUTE):
        self._short_scope = short_scope
        self._per_ip = {
            short_scope: SlidingWindow(per_minute, short_period),
            "day": SlidingWindow(per_day, DAY),
        }
        self._global = SlidingWindow(global_per_day, DAY)
        self._lock = threading.Lock()

    def check(self, ip: str) -> tuple[int, str]:
        """Record a hit if allowed.

        Returns (0, "") when allowed, else (seconds to wait, the limit hit:
        "global", "day" or the short scope, e.g. "minute").
        """
        now = time.monotonic()
        with self._lock:
            wait = self._global.retry_after("all", now)
            if wait:
                return wait, "global"
            # Day first: when both are full, "try tomorrow" is the true answer.
            for scope in ("day", self._short_scope):
                wait = self._per_ip[scope].retry_after(ip, now)
                if wait:
                    return wait, scope
            self._global.hit("all", now)
            for window in self._per_ip.values():
                window.hit(ip, now)
            return 0, ""


limiter = RateLimiter(
    config.RATE_LIMIT_PER_MINUTE,
    config.RATE_LIMIT_PER_DAY,
    config.GLOBAL_AI_LIMIT_PER_DAY,
)

# Importing a browser-saved roadmap (ADR-019) spends no AI quota, only a
# small database write; it gets its own, looser limits.
import_limiter = RateLimiter(10, 100, 5000)

IMPORT_MESSAGES = {
    "minute": "Too many requests. Please wait a minute and try again.",
    "day": "You've reached today's limit for saving roadmaps. Please try again tomorrow.",
    "global": "PathwayAI is busy right now. Please try again later.",
}


# Résumé analyses (ADR-020): limited per signed-in user, not per IP.
resume_limiter = RateLimiter(
    config.RESUME_LIMIT_PER_HOUR,
    config.RESUME_LIMIT_PER_DAY,
    config.RESUME_GLOBAL_LIMIT_PER_DAY,
    short_scope="hour",
    short_period=HOUR,
)

RESUME_MESSAGES = {
    "hour": "You've analyzed several résumés in the last hour. Please try again later.",
    "day": "You've reached today's limit for résumé analyses. Please try again tomorrow.",
    "global": "PathwayAI has reached its daily limit for résumé analyses. Please try again tomorrow.",
}


# AI Coach messages (ADR-021): per signed-in user, like résumé analyses.
coach_limiter = RateLimiter(
    config.COACH_LIMIT_PER_HOUR,
    config.COACH_LIMIT_PER_DAY,
    config.COACH_GLOBAL_LIMIT_PER_DAY,
    short_scope="hour",
    short_period=HOUR,
)

COACH_MESSAGES = {
    "hour": "You've sent a lot of messages in the last hour. Please take a break and try again later.",
    "day": "You've reached today's limit for coach messages. Please try again tomorrow.",
    "global": "The AI Coach has reached its daily limit. Please try again tomorrow.",
}


# Account data export (ADR-022): an export reads all of a user's rows, so
# it is limited per user. Deletion has its own limiter: exporting your data
# right before deleting the account must never use up the deletion's budget
# (found in browser QA); deletion also needs a recent password.
account_limiter = RateLimiter(5, 20, 500, short_scope="hour", short_period=HOUR)
deletion_limiter = RateLimiter(10, 30, 1000, short_scope="hour", short_period=HOUR)

ACCOUNT_MESSAGES = {
    "hour": "Too many requests for your account data. Please try again later.",
    "day": "Too many requests for your account data today. Please try again tomorrow.",
    "global": "PathwayAI is busy right now. Please try again later.",
}


def _enforce(active: RateLimiter, request: Request, messages: dict, label: str) -> None:
    """Raise 429 when the caller is over a limit.

    Use the socket peer by default. Forwarded headers are interpreted only
    when an explicit proxy mode is configured and, for CIDR mode, that peer
    belongs to a trusted proxy network.
    """
    ip = client_ip(request)
    _raise_if_limited(active.check(ip), messages, label)


def _parse_ip(value: str) -> ipaddress.IPv4Address | ipaddress.IPv6Address | None:
    value = value.strip()
    if not value or "%" in value:
        return None
    try:
        address = ipaddress.ip_address(value)
    except ValueError:
        return None
    if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped:
        return address.ipv4_mapped
    return address


def _header_values(request: Request, name: str) -> list[str]:
    key = name.lower().encode("ascii")
    return [value.decode("latin-1") for header, value in request.scope.get("headers", []) if header.lower() == key]


def _is_trusted_proxy(address: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    for network in config.TRUSTED_PROXY_CIDRS:
        if address.version == network.version and address in network:
            return True
        if isinstance(address, ipaddress.IPv4Address) and isinstance(network, ipaddress.IPv6Network):
            mapped = network.network_address.ipv4_mapped
            if mapped and network.prefixlen >= 96:
                mapped_network = ipaddress.IPv4Network((mapped, network.prefixlen - 96), strict=False)
                if address in mapped_network:
                    return True
    return False


def client_ip(request: Request) -> str:
    """Resolve the rate-limit key without trusting caller-controlled headers.

    ``none`` uses the direct socket peer. ``render`` trusts only Render's
    Cloudflare-overwritten CF-Connecting-IP header. ``cidrs`` walks a single
    X-Forwarded-For chain from the socket outward, skipping only explicitly
    trusted proxy addresses. Invalid or duplicate header values fall back to
    the socket peer, which is conservative against spoofing.
    """
    peer = _parse_ip(request.client.host) if request.client else None
    if peer is None:
        return "unknown"

    mode = config.TRUSTED_PROXY_MODE
    if mode == "none":
        return str(peer)

    if mode == "render":
        if not config.RENDER_SERVICE_ID:
            return str(peer)
        values = _header_values(request, "cf-connecting-ip")
        if len(values) != 1:
            return str(peer)
        forwarded = _parse_ip(values[0])
        return str(forwarded) if forwarded is not None else str(peer)

    if mode != "cidrs" or not _is_trusted_proxy(peer):
        return str(peer)

    values = _header_values(request, "x-forwarded-for")
    if len(values) != 1:
        return str(peer)
    if len(values[0]) > 4096:
        return str(peer)
    forwarded_chain = values[0].split(",")
    if not forwarded_chain or len(forwarded_chain) > 32:
        return str(peer)
    addresses = [_parse_ip(value) for value in forwarded_chain]
    if not addresses or any(address is None for address in addresses):
        return str(peer)

    # Proxies append to X-Forwarded-For. Starting at our trusted peer and
    # walking right-to-left, the first address outside trusted proxy networks
    # is the client (or the closest untrusted hop).
    for address in reversed(addresses):
        if not _is_trusted_proxy(address):
            return str(address)
    return str(peer)


def _raise_if_limited(result: tuple[int, str], messages: dict, label: str) -> None:
    wait, scope = result
    if not wait:
        return

    logger.warning("Rate limit (%s, %s) reached", label, scope)
    raise HTTPException(status_code=429, detail=messages[scope], headers={"Retry-After": str(wait)})


def limit_ai_requests(request: Request) -> None:
    """FastAPI dependency for routes that spend Gemini/YouTube quota."""
    _enforce(limiter, request, MESSAGES, "ai")


def limit_import_requests(request: Request) -> None:
    """FastAPI dependency for POST /api/roadmaps/import."""
    _enforce(import_limiter, request, IMPORT_MESSAGES, "import")


def limit_resume_requests(user_id: str) -> None:
    """Per-user limit for POST /api/resume-analyses (called with the verified
    user's id; the id itself is never logged)."""
    _raise_if_limited(resume_limiter.check(f"user:{user_id}"), RESUME_MESSAGES, "resume")


def limit_coach_requests(user_id: str) -> None:
    """Per-user limit for POST /api/coach/messages."""
    _raise_if_limited(coach_limiter.check(f"user:{user_id}"), COACH_MESSAGES, "coach")


def limit_account_requests(user_id: str) -> None:
    """Per-user limit for GET /api/me/export."""
    _raise_if_limited(account_limiter.check(f"user:{user_id}"), ACCOUNT_MESSAGES, "account")


def limit_deletion_requests(user_id: str) -> None:
    """Per-user limit for DELETE /api/me (separate from the export limit)."""
    _raise_if_limited(deletion_limiter.check(f"user:{user_id}"), ACCOUNT_MESSAGES, "deletion")
