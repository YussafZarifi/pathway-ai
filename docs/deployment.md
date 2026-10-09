# Deployment

## Current state
**Deployment-ready for Render, not deployed, not pushed — deployment is postponed until Version 2 is complete** (owner decision, 2026-10-01). Version 2 = Milestones 1–4: accounts (done in code), roadmaps in PostgreSQL, Resume Analyzer, AI Coach (ROADMAP → 🎯 Version 2). Until then, don't recommend or start a deploy unless the owner explicitly asks. Supabase accounts (Milestone 1, ADR-018) are optional per environment (see "Supabase" below).

### Keeping it deployable (every commit until Version 2 ships)
The deploy waits, but the project must stay shippable at every commit:
- Backend tests pass (`cd backend && python -m pytest -q`); `npm run lint` at or below its baseline; `npm run build` passes with `VITE_API_URL` set.
- The guest flow works with the Supabase variables unset (guest-only build) and set.
- Every new environment variable is added in the same commit to the `.env.example` files, `render.yaml` (`sync: false` for secrets) and the table below. Every new backend dependency is pinned in `requirements.txt`.
- Every schema change is a Supabase CLI migration in `supabase/migrations/`, applied to the project, security advisors clean.
- Nothing here assumes a single long-lived process beyond what's documented (in-memory rate limits, YouTube cache); new features that need shared state or background work say so in their ADR, with the Render piece they'd need.

### Launch sequence (parked until Version 2 — ROADMAP → ⏸️ Deployment)
1. **D-1** Push `main` to the private repo (54 commits ahead on 2026-10-01) (check `git check-ignore backend/.env` first).
2. **D-2** Choose the Render plan for `pathwayai-api` (free sleeps; Starter is always on).
3. **D-3** Apply the Blueprint (steps below), including any variables Milestones 2–4 add.
4. **D-4** Verify production: `/health`, the full flow Landing → Quiz → Results → Dashboard → Regenerate, the 404 page, CORS, request-ID logs, no console errors; add the live URL to the README; then `og:url` / `og:image` (N-22).
5. Before **sharing the URL publicly**: Gemini billing + budget alert (D-6) and `YOUTUBE_API_KEY` (D-5, otherwise every step shows a "No video found yet" placeholder); ideally also the presentation fixes P-1–P-6 (built-by footer, About, How it works, sorted matches, AI-estimate labels, fewer "Coming soon").

Done (ADR-014):
- No hard-coded URLs: the frontend reads `VITE_API_URL` (the build fails without it); the backend reads `ALLOWED_ORIGINS`.
- `backend/.env.example` and `frontend/.env.example` document every variable.
- `/health` endpoint for the platform health check.
- Request validation, a 16 KB body limit, in-memory rate limiting (per IP and global), generic error messages, no quiz answers or AI output in logs.
- `render.yaml` Blueprint, validated against Render's JSON schema.

Still missing before a public launch (not blockers for a first deploy):
- No frontend tests and no CI (F-2–F-4; the backend has 100 pytest tests run locally); no error tracking (F-11).
- **Gemini free-tier quota: 20 requests per day** for `gemini-2.5-flash-lite` (measured 2026-09-27). That's about 7–10 quiz runs a day in total (a run uses 2–3 requests, plus any retry); after that, users see "PathwayAI has reached its AI usage limit for now" until the daily reset. Before sharing the URL widely, enable billing on the Google AI Studio / Cloud project (paid tier) and set `GLOBAL_AI_LIMIT_PER_DAY` to the spend you accept. (AI output is validated and retried since ADR-015.)
- No Gemini budget alert. The global daily cap (`GLOBAL_AI_LIMIT_PER_DAY`) is the only spend guard.

## Local development
```bash
# backend (terminal 1)
cd backend
cp .env.example .env          # set GEMINI_API_KEY (optional: YOUTUBE_API_KEY, SUPABASE_URL, DATABASE_URL)
uvicorn main:app --reload --port 8000

# frontend (terminal 2)
cd frontend
cp .env.example .env.local    # VITE_API_URL=http://127.0.0.1:8000 (optional: VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY)
npm run dev                   # http://localhost:5173
```
`backend/.env` and `frontend/.env.local` are git-ignored. `.env.example` sets `ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173` for Vite.

## Render setup (`render.yaml`)

