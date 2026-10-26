# SESSION.md — Latest session log

> Overwrite the "Current session" section at the end of each coding session; move the previous one to "History" (keep history short: date + 1–3 lines).

---

## Current session - 2026-10-26 - Version 1.0 release preparation

### Summary
- Synchronized release documentation with the production Resume Analyzer: deterministic PDF evidence verification and scoring are authoritative; LangChain is the default retriever; curated guidance and Gemini coaching are validated, response-only enrichment.
- Updated environment, deployment, API, architecture, testing and repository-memory documentation. Local agent bundles, generated output and local MCP configuration are now ignored without affecting `.github/workflows/ci.yml`.
- Release verification passed: 674 backend pytest tests, 182 frontend Vitest tests, lint, production build, and 3 Playwright checks; one browser check was skipped by the suite. Vite reports a non-blocking large-chunk warning for PDF/HTML-to-PDF bundles.
- Security audit reconfirmed that `backend/.env`, `frontend/.env.local` and `frontend/.env.e2e` are ignored. No API keys, database credentials or tokens were found in tracked source or templates.

### Remaining work
- Review the staged release diff, create the approved commit and annotated `v1.0.0` tag. Push or deploy only with owner approval.

### Previous session - 2026-10-11 - Resume Analyzer response-contract regression

### Summary
- Traced the reported `recommendations.1.criterion_ids:too_long` path: strict Pydantic allows 1–4 IDs; the provider schema now enforces that cardinality while strict local validation remains authoritative.
- Expanded privacy-safe diagnostics and regression coverage around malformed structured output. No résumé content or raw model output was added to logs.

### Previous session - 2026-10-11 - Resume Analyzer end-to-end reliability

### Summary
- Reproduced the production failure through a signed-in browser upload using a wholly fictional, local-only PDF (`backend/.resume-debug/fictional-riley-chen-resume.pdf`). Gemini returned HTTP 200; strict reply validation then rejected several model-output contract mismatches, which the API surfaced as 502 before saving anything.
- Root causes: the prompt allowed multiple spans for work checks while the strict model allowed one; Gemini stitched separate real section headings into one non-contiguous quote; technologies listed for a project/job could be real but absent from the single stack quote; recommendation references included work-check IDs or criteria already found. The strict verifier was correctly refusing the latter unsafe evidence/reference shapes, but the request contract and safe output handling were inconsistent.
- Fixed without disabling evidence verification: encode the one-citation work-check limit in Gemini's supported `maxItems` schema and prompt; enumerate recommendation IDs from the current career rubric; retain only known, missing-evaluation links and omit recommendations with no valid links; keep technology tags only when present in that item's own independently verified citations; split a multi-line section-heading quote only when each line is an allowlisted heading that occurs verbatim as an extracted page line (and preserve order for `section_order`). Non-heading paraphrases and invented lines continue to fail closed.
- Real browser verification: the visible signed-in Playwright browser uploaded the synthetic PDF through `/resume` using the normal picker. Gemini logged HTTP 200; FastAPI returned 201 after DB save. The page rendered overall 60/100, medium confidence (65/100), two project reviews and one experience review; optional details rendered roadmap alignment and readiness coverage (internship 58%, junior 63%, mid-level 55%; ATS-optimization rubric category 50%). After reload, history showed 3 saved analyses and the new report reopened from Supabase. Final tab console had no errors; backend had no exception.
- Final checks: backend 584 passed; frontend 171 passed; Playwright regression 5 passed; lint passed; production build passed (existing large-chunk warning). The synthetic PDF and DEBUG verifier captures are under ignored `backend/.resume-debug/`; no actual résumé was used and no PDF, raw response, or extracted text is tracked.
- No push or deployment. Local commit follows the user's instruction after final checks.

### Remaining work
- None for this reliability pass. The user's own résumé was not used; this pass proves the complete authenticated upload path with a fictional PDF.

### 2026-10-09 - Resume upload and initialization hardening

### Summary
- Restored a visible, keyboard-accessible “Upload Resume (PDF)” button alongside drag-and-drop. Selection shows the local filename and size, supports removal, and keeps Analyze disabled until the PDF passes existing type and size checks. The filename stays out of API requests, browser storage, and logs.
- Bounded the shared initial Supabase session check, Resume availability/history, and Coach availability/thread/conversation loading. Timeouts, network/availability errors, aborted or stale requests, and expired sessions now leave loading and offer retry or sign-in. Workspace state resets across sign-out/sign-in and account changes.
- Added stable loading skeletons and a responsive upload action. Playwright uses a synthetic session, mocked local APIs, and a synthetic PDF; it verifies upload, report rendering, refresh, Back/Forward, mobile overflow, and a clean browser console. No real résumé or Gemini request was used.
- Frontend: 168 passed; lint passed; production build passed (existing large-chunk warning). Backend: 540 passed with one upstream Starlette/httpx deprecation warning. Chromium E2E: 4 passed. Screenshots are in ignored `frontend/playwright-artifacts/`.
- No commit, push, or deployment.

