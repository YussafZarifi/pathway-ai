# CLAUDE.md — PathwayAI (repo: `roadmap-ai`)

> Permanent project memory. Read this first in every session. Then read `SESSION.md` (latest state) and `ROADMAP.md` (what's next).
> Last updated: 2026-09-26 (Landing Log in / Sign up → honest "coming soon" dialog; `/home` polish; real YouTube videos per roadmap step, ADR-012; **dashboard redesigned** around real progress with the current roadmap persisted in localStorage and progress scoped per roadmap, ADR-013; then a polish pass and one shared `VideoCard` for every step's videos).

---

## 1. Project overview

**PathwayAI** is an AI-assisted tech-career guidance web app. A user answers an 8-question quiz; Gemini suggests 3 **technology-industry** careers with match %, salary, growth and skills; the user picks one; Gemini generates a ≤5-step learning roadmap; the user tracks step completion on a dashboard that shows "Career Readiness" meters.

- **Vision:** the most honest, practical path from "I'm curious about tech" to "I'm job-ready" — grounded in real data, tracked over time.
- **Mission:** turn vague career interest into a concrete, personalized, trackable plan in under 5 minutes.
- **Target users:** high-school and university students, bootcamp / self-taught learners, career switchers moving into tech. Likely Canada-first (owner is targeting Canadian employers — consider CAD salaries, EN/FR).
- **Dual purpose:** it is also the owner's **flagship portfolio project**. Recruiter perception matters (see `docs/recruiter-notes.md`).

Naming: the product brand is **PathwayAI**. The repo/folder is `roadmap-ai`. The `index.html` title says "roadmap-ai" — an inconsistency to fix, not an alternative name.

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
| `/home` page | **Partially implemented:** honest empty-state hub (quiz CTA, "No saved roadmaps yet", planned-feature cards); visual polish pass 2026-09-26. Future signed-in dashboard (ADR-010). Linked from the shared app header (Home / Dashboard / Quiz) on `/home` and `/dashboard`; not linked from Landing |
| Git / GitHub | **Implemented 2026-09-25.** `main` with a root `.gitignore` (excludes `backend/.env`); remote `origin` = https://github.com/YussafZarifi/pathway-ai (**private** — keep it private until the owner decides otherwise). `main` tracks `origin/main` |
| Tests, CI, Docker, deployment | **None** |

## 3. Architecture (current)

```
Browser (React SPA, Vite dev :5173)
  ├─ router state (location.state) carries answers → results (and a fallback copy of the roadmap → dashboard)
  ├─ localStorage "pathwayai_roadmap" (current roadmap: career, careerData, answers, steps; ADR-013)
  ├─ localStorage "pathwayai_tracking" (events, metrics, progress; step keys roadmap_step_<roadmapId>_<i>)
  └─ fetch http://127.0.0.1:8000  (HARD-CODED, 3 places in Results.jsx)
        │
FastAPI (backend/main.py, single file, :8000)
  ├─ POST /api/ai/career   {answers: dict}            → {careers[3], explanation}
  ├─ POST /api/ai/roadmap  {answers: dict, career}    → {career, roadmap[≤5]}
  └─ GET  /                                           → health
        │
Google Gemini  (google-genai, model "gemini-2.5-flash-lite", key from backend/.env GEMINI_API_KEY)
YouTube Data API v3  (backend/youtube.py, optional YOUTUBE_API_KEY; roadmap step videos)
```
No database, no auth, no queue, no cache. Details: `docs/architecture.md`.

## 4. Tech stack

- **Frontend:** React 19.2, Vite 7, React Router 7 (`BrowserRouter`), framer-motion 12, lucide-react, html2pdf.js (lazy-imported). Plain JavaScript (no TypeScript). ESLint 9 flat config. Plain CSS (`src/index.css` ~4,400 lines; the only stylesheet).
- **Backend:** Python, FastAPI 0.128, Uvicorn, Pydantic 2, `google-genai`, python-dotenv. (`openai` is in requirements.txt but unused.)
- **AI:** Gemini 2.5 Flash-Lite via prompt-and-parse JSON.
- **Storage:** browser localStorage only.

## 5. Folder structure

```
roadmap-ai/
├── CLAUDE.md  README.md  ROADMAP.md  SESSION.md
├── docs/                      project documentation (this knowledge base)
├── backend/
│   ├── main.py                API endpoints + prompts (~210 lines)
│   ├── youtube.py             YouTube Data API lookup for roadmap step videos
│   ├── .env.example           template: GEMINI_API_KEY, YOUTUBE_API_KEY
│   ├── requirements.txt
│   └── .env                   GEMINI_API_KEY (secret — never commit)
├── frontend/
│   ├── index.html  vite.config.js  eslint.config.js  package.json
│   ├── public/                vite.svg (placeholder favicon)
│   └── src/
│       ├── main.jsx  App.jsx  index.css (only stylesheet, ~4,400 lines)
│       ├── pages/        Landing, Home, Quiz, Results, Dashboard  (all routed)
│       ├── components/   AppHeader, Dialog, AccountsSoonDialog, VideoCard, ThemeGate, RadialMeter, CareerCompareModal, ShareModal
│       │   └── dashboard/  DashboardHero, TodayFocus, StatTile, RoadmapStepper, AchievementGrid, InsightsPanel, QuickActions
│       ├── lib/          api.js (roadmap request), roadmapStore.js, dashboardData.js (pure), trackingEngine.js, scoringEngine.js
│       └── data/         questions.js, trackingSchema.js, careerDetails.js
├── .gitignore                 root ignore file (secrets, venvs, node_modules, caches)
└── .venv/  backend/.venv/     Python virtualenvs (two — consolidate; both git-ignored)
```

Routes (`App.jsx`): `/` Landing · `/home` Home · `/quiz` Quiz · `/results` Results · `/dashboard` Dashboard. No 404 route. No component links to a non-existent route any more (cleaned 2026-09-25).

## 6. Coding standards (summary — full version in `docs/coding-standards.md`)

- Match the existing style: function components, hooks, camelCase CSS class names, 2-space indent, double quotes.
- **No fake data or simulated AI in shipped UI.** If a feature isn't built, hide it or disable it with honest copy.
- **No side effects inside React state updater functions** (tracking calls currently violate this in `Quiz.jsx`).
- All network calls go through one API client (to be created: `src/lib/api.js`), with base URL from `import.meta.env.VITE_API_URL`.
- AI responses must be validated against a schema before use (backend Pydantic models).
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

Two single-shot prompts in `backend/main.py`:
1. **Career:** answers → exactly 3 tech-only careers `{title, reason, match_score 70–95, salary_range, growth_rate, education, skills[4–5]}` + `explanation`.
2. **Roadmap:** answers + chosen career → `{career, roadmap: [{title, description, time, resources[{name,url}], tasks[], video_query}]}` (≤5 steps). The backend then adds `videos[{id,title,channel,thumbnail,url}]` (real YouTube Data API results) and `video_search_url` to each step (ADR-012).
Output parsed with `json.loads` after manual code-fence stripping. No response schema, no validation, no retries, no streaming, no caching, no grounding (salaries and URLs are model-invented). User free text is interpolated directly (prompt-injection surface). Improvement plan: `docs/ai-system.md`.

## 9. Important design decisions (see `docs/decisions.md` for ADRs)

- ADR-001 React + Vite SPA · ADR-002 FastAPI backend as an AI proxy (keeps key server-side) · ADR-003 Gemini Flash-Lite (cheap/fast) · ADR-004 localStorage persistence (MVP, no accounts) · ADR-005 tech-only career scope (pivot from general careers) · ADR-006 plain CSS · ADR-007 router state as data transport · ADR-008 client-side tracking/scoring engines · ADR-009 docs-as-memory (update CLAUDE/ROADMAP/SESSION/decisions every session) · ADR-010 one dashboard: keep `/dashboard`, keep `/home` as the future signed-in hub, delete the `/app/*` shell · ADR-011 unbuilt-feature entry points open an honest explanation · ADR-012 roadmap videos come from the YouTube Data API, never the model · ADR-013 current roadmap persisted in localStorage, progress scoped per roadmap, dashboard shows only real-data metrics.

## 10. Known limitations & bugs (top items — full list in `docs/technical-debt.md`)

1. ~~Roadmap % wrong / progress leaking between roadmaps / roadmap not persisted~~ — fixed 2026-09-26 (ADR-013). Remaining: one roadmap at a time, this browser only; `scoringEngine.js` still counts all `roadmap_step_*` keys the old way (not displayed any more).
2. Only the roadmap request goes through `lib/api.js`; the two career fetches in `Results.jsx` are still hard-coded (N-6).
3. Quiz answers (incl. free text) are stored in localStorage for "Regenerate" (same device only; see TD-41).
4. `ThemeGate` effect removes the `theme-landing` class that `Landing`/`Home` add (parent effect runs after child).
5. Quiz text input logs one tracking event per keystroke, from inside a state updater.
6. Hard-coded `http://127.0.0.1:8000` and CORS `http://localhost:5173` → not deployable.
7. Open, unauthenticated, un-rate-limited AI proxy; raw exception text returned; user answers printed to logs.
8. ~~Fake data and dead buttons~~ — fixed 2026-09-25. Remaining honesty gap: Employability/Momentum scores mostly measure app engagement (TD-29).
9. Invalid nested interactive HTML: checkbox inside button in Results (the RoadmapTimeline part was fixed 2026-09-26).
10. No tests, no CI; 12 ESLint errors (most are `motion` false positives from the missing jsx-uses-vars rule; none in files added 2026-09-26).

## 11. Current priorities (in order)

1. ~~`git init` + root `.gitignore` + private GitHub repo~~ ✅ 2026-09-25.
2. ~~Remove fake data / dead code; hide unbuilt features honestly~~ ✅ 2026-09-25.
3. Env-based API URL + CORS; single API client (N-5, N-6).
4. ~~Fix progress bugs; persist roadmaps per career (N-7)~~ ✅ 2026-09-26 (with the dashboard redesign).
5. Gemini structured output + Pydantic validation; backend hardening (rate limit, input schema, safe errors, no PII logs).
6. Tests + CI, then deploy.
See `ROADMAP.md` → *Next Sprint*.

## 12. Never change without a reason (and an ADR)

- The **tech-only** career scope (enforced in the career prompt).
- The Gemini API key must stay **server-side**; the frontend never calls Gemini directly.
- The quiz question IDs in `data/questions.js` (`stage, goal, interest_area, work_style, experience_level, education_comfort, environment, curious_fields`) — prompts, tracking and scoring depend on them.
- The AI response field names (`title, reason, match_score, salary_range, growth_rate, education, skills`; roadmap `title, description, time, resources[{name,url}], tasks`) — frontend renders them directly.
- The `EVENT_TYPES` / `METRIC_NAMES` string values — existing users' localStorage data depends on them.
- The brand name **PathwayAI**.

## 13. Features

**Implemented:** landing page (header Log in / Sign up → honest "coming soon" dialog, native `<dialog>`) · honest `/home` hub (empty state) · 8-question animated quiz (choice / slider / text) · AI career matches (3) with match %, salary, growth, skills, reason · expand card · compare 2–3 careers · regenerate · "none of these" → retake · AI roadmap generation · real YouTube videos per step (YouTube Data API; search-link fallback) · dashboard (hero + progress ring, Today's focus, stat tiles, roadmap stepper with videos/resources/tasks and mark done/undo, achievements, Insights, quick actions incl. regenerate) · persisted current roadmap · PDF download & print of results · localStorage event/metric/progress tracking.

**Partially implemented:** persistence (one roadmap, this browser only) · `/home` hub (no personal data until accounts exist) · theming (two competing mechanisms).

**Planned (not built):** accounts & auth · Postgres persistence · real resume analyzer + skill-gap · AI coach chat with memory/tool-calling · streaming · RAG / grounded resources & salaries · shareable public roadmaps · tests/CI/deploy · observability · i18n (EN/FR). See `docs/future-features.md`.

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
- Commands: frontend `cd frontend && npm install && npm run dev` (lint: `npm run lint`, build: `npm run build`); backend `cd backend && pip install -r requirements.txt && uvicorn main:app --reload --port 8000`.
