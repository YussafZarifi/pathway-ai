# SESSION.md — Latest session log

> Overwrite the "Current session" section at the end of each coding session; move the previous one to "History" (keep history short: date + 1–3 lines).

---

## Current session — 2026-09-29 · Pre-deploy fixes, full QA, recruiter review, handoff

### Summary
- **Code-complete for an initial public release.** No production code was written after the final QA pass.
- **Not deployed. Not pushed** to GitHub: `main` is 47 commits ahead of `origin/main`, including this handoff commit.
- The app passed the deployment pre-flight (2026-09-28). The 5 must-fix launch issues were fixed and verified. A full QA pass on desktop, 360 px, keyboard and the complete flow passed.
- 80/80 backend tests pass; the frontend build passes.
- Live `gemini-2.5-flash-lite` testing succeeded, including one temporary Gemini `503 UNAVAILABLE` recovered by the automatic retry (ADR-015).

### 1. Pre-deploy fix batch (5 code commits, ADR-017)
| Commit | Change |
|---|---|
| `4c916c2` | Comparing careers never changes the selected career (TD-50): the compare checkbox is a labelled sibling of the card, not inside its `<button>` (also closes TD-19). On phones the header wraps, so compare mode can't overflow |
| `bd30106` | Every page starts at the top (`ScrollToTop`); Regenerate on the dashboard and on Results scrolls to the top too (TD-51) |
| `279c747` | Honest copy (TD-52): `/home` shows the browser-saved roadmap with real progress, or an accurate empty state; "5-question quiz"; the Results PDF option says it saves career matches |
| `00ca5f1` | Branded 404 page for unknown URLs (F-12's 404 part, TD-16) |
| `1c9a3a4` | "PathwayAI" title, favicon, meta description, OG/Twitter tags; Vite favicon removed (TD-42) |

### 2. Full QA pass (after the fixes)
All passed, on desktop, at 360 px and by keyboard:
- Compare independence, verified end to end: the roadmap was generated for the selected career while two others were ticked.
- Scroll resets on every route (Results at 1,393 px → dashboard at 0) and after Regenerate.
- Both copy states on `/home` and the dashboard.
- 404 page.
- Metadata.
- The full flow, with no horizontal scroll anywhere and no console errors.
- 5 live AI calls, all 200.

One regression was found and fixed during QA: compare mode overflowed at 360 px.

### 3. Recruiter-style review (no code changes)
I walked through the running app as a first-time visitor. **The core loop is strong; the gaps are mostly presentation and trust, not engineering.** The full ranked list is in `docs/recruiter-notes.md`. Tasks are ROADMAP P-1–P-11; debt is TD-21 and TD-59–TD-63.

- **Critical:**
  - No "built by" or About anywhere.
  - Free-tier quota and Render cold start can make the live site look broken or slow.
  - 3 of 13 AI resource links were broken in one roadmap.
  - "Coming soon" is promoted: the Sign up button and 2 of 3 Landing cards.
- **High:**
  - "No video found yet" placeholders (no YouTube key).
  - Unsorted matches (90/85/88) and salaries/growth not labelled as AI estimates.
  - Thin Landing: no "how it works", no screenshot.
  - Inconsistent headers, and no way back to a saved roadmap from Landing.
  - Padded first-visit dashboard stats and insights.
- **Medium/Low:** typography, the quiz card jumping between questions, naming consistency, error message wording and placement, keyboard focus, Esc on dialogs, reduced motion.

### 4. Docs and project memory (this handoff)
- ROADMAP restructured into Completed · 🚀 Ready to Deploy (D-1–D-6) · 🌱 Post-Launch Improvements (P-1–P-11, N-21…) · 🔮 Future Features (F-7 Supabase Auth → F-8 Postgres → F-13 Resume Analyzer → F-18 AI Coach → tests/CI …).
- ADR-018 (proposed): Supabase for authentication and PostgreSQL.
- CLAUDE.md: a "state at a glance" header and §11 rewritten as the Next Session order.
- `docs/deployment.md`: launch sequence and checklist.
- `docs/technical-debt.md`: TD-59–TD-63 added, TD-21 evidence updated.
- `docs/recruiter-notes.md`: review section added.
- `docs/future-features.md`, `docs/frontend.md`: IDs updated.
- README unchanged: it already reflects today's code.

### Deployment readiness
| Item | Status |
|---|---|
| Code, tests, build, QA | ✅ Ready |
| Render Blueprint (`render.yaml`) + steps (`docs/deployment.md`) | ✅ Ready |
| Push to private GitHub (D-1) | ⏳ Owner decision |
| Render plan for the API (D-2) | ⏳ Owner decision: free sleeps ~1 min; Starter is always on |
| Gemini billing + budget alert (D-6) | ⏳ Owner decision; required before **sharing publicly** (free tier ≈ 7–10 quiz runs/day) |
| `YOUTUBE_API_KEY` (D-5) | ⏳ Owner, optional for the deploy; required before **public launch** |

**Current blockers:** only the four owner decisions above. There are no code blockers.

### Next Session (exact order)
1. **Push to private GitHub** (D-1). Wait for the owner's go-ahead; run `git check-ignore backend/.env`; never change repo visibility.
2. **Deploy to Render** (D-2, D-3): apply the Blueprint and set `GEMINI_API_KEY`, `ALLOWED_ORIGINS`, `VITE_API_URL` (+ `YOUTUBE_API_KEY`).
3. **Verify production** (D-4): `/health`, Landing → Quiz → Results → Dashboard → Regenerate, 404, CORS, request-ID logs, console. Then add the live URL to the README and `og:url`/`og:image` (N-22).
4. **Add Supabase Authentication** (F-7): confirm ADR-018's open details first (OAuth providers, token verification in FastAPI, env vars).
5. **Add the PostgreSQL database** (F-8, Supabase Postgres): schema + migrations + RLS, and import the browser-saved roadmap on first sign-in.
6. **Build the Resume Analyzer** (F-13).
7. **Build the AI Coach** (F-18).

Before sharing the URL with recruiters: D-5, D-6, and ideally P-1–P-6 (built-by footer, About, How it works + screenshot, sorted matches, AI-estimate labels, fewer "Coming soon").

### Open questions (for the owner)
1. Gemini billing now, or deploy privately on the free tier first?
2. Render API plan: free or Starter?
3. Supabase details (ADR-018): which sign-in methods (email, GitHub, Google)? Free or paid Supabase plan?
4. The name and links for the "Built by" footer (GitHub, LinkedIn, portfolio).
5. Carried over: target market (Canada-first, CAD salaries, EN/FR?); when to make the repo public (F-17).

---

## History
- 2026-09-28 (evening) — Pre-flight: docs synced with the code; live `gemini-2.5-flash-lite` check (7/7 ok, v1 + v2); manual desktop / 360 px / keyboard QA; readiness report; findings TD-50–TD-58 → N-20 (fixed 2026-09-29) and N-21.
- 2026-09-28 (day) — 5-question quiz (ADR-016): backend accepts v1 + v2 answer formats (v1 prompts byte-identical), new quiz UI (multi-select, weekly-hours buttons, optional career field), TD-26 fixed, 80 backend tests; verified on `gemini-2.5-flash`.
- 2026-09-27 (part 2) — Investigated the "intermittent roadmap failure": 25 live calls, 0 malformed JSON; the real limit is Gemini's free tier (20 requests/day). Added JSON mode + response schema, per-item validation, one retry, 503 quota/busy messages, content-free diagnostics with request IDs, and the first 60 backend tests (ADR-015).
- 2026-09-27 (part 1) — Deployment readiness (ADR-014): env-only config (`ALLOWED_ORIGINS`, `VITE_API_URL`, build fails without it), every request through `lib/api.js`, Pydantic request validation, in-memory rate limits, generic errors, no user data in logs, `/health`, `render.yaml` (Render chosen, not deployed). Local `backend/.env` gained `ALLOWED_ORIGINS`; `frontend/.env.local` created.
- 2026-09-26 — Landing Log in / Sign up → "accounts coming soon" dialog; `/home` polish; real YouTube videos per step (ADR-012); dashboard redesign with persisted roadmap and per-roadmap progress (ADR-013); polish passes and shared `VideoCard`.
- 2026-09-25 (part 2) — Pushed full history to the private GitHub repo `YussafZarifi/pathway-ai` (secret scan of history clean; placeholder README commits replaced with `--force-with-lease` by the owner).
- 2026-09-25 (part 1) — Git initialized; fake data, dead buttons and unreachable code removed; `/home` rebuilt as an honest empty state (8 commits + docs). ADR-010.
- 2026-09-24 — Initial audit and documentation. No code changes.
