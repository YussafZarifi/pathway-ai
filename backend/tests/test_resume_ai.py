"""Evidence extraction, quote verification, score math and privacy tests."""

import json
import logging

import httpx
import pytest
from google.genai import errors as genai_errors

import llm
import resume_ai
from ai_output import AIOutputError
from conftest import SECRET
from prompts import RESUME_SYSTEM_INSTRUCTION, build_resume_evidence_prompt
from resume_ai import ResumeInputError, analyze_resume, check_pdf, extract_resume_pages, parse_resume_reply
from resume_scoring import rubric_for
from resume_fixtures import CAREER, RESUME_PAGES, SKILLS, STEPS, make_pdf, reply


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
    assert analysis["score_report"]["overall"] == 64
    assert analysis["score_report"]["ats"]["score"] == 100
    assert analysis["matched_skills"] == ["SQL"] and analysis["missing_skills"] == ["Tableau"]
    assert analysis["score_report"]["recommendations"][0]["potential_points"] == 14.0
    assert result["career"] == CAREER and result["prompt_version"] == "r2"
    assert result["model"] == resume_ai.config.GEMINI_MODEL
    assert models.calls == 1


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
    assert models.configs[0].response_schema is resume_ai.ResumeAnalysisSchema
    assert models.configs[0].automatic_function_calling.disable is True


def test_gemini_resume_schema_uses_only_the_minimal_provider_shape():
    def walk(value):
        if isinstance(value, dict):
            for key, item in value.items():
                assert key not in {
                    "additionalProperties", "maxItems", "maxLength", "minItems",
                    "minLength", "minimum",
                }
                walk(item)
        elif isinstance(value, list):
            for item in value:
                walk(item)

    walk(resume_ai.ResumeAnalysisSchema.model_json_schema())


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
    assert "note` is at most 120 characters" in prompt
    assert "Quotes must be 3" in prompt
    assert "title` is at most 80 characters" in prompt
    assert "action` is at most 180 characters" in prompt


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


def test_invalid_resume_schema_reply_uses_one_corrective_regeneration(fake_gemini):
    models = fake_gemini(reply(summary="x" * 351), reply())
    assert run()["analysis"]["score_report"]["overall"] >= 0
    assert models.calls == 2
    assert models.prompts[0][1] != models.prompts[1][1]
    assert "Corrective retry" in models.prompts[1][1]


def test_every_citation_is_verified_against_the_claimed_page():
    data = reply()
    item = next(e for e in data["evaluations"] if e["criterion_id"] == "project_outcome")
    item["evidence"][0]["page"] = 2
    with pytest.raises(AIOutputError, match="not_in_source"):
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


def test_unreadable_upload_is_rejected_before_gemini(fake_gemini):
    models = fake_gemini(reply())
    with pytest.raises(ResumeInputError) as error:
        analyze_resume(make_pdf(pages=["x" * 40]), CAREER, SKILLS, STEPS)
    assert error.value.kind == "unreadable" and models.calls == 0


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


def test_recommendations_must_point_only_to_missing_rubric_criteria():
    data = reply()
    data["recommendations"][0]["criterion_ids"] = ["project_outcome"]
    with pytest.raises(AIOutputError, match="not_missing"):
        parse(data)
    data = reply()
    data["recommendations"][0]["criterion_ids"] = ["not_a_criterion"]
    with pytest.raises(AIOutputError, match="unknown"):
        parse(data)


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


@pytest.mark.parametrize("bad", ["not json", reply(evaluations=[]), reply(score=90)])
def test_invalid_resume_replies_fail_closed_after_one_corrective_regeneration(bad, fake_gemini):
    models = fake_gemini(bad, bad)
    with pytest.raises(llm.AIServiceError) as error:
        run()
    assert error.value.kind == "failed" and models.calls == 2
    assert models.prompts[0][1] != models.prompts[1][1]


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
    fake_gemini(data, data)
    with pytest.raises(llm.AIServiceError):
        analyze_resume(make_pdf(pages=pages), CAREER, SKILLS, STEPS)
    assert SECRET not in caplog.text and private not in caplog.text
    assert "ONLY-IN-UPLOAD" not in caplog.text and "%PDF" not in caplog.text


def test_success_logs_only_safe_diagnostics(fake_gemini, caplog):
    caplog.set_level(logging.DEBUG)
    fake_gemini(reply())
    result = run()
    assert "resume attempt 1: ok" in caplog.text
    assert SECRET not in caplog.text and "jane.resume@example.com" not in caplog.text
    assert result["analysis"]["score_report"]["confidence"]["level"] == "medium"


@pytest.mark.parametrize("raw,kind", [
    ("", "empty"), ("   ", "empty"), ("not json", "invalid_json"),
    ("fenced json", "invalid_json"), ("Here is the report {}", "invalid_json"),
    ('{"a":1,"a":2}', "invalid_json"), ("[1,2]", "not_object"), ('"text"', "not_object"),
])
def test_strict_reply_parser_does_not_repair_or_search_malformed_output(raw, kind):
    with pytest.raises(AIOutputError) as error:
        parse_resume_reply(raw, rubric(), RESUME_PAGES, len(STEPS))
    assert error.value.kind == kind


@pytest.mark.parametrize("field", ["is_resume", "summary", "evaluations", "recommendations", "skill_roadmap"])
def test_each_required_top_level_reply_field_is_mandatory(field):
    data = reply()
    del data[field]
    with pytest.raises(AIOutputError):
        parse(data)


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
    lambda data: data["evaluations"][0].update(note="x" * 121),
    lambda data: data["evaluations"][0]["evidence"][0].update(quote="x" * 161),
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


def test_empty_recommendations_are_valid_and_do_not_create_fake_priority_steps(fake_gemini):
    result, _ = parse(reply(recommendations=[]))
    assert result["recommendations"] == []
    fake_gemini(reply(recommendations=[]))
    assert analyze_resume(make_pdf(), CAREER, SKILLS, STEPS)["analysis"]["score_report"]["recommendations"] == []


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
