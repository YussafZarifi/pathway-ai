# Backend

A small FastAPI app in `backend/`. Run locally with `uvicorn main:app --reload --port 8000 --no-proxy-headers`; on Render the Blueprint also disables Uvicorn proxy rewriting and the app uses Render's trusted `CF-Connecting-IP` header (see `render.yaml`). For the complete local, Render and future-host configuration, see `docs/deployment.md` and ADR-023.

| File | Role |
|---|---|
| `main.py` | App, middleware, error handlers, guest endpoints, includes `routers/roadmaps.py` and `routers/resume_analyses.py` |
| `body_limit.py` | `BodySizeLimitMiddleware` (ASGI, innermost): 16 KB per request, 64 KB for `/api/roadmaps/import`, 2 MB for `/api/resume-analyses`; rejects a declared `Content-Length` over the limit at once and **counts the bytes actually read**, so chunked bodies without a length are limited too (since 2026-10-04, audit finding; before that only `Content-Length` was checked) |
| `generation.py` | Shared by guest and saved-roadmap routes: `generate()` (maps LLM errors to HTTP errors), `generate_roadmap()`, `add_videos()`, `prompt_version()` (moved out of `main.py` 2026-10-03) |
| `routers/roadmaps.py` | Saved roadmaps (ADR-019): `POST /api/roadmaps`, `POST /api/roadmaps/{id}/regenerate`, `POST /api/roadmaps/import` (M2-7); `get_repository` dependency (503 without `DATABASE_URL`) (added 2026-10-03, M2-6) |
| `routers/resume_analyses.py` | `POST /api/resume-analyses` (ADR-020, M3-4, 2026-10-05): dependency chain token → database → feature switch → Content-Type → per-user limit → active roadmap, all before the body is read; `read_pdf` reads at most 2 MB; maps résumé/AI/database errors to honest statuses |
| `link_check.py` | SSRF-safe check of AI-suggested resource links (P-7, 2026-10-08): HEAD only, https + port 443, the host resolved and vetted inside the connection step (public addresses only; connects to the vetted IP, TLS still checks the name), ≤ 3 redirects each re-checked, 3 s timeouts, 8 workers; drops only clearly broken links (404/410, no such host, non-HTTPS); logs counts only |
| `strict_ai.py` | Shared strict-reply helpers (2026-10-07): `load_strict_json` (no repair, duplicate keys refused), `text()` (trimmed, capped, no control characters), `error_summary` (field paths only), `contains_contact_details` (email/phone guard) |
| `routers/account.py` | `GET /api/me/export`, `DELETE /api/me` (ADR-022): per-user limits (separate budgets), recent-password check from the token's `amr`, `{"confirm": "DELETE"}` |
| `session_check.py` | `live_user` dependency: `current_user` plus `private.session_is_active()`, so tokens of ended sessions (sign-out, deleted account) get 401 on routes that spend AI, write or export (ADR-022 amendment) |
| `repositories/account.py` | `export` (all of the user's rows, `user_id` columns removed) and `delete` (`private.delete_current_user()`), Postgres + in-memory |
| `coach_ai.py` | AI Coach (ADR-021): system instruction, learner context as a labelled data part, history turns, strict `{reply, actions}` validation with actions checked against the roadmap, `coach_reply` |
| `routers/coach.py` | `GET /api/coach/availability`, `POST /api/coach/messages` (token → database → switch → per-user limit → body/personal-data guard → thread 404/409 → Gemini → one-transaction save) |
| `repositories/coach.py` | `load` (thread, last 12 messages, active roadmap with done flags, skills, latest review's gaps; one transaction) and `save_exchange` (thread + both messages, one transaction); Postgres + in-memory |
| `resume_ai.py` | Résumé analysis (M3-3): PDF checks, strict reply validation (reject, never repair), `analyze_resume` |
| `repositories/resume_analyses.py` | `active_target` (active roadmap's career, skills, ordered step titles) and `create` (one insert), Postgres + in-memory |
| `config.py` | Settings read once from environment variables (added 2026-09-27); `RESUME_ANALYSIS_ENABLED` (strict true/false, default false) and `RESUME_LIMIT_*` since 2026-10-05 |
| `schemas.py` | Pydantic request models: `QuizAnswersV2` (5-question quiz) and `QuizAnswersV1` (8-question quiz, temporary) behind one discriminated `QuizAnswers` (added 2026-09-27; v2 2026-09-28) |
| `prompts.py` | Prompt builders: v2 prompts for the 5-question quiz, v1 prompts unchanged (added 2026-09-28, ADR-016) |
| `rate_limit.py` | In-memory rate limiters used as FastAPI dependencies: `limit_ai_requests` (added 2026-09-27) and `limit_import_requests` (10/min, 100/day per IP, 5,000/day global; 2026-10-03); `limit_resume_requests` per **user** (3/hour, 10/day, 100/day global; 2026-10-05); `limit_coach_requests` per user (20/hour, 60/day, 300/day global; 2026-10-07) |
| `youtube.py` | YouTube Data API lookups for roadmap step videos (ADR-012) |
| `llm.py` | Gemini client, JSON mode + response schema, retry policy, per-attempt diagnostics (added 2026-09-27, ADR-015) |
| `ai_output.py` | Generation schemas, output models, JSON extraction and per-item validation (added 2026-09-27) |
| `request_log.py` | Logging setup with a per-request ID (`X-Request-ID`) (added 2026-09-27) |
| `auth.py` | Supabase access-token verification: `current_user` dependency, `verify_token` (PyJWT + cached JWKS, ES256/RS256 only, no shared secret, 30 s clock-skew leeway `CLOCK_SKEW_SECONDS` since 2026-10-04; never logs tokens or claims) (added 2026-09-30, ADR-018) |
| `db.py` | Postgres access for saved roadmaps (ADR-019): lazy `psycopg_pool` pool as `pathwayai_api` through the transaction pooler (prepared statements off), `transaction(user_id)` sets the verified user's claims transaction-locally so RLS applies; connection problems → `DatabaseUnavailable` (added 2026-10-03, M2-5) |
| `repositories/roadmaps.py` | `RoadmapRepository` Protocol: `create`, `get_source`, `add_regenerated`, `import_local`; `PostgresRoadmapRepository` (every method takes the user id; a per-user transaction-scoped advisory lock serializes one user's writes) and `InMemoryRoadmapRepository` for tests; `roadmap_out` / `step_out` map rows to the API shape (`time_estimate` → `time`) (added 2026-10-03, M2-5) |
| `tests/` | 551 pytest tests (`requirements-dev.txt`); see `docs/testing.md` |

## Configuration (`config.py`)
`load_dotenv()` reads `backend/.env` locally; on Render the service environment is used. Template: `backend/.env.example`.

| Variable | Default | Notes |
|---|---|---|
| `GEMINI_API_KEY` | — | Required. Without it the AI endpoints return 503 (logged at startup) |
| `YOUTUBE_API_KEY` | — | Optional (read by `youtube.py`); without it steps get a search link |
| `ALLOWED_ORIGINS` | empty | Comma-separated CORS origins, trailing slash tolerated. **No localhost default**: empty means no browser origin is allowed (warning at startup) |
| `GEMINI_MODEL` | `gemini-2.5-flash-lite` | |
| `GEMINI_TIMEOUT_SECONDS` | 30 | Per Gemini request |
| `API_DOCS_ENABLED` | `false` | Set `true` only for local development; controls `/docs`, `/redoc` and `/openapi.json` |
| `TRUSTED_PROXY_MODE` | `none` | `none` ignores forwarded headers; `render` trusts Render's `CF-Connecting-IP`; `cidrs` enables XFF only from configured trusted proxy networks |
| `TRUSTED_PROXY_CIDRS` | empty | Comma-separated IPv4/IPv6 CIDRs required for `TRUSTED_PROXY_MODE=cidrs` |
| `RATE_LIMIT_PER_MINUTE` | 8 | Per client IP, AI endpoints combined |
| `RATE_LIMIT_PER_DAY` | 50 | Per client IP |
| `GLOBAL_AI_LIMIT_PER_DAY` | 500 | All clients together |
| `SUPABASE_URL` | empty | Optional (ADR-018). `https://<ref>.supabase.co`; issuer + JWKS for token checks. Empty: `/api/me` returns 503, AI routes unaffected. Not a secret |
| `DATABASE_URL` | empty | Optional **secret** (ADR-019): transaction-pooler URL for the `pathwayai_api` role. Empty: the app starts normally, `/api/roadmaps*` return 503, guests unaffected. Tests force it empty |
| `DB_POOL_MAX` | 5 | Max pooled database connections |
| `LOG_LEVEL` | `INFO` | |

## Endpoints (✅)
| Method | Path | Handler | Summary |
|---|---|---|---|
| GET | `/` | `root` | `{"status":"ok","message":"Backend is running"}` |
| GET | `/health` | `health` | `{"status":"ok"}`; no external calls, not rate limited (Render health check) |
| GET | `/api/me` | `me` | `{id, email}` of the signed-in user; `Depends(current_user)`, 401/503 otherwise (since 2026-09-30) |
| POST | `/api/ai/career` | `career_ai` | 3 tech careers + explanation (rate limited) |
| POST | `/api/ai/roadmap` | `roadmap_ai` | ≤5-step roadmap with videos (rate limited); guests, nothing saved |
| POST | `/api/roadmaps` | `create_roadmap` | Signed-in: generate + save; 201 with step ids (since 2026-10-03) |
| POST | `/api/roadmaps/{id}/regenerate` | `regenerate_roadmap` | Signed-in: new roadmap from saved answers; 404 not yours, 409 no answers |
| POST | `/api/roadmaps/{id}/activate` | `activate_roadmap` | Signed-in: make an archived roadmap current again (roadmap history; since 2026-10-07) |
| POST | `/api/roadmaps/import` | `import_roadmap` | Signed-in: import the browser-saved roadmap once; 201 new / 200 existing; 64 KB body limit; own rate limit |
| GET | `/api/me/export` | `export_data` | Signed-in: JSON file with all the user's data (since 2026-10-07) |
| DELETE | `/api/me` | `delete_account` | Signed-in, password confirmed within 5 minutes, `{"confirm":"DELETE"}`: deletes the account; 204 (since 2026-10-07) |
| GET | `/api/coach/availability` | `availability` | Signed-in: `{available, reason}` (since 2026-10-07) |
| POST | `/api/coach/messages` | `post_message` | Signed-in: one coach reply with suggested actions; both messages saved in one transaction (since 2026-10-07) |
| GET | `/api/resume-analyses/availability` | `availability` | Signed-in: `{available, reason, career, roadmap_id}` for the `/resume` page; feature switch first, then the active roadmap (since 2026-10-07) |
| POST | `/api/resume-analyses` | `create_analysis` | Signed-in, feature switch on: raw PDF (≤ 2 MB) → strict AI review against the active roadmap → saved; 201 (since 2026-10-05) |

Full contracts: `docs/api.md`.

## Request pipeline
1. **CORS** (outermost middleware): only `ALLOWED_ORIGINS`, methods GET/POST, headers `Content-Type` and `Authorization` (Bearer token, since 2026-09-30), no credentials (cookies).
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
- Client IP is resolved from the raw socket peer. `TRUSTED_PROXY_MODE=none` (local default) ignores forwarding headers. Render mode trusts only one valid `CF-Connecting-IP` header; Render documents that Cloudflare overwrites it and the app port is not directly reachable. CIDR mode first verifies the socket peer is in `TRUSTED_PROXY_CIDRS`, then walks a single, valid `X-Forwarded-For` chain right-to-left and skips only configured proxy addresses. Untrusted peers, malformed values and duplicate headers fall back to the socket peer. Keep Uvicorn `--no-proxy-headers` enabled so the application sees that peer unchanged.
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
fastapi 0.133.1 + starlette 1.3.1 (upgraded 2026-10-04 from 0.128.0 / 0.50.0 for security advisories; with anyio 4.14.2, idna 3.15, click 8.3.3, python-dotenv 1.2.2), uvicorn 0.40, pydantic 2.12, google-genai 2.25, python-dotenv, httpx, PyJWT 2.15.1, psycopg 3.3.6 (+ psycopg-binary) and psycopg-pool 3.3.3 (since 2026-10-03), plus transitive packages (`tzdata` on Windows only). **`openai` 2.14 is listed but unused** (open question 4). Two virtualenvs exist (repo root `.venv`, which the owner's dev server uses, and `backend/.venv`); consolidate to one.

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
