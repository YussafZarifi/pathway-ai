"""Evidence extraction, quote verification, score math and privacy tests."""

import json
import logging
from pathlib import Path

import httpx
import pytest
from google.genai import errors as genai_errors
from pydantic import ValidationError

import llm
import resume_ai
from ai_output import AIOutputError
from conftest import SECRET
from prompts import RESUME_SYSTEM_INSTRUCTION, build_resume_evidence_prompt
from resume_ai import ResumeInputError, analyze_resume, check_pdf, extract_resume_pages, parse_resume_reply
from resume_scoring import rubric_for
from resume_fixtures import CAREER, RESUME_PAGES, SKILLS, STEPS, make_pdf, reply, sample_work_reviews


def rubric():
    return rubric_for(CAREER, SKILLS)


def parse(data=None, pages=None, steps=STEPS):
    data = reply() if data is None else data
    return parse_resume_reply(json.dumps(data), rubric(), RESUME_PAGES if pages is None else pages, len(steps))


def run():
    return analyze_resume(make_pdf(), CAREER, SKILLS, STEPS)


def gemini_error(code, status, details=()):
    return genai_errors.APIError(
        code, {"error": {"code": code, "status": status, "message": "m", "details": list(details)}}
    )


def test_success_returns_legacy_fields_plus_server_computed_score_report(fake_gemini):
    models = fake_gemini(reply())
    result = run()
    assert set(result) == {"analysis", "career", "prompt_version", "model"}
    analysis = result["analysis"]
    assert {"summary", "matched_skills", "missing_skills", "strengths", "gaps", "suggestions"} <= set(analysis)
    assert "score_report" in analysis
    assert analysis["score_report"]["overall"] == round(sum(c["earned"] for c in analysis["score_report"]["categories"]))
    assert analysis["score_report"]["status"] == "scored"
    assert 0 < analysis["score_report"]["overall"] < 60
    assert analysis["score_report"]["ats"]["score"] == 67
    assert analysis["matched_skills"] == ["SQL"] and analysis["missing_skills"] == ["Tableau"]
    assert analysis["score_report"]["recommendations"][0]["potential_points"] == 14.0
    assert result["career"] == CAREER and result["prompt_version"] == "r9"
    assert result["model"] == resume_ai.config.GEMINI_MODEL
    assert models.calls == 1


def test_project_and_experience_scores_are_computed_from_verified_checks():
    projects, experience = sample_work_reviews()
    data = reply(project_reviews=projects, experience_reviews=experience)

    parsed, diagnostics = parse_resume_reply(
        json.dumps(data), rubric(), RESUME_PAGES, list(range(1, len(STEPS) + 1))
    )

    assert parsed["project_reviews_by_item"][0]["score"] == 60
    assert parsed["experience_reviews_by_item"][0]["score"] == 45
    assert parsed["project_reviews_by_item"][0]["technologies"] == ["SQL"]
    assert parsed["project_reviews_by_item"][0]["found_checks"] == [
        "project_purpose", "project_stack", "project_complexity", "project_impact", "project_career_fit",
    ]
    assert parsed["project_reviews_by_item"][0]["bullet_rewrite"]["after"].endswith("20%.")
    assert diagnostics["items"] > len(data["evaluations"])
    assert "score" not in data["project_reviews"][0]


def test_work_sample_technology_tags_keep_only_terms_in_that_items_verified_evidence():
    projects, experience = sample_work_reviews()
    projects[0]["technologies"] = ["SQL", "Python", "Kotlin"]
    experience[0]["technologies"] = ["Docker"]

    parsed, _ = parse_resume_reply(
        json.dumps(reply(project_reviews=projects, experience_reviews=experience)),
        rubric(), RESUME_PAGES, list(range(1, len(STEPS) + 1)),
    )

    assert parsed["project_reviews_by_item"][0]["technologies"] == ["SQL"]
    assert parsed["experience_reviews_by_item"][0]["technologies"] == []


def test_recommendations_with_invalid_references_are_dropped_and_duplicates_fail_closed():
    data = reply(recommendations=[
        {"title": "Add a demo", "action": "Deploy a truthful project demo.",
         "criterion_ids": ["project_demo", "relevant_project", "experience_career_fit"]},
    ])

    parsed, diagnostics = parse_resume_reply(json.dumps(data), rubric(), RESUME_PAGES, len(STEPS))
    assert parsed["recommendations"]
    assert diagnostics["dropped"] == ["recommendations.0.criterion_ids:invalid_reference"]
    missing_ids = {item["criterion_id"] for item in data["evaluations"] if not item["found"]}
    assert all(set(item["criterion_ids"]) <= missing_ids for item in parsed["recommendations"])

    data["recommendations"] = [{"title": "Duplicate", "action": "Do not duplicate references.",
                                "criterion_ids": ["project_demo", "project_demo"]}]
    with pytest.raises(AIOutputError, match="recommendations.0.criterion_ids"):
        parse_resume_reply(json.dumps(data), rubric(), RESUME_PAGES, len(STEPS))


def test_captured_gemini_recommendation_at_four_id_limit_remains_valid():
    fixture = json.loads((Path(__file__).parent / "fixtures" /
                          "gemini-recommendation-four-criterion-ids.json").read_text(encoding="utf-8"))
    assert fixture["capture"]["source"].startswith("Gemini")
    captured = fixture["recommendation"]
    assert captured["criterion_ids"] == ["skill_1", "skill_2", "relevant_project", "project_demo"]
    assert len(captured["criterion_ids"]) == 4
    resume_ai.Recommendation.model_validate(captured)

    captured["criterion_ids"].append("experience_results")
    with pytest.raises(ValidationError):
        resume_ai.Recommendation.model_validate(captured)


def test_live_gemini_recommendation_with_found_criterion_is_replaced_safely():
    fixture = json.loads((Path(__file__).parent / "fixtures" /
                          "gemini-recommendation-found-reference.json").read_text(encoding="utf-8"))
    assert fixture["capture"]["source"].startswith("Actual Gemini")
    data = reply(recommendations=[fixture["recommendation"]])
    for criterion_id, found in fixture["evaluation_states"].items():
        criterion = next(item for item in data["evaluations"] if item["criterion_id"] == criterion_id)
        criterion["found"] = found
        criterion["evidence"] = ([{"source": "resume_text", "page": 1,
                                    "quote": "Built a SQL dashboard that improved weekly reporting accuracy by 20%."}]
                                 if found else [])

    parsed, diagnostics = parse_resume_reply(json.dumps(data), rubric(), RESUME_PAGES, len(STEPS))

    recommendations = parsed["recommendations"]
    assert recommendations
    missing_ids = {item["criterion_id"] for item in data["evaluations"] if not item["found"]}
    assert all(set(item["criterion_ids"]) <= missing_ids for item in recommendations)
    assert diagnostics["dropped"] == ["recommendations.0.criterion_ids:invalid_reference"]
    assert any("project_demo" in item["criterion_ids"] for item in recommendations)