| Service | Type | Root | Build | Start / publish |
|---|---|---|---|---|
| `pathwayai-api` | Web service, Python 3.11.9, free plan, Ohio | `backend/` | `pip install -r requirements.txt` | `uvicorn main:app --host 0.0.0.0 --port $PORT --proxy-headers --forwarded-allow-ips "*"`, health check `/health` |
| `pathwayai-web` | Static site, Node 22 | `frontend/` | `npm ci && npm run build` | publishes `dist/`; rewrite `/*` → `/index.html` (BrowserRouter) |

Both have `buildFilter` paths, so a frontend-only change doesn't redeploy the API and vice versa.

### Environment variables
| Name | Service | Set how | Notes |
|---|---|---|---|
| `GEMINI_API_KEY` | api | `sync: false` (prompted on first apply) | Secret |
| `YOUTUBE_API_KEY` | api | `sync: false` | Optional secret; leave blank for search links only |
| `ALLOWED_ORIGINS` | api | `sync: false` | The static site's URL, e.g. `https://pathwayai-web.onrender.com` (no trailing slash) |
| `PYTHON_VERSION` | api | in `render.yaml` | `3.11.9` (matches local) |
| `GEMINI_MODEL`, `GEMINI_TIMEOUT_SECONDS`, `RATE_LIMIT_PER_MINUTE`, `RATE_LIMIT_PER_DAY`, `GLOBAL_AI_LIMIT_PER_DAY`, `LOG_LEVEL` | api | optional, Dashboard | Defaults in `backend/config.py` |
| `VITE_API_URL` | web | `sync: false` | The API's URL, e.g. `https://pathwayai-api.onrender.com`. **Build time**: redeploy the site after changing it |
| `NODE_VERSION` | web | in `render.yaml` | `22` (Vite 7 needs ≥ 20.19) |
| `SUPABASE_URL` | api | `sync: false` | Optional (ADR-018): `https://pczczkmkavmxibxureck.supabase.co`. Issuer + JWKS for token checks; not a secret. Unset → `/api/me` 503, AI routes unchanged |
| `DATABASE_URL` | api | `sync: false` | Optional **secret** (ADR-019, Milestone 2): `postgresql://pathwayai_api.<project-ref>:<password>@<pooler-host>:6543/postgres?sslmode=require` — Supabase transaction pooler, least-privilege `pathwayai_api` role (never `postgres`/service_role). Unset → `/api/roadmaps*` 503 (signed-in users can't save roadmaps); guests unchanged |
| `DB_POOL_MAX` | api | optional, Dashboard | Max pooled connections per instance (default 5) |
| `RESUME_ANALYSIS_ENABLED` | api | `"false"` in the Blueprint | Résumé analysis (ADR-020, Milestone 3). Set `true` **only** with a `GEMINI_API_KEY` from a paid (billing-enabled) Google project: the unpaid tier's terms forbid personal information. `false` → `POST /api/resume-analyses` returns 503 before reading the upload. Needs `SUPABASE_URL` and `DATABASE_URL`. Invalid values stop startup |
| *(Supabase dashboard)* | auth | Authentication → URL Configuration | Add `<frontend origin>/reset-password` to **Redirect URLs** so password-reset links work (ADR-022). Recommended: Authentication → Providers → Email → **Secure password change** on, and leaked-password protection (paid plans) |
| `LINK_CHECK_ENABLED` | api | `"true"` in the Blueprint | Check AI-suggested resource links with one HEAD request each before a roadmap is shown and drop clearly broken ones (404/410, no such host, non-HTTPS). Public HTTPS on port 443 only; hosts are vetted at connect time (no private/loopback/link-local/metadata addresses, no DNS rebinding); redirects re-checked. Needs outbound internet; `false` skips it |
| `COACH_ENABLED` | api | `"true"` in the Blueprint | AI Coach (ADR-021, Milestone 4). `false` → `POST /api/coach/messages` returns 503 and the page says the coach isn't available. Needs `SUPABASE_URL` and `DATABASE_URL`. Each message is one Gemini request. Invalid values stop startup |
| `COACH_LIMIT_PER_HOUR` / `COACH_LIMIT_PER_DAY` / `COACH_GLOBAL_LIMIT_PER_DAY` | api | optional, Dashboard | Coach messages per signed-in user per hour (default 20) and day (60), and for everyone per day (300). In process memory |
| `RESUME_LIMIT_PER_HOUR` / `RESUME_LIMIT_PER_DAY` / `RESUME_GLOBAL_LIMIT_PER_DAY` | api | optional, Dashboard | Résumé analyses per signed-in user per hour (default 3) and day (10), and for everyone per day (100). In process memory, like the other limits |
| `VITE_SUPABASE_URL` | web | `sync: false` | Optional, build time: same project URL. Unset → no account UI (guest-only build) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | web | `sync: false` | Optional, build time: the `sb_publishable_…` key (public by design). **Never** the secret / service_role key |

### Supabase (accounts, ADR-018)
- Project `pczczkmkavmxibxureck`, free plan. Schema: `supabase/migrations/` (see `docs/database.md`).
- **Authentication → URL Configuration** (Supabase Dashboard, owner): set **Site URL** to the live site (`https://pathwayai-web.onrender.com` once deployed; `http://localhost:5173` until then) and add **Redirect URLs** `http://localhost:5173/**` and `https://pathwayai-web.onrender.com/**`. The sign-up confirmation link redirects to `<origin>/home`; an origin that isn't listed falls back to the Site URL.
- **Authentication → Providers → Email**: enabled, "Confirm email" on (the default). The free plan's built-in email sender is rate-limited (a few emails per hour) and meant for testing: set up custom SMTP before a public launch.
- Password rules: the app asks for ≥ 8 characters; you can enforce the same minimum under Authentication → Providers → Email.
- **Database role for the API (ADR-019):** `pathwayai_api` is created by migration `20261004014249_create_roadmaps` without a password. To enable it (done for the dev project on 2026-10-03, M2-4), generate a strong password locally and run `alter role pathwayai_api with login password '<SCRAM-SHA-256 hash>'` in the SQL Editor — a hash, not the plain password, because the project logs DDL statements — then put the matching `DATABASE_URL` in the API's environment. Get the pooler host from **Connect → Transaction pooler**. Check: `supabase/tests/m2_4_api_role_connection.py`.
- Verify after deploying: sign up with a real inbox → the link lands on `/home` signed in → header shows the email → `GET /api/me` with the session token returns 200 → sign out.

### First deploy (after Version 2, when the owner approves)
1. Push `main` to GitHub (the Blueprint is read from the repo).
2. Render Dashboard → **New → Blueprint** → pick `YussafZarifi/pathway-ai` (grant Render access to the private repo).
3. Enter the `sync: false` values. The URLs aren't known before the first deploy, so either:
   - use the predictable names (`https://pathwayai-api.onrender.com`, `https://pathwayai-web.onrender.com`). Render appends a suffix if a name is taken; or
   - deploy once, copy the real URLs into `ALLOWED_ORIGINS` and `VITE_API_URL`, then redeploy the static site (rebuild) and restart the API.
4. Check `https://<api>/health` returns `{"status":"ok"}`, then run the quiz → results → dashboard flow on the static site.

### Free-plan behaviour
- The free web service sleeps after ~15 minutes idle; the first request can take up to about a minute. The frontend timeout is 90 s for this reason, and the career loader covers the wait.
- A restart or deploy resets the in-memory rate limits and YouTube cache.
- Upgrading `pathwayai-api` to a paid plan removes the sleep; nothing else changes.

## Later (🗺️)
| Piece | Plan |
|---|---|
| Database | Supabase Postgres (ADR-018/019): `profiles` (Milestone 1); roadmap tables + `pathwayai_api` role (Milestone 2, F-8, in progress) |
| Shared rate limits / cache | Render Key Value (Redis-compatible) once there is more than one instance |
| Errors | Sentry (F-11) |
| Containers | Optional `backend/Dockerfile` + `docker-compose.yml` for local dev (F-5) |

### CI/CD (GitHub Actions, F-4)
1. On PR: install → lint → unit tests (FE + BE) → build → Playwright E2E (mocked API).
2. Render auto-deploys `main`; switch `autoDeployTrigger` to `checksPass` once CI exists.

## Production checklist
- [x] Env-based config, `.env.example` committed, real `.env` ignored
- [x] Rate limiting and request size limits on AI routes
- [x] Generic error responses, no personal data in logs
- [x] `/health` endpoint used by the platform health check
- [x] CORS restricted to configured origins (HTTPS comes from Render)
- [ ] Sentry wired up
- [ ] Gemini paid tier (free tier = 20 requests/day) + budget alert in Google Cloud; `GLOBAL_AI_LIMIT_PER_DAY` set to match
- [x] AI output validated with one retry; failures logged with request IDs (ADR-015)
- [x] Backend tests (100, pytest; run locally)
- [ ] Supabase Site URL + Redirect URLs set for the live domain; custom SMTP before public launch
- [ ] Frontend tests + CI
- [ ] `YOUTUBE_API_KEY` set (owner: required before public launch)
- [ ] Production verified (D-4)
- [ ] README has the live URL
