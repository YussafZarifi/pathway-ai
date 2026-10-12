"""POST /api/resume-analyses (M3-4, ADR-020). No network: fake Gemini, the
in-memory repository and a stubbed signed-in user (except the auth tests).

Covers the check order (nothing is read before token, feature switch,
Content-Type, rate limit and roadmap pass), size limits while streaming,
honest errors, persistence and rollback, and privacy."""

import asyncio
import json
import logging

import httpx
import psycopg
import pytest
from fastapi.testclient import TestClient
from google.genai import errors as genai_errors

import config
import db
import main
import rate_limit
import resume_ai
from ai_output import AIOutputError
from auth import AuthUser, current_user
from conftest import SECRET
from generation import AI_BUSY, AI_QUOTA, AI_UNAVAILABLE
from repositories.resume_analyses import InMemoryResumeAnalysisRepository
from routers import resume_analyses as resume_router
from resume_fixtures import CAREER, RESUME_PAGES, SKILLS, STEPS, make_pdf, reply, sample_work_reviews

USER = AuthUser(id="00000000-0000-4000-8000-00000000000a", email="a@example.com")
OTHER = AuthUser(id="00000000-0000-4000-8000-00000000000b", email="b@example.com")
ROADMAP_ID = "00000000-0000-4000-8000-0000000000a2"
TARGET = {
    "roadmap_id": ROADMAP_ID,
    "career": CAREER,
    "skills": SKILLS,
    "steps": STEPS,
    "roadmap_steps": [
        {"position": 1, "title": STEPS[0], "description": "Use SQL to query data.", "tasks": [], "completed": True},
        {"position": 2, "title": STEPS[1], "description": "Use Python to analyze data.", "tasks": [], "completed": False},
        {"position": 3, "title": STEPS[2], "description": "Build dashboards.", "tasks": [], "completed": False},
    ],
}
ANALYSIS_FIELDS = {"summary", "matched_skills", "missing_skills", "strengths", "gaps", "suggestions",
                   "project_reviews", "experience_reviews", "score_report"}
URL = "/api/resume-analyses"
FILENAME = f"jane-doe-{SECRET}.pdf"
PDF_SECRET = b"RESUME-CONTENT-private-fixture-marker"


def pdf_headers(**extra):
    return {"Content-Type": "application/pdf", "Content-Disposition": f'attachment; filename="{FILENAME}"',
            **extra}


def gemini_error(code, status, details=()):
    return genai_errors.APIError(
        code, {"error": {"code": code, "status": status, "message": "m", "details": list(details)}}
    )


@pytest.fixture
def repo():
    r = InMemoryResumeAnalysisRepository()
    r.targets[USER.id] = dict(TARGET)
    return r


@pytest.fixture
def user_box():
    return {"user": USER}


@pytest.fixture
def client(monkeypatch, repo, user_box):
    monkeypatch.setattr(config, "RESUME_ANALYSIS_ENABLED", True)
    monkeypatch.setattr(rate_limit, "resume_limiter", rate_limit.RateLimiter(
        1000, 1000, 1000, short_scope="hour", short_period=rate_limit.HOUR))
    main.app.dependency_overrides[current_user] = lambda: user_box["user"]
    main.app.dependency_overrides[resume_router.get_repository] = lambda: repo
    main.app.dependency_overrides[resume_router.optional_repository] = lambda: repo
    yield TestClient(main.app)
    main.app.dependency_overrides.clear()


def post(client, data=None, headers=None):
    return client.post(URL, content=make_pdf() if data is None else data,
                       headers=pdf_headers() if headers is None else headers)


def asgi_post(headers, chunks):
    """Call the app directly with a body sent in `chunks`; returns (status,
    how many body messages the app pulled). Proves what was (not) read."""
    messages = [
        {"type": "http.request", "body": chunk, "more_body": i < len(chunks) - 1}
        for i, chunk in enumerate(chunks)
    ]
    pulled = 0
    sent = []

    async def receive():
        nonlocal pulled
        if pulled < len(messages):
            pulled += 1
            return messages[pulled - 1]
        await asyncio.sleep(0)
        return {"type": "http.disconnect"}

    async def send(message):
        sent.append(message)

    scope = {
        "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": "POST",
        "scheme": "http", "path": URL, "raw_path": URL.encode(), "query_string": b"", "root_path": "",
        "headers": [(k.lower().encode("latin-1"), v.encode("latin-1")) for k, v in headers.items()],
        "client": ("127.0.0.1", 50000), "server": ("testserver", 80),
    }
    asyncio.run(main.app(scope, receive, send))
    status = next(m["status"] for m in sent if m["type"] == "http.response.start")
    return status, pulled


