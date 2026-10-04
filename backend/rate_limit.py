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

import logging
import math
import threading
import time
from collections import deque

from fastapi import HTTPException, Request

import config

MINUTE = 60
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
    def __init__(self, per_minute: int, per_day: int, global_per_day: int):
        self._per_ip = {
            "minute": SlidingWindow(per_minute, MINUTE),
            "day": SlidingWindow(per_day, DAY),
        }
        self._global = SlidingWindow(global_per_day, DAY)
        self._lock = threading.Lock()

    def check(self, ip: str) -> tuple[int, str]:
        """Record a hit if allowed.

        Returns (0, "") when allowed, else (seconds to wait, the limit hit:
        "global", "minute" or "day").
        """
        now = time.monotonic()
        with self._lock:
            wait = self._global.retry_after("all", now)
            if wait:
                return wait, "global"
            # Day first: when both are full, "try tomorrow" is the true answer.
            for scope in ("day", "minute"):
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


def _enforce(active: RateLimiter, request: Request, messages: dict, label: str) -> None:
    """Raise 429 when the caller is over a limit.

    The client IP comes from request.client, which Uvicorn fills from
    X-Forwarded-For when started with --proxy-headers (see render.yaml).
    """
    ip = request.client.host if request.client else "unknown"
    wait, scope = active.check(ip)
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
