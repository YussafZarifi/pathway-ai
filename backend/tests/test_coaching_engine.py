"""Mocked-model contracts for grounded RAG coaching."""

import json

import pytest

import config
from rag.coaching_engine import CoachingEngine, CoachingValidationError, GeminiCoachingModel
from rag.models import GuidanceChunk, RetrievedGuidance
from rag.prompt_builder import CoachingPromptInput, TopImprovement, VerifiedResumeCitation, build_coaching_prompt


class FakeGemini:
    def __init__(self, response):
        self.response = response
        self.calls = []

    def generate(self, payload):
        self.calls.append(payload)
        return self.response


def payload():
    guidance = RetrievedGuidance(
        chunk=GuidanceChunk(
            id="guidance-impact", collection="resume_best_practices", source="PathwayAI editorial guidance",
            title="Resume project evidence", section="Project outcomes", topic="measurable impact",
            criterion_ids=["project_impact"], role="all", level="all", version="v1",
            text="Describe a truthful, observable project result.",
        ),
        score=0.82,
    )
    return build_coaching_prompt(CoachingPromptInput(
        target_role="Data Analyst", target_level="entry_level", ats_score=72, readiness_score=61,
        verified_resume_citations=[VerifiedResumeCitation(
            criterion_id="project_impact", page=2, quote="Built a dashboard for weekly reporting.",
        )],
        top_improvements=[TopImprovement(
            title="Add measurable project impact", action="Add a truthful result or observed improvement.",
            criterion_ids=["project_impact"],
        )],
        retrieved_guidance=[guidance],
    ))


def valid_response(context, **overrides):
    objective = context.coaching_objectives[0]
    item = {
        "criterion_id": objective.criterion_id,
        "title": "Add measurable project impact",
        "problem": "The project result is not measurable.",
        "why_it_matters": "A truthful result helps reviewers understand the project outcome.",
        "improve_by": "Add an observed result or use a placeholder until it is measured.",
        "expected_impact": "Helps reviewers assess the project outcome quickly.",
        "suggested_rewrite": "Built a dashboard for weekly reporting; [add measured result].",
        "resume_citation_ids": list(objective.evidence_ids),
        "guidance_chunk_ids": list(objective.guidance_chunk_ids),
        "confidence": "high",
    }
    item.update(overrides)
    return json.dumps({"items": [item]})


def test_engine_returns_structured_coaching_with_resolved_verified_citations():
    context = payload()
    model = FakeGemini(valid_response(context))

    result = CoachingEngine(model).coach(context)

    assert model.calls == [context]
    item = result.items[0]
    assert item.criterion_id == "project_impact"
    assert item.resume_citations[0].quote == "Built a dashboard for weekly reporting."
    assert item.guidance_citations[0].id == "guidance-impact"
    assert item.expected_impact == "Helps reviewers assess the project outcome quickly."
    assert item.confidence == "high"


def test_gemini_adapter_returns_a_mocked_response_from_prompt_builder_context(fake_gemini):
    context = payload()
    raw = valid_response(context)
    models = fake_gemini(raw)

    assert GeminiCoachingModel().generate(context) == raw
    assert models.calls == 1
    assert "project_impact" in models.prompts[0]
    assert "%PDF" not in models.prompts[0]
    assert models.configs[0].http_options.timeout == config.RAG_COACHING_TIMEOUT_SECONDS * 1000


@pytest.mark.parametrize(("raw", "code"), [
    ("not json", "malformed_json"),
    (json.dumps({"items": [{"criterion_id": "project_impact"}]}), "invalid_schema"),
])
def test_engine_rejects_malformed_or_schema_invalid_model_output(raw, code):
    with pytest.raises(CoachingValidationError) as error:
        CoachingEngine(FakeGemini(raw)).coach(payload())
    assert error.value.code == code


@pytest.mark.parametrize(("field", "value", "code"), [
    ("criterion_id", "unknown_criterion", "unknown_criterion_id"),
    ("resume_citation_ids", ["resume-unknown"], "invalid_resume_citation"),
    ("guidance_chunk_ids", ["guidance-unknown"], "invalid_guidance_citation"),
])
def test_engine_rejects_unknown_or_unsupported_grounding_references(field, value, code):
    context = payload()
    with pytest.raises(CoachingValidationError) as error:
        CoachingEngine(FakeGemini(valid_response(context, **{field: value}))).coach(context)
    assert error.value.code == code


@pytest.mark.parametrize("unsupported_claim", [
    "Built a Kubernetes dashboard for weekly reporting.",
    "Built a React dashboard for weekly reporting.",
    "Worked at Acme Corp building a dashboard.",
    "Built a dashboard that improved reporting by 50%.",
])
def test_engine_rejects_hallucinated_skills_technologies_employers_and_metrics(unsupported_claim):
    context = payload()
    with pytest.raises(CoachingValidationError) as error:
        CoachingEngine(FakeGemini(valid_response(context, suggested_rewrite=unsupported_claim))).coach(context)
    assert error.value.code == "unsupported_claim"


def test_engine_rejects_a_recommendation_unrelated_to_its_cited_context():
    context = payload()
    with pytest.raises(CoachingValidationError) as error:
        CoachingEngine(FakeGemini(valid_response(
            context,
            problem="The font color needs adjustment.",
            why_it_matters="A blue font makes the document memorable.",
            improve_by="Change the font color to blue.",
        ))).coach(context)
    assert error.value.code == "unsupported_recommendation"
