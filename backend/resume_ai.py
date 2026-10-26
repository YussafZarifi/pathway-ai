"""Evidence-backed résumé analysis (ADR-020, extended M3-X).

The uploaded PDF and extracted text exist only for this request. Gemini may
classify checklist evidence, but never supplies scores. Short positive
citations are checked against extracted PDF pages before deterministic
career-rubric scoring. Only the bounded structured report is saved.
"""

import hashlib
import io
import json
import logging
import os
import re
import threading
import unicodedata
from copy import deepcopy
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path
from typing import Literal
from uuid import uuid4

from google.genai import types as genai_types
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from pypdf import PdfReader, apply_configuration

import config
import llm
from ai_output import AIOutputError
from prompts import RESUME_SYSTEM_INSTRUCTION, build_resume_evidence_prompt
from resume_scoring import build_score_report, build_skill_roadmap, rubric_for
from strict_ai import contains_contact_details, error_summary, load_strict_json
from strict_ai import text as _text

PROMPT_VERSION = "r9"

MIN_PDF_BYTES = 1024
MAX_PDF_BYTES = 2 * 1024 * 1024
MAX_PDF_PAGES = 10
MIN_EXTRACTED_TEXT_CHARS = 0
MIN_SCORE_TEXT_CHARS = 300
MIN_SCORE_TEXT_WORDS = 50
_PROJECT_TECHNOLOGY_CATEGORY = re.compile(
    r"\b(?:spreadsheet(?:s)?|dashboard(?:s)?|database(?:s)?|reporting\s+(?:tool|platform|system|dashboard)|analytics\s+(?:tool|platform|system)|automation\s+(?:tool|script|workflow))\b",
    re.IGNORECASE,
)
MAX_EXTRACTED_TEXT_CHARS = 30_000
MAX_PAGE_CONTENT_BYTES = 600_000

MAX_REPLY_CHARS = 45_000
# resume_analyses.analysis is limited to 16,384 bytes in the database; keep a margin.
MAX_ANALYSIS_BYTES = 16_000
MAX_OUTPUT_TOKENS = 8192
MIN_QUOTE_CHARS = 3
MAX_QUOTE_CHARS = 320

logger = logging.getLogger("pathwayai.resume_ai")

_CONTACT_EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
_CONTACT_PHONE = re.compile(r"(?<!\w)(?:\+\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]\d{4}(?!\w)")
_STATIC_CRITERIA = {"contact_information", "text_parseability"}
_PROJECT_CHECK_IDS = {
    "project_purpose", "project_stack", "project_complexity", "project_architecture",
    "project_apis", "project_deployment", "project_testing", "project_impact", "project_career_fit",
}
_PROJECT_CHECK_ORDER = (
    "project_purpose", "project_stack", "project_complexity", "project_architecture",
    "project_apis", "project_deployment", "project_testing", "project_impact", "project_career_fit",
)
_EXPERIENCE_CHECK_IDS = {
    "experience_relevance", "experience_ownership", "experience_actions",
    "experience_results", "experience_transferable", "experience_career_fit",
}
_EXPERIENCE_CHECK_ORDER = (
    "experience_relevance", "experience_ownership", "experience_actions",
    "experience_results", "experience_transferable", "experience_career_fit",
)
_PROJECT_CHECK_WEIGHTS = {
    "project_purpose": 12, "project_stack": 15, "project_complexity": 14,
    "project_architecture": 12, "project_apis": 8, "project_deployment": 10,
    "project_testing": 10, "project_impact": 13, "project_career_fit": 6,
}
_EXPERIENCE_CHECK_WEIGHTS = {
    "experience_relevance": 20, "experience_ownership": 20, "experience_actions": 15,
    "experience_results": 25, "experience_transferable": 10, "experience_career_fit": 10,
}


class ResumeInputError(Exception):
    """The upload can't be analyzed; `kind` contains no user data."""

    def __init__(self, kind: str):
        super().__init__(kind)
        self.kind = kind


_DEBUG_CAPTURE_ROOT = Path(__file__).resolve().parent / ".resume-debug"
_DEBUG_CAPTURE_LOCK = threading.Lock()
_DEBUG_CAPTURE_PIDS: set[int] = set()


