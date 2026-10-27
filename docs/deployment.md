# Deployment

## Current state
**Version 1.0 release preparation is verified locally; the application is not deployed.** Render remains the backend production target; the Vite frontend can deploy to either Render or Vercel. Supabase accounts are optional per environment; the Resume Analyzer additionally requires a paid Gemini project and `RESUME_ANALYSIS_ENABLED=true` before it accepts personal PDFs.

### Keeping the release deployable
The deploy waits, but the project must stay shippable at every commit:
- Backend tests pass (`cd backend && python -m pytest -q`); `npm run lint` at or below its baseline; `npm run build` passes with `VITE_API_URL` set.
- The guest flow works with the Supabase variables unset (guest-only build) and set.
- Every new environment variable is added in the same commit to the `.env.example` files, `render.yaml` (`sync: false` for secrets) and the table below. Every new backend dependency is pinned in `requirements.txt`.
- Every schema change is a Supabase CLI migration in `supabase/migrations/`, applied to the project, security advisors clean.
- Nothing here assumes a single long-lived process beyond what's documented (in-memory rate limits, YouTube cache); new features that need shared state or background work say so in their ADR, with the Render piece they'd need.

### Deployment sequence
1. Run the release checks in this document and confirm `backend/.env`, `frontend/.env.local` and `frontend/.env.e2e` remain ignored.
2. Create the approved release commit and tag, then push the private repository so GitHub Actions runs.
3. Choose the Render plan for `pathwayai-api` (free sleeps; Starter is always on) and apply the Blueprint.
4. Set `sync: false` values in Render, including Gemini, database, origin and frontend API URL settings. Enable résumé analysis only with a paid Gemini project.
5. Verify `/health`, the guest flow, signed-in persistence, résumé analysis, grounded coaching fallback behavior, CORS, request-ID logs and browser console output. Add the production URL to the README after it is live.
6. Before public sharing, configure Gemini billing and a budget alert, production Supabase redirect URLs and custom SMTP. Set `YOUTUBE_API_KEY` if embedded video results are required instead of search links.

Done (ADR-014):
- No hard-coded URLs: the frontend reads `VITE_API_URL` (the build fails without it); the backend reads `ALLOWED_ORIGINS`.
- `backend/.env.example` and `frontend/.env.example` document every variable.
- `/health` endpoint for the platform health check.
- Request validation, a 16 KB body limit, in-memory rate limiting (per IP and global), generic error messages, no quiz answers or AI output in logs.
- `render.yaml` Blueprint, validated against Render's JSON schema.

Still required before a public launch:
- Production error monitoring is not configured.
- **Gemini free-tier quota: 20 requests per day** for `gemini-2.5-flash-lite` (measured 2026-09-27). That's about 7–10 quiz runs a day in total (a run uses 2–3 requests, plus any retry); after that, users see "PathwayAI has reached its AI usage limit for now" until the daily reset. Before sharing the URL widely, enable billing on the Google AI Studio / Cloud project (paid tier) and set `GLOBAL_AI_LIMIT_PER_DAY` to the spend you accept. (AI output is validated and retried since ADR-015.)
- No Gemini budget alert. The global daily cap (`GLOBAL_AI_LIMIT_PER_DAY`) is the only spend guard.

## Local development
```bash
# backend (terminal 1)
cd backend
cp .env.example .env          # set GEMINI_API_KEY (optional: YOUTUBE_API_KEY, SUPABASE_URL, DATABASE_URL)
uvicorn main:app --reload --port 8000 --no-proxy-headers

# frontend (terminal 2)
cd frontend
cp .env.example .env.local    # VITE_API_URL=http://127.0.0.1:8000 (optional: VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY)
npm run dev                   # http://localhost:5173
```
`backend/.env` and `frontend/.env.local` are git-ignored. `.env.example` sets `ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173` for Vite.

For local development, keep `TRUSTED_PROXY_MODE=none` and `TRUSTED_PROXY_CIDRS` empty. Run Uvicorn with `--no-proxy-headers`; rate limits then use the direct socket peer and ignore forwarded headers. The same command keeps localhost requests predictable even if a browser or test client supplies `X-Forwarded-For`.

## Render setup (`render.yaml`)

| Service | Type | Root | Build | Start / publish |
|---|---|---|---|---|
| `pathwayai-api` | Web service, Python 3.11.9, free plan, Ohio | `backend/` | `pip install -r requirements.txt` | `uvicorn main:app --host 0.0.0.0 --port $PORT --no-proxy-headers`, health check `/health` |
| `pathwayai-web` | Static site, Node 22 | `frontend/` | `npm ci && npm run build` | publishes `dist/`; rewrite `/*` → `/index.html` (BrowserRouter) |

