# Architecture Decision Records

Format: **Context → Decision → Consequences → Status**. Add a new ADR whenever a significant architectural choice is made or reversed. Never rewrite an accepted ADR: supersede it with a new one and link them.

ADR-001 to ADR-008 were **reconstructed on 2026-09-24** from the existing code during the audit. The original reasoning wasn't written down, so their "Context" describes the most likely rationale.

| ID | Title | Status |
|---|---|---|
| ADR-001 | React + Vite single-page app | Accepted |
| ADR-002 | FastAPI backend as an AI proxy | Accepted |
| ADR-003 | Google Gemini 2.5 Flash-Lite as the model | Accepted |
| ADR-004 | Browser localStorage for persistence (MVP) | Accepted · step 1 done in ADR-013 |
| ADR-005 | Technology-careers-only scope | Accepted |
| ADR-006 | Plain global CSS for styling | Accepted · under review |
| ADR-007 | React Router state as cross-page data transport | Accepted · to be superseded |
| ADR-008 | Client-side tracking and scoring engines | Accepted · under review |
| ADR-009 | Project documentation as persistent memory | Accepted |
| ADR-010 | One dashboard: keep `/dashboard`, keep `/home` as the future signed-in hub, delete the `/app/*` shell | Accepted |
| ADR-011 | Entry points for unbuilt features must do something honest when clicked | Accepted |
| ADR-012 | Roadmap videos come from the YouTube Data API, not the model | Accepted |
| ADR-013 | Persist the current roadmap in localStorage; dashboard shows only real-data metrics | Accepted |
| ADR-014 | Deployment readiness: env-only config, request validation, in-memory rate limits, Render Blueprint | Accepted |

---

## ADR-001 — React + Vite single-page app
- **Context:** an interactive, animation-heavy flow (quiz → results → dashboard) with no SEO-critical content beyond the landing page. The team knows React.
- **Decision:** React 19 SPA built with Vite 7, React Router 7 (`BrowserRouter`), framer-motion for motion, lucide-react for icons. Plain JavaScript.
- **Consequences:** fast dev loop and simple static hosting. No SSR, so the landing page relies on client rendering. No TypeScript means API contracts are implicit (field-name drift has already happened). Revisit TypeScript before the codebase grows (ROADMAP F-16).
- **Status:** Accepted.

## ADR-002 — FastAPI backend as an AI proxy
- **Context:** the LLM API key must not ship to the browser, and prompts should live server-side.
- **Decision:** a small Python FastAPI service with endpoints that build prompts, call Gemini and return JSON.
- **Consequences:** key stays secret; Python has a strong AI ecosystem; Pydantic is available for validation. Currently a single file with no validation, rate limiting or auth, so it acts as an open proxy (TD-03). Planned: app structure with routers, services, schemas and config (see `backend.md`).
- **Status:** Accepted.

## ADR-003 — Google Gemini 2.5 Flash-Lite
- **Context:** short structured generations; cost and latency matter for a free product and a portfolio budget.
- **Decision:** `google-genai` SDK, model `gemini-2.5-flash-lite`.
- **Consequences:** cheap and fast. Supports JSON mode and `response_schema` (not used yet), multimodal PDF input (useful for the resume analyzer) and Google Search grounding. The model name is hard-coded twice; move it to config. `openai` is in requirements but unused, which suggests an earlier provider experiment; decide whether to add a provider abstraction or remove the dependency.
- **Status:** Accepted.

## ADR-004 — localStorage persistence (MVP)
- **Context:** ship without accounts or a database.
- **Decision:** one localStorage key `pathwayai_tracking` holding events, metrics and step progress. Careers and roadmaps aren't stored (router state only; see ADR-007).
- **Consequences:** zero backend state and no auth needed. But no cross-device sync, data loss on clearing storage, unbounded growth, progress keys that collide across roadmaps (TD-08) and no durable roadmap (TD-09).
- **Status:** Accepted, **to be superseded** in two steps: (1) per-roadmap localStorage v2 (ROADMAP N-7); (2) PostgreSQL + auth (F-7/F-8). Each step gets its own ADR.