def test_captured_gemini_long_fields_fit_the_evidence_backed_contract():
    captured = json.loads((Path(__file__).parent / "fixtures" /
                           "gemini-long-fields-captured.json").read_text(encoding="utf-8"))
    assert captured["capture"]["source"].startswith("Actual Gemini")
    evidence = {"source": "resume_text", "page": 1, "quote": captured["verified_quote"]}
    resume_ai.Evaluation.model_validate({
        "criterion_id": "project_outcome", "found": True, "evidence": [evidence],
        "note": captured["evaluation_note"],
    })
    resume_ai.ReviewCheck.model_validate({
        "criterion_id": "project_purpose", "found": True, "evidence": [evidence],
        "note": captured["project_check_note"],
    })
    project = sample_work_reviews()[0][0]
    project["summary"] = captured["project_summary"]
    project["technologies"] = captured["technologies"]
    project["bullet_rewrite"]["suggestion"] = captured["bullet_rewrite_suggestion"]
    resume_ai.WorkSampleReview.model_validate(project)
    assert len(captured["verified_quote"]) == 300
    assert len(captured["evaluation_note"]) <= 180
    assert len(captured["project_summary"]) <= 300
    assert len(captured["project_check_note"]) <= 160
    assert len(captured["bullet_rewrite_suggestion"]) <= 400
    assert len(captured["technologies"]) == 6


def test_five_recommendation_ids_report_safe_actual_and_maximum_lengths():
    data = reply()
    data["recommendations"][0]["criterion_ids"] = ["project_demo"] * 5
    with pytest.raises(AIOutputError) as error:
        parse(data)
    assert "recommendations.0.criterion_ids:too_long(max=4,actual=5)" in str(error.value)
    assert "project_demo" not in str(error.value)


def test_storage_compaction_keeps_all_score_groups_and_verified_short_citations():
    quote = "Led project delivery using SQL and Python to improve reporting accuracy by 20%."
    pages = [quote]
    criteria = [{
        "id": f"criterion_{index}", "label": f"Criterion {index}", "category": "projects",
        "found": True, "max_points": 3.0, "points": 3.0,
        "note": "Verified evidence supports this finding. " * 2,
        "evidence": [{"source": "resume_text", "page": 1, "quote": quote}],
    } for index in range(32)]
    card = {
        "title": "Project review", "summary": "Supported project details. " * 5, "score": 80,
        "technologies": ["SQL", "Python"], "found_checks": ["project_stack"],
        "missing_checks": ["project_testing"], "evidence": {"quote": quote, "page": 1},
        "bullet_rewrite": {"before": quote, "after": "Led project delivery with SQL and Python; add verified results.", "page": 1},
    }
    analysis = {
        "summary": "Evidence-led report. " * 15,
        "matched_skills": ["SQL", "Python"], "missing_skills": ["Docker"],
        "strengths": ["Strong work. " * 10], "gaps": [{"skill": "Docker", "why": "Not present. " * 8,
            "how_to_close": "Add a truthful example. " * 8, "related_step": 1}],
        "suggestions": [{"section": "projects", "text": "Improve project detail. " * 8}],
        "project_reviews": [dict(card, title=f"Project {index}") for index in range(3)],
        "experience_reviews": [dict(card, title=f"Role {index}") for index in range(3)],
        "score_report": {
            "overall": 82, "ats": {"score": 78}, "readiness": {"internship": 82},
            "rubric": {"family": "software_engineering", "label": "Software engineering"},
            "categories": [{"id": "projects", "label": "Projects", "weight": 20, "earned": 16,
                "score": 80, "criteria": criteria}],
            "recommendations": [{"title": "Add tests", "action": "Show verified testing.",
                "criterion_ids": ["criterion_1"], "potential_points": 3}],
            "extracted_chars": 3000, "extracted_pages": 2, "extracted_words": 400,
        },
    }
    before = len(json.dumps(analysis, ensure_ascii=False).encode("utf-8"))

    compact = resume_ai._compact_analysis_for_storage(analysis, pages, 16_000)

    assert before > 16_000
    assert len(json.dumps(compact, ensure_ascii=False).encode("utf-8")) <= 16_000
    assert compact["score_report"]["overall"] == 82
    assert compact["score_report"]["categories"][0]["score"] == 80
    assert len(compact["project_reviews"]) == len(compact["experience_reviews"]) == 3
    assert all(resume_ai._quote_matches_source(item["evidence"]["quote"], pages[0])
               for item in compact["project_reviews"] + compact["experience_reviews"])
    assert all(resume_ai._quote_matches_source(evidence["quote"], pages[0])
               for item in compact["score_report"]["categories"][0]["criteria"]
               for evidence in item["evidence"])


def test_project_review_rejects_an_unverifiable_citation():
    projects, experience = sample_work_reviews()
    projects[0]["checks"][0]["evidence"][0]["quote"] = "Built a different application."

    with pytest.raises(AIOutputError, match="quote:not_in_source"):
        parse_resume_reply(json.dumps(reply(project_reviews=projects, experience_reviews=experience)),
                           rubric(), RESUME_PAGES, STEPS)


def test_tolerant_project_review_drops_only_an_unverifiable_evidence_item():
    projects, experience = sample_work_reviews()
    projects[0]["checks"][0]["evidence"][0]["quote"] = "Built a different application."

    parsed, diagnostics = parse_resume_reply(
        json.dumps(reply(project_reviews=projects, experience_reviews=experience)),
        rubric(), RESUME_PAGES, list(range(1, len(STEPS) + 1)), tolerant=True,
    )

    review = parsed["project_reviews_by_item"][0]
    assert "project_purpose" in review["missing_checks"]
    assert review["score"] == 48
    assert review["title"] == "SQL reporting dashboard"
    assert any("unverified_quote" in item for item in diagnostics["dropped"])


def test_citation_diagnostic_explains_a_noncontiguous_quote():
    diagnostic = resume_ai._citation_mismatch_diagnostic(
        "Built a SQL dashboard with excellent reporting accuracy.",
        RESUME_PAGES[0],
        1,
    )

    assert diagnostic["contiguous_word_match"] is False
    assert diagnostic["first_mismatch"]["quote_token_index"] >= 0
    assert diagnostic["longest_matching_subsequence"]["token_count"] >= 3
    assert "tokens" not in diagnostic["longest_matching_subsequence"]
    assert "surrounding_page_text" not in diagnostic
    assert "not a contiguous source span" in diagnostic["why_contiguous_matching_failed"]


def test_bullet_rewrite_cannot_invent_a_metric():
    projects, experience = sample_work_reviews()
    projects[0]["bullet_rewrite"]["suggestion"] += " Reduced costs by 40%."

    with pytest.raises(AIOutputError, match="unsupported_metric"):
        parse_resume_reply(json.dumps(reply(project_reviews=projects, experience_reviews=experience)),
                           rubric(), RESUME_PAGES, STEPS)


