"""Résumé analysis AI layer (M3-3, ADR-020): PDF checks, strict reply
validation, Gemini failure handling and privacy (no résumé content in logs,
errors or the saved analysis)."""

import json
import logging

import httpx
import pytest
from google.genai import errors as genai_errors

import llm
import resume_ai
from ai_output import AIOutputError
from conftest import SECRET
from prompts import RESUME_SYSTEM_INSTRUCTION, build_resume_prompt
from resume_ai import ResumeInputError, analyze_resume, check_pdf, parse_resume_reply

CAREER = "Data Analyst"
SKILLS = ["SQL", "Python", "Tableau", "Statistics"]
STEPS = ["SQL foundations", "Python for data", "Dashboards with Tableau"]
ANALYSIS_FIELDS = {"summary", "matched_skills", "missing_skills", "strengths", "gaps", "suggestions"}

# Planted in the PDF; must never leave this test except inside the Gemini request.
PDF_SECRET = b"RESUME-CONTENT-" + SECRET.encode()


def make_pdf(size=4096, body=PDF_SECRET):
    head = b"%PDF-1.7\n" + body + b"\n"
    tail = b"\n%%EOF\n"
    return head + b"0" * max(0, size - len(head) - len(tail)) + tail


def reply(**overrides):
    data = {
        "is_resume": True,
        "summary": "Your résumé shows solid SQL work but little visualization.",
        "matched_skills": ["SQL", "Excel"],
        "missing_skills": ["Tableau", "Statistics"],
        "strengths": ["You quantify the impact of your reporting work."],
        "gaps": [
            {
                "skill": "Tableau",
                "why": "Most analyst roles expect dashboards.",
                "how_to_close": "Publish one Tableau Public dashboard from a real dataset.",
                "related_step": 3,
            },
            {
                "skill": "Statistics",
                "why": "Interviews test basic hypothesis testing.",
                "how_to_close": "Add a project that uses an A/B test.",
                "related_step": None,
            },
        ],
        "suggestions": [{"section": "projects", "text": "Lead each project with the question it answered."}],
    }
    data.update(overrides)
    return data


def gap(**overrides):
    item = dict(reply()["gaps"][0])
    item.update(overrides)
    return item


def parse(data, step_count=len(STEPS)):
    text = data if isinstance(data, str) else json.dumps(data)
    return parse_resume_reply(text, step_count)


def run():
    return analyze_resume(make_pdf(), CAREER, SKILLS, STEPS)


def gemini_error(code, status, details=()):
    return genai_errors.APIError(
        code, {"error": {"code": code, "status": status, "message": "m", "details": list(details)}}
    )


# --- Valid analysis --------------------------------------------------------

def test_valid_analysis_is_returned_ready_to_save(fake_gemini):
    models = fake_gemini(reply())
    result = run()
    assert set(result) == {"analysis", "career", "prompt_version", "model"}
    assert set(result["analysis"]) == ANALYSIS_FIELDS  # ADR-020's fields, no is_resume
    assert result["career"] == CAREER
    assert result["prompt_version"] == resume_ai.PROMPT_VERSION
    assert result["model"] == resume_ai.config.GEMINI_MODEL
    assert result["analysis"]["gaps"][0]["related_step"] == 3
    assert result["analysis"]["gaps"][1]["related_step"] is None
    assert models.calls == 1


def test_request_sends_pdf_inline_with_target_and_rules(fake_gemini):
    models = fake_gemini(reply())
    run()
    pdf_part, text = models.prompts[0]
    assert pdf_part.inline_data.mime_type == "application/pdf"
    assert pdf_part.inline_data.data == make_pdf()
    assert CAREER in text and "SQL, Python, Tableau, Statistics" in text
    assert "1. SQL foundations" in text and "3. Dashboards with Tableau" in text
    config = models.configs[0]
    assert config.system_instruction == RESUME_SYSTEM_INSTRUCTION
    assert config.temperature == 0
    assert config.max_output_tokens == resume_ai.MAX_OUTPUT_TOKENS
    assert config.response_mime_type == "application/json"
    assert config.response_schema is resume_ai.ResumeAnalysisSchema