## ADR-005 — Technology-careers-only scope
- **Context:** early data (`careers.js`, `careerDetails.js`) covered general careers (nurse, plumber, teacher…). Broad scope produced shallow guidance.
- **Decision:** the product focuses on technology-industry careers. It's enforced in the career prompt ("ALL careers must be technology-industry roles only") and the quiz asks about tech fields.
- **Consequences:** deeper, more accurate roadmaps and a clearer audience. Legacy non-tech data and icon mappings remain as debt (TD-31). Don't widen the scope without a new ADR.
- **Status:** Accepted.

## ADR-006 — Plain global CSS
- **Context:** fast iteration on a custom visual style; snippets adopted from community sources.
- **Decision:** global CSS in `src/index.css` (plus `styles/dashboard.css`), camelCase class names, framer-motion for animation.
- **Consequences:** no build tooling needed. But the file has grown to about 3,900 lines with few tokens, many colour literals, duplicate selectors and three theme mechanisms (TD-25, TD-34). Under review: introduce design tokens and split per area (CSS Modules or per-page files). Record the choice (tokens + CSS Modules vs Tailwind) as a new ADR when it's made.
- **Status:** Accepted · under review.

## ADR-007 — Router state as cross-page data transport
- **Context:** simplest way to pass quiz answers and AI results between pages without a store or backend persistence.
- **Decision:** `navigate(path, { state })` carries `answers` (Quiz → Results) and `{career, roadmap}` (Results → Dashboard).
- **Consequences:** zero setup. It survives same-tab reloads (history.state), but data is lost on new tabs, direct links or shared URLs, and pages redirect to `/quiz` when state is missing.
- **Status:** Accepted, **to be superseded** by persisted roadmaps (N-7) and later server data with a client cache (TanStack Query).

## ADR-008 — Client-side tracking and scoring engines
- **Context:** show users progress and "career readiness" without a backend.
- **Decision:** `lib/trackingEngine.js` (validated events, metrics history, progress) and `lib/scoringEngine.js` (employability, momentum, readiness, recommendations), computed in the browser.
- **Consequences:** works offline and without accounts, and shows analytics thinking. But the scores mostly measure app engagement (quiz duration, sessions), one input (resume score) only came from a simulated feature, and storage performance degrades over time (TD-27–TD-29). Under review: move scoring server-side with honest, explainable inputs, and move product analytics to a dedicated tool.
- **Status:** Accepted · under review.

## ADR-009 — Project documentation as persistent memory
- **Date:** 2026-09-24
- **Context:** development happens across many AI-assisted sessions; context must survive between them.
- **Decision:** keep `CLAUDE.md` (project memory), `SESSION.md` (latest session), `ROADMAP.md` (living plan) and `docs/*` (area docs, ADRs, debt register) in the repo. Update `CLAUDE.md`, `ROADMAP.md`, `SESSION.md` and this file at the end of every coding session.
- **Consequences:** any new session can resume without re-explaining. The docs need discipline to stay accurate, and must always separate implemented, partial and planned work.
- **Status:** Accepted.

## ADR-010 — One dashboard: keep `/dashboard`, keep `/home` as the future signed-in hub, delete the `/app/*` shell
- **Date:** 2026-09-25
- **Context:** the audit found two competing dashboard designs: the routed, tabbed `/dashboard` (roadmap timeline and readiness meters) and an unrouted `/app/*` shell (`AppShell`, `DashboardLayout`, `DashboardHome`, `Coach`, `styles/dashboard.css`) that was never wired into `App.jsx`. `/home` existed but showed hard-coded stats and activity. Keeping unreachable code and fake data hurts honesty and recruiter perception.
- **Decision:**
  - `/dashboard` stays the view for the active roadmap.
  - `/home` is **kept** as the future authenticated user hub. Until accounts and saved roadmaps exist it is an honest empty state: no stats, activity or achievements, only real entry points and features clearly labelled "Planned".
  - The `/app/*` shell and every other unreachable file are **deleted**. Git keeps the history.