class _ResumeDebugCapture:
    """One-shot local forensic capture; contains highly sensitive user data."""

    def __init__(self, pdf: bytes, pages: list[str]):
        self.attempt = 0
        with _DEBUG_CAPTURE_LOCK:
            _DEBUG_CAPTURE_ROOT.mkdir(parents=True, exist_ok=True)
            # Keep the one-capture-per-process forensic guard in memory. PID
            # marker files can collide after Windows reuses a process ID.
            if os.getpid() in _DEBUG_CAPTURE_PIDS:
                raise ResumeInputError("debug_capture_already_used") from None
            _DEBUG_CAPTURE_PIDS.add(os.getpid())
            self.path = _DEBUG_CAPTURE_ROOT / (
                "capture-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid4().hex[:8]
            )
            self.path.mkdir()
        self._write_json("upload-metadata.json", {
            "pdf_bytes": len(pdf),
            "pdf_sha256": hashlib.sha256(bytes(pdf)).hexdigest(),
            "page_count": len(pages),
            "capture_utc": datetime.now(timezone.utc).isoformat(),
        })
        self._write_json("extracted-pages.json", [{"page": i, "text": page}
                                                   for i, page in enumerate(pages, start=1)])
        self._write_json("normalized-pages.json", [{"page": i, "text": _normalized(page)}
                                                    for i, page in enumerate(pages, start=1)])

    def _write_json(self, filename: str, value) -> None:
        (self.path / filename).write_text(
            json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    def save_response(self, text: str, attempt: int) -> None:
        self.attempt = attempt
        (self.path / f"gemini-raw-response-attempt-{attempt}.json").write_text(text, encoding="utf-8")

    def save_attempt(self, detail: dict) -> None:
        path = self.path / "attempt-metrics.json"
        existing = json.loads(path.read_text(encoding="utf-8")) if path.exists() else []
        existing.append(detail)
        self._write_json(path.name, existing)

    def save_request(self, detail: dict) -> None:
        self._write_json("request-metrics.json", detail)

    def save_normalized_response(self, value) -> None:
        self._write_json("gemini-normalized-response.json", value)

    def save_validation_steps(self, value) -> None:
        self._write_json("validation-steps.json", value)

    def save_comparison(self, detail: dict) -> None:
        filename = f"evidence-comparisons-attempt-{self.attempt or 1}.json"
        path = self.path / filename
        existing = json.loads(path.read_text(encoding="utf-8")) if path.exists() else []
        existing.append(detail)
        self._write_json(filename, existing)


def check_pdf(data) -> None:
    """Cheap size and signature checks before parsing or sending the PDF."""
    if not isinstance(data, (bytes, bytearray)):
        raise ResumeInputError("not_pdf")
    if len(data) > MAX_PDF_BYTES:
        raise ResumeInputError("too_large")
    if len(data) < MIN_PDF_BYTES:
        raise ResumeInputError("too_small")
    if not data.startswith(b"%PDF-") or b"%%EOF" not in data[-1024:]:
        raise ResumeInputError("not_pdf")


def extract_resume_pages(data: bytes) -> list[str]:
    """Extract bounded selectable text for citations; never persist the text.

    pypdf's decompression and page-tree limits constrain malformed PDFs. The
    per-page content cap and page/text caps bound work after those safeguards.
    """
    limits = {
        "maximum_declared_stream_length": MAX_PDF_BYTES,
        "array_based_stream_maximum_output_length": MAX_PAGE_CONTENT_BYTES,
        "jbig2_maximum_output_length": MAX_PAGE_CONTENT_BYTES,
        "lzw_maximum_output_length": MAX_PAGE_CONTENT_BYTES,
        "run_length_maximum_output_length": MAX_PAGE_CONTENT_BYTES,
        "zlib_maximum_output_length": MAX_PAGE_CONTENT_BYTES,
        "zlib_maximum_recovery_input_length": 1_000_000,
        "flate_maximum_columns": 50_000,
        "flate_maximum_row_length": MAX_PAGE_CONTENT_BYTES,
        "image_maximum_buffer_size": MAX_PAGE_CONTENT_BYTES,
        "xmp_maximum_input_length": 100_000,
        "xmp_maximum_element_count": 10_000,
        "outline_maximum_entries": 1_000,
        "page_tree_maximum_entries": MAX_PDF_PAGES + 1,
        "page_tree_maximum_depth": 20,
        "xform_maximum_invocations_per_extraction": 100,
    }
    try:
        with apply_configuration(**limits):
            reader = PdfReader(io.BytesIO(bytes(data)), strict=False, root_object_recovery_limit=10_000)
            if reader.is_encrypted or len(reader.pages) > MAX_PDF_PAGES:
                raise ResumeInputError("unreadable")
            pages = []
            total = 0
            for page in reader.pages:
                contents = page.get_contents()
                if contents is not None and len(contents.get_data()) > MAX_PAGE_CONTENT_BYTES:
                    raise ResumeInputError("unreadable")
                text = page.extract_text() or ""
                total += len(text)
                if total > MAX_EXTRACTED_TEXT_CHARS:
                    raise ResumeInputError("unreadable")
                pages.append(text)
    except ResumeInputError:
        raise
    except Exception:
        # Malformed parser errors can contain PDF objects or content. Expose
        # only the stable failure kind, never parser text or a stack to users.
        raise ResumeInputError("unreadable") from None

    if not pages:
        raise ResumeInputError("unreadable")
    return pages


# --- Structured output sent to Gemini ----------------------------------------
# Gemini 2.5 Flash-Lite's response_schema has a small serving-state budget.
# Send only the output shape here; the strict models below enforce every
# length, list, type, and extra-field constraint after generation.

class EvidenceSchema(BaseModel):
    source: Literal["resume_text"]
    page: int
    quote: str = Field(
        max_length=MAX_QUOTE_CHARS,
        description="A verbatim, contiguous, non-identifying excerpt from the stated page, 3 to 320 characters long."
    )


class EvaluationSchema(BaseModel):
    criterion_id: str = Field(description="One exact criterion ID from the checklist.")
    found: bool = Field(description="True only when the resume clearly supports this criterion; false otherwise.")
    evidence: list[EvidenceSchema] = Field(
        max_length=5,
        description=(
            "Exact source excerpts only when found is true. If found is false, this must be an empty array. "
            "Never return evidence for a false finding."
        ),
    )
    note: str = Field(description="A concise factual note of at most 180 characters.")


class RecommendationSchema(BaseModel):
    title: str = Field(description="A concise improvement title of at most 80 characters.")
    action: str = Field(description="An honest, concrete action of at most 180 characters.")
    criterion_ids: list[str] = Field(min_length=1, max_length=4)


class SkillRoadmapSchema(BaseModel):
    skill_id: str
    step_positions: list[int]


class ReviewCheckSchema(BaseModel):
    criterion_id: str
    found: bool
    evidence: list[EvidenceSchema] = Field(
        max_length=1,
        description="At most one exact source excerpt for this project or job check.",
    )
    note: str = Field(description="A concise, specific source-backed note of at most 160 characters.")


class BulletRewriteSchema(BaseModel):
    source: EvidenceSchema
    suggestion: str = Field(description="A truthful rewrite of at most 400 characters using only supported source facts; never invent metrics.")


class WorkSampleSchema(BaseModel):
    title: str = Field(description="A generic project name or role title, never an employer or person's name.")
    summary: str = Field(description="A concise factual description, at most 300 characters, supported by the cited source evidence.")
    technologies: list[str] = Field(max_length=6)
    checks: list[ReviewCheckSchema]
    bullet_rewrite: BulletRewriteSchema | None


class ResumeAnalysisSchema(BaseModel):
    is_resume: bool
    # Descriptions are supported by Gemini's minimal response schema; the
    # strict reply model below remains the enforcement boundary.
    summary: str = Field(description="A concise evidence-led overview without personal details, at most 350 characters.")
    evaluations: list[EvaluationSchema]
    recommendations: list[RecommendationSchema] = Field(
        description="Return no more than three highest-priority recommendations."
    )
    skill_roadmap: list[SkillRoadmapSchema]
    project_reviews: list[WorkSampleSchema]
    experience_reviews: list[WorkSampleSchema]


# --- Strict validated reply ---------------------------------------------------

_Strict = ConfigDict(extra="forbid", strict=True)
Quote = _text(MAX_QUOTE_CHARS)
Note = _text(180)


class _ReplyBase(BaseModel):
    model_config = _Strict


class Evidence(_ReplyBase):
    source: Literal["resume_text"]
    page: int = Field(ge=1)
    quote: Quote = Field(min_length=MIN_QUOTE_CHARS)


class Evaluation(_ReplyBase):
    criterion_id: _text(40)
    found: bool
    evidence: list[Evidence] = Field(max_length=5)
    note: Note


class Recommendation(_ReplyBase):
    title: _text(80)
    action: _text(180)
    criterion_ids: list[_text(40)] = Field(min_length=1, max_length=4)


class SkillRoadmap(_ReplyBase):
    skill_id: _text(20)
    step_positions: list[int] = Field(max_length=5)


class ReviewCheck(_ReplyBase):
    criterion_id: _text(40)
    found: bool
    evidence: list[Evidence] = Field(max_length=1)
    note: _text(160)


class BulletRewrite(_ReplyBase):
    source: Evidence
    suggestion: _text(400)


class WorkSampleReview(_ReplyBase):
    title: _text(60)
    summary: _text(300)
    technologies: list[_text(30)] = Field(max_length=6)
    checks: list[ReviewCheck] = Field(min_length=6, max_length=9)
    bullet_rewrite: BulletRewrite | None


class ResumeReply(_ReplyBase):
    is_resume: bool
    summary: _text(350)
    evaluations: list[Evaluation] = Field(max_length=40)
    recommendations: list[Recommendation] = Field(max_length=5)
    skill_roadmap: list[SkillRoadmap] = Field(max_length=8)
    project_reviews: list[WorkSampleReview] = Field(max_length=3)
    experience_reviews: list[WorkSampleReview] = Field(max_length=3)


_KNOWN_FIELDS = (
    set(ResumeReply.model_fields) | set(Evaluation.model_fields) | set(Evidence.model_fields)
    | set(Recommendation.model_fields) | set(SkillRoadmap.model_fields)
    | set(ReviewCheck.model_fields) | set(BulletRewrite.model_fields) | set(WorkSampleReview.model_fields)
)


_WORD = re.compile(r"[^\W_]+", re.UNICODE)
_LINE_WRAP_HYPHEN = re.compile(r"(?<=\w)[\-\u2010-\u2015]\s*\n\s*(?=\w)")


def _normalized_tokens(value: str) -> tuple[str, ...]:
    """Normalize display-only PDF differences without relaxing word evidence."""
    unwrapped = _LINE_WRAP_HYPHEN.sub("", value)
    decomposed = unicodedata.normalize("NFKD", unwrapped).casefold()
    plain = "".join(char for char in decomposed if not unicodedata.combining(char))
    return tuple(_WORD.findall(plain))


def _normalized(value: str) -> str:
    """A punctuation-insensitive form used only for citation verification."""
    return " ".join(_normalized_tokens(value))


def _quote_matches_source(quote: str, page: str) -> bool:
    """Require an ordered, contiguous sequence of source words.

    This accepts harmless rendering differences and a quote that ends early,
    but rejects paraphrases and hallucinated words. It intentionally avoids
    fuzzy/token-overlap matching: a few shared keywords are not enough proof
    that Gemini cited the uploaded rÃ©sumÃ©.
    """
    quote_tokens = _normalized_tokens(quote)
    page_tokens = _normalized_tokens(page)
    if not quote_tokens or not page_tokens:
        return False
    return " ".join(quote_tokens) in " ".join(page_tokens)


def _citation_mismatch_diagnostic(quote: str, page: str, page_number: int) -> dict:
    """Content-free observability for a failed citation check.

    RÃ©sumÃ© text is sensitive and must never be written to production logs.
    Hashes, lengths and token counts expose formatting-related mismatches
    without retaining a user quote or extracted page text.
    """
    quote_normalized = _normalized(quote)
    page_normalized = _normalized(page)
    quote_tokens = _normalized_tokens(quote)
    page_tokens = _normalized_tokens(page)
    mismatch = _first_sequence_mismatch(list(quote_tokens), list(page_tokens))
    longest = SequenceMatcher(None, quote_tokens, page_tokens, autojunk=False).find_longest_match(
        0, len(quote_tokens), 0, len(page_tokens)
    )
    return {
        "page": page_number,
        "quote_chars": len(quote),
        "page_chars": len(page),
        "quote_tokens": len(quote_tokens),
        "page_tokens": len(page_tokens),
        "quote_normalized_sha256": hashlib.sha256(quote_normalized.encode()).hexdigest()[:12],
        "page_normalized_sha256": hashlib.sha256(page_normalized.encode()).hexdigest()[:12],
        "contiguous_word_match": _quote_matches_source(quote, page),
        "first_mismatch": (
            {
                "quote_token_index": mismatch["quote_token_index"],
                "source_window_start_token": mismatch["source_window_start_token"],
                "matched_prefix_tokens": mismatch["matched_prefix_tokens"],
            }
            if mismatch else None
        ),
        "first_mismatch_normalized_quote_char": (
            len(" ".join(quote_tokens[:mismatch["quote_token_index"]]))
            + (1 if mismatch and mismatch["quote_token_index"] else 0)
            if mismatch and mismatch.get("quote_token_index") is not None else None
        ),
        "longest_matching_subsequence": {
            "quote_start_token": longest.a,
            "source_start_token": longest.b,
            "token_count": longest.size,
        },
        "why_contiguous_matching_failed": (
            "The normalized quote is not a contiguous source span. The shared run ends before the quote ends, so accepting it would allow a paraphrase, reordered text, or omitted source words."
            if longest.size and longest.size < len(quote_tokens)
            else "No normalized source span matched the citation."
        ),
    }


def _static_evaluations(pages: list[str]) -> dict:
    extracted_chars = sum(len(page.strip()) for page in pages)
    matches = []
    for number, page in enumerate(pages, start=1):
        if _CONTACT_EMAIL.search(page) or _CONTACT_PHONE.search(page):
            matches.append(number)
    return {
        "contact_information": {
            "found": bool(matches),
            "evidence": ([{"source": "document_check", "page": matches[0], "quote": None}]
                         if matches else []),
            "note": ("Contact information detected; the value is hidden." if matches
                     else "No email address or phone number detected in the extracted text."),
        },
        "text_parseability": {
            "found": extracted_chars > 0,
            "evidence": ([{"source": "document_check", "page": None, "quote": None}]
                         if extracted_chars else []),
            "note": (f"Selectable text extracted from {len(pages)} PDF page(s)." if extracted_chars
                     else "No selectable résumé text could be extracted from this PDF."),
        },
    }


def _backfill_project_technology(evaluations: dict) -> None:
    """Credit an explicit technology category already verified in project evidence."""
    technology = evaluations.get("project_technology")
    if not technology or technology["found"]:
        return
    for criterion_id in ("relevant_project", "project_outcome"):
        for evidence in evaluations.get(criterion_id, {}).get("evidence", []):
            quote = evidence.get("quote", "")
            if _PROJECT_TECHNOLOGY_CATEGORY.search(quote):
                technology.update(
                    found=True,
                    evidence=[dict(evidence)],
                    note="Verified project evidence explicitly names a technology category.",
                )
                return


def _capture_contract_failure(
    debug_capture: _ResumeDebugCapture | None,
    data: object,
    *,
    error: ValidationError | None = None,
    path: str | None = None,
    actual: object | None = None,
    expected: object | None = None,
    reason: str | None = None,
) -> None:
    """Persist a field-level contract diff only for an explicitly local debug run.

    Raw model output can contain résumé text, so this must never run outside the
    one-shot DEBUG_RESUME_VERIFIER capture. The raw response is saved separately
    by ``on_response`` before parsing; this report explains the exact rejection.
    """
    if debug_capture is None:
        return
    failures = []
    if error is not None:
        schema = ResumeReply.model_json_schema()
        def schema_at(location):
            current = schema
            for part in location:
                while isinstance(current, dict) and "$ref" in current:
                    current = schema.get("$defs", {}).get(current["$ref"].rsplit("/", 1)[-1], {})
                if isinstance(part, int):
                    current = current.get("items", {}) if isinstance(current, dict) else {}
                else:
                    current = current.get("properties", {}).get(part, {}) if isinstance(current, dict) else {}
            return current
        for item in error.errors(include_input=True, include_url=False, include_context=True):
            location = list(item.get("loc", ()))
            object_value = data
            for part in location:
                if isinstance(object_value, dict):
                    object_value = object_value.get(part)
                elif isinstance(object_value, list) and isinstance(part, int) and part < len(object_value):
                    object_value = object_value[part]
                else:
                    object_value = None
                    break
            failures.append({
                "path": ".".join(str(part) for part in location),
                "error_type": item.get("type"),
                "message": item.get("msg"),
                "actual_value": object_value,
                "expected_field_schema": schema_at(location),
            })
    else:
        failures.append({
            "path": path,
            "reason": reason,
            "actual_object": actual,
            "expected": expected,
            "unexpected_fields": sorted(set(actual or {}) - set(expected or {}))
            if isinstance(actual, dict) and isinstance(expected, dict) else [],
            "missing_fields": sorted(set(expected or {}) - set(actual or {}))
            if isinstance(actual, dict) and isinstance(expected, dict) else [],
        })
    report = {
        "failure_count": len(failures),
        "failures": failures,
        "expected_top_level_fields": sorted(ResumeReply.model_fields),
        "actual_top_level_fields": sorted(data) if isinstance(data, dict) else [],
        "expected_schema": ResumeReply.model_json_schema(),
    }
    debug_capture._write_json("validation-failure.json", report)
    logger.warning(
        "DEBUG resume contract failure saved: path=%s failures=%d",
        debug_capture.path,
        len(failures),
    )


def _clean_model_text(value, limit: int) -> str:
    return _truncate_at_word_boundary(" ".join(str(value).split()), limit)


def _normalize_resume_payload(data: object, rubric: dict, dropped: list[str]) -> object:
    """Bound safe prose and discard contract noise without touching quotes."""
    if not isinstance(data, dict):
        return data
    allowed = set(ResumeReply.model_fields)
    cleaned_top_level = {}
    for key, value in data.items():
        if key in allowed:
            cleaned_top_level[key] = value
        else:
            dropped.append(f"{key}:unknown_field")
    data = cleaned_top_level
    data.setdefault("recommendations", [])
    data.setdefault("skill_roadmap", [])
    if data.get("is_resume") is False:
        return data
    if isinstance(data.get("summary"), str):
        data["summary"] = _clean_model_text(data["summary"], 350)

    expected = [criterion["id"] for category in rubric["categories"]
                for criterion in category["criteria"] if criterion["id"] not in _STATIC_CRITERIA]
    evaluations = []
    seen = set()
    for item in (data.get("evaluations") or [])[:40]:
        if not isinstance(item, dict):
            dropped.append("evaluations:item_not_object")
            continue
        criterion_id = " ".join(str(item.get("criterion_id", "")).split())
        if criterion_id not in expected or criterion_id in seen:
            dropped.append(f"evaluations.{criterion_id or 'unknown'}:duplicate_or_unknown")
            continue
        seen.add(criterion_id)
        item = {key: item.get(key) for key in Evaluation.model_fields if key in item}
        item["criterion_id"] = criterion_id
        item["found"] = item.get("found") is True
        item["note"] = _clean_model_text(item.get("note", "No concise note was returned."), 180)
        evidence = item.get("evidence") if isinstance(item.get("evidence"), list) else []
        evidence_limit = 5 if criterion_id in {"standard_sections", "standard_headings", "section_order", "date_consistency"} else 4
        item["evidence"] = [
            {
                "source": evidence_item.get("source"),
                "page": evidence_item.get("page"),
                "quote": evidence_item.get("quote"),
            }
            for evidence_item in evidence[:evidence_limit]
            if isinstance(evidence_item, dict) and isinstance(evidence_item.get("quote"), str)
            and len(evidence_item["quote"]) <= MAX_QUOTE_CHARS
        ]
        if not item["found"]:
            item["evidence"] = []
        if item["found"] and not item["evidence"]:
            item["found"] = False
            item["note"] = "No independently verifiable source excerpt was returned for this criterion."
        evaluations.append(item)
    for criterion_id in expected:
        if criterion_id not in seen:
            dropped.append(f"evaluations.{criterion_id}:missing_finding")
            evaluations.append({
                "criterion_id": criterion_id,
                "found": False,
                "evidence": [],
                "note": "No valid structured finding was returned for this criterion.",
            })
    data["evaluations"] = evaluations

    for field, kind, limit in (("project_reviews", "project", 2), ("experience_reviews", "experience", 1)):
        samples = []
        for item in (data.get(field) or [])[:limit]:
            if not isinstance(item, dict):
                continue
            cleaned = {key: item.get(key) for key in WorkSampleReview.model_fields if key in item}
            cleaned["title"] = _clean_model_text(cleaned.get("title", "Untitled"), 60)
            cleaned["summary"] = _clean_model_text(cleaned.get("summary", ""), 300)
            technologies = cleaned.get("technologies") if isinstance(cleaned.get("technologies"), list) else []
            cleaned["technologies"] = list(dict.fromkeys(
                _clean_model_text(value, 30) for value in technologies if isinstance(value, str)
            ))[:6]
            checks = []
            for check in (cleaned.get("checks") or [])[:9]:
                if not isinstance(check, dict):
                    continue
                check = {key: check.get(key) for key in ReviewCheck.model_fields if key in check}
                check["criterion_id"] = " ".join(str(check.get("criterion_id", "")).split())
                check["found"] = check.get("found") is True
                check["note"] = _clean_model_text(check.get("note", "No concise note was returned."), 160)
                evidence = check.get("evidence") if isinstance(check.get("evidence"), list) else []
                check["evidence"] = evidence[:1]
                if not check["found"]:
                    check["evidence"] = []
                checks.append(check)
            cleaned["checks"] = checks
            rewrite = cleaned.get("bullet_rewrite")
            if isinstance(rewrite, dict):
                rewrite = {key: rewrite.get(key) for key in BulletRewrite.model_fields if key in rewrite}
                rewrite["suggestion"] = _clean_model_text(rewrite.get("suggestion", ""), 400)
                cleaned["bullet_rewrite"] = rewrite
            else:
                cleaned["bullet_rewrite"] = None
            samples.append(cleaned)
        data[field] = samples
    return data


def parse_resume_reply(text: str, rubric: dict, pages: list[str], step_positions: list[int] | int,
                       debug_capture: _ResumeDebugCapture | None = None, *, tolerant: bool = False) -> tuple[dict, dict]:
    """Validate evidence citations and exact criterion coverage; never score."""
    try:
        data = load_strict_json(text, MAX_REPLY_CHARS)
    except AIOutputError as error:
        if debug_capture is not None and hasattr(debug_capture, "save_validation_steps"):
            debug_capture.save_validation_steps({
                "status": "failed",
                "stage": "json_parse",
                "kind": error.kind,
                "detail": error.detail,
            })
        raise
    if tolerant and isinstance(data, dict) and isinstance(data.get("summary"), str):
        data["summary"] = _truncate_at_word_boundary(data["summary"], 350)
    _split_verified_section_headings(data, pages)
    if tolerant:
        normalization_drops: list[str] = []
        data = _normalize_resume_payload(data, rubric, normalization_drops)
    else:
        normalization_drops = []
    if debug_capture is not None and hasattr(debug_capture, "save_normalized_response"):
        debug_capture.save_normalized_response(data)
    _split_verified_date_anchors(data, pages)
    try:
        reply = ResumeReply.model_validate(data)
    except ValidationError as error:
        _capture_contract_failure(debug_capture, data, error=error)
        raise AIOutputError("schema", error_summary(error, _KNOWN_FIELDS)) from None

    if not reply.is_resume:
        if (reply.evaluations or reply.recommendations or reply.skill_roadmap
                or reply.project_reviews or reply.experience_reviews):
            raise AIOutputError("schema", "non_resume:arrays_not_empty")
        return reply.model_dump(), {"strategy": "strict", "items": 0, "dropped": []}

    criteria = [criterion for category in rubric["categories"] for criterion in category["criteria"]]
    ai_criteria = [criterion for criterion in criteria if criterion["id"] not in _STATIC_CRITERIA]
    expected_ids = {criterion["id"] for criterion in ai_criteria}
    actual_ids = [item.criterion_id for item in reply.evaluations]
    if len(actual_ids) != len(set(actual_ids)) or set(actual_ids) != expected_ids:
        raise AIOutputError("schema", "evaluations:criterion_set_mismatch")

    evaluation_map = _static_evaluations(pages)
    for index, item in enumerate(reply.evaluations):
        if (item.criterion_id not in {"standard_sections", "standard_headings", "section_order", "date_consistency"}
                and len(item.evidence) > 4):
            raise AIOutputError("schema", f"evaluations.{index}.evidence:too_long")
        if item.found and not item.evidence:
            raise AIOutputError("schema", f"evaluations.{index}.evidence:required")
        if not item.found and item.evidence:
            if tolerant:
                item.evidence = []
                normalization_drops.append(f"evaluations.{item.criterion_id}.evidence:cleared_false")
            else:
                _capture_contract_failure(
                    debug_capture, data, path=f"evaluations[{index}]", actual=item.model_dump(),
                    expected={"criterion_id": "string", "found": "false", "evidence": [],
                              "note": "string (1-180 chars)"},
                    reason="A false evaluation must have an empty evidence array; evidence is only valid when found is true.",
                )
                raise AIOutputError("schema", f"evaluations.{index}.evidence:unexpected")
        for citation_index, citation in enumerate(item.evidence):
            if len(citation.quote.strip()) < MIN_QUOTE_CHARS:
                raise AIOutputError("schema", f"evaluations.{index}.evidence.{citation_index}.quote:min_length")
            if citation.page > len(pages):
                raise AIOutputError("schema", f"evaluations.{index}.evidence.{citation_index}.page:out_of_range")
            if contains_contact_details(citation.quote):
                raise AIOutputError("personal_data", f"evaluations.{index}.evidence.{citation_index}")
            page = pages[citation.page - 1]
            normalized_quote = _normalized(citation.quote)
            normalized_page = _normalized(page)
            matches = _quote_matches_source(citation.quote, page)
            if debug_capture is not None:
                debug_capture.save_comparison({
                    "evaluation_index": index,
                    "criterion_id": item.criterion_id,
                    "evidence_index": citation_index,
                    "returned_quote": citation.quote,
                    "normalized_quote": normalized_quote,
                    "page_number": citation.page,
                    "extracted_page_text": page,
                    "normalized_page_text": normalized_page,
                    "matches": matches,
                    "match_reason": (
                        "normalized quote words occur contiguously and in order"
                        if matches else "normalized quote word sequence is absent from normalized cited page"
                    ),
                    "forensic_diagnostic": _citation_mismatch_diagnostic(citation.quote, page, citation.page)
                    if not matches else None,
                })
            if not matches:
                logger.warning(
                    "RÃ©sumÃ© citation could not be verified: %s",
                    _citation_mismatch_diagnostic(citation.quote, page, citation.page),
                )
                if tolerant:
                    item.found = False
                    item.evidence = []
                    item.note = "No independently verifiable source excerpt was returned for this criterion."
                    normalization_drops.append(f"evaluations.{item.criterion_id}.evidence:unverified_quote")
                    break
                raise AIOutputError("schema", f"evaluations.{index}.evidence.{citation_index}.quote:not_in_source")
        if contains_contact_details(item.note):
            raise AIOutputError("personal_data", f"evaluations.{index}.note")
        evaluation_map[item.criterion_id] = {
            "found": item.found,
            "evidence": [citation.model_dump() for citation in item.evidence],
            "note": item.note,
        }

    _backfill_project_technology(evaluation_map)

    project_reviews, project_dropped = _validate_work_samples(
        reply.project_reviews, "project", pages, debug_capture, tolerant=tolerant
    )
    experience_reviews, experience_dropped = _validate_work_samples(
        reply.experience_reviews, "experience", pages, debug_capture, tolerant=tolerant
    )

    recommendation_ids = {item.criterion_id for item in reply.evaluations if not item.found}
    safe_recommendations = []
    dropped_recommendations = []
    for index, recommendation in enumerate(reply.recommendations):
        ids = recommendation.criterion_ids
        if len(ids) != len(set(ids)):
            raise AIOutputError("schema", f"recommendations.{index}.criterion_ids:duplicate")
        if contains_contact_details(recommendation.title) or contains_contact_details(recommendation.action):
            raise AIOutputError("personal_data", f"recommendations.{index}")
        if any(criterion_id not in expected_ids or criterion_id not in recommendation_ids
               for criterion_id in ids):
            # JSON Schema can constrain the ID vocabulary, but it cannot
            # express that each ID must point to an evaluation with found=false.
            # Drop the entire invalid suggestion (never trim or rewrite its IDs)
            # and build safe fallback advice from the verified missing criteria.
            dropped_recommendations.append(
                f"recommendations.{index}.criterion_ids:invalid_reference"
            )
            continue
        safe_recommendations.append(recommendation.model_dump())

    if dropped_recommendations:
        covered_ids = {criterion_id for item in safe_recommendations for criterion_id in item["criterion_ids"]}
        for criterion in ai_criteria:
            criterion_id = criterion["id"]
            if criterion_id not in recommendation_ids or criterion_id in covered_ids:
                continue
            label = criterion["label"]
            safe_recommendations.append({
                "title": label,
                "action": (
                    f"Add a truthful, specific example that demonstrates {label.lower()}. "
                    "Include relevant tools, scope, or results only when accurate."
                ),
                "criterion_ids": [criterion_id],
            })
            covered_ids.add(criterion_id)
            if len(safe_recommendations) >= 5:
                break

    if reply.skill_roadmap:
        skill_ids = {criterion["id"] for category in rubric["categories"]
                     if category["id"] == "skills" for criterion in category["criteria"]}
        roadmap_skill_ids = [item.skill_id for item in reply.skill_roadmap]
        if len(roadmap_skill_ids) != len(set(roadmap_skill_ids)) or set(roadmap_skill_ids) != skill_ids:
            raise AIOutputError("schema", "skill_roadmap:skill_set_mismatch")
        allowed_positions = _allowed_roadmap_positions(step_positions)
        for index, item in enumerate(reply.skill_roadmap):
            if len(item.step_positions) != len(set(item.step_positions)):
                raise AIOutputError("schema", f"skill_roadmap.{index}.step_positions:duplicate")
            if any(position not in allowed_positions for position in item.step_positions):
                raise AIOutputError("schema", f"skill_roadmap.{index}.step_positions:out_of_range")

    for field, value in (("summary", reply.summary),):
        if contains_contact_details(value):
            raise AIOutputError("personal_data", field)

    result = reply.model_dump()
    result["recommendations"] = safe_recommendations
    result["evaluations_by_id"] = evaluation_map
    result["project_reviews_by_item"] = project_reviews
    result["experience_reviews_by_item"] = experience_reviews
    diagnostics = {
        "strategy": "evidence_checked",
        "items": (len(reply.evaluations) + len(safe_recommendations)
                  + sum(len(item.checks) for item in reply.project_reviews + reply.experience_reviews)),
        "dropped": normalization_drops + dropped_recommendations + project_dropped + experience_dropped,
    }
    if debug_capture is not None and hasattr(debug_capture, "save_validation_steps"):
        debug_capture.save_validation_steps({
            "status": "passed",
            "stage": "evidence_and_schema",
            "evaluations": len(reply.evaluations),
            "project_reviews": len(reply.project_reviews),
            "experience_reviews": len(reply.experience_reviews),
            "dropped": diagnostics["dropped"],
        })
    return result, diagnostics


def _validate_work_samples(items: list[WorkSampleReview], kind: str, pages: list[str],
                           debug_capture: _ResumeDebugCapture | None,
                           *, tolerant: bool = False) -> tuple[list[dict], list[str]]:
    """Canonicalize and verify work-sample checks before allowing them to score.

    The model can mix global rubric IDs into these narrower per-project/job
    check lists or omit a check. Unknown or ambiguous entries are discarded;
    omitted checks are conservatively recorded as not evidenced. Only a
    unique expected ID with independently verified evidence can earn points.
    """
    expected = _PROJECT_CHECK_IDS if kind == "project" else _EXPERIENCE_CHECK_IDS
    order = _PROJECT_CHECK_ORDER if kind == "project" else _EXPERIENCE_CHECK_ORDER
    dropped = []
    validated = []
    for item_index, item in enumerate(items):
        path = f"{kind}_reviews.{item_index}"
        if any(contains_contact_details(value) for value in (item.title, item.summary)):
            raise AIOutputError("personal_data", path)
        check_ids = [check.criterion_id for check in item.checks]
        counts = {criterion_id: check_ids.count(criterion_id) for criterion_id in set(check_ids)}
        by_id = {
            check.criterion_id: check for check in item.checks
            if check.criterion_id in expected and counts[check.criterion_id] == 1
        }
        if len(check_ids) != len(expected) or any(count != 1 for count in counts.values()) or set(check_ids) != expected:
            dropped.append(f"{path}.checks:criterion_set_mismatch")
        normalized_checks = [by_id.get(criterion_id) or ReviewCheck(
            criterion_id=criterion_id,
            found=False,
            evidence=[],
            note=f"Not enough independently verified {kind} evidence was returned for this check.",
        ) for criterion_id in order]
        for check_index, check in enumerate(normalized_checks):
            check_path = f"{path}.checks.{check_index}"
            if check.found and not check.evidence:
                raise AIOutputError("schema", f"{check_path}.evidence:required")
            if not check.found and check.evidence:
                raise AIOutputError("schema", f"{check_path}.evidence:unexpected")
            if contains_contact_details(check.note):
                raise AIOutputError("personal_data", f"{check_path}.note")
            for evidence_index, evidence in enumerate(check.evidence):
                evidence_path = f"{check_path}.evidence.{evidence_index}"
                if evidence.page > len(pages):
                    raise AIOutputError("schema", f"{evidence_path}.page:out_of_range")
                if contains_contact_details(evidence.quote):
                    raise AIOutputError("personal_data", evidence_path)
                page = pages[evidence.page - 1]
                matches = _quote_matches_source(evidence.quote, page)
                if debug_capture is not None:
                    normalized_quote = _normalized(evidence.quote)
                    normalized_page = _normalized(page)
                    debug_capture.save_comparison({
                        "source_kind": kind,
                        "item_index": item_index,
                        "criterion_id": check.criterion_id,
                        "evidence_index": evidence_index,
                        "returned_quote": evidence.quote,
                        "normalized_quote": normalized_quote,
                        "page_number": evidence.page,
                        "extracted_page_text": page,
                        "normalized_page_text": normalized_page,
                        "matches": matches,
                        "first_mismatch": _first_sequence_mismatch(
                            normalized_quote.split(), normalized_page.split()
                        ) if not matches else None,
                        "forensic_diagnostic": _citation_mismatch_diagnostic(
                            evidence.quote, page, evidence.page
                        ) if not matches else None,
                    })
                if not matches:
                    if debug_capture is not None and not tolerant:
                        debug_capture.save_validation_steps({
                            "status": "failed",
                            "stage": "work_sample_evidence",
                            "path": evidence_path,
                            "reason": "quote:not_in_source",
                        })
                    if tolerant:
                        check.found = False
                        check.evidence = []
                        check.note = "No independently verifiable source excerpt was returned for this check."
                        dropped.append(f"{evidence_path}:unverified_quote")
                        continue
                    raise AIOutputError("schema", f"{evidence_path}.quote:not_in_source")

        cited_item_text = " ".join(
            evidence.quote for check in item.checks for evidence in check.evidence
        )
        normalized_cited_item_text = f" {_normalized(cited_item_text)} "
        # Tags are display-only, not score inputs. A model may list a tool it
        # mentioned elsewhere in the same project/job but omitted from its
        # single stack excerpt. Keep only tags supported by this item's own
        # already-verified citations; unsupported or personal-data values are
        # discarded rather than failing the entire analysis.
        item.technologies = [
            technology for technology in item.technologies
            if not contains_contact_details(technology)
            and f" {' '.join(_normalized_tokens(technology))} " in normalized_cited_item_text
        ]

        if item.bullet_rewrite is not None:
            source = item.bullet_rewrite.source
            rewrite_path = f"{path}.bullet_rewrite"
            if source.page > len(pages) or contains_contact_details(source.quote):
                raise AIOutputError("personal_data" if contains_contact_details(source.quote)
                                    else "schema", f"{rewrite_path}.source")
            if not _quote_matches_source(source.quote, pages[source.page - 1]):
                if debug_capture is not None and not tolerant:
                    debug_capture.save_validation_steps({
                        "status": "failed",
                        "stage": "work_sample_bullet_rewrite",
                        "path": f"{rewrite_path}.source.quote",
                        "reason": "quote:not_in_source",
                    })
                if tolerant:
                    item.bullet_rewrite = None
                    dropped.append(f"{rewrite_path}.source:unverified_quote")
                    continue
                raise AIOutputError("schema", f"{rewrite_path}.source.quote:not_in_source")
            suggestion = item.bullet_rewrite.suggestion
            if contains_contact_details(suggestion):
                raise AIOutputError("personal_data", f"{rewrite_path}.suggestion")
            source_numbers = set(re.findall(r"\d+(?:[.,]\d+)?%?", source.quote))
            suggested_numbers = set(re.findall(r"\d+(?:[.,]\d+)?%?", suggestion))
            if not suggested_numbers <= source_numbers:
                raise AIOutputError("schema", f"{rewrite_path}.suggestion:unsupported_metric")

        item.checks = normalized_checks
        validated.append(_work_sample_report(item, kind))
    return validated, dropped


def _work_sample_report(item: WorkSampleReview, kind: str) -> dict:
    weights = _PROJECT_CHECK_WEIGHTS if kind == "project" else _EXPERIENCE_CHECK_WEIGHTS
    found_checks = [check.criterion_id for check in item.checks if check.found]
    missing_checks = [check.criterion_id for check in item.checks if not check.found]
    score = round(sum(weights[check.criterion_id] for check in item.checks if check.found))
    first_finding = next((check.evidence[0] for check in item.checks if check.found and check.evidence), None)
    rewrite = item.bullet_rewrite
    return {
        "title": item.title,
        "summary": item.summary,
        "score": score,
        "technologies": item.technologies if kind == "project" else [],
        "found_checks": found_checks,
        "missing_checks": missing_checks,
        "evidence": ({"quote": first_finding.quote, "page": first_finding.page} if first_finding else None),
        "bullet_rewrite": ({"before": rewrite.source.quote, "after": rewrite.suggestion,
                            "page": rewrite.source.page} if rewrite else None),
    }


_SECTION_HEADING_QUOTES = frozenset({
    "summary", "professional summary", "profile", "objective", "skills", "technical skills",
    "core skills", "experience", "work experience", "professional experience", "employment",
    "employment history", "projects", "personal projects", "education", "certifications",
    "certificates", "coursework", "relevant coursework", "training", "volunteer experience",
    "leadership", "awards", "publications", "languages",
})


def _split_verified_section_headings(data: object, pages: list[str]) -> None:
    """Expand stitched section-heading quotes into separately verifiable citations.

    Gemini sometimes joins several headings into one quote for the
    ``standard_sections`` criterion even though body text lies between them.
    Accept only newline-delimited, allowlisted headings that each occur as an
    exact extracted page line; the normal strict citation verifier still
    validates every resulting excerpt independently.
    """
    if not isinstance(data, dict):
        return
    for evaluation in data.get("evaluations", []):
        if (not isinstance(evaluation, dict)
                or evaluation.get("criterion_id") not in {"standard_sections", "standard_headings", "section_order"}):
            continue
        evidence = evaluation.get("evidence")
        if not isinstance(evidence, list) or len(evidence) != 1:
            continue
        citation = evidence[0]
        if (not isinstance(citation, dict) or citation.get("source") != "resume_text"
                or not isinstance(citation.get("quote"), str)):
            continue
        page_number = citation.get("page")
        if (not isinstance(page_number, int) or isinstance(page_number, bool)
                or not 1 <= page_number <= len(pages)):
            continue
        quote = citation["quote"]
        page = pages[page_number - 1]
        if len(quote) > MAX_QUOTE_CHARS and _quote_matches_source(quote, page):
            # Do not truncate a long contiguous block. For section-order
            # evidence, retain only exact standard headings appearing as
            # separate lines in both the quoted block and cited source page.
            quoted_lines = {_normalized(line.strip()) for line in quote.splitlines()}
            source_headings = []
            for line_number, line in enumerate(page.splitlines()):
                normalized = _normalized(line.strip())
                if normalized in _SECTION_HEADING_QUOTES and normalized in quoted_lines:
                    source_headings.append((normalized, line.strip(), line_number))
            if 2 <= len(source_headings) <= 5:
                evaluation["evidence"] = [
                    {"source": "resume_text", "page": page_number, "quote": heading}
                    for _, heading, _ in source_headings
                ]
                continue
        raw_lines = [line.strip().strip("`*_#>-• ") for line in citation["quote"].splitlines()]
        if not 2 <= len(raw_lines) <= 5 or any(not line for line in raw_lines):
            continue
        normalized_lines = [_normalized(line) for line in raw_lines]
        if any(line not in _SECTION_HEADING_QUOTES for line in normalized_lines):
            continue
        source_headings = {}
        for line_number, line in enumerate(pages[page_number - 1].splitlines()):
            normalized = _normalized(line.strip())
            if normalized in _SECTION_HEADING_QUOTES and normalized not in source_headings:
                source_headings[normalized] = (line.strip(), line_number)
        if any(line not in source_headings for line in normalized_lines):
            continue
        if (evaluation["criterion_id"] == "section_order"
                and [source_headings[line][1] for line in normalized_lines]
                != sorted(source_headings[line][1] for line in normalized_lines)):
            continue
        evaluation["evidence"] = [
            {"source": "resume_text", "page": page_number, "quote": source_headings[line][0]}
            for line in dict.fromkeys(normalized_lines)
        ]


def _split_verified_date_anchors(data: object, pages: list[str]) -> None:
    """Expand a Gemini list of non-contiguous date-bearing section anchors.

    A list such as project title/date, second project/date, role/date and
    education/date is useful evidence for chronology, but the stitched string
    is not itself a source quote. Split only when every non-empty line is an
    independently verifiable substring of the cited page; the normal strict
    citation/privacy checks then run on every resulting quote.
    """
    if not isinstance(data, dict):
        return
    for evaluation in data.get("evaluations", []):
        if not isinstance(evaluation, dict) or evaluation.get("criterion_id") != "date_consistency":
            continue
        evidence = evaluation.get("evidence")
        if not isinstance(evidence, list) or len(evidence) != 1:
            continue
        citation = evidence[0]
        if (not isinstance(citation, dict) or citation.get("source") != "resume_text"
                or not isinstance(citation.get("quote"), str)):
            continue
        page_number = citation.get("page")
        if (not isinstance(page_number, int) or isinstance(page_number, bool)
                or not 1 <= page_number <= len(pages)):
            continue
        quotes = [line.strip().strip("`*_#>-• ") for line in citation["quote"].splitlines()]
        if not 2 <= len(quotes) <= 5 or any(len(quote) < MIN_QUOTE_CHARS for quote in quotes):
            continue
        page = pages[page_number - 1]
        if not all(_quote_matches_source(quote, page) for quote in quotes):
            continue
        evaluation["evidence"] = [
            {"source": "resume_text", "page": page_number, "quote": quote}
            for quote in quotes
        ]


def _allowed_roadmap_positions(positions: list[int] | int) -> list[int]:
    """Return saved roadmap identifiers; integer input preserves test/legacy callers."""
    if isinstance(positions, int) and not isinstance(positions, bool):
        return list(range(1, positions + 1))
    return list(dict.fromkeys(positions))


def _gemini_response_schema(step_positions: list[int] | int, criterion_ids: list[str] | None = None,
                            *, minimal: bool = False) -> dict:
    """Send only high-value bounds that fit Gemini's serving-state budget.

    Full array and string limits remain enforced by the strict Python models;
    broad nested `maxItems` constraints exceed Flash-Lite's schema state budget.
    """
    schema = deepcopy(ResumeAnalysisSchema.model_json_schema())
    def normalize_supported_schema(value):
        if isinstance(value, dict):
            if "const" in value:
                value["enum"] = [value.pop("const")]
            for child in value.values():
                normalize_supported_schema(child)
        elif isinstance(value, list):
            for child in value:
                normalize_supported_schema(child)

    normalize_supported_schema(schema)
    if minimal:
        for field in ("recommendations", "skill_roadmap"):
            schema["properties"].pop(field, None)
        schema["required"] = [field for field in schema.get("required", [])
                               if field not in {"recommendations", "skill_roadmap"}]
        schema["properties"]["project_reviews"]["maxItems"] = 2
        schema["properties"]["experience_reviews"]["maxItems"] = 1
        allowed_positions = _allowed_roadmap_positions(step_positions)
        if allowed_positions:
            position_schema = schema["$defs"]["SkillRoadmapSchema"]["properties"]["step_positions"]["items"]
            position_schema["minimum"] = min(allowed_positions)
            position_schema["maximum"] = max(allowed_positions)
        return schema
    if criterion_ids is not None:
        schema["$defs"]["RecommendationSchema"]["properties"]["criterion_ids"]["items"]["enum"] = list(
            dict.fromkeys(criterion_ids)
        )
    allowed_positions = _allowed_roadmap_positions(step_positions)
    if allowed_positions:
        position_schema = schema["$defs"]["SkillRoadmapSchema"]["properties"]["step_positions"]["items"]
        position_schema["minimum"] = min(allowed_positions)
        position_schema["maximum"] = max(allowed_positions)
    # Pydantic's outer list bounds are intentionally omitted by some Gemini
    # schema translations. Add the response-contract caps explicitly so the
    # provider can enforce them before emitting JSON (the strict Python model
    # remains the final authority).
    return schema


def _compact_report_evidence(evaluations: dict) -> dict:
    """Keep one verified excerpt per criterion (up to five section headings).

    All model citations have already passed source and privacy checks. The UI
    needs one representative excerpt for each scored finding; conventional
    section formatting keeps up to five distinct heading excerpts.
    """
    compacted = {}
    for criterion_id, evaluation in evaluations.items():
        evidence = evaluation["evidence"]
        limit = 5 if criterion_id in {"standard_sections", "standard_headings", "section_order"} else 1
        compacted[criterion_id] = {**evaluation, "evidence": evidence[:limit]}
    return compacted


def _first_sequence_mismatch(quote_tokens: list[str], page_tokens: list[str]) -> dict | None:
    """Explain the earliest point at which quote tokens cannot align to source."""
    if not quote_tokens:
        return {"quote_token_index": 0, "expected": None, "source_window": []}
    for start in range(max(1, len(page_tokens) - len(quote_tokens) + 1)):
        if page_tokens[start:start + len(quote_tokens)] == quote_tokens:
            return None
    best_start = 0
    best_prefix = 0
    for start in range(len(page_tokens)):
        matched = 0
        while (matched < len(quote_tokens) and start + matched < len(page_tokens)
               and quote_tokens[matched] == page_tokens[start + matched]):
            matched += 1
        if matched > best_prefix:
            best_start, best_prefix = start, matched
    mismatch_index = best_prefix
    return {
        "quote_token_index": mismatch_index,
        "expected": quote_tokens[mismatch_index] if mismatch_index < len(quote_tokens) else None,
        "source_window_start_token": best_start + mismatch_index,
        "source_window": page_tokens[best_start:best_start + len(quote_tokens)],
        "matched_prefix_tokens": best_prefix,
    }


def _legacy_analysis(reply: dict, rubric: dict, score_report: dict, evaluations: dict) -> dict:
    criteria = {criterion["id"]: criterion for category in rubric["categories"]
                for criterion in category["criteria"]}
    recommendations = score_report["recommendations"]
    recommendation_for = {}
    for item in recommendations:
        for criterion_id in item["criterion_ids"]:
            recommendation_for.setdefault(criterion_id, item["action"])

    skill_category = next(category for category in rubric["categories"] if category["id"] == "skills")
    matched_skills = [item["label"] for item in skill_category["criteria"] if evaluations[item["id"]]["found"]]
    missing_skills = [item["label"] for item in skill_category["criteria"] if not evaluations[item["id"]]["found"]]
    strengths = [evaluations[criterion["id"]]["note"] for category in rubric["categories"]
                 for criterion in category["criteria"] if evaluations[criterion["id"]]["found"]][:5]
    missing_criteria = [criterion for category in rubric["categories"] for criterion in category["criteria"]
                        if not evaluations[criterion["id"]]["found"]]
    points_by_id = {criterion["id"]: criterion["points"] for category in score_report["categories"]
                    for criterion in category["criteria"]}
    missing_criteria.sort(key=lambda item: -points_by_id[item["id"]])

    step_for_skill = {skill["skill"].casefold(): (skill["roadmap_steps"] or [None])[0]
                      for skill in score_report["roadmap"]["skills"]}
    gaps = [{
        "skill": item["label"],
        "why": evaluations[item["id"]]["note"],
        "how_to_close": recommendation_for.get(item["id"], f"Add a truthful example that demonstrates {item['label']}.")[:300],
        "related_step": step_for_skill.get(item["label"].casefold()),
    } for item in missing_criteria[:5]]
    section_by_category = {"skills": "skills", "projects": "projects", "experience": "experience",
                           "education": "education", "formatting": "formatting", "ats": "formatting",
                           "certifications": "other", "leadership": "experience"}
    suggestions = []
    for item in recommendations:
        criterion = criteria[item["criterion_ids"][0]]
        suggestions.append({"section": section_by_category[criterion["category"]], "text": item["action"][:300]})

    return {
        "summary": reply["summary"],
        "matched_skills": matched_skills,
        "missing_skills": missing_skills,
        "strengths": strengths,
        "gaps": gaps,
        "suggestions": suggestions,
        "project_reviews": reply.get("project_reviews_by_item", []),
        "experience_reviews": reply.get("experience_reviews_by_item", []),
        "score_report": score_report,
    }


def _truncate_at_word_boundary(value: str, limit: int) -> str:
    if len(value) <= limit:
        return value
    clipped = value[:limit]
    if " " in clipped:
        clipped = clipped.rsplit(" ", 1)[0]
    return clipped.rstrip(" ,;:-")


def _shorten_verified_quote(quote: str, page_number: int, pages: list[str], limit: int) -> str:
    """Keep a smaller contiguous source excerpt; never weaken citation checks."""
    if len(quote) <= limit:
        return quote
    if not 1 <= page_number <= len(pages):
        return quote
    for end in range(limit, MIN_QUOTE_CHARS - 1, -1):
        if end < len(quote) and not quote[end].isspace() and not quote[end - 1].isspace():
            continue
        candidate = quote[:end].rstrip()
        if len(candidate) >= MIN_QUOTE_CHARS and _quote_matches_source(candidate, pages[page_number - 1]):
            return candidate
    return quote


def _compact_analysis_for_storage(analysis: dict, pages: list[str], byte_limit: int) -> dict:
    """Drop redundant per-criterion arithmetic and bound repeated prose.

    Category totals remain the authoritative score. Every displayed citation
    remains a contiguous, previously verified source excerpt; the only removed
    values are criterion-level point arithmetic that the UI does not display.
    """
    report = analysis.get("score_report")
    if not isinstance(report, dict):
        return analysis

    def compact_text(limit: int) -> None:
        if isinstance(analysis.get("summary"), str):
            analysis["summary"] = _truncate_at_word_boundary(analysis["summary"], 300)
        for gap in analysis.get("gaps", []):
            if isinstance(gap.get("why"), str):
                gap["why"] = _truncate_at_word_boundary(gap["why"], 90)
            if isinstance(gap.get("how_to_close"), str):
                gap["how_to_close"] = _truncate_at_word_boundary(gap["how_to_close"], 180)
        for category in report.get("categories", []):
            for criterion in category.get("criteria", []):
                criterion.pop("category", None)
                criterion.pop("points", None)
                criterion.pop("max_points", None)
                note = criterion.get("note")
                if isinstance(note, str):
                    criterion["note"] = _truncate_at_word_boundary(note, limit)
                for citation in criterion.get("evidence", []):
                    if isinstance(citation, dict) and isinstance(citation.get("quote"), str):
                        citation["quote"] = _shorten_verified_quote(
                            citation["quote"], citation.get("page", 0), pages, limit
                        )
                        # The source enum was checked before persistence and is
                        # constant for every citation; page + quote are enough
                        # for the saved report and its UI.
                        citation.pop("source", None)
        for field in ("project_reviews", "experience_reviews"):
            for item in analysis.get(field, []):
                if isinstance(item.get("summary"), str):
                    item["summary"] = _truncate_at_word_boundary(item["summary"], 110)
                for evidence in (item.get("evidence"),):
                    if isinstance(evidence, dict) and isinstance(evidence.get("quote"), str):
                        evidence["quote"] = _shorten_verified_quote(
                            evidence["quote"], evidence.get("page", 0), pages, limit
                        )
                rewrite = item.get("bullet_rewrite")
                if isinstance(rewrite, dict) and isinstance(rewrite.get("before"), str):
                    rewrite["before"] = _shorten_verified_quote(
                        rewrite["before"], rewrite.get("page", 0), pages, limit
                    )
                    if isinstance(rewrite.get("after"), str):
                        rewrite["after"] = _truncate_at_word_boundary(rewrite["after"], 180)

    for recommendation in report.get("recommendations", []):
        recommendation.pop("criterion_ids", None)
    # These extraction counters are request diagnostics, not analysis content.
    for field in ("extracted_chars", "extracted_pages", "extracted_words"):
        report.pop(field, None)

    compact_text(100)
    size = len(json.dumps(analysis, ensure_ascii=False).encode("utf-8"))
    if size > byte_limit:
        compact_text(70)
        size = len(json.dumps(analysis, ensure_ascii=False).encode("utf-8"))
    if size > byte_limit:
        compact_text(40)
        size = len(json.dumps(analysis, ensure_ascii=False).encode("utf-8"))
    # These older convenience fields repeat data already present in the
    # evidence report. Retain the coach-facing `gaps` field, but omit redundant
    # fallbacks only when the full, evidence-rich report needs the DB headroom.
    for field in ("suggestions", "strengths", "matched_skills", "missing_skills"):
        if size <= byte_limit:
            break
        analysis.pop(field, None)
        size = len(json.dumps(analysis, ensure_ascii=False).encode("utf-8"))
    return analysis


def _insufficient_analysis(career: str, skills, steps: list[dict], pages: list[str]) -> dict:
    """Return a server-authored no-score report without sending sparse PDFs to Gemini."""
    rubric = rubric_for(career, skills)
    roadmap_steps = steps if steps and isinstance(steps[0], dict) else [
        {"position": index, "title": title, "description": "", "tasks": [], "completed": False}
        for index, title in enumerate(steps or [], start=1)
    ]
    evaluations = _static_evaluations(pages)
    for category in rubric["categories"]:
        for criterion in category["criteria"]:
            if criterion["id"] not in _STATIC_CRITERIA:
                evaluations[criterion["id"]] = {
                    "found": False,
                    "evidence": [],
                    "note": "Not enough readable résumé content to verify this item reliably.",
                }
    extracted_chars = sum(len(page.strip()) for page in pages)
    extracted_words = len(_WORD.findall(" ".join(pages)))
    score_report = build_score_report(
        rubric, evaluations, [], roadmap_steps, {}, extracted_chars, len(pages), extracted_words
    )
    if score_report["status"] != "insufficient_evidence":
        # This helper is only used for sparse text. Keep the invariant explicit
        # if the scoring threshold changes independently in the future.
        score_report["status"] = "insufficient_evidence"
        score_report["overall"] = 0
        score_report["ats"]["score"] = 0
        score_report["confidence"] = {"level": "very_low", "score": 5,
                                      "reason": "There is not enough readable résumé content to support a dependable score."}
        score_report["insufficient_reasons"] = ["The PDF contains too little readable résumé text for a reliable review."]
        for category in score_report["categories"]:
            category["earned"] = category["score"] = 0
            for item in category["criteria"]:
                item["points"] = 0
        score_report["readiness"] = {"internship": 0, "junior": 0, "mid_level": 0}
    analysis = _legacy_analysis({
        "summary": "Unable to score reliably: this PDF contains too little readable résumé content. Add clear skills, project, experience, and education details, then upload it again.",
        "recommendations": [],
    }, rubric, score_report, evaluations)
    return {"analysis": analysis, "career": " ".join(str(career).split())[:100],
            "prompt_version": PROMPT_VERSION, "model": config.GEMINI_MODEL}


def analyze_resume(pdf: bytes, career: str, skills, steps, *, target_level: str = "entry_level") -> dict:
    """Analyze, cite, and score a résumé against the current PathwayAI roadmap."""
    check_pdf(pdf)
    pages = extract_resume_pages(pdf)
    extracted_chars = sum(len(page.strip()) for page in pages)
    extracted_words = len(_WORD.findall(" ".join(pages)))
    if extracted_chars < MIN_SCORE_TEXT_CHARS or extracted_words < MIN_SCORE_TEXT_WORDS:
        return _insufficient_analysis(career, skills, steps, pages)
    debug_capture = None
    if config.DEBUG_RESUME_VERIFIER:
        try:
            debug_capture = _ResumeDebugCapture(pdf, pages)
        except Exception as error:  # diagnostics are optional; never fail a user's analysis
            logger.warning("Local verifier capture unavailable (%s); continuing without capture",
                           type(error).__name__)
    rubric = rubric_for(career, skills)
    ai_criterion_ids = [
        criterion["id"] for category in rubric["categories"]
        for criterion in category["criteria"] if criterion["id"] not in _STATIC_CRITERIA
    ]
    roadmap_steps = steps if steps and isinstance(steps[0], dict) else [
        {"position": index, "title": title, "description": "", "tasks": [], "completed": False}
        for index, title in enumerate(steps or [], start=1)
    ]
    prompt = build_resume_evidence_prompt(career, rubric, roadmap_steps, pages, target_level=target_level)
    if debug_capture is not None:
        debug_capture.save_request({
            "pdf_bytes": len(pdf),
            "page_count": len(pages),
            "extracted_chars": extracted_chars,
            "extracted_words": extracted_words,
            "prompt_chars": len(prompt),
            "prompt_token_estimate": max(1, round(len(prompt) / 4)),
            "profile": os.getenv("DEBUG_RESUME_PROFILE") or None,
            "rubric_evaluation_count": len(ai_criterion_ids),
            "roadmap_skill_count": len(next(
                category["criteria"] for category in rubric["categories"] if category["id"] == "skills"
            )),
        })
    pdf_part = genai_types.Part.from_bytes(data=bytes(pdf), mime_type="application/pdf")

    def repair_contents(error: AIOutputError):
        """Ask Gemini once for a complete schema-valid replacement reply."""
        repair_prompt = (
            f"{prompt}\n\n"
            "REPAIR REQUEST: Your previous response was not valid for the supplied JSON schema. "
            f"The validation category was {error.kind!r}. Return a complete replacement JSON object "
            "that matches the schema exactly. Return JSON only; do not use Markdown fences, commentary, "
            "unknown fields, duplicate keys, or invented evidence."
        )
        return [pdf_part, repair_prompt]

    contents = [pdf_part, prompt]

    reply = llm.generate(
        contents,
        "resume",
        _gemini_response_schema(
            [step["position"] for step in roadmap_steps],
            ai_criterion_ids,
            minimal=True,
        ),
        lambda text: parse_resume_reply(
            text, rubric, pages, [step["position"] for step in roadmap_steps], debug_capture, tolerant=True
        ),
        system_instruction=RESUME_SYSTEM_INSTRUCTION,
        temperature=0,
        max_output_tokens=MAX_OUTPUT_TOKENS,
        validation_error_kind="invalid_output",
        validation_retry_contents=repair_contents,
        on_response=debug_capture.save_response if debug_capture is not None else None,
        on_attempt=debug_capture.save_attempt if debug_capture is not None else None,
    )
    if not reply.pop("is_resume"):
        raise ResumeInputError("not_resume")

    evaluations = reply.pop("evaluations_by_id")
    skill_roadmap = build_skill_roadmap(rubric, roadmap_steps, evaluations)
    score_report = build_score_report(
        rubric, _compact_report_evidence(evaluations), None, roadmap_steps, skill_roadmap,
        sum(len(page) for page in pages), len(pages), len(_WORD.findall(" ".join(pages))),
    )
    analysis = _legacy_analysis(reply, rubric, score_report, evaluations)
    analysis = _compact_analysis_for_storage(analysis, pages, MAX_ANALYSIS_BYTES)
    size = len(json.dumps(analysis, ensure_ascii=False).encode("utf-8"))
    if size > MAX_ANALYSIS_BYTES:
        raise AIOutputError("too_large", f"analysis {size} bytes")
    return {
        "analysis": analysis,
        "career": " ".join(str(career).split())[:100],
        "prompt_version": PROMPT_VERSION,
        "model": config.GEMINI_MODEL,
    }