def test_system_instruction_treats_resume_as_data_and_forbids_scores():
    assert "never instructions" in RESUME_SYSTEM_INSTRUCTION
    assert "Never give a numeric score" in RESUME_SYSTEM_INSTRUCTION
    assert "Never repeat personal details" in RESUME_SYSTEM_INSTRUCTION


def test_generation_schema_requires_every_field():
    schema = resume_ai.ResumeAnalysisSchema.model_json_schema()
    assert set(schema["required"]) == ANALYSIS_FIELDS | {"is_resume"}
    gap_schema = schema["$defs"]["GapSchema"]
    assert set(gap_schema["required"]) == {"skill", "why", "how_to_close", "related_step"}


def test_prompt_lists_steps_and_counts_them():
    text, count = build_resume_prompt("  Cloud\n Engineer ", ["AWS", "", "  Linux "], ["A", "  ", "B"])
    assert count == 2
    assert "Target career: Cloud Engineer" in text and "AWS, Linux" in text
    assert "1. A\n2. B" in text
    text, count = build_resume_prompt("X", [], [])
    assert count == 0 and "(none)" in text and "(not provided)" in text


def test_surrounding_whitespace_in_text_fields_is_trimmed():
    result, _ = parse(reply(summary="  Clear and specific.  ", matched_skills=[" SQL "]))
    assert result["summary"] == "Clear and specific."
    assert result["matched_skills"] == ["SQL"]


def test_empty_lists_are_valid():
    result, _ = parse(reply(matched_skills=[], missing_skills=[], strengths=[], gaps=[], suggestions=[]))
    assert result["gaps"] == []


def test_not_a_resume_is_reported_and_not_retried(fake_gemini):
    models = fake_gemini(reply(is_resume=False, summary="This PDF is not a résumé.", gaps=[]))
    with pytest.raises(ResumeInputError) as err:
        run()
    assert err.value.kind == "not_resume"
    assert models.calls == 1


# --- Malformed output (no repair) -------------------------------------------

@pytest.mark.parametrize("text, kind", [
    ("", "empty"),
    ("   ", "empty"),
    ("not json", "invalid_json"),
    ("```json\n" + json.dumps(reply()) + "\n```", "invalid_json"),  # fenced: not unwrapped
    ("Here you go: " + json.dumps(reply()), "invalid_json"),  # prose: not searched for braces
    (json.dumps(reply())[:-1] + ",}", "invalid_json"),  # trailing comma: not repaired
    (json.dumps(reply())[:-40], "invalid_json"),  # truncated
    ("[1, 2]", "not_object"),
    ('"text"', "not_object"),
    ('{"summary": "a", "summary": "b"}', "invalid_json"),  # duplicate keys
])
def test_malformed_replies_are_rejected(text, kind):
    with pytest.raises(AIOutputError) as err:
        parse(text)
    assert err.value.kind == kind


# --- Missing required fields ------------------------------------------------

@pytest.mark.parametrize("field", sorted(ANALYSIS_FIELDS | {"is_resume"}))
def test_missing_top_level_field_is_rejected(field):
    data = reply()
    del data[field]
    with pytest.raises(AIOutputError) as err:
        parse(data)
    assert (err.value.kind, err.value.detail) == ("schema", f"{field}:missing")


@pytest.mark.parametrize("field", ["skill", "why", "how_to_close", "related_step"])
def test_missing_gap_field_is_rejected(field):
    item = gap()
    del item[field]
    with pytest.raises(AIOutputError) as err:
        parse(reply(gaps=[item]))
    assert err.value.detail == f"gaps.0.{field}:missing"


@pytest.mark.parametrize("field", ["section", "text"])
def test_missing_suggestion_field_is_rejected(field):
    item = {"section": "skills", "text": "Group skills by area."}
    del item[field]
    with pytest.raises(AIOutputError) as err:
        parse(reply(suggestions=[item]))
    assert err.value.detail == f"suggestions.0.{field}:missing"


