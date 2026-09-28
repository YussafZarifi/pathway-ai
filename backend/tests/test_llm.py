import json
import logging

import httpx
import pytest
from google.genai import errors as genai_errors

import llm
from ai_output import RoadmapSchema, parse_roadmap
from conftest import SECRET, roadmap_reply


def gemini_error(code, status, details=()):
    return genai_errors.APIError(
        code, {"error": {"code": code, "status": status, "message": "m", "details": list(details)}}
    )


def per_day_quota():
    return gemini_error(429, "RESOURCE_EXHAUSTED", [
        {"violations": [{"quotaId": "GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]},
        {"retryDelay": "55s"},
    ])


def per_minute_quota(delay):
    return gemini_error(429, "RESOURCE_EXHAUSTED", [
        {"violations": [{"quotaId": "GenerateRequestsPerMinutePerProjectPerModel-FreeTier"}]},
        {"retryDelay": delay},
    ])


def run():
    return llm.generate("prompt", "roadmap", RoadmapSchema, lambda t: parse_roadmap(t, "DevOps Engineer"))


def test_first_good_reply_is_returned(fake_gemini):
    models = fake_gemini(roadmap_reply())
    assert run()["roadmap"][0]["title"] == "Linux basics"
    assert models.calls == 1


@pytest.mark.parametrize("bad", ["", "not json", '{"roadmap": []}', '{"roadmap": "x"'])
def test_unusable_reply_is_retried_once(fake_gemini, bad):
    models = fake_gemini(bad, roadmap_reply())
    assert run()["roadmap"]
    assert models.calls == 2


def test_two_unusable_replies_fail(fake_gemini):
    models = fake_gemini("nope", "still nope")
    with pytest.raises(llm.AIServiceError) as err:
        run()
    assert err.value.kind == "failed"
    assert models.calls == 2


def test_daily_quota_is_not_retried(fake_gemini):
    models = fake_gemini(per_day_quota(), roadmap_reply())
    with pytest.raises(llm.AIServiceError) as err:
        run()
    assert err.value.kind == "quota"
    assert models.calls == 1


def test_short_per_minute_limit_waits_and_retries(fake_gemini, monkeypatch):
    waits = []
    monkeypatch.setattr(llm.time, "sleep", waits.append)
    models = fake_gemini(per_minute_quota("2.5s"), roadmap_reply())
    assert run()["roadmap"]
    assert models.calls == 2
    assert waits == [3]


def test_long_per_minute_limit_is_reported_as_busy(fake_gemini):
    models = fake_gemini(per_minute_quota("40s"), roadmap_reply())
    with pytest.raises(llm.AIServiceError) as err:
        run()
    assert (err.value.kind, err.value.retry_after, models.calls) == ("busy", 41, 1)


@pytest.mark.parametrize("first", [
    gemini_error(503, "UNAVAILABLE"),
    gemini_error(500, "INTERNAL"),
    httpx.ReadTimeout("timed out"),
    httpx.ConnectError("no route"),
])
def test_transient_errors_are_retried_once(fake_gemini, first):
    models = fake_gemini(first, roadmap_reply())
    assert run()["roadmap"]
    assert models.calls == 2


def test_client_errors_are_not_retried(fake_gemini):
    models = fake_gemini(gemini_error(400, "INVALID_ARGUMENT"), roadmap_reply())
    with pytest.raises(llm.AIServiceError) as err:
        run()
    assert (err.value.kind, models.calls) == ("failed", 1)


def test_missing_key_means_unavailable(monkeypatch):
    monkeypatch.setattr(llm, "client", None)
    with pytest.raises(llm.AIServiceError) as err:
        run()
    assert err.value.kind == "unavailable"


def test_logs_describe_failures_without_reply_content(fake_gemini, caplog):
    caplog.set_level(logging.INFO)
    truncated = json.dumps(roadmap_reply(description=SECRET))[:-30]
    fake_gemini(truncated, {"roadmap": [{"title": "Kept"}, {"description": SECRET}]})
    run()
    log = caplog.text
    assert "kind=invalid_json" in log and "finish=STOP" in log and "sha=" in log
    assert "dropped invalid items" in log and "missing" in log
    assert "attempt 2: ok items=1" in log
    assert SECRET not in log
