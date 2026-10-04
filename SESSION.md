# SESSION.md — Latest session log

> Overwrite the "Current session" section at the end of each coding session; move the previous one to "History" (keep history short: date + 1–3 lines).

---

## Current session — 2026-10-03 · M2-2, M2-3, M2-4: tables applied, API role can log in

### Summary
- **M2-2** (`ee500a4`): `pathwayai_api` can't call `auth.uid()`, so policies use `private.request_user_id()` (owner-approved ADR-019 amendment). Migration `20261004014249_create_roadmaps`: role, `quiz_submissions`, `roadmaps`, `roadmap_steps`, shared policies, explicit grants.
- **M2-3** (`4233d0d`): migration `20261004014958_create_step_progress`; browser can't backdate `completed_at`. Test bug fixed in both suites (the "no claims" check hadn't cleared earlier claims).
- **M2-4:** the owner enabled the role's login with a locally generated SCRAM hash (the project logs DDL, so no plain password in `alter role`) and put `DATABASE_URL` (transaction pooler, `pathwayai_api.<ref>`, port 6543, SSL) into `backend/.env` only. The first attempt didn't land (neither the role nor `.env` changed); the helper was recreated inside the repo (git-excluded via `.git/info/exclude`, then deleted by the owner) and the second run worked. Verified through the pooler with `supabase/tests/m2_4_api_role_connection.py`: 18/18 (role identity and no bypass, no rows without claims, exactly the user's rows with claims, claims don't leak to the next transaction, cross-user writes / extra grants / `row_security = off` / disabling RLS / `set role` all refused). Two fixture users were created for the check and deleted afterwards (database back to 1 user, 0 Milestone 2 rows). SQL suites 53/53; advisors: only the existing leaked-password Auth warning. Backend 100/100, lint 12-error baseline, build passes.
- **M2-5:** backend foundation — `db.py` (lazy `psycopg_pool` pool as `pathwayai_api`, prepared statements off, `transaction(user_id)` with transaction-local claims, `DatabaseUnavailable`), `repositories/roadmaps.py` (Protocol, Postgres, in-memory), `DATABASE_URL`/`DB_POOL_MAX` config (optional), pinned psycopg 3.3.6 / psycopg-binary 3.3.6 / psycopg-pool 3.3.3 (+ `tzdata` on Windows), installed in both venvs; `.env.example`, `render.yaml`, `docs/deployment.md`, `docs/backend.md`. Tests force `DATABASE_URL` empty. 118 tests; live read-only smoke check through the pooler.
- **M2-6:** `generation.py` (moved from `main.py`, shared), `routers/roadmaps.py` with `POST /api/roadmaps` and `POST /api/roadmaps/{id}/regenerate`; 136 tests. Live repository check with throwaway users found that one retry didn't survive 4 concurrent saves → replaced retries with a per-user `pg_advisory_xact_lock` (6 concurrent saves OK, 1 active). Fixture users deleted.
- **M2-7:** `POST /api/roadmaps/import` (strict steps, lenient answers/career_data, clamped dates, 64 KB on this path only, own rate limiter); 162 tests; live Postgres import check with a throwaway user (idempotent, older → archived, 3 concurrent imports → 1). Fixture user deleted.
- **M2-8:** frontend repository layer (`lib/roadmaps/`), `api.js` token support and saved-roadmap calls; Dashboard/Home/Results refactored onto `useCurrentRoadmap` / `repositoryFor` (local only). Guest UI check in an isolated headless Chrome (Playwright from a scratch venv, system Chrome, throwaway profile): 11/11, no Gemini calls.

### Next Session (exact order)
1. **M2-5:** backend foundation — `db.py` (lazy pool, `prepare_threshold=None`, `transaction(user)` setting claims with `is_local = true`), `repositories/roadmaps.py` (Protocol + Postgres + in-memory fake), `DATABASE_URL` in config (optional: app starts without it), pinned `psycopg` + `psycopg_pool`, `.env.example`, `render.yaml`, `docs/deployment.md`.
2. M2-6 … M2-11 per ROADMAP.

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
