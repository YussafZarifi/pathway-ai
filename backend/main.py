import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import config
import db
from body_limit import BodySizeLimitMiddleware
import request_log
import resume_ai
from ai_output import CareerSchema, parse_careers
from auth import AuthUser, current_user
from generation import AI_FAILED, generate, generate_roadmap
from prompts import build_career_prompt
from rate_limit import limit_ai_requests
from routers import resume_analyses as resume_router
from routers import roadmaps as roadmaps_router
from schemas import CareerRequest, RoadmapRequest

request_log.setup(config.LOG_LEVEL)
logger = logging.getLogger("pathwayai")

# Answers are a handful of short strings; anything bigger is not a quiz.
MAX_BODY_BYTES = 16 * 1024
# Except an imported browser roadmap: up to 5 steps with tasks, resources
# and video metadata (ADR-019), and a résumé PDF (ADR-020).
MAX_BODY_BYTES_BY_PATH = {
    "/api/roadmaps/import": 64 * 1024,
    "/api/resume-analyses": resume_ai.MAX_PDF_BYTES,
}

INVALID_ANSWERS = "Some quiz answers are missing or too long. Please retake the quiz and try again."


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    db.close()  # the saved-roadmap pool, if it was ever opened


app = FastAPI(title="PathwayAI API", lifespan=lifespan)

if not config.ALLOWED_ORIGINS:
    logger.warning("ALLOWED_ORIGINS is empty: browsers on other origins can't call this API")
if not config.GEMINI_API_KEY:
    logger.error("GEMINI_API_KEY is not set: AI endpoints will return 503")
if not config.SUPABASE_URL:
    logger.info("SUPABASE_URL is not set: account routes will return 503")
if not config.DATABASE_URL:
    logger.info("DATABASE_URL is not set: saved-roadmap routes will return 503")
if config.RESUME_ANALYSIS_ENABLED:
    logger.warning("RESUME_ANALYSIS_ENABLED is on: use it only with a paid Gemini key (ADR-020)")
else:
    logger.info("RESUME_ANALYSIS_ENABLED is off: résumé analysis returns 503")

# Body limits are enforced while the body is read (chunked bodies included;
# see body_limit.py). Registered first so it is the innermost middleware:
# FastAPI then reads the body through it directly, and its 413 isn't wrapped
# by the BaseHTTPMiddleware below (which would turn it into a 400).
app.add_middleware(
    BodySizeLimitMiddleware,
    default_limit=MAX_BODY_BYTES,
    limits_by_path=MAX_BODY_BYTES_BY_PATH,
)


@app.middleware("http")
async def add_request_id(request: Request, call_next):
    rid = request_log.new_request_id()
    response = await call_next(request)
    response.headers["X-Request-ID"] = rid
    return response


# Added last so it wraps everything, including 413s and 429s.
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
    """Guests: generate a roadmap without saving it (the browser keeps it)."""
    return generate_roadmap(payload.answers, payload.career)


# Signed-in users: generate and save roadmaps (ADR-019).
app.include_router(roadmaps_router.router)
# Signed-in users: analyze a résumé against the current roadmap (ADR-020).
app.include_router(resume_router.router)
