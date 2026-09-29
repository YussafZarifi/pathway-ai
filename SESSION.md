# SESSION.md — Latest session log

> Overwrite the "Current session" section at the end of each coding session; move the previous one to "History" (keep history short: date + 1–3 lines).

---

## Current session — 2026-09-28 (evening) · Pre-flight: docs sync, live flash-lite check, manual QA, readiness report

### Goal (owner request)
Pre-flight only, before deciding whether to deploy: (1) make every doc match the application, (2) verify the 5-question quiz on the production model `gemini-2.5-flash-lite`, (3) manual QA on desktop, 360 px and keyboard through Landing → Quiz → Results → Dashboard → Regenerate, (4) check links, layout, console errors and accessibility, (5) write a deployment readiness report. **No deploy, no push, no code changes.**

### What was done
1. **Docs** (`767de72`):
   - README: the dashboard description (the Employability/Momentum meters are gone), data flow, AI pipeline, scripts, folder structure.
   - `architecture.md`, `database.md` (both localStorage keys), `frontend.md`, `testing.md`, `deployment.md`, `technical-debt.md`, `ui-design.md`, `recruiter-notes.md`, `backend.md`, `ai-system.md`: facts from before 2026-09-26 corrected (unscoped progress, hard-coded URL, 60 tests, lint counts, line counts).
   - ROADMAP: N-11 closed by C-24.
2. **Live check on `gemini-2.5-flash-lite`:**
   - How it ran: a separate API on :8001 and Vite on :5174, so the owner's :8000/:5173 servers were untouched and the logs were readable.
   - Result: 7 calls, **7 ok on the first attempt**, all `strategy=direct finish=STOP`, 2.0–4.0 s: career v2 ×3, roadmap v2 ×3, roadmap v1 ×1 (an old saved-answers Regenerate).
   - Quota: these 7 calls used 7 of today's 20 free requests.
3. **Manual QA** in Chrome:
   - Desktop: 2560 px viewport.
   - Mobile: 360 px, via a same-origin 360×780 iframe, because the window couldn't be resized.
   - Keyboard: the whole desktop quiz and Results flow.
   - Note: the Chrome window was occluded between tool calls (`visibilityState: hidden`), so framer-motion only advanced while screenshots were being taken. Every transition completed.
4. **Findings** recorded as TD-50–TD-58 and ROADMAP N-20 (P0 pre-deploy batch) + N-21 (P1 a11y/quality batch). Nothing was fixed (pre-flight only). No ADR: no architectural change.

### Deployment readiness report

**Verdict: not ready to share publicly yet. It's ready after a small fix batch (N-20, about 1–2 h) and your Gemini billing decision.** The core flow works end to end on the production model. The remaining issues are a few visible bugs and copy problems that a recruiter would notice in the first minute, not infrastructure problems.

#### Passed
| Area | Result |
|---|---|
| Full flow Landing → Quiz → Results → Dashboard → Regenerate | Works on desktop (keyboard only) and at 360 px (pointer) |
| Production model | 7/7 first-attempt successes, v1 + v2 formats, 2–4 s per call |
| AI quality | Reasons cite 2–4 of the user's answers; career in mind included with an honest score; step times paced to weekly hours (10 h/week → ~4–6 months; the dashboard's "time left" = the sum of the steps) |
| Persistence | Mark done → reload → 20% and a dated achievement kept; undo works; regenerate replaces the roadmap and resets progress, as the confirm dialog says |
| Quiz a11y | Labelled groups, `aria-pressed`, `aria-live` "n of 3 selected", limit of 3 enforced, visible focus rings, labelled optional field, Back keeps answers |
| Dialogs on the native `Dialog` (Accounts, Regenerate) | Focus moves in, Esc closes, focus returns |
| Layout | No horizontal scroll on any page at 360 px or on desktop; Q1 grid 3→2 columns, hours 4→2×2 |
| Links | Internal nav links valid; external links `target=_blank rel="noopener noreferrer"`; YouTube search fallback works (no `YOUTUBE_API_KEY`) |
| Edge routes | `/results` opened directly → `/quiz`; dashboard empty state renders |
| Server | No 4xx/5xx, no retries; backend 80/80 tests; build passes |

#### Must fix before sharing the URL (N-20)
| # | Issue | Evidence |
|---|---|---|
| 1 | **Ticking a compare checkbox changes the selected career** (TD-50) | Checked Data Scientist while ML Engineer was selected → Data Scientist became "Selected"; "Generate roadmap" would have used it |
| 2 | **Mobile lands mid-dashboard** (TD-51) | After "Generate roadmap" at 360 px, `/dashboard` opened at `scrollTop` 976, past the hero |
| 3 | **Outdated copy** (TD-52) | Dashboard empty state: "Take the **8-question** quiz"; `/home`: "roadmaps aren't saved… for the current session" + "No saved roadmaps yet" while a roadmap was stored |
| 4 | **Blank page for unknown URLs** (F-12) | `/definitely-not-a-page` → empty `#root`; Render rewrites every path to `index.html` |
| 5 | Tab title "roadmap-ai", Vite favicon (N-12) | First thing seen in a shared link / browser tab |