def test_debug_capture_saves_exact_local_artifacts_and_claims_only_once(tmp_path, monkeypatch):
    monkeypatch.setattr(resume_ai, "_DEBUG_CAPTURE_ROOT", tmp_path / ".resume-debug")
    capture = resume_ai._ResumeDebugCapture(b"synthetic-private-pdf-bytes", ["Ada builds systems."])
    capture.save_response('{"summary":"ok"}', 1)
    capture.save_comparison({"returned_quote": "builds systems", "page_number": 1})

    capture_dir = capture.path
    assert capture_dir is not None
    assert json.loads((capture_dir / "extracted-pages.json").read_text(encoding="utf-8")) == [
        {"page": 1, "text": "Ada builds systems."}
    ]
    assert json.loads((capture_dir / "normalized-pages.json").read_text(encoding="utf-8")) == [
        {"page": 1, "text": "ada builds systems"}
    ]
    assert (capture_dir / "gemini-raw-response-attempt-1.json").read_text(encoding="utf-8") == '{"summary":"ok"}'
    assert json.loads((capture_dir / "evidence-comparisons-attempt-1.json").read_text(encoding="utf-8")) == [
        {"returned_quote": "builds systems", "page_number": 1}
    ]
    with pytest.raises(ResumeInputError, match="debug_capture_already_used"):
        resume_ai._ResumeDebugCapture(b"another-private-pdf", ["Another page."])


def test_gemini_gets_pdf_target_checklist_and_page_text_but_never_a_score(fake_gemini):
    models = fake_gemini(reply())
    run()
    pdf_part, text = models.prompts[0]
    assert pdf_part.inline_data.mime_type == "application/pdf"
    assert pdf_part.inline_data.data == make_pdf()
    assert "Target career" in text and "Data Analyst" in text
    assert '"id": "skill_1"' in text and "2023 - 2024" in text
    assert "Built a SQL dashboard" in text and "evaluations" in text
    assert "Never invent a numeric score" in RESUME_SYSTEM_INSTRUCTION
    assert models.configs[0].system_instruction == RESUME_SYSTEM_INSTRUCTION
    assert models.configs[0].temperature == 0
    assert models.configs[0].response_mime_type == "application/json"
    schema = models.configs[0].response_schema
    positions = schema["$defs"]["SkillRoadmapSchema"]["properties"]["step_positions"]["items"]
    assert positions["minimum"] == 1 and positions["maximum"] == len(STEPS)
    assert "recommendations" not in schema["properties"]
    assert "skill_roadmap" not in schema["properties"]
    assert set(schema["required"]) == set(schema["properties"])
    assert models.configs[0].automatic_function_calling.disable is True


def test_gemini_resume_schema_uses_only_the_minimal_provider_shape():
    def walk(value, path=()):
        if isinstance(value, dict):
            assert "additionalProperties" not in value and "minLength" not in value
            if "maxLength" in value:
                assert path[-4:] == ("$defs", "EvidenceSchema", "properties", "quote")
                assert value["maxLength"] == resume_ai.MAX_QUOTE_CHARS
            for key, item in value.items():
                walk(item, path + (key,))
        elif isinstance(value, list):
            for item in value:
                walk(item, path)

    schema = resume_ai._gemini_response_schema(len(STEPS), ["skill_1", "project_demo"], minimal=True)
    walk(schema)
    positions = schema["$defs"]["SkillRoadmapSchema"]["properties"]["step_positions"]["items"]
    assert positions["minimum"] == 1 and positions["maximum"] == len(STEPS)
    evidence_schema = schema["$defs"]["EvaluationSchema"]["properties"]["evidence"]
    assert evidence_schema["maxItems"] == 5
    quote_schema = schema["$defs"]["EvidenceSchema"]["properties"]["quote"]
    assert quote_schema["maxLength"] == resume_ai.MAX_QUOTE_CHARS
    work_evidence_schema = schema["$defs"]["ReviewCheckSchema"]["properties"]["evidence"]
    assert work_evidence_schema["maxItems"] == 1
    assert "recommendations" not in schema["properties"]
    assert "skill_roadmap" not in schema["properties"]
    assert schema["$defs"]["WorkSampleSchema"]["properties"]["technologies"]["maxItems"] == 6
    assert set(schema["required"]) == set(schema["properties"])
    assert schema["properties"]["evaluations"].get("maxItems") is None


def test_every_reply_array_has_a_strict_backend_maximum():
    schema = resume_ai.ResumeReply.model_json_schema()
    arrays = []

    def visit(value, path="$schema"):
        if not isinstance(value, dict):
            return
        if value.get("type") == "array":
            arrays.append((path, value))
        for key, child in value.items():
            if isinstance(child, dict):
                visit(child, f"{path}.{key}")
            elif isinstance(child, list):
                for index, item in enumerate(child):
                    visit(item, f"{path}.{key}[{index}]")

    visit(schema)
    assert arrays
    assert all("maxItems" in value for _, value in arrays), [
        path for path, value in arrays if "maxItems" not in value
    ]

    missing_required = []
    def check_required(value, path="$schema"):
        if not isinstance(value, dict):
            return
        properties = value.get("properties")
        if value.get("type") == "object" and properties:
            required = set(value.get("required", []))
            if set(properties) != required:
                missing_required.append((path, sorted(set(properties) - required)))
        for key, child in value.items():
            if isinstance(child, dict):
                check_required(child, f"{path}.{key}")
            elif isinstance(child, list):
                for index, item in enumerate(child):
                    check_required(item, f"{path}.{key}[{index}]")

    check_required(schema)
    assert not missing_required


def test_gemini_rejection_log_has_complete_safe_error_and_request_shape(fake_gemini, caplog):
    details = [{
        "@type": "type.googleapis.com/google.rpc.BadRequest",
        "fieldViolations": [{
            "field": "generation_config.response_schema",
            "description": "Unknown name additional_properties",
        }],
    }]
    fake_gemini(gemini_error(400, "INVALID_ARGUMENT", details))
    caplog.set_level(logging.ERROR, logger="pathwayai.llm")

    with pytest.raises(llm.AIServiceError):
        run()

    assert '"status":"INVALID_ARGUMENT"' in caplog.text
    assert '"fieldViolations"' in caplog.text
    assert '"model":"gemini-2.5-flash-lite"' in caplog.text
    assert '"mime_type":"application/pdf"' in caplog.text
    assert '"temperature":0' in caplog.text
    assert '"max_output_tokens":8192' in caplog.text
    assert '"response_mime_type":"application/json"' in caplog.text
    assert '"safety_settings":"not_set"' in caplog.text
    assert SECRET not in caplog.text and "jane.resume@example.com" not in caplog.text


def test_resume_prompt_states_every_free_text_limit():
    prompt = build_resume_evidence_prompt(CAREER, rubric(), [
        {"position": index, "title": title, "description": "", "tasks": []}
        for index, title in enumerate(STEPS, start=1)
    ], RESUME_PAGES)
    assert "summary` is at most 350 characters" in prompt
    assert "evaluation `note` is at most 180 characters" in prompt
    assert "project/job check `note` is at most 160" in prompt
    assert "recommendations" not in prompt
    assert "skill_roadmap" not in prompt
    assert "Quotes must be 3" in prompt
    assert "single uninterrupted, contiguous substring" in prompt
    assert "1–5 independently verifiable evidence excerpts" in prompt
    assert "put each span in a separate evidence entry" in prompt
    assert "For `standard_sections`, cite each observed heading separately" in prompt
    assert "Never concatenate a list of headings into a single quote" in prompt
    assert "Each evaluation has at most 5 evidence entries" in prompt
    assert "Each project/job check may contain at most one evidence entry" in prompt
    assert "spreadsheets, dashboards, databases, reporting, analytics, or automation tooling" in prompt.casefold()


