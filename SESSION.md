# SESSION.md — Latest session log

> Overwrite the "Current session" section at the end of each coding session; move the previous one to "History" (keep history short: date + 1–3 lines).

---

## Current session — 2026-09-27 (part 2) · Investigating the intermittent roadmap failure · Reliable AI output

### Goal (owner request)
Before deploying, investigate the intermittent roadmap failure (suspected malformed Gemini JSON) **without guessing**. Instrument the backend so malformed replies can be identified without logging answers or sensitive data. Improve parsing: schema validation, retry or repair when appropriate, graceful missing fields, safe logs only, never expose raw output to users.

### Investigation (evidence first)
Probe script (scratchpad, not committed) sent 25 requests through the real pipeline (TestClient + real Gemini, synthetic answers, old parser) and recorded each raw reply's shape:

| Result | Count |
|---|---|
| Parsed fine with the old parser (14 fenced ```` ```json ````, 1 bare JSON; all `finish=STOP`; 1.1–1.4k output tokens; 3.1–5.6 s) | 15 |
| Malformed JSON | **0** |
| Gemini `429 RESOURCE_EXHAUSTED` | 10 (calls 16–25) |

The 429 details (quota metadata only) show `GenerateRequestsPerDayPerProjectPerModel-FreeTier`, value **20**, for `gemini-2.5-flash-lite`. **This key's free tier allows 20 requests per day** (≈10 quiz runs). The old backend reported it as the same generic 502 as a parse failure.

**Conclusion:** the suspected cause (malformed JSON) did not occur in 15 replies. The failure mode actually reproduced is the daily quota. The original failure earlier today can't be the daily quota (only ~2 requests had been made by then) and its cause can't be recovered, since the old code logged nothing useful. The candidates are a Gemini 5xx/overload, a timeout or a malformed reply; all of them are now retried once and logged by type, so the next one will be identifiable.

**Side effect:** the probe used up today's flash-lite quota. Local AI generation returns "usage limit" until the daily reset (midnight Pacific time).

### What was done
1. **`backend/ai_output.py`** (`5fcfb4d`): generation schemas (all fields required) for Gemini's `response_schema`, and tolerant output models:
   - Per-item validation: missing or wrong-typed optional fields → defaults; invalid resources (non-http(s)) and tasks dropped; `match_score` "85%"/85.0 → 85, booleans rejected.
   - Items without a title / valid score are dropped; the reply is rejected only if no item is usable. At most 5 steps / 3 careers; the roadmap's `career` is the user's choice.
   - Fallback `extract_json` (direct, fenced, outermost braces, trailing-comma repair).
   - `AIOutputError(kind, detail)` with content-free detail.
2. **`backend/llm.py` + `request_log.py`, wired into `main.py`** (`97ae7aa`):
   - JSON mode + `response_schema`.
   - At most 2 attempts: retry on an unusable reply, 5xx, timeout or network error; wait and retry on a per-minute 429 with delay ≤10 s; no retry on the daily quota or other 4xx.
   - Distinct user messages: 503 "usage limit" / 503 "busy" + `Retry-After` / 503 unavailable / 502 failed.
   - Per-attempt logs: outcome, finish reason, tokens, length, JSON strategy, dropped items (paths + types), sha256 prefix, quota id, retry delay. Request ID on every line and in `X-Request-ID`.
3. **Frontend** (`367579b`): `errorMessage()` also shows 503 messages, so users see "usage limit" / "busy" instead of a generic error. No other UI change.
4. **Tests:** first automated tests, 60 pytest tests (`backend/tests`, `requirements-dev.txt`), no network:
   - parser (34);
   - retry policy + safe logs (16);
   - endpoints (10).
   A planted marker in answers and replies must never appear in logs or responses. The tests caught one real bug (a boolean `match_score` was accepted as 1).
5. **Docs:**
   - ADR-015; CLAUDE.md; ROADMAP (C-23; new N-16 Gemini billing, N-17 verify on flash-lite).
   - `docs/ai-system.md` (investigation + output handling), `docs/backend.md`, `docs/api.md`, `docs/deployment.md` (quota is the new launch blocker), `docs/testing.md`, `docs/technical-debt.md` (TD-10 resolved; TD-17/21/37 updated), `docs/architecture.md`, `docs/future-features.md`, this file.

### Verification
| Check | Result |
|---|---|
| `python -m pytest -q` (backend) | 60 passed in < 1 s |
| Live, `gemini-2.5-flash` (separate quota; 2 calls) | JSON mode + schema accepted; 3 careers (90/88/85) and a 5-step roadmap; `strategy=direct` (no fences); log lines contain only metadata and request IDs |
| Live, `gemini-2.5-flash-lite` (quota used up) | 1 attempt, no wasted retry; logged `quota=GenerateRequestsPerDayPerProjectPerModel-FreeTier`; user got 503 "PathwayAI has reached its AI usage limit for now. Please try again later." |
| `npm run lint` / `npm run build` | 12 errors (unchanged) / passes |

### Open issues / notes
- **Not yet verified on `gemini-2.5-flash-lite`** with JSON mode + schema (quota exhausted). Same API and the schema converts locally, so the risk is low, but check once after the reset (N-17): generate one roadmap and look for `strategy=direct` in the log.
- **Free-tier quota (N-16):** with 20 requests/day, the deployed app can serve about 10 quiz runs a day. Enable billing (paid tier; flash-lite is inexpensive) and a budget alert, then set `GLOBAL_AI_LIMIT_PER_DAY`. A retry costs one extra request.
- `google_genai` and `httpx` log their own INFO lines (e.g. the Gemini URL, which holds no key). Harmless; could be quieted with `LOG_LEVEL=WARNING` or per-logger levels.
- The fallback parser's trailing-comma repair could, in theory, alter a string containing `, }`. It only runs after a normal parse has failed.
- Carried over: see part 1 in History; `YOUTUBE_API_KEY` still unset; no `.gitattributes` (CRLF warnings).
- **Git:** 3 code commits + 1 docs commit this part; `main` is **33 commits ahead of `origin/main`, not pushed.**

### Current blockers
- **Gemini quota** (20/day) for any real public traffic: owner action (billing). Not a blocker for a first private deploy.

### Next recommended task
1. After the quota resets: N-17, one live roadmap on flash-lite.
2. Owner: decide on Gemini billing (N-16).
3. **F-1: deploy to Render** (push → Blueprint → secrets → check `/health` and the full flow).
4. Then frontend tests + CI (F-2–F-4); the backend tests can run in CI immediately.

### Open questions (for the owner)
1. Enable Gemini billing (paid tier) before deploying, or deploy on the free tier first (≈10 quiz runs/day)?
2. Render API plan: free (sleeps) or Starter (always on)?
3. Target market: Canada-first (CAD salaries, EN/FR) or US?
4. Database/auth preference: Supabase vs self-managed Postgres + FastAPI JWT?
5. Stay on Gemini, or add a provider abstraction? (`openai` is in requirements but unused.)
6. TypeScript migration now or later?
7. Should the "Employability/Momentum" scores stay? They measure app engagement, not employability.
8. When should the GitHub repo go public (F-17)?

---

## History
- 2026-09-27 (part 1) — Deployment readiness (ADR-014): env-only config (`ALLOWED_ORIGINS`, `VITE_API_URL`, build fails without it), every request through `lib/api.js`, Pydantic request validation, in-memory rate limits, generic errors, no user data in logs, `/health`, `render.yaml` (Render chosen, not deployed). Local `backend/.env` gained `ALLOWED_ORIGINS`; `frontend/.env.local` created.
- 2026-09-26 — Landing Log in / Sign up → "accounts coming soon" dialog; `/home` polish; real YouTube videos per step (ADR-012); dashboard redesign with persisted roadmap and per-roadmap progress (ADR-013); polish passes and shared `VideoCard`.
- 2026-09-25 (part 2) — Pushed full history to the private GitHub repo `YussafZarifi/pathway-ai` (secret scan of history clean; placeholder README commits replaced with `--force-with-lease` by the owner).
- 2026-09-25 (part 1) — Git initialized; fake data, dead buttons and unreachable code removed; `/home` rebuilt as an honest empty state (8 commits + docs). ADR-010.
- 2026-09-24 — Initial audit and documentation. No code changes.
