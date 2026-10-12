"""Shared helpers for strictly validated AI replies (résumé reviews,
ADR-020; coach replies, ADR-021) and the personal-data guard.

A strict reply is used exactly as returned or rejected as a whole: no JSON
repair, no defaults, unexpected fields forbidden, nothing truncated. Every
error is an AIOutputError with a kind and a content-free detail (field
paths and error types; an unexpected key the model invented shows as "?").
"""

import json
import re
import unicodedata
from typing import Annotated

from pydantic import AfterValidator, StringConstraints, ValidationError

from ai_output import AIOutputError

_EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
_PHONE = re.compile(r"(?<!\w)(?:\+\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]\d{4}(?!\w)")


def contains_contact_details(text: str) -> bool:
    """An email address or a phone number (dates, versions and ranges like
    "2019-2023" or "1000-2000" don't match)."""
    return bool(_EMAIL.search(text) or _PHONE.search(text))


def no_control_chars(value: str) -> str:
    if any(unicodedata.category(ch) == "Cc" and ch != "\n" for ch in value):
        raise ValueError("control characters")
    return value


def text(max_length: int):
    """A required, trimmed, non-empty string of at most `max_length`
    characters without control characters (newlines allowed)."""
    return Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=1, max_length=max_length),
        AfterValidator(no_control_chars),
    ]


def error_summary(error: ValidationError, known_fields: set[str]) -> str:
    """Field paths, error types and safe size bounds, never model values."""
    def path(loc):
        return ".".join(str(p) if isinstance(p, int) or p in known_fields else "?" for p in loc) or "(root)"

    parts = []
    for item in error.errors(include_input=True, include_url=False, include_context=True):
        detail = f"{path(item['loc'])}:{item['type']}"
        context = item.get("ctx") or {}
        actual = context.get("actual_length")
        raw_input = item.get("input")
        if actual is None and isinstance(raw_input, (str, list, tuple, dict)):
            actual = len(raw_input)
        maximum = context.get("max_length")
        minimum = context.get("min_length")
        if item["type"] in {"too_long", "string_too_long"} and isinstance(actual, int) and isinstance(maximum, int):
            detail += f"(max={maximum},actual={actual})"
        elif item["type"] == "too_short" and isinstance(actual, int) and isinstance(minimum, int):
            detail += f"(min={minimum},actual={actual})"
        parts.append(detail)
    return ",".join(parts[:5])


def _reject_duplicate_keys(pairs):
    keys = [k for k, _ in pairs]
    if len(keys) != len(set(keys)):
        raise AIOutputError("invalid_json", "duplicate keys")
    return dict(pairs)


def load_strict_json(reply: str, max_chars: int) -> dict:
    """The reply as a JSON object, exactly as sent. Raises AIOutputError."""
    if not isinstance(reply, str) or not reply.strip():
        raise AIOutputError("empty")
    if len(reply) > max_chars:
        raise AIOutputError("too_large", f"{len(reply)} chars")
    try:
        data = json.loads(reply, object_pairs_hook=_reject_duplicate_keys)
    except json.JSONDecodeError as e:
        raise AIOutputError("invalid_json", f"{e.msg} at char {e.pos} of {len(reply)}") from None
    if not isinstance(data, dict):
        raise AIOutputError("not_object", type(data).__name__)
    return data