Both have `buildFilter` paths, so a frontend-only change doesn't redeploy the API and vice versa.

## Vercel frontend setup

Vercel hosts the Vite frontend only; the FastAPI API remains a separately deployed service. Import the repository, set the Vercel project's **Root Directory** to `frontend`, and allow Vercel to detect Vite. The existing `build` script produces `dist/`, which Vercel detects automatically. `frontend/vercel.json` contains only the SPA fallback required by `BrowserRouter`, so direct visits to routes such as `/resume` load the app instead of returning a 404.

Set these Production and Preview environment variables in Vercel before deploying:

| Name | Required | Value |
|---|---|---|
| `VITE_API_URL` | Yes | Public HTTPS URL of the deployed FastAPI API, without a trailing slash |
| `VITE_SUPABASE_URL` | Optional | Supabase project URL; leave unset for a guest-only build |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Optional | Supabase `sb_publishable_...` key; never a secret or service-role key |

Use Node.js 22, `npm run build`, and output directory `dist` if Vercel does not auto-detect them. Vite embeds `VITE_*` values at build time: redeploy after changing one. Update the API's `ALLOWED_ORIGINS` to include the final `https://<project>.vercel.app` origin, and add the same frontend origin to Supabase's Site URL and Redirect URLs.

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
| `RAG_RETRIEVER` | api | `"langchain"` in the Blueprint | Selects the résumé-guidance retriever: `langchain` is the production default; `native` remains an equivalent provider-neutral alternative. |
| `RAG_COACHING_ENABLED` | api | `"true"` in the Blueprint | Enables additive, grounded résumé coaching. Disabling it never disables deterministic analysis. |
| `RAG_COACHING_TIMEOUT_SECONDS` | api | default `5` | Per coaching model request budget. A timeout returns `ai_coaching.status: "unavailable"` while preserving the deterministic analysis. |
| `RAG_EMBEDDING_PROVIDER`, `GEMINI_EMBEDDING_MODEL`, `GEMINI_EMBEDDING_DIMENSIONS` | api | defaults `gemini`, `gemini-embedding-001`, `768` | Embedding configuration for the curated in-memory résumé-guidance index. |
| *(Supabase dashboard)* | auth | Authentication → URL Configuration | Add `<frontend origin>/reset-password` to **Redirect URLs** so password-reset links work (ADR-022). Recommended: Authentication → Providers → Email → **Secure password change** on, and leaked-password protection (paid plans) |
| `LINK_CHECK_ENABLED` | api | `"true"` in the Blueprint | Check AI-suggested resource links with one HEAD request each before a roadmap is shown and drop clearly broken ones (404/410, no such host, non-HTTPS). Public HTTPS on port 443 only; hosts are vetted at connect time (no private/loopback/link-local/metadata addresses, no DNS rebinding); redirects re-checked. Needs outbound internet; `false` skips it |
| `API_DOCS_ENABLED` | api | `"false"` in the Blueprint | Controls FastAPI's `/docs`, `/redoc` and `/openapi.json`. Keep disabled in production; set `true` only for local development |
| `TRUSTED_PROXY_MODE` | api | `"render"` in the Blueprint | Trust Render's Cloudflare-overwritten `CF-Connecting-IP` header. Uvicorn proxy rewriting is disabled so raw socket peers remain available for the app's trust checks |
| `TRUSTED_PROXY_CIDRS` | api | unset on Render | For other platforms, set `TRUSTED_PROXY_MODE=cidrs` and list the exact IPv4/IPv6 proxy CIDRs. The app accepts XFF only when the immediate socket peer matches one of them |
| `COACH_ENABLED` | api | `"true"` in the Blueprint | AI Coach (ADR-021, Milestone 4). `false` → `POST /api/coach/messages` returns 503 and the page says the coach isn't available. Needs `SUPABASE_URL` and `DATABASE_URL`. Each message is one Gemini request. Invalid values stop startup |
| `COACH_LIMIT_PER_HOUR` / `COACH_LIMIT_PER_DAY` / `COACH_GLOBAL_LIMIT_PER_DAY` | api | optional, Dashboard | Coach messages per signed-in user per hour (default 20) and day (60), and for everyone per day (300). In process memory |
| `RESUME_LIMIT_PER_HOUR` / `RESUME_LIMIT_PER_DAY` / `RESUME_GLOBAL_LIMIT_PER_DAY` | api | optional, Dashboard | Résumé analyses per signed-in user per hour (default 3) and day (10), and for everyone per day (100). In process memory, like the other limits |
| `VITE_SUPABASE_URL` | web | `sync: false` | Optional, build time: same project URL. Unset → no account UI (guest-only build) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | web | `sync: false` | Optional, build time: the `sb_publishable_…` key (public by design). **Never** the secret / service_role key |

