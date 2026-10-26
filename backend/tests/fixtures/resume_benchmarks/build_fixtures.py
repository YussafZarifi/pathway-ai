"""Regenerate the committed synthetic benchmark PDFs and case metadata.

Run from ``backend``: ``.venv/Scripts/python.exe tests/fixtures/resume_benchmarks/build_fixtures.py``.
Never use a real résumé in this generator.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT.parents[2]))
sys.path.insert(0, str(ROOT.parents[1]))
from resume_fixtures import make_pdf  # noqa: E402


CASES = {
    "strong_entry_level": {
        "role": "Data Analyst", "skill": "SQL", "title": "Campus Reporting Dashboard",
        "project": "Built and deployed a SQL dashboard that improved weekly reporting accuracy by 28%.",
        "experience": "Analyzed reporting data for 50 student-club users and reduced manual follow-up time.",
        "flags": [], "must_not": ["claims_no_projects", "claims_missing_sql", "flags_valid_date_as_inconsistent", "requests_metric_for_existing_metric"],
    },
    "average_student": {
        "role": "Data Analyst", "skill": "SQL", "title": "Student Reporting Dashboard",
        "project": "Built a SQL dashboard for weekly reporting and validated the final totals.",
        "experience": "Analyzed reporting data for a student organization and prepared weekly summaries.",
        "flags": [], "must_not": ["claims_no_projects", "claims_missing_sql", "flags_valid_date_as_inconsistent"],
    },
    "weak_resume": {
        "role": "Data Analyst", "skill": "SQL", "title": "Class Dashboard",
        "project": "Created a SQL dashboard for a class assignment.",
        "experience": "Helped with reporting tasks for a campus group.",
        "flags": ["vague_bullets"], "must_not": ["invented_project", "invented_metric"], "expected_outcome": "insufficient_evidence",
    },
    "minimal_resume": {
        "role": "Data Analyst", "skill": "SQL", "title": "", "project": "", "experience": "",
        "flags": ["sparse_content"], "must_not": ["invented_project", "invented_metric"], "minimal": True, "expected_outcome": "insufficient_evidence",
    },
    "multi_page_resume": {
        "role": "Data Analyst", "skill": "SQL", "title": "Second Page Data Dashboard",
        "project": "Built a SQL dashboard that improved weekly reporting accuracy by 20%.",
        "experience": "Analyzed reporting data for 40 volunteer-program users and documented trends.",
        "flags": ["multi_page"], "must_not": ["claims_no_projects", "claims_missing_sql", "requests_metric_for_existing_metric"], "pages": 2,
    },
    "strong_projects": {
        "role": "Data Analyst", "skill": "SQL", "title": "Volunteer Metrics Platform",
        "project": "Built and deployed a SQL dashboard with data validation that improved weekly reporting accuracy by 31%.",
        "experience": "Analyzed reporting data for 75 volunteer-program users and presented outcomes.",
        "flags": [], "must_not": ["claims_no_projects", "claims_missing_sql", "requests_metric_for_existing_metric"],
    },
    "weak_projects": {
        "role": "Data Analyst", "skill": "SQL", "title": "Tutorial Dashboard",
        "project": "Created a SQL dashboard by following a tutorial.",
        "experience": "Analyzed weekly reporting data for a campus group.",
        "flags": ["tutorial_like_project"], "must_not": ["claims_no_projects", "claims_missing_sql"],
    },
    "unclear_impact": {
        "role": "Data Analyst", "skill": "SQL", "title": "Operations Dashboard",
        "project": "Built a SQL dashboard for operations reporting and shared it with the team.",
        "experience": "Analyzed reporting data for a community organization and prepared updates.",
        "flags": ["missing_measurable_impact"], "must_not": ["claims_no_projects", "claims_missing_sql"],
    },
    "strong_measurable_impact": {
        "role": "Data Analyst", "skill": "SQL", "title": "Inventory Accuracy Dashboard",
        "project": "Built a SQL dashboard that reduced inventory-report preparation time by 35%.",
        "experience": "Analyzed inventory data for 60 users and improved weekly reporting accuracy by 18%.",
        "flags": [], "must_not": ["claims_no_projects", "claims_missing_sql", "requests_metric_for_existing_metric"],
    },
    "formatting_problems": {
        "role": "Data Analyst", "skill": "SQL", "title": "Reporting Dashboard",
        "project": "Built a SQL dashboard that improved weekly reporting accuracy by 12%.",
        "experience": "Analyzed reporting data for 30 users and prepared updates.",
        "flags": ["nonstandard_headings", "dense_bullets"], "must_not": ["claims_no_projects", "claims_missing_sql"], "nonstandard": True,
    },
    "missing_skills": {
        "role": "Data Analyst", "skill": "Tableau", "title": "Spreadsheet Reporting Project",
        "project": "Built a spreadsheet reporting project that improved weekly report accuracy by 15%.",
        "experience": "Analyzed spreadsheet reports for 25 users and summarized trends.",
        "flags": ["role_skill_gap"], "must_not": ["claims_no_projects", "flags_valid_date_as_inconsistent"],
    },
    "inconsistent_experience": {
        "role": "Data Analyst", "skill": "SQL", "title": "Part-Time Reporting Dashboard",
        "project": "Built a SQL dashboard that improved weekly reporting accuracy by 16%.",
        "experience": "Analyzed reporting data while studying full time and prepared weekly summaries.",
        "flags": ["overlapping_but_plausible_dates"], "must_not": ["claims_no_projects", "claims_missing_sql", "flags_valid_date_as_inconsistent"],
    },
}


def pages_for(case: dict) -> list[str]:
    if case.get("minimal"):
        return ["Synthetic Candidate\nSkills\nSQL\nEducation\nCertificate in Data Basics, 2025."]
    headings = ("Technical Toolbox\nSQL\nPortfolio Work" if case.get("nonstandard")
                else f"Skills\n{case['skill']}\nProjects")
    context = "" if case.get("expected_outcome") == "insufficient_evidence" else (
        "Additional context: Collaborated with peers to define data requirements, "
        "documented source fields, tested totals, and presented weekly findings to stakeholders."
    )
    first = f"""Synthetic Candidate
{headings}
{case['title']}
{case['project']}
Experience
Data Support Assistant
{case['experience']}
{context}
Education
BSc in Analytics, 2025.
2024 - 2025
"""
    if case.get("pages") == 2:
        return [f"Synthetic Candidate\nSkills\nSQL\nExperience\nData Support Assistant\n{case['experience']}\n2024 - 2025\nEducation\nBSc in Analytics, 2025.", f"Projects\n{case['title']}\n{case['project']}\nProject context: a synthetic student reporting project with documented source data and repeatable weekly review steps.\n{context}"]
    return [first]


def findings_for(case: dict, pages: list[str]) -> list[dict]:
    if case.get("expected_outcome") == "insufficient_evidence":
        return []
    project_page = 2 if case.get("pages") == 2 else 1
    quality_alternates = {"alternative_pages": [1]} if case.get("pages") == 2 else {}
    education_page = 1 if case.get("pages") == 2 else len(pages)
    section_quote = "Projects" if case.get("pages") == 2 else ("Technical Toolbox" if case.get("nonstandard") else "Skills")
    project = case["project"]
    findings = [
        {"criterion_id": "skill_1", "page": 1, "evidence_contains": case["skill"]},
        {"criterion_id": "relevant_project", "page": project_page, "evidence_contains": case["title"]},
        {"criterion_id": "project_technology", "page": project_page, "evidence_contains": project},
        {"criterion_id": "project_outcome", "page": project_page, "evidence_contains": project},
        {"criterion_id": "relevant_experience", "page": 1, "evidence_contains": "Data Support Assistant"},
        {"criterion_id": "education_entry", "page": education_page, "evidence_contains": "BSc in Analytics, 2025."},
        {"criterion_id": "standard_sections", "page": project_page, "evidence_contains": section_quote},
        {"criterion_id": "date_consistency", "page": 1, "evidence_contains": "2024 - 2025"},
        {"criterion_id": "bullet_readability", "page": project_page, "evidence_contains": project, **quality_alternates},
        {"criterion_id": "action_language", "page": project_page, "evidence_contains": project, **quality_alternates},
    ]
    if "%" in project:
        findings.append({"criterion_id": "project_impact", "page": project_page, "evidence_contains": project})
    return findings


def build_case(case_id: str, source: dict) -> dict:
    pages = pages_for(source)
    expected_outcome = source.get("expected_outcome", "scored")
    expected_sections = ["Skills", "Education"] if source.get("minimal") else ["Skills", "Projects", "Experience", "Education"]
    if source.get("nonstandard"):
        expected_sections = ["Technical Toolbox", "Portfolio Work", "Experience", "Education"]
    if source.get("pages") == 2:
        expected_sections = ["Skills", "Experience", "Projects", "Education"]
    expected = {
        "expected_titles": ([] if source.get("minimal") else [source["title"], "Data Support Assistant"]),
        "expected_skills": [source["skill"]],
        "expected_bullets": ([] if source.get("minimal") else [source["project"], source["experience"]]),
        "findings": findings_for(source, pages),
        "minimum_score": 0 if expected_outcome == "insufficient_evidence" else 20,
    }
    return {
        "id": case_id,
        "synthetic": True,
        "target_role": source["role"],
        "category": case_id,
        "target_skills": [source["skill"]],
        "expected_outcome": expected_outcome,
        "resume_profile": {"pages": len(pages), "expected_sections": expected_sections, "formatting_flags": source["flags"]},
        "expected_signals": expected,
        "must_not_appear": source["must_not"],
    }, pages


for case_id, source in CASES.items():
    case, pages = build_case(case_id, source)
    directory = ROOT / "cases" / case_id
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "case.json").write_text(json.dumps(case, indent=2) + "\n", encoding="utf-8")
    (directory / "resume.pdf").write_bytes(make_pdf(pages=pages))
