# SESSION.md — Latest session log

> Overwrite the "Current session" section at the end of each coding session; move the previous one to "History" (keep history short: date + 1–3 lines).

---

## Current session — 2026-10-01 · Planning: deployment postponed, Version 2 priorities

### Summary
- Start-of-session review (docs only, no code changes). Baseline confirmed: 100/100 backend tests, lint at its 12-error baseline. No commits since `727038f`; `main` is 54 commits ahead of `origin/main`. Supabase still has 0 users / 0 profiles, at the start of the session.
- **Owner decision: deployment is postponed until Version 2 is complete.** Version 2 = Milestones 1–4: M1 accounts (code complete) → **M2 roadmaps in PostgreSQL (F-8)** → **M3 Resume Analyzer (F-13)** → **M4 AI Coach (F-18)**. The project must stay deployable after every commit, but Claude must **not recommend deploying** (push-to-deploy, Render, production verification) until Version 2 is finished unless the owner explicitly asks.
- Docs updated to match: `CLAUDE.md` (state at a glance, §2, §11 rewritten with a "Deployable at every commit" checklist, §15), `ROADMAP.md` (new 🎯 Version 2 section; "Ready to Deploy" became ⏸️ Deployment — postponed, D-1–D-6 parked), `docs/deployment.md` (postponed status + "Keeping it deployable" rules), `docs/decisions.md` (index table now lists ADR-017 and ADR-018). Stale counts fixed where touched (54 unpushed commits, 100 tests).

- **Milestone 1 verified (M1-8), so Milestone 1 is complete.** The owner signed up, confirmed by email, signed in; 1 confirmed user with a `profiles` row. In the owner's signed-in browser session (token never left the page): access token is ES256 (kid `5ec8d865…`, matching the project JWKS), `iss` = the project's `/auth/v1`, `aud` = `authenticated`, role `authenticated`, not anonymous. `GET /api/me` with it → **200**, `{id, email}` matching the session user. The same token with a changed signature, a different `sub`, an old `exp`, `aud: anon`, or `alg: none` → **401** each; no header, a malformed token and `Basic` auth → 401. 100/100 backend tests.

### Next Session (exact order)
1. **Milestone 2 planning (F-8):** decide who writes the roadmap tables (browser via RLS vs FastAPI with the user's token) → new ADR; schema for roadmaps, steps and progress; import of the browser-saved roadmap on first sign-in; write the M2-x step table in ROADMAP; owner approves before code.
2. **Milestone 2 build**, one small deployable commit per step.
3. Milestone 3 (Resume Analyzer) → Milestone 4 (AI Coach), each planned and approved the same way.

### Open questions (for the owner)
1. Milestone 2: should the browser write roadmaps directly through RLS, or should FastAPI write them with the user's token? (Claude will lay out the trade-offs at planning time.)
2. Gemini's free tier (20 requests/day) will limit local testing of Milestones 3–4; enable billing during development, or keep testing within the quota?
3. Upgrade the vulnerable npm packages (TD-64) as a separate commit during Version 2?

---

## History
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
