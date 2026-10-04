"""The roadmap repository contract (ADR-019), on the in-memory implementation,
and the row → API mapping shared with the Postgres one. The Postgres SQL is
checked against the live database separately (see ROADMAP M2-5 / M2-7)."""

from datetime import datetime, timedelta, timezone

from repositories.roadmaps import InMemoryRoadmapRepository, roadmap_out, step_out

A = "00000000-0000-4000-8000-00000000000a"
B = "00000000-0000-4000-8000-00000000000b"

STEPS = [
    {"title": "HTML", "description": "Basics", "time": "2 weeks", "tasks": ["One"],
     "resources": [{"name": "MDN", "url": "https://developer.mozilla.org"}],
     "video_query": "html", "videos": [], "video_search_url": "https://www.youtube.com/results?search_query=html"},
    {"title": "CSS", "time": "3 weeks"},
]


def create(repo, user=A, career="Web Developer"):
    return repo.create(user, answers={"goal": "x"}, answers_version=2, career=career,
                       career_data={"title": career, "match_score": 80}, prompt_version="v2",
                       steps=STEPS)


def active(repo, user):
    return [r for r in repo.roadmaps.values() if r["user_id"] == user and r["status"] == "active"]


def test_create_returns_api_shape_with_step_ids():
    out = create(InMemoryRoadmapRepository())
    assert out["career"] == "Web Developer" and out["status"] == "active"
    assert out["source"] == "generated" and out["can_regenerate"] is True
    assert [s["position"] for s in out["roadmap"]] == [0, 1]
    first = out["roadmap"][0]
    assert first["id"] and first["time"] == "2 weeks" and first["tasks"] == ["One"]
    assert out["roadmap"][1]["description"] == "" and out["roadmap"][1]["videos"] == []


def test_create_archives_the_previous_active_roadmap():
    repo = InMemoryRoadmapRepository()
    first = create(repo)
    second = create(repo, career="Data Analyst")
    assert [r["id"] for r in active(repo, A)] == [second["id"]]
    assert repo.roadmaps[first["id"]]["status"] == "archived"


def test_users_are_independent():
    repo = InMemoryRoadmapRepository()
    a = create(repo, A)
    create(repo, B)
    assert len(active(repo, A)) == 1 and len(active(repo, B)) == 1
    assert repo.get_source(B, a["id"]) is None


def test_get_source_has_answers_for_regenerate():
    repo = InMemoryRoadmapRepository()
    out = create(repo)
    source = repo.get_source(A, out["id"])
    assert source["answers"] == {"goal": "x"} and source["answers_version"] == 2
    assert source["career"] == "Web Developer"


def test_regenerate_reuses_the_submission_and_archives():
    repo = InMemoryRoadmapRepository()
    out = create(repo)
    source = repo.get_source(A, out["id"])
    new = repo.add_regenerated(A, source=source, prompt_version="v2", steps=STEPS[:1])
    assert new["id"] != out["id"] and new["can_regenerate"]
    assert repo.roadmaps[new["id"]]["quiz_submission_id"] == source["quiz_submission_id"]
    assert [r["id"] for r in active(repo, A)] == [new["id"]]


def _import(repo, local_id="local-1", created_at=None, answers=None, completed=()):
    return repo.import_local(
        A, local_id=local_id, career="Imported", career_data=None, answers=answers,
        answers_version=2 if answers else None,
        created_at=created_at or datetime.now(timezone.utc), steps=STEPS, completed=list(completed),
    )


def test_import_is_idempotent_per_local_id():
    repo = InMemoryRoadmapRepository()
    first, created = _import(repo)
    again, created_again = _import(repo)
    assert created and not created_again and again["id"] == first["id"]
    assert len(repo.roadmaps) == 1


def test_import_without_answers_cannot_be_regenerated():
    out, _ = _import(InMemoryRoadmapRepository())
    assert out["source"] == "imported" and out["can_regenerate"] is False


def test_older_import_is_archived_newer_becomes_active():
    repo = InMemoryRoadmapRepository()
    current = create(repo)
    old, _ = _import(repo, "old", created_at=datetime.now(timezone.utc) - timedelta(days=3))
    assert old["status"] == "archived" and active(repo, A)[0]["id"] == current["id"]
    new, _ = _import(repo, "new", created_at=datetime.now(timezone.utc) + timedelta(seconds=1))
    assert new["status"] == "active" and repo.roadmaps[current["id"]]["status"] == "archived"


def test_import_saves_completions_by_position():
    when = datetime(2026, 9, 1, tzinfo=timezone.utc)
    repo = InMemoryRoadmapRepository()
    out, _ = _import(repo, completed=[(1, when), (7, when)])  # 7 doesn't exist: ignored
    assert repo.progress == {out["roadmap"][1]["id"]: when}


def test_row_mapping():
    created = datetime(2026, 10, 3, 12, 0, tzinfo=timezone.utc)
    row = {"id": "r", "career": "C", "career_data": None, "status": "active", "source": "generated",
           "quiz_submission_id": "s", "created_at": created}
    step = {"id": "s1", "position": 0, "title": "T", "description": "", "time_estimate": "1 week",
            "tasks": None, "resources": None, "video_query": "", "video_search_url": None, "videos": None}
    out = roadmap_out(row, [step])
    assert out["created_at"] == "2026-10-03T12:00:00Z"
    assert step_out(step) == {"id": "s1", "position": 0, "title": "T", "description": "",
                              "time": "1 week", "resources": [], "tasks": [], "video_query": "",
                              "videos": [], "video_search_url": None}
