# Technical Debt Register

Found in the 2026-09-24 audit. When an item is resolved, strike it through and note the date and commit (don't delete it). IDs are stable references.

**Severity:** 🔴 Critical (blocks deploy, security or credibility) · 🟠 High (visible bugs, major quality issues) · 🟡 Medium · 🟢 Low

---

## 🔴 Critical

| ID | Category | Issue | Location |
|---|---|---|---|
| ~~TD-01~~ | Process | ~~Not a git repository; no history~~ — **resolved 2026-09-25** (`07bca25`) | repo root |
| ~~TD-02~~ | Security | ~~No root `.gitignore`; `backend/.env` would be committed~~ — **resolved 2026-09-25** (`07bca25`; `git check-ignore` verified before the first commit) | repo root |
| TD-03 | Security | Unauthenticated AI endpoints = open proxy to a paid API. **Mitigated 2026-09-27** (`f632536`): per-IP and global rate limits, body/field size limits. Still no auth | `backend/main.py`, `rate_limit.py` |
| ~~TD-04~~ | Credibility | ~~Simulated AI: random resume score~~ — **resolved 2026-09-25** (`e0c40f1`, file deleted) | ~~`pages/ResumeAnalyzer.jsx`~~ |
| ~~TD-05~~ | Credibility | ~~Fake stats and fake activity on `/home`~~ — **resolved 2026-09-25** (`058d07a`, honest empty state) | `pages/Home.jsx` |
| ~~TD-06~~ | Deployment | ~~Hard-coded `http://127.0.0.1:8000` and CORS `http://localhost:5173`~~ — **resolved 2026-09-27** (`2dbb11c`, `de7a1d2`, `9caa2eb`: `ALLOWED_ORIGINS`, `VITE_API_URL`, build fails without it) | — |

## 🟠 High

| ID | Category | Issue | Location |
|---|---|---|---|
| ~~TD-07~~ | Bug | ~~Roadmap % counts only touched steps → 100% after 1 of 5~~ — **resolved 2026-09-26** (`d47d7b8`/`d7630b6`: % = done ÷ roadmap length in `dashboardData.js`; `scoringEngine.js` still uses the old count but is no longer displayed) | — |
| ~~TD-08~~ | Bug | ~~Progress keys not scoped per roadmap~~ — **resolved 2026-09-26** (`roadmap_step_<roadmapId>_<index>`, ADR-013) | — |
| ~~TD-09~~ | Persistence | ~~Roadmap only in router state; `/dashboard` direct visit → `/quiz`~~ — **resolved 2026-09-26** (`pathwayai_roadmap` in localStorage; empty state instead of redirect). One roadmap, one browser until F-8 | — |
| ~~TD-10~~ | AI | ~~No structured output/schema; fragile code-fence stripping; unvalidated output returned~~ — **resolved 2026-09-27** (`5fcfb4d`, `97ae7aa`: JSON mode + response schema, per-item Pydantic validation, one retry; ADR-015) | — |
| ~~TD-11~~ | Security | ~~Raw exception text returned to clients~~ — **resolved 2026-09-27** (`27d0ce9`: fixed messages for 422/429/502/503/500) | — |
| ~~TD-12~~ | Privacy | ~~User answers and AI output printed to logs~~ — **resolved 2026-09-27** (`27d0ce9` backend logging; `cb53422` removed the Quiz `console.log` of answers) | — |
| TD-13 | Security | Prompt injection via `curious_fields` and `career`; `career` interpolated inside the JSON example. **Reduced 2026-09-27** (`dc0f4d1`): length limits, control characters stripped, unknown keys dropped | `main.py` prompts |
| ~~TD-14~~ | Security | ~~No input size/shape limits (`answers: dict`)~~ — **resolved 2026-09-27** (`dc0f4d1`: `schemas.py`, 16 KB body limit) | — |
| ~~TD-15~~ | UX | ~~Dead buttons and fake Copy Link~~ — **resolved 2026-09-25**: Settings/Upgrade deleted with AppShell (`2375759`); Home auth buttons (`058d07a`); Landing Log in/Sign Up (`b1edc7f`); Save Roadmap/Mark as In Progress (`d8354b3`); Copy Link (`f76ff22`) | — |
| ~~TD-16~~ | Routing | ~~Links to non-existent `/login`, `/signup`, `/profile`, `/app/*`~~ (removed 2026-09-25); ~~no 404 route: an unknown URL rendered a blank page~~ — **resolved 2026-09-29** (`00ca5f1`: catch-all route → `NotFound`, ADR-017). A React error boundary (rest of F-12) is still missing | `App.jsx` |
| TD-17 | Testing | ~~Zero tests~~ Backend: 80 pytest tests (60 since 2026-09-27, 80 since 2026-09-28; `backend/tests`). Frontend: none. No CI | `frontend/` |
| TD-18 | CI/CD | No CI or Docker. ~~No deployment config~~ — `render.yaml` added 2026-09-27 (`e7b461f`), not deployed | — |
| ~~TD-19~~ | A11y | ~~Invalid nested interactive HTML: checkbox in `<button>`~~ — **resolved 2026-09-29** (`4c916c2`: the compare checkbox is a labelled sibling of the card); ~~`<a>` in `<button>`~~ fixed 2026-09-26 (`639da18`) | — |
| TD-20 | A11y | Modals lack dialog role, focus trap, Esc, labels | `CareerCompareModal.jsx`, `ShareModal.jsx` |
| TD-21 | AI | Salaries and resource URLs invented by the model, shown as fact (non-http(s) URLs dropped since 2026-09-27). QA 2026-09-28: of 13 URLs in one roadmap, 10 returned 200, 2 blocked automated checks (403), 1 was invented (a LinkedIn article that redirects to "article not found"). Recruiter review 2026-09-29: 3 of 13 broken in another roadmap (Django Girls 404, AWS training 404, an invented YouTube video ID); an Angular link redirects to archived v17 docs. Fix: ROADMAP P-7 | `prompts.py` |
| ~~TD-50~~ | Bug | **Resolved 2026-09-29** (`4c916c2`: checkbox in a `<label>` beside the card, never inside its button; verified by keyboard, click and label click, and end to end: a roadmap generated with two other careers ticked used the selected one). Was: ticking a compare checkbox also changes the **selected career**: the checkbox's click bubbles to the card `<button>` (`stopPropagation` is on `onChange`, not `onClick`), so "Generate roadmap" can silently use a different career. Found in QA 2026-09-28 | `Results.jsx` compare checkbox |
| ~~TD-51~~ | Bug | **Resolved 2026-09-29** (`bd30106`: `ScrollToTop` on every pathname change, plus explicit scroll-to-top after regenerating on the same route; verified at 360 px: Results at 1,393 px → dashboard at 0). Was: route changes didn't reset scroll: on a phone, "Generate roadmap" (bottom of Results) opens `/dashboard` scrolled ~976 px down, past the hero. No scroll-to-top on navigation. Found in QA 2026-09-28 | `App.jsx` |
| ~~TD-52~~ | Copy | **Resolved 2026-09-29** (`279c747`: `/home` shows the browser-saved roadmap with real progress or an accurate empty state; dashboard empty state says 5 questions; the Results PDF option says it saves career matches). Was: outdated copy since ADR-013/016: the dashboard empty state says "Take the 8-question quiz"; `/home` says roadmaps "aren't saved" and last "for the current session" and shows "No saved roadmaps yet" even when a roadmap is stored. Found in QA 2026-09-28 | `Dashboard.jsx:199`, `Home.jsx:59-60` |

## 🟡 Medium

| ID | Category | Issue | Location |
|---|---|---|---|
| ~~TD-22~~ | Dead code | ~~Unrouted/unused pages, components, helpers, data, `dashboard.css`, images, root `.vite/`~~ — **resolved 2026-09-25** (`2375759`, `e0c40f1`, `aaa8c6e`; untracked root `.vite/` deleted). Dead CSS rules for removed components may remain inside `index.css` (e.g. `.roadmapStats`) — see TD-34 | — |
| ~~TD-23~~ | Duplication | ~~Near-identical fetch blocks~~ — **resolved 2026-09-27** (`de7a1d2`: every request goes through `lib/api.js`) | — |
| TD-24 | Duplication | Roadmap % logic in two places (`dashboardData.js` is the displayed one; `scoringEngine.js` keeps the old count). Headers unified for `/home` + `/dashboard` via `AppHeader` (2026-09-26); Landing still has its own | `scoringEngine.js`, `Landing.jsx` |
| TD-25 | Architecture | Two competing theme mechanisms (was three; `DashboardLayout` deleted 2026-09-25); `ThemeGate` removes the page's `theme-landing` class | `ThemeGate.jsx`, `Landing.jsx`, `Home.jsx`, `Dashboard.jsx` |
| ~~TD-26~~ | Bug | ~~Tracking side effect inside `setAnswers` updater; one event per keystroke on text input~~ — **resolved 2026-09-28** (`9b97b5b`: tracking outside the updater, free text not tracked per keystroke) | — |
| TD-27 | Performance | `getTrackingData()` writes on every read; each track call parses and rewrites the whole blob; unbounded `events[]` | `trackingEngine.js:77-93,129-154` |
| TD-28 | Bug | `resumeQuality` (0–40) compared to `< 60` → unreachable | `scoringEngine.js:327-339` |
| TD-29 | Product | "Employability" and "Momentum" measure app engagement, not employability. **Mitigated 2026-09-26:** no longer shown on the dashboard; code remains (B-14) | `scoringEngine.js` |
| TD-30 | Bug | `CAREER_DETAILS` looked up by exact AI title → overview rarely shows | `Results.jsx:440` |
| TD-31 | Data | Pre-pivot non-tech careers (Nurse, Plumber, Police…) in data and icon mapping (`careers.js` deleted 2026-09-25) | `careerDetails.js`, `Results.jsx:63-146` |
| TD-32 | Performance/SEO | Landing hero starts `opacity: 0` and relies on JS animation (LCP, no-JS) | `Landing.jsx` |
| TD-33 | A11y | `prefers-reduced-motion` only in CSS for Home, video cards and the dashboard; framer-motion (Landing, Quiz, Results) ignores it; focus styles missing on some older screens; likely contrast failures on older screens | `index.css`, Landing, Results |
| TD-34 | Styling | ~4,400-line single CSS file; tokens on `:root` for newer screens but many colour literals elsewhere; duplicate selectors; copied Uiverse CSS; `Inter` not loaded | `index.css` |
| TD-35 | Quality | 12 ESLint errors, 0 warnings as of 2026-09-28 (was 17): 6 false positives from missing `jsx-uses-vars`, 6 real unused variables | `eslint.config.js` + various |
| TD-36 | Observability | Backend: structured logging with request IDs since 2026-09-27 (`request_log.py`). Still no error tracking or metrics; frontend `console.error` only | FE + BE |
| TD-37 | AI | No response caching (timeout, `GEMINI_MODEL` config and one retry added 2026-09-27) | `llm.py` |
| TD-38 | AI | Prompt references "location" but the quiz doesn't ask for it — **resolved for v2 prompts 2026-09-28**; the unchanged v1 prompt keeps it until v1 support is removed | `prompts.py` (v1) |
| TD-39 | Type safety | No TypeScript; field-name drift (`name` vs `title`, `salary_range` vs `salaryRange`) | FE |
| TD-40 | UX | "Try again" does `window.location.reload()`; PDF export uses `alert()` on error | `Results.jsx:367`, `ShareModal.jsx:33` |
| TD-53 | Quality | Results logs every aborted career request with `console.error` ("Error fetching careers: AbortError", on every Results load in dev) and its `finally` clears the loading state even for the aborted run. In dev, StrictMode's double effect makes 2 Gemini calls per Results load (the first is aborted in the browser but still reaches Gemini) | `Results.jsx` career effect |
| TD-54 | A11y | Focus is lost to `<body>` when a quiz question changes (the Continue button unmounts) and after regenerating the roadmap, so keyboard users restart from the top of the page | `Quiz.jsx`, `Dashboard.jsx` |
| TD-55 | A11y | The Landing "Roadmap Generator" card is focusable (`tabindex=0` from framer-motion `whileTap`) but has no role and ignores Enter/Space (click-only `onClick`). The Results career card has no `aria-pressed`/`aria-expanded`, and the compare checkbox has no accessible name | `Landing.jsx`, `Results.jsx` |
| TD-56 | Honesty | The compare modal shows a "Work environment: N/A" row for every career (no data source fills it) | `CareerCompareModal.jsx` |
| TD-59 | Styling | Recruiter review 2026-09-29: mixed typefaces (buttons and quiz hour choices render in a different font from body text; very heavy Results heading) (ROADMAP P-8) | `index.css` |
| TD-60 | UX | Recruiter review: three header variants (Landing: Log in/Sign up; Quiz and Results: no brand header; Home/Dashboard: `AppHeader`); a returning visitor on Landing has no link to their saved roadmap; Results "Back to home" goes to `/` while the header's Home is `/home` (P-9) | `Landing.jsx`, `Quiz.jsx`, `Results.jsx` |
| TD-61 | UX | Recruiter review: the vertically centred quiz card changes height per question, so Continue moves (y 496 → 531 → 532 → 485 → 580 px on desktop); Results cards overlap briefly while animating open (P-10) | `Quiz.jsx`, `Results.jsx` |
| TD-62 | UX/Copy | Recruiter review polish list (P-11): "Resume Feedback" vs "Resume Analyzer"; Share icon opens download/print; API error shown as small red text at the bottom of the dashboard rail, says "check your connection" and "Your current one is unchanged"; disabled "Generate roadmap" without a hint; "+1" skills can't be revealed; green check icons on undone tasks; first-visit dashboard shows streak 1, active days 1/14, 3 achievements, an out-of-order "Quick win" insight; no dashboard footer; Landing Resume icon larger than the others | various |
| TD-63 | Trust | Recruiter review: career matches not sorted by match % (90 / 85 / 88 observed); salaries (US$, full-time, even for internship goals), growth figures and match % shown without an "AI estimate" label or source (P-4, P-5; see TD-21) | `Results.jsx` |
| TD-64 | Security/Deps | `npm audit` (2026-09-30): 19 vulnerable packages among existing dependencies, none from `@supabase/supabase-js`: `jspdf` critical (via `html2pdf.js`, PDF export), `react-router` high (open-redirect/XSS advisories, mostly SSR/RSC paths this SPA doesn't use), `vite`/`rollup`/`postcss` high (dev/build tooling), `dompurify` moderate, others in lint tooling. Upgrade in a dedicated commit and re-run the QA flow | `frontend/package.json` |
| TD-65 | Auth | Supabase free-plan built-in email sender is rate-limited and for testing only: confirmation emails can be slow or blocked at volume. Needs custom SMTP before a public launch; Site URL / Redirect URLs must be set per environment (`docs/deployment.md`) | Supabase Dashboard |
| TD-66 | Auth UX | Landing shows Log in / Sign up for a moment before switching to "Your home" for a signed-in visitor (session loads asynchronously); the header hides its account control while loading instead | `Landing.jsx` |
| TD-41 | Privacy | Raw quiz answers (incl. the optional career-in-mind text) stored in the localStorage event log and in `pathwayai_roadmap` | `Quiz.jsx`, `trackingEngine.js`, `roadmapStore.js` |
| TD-67 | Security | `private.request_user_id()` copies `auth.uid()`'s logic because `pathwayai_api` can't call `auth.uid()` (ADR-019 amendment). If Supabase changes how `auth.uid()` reads the claims, the helper won't follow; re-run `supabase/tests/` after Supabase platform changes | `supabase/migrations/20261004014249_create_roadmaps.sql` |
| TD-68 | Testing | No automated frontend tests for Milestone 2 (account/local repositories, import banner): verified with throwaway Playwright scripts only. Add Vitest for `lib/roadmaps/*` and a Playwright suite (F-2) | `frontend/src/lib/roadmaps/` |
| TD-69 | Product | Signed-in users see only their current roadmap; archived roadmaps (after regenerate/import) are kept but not browsable; steps can't be edited (needs an `update` grant on `roadmap_steps` for the AI Coach, M4) | `accountRepository.js`, ADR-019 |
| TD-70 | Operations | Signed-in generation requires both the frontend Supabase variables and the API's `DATABASE_URL`; a half-configured deploy gives signed-in users an honest 503 on generate while guests work. Document/check both together at deploy time | `render.yaml`, `docs/deployment.md` |

## 🟢 Low

| ID | Category | Issue | Location |
|---|---|---|---|
| ~~TD-42~~ | Branding | ~~`<title>` "roadmap-ai"; Vite favicon~~ — **resolved 2026-09-29** (`1c9a3a4`: "PathwayAI" title, description, OG/Twitter tags, `favicon.svg`). Still no `og:image` (needs a live URL) | — |
| TD-43 | Docs | `frontend/README.md` is the default Vite template | `frontend/README.md` |
| TD-44 | Deps | `openai` in requirements but unused; two Python virtualenvs | `backend/requirements.txt`, `.venv`, `backend/.venv` |
| TD-45 | Quality | Unused vars (as of 2026-09-28: `endSession` in Results, `idx` in CareerCompareModal, `quizStartedEvents`/`key`/`progress` in scoringEngine, `e` in trackingEngine) | various |
| TD-46 | UX | `CareerCompareModal` returns `null` → exit animations never run | `CareerCompareModal.jsx:5` |
| TD-47 | Metrics | `totalScreensViewed` incremented on every event | `trackingEngine.js:145` |
| TD-48 | Perf | No route-level code splitting (main chunk 427 KB, 137 KB gzip, 2026-09-28) | `App.jsx` |
| TD-57 | UX | At 360 px the Results title wraps to 3 lines and the long AI explanation pushes the first career card below the fold | `Results.jsx`, `index.css` |
| TD-58 | Observability | `google_genai` logs a WARNING about automatic function calling on every Gemini request (noise in production logs); disable AFC in the request config | `llm.py` |
| ~~TD-49~~ | Dead file | ~~`App.css` intentionally empty~~ — **resolved 2026-09-25** (`aaa8c6e`) | — |
