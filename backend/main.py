import logging
from concurrent.futures import ThreadPoolExecutor

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import config
import llm
import request_log
import youtube
from ai_output import CareerSchema, RoadmapSchema, parse_careers, parse_roadmap
from auth import AuthUser, current_user
from prompts import build_career_prompt, build_roadmap_prompt
from rate_limit import limit_ai_requests
from schemas import CareerRequest, RoadmapRequest

request_log.setup(config.LOG_LEVEL)
logger = logging.getLogger("pathwayai")

# Answers are a handful of short strings; anything bigger is not a quiz.
MAX_BODY_BYTES = 16 * 1024

AI_UNAVAILABLE = "PathwayAI's AI service is temporarily unavailable. Please try again later."
AI_QUOTA = "PathwayAI has reached its AI usage limit for now. Please try again later."
AI_BUSY = "PathwayAI's AI service is busy right now. Please wait a minute and try again."
AI_FAILED = "We couldn't generate results right now. Please try again."
INVALID_ANSWERS = "Some quiz answers are missing or too long. Please retake the quiz and try again."

app = FastAPI(title="PathwayAI API")

if not config.ALLOWED_ORIGINS:
    logger.warning("ALLOWED_ORIGINS is empty: browsers on other origins can't call this API")
if not config.GEMINI_API_KEY:
    logger.error("GEMINI_API_KEY is not set: AI endpoints will return 503")
if not config.SUPABASE_URL:
    logger.info("SUPABASE_URL is not set: account routes will return 503")



@app.middleware("http")
async def limit_body_size(request: Request, call_next):
    length = request.headers.get("content-length")
    if length and (not length.isdigit() or int(length) > MAX_BODY_BYTES):
        return JSONResponse(status_code=413, content={"detail": "Request is too large."})
    return await call_next(request)


@app.middleware("http")
async def add_request_id(request: Request, call_next):
    rid = request_log.new_request_id()
    response = await call_next(request)
    response.headers["X-Request-ID"] = rid
    return response


# Added last so it wraps everything, including the 413 above and 429s.
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    # Authorization carries the Supabase access token (Bearer, not a cookie,
    # so allow_credentials stays off).
    allow_headers=["Content-Type", "Authorization"],
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


def generate(prompt: str, label: str, schema, parse) -> dict:
    """Run llm.generate and turn its failures into user-safe HTTP errors."""
    try:
        return llm.generate(prompt, label, schema, parse)
    except llm.AIServiceError as e:
        if e.kind == "unavailable":
            raise HTTPException(status_code=503, detail=AI_UNAVAILABLE) from None
        if e.kind == "quota":
            raise HTTPException(status_code=503, detail=AI_QUOTA) from None
        if e.kind == "busy":
            raise HTTPException(
                status_code=503, detail=AI_BUSY, headers={"Retry-After": str(e.retry_after or 60)}
            ) from None
        raise HTTPException(status_code=502, detail=AI_FAILED) from None


@app.get("/")
def root():
    return {"status": "ok", "message": "Backend is running"}


@app.get("/health")
def health():
    """Liveness check for the host. Makes no external calls and spends no quota."""
    return {"status": "ok"}


@app.get("/api/me")
def me(user: AuthUser = Depends(current_user)):
    """The signed-in user, from a verified Supabase access token (ADR-018)."""
    return {"id": user.id, "email": user.email}


@app.post("/api/ai/career", dependencies=[Depends(limit_ai_requests)])
def career_ai(payload: CareerRequest):
    prompt = build_career_prompt(payload.answers)
    return generate(prompt, f"career v{payload.answers.version}", CareerSchema, parse_careers)


@app.post("/api/ai/roadmap", dependencies=[Depends(limit_ai_requests)])
def roadmap_ai(payload: RoadmapRequest):
    career = payload.career
    prompt = build_roadmap_prompt(payload.answers, career)
    result = generate(
        prompt, f"roadmap v{payload.answers.version}", RoadmapSchema,
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
