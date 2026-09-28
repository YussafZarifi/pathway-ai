# Deployment

## Current state
**Deployment-ready for Render, not deployed yet** (as of 2026-09-27). The owner reviews the changes first.

Done (ADR-014):
- No hard-coded URLs: the frontend reads `VITE_API_URL` (the build fails without it); the backend reads `ALLOWED_ORIGINS`.
- `backend/.env.example` and `frontend/.env.example` document every variable.
- `/health` endpoint for the platform health check.
- Request validation, a 16 KB body limit, in-memory rate limiting (per IP and global), generic error messages, no quiz answers or AI output in logs.
- `render.yaml` Blueprint, validated against Render's JSON schema.

Still missing before a public launch (not blockers for a first deploy):
- No tests or CI (F-2–F-4); no error tracking (F-11).
- **Gemini free-tier quota: 20 requests per day** for `gemini-2.5-flash-lite` (measured 2026-09-27). That's about 10 quiz runs a day in total; after that, users see "PathwayAI has reached its AI usage limit for now" until the daily reset. Before sharing the URL widely, enable billing on the Google AI Studio / Cloud project (paid tier) and set `GLOBAL_AI_LIMIT_PER_DAY` to the spend you accept. (AI output is validated and retried since ADR-015.)
- No Gemini budget alert. The global daily cap (`GLOBAL_AI_LIMIT_PER_DAY`) is the only spend guard.

## Local development
```bash
# backend (terminal 1)
cd backend
cp .env.example .env          # set GEMINI_API_KEY (and optionally YOUTUBE_API_KEY)
uvicorn main:app --reload --port 8000

# frontend (terminal 2)
cd frontend
cp .env.example .env.local    # VITE_API_URL=http://127.0.0.1:8000
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

### First deploy (when approved)
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
| Database | Render Postgres (or Supabase/Neon) with auth: F-7/F-8 |
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
- [x] Backend tests (60, pytest; run locally)
- [ ] Frontend tests + CI
- [ ] README has the live URL
