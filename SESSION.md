# SESSION.md — Latest session log

> Overwrite the "Current session" section at the end of each coding session; move the previous one to "History" (keep history short: date + 1–3 lines).

---

## Current session — 2026-10-03 · M2-2: roadmap tables applied

### Summary
- **Finding:** `pathwayai_api` can't call `auth.uid()`: schema `auth` belongs to `supabase_admin` and `postgres` can't grant `usage` on it (the grant silently does nothing). Owner approved a helper, `private.request_user_id()`, with the same body as `auth.uid()` (security invoker, reads only the request claims, executable only by `authenticated` and `pathwayai_api`). ADR-019 amended.
- **M2-2 applied:** migration `20261004014249_create_roadmaps` — role `pathwayai_api` (`nologin noinherit nobypassrls`, member of nothing), `quiz_submissions` (server only), `roadmaps` (at most one active per user, idempotent `local_id`, composite foreign keys), `roadmap_steps` (deferrable position uniqueness), one shared policy per operation, default grants revoked, explicit grants.
- **Checks:** 31/31 in `supabase/tests/m2_2_roadmaps_rls.sql`, first in a rolled-back transaction before applying, then on the live schema. Advisors: nothing for the new tables (the existing leaked-password-protection Auth warning; INFO "unused index" on the empty tables). Live state verified: 1 user, new tables empty, grants and policies as designed.

### Next Session (exact order)
1. **M2-3:** `step_progress` migration (browser select/insert/delete own; composite foreign key to the user's own steps); RLS checks; advisors.
2. M2-4 (owner sets the role's login + password, `DATABASE_URL`) → M2-5 … M2-11 per ROADMAP.

### Open questions (for the owner)
1. Gemini's free tier (20 requests/day) will limit live checks in M2-9 to M2-11 and Milestones 3–4: enable billing during development, or stay within the quota?
2. Upgrade the vulnerable npm packages (TD-64) as a separate commit during Version 2?
3. Leaked-password protection (Supabase Auth advisor warning, pre-existing): enable it if the plan allows.

---

## History
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
