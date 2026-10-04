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
| ADR-015 | Validated AI output: JSON mode + response schema, per-item validation, one retry, content-free diagnostics | Accepted |
| ADR-016 | A 5-question quiz, with temporary support for the 8-question answer format | Accepted |
| ADR-017 | Routing shell: a catch-all 404 route and scroll-to-top on navigation | Accepted |
| ADR-018 | Supabase for authentication and PostgreSQL | Accepted |
| ADR-019 | Roadmaps in PostgreSQL: FastAPI writes AI content, the browser writes user state through RLS | Accepted, amended 2026-10-03 (being built) |

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

## ADR-015 — Validated AI output: JSON mode + response schema, per-item validation, one retry, content-free diagnostics
- **Date:** 2026-09-27
- **Context:** before deploying, the owner asked to investigate an intermittent roadmap failure suspected to be malformed JSON, without guessing. 25 live calls through the real pipeline showed 15 of 15 replies parsed fine (0 malformed; 14 wrapped in code fences) and 10 failures that were all Gemini `429 RESOURCE_EXHAUSTED`: the key's free tier allows **20 requests per day** for `gemini-2.5-flash-lite`. The backend reported quota errors and parse errors as the same generic 502 and logged too little to tell failures apart. The original single failure isn't explained by the daily quota (only ~2 requests had been made) and can't be diagnosed after the fact.
- **Decision:**
  - Ask Gemini for JSON mode (`response_mime_type`) with a `response_schema` built from Pydantic generation schemas (all fields required).
  - Validate every reply with separate, tolerant output models (`ai_output.py`): per-item validation, defaults for missing optional fields, invalid items dropped (http(s)-only resource URLs, integer 0–100 match scores), whole reply rejected only when no item is usable. Keep a fallback extractor (fences, outermost braces, trailing-comma repair) in case JSON mode is ever bypassed.
  - At most 2 attempts (`llm.py`): retry once on an unusable reply, Gemini 5xx, timeout or network error, and on a per-minute 429 with a short delay; never on the daily quota or other 4xx.
  - Distinct user messages: 503 "usage limit" (quota), 503 "busy" + `Retry-After`, 503 unavailable, 502 failed. Raw output is never returned.
  - Diagnostics per attempt: outcome, finish reason, tokens, length, JSON strategy, dropped items as field paths + error types, a sha256 prefix, quota id and retry delay; every line tagged with a request ID also returned as `X-Request-ID`. No reply text, prompt or answers, enforced by tests with a planted marker.
  - First automated tests: 60 pytest tests with a scripted fake Gemini.
- **Alternatives considered:** only improving the fence parser (rejected: the evidence showed parsing wasn't the failing part); saving raw failed replies to disk for debugging (rejected: replies can echo the user's free text); retrying with the validation error appended to the prompt (deferred: no malformed replies observed to tune against); unlimited or exponential retries (rejected: each retry spends the 20/day quota and the frontend waits at most 90 s); using the output models as `response_model` (deferred; the explicit parse keeps per-item dropping).
- **Consequences:** a malformed or partial reply no longer fails the request when a usable part exists, transient errors get a second chance, and every failure is identifiable in the logs by type. A retry costs one more quota request. JSON mode + schema was verified live on `gemini-2.5-flash`; on `gemini-2.5-flash-lite` it still has to be checked once the daily quota resets (same API; the schema converts locally). The free-tier quota, not parsing, is now the main blocker to a public launch: the owner should enable billing before sharing the URL widely.
- **Status:** Accepted.

