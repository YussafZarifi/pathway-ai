# CLAUDE.md — PathwayAI (repo: `roadmap-ai`)

> Permanent project memory. Read this first in every session. Then read `SESSION.md` (latest state) and `ROADMAP.md` (what's next).
> Last updated: 2026-10-05 (Milestone 3 in progress: ADR-020 accepted (M3-1), `resume_analyses` table (M3-2)).
> **State at a glance:** **Milestone 2 complete (2026-10-03, ADR-019):** signed-in users' roadmaps and progress live in Supabase Postgres (FastAPI writes AI content as the least-privilege `pathwayai_api` role; the browser reads its own rows and writes step progress through RLS; guest roadmaps can be imported once, never silently). **Milestone 1 complete (2026-10-01):** optional email + password accounts (ADR-018). Guest flow unchanged; builds without Supabase hide accounts. · **not deployed, not pushed** (`main` is 73 commits ahead of `origin/main`) · Render Blueprint ready (optional `SUPABASE_URL` / `DATABASE_URL` / `VITE_SUPABASE_*`) · 173/173 backend tests, 81 SQL RLS checks (31 + 22 + 28) + 18 pooled-connection checks, 0 known dependency vulnerabilities (2026-10-04 audit), build passes, lint at its 12-error baseline.
> **Deployment is postponed until Version 2 is complete** (owner decision, 2026-10-01). **Version 2 = Milestones 1–4:** accounts (done in code) → **Milestone 2: roadmaps in PostgreSQL (F-8)** → **Milestone 3: Resume Analyzer (F-13)** → **Milestone 4: AI Coach (F-18)**. Keep the project deployable after every commit (§11 "Deployable at every commit"), but **do not recommend deploying** (push-to-deploy, Render, production verification) until Version 2 is finished, unless the owner explicitly asks.
> **Milestone 2 in one line:** tables `quiz_submissions` (server only), `roadmaps` (one active per user), `roadmap_steps`, `step_progress`; one shared RLS policy per operation on `private.request_user_id()` (same logic as `auth.uid()`, which `pathwayai_api` can't call); endpoints `POST /api/roadmaps`, `/{id}/regenerate`, `/import`; frontend `lib/roadmaps/` (`repositoryFor` → local or account repository, `useCurrentRoadmap`, `useLocalImport`) + `ImportRoadmapBanner`. Details: ADR-019 (with amendment and implementation notes), ROADMAP *🗄️ Milestone 2*.
> **Next session order:** owner checks for Milestone 2 (ROADMAP M2-11 "owner" items: real-account cross-device check) → **Milestone 3: Resume Analyzer (F-13)**, planned and approved before code → Milestone 4 (§11). A recruiter-style review (2026-09-29) found mostly presentation/trust gaps → ROADMAP *Post-Launch Improvements* P-1–P-11 (fit between milestones only when the owner asks).

---

## 1. Project overview

**PathwayAI** is an AI-assisted tech-career guidance web app. A user answers a 5-question quiz (interests, problem-solving style, experience, weekly time, 12-month goal + optional career in mind; since 2026-09-28, ADR-016); Gemini suggests 3 **technology-industry** careers with match %, salary, growth and skills; the user picks one; Gemini generates a ≤5-step learning roadmap; the user tracks step completion on a dashboard (progress ring, today's focus, stepper, achievements; ADR-013).

- **Vision:** the most honest, practical path from "I'm curious about tech" to "I'm job-ready" — grounded in real data, tracked over time.
- **Mission:** turn vague career interest into a concrete, personalized, trackable plan in under 5 minutes.
- **Target users:** high-school and university students, bootcamp / self-taught learners, career switchers moving into tech. Likely Canada-first (owner is targeting Canadian employers — consider CAD salaries, EN/FR).
- **Dual purpose:** it is also the owner's **flagship portfolio project**. Recruiter perception matters (see `docs/recruiter-notes.md`).

Naming: the product brand is **PathwayAI** (tab title, favicon and metadata since 2026-09-29). The repo/folder is `roadmap-ai`; that is not a product name.

## 2. Current status (truthful snapshot)

| Area | Status |
|---|---|
| Quiz → AI career matches → AI roadmap → dashboard | **Implemented** (the only complete flow) |
| Career compare modal, regenerate, "Save Your Results" modal (PDF via html2pdf, print) | **Implemented** (fake "Copy Link" removed 2026-09-25; shareable links are planned) |
| YouTube videos per roadmap step | **Implemented 2026-09-26** (ADR-012). Gemini writes a search phrase per step; `backend/youtube.py` fetches up to 2 real videos via the YouTube Data API. Needs the optional `YOUTUBE_API_KEY` in `backend/.env` (**not set yet**: until the owner adds one, every step shows a "Search YouTube for this step" link) |
| Dashboard (redesigned 2026-09-26) | **Implemented.** Guests: localStorage (ADR-013). Signed-in users (since 2026-10-03, ADR-019): their account's current roadmap from Postgres, progress written through RLS, loading/error states, activity and streak from saved progress ("days with progress"). Hero (career, AI match %, progress ring = steps done / roadmap length, next milestone, time left from AI estimates), Today's focus (one task), stat tiles, visual roadmap stepper, dated achievements, rule-based Insights, quick actions (regenerate, retake quiz, Resume/Coach "coming soon" dialogs). Employability/Momentum scores are **no longer shown** (they measure engagement, TD-29); `scoringEngine.js` is unchanged |
| Resume Analyzer | **Not implemented.** The simulated `ResumeAnalyzer.jsx` (random score) was deleted 2026-09-25. Shown only as "Planned" / "Coming soon" |
| AI Coach / Chatbot | **Not implemented** ("Soon" quick action on `/dashboard` opening a "coming soon" dialog, "Planned" card on `/home`) |
| Auth / accounts | **Implemented 2026-09-30 (Milestone 1, ADR-018), optional.** Supabase Auth, email + password with email confirmation: `/login` (sign in / create account / check-your-email + resend), header Sign in or email + Sign out, Landing Log in / Sign up → `/login`. `lib/supabase.js` + `AuthProvider` (`useAuth()`). Backend `auth.py` verifies access tokens (ES256 via JWKS) for `GET /api/me` and `/api/roadmaps*`. When the `VITE_SUPABASE_*` variables are unset, accounts are off and Landing keeps `AccountsSoonDialog`. **Verified 2026-10-01 with the owner's real account.** Since 2026-10-03 accounts hold roadmaps (Milestone 2) |
| Database / server persistence | **Implemented 2026-10-03 (Milestone 2, ADR-019):** Supabase Postgres with `profiles` (M1) and `quiz_submissions`, `roadmaps`, `roadmap_steps`, `step_progress` (RLS, explicit grants, composite foreign keys, one active roadmap per user). FastAPI connects as `pathwayai_api` through the transaction pooler (`DATABASE_URL`, `db.py`, `repositories/roadmaps.py`, per-user advisory lock). Guests stay in localStorage; signed-in users can import the browser roadmap once (banner). Since 2026-10-05 (M3-2, ADR-020): `resume_analyses` (browser select + delete own, API select + insert; not used by code yet). Checks: `supabase/tests/` (81 SQL + 18 pooled) |
| `/home` page | **Partially implemented:** hub with quiz CTA, the current roadmap with real progress + "Open your dashboard" (guests: this browser; signed-in: their account, since 2026-10-03) or an honest "No roadmap yet" state, the import banner for signed-in users with a browser roadmap, planned-feature cards. Linked from the shared app header (Home / Dashboard / Quiz) on `/home` and `/dashboard`; not linked from Landing |
| Git / GitHub | **Implemented 2026-09-25.** `main` with a root `.gitignore` (excludes `backend/.env`); remote `origin` = https://github.com/YussafZarifi/pathway-ai (**private** — keep it private until the owner decides otherwise). `main` tracks `origin/main` |
| Deployment readiness | **Implemented 2026-09-27** (ADR-014): no hard-coded URLs (`VITE_API_URL`, `ALLOWED_ORIGINS`; `vite build` fails without `VITE_API_URL`), `.env.example` in `backend/` and `frontend/`, `GET /health`, Pydantic request models, 16 KB body limit (counted while reading, chunked bodies included, since 2026-10-04), in-memory rate limits (per IP 8/min + 50/day, global 500/day), generic error messages, no answers/prompts/AI output in logs, `render.yaml` Blueprint (validated against Render's schema). **Ready, not deployed.** Deployment is **postponed until Version 2 is complete** (owner, 2026-10-01); the launch steps are parked in ROADMAP → *Deployment (postponed)*, D-1–D-6. Every commit must keep the project deployable (§11) |
| AI output reliability | **Implemented 2026-09-27** (ADR-015): Gemini JSON mode + `response_schema`; `ai_output.py` validates per item (defaults for missing fields, invalid items dropped); `llm.py` retries once (unusable reply, 5xx, timeout, short per-minute 429); 503 quota/busy messages; per-attempt logs with request IDs and no content. **Gemini key is on the free tier: 20 requests/day** for flash-lite (ROADMAP D-6, was N-16) |
| Quiz (redesigned 2026-09-28) | **Implemented** (ADR-016): 5 owner-approved questions, v2 labelled-profile prompts; API also accepts the old 8-answer format (v1) so saved roadmaps still regenerate. Verified live on `gemini-2.5-flash-lite` (v1 + v2) and by a manual desktop / 360 px / keyboard pass on 2026-09-28 |
| Tests | **Backend: 173 pytest tests** (`backend/tests`, `requirements-dev.txt`, `python -m pytest -q`, no network; repository, endpoints, import since 2026-10-03). **Database:** `supabase/tests/` (31 + 22 + 28 RLS checks in rolled-back transactions, 18 pooled-connection checks). Frontend: no automated tests (Milestone 2 was checked with Playwright scripts against the dev server; not committed) |
| CI, Docker, live deployment | **None** (deployment postponed until Version 2; the Blueprint stays current) |
| Recruiter review | **Done 2026-09-29** (no code changes): core loop strong; gaps are presentation/trust — no built-by/About, thin Landing, too much "Coming soon", unsorted matches, unlabeled AI estimates, 3/13 broken AI links, video placeholders without the YouTube key. Ranked list: `docs/recruiter-notes.md`; tasks: ROADMAP P-1–P-11 |

## 3. Architecture (current)

```
Browser (React SPA, Vite dev :5173)
  ├─ router state (location.state) carries answers → results (and a fallback copy of the roadmap → dashboard)
  ├─ localStorage "pathwayai_roadmap" (current roadmap: career, careerData, answers, steps; ADR-013)
  ├─ localStorage "pathwayai_tracking" (events, metrics, progress; step keys roadmap_step_<roadmapId>_<i>)
  ├─ lib/supabase.js + AuthProvider (optional accounts: VITE_SUPABASE_URL + publishable key; off when unset)
  └─ lib/api.js → VITE_API_URL  (the only backend client; 90 s timeout, ApiError)
        │
FastAPI (backend/: main.py + config.py + schemas.py + rate_limit.py + llm.py + ai_output.py + request_log.py + youtube.py + auth.py; :8000 locally)
  ├─ CORS from ALLOWED_ORIGINS (headers Content-Type, Authorization) · 16 KB body limit · Pydantic request models · rate limits on AI routes
  ├─ POST /api/ai/career   {answers: QuizAnswers}     → {careers[3], explanation}     (no token: guests)
  ├─ POST /api/ai/roadmap  {answers, career ≤100}     → {career, roadmap[≤5]}         (no token: guests)
  ├─ GET  /api/me          Bearer Supabase token      → {id, email}  (401 bad token, 503 SUPABASE_URL unset)
  ├─ POST /api/roadmaps    Bearer + {answers, career, career_data?} → 201 saved roadmap (ADR-019; 503 without DATABASE_URL)
  ├─ POST /api/roadmaps/{id}/regenerate  Bearer → 201 new active roadmap from saved answers (404 not yours, 409 no answers)
  ├─ POST /api/roadmaps/import  Bearer + browser roadmap → 201 imported / 200 already imported (64 KB, own rate limit)
  ├─ GET  /                                           → status
  └─ GET  /health                                     → liveness (Render health check)
        │
Google Gemini  (google-genai via llm.py; GEMINI_MODEL default "gemini-2.5-flash-lite"; JSON mode + response_schema; 30 s timeout; ≤2 attempts; FREE TIER 20 req/day)
YouTube Data API v3  (backend/youtube.py, optional YOUTUBE_API_KEY; roadmap step videos)
Supabase project pczczkmkavmxibxureck (free plan): Auth (email + password, ES256 tokens, JWKS) + Postgres: profiles, quiz_submissions, roadmaps, roadmap_steps, step_progress, resume_analyses (RLS); role pathwayai_api via transaction pooler
```
Supabase holds accounts, profiles and signed-in users' roadmaps/progress (ADR-019); guests' roadmaps stay in localStorage. No queue, no shared cache (rate limits and the YouTube cache are in-process memory). Hosting target: Render (`render.yaml`). Details: `docs/architecture.md`, `docs/database.md`, `docs/deployment.md`.

## 4. Tech stack

- **Frontend:** React 19.2, Vite 7, React Router 7 (`BrowserRouter`), framer-motion 12, lucide-react, html2pdf.js (lazy-imported), `@supabase/supabase-js` 2.117.2 (pinned). Plain JavaScript (no TypeScript). ESLint 9 flat config. Plain CSS (`src/index.css` ~4,400 lines; the only stylesheet).
- **Backend:** Python, FastAPI 0.133.1 (Starlette 1.3.1, since 2026-10-04), Uvicorn, Pydantic 2, `google-genai`, python-dotenv, PyJWT 2.15.1 (token verification), psycopg 3.3.6 + psycopg-pool 3.3.3 (Postgres as `pathwayai_api`, ADR-019). (`openai` is in requirements.txt but unused.)
- **AI:** Gemini 2.5 Flash-Lite, JSON mode + `response_schema`, validated in `ai_output.py` (ADR-015).
- **Auth + DB:** Supabase (ADR-018/019): Auth (email + password) and Postgres (`profiles`, roadmap tables), migrations as Supabase CLI SQL files in `supabase/migrations/`; FastAPI reaches Postgres with psycopg 3 as `pathwayai_api`.
- **Storage:** guests: roadmaps and progress in browser localStorage; signed-in users: Supabase Postgres (since 2026-10-03).

## 5. Folder structure

```
roadmap-ai/
├── CLAUDE.md  README.md  ROADMAP.md  SESSION.md
├── docs/                      project documentation (this knowledge base)
├── backend/
│   ├── main.py                app, middleware, error handlers, guest endpoints; includes routers/
│   ├── generation.py          shared AI generation: generate(), generate_roadmap(), add_videos()
│   ├── routers/               roadmaps.py: /api/roadmaps* (signed-in, saved roadmaps)
│   ├── config.py              settings from environment variables
│   ├── schemas.py             Pydantic request models: quiz answers v2 + v1 (discriminated), career
│   ├── rate_limit.py          in-memory per-IP + global rate limiter
│   ├── llm.py                 Gemini client, JSON mode + schema, retry policy, safe per-attempt logs
│   ├── ai_output.py           generation schemas, output models, JSON extraction, per-item validation
│   ├── request_log.py         logging with a request ID (X-Request-ID)
│   ├── prompts.py             prompt builders: v2 (5-question quiz) + v1 (original, unchanged)
│   ├── auth.py                Supabase access-token verification (JWKS, PyJWT) → current_user dependency
│   ├── body_limit.py          request body limits counted while reading (chunked bodies too), 16 KB / 64 KB import
│   ├── db.py                  Postgres pool as pathwayai_api (transaction pooler), transaction(user_id) sets RLS claims (ADR-019)
│   ├── repositories/          roadmaps.py: RoadmapRepository Protocol, Postgres + in-memory implementations
│   ├── tests/                 173 pytest tests (fake Gemini, local EC keys, in-memory repository); requirements-dev.txt adds pytest
│   ├── youtube.py             YouTube Data API lookup for roadmap step videos
│   ├── .env.example           template: GEMINI_API_KEY, YOUTUBE_API_KEY, ALLOWED_ORIGINS, SUPABASE_URL, limits…
│   ├── requirements.txt
│   └── .env                   local secrets + ALLOWED_ORIGINS (never commit)
├── frontend/
│   ├── index.html  vite.config.js (fails the build without VITE_API_URL)  eslint.config.js  package.json
│   ├── .env.example           VITE_API_URL + optional VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY; local copy is .env.local (git-ignored)
│   ├── public/                favicon.svg ("PA" gradient mark)
│   └── src/
│       ├── main.jsx  App.jsx  index.css (only stylesheet, ~4,400 lines)
│       ├── pages/        Landing, Home, Quiz, Results, Dashboard, Login, NotFound  (all routed)
│       ├── components/   AppHeader, AuthProvider, ImportRoadmapBanner, ScrollToTop, Dialog, AccountsSoonDialog, VideoCard, ThemeGate, RadialMeter, CareerCompareModal, ShareModal
│       │   └── dashboard/  DashboardHero, TodayFocus, StatTile, RoadmapStepper, AchievementGrid, InsightsPanel, QuickActions
│       ├── lib/          api.js (the only backend client), supabase.js (the only Supabase client), authContext.js (useAuth), roadmaps/ (repositoryFor, localRepository, accountRepository, useCurrentRoadmap, useLocalImport), roadmapStore.js, dashboardData.js (pure), trackingEngine.js, scoringEngine.js
│       └── data/         questions.js, trackingSchema.js, careerDetails.js
├── supabase/migrations/       Supabase CLI SQL migrations (applied to project pczczkmkavmxibxureck)
├── supabase/tests/            RLS/grant checks as SQL, run in a rolled-back transaction (e.g. via MCP execute_sql), + m2_4_api_role_connection.py (pooled connection as pathwayai_api)
├── render.yaml                Render Blueprint: pathwayai-api (Python) + pathwayai-web (static)
├── .gitignore                 root ignore file (secrets, venvs, node_modules, caches)
└── .venv/  backend/.venv/     Python virtualenvs (two — consolidate; both git-ignored)
```

Routes (`App.jsx`): `/` Landing · `/home` Home · `/quiz` Quiz · `/results` Results · `/dashboard` Dashboard · `/login` Login (accounts, since 2026-09-30) · `*` NotFound (branded 404, since 2026-09-29). `ScrollToTop` resets scroll on every route change (ADR-017). No component links to a non-existent route.

## 6. Coding standards (summary — full version in `docs/coding-standards.md`)

- Match the existing style: function components, hooks, camelCase CSS class names, 2-space indent, double quotes.
- **No fake data or simulated AI in shipped UI.** If a feature isn't built, hide it or disable it with honest copy.
- **No side effects inside React state updater functions** (tracking calls currently violate this in `Quiz.jsx`).
- All network calls go through `src/lib/api.js`, with base URL from `import.meta.env.VITE_API_URL` (no hard-coded URLs anywhere).
- Requests are validated with Pydantic models (`backend/schemas.py`); AI output is validated in `backend/ai_output.py` before use. Never return or log raw model output.
- Backend tests must pass (`cd backend && python -m pytest -q`) before a backend task is done.
- Config comes only from environment variables, documented in the `.env.example` files.
- Never log user answers / PII. Never return raw exception text to clients.
- Every new interactive element must be keyboard-accessible; no interactive elements nested inside `<button>`.
- Lint must pass (`npm run lint`) before a task is considered done.

## 7. UI philosophy

Dark, focused, "calm AI startup" aesthetic: black background, purple→pink gradient accent (`#a855f7` → `#ff37d0`), soft glows, subtle framer-motion entrances. Direction going forward:
- One accent used sparingly (primary CTA + progress), neutrals for everything else.
- One app shell / header across all pages; one button system; design tokens in `:root`.
- Honest states: real loading skeletons, empty states, error states — never placeholder numbers.
- Respect `prefers-reduced-motion`; visible focus rings; WCAG AA contrast.
See `docs/ui-design.md`.

## 8. AI architecture (current)

Two single-shot prompts in `backend/prompts.py` (v2 for the 5-question quiz, v1 unchanged for old saved answers):
1. **Career:** answers → exactly 3 tech-only careers `{title, reason, match_score 70–95, salary_range, growth_rate, education, skills[4–5]}` + `explanation`.
2. **Roadmap:** answers + chosen career → `{career, roadmap: [{title, description, time, resources[{name,url}], tasks[], video_query}]}` (≤5 steps). The backend then adds `videos[{id,title,channel,thumbnail,url}]` (real YouTube Data API results) and `video_search_url` to each step (ADR-012).
Output comes from Gemini JSON mode and is validated in `backend/ai_output.py`. Requests are validated (length limits, control characters stripped, unknown keys dropped) and rate limited. Since ADR-015: Gemini JSON mode with a `response_schema`, per-item output validation with defaults, one retry, 30 s timeout, distinct 503 quota/busy and 502 failure messages, content-free diagnostics. Still no streaming, no caching, no grounding (salaries and URLs are model-invented; only non-http(s) URLs are dropped). User free text (≤300 chars) and the career title still go into the prompt (reduced prompt-injection surface, not closed). Improvement plan: `docs/ai-system.md`.

## 9. Important design decisions (see `docs/decisions.md` for ADRs)

- ADR-001 React + Vite SPA · ADR-002 FastAPI backend as an AI proxy (keeps key server-side) · ADR-003 Gemini Flash-Lite (cheap/fast) · ADR-004 localStorage persistence (MVP, no accounts) · ADR-005 tech-only career scope (pivot from general careers) · ADR-006 plain CSS · ADR-007 router state as data transport · ADR-008 client-side tracking/scoring engines · ADR-009 docs-as-memory (update CLAUDE/ROADMAP/SESSION/decisions every session) · ADR-010 one dashboard: keep `/dashboard`, keep `/home` as the future signed-in hub, delete the `/app/*` shell · ADR-011 unbuilt-feature entry points open an honest explanation · ADR-012 roadmap videos come from the YouTube Data API, never the model · ADR-013 current roadmap persisted in localStorage, progress scoped per roadmap, dashboard shows only real-data metrics · ADR-014 deployment readiness: env-only config (no localhost defaults), one API client, request validation, in-memory rate limits, safe errors/logs, Render Blueprint · ADR-015 validated AI output: JSON mode + schema, per-item validation, one retry, content-free diagnostics · ADR-016 5-question quiz; the API accepts both the new (v2) and old 8-question (v1) answer formats · ADR-017 routing shell: catch-all branded 404 route and scroll-to-top on every route change · ADR-018 (accepted 2026-09-30) Supabase for authentication and PostgreSQL: email + password, publishable key in the browser, ES256 JWT verified in FastAPI via JWKS, Supabase CLI migrations, RLS on every table · ADR-019 (accepted 2026-10-02, implemented 2026-10-03) roadmaps in Postgres: AI content written only by FastAPI as the least-privilege `pathwayai_api` role (claims set per transaction; policies use `private.request_user_id()`, same logic as `auth.uid()`, amended 2026-10-03), user state written by the browser through RLS, server-only `quiz_submissions`, at most one active roadmap per user, guest import behind a confirmation banner, activity derived from real rows · ADR-020 (accepted 2026-10-05, not yet implemented) Resume Analyzer: signed-in only, PDF never stored (sent inline to Gemini; only the structured analysis is saved in `resume_analyses`), raw-PDF upload checked before reading, per-user rate limit, no numeric score, off by default until Gemini billing (free-tier terms forbid personal data).

## 10. Known limitations & bugs (top items — full list in `docs/technical-debt.md`)

1. ~~Roadmap % wrong / progress leaking between roadmaps / roadmap not persisted~~ — fixed 2026-09-26 (ADR-013). Remaining: one roadmap at a time, this browser only; `scoringEngine.js` still counts all `roadmap_step_*` keys the old way (not displayed any more).
2. **Gemini free tier: 20 requests/day** (≈7–10 quiz runs); then users see "usage limit" until the reset. Enable billing before sharing publicly (ROADMAP D-6). Hard-coded URLs fixed 2026-09-27 (ADR-014); AI output validated + retried (ADR-015).
3. Quiz answers (incl. free text) are stored in localStorage for "Regenerate" (same device only; see TD-41).
4. `ThemeGate` effect removes the `theme-landing` class that `Landing`/`Home` add (parent effect runs after child).
5. ~~Quiz per-keystroke tracking inside a state updater~~ — fixed 2026-09-28 (TD-26). Two quiz answer formats (v1/v2) coexist until N-19.
6. Rate limits live in process memory: reset on every deploy/restart, not shared across instances; forged `X-Forwarded-For` may bypass the per-IP limit (the global cap still holds).
7. AI endpoints are unauthenticated on purpose (guests; rate-limited and validated since 2026-09-27); saved-roadmap routes need a token. Milestone 2 limits: only the current roadmap is shown (archived ones are kept but there's no list/switch UI); steps can't be edited; signed-in generation needs both the frontend Supabase variables and the API's `DATABASE_URL` (otherwise an honest 503); `private.request_user_id()` copies `auth.uid()`'s logic (TD-67); rate limits per IP, not per user. The free-plan Supabase email sender is rate-limited (TD-65); npm and Python dependencies at 0 known vulnerabilities since 2026-10-04 (TD-64, TD-73 resolved).
8. ~~Fake data and dead buttons~~ — fixed 2026-09-25. Remaining honesty gap: Employability/Momentum scores mostly measure app engagement (TD-29).
9. ~~Compare checkbox inside the card button changed the selected career; no scroll reset; outdated copy; blank page for unknown URLs; "roadmap-ai" tab title~~ — all fixed 2026-09-29 (C-27, ADR-017). Remaining before a *public* launch: Gemini billing (D-6) and `YOUTUBE_API_KEY` (D-5). Quality backlog: N-21 (focus management, Landing card keyboard, quiet aborted requests, Esc on Compare/Share modals, reduced motion).
10. Backend tests only (173), no frontend tests, no CI; 12 ESLint errors (most are `motion` false positives from the missing jsx-uses-vars rule; none in files added 2026-09-26).
11. Presentation/trust gaps from the recruiter review (2026-09-29): no built-by/About, thin Landing, repeated "Coming soon", unsorted matches, salaries/growth not labelled as AI estimates, some broken AI resource links (TD-21, TD-59–TD-63; ROADMAP P-1–P-11).

## 11. Current priorities — Next Session (exact order)

**Owner decision (2026-10-01): deployment is postponed until Version 2 is complete.** Version 2 = Milestones 1–4 below. Don't recommend pushing-to-deploy, Render setup or production verification before then unless the owner explicitly asks. Done so far: foundation (git, cleanup, env config, persistence, hardening, validated AI output), 5-question quiz, pre-flight QA, pre-deploy fixes (C-27), full QA, **Milestone 1** (accounts + `profiles`, ADR-018; code 2026-09-30, verified with a real account 2026-10-01), **Milestone 2** (roadmaps in Postgres, ADR-019; 2026-10-03).

1. ~~**Milestone 2: roadmaps in PostgreSQL (F-8, ADR-019)**~~ — **complete 2026-10-03** (M2-1 → M2-11, one commit each). Remaining owner check: sign in with the real account on two devices and confirm the same roadmap and progress (ROADMAP M2-11).
2. **Milestone 3: Resume Analyzer (F-13) — in progress.** ADR-020 accepted 2026-10-05 (M3-1); M3-2 (`resume_analyses` table, RLS, 28 SQL checks) done 2026-10-05; next M3-3 (AI layer), steps M3-3 → M3-6 in ROADMAP *📄 Milestone 3*. Real résumés only after Gemini billing (`RESUME_ANALYSIS_ENABLED=false` by default; synthetic résumés in development). Scope: PDF upload → Gemini → structured critique against the user's target career; real output only (no simulated scores). By ADR-019's rule, analyses are written by FastAPI and read by the browser through RLS.
3. **Milestone 4: AI Coach (F-18).** Chat with memory and tool calling (read/update the roadmap, find resources).

Version 2 is complete when Milestones 1–4 are done and verified locally. Only then return to the parked deployment steps (ROADMAP D-1–D-6) and the presentation fixes (P-1–P-11). Pick P-/N- items between milestones only when the owner asks.

**Deployable at every commit** (the project stays ready to ship even though shipping is postponed):
- Backend tests pass (`cd backend && python -m pytest -q`); lint stays at or below its baseline; `npm run build` passes with `VITE_API_URL` set.
- The guest flow (quiz → results → dashboard, browser storage) works with the Supabase variables **unset** and **set**.
- Every new environment variable goes into the `.env.example` files, `render.yaml` and `docs/deployment.md` in the same commit; every new backend dependency into `requirements.txt` (pinned).
- Every schema change is a Supabase CLI migration in `supabase/migrations/`, applied to the project, with security advisors clean.
- No secrets in the browser or in git (`git check-ignore backend/.env` before broad `git add`).

## 12. Never change without a reason (and an ADR)

- The **tech-only** career scope (enforced in the career prompt).
- The Gemini API key must stay **server-side**; the frontend never calls Gemini directly.
- The quiz question IDs in `data/questions.js` (`interests, problem_style, experience, weekly_hours, goal, career_in_mind`, since ADR-016) — `backend/schemas.py` (QuizAnswersV2) and `backend/prompts.py` depend on them. The old IDs (`stage, goal, interest_area, work_style, experience_level, education_comfort, environment, curious_fields`) are still accepted as the v1 format for saved roadmaps' "Regenerate"; don't remove v1 before N-19.
- The AI response field names (`title, reason, match_score, salary_range, growth_rate, education, skills`; roadmap `title, description, time, resources[{name,url}], tasks`) — frontend renders them directly.
- The `EVENT_TYPES` / `METRIC_NAMES` string values — existing users' localStorage data depends on them.
- The brand name **PathwayAI**.
- Only the Supabase **publishable** key may reach the browser (`VITE_` variables ship to users); never a secret/service-role key. Every `public` table gets RLS + explicit grants in a migration under `supabase/migrations/` (ADR-018). The guest flow must keep working with accounts off.

## 13. Features

**Implemented:** optional accounts (Supabase email + password: `/login`, confirmation email, header sign-in/out, `profiles` table, `GET /api/me`; since 2026-09-30) · **roadmaps saved to accounts** (Postgres, ADR-019: generate/regenerate saved server-side, progress synced across devices, archived history kept, one-time import of the browser roadmap behind a banner; since 2026-10-03) · landing page (header Log in / Sign up → `/login`, or the honest "coming soon" dialog when accounts are off) · honest `/home` hub · 5-question animated quiz (multi-select, single choice, large buttons, optional career field) · AI career matches (3) with match %, salary, growth, skills, reason · expand card · compare 2–3 careers · regenerate · "none of these" → retake · AI roadmap generation · real YouTube videos per step (YouTube Data API; search-link fallback) · dashboard (hero + progress ring, Today's focus, stat tiles, roadmap stepper with videos/resources/tasks and mark done/undo, achievements, Insights, quick actions incl. regenerate) · persisted current roadmap · PDF download & print of results · localStorage event/metric/progress tracking (guests) · branded 404 page · scroll-to-top on navigation · PathwayAI title, favicon and link-preview metadata.

**Partially implemented:** persistence (guests: one roadmap per browser; accounts: current roadmap only in the UI, history not browsable yet) · `/home` hub · theming (two competing mechanisms).

**Planned (not built):** a list/switch UI for saved roadmaps · OAuth sign-in providers · account settings (edit name, delete account) · real resume analyzer + skill-gap · AI coach chat with memory/tool-calling · streaming · RAG / grounded resources & salaries · shareable public roadmaps · frontend tests/CI · live deployment (Blueprint ready; postponed until Version 2) · observability · i18n (EN/FR). See `docs/future-features.md`.

## 14. Long-term roadmap (phases)

1. **Foundation** — git, cleanup, config, bug fixes, validation, security basics.
2. **Production baseline** — tests, CI, Docker, deploy, error tracking, README demo.
3. **Persistence** — auth + Postgres, saved roadmaps, shareable pages.
4. **AI depth** — streaming, grounded resources (RAG), real resume analysis, eval harness.
5. **Differentiators** — agentic coach, job-market data, mock interviews, EN/FR.

## 15. Working agreement for Claude sessions

- Start: read `CLAUDE.md` → `SESSION.md` → `ROADMAP.md`.
- **End of every coding session: update `CLAUDE.md`, `ROADMAP.md`, `SESSION.md`, and `docs/decisions.md`** (add an ADR for any significant architectural change). Update other `docs/*` files when the area they describe changes.
- Keep docs truthful: clearly separate *Implemented / Partially implemented / Planned*. Never describe planned work as existing.
- Git: small, single-concern commits with conventional prefixes; explain every deleted file in its commit message. Run `git check-ignore backend/.env` before any broad `git add`. Remote: `origin` → private `YussafZarifi/pathway-ai`; push `main` only when the owner asks. Never change the repo's visibility.
- Commands: frontend `cd frontend && cp .env.example .env.local && npm install && npm run dev` (lint: `npm run lint`, build: `npm run build`, which needs `VITE_API_URL`); backend `cd backend && cp .env.example .env` (set `GEMINI_API_KEY`) `&& pip install -r requirements.txt && uvicorn main:app --reload --port 8000`. Backend tests: `cd backend && pip install -r requirements-dev.txt && python -m pytest -q` (no network, no keys). The owner's running dev backend uses the repo-root `.venv` (pytest is installed in `backend/.venv`; install new requirements in both). Supabase: the MCP server in `.mcp.json` is scoped to project `pczczkmkavmxibxureck`; apply schema changes as migrations and save the same SQL in `supabase/migrations/<version>_<name>.sql`, then run the security advisors.
- Deployment: Render via `render.yaml`; steps in `docs/deployment.md`. **Postponed until Version 2 (Milestones 1–4) is complete** — don't recommend or start a deploy before then unless the owner explicitly asks. Keep every commit deployable (§11). Don't deploy or push without the owner's go-ahead.
