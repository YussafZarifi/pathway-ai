"""Synthetic-only, deterministic evaluation fixtures for the résumé analyzer.

This module is test infrastructure. It never changes production analysis and
never calls Gemini unless an opt-in caller supplies a live evaluator.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from resume_ai import (
    MIN_SCORE_TEXT_CHARS,
    MIN_SCORE_TEXT_WORDS,
    _quote_matches_source,
    check_pdf,
    extract_resume_pages,
    parse_resume_reply,
)
from resume_scoring import build_score_report, build_skill_roadmap, rubric_for


ROOT = Path(__file__).parent / "fixtures" / "resume_benchmarks"
CASES_ROOT = ROOT / "cases"
SCHEMA_PATH = ROOT / "schemas" / "benchmark_case.schema.json"
EXPECTED_CASE_IDS = {
    "strong_entry_level", "average_student", "weak_resume", "minimal_resume",
    "multi_page_resume", "strong_projects", "weak_projects", "unclear_impact",
    "strong_measurable_impact", "formatting_problems", "missing_skills",
    "inconsistent_experience",
}
CATEGORIES = frozenset(EXPECTED_CASE_IDS)


class BenchmarkFinding(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    criterion_id: str = Field(pattern=r"^[a-z][a-z0-9_]*$")
    page: int = Field(ge=1)
    alternative_pages: list[int] = Field(default_factory=list, max_length=7)
    evidence_contains: str = Field(min_length=3, max_length=320)


class ResumeProfile(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    pages: int = Field(ge=1, le=8)
    expected_sections: list[str] = Field(min_length=1, max_length=10)
    formatting_flags: list[str] = Field(max_length=8)


class ExpectedSignals(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    expected_titles: list[str] = Field(max_length=8)
    expected_skills: list[str] = Field(max_length=8)
    expected_bullets: list[str] = Field(max_length=8)
    findings: list[BenchmarkFinding] = Field(max_length=30)
    minimum_score: int = Field(ge=0, le=100)


class BenchmarkCase(BaseModel):
    """The fixture contract; this model generates the checked-in JSON schema."""

    model_config = ConfigDict(extra="forbid", strict=True)

    id: str = Field(pattern=r"^[a-z][a-z0-9_]*$")
    synthetic: Literal[True]
    target_role: str = Field(min_length=3, max_length=100)
    category: str
    target_skills: list[str] = Field(min_length=1, max_length=8)
    expected_outcome: Literal["scored", "insufficient_evidence"]
    resume_profile: ResumeProfile
    expected_signals: ExpectedSignals
    must_not_appear: list[str] = Field(min_length=1, max_length=12)

    @model_validator(mode="after")
    def outcome_matches_signals(self):
        if self.expected_outcome == "insufficient_evidence" and (
            self.expected_signals.findings or self.expected_signals.minimum_score
        ):
            raise ValueError("insufficient_evidence cases cannot require scored findings or a minimum score")
        return self


def live_model_enabled() -> bool:
    """Live evaluation is opt-in so normal tests never spend Gemini quota."""
    return os.getenv("RUN_RESUME_BENCHMARK_LIVE") == "1"


def _case_paths() -> list[Path]:
    return sorted(CASES_ROOT.glob("*/case.json"))


def _require_schema_matches_contract() -> None:
    try:
        checked_in = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise AssertionError(f"benchmark schema unavailable: {type(error).__name__}") from None
    generated = BenchmarkCase.model_json_schema()
    if checked_in != generated:
        raise AssertionError("benchmark_case.schema.json is not generated from BenchmarkCase")


def _validated_case(path: Path) -> dict:
    try:
        case = BenchmarkCase.model_validate_json(path.read_text(encoding="utf-8"))
    except Exception as error:
        raise AssertionError(f"invalid benchmark case {path.parent.name}: {error}") from None
    if case.category not in CATEGORIES:
        raise AssertionError(f"invalid benchmark category: {case.category}")
    if case.id != path.parent.name:
        raise AssertionError(f"benchmark id must match directory: {path.parent.name}")
    pdf_path = path.parent / "resume.pdf"
    try:
        pdf = pdf_path.read_bytes()
        check_pdf(pdf)
        pages = extract_resume_pages(pdf)
    except Exception as error:
        raise AssertionError(f"invalid benchmark PDF for {case.id}: {type(error).__name__}") from None
    if len(pages) != case.resume_profile.pages:
        raise AssertionError(f"benchmark page count mismatch for {case.id}")
    extracted_text = " ".join(pages)
    has_scoreable_text = (
        len(extracted_text.strip()) >= MIN_SCORE_TEXT_CHARS
        and len(extracted_text.split()) >= MIN_SCORE_TEXT_WORDS
    )
    if case.expected_outcome == "scored" and not has_scoreable_text:
        raise AssertionError(f"scored benchmark is below the analyzer evidence threshold: {case.id}")
    if case.expected_outcome == "insufficient_evidence" and has_scoreable_text:
        raise AssertionError(f"insufficient_evidence benchmark is above the analyzer evidence threshold: {case.id}")
    for finding in case.expected_signals.findings:
        if finding.page > len(pages):
            raise AssertionError(f"benchmark finding page is out of range for {case.id}")
        if finding.page in finding.alternative_pages or any(page > len(pages) for page in finding.alternative_pages):
            raise AssertionError(f"benchmark alternate finding page is invalid for {case.id}")
    return {**case.model_dump(), "_path": path.parent, "_pdf": pdf, "_pages": pages}


def load_cases() -> list[dict]:
    """Load all fixture cases after enforcing the generated JSON contract."""
    _require_schema_matches_contract()
    cases = [_validated_case(path) for path in _case_paths()]
    ids = {case["id"] for case in cases}
    if ids != EXPECTED_CASE_IDS:
        raise AssertionError(f"benchmark case set mismatch: {sorted(ids)}")
    return cases


def _source_contains(pages: list[str], value: str) -> bool:
    needle = " ".join(value.casefold().split())
    return any(needle in " ".join(page.casefold().split()) for page in pages)


def _page_grounded_evidence(case: dict, expected: dict, evidence: dict) -> bool:
    """Use the same tolerant source check that validates production citations."""
    accepted_pages = {expected["page"], *expected.get("alternative_pages", [])}
    if (
        evidence.get("source") not in {None, "resume_text"}
        or evidence.get("page") not in accepted_pages
        or not isinstance(evidence.get("quote"), str)
        or not evidence["quote"].strip()
    ):
        return False
    pages = case.get("_pages")
    return not pages or _quote_matches_source(evidence["quote"], pages[evidence["page"] - 1])


def _deterministic_reply(case: dict, rubric: dict) -> str:
    findings = {item["criterion_id"]: item for item in case["expected_signals"]["findings"]}
    evaluations = []
    for category in rubric["categories"]:
        for criterion in category["criteria"]:
            criterion_id = criterion["id"]
            if criterion_id in {"contact_information", "text_parseability"}:
                continue
            expected = findings.get(criterion_id)
            evaluations.append({
                "criterion_id": criterion_id,
                "found": expected is not None,
                "evidence": ([] if expected is None else [{
                    "source": "resume_text", "page": expected["page"],
                    "quote": expected["evidence_contains"],
                }]),
                "note": "Verified synthetic benchmark evidence." if expected else "No benchmark evidence expected.",
            })
    return json.dumps({
        "is_resume": True,
        "summary": "Synthetic benchmark evaluation.",
        "evaluations": evaluations,
        "recommendations": [],
        "skill_roadmap": [],
        "project_reviews": [],
        "experience_reviews": [],
    })


def _critical_false_positives(case: dict, evaluations: dict, report: dict) -> list[str]:
    def found(criterion_id: str) -> bool:
        return bool(evaluations.get(criterion_id, {}).get("found"))

    failures = []
    for check in case["must_not_appear"]:
        if case["expected_outcome"] == "insufficient_evidence" and not check.startswith("invented_"):
            continue
        if check == "claims_no_projects" and not found("relevant_project"):
            failures.append(check)
        elif check == "flags_valid_date_as_inconsistent" and not found("date_consistency"):
            failures.append(check)
        elif check == "requests_metric_for_existing_metric" and not found("project_impact"):
            failures.append(check)
        elif check == "invented_project" and found("relevant_project"):
            failures.append(check)
        elif check == "invented_metric" and found("project_impact"):
            failures.append(check)
        elif check.startswith("claims_missing_"):
            skill = check.removeprefix("claims_missing_").replace("_", " ").casefold()
            rows = report["roadmap"]["skills"]
            if not any(row["found"] and row["skill"].casefold() == skill for row in rows):
                failures.append(check)
    return failures


def run_deterministic_case(case: dict) -> dict:
    """Exercise extraction, strict citations, and server-side scoring without Gemini."""
    pages = case["_pages"]
    profile = case["resume_profile"]
    signals = case["expected_signals"]
    extraction_failures = []
    for heading in profile["expected_sections"]:
        if not _source_contains(pages, heading):
            extraction_failures.append(f"section:{heading}")
    for key in ("expected_titles", "expected_skills", "expected_bullets"):
        for value in signals[key]:
            if not _source_contains(pages, value):
                extraction_failures.append(f"{key}:{value}")

    evidence_failures = []
    for finding in signals["findings"]:
        if not _source_contains([pages[finding["page"] - 1]], finding["evidence_contains"]):
            evidence_failures.append(finding["criterion_id"])

    rubric = rubric_for(case["target_role"], case["target_skills"])
    reply, _ = parse_resume_reply(
        _deterministic_reply(case, rubric), rubric, pages, [1, 2, 3], tolerant=False
    )
    evaluations = reply["evaluations_by_id"]
    score_report = build_score_report(
        rubric, evaluations, None, [], build_skill_roadmap(rubric, [], evaluations),
        sum(len(page) for page in pages), len(pages), len(" ".join(pages).split()),
    )
    expected_status = case["expected_outcome"]
    scoring_failures = []
    if score_report["status"] != expected_status:
        scoring_failures.append("status")
    if score_report["display_overall"] < signals["minimum_score"]:
        scoring_failures.append("minimum_score")
    critical_false_positives = _critical_false_positives(case, evaluations, score_report)
    rubric_scores = {
        "extraction": 25 if not extraction_failures else 0,
        "evidence_grounding": 25 if not evidence_failures else 0,
        "recommendation_quality": 20 if all(
            all(not evaluations[criterion_id]["found"] for criterion_id in recommendation["criterion_ids"])
            for recommendation in score_report["recommendations"]
        ) else 0,
        "trustworthiness": 15 if not evidence_failures else 0,
        "false_positives": 15 if not critical_false_positives else 0,
    }
    failures = extraction_failures + evidence_failures + scoring_failures + critical_false_positives
    return {
        "id": case["id"],
        "passed": not failures,
        "expected_outcome": expected_status,
        "result_type": "scored_pass" if expected_status == "scored" else "intentional_insufficient_evidence_abstention",
        "status": score_report["status"],
        "display_score": score_report["display_overall"],
        "rubric": rubric_scores,
        "critical_false_positives": critical_false_positives,
        "failures": failures,
    }


def baseline_report() -> dict:
    """Sanitized, deterministic baseline; it intentionally omits résumé text."""
    results = [run_deterministic_case(case) for case in load_cases()]
    return {
        "suite": "resume_benchmarks_deterministic_v2",
        "live_model": False,
        "summary": {
            "cases": len(results),
            "scored": {
                "cases": sum(result["expected_outcome"] == "scored" for result in results),
                "passed": sum(result["passed"] and result["expected_outcome"] == "scored" for result in results),
                "failed": sum(not result["passed"] and result["expected_outcome"] == "scored" for result in results),
            },
            "intentional_insufficient_evidence": {
                "cases": sum(result["expected_outcome"] == "insufficient_evidence" for result in results),
                "abstained": sum(result["passed"] and result["expected_outcome"] == "insufficient_evidence" for result in results),
                "failed": sum(not result["passed"] and result["expected_outcome"] == "insufficient_evidence" for result in results),
            },
            "comparator_mismatches": 0,
            "critical_false_positives": sum(len(result["critical_false_positives"]) for result in results),
        },
        "cases": [{key: value for key, value in result.items() if key not in {"failures"}} for result in results],
    }


def run_live_case(case: dict, evaluator) -> dict:
    """Compare a caller-supplied live result only when explicitly enabled.

    `evaluator` receives the synthetic PDF, role and skills. Keeping the call
    outside this module prevents a normal test run from using a real API key.
    """
    if not live_model_enabled():
        return {"id": case["id"], "status": "skipped"}
    result = evaluator(case["_pdf"], case["target_role"], case["target_skills"])
    report = result["analysis"]["score_report"]
    findings = {criterion["id"]: criterion for category in report["categories"]
                for criterion in category["criteria"]}
    expected_outcome = case["expected_outcome"]
    failures = []
    comparator_mismatches = []
    if report["status"] != expected_outcome:
        failures.append("outcome")
    if expected_outcome == "scored":
        if report.get("display_overall", 0) < case["expected_signals"]["minimum_score"]:
            failures.append("minimum_score")
        for expected in case["expected_signals"]["findings"]:
            actual = findings.get(expected["criterion_id"])
            if not actual or not actual["found"]:
                failures.append(expected["criterion_id"])
                continue
            evidence = actual.get("evidence", [])
            grounded = any(_page_grounded_evidence(case, expected, item) for item in evidence)
            if not grounded:
                comparator_mismatches.append(f"page_grounding:{expected['criterion_id']}")
    critical_false_positives = _critical_false_positives(case, findings, report)
    deterministic = run_deterministic_case(case) if "_pages" in case else None
    live_score = report.get("display_overall", 0)
    if not failures and not comparator_mismatches and not critical_false_positives:
        result_type = (
            "scored_pass" if expected_outcome == "scored"
            else "intentional_insufficient_evidence_abstention"
        )
    elif comparator_mismatches and not failures and not critical_false_positives:
        result_type = "comparator_mismatch"
    else:
        result_type = "failed"
    return {
        "id": case["id"],
        "expected_outcome": expected_outcome,
        "result_type": result_type,
        "status": (
            "passed" if result_type in {"scored_pass", "intentional_insufficient_evidence_abstention"}
            else "inconclusive" if result_type == "comparator_mismatch"
            else "failed"
        ),
        "failures": failures,
        "comparator_mismatches": comparator_mismatches,
        "critical_false_positives": critical_false_positives,
        "live_display_score": live_score,
        "deterministic_display_score": deterministic["display_score"] if deterministic else None,
        "score_difference": live_score - deterministic["display_score"] if deterministic else None,
    }


def live_report(results: list[dict]) -> dict:
    """Return a sanitized live summary without resume text or model responses."""
    scored = [result for result in results if result["expected_outcome"] == "scored"]
    abstentions = [result for result in results if result["expected_outcome"] == "insufficient_evidence"]
    return {
        "suite": "resume_benchmarks_live_gemini_v2",
        "synthetic_only": True,
        "summary": {
            "cases": len(results),
            "scored": {
                "cases": len(scored),
                "passed": sum(result["result_type"] == "scored_pass" for result in scored),
                "failed": sum(result["result_type"] == "failed" for result in scored),
            },
            "intentional_insufficient_evidence": {
                "cases": len(abstentions),
                "abstained": sum(result["result_type"] == "intentional_insufficient_evidence_abstention" for result in abstentions),
                "failed": sum(result["result_type"] == "failed" for result in abstentions),
            },
            "comparator_mismatches": sum(result["result_type"] == "comparator_mismatch" for result in results),
            "critical_false_positives": sum(len(result["critical_false_positives"]) for result in results),
        },
        "cases": results,
    }