## ADR-016 — A 5-question quiz, with temporary support for the 8-question answer format
- **Date:** 2026-09-28
- **Context:** the owner believes users lose interest during the 8-question quiz. Analysis: three questions asked "where am I now?" (`stage`, `goal`, `experience_level`), two asked about preferences (`work_style`, `environment`), `interest_area` asked users to pick the answer the product should find (and anchored all 3 suggestions to one field), the "years" sliders were ambiguous for beginners, and nothing captured problem-solving style or weekly time. Roadmaps saved before a change store the old answers, and "Regenerate" sends them back to the API.
- **Decision:**
  - Five questions, all taps, under 2 minutes (owner-approved wording): **interests** (up to 3 of 9), **problem-solving style** (5 approaches; also reveals work style and strengths), **experience level** (5 levels), **weekly time** (four large buttons: 2/5/10/20+ h), **12-month goal** (5 outcomes) with an **optional "Already have a career in mind?"** field. No sixth question: the AI infers strengths and work style from these.
  - The prompt receives a labelled profile and explicit guidance on how to read each answer (hybrid roles for mixed interests, style separating roles in a family, feasibility from experience + hours + goal, honest fit for a career in mind, reasons citing at least two answers, steps paced to the weekly hours, last step aimed at the goal).
  - The API accepts **both formats** through a discriminated union (`interests` present → v2, else v1), with no version field. v1 answers get the original prompts, byte-identical, so old roadmaps regenerate exactly as before.
  - Question IDs change from `stage, goal, interest_area, work_style, experience_level, education_comfort, environment, curious_fields` to `interests, problem_style, experience, weekly_hours, goal, career_in_mind`. Choice answers stay length-limited strings rather than enumerated options.
- **Alternatives considered:** the analysis's own 5-question draft with scenario-based interests and a strengths question (owner kept their wording, added the problem-solving question, and declined a sixth question); a sixth "strengths" question (rejected: speed matters more; strengths are inferred); converting saved v1 answers to v2 in the browser (rejected: the mapping would invent answers the user never gave); a `version` field in requests (unnecessary: the fields identify the format).
- **Consequences:** faster quiz, richer signal per question, and results whose reasons point back to the user's answers. Two answer formats and two prompt versions exist until v1 is removed. Removal condition: once no saved roadmap in the wild uses v1 (with accounts/F-8 a stored-data migration can do it; before that, keep v1 for at least a few weeks after deploy). The tracking event log now contains both answer shapes. The "career in mind" free text reaches the prompt (≤100 chars, JSON-quoted, marked as data; TD-13).
- **Status:** Accepted.

