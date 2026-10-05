# Testing

## Current state
- **Backend: 166 pytest tests** (since 2026-09-27; 80 since 2026-09-28; 100 since 2026-09-30; 162 since 2026-10-03; 166 since 2026-10-04) in `backend/tests/`, run with `cd backend && pip install -r requirements-dev.txt && python -m pytest -q` (under 1 s, no network: Gemini is a scripted fake, no keys needed).
  - `test_ai_output.py` (34): JSON extraction (fences, prose, trailing commas, truncation), defaults for missing fields, dropped bad items, score normalization, limits, content-free errors.
  - `test_llm.py` (16): retry policy (unusable reply, 5xx, timeouts, per-minute vs daily 429, 400), and logs that describe failures without reply content.
  - `test_api.py` (10): `/health`, response shape, user-friendly 502/503 messages with CORS headers, `Retry-After`, 422 before any Gemini call, rate limit, disallowed origin.
  - `test_quiz_formats.py` (20): v1 answers ("Regenerate" on old roadmaps) still work with the original prompts; v2 prompts carry the labelled profile and weekly-hour pacing; v2 validation and cleaning (interests 1–3 and deduplicated, weekly hours 2/5/10/20, optional career in mind, newlines removed, leftover keys ignored).
  - `test_auth.py` (24, 2026-09-30; +4 on 2026-10-04): Supabase token checks for `GET /api/me` with a local EC key and a fake JWKS client: valid token; small clock skew tolerated (issued 2 s "in the future", just inside the 30 s leeway, just expired) while tokens issued or expired beyond the leeway are rejected; missing/malformed header; expired, wrong audience/issuer/signature, anon role, anonymous user, no subject, HS256 algorithm confusion, unknown key id → 401; JWKS down or `SUPABASE_URL` unset → 503; tokens/claims never logged; CORS allows `Authorization`; guests still reach the AI routes.
  - `test_db.py` (8, 2026-10-03): `DATABASE_URL` optional (app + `/health` start without it), transaction-local claims set first, commit/rollback, pool timeout and connection loss → `DatabaseUnavailable`, other DB errors propagate.
  - `test_roadmap_repository.py` (10): the repository contract on the in-memory implementation (one active roadmap, archive, user scoping, regenerate reuses the submission, idempotent/older imports, completions by position) and the row → API mapping.
  - `test_roadmaps_api.py` (18): `POST /api/roadmaps` + `/{id}/regenerate` — 201 shape with step ids, v1/v2 answers stored with their version, archive, 422 before Gemini, honest 503 when saving fails after generation, 404 for another user's id, 409 without saved answers, 401/503 configuration, rate limit order, guest route unchanged.
  - `test_roadmap_import.py` (26): `POST /api/roadmaps/import` — 201 then 200 (idempotent), completions and clamped dates, older import archived, lenient answers/career data, unsafe links dropped, truncation like AI output, 422 cases, 64 KB limit on this path only, 503, own rate limit.
  - Privacy guard: a marker planted in answers and replies must never appear in logs or responses.
- **Database (Milestone 2):** `supabase/tests/m2_2_roadmaps_rls.sql` (31) and `m2_3_step_progress_rls.sql` (22) run as `postgres` in a rolled-back transaction (e.g. MCP `execute_sql`), impersonating two users, `anon` and `pathwayai_api`; `m2_4_api_role_connection.py` (18) connects through the pooler as `pathwayai_api` with two fixture users (SQL to create/delete them in its header).
- **Live checks done for Milestone 2 (not committed):** the Postgres repository against the real database with throwaway users (concurrent saves/imports), and Playwright scripts driving the dev server in isolated Chrome profiles (guest flow, account mode with throwaway confirmed users signing in through real Supabase Auth, import banner, 360 px, keyboard, accounts-off build).
- **Frontend: no tests.** `npm run lint` (ESLint 9): 12 errors, 0 warnings as of 2026-09-28. 6 are `motion` false positives from the missing `jsx-uses-vars` rule, 6 are real unused variables (ROADMAP N-13).
- No CI yet (F-4).
- `npm run build`: passes.
- Manual testing in the browser (latest full pass: see `SESSION.md`).

## Strategy (🗺️)

### Frontend — Vitest + React Testing Library
Priority targets (pure logic first, since they're cheap and high value):
| Target | Cases |
|---|---|
| `lib/trackingEngine.js` | init on empty or corrupt storage; `trackEvent` rejects unknown types and missing fields; `trackMetric` stats (current/avg/min/max); `trackProgress` status transitions incl. `incomplete`; import/export round-trip |
| `lib/scoringEngine.js` | each score component in isolation; caps at 100; **regression: 1 of 5 steps done ≠ 100%** (TD-07); recommendation thresholds (TD-28) |
| `lib/roadmapStore.js` | save/load round-trip; corrupt or wrong-version record → null; **regression: progress for roadmap A doesn't appear on roadmap B** (TD-08) |
| `Quiz` | Continue disabled until answered; multi-select stops at 3 and re-enables on deselect; weekly-hours buttons; optional career field sent only when non-empty; last step navigates with answers |
| `Results` | loading → success render; error state; empty state; compare needs ≥2; "None of these" swaps CTA |
| `dashboard/RoadmapStepper` | expand/collapse; mark done/undo updates the count and ring; keyboard access |
| `lib/dashboardData.js` | progress out of roadmap length; time left from AI estimates (unreadable estimates reported); streak; achievements |
| `lib/api.js` | base URL from env; timeout; `ApiError` status mapping; `errorMessage()` for 4xx vs 5xx |

Use `vi.stubGlobal("fetch", …)` or MSW for network. Provide a `localStorage` mock or reset between tests.

### Backend — pytest + FastAPI `TestClient`
- Mock the Gemini client (dependency-inject the LLM service).
- Cases: valid request → 200 with schema-valid body; empty or invalid `answers` → 400/422; model returns fenced JSON → parsed; model returns garbage → retry → typed 502/500 without internal text; missing key → 500; oversized input → 413/422; rate limit → 429.
- Snapshot-test the prompt builders (prompt changes become visible in diffs).

### End-to-end — Playwright
- Happy path: Landing → Quiz (answer all 5) → Results (mocked API) → pick career → Dashboard → mark a step done → reload → progress persists → regenerate.
- Error path: API 500 → error state → retry.
- Run against `vite preview` with route-level API mocks.

### AI evaluation (separate from unit tests)
See `ai-system.md` §6. A golden set of about 30 profiles; schema and rule checks plus LLM-as-judge; run on prompt changes, not on every commit. Not part of the default CI unit run, because it calls the real model and costs money.

### Accessibility
- `@axe-core/playwright` checks on each main page in E2E.
- Manual keyboard-only pass for Quiz, Results (compare) and Dashboard.

### Coverage goals
- `src/lib/**` ≥ 90%
- Backend services and routers ≥ 85%
- Overall frontend ≥ 60% (components are covered mostly by E2E)

### Commands (planned)
```bash
cd frontend && npm test          # vitest
cd frontend && npm run test:e2e  # playwright
cd backend  && python -m pytest -q   # ✅ exists (166 tests)
```
