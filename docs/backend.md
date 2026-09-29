# Backend

A small FastAPI app in `backend/`. Run locally with `uvicorn main:app --reload --port 8000`; on Render it runs with `uvicorn main:app --host 0.0.0.0 --port $PORT --proxy-headers --forwarded-allow-ips "*"` (see `render.yaml`).

| File | Role |
|---|---|
| `main.py` | App, middleware, error handlers, endpoints, `generate()` (maps LLM errors to HTTP errors), `add_videos()` |
| `config.py` | Settings read once from environment variables (added 2026-09-27) |
| `schemas.py` | Pydantic request models: `QuizAnswersV2` (5-question quiz) and `QuizAnswersV1` (8-question quiz, temporary) behind one discriminated `QuizAnswers` (added 2026-09-27; v2 2026-09-28) |
| `prompts.py` | Prompt builders: v2 prompts for the 5-question quiz, v1 prompts unchanged (added 2026-09-28, ADR-016) |
| `rate_limit.py` | In-memory rate limiter used as a FastAPI dependency (added 2026-09-27) |
| `youtube.py` | YouTube Data API lookups for roadmap step videos (ADR-012) |
| `llm.py` | Gemini client, JSON mode + response schema, retry policy, per-attempt diagnostics (added 2026-09-27, ADR-015) |
| `ai_output.py` | Generation schemas, output models, JSON extraction and per-item validation (added 2026-09-27) |
| `request_log.py` | Logging setup with a per-request ID (`X-Request-ID`) (added 2026-09-27) |
| `tests/` | 80 pytest tests (`requirements-dev.txt`); see `docs/testing.md` |

## Configuration (`config.py`)
`load_dotenv()` reads `backend/.env` locally; on Render the service environment is used. Template: `backend/.env.example`.

| Variable | Default | Notes |
|---|---|---|
| `GEMINI_API_KEY` | — | Required. Without it the AI endpoints return 503 (logged at startup) |
| `YOUTUBE_API_KEY` | — | Optional (read by `youtube.py`); without it steps get a search link |
| `ALLOWED_ORIGINS` | empty | Comma-separated CORS origins, trailing slash tolerated. **No localhost default**: empty means no browser origin is allowed (warning at startup) |
| `GEMINI_MODEL` | `gemini-2.5-flash-lite` | |
| `GEMINI_TIMEOUT_SECONDS` | 30 | Per Gemini request |
| `RATE_LIMIT_PER_MINUTE` | 8 | Per client IP, AI endpoints combined |
| `RATE_LIMIT_PER_DAY` | 50 | Per client IP |
| `GLOBAL_AI_LIMIT_PER_DAY` | 500 | All clients together |
| `LOG_LEVEL` | `INFO` | |

## Endpoints (✅)
| Method | Path | Handler | Summary |
|---|---|---|---|
| GET | `/` | `root` | `{"status":"ok","message":"Backend is running"}` |
| GET | `/health` | `health` | `{"status":"ok"}`; no external calls, not rate limited (Render health check) |
| POST | `/api/ai/career` | `career_ai` | 3 tech careers + explanation (rate limited) |
| POST | `/api/ai/roadmap` | `roadmap_ai` | ≤5-step roadmap with videos (rate limited) |

Full contracts: `docs/api.md`.

## Request pipeline
1. **CORS** (outermost middleware): only `ALLOWED_ORIGINS`, methods GET/POST, header `Content-Type`, no credentials.
2. **Body size**: `Content-Length` over 16 KB → 413 before parsing.
3. **Rate limit** (`Depends(limit_ai_requests)` on the AI routes) → 429 with `Retry-After`.
4. **Validation** (`schemas.py`): `QuizAnswers` is v2 when `interests` is present, else v1 (field rules in `docs/api.md`); `career` 1–100 chars. Control characters (newlines etc.) are replaced with spaces. Unknown keys are ignored. Failure → 422 with a friendly message; the log lists failing field paths only (e.g. `answers.v2.weekly_hours`).
5. **Prompt** (`prompts.py`): v2 → labelled profile + "How to read the profile" guidance; v1 → the original prompts, byte-identical. Built from the validated model, so unknown keys never reach the prompt. Log labels include the format (`roadmap v1 attempt 1: ok`).
6. **Gemini** via `llm.generate(prompt, label, schema, parse)`: JSON mode + response schema, 30 s timeout, at most 2 attempts (retry policy in `docs/ai-system.md`).
7. **Validation** via `ai_output.parse_careers` / `parse_roadmap`: extraction, per-item Pydantic validation, defaults for missing fields, invalid items dropped.
8. (roadmap) `add_videos(result, career)` adds `videos`, `video_search_url` and `video_query` per step (parallel YouTube lookups, 5 s timeout, in-memory cache; failures → `[]`).
9. The validated dict is returned.

