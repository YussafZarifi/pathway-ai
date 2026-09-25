# SESSION.md — Latest session log

> Overwrite the "Current session" section at the end of each coding session; move the previous one to "History" (keep history short: date + 1–3 lines).

---

## Current session — 2026-09-25 · Version control + honesty cleanup

### Goal (approved by owner)
ROADMAP N-1 (git) + N-3 (fake data / dead code) + N-4 (dead buttons). Owner changes to the plan: **keep `/home`** and turn it into an honest empty-state hub (future signed-in dashboard); **delete the `/app/*` layout** and anything unreachable after confirming it's unused; small, logical commits, with every deletion explained in its commit message.

### What was done (commits on `main`)
| Commit | Change |
|---|---|
| `07bca25` | `git init`, root `.gitignore`. Confirmed `backend/.env`, both `.venv`s, `node_modules`, `.vite`, `__pycache__` ignored with `git check-ignore`, and grepped the staged files for API-key patterns (only the README placeholder matched) **before** the baseline commit. |
| `2375759` | Deleted the unrouted `/app/*` shell: `AppShell`, `Sidebar`, `Topbar`, `DashboardLayout`, `DashboardHome`, `Coach`, `styles/dashboard.css` (+ its import in `main.jsx`). |
| `e0c40f1` | Deleted the simulated `ResumeAnalyzer.jsx` (`Math.random()` score). |
| `aaa8c6e` | Deleted legacy `Roadmap.jsx`, `GeneratingLoader`, `lib/exportPdf.js`, `lib/matchCareers.js`, `data/careers.js`, `App.css`, `public/assets/*.jpg`. |
| `058d07a` | Rebuilt `/home`: no stats/activity/achievements; "Your roadmaps" empty state; quiz card is a real `<button>`; Resume Analyzer / AI Coach are non-interactive "Planned" cards; `NavLink` nav; removed dead auth/profile/settings/footer links; fixed layout width bug and mobile overflow. |
| `b1edc7f` | Landing: dead Log in / Sign Up → one working "Take the quiz" button. |
| `d8354b3` | Dashboard timeline: removed dead "Save Roadmap" / "Mark as In Progress". |
| `f76ff22` | Results share modal: removed the fake "Copy Link" (pointed at a non-existent `/share/*`) and the "create a free account" prompt; now "Save Your Results" (PDF + print). |
| _(docs)_ | CLAUDE.md, ROADMAP.md, SESSION.md, README.md, ADR-010, and updates to `docs/*`. |

Also deleted the untracked, empty root `.vite/` cache (not part of git).

Before deleting anything, I built an import map from `App.jsx` and grepped every candidate across `src/`, `index.html` and the config files. Nothing that was deleted was referenced by reachable code.

### Verification
- `npm run build` passes after every commit.
- `npm run lint`: **17 errors, 1 warning** (was 21). No new errors; `Home.jsx` is now lint-clean. The remaining ones are `motion` false positives and existing unused imports (N-13).
- `/home` checked in Chrome at 1440px and in 360/375/390/785px iframes: no horizontal scroll, the quiz card navigates to `/quiz`, the planned cards aren't focusable, and there are no console errors. The Landing header was checked at desktop and 375px.
- **Not verified live:** the Results share modal and the Dashboard timeline after the button removals. Both need the backend and a Gemini call to reach. The changes only remove JSX, and build and lint pass.

### Open issues / notes
- Not pushed to a remote yet (N-2).
- The Landing hero is still invisible until JS animation runs (TD-32). It showed up blank in the iframe checks.
- `index.css` still contains dead rules from deleted components (`.roadmapStats`, `.primaryBtn`, three `.comingSoonBadge` definitions) → N-14.
- The Dashboard still reads a `resume_score` metric. No shipped code writes it now, so the resume meter never shows and the employability resume component is always 0 (TD-29).
- `/home` is still reachable only by URL (N-15, after N-7).
- Git warns that LF will be replaced by CRLF on checkout. Consider adding a `.gitattributes` (`* text=auto eol=lf`) before collaborators or CI arrive.

### Current blockers
- **Not deployable:** hard-coded `http://127.0.0.1:8000` and CORS `http://localhost:5173` (N-5).
- **Unsafe to deploy publicly:** open, un-rate-limited AI proxy; raw errors returned; answers logged (N-9).

### Next recommended task
**N-5 + N-6: env-based config and a single API client.** Add `VITE_API_URL` and `ALLOWED_ORIGINS`, commit `.env.example` files, and create `src/lib/api.js` to replace the three duplicated fetches in `Results.jsx`. This removes the first deployment blocker and is small. Push to a private GitHub repo first (N-2, ~5 min) so the work is backed up.

### Open questions (for the owner)
1. ~~Keep `/home`?~~ → Kept as the future signed-in hub (ADR-010).
2. ~~Which dashboard design wins?~~ → Tabbed `/dashboard`; `/app/*` deleted (ADR-010).
3. Target market: Canada-first (CAD salaries, EN/FR) or US?
4. Database/auth preference: Supabase (fast) vs self-managed Postgres + FastAPI JWT (more to show)?
5. Deploy target: Render, Fly.io, Vercel + Render, or something else?
6. Stay on Gemini, or add a provider abstraction? (`openai` is in requirements but unused.)
7. TypeScript migration now (before the codebase grows) or later?
8. Should the "Employability/Momentum" scores stay? They currently measure app engagement, not employability.
9. GitHub repo name and visibility: `roadmap-ai` or `pathway-ai`? Private until when?

---

## History
- 2026-09-25 — Git initialized; fake data, dead buttons and unreachable code removed; `/home` rebuilt as an honest empty state (8 commits + docs).
- 2026-09-24 — Initial audit and documentation. No code changes.
