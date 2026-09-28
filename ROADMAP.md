# ROADMAP.md — Living roadmap

> Update at the end of every coding session. Move items between sections, set dates when completed.
> **Priority:** P0 = blocker/critical · P1 = high · P2 = medium · P3 = nice-to-have
> **Effort:** XS < 1h · S 1–2h · M ~half day · L 1–3 days · XL multiple days
> **Recruiter impact:** ★★★ high · ★★ medium · ★ low

---

## ✅ Completed

| ID | Task | Date |
|---|---|---|
| C-1 | Quiz (8 questions: choice, slider, text) with animated transitions | pre-2026-09 |
| C-2 | `POST /api/ai/career` — 3 tech-only career matches via Gemini | pre-2026-09 |
| C-3 | `POST /api/ai/roadmap` — ≤5-step roadmap via Gemini | pre-2026-09 |
| C-4 | Results page: match badges, expand, compare modal, regenerate, "none of these" | pre-2026-09 |
| C-5 | Dashboard: roadmap timeline, mark done/undo, readiness/employability/momentum meters | pre-2026-09 |
| C-6 | Share modal: PDF download (lazy html2pdf) + print | pre-2026-09 |
| C-7 | localStorage tracking engine (events/metrics/progress) + scoring engine | pre-2026-09 |
| C-8 | Full repository audit + project documentation set | 2026-09-24 |
| C-9 | (was N-1) `git init` on `main` + root `.gitignore`; `backend/.env` verified ignored before the baseline commit | 2026-09-25 |
| C-10 | (was N-3) Removed simulated `ResumeAnalyzer`, the `/app/*` shell, legacy pages/helpers/data/images, `dashboard.css`, `App.css`, root `.vite/`; `/home` kept and rebuilt as an honest empty-state hub (ADR-010) | 2026-09-25 |
| C-11 | (was N-4) Removed dead buttons: Landing Log in/Sign Up, Save Roadmap, Mark as In Progress, fake Copy Link + account prompt (Settings/Upgrade went with the `/app/*` shell) | 2026-09-25 |
| C-14 | `/home` visual polish: Landing glow, gradient CTA/title, aligned header, left-aligned cards with Landing's per-feature icon colours (green Resume, indigo Coach) that float on hover, small "Planned" pills, AA-safe planned cards, reduced motion, fits at 360px | 2026-09-26 |
| C-23 | (was N-8) Reliable AI output: investigation (25 live calls: 0 malformed JSON, failures were Gemini's 20/day free-tier quota), JSON mode + `response_schema`, per-item Pydantic validation with defaults, one retry for unusable replies/5xx/timeouts, distinct 503 quota/busy messages, content-free per-attempt diagnostics with request IDs; first 60 backend tests. ADR-015 | 2026-09-27 |
| C-20 | (was N-5) Env-only config: backend `config.py` (`ALLOWED_ORIGINS` CORS, `GEMINI_MODEL`, timeouts, limits), frontend `VITE_API_URL` (build fails without it), `.env.example` on both sides, `GET /health`, Render Blueprint `render.yaml`. ADR-014 | 2026-09-27 |
| C-21 | (was N-6) `lib/api.js` is the only backend client: shared `request()` with timeout, `ApiError`, `errorMessage()`; the two hard-coded career fetches in `Results.jsx` moved into `requestCareers()` | 2026-09-27 |
| C-22 | (was N-9) Backend hardening: Pydantic request models + 16 KB body limit, in-memory rate limits (per IP per minute/day + global per day), generic error messages, no answers/prompts/AI output in logs, Gemini timeout; Quiz no longer logs answers, text answer capped at 300 chars | 2026-09-27 |
| C-19 | Final dashboard consistency pass: tokens on `:root`, dialogs on the app button system, one icon style in the rail, 3×2 achievement badges, no repeated "Up next" badges, centred finished-state focus card, gentler entrance animation. Dashboard considered complete; next: deployment | 2026-09-26 |
| C-18 | Dashboard polish + consistent videos: shared `VideoCard` for every step (stacked, placeholder for missing/failed thumbnails, search-card fallback, lazy thumbnails), de-duplicated hero count, no hover lift on non-interactive cards, single-column quick actions, aligned step headers, type-scale cleanup, focus actions disabled while regenerating, smaller ring on phones | 2026-09-26 |
| C-17 | Dashboard redesign: hero with progress ring, Today's focus, stat tiles, visual roadmap stepper, dated achievements, rule-based Insights, quick actions (regenerate with confirm + skeleton), empty state; shared `AppHeader` and `Dialog`; Employability/Momentum meters and fake resume banner removed from the UI; ~690 lines of dead CSS removed | 2026-09-26 |
| C-16 | (was N-7) Current roadmap persisted in localStorage (`lib/roadmapStore.js`), progress keys scoped per roadmap, % from roadmap length (TD-07/08/09). ADR-013 | 2026-09-26 |
| C-15 | Real YouTube videos per roadmap step: Gemini writes a search phrase, backend resolves it via the YouTube Data API (optional `YOUTUBE_API_KEY`, search-link fallback), Dashboard shows video cards; step card no longer a `<button>` (TD-19 timeline part). ADR-012 | 2026-09-26 |
| C-13 | Landing header: Log in / Sign up buttons open an accessible "Accounts are coming soon" dialog (native `<dialog>`: focus trap, Esc, focus return); no auth built (F-7 still planned) | 2026-09-26 |
| C-12 | (was N-2) Pushed full history to the **private** GitHub repo `YussafZarifi/pathway-ai`; `main` tracks `origin/main` (placeholder README commits from repo creation replaced with `--force-with-lease`) | 2026-09-25 |

## 🔄 In Progress

_Nothing in progress._

## 🎯 Next Sprint — Foundation (≈ 3–4 days total)

| ID | Task | Priority | Effort | Impact |
|---|---|---|---|---|
| N-16 | **Gemini quota:** the key is on the free tier (20 requests/day for `gemini-2.5-flash-lite` ≈ 10 quiz runs). Owner: enable billing (paid tier) + a budget alert, then set `GLOBAL_AI_LIMIT_PER_DAY` to match. Needed before sharing the live URL widely | P0 | XS | ★★★ |
| N-17 | Verify JSON mode + `response_schema` live on `gemini-2.5-flash-lite` once its daily quota resets (verified on `gemini-2.5-flash` 2026-09-27) | P1 | XS | ★ |
| N-10 | Fix `ThemeGate`/page theme conflict — single theme mechanism | P2 | S | ★ |
| N-11 | Fix per-keystroke tracking + side effect in state updater (`Quiz.jsx`) | P2 | XS | ★ |
| N-12 | Brand consistency: `<title>`, favicon, meta/OG tags, "PathwayAI" everywhere | P1 | XS | ★★ |
| N-13 | ESLint: add JSX-uses-vars (eslint-plugin-react) and fix real errors → 0 errors (12 left as of 2026-09-27) | P2 | S | ★★ |
| N-14 | Prune dead CSS left in `index.css` by deleted components (e.g. `.roadmapStats`, `.primaryBtn`, `.comingSoonBadge` defined three times) | P3 | S | ★ |
| N-15 | Link `/home` from Landing (the shared app header on `/home` and `/dashboard` links it since 2026-09-26) | P3 | XS | ★ |

## 🚀 Future Features — Production baseline & persistence (≈ 2–3 weeks)

| ID | Task | Priority | Effort | Impact |
|---|---|---|---|---|
| F-1 | Deploy to Render via `render.yaml` (API web service + static site), live URL in README. Ready since 2026-09-27; waiting for the owner's review. Steps in `docs/deployment.md` | P0 | S | ★★★ |
| F-17 | Make the GitHub repo public (owner decision) once README screenshots, env config and backend hardening are done | P1 | XS | ★★★ |
| F-2 | Tests: Vitest (tracking/scoring engines, components). Backend pytest exists since 2026-09-27 (60 tests) | P1 | L | ★★★ |
| F-3 | Playwright E2E: quiz → results → dashboard with mocked API | P1 | M | ★★★ |
| F-4 | GitHub Actions CI: lint, test, build (+ E2E) | P1 | S | ★★★ |
| F-5 | Dockerfiles + `docker-compose.yml` | P2 | M | ★★ |
| F-6 | Streaming roadmap generation (SSE) | P1 | L | ★★★ |
| F-7 | Auth (Supabase/Clerk or FastAPI JWT) | P1 | L | ★★★ |
| F-8 | PostgreSQL: users, quiz_sessions, roadmaps, roadmap_steps, progress_events (+ migrations) | P1 | L | ★★★ |
| F-9 | Design-system pass: tokens, type scale, one app shell, one button system, skeleton loaders | P1 | L | ★★ |
| F-10 | Accessibility: dialog semantics + focus trap + Esc, focus-visible, reduced motion, contrast, fix nested interactive HTML | P1 | M | ★★ |
| F-11 | Sentry (FE+BE) + structured JSON logging with request IDs | P2 | M | ★★ |
| F-12 | 404 route + React error boundary | P1 | XS | ★ |
| F-13 | Real resume analyzer: PDF upload → Gemini multimodal → structured critique vs target career | P1 | L | ★★★ |
| F-14 | Skill-gap analysis (resume skills vs career skills) feeding the roadmap | P2 | L | ★★★ |
| F-15 | Shareable public roadmap pages `/r/:slug` | P2 | M | ★★ |
| F-16 | TypeScript migration + API types generated from FastAPI OpenAPI | P2 | L | ★★ |

## 📦 Backlog

| ID | Task | Priority | Effort |
|---|---|---|---|
| B-1 | Quiz keyboard shortcuts (1–9, Enter, ←) + sessionStorage answer persistence | P2 | S |
| B-2 | Copy roadmap as Markdown | P3 | XS |
| B-3 | Validate AI URLs (https only), mark external | P1 | XS |
| B-4 | Toasts instead of `alert()` | P3 | XS |
| B-5 | Per-step notes and target dates | P2 | M |
| B-6 | Regenerate single step / adjust difficulty | P2 | M |
| B-7 | Weekly plan view | P2 | M |
| B-8 | Response caching keyed by answers hash | P2 | M |
| B-9 | Server-rendered PDF export (replace html2canvas screenshot) | P3 | M |
| B-10 | Product analytics (PostHog) replacing the custom event log for funnel metrics | P2 | M |
| B-11 | Location question + CAD/USD salaries | P2 | S |
| B-12 | Route-level code splitting (`React.lazy`) | P3 | S |
| B-13 | Render Landing hero without waiting for JS animation (LCP) | P2 | XS |
| B-14 | Rethink Employability/Momentum scores (measure engagement; hidden from the dashboard since 2026-09-26): delete or redesign `scoringEngine.js` | P2 | M |
| B-15 | Light theme + `prefers-color-scheme` | P3 | M |
| B-16 | Weekly digest / inactivity nudge emails (background job) | P3 | L |
| B-17 | Streaks + activity heatmap | P3 | M |
| B-19 | Real "AI insights": a Gemini endpoint that comments on the user's progress (the dashboard's Insights are rule-based today) | P3 | M |
| B-20 | Multiple saved roadmaps in localStorage (switch between careers) before accounts | P2 | M |
| B-18 | Prune or cap localStorage event log; stop write-on-read in `getTrackingData` | P2 | S |

## 🌟 Stretch Goals

| ID | Task | Effort | Impact |
|---|---|---|---|
| S-1 | AI coach chat with memory + tool calling (read/update roadmap, find resources) | XL | ★★★ |
| S-2 | RAG over a curated resource catalogue with link-health checks | XL | ★★★ |
| S-3 | Real job-market data (Job Bank / Adzuna): salaries, demand, skills by city | XL | ★★★ |
| S-4 | Prompt eval harness (golden profiles, schema/rule checks, LLM-as-judge) in CI | L | ★★★ |
| S-5 | Mock interview mode (text → voice) with rubric scoring | XL | ★★★ |
| S-6 | Embeddings-based career similarity | L | ★★ |
| S-7 | GitHub integration: infer skills, auto-complete steps | XL | ★★ |
| S-8 | EN/FR internationalization | L | ★★ |
| S-9 | Admin dashboard: prompt versions, token cost, latency, failure rate, funnel | XL | ★★ |
| S-10 | Feature flags + prompt A/B testing | L | ★★ |
| S-11 | OpenTelemetry tracing FE → API → LLM | L | ★★ |
| S-12 | Offline-capable PWA | L | ★ |
| S-13 | Mentor/cohort sharing with comments | XL | ★★ |
