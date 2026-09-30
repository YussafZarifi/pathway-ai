# ROADMAP.md — Living roadmap

> Sections: ✅ Completed · 🚀 Ready to Deploy · 🌱 Post-Launch Improvements · 🔮 Future Features · 📦 Backlog · 🌟 Stretch. Update at the end of every coding session. Move items between sections, set dates when completed.
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
| C-28 | Recruiter-style review of the running app (no code changes): findings ranked by recruiter impact → Post-Launch Improvements P-1–P-11 and TD-59–TD-62; session docs handoff | 2026-09-29 |
| C-27 | (was N-20, N-12, F-12's 404 part) Pre-deploy fix batch: compare and select are independent (TD-50, TD-19); scroll to top on navigation and after regenerate (TD-51); copy matches browser-saved roadmaps and the 5-question quiz (TD-52); branded 404 page; PathwayAI title, favicon, description, OG tags (TD-42). Full QA pass again (desktop, 360 px, keyboard; 5 live calls incl. one Gemini 503 recovered by the retry). ADR-017 | 2026-09-29 |
| C-26 | (was N-17, N-18) Pre-flight QA before deploy: live `gemini-2.5-flash-lite` check (7 calls, all first-attempt `ok strategy=direct`, v1 and v2 formats); manual pass on desktop, 360 px and keyboard through Landing → Quiz → Results → Dashboard → Regenerate; findings recorded as TD-50–TD-58 and N-20/N-21; deployment readiness report in SESSION.md | 2026-09-28 |
| C-25 | Docs brought in line with the code: README (dashboard, data flow, AI pipeline, structure), architecture, database, frontend, testing, deployment, debt, UI, recruiter notes | 2026-09-28 |
| C-24 | (also closes N-11) 5-question assessment (owner-approved): interests (up to 3), problem-solving style, experience, weekly time (4 large buttons), 12-month goal + optional career in mind; labelled-profile v2 prompts; API accepts v1 and v2 so saved roadmaps still regenerate; slider removed; tracking side effect fixed (TD-26); copy updated. ADR-016 | 2026-09-28 |
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

## 🚀 Ready to Deploy

**Status (2026-09-29): code-complete for an initial release.** The pre-flight, the 5 must-fix launch issues (C-27) and a full QA pass are done. Render config (`render.yaml`) is complete. Nothing is deployed and nothing is pushed. Remaining steps, in order:

| ID | Step | Who | Priority | Notes |
|---|---|---|---|---|
| D-1 | Push `main` to the **private** GitHub repo (46+ unpushed commits) | Owner approves | P0 | Render builds from GitHub. Run `git check-ignore backend/.env` first; never change repo visibility |
| D-2 | Choose the Render plan for `pathwayai-api` | Owner | P0 | Free sleeps (first request ~1 min); Starter is always on |
| D-3 | Deploy with the Blueprint (was F-1) | Claude, after D-1/D-2 | P0 | Steps in `docs/deployment.md`; set `GEMINI_API_KEY`, `ALLOWED_ORIGINS`, `VITE_API_URL` (+ `YOUTUBE_API_KEY` if D-5 is done) |
| D-4 | Verify production | Claude | P0 | `/health`, full flow Landing → Quiz → Results → Dashboard → Regenerate, 404 page, CORS, logs with request IDs, no console errors; add the live URL to README; then N-22 (`og:url` + `og:image`) |
| D-5 | `YOUTUBE_API_KEY` | Owner | P1, **before public launch** | Without it every step shows a "No video found yet" placeholder |
| D-6 | Gemini billing + budget alert; set `GLOBAL_AI_LIMIT_PER_DAY` to match (was N-16) | Owner | P0, **before sharing publicly** | Free tier = 20 requests/day ≈ 7–10 quiz runs; after that visitors see "usage limit" |

"Sharing publicly" (sending the URL to recruiters) should wait for D-5, D-6 and ideally P-1–P-6 below.

## 🌱 Post-Launch Improvements

### High priority — presentation & trust (from the 2026-09-29 recruiter review)
| ID | Task | Effort | Impact |
|---|---|---|---|
| P-1 | "Built by <owner>" footer with GitHub, LinkedIn and portfolio links on every page | XS | ★★★ |
| P-2 | About section: what PathwayAI is, why it exists, the tech stack and architecture, link to the repo | S | ★★★ |
| P-3 | Landing: "How PathwayAI works" (3 steps) and a dashboard preview screenshot; render the hero without waiting for JS (B-13) | M | ★★★ |
| P-4 | Sort career matches by match % (observed 90 / 85 / 88) | XS | ★★ |
| P-5 | Label salaries, growth and match % as AI estimates (salaries are US$, full-time); a short "how matches work" note (TD-21) | S | ★★★ |
| P-6 | Reduce / consolidate "Coming soon": header Log in / Sign up, 2 of 3 Landing cards, `/home` and dashboard "Soon" items (one honest "What's next" spot instead) | S | ★★★ |
| P-7 | Check AI resource links before showing them (3 of 13 broken in one review roadmap, incl. an invented YouTube video): server-side HEAD check or drop unverifiable links (TD-21, B-3). Added from the review evidence | M | ★★★ |

### Medium / low priority
| ID | Task | Priority | Effort |
|---|---|---|---|
| N-21 | Accessibility + quality batch: keyboard focus after quiz steps and regenerate (TD-54); keyboard-operable Landing card, `aria-pressed` on career cards (TD-55); quiet aborted requests (TD-53); Esc + focus for Compare and Share dialogs via the shared `Dialog` (TD-20); reduced-motion support with `MotionConfig reducedMotion="user"` (TD-33) | P1 | M |
| P-8 | Typography consistency: one font on buttons, hour choices and headings (buttons don't inherit the body font; heavy Results heading) (TD-59) | P2 | S |
| P-9 | Header consistency: brand header on Quiz and Results; a Landing link back to a saved roadmap for returning visitors (was N-15); Results "Back to home" target matches the header's Home (TD-60) | P2 | S |
| P-10 | Animation polish: the quiz card no longer jumps between questions (Continue moves); no card overlap while Results cards animate (TD-61) | P2 | S |
| P-11 | Remaining UI polish from the review (TD-62): naming (Resume Feedback vs Resume Analyzer, Share icon opens download/print), error message placement/wording, hint on the disabled "Generate roadmap", reveal "+1" skills, no check marks on undone tasks, first-visit dashboard stats/achievements/insights, compare "Work environment: N/A" (TD-56), mobile Results fold (TD-57), dashboard footer, Landing icon alignment | P2 | M |
| N-22 | `og:image` link-preview card (1200×630) + `og:url` once the live URL exists | P2 | XS |
| N-13 | ESLint: add jsx-uses-vars and fix real errors → 0 (12 left: 6 `motion` false positives, 6 real unused vars) | P2 | S |
| F-12 | React error boundary (the 404 route shipped in C-27) | P1 | XS |
| N-10 | Single theme mechanism (`ThemeGate` vs page effects) | P2 | S |
| N-14 | Prune dead CSS in `index.css` | P3 | S |
| N-19 | Remove v1 (8-question) answer support once no saved roadmap needs it (ADR-016) | P3 | XS |
| — | SDK AFC warning noise in logs (TD-58) | P3 | XS |

## 🔐 Milestone 1 — Supabase Auth + profiles (F-7, in progress since 2026-09-30)

Owner-approved (ADR-018). Built before the deploy. Rules: one small commit per step; the guest flow keeps working at every commit (with or without Supabase env vars); backend tests, lint baseline and the build pass after each commit; docs updated after each step.

| # | Step | Status |
|---|---|---|
| M1-1 | Accept ADR-018 with the owner's details; write this plan | ✅ 2026-09-30 |
| M1-2 | `profiles` table: Supabase CLI migration in `supabase/migrations/`, RLS (own row only), explicit grants, sign-up trigger; applied to the project; advisors clean | ✅ 2026-09-30 |
| M1-3 | Frontend Supabase client (`lib/supabase.js`, pinned `@supabase/supabase-js`, `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY`; auth switched off when unset) + `AuthProvider`; `render.yaml` gets the two variables | ✅ 2026-09-30 |
| M1-4 | `/login` page: sign in, sign up (email + password, optional name), "check your email" state + resend, mapped error copy, honest "accounts aren't available" state when auth is off | ✅ 2026-09-30 |
| M1-5 | Header account state + sign-out; Landing Log in / Sign up go to `/login` (the "coming soon" dialog stays only when auth is off) | ✅ 2026-09-30 |
| M1-6 | Backend: verify Supabase access tokens (ES256 via JWKS, PyJWT) + `GET /api/me`; AI routes stay open to guests; 20 tests (100 total); live JWKS check | ✅ 2026-09-30 |
| M1-7 | Config + docs: `.env.example`, `render.yaml`, `docs/deployment.md` (Supabase Site URL / redirect URLs), architecture, session handoff | ⏳ |

Milestone 2 (F-8): roadmap tables + RLS, save roadmaps for signed-in users, import the browser-saved roadmap on first sign-in.

## 🔮 Future Features

In the recommended order (see "Next Session" in `SESSION.md`):

| ID | Task | Priority | Effort | Impact |
|---|---|---|---|---|
| F-7 | **Supabase Authentication** (ADR-018, accepted 2026-09-30) — **in progress as Milestone 1**, see below | P1 | L | ★★★ |
| F-8 | **PostgreSQL** (Supabase Postgres): users, quiz_sessions, roadmaps, roadmap_steps, progress_events + migrations; migrate the browser-saved roadmap on first sign-in (`docs/database.md`) | P1 | L | ★★★ |
| F-13 | **Resume Analyzer**: PDF upload → Gemini multimodal → structured critique vs target career | P1 | L | ★★★ |
| F-18 | **AI Coach**: chat with memory and tool calling (read/update roadmap, find resources); was S-1 | P1 | XL | ★★★ |
| F-2 | Tests: Vitest (`api.js`, `roadmapStore.js`, `dashboardData.js`, tracking engine, Quiz). Backend pytest has 80 tests | P1 | L | ★★★ |
| F-3 | Playwright E2E: quiz → results → dashboard with mocked API | P1 | M | ★★★ |
| F-4 | GitHub Actions CI: lint, test, build (+ E2E) | P1 | S | ★★★ |
| F-17 | Make the GitHub repo public (owner decision) | P1 | XS | ★★★ |
| F-14 | Skill-gap analysis (resume skills vs career skills) feeding the roadmap | P2 | L | ★★★ |
| F-6 | Streaming roadmap generation (SSE) | P1 | L | ★★★ |
| F-9 | Design-system pass: tokens, type scale, one app shell, one button system | P1 | L | ★★ |
| F-10 | Accessibility audit (axe in CI), contrast | P1 | M | ★★ |
| F-11 | Sentry (FE+BE) | P2 | M | ★★ |
| F-15 | Shareable public roadmap pages `/r/:slug` | P2 | M | ★★ |
| F-5 | Dockerfiles + `docker-compose.yml` | P2 | M | ★★ |
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
