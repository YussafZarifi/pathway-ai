# SESSION.md — Latest session log

> Overwrite the "Current session" section at the end of each coding session; move the previous one to "History" (keep history short: date + 1–3 lines).

---

## Current session — 2026-09-26 · Landing Log in / Sign up buttons (no auth)

### Goal (owner request)
Add Log in / Sign up buttons to the Landing page **without building auth**. The owner picked the "honest dialog" option: the buttons open a dialog saying accounts are coming soon.

### What was done
1. **Orientation:** read all project docs and summarized the state. Recommended N-5 + N-6 (env config + API client); the owner chose this Landing change first, so N-5/N-6 remain the next task.
2. **`frontend/src/components/AccountsSoonDialog.jsx` (new):** a native `<dialog>` opened with `showModal()`. Title "Accounts are coming soon"; copy says no account is needed and that saving roadmaps across devices arrives with accounts; buttons Close and "Take the quiz" (→ `/quiz`). `aria-labelledby`/`aria-describedby`, backdrop click closes, Esc closes, focus returns to the trigger.
3. **`Landing.jsx`:** header "Take the quiz" replaced by **Log in** (`ghostBtn`) and **Sign up** (`uiverseBtn`), both `aria-haspopup="dialog"`. The hero "Get Started" CTA still goes to `/quiz`.
4. **`index.css`:** dialog styles (matching the Share Modal look), `:focus-visible` rings for header and dialog buttons, and a ≤520px rule that shrinks header padding, button size and brand font so everything fits at 360px.
5. **Docs:** CLAUDE.md, ROADMAP.md (C-13), `docs/frontend.md`, ADR-011 in `docs/decisions.md`, this file.

Commit: `81d62a3 feat(landing): add Log in / Sign up buttons with an honest "coming soon" dialog` (plus a docs commit). **Not pushed.**

### Verification
| Check | Result |
|---|---|
| Sign up click (real mouse) | Dialog opens; focus moves inside it (on Close ✕) |
| Log in click + real Esc key | Dialog closes; focus returns to "Log in" |
| Backdrop click | Closes |
| "Take the quiz" | Navigates to `/quiz` |
| 360px viewport (iframe) | No horizontal scroll (scrollWidth = clientWidth); 16px gap between brand and buttons; dialog fits with side margins |
| `npm run lint` | 17 errors / 1 warning, identical to before (the Landing error is the known `motion` false positive, TD-35) |
| `npm run build` | Passes |

### Open issues / notes
- `ShareModal` and `CareerCompareModal` still lack dialog semantics; ADR-011 suggests moving them to the same native `<dialog>` pattern (F-10).
- A dev server was already running on :5173 (not started by this session) and was used for testing.
- Carried over: dead CSS in `index.css` (N-14); Landing hero invisible until JS runs (TD-32); `/home` not linked (N-15); no `.gitattributes` (CRLF warnings).

### Current blockers
- **Not deployable:** hard-coded `http://127.0.0.1:8000` in `Results.jsx` (×3) and CORS `http://localhost:5173` in `main.py` (N-5).
- **Unsafe to deploy publicly:** open, un-rate-limited AI proxy; raw exception text returned; user answers logged (N-9).

### Next recommended task
**N-5 + N-6: env-based config and a single API client.** `src/lib/api.js` (base URL from `VITE_API_URL`, timeout, typed errors, abort) replacing the three `fetch` blocks in `Results.jsx`; `ALLOWED_ORIGINS` from env in the backend; commit `frontend/.env.example` and `backend/.env.example`. First hard blocker on the path to a live demo (F-1).

### Open questions (for the owner)
1. Target market: Canada-first (CAD salaries, EN/FR) or US?
2. Database/auth preference: Supabase (fast) vs self-managed Postgres + FastAPI JWT (more to show)?
3. Deploy target: Render, Fly.io, Vercel + Render, or something else?
4. Stay on Gemini, or add a provider abstraction? (`openai` is in requirements but unused.)
5. TypeScript migration now or later?
6. Should the "Employability/Momentum" scores stay? They currently measure app engagement, not employability.
7. When should the GitHub repo go public (F-17)?

---

## History
- 2026-09-25 (part 2) — Pushed full history to the private GitHub repo `YussafZarifi/pathway-ai` (secret scan of history clean; placeholder README commits replaced with `--force-with-lease` by the owner).
- 2026-09-25 (part 1) — Git initialized; fake data, dead buttons and unreachable code removed; `/home` rebuilt as an honest empty state (8 commits + docs). ADR-010.
- 2026-09-24 — Initial audit and documentation. No code changes.
