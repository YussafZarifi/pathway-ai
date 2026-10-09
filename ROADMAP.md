# ROADMAP.md — Living roadmap

> Sections: ✅ Completed · 🎯 Version 2 (current focus) · 🔐 Milestone 1 · 🗄️ Milestone 2 · 📄 Milestone 3 · ⏸️ Deployment (postponed) · 🌱 Post-Launch Improvements · 🔮 Future Features · 📦 Backlog · 🌟 Stretch. Update at the end of every coding session. Move items between sections, set dates when completed.
> **Current focus (owner, 2026-10-01): Version 2 = Milestones 1–4.** Deployment is postponed until Version 2 is complete; every commit must still keep the project deployable (CLAUDE.md §11).
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
| C-30 | (F-8, Milestone 2, ADR-019) Roadmaps in PostgreSQL for signed-in users: migrations `create_roadmaps` + `create_step_progress` (`quiz_submissions`, `roadmaps`, `roadmap_steps`, `step_progress`; one shared RLS policy per operation on `private.request_user_id()`; least-privilege `pathwayai_api` role logging in through the transaction pooler); FastAPI `db.py` + `repositories/roadmaps.py` + `routers/roadmaps.py` (`POST /api/roadmaps`, `/{id}/regenerate`, `/import`); frontend `lib/roadmaps/` (local/account repositories, `useCurrentRoadmap`, `useLocalImport`) + `ImportRoadmapBanner`. 62 new backend tests (162), 53 SQL + 18 pooled-connection checks, Playwright QA (guest, account, import, 360 px, keyboard, accounts off). Guests unchanged | 2026-10-03 |
| C-29 | (F-7, Milestone 1) Supabase accounts, optional per environment: ADR-018 accepted; `profiles` table (RLS, explicit grants, sign-up trigger in a private schema; CLI migration in `supabase/migrations/`, advisors clean); `lib/supabase.js` + `AuthProvider`; `/login` (email + password, confirmation + resend); header sign-in/out; Landing Log in / Sign up → `/login`; FastAPI `auth.py` verifies ES256 tokens via JWKS, `GET /api/me`; 20 new tests (100). Guest flow unchanged; auth-off build keeps the coming-soon dialog | 2026-09-30 |
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

## 🎯 Version 2 — current focus (owner decision, 2026-10-01)

Version 2 = Milestones 1–4, built and verified locally **before** any deployment. Order is fixed:

| Milestone | Scope | Status |
|---|---|---|
| **M1** Accounts + profiles (F-7, ADR-018) | Supabase email + password, `profiles` with RLS, token check in FastAPI | ✅ Complete 2026-10-01 (verified with a real account, M1-8) |
| **M2** Roadmaps in PostgreSQL (F-8, ADR-019) | FastAPI writes AI content (`quiz_submissions`, `roadmaps`, `roadmap_steps`) as the `pathwayai_api` role; the browser reads its own rows and writes `step_progress` through RLS; guest import with a confirmation banner; guests keep localStorage | ✅ **Complete 2026-10-03** (M2-1 → M2-11, ADR-019); owner's real-account cross-device check pending Steps: 🗄️ Milestone 2 below |
| **M3** Resume Analyzer (F-13) | PDF upload → Gemini → structured critique against the target career; real output only | ✅ **Complete 2026-10-07** (M3-1 → M3-6; off by default until Gemini billing) — ADR-020 accepted (M3-1, 2026-10-05); `resume_analyses` table (M3-2), AI layer `resume_ai.py` (M3-3), endpoint `POST /api/resume-analyses` (M3-4), all 2026-10-05; `/resume` page + availability endpoint (M3-5) and QA (M3-6), 2026-10-07. Steps: 📄 Milestone 3 |
| **M4** AI Coach (F-18) | Chat grounded in the user's roadmap, progress and résumé gaps; history; suggested actions the user confirms (ADR-021: no tool writes) | ✅ **Complete 2026-10-07** (M4-1 → M4-4, ADR-021). Steps: 🤖 Milestone 4 |

Rules for every Version 2 commit (keep it deployable): backend tests pass; lint at or below baseline; `npm run build` passes; guest flow works with Supabase variables unset and set; new env vars land in `.env.example`, `render.yaml` and `docs/deployment.md` in the same commit; schema changes are migrations in `supabase/migrations/` with advisors clean. Each milestone gets its own step table (like Milestone 1 below) written and approved before coding starts.

