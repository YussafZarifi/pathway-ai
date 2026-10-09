"""Gemini calls: JSON mode with a response schema, validation, retries and
safe diagnostics.

Retry policy (at most 2 attempts, so a request stays well inside the
frontend's 90 s timeout):
- a reply that can't be parsed or fails validation: retry once;
- Gemini 5xx, timeouts, network errors: retry once after 1 s;
- Gemini 429 per-minute limit with a short retry delay: wait, retry once;
- Gemini 429 daily quota: no retry (it can't succeed until the reset);
- other 4xx (bad key, invalid request): no retry.

Logs record, per attempt: outcome, duration, finish reason, token counts,
reply length, how the JSON was found, dropped items (field paths and error
types) and a short hash of the reply for correlation. Never the reply
itself, the prompt, the user's answers or an attached file (a résumé PDF,
ADR-020): unexpected client errors are logged by type name only.
"""

import hashlib
import logging
import re
import time
from typing import Callable

import httpx
from google import genai
from google.genai import errors as genai_errors
from google.genai import types as genai_types

import config
from ai_output import AIOutputError

logger = logging.getLogger("pathwayai.llm")

MAX_ATTEMPTS = 2
MAX_RATE_LIMIT_WAIT_SECONDS = 10


class AIServiceError(Exception):
    """Generation failed. `kind` picks the status and message shown to users:
    "unavailable" (no key), "quota" (daily quota used up), "busy" (rate
    limited by Gemini) or "failed" (anything else)."""

    def __init__(self, kind: str, retry_after: int | None = None):
        super().__init__(kind)
        self.kind = kind
        self.retry_after = retry_after


client = (
    genai.Client(
        api_key=config.GEMINI_API_KEY,
        http_options=genai_types.HttpOptions(timeout=config.GEMINI_TIMEOUT_SECONDS * 1000),
    )
    if config.GEMINI_API_KEY
    else None
)


def _fingerprint(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:12]


def _quota_info(error: genai_errors.APIError) -> tuple[str, int | None]:
    """(quota id, retry delay in seconds) from a 429's details, if present."""
    details = error.details if isinstance(error.details, dict) else {}
    body = details.get("error", details) if isinstance(details, dict) else {}
    quota_id, delay = "", None
    for item in body.get("details", []) if isinstance(body, dict) else []:
        if not isinstance(item, dict):
            continue
        for violation in item.get("violations", []) or []:
            quota_id = quota_id or str(violation.get("quotaId", ""))
        match = re.fullmatch(r"(\d+(?:\.\d+)?)s", str(item.get("retryDelay", "")))
        if match:
            delay = int(float(match.group(1))) + 1
    return quota_id, delay


def _reply_meta(resp) -> dict:
    candidate = (resp.candidates or [None])[0]
    usage = resp.usage_metadata
    finish = getattr(candidate, "finish_reason", None)
    return {
        "finish": getattr(finish, "name", str(finish)),
        "in_tokens": getattr(usage, "prompt_token_count", None),
        "out_tokens": getattr(usage, "candidates_token_count", None),
    }


def generate(
    contents,
    label: str,
    schema,
    parse: Callable[[str], tuple[dict, dict]],
    *,
    system_instruction: str | None = None,
    temperature: float | None = None,
    max_output_tokens: int | None = None,
) -> dict:
    """Generate and validate one JSON reply. Raises AIServiceError.

    `contents` is a prompt string or a list of parts (e.g. a PDF part and a
    text prompt for the résumé analysis)."""
    if client is None:
        raise AIServiceError("unavailable")

    request_config = genai_types.GenerateContentConfig(
        response_mime_type="application/json",
        response_schema=schema,
        system_instruction=system_instruction,
        temperature=temperature,
        max_output_tokens=max_output_tokens,
        # No tools are ever passed, so automatic function calling only added
        # an "AFC is enabled" log line to every request (TD-58).
        automatic_function_calling=genai_types.AutomaticFunctionCallingConfig(disable=True),
    )

    for attempt in range(1, MAX_ATTEMPTS + 1):
        last = attempt == MAX_ATTEMPTS
        started = time.perf_counter()

        try:
            resp = client.models.generate_content(
                model=config.GEMINI_MODEL, contents=contents, config=request_config
            )
        except genai_errors.APIError as e:
            elapsed = time.perf_counter() - started
            if e.code == 429:
                quota_id, delay = _quota_info(e)
                logger.warning(
                    "%s attempt %d: Gemini 429 %s quota=%s retry_delay=%ss (%.1fs)",
                    label, attempt, e.status, quota_id or "?", delay, elapsed,
                )
                if "PerDay" in quota_id:
                    raise AIServiceError("quota") from None
                if not last and delay is not None and delay <= MAX_RATE_LIMIT_WAIT_SECONDS:
                    time.sleep(delay)
                    continue
                raise AIServiceError("busy", retry_after=delay or 60) from None
            logger.error("%s attempt %d: Gemini %s %s (%.1fs)", label, attempt, e.code, e.status, elapsed)
            if not last and isinstance(e.code, int) and e.code >= 500:
                time.sleep(1)
                continue
            raise AIServiceError("failed") from None
        except (httpx.HTTPError, TimeoutError, OSError) as e:
            logger.error("%s attempt %d: %s after %.1fs", label, attempt, type(e).__name__,
                         time.perf_counter() - started)
            if not last:
                time.sleep(1)
                continue
            raise AIServiceError("failed") from None
        except Exception as e:  # noqa: BLE001 - an SDK error's message could quote the request
            logger.error("%s attempt %d: unexpected %s after %.1fs", label, attempt, type(e).__name__,
                         time.perf_counter() - started)
            raise AIServiceError("failed") from None

        elapsed = time.perf_counter() - started
        text = resp.text or ""
        meta = _reply_meta(resp)
        try:
            result, diag = parse(text)
        except AIOutputError as e:
            logger.error(
                "%s attempt %d: unusable reply kind=%s detail=%s finish=%s out_tokens=%s "
                "chars=%d sha=%s (%.1fs)",
                label, attempt, e.kind, e.detail, meta["finish"], meta["out_tokens"],
                len(text), _fingerprint(text), elapsed,
            )
            if not last:
                continue
            raise AIServiceError("failed") from None

        if diag["dropped"]:
            logger.warning("%s attempt %d: dropped invalid items %s", label, attempt, diag["dropped"][:5])
        logger.info(
            "%s attempt %d: ok items=%d strategy=%s finish=%s tokens=%s/%s chars=%d (%.1fs)",
            label, attempt, diag["items"], diag["strategy"], meta["finish"],
            meta["in_tokens"], meta["out_tokens"], len(text), elapsed,
        )
        return result

    raise AIServiceError("failed")  # not reached: the loop returns or raises
