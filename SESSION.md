# SESSION.md — Latest session log

> Overwrite the "Current session" section at the end of each coding session; move the previous one to "History" (keep history short: date + 1–3 lines).

---

## Current session — 2026-09-24 · Repository audit + documentation

### What was done
- **Complete repository audit.** Read every source file (frontend ~2,700 lines JS/JSX + ~4,000 lines CSS; backend 179 lines), plus config and dependencies. Ran ESLint (21 errors, 1 warning) and a production build (succeeds; main JS 413 KB / 131 KB gzip; html2pdf lazy chunk 975 KB). Viewed the live app in Chrome at desktop width.
- **Created the project documentation set:** `CLAUDE.md`, `README.md`, `ROADMAP.md`, `SESSION.md`, `docs/*` (14 files).
- **No application code was changed.**

### Summary of findings
The only complete feature is quiz → AI career matches → AI roadmap → dashboard, and it works and looks polished. Surrounding it: about 40% dead or unrouted code, fake data (Home stats, random resume score), non-functional buttons, no persistence beyond localStorage, no auth, no tests, no CI, no git history, and a backend that is an open, unvalidated Gemini proxy. Audit scores (out of 10): complexity 3, UI/UX 5.5, code quality 3.5, architecture 3, scalability 2, originality 4, AI 3, production readiness 1.5.

### Strengths
- Polished quiz UX (accessible custom slider over a real range input, animated transitions).
- Results page: match badges, expandable cards, compare modal, regenerate, loading/error/empty states, `AbortController`.
- Well-intentioned tracking schema with validation and a documented scoring formula.
- html2pdf lazy-loaded. Coherent dark visual style.

### Weaknesses
- Fake or simulated features, dead buttons, three brand names.
- No persistence, auth, tests, CI, deploy, README (until today), or git.
- AI integration is prompt-and-parse with no schema, validation, grounding, streaming or evals.
- One 3,900-line CSS file, three competing theme mechanisms, poor a11y (modals, focus, reduced motion).

### Known bugs (verified in code)
1. Dashboard "Roadmap" ring counts only touched steps → 100% after 1 of 5 (`Dashboard.jsx:82`, `scoringEngine.js:88`).
2. Progress keys `roadmap_step_${index}` aren't scoped per career → progress leaks between roadmaps (`RoadmapTimeline.jsx:11,33`).
3. Roadmap isn't persisted; opening `/dashboard` directly redirects to `/quiz`.
4. `ThemeGate` removes `theme-landing` that `Landing` and `Home` add (verified: body class is `theme-aurora` on `/`).
5. Quiz text input logs an event per keystroke, from inside a state updater (`Quiz.jsx:62-65`).
6. `resumeQuality` (0–40) compared against `< 60` → unreachable branch (`scoringEngine.js:327-333`).
7. `CAREER_DETAILS[career.title]` rarely matches AI titles → "Career Overview" rarely renders (`Results.jsx:440`).
8. Invalid nested interactive HTML: checkbox in button (`Results.jsx:467`); links in button (`RoadmapTimeline.jsx:100-146`).
9. `Roadmap.jsx` renders `resource.title` but the API returns `resource.name` (dead file).
10. The Landing hero depends on JS animation to become visible (`opacity: 0` initial) → blank if JS is slow or fails, and hurts LCP.

### Technical debt
See `docs/technical-debt.md` (grouped Critical → Low).

### Current blockers
- **Not a git repository**, and there is no root `.gitignore` → risk of committing `backend/.env` (contains a real key) on first `git add .`.
- **Not deployable:** hard-coded `http://127.0.0.1:8000` (frontend) and CORS `http://localhost:5173` (backend).
- **Unsafe to deploy publicly:** no rate limiting or auth on AI endpoints.

### Top priorities
1. `git init` + root `.gitignore` (exclude `.env`, `.venv`, `node_modules`, `.vite`, `dist`, `__pycache__`).
2. Remove fake data and dead code; hide unbuilt features honestly.
3. Env-based config (`VITE_API_URL`, `ALLOWED_ORIGINS`) + single API client.
4. Fix progress bugs 1–3; persist roadmaps per career.
5. Gemini structured output + Pydantic validation; backend hardening.

### Next recommended task
**ROADMAP N-1 + N-2:** initialize git with a safe root `.gitignore` (verify `backend/.env` is ignored *before* the first commit), then make an initial commit of the current state so all future changes are reviewable. Then N-3 (remove fake data/dead code) as the first real code change.

### Open questions (for the owner)
1. Keep `/home` as a logged-in hub (after auth), or delete it and use `/dashboard` as the hub?
2. Which dashboard design wins: the tabbed `/dashboard` or the unrouted `/app/*` shell (`AppShell` + `DashboardLayout`)?
3. Target market: Canada-first (CAD salaries, EN/FR) or US?
4. Database/auth preference: Supabase (fast) vs self-managed Postgres + FastAPI JWT (more to show)?
5. Deploy target: Render, Fly.io, Vercel + Render, or something else?
6. Stay on Gemini, or add a provider abstraction? (`openai` is in requirements but unused.)
7. TypeScript migration now (before the codebase grows) or later?
8. Should the "Employability/Momentum" scores stay? They currently measure app engagement, not employability.

---

## History
- 2026-09-24 — Initial audit and documentation. No code changes.
