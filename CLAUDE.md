# CLAUDE.md — PathwayAI (repo: `roadmap-ai`)

> Permanent project memory. Read this first in every session. Then read `SESSION.md` (latest state) and `ROADMAP.md` (what's next).
> Last updated: 2026-09-24 (initial audit + documentation session; no application code changed yet).

---

## 1. Project overview

**PathwayAI** is an AI-assisted tech-career guidance web app. A user answers an 8-question quiz; Gemini suggests 3 **technology-industry** careers with match %, salary, growth and skills; the user picks one; Gemini generates a ≤5-step learning roadmap; the user tracks step completion on a dashboard that shows "Career Readiness" meters.

- **Vision:** the most honest, practical path from "I'm curious about tech" to "I'm job-ready" — grounded in real data, tracked over time.
- **Mission:** turn vague career interest into a concrete, personalized, trackable plan in under 5 minutes.
- **Target users:** high-school and university students, bootcamp / self-taught learners, career switchers moving into tech. Likely Canada-first (owner is targeting Canadian employers — consider CAD salaries, EN/FR).
- **Dual purpose:** it is also the owner's **flagship portfolio project**. Recruiter perception matters (see `docs/recruiter-notes.md`).

Naming: the product brand is **PathwayAI**. The repo/folder is `roadmap-ai`. `Sidebar.jsx` says "RoadmapAI" and `index.html` title says "roadmap-ai" — both are inconsistencies to fix, not alternative names.

## 2. Current status (truthful snapshot)

| Area | Status |
|---|---|
| Quiz → AI career matches → AI roadmap → dashboard | **Implemented** (the only complete flow) |
| Career compare modal, regenerate, share modal (PDF via html2pdf, print) | **Implemented** (share "Copy Link" is fake — `/share/:slug` route doesn't exist) |
| Roadmap step completion + readiness/momentum scores | **Partially implemented** (localStorage only; progress bugs — see §10) |
| Resume Analyzer | **Not implemented.** `pages/ResumeAnalyzer.jsx` exists but is unrouted and produces a `Math.random()` score — must never be shipped as-is |
| AI Coach / Chatbot | **Not implemented** (placeholder page + "Coming soon" tab) |
| Auth / accounts | **Not implemented** (Log in / Sign Up buttons are non-functional) |
| Database / server persistence | **Not implemented** |
| `/home` page | Exists but shows **hard-coded fake stats and activity**; not linked from Landing |
| Tests, CI, Docker, deployment, git history | **None** (directory is not yet a git repository) |

## 3. Architecture (current)

```
Browser (React SPA, Vite dev :5173)
  ├─ router state (location.state) carries answers → results → dashboard
  ├─ localStorage "pathwayai_tracking" (events, metrics, progress)
  └─ fetch http://127.0.0.1:8000  (HARD-CODED, 3 places in Results.jsx)
        │
FastAPI (backend/main.py, single file, :8000)
  ├─ POST /api/ai/career   {answers: dict}            → {careers[3], explanation}
  ├─ POST /api/ai/roadmap  {answers: dict, career}    → {career, roadmap[≤5]}
  └─ GET  /                                           → health
        │
Google Gemini  (google-genai, model "gemini-2.5-flash-lite", key from backend/.env GEMINI_API_KEY)
```
No database, no auth, no queue, no cache. Details: `docs/architecture.md`.

## 4. Tech stack

- **Frontend:** React 19.2, Vite 7, React Router 7 (`BrowserRouter`), framer-motion 12, lucide-react, html2pdf.js (lazy-imported). Plain JavaScript (no TypeScript). ESLint 9 flat config. Plain CSS (`src/index.css` ~3,900 lines + `src/styles/dashboard.css`).
- **Backend:** Python, FastAPI 0.128, Uvicorn, Pydantic 2, `google-genai`, python-dotenv. (`openai` is in requirements.txt but unused.)
- **AI:** Gemini 2.5 Flash-Lite via prompt-and-parse JSON.
- **Storage:** browser localStorage only.

## 5. Folder structure

```
roadmap-ai/
├── CLAUDE.md  README.md  ROADMAP.md  SESSION.md
├── docs/                      project documentation (this knowledge base)
├── backend/
│   ├── main.py                all API code (179 lines)
│   ├── requirements.txt
│   └── .env                   GEMINI_API_KEY (secret — never commit)
├── frontend/
│   ├── index.html  vite.config.js  eslint.config.js  package.json
│   ├── public/assets/         coach.jpg resume.jpg roadmap.jpg (UNUSED)
│   └── src/
│       ├── main.jsx  App.jsx  index.css  App.css(empty)
│       ├── pages/        Landing, Home, Quiz, Results, Dashboard  (routed)
│       │                 DashboardLayout, DashboardHome, Coach, Roadmap, ResumeAnalyzer (UNROUTED / dead)
│       ├── components/   ThemeGate, RadialMeter, RoadmapTimeline, CareerCompareModal, ShareModal (used)
│       │                 AppShell, Sidebar, Topbar, GeneratingLoader (UNUSED)
│       ├── lib/          trackingEngine.js, scoringEngine.js (used); exportPdf.js, matchCareers.js (UNUSED)
│       ├── data/         questions.js, trackingSchema.js, careerDetails.js (used); careers.js (UNUSED, pre-pivot)
│       └── styles/       dashboard.css (almost entirely unused)
├── .venv/  backend/.venv/     Python virtualenvs (two — consolidate)
└── .vite/                     stray Vite cache at repo root
```

Routes (`App.jsx`): `/` Landing · `/home` Home · `/quiz` Quiz · `/results` Results · `/dashboard` Dashboard. No 404 route. Components link to `/app/*`, `/login`, `/signup`, `/profile`, `/share/*` — **none exist**.

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
2. **Roadmap:** answers + chosen career → `{career, roadmap: [{title, description, time, resources[{name,url}], tasks[]}]}` (≤5 steps).
Output parsed with `json.loads` after manual code-fence stripping. No response schema, no validation, no retries, no streaming, no caching, no grounding (salaries and URLs are model-invented). User free text is interpolated directly (prompt-injection surface). Improvement plan: `docs/ai-system.md`.

## 9. Important design decisions (see `docs/decisions.md` for ADRs)

- ADR-001 React + Vite SPA · ADR-002 FastAPI backend as an AI proxy (keeps key server-side) · ADR-003 Gemini Flash-Lite (cheap/fast) · ADR-004 localStorage persistence (MVP, no accounts) · ADR-005 tech-only career scope (pivot from general careers) · ADR-006 plain CSS · ADR-007 router state as data transport · ADR-008 client-side tracking/scoring engines · ADR-009 docs-as-memory (update CLAUDE/ROADMAP/SESSION/decisions every session).

## 10. Known limitations & bugs (top items — full list in `docs/technical-debt.md`)

1. Dashboard "Roadmap" ring counts only *touched* steps → shows 100% after completing 1 of 5 (`Dashboard.jsx:82`, `scoringEngine.js:88`).
2. Step progress keyed `roadmap_step_${index}`, not scoped per career/roadmap → progress leaks between roadmaps (`RoadmapTimeline.jsx`).
3. Roadmap itself isn't persisted — visiting `/dashboard` fresh redirects to `/quiz`.
4. `ThemeGate` effect removes the `theme-landing` class that `Landing`/`Home` add (parent effect runs after child).
5. Quiz text input logs one tracking event per keystroke, from inside a state updater.
6. Hard-coded `http://127.0.0.1:8000` and CORS `http://localhost:5173` → not deployable.
7. Open, unauthenticated, un-rate-limited AI proxy; raw exception text returned; user answers printed to logs.
8. Fake data: `/home` stats, `ResumeAnalyzer` random score, fake share link, dead buttons (Settings, Upgrade, Save Roadmap, Mark as In Progress, Log in, Sign Up).
9. Invalid nested interactive HTML (checkbox inside button in Results; links inside button in RoadmapTimeline).
10. No tests, no CI, no git history, 21 ESLint errors (≈8 are false positives from missing JSX-uses-vars rule).

## 11. Current priorities (in order)

1. `git init` + root `.gitignore` (must exclude `backend/.env`, `.venv`, `node_modules`, `.vite`, `dist`).
2. Remove fake data / dead code; hide unbuilt features honestly.
3. Env-based API URL + CORS; single API client.
4. Fix progress bugs; persist roadmaps per career.
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

**Implemented:** landing page · 8-question animated quiz (choice / slider / text) · AI career matches (3) with match %, salary, growth, skills, reason · expand card · compare 2–3 careers · regenerate · "none of these" → retake · AI roadmap generation · dashboard timeline with expandable steps, resources, tasks, mark done/undo · readiness / employability / momentum meters + top recommendation banner · PDF download & print of results · localStorage event/metric/progress tracking.

**Partially implemented:** share (PDF/print work; link is fake) · progress tracking (buggy, not per-roadmap) · `/home` hub (fake data) · theming (three competing mechanisms).

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
- Commands: frontend `cd frontend && npm install && npm run dev` (lint: `npm run lint`, build: `npm run build`); backend `cd backend && pip install -r requirements.txt && uvicorn main:app --reload --port 8000`.
