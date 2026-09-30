# SESSION.md — Latest session log

> Overwrite the "Current session" section at the end of each coding session; move the previous one to "History" (keep history short: date + 1–3 lines).

---

## Current session — 2026-09-30 · Supabase Milestone 1 (accounts + profiles)

### Summary
- The owner connected the Supabase MCP server, **accepted ADR-018**, and moved Supabase ahead of the deploy. Milestone 1 was defined with the owner (it wasn't written anywhere before): email + password auth **plus a `profiles` table**, Supabase CLI migrations, deploy later.
- **Milestone 1 is code complete** in 7 small commits (below). Accounts are optional per environment: with the Supabase variables unset the app is exactly the guest-only version.
- Every commit kept the guest flow working: backend tests passed (80 → 100), lint stayed at its 12-error baseline, `npm run build` passed.
- **Not pushed, not deployed** (`main` ~55 commits ahead of `origin/main`).
- **Not yet tested end to end with a real account:** sign-up sends a confirmation email, so it needs the owner's inbox (M1-8).

### Commits
| Commit | Step |
|---|---|
| `8d11415` | M1-1 docs: ADR-018 accepted with the owner's details; Milestone 1 plan in ROADMAP |
| `df1b456` | M1-2 `public.profiles` (RLS: own row; grants: no anon, authenticated may update `display_name` only; sign-up trigger `private.handle_new_user`, security definer in a non-exposed schema). Applied via MCP as migration `20260930041303_create_profiles`, same SQL in `supabase/migrations/` |
| `7742e67` | M1-3 `@supabase/supabase-js` 2.117.2 (pinned), `lib/supabase.js`, `AuthProvider` + `useAuth()`; `VITE_SUPABASE_*` in `.env.example` and `render.yaml` |
| `6de598f` | M1-4 `/login`: sign in / create account, check-your-email + resend, mapped error copy, auth-off and already-signed-in states |
| `914d189` | M1-5 header Sign in / email + Sign out; Landing Log in / Sign up → `/login` (auth off → the old dialog) |
| `aa81e82` | M1-6 `backend/auth.py` (PyJWT 2.15.1, JWKS, ES256/RS256 only, exp/iss/aud/role, anonymous rejected, nothing logged) + `GET /api/me`; CORS allows `Authorization`; `SUPABASE_URL`; 20 tests |
| (this commit) | M1-7 docs: CLAUDE, ROADMAP, README, architecture, deployment (Supabase URL config), database, api, backend, frontend, testing, technical debt (TD-64–TD-66) |

### Verification done
- **Database:** rolled-back SQL test as two fake users. The trigger creates rows (name trimmed, blank → null); a user sees 1 row, can't update another user's row, can update their own; `anon` has no privileges; clients can't insert. Security + performance advisors: no findings. No test users left behind (0 users, 0 profiles).
- **Frontend (Chrome, dev server):** `/login` renders; wrong credentials → "That email and password don't match an account." (real Supabase call); tab switch clears errors; Landing Sign up → `/login` on the create-account tab; header shows Sign in; no console errors. **Auth-off** (second dev server with blank Supabase vars): Landing buttons open the coming-soon dialog, `/login` shows "Accounts aren't available here", no account control in the header.
- **Backend:** 100/100 tests; live check against the project's real JWKS: a forged ES256 token using the real key id → 401. The running dev backend: `/api/me` with a bad token → 401, `/health` ok.
- **Guest flow:** one live `POST /api/ai/career` (200, CORS header, no token); `/home`, `/dashboard` (empty state), `/quiz` render with the new header. A full browser quiz → results → roadmap run was **not** repeated (saving Gemini's 20/day quota); Quiz/Results/Dashboard code is unchanged apart from the provider wrapper.
- Not checked: phone width (the Chrome window didn't resize; the layout reuses existing responsive classes, and the header wraps at ≤600 px).

### Local environment changes (not in git)
- `frontend/.env.local`: `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` (the public `sb_publishable_…` key).
- `backend/.env`: `SUPABASE_URL`.
- PyJWT 2.15.1 installed in both `backend/.venv` and the root `.venv` (the owner's running uvicorn).
- `.mcp.json`, `.agents/`, `.claude/`, `skills-lock.json` are untracked tool files; not committed.

### Next Session (exact order)
1. **Owner (M1-8):** Supabase Dashboard → Authentication → URL Configuration: Site URL `http://localhost:5173`, Redirect URL `http://localhost:5173/**`. Then sign up on `/login` with your own email → click the link (lands on `/home` signed in) → header shows your email → sign out → sign in. Tell Claude, who then checks the `profiles` row and `GET /api/me` with a real token.
2. **Push to private GitHub** (D-1), on the owner's go-ahead.
3. **Deploy to Render** (D-2, D-3) with the new optional variables (`SUPABASE_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`) and the live domain added to Supabase's URL Configuration.
4. **Verify production** (D-4), including sign-up/sign-in.
5. **Milestone 2 (F-8):** roadmap + progress tables with RLS, save for signed-in users, import the browser-saved roadmap on first sign-in. First decide: browser writes via RLS, or FastAPI writes with the user's token.
6. Resume Analyzer (F-13) → AI Coach (F-18).

### Open questions (for the owner)
1. Supabase email: keep the built-in sender for testing, or set up custom SMTP (needed before a public launch, TD-65)?
2. Upgrade the vulnerable npm packages now (TD-64: `jspdf` critical via html2pdf, `react-router`, `vite`) — a separate commit + QA pass?
3. Carried over: Gemini billing, Render plan, "Built by" footer links, target market (Canada-first, EN/FR), when to make the repo public.

---

## History
- 2026-09-29 — Pre-deploy fix batch (C-27, ADR-017: compare independence, scroll reset, honest copy, 404, metadata), full QA pass, recruiter-style review (P-1–P-11), ADR-018 proposed, ROADMAP restructured for deploy.
- 2026-09-28 (evening) — Pre-flight: docs synced with the code; live `gemini-2.5-flash-lite` check (7/7 ok, v1 + v2); manual desktop / 360 px / keyboard QA; readiness report; findings TD-50–TD-58 → N-20 (fixed 2026-09-29) and N-21.
- 2026-09-28 (day) — 5-question quiz (ADR-016): backend accepts v1 + v2 answer formats (v1 prompts byte-identical), new quiz UI (multi-select, weekly-hours buttons, optional career field), TD-26 fixed, 80 backend tests; verified on `gemini-2.5-flash`.
- 2026-09-27 (part 2) — Investigated the "intermittent roadmap failure": 25 live calls, 0 malformed JSON; the real limit is Gemini's free tier (20 requests/day). Added JSON mode + response schema, per-item validation, one retry, 503 quota/busy messages, content-free diagnostics with request IDs, and the first 60 backend tests (ADR-015).
- 2026-09-27 (part 1) — Deployment readiness (ADR-014): env-only config (`ALLOWED_ORIGINS`, `VITE_API_URL`, build fails without it), every request through `lib/api.js`, Pydantic request validation, in-memory rate limits, generic errors, no user data in logs, `/health`, `render.yaml` (Render chosen, not deployed). Local `backend/.env` gained `ALLOWED_ORIGINS`; `frontend/.env.local` created.
- 2026-09-26 — Landing Log in / Sign up → "accounts coming soon" dialog; `/home` polish; real YouTube videos per step (ADR-012); dashboard redesign with persisted roadmap and per-roadmap progress (ADR-013); polish passes and shared `VideoCard`.
- 2026-09-25 (part 2) — Pushed full history to the private GitHub repo `YussafZarifi/pathway-ai` (secret scan of history clean; placeholder README commits replaced with `--force-with-lease` by the owner).
- 2026-09-25 (part 1) — Git initialized; fake data, dead buttons and unreachable code removed; `/home` rebuilt as an honest empty state (8 commits + docs). ADR-010.
- 2026-09-24 — Initial audit and documentation. No code changes.