#### Owner decisions (blocking a *public* launch, not a private test deploy)
- **Gemini billing (N-16):** the free tier is 20 requests/day. QA used 7 today; a dev quiz run costs 2–3 (StrictMode duplicate, TD-53), a production run 2.
- **Push approval:** `main` is 40 commits ahead of `origin/main` (including this session's 2 docs commits); Render builds from GitHub.
- Render plan (free sleeps ~1 min on first request), `YOUTUBE_API_KEY` (optional; steps show a search link without it).

#### Should fix soon (N-21, not blocking)
- Console error on every Results load: `Error fetching careers: AbortError` (TD-53).
- Focus drops to `<body>` after each quiz step and after regenerate (TD-54).
- Landing "Roadmap Generator" card is focusable but ignores Enter/Space; career cards lack `aria-pressed`; compare checkbox unlabelled (TD-55).
- Compare and Share modals: no Esc, no focus move (TD-20).
- framer-motion ignores `prefers-reduced-motion` (TD-33).
- AI resource links: 1 of 13 invented (a LinkedIn article that redirects to "article not found") (TD-21).
- Compare modal "Work environment: N/A" row (TD-56).
- Mobile Results: the first card is below the fold (TD-57).
- SDK AFC WARNING on every Gemini call (TD-58).
- Lint 12 errors; no frontend tests; no CI.

### Verification
| Check | Result |
|---|---|
| `python -m pytest -q` | 80 passed |
| `npm run lint` / `npm run build` | 12 errors, 0 warnings / passes (main chunk 427 KB, 137 KB gzip) |
| `git check-ignore backend/.env frontend/.env.local` | both ignored; docs commit contained only docs |
| Owner's servers | :8000 and :5173 still running, untouched; QA servers stopped |

### Open issues / notes
- **Git:** 1 docs commit so far this session (+ this end-of-session docs commit); **`main` is ahead of `origin/main`, not pushed** (owner said don't push).
- The QA browser origin (:5174) holds test roadmap data in its own localStorage; the owner's :5173 data wasn't touched.

### Next recommended task
1. **N-20 pre-deploy fix batch** (TD-50, TD-51, TD-52, F-12 404 route, N-12 title/favicon), each with a lint/build check and a quick browser re-check.
2. Owner: Gemini billing (N-16) + push approval → **F-1 deploy to Render**.
3. N-21 accessibility/quality batch, then frontend tests + CI (F-2–F-4).

### Open questions (for the owner)
1. Fix N-20 first and then deploy, or deploy privately now and fix on the live site?
2. Enable Gemini billing before deploying, or start on the free tier (≈10 quiz runs/day)?
3. Render API plan: free (sleeps) or Starter (always on)?
4. Add a `YOUTUBE_API_KEY` for real videos before launch?
5. Carried over: target market (Canada-first?), database/auth choice, provider abstraction, when to make the repo public (F-17).

---

## History
- 2026-09-28 (day) — 5-question quiz (ADR-016): backend accepts v1 + v2 answer formats (v1 prompts byte-identical), new quiz UI (multi-select, weekly-hours buttons, optional career field), TD-26 fixed, 80 backend tests; verified on `gemini-2.5-flash`.
- 2026-09-27 (part 2) — Investigated the "intermittent roadmap failure": 25 live calls, 0 malformed JSON; the real limit is Gemini's free tier (20 requests/day). Added JSON mode + response schema, per-item validation, one retry, 503 quota/busy messages, content-free diagnostics with request IDs, and the first 60 backend tests (ADR-015).
- 2026-09-27 (part 1) — Deployment readiness (ADR-014): env-only config (`ALLOWED_ORIGINS`, `VITE_API_URL`, build fails without it), every request through `lib/api.js`, Pydantic request validation, in-memory rate limits, generic errors, no user data in logs, `/health`, `render.yaml` (Render chosen, not deployed). Local `backend/.env` gained `ALLOWED_ORIGINS`; `frontend/.env.local` created.
- 2026-09-26 — Landing Log in / Sign up → "accounts coming soon" dialog; `/home` polish; real YouTube videos per step (ADR-012); dashboard redesign with persisted roadmap and per-roadmap progress (ADR-013); polish passes and shared `VideoCard`.
- 2026-09-25 (part 2) — Pushed full history to the private GitHub repo `YussafZarifi/pathway-ai` (secret scan of history clean; placeholder README commits replaced with `--force-with-lease` by the owner).
- 2026-09-25 (part 1) — Git initialized; fake data, dead buttons and unreachable code removed; `/home` rebuilt as an honest empty state (8 commits + docs). ADR-010.
- 2026-09-24 — Initial audit and documentation. No code changes.
