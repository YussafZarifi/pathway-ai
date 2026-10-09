# SESSION.md — Latest session log

> Overwrite the "Current session" section at the end of each coding session; move the previous one to "History" (keep history short: date + 1–3 lines).

---

## Current session — 2026-10-09 · Trusted proxy IP hardening

### Summary
- Verified `main`, `origin`, the local-only commit history, and pre-existing untracked tooling files. No push, deployment, production settings or database changes were made.
- Hardened rate-limit client-IP extraction: Uvicorn proxy-header rewriting is disabled. Default `none` mode uses the socket peer; Render mode accepts one valid `CF-Connecting-IP` only when Render's service identity is present; generic `cidrs` mode honors one valid XFF chain only from an explicitly trusted socket-peer CIDR and walks it right-to-left. Duplicate, malformed, oversized and excessive-hop chains fall back to the peer. IPv4, IPv6 and IPv4-mapped IPv6 are normalized; `/0` proxy networks are rejected.
- Added 25 regression checks for proxy modes, Render header behavior, one/multiple hops, spoofing, malformed/duplicate headers, IPv4/IPv6/localhost/direct clients, and rate-limit bypass attempts. Documented local, Render and future-host configuration in `docs/deployment.md` and ADR-023.
- Final checks: backend 551 passed (one existing Starlette/httpx deprecation warning); frontend lint passed; build passed with the existing large-chunk warning; `npm audit` found 0 vulnerabilities. `pip-audit` is unavailable. Frontend tests and database checks were not requested or run.
- A first pytest invocation from the repository root hit an existing cwd-relative fixture path; rerunning from `backend/` passed all tests. Frontend checks passed from `frontend/`.
- Completed this change as one descriptive local commit; no push or deployment.
- Render picks up `TRUSTED_PROXY_MODE=render` from `render.yaml` on a future approved deploy. Local development stays at `none`; future providers need exact proxy CIDRs and Uvicorn proxy rewriting disabled.

### Remaining work and next task
- No additional proxy work is known. Continue with owner review and owner-side launch tasks; push or deploy only on explicit approval.

## History

### Version 1 build and final security audit — 2026-10-05 to 2026-10-08

### Summary
- **Milestone 3 — Resume Analyzer (ADR-020), 2026-10-05 → 10-07:** `resume_analyses` table (28 SQL checks), `resume_ai.py` (strict validation, reject-never-repair), `POST /api/resume-analyses` (auth → database → switch → type → limit → roadmap, all before the body; 2 MB counted while streaming), availability route, `/resume` page with history and delete. Off by default (`RESUME_ANALYSIS_ENABLED=false`) until Gemini billing; only synthetic résumés analyzed.
- **Owner direction (2026-10-07): continue autonomously to a production-ready Version 1, local commits only, no push or deploy.**
- **Milestone 4 — AI Coach (ADR-021 + amendment):** `coach_threads`/`coach_messages` (37 SQL checks), `coach_ai.py` + `strict_ai.py`, `POST /api/coach/messages`, `/coach` page; suggested actions only run on the user's click.
- **Account management (ADR-022):** `/settings` (name, password, sign out everywhere, export, deletion with a password confirmed within 5 minutes), `/reset-password`, `private.delete_current_user()` (8 SQL checks).
- **Roadmap history** (`/roadmaps`, `POST /api/roadmaps/{id}/activate`), **step notes, target dates and in-app reminders** (`step_notes`, 18 SQL checks).
- **Polish and quality:** P-1–P-11 (built-by footer, About, How it works, sorted matches, labelled AI estimates, SSRF-safe link checks P-7, header on Quiz/Results, steady quiz card, Results/dashboard copy), N-21 accessibility, N-10 one theme mechanism, N-14 dead CSS pruned, TD-58 (no Gemini AFC log noise), B-18 (capped browser event log), F-4 CI workflow, Vitest suite and lint at 0.
- **Final security audit (2026-10-08)** — backend on :8011 with the current code, real Supabase Auth/REST, throwaway users (deleted afterwards):
  - Live attacker-style run 71/73, then the two rate-limited checks re-run on fresh limits: both pass. Covered: 11 protected routes × 8 forged/missing tokens (alg none, HS256 confusion, tampered signature, swapped sub, expired, publishable key) → 401; IDOR through the API and Supabase REST/RPC/GraphQL across all 9 tables; browser inserts into API-only tables; server-only columns; SQL/XSS/path-traversal strings; résumé upload (wrong type, EXE bytes, missing `%%EOF`, tiny, 2 MB + 1, 3 MB chunked); 16 KB / 64 KB body limits incl. chunked; CORS (evil origin, `null`, DELETE preflight); export isolation; rate limits; account deletion; a prompt-injection probe to the coach (no leak, only allowed actions).
  - **One real defect found and fixed** (`a1a7b6e`, ADR-022 amendment): access tokens of ended sessions (sign-out everywhere, deleted account) still worked on the API for up to an hour; a deleted account's token got a Gemini coach reply. Now `private.session_is_active()` (7 SQL checks) is checked by `session_check.live_user` on every route that spends AI, writes or exports; 25 tests; live 14/14.
  - All SQL suites re-run: 151/151 + pooled 18/18. Security advisors: only the pre-existing leaked-password-protection warning. pip-audit and npm audit: 0 vulnerabilities. Secret scan of git history, tracked files and the production bundle: clean (only the publishable key ships). Logs: no tokens, emails, passwords, résumé bytes, messages or markers; no AFC lines. One live roadmap generation: link check 7 ok / 2 unknown / 1 dropped.
