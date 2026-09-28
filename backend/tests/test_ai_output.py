import json

import pytest

from ai_output import AIOutputError, extract_json, parse_careers, parse_roadmap
from conftest import SECRET, career_reply, roadmap_reply


# --- extract_json -----------------------------------------------------------

@pytest.mark.parametrize(
    "text, strategy",
    [
        ('{"a": 1}', "direct"),
        ('```json\n{"a": 1}\n```', "fenced"),
        ('```\n{"a": 1}\n```', "fenced"),
        ('Here is your roadmap:\n```json\n{"a": 1}\n```\nGood luck!', "fenced"),
        ('Sure! {"a": 1} Hope this helps.', "braces"),
        ('{"a": [1, 2,], }', "direct+trailing_commas"),
    ],
)
def test_extract_json_finds_the_object(text, strategy):
    assert extract_json(text) == ({"a": 1} if "[" not in text else {"a": [1, 2]}, strategy)


@pytest.mark.parametrize(
    "text, kind",
    [
        ("", "empty"),
        ("   \n", "empty"),
        ("I can't help with that.", "no_json"),
        ('{"a": "unterminated', "invalid_json"),
        ("[1, 2, 3]", "not_object"),
    ],
)
def test_extract_json_classifies_failures(text, kind):
    with pytest.raises(AIOutputError) as err:
        extract_json(text)
    assert err.value.kind == kind


def test_truncated_reply_is_invalid_json_without_leaking_content():
    text = json.dumps(roadmap_reply(description=SECRET))[:-40]  # cut off mid-reply
    with pytest.raises(AIOutputError) as err:
        extract_json(text)
    assert err.value.kind == "invalid_json"
    assert "at char" in err.value.detail
    assert SECRET not in str(err.value)


# --- parse_roadmap ------------------------------------------------------------

def test_valid_roadmap_keeps_every_field():
    result, diag = parse_roadmap(json.dumps(roadmap_reply()), "DevOps Engineer")
    step = result["roadmap"][0]
    assert step["title"] == "Linux basics"
    assert step["resources"] == [{"name": "Linux Journey", "url": "https://linuxjourney.com"}]
    assert step["tasks"] == ["Install Ubuntu", "Write a shell script"]
    assert diag == {"strategy": "direct", "items": 1, "dropped": []}


def test_missing_optional_fields_get_defaults():
    text = json.dumps({"roadmap": [{"title": "Only a title"}]})
    result, _ = parse_roadmap(text, "Data Analyst")
    assert result["roadmap"][0] == {
        "title": "Only a title",
        "description": "",
        "time": "Varies",
        "resources": [],
        "tasks": [],
        "video_query": "",
    }


def test_wrong_types_in_optional_fields_become_defaults():
    reply = roadmap_reply(description={"x": 1}, time=None, tasks="not a list", resources="nope")
    step = parse_roadmap(json.dumps(reply), "X")[0]["roadmap"][0]
    assert (step["description"], step["time"], step["tasks"], step["resources"]) == ("", "Varies", [], [])


def test_bad_resources_and_tasks_are_dropped():
    reply = roadmap_reply(
        resources=[
            {"name": "Good", "url": "https://example.org/a"},
            {"name": "Script", "url": "javascript:alert(1)"},
            {"name": "Relative", "url": "/docs"},
            {"name": "", "url": "https://example.org/b"},
            {"url": "https://example.org/c"},
        ],
        tasks=["Do it", 42, None, "", {"t": 1}],
    )
    step = parse_roadmap(json.dumps(reply), "X")[0]["roadmap"][0]
    assert step["resources"] == [{"name": "Good", "url": "https://example.org/a"}]
    assert step["tasks"] == ["Do it", "42"]


def test_steps_without_a_title_are_dropped_and_reported():
    reply = {"roadmap": [{"title": "Keep"}, {"description": SECRET}, {"title": "  "}, "junk"]}
    result, diag = parse_roadmap(json.dumps(reply), "X")
    assert [s["title"] for s in result["roadmap"]] == ["Keep"]
    assert len(diag["dropped"]) == 3
    assert SECRET not in " ".join(diag["dropped"])


def test_at_most_five_steps_and_the_chosen_career_is_used():
    reply = {"career": "Something else", "roadmap": [{"title": f"Step {i}"} for i in range(8)]}
    result, _ = parse_roadmap(json.dumps(reply), "Cloud Engineer")
    assert len(result["roadmap"]) == 5
    assert result["career"] == "Cloud Engineer"


@pytest.mark.parametrize("reply", [{"steps": []}, {"roadmap": "x"}, {"roadmap": []}, {"roadmap": [{}]}])
def test_roadmap_without_usable_steps_is_a_schema_error(reply):
    with pytest.raises(AIOutputError) as err:
        parse_roadmap(json.dumps(reply), "X")
    assert err.value.kind == "schema"


# --- parse_careers ------------------------------------------------------------

def test_valid_careers():
    result, diag = parse_careers(json.dumps(career_reply()))
    assert result["careers"][0]["match_score"] == 88
    assert result["explanation"] == "A good start."
    assert diag["items"] == 1


@pytest.mark.parametrize("score, expected", [("85%", 85), ("72", 72), (90.4, 90), (95, 95)])
def test_match_score_formats_are_normalized(score, expected):
    reply = career_reply()
    reply["careers"][0]["match_score"] = score
    assert parse_careers(json.dumps(reply))[0]["careers"][0]["match_score"] == expected


@pytest.mark.parametrize("score", [None, "high", 140, -5, True])
def test_career_without_a_valid_match_score_is_dropped(score):
    reply = career_reply()
    reply["careers"].append(dict(reply["careers"][0], title="Second", match_score=score))
    result, diag = parse_careers(json.dumps(reply))
    assert [c["title"] for c in result["careers"]] == ["Cloud Engineer"]
    assert len(diag["dropped"]) == 1


def test_at_most_three_careers_and_missing_explanation_is_empty():
    reply = career_reply()
    reply["careers"] = [dict(reply["careers"][0], title=f"C{i}") for i in range(5)]
    del reply["explanation"]
    result, _ = parse_careers(json.dumps(reply))
    assert len(result["careers"]) == 3
    assert result["explanation"] == ""


def test_no_valid_careers_is_a_schema_error():
    with pytest.raises(AIOutputError) as err:
        parse_careers(json.dumps({"careers": [{"reason": SECRET}]}))
    assert err.value.kind == "schema"
    assert SECRET not in str(err.value)