## ⏸️ Deployment — postponed until Version 2 is complete

**Status (2026-10-01):** the code has been deployable since 2026-09-29 and `render.yaml` stays current, but the owner has postponed the deploy until Version 2 (M1–M4) is finished. Don't recommend these steps before then unless the owner asks. Parked steps, in order, for when Version 2 is done:

| ID | Step | Who | Priority | Notes |
|---|---|---|---|---|
| D-1 | Push `main` to the **private** GitHub repo (54 unpushed commits on 2026-10-01) | Owner approves | P0 | Render builds from GitHub. Run `git check-ignore backend/.env` first; never change repo visibility |
| D-2 | Choose the Render plan for `pathwayai-api` | Owner | P0 | Free sleeps (first request ~1 min); Starter is always on |
| D-3 | Deploy with the Blueprint (was F-1) | Claude, after D-1/D-2 | P0 | Steps in `docs/deployment.md`; set `GEMINI_API_KEY`, `ALLOWED_ORIGINS`, `VITE_API_URL`, the Supabase variables and any added by Milestones 2–4 (+ `YOUTUBE_API_KEY` if D-5 is done); add the live domain to Supabase's URL Configuration |
| D-4 | Verify production | Claude | P0 | `/health`, full flow Landing → Quiz → Results → Dashboard → Regenerate, 404 page, CORS, logs with request IDs, no console errors; add the live URL to README; then N-22 (`og:url` + `og:image`) |
| D-5 | `YOUTUBE_API_KEY` | Owner | P1, **before public launch** | Without it every step shows a "No video found yet" placeholder |
| D-6 | Gemini billing + budget alert; set `GLOBAL_AI_LIMIT_PER_DAY` to match (was N-16) | Owner | P0, **before sharing publicly** | Free tier = 20 requests/day ≈ 7–10 quiz runs; after that visitors see "usage limit" |

"Sharing publicly" (sending the URL to recruiters) should wait for D-5, D-6, custom SMTP (TD-65) and ideally P-1–P-6 below.

## 🌱 Post-Launch Improvements

