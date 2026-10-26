"""Assemble verified analyzer and retrieval context for grounded coaching."""

from __future__ import annotations

import hashlib
from copy import deepcopy
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from rag.models import GuidanceSection, RetrievedGuidance, normalized_text


def _criterion_ids(values):
    return GuidanceSection.valid_criteria(values)


def _clean(value):
    cleaned = normalized_text(value)
    if not cleaned:
        raise ValueError("must not be blank")
    return cleaned


class VerifiedResumeCitation(BaseModel):
    """A citation already verified by the deterministic analyzer."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    criterion_id: str
    page: int = Field(ge=1, le=10)
    quote: str = Field(min_length=3, max_length=320)

    @field_validator("criterion_id")
    @classmethod
    def valid_criterion(cls, value):
        return _criterion_ids((value,))[0]

    @field_validator("quote", mode="before")
    @classmethod
    def clean_quote(cls, value):
        return _clean(value)


class TopImprovement(BaseModel):
    """A deterministic recommendation selected by the existing score report."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    title: str = Field(min_length=1, max_length=120)
    action: str = Field(min_length=1, max_length=300)
    criterion_ids: tuple[str, ...] = Field(min_length=1, max_length=4)

    @field_validator("title", "action", mode="before")
    @classmethod
    def clean_copy(cls, value):
        return _clean(value)

    @field_validator("criterion_ids")
    @classmethod
    def valid_criteria(cls, values):
        return _criterion_ids(values)


class CoachingPromptInput(BaseModel):
    """The narrow, verified boundary accepted by the prompt builder."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    target_role: str = Field(min_length=1, max_length=100)
    target_level: Literal["internship", "entry_level"]
    ats_score: int = Field(ge=0, le=100)
    readiness_score: int = Field(ge=0, le=100)
    verified_resume_citations: tuple[VerifiedResumeCitation, ...] = Field(min_length=1, max_length=40)
    top_improvements: tuple[TopImprovement, ...] = Field(min_length=1, max_length=3)
    retrieved_guidance: tuple[RetrievedGuidance, ...] = Field(min_length=1, max_length=10)

    @field_validator("target_role", mode="before")
    @classmethod
    def clean_role(cls, value):
        return _clean(value)


class PromptEvidence(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    id: str = Field(min_length=12, max_length=64)
    criterion_id: str
    page: int = Field(ge=1, le=10)
    quote: str = Field(min_length=3, max_length=320)


class PromptGuidance(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    id: str = Field(min_length=12, max_length=64)
    source: str = Field(min_length=1, max_length=160)
    title: str = Field(min_length=1, max_length=160)
    section: str = Field(min_length=1, max_length=120)
    topic: str = Field(min_length=1, max_length=120)
    criterion_ids: tuple[str, ...] = Field(min_length=1, max_length=12)
    role: str = Field(min_length=1, max_length=100)
    level: str = Field(min_length=1, max_length=20)
    version: str = Field(min_length=1, max_length=40)
    text: str = Field(min_length=1, max_length=1_000)
    retrieval_score: float = Field(ge=-1, le=1)


class CoachingObjective(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    criterion_id: str
    title: str = Field(min_length=1, max_length=120)
    action: str = Field(min_length=1, max_length=300)
    evidence_ids: tuple[str, ...] = Field(min_length=1, max_length=40)
    guidance_chunk_ids: tuple[str, ...] = Field(min_length=1, max_length=10)


class PromptScores(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    ats: int = Field(ge=0, le=100)
    readiness: int = Field(ge=0, le=100)


COACHING_OUTPUT_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["recommendations"],
    "properties": {
        "recommendations": {
            "type": "array",
            "minItems": 1,
            "maxItems": 3,
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["criterion_id", "advice", "evidence_ids", "guidance_chunk_ids"],
                "properties": {
                    "criterion_id": {"type": "string"},
                    "advice": {"type": "string", "maxLength": 400},
                    "evidence_ids": {"type": "array", "minItems": 1, "items": {"type": "string"}},
                    "guidance_chunk_ids": {"type": "array", "minItems": 1, "items": {"type": "string"}},
                },
            },
        },
    },
}

SYSTEM_INSTRUCTIONS = (
    "You are PathwayAI's resume coach. Use only the verified résumé evidence and retrieved guidance "
    "provided in this payload. Every recommendation must reference its criterion_id, one or more evidence_ids, "
    "and one or more guidance_chunk_ids. Do not calculate scores, infer missing facts, invent metrics or skills, "
    "or make claims beyond the listed evidence and guidance. State the specific problem visible in the evidence, "
    "why it matters to a reviewer, one concrete improvement, and the expected review or readability impact."
)
FORMATTING_INSTRUCTIONS = (
    "Return JSON only and match the required output schema exactly.",
    "Give concise, actionable, truthful guidance tailored to the cited resume excerpt; avoid generic filler.",
    "Use only IDs included in the prompt payload for citations.",
)


class CoachingPromptPayload(BaseModel):
    """JSON-serializable request ready for a later LLM adapter."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    system_instructions: str
    target_role: str
    target_level: Literal["internship", "entry_level"]
    scores: PromptScores
    verified_resume_evidence: tuple[PromptEvidence, ...] = Field(min_length=1)
    retrieved_guidance: tuple[PromptGuidance, ...] = Field(min_length=1)
    coaching_objectives: tuple[CoachingObjective, ...] = Field(min_length=1, max_length=12)
    formatting_instructions: tuple[str, ...] = Field(min_length=1)
    output_schema: dict

    @model_validator(mode="after")
    def objective_references_are_grounded(self):
        evidence_ids = {item.id for item in self.verified_resume_evidence}
        guidance_ids = {item.id for item in self.retrieved_guidance}
        for objective in self.coaching_objectives:
            if not set(objective.evidence_ids) <= evidence_ids:
                raise ValueError("coaching objective references unknown evidence")
            if not set(objective.guidance_chunk_ids) <= guidance_ids:
                raise ValueError("coaching objective references unknown guidance")
        return self


