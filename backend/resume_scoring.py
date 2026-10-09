"""Evidence-driven résumé scoring rubrics and deterministic score math."""

from __future__ import annotations

import re


CATEGORIES = (
    ("skills", "Relevant technical skills"),
    ("projects", "Projects"),
    ("experience", "Work experience"),
    ("education", "Education"),
    ("formatting", "Structure & formatting"),
    ("leadership", "Leadership & activities"),
    ("certifications", "Certifications"),
    ("ats", "ATS optimization"),
)

RUBRICS = {
    "software_engineering": {"label": "Software engineering", "weights": (30, 20, 15, 10, 10, 5, 5, 5)},
    "data_science": {"label": "Data science & analytics", "weights": (28, 20, 15, 12, 10, 5, 5, 5)},
    "ai_machine_learning": {"label": "AI & machine learning", "weights": (30, 22, 15, 15, 7, 3, 4, 4)},
    "cybersecurity": {"label": "Cybersecurity", "weights": (28, 16, 18, 12, 8, 5, 8, 5)},
    "ui_ux": {"label": "UI/UX design", "weights": (24, 24, 14, 8, 12, 6, 3, 9)},
    "product_management": {"label": "Product management", "weights": (20, 16, 22, 8, 12, 10, 4, 8)},
    "cloud_engineering": {"label": "Cloud engineering", "weights": (28, 18, 18, 10, 8, 4, 8, 6)},
    "devops": {"label": "DevOps & platform engineering", "weights": (30, 18, 18, 8, 8, 4, 8, 6)},
    "technology_general": {"label": "Technology (general rubric)", "weights": (25, 20, 15, 10, 10, 5, 5, 10)},
}

_CAREER_PATTERNS = (
    ("ui_ux", r"\b(ux|ui|user experience|user interface|product designer|ux researcher)\b"),
    ("product_management", r"\b(product manager|product management|product owner)\b"),
    ("cybersecurity", r"\b(cybersecurity|cyber|security analyst|security engineer|penetration tester|infosec)\b"),
    ("ai_machine_learning", r"\b(ai engineer|artificial intelligence|machine learning|\bml engineer|deep learning)\b"),
    ("data_science", r"\b(data scientist|data science|data analyst|data engineer|data engineering|analytics engineer|analytics|business intelligence|bi analyst)\b"),
    ("devops", r"\b(devops|site reliability|\bsre\b|platform engineer|infrastructure engineer)\b"),
    ("cloud_engineering", r"\bcloud engineer|cloud engineering|cloud architect|cloud computing|solutions architect\b"),
    ("software_engineering", r"\bsoftware engineer|software engineering|software developer|\bswe\b|frontend developer|front-end developer|backend developer|back-end developer|full.?stack developer|web developer\b"),
)

_FIXED_CRITERIA = {
    "projects": (
        ("relevant_project", "At least one project relevant to the target career"),
        ("project_technology", "Projects name the tools or technologies used"),
        ("project_outcome", "Projects explain an outcome, result, or what was built"),
        ("project_demo", "A project includes a portfolio, repository, or demo link"),
    ),
    "experience": (
        ("relevant_experience", "Relevant work, internship, or applied experience"),
        ("experience_scope", "Experience bullets describe ownership or scope"),
        ("experience_achievement", "At least one experience bullet shows a result"),
        ("transferable_experience", "Transferable work or team experience is described"),
    ),
    "education": (
        ("education_entry", "Education or current study is listed"),
        ("relevant_coursework", "Relevant coursework, capstone, or academic work is shown"),
        ("education_detail", "Degree, program, or academic standing (including GPA when listed) is clear"),
    ),
    "formatting": (
        ("standard_sections", "Sections have clear, conventional headings"),
        ("date_consistency", "Dates and section ordering are consistent"),
        ("bullet_readability", "Bullets are concise and easy to scan"),
        ("action_language", "Experience or project bullets use clear action language"),
    ),
    "leadership": (
        ("leadership_evidence", "Leadership, ownership, or initiative is demonstrated"),
        ("teamwork_evidence", "Collaboration, mentoring, or extracurricular contribution is shown"),
    ),
    "certifications": (
        ("relevant_certification", "A relevant certification or recognized credential is listed"),
        ("credential_context", "Credential provider or completion context is identifiable"),
    ),
    "ats": (
        ("contact_information", "Professional contact information is present"),
        ("standard_headings", "Common section names support predictable parsing"),
        ("text_parseability", "Resume content is extractable as selectable text"),
        ("keyword_coverage", "Target-role terminology appears naturally in the resume"),
    ),
}


def career_family(career: str) -> str:
    title = " ".join(str(career or "").lower().split())
    for family, pattern in _CAREER_PATTERNS:
        if re.search(pattern, title):
            return family
    return "technology_general"