def chunked(data, size=64 * 1024):
    return [data[i:i + size] for i in range(0, len(data), size)] or [b""]


# --- Success and persistence ---------------------------------------------------

def test_analysis_is_saved_and_returned(client, repo, fake_gemini):
    models = fake_gemini(reply())
    r = post(client)
    assert r.status_code == 201
    data = r.json()
    assert set(data) == {"id", "roadmap_id", "career", "analysis", "prompt_version", "model", "created_at"}
    assert data["roadmap_id"] == ROADMAP_ID and data["career"] == "Data Analyst"
    assert set(data["analysis"]) == ANALYSIS_FIELDS
    assert data["prompt_version"] == resume_ai.PROMPT_VERSION and data["model"] == config.GEMINI_MODEL
    saved = repo.analyses[data["id"]]
    assert saved["user_id"] == USER.id and saved["roadmap_id"] == ROADMAP_ID
    assert saved["analysis"] == data["analysis"]
    assert models.calls == 1
    pdf_part, text = models.prompts[0]
    assert pdf_part.inline_data.data == make_pdf()  # the upload, unchanged, sent inline
    assert "Data Analyst" in text and "target career" in text
    assert "SQL" in text and "Tableau" in text


def test_verified_project_and_experience_reviews_are_saved(client, repo, fake_gemini):
    projects, experience = sample_work_reviews()
    fake_gemini(reply(project_reviews=projects, experience_reviews=experience))

    response = post(client)

    assert response.status_code == 201
    analysis = response.json()["analysis"]
    assert analysis["project_reviews"][0]["score"] == 60
    assert analysis["project_reviews"][0]["technologies"] == ["SQL"]
    assert analysis["experience_reviews"][0]["score"] == 45
    assert repo.analyses[response.json()["id"]]["analysis"] == analysis


def test_stale_debug_capture_claim_never_blocks_a_valid_upload(
    client, repo, monkeypatch, fake_gemini, tmp_path
):
    """Optional local diagnostics must not turn a valid upload into a 500."""
    import os

    monkeypatch.setattr(config, "DEBUG_RESUME_VERIFIER", True)
    monkeypatch.setattr(resume_ai, "_DEBUG_CAPTURE_ROOT", tmp_path / ".resume-debug")
    capture_root = resume_ai._DEBUG_CAPTURE_ROOT
    capture_root.mkdir(parents=True)
    (capture_root / f".capture-claimed-{os.getpid()}").write_text("previous capture")
    models = fake_gemini(reply())

    response = post(client)

    assert response.status_code == 201
    assert len(repo.analyses) == 1
    assert models.calls == 1


def test_unknown_pdf_classification_returns_a_friendly_error_not_a_500(client, monkeypatch):
    def unexpected_classification(*_args, **_kwargs):
        raise resume_ai.ResumeInputError("future_unmapped_kind")

    monkeypatch.setattr(resume_ai, "analyze_resume", unexpected_classification)

    response = post(client)

    assert response.status_code == 502
    assert response.json()["detail"] == resume_router.ANALYSIS_FAILED


def test_each_user_gets_their_own_target_and_rows(client, repo, user_box, fake_gemini):
    repo.targets[OTHER.id] = dict(
        TARGET, roadmap_id="00000000-0000-4000-8000-0000000000b2", career="Web Developer",
        skills=["HTML"], steps=["HTML"],
        roadmap_steps=[{"position": 1, "title": "HTML", "completed": False}],
    )
    models = fake_gemini(reply(), reply(career="Web Developer", skills=["HTML"], steps=["HTML"]))
    first = post(client).json()
    user_box["user"] = OTHER
    second = post(client).json()
    assert repo.analyses[first["id"]]["user_id"] == USER.id
    assert repo.analyses[second["id"]]["user_id"] == OTHER.id
    assert second["career"] == "Web Developer"
    assert "Web Developer" in models.prompts[1][1]


