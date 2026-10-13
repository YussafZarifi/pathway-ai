"""Career-specific weights and backend-only score calculations."""

import pytest

from resume_scoring import RUBRICS, build_score_report, career_family, rubric_for


@pytest.mark.parametrize("career, expected", [
    ("Software Engineer Intern", "software_engineering"),
    ("Software Engineering Internship", "software_engineering"),
    ("Data Analyst", "data_science"),
    ("Data Engineer", "data_science"),
    ("AI Engineer", "ai_machine_learning"),
    ("Cybersecurity Analyst", "cybersecurity"),
    ("UX Designer", "ui_ux"),
    ("Product Manager", "product_management"),
    ("Cloud Engineer", "cloud_engineering"),
    ("Cloud Engineering", "cloud_engineering"),
    ("DevOps Engineer", "devops"),
    ("IT Support Specialist", "technology_general"),
])
def test_each_career_uses_its_own_explicit_100_point_rubric(career, expected):
    assert career_family(career) == expected
    assert sum(RUBRICS[expected]["weights"]) == 100


def test_score_is_sum_of_binary_criterion_points_and_never_model_supplied():
    rubric = rubric_for("Software Engineer Intern", ["Python", "SQL"])
    evaluations = {}
    all_criteria = [item for category in rubric["categories"] for item in category["criteria"]]
    for criterion in all_criteria:
        evaluations[criterion["id"]] = {
            "found": criterion["id"] in {"skill_1", "relevant_project", "relevant_experience",
                                          "education_entry", "project_technology", "project_outcome",
                                          "standard_sections", "text_parseability"},
            "evidence": [],
            "note": "Checked against resume evidence.",
        }
    report = build_score_report(
        rubric,
        evaluations,
        [{"title": "Add a deployed project", "action": "Deploy a relevant project.",
          "criterion_ids": ["project_demo", "project_outcome"]}],
        [{"position": 1, "title": "Python", "completed": True},
         {"position": 2, "title": "Deploy", "completed": False}],
        {"skill_1": [1], "skill_2": [2]},
        extracted_chars=1_500,
        extracted_pages=2,
    )

    scores = {category["id"]: category for category in report["categories"]}
    assert scores["skills"]["earned"] == 15.0  # Python found; SQL not found: 30/2
    assert scores["projects"]["earned"] == 8.57  # three of seven project quality checks
    assert scores["ats"]["earned"] == 0.83  # deterministic text check is 1/6 of ATS
    for category in scores.values():
        assert round(sum(item["max_points"] for item in category["criteria"]), 2) == category["weight"]
        assert round(sum(item["points"] for item in category["criteria"]), 2) == category["earned"]
    assert report["overall"] == round(sum(category["earned"] for category in scores.values()))
    assert report["ats"]["score"] == 17
    assert report["recommendations"][0]["potential_points"] == 2.85
    assert [step["status"] for step in report["roadmap"]["steps"]] == ["completed", "in_progress"]
    assert report["roadmap"]["skills"][0] == {
        "skill": "Python", "found": True, "roadmap_steps": [1]
    }
    assert report["confidence"]["level"] == "low"
    assert report["status"] == "scored"


def test_recommendations_cannot_gain_points_twice_for_a_criterion():
    rubric = rubric_for("Product Manager", ["Prioritization"])
    evaluations = {criterion["id"]: {"found": False, "evidence": [], "note": "Not found."}
                   for category in rubric["categories"] for criterion in category["criteria"]}
    report = build_score_report(
        rubric,
        evaluations,
        [{"title": "Show prioritization", "action": "Add one example.",
          "criterion_ids": ["project_outcome", "project_outcome"]}],
        [],
        {"skill_1": []},
        extracted_chars=700,
        extracted_pages=1,
    )
    project = next(category for category in report["categories"] if category["id"] == "projects")
    criterion_points = next(item["max_points"] for item in project["criteria"] if item["id"] == "project_outcome")
    assert report["recommendations"][0]["potential_points"] == criterion_points


def test_no_recommendation_can_claim_a_fully_earned_criterion():
    rubric = rubric_for("Data Scientist", ["Python"])
    evaluations = {criterion["id"]: {"found": criterion["id"] == "project_demo", "evidence": [], "note": "Checked."}
                   for category in rubric["categories"] for criterion in category["criteria"]}
    report = build_score_report(
        rubric,
        evaluations,
        [{"title": "Repeat project", "action": "Add another.", "criterion_ids": ["project_demo"]}],
        [],
        {"skill_1": []},
        extracted_chars=500,
        extracted_pages=1,
    )
    assert report["recommendations"] == []
    assert report["confidence"]["level"] == "very_low"