- **Alternatives considered:** delete `/home` and use `/dashboard` as the only hub (rejected by the owner: `/home` is the natural home for multiple saved roadmaps after auth); wire up the `/app/*` shell instead (rejected: it duplicated `/dashboard`, carried dead Settings/Upgrade buttons and a third brand name).
- **Consequences:** one dashboard design and one fewer theme mechanism. `/home` needs real data (auth F-7 + persistence N-7/F-8) before it can show anything personal; it isn't linked from Landing yet. When auth lands, `/home` shows the user's saved roadmaps and `/dashboard` becomes a per-roadmap route (e.g. `/dashboard/:roadmapId`).
- **Status:** Accepted.

## ADR-011 — Entry points for unbuilt features must do something honest when clicked
- **Date:** 2026-09-26
- **Context:** on 2026-09-25 the Landing Log in / Sign Up buttons were removed because they had no click handler (C-11). The owner wants them back in the header, so visitors and recruiters see where accounts will live, without building auth yet (F-7).
- **Decision:** a visible control for a feature that isn't built must never be dead. It opens an honest explanation instead. For accounts, both header buttons open `AccountsSoonDialog` ("Accounts are coming soon", no account needed, "Take the quiz"). Dialogs use the native `<dialog>` element with `showModal()` for focus trapping, Esc and focus return.
- **Alternatives considered:** UI-only `/login` and `/signup` pages with a disabled form (rejected for now: more code, and it looks like a working form); disabled buttons with a tooltip (rejected: look unfinished and tooltips are weak on touch).
- **Consequences:** the "no fake UI" standard is kept while showing planned features. When auth lands (F-7), the buttons are rewired to real routes and the dialog is deleted. `ShareModal` and `CareerCompareModal` should move to the same native `<dialog>` pattern (F-10).
- **Status:** Accepted.

## ADR-012 — Roadmap videos come from the YouTube Data API, not the model
- **Date:** 2026-09-26
- **Context:** the owner wants 1–2 YouTube videos on every roadmap step. An LLM cannot know real video IDs, so model-written YouTube URLs would mostly be broken or wrong (the same problem as invented resource URLs, TD-21) and would reintroduce fake content.
- **Decision:** the model writes a short search phrase per step (`video_query`). The backend resolves it to up to 2 real videos with the YouTube Data API v3 (`backend/youtube.py`) and returns `videos[]` plus an always-valid `video_search_url`. `YOUTUBE_API_KEY` is optional; without it, or on any API error, the UI shows a "Search YouTube for this step" link.
- **Alternatives considered:** search links only (no key, always works, but no specific videos or thumbnails); model-picked videos verified through YouTube oEmbed (no key, but most model IDs would fail verification).
- **Consequences:** a second external API and key. The free quota (10,000 units/day, 100 per search) allows about 20 new roadmaps a day; an in-memory cache helps, and a shared cache (Redis) or persisting videos with saved roadmaps (F-8) will matter at scale. Adds latency of about one YouTube request (lookups run in parallel). Thumbnails load from `i.ytimg.com`. It's the first grounded AI output in the app and a pattern to reuse for resources (TD-21).
- **Status:** Accepted.

## ADR-013 — Persist the current roadmap in localStorage; dashboard shows only real-data metrics
- **Date:** 2026-09-26
- **Context:** the dashboard redesign needs a dashboard people can come back to, but the roadmap only lived in router state (lost on new tabs, TD-09), step progress keys were shared across roadmaps (TD-08) and the roadmap % counted touched steps (TD-07). The old headline "Career Readiness" averaged Employability and Momentum, which mostly measure app engagement (TD-29), and a banner recommended a resume upload that doesn't exist. The owner's brief forbids fake or invented statistics.
- **Decision:**
  - New localStorage key `pathwayai_roadmap` holds the **current** roadmap `{version: 1, id, career, careerData, answers, roadmap, generatedAt}` (`lib/roadmapStore.js`). Results saves it; the dashboard reads it first and falls back to router state.
  - Step progress keys become `roadmap_step_<roadmapId>_<index>`: unique per roadmap, still prefixed `roadmap_step_` for `scoringEngine.js`. Old unscoped keys are ignored, not migrated.
  - Every dashboard number is derived in `lib/dashboardData.js` from real stored data: progress out of the roadmap's length, time left as the sum of the AI's own step estimates (labelled "AI estimate"; unreadable estimates are reported, not guessed), activity/streak from the event log (labelled as app activity), achievements with the date they happened. "Insights" are rule-based and not called AI.
  - The Employability/Momentum/Readiness scores are no longer displayed; `scoringEngine.js` is kept unchanged pending B-14.