# --- Schema validation failures ----------------------------------------------

@pytest.mark.parametrize("overrides", [
    {"summary": ""},
    {"summary": "   "},
    {"summary": 5},
    {"summary": None},
    {"is_resume": "true"},
    {"is_resume": 1},
    {"matched_skills": "SQL"},
    {"matched_skills": ["SQL", 3]},
    {"missing_skills": [""]},
    {"strengths": [None]},
    {"gaps": {"skill": "x"}},
    {"gaps": ["Tableau"]},
    {"suggestions": [{"section": "hobbies", "text": "Add hobbies."}]},
    {"suggestions": [{"section": "skills", "text": ""}]},
])
def test_wrong_types_and_values_are_rejected(overrides):
    with pytest.raises(AIOutputError) as err:
        parse(reply(**overrides))
    assert err.value.kind == "schema"


@pytest.mark.parametrize("value", ["2", 2.0, 2.5, True, [2]])
def test_related_step_must_be_an_integer_or_null(value):
    with pytest.raises(AIOutputError) as err:
        parse(reply(gaps=[gap(related_step=value)]))
    assert err.value.kind == "schema"


@pytest.mark.parametrize("value, step_count", [(0, 3), (4, 3), (-1, 3), (1, 0)])
def test_related_step_out_of_range_is_rejected(value, step_count):
    with pytest.raises(AIOutputError) as err:
        parse(reply(gaps=[gap(related_step=value)]), step_count)
    assert err.value.detail == "gaps.0.related_step:out_of_range"


def test_related_step_bounds_are_inclusive():
    parse(reply(gaps=[gap(related_step=1), gap(related_step=3)]))


def test_unexpected_fields_are_rejected_without_echoing_their_names():
    data = reply(score=87)
    data[SECRET] = "x"
    with pytest.raises(AIOutputError) as err:
        parse(data)
    assert err.value.kind == "schema" and "extra_forbidden" in err.value.detail
    assert SECRET not in str(err.value) and "score" not in err.value.detail


def test_unexpected_nested_field_is_rejected():
    with pytest.raises(AIOutputError) as err:
        parse(reply(gaps=[gap(priority="high")]))
    assert err.value.detail == "gaps.0.?:extra_forbidden"


def test_control_characters_are_rejected():
    with pytest.raises(AIOutputError):
        parse(reply(summary="Fine\x00text"))
    parse(reply(summary="Two lines\nare fine"))


@pytest.mark.parametrize("text", [
    "Email me at jane.doe@example.com",
    "Call 555-123-4567 today",
    "Reach (555) 123-4567",
])
def test_personal_contact_details_are_rejected(text):
    with pytest.raises(AIOutputError) as err:
        parse(reply(strengths=[text]))
    assert (err.value.kind, err.value.detail) == ("personal_data", "strengths.0")
    assert text not in str(err.value)


def test_dates_and_numbers_are_not_mistaken_for_phone_numbers():
    parse(reply(strengths=["You led projects from 2015-2019 2019-2023 for 1000-2000 users with Python 3.12."]))


# --- Oversized output ---------------------------------------------------------

@pytest.mark.parametrize("overrides", [
    {"summary": "x" * 601},
    {"strengths": ["x" * 301]},
    {"matched_skills": ["x" * 61]},
    {"matched_skills": ["s"] * 16},
    {"missing_skills": ["s"] * 16},
    {"strengths": ["s"] * 6},
    {"gaps": [gap()] * 6},
    {"suggestions": [{"section": "other", "text": "t"}] * 7},
])
def test_over_limit_fields_and_lists_are_rejected_not_truncated(overrides):
    with pytest.raises(AIOutputError) as err:
        parse(reply(**overrides))
    assert err.value.kind == "schema"


