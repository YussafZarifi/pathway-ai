"""Résumé analysis (Milestone 3, ADR-020): PDF checks, the Gemini request and
strict validation of its reply.

Privacy: the caller holds the PDF in memory for one request only. This
module checks it, sends it to Gemini inline (application/pdf) and keeps no
copy. Neither the file, its text, its name nor a hash of it is logged,
returned or stored; only the validated analysis below is returned for
saving. Errors carry a kind and a content-free detail (field paths, error
types, sizes), never résumé or reply text.

Validation is strict, unlike careers and roadmaps (ADR-015): a reply is
used exactly as returned or rejected as a whole. No JSON repair, no
defaults, no unexpected fields, no truncation, no dropped items. A
rejected reply is retried once by llm.generate, then reported as failed.
"""

import json
from typing import Literal

from google.genai import types as genai_types
from pydantic import BaseModel, ConfigDict, Field, ValidationError

import config
import llm
from ai_output import AIOutputError
from prompts import RESUME_SYSTEM_INSTRUCTION, build_resume_prompt
from strict_ai import contains_contact_details, error_summary, load_strict_json
from strict_ai import text as _text

PROMPT_VERSION = "r1"

MIN_PDF_BYTES = 1024
MAX_PDF_BYTES = 2 * 1024 * 1024

MAX_REPLY_CHARS = 20_000
# resume_analyses.analysis is limited to 16,384 bytes in the database; keep a margin.
MAX_ANALYSIS_BYTES = 16_000
MAX_OUTPUT_TOKENS = 4096

Section = Literal["summary", "experience", "projects", "skills", "education", "formatting", "other"]


class ResumeInputError(Exception):
    """The upload can't be analyzed. `kind`: "too_small", "too_large",
    "not_pdf" (checked before Gemini) or "not_resume" (Gemini says the PDF
    isn't a readable résumé)."""

    def __init__(self, kind: str):
        super().__init__(kind)
        self.kind = kind


def check_pdf(data) -> None:
    """Cheap checks before anything is sent to Gemini. Raises ResumeInputError."""
    if not isinstance(data, (bytes, bytearray)):
        raise ResumeInputError("not_pdf")
    if len(data) > MAX_PDF_BYTES:
        raise ResumeInputError("too_large")
    if len(data) < MIN_PDF_BYTES:
        raise ResumeInputError("too_small")
    if not data.startswith(b"%PDF-") or b"%%EOF" not in data[-1024:]:
        raise ResumeInputError("not_pdf")


# --- Generation schema (sent to Gemini) --------------------------------------

class GapSchema(BaseModel):
    skill: str
    why: str
    how_to_close: str
    related_step: int | None


class SuggestionSchema(BaseModel):
    section: Section
    text: str


class ResumeAnalysisSchema(BaseModel):
    is_resume: bool
    summary: str
    matched_skills: list[str]
    missing_skills: list[str]
    strengths: list[str]
    gaps: list[GapSchema]
    suggestions: list[SuggestionSchema]


# --- Reply model (strict) -----------------------------------------------------

Skill = _text(60)
Sentence = _text(300)


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Gap(_Strict):
    skill: Skill
    why: Sentence
    how_to_close: Sentence
    related_step: int | None  # 1-based roadmap step number


class Suggestion(_Strict):
    section: Section
    text: Sentence


class ResumeReply(_Strict):
    is_resume: bool
    summary: _text(600)
    matched_skills: list[Skill] = Field(max_length=15)
    missing_skills: list[Skill] = Field(max_length=15)
    strengths: list[Sentence] = Field(max_length=5)
    gaps: list[Gap] = Field(max_length=5)
    suggestions: list[Suggestion] = Field(max_length=6)


# Field names that may appear in an error path; anything else (e.g. an
# unexpected key the model invented) is shown as "?".
_KNOWN_FIELDS = set(ResumeReply.model_fields) | set(Gap.model_fields) | set(Suggestion.model_fields)


def _texts(reply: ResumeReply):
    """(path, text) for every text field, for the personal-data check."""
    yield "summary", reply.summary
    for name in ("matched_skills", "missing_skills", "strengths"):
        for i, value in enumerate(getattr(reply, name)):
            yield f"{name}.{i}", value
    for i, gap in enumerate(reply.gaps):
        for name in ("skill", "why", "how_to_close"):
            yield f"gaps.{i}.{name}", getattr(gap, name)
    for i, suggestion in enumerate(reply.suggestions):
        yield f"suggestions.{i}.text", suggestion.text


def parse_resume_reply(text: str, step_count: int) -> tuple[dict, dict]:
    """Return (validated reply incl. is_resume, diagnostics). Raises AIOutputError.

    `step_count` is how many roadmap steps the prompt listed; a gap's
    related_step must be null or 1..step_count."""
    data = load_strict_json(text, MAX_REPLY_CHARS)
    try:
        reply = ResumeReply.model_validate(data)
    except ValidationError as e:
        raise AIOutputError("schema", error_summary(e, _KNOWN_FIELDS)) from None

    for i, gap in enumerate(reply.gaps):
        if gap.related_step is not None and not 1 <= gap.related_step <= step_count:
            raise AIOutputError("schema", f"gaps.{i}.related_step:out_of_range")

    for path, value in _texts(reply):
        if contains_contact_details(value):
            raise AIOutputError("personal_data", path)

    result = reply.model_dump()
    size = len(json.dumps(result, ensure_ascii=False).encode("utf-8"))
    if size > MAX_ANALYSIS_BYTES:
        raise AIOutputError("too_large", f"analysis {size} bytes")

    items = len(reply.gaps) + len(reply.suggestions) + len(reply.strengths)
    return result, {"strategy": "strict", "items": items, "dropped": []}


def analyze_resume(pdf: bytes, career: str, skills, steps) -> dict:
    """Analyze a résumé PDF against the user's roadmap target.

    Returns {"analysis", "career", "prompt_version", "model"}, ready to save
    (the analysis has exactly ADR-020's fields). Raises ResumeInputError for
    an unusable upload and llm.AIServiceError when generation fails."""
    check_pdf(pdf)
    prompt, step_count = build_resume_prompt(career, skills, steps)
    contents = [genai_types.Part.from_bytes(data=bytes(pdf), mime_type="application/pdf"), prompt]
    reply = llm.generate(
        contents,
        "resume",
        ResumeAnalysisSchema,
        lambda text: parse_resume_reply(text, step_count),
        system_instruction=RESUME_SYSTEM_INSTRUCTION,
        temperature=0,
        max_output_tokens=MAX_OUTPUT_TOKENS,
    )
    if not reply.pop("is_resume"):
        raise ResumeInputError("not_resume")
    return {
        "analysis": reply,
        "career": " ".join(str(career).split())[:100],
        "prompt_version": PROMPT_VERSION,
        "model": config.GEMINI_MODEL,
    }