def rubric_for(career: str, target_skills) -> dict:
    family = career_family(career)
    definition = RUBRICS[family]
    categories = []
    skills = []
    for value in target_skills or []:
        label = " ".join(str(value).split())[:60]
        if label and label.casefold() not in {item["label"].casefold() for item in skills}:
            skills.append({"id": f"skill_{len(skills) + 1}", "label": label})
        if len(skills) == 8:
            break
    if not skills:
        skills = [{"id": "skill_1", "label": "Core skills for this career"}]

    for (category_id, label), weight in zip(CATEGORIES, definition["weights"], strict=True):
        if category_id == "skills":
            criteria = [{**item, "category": category_id} for item in skills]
        else:
            criteria = [
                {"id": criterion_id, "label": criterion_label, "category": category_id}
                for criterion_id, criterion_label in _FIXED_CRITERIA[category_id]
            ]
        categories.append({"id": category_id, "label": label, "weight": weight, "criteria": criteria})
    return {"family": family, "label": definition["label"], "categories": categories}


def _round_points(value: float) -> float:
    return round(value + 1e-9, 2)


def build_score_report(rubric: dict, evaluations: dict, recommendations: list[dict],
                       roadmap_steps: list[dict], skill_step_positions: dict[str, list[int]],
                       extracted_chars: int, extracted_pages: int) -> dict:
    """Calculate every score from validated binary evidence findings."""
    categories = []
    criterion_lookup = {}
    for category in rubric["categories"]:
        criteria = []
        count = len(category["criteria"])
        cents_each, extra_cents = divmod(round(category["weight"] * 100), count)
        earned_count = 0
        for index, criterion in enumerate(category["criteria"]):
            finding = evaluations[criterion["id"]]
            found = finding["found"]
            earned_count += int(found)
            max_points = (cents_each + int(index < extra_cents)) / 100
            item = {
                **criterion,
                "found": found,
                "max_points": max_points,
                "points": max_points if found else 0,
                "evidence": finding["evidence"],
                "note": finding["note"],
            }
            criteria.append(item)
            criterion_lookup[item["id"]] = item
        earned_exact = sum(item["points"] for item in criteria)
        earned = _round_points(earned_exact)
        categories.append({
            "id": category["id"], "label": category["label"],
            "weight": category["weight"], "earned": earned,
            "score": round(earned_exact / category["weight"] * 100) if category["weight"] else 0,
            "criteria": criteria,
        })

    total = round(sum(category["earned"] for category in categories))
    by_id = {category["id"]: category for category in categories}
    ats = by_id["ats"]
    readiness_categories = {
        "internship": ("skills", "projects", "education", "formatting", "leadership", "ats"),
        "junior": ("skills", "projects", "experience", "education", "formatting", "ats"),
        "mid_level": ("skills", "projects", "experience", "leadership", "formatting", "ats"),
    }
    readiness = {}
    for stage, category_ids in readiness_categories.items():
        available = sum(by_id[key]["weight"] for key in category_ids)
        earned = sum(by_id[key]["earned"] for key in category_ids)
        readiness[stage] = round(earned / available * 100) if available else 0

    missing_points = {
        key: item["max_points"] for key, item in criterion_lookup.items() if not item["found"]
    }
    ranked = []
    for index, suggestion in enumerate(recommendations):
        ids = list(dict.fromkeys(suggestion["criterion_ids"]))
        gain = _round_points(sum(missing_points.get(key, 0) for key in ids))
        if gain <= 0:
            continue
        ranked.append({
            "title": suggestion["title"],
            "action": suggestion["action"],
            "criterion_ids": ids,
            "potential_points": gain,
            "_order": index,
        })
    ranked.sort(key=lambda item: (-item["potential_points"], item["_order"]))
    ranked = [{k: v for k, v in item.items() if k != "_order"} for item in ranked[:5]]

    ordered_steps = sorted(roadmap_steps, key=lambda step: step["position"])
    first_open = next((s["position"] for s in ordered_steps if not s.get("completed")), None)
    step_report = []
    for step in ordered_steps:
        position = step["position"]
        status = "completed" if step.get("completed") else (
            "in_progress" if position == first_open else "not_started"
        )
        step_report.append({"position": position, "title": step["title"], "status": status})

    skill_criteria = by_id["skills"]["criteria"]
    skill_rows = []
    for item in skill_criteria:
        positions = sorted(set(skill_step_positions.get(item["id"], [])))
        skill_rows.append({
            "skill": item["label"], "found": item["found"],
            "evidence": item["evidence"], "roadmap_steps": positions,
        })

    if extracted_chars >= 1400 and extracted_pages > 0:
        confidence = {"level": "high", "reason": "The PDF contains substantial selectable text, and every cited excerpt was verified against its page."}
    elif extracted_chars >= 600:
        confidence = {"level": "medium", "reason": "The PDF contains readable text and verified citations, but has limited text for a broad assessment."}
    else:
        confidence = {"level": "low", "reason": "The PDF text is sparse; some resume details may not be represented in the score."}

    return {
        "overall": total,
        "ats": {"score": ats["score"], "earned": ats["earned"], "weight": ats["weight"]},
        "readiness": readiness,
        "confidence": confidence,
        "rubric": {"family": rubric["family"], "label": rubric["label"]},
        "categories": categories,
        "recommendations": ranked,
        "roadmap": {
            "steps": step_report,
            "skills": skill_rows,
        },
        "extracted_chars": extracted_chars,
        "extracted_pages": extracted_pages,
    }