## ADR-017 — Routing shell: a catch-all 404 route and scroll-to-top on navigation
- **Date:** 2026-09-29
- **Context:** the pre-deploy QA (2026-09-28) found two routing gaps. Unknown URLs matched no route and rendered an empty page, and Render's static-site rewrite sends every path to `index.html`, so any mistyped or stale link would show a black screen. `BrowserRouter` also kept the window's scroll position across route changes: on a phone, "Generate roadmap" at the bottom of Results opened the dashboard ~1,000 px down, past its hero.
- **Decision:**
  - A last `<Route path="*">` renders `pages/NotFound.jsx`: the shared `AppHeader`, a "404" mark, a short honest message, "Return home" (`/home`, the same target as the header's Home) and "Take the quiz". It sets the tab title to "Page not found · PathwayAI".
  - `components/ScrollToTop.jsx`, mounted once inside `BrowserRouter`, calls `window.scrollTo(0, 0)` in a layout effect on every **pathname** change, so a new page never shows the previous one's position. Actions that stay on the same route and replace the content (dashboard and Results "Regenerate") scroll to the top themselves. Browser Back/Forward keep the browser's native scroll restoration.
- **Alternatives considered:** React Router's `<ScrollRestoration>` (needs a data router, `createBrowserRouter`; migrating the router is out of proportion for this fix); resetting scroll on every location **key**, including same-path navigations (unnecessary today, and it would fight in-page scrolling such as "Open step"); a server-side 404 status (not possible on a static host with an SPA rewrite: the 404 page is served with HTTP 200).
- **Consequences:** every route change starts at the top on desktop and mobile; unknown links land on a branded page with two ways back. The 404 page returns HTTP 200, so crawlers may index unknown URLs; add `noindex` or a real 404 status if that ever matters. A React error boundary (the rest of F-12) is still missing: a render crash still shows a blank page.
- **Status:** Accepted.

## ADR-018 — Supabase for authentication and PostgreSQL
- **Date:** 2026-09-29 (proposed) · 2026-09-30 (accepted)
- **Context:** the app is code-complete for an initial release with browser-only persistence (ADR-004, ADR-013): one roadmap per browser, no accounts. Accounts, saved roadmaps and the planned Resume Analyzer / AI Coach all need user identity and server-side data. The docs listed Supabase, Clerk or self-managed FastAPI JWT + Postgres as options (open question since 2026-09-24). At the end of the 2026-09-29 session the owner set the post-launch order: push → deploy → verify → **Supabase Authentication** → **PostgreSQL** → Resume Analyzer → AI Coach.
- **Decision (proposed):** use Supabase for both.
  - **Auth:** Supabase Auth in the frontend (`@supabase/supabase-js`, email and OAuth providers to be chosen). The FastAPI backend verifies the Supabase access token (JWT) on endpoints that read or write user data. The Gemini and YouTube keys stay server-side; only Supabase's public anon key reaches the browser.
  - **Database:** Supabase Postgres with the schema sketched in `docs/database.md` (users, quiz_sessions, roadmaps, roadmap_steps, progress_events), versioned migrations and row-level security. On first sign-in, the roadmap saved in the browser (`pathwayai_roadmap` + its progress) is offered for import.
  - To confirm when implementation starts: the OAuth providers; whether the backend or the browser (with RLS) writes each table; the migration tool; the free vs paid Supabase plan.
- **Alternatives considered:** Clerk for auth + Render/Neon Postgres (two vendors, and Clerk's free tier is for auth only); self-managed FastAPI JWT + Render Postgres (more code to own: password reset, email verification, OAuth); staying browser-only (blocks cross-device use and the planned features).
- **Consequences:** a new vendor and new configuration (`SUPABASE_URL`, `SUPABASE_ANON_KEY` public; a service-role key server-only, if the backend needs one), documented in the `.env.example` files and `docs/deployment.md`. `AccountsSoonDialog` (ADR-011) is replaced by real sign-in, `/home` becomes the signed-in hub (ADR-010), and `/dashboard` may become per-roadmap. ADR-004/ADR-013's browser persistence remains for signed-out visitors unless a later ADR changes it. Rate limits could then key on user id as well as IP.
- **Accepted details (owner, 2026-09-30):**
  - **Order:** Supabase is built now, before the first deploy (the Render deploy D-1–D-4 follows later). The guest flow (quiz → results → dashboard, browser storage) must keep working at every commit, with or without Supabase configured.
  - **Milestone 1 = F-7 + a `profiles` table.** Sign-in method: **email + password** only (email confirmation on). OAuth providers later.
  - **Keys:** the browser gets the project URL and the **publishable** key (`sb_publishable_…`), never the secret/service-role key. The backend needs no Supabase secret in Milestone 1.
  - **Token verification:** the project signs access tokens with an asymmetric **ES256** key; FastAPI verifies them locally against the project's JWKS (`/auth/v1/.well-known/jwks.json`) with PyJWT, checking signature, `exp`, `iss` and `aud = authenticated`. No shared JWT secret.
  - **Migrations:** Supabase CLI format, SQL files in `supabase/migrations/` (replaces the Alembic note in `docs/database.md`). Every table in `public` has RLS on and explicit grants (new tables are not auto-exposed to the Data API).
  - **Writes:** in Milestone 1 the browser reads/updates its own `profiles` row through RLS; the row is created by a trigger on sign-up. Which side writes the F-8 tables is decided in Milestone 2.
  - **Plan:** Supabase free plan for now.
- **Status:** Accepted (2026-09-30).

## ADR-019 — Roadmaps in PostgreSQL: FastAPI writes AI content, the browser writes user state through RLS
- **Date:** 2026-10-02
- **Context:** Milestone 2 (F-8) moves roadmaps and progress for signed-in users from localStorage into Supabase Postgres (ADR-018), and must leave the guest flow exactly as it is. Milestones 3 (Resume Analyzer) and 4 (AI Coach) will add more AI-generated, per-user data, so the rule chosen here becomes the pattern for them. A first design (2026-10-01) was reviewed on 2026-10-02; six changes from that review are part of this decision (listed under *Alternatives considered*).
- **Decision:**
  - **General rule (also for M3/M4):** content the AI generates is written **only by FastAPI**; state the user owns (progress, later preferences) is written **by the browser** through supabase-js and row-level security (RLS). The browser reads its own rows directly; there are no GET endpoints for this data.
  - **How FastAPI reaches Postgres:** a dedicated database role, `pathwayai_api` (`login noinherit nobypassrls`, not a member of `authenticated`, least-privilege grants), through Supabase's connection pooler (transaction mode, IPv4) with a server-only `DATABASE_URL`. Driver: synchronous `psycopg` 3 + `psycopg_pool` (the endpoints are sync), small pool (max 5), prepared statements off for the pooler, pool created on first use. The role is created without a password in a migration; the owner sets the password in the Supabase dashboard, so it never appears in git or chat. When `DATABASE_URL` is unset the app starts normally, guests work, and `/api/roadmaps*` return 503.
  - **One ownership rule for both writers:** in each transaction FastAPI runs `set_config('request.jwt.claims', <claims from the token it already verified>, true)`, the same setting PostgREST fills for browser requests. Every table therefore has **one policy per operation**, `to authenticated, pathwayai_api using/with check (user_id = (select private.request_user_id()))` (see *Amendment 2026-10-03* below for why this is not `auth.uid()`). *What* each side may do is decided by **grants** (e.g. the browser may only `select` roadmaps; the API role may also `insert`). RLS is a second layer under the repository's own `user_id` filters, so a query bug cannot reach another user's rows.
  - **Short transactions:** Gemini and YouTube calls (up to ~60 s) happen **before** the transaction; the transaction contains only the inserts/updates, so a slow generation never holds a pooled connection.
  - **Schema** (all in `public`; every table: `user_id uuid not null references auth.users on delete cascade`, RLS on, migration starts with `revoke all … from anon, authenticated` because Supabase grants new tables to them by default, then explicit grants; `private.set_updated_at` where a table has `updated_at`):
    - `quiz_submissions (id uuid pk, user_id, answers jsonb ≤ 4 KB, answers_version smallint 1|2, created_at)` — **server only**: no browser grant at all. Holds the quiz answers needed for regenerate and, in M4, the Coach's context on the user's goals. One submission can lead to several roadmaps (another career, regenerate).
    - `roadmaps (id uuid pk, user_id, quiz_submission_id, career text 1–100, career_data jsonb ≤ 4 KB, prompt_version text, source 'generated'|'imported', status 'active'|'archived', local_id text null, created_at, updated_at)`; `unique (id, user_id)` for composite foreign keys; `unique (user_id, local_id)` for idempotent imports; **partial unique index `(user_id) where status = 'active'`**, so the database guarantees at most one current roadmap per user; index `(user_id, created_at desc)`. Several roadmaps per user (archived history) are allowed from day one; a list/switch UI later needs no schema change. `quiz_submission_id` is a composite foreign key `(quiz_submission_id, user_id)` → `quiz_submissions (id, user_id)`, null for imports without answers.
    - `roadmap_steps (id uuid pk, roadmap_id, user_id, position smallint 0–9, title, description, time_estimate, video_query, video_search_url (text with length limits), tasks/resources/videos jsonb arrays with size limits, created_at)`; composite foreign key `(roadmap_id, user_id)` → `roadmaps (id, user_id)` on delete cascade; `unique (id, user_id)`; `unique (roadmap_id, position) deferrable initially immediate`, so M4's Coach can reorder or insert steps inside one transaction without a schema rewrite. Steps are not edited in M2. Each step has a stable id for progress and for M4's tools.
    - `step_progress (step_id, user_id, completed_at timestamptz default now())`, primary key `(step_id, user_id)` (one row per step, since a step belongs to exactly one user; the key also indexes the foreign key); composite foreign key `(step_id, user_id)` → `roadmap_steps (id, user_id)` on delete cascade, so progress can only point at the user's own steps; index `(user_id, completed_at desc)` for activity. The browser may insert only `step_id` and `user_id`, so `completed_at` is always the database time and can't be backdated; `pathwayai_api` may set it (imports keep the original time). A row means "done"; undo deletes the row. No `roadmap_id` copy (it could disagree with the step's roadmap); the browser reads progress nested under steps.
  - **Grants (enforced by one shared policy per operation):**

    | Table | `authenticated` (browser) | `pathwayai_api` (FastAPI) | `anon` |
    |---|---|---|---|
    | `quiz_submissions` | none | select, insert | none |
    | `roadmaps` | select | select, insert, update (`status`) | none |
    | `roadmap_steps` | select | select, insert | none |
    | `step_progress` | select, insert (`step_id`, `user_id` only), delete | select, insert (imports) | none |
    | `profiles` | unchanged (ADR-018) | none | none |
  - **Endpoints** (all require a verified Supabase token; `POST /api/ai/roadmap` stays unchanged for guests):

    | Endpoint | Body | Result |
    |---|---|---|
    | `POST /api/roadmaps` | `{answers, career, career_data?}` | 201 + `{id, career, career_data, created_at, roadmap: [steps with id]}`; saves the submission, the roadmap and its steps; archives the previous active roadmap in the same transaction. AI rate limit |
    | `POST /api/roadmaps/{id}/regenerate` | none (stored answers + career) | 201 + a new roadmap from the same submission; the old one is archived. AI rate limit |
    | `POST /api/roadmaps/import` | `{local_id, career, career_data?, answers?, generated_at, steps[≤5], completed: [{position, completed_at}]}` | 201 if new; 200 + the existing roadmap if this `local_id` was already imported. Light rate limit; 64 KB body limit on this endpoint only |

    Errors: 401 bad or missing token; 404 for a roadmap that doesn't exist **or** isn't the caller's (the same answer, so ids can't be probed); 422 invalid body; 503 when accounts or the database aren't configured or the database is down. **If generation succeeds but saving fails, the answer is an honest 503** and the roadmap isn't returned (one wasted Gemini request, accepted for simplicity).
  - **Untrusted client data:** imported steps go through the same Pydantic models as AI output (`ai_output.RoadmapStep`, same limits, http(s) URLs only); `career_data` is validated with `ai_output.Career`; `source = 'imported'` records where content came from; `generated_at` is clamped to [now − 1 year, now] and becomes the import's `created_at`. Client-supplied content is only visible to its owner in M2; any future public sharing must re-check it.
  - **Current roadmap:** the newest one is active. Regenerate and new generations archive the previous active roadmap. An import becomes active only if its `created_at` is newer than the account's active roadmap; otherwise it is stored as archived.
  - **Guest import:** when a session exists and a valid local roadmap (`pathwayai_roadmap`) is present, the dashboard shows a one-click banner, "Save the roadmap on this device to your account?" (never a silent import, so on a shared computer the next person to sign in doesn't silently receive a guest's roadmap). On success the browser copy and its progress keys are **cleared** and the account copy is shown; on failure the local copy stays and the banner offers a retry. Duplicates (retries, two tabs) are prevented by the server's idempotency on `(user_id, local_id)`; no client-side "imported" marker. Local activity events are not imported.
  - **Activity for signed-in users:** no events table in M2. The activity chart, streak and achievements are derived from existing rows: `step_progress.completed_at`, `roadmaps.created_at`, `quiz_submissions.created_at`. For signed-in users the streak therefore counts days with real progress, not visits (in line with TD-29). Guests keep today's localStorage tracking, `EVENT_TYPES` and `METRIC_NAMES` unchanged.
  - **Code structure:** backend gains `db.py` (pool + `transaction(user)` helper that sets the claims), `repositories/roadmaps.py` (a `RoadmapRepository` `Protocol`, `PostgresRoadmapRepository` where every method takes the user id, and an in-memory fake for tests) and `routers/roadmaps.py` (APIRouter; the repository is a FastAPI dependency). Generation logic is shared with the guest endpoint, not duplicated. Frontend gains `lib/roadmaps/` with one record shape for both modes, a `localRepository` (today's `roadmapStore` + tracking progress), an `accountRepository` (supabase-js reads/progress, `api.js` for generation) and a `useRoadmaps()` hook that picks one by session; `api.js` sends `Authorization` when a session exists; `dashboardData.js` stays pure.
  - **Migrations:** Supabase CLI SQL files in `supabase/migrations/`, applied through the Supabase MCP tool with the same SQL saved in the repo, security and performance advisors run after each; forward-only. RLS checks are saved as SQL scripts in `supabase/tests/` that impersonate two users (and the API role) inside a rolled-back transaction. The tables start empty; user data moves only through the guest import.
- **Alternatives considered:**
  - *Supabase secret (service-role) key for FastAPI* — rejected: bypasses RLS, so a leak exposes every user's data.
  - *FastAPI forwarding the user's token to the Supabase REST API* — rejected: needs an insert grant for `authenticated`, which would let the browser create "AI" roadmaps directly.
  - *The browser writing roadmaps through RLS* — rejected: AI output must pass server-side validation and rate limits, and the Gemini key stays server-side (ADR-002).
  - *Review changes adopted on 2026-10-02 over the 2026-10-01 draft:* (1) a custom `app.user_id` setting with a second set of policies for the API role → replaced by `request.jwt.claims` and one shared `auth.uid()` policy per operation; (2) quiz answers in a column of `roadmaps` hidden by column-level grants (breaks `select('*')`, every new column needs a grant) → separate server-only `quiz_submissions`; (3) "current = newest active" with several active rows possible → partial unique index, at most one active; (4) a denormalized `roadmap_id` on `step_progress` that could disagree with the step → dropped; (5) a browser-written `activity_events` table (unbounded growth with no rate limit, measures visits) → deferred, activity derived from real rows; (6) silent automatic import + a per-user localStorage marker (the marker didn't stop a second account) → confirmation banner + server idempotency.
- **Consequences:**
  - New server-only configuration (`DATABASE_URL`) and dependencies (`psycopg`, `psycopg_pool`, pinned), documented in `backend/.env.example`, `render.yaml` and `docs/deployment.md` when they're added (M2-5). A new database role whose password the owner manages.
  - Two persistence modes in the frontend (guest localStorage, account Postgres) behind one repository interface; account mode needs loading and error states.
  - Signed-in streaks measure progress instead of visits; guest and account dashboards may show different activity numbers for the same behaviour.
  - Clearing the browser copy after import means a signed-out visitor on that device sees the empty state; the roadmap is in the account.
  - M3/M4 follow the same rule (e.g. `resume_analyses`, coach messages: written by FastAPI, read by the browser through RLS) without a new decision; M4's step editing needs an `update` grant on `roadmap_steps` for `pathwayai_api` in a later migration.
  - Removing the v1 quiz format (N-19) can later be done as a stored-data migration on `quiz_submissions`.
  - Free-plan limits still apply (500 MB database, Gemini 20 requests/day); live checks in M2-9 to M2-11 spend Gemini quota, automated tests don't.
- **Amendment 2026-10-03 (owner-approved, M2-2): `private.request_user_id()` instead of `auth.uid()`.**
  - *Finding:* `auth.uid()` itself is executable by every role, but it lives in schema `auth`, owned by `supabase_admin`; the migration owner (`postgres`) has `usage` on `auth` without grant option, so `grant usage on schema auth to pathwayai_api` silently grants nothing (checked in a rolled-back transaction). The API role therefore cannot call `auth.uid()`.
  - *Change:* a helper `private.request_user_id()` with the **same body as `auth.uid()`** (`request.jwt.claim.sub`, else `request.jwt.claims ->> 'sub'`, as uuid): `language sql stable`, **security invoker**, `set search_path = ''`, reads no tables. `execute` is revoked from `public`/`anon` and granted only to `authenticated` and `pathwayai_api`; both get `usage` on schema `private` (which only gives access to objects they are separately granted: the sign-up and `updated_at` functions stay non-executable for them). All shared policies use `(select private.request_user_id())`.
  - *Why the security model is unchanged:* the user id comes from the same claims as before (PostgREST for the browser, FastAPI after verifying the token); RLS stays the source of truth with one policy per operation; `pathwayai_api` keeps least privilege (`nologin noinherit nobypassrls`, member of no role, only the grants in the table above).
  - *Rejected:* making `pathwayai_api` a member of `authenticated` (inherits the browser's grants and `profiles` policies, breaks least privilege); two policies per operation, browser on `auth.uid()` and API on the raw claim (the duplication this ADR removed); a `security definer` wrapper around `auth.uid()` (works, but definer functions should not be used to get around a permission error).
  - *Risk:* if Supabase changes how `auth.uid()` reads the claims, the helper won't follow automatically; the M2 RLS checks in `supabase/tests/` would show it.
  - *Testing:* the migration also runs `grant pathwayai_api to postgres with inherit false, set true`, so the saved checks can `set role pathwayai_api`; `postgres` does not gain the role's privileges by inheritance.
- **Implementation notes (M2-3, 2026-10-03):** the `step_progress` primary key is `(step_id, user_id)` rather than `step_id` alone, and the browser's insert grant is limited to `step_id` + `user_id` (both recorded above). Test lesson: `set_config('request.jwt.claims', …, true)` lasts until the end of the transaction, so a "no claims" check must clear the setting first; FastAPI must likewise set the claims inside each transaction (`is_local = true`) so they never outlive it on a pooled connection.
- **Implementation notes (M2-4, 2026-10-03): the role's login.**
  - The owner enabled login with `alter role pathwayai_api with login password 'SCRAM-SHA-256$…'`, i.e. a SCRAM-SHA-256 hash generated locally, not the plain password: the project logs DDL (`log_statement = ddl`), so a plain password would have appeared in the Supabase logs. The password (random, URL-safe, 43 characters) exists only in the git-ignored `backend/.env`; it never went through git, chat or the SQL editor. The one-off helper that generated it was a local, git-excluded script and is deleted.
  - `DATABASE_URL` (server only) = `postgresql://pathwayai_api.<project-ref>:<password>@<pooler-host>:6543/postgres?sslmode=require`: the shared Supavisor pooler in **transaction mode**; custom roles connect as `<role>.<project-ref>` without any pooler registration. Clients must disable prepared statements (psycopg: `prepare_threshold=None`).
  - Verified through the pooler (`supabase/tests/m2_4_api_role_connection.py`, 18/18, with two committed-then-deleted fixture users): the session is `pathwayai_api` (not superuser, no `bypassrls`, no inheritance, member of no role); no claims → no rows; claims for one user → exactly that user's rows; claims set with `is_local = true` don't reach the next transaction; writes for another user and outside the grants fail; `row_security = off`, `alter table … disable row level security` and `set role` to `postgres`/`authenticated`/`service_role` all fail; `profiles` and `auth.users` are unreadable.
  - Rotating the password later: run a new hash the same way and update `DATABASE_URL`; the shared pooler may cache the old credentials briefly (Supabase docs).
- **Status:** Accepted (owner, 2026-10-02; amended 2026-10-03). Being built: M2-2 and M2-3 applied 2026-10-03 (migrations `20261004014249_create_roadmaps`, `20261004014958_create_step_progress`); M2-4 (role login, pooled connection verified) 2026-10-03.

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