## Rate limiting (`rate_limit.py`, ADR-014)
Sliding windows keyed by client IP (per minute, per day) plus one global daily window. Only allowed requests are recorded, so memory is bounded by the global cap. Checks the day window before the minute window so the message is accurate. Invalid (422) requests still count, since the dependency runs before body validation.
- Client IP = `request.client.host`, which Uvicorn fills from `X-Forwarded-For` with `--proxy-headers --forwarded-allow-ips "*"`. A client that forges `X-Forwarded-For` might get a fresh per-IP bucket; the global cap still bounds total spend.
- State is per process: resets on restart/deploy and isn't shared between instances. Move to Redis (Render Key Value) before running more than one instance.

## Error handling
Clients never see exception text.

| Case | Status | `detail` |
|---|---|---|
| Invalid body | 422 | "Some quiz answers are missing or too long. Please retake the quiz and try again." |
| Body too large | 413 | "Request is too large." |
| Rate limited | 429 | Minute / day / global message |
| `GEMINI_API_KEY` missing | 503 | "PathwayAI's AI service is temporarily unavailable. Please try again later." |
| Gemini daily quota used up | 503 | "PathwayAI has reached its AI usage limit for now. Please try again later." |
| Gemini per-minute limit (after the one allowed wait) | 503 + `Retry-After` | "PathwayAI's AI service is busy right now. Please wait a minute and try again." |
| Gemini error, timeout or unusable reply after the retry | 502 | "We couldn't generate results right now. Please try again." |
| Anything unexpected | 500 | Same as 502 |

## Logging
Python `logging` (`LOG_LEVEL`), format `time level logger rid=<request id>: message`; the ID is also returned as `X-Request-ID`. Logged: per Gemini attempt the outcome, finish reason, tokens, reply length, JSON strategy, dropped items (field paths + error types), reply sha256 prefix, and for errors the code/status (plus quota id and retry delay on 429); invalid request field names; rate-limit hits (scope only); YouTube error class; startup config warnings. **Never logged:** quiz answers, prompts, AI output, API keys. Example:
```
INFO pathwayai.llm rid=89e3c00c1a9e: roadmap attempt 1: ok items=5 strategy=direct finish=STOP tokens=325/1146 chars=4624 (10.5s)
WARNING pathwayai.llm rid=3f575856b373: career attempt 1: Gemini 429 RESOURCE_EXHAUSTED quota=GenerateRequestsPerDayPerProjectPerModel-FreeTier retry_delay=34s (0.2s)
``` The `google_genai` and `httpx` libraries also log at INFO (request URLs without keys; Gemini sends its key in a header).

## Dependencies (`requirements.txt`)
fastapi 0.128, uvicorn 0.40, pydantic 2.12, google-genai 2.25, python-dotenv, httpx, plus transitive packages. **`openai` 2.14 is listed but unused** (open question 4). Two virtualenvs exist (repo root `.venv`, which the owner's dev server uses, and `backend/.venv`); consolidate to one.

## Remaining security gaps
- No auth: anyone can call the AI endpoints within the rate limits.
- Prompt injection is reduced (length limits, no control characters, unknown keys dropped, v2 free text JSON-quoted and marked as data) but not prevented: `career_in_mind` (v2), `curious_fields` (v1) and `career` are still free text in the prompt (TD-13).
- Resource URLs are still model-invented; only non-http(s) URLs are filtered (TD-21).

## Planned structure (🗺️)
```
backend/
├── app/
│   ├── main.py            # app factory, middleware, routers
│   ├── config.py          # pydantic-settings
│   ├── api/               # routers: careers.py, roadmaps.py, progress.py, health.py
│   ├── schemas/           # Pydantic request/response models (shared with AI response_schema)
│   ├── services/llm.py    # prompt building, structured output, retries, caching, token logging
│   ├── prompts/           # versioned prompt templates
│   ├── db/                # SQLAlchemy/SQLModel models + Alembic migrations
│   └── core/              # logging, errors, rate limiting, auth
└── tests/                 # pytest with mocked LLM
```
