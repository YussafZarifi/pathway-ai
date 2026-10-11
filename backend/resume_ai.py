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
import re
import unicodedata
from typing import Literal

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
MIN_EXTRACTED_TEXT_CHARS = 300
MAX_EXTRACTED_TEXT_CHARS = 30_000
MAX_PAGE_CONTENT_BYTES = 600_000

MAX_REPLY_CHARS = 30_000
# resume_analyses.analysis is limited to 16,384 bytes in the database; keep a margin.
MAX_ANALYSIS_BYTES = 16_000
MAX_OUTPUT_TOKENS = 8192
MIN_QUOTE_CHARS = 3

logger = logging.getLogger("pathwayai.resume_ai")

_CONTACT_EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
_CONTACT_PHONE = re.compile(r"(?<!\w)(?:\+\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]\d{4}(?!\w)")
_STATIC_CRITERIA = {"contact_information", "text_parseability"}


class ResumeInputError(Exception):
    """The upload can't be analyzed; `kind` contains no user data."""

    def __init__(self, kind: str):
        super().__init__(kind)
        self.kind = kind


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

    if not pages or sum(len(page.strip()) for page in pages) < MIN_EXTRACTED_TEXT_CHARS:
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


class ResumeAnalysisSchema(BaseModel):
    is_resume: bool
    # Descriptions are supported by Gemini's minimal response schema; the
    # strict reply model below remains the enforcement boundary.
    summary: str = Field(description="A concise evidence-led overview without personal details, at most 350 characters.")
    evaluations: list[EvaluationSchema]
    recommendations: list[RecommendationSchema]
    skill_roadmap: list[SkillRoadmapSchema]


# --- Strict validated reply ---------------------------------------------------

_Strict = ConfigDict(extra="forbid", strict=True)
Quote = _text(160)
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
    evidence: list[Evidence] = Field(max_length=1)
    note: Note


class Recommendation(_ReplyBase):
    title: _text(80)
    action: _text(180)
    criterion_ids: list[_text(40)] = Field(min_length=1, max_length=4)


class SkillRoadmap(_ReplyBase):
    skill_id: _text(20)
    step_positions: list[int] = Field(max_length=5)


class ResumeReply(_ReplyBase):
    is_resume: bool
    summary: _text(350)
    evaluations: list[Evaluation] = Field(max_length=40)
    recommendations: list[Recommendation] = Field(max_length=5)
    skill_roadmap: list[SkillRoadmap] = Field(max_length=8)


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
            "found": True,
            "evidence": [{"source": "document_check", "page": None, "quote": None}],
            "note": f"Selectable text extracted from {len(pages)} PDF page(s).",
        },
    }


def parse_resume_reply(text: str, rubric: dict, pages: list[str], step_count: int) -> tuple[dict, dict]:
    """Validate evidence citations and exact criterion coverage; never score."""
    data = load_strict_json(text, MAX_REPLY_CHARS)
    try:
        reply = ResumeReply.model_validate(data)
    except ValidationError as error:
        raise AIOutputError("schema", error_summary(error, _KNOWN_FIELDS)) from None

    if not reply.is_resume:
        if reply.evaluations or reply.recommendations or reply.skill_roadmap:
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
            if not _quote_matches_source(citation.quote, page):
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

    recommendation_ids = {item.criterion_id for item in reply.evaluations if not item.found}
    known_ids = expected_ids
    for index, recommendation in enumerate(reply.recommendations):
        if not set(recommendation.criterion_ids) <= known_ids:
            raise AIOutputError("schema", f"recommendations.{index}.criterion_ids:unknown")
        if not set(recommendation.criterion_ids) <= recommendation_ids:
            raise AIOutputError("schema", f"recommendations.{index}.criterion_ids:not_missing")
        if contains_contact_details(recommendation.title) or contains_contact_details(recommendation.action):
            raise AIOutputError("personal_data", f"recommendations.{index}")

    skill_ids = {criterion["id"] for category in rubric["categories"]
                 if category["id"] == "skills" for criterion in category["criteria"]}
    roadmap_skill_ids = [item.skill_id for item in reply.skill_roadmap]
    if len(roadmap_skill_ids) != len(set(roadmap_skill_ids)) or set(roadmap_skill_ids) != skill_ids:
        raise AIOutputError("schema", "skill_roadmap:skill_set_mismatch")
    for index, item in enumerate(reply.skill_roadmap):
        if any(position < 1 or position > step_count for position in item.step_positions):
            raise AIOutputError("schema", f"skill_roadmap.{index}.step_positions:out_of_range")

    for field, value in (("summary", reply.summary),):
        if contains_contact_details(value):
            raise AIOutputError("personal_data", field)

    result = reply.model_dump()
    result["evaluations_by_id"] = evaluation_map
    diagnostics = {
        "strategy": "evidence_checked",
        "items": len(reply.evaluations) + len(reply.recommendations),
        "dropped": [],
    }
    return result, diagnostics


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
        "score_report": score_report,
    }


def analyze_resume(pdf: bytes, career: str, skills, steps) -> dict:
    """Analyze, cite, and score a résumé against the current PathwayAI roadmap."""
    check_pdf(pdf)
    pages = extract_resume_pages(pdf)
    rubric = rubric_for(career, skills)
    roadmap_steps = steps if steps and isinstance(steps[0], dict) else [
        {"position": index, "title": title, "description": "", "tasks": [], "completed": False}
        for index, title in enumerate(steps or [], start=1)
    ]
    prompt = build_resume_evidence_prompt(career, rubric, roadmap_steps, pages)
    contents = [genai_types.Part.from_bytes(data=bytes(pdf), mime_type="application/pdf"), prompt]

    def corrective_contents(error: AIOutputError):
        if error.kind not in {"empty", "invalid_json", "not_object", "schema", "too_large"}:
            return None
        correction = """

Corrective retry: Generate a new JSON response from the source material, not a revision of your prior answer. Every evidence quote must be a verbatim, contiguous excerpt of 3-160 characters from its stated page. If no such non-identifying excerpt exists, set that criterion to false with an empty evidence list. Keep the summary, notes, recommendation title/action, and arrays within every stated limit."""
        return [contents[0], prompt + correction]

    reply = llm.generate(
        contents,
        "resume",
        ResumeAnalysisSchema,
        lambda text: parse_resume_reply(text, rubric, pages, len(roadmap_steps)),
        system_instruction=RESUME_SYSTEM_INSTRUCTION,
        temperature=0,
        max_output_tokens=MAX_OUTPUT_TOKENS,
        retry_on_validation_error=False,
        validation_retry_contents=corrective_contents,
    )
    if not reply.pop("is_resume"):
        raise ResumeInputError("not_resume")

    evaluations = reply.pop("evaluations_by_id")
    skill_roadmap = {item["skill_id"]: item["step_positions"] for item in reply["skill_roadmap"]}
    score_report = build_score_report(
        rubric, evaluations, reply["recommendations"], roadmap_steps, skill_roadmap,
        sum(len(page) for page in pages), len(pages),
    )
    analysis = _legacy_analysis(reply, rubric, score_report, evaluations)
    size = len(json.dumps(analysis, ensure_ascii=False).encode("utf-8"))
    if size > MAX_ANALYSIS_BYTES:
        raise AIOutputError("too_large", f"analysis {size} bytes")
    return {
        "analysis": analysis,
        "career": " ".join(str(career).split())[:100],
        "prompt_version": PROMPT_VERSION,
        "model": config.GEMINI_MODEL,
    }
