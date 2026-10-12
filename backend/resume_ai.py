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
from resume_scoring import build_score_report, rubric_for
from strict_ai import contains_contact_details, error_summary, load_strict_json
from strict_ai import text as _text

PROMPT_VERSION = "r2"

MIN_PDF_BYTES = 1024
MAX_PDF_BYTES = 2 * 1024 * 1024
MAX_PDF_PAGES = 10
MIN_EXTRACTED_TEXT_CHARS = 0
MIN_SCORE_TEXT_CHARS = 300
MIN_SCORE_TEXT_WORDS = 50
MAX_EXTRACTED_TEXT_CHARS = 30_000
MAX_PAGE_CONTENT_BYTES = 600_000

MAX_REPLY_CHARS = 30_000
# resume_analyses.analysis is limited to 16,384 bytes in the database; keep a margin.
MAX_ANALYSIS_BYTES = 16_000
MAX_OUTPUT_TOKENS = 8192
MIN_QUOTE_CHARS = 3
MAX_QUOTE_CHARS = 160

logger = logging.getLogger("pathwayai.resume_ai")

_CONTACT_EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
_CONTACT_PHONE = re.compile(r"(?<!\w)(?:\+\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]\d{4}(?!\w)")
_STATIC_CRITERIA = {"contact_information", "text_parseability"}
_PROJECT_CHECK_IDS = {
    "project_purpose", "project_stack", "project_complexity", "project_architecture",
    "project_apis", "project_deployment", "project_testing", "project_impact", "project_career_fit",
}
_EXPERIENCE_CHECK_IDS = {
    "experience_relevance", "experience_ownership", "experience_actions",
    "experience_results", "experience_transferable", "experience_career_fit",
}
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


