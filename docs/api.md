# API Reference

Base URL: `VITE_API_URL` in the frontend (local dev: `http://127.0.0.1:8000`). No versioning. The AI routes need no authentication (guests); `/api/me`, `/api/roadmaps*` and `/api/resume-analyses` need a Supabase access token (ADR-018/019/020). Content type: `application/json`. Request bodies over 16 KB (64 KB for `/api/roadmaps/import`, 2 MB for `/api/resume-analyses`) → 413, whether or not the client sends `Content-Length` (chunked bodies are counted as they are read, since 2026-10-04).

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
The signed-in user (added 2026-09-30, ADR-018). Requires `Authorization: Bearer <Supabase access token>`; the token is verified locally (ES256/RS256 via the project's JWKS, `exp`/`iat`/`nbf` with a 30 s clock-skew leeway, `iss = <SUPABASE_URL>/auth/v1`, `aud = authenticated`, `role = authenticated`, not anonymous). Not rate limited, no Gemini call.
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

## ✅ `POST /api/roadmaps`
Generate a roadmap for a **signed-in** user and save it to their account (added 2026-10-03, ADR-019, M2-6). Requires `Authorization: Bearer <Supabase access token>`. Dependencies run in order: token check → database configured → AI rate limit (the same per-IP/global limiter as `/api/ai/*`), so rejected requests spend no quota. Gemini + YouTube run first; only then a short database transaction (as the `pathwayai_api` role, RLS-scoped to the user) saves the quiz submission, archives the previous active roadmap and inserts the new one with its steps.

Request:
```json
{ "answers": { "...": "v2 (or v1) quiz answers, as /api/ai/roadmap" }, "career": "Data Engineer",
  "career_data": { "title": "Data Engineer", "match_score": 88, "salary_range": "...", "growth_rate": "...", "education": "...", "reason": "...", "skills": ["SQL"] } }
```
`career_data` is optional; when present it's re-validated with `ai_output.Career` (invalid → 422 before Gemini).

Response **201**:
```json
{ "id": "<uuid>", "career": "Data Engineer", "career_data": { "...": "..." }, "status": "active",
  "source": "generated", "can_regenerate": true, "created_at": "2026-10-03T12:00:00Z",
  "roadmap": [ { "id": "<step uuid>", "position": 0, "title": "...", "description": "...", "time": "2-3 weeks",
                 "resources": [ { "name": "...", "url": "https://..." } ], "tasks": ["..."],
                 "video_query": "...", "videos": [ { "id": "...", "title": "...", "channel": "...", "thumbnail": "...", "url": "..." } ],
                 "video_search_url": "https://www.youtube.com/results?search_query=..." } ] }
```

| Status | When | `detail` |
|---|---|---|
| 401 | missing/invalid token | "Please sign in again." |
| 422 | invalid answers/career, invalid `career_data` | user-safe message |
| 429 | rate limit | as `/api/ai/*` |
| 502 / 503 | Gemini failure / quota / busy | as `/api/ai/*`; nothing is saved |
| 503 | `SUPABASE_URL` unset | "Accounts are not available on this server." |
| 503 | `DATABASE_URL` unset | "Saving roadmaps to your account isn't available right now." |
| 503 | generated but saving failed (database down, constraint) | "Your roadmap was generated but couldn't be saved to your account. Please try again." (one Gemini request is spent; accepted in ADR-019) |

---

## ✅ `POST /api/roadmaps/import`
Save the roadmap kept in this browser (localStorage, ADR-013) to the signed-in user's account, **once** per `(user, local_id)` (added 2026-10-03, ADR-019, M2-7). Requires a token. Dependencies: token → database configured → its own light rate limit (per IP 10/min and 100/day, global 5,000/day; separate from the AI limit, no Gemini call). Body limit **64 KB** on this path only (16 KB elsewhere).

Request (what `lib/roadmapStore.js` keeps, plus completed steps by position):
```json
{ "local_id": "mg8x2k1abcdef", "career": "Web Developer",
  "career_data": { "title": "Web Developer", "match_score": 84 },
  "answers": { "...": "v2 or v1 quiz answers (optional)" },
  "generated_at": 1790812345678,
  "steps": [ { "title": "...", "description": "...", "time": "...", "resources": [], "tasks": [],
               "video_query": "...", "videos": [ { "id": "...", "url": "https://www.youtube.com/watch?v=..." } ],
               "video_search_url": "https://www.youtube.com/results?search_query=..." } ],
  "completed": [ { "position": 0, "completed_at": 1790898745678 } ] }
```
- `steps`: 1–5, each validated like AI output (`ai_output.RoadmapStep`: a missing title → 422, long text truncated, non-http(s) resources dropped) plus video metadata (non-http(s) videos/search URLs dropped).
- `answers` / `career_data`: optional and **lenient**: invalid ones are dropped (the import still succeeds; without answers the roadmap can't be regenerated → `can_regenerate: false`).
- `generated_at` / `completed_at`: milliseconds; clamped to [now − 1 year, now]. `completed` positions beyond the steps are ignored (≤10 items, positions 0–9).
- The import becomes the **active** roadmap only if it's newer than the account's active one; otherwise it's stored `archived`.

| Status | When |
|---|---|
| **201** | imported now (body: the saved roadmap, same shape as `POST /api/roadmaps`, `source: "imported"`) |
| **200** | this `local_id` was imported before: the existing roadmap (retries, two tabs; concurrent imports are serialized) |
| 401 / 503 | as above (`SUPABASE_URL` / `DATABASE_URL` unset) |
| 413 | body over 64 KB |
| 422 | invalid `local_id` (`[A-Za-z0-9_-]{1,64}`), career, steps or `completed` |
| 429 | import rate limit |
| 503 | database failure: "We couldn't save this roadmap to your account right now. The copy on this device is unchanged…" |

---

## ✅ `POST /api/roadmaps/{id}/regenerate`
A new roadmap for the same career from the **saved** quiz answers (no body). The new one becomes active; the previous active one is archived. Same auth, ordering, rate limit and 201 shape as above.

| Status | When |
|---|---|
| 404 "We couldn't find that roadmap." | the id doesn't exist **or** belongs to another user (same answer, so ids can't be probed) |
| 409 | the roadmap has no saved answers (an import without answers): "…can't be regenerated… Retake the quiz…" |
| 422 | the id isn't a UUID |
| 503 | database unreachable while loading ("We couldn't reach your saved roadmaps right now…"), or saving failed after generation |

Saved roadmaps are **read** by the browser directly through Supabase (RLS), so there is no GET route.

---

## ✅ `GET /api/resume-analyses/availability` (since 2026-10-07, M3-5, ADR-020)
Whether the signed-in user can analyze a résumé right now; the `/resume` page calls it on load and after an upload fails with 401/409/503.

**200:** `{"available": true, "reason": null, "career": "Data Analyst", "roadmap_id": "uuid"}` or `{"available": false, "reason": "feature_disabled" | "no_active_roadmap" | "unavailable", "career": null, "roadmap_id": null}`. `career` is the active roadmap's career the résumé would be reviewed against and `roadmap_id` its id (the page links gaps of reviews made against this roadmap to its steps); `unavailable` means the accounts' database isn't configured. The feature switch is checked first (a disabled feature never touches the database). Nothing else is exposed: no limits, quotas, model or configuration. Not rate limited (no AI call, one small read).

| Status | When |
|---|---|
| 401 | missing or invalid token |
| 503 | accounts off (`SUPABASE_URL`), or the roadmap can't be read right now |

---

## ✅ `POST /api/resume-analyses` (since 2026-10-05, M3-4, ADR-020)
Analyze a résumé PDF against the signed-in user's **current roadmap** (its career, the career card's skills and the step titles) and save the structured result. **Off by default** (`RESUME_ANALYSIS_ENABLED=false`: only with a paid Gemini key).

