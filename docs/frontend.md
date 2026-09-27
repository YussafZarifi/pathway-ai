# Frontend

`frontend/` — React 19 + Vite 7 SPA, plain JavaScript, plain CSS.

## Entry & routing
- `src/main.jsx` renders `<App/>` in `StrictMode` and imports `index.css` (the only stylesheet).
- `src/App.jsx` — `BrowserRouter` → `ThemeGate` → `Routes`:

| Route | Page | Status |
|---|---|---|
| `/` | `Landing` | ✅ Hero + 3 feature cards (2 say "Coming soon"); header and hero CTAs → `/quiz` |
| `/home` | `Home` | 🟡 Honest empty-state hub (since 2026-09-25): quiz CTA, "No saved roadmaps yet", planned-feature cards. Reachable only by URL. Becomes the signed-in dashboard after auth (ADR-010) |
| `/quiz` | `Quiz` | ✅ |
| `/results` | `Results` | ✅ Redirects to `/quiz` without `location.state.answers` |
| `/dashboard` | `Dashboard` | ✅/🟡 Redirects to `/quiz` without `location.state.career`; Resume and Chat tabs say "Coming soon" |
| `*` | — | ❌ No 404 route |

## Pages
- **Landing.jsx** — framer-motion staggered hero. Hero elements start at `opacity: 0` (JS-dependent visibility). Header has Log in and Sign up buttons (since 2026-09-26). Both open `AccountsSoonDialog`, which says accounts are coming soon and offers "Take the quiz"; no auth exists (F-7). The hero "Get Started" CTA goes to `/quiz`.
- **Home.jsx** — "Welcome to PathwayAI" hero with quiz CTA; "Your roadmaps" empty state explaining nothing is saved until accounts exist; "What you can do" with one real card (quiz, a `<button>`) and two non-interactive "Planned" cards (Resume Analyzer, AI Coach). Nav uses `NavLink`. No stats, activity or achievements are shown until real data exists. Visual polish pass 2026-09-26: own `.homePrimaryBtn` (gradient CTA), `.homeBadge` for "Planned" (the global `.comingSoonBadge` has conflicting definitions), no `resumeIcon`/`coachIcon` classes on cards (global rules with those names leak in); instead `homeFeatureIcon--roadmap/--resume/--coach` and `homeFeatureCard--resume/--coach` give the cards the Landing colours (pink, green, indigo) and tinted hover glows; every card floats on hover (6px lift, icon lift + 1.06 scale; disabled under reduced motion).
- **Quiz.jsx** — step state, `answers` object, progress bar, `AnimatePresence` transitions. Question types: `choice`, `slider` (custom visuals over an invisible native range input — accessible), `text`. Initializes sliders to `min`. Tracks `quiz_started`, `quiz_question_answered` (⚠ per keystroke for text, fired inside a state updater), `quiz_completed`, session start/end.
- **Results.jsx** (723 lines) — fetches careers on mount (AbortController), shows the letter loader, error state (Try again = full page reload), empty state, career cards (icon via a keyword `if` chain, match %, salary, growth, skills, expand for reason plus `CAREER_DETAILS` overview), compare mode (checkbox ⚠ nested inside button), "None of these", Generate roadmap → `/dashboard`. Three near-identical fetch blocks with a hard-coded `http://127.0.0.1:8000`.
- **Dashboard.jsx** — tabs (roadmap/resume/chat), readiness hero ring plus Employability, Momentum, Roadmap (⚠ wrong %) and optional Resume meters, top recommendation banner, `RoadmapTimeline`.

### Removed on 2026-09-25
Every page file is now routed. Deleted as unreachable: the `/app/*` shell (`DashboardLayout`, `DashboardHome`, `Coach`, `AppShell`, `Sidebar`, `Topbar`, `styles/dashboard.css`), the old `Roadmap.jsx`, the simulated `ResumeAnalyzer.jsx` (random score), `GeneratingLoader`, `lib/exportPdf.js`, `lib/matchCareers.js`, `data/careers.js`, `App.css` and three unused images in `public/assets/`. Reasons are in each commit message.

## Components
| Component | Used by | Notes |
|---|---|---|
| `ThemeGate` | App | Sets `theme-aurora` or `theme-landing` on body per route; conflicts with page-level effects |
| `RoadmapTimeline` | Dashboard | Expand/collapse, mark done via `trackProgress("roadmap_step_<index>")`; resource links nested inside a `<button>` |
| `RadialMeter` | Dashboard | SVG ring with gradient (`useId`), animated dashoffset |
| `CareerCompareModal` | Results | Returns `null` when closed (so exit animations never play); no dialog semantics or Esc handling |
| `AccountsSoonDialog` | Landing | Native `<dialog>` opened by the header Log in / Sign up buttons: "Accounts are coming soon", Close + "Take the quiz". Focus trap, Esc, backdrop click and focus return come from `showModal()`. Added 2026-09-26 |
| `ShareModal` | Results | "Save Your Results": PDF (lazy `html2pdf.js`, captures `.resultsPage`) and print only; `alert()` on error. Fake copy-link removed 2026-09-25 |

## State management
- Local `useState` per page. No context or store.
- Cross-page data goes through `navigate(path, { state })`.
- Persistent data goes through `lib/trackingEngine.js` (localStorage).

## lib/
- **trackingEngine.js** — `trackEvent`, `trackMetric`, `trackProgress` (`started|completed|skipped|incomplete`), getters, sessions, export/import/clear. Validates against `data/trackingSchema.js`. ⚠ `getTrackingData()` writes back on every read; the event array is unbounded.
- **scoringEngine.js** — `computeEmployabilityScore` (quiz 30, resume 40, roadmap 20, engagement 10), `computeCareerMomentumScore` (clarity 25, velocity 35, skill dev 20, consistency 20), `getCareerReadinessSummary` (average and recommendations). ⚠ Measures app engagement, not employability. The resume input (`resume_score` metric) is no longer written by any shipped code since the simulated analyzer was deleted, so that component is always 0 for real users. The roadmap % counts touched keys only.

## data/
- `questions.js` — the 8 quiz questions. **IDs are a contract** with prompts, tracking and scoring.
- `trackingSchema.js` — `EVENT_TYPES`, `METRIC_NAMES`, `EVENT_SCHEMA`, `validateEvent`.
- `careerDetails.js` — static details for 17 careers (includes non-tech roles left over from before the pivot). Looked up by exact AI title.

## Styling
- `src/index.css` (~3,760 lines): all pages. 8 `:root` variables; about 30 hex and 100+ `rgba` literals; 13 media queries; duplicated selectors; a copied Uiverse loader; `"Inter"` referenced but not loaded; no `prefers-reduced-motion`; few focus styles.

## Build & lint
- `npm run build` succeeds. Main chunk 413 KB (131 KB gzip); html2pdf split into a lazy 975 KB chunk.
- `npm run lint`: 17 errors, 1 warning (2026-09-25; was 21). Most are `motion` "unused" false positives (the config lacks eslint-plugin-react's `jsx-uses-vars`); the rest are real unused imports/vars (ROADMAP N-13).
