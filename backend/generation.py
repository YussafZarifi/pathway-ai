"""AI generation shared by the guest routes (/api/ai/*) and the saved-roadmap
routes (/api/roadmaps*): run Gemini through llm.generate, map its failures to
user-safe HTTP errors, and attach real YouTube videos to roadmap steps."""

from concurrent.futures import ThreadPoolExecutor

from fastapi import HTTPException

import llm
import youtube
from ai_output import RoadmapSchema, parse_roadmap
from prompts import build_roadmap_prompt

AI_UNAVAILABLE = "PathwayAI's AI service is temporarily unavailable. Please try again later."
AI_QUOTA = "PathwayAI has reached its AI usage limit for now. Please try again later."
AI_BUSY = "PathwayAI's AI service is busy right now. Please wait a minute and try again."
AI_FAILED = "We couldn't generate results right now. Please try again."


def ai_http_error(error: llm.AIServiceError, failed_detail: str = AI_FAILED) -> HTTPException:
    """The user-safe HTTP error for a failed generation."""
    if error.kind == "unavailable":
        return HTTPException(status_code=503, detail=AI_UNAVAILABLE)
    if error.kind == "quota":
        return HTTPException(status_code=503, detail=AI_QUOTA)
    if error.kind == "busy":
        return HTTPException(
            status_code=503, detail=AI_BUSY, headers={"Retry-After": str(error.retry_after or 60)}
        )
    return HTTPException(status_code=502, detail=failed_detail)


def generate(prompt: str, label: str, schema, parse) -> dict:
    """Run llm.generate and turn its failures into user-safe HTTP errors."""
    try:
        return llm.generate(prompt, label, schema, parse)
    except llm.AIServiceError as e:
        raise ai_http_error(e) from None


def prompt_version(answers) -> str:
    """Which prompt family built the roadmap ("v1" or "v2", ADR-016)."""
    return f"v{answers.version}"


def generate_roadmap(answers, career: str) -> dict:
    """{career, roadmap: [steps with videos]} for validated quiz answers."""
    prompt = build_roadmap_prompt(answers, career)
    result = generate(
        prompt, f"roadmap v{answers.version}", RoadmapSchema,
        lambda text: parse_roadmap(text, career),
    )
    add_videos(result, career)
    return result


def add_videos(result, career):
    """Attach real YouTube videos (and a search-link fallback) to each step."""
    steps = result.get("roadmap") if isinstance(result, dict) else None
    if not isinstance(steps, list):
        return

    steps = [s for s in steps if isinstance(s, dict)]
    queries = [
        str(s.get("video_query") or f"{s.get('title', '')} {career} tutorial").strip()
        for s in steps
    ]

    # One API call per step, run in parallel so 5 steps take ~1 request's time.
    with ThreadPoolExecutor(max_workers=5) as pool:
        video_lists = list(pool.map(youtube.search_videos, queries))

    for step, query, videos in zip(steps, queries, video_lists):
        step["video_query"] = query
        step["videos"] = videos
        step["video_search_url"] = youtube.search_url(query)
