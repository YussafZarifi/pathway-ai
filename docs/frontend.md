# Frontend

`frontend/` — React 19 + Vite 7 SPA, plain JavaScript, plain CSS.

## Entry & routing
- `src/main.jsx` renders `<App/>` in `StrictMode` and imports `index.css` and `styles/dashboard.css`.
- `src/App.jsx` — `BrowserRouter` → `ThemeGate` → `Routes`:

| Route | Page | Status |
|---|---|---|
| `/` | `Landing` | ✅ Hero + 3 feature cards (2 say "Coming soon"); CTA → `/quiz` |
| `/home` | `Home` | 🟡 Reachable only by URL; **hard-coded fake stats and activity**; links to non-existent `/login`, `/signup`, `/profile` |
| `/quiz` | `Quiz` | ✅ |
| `/results` | `Results` | ✅ Redirects to `/quiz` without `location.state.answers` |
| `/dashboard` | `Dashboard` | ✅/🟡 Redirects to `/quiz` without `location.state.career`; Resume and Chat tabs say "Coming soon" |
| `*` | — | ❌ No 404 route |

## Pages
- **Landing.jsx** — framer-motion staggered hero. Hero elements start at `opacity: 0` (JS-dependent visibility). Log in / Sign Up buttons have no handlers.
- **Home.jsx** — "Welcome back, Explorer", Quick Access cards, "Your Progress" (fake: 3 / 85% / 12), "Recent Activity" (fake). Nav active state reads `window.location.pathname` directly.
- **Quiz.jsx** — step state, `answers` object, progress bar, `AnimatePresence` transitions. Question types: `choice`, `slider` (custom visuals over an invisible native range input — accessible), `text`. Initializes sliders to `min`. Tracks `quiz_started`, `quiz_question_answered` (⚠ per keystroke for text, fired inside a state updater), `quiz_completed`, session start/end.
- **Results.jsx** (723 lines) — fetches careers on mount (AbortController), shows the letter loader, error state (Try again = full page reload), empty state, career cards (icon via a keyword `if` chain, match %, salary, growth, skills, expand for reason plus `CAREER_DETAILS` overview), compare mode (checkbox ⚠ nested inside button), "None of these", Generate roadmap → `/dashboard`. Three near-identical fetch blocks with a hard-coded `http://127.0.0.1:8000`.
- **Dashboard.jsx** — tabs (roadmap/resume/chat), readiness hero ring plus Employability, Momentum, Roadmap (⚠ wrong %) and optional Resume meters, top recommendation banner, `RoadmapTimeline`.

### Unrouted / dead pages
`DashboardLayout.jsx` + `DashboardHome.jsx` + `Coach.jsx` (an `/app/*` shell design that was never wired up), `Roadmap.jsx` (an older roadmap view; renders `resource.title`, a mismatch), `ResumeAnalyzer.jsx` (**simulated: random 50–90 score, hard-coded issues**).

## Components
| Component | Used by | Notes |
|---|---|---|
| `ThemeGate` | App | Sets `theme-aurora` or `theme-landing` on body per route; conflicts with page-level effects |
| `RoadmapTimeline` | Dashboard | Expand/collapse, mark done via `trackProgress("roadmap_step_<index>")`; resource links nested inside a `<button>`; "Save Roadmap" and "Mark as In Progress" buttons do nothing |
| `RadialMeter` | Dashboard | SVG ring with gradient (`useId`), animated dashoffset |
| `CareerCompareModal` | Results | Returns `null` when closed (so exit animations never play); no dialog semantics or Esc handling |
| `ShareModal` | Results | PDF (lazy `html2pdf.js`, captures `.resultsPage`), print, fake copy-link, `alert()` on error |
| `AppShell`, `Sidebar`, `Topbar`, `GeneratingLoader` | — | Unused |

## State management
- Local `useState` per page. No context or store.
- Cross-page data goes through `navigate(path, { state })`.
- Persistent data goes through `lib/trackingEngine.js` (localStorage).

## lib/
- **trackingEngine.js** — `trackEvent`, `trackMetric`, `trackProgress` (`started|completed|skipped|incomplete`), getters, sessions, export/import/clear. Validates against `data/trackingSchema.js`. ⚠ `getTrackingData()` writes back on every read; the event array is unbounded.
- **scoringEngine.js** — `computeEmployabilityScore` (quiz 30, resume 40, roadmap 20, engagement 10), `computeCareerMomentumScore` (clarity 25, velocity 35, skill dev 20, consistency 20), `getCareerReadinessSummary` (average and recommendations). ⚠ Measures app engagement, not employability. The resume input only comes from the simulated analyzer. The roadmap % counts touched keys only.
- **exportPdf.js**, **matchCareers.js** — unused (matchCareers is a rule-based matcher left over from before the AI and tech-only pivot).

## data/
- `questions.js` — the 8 quiz questions. **IDs are a contract** with prompts, tracking and scoring.
- `trackingSchema.js` — `EVENT_TYPES`, `METRIC_NAMES`, `EVENT_SCHEMA`, `validateEvent`.
- `careerDetails.js` — static details for 17 careers (includes non-tech roles left over from before the pivot). Looked up by exact AI title.
- `careers.js` — 17 careers for `matchCareers` (unused).

## Styling
- `src/index.css` (~3,900 lines): all pages. 8 `:root` variables; about 30 hex and 100+ `rgba` literals; 13 media queries; duplicated selectors; a copied Uiverse loader; `"Inter"` referenced but not loaded; no `prefers-reduced-motion`; few focus styles.
- `src/styles/dashboard.css`: styles for the unused `/app/*` shell (only `.panel` is used).
- `App.css` intentionally empty.

## Build & lint
- `npm run build` succeeds. Main chunk 413 KB (131 KB gzip); html2pdf split into a lazy 975 KB chunk.
- `npm run lint`: 21 errors, 1 warning. About 8 `motion` "unused" errors are false positives (the config lacks eslint-plugin-react's `jsx-uses-vars`). The rest are real unused code plus one `react-hooks/purity` error in the dead `Roadmap.jsx`.
