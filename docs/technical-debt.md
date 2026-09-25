# Technical Debt Register

Found in the 2026-09-24 audit. When an item is resolved, strike it through and note the date and commit (don't delete it). IDs are stable references.

**Severity:** 🔴 Critical (blocks deploy, security or credibility) · 🟠 High (visible bugs, major quality issues) · 🟡 Medium · 🟢 Low

---

## 🔴 Critical

| ID | Category | Issue | Location |
|---|---|---|---|
| ~~TD-01~~ | Process | ~~Not a git repository; no history~~ — **resolved 2026-09-25** (`07bca25`) | repo root |
| ~~TD-02~~ | Security | ~~No root `.gitignore`; `backend/.env` would be committed~~ — **resolved 2026-09-25** (`07bca25`; `git check-ignore` verified before the first commit) | repo root |
| TD-03 | Security | Unauthenticated, un-rate-limited AI endpoints = open proxy to a paid API | `backend/main.py` |
| ~~TD-04~~ | Credibility | ~~Simulated AI: random resume score~~ — **resolved 2026-09-25** (`e0c40f1`, file deleted) | ~~`pages/ResumeAnalyzer.jsx`~~ |
| ~~TD-05~~ | Credibility | ~~Fake stats and fake activity on `/home`~~ — **resolved 2026-09-25** (`058d07a`, honest empty state) | `pages/Home.jsx` |
| TD-06 | Deployment | Hard-coded `http://127.0.0.1:8000` (×3) and CORS `http://localhost:5173` | `pages/Results.jsx:163,207,270`; `main.py:14` |

## 🟠 High

| ID | Category | Issue | Location |
|---|---|---|---|
| TD-07 | Bug | Roadmap % counts only touched steps → 100% after 1 of 5 | `Dashboard.jsx:82-97`; `scoringEngine.js:85-100` |
| TD-08 | Bug | Progress keys `roadmap_step_${index}` not scoped per roadmap → leak across careers (`Roadmap.jsx`, which used 1-based keys, was deleted 2026-09-25) | `RoadmapTimeline.jsx:11,33` |
| TD-09 | Persistence | Roadmap and careers only in router state; `/dashboard` direct visit → `/quiz` | `Dashboard.jsx:32-44` |
| TD-10 | AI | No structured output/schema; fragile code-fence stripping; unvalidated output returned | `main.py:102-105,172-175` |
| TD-11 | Security | Raw exception text returned to clients | `main.py:112,116` |
| TD-12 | Privacy | User answers and AI output printed to logs | `main.py:41,106` |
| TD-13 | Security | Prompt injection via `curious_fields` and `career`; `career` interpolated inside the JSON example | `main.py:40,135,159-162` |
| TD-14 | Security | No input size/shape limits (`answers: dict`) | `main.py:22-27` |
| ~~TD-15~~ | UX | ~~Dead buttons and fake Copy Link~~ — **resolved 2026-09-25**: Settings/Upgrade deleted with AppShell (`2375759`); Home auth buttons (`058d07a`); Landing Log in/Sign Up (`b1edc7f`); Save Roadmap/Mark as In Progress (`d8354b3`); Copy Link (`f76ff22`) | — |
| TD-16 | Routing | ~~Links to non-existent `/login`, `/signup`, `/profile`, `/app/*`~~ (removed 2026-09-25); **still no 404 route** (ROADMAP F-12) | `App.jsx` |
| TD-17 | Testing | Zero tests (frontend or backend) | — |
| TD-18 | CI/CD | No CI, Docker or deployment config | — |
| TD-19 | A11y | Invalid nested interactive HTML: checkbox in `<button>`; `<a>` in `<button>` | `Results.jsx:453-475`; `RoadmapTimeline.jsx:100-146` |
| TD-20 | A11y | Modals lack dialog role, focus trap, Esc, labels | `CareerCompareModal.jsx`, `ShareModal.jsx` |
| TD-21 | AI | Salaries and resource URLs invented by the model, shown as fact | prompts in `main.py` |

## 🟡 Medium

| ID | Category | Issue | Location |
|---|---|---|---|
| ~~TD-22~~ | Dead code | ~~Unrouted/unused pages, components, helpers, data, `dashboard.css`, images, root `.vite/`~~ — **resolved 2026-09-25** (`2375759`, `e0c40f1`, `aaa8c6e`; untracked root `.vite/` deleted). Dead CSS rules for removed components may remain inside `index.css` (e.g. `.roadmapStats`) — see TD-34 | — |
| TD-23 | Duplication | Three near-identical fetch blocks | `Results.jsx:161-295` |
| TD-24 | Duplication | Roadmap % logic in two places; brand header in several places (PDF-export and resume-analyzer duplicates removed 2026-09-25) | `Dashboard.jsx`, `scoringEngine.js`, page headers |
| TD-25 | Architecture | Two competing theme mechanisms (was three; `DashboardLayout` deleted 2026-09-25); `ThemeGate` removes the page's `theme-landing` class | `ThemeGate.jsx`, `Landing.jsx`, `Home.jsx`, `Dashboard.jsx` |
| TD-26 | Bug | Tracking side effect inside `setAnswers` updater; one event per keystroke on text input | `Quiz.jsx:61-67` |
| TD-27 | Performance | `getTrackingData()` writes on every read; each track call parses and rewrites the whole blob; unbounded `events[]` | `trackingEngine.js:77-93,129-154` |
| TD-28 | Bug | `resumeQuality` (0–40) compared to `< 60` → unreachable | `scoringEngine.js:327-339` |
| TD-29 | Product | "Employability" and "Momentum" measure app engagement (quiz time, sessions), not employability | `scoringEngine.js` |
| TD-30 | Bug | `CAREER_DETAILS` looked up by exact AI title → overview rarely shows | `Results.jsx:440` |
| TD-31 | Data | Pre-pivot non-tech careers (Nurse, Plumber, Police…) in data and icon mapping (`careers.js` deleted 2026-09-25) | `careerDetails.js`, `Results.jsx:63-146` |
| TD-32 | Performance/SEO | Landing hero starts `opacity: 0` and relies on JS animation (LCP, no-JS) | `Landing.jsx` |
| TD-33 | A11y | No `prefers-reduced-motion`; few focus styles; clickable `<div>`s; likely contrast failures | `index.css`, Landing, Home |
| TD-34 | Styling | 3,900-line single CSS file; 8 tokens vs ~130 colour literals; duplicate selectors; copied Uiverse CSS; `Inter` not loaded | `index.css` |
| TD-35 | Quality | 17 ESLint errors, 1 warning as of 2026-09-25 (was 21); most are false positives from missing `jsx-uses-vars` | `eslint.config.js` + various |
| TD-36 | Observability | `print`/`console.log` only; no request IDs, error tracking or metrics | FE + BE |
| TD-37 | AI | No retries, timeouts or caching; model name hard-coded twice | `main.py` |
| TD-38 | AI | Prompt references "location" but the quiz doesn't ask for it | `main.py:156` |
| TD-39 | Type safety | No TypeScript; field-name drift (`name` vs `title`, `salary_range` vs `salaryRange`) | FE |
| TD-40 | UX | "Try again" does `window.location.reload()`; PDF export uses `alert()` on error | `Results.jsx:367`, `ShareModal.jsx:33` |
| TD-41 | Privacy | Raw quiz answers (incl. free text) stored in the localStorage event log | `Quiz.jsx:79`, `trackingEngine.js` |

## 🟢 Low

| ID | Category | Issue | Location |
|---|---|---|---|
| TD-42 | Branding | `<title>` "roadmap-ai"; Vite favicon (the "RoadmapAI" name left with `Sidebar.jsx` on 2026-09-25) | `index.html` |
| TD-43 | Docs | `frontend/README.md` is the default Vite template | `frontend/README.md` |
| TD-44 | Deps | `openai` in requirements but unused; two Python virtualenvs | `backend/requirements.txt`, `.venv`, `backend/.venv` |
| TD-45 | Quality | Unused imports and vars (e.g. `endSession`, `trackProgress`, `progressData`, `quizStartedEvents`, lucide icons) | various |
| TD-46 | UX | `CareerCompareModal` returns `null` → exit animations never run | `CareerCompareModal.jsx:5` |
| TD-47 | Metrics | `totalScreensViewed` incremented on every event | `trackingEngine.js:145` |
| TD-48 | Perf | No route-level code splitting (main chunk 413 KB) | `App.jsx` |
| ~~TD-49~~ | Dead file | ~~`App.css` intentionally empty~~ — **resolved 2026-09-25** (`aaa8c6e`) | — |