- **Database now:** only the owner's account (no roadmaps or other rows); every throwaway user deleted.

### Remaining issues
- **Defects:** none known.
- **Accepted limitations (documented):** Supabase REST honours a signed-out token for RLS reads until it expires (≤ 1 h); in-memory rate limits reset on restart and aren't shared across instances; the PDF check is structural, so a well-formed non-résumé PDF costs one Gemini call (rejected honestly); Gemini free tier = 20 requests/day; salaries and resource names are model-written (links are checked, content isn't).
- **Future enhancements (not defects):** ROADMAP *Future* — F-3 committed E2E tests, F-6 streaming, F-11 Sentry, F-14 skill-gap, F-15 shareable roadmaps, B-16 email reminders (SMTP), OAuth, N-19 drop v1 answers, N-22 og:image, PDF parsing before AI.

### Next Session (exact order)
1. **Owner review** of the Version 1 commits (`git log origin/main..main`) and this audit.
2. **Owner actions before any public launch:** Gemini billing + budget alert, then `RESUME_ANALYSIS_ENABLED=true` (D-6); `YOUTUBE_API_KEY` (D-5); add `<origin>/reset-password` to Supabase Auth Redirect URLs; enable leaked-password protection; optionally a shorter JWT expiry; restart the dev backend on 8000 (it runs older code).
3. **Owner decides** push to the private repo (CI then runs) and deployment (D-1–D-4). Nothing is pushed or deployed until then.

### Open questions (for the owner)
1. Push `main` (95 commits ahead) to the private GitHub repo now, so CI runs and there is an off-machine backup?
2. Render plan for the API (free sleeps, Starter always on), and when to deploy?
3. Enable Gemini billing (needed for real résumés and more than ~7 quiz runs a day)?

---

- 2026-10-04 — Pre-Milestone 3 audit: JWT clock-skew leeway, body limits counted while reading (chunked bypass fixed), backend and frontend dependency upgrades (0 vulnerabilities); live audit 50/50.
- 2026-10-03 — Milestone 2 complete (M2-2 → M2-11), see ROADMAP 🗄️ Milestone 2 and ADR-019.
- 2026-10-03 — Milestone 2 (M2-2 → M2-11): roadmap tables + `pathwayai_api` role, pooled login, backend pool/repository/endpoints, frontend repositories, account mode, import banner, QA; ADR-019 amended (`private.request_user_id()`).
- 2026-10-02 — Milestone 2 design reviewed (six changes adopted) and accepted as ADR-019; ROADMAP step table M2-1 → M2-11 (M2-1, commit `bfaf1b8`).
- 2026-10-01 — Planning: deployment postponed until Version 2 (M1–M4) is complete; Milestone 1 verified with the owner's real account (M1-8); first Milestone 2 draft written (conversation only).
- 2026-09-30 — Supabase Milestone 1 in 7 commits (ADR-018 accepted): `profiles` table (RLS, sign-up trigger), `lib/supabase.js` + `AuthProvider`, `/login`, header sign-in/out, FastAPI token verification + `GET /api/me`, 20 new tests (100). Optional per environment; guest flow unchanged. Real sign-up test pending (owner's inbox).
- 2026-09-29 — Pre-deploy fix batch (C-27, ADR-017: compare independence, scroll reset, honest copy, 404, metadata), full QA pass, recruiter-style review (P-1–P-11), ADR-018 proposed, ROADMAP restructured for deploy.
- 2026-09-28 (evening) — Pre-flight: docs synced with the code; live `gemini-2.5-flash-lite` check (7/7 ok, v1 + v2); manual desktop / 360 px / keyboard QA; readiness report; findings TD-50–TD-58 → N-20 (fixed 2026-09-29) and N-21.
- 2026-09-28 (day) — 5-question quiz (ADR-016): backend accepts v1 + v2 answer formats (v1 prompts byte-identical), new quiz UI (multi-select, weekly-hours buttons, optional career field), TD-26 fixed, 80 backend tests; verified on `gemini-2.5-flash`.
- 2026-09-27 (part 2) — Investigated the "intermittent roadmap failure": 25 live calls, 0 malformed JSON; the real limit is Gemini's free tier (20 requests/day). Added JSON mode + response schema, per-item validation, one retry, 503 quota/busy messages, content-free diagnostics with request IDs, and the first 60 backend tests (ADR-015).
- 2026-09-27 (part 1) — Deployment readiness (ADR-014): env-only config (`ALLOWED_ORIGINS`, `VITE_API_URL`, build fails without it), every request through `lib/api.js`, Pydantic request validation, in-memory rate limits, generic errors, no user data in logs, `/health`, `render.yaml` (Render chosen, not deployed). Local `backend/.env` gained `ALLOWED_ORIGINS`; `frontend/.env.local` created.
- 2026-09-26 — Landing Log in / Sign up → "accounts coming soon" dialog; `/home` polish; real YouTube videos per step (ADR-012); dashboard redesign with persisted roadmap and per-roadmap progress (ADR-013); polish passes and shared `VideoCard`.
- 2026-09-25 (part 2) — Pushed full history to the private GitHub repo `YussafZarifi/pathway-ai` (secret scan of history clean; placeholder README commits replaced with `--force-with-lease` by the owner).
- 2026-09-25 (part 1) — Git initialized; fake data, dead buttons and unreachable code removed; `/home` rebuilt as an honest empty state (8 commits + docs). ADR-010.
- 2026-09-24 — Initial audit and documentation. No code changes.