class _ResumeDebugCapture:
    """One-shot local forensic capture; contains highly sensitive user data."""

    def __init__(self, pdf: bytes, pages: list[str]):
        self.attempt = 0
        with _DEBUG_CAPTURE_LOCK:
            _DEBUG_CAPTURE_ROOT.mkdir(parents=True, exist_ok=True)
            # A capture is one-shot per server process, not one-shot forever.
            # A stale marker from an earlier local run must never break a later
            # upload when DEBUG_RESUME_VERIFIER is enabled.
            claim = _DEBUG_CAPTURE_ROOT / f".capture-claimed-{os.getpid()}"
            try:
                with claim.open("x", encoding="utf-8") as stream:
                    stream.write(datetime.now(timezone.utc).isoformat())
            except FileExistsError:
                raise ResumeInputError("debug_capture_already_used") from None
            self.path = _DEBUG_CAPTURE_ROOT / (
                "capture-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid4().hex[:8]
            )
            self.path.mkdir()
        self._write_json("upload-metadata.json", {
            "pdf_bytes": len(pdf),
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
        description="A verbatim, contiguous, non-identifying excerpt from the stated page, 3 to 160 characters long."
    )


class EvaluationSchema(BaseModel):
    criterion_id: str
    found: bool
    evidence: list[EvidenceSchema]
    note: str = Field(description="A concise factual note of at most 120 characters.")


class RecommendationSchema(BaseModel):
    title: str = Field(description="A concise improvement title of at most 80 characters.")
    action: str = Field(description="An honest, concrete action of at most 180 characters.")
    criterion_ids: list[str]


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
    note: str = Field(description="A concise, specific note about this source-backed finding.")


class BulletRewriteSchema(BaseModel):
    source: EvidenceSchema
    suggestion: str = Field(description="A truthful rewrite using only details from source evidence; never invent metrics.")


class WorkSampleSchema(BaseModel):
    title: str = Field(description="A generic project name or role title, never an employer or person's name.")
    summary: str = Field(description="A short factual description supported by the cited source evidence.")
    technologies: list[str]
    checks: list[ReviewCheckSchema]
    bullet_rewrite: BulletRewriteSchema | None


class ResumeAnalysisSchema(BaseModel):
    is_resume: bool
    # Descriptions are supported by Gemini's minimal response schema; the
    # strict reply model below remains the enforcement boundary.
    summary: str = Field(description="A concise evidence-led overview without personal details, at most 350 characters.")
    evaluations: list[EvaluationSchema]
    recommendations: list[RecommendationSchema]
    skill_roadmap: list[SkillRoadmapSchema]
    project_reviews: list[WorkSampleSchema]
    experience_reviews: list[WorkSampleSchema]


# --- Strict validated reply ---------------------------------------------------

_Strict = ConfigDict(extra="forbid", strict=True)
Quote = _text(MAX_QUOTE_CHARS)
Note = _text(120)


class _ReplyBase(BaseModel):
    model_config = _Strict


class Evidence(_ReplyBase):
    source: Literal["resume_text"]
    page: int = Field(ge=1)
    quote: Quote = Field(min_length=MIN_QUOTE_CHARS)


class Evaluation(_ReplyBase):
    criterion_id: _text(40)
    found: bool
    evidence: list[Evidence] = Field(max_length=4)
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
    note: _text(110)


class BulletRewrite(_ReplyBase):
    source: Evidence
    suggestion: _text(220)


class WorkSampleReview(_ReplyBase):
    title: _text(60)
    summary: _text(150)
    technologies: list[_text(30)] = Field(max_length=6)
    checks: list[ReviewCheck] = Field(max_length=9)
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
    return {
        "page": page_number,
        "quote_chars": len(quote),
        "page_chars": len(page),
        "quote_tokens": len(_normalized_tokens(quote)),
        "page_tokens": len(_normalized_tokens(page)),
        "quote_normalized_sha256": hashlib.sha256(quote_normalized.encode()).hexdigest()[:12],
        "page_normalized_sha256": hashlib.sha256(page_normalized.encode()).hexdigest()[:12],
        "contiguous_word_match": False,
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


def parse_resume_reply(text: str, rubric: dict, pages: list[str], step_positions: list[int] | int,
                       debug_capture: _ResumeDebugCapture | None = None) -> tuple[dict, dict]:
    """Validate evidence citations and exact criterion coverage; never score."""
    data = load_strict_json(text, MAX_REPLY_CHARS)
    _split_verified_section_headings(data, pages)
    _compact_verified_quotes(data, pages)
    try:
        reply = ResumeReply.model_validate(data)
    except ValidationError as error:
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
        if item.found and not item.evidence:
            raise AIOutputError("schema", f"evaluations.{index}.evidence:required")
        if not item.found and item.evidence:
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
                quote_tokens = normalized_quote.split()
                page_tokens = normalized_page.split()
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
                    "first_mismatch": _first_sequence_mismatch(quote_tokens, page_tokens),
                })
            if not matches:
                logger.warning(
                    "RÃ©sumÃ© citation could not be verified: %s",
                    _citation_mismatch_diagnostic(citation.quote, page, citation.page),
                )
                raise AIOutputError("schema", f"evaluations.{index}.evidence.{citation_index}.quote:not_in_source")
        if contains_contact_details(item.note):
            raise AIOutputError("personal_data", f"evaluations.{index}.note")
        evaluation_map[item.criterion_id] = {
            "found": item.found,
            "evidence": [citation.model_dump() for citation in item.evidence],
            "note": item.note,
        }

    project_reviews = _validate_work_samples(reply.project_reviews, "project", pages, debug_capture)
    experience_reviews = _validate_work_samples(reply.experience_reviews, "experience", pages, debug_capture)

    recommendation_ids = {item.criterion_id for item in reply.evaluations if not item.found}
    known_ids = expected_ids
    safe_recommendations = []
    excluded_reference_count = 0
    for recommendation in reply.recommendations:
        safe_ids = [criterion_id for criterion_id in recommendation.criterion_ids
                    if criterion_id in known_ids and criterion_id in recommendation_ids]
        excluded_reference_count += len(recommendation.criterion_ids) - len(safe_ids)
        if safe_ids:
            recommendation.criterion_ids = safe_ids
            safe_recommendations.append(recommendation)
    reply.recommendations = safe_recommendations
    if excluded_reference_count:
        logger.warning("Resume recommendation references excluded: %d", excluded_reference_count)
    for index, recommendation in enumerate(reply.recommendations):
        if contains_contact_details(recommendation.title) or contains_contact_details(recommendation.action):
            raise AIOutputError("personal_data", f"recommendations.{index}")

    skill_ids = {criterion["id"] for category in rubric["categories"]
                 if category["id"] == "skills" for criterion in category["criteria"]}
    roadmap_skill_ids = [item.skill_id for item in reply.skill_roadmap]
    if len(roadmap_skill_ids) != len(set(roadmap_skill_ids)) or set(roadmap_skill_ids) != skill_ids:
        raise AIOutputError("schema", "skill_roadmap:skill_set_mismatch")
    allowed_positions = _allowed_roadmap_positions(step_positions)
    for index, item in enumerate(reply.skill_roadmap):
        if any(position not in allowed_positions for position in item.step_positions):
            raise AIOutputError("schema", f"skill_roadmap.{index}.step_positions:out_of_range")

    for field, value in (("summary", reply.summary),):
        if contains_contact_details(value):
            raise AIOutputError("personal_data", field)

    result = reply.model_dump()
    result["evaluations_by_id"] = evaluation_map
    result["project_reviews_by_item"] = project_reviews
    result["experience_reviews_by_item"] = experience_reviews
    diagnostics = {
        "strategy": "evidence_checked",
        "items": (len(reply.evaluations) + len(reply.recommendations)
                  + sum(len(item.checks) for item in reply.project_reviews + reply.experience_reviews)),
        "dropped": [],
    }
    return result, diagnostics