- **Request:** `Authorization: Bearer <access token>`, `Content-Type: application/pdf`, body = the raw PDF (not multipart), 1 KB–2 MB.
- **Check order** (all before any of the body is read; an upload declared over 2 MB is refused even earlier, by the body-limit middleware): token → database configured → feature switch → Content-Type → per-user rate limit → active roadmap. Then the body is read (counted while it arrives), checked (`%PDF-` signature, `%%EOF` at the end), sent to Gemini inline and the strictly validated analysis is saved in one insert.
- **Privacy:** the PDF exists only in the request's memory. Neither the file, its text, its file name (a `Content-Disposition` header is ignored) nor a hash of it is stored or logged; logs record outcome, size and time.

**201:**
```json
{
  "id": "uuid", "roadmap_id": "uuid", "career": "Data Analyst",
  "analysis": {
    "summary": "…",
    "matched_skills": ["SQL"], "missing_skills": ["Tableau"],
    "strengths": ["…"],
    "gaps": [{"skill": "Tableau", "why": "…", "how_to_close": "…", "related_step": 3}],
    "suggestions": [{"section": "projects", "text": "…"}]
  },
  "prompt_version": "r1", "model": "gemini-2.5-flash-lite", "created_at": "2026-10-05T23:35:20Z"
}
```
`related_step` is the 1-based step number in the roadmap (`roadmap_steps.position + 1`) or null; `section` is one of summary, experience, projects, skills, education, formatting, other. No score of any kind. The browser lists and deletes analyses directly through Supabase (RLS); there is no GET or DELETE route.

| Status | When |
|---|---|
| 401 | missing or invalid token |
| 503 | accounts off (`SUPABASE_URL`), database not configured, **feature off** ("Résumé analysis isn't available yet."), database unreachable while loading the roadmap, Gemini key missing, quota used up or Gemini busy (`Retry-After`), or the analysis couldn't be saved ("Your résumé was analyzed but the result couldn't be saved…") |
| 415 | `Content-Type` isn't `application/pdf` ("Please upload your résumé as a PDF file.") |
| 429 | per-user limit: 3/hour, 10/day; global 100/day (`RESUME_LIMIT_*`); `Retry-After` |
| 409 | no active roadmap ("Create a roadmap first…") |
| 413 | body over 2 MB (declared or counted while streaming) |
| 422 | under 1 KB, not a valid PDF, or Gemini says it isn't a readable résumé |
| 502 | Gemini failed or its reply failed strict validation twice ("We couldn't analyze your résumé right now…") |

Every rejected request saves nothing.

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