def test_internship_prompt_relaxes_experience_expectations_without_weakening_evidence():
    prompt = build_resume_evidence_prompt(CAREER, rubric(), [], RESUME_PAGES, target_level="internship")

    assert "Target level: internship" in prompt
    assert "Do not require professional work experience" in prompt
    assert "`found:true` requires at least one verified quote" in prompt


@pytest.mark.parametrize("career,skills", [
    ("Software Engineer Intern", ["Python", "Git"]),
    ("Data Analyst", ["SQL", "Tableau"]),
    ("Machine Learning Engineer", ["Python", "TensorFlow"]),
    ("Cybersecurity Analyst", ["Linux", "Networking"]),
])
def test_domain_resume_fixtures_produce_a_valid_scored_analysis(fake_gemini, career, skills):
    fake_gemini(reply(career=career, skills=skills))
    result = analyze_resume(make_pdf(), career, skills, STEPS)
    assert result["analysis"]["summary"]
    assert result["analysis"]["score_report"]["overall"] >= 0


def test_oversized_summary_is_compacted_without_prompt_retry(fake_gemini):
    models = fake_gemini(reply(summary="x" * 351))
    result = run()
    assert len(result["analysis"]["summary"]) <= 300
    assert models.calls == 1


def test_unverifiable_section_quote_is_dropped_without_prompt_retry(fake_gemini):
    bad = reply()
    item = next(e for e in bad["evaluations"] if e["criterion_id"] == "standard_sections")
    item["evidence"][0]["quote"] = "Skills\nInvented achievement\nProjects"
    models = fake_gemini(bad)
    result = run()
    assert result["analysis"]["score_report"]["overall"] >= 0
    assert models.calls == 1


@pytest.mark.parametrize("criterion_id", ["standard_sections", "standard_headings", "section_order"])
def test_noncontiguous_section_headings_split_into_individually_verified_quotes(criterion_id):
    source = RESUME_PAGES[0]
    pages = extract_resume_pages(make_pdf(pages=[source]))
    data = reply()
    item = next(e for e in data["evaluations"] if e["criterion_id"] == criterion_id)
    item["found"] = True
    item["evidence"] = [{
        "source": "resume_text", "page": 1,
        "quote": "Skills\nProjects\nExperience\nEducation",
    }]

    parsed, _ = parse_resume_reply(json.dumps(data), rubric(), pages, len(STEPS))

    evidence = parsed["evaluations_by_id"][criterion_id]["evidence"]
    assert [item["quote"] for item in evidence] == ["Skills", "Projects", "Experience", "Education"]
    assert all(resume_ai._quote_matches_source(item["quote"], pages[0]) for item in evidence)


def test_five_stitched_real_section_headings_from_live_gemini_are_verified_separately():
    data = reply()
    item = next(e for e in data["evaluations"] if e["criterion_id"] == "standard_sections")
    # Captured live Gemini behavior: it concatenated five real headings while
    # omitting the source text between them. Each heading exists on the page,
    # but the combined quote is not a contiguous source excerpt.
    item["evidence"] = [{
        "source": "resume_text", "page": 1,
        "quote": "Skills\nProjects\nExperience\nEducation\nCertifications",
    }]

    parsed, _ = parse(data)

    evidence = parsed["evaluations_by_id"]["standard_sections"]["evidence"]
    assert [citation["quote"] for citation in evidence] == [
        "Skills", "Projects", "Experience", "Education", "Certifications",
    ]
    assert all(resume_ai._quote_matches_source(citation["quote"], RESUME_PAGES[0]) for citation in evidence)


def test_live_gemini_noncontiguous_date_anchors_become_individually_verified_quotes():
    fixture = json.loads((Path(__file__).parent / "fixtures" /
                          "gemini-noncontiguous-date-evidence.json").read_text(encoding="utf-8"))
    assert fixture["capture"]["source"].startswith("Actual Gemini")
    data = reply()
    for item in data["evaluations"]:
        item["found"] = False
        item["evidence"] = []
    item = next(e for e in data["evaluations"] if e["criterion_id"] == "date_consistency")
    item.update(found=True, evidence=[{
        "source": "resume_text", "page": 1, "quote": fixture["quote"],
    }])

    parsed, _ = parse_resume_reply(json.dumps(data), rubric(), [fixture["source_page"]], len(STEPS))

    evidence = parsed["evaluations_by_id"]["date_consistency"]["evidence"]
    assert [citation["quote"] for citation in evidence] == fixture["quote"].splitlines()
    assert all(resume_ai._quote_matches_source(citation["quote"], fixture["source_page"])
               for citation in evidence)


def test_live_gemini_work_sample_global_ids_are_dropped_and_missing_checks_score_zero():
    fixture = json.loads((Path(__file__).parent / "fixtures" /
                          "gemini-work-sample-mismatched-checks.json").read_text(encoding="utf-8"))
    assert fixture["capture"]["source"].startswith("Actual Gemini")
    data = reply()
    project = sample_work_reviews()[0][0]
    valid_checks = {check["criterion_id"]: check for check in project["checks"]}
    project["checks"] = [
        valid_checks.get(criterion_id, {
            "criterion_id": criterion_id, "found": False, "evidence": [],
            "note": "Not assessed in the captured sample.",
        })
        for criterion_id in fixture["project_check_ids"]
    ]
    data["project_reviews"] = [project]

    parsed, diagnostics = parse(data)

    review = parsed["project_reviews_by_item"][0]
    assert len(review["found_checks"]) + len(review["missing_checks"]) == len(resume_ai._PROJECT_CHECK_IDS)
    assert {"project_architecture", "project_apis", "project_testing"} <= set(review["missing_checks"])
    assert not ({"project_outcome", "project_demo"} & set(review["found_checks"] + review["missing_checks"]))
    assert diagnostics["dropped"] == ["project_reviews.0.checks:criterion_set_mismatch"]


def test_live_gemini_oversized_contiguous_section_order_quote_becomes_short_verified_headings():
    fixture = json.loads((Path(__file__).parent / "fixtures" /
                          "gemini-long-section-order-quote.json").read_text(encoding="utf-8"))
    assert fixture["capture"]["source"].startswith("Actual Gemini")
    assert len(fixture["quote"]) > resume_ai.MAX_QUOTE_CHARS
    data = reply()
    for item in data["evaluations"]:
        item["found"] = False
        item["evidence"] = []
    item = next(e for e in data["evaluations"] if e["criterion_id"] == "section_order")
    item.update(found=True, evidence=[{"source": "resume_text", "page": 1, "quote": fixture["quote"]}])

    parsed, _ = parse_resume_reply(json.dumps(data), rubric(), [fixture["source_page"]], len(STEPS))

    evidence = parsed["evaluations_by_id"]["section_order"]["evidence"]
    assert [citation["quote"] for citation in evidence] == [
        "Profile", "Skills", "Projects", "Experience", "Education",
    ]
    assert all(len(citation["quote"]) <= resume_ai.MAX_QUOTE_CHARS for citation in evidence)
    assert all(resume_ai._quote_matches_source(citation["quote"], fixture["source_page"])
               for citation in evidence)