### High priority — presentation & trust (from the 2026-09-29 recruiter review)
| ID | Task | Effort | Impact |
|---|---|---|---|
| ~~P-1~~ | ✅ 2026-10-08: shared footer on every page — "Built by Yussaf Zarifi", GitHub, About (LinkedIn/portfolio links can be added when the owner has them) | XS | ★★★ |
| ~~P-2~~ | ✅ 2026-10-08: About section on Landing (`/#about`): what it is, why, the stack and architecture, honesty and privacy principles (repo link once it's public, F-17) | S | ★★★ |
| ~~P-3~~ | ✅ 2026-10-08: "How PathwayAI works" (3 steps); the hero renders without waiting for its animation (B-13). A dashboard screenshot is left for when the live site exists (N-22) | M | ★★★ |
| ~~P-4~~ | ✅ 2026-10-08: career matches sorted by match % on the server (`parse_careers`) | XS | ★★ |
| ~~P-5~~ | ✅ 2026-10-08: Results says matches are sorted and that match %, salaries (US dollars, full-time) and growth are AI estimates, not measurements | S | ★★★ |
| ~~P-6~~ | ✅ 2026-10-08: no "Coming soon" left — the Resume Analyzer and AI Coach are real; Landing's cards are real buttons ("With a free account" / "Needs an account" when accounts are off) | S | ★★★ |
| ~~P-7~~ | ✅ 2026-10-08: AI resource links are checked before a roadmap is shown (`link_check.py`, one HEAD each, SSRF-safe: public HTTPS only, vetted at connect time, redirects re-checked); clearly broken links (404/410, no such host, non-HTTPS) are dropped, inconclusive ones kept. Also closes B-3 (https only) | M | ★★★ |

### Medium / low priority
| ID | Task | Priority | Effort |
|---|---|---|---|
| ~~N-21~~ | ✅ 2026-10-08: keyboard focus moves to the new question after Continue/Back and to the roadmap title after regenerating (TD-54); career cards expose `aria-pressed`/`aria-expanded` and Landing's cards are buttons (TD-55); aborted requests are no longer logged as errors (TD-53); Compare and Share use the shared native dialog (Esc, focus trap and return; TD-20); `MotionConfig reducedMotion="user"` app-wide (TD-33). Also: no "Work environment: N/A" row (TD-56), no `alert()` (B-4) | P1 | M |
| ~~P-8~~ | ✅ 2026-10-08: form controls inherit the page font; Results heading 36 px / 700 (TD-59) | P2 | S |
| ~~P-9~~ | ✅ 2026-10-08: shared `AppHeader` on Quiz and Results; Results "Back to home" → `/home`; Landing's header already links returning visitors to their roadmap (TD-60) | P2 | S |
| ~~P-10~~ | ✅ 2026-10-08: quiz card anchored under the header with a minimum height — Continue stays at the same y on all 5 questions at 1280 px (was 485–580) (TD-61) | P2 | S |
| ~~P-11~~ | ✅ 2026-10-08: download icon for Download/print; regenerate error shown as a banner above the roadmap with clearer wording; hint under a disabled "Generate roadmap"; "+N more" skills revealed when a card expands; neutral bullets for undone tasks; "Quick win" only names the next step (never out of order); phone Results fold (TD-57); fixed: at ≤420 px the header nav was empty (icons and labels both hidden) | P2 | M |
| N-22 | `og:image` link-preview card (1200×630) + `og:url` once the live URL exists | P2 | XS |
| ~~N-13~~ | ✅ 2026-10-07: ESLint at 0 errors (real unused vars fixed; `motion` allowed by name) | P2 | S |
| ~~F-12~~ | ✅ 2026-10-08: React error boundary around the routes (reset on navigation; logs only the error's name) | P1 | XS |
| ~~N-10~~ | ✅ 2026-10-08: one theme mechanism — `theme-landing` on `<body>` in `index.html`; `ThemeGate` and ten per-page effects deleted (pixel-identical) | P2 | S |
| ~~N-14~~ | ✅ 2026-10-08: dead CSS pruned — 111 selectors for classes no source file uses (deleted analyzer, `/app` shell, old roadmap page, old modal markup) and 3 unused keyframes; `index.css` 5,970 → 5,204 lines; 20 page screenshots (2 widths) byte-identical before and after | P3 | S |
| N-19 | Remove v1 (8-question) answer support once no saved roadmap needs it (ADR-016) | P3 | XS |
| — | SDK AFC warning noise in logs (TD-58) | P3 | XS |

## 🔐 Milestone 1 — Supabase Auth + profiles (F-7) — ✅ complete 2026-10-01 (code 2026-09-30, verified with a real account 2026-10-01)

Owner-approved (ADR-018). Built before the deploy. Rules: one small commit per step; the guest flow keeps working at every commit (with or without Supabase env vars); backend tests, lint baseline and the build pass after each commit; docs updated after each step.

| # | Step | Status |
|---|---|---|
| M1-1 | Accept ADR-018 with the owner's details; write this plan | ✅ 2026-09-30 |
| M1-2 | `profiles` table: Supabase CLI migration in `supabase/migrations/`, RLS (own row only), explicit grants, sign-up trigger; applied to the project; advisors clean | ✅ 2026-09-30 |
| M1-3 | Frontend Supabase client (`lib/supabase.js`, pinned `@supabase/supabase-js`, `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY`; auth switched off when unset) + `AuthProvider`; `render.yaml` gets the two variables | ✅ 2026-09-30 |
| M1-4 | `/login` page: sign in, sign up (email + password, optional name), "check your email" state + resend, mapped error copy, honest "accounts aren't available" state when auth is off | ✅ 2026-09-30 |
| M1-5 | Header account state + sign-out; Landing Log in / Sign up go to `/login` (the "coming soon" dialog stays only when auth is off) | ✅ 2026-09-30 |
| M1-6 | Backend: verify Supabase access tokens (ES256 via JWKS, PyJWT) + `GET /api/me`; AI routes stay open to guests; 20 tests (100 total); live JWKS check | ✅ 2026-09-30 |
| M1-7 | Config + docs: `.env.example`, `render.yaml`, `docs/deployment.md` (Supabase Site URL / redirect URLs), architecture, README, session handoff | ✅ 2026-09-30 |
| M1-8 | **Owner:** set Site URL / Redirect URLs in Supabase, then a real sign-up with your own inbox (confirm → signed in → sign out → sign in); Claude then checks the `profiles` row and `/api/me` with a real token | ✅ 2026-10-01: real sign-up, confirmation and sign-in by the owner; `GET /api/me` with the owner's real ES256 token → 200 with matching id + email; the same token tampered (signature, `sub`, `exp`, `aud`, `alg: none`) → 401 |

## 🗄️ Milestone 2 — Roadmaps in PostgreSQL (F-8) — ✅ complete 2026-10-03 (design accepted 2026-10-02)

Owner-approved design: ADR-019. Rules: one small commit per step; after every commit backend tests pass, lint stays at or below its baseline, `npm run build` passes, and the guest flow works with the Supabase variables unset **and** set; new env vars go into the `.env.example` files, `render.yaml` and `docs/deployment.md` in the same commit; every schema change is a migration in `supabase/migrations/`, applied to the project, with the security and performance advisors clean. `docs/database.md` and `docs/api.md` are updated in the step that builds what they describe, not before.

| # | Step | Acceptance criteria | Status |
|---|---|---|---|
| M2-1 | ADR-019 (accepted design) + this table | Owner reviews and approves; docs only, no code, no migrations | ✅ 2026-10-02 (approved by the owner) |
| M2-2 | Migration: `quiz_submissions`, `roadmaps`, `roadmap_steps`, role `pathwayai_api` (no password yet), one shared RLS policy per operation, explicit grants | Applied and saved in `supabase/migrations/`; advisors clean. Rolled-back checks saved in `supabase/tests/`: user A sees none of B's rows; `authenticated` can't insert/update `roadmaps` or `roadmap_steps` and can't read `quiz_submissions` at all; `anon` gets nothing; `pathwayai_api` with A's claims can't read or write B's rows; a second `active` roadmap for the same user is rejected; a step can't reference another user's roadmap; `pathwayai_api` can't call `auth.uid()` (finding → ADR-019 amendment: policies use `private.request_user_id()`) | ✅ 2026-10-03: migration `20261004014249_create_roadmaps` applied; 31/31 checks in `supabase/tests/m2_2_roadmaps_rls.sql` pass on the live schema; advisors: no findings for the new tables (only the existing leaked-password-protection Auth warning and INFO "unused index" on the empty tables) |
| M2-3 | Migration: `step_progress` | A can mark and unmark own steps; can't add progress for B's step even with B's or own `user_id` (composite foreign key); deleting a roadmap removes its steps and progress; advisors clean | ✅ 2026-10-03: migration `20261004014958_create_step_progress`; 22/22 checks in `supabase/tests/m2_3_step_progress_rls.sql` + 31/31 M2-2 checks pass on the live schema (the M2-2 "no claims" check was fixed: it passed without testing anything); browser can't backdate `completed_at`; advisors: nothing new |
| M2-4 | **Owner:** set the `pathwayai_api` password in the Supabase dashboard; put `DATABASE_URL` (transaction pooler) in `backend/.env` | Claude confirms a connection as `pathwayai_api` and that RLS applies (no rows without claims, own rows with them) | ✅ 2026-10-03: login enabled with a SCRAM hash (no plain password in the DDL logs); `DATABASE_URL` (transaction pooler, `pathwayai_api.<ref>`, port 6543, SSL) in `backend/.env` only; 18/18 pooled-connection checks (`supabase/tests/m2_4_api_role_connection.py`); 53/53 SQL checks; advisors clean apart from the existing Auth warning. `DATABASE_URL` joins `.env.example`, `render.yaml` and `docs/deployment.md` in M2-5, when the app first reads it |
| M2-5 | Backend foundation: `db.py` (lazy pool, `transaction(user)` setting `request.jwt.claims`), `repositories/roadmaps.py` (Protocol + Postgres + in-memory fake), `DATABASE_URL` in config, pinned `psycopg` + `psycopg_pool` in `requirements.txt`, `.env.example`, `render.yaml`, `docs/deployment.md` | App starts and `/health` is ok without `DATABASE_URL`; repository tests with the fake; one live read-only smoke check; no network in tests | ✅ 2026-10-03: `db.py`, `repositories/roadmaps.py` (Protocol, Postgres, in-memory), `DATABASE_URL`/`DB_POOL_MAX` config, pinned psycopg 3.3.6 + psycopg-pool 3.3.3, `.env.example`, `render.yaml`, `docs/deployment.md`; app + `/health` work without `DATABASE_URL` (test); 118 tests; live read-only smoke check through the pooler (role `pathwayai_api`, claims per transaction) | |
| M2-6 | `POST /api/roadmaps` + `POST /api/roadmaps/{id}/regenerate` (`routers/roadmaps.py`; generation shared with the guest endpoint, DB transaction only after generation) | 401 without a token; 503 when not configured; 201 with step ids; the previous active roadmap is archived in the same transaction; another user's id → 404; rate limited; generation ok + save failure → 503; guest `/api/ai/roadmap` tests unchanged; `docs/api.md` updated | ✅ 2026-10-03: `generation.py` (shared), `routers/roadmaps.py`; 18 endpoint tests (136 total: 401/503/404/409/422/429, save-failure 503 after generation, archive, stored answers used, guest route unchanged); live repository check against Postgres (create, archive, get_source scoped, regenerate reuses submission, 6 concurrent saves → 1 active via per-user advisory lock); `docs/api.md` | |
| M2-7 | `POST /api/roadmaps/import` | Same `local_id` → 200 with the same id; invalid or oversized steps → 422; completions saved; `generated_at` clamped; older import stored as archived; 64 KB limit on this endpoint only; tests | ✅ 2026-10-03: `POST /api/roadmaps/import` + `ImportRoadmapRequest`/`ImportedStep` in `schemas.py`, `limit_import_requests`; 26 tests (162 total: 201/200 idempotent, 422 cases, 64 KB only on this path, clamped dates, older import archived, lenient answers/career_data, unsafe links dropped, own rate limit); live Postgres check (completions with original time, same local_id → existing, older → archived, 3 concurrent imports → 1 roadmap) | |
| M2-8 | Frontend refactor: token support in `api.js` + `lib/roadmaps/` (record shape, `localRepository`, `useRoadmaps()`), local mode only | No visible change for guests (manual run); lint and build pass | ✅ 2026-10-03: `api.js` token support + `createSavedRoadmap` / `regenerateSavedRoadmap` / `importLocalRoadmap`; `lib/roadmaps/` (`index.js` `repositoryFor`, `localRepository.js`, `useCurrentRoadmap.js`); Dashboard, Home and Results use them (local mode only; loading/error states added). Isolated-browser guest check 11/11 (empty state, seeded roadmap + progress, mark/undo with the same localStorage keys, reload, Home summary, no console errors); lint at baseline (12), build passes | |
| M2-9 | Frontend account mode: `accountRepository`; signed-in Results, Dashboard and Home read and write through it; activity, streak and achievements derived from `step_progress`, `roadmaps` and `quiz_submissions` | Generate while signed in → rows in the database → same roadmap and progress in a second browser; mark/undo persists; regenerate archives; loading and error states; build with accounts off behaves exactly as today; `docs/database.md` updated | ✅ 2026-10-03: `lib/roadmaps/accountRepository.js`, `repositoryFor(session)` → account when signed in; mode-aware copy on Dashboard/Home; `docs/database.md`. Isolated-browser checks with a throwaway confirmed test user signing in through real Supabase Auth: 18/19 — read from Postgres, mark/undo through RLS (rows verified), second browser profile sees the same roadmap and progress, failed save reverts with an error, load failure → error state + Try again, generate on Results saves + archives (real Gemini), regenerate reuses the saved answers, sign-out returns to guest storage; the 1 failure is the pre-existing dev-only AbortError console log on Results (N-21). Accounts-off build: guest check 11/11, no account UI | |
| M2-10 | Frontend guest import: confirmation banner | Accepting imports the local roadmap and its progress once; local copy cleared; retries and two tabs give no duplicate; a failure keeps the local copy and offers a retry; declining keeps the local copy; a second account on the same browser after a successful import sees no banner | ✅ 2026-10-03: `components/ImportRoadmapBanner.jsx` + `lib/roadmaps/useLocalImport.js` on Home and Dashboard (signed-in only), `clearCurrentRoadmap` / `clearProgress`. Isolated-browser check with two throwaway accounts on one profile: 14/14 — guests never see it, nothing imported without a click, "Not now" keeps the local copy, a simulated 503 keeps it with a retry, two tabs saving at once → exactly one roadmap with its progress, browser copy + progress keys cleared, account copy regenerable, repeated import → 200 same id, a second account on the same browser sees no banner | |
| M2-11 | QA + docs: guest flow (accounts off and on), signed-in end to end at desktop, 360 px and keyboard; update CLAUDE, ROADMAP, SESSION, decisions and the other docs; **owner** cross-device check | All earlier criteria re-checked; docs accurate | ✅ 2026-10-03: full guest flow quiz → results → roadmap (real Gemini) + keyboard step marking; signed-in at 360 px (no horizontal scroll, banner layout) + keyboard import; accounts on and off; 53/53 SQL + 18/18 pooled checks re-run; advisors: only the existing leaked-password Auth warning; 162 tests, lint baseline, build. Docs: CLAUDE, ROADMAP, SESSION, ADR-019, database, api, backend, frontend, architecture, testing, technical-debt, README. **Owner still to do:** real-account cross-device check (sign in on a second device/browser → same roadmap and progress; mark a step on one, see it on the other) | |

Deferred from Milestone 2 (ADR-019): a browser-written activity events table; ~~a roadmap list/switch UI~~ (done 2026-10-07: `/roadmaps` + `POST /api/roadmaps/{id}/activate`); step editing (personal notes and target dates instead, 2026-10-07).

Next: Milestone 3 (F-13) — see 🎯 Version 2 above.

## 📄 Milestone 3 — Resume Analyzer (F-13) — ✅ complete 2026-10-07 (ADR-020)

Design: ADR-020 (accepted 2026-10-05). Same rules as Milestone 2: one small commit per step; after every commit backend tests, lint baseline, build and the guest flow (accounts off and on) pass; new env vars go into the `.env.example` files, `render.yaml` and `docs/deployment.md` in the same commit; schema changes are migrations with RLS checks and advisors; docs updated per step; stop for review after every step. **No real résumé is sent to Gemini while the key is on the free tier** — synthetic test résumés only.

| # | Step | Acceptance criteria | Status |
|---|---|---|---|
| M3-1 | ADR-020 + this table | Owner reviews and decides the open questions; docs only | ✅ 2026-10-05: A–E approved as recommended |
| M3-2 | Migration: `resume_analyses` (RLS, shared policies, grants: browser select + delete, API select + insert), SQL checks in `supabase/tests/` | A sees none of B's analyses; browser can't insert or update; browser deletes only its own; `anon` nothing; API role scoped by claims; `roadmap_id` can't point at another user's roadmap; deleting the roadmap keeps the analysis (`set null`); account deletion cascades; advisors clean; M2 suites still pass | ✅ 2026-10-05: migration `20261006030329_create_resume_analyses` (validated in a rolled-back transaction first); `m3_2_resume_analyses_rls.sql` 28/28; M2 suites 31 + 22 + 18 pooled still pass; security advisor: only the pre-existing leaked-password warning; performance: only INFO "unused index" on the two new indexes (empty table) |
| M3-3 | Backend AI layer: `llm.generate` accepts multimodal contents (PDF part + text); resume prompt (résumé as data, target = career + skills + steps); generation schema + **strict** reply validation (owner, 2026-10-05: reject, never repair; no score; `related_step` within range) | Unit tests with the fake Gemini: valid analysis, malformed output, missing fields, oversized replies, invalid PDFs, Gemini failures, timeouts, schema failures; no résumé bytes or text in logs/errors/saved data; existing 173 tests unchanged | ✅ 2026-10-05: `backend/resume_ai.py` (PDF checks, strict models, `analyze_resume`), résumé prompt in `prompts.py`, `llm.generate` takes multimodal contents + system instruction/temperature/max tokens and logs unexpected client errors by type only; 99 new tests (272 total); one live run with a synthetic résumé passed first attempt (no contact details echoed) |
| M3-4 | Backend endpoint: `POST /api/resume-analyses` (raw PDF), `RESUME_ANALYSIS_ENABLED` gate, per-user rate limiter, 2 MB path limit, repository (Protocol, Postgres, in-memory) | 401/503 (accounts, database, feature off) before the body is read; 409 without an active roadmap; 415 wrong type; 422 not a PDF / too small; 413 over 2 MB (also chunked); 429 per user; 201 saved analysis; honest 503 when generation succeeds but saving fails; nothing about the file logged; live check with a synthetic PDF (paid key or free tier per the owner's decision) || ✅ 2026-10-05: `routers/resume_analyses.py`, `repositories/resume_analyses.py`, per-user `resume_limiter`, `RESUME_ANALYSIS_ENABLED` (default false) + `RESUME_LIMIT_*` in `.env.example`, `render.yaml`, `docs/deployment.md`; 64 endpoint tests (336 total) incl. raw-ASGI proof that early rejections read 0 body chunks; no-real-Gemini guard for all tests; live: repository 8/8 through the pooler, HTTP 15/15 with a real token and a synthetic résumé (1 Gemini call after one 503 retry), logs clean; SQL suite 28/28 |
| M3-5 | Frontend: `api.js` upload call, `lib/resume/` (list + delete via Supabase, analyze via API), `/resume` page (privacy note, upload with type/size checks, analyzing state, result, history, delete), entry points (Dashboard quick action, Home card) | Guest → sign-in prompt; accounts off → honest unavailable state; feature off → honest message; no roadmap → link to the quiz; upload → result rendered from the saved row; delete works; keyboard + 360 px; lint baseline; build || ✅ 2026-10-07: `GET /api/resume-analyses/availability` (owner's M3-4 review: `{available, reason, career}` only) + 11 tests (347 total); `pages/Resume.jsx`, `components/resume/AnalysisView.jsx`, `lib/resume/`, `api.js` GET + raw-PDF upload; entry points: header nav, Dashboard quick action, Home card; Playwright 51/51 (real Auth, feature on/off, accounts off, one synthetic-résumé analysis, injected 401/409/413/415/422/429/502/503, history, delete, privacy, 360 px, keyboard); guest flow 11/11 accounts on and off; SQL 28/28 |
| M3-6 | QA + docs | Browser suites (guest, account, résumé) + live synthetic résumé run; IDOR/size/type/rate-limit checks over HTTP; logs contain no résumé data; database suites; advisors; CLAUDE, ROADMAP, SESSION, ADR-020 status, database/api/backend/frontend docs || ✅ 2026-10-07: gaps of a review made against the current roadmap link to `/dashboard#step-N`, which opens that step (availability also returns `roadmap_id`); live access-control checks 18/18 with two throwaway users (Supabase REST read/filter/delete/patch/insert across users, anon, GraphQL, tampered token, CORS from another origin, path tricks, the step link); résumé browser suite 51/51 again (one synthetic-résumé Gemini call); guest flow 11/11 accounts on and off; server logs free of résumé data, file names, e-mails, user ids and tokens; advisors: only the existing leaked-password warning (Pro-plan setting, owner); docs |

Deferred (ADR-020): free-text target careers, feeding gaps into roadmap generation (F-14), DOCX files, re-analysis of a stored file (files are never stored).

Next: Milestone 4 (F-18) — see 🎯 Version 2 above.


## 🤖 Milestone 4 — AI Coach (F-18) — ✅ complete 2026-10-07 (ADR-021)

Design: ADR-021. Same rules as Milestones 2–3 (one logical change per commit; tests, lint 0, frontend tests, build, guest flow; migrations with RLS checks and advisors; live checks; security review before each commit). The owner delegated Version 1 decisions on 2026-10-07, so steps no longer wait for review.

| # | Step | Acceptance criteria | Status |
|---|---|---|---|
| M4-1 | ADR-021 + migration `coach_threads`, `coach_messages` + SQL checks | A sees none of B's threads or messages; browser can't insert or update, deletes only its own threads (messages cascade); `anon` nothing; API scoped by claims, can't update content, can't attach a message to another user's thread or a thread to another user's roadmap; roadmap deletion keeps threads; account deletion cascades; advisors clean; earlier suites pass || ✅ 2026-10-07: migration `20261008030949_create_coach_threads_and_messages` (validated in a rolled-back transaction first: 37/37); 21/21 again on the applied schema; advisors: only the leaked-password warning + INFO unused indexes on the empty tables |
| M4-2 | Backend: coach prompt + strict reply validation, `POST /api/coach/messages`, `GET /api/coach/availability`, repository, per-user limiter, `COACH_*` settings | 401/503/429/404/422 paths; personal-data guard; context from roadmap/progress/résumé gaps; actions validated against the roadmap; one transaction for both messages; nothing saved on failure; no message text in logs; tests || ✅ 2026-10-07: `coach_ai.py`, `routers/coach.py`, `repositories/coach.py`, shared `strict_ai.py` (résumé layer refactored onto it, behaviour unchanged), `COACH_*` in `.env.example`, `render.yaml`, `docs/deployment.md`; 75 tests (422 total); live with real Gemini and throwaway users: 19/19 (grounded replies naming the next step, a prompt-injection attempt ignored, contact details refused, cross-user API/REST access blocked, thread delete cascades) + 1 check that "I finished step 2" yields a `mark_step_done` suggestion; logs hold no message text |
| M4-3 | Frontend `/coach`: threads list, chat, suggested-action buttons (open step, mark done with the user's click, résumé, quiz), delete thread, privacy notice, entry points | Vitest tests for states, errors and actions; keyboard; 360 px || ✅ 2026-10-07: `pages/Coach.jsx`, `components/coach/CoachMessage.jsx`, `lib/coach/`, `api.js` coach calls; header nav, Dashboard quick action and Home card open `/coach` (no "coming soon" left on the dashboard); 34 Vitest tests (98 total) |
| M4-4 | QA: live chat with throwaway users (IDOR over REST/API, injection attempts, limits), browser suite, docs | All checks pass; docs current || ✅ 2026-10-07: browser QA 20/20 with real Gemini and Supabase Auth (sign-in return, contact details refused, grounded reply with step buttons, mark-done by the user's click, follow-up, history after reload, open-step link, 360 px, delete, nothing in storage/console); live QA found a defect — a stale `mark_step_done` (step already done) made the whole reply fail — fixed and documented as an ADR-021 amendment with regression tests; guest flow 11/11 accounts on and off; API/REST isolation 19/19 (M4-2) |

## 🔮 Future Features

F-8, F-13 and F-18 are Version 2 Milestones 2–4 (see 🎯 Version 2); the rest follow Version 2 unless the owner reorders them:

| ID | Task | Priority | Effort | Impact |
|---|---|---|---|---|
| F-7 | **Supabase Authentication** (ADR-018) — Milestone 1 (C-29); **account management done 2026-10-07** (ADR-022: `/settings` with name, password change, sign-out everywhere, data export, self-service deletion; password reset). OAuth providers remain (need provider setup in the Supabase dashboard) | P1 | M | ★★★ |
| F-8 | ✅ **Milestone 2 — PostgreSQL** (done 2026-10-03, C-30; Supabase Postgres, ADR-019): `quiz_submissions`, `roadmaps`, `roadmap_steps`, `step_progress` + migrations; import the browser-saved roadmap after sign-in (confirmation banner). Steps: 🗄️ Milestone 2 | P1 | L | ★★★ |
| F-13 | **Milestone 3 — Resume Analyzer**: PDF upload → Gemini multimodal → structured critique vs target career | P1 | L | ★★★ |
| F-18 | **Milestone 4 — AI Coach**: chat with memory and tool calling (read/update roadmap, find resources); was S-1 | P1 | XL | ★★★ |
| ~~F-2~~ | ✅ 2026-10-07: Vitest + Testing Library, 64 tests (`api.js`, `roadmapStore.js`, `dashboardData.js`, `lib/resume`, `AnalysisView`, `/resume`); `npm test` | P1 | L | ★★★ |
| F-3 | Playwright E2E: quiz → results → dashboard with mocked API | P1 | M | ★★★ |
| ~~F-4~~ | ✅ 2026-10-08: `.github/workflows/ci.yml` — backend pytest + pip-audit, frontend lint, Vitest, build, npm audit (no secrets; runs once the branch is pushed) | P1 | S | ★★★ |
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
| ~~B-3~~ | ✅ 2026-10-08 with P-7: only HTTPS resource links survive the link check | P1 | XS |
| ~~B-4~~ | ✅ 2026-10-08: the last `alert()` (PDF failure) became an inline message | P3 | XS |
| ~~B-5~~ | ✅ 2026-10-07: per-step notes and target dates (account through RLS, guests in localStorage), due chips and dashboard reminders | P2 | M |
| B-6 | Regenerate single step / adjust difficulty | P2 | M |
| B-7 | Weekly plan view | P2 | M |
| B-8 | Response caching keyed by answers hash | P2 | M |
| B-9 | Server-rendered PDF export (replace html2canvas screenshot) | P3 | M |
| B-10 | Product analytics (PostHog) replacing the custom event log for funnel metrics | P2 | M |
| B-11 | Location question + CAD/USD salaries | P2 | S |
| B-12 | Route-level code splitting (`React.lazy`) | P3 | S |
| ~~B-13~~ | ✅ 2026-10-08: the Landing hero is visible on the first paint (only a small settle is animated) | P2 | XS |
| ~~B-14~~ | ✅ 2026-10-07: `scoringEngine.js` deleted (imported nowhere; measured engagement) | P2 | M |
| B-15 | Light theme + `prefers-color-scheme` | P3 | M |
| B-16 | Weekly digest / reminder emails (background job). In-app reminders from target dates exist since 2026-10-07; emails need an SMTP provider and a scheduler (owner) | P3 | L |
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
