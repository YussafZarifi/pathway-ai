# SESSION.md — Latest session log

> Overwrite the "Current session" section at the end of each coding session; move the previous one to "History" (keep history short: date + 1–3 lines).

---

## Current session — 2026-10-03 · M2-2 and M2-3: roadmap and progress tables applied

### Summary
- **M2-2** (commit `ee500a4`): `pathwayai_api` can't call `auth.uid()` (schema `auth` belongs to `supabase_admin`; `postgres` can't grant `usage` on it), so policies use `private.request_user_id()`, same body as `auth.uid()`, security invoker (owner-approved, ADR-019 amended). Migration `20261004014249_create_roadmaps`: role `pathwayai_api`, `quiz_submissions`, `roadmaps`, `roadmap_steps`, one shared policy per operation, explicit grants.
- **M2-3:** migration `20261004014958_create_step_progress`: primary key `(step_id, user_id)`, composite foreign key to the user's own steps (cascade), index `(user_id, completed_at desc)`; browser select / insert (`step_id`, `user_id` only, so `completed_at` can't be backdated) / delete; `pathwayai_api` select / insert (imports keep the original time); no update for anyone; `anon` nothing.
- **Checks:** 22/22 new checks (`supabase/tests/m2_3_step_progress_rls.sql`) + 31/31 M2-2 checks on the live schema. A test bug was found and fixed in both files: the "pathwayai_api without claims" check didn't clear claims set earlier in the same transaction, so in M2-2 it had passed without testing anything; it now clears them and still passes. Advisors: nothing new (existing leaked-password-protection warning; INFO unused index on empty tables). Backend 100/100, lint at its 12-error baseline, build passes.

### Next Session (exact order)
1. **M2-4 (owner):** enable login for `pathwayai_api` and set its password in the Supabase dashboard (SQL editor), then put `DATABASE_URL` (transaction pooler) in `backend/.env`; Claude confirms the connection and that RLS applies. Claude will give exact steps when M2-4 starts.
2. M2-5 … M2-11 per ROADMAP.

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