### Remaining work
- None for the requested fixes. E2E report and upload fixtures stay synthetic and do not exercise a live Gemini request.

### Follow-up - availability hang investigation
- Reproduced the real browser request: `GET http://127.0.0.1:8000/api/resume-analyses/availability` left Chromium, then hung until the page aborted it at ~8.1 s. `/health` and `/` on the same listener also returned no bytes, proving the request was stuck before route/auth/DB/Gemini logic.
- Root cause: port 8000 belonged to a nonresponsive `python3.11.exe` process from the Windows Store Python install (PID 25920; ~7,634 CPU seconds). Its command line/stack could not be inspected because Windows denied CIM access. Replaced it with this repo's `backend/.venv` Uvicorn process; `/health` now returns 200 in ~4 ms. The same browser request with an intentionally invalid synthetic token now returns 401 in 171 ms, leaving loading for the honest sign-in state rather than timing out.
- Also found `RESUME_ANALYSIS_ENABLED` was absent locally and therefore defaulted off despite the paid Gemini key being configured. Set `RESUME_ANALYSIS_ENABLED=true` in ignored `backend/.env` and restarted the backend. Availability does not call Gemini; when enabled it checks the authenticated user's active roadmap. A read-only query using a synthetic user ID reached the configured Postgres pool in 355 ms and found no roadmap for that ID.
- Playwright E2E: 4 passed (upload control, file selection/removal, synthetic report rendering, refresh, Back/Forward, mobile layout, no console errors); an additional browser sign-out/sign-in flow passed. The UI success/report path uses synthetic auth/API fixtures; no real account token or résumé was available, so live user-specific availability and Gemini analysis remain unverified.
- Backend: 540 passed; frontend: 168 passed; lint passed; production build passed (large-chunk warning). One Starlette/httpx deprecation warning remains. No tracked source changes or commit; local backend is running on :8000 and the feature switch is enabled locally only.
## History

### 2026-10-09 - M3-X evidence-based Resume Analyzer
- Implemented the weighted evidence-based scoring report, verified citations, roadmap comparison and premium report dashboard. Backend 540 and frontend 157 tests now pass after the loading fix; lint and build pass.


### 2026-10-09 · Resume Analyzer and AI Coach UI polish
- Reworked the signed-in tools with a shared responsive style: accessible drag-and-drop upload, real upload progress, privacy and loading states, report-style history, and polished AI Coach conversation surfaces. API and business logic were unchanged for this UI-only pass.
- Frontend suite: 151 tests passed; lint and production build passed. Local commit only; no push or deployment.

### 2026-10-09 · Trusted proxy IP hardening
- Hardened forwarded-address handling for direct/local, Render, and explicitly configured CIDR proxy modes; added 25 regression checks and documented configuration. Backend 551 passed; frontend lint/build and npm audit passed. Local commit only; no push or deployment.

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
1. Review the Version 1.0 release diff and create the approved commit/tag.
2. The owner decides whether to push the private release branch and whether to deploy through Render.
3. Before public résumé analysis, configure paid Gemini billing, a budget alert, `RESUME_ANALYSIS_ENABLED=true`, production Supabase redirects/custom SMTP and any desired YouTube key.

### Open questions (for the owner)
1. Approve the `v1.0.0` release commit and tag?
2. Select the Render plan and authorize deployment timing?
3. Enable Gemini billing before allowing real résumé uploads?

---

- 2026-10-04 — Pre-Milestone 3 audit: JWT clock-skew leeway, body limits counted while reading (chunked bypass fixed), backend and frontend dependency upgrades (0 vulnerabilities); live audit 50/50.
- 2026-10-03 — Milestone 2 complete (M2-2 → M2-11), see ROADMAP 🗄️ Milestone 2 and ADR-019.
- 2026-10-03 — Milestone 2 (M2-2 → M2-11): roadmap tables + `pathwayai_api` role, pooled login, backend pool/repository/endpoints, frontend repositories, account mode, import banner, QA; ADR-019 amended (`private.request_user_id()`).
- 2026-10-02 — Milestone 2 design reviewed (six changes adopted) and accepted as ADR-019; ROADMAP step table M2-1 → M2-11 (M2-1, commit `bfaf1b8`).
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