Render mode is safe for this public web service because Render routes public requests through its managed Cloudflare and load-balancer ingress; Render documents that the service port is not directly reachable and that Cloudflare overwrites `CF-Connecting-IP`. Do not enable `render` mode on another host. For a future proxy, set `TRUSTED_PROXY_MODE=cidrs`, set `TRUSTED_PROXY_CIDRS` to only that provider's documented proxy source networks (comma-separated IPv4 and/or IPv6 CIDRs), and keep `--no-proxy-headers`. The trusted proxy must append the actual client and proxy hops to a single `X-Forwarded-For` field; the API walks from the right and skips only trusted CIDRs. Never use `0.0.0.0/0` or `::/0` as trusted proxy CIDRs. If the provider cannot provide stable proxy source ranges, use a provider-authenticated client-IP header and a dedicated deployment mode rather than trusting XFF from all peers.

### Supabase (accounts, ADR-018)
- Project `pczczkmkavmxibxureck`, free plan. Schema: `supabase/migrations/` (see `docs/database.md`).
- **Authentication → URL Configuration** (Supabase Dashboard, owner): set **Site URL** to the live site (`https://pathwayai-web.onrender.com` once deployed; `http://localhost:5173` until then) and add **Redirect URLs** `http://localhost:5173/**` and `https://pathwayai-web.onrender.com/**`. The sign-up confirmation link redirects to `<origin>/home`; an origin that isn't listed falls back to the Site URL.
- **Authentication → Providers → Email**: enabled, "Confirm email" on (the default). The free plan's built-in email sender is rate-limited (a few emails per hour) and meant for testing: set up custom SMTP before a public launch.
- Password rules: the app asks for ≥ 8 characters; you can enforce the same minimum under Authentication → Providers → Email.
- **Database role for the API (ADR-019):** `pathwayai_api` is created by migration `20261004014249_create_roadmaps` without a password. To enable it (done for the dev project on 2026-10-03, M2-4), generate a strong password locally and run `alter role pathwayai_api with login password '<SCRAM-SHA-256 hash>'` in the SQL Editor — a hash, not the plain password, because the project logs DDL statements — then put the matching `DATABASE_URL` in the API's environment. Get the pooler host from **Connect → Transaction pooler**. Check: `supabase/tests/m2_4_api_role_connection.py`.
- Verify after deploying: sign up with a real inbox → the link lands on `/home` signed in → header shows the email → `GET /api/me` with the session token returns 200 → sign out.

### First deploy (after Version 1.0 release approval)
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
| Database | Supabase Postgres (ADR-018/019): profiles, roadmaps, progress, résumé analyses, coach data and the `pathwayai_api` role are implemented |
| Shared rate limits / cache | Render Key Value (Redis-compatible) once there is more than one instance |
| Errors | Sentry (F-11) |
| Containers | Optional `backend/Dockerfile` + `docker-compose.yml` for local dev (F-5) |

### CI/CD (GitHub Actions, F-4)
1. GitHub Actions currently runs backend pytest + pip-audit and frontend lint, Vitest, build and npm audit without secrets.
2. Playwright remains a local release check. Enable it in CI only when its browser-install/runtime budget is accepted.
3. Render auto-deploys only when the owner enables it for the private repository.

## Production checklist
- [x] Env-based config, `.env.example` committed, real `.env` ignored
- [x] Rate limiting and request size limits on AI routes
- [x] Generic error responses, no personal data in logs
- [x] `/health` endpoint used by the platform health check
- [x] CORS restricted to configured origins (HTTPS comes from Render)
- [ ] Sentry wired up
- [ ] Gemini paid tier (free tier = 20 requests/day) + budget alert in Google Cloud; `GLOBAL_AI_LIMIT_PER_DAY` set to match
- [x] AI output validated with one retry; failures logged with request IDs (ADR-015)
- [x] Backend pytest, frontend lint/Vitest/build and local Playwright release checks
- [ ] Supabase Site URL + Redirect URLs set for the live domain; custom SMTP before public launch
- [x] Frontend tests + CI
- [ ] `YOUTUBE_API_KEY` set (owner: required before public launch)
- [ ] Production verified (D-4)
- [ ] README has the live URL