def test_history_is_kept(client, repo, fake_gemini):
    fake_gemini(reply(), reply())
    assert post(client).status_code == 201 and post(client).status_code == 201
    assert len(repo.analyses) == 2


@pytest.mark.parametrize("content_type", ["application/pdf; charset=binary", "Application/PDF"])
def test_content_type_parameters_and_case_are_accepted(client, fake_gemini, content_type):
    fake_gemini(reply())
    assert post(client, headers={"Content-Type": content_type}).status_code == 201


def test_pdf_of_exactly_2_mb_is_accepted(client, fake_gemini):
    fake_gemini(reply())
    assert post(client, data=make_pdf(resume_ai.MAX_PDF_BYTES)).status_code == 201


# --- Feature switch ---------------------------------------------------------------

def test_feature_is_off_by_default():
    assert config._bool("UNSET_TEST_VARIABLE", False) is False
    assert "RESUME_ANALYSIS_ENABLED=false" in open(".env.example", encoding="utf-8").read()


@pytest.mark.parametrize("raw, expected", [("true", True), ("1", True), ("ON", True), ("false", False),
                                           ("0", False), ("", False)])
def test_feature_switch_parsing(monkeypatch, raw, expected):
    monkeypatch.setenv("RESUME_TEST_SWITCH", raw)
    assert config._bool("RESUME_TEST_SWITCH", False) is expected


def test_feature_switch_rejects_unclear_values(monkeypatch):
    monkeypatch.setenv("RESUME_TEST_SWITCH", "maybe")
    with pytest.raises(RuntimeError):
        config._bool("RESUME_TEST_SWITCH", False)


def test_feature_off_is_503_without_reading_the_body_or_calling_gemini(client, repo, monkeypatch, fake_gemini):
    monkeypatch.setattr(config, "RESUME_ANALYSIS_ENABLED", False)
    models = fake_gemini(reply())
    r = post(client)
    assert (r.status_code, r.json()["detail"]) == (503, resume_router.DISABLED)
    status, pulled = asgi_post(pdf_headers(), chunked(make_pdf()))
    assert (status, pulled) == (503, 0)
    assert models.calls == 0 and repo.analyses == {}


def test_feature_switch_is_checked_before_the_content_type(client, monkeypatch):
    monkeypatch.setattr(config, "RESUME_ANALYSIS_ENABLED", False)
    assert post(client, headers={"Content-Type": "text/plain"}).status_code == 503


# --- Authentication and configuration -----------------------------------------------

def test_no_token_is_401_without_reading_the_body(client, monkeypatch, fake_gemini):
    del main.app.dependency_overrides[current_user]
    monkeypatch.setattr(config, "SUPABASE_URL", "https://example.supabase.co")
    models = fake_gemini(reply())
    r = post(client)
    assert r.status_code == 401
    status, pulled = asgi_post(pdf_headers(), chunked(make_pdf()))
    assert (status, pulled) == (401, 0)
    assert models.calls == 0


def test_bad_token_is_401(client, monkeypatch):
    del main.app.dependency_overrides[current_user]
    monkeypatch.setattr(config, "SUPABASE_URL", "https://example.supabase.co")
    assert post(client, headers=pdf_headers(Authorization="Bearer not-a-jwt")).status_code == 401


