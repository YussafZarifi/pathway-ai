import resume_benchmarks
import resume_ai
from prompts import build_resume_evidence_prompt
from resume_ai import extract_resume_pages
from resume_scoring import rubric_for
from resume_fixtures import make_pdf

from resume_benchmarks import (
    EXPECTED_CASE_IDS,
    baseline_report,
    live_report,
    live_model_enabled,
    load_cases,
    run_live_case,
    run_deterministic_case,
)


def test_synthetic_benchmark_cases_match_the_contract_and_have_pdfs():
    cases = load_cases()

    assert {case["id"] for case in cases} == EXPECTED_CASE_IDS
    assert all(case["synthetic"] is True for case in cases)
    assert {case["expected_outcome"] for case in cases} == {"scored", "insufficient_evidence"}


def test_deterministic_benchmarks_verify_extraction_evidence_scoring_and_false_positives():
    results = [run_deterministic_case(case) for case in load_cases()]

    assert all(result["passed"] for result in results)
    assert all(result["critical_false_positives"] == [] for result in results)
    assert all(set(result["rubric"]) == {
        "extraction", "evidence_grounding", "recommendation_quality", "trustworthiness", "false_positives"
    } for result in results)


def test_baseline_report_is_repeatable_and_contains_no_resume_text():
    report = baseline_report()

    assert report["summary"]["cases"] == len(EXPECTED_CASE_IDS)
    assert report["summary"]["scored"]["failed"] == 0
    assert report["summary"]["intentional_insufficient_evidence"]["failed"] == 0
    assert "Candidate" not in str(report)
    assert "bullet" not in str(report).lower()
    baseline_path = Path(__file__).parent / "fixtures" / "resume_benchmarks" / "baseline_report.json"
    assert json.loads(baseline_path.read_text(encoding="utf-8")) == report


def test_live_model_benchmarks_are_off_unless_explicitly_enabled(monkeypatch):
    monkeypatch.delenv("RUN_RESUME_BENCHMARK_LIVE", raising=False)

    assert live_model_enabled() is False
    calls = []
    result = run_live_case(load_cases()[0], lambda *_args: calls.append(True))
    assert result["status"] == "skipped"
    assert calls == []


def test_live_model_runner_reports_a_critical_false_positive(monkeypatch):
    monkeypatch.setenv("RUN_RESUME_BENCHMARK_LIVE", "1")
    case = {
        "id": "false-positive-check",
        "_pdf": b"synthetic",
        "target_role": "Data Analyst",
        "target_skills": ["SQL"],
        "expected_outcome": "scored",
        "must_not_appear": ["claims_missing_sql"],
        "expected_signals": {"findings": [], "minimum_score": 0},
    }
    result = run_live_case(case, lambda *_args: {"analysis": {"score_report": {
        "status": "scored", "display_overall": 50, "categories": [],
        "roadmap": {"skills": [{"skill": "SQL", "found": False}]}, "recommendations": [],
    }}})

    assert result["status"] == "failed"
    assert result["critical_false_positives"] == ["claims_missing_sql"]


def test_live_runner_accepts_a_different_source_grounded_quote_on_the_expected_page(monkeypatch):
    monkeypatch.setenv("RUN_RESUME_BENCHMARK_LIVE", "1")
    case = next(case for case in load_cases() if case["id"] == "strong_entry_level")
    criteria = []
    for expected in case["expected_signals"]["findings"]:
        quote = "SQL dashboard" if expected["criterion_id"] == "project_technology" else expected["evidence_contains"]
        criteria.append({
            "id": expected["criterion_id"], "found": True,
            "evidence": [{"source": "resume_text", "page": expected["page"], "quote": quote}],
        })
    result = run_live_case(case, lambda *_args: {"analysis": {"score_report": {
        "status": "scored", "display_overall": 50, "categories": [{"criteria": criteria}],
        "roadmap": {"skills": [{"skill": "SQL", "found": True}]}, "recommendations": [],
    }}})

    assert result["status"] == "passed"
    assert result["comparator_mismatches"] == []