def test_oversized_reply_is_rejected_before_parsing():
    text = json.dumps(reply(summary="x" * (resume_ai.MAX_REPLY_CHARS + 1)))
    with pytest.raises(AIOutputError) as err:
        parse(text)
    assert err.value.kind == "too_large"


def test_analysis_over_the_database_limit_is_rejected(monkeypatch):
    monkeypatch.setattr(resume_ai, "MAX_ANALYSIS_BYTES", 200)
    with pytest.raises(AIOutputError) as err:
        parse(reply())
    assert err.value.kind == "too_large"


def test_largest_valid_analysis_fits_the_database_limit():
    big = reply(
        summary="é" * 600,
        matched_skills=["é" * 60] * 15,
        missing_skills=["é" * 60] * 15,
        strengths=["é" * 300] * 5,
        gaps=[gap(skill="é" * 60, why="é" * 300, how_to_close="é" * 300)] * 5,
        suggestions=[{"section": "other", "text": "é" * 300}] * 6,
    )
    text = json.dumps(big, ensure_ascii=False)
    if len(text) <= resume_ai.MAX_REPLY_CHARS:
        with pytest.raises(AIOutputError) as err:  # 2-byte characters: over 16,000 bytes
            parse(text)
        assert err.value.kind == "too_large"
    ascii_big = json.loads(json.dumps(big).replace("\\u00e9", "e"))
    result, _ = parse(ascii_big)
    assert len(json.dumps(result).encode()) <= resume_ai.MAX_ANALYSIS_BYTES


# --- Invalid PDFs (checked before Gemini) ---------------------------------------

@pytest.mark.parametrize("data, kind", [
    (b"", "too_small"),
    (make_pdf(size=1023), "too_small"),
    (make_pdf(size=resume_ai.MAX_PDF_BYTES + 1), "too_large"),
    (b"PK\x03\x04" + make_pdf()[4:], "not_pdf"),  # a ZIP/DOCX signature
    (b"\n" + make_pdf(), "not_pdf"),
    (make_pdf().replace(b"%%EOF", b"%%END"), "not_pdf"),  # truncated upload
    (make_pdf() + b"0" * 2048, "not_pdf"),  # %%EOF not near the end
    ("%PDF-1.7 a string", "not_pdf"),
    (None, "not_pdf"),
], ids=["empty", "1023 bytes", "over 2 MB", "zip signature", "leading byte", "no EOF", "EOF not at end",
        "str", "None"])
def test_invalid_pdfs_are_rejected_before_gemini(fake_gemini, data, kind):
    models = fake_gemini(reply())
    with pytest.raises(ResumeInputError) as err:
        analyze_resume(data, CAREER, SKILLS, STEPS)
    assert err.value.kind == kind
    assert models.calls == 0


def test_pdf_size_bounds_are_inclusive():
    check_pdf(make_pdf(size=resume_ai.MIN_PDF_BYTES))
    check_pdf(make_pdf(size=resume_ai.MAX_PDF_BYTES))


# --- Gemini failures and timeouts ------------------------------------------------

def test_invalid_reply_is_retried_once_then_succeeds(fake_gemini):
    models = fake_gemini(reply(score=90), reply())
    assert run()["analysis"]["summary"]
    assert models.calls == 2


@pytest.mark.parametrize("bad", ["not json", reply(summary=""), reply(gaps=[gap(related_step=9)])])
def test_two_invalid_replies_fail(fake_gemini, bad):
    models = fake_gemini(bad, bad)
    with pytest.raises(llm.AIServiceError) as err:
        run()
    assert (err.value.kind, models.calls) == ("failed", 2)


def test_gemini_rejecting_the_request_is_not_retried(fake_gemini):
    models = fake_gemini(gemini_error(400, "INVALID_ARGUMENT"), reply())
    with pytest.raises(llm.AIServiceError) as err:
        run()
    assert (err.value.kind, models.calls) == ("failed", 1)