def test_authentication_comes_before_the_feature_switch(client, monkeypatch):
    del main.app.dependency_overrides[current_user]
    monkeypatch.setattr(config, "SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setattr(config, "RESUME_ANALYSIS_ENABLED", False)
    assert post(client).status_code == 401


def test_accounts_off_is_503(client, monkeypatch):
    del main.app.dependency_overrides[current_user]
    monkeypatch.setattr(config, "SUPABASE_URL", "")
    assert post(client).status_code == 503


def test_database_not_configured_is_503(client, monkeypatch, fake_gemini):
    del main.app.dependency_overrides[resume_router.get_repository]
    monkeypatch.setattr(config, "DATABASE_URL", "")
    models = fake_gemini(reply())
    r = post(client)
    assert (r.status_code, r.json()["detail"]) == (503, resume_router.NOT_CONFIGURED)
    assert models.calls == 0


# --- Content type ---------------------------------------------------------------------

@pytest.mark.parametrize("content_type", [None, "multipart/form-data; boundary=x", "application/json",
                                          "text/plain", "application/octet-stream", "application/pdfx"])
def test_other_content_types_are_415_without_reading_the_body(client, fake_gemini, content_type):
    models = fake_gemini(reply())
    headers = {} if content_type is None else {"Content-Type": content_type}
    r = post(client, headers=headers)
    assert (r.status_code, r.json()["detail"]) == (415, resume_router.WRONG_TYPE)
    status, pulled = asgi_post(headers, chunked(make_pdf()))
    assert (status, pulled) == (415, 0)
    assert models.calls == 0


# --- Missing roadmap and lookup failures -------------------------------------------------

def test_no_active_roadmap_is_409_without_reading_the_body(client, repo, fake_gemini):
    repo.targets.clear()
    models = fake_gemini(reply())
    r = post(client)
    assert (r.status_code, r.json()["detail"]) == (409, resume_router.NO_ROADMAP)
    status, pulled = asgi_post(pdf_headers(), chunked(make_pdf()))
    assert (status, pulled) == (409, 0)
    assert models.calls == 0 and repo.analyses == {}


@pytest.mark.parametrize("error", [db.DatabaseUnavailable("down"), psycopg.OperationalError(SECRET)])
def test_roadmap_lookup_failure_is_503(client, repo, fake_gemini, caplog, error):
    repo.fail_lookup = error
    models = fake_gemini(reply())
    r = post(client)
    assert (r.status_code, r.json()["detail"]) == (503, resume_router.DB_UNAVAILABLE)
    assert models.calls == 0 and SECRET not in caplog.text


# --- Rate limits --------------------------------------------------------------------------

def test_per_user_hourly_limit(client, repo, monkeypatch, fake_gemini, user_box):
    monkeypatch.setattr(rate_limit, "resume_limiter", rate_limit.RateLimiter(
        2, 100, 100, short_scope="hour", short_period=rate_limit.HOUR))
    models = fake_gemini(reply(), reply(), reply())
    assert post(client).status_code == 201 and post(client).status_code == 201
    r = post(client)
    assert r.status_code == 429
    assert r.json()["detail"] == rate_limit.RESUME_MESSAGES["hour"]
    assert int(r.headers["Retry-After"]) > 0
    assert models.calls == 2
    # Another user isn't affected, whatever their IP.
    repo.targets[OTHER.id] = dict(TARGET)
    user_box["user"] = OTHER
    assert post(client).status_code == 201


def test_rate_limited_request_does_not_read_the_body(client, monkeypatch):
    limiter = rate_limit.RateLimiter(1, 100, 100, short_scope="hour", short_period=rate_limit.HOUR)
    monkeypatch.setattr(rate_limit, "resume_limiter", limiter)
    limiter.check(f"user:{USER.id}")  # the one allowed analysis this hour
    status, pulled = asgi_post(pdf_headers(), chunked(make_pdf()))
    assert (status, pulled) == (429, 0)


def test_daily_and_global_limit_messages(client, monkeypatch):
    daily = rate_limit.RateLimiter(100, 1, 100, short_scope="hour", short_period=rate_limit.HOUR)
    daily.check(f"user:{USER.id}")
    monkeypatch.setattr(rate_limit, "resume_limiter", daily)
    assert post(client).json()["detail"] == rate_limit.RESUME_MESSAGES["day"]
    full = rate_limit.RateLimiter(100, 100, 1, short_scope="hour", short_period=rate_limit.HOUR)
    full.check("user:someone-else")
    monkeypatch.setattr(rate_limit, "resume_limiter", full)
    assert post(client).json()["detail"] == rate_limit.RESUME_MESSAGES["global"]


def test_resume_limit_is_separate_from_the_ip_ai_limit(client, monkeypatch, fake_gemini):
    monkeypatch.setattr(rate_limit, "limiter", rate_limit.RateLimiter(0, 0, 0))
    fake_gemini(reply())
    assert post(client).status_code == 201


def test_default_limits_follow_adr_020():
    assert (config.RESUME_LIMIT_PER_HOUR, config.RESUME_LIMIT_PER_DAY) == (3, 10)


# --- Size limits (while streaming) ------------------------------------------------------------

def test_declared_oversize_is_413_before_anything_else(client, monkeypatch, fake_gemini):
    monkeypatch.setattr(config, "RESUME_ANALYSIS_ENABLED", False)  # rejected before even this check
    models = fake_gemini(reply())
    headers = pdf_headers(**{"Content-Length": str(resume_ai.MAX_PDF_BYTES + 1)})
    status, pulled = asgi_post(headers, [b"%PDF-"])
    assert (status, pulled) == (413, 0)
    assert models.calls == 0


def test_chunked_oversize_stops_reading_at_the_limit(client, repo, fake_gemini):
    models = fake_gemini(reply())
    chunks = chunked(make_pdf(resume_ai.MAX_PDF_BYTES * 2), size=256 * 1024)  # 16 chunks, no length
    status, pulled = asgi_post(pdf_headers(), chunks)
    assert status == 413
    assert pulled == 9  # 8 chunks = exactly 2 MB; the 9th passes the limit and reading stops
    assert models.calls == 0 and repo.analyses == {}


def test_chunked_upload_within_the_limit_is_analyzed(client, repo, fake_gemini):
    fake_gemini(reply())
    status, pulled = asgi_post(pdf_headers(), chunked(make_pdf(300 * 1024)))
    assert status == 201 and len(repo.analyses) == 1


def test_sparse_valid_pdf_is_saved_as_an_explicit_no_score_report(client, repo, fake_gemini):
    models = fake_gemini(reply())
    response = post(client, make_pdf(pages=["Brief profile only."]))
    report = response.json()["analysis"]["score_report"]
    assert response.status_code == 201
    assert report["status"] == "insufficient_evidence"
    assert report["overall"] == report["ats"]["score"] == 0
    assert report["confidence"]["level"] == "very_low"
    assert len(repo.analyses) == 1 and models.calls == 0


def test_other_routes_keep_the_16_kb_limit(client):
    r = client.post("/api/ai/career", content=b"x" * (17 * 1024), headers={"Content-Type": "application/json"})
    assert r.status_code == 413


# --- Invalid PDFs and non-résumés ------------------------------------------------------------

@pytest.mark.parametrize("data, kind", [
    (b"", "too_small"),
    (b"%PDF-1.7\n" + b"0" * 980 + b"%%EOF\n", "too_small"),
    (b"PK\x03\x04" + make_pdf()[4:], "not_pdf"),
    (make_pdf().replace(b"%%EOF", b"%%END"), "not_pdf"),
], ids=["empty", "small", "zip", "truncated"])
def test_invalid_pdfs_are_422_and_not_sent_to_gemini(client, repo, fake_gemini, data, kind):
    models = fake_gemini(reply())
    r = post(client, data=data)
    assert (r.status_code, r.json()["detail"]) == resume_router.INPUT_ERRORS[kind]
    assert models.calls == 0 and repo.analyses == {}


def test_a_pdf_that_is_not_a_resume_is_422_and_not_saved(client, repo, fake_gemini):
    fake_gemini(reply(is_resume=False, summary="Not a résumé.", evaluations=[], recommendations=[], skill_roadmap=[]))
    r = post(client)
    assert (r.status_code, r.json()["detail"]) == resume_router.INPUT_ERRORS["not_resume"]
    assert repo.analyses == {}


# --- Gemini failures and validation failures ---------------------------------------------------

@pytest.mark.parametrize("script, status, detail", [
    ([gemini_error(400, "INVALID_ARGUMENT")], 502, resume_router.ANALYSIS_FAILED),
    ([gemini_error(503, "UNAVAILABLE")] * 2, 502, resume_router.ANALYSIS_FAILED),
    ([httpx.ReadTimeout("t"), httpx.ReadTimeout("t")], 502, resume_router.ANALYSIS_FAILED),
    (["not json", reply(score=80)], 502, resume_router.ANALYSIS_FAILED),
    ([reply(summary=""), reply(evaluations=[])], 502, resume_router.ANALYSIS_FAILED),
    ([reply(summary="Mail me at x@example.com")] * 2, 502, resume_router.ANALYSIS_FAILED),
    ([gemini_error(429, "RESOURCE_EXHAUSTED", [
        {"violations": [{"quotaId": "GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]}])], 503, AI_QUOTA),
    ([gemini_error(429, "RESOURCE_EXHAUSTED", [{"retryDelay": "40s"}])], 503, AI_BUSY),
], ids=["rejected", "server errors", "timeouts", "malformed", "schema", "personal data", "quota", "busy"])
def test_generation_failures_are_honest_and_save_nothing(client, repo, fake_gemini, script, status, detail):
    fake_gemini(*script)
    r = post(client)
    assert (r.status_code, r.json()["detail"]) == (status, detail)
    assert repo.analyses == {}


def test_busy_includes_retry_after(client, fake_gemini):
    fake_gemini(gemini_error(429, "RESOURCE_EXHAUSTED", [{"retryDelay": "40s"}]))
    assert post(client).headers["Retry-After"] == "41"


def test_no_gemini_key_is_503(client, monkeypatch):
    import llm
    monkeypatch.setattr(llm, "client", None)
    r = post(client)
    assert (r.status_code, r.json()["detail"]) == (503, AI_UNAVAILABLE)


def test_final_report_size_error_is_a_safe_502_not_an_unhandled_exception(client, repo, monkeypatch, caplog):
    def reject_oversized_report(*args, **kwargs):
        raise AIOutputError("too_large", "analysis 16183 bytes")

    monkeypatch.setattr(resume_ai, "analyze_resume", reject_oversized_report)
    caplog.set_level(logging.DEBUG)

    response = post(client)

    assert (response.status_code, response.json()["detail"]) == (502, resume_router.ANALYSIS_FAILED)
    assert repo.analyses == {}
    assert "Resume report rejected: too_large" in caplog.text
    assert "Unhandled AIOutputError" not in caplog.text


# --- Database failures (rollback) ------------------------------------------------------------------

@pytest.mark.parametrize("error", [
    db.DatabaseUnavailable("down"),
    psycopg.errors.ForeignKeyViolation(SECRET),  # e.g. the roadmap was deleted meanwhile
    psycopg.errors.CheckViolation(SECRET),
])
def test_save_failure_is_503_and_nothing_is_stored(client, repo, fake_gemini, caplog, error):
    caplog.set_level(logging.DEBUG)
    fake_gemini(reply())
    repo.fail_next = error
    r = post(client)
    assert (r.status_code, r.json()["detail"]) == (503, resume_router.SAVE_FAILED)
    assert repo.analyses == {}
    assert type(error).__name__ in caplog.text and SECRET not in caplog.text


# --- Privacy -----------------------------------------------------------------------------------------

def _leaks(text):
    return [s for s in (SECRET, "RESUME-CONTENT", "jane-doe", "%PDF") if s in text]


@pytest.mark.parametrize("scenario", ["saved", "invalid_pdf", "ai_failure", "save_failure", "not_resume"])
def test_no_file_content_or_name_in_logs_responses_or_saved_rows(client, repo, fake_gemini, caplog, scenario):
    caplog.set_level(logging.DEBUG)
    data = make_pdf()
    if scenario == "saved":
        fake_gemini(reply())
    elif scenario == "invalid_pdf":
        fake_gemini(reply())
        data = data.replace(b"%%EOF", b"%%END")
    elif scenario == "ai_failure":
        fake_gemini(ValueError(SECRET))
    elif scenario == "save_failure":
        fake_gemini(reply())
        repo.fail_next = psycopg.errors.CheckViolation(SECRET)
    else:
        fake_gemini(reply(is_resume=False, evaluations=[], recommendations=[], skill_roadmap=[]))
    r = post(client, data=data)
    assert _leaks(caplog.text) == []
    assert _leaks(r.text) == []
    assert _leaks(json.dumps(list(repo.analyses.values()), default=str)) == []
    for row in repo.analyses.values():
        assert set(row) == {"id", "user_id", "roadmap_id", "career", "analysis", "prompt_version",
                            "model", "created_at"}


def test_logs_record_only_outcome_size_and_time(client, fake_gemini, caplog):
    caplog.set_level(logging.INFO, logger="pathwayai.resume")
    fake_gemini(reply())
    post(client)
    lines = [r.getMessage() for r in caplog.records if r.name == "pathwayai.resume"]
    assert len(lines) == 1 and lines[0].startswith("Résumé analysis saved (4096 bytes,")
    assert USER.id not in caplog.text and USER.email not in caplog.text


def test_cors_preflight_allows_a_pdf_upload(client):
    if "http://localhost:5173" not in config.ALLOWED_ORIGINS:
        pytest.skip("local ALLOWED_ORIGINS doesn't include the Vite origin")
    r = client.options(URL, headers={
        "Origin": "http://localhost:5173",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
    })
    assert r.status_code == 200


# --- GET /api/resume-analyses/availability (M3-5) ------------------------------------------------

AVAILABILITY = URL + "/availability"


def test_availability_when_enabled_with_a_roadmap(client):
    r = client.get(AVAILABILITY)
    assert r.status_code == 200
    assert r.json() == {"available": True, "reason": None, "career": "Data Analyst", "roadmap_id": ROADMAP_ID}


def test_availability_when_the_feature_is_off(client, repo, monkeypatch):
    monkeypatch.setattr(config, "RESUME_ANALYSIS_ENABLED", False)
    repo.fail_lookup = AssertionError("the database must not be touched")
    r = client.get(AVAILABILITY)
    assert r.json() == {"available": False, "reason": "feature_disabled", "career": None, "roadmap_id": None}
    assert repo.fail_lookup is not None  # never consulted


def test_availability_without_an_active_roadmap(client, repo):
    repo.targets.clear()
    assert client.get(AVAILABILITY).json() == {"available": False, "reason": "no_active_roadmap",
                                               "career": None, "roadmap_id": None}


def test_availability_is_per_user(client, repo, user_box):
    repo.targets[OTHER.id] = dict(TARGET, career="Web Developer")
    user_box["user"] = OTHER
    assert client.get(AVAILABILITY).json()["career"] == "Web Developer"


def test_availability_without_a_database(client, monkeypatch):
    del main.app.dependency_overrides[resume_router.optional_repository]
    monkeypatch.setattr(config, "DATABASE_URL", "")
    assert client.get(AVAILABILITY).json() == {"available": False, "reason": "unavailable", "career": None, "roadmap_id": None}


@pytest.mark.parametrize("error", [db.DatabaseUnavailable("down"), psycopg.OperationalError(SECRET)])
def test_availability_lookup_failure_is_503(client, repo, caplog, error):
    repo.fail_lookup = error
    r = client.get(AVAILABILITY)
    assert (r.status_code, r.json()["detail"]) == (503, resume_router.DB_UNAVAILABLE)
    assert SECRET not in caplog.text


def test_availability_needs_a_token(client, monkeypatch):
    del main.app.dependency_overrides[current_user]
    monkeypatch.setattr(config, "SUPABASE_URL", "https://example.supabase.co")
    assert client.get(AVAILABILITY).status_code == 401
    assert client.get(AVAILABILITY, headers={"Authorization": "Bearer nope"}).status_code == 401
    monkeypatch.setattr(config, "SUPABASE_URL", "")
    assert client.get(AVAILABILITY).status_code == 503


def test_availability_exposes_nothing_else(client, monkeypatch):
    for enabled in (True, False):
        monkeypatch.setattr(config, "RESUME_ANALYSIS_ENABLED", enabled)
        body = client.get(AVAILABILITY).json()
        assert set(body) == {"available", "reason", "career", "roadmap_id"}
        text = json.dumps(body).lower()
        for leak in ("limit", "quota", "gemini", "key", "model", "database", "url"):
            assert leak not in text, leak
        text = text.replace(ROADMAP_ID, "")
        assert not any(ch.isdigit() for ch in text)  # no limits or counts


def test_availability_does_not_count_against_the_upload_limit(client, monkeypatch, fake_gemini):
    limiter = rate_limit.RateLimiter(1, 100, 100, short_scope="hour", short_period=rate_limit.HOUR)
    monkeypatch.setattr(rate_limit, "resume_limiter", limiter)
    for _ in range(5):
        assert client.get(AVAILABILITY).status_code == 200
    fake_gemini(reply())
    assert post(client).status_code == 201


def test_availability_spends_no_ai_quota(client):
    client.get(AVAILABILITY)  # the autouse guard fails the test if Gemini is reached
