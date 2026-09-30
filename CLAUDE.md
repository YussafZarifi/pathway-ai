# CLAUDE.md — PathwayAI (repo: `roadmap-ai`)

> Permanent project memory. Read this first in every session. Then read `SESSION.md` (latest state) and `ROADMAP.md` (what's next).
> Last updated: 2026-09-29 (end of session).
> **State at a glance:** code-complete for an initial public release · **not deployed, not pushed** (`main` is ~47 commits ahead of `origin/main`) · Render Blueprint ready · pre-flight + pre-deploy fixes (C-27) + full QA done (desktop, 360 px, keyboard, full flow) · 80/80 backend tests, build passes · live `gemini-2.5-flash-lite` verified (incl. a 503 recovered by the retry).
> **Waiting on the owner:** Gemini billing, Render plan, push to the private GitHub repo, optional `YOUTUBE_API_KEY` (required before *public* launch).
> **Next session order:** push → deploy to Render → verify production → Supabase Auth → PostgreSQL → Resume Analyzer → AI Coach (§11). **2026-09-30: owner accepted ADR-018 and moved Supabase Milestone 1 (auth + profiles) ahead of the deploy — see ROADMAP "Milestone 1".** A recruiter-style review (2026-09-29) found mostly presentation/trust gaps → ROADMAP *Post-Launch Improvements* P-1–P-11.

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
| Dashboard (redesigned 2026-09-26) | **Implemented** (localStorage only). Hero (career, AI match %, progress ring = steps done / roadmap length, next milestone, time left from AI estimates), Today's focus (one task), stat tiles, visual roadmap stepper, dated achievements, rule-based Insights, quick actions (regenerate, retake quiz, Resume/Coach "coming soon" dialogs). Survives reloads/new tabs (ADR-013). Employability/Momentum scores are **no longer shown** (they measure engagement, TD-29); `scoringEngine.js` is unchanged |
| Resume Analyzer | **Not implemented.** The simulated `ResumeAnalyzer.jsx` (random score) was deleted 2026-09-25. Shown only as "Planned" / "Coming soon" |
| AI Coach / Chatbot | **Not implemented** ("Soon" quick action on `/dashboard` opening a "coming soon" dialog, "Planned" card on `/home`) |
| Auth / accounts | **Not implemented.** Since 2026-09-26 the Landing header has Log in / Sign up buttons; both open `AccountsSoonDialog` ("Accounts are coming soon", no account needed, "Take the quiz"). No login form, routes or backend exist |
| Database / server persistence | **Not implemented** |
| `/home` page | **Partially implemented:** hub with quiz CTA, the browser-saved roadmap with real progress + "Open your dashboard" (or an honest "No roadmap yet" state, since 2026-09-29), planned-feature cards; visual polish pass 2026-09-26. Future signed-in dashboard (ADR-010). Linked from the shared app header (Home / Dashboard / Quiz) on `/home` and `/dashboard`; not linked from Landing |
| Git / GitHub | **Implemented 2026-09-25.** `main` with a root `.gitignore` (excludes `backend/.env`); remote `origin` = https://github.com/YussafZarifi/pathway-ai (**private** — keep it private until the owner decides otherwise). `main` tracks `origin/main` |
| Deployment readiness | **Implemented 2026-09-27** (ADR-014): no hard-coded URLs (`VITE_API_URL`, `ALLOWED_ORIGINS`; `vite build` fails without `VITE_API_URL`), `.env.example` in `backend/` and `frontend/`, `GET /health`, Pydantic request models, 16 KB body limit, in-memory rate limits (per IP 8/min + 50/day, global 500/day), generic error messages, no answers/prompts/AI output in logs, `render.yaml` Blueprint (validated against Render's schema). **Ready, not deployed** (2026-09-29): waiting for the owner's decisions (ROADMAP → Ready to Deploy, D-1–D-6) |
| AI output reliability | **Implemented 2026-09-27** (ADR-015): Gemini JSON mode + `response_schema`; `ai_output.py` validates per item (defaults for missing fields, invalid items dropped); `llm.py` retries once (unusable reply, 5xx, timeout, short per-minute 429); 503 quota/busy messages; per-attempt logs with request IDs and no content. **Gemini key is on the free tier: 20 requests/day** for flash-lite (ROADMAP D-6, was N-16) |
| Quiz (redesigned 2026-09-28) | **Implemented** (ADR-016): 5 owner-approved questions, v2 labelled-profile prompts; API also accepts the old 8-answer format (v1) so saved roadmaps still regenerate. Verified live on `gemini-2.5-flash-lite` (v1 + v2) and by a manual desktop / 360 px / keyboard pass on 2026-09-28 |
| Tests | **Backend: 80 pytest tests** (`backend/tests`, `requirements-dev.txt`, `python -m pytest -q`, no network). Frontend: none |
| CI, Docker, live deployment | **None** (deployment is next: D-1–D-4) |
| Recruiter review | **Done 2026-09-29** (no code changes): core loop strong; gaps are presentation/trust — no built-by/About, thin Landing, too much "Coming soon", unsorted matches, unlabeled AI estimates, 3/13 broken AI links, video placeholders without the YouTube key. Ranked list: `docs/recruiter-notes.md`; tasks: ROADMAP P-1–P-11 |

## 3. Architecture (current)

```
Browser (React SPA, Vite dev :5173)
  ├─ router state (location.state) carries answers → results (and a fallback copy of the roadmap → dashboard)
  ├─ localStorage "pathwayai_roadmap" (current roadmap: career, careerData, answers, steps; ADR-013)
  ├─ localStorage "pathwayai_tracking" (events, metrics, progress; step keys roadmap_step_<roadmapId>_<i>)
  └─ lib/api.js → VITE_API_URL  (the only backend client; 90 s timeout, ApiError)
        │
FastAPI (backend/: main.py + config.py + schemas.py + rate_limit.py + llm.py + ai_output.py + request_log.py + youtube.py; :8000 locally)
  ├─ CORS from ALLOWED_ORIGINS · 16 KB body limit · Pydantic request models · rate limits on AI routes
  ├─ POST /api/ai/career   {answers: QuizAnswers}     → {careers[3], explanation}
  ├─ POST /api/ai/roadmap  {answers, career ≤100}     → {career, roadmap[≤5]}
  ├─ GET  /                                           → status
  └─ GET  /health                                     → liveness (Render health check)
        │
Google Gemini  (google-genai via llm.py; GEMINI_MODEL default "gemini-2.5-flash-lite"; JSON mode + response_schema; 30 s timeout; ≤2 attempts; FREE TIER 20 req/day)
YouTube Data API v3  (backend/youtube.py, optional YOUTUBE_API_KEY; roadmap step videos)
```
No database, no auth, no queue, no shared cache (rate limits and the YouTube cache are in-process memory). Hosting target: Render (`render.yaml`). Details: `docs/architecture.md`, `docs/deployment.md`.

## 4. Tech stack

- **Frontend:** React 19.2, Vite 7, React Router 7 (`BrowserRouter`), framer-motion 12, lucide-react, html2pdf.js (lazy-imported). Plain JavaScript (no TypeScript). ESLint 9 flat config. Plain CSS (`src/index.css` ~4,400 lines; the only stylesheet).
- **Backend:** Python, FastAPI 0.128, Uvicorn, Pydantic 2, `google-genai`, python-dotenv. (`openai` is in requirements.txt but unused.)
- **AI:** Gemini 2.5 Flash-Lite, JSON mode + `response_schema`, validated in `ai_output.py` (ADR-015).
- **Storage:** browser localStorage only.

## 5. Folder structure

```
roadmap-ai/
├── CLAUDE.md  README.md  ROADMAP.md  SESSION.md
├── docs/                      project documentation (this knowledge base)
├── backend/
│   ├── main.py                app, middleware, error handlers, endpoints, prompts
│   ├── config.py              settings from environment variables
│   ├── schemas.py             Pydantic request models: quiz answers v2 + v1 (discriminated), career
│   ├── rate_limit.py          in-memory per-IP + global rate limiter
│   ├── llm.py                 Gemini client, JSON mode + schema, retry policy, safe per-attempt logs
│   ├── ai_output.py           generation schemas, output models, JSON extraction, per-item validation
│   ├── request_log.py         logging with a request ID (X-Request-ID)
│   ├── prompts.py             prompt builders: v2 (5-question quiz) + v1 (original, unchanged)
│   ├── tests/                 80 pytest tests (fake Gemini); requirements-dev.txt adds pytest
│   ├── youtube.py             YouTube Data API lookup for roadmap step videos
│   ├── .env.example           template: GEMINI_API_KEY, YOUTUBE_API_KEY, ALLOWED_ORIGINS, limits…
│   ├── requirements.txt
│   └── .env                   local secrets + ALLOWED_ORIGINS (never commit)
├── frontend/
│   ├── index.html  vite.config.js (fails the build without VITE_API_URL)  eslint.config.js  package.json
│   ├── .env.example           VITE_API_URL template; local copy is .env.local (git-ignored)
│   ├── public/                favicon.svg ("PA" gradient mark)
│   └── src/
│       ├── main.jsx  App.jsx  index.css (only stylesheet, ~4,400 lines)
│       ├── pages/        Landing, Home, Quiz, Results, Dashboard, NotFound  (all routed)
│       ├── components/   AppHeader, ScrollToTop, Dialog, AccountsSoonDialog, VideoCard, ThemeGate, RadialMeter, CareerCompareModal, ShareModal
│       │   └── dashboard/  DashboardHero, TodayFocus, StatTile, RoadmapStepper, AchievementGrid, InsightsPanel, QuickActions
│       ├── lib/          api.js (the only backend client), roadmapStore.js, dashboardData.js (pure), trackingEngine.js, scoringEngine.js
│       └── data/         questions.js, trackingSchema.js, careerDetails.js
├── render.yaml                Render Blueprint: pathwayai-api (Python) + pathwayai-web (static)
├── .gitignore                 root ignore file (secrets, venvs, node_modules, caches)
└── .venv/  backend/.venv/     Python virtualenvs (two — consolidate; both git-ignored)
```

Routes (`App.jsx`): `/` Landing · `/home` Home · `/quiz` Quiz · `/results` Results · `/dashboard` Dashboard · `*` NotFound (branded 404, since 2026-09-29). `ScrollToTop` resets scroll on every route change (ADR-017). No component links to a non-existent route.

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

- ADR-001 React + Vite SPA · ADR-002 FastAPI backend as an AI proxy (keeps key server-side) · ADR-003 Gemini Flash-Lite (cheap/fast) · ADR-004 localStorage persistence (MVP, no accounts) · ADR-005 tech-only career scope (pivot from general careers) · ADR-006 plain CSS · ADR-007 router state as data transport · ADR-008 client-side tracking/scoring engines · ADR-009 docs-as-memory (update CLAUDE/ROADMAP/SESSION/decisions every session) · ADR-010 one dashboard: keep `/dashboard`, keep `/home` as the future signed-in hub, delete the `/app/*` shell · ADR-011 unbuilt-feature entry points open an honest explanation · ADR-012 roadmap videos come from the YouTube Data API, never the model · ADR-013 current roadmap persisted in localStorage, progress scoped per roadmap, dashboard shows only real-data metrics · ADR-014 deployment readiness: env-only config (no localhost defaults), one API client, request validation, in-memory rate limits, safe errors/logs, Render Blueprint · ADR-015 validated AI output: JSON mode + schema, per-item validation, one retry, content-free diagnostics · ADR-016 5-question quiz; the API accepts both the new (v2) and old 8-question (v1) answer formats · ADR-017 routing shell: catch-all branded 404 route and scroll-to-top on every route change · ADR-018 (accepted 2026-09-30) Supabase for authentication and PostgreSQL: email + password, publishable key in the browser, ES256 JWT verified in FastAPI via JWKS, Supabase CLI migrations, RLS on every table.

## 10. Known limitations & bugs (top items — full list in `docs/technical-debt.md`)

1. ~~Roadmap % wrong / progress leaking between roadmaps / roadmap not persisted~~ — fixed 2026-09-26 (ADR-013). Remaining: one roadmap at a time, this browser only; `scoringEngine.js` still counts all `roadmap_step_*` keys the old way (not displayed any more).
2. **Gemini free tier: 20 requests/day** (≈7–10 quiz runs); then users see "usage limit" until the reset. Enable billing before sharing publicly (ROADMAP D-6). Hard-coded URLs fixed 2026-09-27 (ADR-014); AI output validated + retried (ADR-015).
3. Quiz answers (incl. free text) are stored in localStorage for "Regenerate" (same device only; see TD-41).
4. `ThemeGate` effect removes the `theme-landing` class that `Landing`/`Home` add (parent effect runs after child).
5. ~~Quiz per-keystroke tracking inside a state updater~~ — fixed 2026-09-28 (TD-26). Two quiz answer formats (v1/v2) coexist until N-19.
6. Rate limits live in process memory: reset on every deploy/restart, not shared across instances; forged `X-Forwarded-For` may bypass the per-IP limit (the global cap still holds).
7. AI endpoints are unauthenticated (rate-limited and validated since 2026-09-27; raw exception text and answer logging removed).
8. ~~Fake data and dead buttons~~ — fixed 2026-09-25. Remaining honesty gap: Employability/Momentum scores mostly measure app engagement (TD-29).
9. ~~Compare checkbox inside the card button changed the selected career; no scroll reset; outdated copy; blank page for unknown URLs; "roadmap-ai" tab title~~ — all fixed 2026-09-29 (C-27, ADR-017). Remaining before a *public* launch: Gemini billing (D-6) and `YOUTUBE_API_KEY` (D-5). Quality backlog: N-21 (focus management, Landing card keyboard, quiet aborted requests, Esc on Compare/Share modals, reduced motion).
10. Backend tests only (80), no frontend tests, no CI; 12 ESLint errors (most are `motion` false positives from the missing jsx-uses-vars rule; none in files added 2026-09-26).
11. Presentation/trust gaps from the recruiter review (2026-09-29): no built-by/About, thin Landing, repeated "Coming soon", unsorted matches, salaries/growth not labelled as AI estimates, some broken AI resource links (TD-21, TD-59–TD-63; ROADMAP P-1–P-11).

## 11. Current priorities — Next Session (exact order)

Done: foundation (git, cleanup, env config, persistence, hardening, validated AI output), 5-question quiz, pre-flight QA, pre-deploy fixes (C-27), full QA. The app is code-complete for an initial release.

1. **Push to the private GitHub repo** (ROADMAP D-1) — only after the owner says so; `git check-ignore backend/.env` first; never change visibility.
2. **Deploy to Render** (D-2 plan choice, D-3 Blueprint) — `docs/deployment.md`.
3. **Verify production** (D-4) — `/health`, full flow, 404, CORS, logs, live URL in README, then `og:url`/`og:image` (N-22). Before sharing publicly: Gemini billing (D-6) + `YOUTUBE_API_KEY` (D-5), ideally P-1–P-6.
4. **Supabase Authentication** (F-7, ADR-018 accepted) — **moved first by the owner on 2026-09-30: Milestone 1 in progress, see ROADMAP "Milestone 1"**. Deploy (1–3) follows after it.
5. **PostgreSQL** on Supabase (F-8) + import of the browser-saved roadmap.
6. **Resume Analyzer** (F-13).
7. **AI Coach** (F-18).

Between steps, pick from ROADMAP *Post-Launch Improvements*: P-1–P-7 first (presentation & trust), then N-21 and P-8–P-11 (accessibility and polish).

## 12. Never change without a reason (and an ADR)

- The **tech-only** career scope (enforced in the career prompt).
- The Gemini API key must stay **server-side**; the frontend never calls Gemini directly.
- The quiz question IDs in `data/questions.js` (`interests, problem_style, experience, weekly_hours, goal, career_in_mind`, since ADR-016) — `backend/schemas.py` (QuizAnswersV2) and `backend/prompts.py` depend on them. The old IDs (`stage, goal, interest_area, work_style, experience_level, education_comfort, environment, curious_fields`) are still accepted as the v1 format for saved roadmaps' "Regenerate"; don't remove v1 before N-19.
- The AI response field names (`title, reason, match_score, salary_range, growth_rate, education, skills`; roadmap `title, description, time, resources[{name,url}], tasks`) — frontend renders them directly.
- The `EVENT_TYPES` / `METRIC_NAMES` string values — existing users' localStorage data depends on them.
- The brand name **PathwayAI**.

## 13. Features

**Implemented:** landing page (header Log in / Sign up → honest "coming soon" dialog, native `<dialog>`) · honest `/home` hub (empty state) · 5-question animated quiz (multi-select, single choice, large buttons, optional career field) · AI career matches (3) with match %, salary, growth, skills, reason · expand card · compare 2–3 careers · regenerate · "none of these" → retake · AI roadmap generation · real YouTube videos per step (YouTube Data API; search-link fallback) · dashboard (hero + progress ring, Today's focus, stat tiles, roadmap stepper with videos/resources/tasks and mark done/undo, achievements, Insights, quick actions incl. regenerate) · persisted current roadmap · PDF download & print of results · localStorage event/metric/progress tracking · branded 404 page · scroll-to-top on navigation · PathwayAI title, favicon and link-preview metadata.

**Partially implemented:** persistence (one roadmap, this browser only) · `/home` hub (no personal data until accounts exist) · theming (two competing mechanisms).

**Planned (not built):** accounts & auth (Supabase, ADR-018 proposed) · Postgres persistence · real resume analyzer + skill-gap · AI coach chat with memory/tool-calling · streaming · RAG / grounded resources & salaries · shareable public roadmaps · tests/CI · live deployment (Blueprint ready) · observability · i18n (EN/FR). See `docs/future-features.md`.

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
- Commands: frontend `cd frontend && cp .env.example .env.local && npm install && npm run dev` (lint: `npm run lint`, build: `npm run build`, which needs `VITE_API_URL`); backend `cd backend && cp .env.example .env` (set `GEMINI_API_KEY`) `&& pip install -r requirements.txt && uvicorn main:app --reload --port 8000`. Backend tests: `cd backend && pip install -r requirements-dev.txt && python -m pytest -q` (no network, no keys). The owner's running dev backend uses the repo-root `.venv` (pytest is installed in `backend/.venv`).
- Deployment: Render via `render.yaml`; steps in `docs/deployment.md`. Don't deploy or push without the owner's go-ahead.