def _validate_work_samples(items: list[WorkSampleReview], kind: str, pages: list[str],
                           debug_capture: _ResumeDebugCapture | None) -> list[dict]:
    """Verify every per-project/job claim before allowing it to affect its score."""
    expected = _PROJECT_CHECK_IDS if kind == "project" else _EXPERIENCE_CHECK_IDS
    for item_index, item in enumerate(items):
        path = f"{kind}_reviews.{item_index}"
        if any(contains_contact_details(value) for value in (item.title, item.summary)):
            raise AIOutputError("personal_data", path)
        check_ids = [check.criterion_id for check in item.checks]
        if len(check_ids) != len(set(check_ids)) or set(check_ids) != expected:
            raise AIOutputError("schema", f"{path}.checks:criterion_set_mismatch")
        for check_index, check in enumerate(item.checks):
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
                        ),
                    })
                if not matches:
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
                raise AIOutputError("schema", f"{rewrite_path}.source.quote:not_in_source")
            suggestion = item.bullet_rewrite.suggestion
            if contains_contact_details(suggestion):
                raise AIOutputError("personal_data", f"{rewrite_path}.suggestion")
            source_numbers = set(re.findall(r"\d+(?:[.,]\d+)?%?", source.quote))
            suggested_numbers = set(re.findall(r"\d+(?:[.,]\d+)?%?", suggestion))
            if not suggested_numbers <= source_numbers:
                raise AIOutputError("schema", f"{rewrite_path}.suggestion:unsupported_metric")

    return [_work_sample_report(item, kind) for item in items]


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


def _compact_verified_quotes(data: object, pages: list[str]) -> None:
    """Shorten overlong model citations only to an independently verified excerpt.

    Gemini can occasionally return a valid full sentence beyond the display
    bound despite the prompt. A shorter prefix is accepted only when it is
    still a contiguous, non-identifying match on the cited page; the normal
    strict schema and citation verifier then run unchanged.
    """
    if not isinstance(data, dict):
        return
    citation_lists = []
    for evaluation in data.get("evaluations", []):
        if isinstance(evaluation, dict) and isinstance(evaluation.get("evidence"), list):
            citation_lists.append(evaluation["evidence"])
    for field in ("project_reviews", "experience_reviews"):
        for review in data.get(field, []) if isinstance(data.get(field, []), list) else []:
            if not isinstance(review, dict):
                continue
            for check in review.get("checks", []) if isinstance(review.get("checks", []), list) else []:
                if isinstance(check, dict) and isinstance(check.get("evidence"), list):
                    citation_lists.append(check["evidence"])
            rewrite = review.get("bullet_rewrite")
            if isinstance(rewrite, dict) and isinstance(rewrite.get("source"), dict):
                citation_lists.append([rewrite["source"]])
    for citations in citation_lists:
        for citation in citations:
            if not isinstance(citation, dict):
                continue
            quote, page_number = citation.get("quote"), citation.get("page")
            if not isinstance(quote, str) or len(quote) <= MAX_QUOTE_CHARS:
                continue
            if not isinstance(page_number, int) or isinstance(page_number, bool) or not 1 <= page_number <= len(pages):
                continue
            page = pages[page_number - 1]
            for end in range(min(MAX_QUOTE_CHARS, len(quote)), MIN_QUOTE_CHARS - 1, -1):
                if end < len(quote) and not quote[end].isspace() and not quote[end - 1].isspace():
                    continue
                candidate = quote[:end].rstrip()
                if (len(candidate) >= MIN_QUOTE_CHARS
                        and not contains_contact_details(candidate)
                        and _quote_matches_source(candidate, page)):
                    citation["quote"] = candidate
                    break


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
        raw_lines = [line.strip().strip("`*_#>-• ") for line in citation["quote"].splitlines()]
        if not 2 <= len(raw_lines) <= 4 or any(not line for line in raw_lines):
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