def test_six_evidence_items_remain_invalid_for_non_heading_criteria():
    data = reply()
    item = next(e for e in data["evaluations"] if e["criterion_id"] == "skill_1")
    item["evidence"] *= 6

    with pytest.raises(AIOutputError):
        parse(data)


def test_section_order_heading_split_preserves_the_document_order():
    data = reply()
    item = next(e for e in data["evaluations"] if e["criterion_id"] == "section_order")
    item["found"] = True
    item["evidence"] = [{
        "source": "resume_text", "page": 1,
        "quote": "Education\nProjects\nExperience\nSkills",
    }]

    with pytest.raises(AIOutputError, match="quote:not_in_source"):
        parse(data)


def test_heading_split_does_not_accept_invented_text_between_real_headings():
    data = reply()
    item = next(e for e in data["evaluations"] if e["criterion_id"] == "standard_sections")
    item["evidence"] = [{
        "source": "resume_text", "page": 1,
        "quote": "Skills\nInvented achievement\nProjects",
    }]

    with pytest.raises(AIOutputError, match="quote:not_in_source"):
        parse(data)


def test_out_of_range_skill_position_is_rejected_against_saved_position_enum(fake_gemini):
    bad = reply()
    bad["skill_roadmap"][0]["step_positions"] = [0]
    models = fake_gemini(bad, bad)
    with pytest.raises(llm.AIServiceError):
        run()
    assert models.calls == 2
    positions = models.configs[0].response_schema["$defs"]["SkillRoadmapSchema"]["properties"]["step_positions"]["items"]
    assert positions["minimum"] == 1 and positions["maximum"] == 3


def test_zero_based_saved_roadmap_positions_are_valid_and_preserved():
    data = reply()
    data["skill_roadmap"][0]["step_positions"] = [0]
    data["skill_roadmap"][1]["step_positions"] = [2]

    parsed, _ = parse_resume_reply(json.dumps(data), rubric(), RESUME_PAGES, [0, 1, 2])

    assert parsed["skill_roadmap"][0]["step_positions"] == [0]
    assert parsed["skill_roadmap"][1]["step_positions"] == [2]
    schema = resume_ai._gemini_response_schema([0, 1, 2])
    bounds = schema["$defs"]["SkillRoadmapSchema"]["properties"]["step_positions"]["items"]
    assert bounds["minimum"] == 0 and bounds["maximum"] == 2


def test_every_citation_is_verified_against_the_claimed_page():
    data = reply()
    item = next(e for e in data["evaluations"] if e["criterion_id"] == "project_outcome")
    item["evidence"][0]["page"] = 2
    with pytest.raises(AIOutputError, match="not_in_source"):
        parse(data)


def test_separate_headings_use_independent_verified_citations():
    data = reply()
    item = next(e for e in data["evaluations"] if e["criterion_id"] == "standard_sections")
    item["evidence"] = [
        {"source": "resume_text", "page": 1, "quote": heading}
        for heading in ("Skills", "Projects", "Experience", "Education")
    ]

    parsed, _ = parse_resume_reply(json.dumps(data), rubric(), RESUME_PAGES, len(STEPS))

    assert len(parsed["evaluations_by_id"]["standard_sections"]["evidence"]) == 4


def test_persisted_report_keeps_representative_verified_evidence_without_score_changes():
    repeated = [{"source": "resume_text", "page": 1, "quote": "Built a SQL dashboard"} for _ in range(4)]
    evaluations = {
        "project_outcome": {"found": True, "evidence": repeated, "note": "Evidence found."},
        "standard_sections": {"found": True, "evidence": repeated, "note": "Headings found."},
    }

    compacted = resume_ai._compact_report_evidence(evaluations)

    assert len(compacted["project_outcome"]["evidence"]) == 1
    assert len(compacted["standard_sections"]["evidence"]) == 4
    assert evaluations["project_outcome"]["evidence"] == repeated


def test_overlong_quote_is_rejected_instead_of_rewritten_after_generation():
    data = reply()
    source_start = RESUME_PAGES[0].index("Built a SQL dashboard")
    long_quote = RESUME_PAGES[0][source_start:source_start + resume_ai.MAX_QUOTE_CHARS + 1]
    assert len(long_quote) > resume_ai.MAX_QUOTE_CHARS
    item = next(e for e in data["evaluations"] if e["criterion_id"] == "project_outcome")
    item["evidence"] = [{"source": "resume_text", "page": 1, "quote": long_quote}]

    with pytest.raises(AIOutputError, match="string_too_long") as error:
        parse_resume_reply(json.dumps(data), rubric(), RESUME_PAGES, len(STEPS))
    assert f"max={resume_ai.MAX_QUOTE_CHARS},actual={resume_ai.MAX_QUOTE_CHARS + 1}" in str(error.value)


def test_real_gemini_quote_length_boundary_300_is_kept_verbatim():
    data = reply()
    source_start = RESUME_PAGES[0].index("Built a SQL dashboard")
    quote = RESUME_PAGES[0][source_start:source_start + 300]
    item = next(e for e in data["evaluations"] if e["criterion_id"] == "project_outcome")
    item["evidence"] = [{"source": "resume_text", "page": 1, "quote": quote}]

    parsed, _ = parse_resume_reply(json.dumps(data), rubric(), RESUME_PAGES, len(STEPS))

    assert parsed["evaluations_by_id"]["project_outcome"]["evidence"][0]["quote"] == quote


def test_overlong_quote_without_verifiable_prefix_still_fails():
    data = reply()
    item = next(e for e in data["evaluations"] if e["criterion_id"] == "project_outcome")
    item["evidence"] = [{"source": "resume_text", "page": 1, "quote": "invented " * 50}]

    with pytest.raises(AIOutputError, match="string_too_long"):
        parse(data)


def test_citation_can_match_whitespace_and_unicode_normalization():
    source = RESUME_PAGES[0].replace(
        "Built a SQL dashboard that improved weekly reporting accuracy by 20%.",
        "Built a SQL dashboard\nthat improved weekly reporting accuracy by 20%.",
    )
    pages = [source, RESUME_PAGES[1]]
    data = reply()
    item = next(e for e in data["evaluations"] if e["criterion_id"] == "project_outcome")
    item["evidence"] = [{"source": "resume_text", "page": 1,
                         "quote": "Built a SQL dashboard that improved weekly reporting accuracy by 20%."}]
    rubric_data = rubric()
    parsed, _ = parse_resume_reply(json.dumps(data), rubric_data, pages, len(STEPS))
    assert parsed["evaluations_by_id"]["project_outcome"]["found"]


@pytest.mark.parametrize("quote", [
    "Built an API driven dashboard improving reporting",
    "**Built an API-driven dashboard** — improving reporting",
    "Built an API driven dashboard improving",
])
def test_citation_accepts_real_pdf_extraction_formatting_and_truncation(quote):
    source = "Experience\n• Built an “API-driven” dashboard — improving reporting.\nSkills: Python, SQL.\n"
    # Exercise pypdf's actual extracted text rather than a hand-written page.
    pages = extract_resume_pages(make_pdf(pages=[source * 8]))
    data = reply()
    for evaluation in data["evaluations"]:
        evaluation["found"] = False
        evaluation["evidence"] = []
    target = next(item for item in data["evaluations"] if item["criterion_id"] == "project_technology")
    target.update(found=True, evidence=[{"source": "resume_text", "page": 1, "quote": quote}])

    parsed, _ = parse_resume_reply(json.dumps(data), rubric(), pages, len(STEPS))
    assert parsed["evaluations_by_id"]["project_technology"]["found"]