def _report_for(career, found_ids, *, chars=1800, words=220):
    rubric = rubric_for(career, ["Python", "SQL", "Cloud"])
    evaluations = {
        criterion["id"]: {
            "found": criterion["id"] in found_ids,
            "evidence": ([{"source": "resume_text", "page": 1, "quote": "Verified source evidence."}]
                         if criterion["id"] in found_ids else []),
            "note": "Verified against source text.",
        }
        for category in rubric["categories"] for criterion in category["criteria"]
    }
    return build_score_report(rubric, evaluations, [], [], {}, chars, 1, extracted_words=words)


def test_empty_or_near_empty_source_withholds_all_scores_and_sets_very_low_confidence():
    for chars, words in ((0, 0), (140, 24), (700, 40)):
        report = _report_for("Software Engineer", {"skill_1", "standard_sections", "contact_information"},
                             chars=chars, words=words)
        assert report["status"] == "insufficient_evidence"
        assert report["overall"] == 0
        assert report["ats"]["score"] == 0
        assert set(report["readiness"].values()) == {0}
        assert report["confidence"]["level"] == "very_low"
        assert report["confidence"]["score"] == 5
        assert report["insufficient_reasons"]


def test_substantive_sections_and_verified_findings_are_required_before_scoring():
    only_skills = _report_for("Software Engineer", {"skill_1", "skill_2", "skill_3", "standard_sections"})
    project_and_education = _report_for(
        "Software Engineer", {"skill_1", "skill_2", "relevant_project", "education_entry", "relevant_coursework",
                              "standard_sections", "contact_information", "text_parseability"}
    )
    assert only_skills["status"] == "insufficient_evidence"
    assert project_and_education["status"] == "scored"
    assert project_and_education["overall"] > 0
    no_target_skills = _report_for("Software Engineer", {"relevant_project", "education_entry",
                                                          "standard_sections", "project_technology",
                                                          "project_outcome", "relevant_coursework"})
    no_clear_sections = _report_for("Software Engineer", {"skill_1", "skill_2", "relevant_project",
                                                           "education_entry", "project_technology",
                                                           "project_outcome"})
    assert no_target_skills["status"] == no_clear_sections["status"] == "insufficient_evidence"


def test_project_scope_stack_deployment_and_impact_raise_score_more_than_keyword_presence():
    weak = _report_for("Software Engineer", {
        "skill_1", "skill_2", "relevant_project", "project_technology", "project_outcome",
        "education_entry", "relevant_experience", "standard_sections", "contact_information",
        "text_parseability",
    })
    strong = _report_for("Software Engineer", {
        "skill_1", "skill_2", "relevant_project", "project_technology", "project_complexity",
        "project_deployment", "project_impact", "project_outcome", "project_demo",
        "education_entry", "relevant_experience", "experience_scope", "experience_achievement",
        "standard_sections", "contact_information", "text_parseability",
    })
    assert weak["status"] == strong["status"] == "scored"
    assert strong["overall"] > weak["overall"]


def test_career_mismatch_uses_distinct_career_rubric_and_cannot_score_from_generic_keywords():
    software = _report_for("Software Engineer", {"skill_1", "skill_2", "skill_3"})
    product = _report_for("Product Manager", {"skill_1", "skill_2", "skill_3"})
    assert software["rubric"]["family"] == "software_engineering"
    assert product["rubric"]["family"] == "product_management"
    assert software["status"] == product["status"] == "insufficient_evidence"
    assert software["overall"] == product["overall"] == 0


def test_missing_target_keywords_are_listed_without_being_inferred_from_unrelated_skills():
    report = _report_for("Software Engineer", {"skill_1", "relevant_project", "education_entry",
                                                "standard_sections", "contact_information",
                                                "text_parseability"})
    skills = next(category for category in report["categories"] if category["id"] == "skills")
    assert [item["label"] for item in skills["criteria"] if not item["found"]] == ["SQL", "Cloud"]


def test_high_score_requires_broad_verified_quality_evidence_and_substantial_source_text():
    rubric = rubric_for("Software Engineer", ["Python", "SQL", "Cloud"])
    all_ids = {criterion["id"] for category in rubric["categories"] for criterion in category["criteria"]}
    report = _report_for("Software Engineer", all_ids, chars=2400, words=360)
    assert report["status"] == "scored"
    assert report["overall"] == 100
    assert report["display_overall"] == 100
    assert report["confidence"]["level"] == "high"
    assert report["confidence"]["score"] == 90