def _allowed_roadmap_positions(positions: list[int] | int) -> list[int]:
    """Return saved roadmap identifiers; integer input preserves test/legacy callers."""
    if isinstance(positions, int) and not isinstance(positions, bool):
        return list(range(1, positions + 1))
    return list(dict.fromkeys(positions))


def _gemini_response_schema(step_positions: list[int] | int, criterion_ids: list[str] | None = None) -> dict:
    """Bound step identifiers to the saved roadmap's numeric range."""
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
    schema["$defs"]["EvaluationSchema"]["properties"]["evidence"]["maxItems"] = 4
    schema["$defs"]["ReviewCheckSchema"]["properties"]["evidence"]["maxItems"] = 1
    if criterion_ids is not None:
        schema["$defs"]["RecommendationSchema"]["properties"]["criterion_ids"]["items"]["enum"] = list(
            dict.fromkeys(criterion_ids)
        )
    allowed_positions = _allowed_roadmap_positions(step_positions)
    if allowed_positions:
        position_schema = schema["$defs"]["SkillRoadmapSchema"]["properties"]["step_positions"]["items"]
        position_schema["minimum"] = min(allowed_positions)
        position_schema["maximum"] = max(allowed_positions)
    return schema


def _compact_report_evidence(evaluations: dict) -> dict:
    """Keep one verified excerpt per criterion (four section labels for headings).

    All model citations have already passed source and privacy checks. The UI
    needs one representative excerpt for each scored finding; conventional
    section formatting keeps up to four distinct heading excerpts.
    """
    compacted = {}
    for criterion_id, evaluation in evaluations.items():
        evidence = evaluation["evidence"]
        limit = 4 if criterion_id == "standard_sections" else 1
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


def analyze_resume(pdf: bytes, career: str, skills, steps) -> dict:
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
    prompt = build_resume_evidence_prompt(career, rubric, roadmap_steps, pages)
    contents = [genai_types.Part.from_bytes(data=bytes(pdf), mime_type="application/pdf"), prompt]

    def corrective_contents(error: AIOutputError):
        if error.kind not in {"empty", "invalid_json", "not_object", "schema", "too_large"}:
            return None
        allowed_positions = [step["position"] for step in roadmap_steps]
        correction = f"""

Corrective retry: Your previous JSON was rejected by strict validation at `{error.detail}`. Generate a new complete JSON response from the source material; do not copy invalid fields from your prior response.
For any evidence quote, copy one uninterrupted, contiguous 3-160 character substring from exactly the cited page's resume_pages_json text. Never join separate headings, bullets, or phrases across omitted text. Put distinct noncontiguous supporting spans into separate evidence entries (maximum four); if no safe contiguous excerpt exists, mark that criterion false with an empty evidence list.
For project_reviews and experience_reviews, each individual check's evidence array is limited to zero or one excerpt. Select the single best contiguous source span; do not return multiple evidence entries for a check. If no single span supports it, mark the check false with an empty list.
For every skill_roadmap.step_positions array, use only these saved roadmap positions: {json.dumps(allowed_positions)}. Do not renumber them or assume they start at 1; use [] when no listed step applies.
Keep the summary, notes, recommendation title/action, and arrays within every stated limit."""
        return [contents[0], prompt + correction]

    reply = llm.generate(
        contents,
        "resume",
        _gemini_response_schema(
            [step["position"] for step in roadmap_steps],
            ai_criterion_ids,
        ),
        lambda text: parse_resume_reply(
            text, rubric, pages, [step["position"] for step in roadmap_steps], debug_capture
        ),
        system_instruction=RESUME_SYSTEM_INSTRUCTION,
        temperature=0,
        max_output_tokens=MAX_OUTPUT_TOKENS,
        retry_on_validation_error=False,
        validation_retry_contents=corrective_contents,
        on_response=debug_capture.save_response if debug_capture is not None else None,
    )
    if not reply.pop("is_resume"):
        raise ResumeInputError("not_resume")

    evaluations = reply.pop("evaluations_by_id")
    skill_roadmap = {item["skill_id"]: item["step_positions"] for item in reply["skill_roadmap"]}
    score_report = build_score_report(
        rubric, _compact_report_evidence(evaluations), reply["recommendations"], roadmap_steps, skill_roadmap,
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
