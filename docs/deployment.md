# Deployment

## Current state
**Not deployed. Not deployable as-is.** Blockers:
1. The frontend fetches a hard-coded `http://127.0.0.1:8000` (`Results.jsx`).
2. Backend CORS only allows `http://localhost:5173`.
3. AI endpoints have no rate limiting or auth, so a public URL exposes the Gemini quota.
4. No CI, Dockerfile or environment separation. (Git was initialized on 2026-09-25 with a root `.gitignore` that excludes `backend/.env`.)

### How it runs today (local only)
```bash
# backend
cd backend && uvicorn main:app --reload --port 8000
# frontend
cd frontend && npm run dev   # :5173
```
Secrets: `backend/.env` → `GEMINI_API_KEY`.

## Target setup (🗺️)

| Piece | Option A (simple) | Option B (all-in-one) |
|---|---|---|
| Frontend | Vercel / Netlify static | Render Static Site |
| Backend | Render Web Service / Fly.io (Docker) | Render Web Service (Docker) |
| Database | Supabase / Neon Postgres | Render Postgres |
| Cache / rate limit | Upstash Redis | Render Key Value |
| Errors | Sentry | Sentry |

Decision pending (see SESSION.md open questions). Record the choice as an ADR.

### Environment variables
| Name | Service | Notes |
|---|---|---|
| `GEMINI_API_KEY` | backend | Secret |
| `GEMINI_MODEL` | backend | Default `gemini-2.5-flash-lite` |
| `ALLOWED_ORIGINS` | backend | Comma-separated frontend origins |
| `DATABASE_URL` | backend | Once Postgres exists |
| `REDIS_URL` | backend | Rate limiting and cache |
| `SENTRY_DSN` | both | Optional |
| `VITE_API_URL` | frontend (build time) | Backend base URL |

### Containers
- `backend/Dockerfile`: multi-stage `python:3.12-slim`, non-root user, `uvicorn main:app --host 0.0.0.0 --port $PORT`, healthcheck on `/health`.
- `frontend/Dockerfile` (optional): build with Node, serve `dist/` with nginx and an SPA fallback.
- `docker-compose.yml`: frontend, backend, postgres, redis for one-command local dev.

### SPA routing
The static host must rewrite unknown paths to `/index.html` (React Router `BrowserRouter`).

### CI/CD (GitHub Actions)
1. On PR: install → lint → unit tests (FE + BE) → build → Playwright E2E (mocked API).
2. On merge to `main`: deploy backend, then frontend. Run migrations before the backend starts serving.
3. Preview deployments per PR (Vercel/Render previews).

### Production checklist
- [ ] Env-based config, `.env.example` committed, real `.env` ignored
- [ ] Rate limiting and request size limits on AI routes
- [ ] Generic error responses, no personal data in logs
- [ ] `/health` endpoint used by the platform health check
- [ ] HTTPS only; CORS restricted to real origins
- [ ] Sentry wired up
- [ ] Gemini budget alert / quota cap
- [ ] README has the live URL
