# Testing

## Current state
**No automated tests exist.** No test runner is installed in either project. Quality checks available today:
- `npm run lint` (ESLint 9): 17 errors and 1 warning as of 2026-09-25 (was 21). Most remaining errors are `motion` false positives from the missing `jsx-uses-vars` rule, plus real unused imports (ROADMAP N-13).
- `npm run build`: passes.
- Manual testing in the browser.

## Strategy (🗺️)

### Frontend — Vitest + React Testing Library
Priority targets (pure logic first, since they're cheap and high value):
| Target | Cases |
|---|---|
| `lib/trackingEngine.js` | init on empty or corrupt storage; `trackEvent` rejects unknown types and missing fields; `trackMetric` stats (current/avg/min/max); `trackProgress` status transitions incl. `incomplete`; import/export round-trip |
| `lib/scoringEngine.js` | each score component in isolation; caps at 100; **regression: 1 of 5 steps done ≠ 100%** (TD-07); recommendation thresholds (TD-28) |
| Progress persistence (after N-7) | **regression: progress for career A doesn't appear on career B** (TD-08) |
| `Quiz` | Continue disabled until answered; slider 0 is a valid answer; text requires non-whitespace; last step navigates with answers |
| `Results` | loading → success render; error state; empty state; compare needs ≥2; "None of these" swaps CTA |
| `RoadmapTimeline` | expand/collapse; mark done updates count; keyboard access |
| API client (after N-6) | base URL from env; timeout; error mapping |

Use `vi.stubGlobal("fetch", …)` or MSW for network. Provide a `localStorage` mock or reset between tests.

### Backend — pytest + FastAPI `TestClient`
- Mock the Gemini client (dependency-inject the LLM service).
- Cases: valid request → 200 with schema-valid body; empty or invalid `answers` → 400/422; model returns fenced JSON → parsed; model returns garbage → retry → typed 502/500 without internal text; missing key → 500; oversized input → 413/422; rate limit → 429.
- Snapshot-test the prompt builders (prompt changes become visible in diffs).

### End-to-end — Playwright
- Happy path: Landing → Quiz (answer all 8) → Results (mocked API) → pick career → Dashboard → mark a step done → reload → progress persists.
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
cd backend  && pytest -q
```