def test_verified_spreadsheet_project_evidence_backfills_project_technology_when_model_misses_it():
    data = reply()
    original = "Built a SQL dashboard that improved weekly reporting accuracy by 20%."
    replacement = "Built a spreadsheet reporting project that improved weekly report accuracy by 15%."
    for evaluation in data["evaluations"]:
        for citation in evaluation["evidence"]:
            if citation["quote"] == original:
                citation["quote"] = replacement
    target = next(item for item in data["evaluations"] if item["criterion_id"] == "project_technology")
    target.update(found=False, evidence=[], note="No named technology identified.")
    outcome = next(item for item in data["evaluations"] if item["criterion_id"] == "project_outcome")
    outcome["evidence"] = [{
        "source": "resume_text", "page": 1,
        "quote": replacement,
    }]
    pages = [RESUME_PAGES[0].replace(
        original, replacement,
    ), RESUME_PAGES[1]]

    parsed, _ = parse_resume_reply(json.dumps(data), rubric(), pages, len(STEPS), tolerant=True)

    technology = parsed["evaluations_by_id"]["project_technology"]
    assert technology["found"] is True
    assert technology["evidence"] == outcome["evidence"]


def test_citation_accepts_pdf_line_wrap_hyphenation():
    page = "Projects\nBuilt a data-driven dash-\nboard for weekly reporting.\n" * 8
    extracted = extract_resume_pages(make_pdf(pages=[page]))[0]
    assert resume_ai._quote_matches_source("Built a data-driven dashboard for weekly reporting", extracted)


def test_citation_rejects_unrelated_words_and_logs_no_resume_text(caplog):
    page = "Projects\n• Built a Python dashboard for weekly reporting.\n" * 8
    extracted = extract_resume_pages(make_pdf(pages=[page]))[0]
    caplog.set_level(logging.WARNING, logger="pathwayai.resume_ai")

    assert not resume_ai._quote_matches_source("Built a Kubernetes cluster for production traffic", extracted)
    data = reply()
    target = next(item for item in data["evaluations"] if item["found"])
    target["evidence"] = [{"source": "resume_text", "page": 1,
                           "quote": "Built a Kubernetes cluster for production traffic"}]
    with pytest.raises(AIOutputError, match="not_in_source"):
        parse_resume_reply(json.dumps(data), rubric(), [extracted], len(STEPS))
    assert "quote_chars" in caplog.text and "page_tokens" in caplog.text
    assert "surrounding_page_text" not in caplog.text
    assert "Kubernetes" not in caplog.text and "Python dashboard" not in caplog.text


@pytest.mark.parametrize("mutation", ["missing", "duplicate", "unknown"])
def test_evaluation_list_must_cover_each_expected_criterion_once(mutation):
    data = reply()
    if mutation == "missing":
        data["evaluations"].pop()
    elif mutation == "duplicate":
        data["evaluations"][-1] = dict(data["evaluations"][0])
    else:
        data["evaluations"][0]["criterion_id"] = "imaginary"
    with pytest.raises(AIOutputError, match="criterion_set_mismatch"):
        parse(data)


def test_short_exact_technology_citation_is_allowed():
    data = reply()
    item = next(e for e in data["evaluations"] if e["criterion_id"] == "skill_1")
    item["evidence"][0]["quote"] = "SQL"
    parsed, _ = parse(data)
    assert parsed["evaluations_by_id"]["skill_1"]["evidence"][0]["quote"] == "SQL"


def test_found_evaluation_requires_source_quote_and_missing_one_cannot_have_it():
    data = reply()
    found = next(e for e in data["evaluations"] if e["found"])
    found["evidence"] = []
    with pytest.raises(AIOutputError, match="evidence:required"):
        parse(data)
    data = reply()
    missing = next(e for e in data["evaluations"] if not e["found"])
    missing["evidence"] = [{"source": "resume_text", "page": 1, "quote": "SQL, Python"}]
    with pytest.raises(AIOutputError, match="evidence:unexpected"):
        parse(data)


def test_unknown_score_fields_and_malformed_json_are_rejected():
    data = reply()
    data["score"] = 88
    with pytest.raises(AIOutputError):
        parse(data)
    for malformed in ("not json", '{"a":1,"a":2}', json.dumps(reply())[:-1]):
        with pytest.raises(AIOutputError):
            parse_resume_reply(malformed, rubric(), RESUME_PAGES, len(STEPS))


def test_non_resume_cannot_return_findings(fake_gemini):
    data = reply(is_resume=False, summary="This does not appear to be a résumé.", evaluations=[],
                 recommendations=[], skill_roadmap=[])
    models = fake_gemini(data)
    with pytest.raises(ResumeInputError) as error:
        run()
    assert error.value.kind == "not_resume" and models.calls == 1


@pytest.mark.parametrize("pages", [[""], ["Brief profile only."], ["x" * 40]])
def test_empty_or_near_empty_pdf_returns_no_score_without_calling_gemini(fake_gemini, pages):
    models = fake_gemini(reply())
    result = analyze_resume(make_pdf(pages=pages), CAREER, SKILLS, STEPS)
    report = result["analysis"]["score_report"]
    assert report["status"] == "insufficient_evidence"
    assert report["overall"] == report["ats"]["score"] == 0
    assert set(report["readiness"].values()) == {0}
    assert report["confidence"]["level"] == "very_low"
    assert "Unable to score reliably" in result["analysis"]["summary"]
    assert models.calls == 0


def test_pdf_pages_and_text_are_extracted_only_for_this_request():
    pages = extract_resume_pages(make_pdf())
    assert len(pages) == 2
    assert "Built a SQL dashboard" in pages[0]
    assert "Additional projects" in pages[1]


def test_pdf_over_page_limit_is_rejected():
    models = None
    with pytest.raises(ResumeInputError) as error:
        analyze_resume(make_pdf(pages=["resume evidence " * 30] * (resume_ai.MAX_PDF_PAGES + 1)), CAREER, SKILLS, STEPS)
    assert error.value.kind == "unreadable"


def test_pdf_size_bounds_and_signature_are_checked_before_parsing():
    check_pdf(make_pdf(size=resume_ai.MIN_PDF_BYTES))
    check_pdf(make_pdf(size=resume_ai.MAX_PDF_BYTES))
    for data, kind in [
        (b"", "too_small"), (b"%PDF-x" + b"a" * 1018, "not_pdf"),
        (make_pdf(size=resume_ai.MAX_PDF_BYTES + 1), "too_large"),
        (b"PK\x03\x04" + make_pdf()[4:], "not_pdf"),
        (make_pdf().replace(b"%%EOF", b"%%END"), "not_pdf"),
    ]:
        with pytest.raises(ResumeInputError) as error:
            check_pdf(data)
        assert error.value.kind == kind


