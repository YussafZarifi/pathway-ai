# Testing

## Current state
- **Backend: 80 pytest tests** (since 2026-09-27; 80 since 2026-09-28) in `backend/tests/`, run with `cd backend && pip install -r requirements-dev.txt && python -m pytest -q` (under 1 s, no network: Gemini is a scripted fake, no keys needed).
  - `test_ai_output.py` (34): JSON extraction (fences, prose, trailing commas, truncation), defaults for missing fields, dropped bad items, score normalization, limits, content-free errors.
  - `test_llm.py` (16): retry policy (unusable reply, 5xx, timeouts, per-minute vs daily 429, 400), and logs that describe failures without reply content.
  - `test_api.py` (10): `/health`, response shape, user-friendly 502/503 messages with CORS headers, `Retry-After`, 422 before any Gemini call, rate limit, disallowed origin.
  - `test_quiz_formats.py` (20): v1 answers ("Regenerate" on old roadmaps) still work with the original prompts; v2 prompts carry the labelled profile and weekly-hour pacing; v2 validation and cleaning (interests 1–3 and deduplicated, weekly hours 2/5/10/20, optional career in mind, newlines removed, leftover keys ignored).
  - Privacy guard: a marker planted in answers and replies must never appear in logs or responses.
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
cd backend  && python -m pytest -q   # ✅ exists (80 tests)
```
