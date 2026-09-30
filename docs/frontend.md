# Frontend

`frontend/` — React 19 + Vite 7 SPA, plain JavaScript, plain CSS.

## Entry & routing
- `src/main.jsx` renders `<App/>` in `StrictMode` and imports `index.css` (the only stylesheet).
- `src/App.jsx` — `BrowserRouter` → `ThemeGate` → `Routes`:

| Route | Page | Status |
|---|---|---|
| `/` | `Landing` | ✅ Hero + 3 feature cards (2 say "Coming soon"); header and hero CTAs → `/quiz` |
| `/home` | `Home` | 🟡 Hub: quiz CTA, the browser-saved roadmap with real progress and "Open your dashboard" (or an accurate "No roadmap yet" empty state, since 2026-09-29), planned-feature cards. Linked from the shared `AppHeader` on `/home` and `/dashboard`, not from Landing (ROADMAP P-9, was N-15). Becomes the signed-in dashboard after auth (ADR-010) |
| `/quiz` | `Quiz` | ✅ |
| `/results` | `Results` | ✅ Redirects to `/quiz` without `location.state.answers` |
| `/dashboard` | `Dashboard` | ✅ Redesigned 2026-09-26. Loads the stored roadmap (`lib/roadmapStore.js`), falls back to router state, shows an empty state (not a redirect) when there's none |
| `*` | `NotFound` | ✅ Branded 404 (since 2026-09-29, ADR-017): shared header, "404", "Return home" (`/home`), "Take the quiz"; tab title "Page not found · PathwayAI" |

