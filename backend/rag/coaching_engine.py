"""Validated model boundary for future grounded résumé coaching."""

from __future__ import annotations

import json
import re
from typing import Literal, Protocol

from google.genai import errors as genai_errors
from google.genai import types as genai_types
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator

import config
import llm
from rag.prompt_builder import CoachingPromptPayload, PromptEvidence, PromptGuidance


class CoachingModel(Protocol):
    """The only model boundary used by ``CoachingEngine``."""

    def generate(self, payload: CoachingPromptPayload) -> str: ...


class CoachingModelError(Exception):
    """Safe provider failure classification; no response or prompt data is retained."""

    def __init__(self, code: Literal["unavailable", "failed"]):
        super().__init__(code)
        self.code = code


class CoachingValidationError(Exception):
    """Structured, content-free reason a model response was rejected."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


class _ModelCoachingItem(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    criterion_id: str = Field(min_length=1, max_length=64)
    title: str = Field(min_length=1, max_length=120)
    problem: str = Field(min_length=1, max_length=300)
    why_it_matters: str = Field(min_length=1, max_length=400)
    improve_by: str = Field(min_length=1, max_length=400)
    expected_impact: str = Field(min_length=1, max_length=300)
    suggested_rewrite: str | None = Field(default=None, min_length=1, max_length=500)
    resume_citation_ids: tuple[str, ...] = Field(min_length=1, max_length=40)
    guidance_chunk_ids: tuple[str, ...] = Field(min_length=1, max_length=10)
    confidence: Literal["low", "medium", "high"]


class _ModelCoachingResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    items: tuple[_ModelCoachingItem, ...] = Field(min_length=1, max_length=3)

    @model_validator(mode="after")
    def unique_criteria(self):
        if len({item.criterion_id for item in self.items}) != len(self.items):
            raise ValueError("criteria must be unique")
        return self


COACHING_RESPONSE_SCHEMA = _ModelCoachingResponse.model_json_schema()


class CoachingItem(BaseModel):
    """Validated coaching returned to production callers, with resolved citations."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    criterion_id: str
    title: str
    problem: str
    why_it_matters: str
    improve_by: str
    expected_impact: str
    suggested_rewrite: str | None
    resume_citations: tuple[PromptEvidence, ...]
    guidance_citations: tuple[PromptGuidance, ...]
    confidence: Literal["low", "medium", "high"]


class CoachingResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    items: tuple[CoachingItem, ...] = Field(min_length=1, max_length=3)


class GeminiCoachingModel:
    """Gemini transport used only when a future caller explicitly constructs it."""

    def generate(self, payload: CoachingPromptPayload) -> str:
        if llm.client is None:
            raise CoachingModelError("unavailable")
        request = payload.model_dump(exclude={"system_instructions", "formatting_instructions", "output_schema"})
        try:
            response = llm.client.models.generate_content(
                model=config.GEMINI_MODEL,
                contents=json.dumps(request, ensure_ascii=False),
                config=genai_types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=COACHING_RESPONSE_SCHEMA,
                    system_instruction="\n".join((payload.system_instructions, *payload.formatting_instructions)),
                    temperature=0,
                    max_output_tokens=2_048,
                    automatic_function_calling=genai_types.AutomaticFunctionCallingConfig(disable=True),
                    http_options=genai_types.HttpOptions(
                        timeout=config.RAG_COACHING_TIMEOUT_SECONDS * 1000,
                    ),
                ),
            )
        except (genai_errors.APIError, TimeoutError, OSError):
            raise CoachingModelError("failed") from None
        except Exception:  # An SDK error can contain sensitive request context.
            raise CoachingModelError("failed") from None
        return response.text or ""


_TECHNOLOGY_TERMS = frozenset({
    "aws", "azure", "docker", "fastapi", "flask", "gcp", "java", "javascript", "kubernetes",
    "mongodb", "node", "postgresql", "python", "react", "sql", "tableau", "terraform", "typescript",
})
_METRIC = re.compile(r"(?<![\w.])\d+(?:\.\d+)?%")
_EMPLOYMENT_CLAIM = re.compile(
    r"\b(?:Worked|Interned|Employed|Served)\s+(?:at|for)\s+([A-Z][\w&.-]*(?:\s+[A-Z][\w&.-]*){0,3})"
)
_SUPPORT_STOP_WORDS = frozenset({
    "about", "advice", "after", "also", "and", "are", "before", "can", "could", "for", "from",
    "have", "into", "is", "its", "more", "not", "or", "that", "the", "their", "this", "to", "use",
    "with", "would", "your",
})


