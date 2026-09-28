import json
import logging
import time
from concurrent.futures import ThreadPoolExecutor

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from google import genai
from google.genai import errors as genai_errors
from google.genai import types as genai_types

import config
import youtube
from rate_limit import limit_ai_requests
from schemas import CareerRequest, RoadmapRequest

logging.basicConfig(
    level=config.LOG_LEVEL,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("pathwayai")

# Answers are a handful of short strings; anything bigger is not a quiz.
MAX_BODY_BYTES = 16 * 1024

AI_UNAVAILABLE = "PathwayAI's AI service is temporarily unavailable. Please try again later."
AI_FAILED = "We couldn't generate results right now. Please try again."
INVALID_ANSWERS = "Some quiz answers are missing or too long. Please retake the quiz and try again."

app = FastAPI(title="PathwayAI API")

if not config.ALLOWED_ORIGINS:
    logger.warning("ALLOWED_ORIGINS is empty: browsers on other origins can't call this API")
if not config.GEMINI_API_KEY:
    logger.error("GEMINI_API_KEY is not set: AI endpoints will return 503")

client = (
    genai.Client(
        api_key=config.GEMINI_API_KEY,
        http_options=genai_types.HttpOptions(timeout=config.GEMINI_TIMEOUT_SECONDS * 1000),
    )
    if config.GEMINI_API_KEY
    else None
)


@app.middleware("http")
async def limit_body_size(request: Request, call_next):
    length = request.headers.get("content-length")
    if length and (not length.isdigit() or int(length) > MAX_BODY_BYTES):
        return JSONResponse(status_code=413, content={"detail": "Request is too large."})
    return await call_next(request)


# Added last so it wraps everything, including the 413 above and 429s.
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.exception_handler(RequestValidationError)
async def invalid_request(request: Request, exc: RequestValidationError):
    # Log which fields failed, never their values (they are user answers).
    fields = sorted({".".join(str(p) for p in err["loc"][1:]) for err in exc.errors()})
    logger.info("Rejected %s: invalid fields %s", request.url.path, fields)
    return JSONResponse(status_code=422, content={"detail": INVALID_ANSWERS})


@app.exception_handler(Exception)
async def unexpected_error(request: Request, exc: Exception):
    logger.error("Unhandled %s on %s", type(exc).__name__, request.url.path)
    return JSONResponse(status_code=500, content={"detail": AI_FAILED})


def generate_json(prompt: str, label: str) -> dict:
    """Ask Gemini for a JSON object. Raises a user-safe HTTPException on failure."""
    if client is None:
        raise HTTPException(status_code=503, detail=AI_UNAVAILABLE)

    started = time.perf_counter()
    try:
        resp = client.models.generate_content(model=config.GEMINI_MODEL, contents=prompt)
    except genai_errors.APIError as e:
        logger.error("Gemini %s request failed: %s %s", label, e.code, e.status)
        raise HTTPException(status_code=502, detail=AI_FAILED) from None
    except Exception as e:
        logger.error("Gemini %s request failed: %s", label, type(e).__name__)
        raise HTTPException(status_code=502, detail=AI_FAILED) from None

    text = (resp.text or "").strip()
    if text.startswith("```"):
        text = text.strip("`").replace("json", "", 1).strip()

    try:
        result = json.loads(text)
    except json.JSONDecodeError:
        logger.error("Gemini %s response was not valid JSON (%d chars)", label, len(text))
        raise HTTPException(status_code=502, detail=AI_FAILED) from None

    if not isinstance(result, dict):
        logger.error("Gemini %s response was %s, not an object", label, type(result).__name__)
        raise HTTPException(status_code=502, detail=AI_FAILED)

    logger.info("Gemini %s generated in %.1fs", label, time.perf_counter() - started)
    return result


@app.get("/")
def root():
    return {"status": "ok", "message": "Backend is running"}


@app.get("/health")
def health():
    """Liveness check for the host. Makes no external calls and spends no quota."""
    return {"status": "ok"}


@app.post("/api/ai/career", dependencies=[Depends(limit_ai_requests)])
def career_ai(payload: CareerRequest):
    profile_text = payload.answers.as_profile_text()

    prompt = f"""
Return STRICT JSON only (no markdown, no code fences) in this exact shape:
{{
  "careers": [
    {{
      "title":"...",
      "reason":"...",
      "match_score": 85,
      "salary_range":"$80k - $120k",
      "growth_rate":"+15% (Faster than average)",
      "education":"Bachelor's degree",
      "skills":["Skill1","Skill2","Skill3","Skill4"]
    }},
    {{
      "title":"...",
      "reason":"...",
      "match_score": 80,
      "salary_range":"$75k - $110k",
      "growth_rate":"+12% (Faster than average)",
      "education":"Bachelor's or certificate",
      "skills":["Skill1","Skill2","Skill3","Skill4"]
    }},
    {{
      "title":"...",
      "reason":"...",
      "match_score": 75,
      "salary_range":"$70k - $100k",
      "growth_rate":"+10% (Faster than average)",
      "education":"Associate degree",
      "skills":["Skill1","Skill2","Skill3","Skill4"]
    }}
  ],
  "explanation": "..."
}}

Rules:
- careers: exactly 3
- ALL careers must be technology-industry roles only (e.g., software engineering, AI/ML, data science, cybersecurity, cloud/DevOps, IT, product/UX for tech products). Never suggest non-tech careers, even if some answers seem general.
- reason: 1–2 sentences each
- match_score: 70-95 (higher means better match)
- salary_range: realistic range in USD (e.g., "$60k - $100k")
- growth_rate: percentage with descriptor (e.g., "+20% (Much faster than average)")
- education: typical requirements
- skills: exactly 4-5 relevant skills
- explanation: 3–5 sentences max, simple and supportive

User answers:
{profile_text}
"""

    return generate_json(prompt, "career")


@app.post("/api/ai/roadmap", dependencies=[Depends(limit_ai_requests)])
def roadmap_ai(payload: RoadmapRequest):
    career = payload.career
    profile_text = payload.answers.as_profile_text()

    prompt = f"""
Return STRICT JSON only in this exact shape:
{{
  "career": "{career}",
  "roadmap": [
    {{
      "title":"Step title",
      "description":"Brief description of what to do",
      "time":"2-4 weeks",
      "resources":[
        {{"name":"Resource name","url":"https://example.com"}},
        {{"name":"Another resource","url":"https://example.com"}}
      ],
      "tasks":["Task 1","Task 2","Task 3"],
      "video_query":"short YouTube search phrase"
    }}
  ]
}}

Rules:
- roadmap: 5 steps max
- each step: actionable, beginner-friendly
- time: estimate (e.g., "2-4 weeks", "1-2 months")
- resources: 2-3 learning resources with valid URLs
- tasks: 2-3 actionable items
- video_query: 3-8 word YouTube search phrase for a beginner tutorial covering this step (e.g. "Python basics for beginners"). No URLs.
- tailor to user's stage + location if provided

User answers:
{profile_text}

Chosen career:
{career}
"""

    result = generate_json(prompt, "roadmap")
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
