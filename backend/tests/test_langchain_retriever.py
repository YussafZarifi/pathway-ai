"""Contract tests for the optional LangChain retrieval adapter."""

import pytest

import config
from rag.embeddings import DeterministicEmbeddingProvider
from rag.factory import build_guidance_retriever
from rag.langchain_retriever import LangChainRetriever
from rag.models import GuidanceDocument, GuidanceSection


def document(*, role="all", level="all", criteria=None, title="Project evidence", text="Use specific evidence."):
    return GuidanceDocument(
        collection="resume_best_practices", source="PathwayAI editorial guidance", title=title,
        version="v1", role=role, level=level,
        sections=[GuidanceSection(title="Projects", topic="project evidence",
                                  criterion_ids=criteria or ["project_impact"], text=text)],
    )


def test_langchain_adapter_returns_the_native_retrieval_shape_with_metadata_filters():
    retriever = LangChainRetriever.from_documents([
        document(role="Data Analyst", level="entry_level", title="Data impact",
                 text="Quantify dashboard accuracy and reporting time saved."),
        document(role="Software Engineer", level="entry_level", title="Software impact",
                 text="Quantify deployment reliability and latency."),
        document(role="Data Analyst", level="internship", title="Internship impact",
                 text="Describe the class project outcome."),
    ], DeterministicEmbeddingProvider(dimensions=128))

    results = retriever.retrieve(
        criterion_ids=["project_impact"], target_level="entry_level", target_role="Data Analyst",
    )

    assert [result.chunk.title for result in results] == ["Data impact"]
    assert results[0].chunk.criterion_ids == ("project_impact",)
    assert 0 <= results[0].score <= 1


@pytest.mark.parametrize(("configured", "expected_type"), [
    ("native", "GuidanceRetriever"),
    ("langchain", "LangChainRetriever"),
])
def test_factory_selects_the_configured_retriever_without_analyzer_integration(monkeypatch, configured, expected_type):
    monkeypatch.setattr(config, "RAG_RETRIEVER", configured)

    retriever = build_guidance_retriever([document()], DeterministicEmbeddingProvider(dimensions=64))

    assert type(retriever).__name__ == expected_type


def test_factory_rejects_unknown_retriever_configuration(monkeypatch):
    monkeypatch.setattr(config, "RAG_RETRIEVER", "unexpected")

    with pytest.raises(RuntimeError, match="RAG_RETRIEVER"):
        build_guidance_retriever([document()], DeterministicEmbeddingProvider(dimensions=64))