def test_live_comparator_uses_the_analyzers_pdf_citation_normalization():
    case = {"_pages": extract_resume_pages(make_pdf(pages=[
        "Projects\nBuilt a data-driven dash-\nboard for weekly reporting."
    ]))}
    expected = {"page": 1}
    evidence = {"page": 1, "quote": "Built a data-driven dashboard for weekly reporting"}

    assert resume_benchmarks._page_grounded_evidence(case, expected, evidence)


def test_generic_multi_page_quality_findings_allow_an_explicit_alternate_page():
    case = {"_pages": ["Experience\nAnalyzed reporting data.", "Projects\nBuilt a SQL dashboard."]}
    evidence = {"page": 1, "quote": "Analyzed reporting data."}

    assert resume_benchmarks._page_grounded_evidence(
        case, {"page": 2, "alternative_pages": [1]}, evidence
    )
    assert not resume_benchmarks._page_grounded_evidence(case, {"page": 2}, evidence)


def test_multi_page_fixture_limits_alternate_pages_to_generic_quality_criteria():
    case = next(case for case in load_cases() if case["id"] == "multi_page_resume")
    findings = {finding["criterion_id"]: finding for finding in case["expected_signals"]["findings"]}

    assert findings["bullet_readability"]["alternative_pages"] == [1]
    assert findings["action_language"]["alternative_pages"] == [1]
    assert findings["relevant_project"]["alternative_pages"] == []
    assert findings["project_technology"]["alternative_pages"] == []


def test_missing_skills_fixture_marks_a_named_spreadsheet_as_project_technology_evidence():
    case = next(case for case in load_cases() if case["id"] == "missing_skills")
    prompt = build_resume_evidence_prompt(
        case["target_role"], rubric_for(case["target_role"], case["target_skills"]), [], case["_pages"]
    )

    assert "spreadsheet reporting project" in prompt.casefold()
    assert "spreadsheets, dashboards, databases, reporting, analytics, or automation tooling" in prompt.casefold()
    project_quote = next(
        finding["evidence_contains"] for finding in case["expected_signals"]["findings"]
        if finding["criterion_id"] == "project_outcome"
    )
    evaluations = {
        "project_technology": {"found": False, "evidence": [], "note": "Model missed the category."},
        "project_outcome": {"found": True, "evidence": [{"page": 1, "quote": project_quote}], "note": "Verified."},
    }
    resume_ai._backfill_project_technology(evaluations)

    assert evaluations["project_technology"]["found"] is True
    assert evaluations["project_technology"]["evidence"][0]["quote"] == project_quote


def test_live_runner_treats_expected_insufficient_evidence_as_a_pass(monkeypatch):
    monkeypatch.setenv("RUN_RESUME_BENCHMARK_LIVE", "1")
    case = {
        "id": "expected-abstention", "_pdf": b"synthetic", "target_role": "Data Analyst",
        "target_skills": ["SQL"], "expected_outcome": "insufficient_evidence",
        "must_not_appear": ["invented_project", "invented_metric"],
        "expected_signals": {"findings": [], "minimum_score": 0},
    }
    result = run_live_case(case, lambda *_args: {"analysis": {"score_report": {
        "status": "insufficient_evidence", "display_overall": 0, "categories": [],
        "roadmap": {"skills": []}, "recommendations": [],
    }}})

    assert result["status"] == "passed"
    assert result["result_type"] == "intentional_insufficient_evidence_abstention"
    assert result["critical_false_positives"] == []


def test_live_report_separates_scored_abstentions_and_comparator_mismatches():
    report = live_report([
        {"id": "scored", "status": "passed", "expected_outcome": "scored", "result_type": "scored_pass", "critical_false_positives": []},
        {"id": "abstention", "status": "passed", "expected_outcome": "insufficient_evidence", "result_type": "intentional_insufficient_evidence_abstention", "critical_false_positives": []},
        {"id": "comparison", "status": "failed", "expected_outcome": "scored", "result_type": "comparator_mismatch", "critical_false_positives": []},
    ])

    assert report["summary"]["scored"]["passed"] == 1
    assert report["summary"]["intentional_insufficient_evidence"]["abstained"] == 1
    assert report["summary"]["comparator_mismatches"] == 1
import json
from pathlib import Path
