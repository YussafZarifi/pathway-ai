"""Deterministic tests for the isolated résumé-guidance retrieval layer."""

import pytest
from pydantic import ValidationError

from rag.chunking import MAX_CHUNK_CHARS, chunk_documents
from rag.embeddings import DeterministicEmbeddingProvider
from rag.loaders import load_builtin_documents
from rag.models import GuidanceChunk, GuidanceDocument, GuidanceSection, RetrievedGuidance
from rag.retrieval import GuidanceRetriever, diversify_guidance


def document(*, collection="resume_best_practices", role="all", level="all", criteria=None,
             title="Project evidence", text="Use specific project evidence."):
    return GuidanceDocument(
        collection=collection,
        source="PathwayAI editorial guidance",
        title=title,
        version="v1",
        role=role,
        level=level,
        sections=[GuidanceSection(
            title="Projects", topic="project evidence",
            criterion_ids=criteria or ["project_impact"], text=text,
        )],
    )


def test_builtin_documents_cover_each_guidance_collection_and_chunk_metadata():
    chunks = chunk_documents(load_builtin_documents())

    assert {chunk.collection for chunk in chunks} == {
        "resume_best_practices", "ats_guidance", "entry_level_role_rubrics", "internship_role_rubrics",
    }
    assert all(chunk.source and chunk.title and chunk.section and chunk.topic for chunk in chunks)
    assert all(chunk.criterion_ids and chunk.version for chunk in chunks)
    assert all(len(chunk.text) <= MAX_CHUNK_CHARS for chunk in chunks)


def test_chunking_splits_oversized_sections_without_losing_metadata():
    chunks = chunk_documents([document(text=("Measure the outcome with a truthful result. " * 80))])

    assert len(chunks) > 1
    assert all(chunk.criterion_ids == ("project_impact",) for chunk in chunks)
    assert all(len(chunk.text) <= MAX_CHUNK_CHARS for chunk in chunks)


def test_chunking_never_emits_an_oversized_unbroken_token():
    chunks = chunk_documents([document(text="x" * (MAX_CHUNK_CHARS + 50))])

    assert all(len(chunk.text) <= MAX_CHUNK_CHARS for chunk in chunks)


def test_document_metadata_requires_a_source_title_section_topic_and_criterion():
    with pytest.raises(ValidationError):
        GuidanceDocument(
            collection="resume_best_practices", source="", title="", version="v1", role="all", level="all",
            sections=[GuidanceSection(title="", topic="", criterion_ids=[], text="Guidance")],
        )


def test_deterministic_embeddings_are_repeatable_and_normalized():
    provider = DeterministicEmbeddingProvider(dimensions=64)

    first = provider.embed_documents(["project impact metrics"])[0]
    second = provider.embed_query("project impact metrics")

    assert first == second
    assert len(first) == 64
    assert sum(value * value for value in first) == pytest.approx(1.0)


def test_retrieval_ranks_matching_guidance_and_filters_role_and_level():
    retriever = GuidanceRetriever.from_documents([
        document(role="Data Analyst", level="entry_level", criteria=["project_impact"],
                 title="Data project impact", text="Quantify dashboard accuracy and reporting time saved."),
        document(role="Software Engineer", level="entry_level", criteria=["project_impact"],
                 title="Software project impact", text="Quantify deployment reliability and latency."),
        document(role="Data Analyst", level="internship", criteria=["project_impact"],
                 title="Internship project impact", text="Describe the class project outcome."),
    ], DeterministicEmbeddingProvider(dimensions=128))

    results = retriever.retrieve(
        criterion_ids=["project_impact"], target_level="entry_level", target_role="Data Analyst",
    )

    assert [item.chunk.title for item in results] == ["Data project impact"]
    assert results[0].score > 0


def test_retrieval_accepts_general_guidance_for_each_level_but_never_wrong_criterion():
    retriever = GuidanceRetriever.from_documents([
        document(level="all", criteria=["project_impact"], title="General impact",
                 text="Describe a truthful, measurable result."),
        document(level="entry_level", criteria=["project_deployment"], title="Deployment",
                 text="Name the hosted environment."),
    ], DeterministicEmbeddingProvider(dimensions=128))

    results = retriever.retrieve(
        criterion_ids=["project_impact"], target_level="internship", target_role="Data Analyst",
    )

    assert [item.chunk.title for item in results] == ["General impact"]


def test_diversification_prefers_distinct_guidance_topics_before_near_duplicates():
    def result(chunk_id, topic, score):
        return RetrievedGuidance(chunk=GuidanceChunk(
            id=chunk_id, collection="resume_best_practices", source="PathwayAI editorial guidance",
            title=topic, section="Projects", topic=topic, criterion_ids=["project_impact"],
            role="all", level="all", version="v1", text=f"Concrete {topic} guidance.",
        ), score=score)

    selected = diversify_guidance([
        result("guidance-one", "measurable impact", 0.95),
        result("guidance-two", "measurable impact", 0.90),
        result("guidance-three", "project outcome", 0.80),
    ], limit=2)

    assert [item.chunk.id for item in selected] == ["guidance-one", "guidance-three"]