- **Alternatives considered:** keep the Readiness score with an explanation (rejected by the owner in favour of roadmap completion); an AI-generated insights endpoint (deferred, B-19); per-task minutes/difficulty from the model (rejected for now: step estimates already exist).
- **Consequences:** `/dashboard` works after reloads and in new tabs and shows correct progress. Still one roadmap, one browser (supersedes step 1 of ADR-004; F-7/F-8 remain the real fix). Quiz answers, including free text, are now stored in localStorage to support "Regenerate" (same privacy class as TD-41). ADR-007's router state is no longer the only transport for the roadmap. ADR-008's scores are demoted from the UI.
- **Status:** Accepted.

## ADR-014 — Deployment readiness: env-only config, request validation, in-memory rate limits, Render Blueprint
- **Date:** 2026-09-27
- **Context:** the app couldn't be deployed: the frontend called a hard-coded `http://127.0.0.1:8000`, CORS allowed only `http://localhost:5173`, and the backend was an open, unvalidated proxy to Gemini and YouTube that returned raw exception text and printed users' quiz answers and AI output. The owner chose Render as the host and asked for the project to be made deployment-ready without deploying.
- **Decision:**
  - **Config only from the environment, no localhost defaults.** Backend `config.py` reads `GEMINI_API_KEY`, `ALLOWED_ORIGINS`, `GEMINI_MODEL`, timeouts, rate limits and `LOG_LEVEL`; an empty `ALLOWED_ORIGINS` allows no browser origin. The frontend reads `VITE_API_URL` and `vite build` fails without it, so a misconfigured build can't ship. Both sides have a committed `.env.example`; local values live in git-ignored `backend/.env` and `frontend/.env.local`.
  - **One frontend client:** every request goes through `lib/api.js` (timeout, `ApiError` with user-safe messages).
  - **Request validation with Pydantic** (`schemas.py`): quiz IDs with length/range limits, control characters stripped, unknown keys dropped; 16 KB body limit. Choice answers are length-limited strings rather than enumerated options so frontend copy changes don't break the API.
  - **Rate limiting in memory** (`rate_limit.py`): per-IP per-minute and per-day windows plus a global daily cap, as a FastAPI dependency on the AI routes. Custom (~100 lines) rather than slowapi: no new dependency, and the global cap is a first-class limit.
  - **Safe errors and logs:** fixed messages per status (413/422/429/502/503/500); logs contain timings, status codes, exception class names and failing field names, never answers, prompts or AI output.
  - **Render Blueprint** (`render.yaml`): Python web service (`/health` check, Uvicorn proxy headers for real client IPs) and a static site with an SPA rewrite; secrets are `sync: false`.
- **Alternatives considered:** keep `http://127.0.0.1:8000` as a dev fallback in `api.js` (rejected: a missing variable would silently ship a broken production build); slowapi (rejected for now, see above); Redis-backed limits (deferred: one free instance doesn't need shared state); a Dockerfile (deferred: Render's native Python runtime is simpler until there is more to package); enumerating every quiz option in the schema (rejected: couples backend to UI copy).
- **Consequences:** the project can be deployed by applying the Blueprint and entering four values. Local dev needs one extra step (`cp .env.example .env.local`). Rate-limit state resets on every deploy/restart and isn't shared between instances; a client forging `X-Forwarded-For` may get a fresh per-IP bucket, but the global cap still bounds spend. Invalid requests count toward the limits. The free plan sleeps, so the frontend timeout is 90 s. Response validation (N-8), tests/CI (F-2–F-4) and error tracking (F-11) remain before a public launch.
- **Status:** Accepted.

---

## Template
```
## ADR-NNN — Title
- **Date:** YYYY-MM-DD
- **Context:** what forces are at play
- **Decision:** what we chose
- **Alternatives considered:** …
- **Consequences:** trade-offs, follow-ups
- **Status:** Proposed | Accepted | Superseded by ADR-XXX
```