## Pages
- **Landing.jsx** — framer-motion staggered hero. Hero elements start at `opacity: 0` (JS-dependent visibility). Header has Log in and Sign up buttons. With accounts on (Supabase configured, since 2026-09-30) they open `/login` (Sign up on the create-account tab) and a signed-in visitor sees "Your home" instead; with accounts off both open `AccountsSoonDialog` ("coming soon", "Take the quiz") as before. The hero "Get Started" CTA goes to `/quiz`.
- **Home.jsx** — "Welcome to PathwayAI" hero with quiz CTA; "Your roadmap": the roadmap saved in this browser (career, steps done from `getStepStatuses`/`summarizeProgress`, one roadmap per browser) with "Open your dashboard", or a "No roadmap yet" empty state (since 2026-09-29); "What you can do" with one real card (quiz, a `<button>`) and two non-interactive "Planned" cards (Resume Analyzer, AI Coach). Nav uses `NavLink`. No stats, activity or achievements are shown until real data exists. Visual polish pass 2026-09-26: own `.homePrimaryBtn` (gradient CTA), `.homeBadge` for "Planned" (the global `.comingSoonBadge` has conflicting definitions), no `resumeIcon`/`coachIcon` classes on cards (global rules with those names leak in); instead `homeFeatureIcon--roadmap/--resume/--coach` and `homeFeatureCard--resume/--coach` give the cards the Landing colours (pink, green, indigo) and tinted hover glows; every card floats on hover (6px lift, icon lift + 1.06 scale; disabled under reduced motion).
- **Quiz.jsx** (5-question assessment since 2026-09-28, ADR-016) — step state, `answers` object, progress bar, `AnimatePresence` transitions. Question types: `choice` (single, radio look), `multi` (grid, up to `max`, other options disabled at the limit, live "n of 3 selected"), `buttons` (four large buttons with values, used for weekly hours), plus an optional `followUp` text field with suggestion chips (the "career in mind" field under Q5, sent only when non-empty). Every option has `aria-pressed`; each group is labelled by its question. The slider type was removed. Tracks `quiz_started`, `quiz_question_answered` (outside the state updater; the free-text field isn't tracked per keystroke), `quiz_completed`, session start/end.
- **Results.jsx** (~700 lines) — fetches careers on mount through `requestCareers` (`lib/api.js`, AbortController), shows the letter loader, error state (Try again = full page reload, TD-40), empty state, career cards (icon via a keyword `if` chain, match %, salary, growth, skills, expand for reason plus `CAREER_DETAILS` overview), compare mode (a labelled checkbox in a `.careerRow` beside each card, never inside the card button, so comparing never changes the selection; up to 3; toggle "Compare Careers"/"Done comparing" with `aria-pressed`; since 2026-09-29), "None of these", regenerate suggestions, Generate roadmap (`requestRoadmap`) → `saveCurrentRoadmap` → `/dashboard`.
- **Dashboard.jsx** (redesigned 2026-09-26) — composes `components/dashboard/*` from `lib/dashboardData.js` derivations: `DashboardHero` (career, AI match %, progress ring, next milestone, time left, skills), `TodayFocus` (one task + first video, mark done / open step), four `StatTile`s (steps bar, learning materials, day streak, 14-day active days), `RoadmapStepper` (done/current/upcoming nodes, expandable details with tasks, videos, resources), and a rail with `AchievementGrid`, `InsightsPanel`, `QuickActions` (regenerate via `lib/api.js` with confirm dialog + skeleton, retake quiz, Resume/Coach "coming soon" dialogs). Marking a step done calls `trackProgress("roadmap_step_<roadmapId>_<i>")` and emits `roadmap_step_completed`. No tabs, no Employability/Momentum meters.
- **Login.jsx** (`/login`, since 2026-09-30, ADR-018) — email + password via `lib/supabase.js`: "Sign in" / "Create account" toggle (`aria-pressed`; `location.state.mode === "signup"` opens sign-up), optional name (sent as `display_name` sign-up metadata → `profiles`), password ≥ 8 characters, Supabase error codes mapped to fixed copy (raw errors never shown). Sign-up with email confirmation shows "Check your email" + resend (`emailRedirectTo` = `<origin>/home`); `email_not_confirmed` on sign-in offers a resend. Success → `location.state.from` or `/home`. Other states: already signed in, and "Accounts aren't available here" when auth is off. Guests get "Take the quiz as a guest".

### Removed on 2026-09-25
Every page file is now routed. Deleted as unreachable: the `/app/*` shell (`DashboardLayout`, `DashboardHome`, `Coach`, `AppShell`, `Sidebar`, `Topbar`, `styles/dashboard.css`), the old `Roadmap.jsx`, the simulated `ResumeAnalyzer.jsx` (random score), `GeneratingLoader`, `lib/exportPdf.js`, `lib/matchCareers.js`, `data/careers.js`, `App.css` and three unused images in `public/assets/`. Reasons are in each commit message.

## Components
| Component | Used by | Notes |
|---|---|---|
| `ThemeGate` | App | Sets `theme-aurora` or `theme-landing` on body per route; conflicts with page-level effects |
| `dashboard/RoadmapStepper` | Dashboard | Replaced `RoadmapTimeline` (deleted 2026-09-26). Node button = mark done (`aria-pressed`), header button = expand (`aria-expanded`), details outside any button |
| `dashboard/*` others | Dashboard | `DashboardHero`, `TodayFocus`, `StatTile` (+ `StepsBar`, `ActivityBars`), `AchievementGrid`, `InsightsPanel`, `QuickActions`: presentational, props only |
| `VideoCard` | Dashboard (stepper, Today's focus) | The only YouTube preview card: thumbnail (lazy, `onError` → placeholder), title, channel, play icon; with no video it renders a "Search YouTube for this step" card. Link name "Watch <title> by <channel> on YouTube (opens in a new tab)". Added 2026-09-26 |
| `AppHeader` | Home, Dashboard, NotFound | Shared sticky header, nav Home / Dashboard / Quiz |
| `ScrollToTop` | App (inside `BrowserRouter`) | Scrolls to the top before paint on every pathname change (ADR-017). Same-route actions (regenerate) scroll themselves |
| `Dialog` | Landing, Dashboard | Native `<dialog>` modal (`showModal`), used by `AccountsSoonDialog` and the dashboard's confirm / coming-soon dialogs |
| `RadialMeter` | Dashboard | SVG ring with gradient (`useId`), animated dashoffset; optional `ariaLabel` (role="img") |
| `CareerCompareModal` | Results | Returns `null` when closed (so exit animations never play); no dialog semantics or Esc handling |
| `AccountsSoonDialog` | Landing | Native `<dialog>` opened by the header Log in / Sign up buttons: "Accounts are coming soon", Close + "Take the quiz". Focus trap, Esc, backdrop click and focus return come from `showModal()`. Added 2026-09-26 |
| `ShareModal` | Results | "Save Your Results": PDF (lazy `html2pdf.js`, captures `.resultsPage`) and print only; `alert()` on error. Fake copy-link removed 2026-09-25 |

## State management
- Local `useState` per page. No context or store.
- Quiz answers go to Results through `navigate(path, { state })`; Results also passes a fallback copy of the roadmap to the Dashboard.
- The current roadmap is persisted by `lib/roadmapStore.js` (`pathwayai_roadmap`); events, metrics and step progress by `lib/trackingEngine.js` (`pathwayai_tracking`). See `docs/database.md`.

## lib/
- **api.js** — the only backend client (since 2026-09-27). `request()` adds the `VITE_API_URL` base (no fallback; `vite build` fails without it), a 90 s timeout (Gemini + YouTube + Render free-plan wake-up), caller `signal` support, and throws `ApiError(message, status)`. Exports `requestCareers`, `requestRoadmap` (normalizes steps) and `errorMessage(error, fallback)`: 4xx/timeout/network errors show the specific message (e.g. rate limit), other failures the page's own copy.
- **roadmapStore.js** — `saveCurrentRoadmap`, `loadCurrentRoadmap`, `stepProgressKey(roadmapId, index)` (ADR-013).
- **dashboardData.js** — pure derivations for the dashboard (progress, next milestone, time left from the AI's estimates, streak, achievements, insights).
- **supabase.js** — the single Supabase client (since 2026-09-30, ADR-018), built from `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY`. Either missing → `supabase = null`, `authEnabled = false`: no account UI, guest flow unchanged.
- **authContext.js** — `AuthContext` + `useAuth()` → `{ enabled, loading, session, user }`; filled by `components/AuthProvider.jsx` (wraps the router in `App.jsx`; `getSession()` + `onAuthStateChange`).
- **trackingEngine.js** — `trackEvent`, `trackMetric`, `trackProgress` (`started|completed|skipped|incomplete`), getters, sessions, export/import/clear. Validates against `data/trackingSchema.js`. ⚠ `getTrackingData()` writes back on every read; the event array is unbounded.
- **scoringEngine.js** — `computeEmployabilityScore` (quiz 30, resume 40, roadmap 20, engagement 10), `computeCareerMomentumScore` (clarity 25, velocity 35, skill dev 20, consistency 20), `getCareerReadinessSummary` (average and recommendations). ⚠ Measures app engagement, not employability. The resume input (`resume_score` metric) is no longer written by any shipped code since the simulated analyzer was deleted, so that component is always 0 for real users. The roadmap % counts touched keys only. None of these scores are displayed since 2026-09-26 (B-14).

## data/
- `questions.js` — the 5 quiz questions (`interests`, `problem_style`, `experience`, `weekly_hours`, `goal` + optional `career_in_mind`). **IDs are a contract** with `backend/schemas.py` (v2) and `backend/prompts.py`.
- `trackingSchema.js` — `EVENT_TYPES`, `METRIC_NAMES`, `EVENT_SCHEMA`, `validateEvent`.
- `careerDetails.js` — static details for 17 careers (includes non-tech roles left over from before the pivot). Looked up by exact AI title.

## Styling
- `src/index.css` (~4,400 lines): all pages. Design tokens on `:root` for the dashboard/home work (2026-09-26), but many raw hex and `rgba` literals remain elsewhere; duplicated selectors (e.g. `.comingSoonBadge`); a copied Uiverse loader; `"Inter"` referenced but not loaded. `:focus-visible` styles exist for the quiz options, Home, dialogs, video cards and the dashboard. `prefers-reduced-motion` rules cover only Home, video cards and the dashboard's CSS animations; framer-motion animations (Landing, Quiz, Results) ignore it because there is no `MotionConfig reducedMotion="user"` (TD-33, TD-34).

## Build & lint
- `npm run build` succeeds (needs `VITE_API_URL`). Main chunk 427 KB (137 KB gzip); html2pdf split into a lazy 975 KB chunk (Vite's >500 KB warning refers to that lazy chunk).
- `npm run lint`: 12 errors, 0 warnings (2026-09-28). 6 are `motion` "unused" false positives (the config lacks eslint-plugin-react's `jsx-uses-vars`); 6 are real unused variables (ROADMAP N-13).
