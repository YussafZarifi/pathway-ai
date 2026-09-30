# API Reference

Base URL: `VITE_API_URL` in the frontend (local dev: `http://127.0.0.1:8000`). No versioning, no authentication. Content type: `application/json`. Request bodies over 16 KB → 413.

Since 2026-09-27 (ADR-014) both AI endpoints validate requests with Pydantic (`backend/schemas.py`), are rate limited, and return only user-friendly `detail` messages, never exception text. Since ADR-015 their **responses are validated too** (`backend/ai_output.py`): the shapes below are guaranteed, with defaults for missing optional fields. Every response carries an `X-Request-ID` header that matches the backend log lines.

> Status: ✅ implemented · 🗺️ planned

---

## ✅ `GET /`
Health check.
```json
{ "status": "ok", "message": "Backend is running" }
```
Doesn't check Gemini connectivity.

---

## ✅ `GET /health`
Liveness check used by Render. No external calls, no quota, not rate limited. Added 2026-09-27.
```json
{ "status": "ok" }
```

---

## ✅ `GET /api/me`
The signed-in user (added 2026-09-30, ADR-018). Requires `Authorization: Bearer <Supabase access token>`; the token is verified locally (ES256/RS256 via the project's JWKS, `exp`, `iss = <SUPABASE_URL>/auth/v1`, `aud = authenticated`, `role = authenticated`, not anonymous). Not rate limited, no Gemini call.
```json
{ "id": "<auth user uuid>", "email": "learner@example.com" }
```
| Status | When | `detail` |
|---|---|---|
| 401 (+ `WWW-Authenticate: Bearer`) | missing, malformed, expired, wrong issuer/audience/signature/algorithm, unknown key | "Please sign in again." |
| 503 | `SUPABASE_URL` not set | "Accounts are not available on this server." |
| 503 | JWKS can't be fetched | "We couldn't check your sign-in right now. Please try again." |

The AI routes below don't use it: guests need no token.

---

## ✅ `POST /api/ai/career`
Generates exactly 3 technology-career suggestions.

**Request**
```json
{
  "answers": {
    "interests": ["Building apps", "Analyzing data"],
    "problem_style": "Dig in until I find the root cause",
    "experience": "Built a few projects",
    "weekly_hours": 10,
    "goal": "Get my first tech job",
    "career_in_mind": "Data engineer"
  }
}
```
`answers` is validated by `QuizAnswers` (`backend/schemas.py`), which accepts **two formats** (ADR-016). The format is chosen by the presence of `interests`; no version field is needed.

| Format | Sent by | Fields |
|---|---|---|
| **v2** (5-question quiz, since 2026-09-28) | the quiz | `interests`: 1–3 strings (≤80 chars each, duplicates removed) · `problem_style`, `experience`, `goal`: strings 1–80 chars · `weekly_hours`: one of `2, 5, 10, 20` (20 = "20+") · `career_in_mind`: optional, ≤100 chars |
| **v1** (original 8-question quiz) | "Regenerate" on roadmaps saved before the new quiz | `stage, goal, interest_area, work_style, environment`: strings 1–80 · `experience_level`: int 0–10 · `education_comfort`: int 0–6 · `curious_fields`: optional, ≤300 chars |

Keys match the question IDs in `frontend/src/data/questions.js`. Control characters are replaced with spaces; unknown keys are ignored. v1 support is temporary: remove it once no saved roadmap needs it.

**Response 200** (shape requested from the model; not validated server-side)
```json
{
  "careers": [
    {
      "title": "Machine Learning Engineer",
      "reason": "1–2 sentences",
      "match_score": 88,
      "salary_range": "$90k - $150k",
      "growth_rate": "+20% (Much faster than average)",
      "education": "Bachelor's degree",
      "skills": ["Python", "PyTorch", "MLOps", "SQL"]
    }
  ],
  "explanation": "3–5 supportive sentences"
}
```
Rules in the prompt: exactly 3 careers, tech-only, `match_score` 70–95, 4–5 skills, USD salaries. Validation guarantees 1–3 careers, each with `title` and an integer `match_score` 0–100; other fields default to `""` / `[]`; at most 8 skills.

**Errors**
| Status | When | Body |
|---|---|---|
| 413 | Body over 16 KB | `{"detail":"Request is too large."}` |
| 422 | Missing/invalid answers (incl. empty) | `{"detail":"Some quiz answers are missing or too long. Please retake the quiz and try again."}` |
| 429 | Rate limit (per IP per minute/day, or global per day) | Friendly message + `Retry-After` header |
| 502 | Gemini error, timeout, or unusable reply, after one retry | `{"detail":"We couldn't generate results right now. Please try again."}` |
| 503 | Gemini daily quota used up | `{"detail":"PathwayAI has reached its AI usage limit for now. Please try again later."}` |
| 503 | Gemini per-minute limit | `{"detail":"PathwayAI's AI service is busy right now. Please wait a minute and try again."}` + `Retry-After` |
| 503 | `GEMINI_API_KEY` not configured | `{"detail":"PathwayAI's AI service is temporarily unavailable. Please try again later."}` |

---

## ✅ `POST /api/ai/roadmap`
Generates a roadmap of up to 5 steps for the chosen career.

**Request**
```json
{ "answers": { "...": "same as above" }, "career": "Machine Learning Engineer" }
```
`career`: 1–100 chars, control characters replaced.

**Response 200**
```json
{
  "career": "Machine Learning Engineer",
  "roadmap": [
    {
      "title": "Python & math foundations",
      "description": "…",
      "time": "2-4 weeks",
      "resources": [{ "name": "…", "url": "https://…" }],
      "tasks": ["…", "…"],
      "video_query": "python basics for beginners",
      "videos": [
        {
          "id": "abc123",
          "title": "Python for Beginners - Full Course",
          "channel": "freeCodeCamp.org",
          "thumbnail": "https://i.ytimg.com/vi/abc123/mqdefault.jpg",
          "url": "https://www.youtube.com/watch?v=abc123"
        }
      ],
      "video_search_url": "https://www.youtube.com/results?search_query=python+basics+for+beginners"
    }
  ]
}
```
Validation guarantees 1–5 steps, each with a `title`; `description` `""`, `time` `"Varies"`, `resources`/`tasks` `[]` when missing. `career` echoes the request.
⚠ `resources[].url` is generated by the model and may not exist (only `http(s)` URLs are kept).
✅ `videos` (since 2026-09-26) are **real** YouTube Data API search results for the model's `video_query`, up to 2 per step. They are `[]` when `YOUTUBE_API_KEY` is unset or the API fails (e.g. quota exhausted). `video_search_url` is always present as the fallback. See ADR-012.
Frontend normalization adds `step` (1-based) and defaults `time: "Varies"`, `resources: []`, `tasks: []`, `videos: []`.

**Errors:** same table as `/api/ai/career` (413, 422, 429, 502, 503).

---

## CORS
Origins come from `ALLOWED_ORIGINS` (comma-separated, no default). Methods GET/POST, header `Content-Type`, no credentials. Error responses (413/429) carry CORS headers too, so the frontend can read their messages.

---

## 🗺️ Planned API (v1)
| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness + dependency checks |
| POST | `/v1/careers/suggest` | Validated career suggestions (typed request/response) |
| POST | `/v1/roadmaps` | Create + persist a roadmap (supports SSE streaming via `Accept: text/event-stream`) |
| GET | `/v1/roadmaps/{id}` | Fetch a saved roadmap |
| PATCH | `/v1/roadmaps/{id}/steps/{stepId}` | Update step status (optimistic UI) |
| GET | `/v1/me/progress` | Server-computed progress and scores |
| POST | `/v1/resume/analyze` | Upload PDF → structured critique |
| POST | `/v1/coach/messages` | Streaming coach chat with tool calling |
| GET | `/r/{slug}` | Public shared roadmap |

Conventions for new endpoints: plural nouns, `/v1` prefix, Pydantic request **and** response models, consistent error envelope `{ "error": { "code", "message", "requestId" } }`, rate-limited, never echo internal exceptions.