def _evidence_id(citation: VerifiedResumeCitation) -> str:
    source = f"{citation.criterion_id}|{citation.page}|{citation.quote}".encode("utf-8")
    return f"resume-{hashlib.sha256(source).hexdigest()[:16]}"


def build_coaching_prompt(data: CoachingPromptInput) -> CoachingPromptPayload:
    """Build a fail-closed, grounded coaching request without retrieval or generation."""
    evidence = tuple(PromptEvidence(
        id=_evidence_id(citation), criterion_id=citation.criterion_id,
        page=citation.page, quote=citation.quote,
    ) for citation in data.verified_resume_citations)
    guidance = tuple(PromptGuidance(
        id=item.chunk.id, source=item.chunk.source, title=item.chunk.title, section=item.chunk.section,
        topic=item.chunk.topic, criterion_ids=item.chunk.criterion_ids, role=item.chunk.role,
        level=item.chunk.level, version=item.chunk.version, text=item.chunk.text,
        retrieval_score=item.score,
    ) for item in data.retrieved_guidance)
    evidence_by_criterion = {}
    for item in evidence:
        evidence_by_criterion.setdefault(item.criterion_id, []).append(item.id)
    guidance_by_criterion = {}
    for item in guidance:
        for criterion_id in item.criterion_ids:
            guidance_by_criterion.setdefault(criterion_id, []).append(item.id)

    objectives = []
    for improvement in data.top_improvements:
        for criterion_id in improvement.criterion_ids:
            evidence_ids = tuple(dict.fromkeys(evidence_by_criterion.get(criterion_id, [])))
            guidance_ids = tuple(dict.fromkeys(guidance_by_criterion.get(criterion_id, [])))
            if evidence_ids and guidance_ids:
                objectives.append(CoachingObjective(
                    criterion_id=criterion_id, title=improvement.title, action=improvement.action,
                    evidence_ids=evidence_ids, guidance_chunk_ids=guidance_ids,
                ))
    if not objectives:
        raise ValueError("no grounded coaching objective is available")

    return CoachingPromptPayload(
        system_instructions=SYSTEM_INSTRUCTIONS,
        target_role=data.target_role,
        target_level=data.target_level,
        scores=PromptScores(ats=data.ats_score, readiness=data.readiness_score),
        verified_resume_evidence=evidence,
        retrieved_guidance=guidance,
        coaching_objectives=tuple(objectives),
        formatting_instructions=FORMATTING_INSTRUCTIONS,
        output_schema=deepcopy(COACHING_OUTPUT_SCHEMA),
    )
