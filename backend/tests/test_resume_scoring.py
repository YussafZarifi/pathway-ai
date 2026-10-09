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
            "found": criterion["id"] in {"skill_1", "relevant_project", "text_parseability"},
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
    assert scores["projects"]["earned"] == 5.0  # one of four project criteria: 20/4
    assert scores["ats"]["earned"] == 1.25  # deterministic text check is 1/4 of ATS
    for category in scores.values():
        assert round(sum(item["max_points"] for item in category["criteria"]), 2) == category["weight"]
        assert round(sum(item["points"] for item in category["criteria"]), 2) == category["earned"]
    assert report["overall"] == round(sum(category["earned"] for category in scores.values()))
    assert report["ats"]["score"] == 25
    assert report["recommendations"][0]["potential_points"] == 10.0
    assert [step["status"] for step in report["roadmap"]["steps"]] == ["completed", "in_progress"]
    assert report["roadmap"]["skills"][0] == {
        "skill": "Python", "found": True, "evidence": [], "roadmap_steps": [1]
    }
    assert report["confidence"]["level"] == "high"


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
    assert report["recommendations"][0]["potential_points"] == project["weight"] / 4


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
    assert report["confidence"]["level"] == "low"
