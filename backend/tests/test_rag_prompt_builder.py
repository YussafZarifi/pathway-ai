"""Deterministic contracts for RAG coaching-prompt assembly."""

import pytest
from pydantic import ValidationError

from rag.embeddings import DeterministicEmbeddingProvider
from rag.langchain_retriever import LangChainRetriever
from rag.models import GuidanceChunk, GuidanceDocument, GuidanceSection, RetrievedGuidance
from rag.prompt_builder import (
    CoachingObjective, CoachingPromptInput, CoachingPromptPayload, TopImprovement,
    VerifiedResumeCitation, build_coaching_prompt,
)
from rag.retrieval import GuidanceRetriever


def guidance(*, criterion_ids=("project_impact",), chunk_id="guidance-impact"):
    return RetrievedGuidance(
        chunk=GuidanceChunk(
            id=chunk_id, collection="resume_best_practices", source="PathwayAI editorial guidance",
            title="Resume project evidence", section="Project outcomes", topic="measurable impact",
            criterion_ids=criterion_ids, role="all", level="all", version="v1",
            text="Describe a truthful, observable project result.",
        ),
        score=0.82,
    )


def prompt_input(*, retrieved=None):
    return CoachingPromptInput(
        target_role="Data Analyst", target_level="entry_level", ats_score=72, readiness_score=61,
        verified_resume_citations=[VerifiedResumeCitation(
            criterion_id="project_impact", page=2, quote="Built a dashboard for weekly reporting.",
        )],
        top_improvements=[TopImprovement(
            title="Add measurable project impact", action="Add a truthful result or observed improvement.",
            criterion_ids=["project_impact"],
        )],
        retrieved_guidance=retrieved or [guidance()],
    )


def test_prompt_builder_assembles_only_verified_grounded_context():
    payload = build_coaching_prompt(prompt_input())

    assert payload.target_role == "Data Analyst"
    assert payload.target_level == "entry_level"
    assert payload.scores.ats == 72 and payload.scores.readiness == 61
    assert payload.verified_resume_evidence[0].page == 2
    assert payload.retrieved_guidance[0].source == "PathwayAI editorial guidance"
    assert payload.retrieved_guidance[0].version == "v1"
    assert payload.coaching_objectives[0].criterion_id == "project_impact"
    assert payload.coaching_objectives[0].evidence_ids == (payload.verified_resume_evidence[0].id,)
    assert payload.coaching_objectives[0].guidance_chunk_ids == ("guidance-impact",)
    assert "verified résumé evidence" in payload.system_instructions
    assert payload.output_schema["required"] == ["recommendations"]


def test_prompt_builder_omits_improvements_without_both_grounding_sources():
    data = prompt_input(retrieved=[guidance(criterion_ids=("project_deployment",), chunk_id="guidance-deployment")])

    with pytest.raises(ValueError, match="grounded coaching objective"):
        build_coaching_prompt(data)


def test_prompt_builder_preserves_multiple_evidence_and_guidance_references_per_criterion():
    data = prompt_input(retrieved=[guidance(chunk_id="guidance-one"), guidance(chunk_id="guidance-two")])
    data = data.model_copy(update={
        "verified_resume_citations": data.verified_resume_citations + (VerifiedResumeCitation(
            criterion_id="project_impact", page=3, quote="Presented reporting results to stakeholders.",
        ),),
    })

    objective = build_coaching_prompt(data).coaching_objectives[0]

    assert len(objective.evidence_ids) == 2
    assert objective.guidance_chunk_ids == ("guidance-one", "guidance-two")


@pytest.mark.parametrize("retriever_type", [GuidanceRetriever, LangChainRetriever])
def test_prompt_builder_accepts_the_shared_native_or_langchain_retrieval_result(retriever_type):
    documents = [GuidanceDocument(
        collection="resume_best_practices", source="PathwayAI editorial guidance", title="Impact guidance",
        version="v1", role="all", level="all", sections=[GuidanceSection(
            title="Project outcomes", topic="measurable impact", criterion_ids=["project_impact"],
            text="Describe a truthful, observable project result.",
        )],
    )]
    retriever = retriever_type.from_documents(documents, DeterministicEmbeddingProvider(dimensions=64))
    retrieved = retriever.retrieve(
        criterion_ids=["project_impact"], target_level="entry_level", target_role="Data Analyst",
    )

    payload = build_coaching_prompt(prompt_input(retrieved=retrieved))

    assert payload.coaching_objectives[0].guidance_chunk_ids == (retrieved[0].chunk.id,)


def test_prompt_payload_rejects_objectives_that_reference_unknown_context():
    payload = build_coaching_prompt(prompt_input())
    bad_objective = CoachingObjective(
        criterion_id="project_impact", title="Impact", action="Add a result.",
        evidence_ids=("resume-missing",), guidance_chunk_ids=("guidance-impact",),
    )
    invalid_payload = payload.model_dump()
    invalid_payload["coaching_objectives"] = (bad_objective,)

    with pytest.raises(ValidationError, match="unknown evidence"):
        CoachingPromptPayload(**invalid_payload)


def test_prompt_input_rejects_raw_resume_text_and_invalid_citations():
    with pytest.raises(ValidationError):
        CoachingPromptInput(**prompt_input().model_dump(), raw_resume_text="must not be accepted")
    with pytest.raises(ValidationError):
        VerifiedResumeCitation(criterion_id="project_impact", page=0, quote="too short")
