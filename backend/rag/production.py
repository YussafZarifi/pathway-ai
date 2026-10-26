"""Fail-open production composition for validated RAG coaching."""

from __future__ import annotations

import logging
from functools import lru_cache

from rag.coaching_engine import CoachingEngine, CoachingModelError, CoachingValidationError, GeminiCoachingModel
from rag.embeddings import build_embedding_provider
from rag.factory import build_guidance_retriever
from rag.loaders import load_builtin_documents
from rag.prompt_builder import CoachingPromptInput, TopImprovement, VerifiedResumeCitation, build_coaching_prompt

logger = logging.getLogger("pathwayai.resume_coaching")


@lru_cache(maxsize=1)
def _retriever():
    return build_guidance_retriever(load_builtin_documents(), build_embedding_provider())


def _prioritized_context(analysis: dict) -> tuple[tuple[TopImprovement, ...], tuple[VerifiedResumeCitation, ...]]:
    report = analysis.get("score_report") if isinstance(analysis, dict) else None
    if not isinstance(report, dict) or report.get("status") != "scored":
        return (), ()

    priorities = []
    for category_position, category in enumerate(report.get("categories", [])):
        criteria = category.get("criteria", []) if isinstance(category, dict) else []
        if not isinstance(criteria, list) or not criteria:
            continue
        evidence = [
            citation for criterion in criteria if isinstance(criterion, dict) and criterion.get("found")
            for citation in criterion.get("evidence", []) if isinstance(citation, dict)
        ]
        context = next((citation for citation in evidence if isinstance(citation.get("page"), int)
                        and isinstance(citation.get("quote"), str)), None)
        if context is None:
            continue
        weight = category.get("weight")
        if not isinstance(weight, (int, float)):
            continue
        for criterion_position, criterion in enumerate(criteria):
            if not isinstance(criterion, dict) or criterion.get("found"):
                continue
            criterion_id, label = criterion.get("id"), criterion.get("label")
            if not isinstance(criterion_id, str) or not isinstance(label, str):
                continue
            try:
                priority = TopImprovement(
                    title=f"Strengthen {label.rstrip('.')}",
                    action=f"Add one truthful, specific example that demonstrates {label.lower()}.",
                    criterion_ids=(criterion_id,),
                )
                citation = VerifiedResumeCitation(
                    criterion_id=criterion_id, page=context["page"], quote=context["quote"],
                )
            except ValueError:
                continue
            priorities.append((-(weight / len(criteria)), category_position, criterion_position, priority, citation))

    priorities.sort(key=lambda item: item[:3])
    selected = priorities[:3]
    return tuple(item[3] for item in selected), tuple(item[4] for item in selected)


def _response(result) -> dict:
    return {
        "status": "available",
        "items": [{
            "criterion_id": item.criterion_id,
            "title": item.title,
            "problem": item.problem,
            "why_it_matters": item.why_it_matters,
            "improve_by": item.improve_by,
            "expected_impact": item.expected_impact,
            "suggested_rewrite": item.suggested_rewrite,
            "resume_citations": [{"page": citation.page, "quote": citation.quote}
                                 for citation in item.resume_citations],
            "guidance_citations": [{
                "id": citation.id, "source": citation.source, "title": citation.title,
                "section": citation.section, "topic": citation.topic,
                "criterion_ids": list(citation.criterion_ids), "version": citation.version,
            } for citation in item.guidance_citations],
            "confidence": item.confidence,
        } for item in result.items],
    }


def build_ai_coaching(analysis: dict, *, target_role: str, target_level: str) -> dict:
    """Return validated coaching, or a content-free unavailable status.

    Existing scores and findings are read only. A citation identifies verified
    nearby resume context for the missing criterion; it never asserts that
    absence itself has a source quote.
    """
    improvements, citations = _prioritized_context(analysis)
    if not improvements:
        return {"status": "unavailable"}
    try:
        report = analysis["score_report"]
        retrieved = _retriever().retrieve(
            criterion_ids=[criterion for item in improvements for criterion in item.criterion_ids],
            target_level=target_level,
            target_role=target_role,
            limit=3,
        )
        if not retrieved:
            return {"status": "unavailable"}
        readiness = report["readiness"]["internship" if target_level == "internship" else "junior"]
        payload = build_coaching_prompt(CoachingPromptInput(
            target_role=target_role,
            target_level=target_level,
            ats_score=report["ats"]["display_score"],
            readiness_score=readiness,
            verified_resume_citations=citations,
            top_improvements=improvements,
            retrieved_guidance=retrieved,
        ))
        return _response(CoachingEngine(GeminiCoachingModel()).coach(payload))
    except (CoachingModelError, CoachingValidationError, ValueError, KeyError, TypeError) as error:
        logger.warning("RAG coaching unavailable: %s", getattr(error, "code", type(error).__name__))
    except Exception as error:  # Defensive: enrichment must never fail analysis.
        logger.warning("RAG coaching unavailable: %s", type(error).__name__)
    return {"status": "unavailable"}
