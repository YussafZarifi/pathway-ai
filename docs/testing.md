# Testing

## Current state
- **Backend: 457 pytest tests** (since 2026-09-27; 80 since 2026-09-28; 100 since 2026-09-30; 162 since 2026-10-03; 173 since 2026-10-04; 272 then 336 on 2026-10-05; 347 → 423 → 451 → 457 on 2026-10-07) in `backend/tests/`, run with `cd backend && pip install -r requirements-dev.txt && python -m pytest -q` (under 1 s, no network: Gemini is a scripted fake, no keys needed).
  - `test_ai_output.py` (34): JSON extraction (fences, prose, trailing commas, truncation), defaults for missing fields, dropped bad items, score normalization, limits, content-free errors.
  - `test_llm.py` (16): retry policy (unusable reply, 5xx, timeouts, per-minute vs daily 429, 400), and logs that describe failures without reply content.
  - `test_api.py` (10): `/health`, response shape, user-friendly 502/503 messages with CORS headers, `Retry-After`, 422 before any Gemini call, rate limit, disallowed origin.
  - `test_quiz_formats.py` (20): v1 answers ("Regenerate" on old roadmaps) still work with the original prompts; v2 prompts carry the labelled profile and weekly-hour pacing; v2 validation and cleaning (interests 1–3 and deduplicated, weekly hours 2/5/10/20, optional career in mind, newlines removed, leftover keys ignored).
  - `test_auth.py` (24, 2026-09-30; +4 on 2026-10-04): Supabase token checks for `GET /api/me` with a local EC key and a fake JWKS client: valid token; small clock skew tolerated (issued 2 s "in the future", just inside the 30 s leeway, just expired) while tokens issued or expired beyond the leeway are rejected; missing/malformed header; expired, wrong audience/issuer/signature, anon role, anonymous user, no subject, HS256 algorithm confusion, unknown key id → 401; JWKS down or `SUPABASE_URL` unset → 503; tokens/claims never logged; CORS allows `Authorization`; guests still reach the AI routes.
  - `test_db.py` (8, 2026-10-03): `DATABASE_URL` optional (app + `/health` start without it), transaction-local claims set first, commit/rollback, pool timeout and connection loss → `DatabaseUnavailable`, other DB errors propagate.
  - `test_roadmap_repository.py` (10): the repository contract on the in-memory implementation (one active roadmap, archive, user scoping, regenerate reuses the submission, idempotent/older imports, completions by position) and the row → API mapping.
  - `test_roadmaps_api.py` (18): `POST /api/roadmaps` + `/{id}/regenerate` — 201 shape with step ids, v1/v2 answers stored with their version, archive, 422 before Gemini, honest 503 when saving fails after generation, 404 for another user's id, 409 without saved answers, 401/503 configuration, rate limit order, guest route unchanged.
  - `test_roadmap_import.py` (26): `POST /api/roadmaps/import` — 201 then 200 (idempotent), completions and clamped dates, older import archived, lenient answers/career data, unsafe links dropped, truncation like AI output, 422 cases, 64 KB limit on this path only, 503, own rate limit.
  - `test_body_limit.py` (7, 2026-10-04): body limits hold for chunked bodies without `Content-Length` (2 MB and just-over-limit → 413 before Gemini, CORS headers kept; import keeps its 64 KB limit and still rejects more), a declared `Content-Length` over the limit or an invalid one → 413, small chunked bodies still work.
  - `test_resume_ai.py` (99, 2026-10-05, M3-3): strict résumé reply validation (malformed, missing fields, wrong types, extra fields, over-long, out-of-range steps, contact details), invalid PDFs before Gemini, Gemini failures and timeouts, no résumé content in logs/errors/saved data.
  - `test_resume_api.py` (75; 64 on 2026-10-05 for M3-4, +11 on 2026-10-07 for `GET /availability`: enabled, feature off without touching the database, no roadmap, per user, no database, 503 on lookup failure, 401/503 auth, nothing but `{available, reason, career}`, no upload-limit or AI-quota use): `POST /api/resume-analyses` — 201 and persistence, feature switch (off by default, 503 without reading the body), 401/503 auth, 415, 409, per-user 429, 413 declared and while streaming (raw ASGI calls count the body chunks the app pulls: 0 for every early rejection), 422 invalid PDFs/non-résumés, 502/503 Gemini failures, 503 save failures with nothing stored, no file content or name in logs, responses or rows.
  - `test_coach_ai.py` (41, 2026-10-07, M4-2): learner context (progress, next step, skills, résumé gaps, newlines flattened), contents (history turns, context as a separate data part, history cap), strict replies (malformed, schema, unknown fields, length caps), actions checked against the roadmap (range, already done, duplicates, no roadmap), personal data, retries/timeouts, no message text in logs.
  - `test_coach_api.py` (34, 2026-10-07, M4-2): new thread + both messages, follow-up with history, context, no roadmap, titles, availability, 401/503/404 (other user's thread)/409 (full)/422 (body, contact details)/429 per user, failures save nothing (bad replies, quota, save errors, load errors), prompt-injected invented actions rejected, control characters, no message text in logs.
  - `test_account_api.py` (28, 2026-10-07, ADR-022): `amr` parsing; export (every table, no `user_id`, server-only answers, no-store attachment, no data in logs, 401/503/429); deletion (204, idempotent, 403 without a recent password incl. future/old times, 422 without the exact confirmation, 401, 503, separate rate-limit budget from exports, CORS allows DELETE).
  - Privacy guard: a marker planted in answers and replies must never appear in logs or responses.
  - **No real Gemini calls:** an autouse fixture (`conftest.py`, 2026-10-05) replaces the client in every test; a test that reaches Gemini without `fake_gemini` fails.
- **Database:** `supabase/tests/v1_delete_current_user.sql` (8, ADR-022). **Milestone 2:** `supabase/tests/m2_2_roadmaps_rls.sql` (31) and `m2_3_step_progress_rls.sql` (22) run as `postgres` in a rolled-back transaction (e.g. MCP `execute_sql`), impersonating two users, `anon` and `pathwayai_api`; `m2_4_api_role_connection.py` (18) connects through the pooler as `pathwayai_api` with two fixture users (SQL to create/delete them in its header).
- **Live checks done for Milestone 2 (not committed):** the Postgres repository against the real database with throwaway users (concurrent saves/imports), and Playwright scripts driving the dev server in isolated Chrome profiles (guest flow, account mode with throwaway confirmed users signing in through real Supabase Auth, import banner, 360 px, keyboard, accounts-off build).
- **Résumé page (M3-5, 2026-10-07; Playwright script, not committed):** 51/51 against real Supabase Auth and local backends (feature on, feature off, accounts off) with throwaway users: signed-out prompt and return after sign-in, accounts-off, feature-off and no-roadmap states, browser-side checks (non-PDF, over 2 MB, tiny) send nothing, one real synthetic-résumé analysis, history from the account after reload, expand/collapse, delete with confirmation (persists), 413/415/422/429/502/401/503/409 after page load (injected), entry points, 360 px, keyboard; privacy: only the file's bytes are sent (no name, no `Content-Disposition`), nothing in browser storage or the console, server logs free of résumé data. Guest flow 11/11 with accounts on and off.
- **Frontend: 126 Vitest tests** (since 2026-10-07, F-2) in `src/**/*.test.{js,jsx}`, run with `cd frontend && npm test` (jsdom, no network: `fetch`, Supabase and the API modules are mocked; accounts off unless a test mocks them; `src/test/setup.js` cleans up renders and polyfills `<dialog>`):
  - `lib/__tests__/dashboardData.test.js` (19): progress against the roadmap's real length (TD-07 regression), per-roadmap progress keys (TD-08), duration parsing, remaining time, activity and streak, Today's focus.
  - `lib/__tests__/api.test.js` (10): JSON requests to `VITE_API_URL`, `ApiError` with the server's message, network failures, the résumé GET and the raw-PDF upload (only the file's bytes, no name), `errorMessage`, `normalizeSteps`.
  - `lib/__tests__/roadmapStore.test.js` (4): save/load/clear, corrupt or foreign data, per-roadmap keys.
  - `lib/resume/__tests__/resume.test.js` (13): `fileProblem` (type, size bounds), `normalizeAnalysis` (shape, malformed fields), history query (newest 20) and delete, load errors without the database's message.
  - `components/resume/AnalysisView.test.jsx` (4): "AI review" label and no score, step links only for the current roadmap, model text rendered as text (XSS).
  - `lib/coach/__tests__/coach.test.js` (12): `messageProblem` (empty, length, contact details, dates aren't phones), action/message normalization, thread list, messages, delete, hidden database errors.
  - `pages/__tests__/Coach.test.jsx` (22): accounts off, signed out, feature off, availability retry, welcome + privacy note, send and reply with step buttons, follow-up in the same thread, starter prompts, contact details refused, failure keeps the draft, 429/422 messages, 409 new conversation, 503 re-check, mark-done only on click, done steps disabled, open-step navigation, XSS, open and delete a conversation.
  - `lib/account/__tests__/account.test.js` (8) and `pages/__tests__/Settings.test.jsx` (13): password rules, display-name cleaning, password change only after proving the current one, deletion only with a fresh sign-in token, export merges email and name; settings states, delete needs the password and DELETE typed, failures keep the account, sign out everywhere, `/reset-password` refuses a normal session and sets a password from a recovery link, and a StrictMode regression test (a stale profile load never overwrites typing — fails without the fix).
  - `pages/__tests__/Roadmaps.test.jsx` (7): guests, accounts off, list with badges and progress, read-only steps, make current + reload, failed switch, load error + retry, empty state. `test_roadmaps_api.py` +6 for `/activate` (switch, already current, 404/422, 503, 429, 401).
  - `pages/__tests__/Resume.test.jsx` (14): accounts off, signed out, feature off, no roadmap, availability error + retry, upload success, browser-side rejections, 413/415/422/429/502 messages, 503/409 re-check, file name never shown/stored/logged, history error + retry, delete with confirmation and failure.
- `npm run lint`: **0 errors** since 2026-10-07 (was 12; N-13).
- **Older note (superseded):** `npm run lint` (ESLint 9) had 12 errors on 2026-09-28. 6 are `motion` false positives from the missing `jsx-uses-vars` rule, 6 are real unused variables (ROADMAP N-13).
- No CI yet (F-4).
- `npm run build`: passes.
- Manual testing in the browser (latest full pass: see `SESSION.md`).

## Strategy (🗺️)

### Frontend — Vitest + React Testing Library
Priority targets (pure logic first, since they're cheap and high value):
| Target | Cases |
|---|---|
| `lib/trackingEngine.js` | init on empty or corrupt storage; `trackEvent` rejects unknown types and missing fields; `trackMetric` stats (current/avg/min/max); `trackProgress` status transitions incl. `incomplete`; import/export round-trip |
| ~~`lib/scoringEngine.js`~~ (deleted 2026-10-07) | each score component in isolation; caps at 100; **regression: 1 of 5 steps done ≠ 100%** (TD-07); recommendation thresholds (TD-28) |
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
cd backend  && python -m pytest -q   # ✅ exists (173 tests)
```