def test_recommendations_with_found_or_unknown_rubric_references_never_reach_report():
    data = reply()
    data["recommendations"][0]["criterion_ids"] = ["project_outcome"]
    parsed, diagnostics = parse(data)
    assert diagnostics["dropped"] == ["recommendations.0.criterion_ids:invalid_reference"]
    assert all("project_outcome" not in item["criterion_ids"] for item in parsed["recommendations"])
    data = reply()
    data["recommendations"][0]["criterion_ids"] = ["not_a_criterion"]
    parsed, diagnostics = parse(data)
    assert diagnostics["dropped"] == ["recommendations.0.criterion_ids:invalid_reference"]
    assert all("not_a_criterion" not in item["criterion_ids"] for item in parsed["recommendations"])


def test_roadmap_skill_links_must_use_real_skill_ids_and_steps():
    data = reply()
    data["skill_roadmap"][0]["step_positions"] = [len(STEPS) + 1]
    with pytest.raises(AIOutputError, match="out_of_range"):
        parse(data)
    data = reply()
    data["skill_roadmap"][0]["skill_id"] = "other"
    with pytest.raises(AIOutputError, match="skill_set_mismatch"):
        parse(data)


@pytest.mark.parametrize("field", ["summary", "note", "quote", "recommendation"])
def test_private_contact_details_are_never_returned_or_saved(field):
    data = reply()
    if field == "summary":
        data["summary"] = "Contact jane@example.com for details."
    elif field == "note":
        data["evaluations"][0]["note"] = "Contact jane@example.com."
    elif field == "quote":
        data["evaluations"][0]["evidence"][0]["quote"] = "Email jane@example.com"
    else:
        data["recommendations"][0]["action"] = "Call 555-123-4567."
    with pytest.raises(AIOutputError) as error:
        parse(data)
    assert error.value.kind == "personal_data"
    assert "jane@example.com" not in str(error.value)


def test_contact_detection_is_redacted_and_pdf_text_is_not_saved(fake_gemini):
    models = fake_gemini(reply())
    result = run()
    report = result["analysis"]["score_report"]
    contact = next(c for c in report["categories"] if c["id"] == "ats")["criteria"][0]
    assert contact["found"] is True
    assert "hidden" in contact["note"]
    saved = json.dumps(result, ensure_ascii=False)
    assert "jane.resume@example.com" not in saved
    assert "Built a SQL dashboard" in saved  # only the verified excerpt is retained
    assert models.calls == 1


def test_result_size_limit_prevents_oversized_persisted_report(monkeypatch, fake_gemini):
    monkeypatch.setattr(resume_ai, "MAX_ANALYSIS_BYTES", 300)
    fake_gemini(reply())
    with pytest.raises(AIOutputError) as error:
        run()
    assert error.value.kind == "too_large"


def test_malformed_resume_reply_is_retried_once(fake_gemini):
    models = fake_gemini("not json", reply())
    assert run()["analysis"]["score_report"]["overall"] >= 0
    assert models.calls == 2
    assert "REPAIR REQUEST" in models.prompts[1][1]


def test_persistently_malformed_resume_reply_has_a_typed_error(fake_gemini):
    models = fake_gemini("not json", "not json")
    with pytest.raises(llm.AIServiceError) as error:
        run()
    assert error.value.kind == "invalid_output"
    assert models.calls == 2


def test_gemini_errors_timeouts_and_no_key_keep_existing_error_behavior(fake_gemini, monkeypatch):
    models = fake_gemini(gemini_error(503, "UNAVAILABLE"), gemini_error(500, "INTERNAL"))
    with pytest.raises(llm.AIServiceError) as error:
        run()
    assert error.value.kind == "failed" and models.calls == 2
    models = fake_gemini(httpx.ReadTimeout("timeout"), reply())
    assert run()["analysis"] and models.calls == 2
    monkeypatch.setattr(llm, "client", None)
    with pytest.raises(llm.AIServiceError) as error:
        run()
    assert error.value.kind == "unavailable"


def test_no_resume_or_ai_reply_content_in_logs_or_errors(fake_gemini, caplog):
    caplog.set_level(logging.DEBUG)
    private = "ONLY-IN-UPLOAD-" + SECRET
    pages = [RESUME_PAGES[0] + "\n" + private]
    data = reply()
    data["evaluations"] = [item for item in data["evaluations"] if item["criterion_id"] != "skill_2"]
    fake_gemini(data)
    result = analyze_resume(make_pdf(pages=pages), CAREER, SKILLS, STEPS)
    assert result["analysis"]["score_report"]["overall"] >= 0
    assert SECRET not in caplog.text and private not in caplog.text
    assert "ONLY-IN-UPLOAD" not in caplog.text and "%PDF" not in caplog.text


def test_success_logs_only_safe_diagnostics(fake_gemini, caplog):
    caplog.set_level(logging.DEBUG)
    fake_gemini(reply())
    result = run()
    assert "resume attempt 1: ok" in caplog.text
    assert SECRET not in caplog.text and "jane.resume@example.com" not in caplog.text
    assert result["analysis"]["score_report"]["confidence"]["level"] == "low"


@pytest.mark.parametrize("raw,kind", [
    ("", "empty"), ("   ", "empty"), ("not json", "invalid_json"),
    ("fenced json", "invalid_json"), ("Here is the report {}", "invalid_json"),
    ('{"a":1,"a":2}', "invalid_json"), ("[1,2]", "not_object"), ('"text"', "not_object"),
])
def test_strict_reply_parser_does_not_repair_or_search_malformed_output(raw, kind):
    with pytest.raises(AIOutputError) as error:
        parse_resume_reply(raw, rubric(), RESUME_PAGES, len(STEPS))
    assert error.value.kind == kind


@pytest.mark.parametrize("field", [
    "is_resume", "summary", "evaluations", "recommendations", "skill_roadmap",
    "project_reviews", "experience_reviews",
])
def test_each_required_top_level_reply_field_is_mandatory(field):
    data = reply()
    del data[field]
    with pytest.raises(AIOutputError):
        parse(data)


def test_unknown_top_level_response_fields_are_rejected():
    data = reply()
    data["uncontracted_field"] = "must not be silently accepted"
    with pytest.raises(AIOutputError):
        parse(data)


def test_false_evaluation_with_evidence_reports_exact_contract_object(monkeypatch):
    data = reply()
    index = 16
    assert len(data["evaluations"]) > index
    fixture = json.loads((Path(__file__).parent / "fixtures" / "gemini-evaluation-false-evidence.json").read_text(encoding="utf-8"))
    data["evaluations"][index] = fixture["evaluation"]
    reports = []

    class Capture:
        def _write_json(self, filename, value):
            reports.append((filename, value))

        def save_comparison(self, detail):
            pass

        path = "local-debug-capture"

    monkeypatch.setattr(resume_ai, "_capture_contract_failure", resume_ai._capture_contract_failure)
    with pytest.raises(AIOutputError, match=r"evaluations\.16\.evidence:unexpected"):
        parse_resume_reply(json.dumps(data), rubric(), RESUME_PAGES, len(STEPS), Capture())

    filename, report = reports[-1]
    failure = report["failures"][0]
    assert filename == "validation-failure.json"
    assert failure["path"] == "evaluations[16]"
    assert failure["actual_object"]["found"] is False
    assert failure["actual_object"]["evidence"][0]["quote"].startswith("Built a SQL dashboard")
    assert failure["expected"]["evidence"] == []
    assert failure["unexpected_fields"] == []