def _item_text(item: _ModelCoachingItem) -> str:
    return " ".join(filter(None, (
        item.title, item.problem, item.why_it_matters, item.improve_by, item.expected_impact,
        item.suggested_rewrite,
    )))


def _unsupported_claim(item: _ModelCoachingItem, evidence: tuple[PromptEvidence, ...]) -> bool:
    """Reject source-specific claims not present in the cited résumé evidence."""
    output = _item_text(item)
    source = " ".join(citation.quote for citation in evidence).casefold()
    words = set(re.findall(r"[a-z0-9+#.-]+", output.casefold()))
    if any(term in words and term not in source for term in _TECHNOLOGY_TERMS):
        return True
    if any(match.group(0).casefold() not in source for match in _METRIC.finditer(output)):
        return True
    return any(match.group(0).casefold() not in source for match in _EMPLOYMENT_CLAIM.finditer(output))


def _has_grounded_copy(item: _ModelCoachingItem, evidence: tuple[PromptEvidence, ...],
                        guidance: tuple[PromptGuidance, ...], objective) -> bool:
    """Require every coaching field to connect to its cited, deterministic context."""
    source = " ".join((
        *(citation.quote for citation in evidence),
        *(f"{chunk.title} {chunk.section} {chunk.topic} {chunk.text}" for chunk in guidance),
        objective.title,
        objective.action,
    ))
    supported = {
        token for token in re.findall(r"[a-z]+", source.casefold())
        if len(token) >= 4 and token not in _SUPPORT_STOP_WORDS
    }
    for value in (item.title, item.problem, item.why_it_matters, item.improve_by,
                  item.expected_impact, item.suggested_rewrite):
        terms = {
            token for token in re.findall(r"[a-z]+", (value or "").casefold())
            if len(token) >= 4 and token not in _SUPPORT_STOP_WORDS
        }
        if terms and not terms.intersection(supported):
            return False
    return True


class CoachingEngine:
    """Generate and validate coaching without changing the analyzer's facts or scores."""

    def __init__(self, model: CoachingModel):
        self._model = model

    def coach(self, payload: CoachingPromptPayload) -> CoachingResult:
        if not isinstance(payload, CoachingPromptPayload):
            raise TypeError("CoachingEngine accepts CoachingPromptPayload only")
        raw = self._model.generate(payload)
        try:
            parsed = json.loads(raw)
        except (TypeError, json.JSONDecodeError):
            raise CoachingValidationError("malformed_json") from None
        try:
            response = _ModelCoachingResponse.model_validate(parsed)
        except ValidationError:
            raise CoachingValidationError("invalid_schema") from None

        objectives = {item.criterion_id: item for item in payload.coaching_objectives}
        evidence_by_id = {item.id: item for item in payload.verified_resume_evidence}
        guidance_by_id = {item.id: item for item in payload.retrieved_guidance}
        items = []
        for item in response.items:
            objective = objectives.get(item.criterion_id)
            if objective is None:
                raise CoachingValidationError("unknown_criterion_id")
            allowed_evidence = set(objective.evidence_ids)
            allowed_guidance = set(objective.guidance_chunk_ids)
            if not set(item.resume_citation_ids) <= allowed_evidence:
                raise CoachingValidationError("invalid_resume_citation")
            if not set(item.guidance_chunk_ids) <= allowed_guidance:
                raise CoachingValidationError("invalid_guidance_citation")
            citations = tuple(evidence_by_id[citation_id] for citation_id in item.resume_citation_ids)
            guidance = tuple(guidance_by_id[chunk_id] for chunk_id in item.guidance_chunk_ids)
            if _unsupported_claim(item, citations):
                raise CoachingValidationError("unsupported_claim")
            if not _has_grounded_copy(item, citations, guidance, objective):
                raise CoachingValidationError("unsupported_recommendation")
            items.append(CoachingItem(
                criterion_id=item.criterion_id, title=item.title, problem=item.problem,
                why_it_matters=item.why_it_matters, improve_by=item.improve_by,
                expected_impact=item.expected_impact,
                suggested_rewrite=item.suggested_rewrite, resume_citations=citations,
                guidance_citations=guidance, confidence=item.confidence,
            ))
        return CoachingResult(items=tuple(items))
