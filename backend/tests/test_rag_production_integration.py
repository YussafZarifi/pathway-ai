"""Production-boundary tests for additive, fail-open RAG coaching."""

import json

import pytest

import rag.production as production
from rag.embeddings import DeterministicEmbeddingProvider


@pytest.fixture(autouse=True)
def deterministic_retriever_for_isolated_production_tests(monkeypatch):
    production._retriever.cache_clear()
    monkeypatch.setattr(production, "build_embedding_provider", DeterministicEmbeddingProvider)
    yield
    production._retriever.cache_clear()


def scored_analysis():
    return {
        "summary": "Deterministic analysis remains unchanged.",
        "score_report": {
            "status": "scored",
            "ats": {"display_score": 72},
            "readiness": {"internship": 58, "junior": 64},
            "categories": [{
                "id": "projects", "weight": 20,
                "criteria": [
                    {
                        "id": "project_impact", "label": "Projects demonstrate their impact",
                        "found": False, "evidence": [],
                    },
                    {
                        "id": "relevant_project", "label": "A relevant project is listed",
                        "found": True,
                        "evidence": [{"page": 1, "quote": "Built a dashboard for weekly reporting."}],
                    },
                ],
            }],
        },
    }


class GroundedGemini:
    def generate(self, payload):
        objective = payload.coaching_objectives[0]
        return json.dumps({"items": [{
            "criterion_id": objective.criterion_id,
            "title": objective.title,
            "problem": "The dashboard result is not observable.",
            "why_it_matters": "A truthful result helps reviewers understand the project outcome.",
            "improve_by": "Describe the reporting result that the dashboard changed.",
            "expected_impact": "Makes the dashboard outcome easier to assess.",
            "suggested_rewrite": None,
            "resume_citation_ids": list(objective.evidence_ids),
            "guidance_chunk_ids": list(objective.guidance_chunk_ids),
            "confidence": "high",
        }]})


def test_production_coaching_adds_only_validated_grounded_enrichment(monkeypatch):
    analysis = scored_analysis()
    original = json.loads(json.dumps(analysis))
    monkeypatch.setattr(production, "GeminiCoachingModel", GroundedGemini)

    coaching = production.build_ai_coaching(
        analysis, target_role="Data Analyst", target_level="entry_level"
    )

    assert analysis == original
    assert coaching["status"] == "available"
    item = coaching["items"][0]
    assert item["criterion_id"] == "project_impact"
    assert item["resume_citations"] == [{
        "page": 1, "quote": "Built a dashboard for weekly reporting.",
    }]
    assert item["guidance_citations"][0]["id"]
    assert item["guidance_citations"][0]["source"] == "PathwayAI editorial guidance"
    assert item["expected_impact"] == "Makes the dashboard outcome easier to assess."


def test_production_coaching_is_unavailable_when_model_output_is_rejected(monkeypatch):
    class InvalidGemini:
        def generate(self, payload):
            return "not json"

    monkeypatch.setattr(production, "GeminiCoachingModel", InvalidGemini)

    assert production.build_ai_coaching(
        scored_analysis(), target_role="Data Analyst", target_level="entry_level"
    ) == {"status": "unavailable"}


def test_production_coaching_skips_unscored_analysis_without_constructing_a_model(monkeypatch):
    class MustNotConstruct:
        def __init__(self):
            raise AssertionError("coaching must not run for insufficient evidence")

    analysis = scored_analysis()
    analysis["score_report"]["status"] = "insufficient_evidence"
    monkeypatch.setattr(production, "GeminiCoachingModel", MustNotConstruct)

    assert production.build_ai_coaching(
        analysis, target_role="Data Analyst", target_level="entry_level"
    ) == {"status": "unavailable"}