def test_provider_schema_describes_found_evidence_dependency():
    schema = resume_ai._gemini_response_schema(len(STEPS), ["skill_1"])
    evaluation = schema["$defs"]["EvaluationSchema"]
    description = evaluation["properties"]["evidence"]["description"]
    assert "empty array" in description
    assert "found is true" in description
    assert "three highest-priority" in schema["properties"]["recommendations"]["description"]


@pytest.mark.parametrize("mutation", [
    lambda data: data.update(summary=None),
    lambda data: data.update(summary=5),
    lambda data: data.update(is_resume="true"),
    lambda data: data.update(evaluations="items"),
    lambda data: data["evaluations"][0].update(found=1),
    lambda data: data["evaluations"][0].update(note=""),
    lambda data: data["evaluations"][0].update(evidence="quote"),
    lambda data: data["evaluations"][0].update(extra_field="x"),
    lambda data: data["recommendations"][0].update(criterion_ids="skill_1"),
    lambda data: data["skill_roadmap"][0].update(step_positions=["1"]),
])
def test_wrong_types_and_unexpected_nested_fields_fail_closed(mutation):
    data = reply()
    mutation(data)
    with pytest.raises(AIOutputError):
        parse(data)


@pytest.mark.parametrize("mutation", [
    lambda data: data.update(summary="x" * 351),
    lambda data: data["evaluations"][0].update(note="x" * 181),
    lambda data: data["evaluations"][0]["evidence"][0].update(quote="x" * (resume_ai.MAX_QUOTE_CHARS + 1)),
    lambda data: data.update(recommendations=[data["recommendations"][0]] * 6),
    lambda data: data["recommendations"][0].update(criterion_ids=["project_demo"] * 5),
    lambda data: data.update(skill_roadmap=[data["skill_roadmap"][0]] * 9),
    lambda data: data["skill_roadmap"][0].update(step_positions=[1] * 6),
])
def test_reply_field_and_list_limits_are_rejected_not_truncated(mutation):
    data = reply()
    mutation(data)
    with pytest.raises(AIOutputError):
        parse(data)


@pytest.mark.parametrize("overflow", [
    lambda data: data.update(evaluations=data["evaluations"] * 2),
    lambda data: data.update(recommendations=[data["recommendations"][0]] * 6),
    lambda data: data.update(skill_roadmap=[data["skill_roadmap"][0]] * 9),
    lambda data: data.update(project_reviews=[sample_work_reviews()[0][0]] * 4),
    lambda data: data.update(experience_reviews=[sample_work_reviews()[1][0]] * 4),
    lambda data: data["evaluations"][0].update(evidence=data["evaluations"][0]["evidence"] * 5),
    lambda data: data["recommendations"][0].update(criterion_ids=["project_demo"] * 5),
    lambda data: data["skill_roadmap"][0].update(step_positions=[1] * 6),
    lambda data: data["project_reviews"].__setitem__(0, {**sample_work_reviews()[0][0], "technologies": ["x"] * 7}),
    lambda data: data["project_reviews"].__setitem__(0, {**sample_work_reviews()[0][0], "checks": sample_work_reviews()[0][0]["checks"] * 2}),
])
def test_every_response_array_limit_is_enforced_without_truncation(overflow):
    data = reply()
    projects, experience = sample_work_reviews()
    data["project_reviews"], data["experience_reviews"] = projects, experience
    overflow(data)
    with pytest.raises(AIOutputError):
        parse(data)


@pytest.mark.parametrize("overflow", [
    lambda data: data.update(summary="x" * 351),
    lambda data: data["recommendations"][0].update(title="x" * 81),
    lambda data: data["recommendations"][0].update(action="x" * 181),
    lambda data: data["evaluations"][0].update(criterion_id="x" * 41),
    lambda data: data["skill_roadmap"][0].update(skill_id="x" * 21),
    lambda data: data["project_reviews"][0].update(title="x" * 61),
    lambda data: data["project_reviews"][0].update(summary="x" * 301),
    lambda data: data["project_reviews"][0].update(technologies=["x" * 31]),
    lambda data: data["project_reviews"][0]["checks"][0].update(note="x" * 161),
    lambda data: data["project_reviews"][0]["bullet_rewrite"].update(suggestion="x" * 401),
])
def test_every_response_string_limit_is_enforced_without_truncation(overflow):
    data = reply()
    projects, experience = sample_work_reviews()
    data["project_reviews"], data["experience_reviews"] = projects, experience
    overflow(data)
    with pytest.raises(AIOutputError):
        parse(data)


def test_empty_recommendations_are_valid_and_do_not_create_fake_priority_steps(fake_gemini):
    result, _ = parse(reply(recommendations=[]))
    assert result["recommendations"] == []
    fake_gemini(reply(recommendations=[]))
    assert analyze_resume(make_pdf(), CAREER, SKILLS, STEPS)["analysis"]["score_report"]["recommendations"]


def test_reply_size_limit_is_checked_before_json_parsing():
    with pytest.raises(AIOutputError) as error:
        parse_resume_reply("x" * (resume_ai.MAX_REPLY_CHARS + 1), rubric(), RESUME_PAGES, len(STEPS))
    assert error.value.kind == "too_large"


@pytest.mark.parametrize("data,kind", [
    (b"", "too_small"), (b"%PDF-x" + b" " * 1018, "not_pdf"),
    (b"PK" + make_pdf()[2:], "not_pdf"), (b" " + make_pdf(), "not_pdf"),
    (make_pdf().replace(b"%%EOF", b"%%END"), "not_pdf"),
    (make_pdf() + b" " * 2048, "not_pdf"), (None, "not_pdf"),
])
def test_invalid_pdf_edges_are_rejected_before_the_model_call(fake_gemini, data, kind):
    models = fake_gemini(reply())
    with pytest.raises(ResumeInputError) as error:
        analyze_resume(data, CAREER, SKILLS, STEPS)
    assert error.value.kind == kind and models.calls == 0


def test_gemini_client_rejection_is_not_retried_and_has_no_provider_message(fake_gemini):
    models = fake_gemini(gemini_error(400, "INVALID_ARGUMENT"), reply())
    with pytest.raises(llm.AIServiceError) as error:
        run()
    assert error.value.kind == "failed" and models.calls == 1
    assert "INVALID_ARGUMENT" not in str(error.value)


def test_daily_quota_keeps_existing_user_safe_error_kind(fake_gemini):
    models = fake_gemini(gemini_error(429, "RESOURCE_EXHAUSTED", [
        {"violations": [{"quotaId": "GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]},
    ]))
    with pytest.raises(llm.AIServiceError) as error:
        run()
    assert error.value.kind == "quota" and models.calls == 1


def test_years_versions_and_large_counts_are_not_false_contact_details():
    from strict_ai import contains_contact_details

    assert not contains_contact_details("2019-2023, 1000-2000 records, Python 3.12")