def test_gemini_server_errors_fail_after_one_retry(fake_gemini):
    models = fake_gemini(gemini_error(503, "UNAVAILABLE"), gemini_error(500, "INTERNAL"))
    with pytest.raises(llm.AIServiceError) as err:
        run()
    assert (err.value.kind, models.calls) == ("failed", 2)


def test_daily_quota_is_reported(fake_gemini):
    models = fake_gemini(gemini_error(429, "RESOURCE_EXHAUSTED", [
        {"violations": [{"quotaId": "GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]},
    ]))
    with pytest.raises(llm.AIServiceError) as err:
        run()
    assert (err.value.kind, models.calls) == ("quota", 1)


def test_missing_key_means_unavailable(monkeypatch):
    monkeypatch.setattr(llm, "client", None)
    with pytest.raises(llm.AIServiceError) as err:
        run()
    assert err.value.kind == "unavailable"


@pytest.mark.parametrize("timeout", [httpx.ReadTimeout("timed out"), TimeoutError("timed out")])
def test_a_timeout_is_retried_once(fake_gemini, timeout):
    models = fake_gemini(timeout, reply())
    assert run()["analysis"]
    assert models.calls == 2


def test_two_timeouts_fail(fake_gemini):
    models = fake_gemini(httpx.ReadTimeout("timed out"), httpx.WriteTimeout("timed out"))
    with pytest.raises(llm.AIServiceError) as err:
        run()
    assert (err.value.kind, models.calls) == ("failed", 2)


def test_unexpected_client_error_fails_without_its_message(fake_gemini, caplog):
    caplog.set_level(logging.INFO)
    models = fake_gemini(ValueError(f"bad part {SECRET}"), reply())
    with pytest.raises(llm.AIServiceError) as err:
        run()
    assert (err.value.kind, models.calls) == ("failed", 1)
    assert "unexpected ValueError" in caplog.text
    assert SECRET not in caplog.text
    assert err.value.__suppress_context__


# --- Privacy ------------------------------------------------------------------------

def _all_text(caplog, *values):
    return caplog.text + "".join(str(v) for v in values)


def test_no_resume_or_reply_content_in_logs_or_errors(fake_gemini, caplog):
    caplog.set_level(logging.DEBUG)
    leaky = reply(summary=f"{SECRET} says hi", strengths=[f"{SECRET} at x@example.com"])
    fake_gemini(json.dumps(leaky)[:-5], leaky)  # invalid JSON, then personal data
    with pytest.raises(llm.AIServiceError) as err:
        analyze_resume(make_pdf(), f"{CAREER} {SECRET}", SKILLS, STEPS)
    text = _all_text(caplog, err.value, repr(err.value), err.value.__context__)
    assert "kind=invalid_json" in text and "kind=personal_data" in text
    assert SECRET not in text
    assert "RESUME-CONTENT" not in text and "%PDF" not in text
    assert "example.com" not in text


def test_success_logs_only_metadata(fake_gemini, caplog):
    caplog.set_level(logging.DEBUG)
    fake_gemini(reply(summary=f"Strong résumé {SECRET}."))
    result = analyze_resume(make_pdf(), CAREER, SKILLS, STEPS)
    assert "resume attempt 1: ok" in caplog.text
    assert SECRET not in caplog.text and "RESUME-CONTENT" not in caplog.text
    assert result["analysis"]["summary"] == f"Strong résumé {SECRET}."


def test_saved_analysis_contains_nothing_from_the_file(fake_gemini):
    fake_gemini(reply())
    result = run()
    saved = json.dumps(result, ensure_ascii=False)
    assert "RESUME-CONTENT" not in saved and "%PDF" not in saved
    assert set(result["analysis"]) == ANALYSIS_FIELDS


def test_input_errors_carry_only_their_kind(fake_gemini):
    fake_gemini(reply())
    with pytest.raises(ResumeInputError) as err:
        analyze_resume(b"%PDF-" + PDF_SECRET, CAREER, SKILLS, STEPS)
    assert str(err.value) == "too_small"
    assert err.value.args == ("too_small",)
