# SESSION.md — Latest session log

> Overwrite the "Current session" section at the end of each coding session; move the previous one to "History" (keep history short: date + 1–3 lines).

---

## Current session — 2026-09-28 · 5-question quiz (ADR-016)

### Goal (owner request)
Rethink the quiz: at most 5 questions that give **more** signal than the 8 old ones, feel like a premium AI product, take under 2 minutes. Design first, implement only after approval. Before implementing, make the backend accept both the old 8-question and new 5-question formats so saved roadmaps and "Regenerate" keep working.

### Design process
1. Analysis of the 8 questions:
   - "Where am I now?" was asked 3×; preferences were asked 2×.
   - `interest_area` asked users to pick the answer, which anchored all 3 suggestions.
   - The "years" sliders were ambiguous.
   - No question captured problem-solving style, strengths or weekly time.
   - I proposed a 5-question design.
2. The owner sent their own 5 questions. My review:
   - Q1 and Q2 overlapped (4 of 7 Q2 options repeated Q1).
   - Q5 mixed goals with target roles.
   - Strengths, problem-solving style and work style were missing.
   - I suggested a problem-solving Q2, buttons for time, and target roles in an optional field.
3. Owner's final decisions: exactly 5 questions; the improved Q2; four large buttons for weekly time; Q5 about the goal only; an optional "Already have a career in mind?" field under Q5; no sixth question; the AI infers the rest.

### What was done
1. **Backend first** (`a1242f6`):
   - `schemas.py`: `QuizAnswersV2` + unchanged `QuizAnswersV1` behind a discriminated `QuizAnswers` (`interests` present → v2, else v1; no version field).
   - New `prompts.py`:
     - v2 prompts: labelled profile; guidance on reading each answer; reasons must cite ≥2 answers; steps paced to weekly hours; last step aimed at the goal.
     - v1 prompts moved verbatim (verified byte-identical against the previous commit).
   - 20 new tests (80 total).
2. **New quiz** (`9b97b5b`):
   - `questions.js`: the 5 approved questions.
   - `Quiz.jsx`: multi-select grid (limit enforced, "n of 3 selected"), four large weekly-hours buttons, and the optional career field with 5 suggestion chips, sent only when non-empty. `aria-pressed` and labelled groups throughout.
   - Slider type and CSS removed. Tracking moved outside the state updater (TD-26 fixed). Two React lint issues (impure `Date.now()` in render, setState in an effect) fixed; the old exhaustive-deps warning is gone.
3. **Copy** (`6f31949`): Landing "5 questions, under 2 minutes"; `/home` "Answer 5 quick questions".
4. **Docs:** ADR-016; CLAUDE.md (§12 question-ID contract updated); ROADMAP C-24, N-17 extended, new N-18 (visual check), N-19 (remove v1); `docs/ai-system.md` (question → signal → prompt usage table); `docs/api.md` (both formats), `docs/backend.md`, `docs/frontend.md`, `docs/testing.md`, `docs/technical-debt.md` (TD-26 resolved, TD-38 resolved for v2), `docs/ui-design.md`, `docs/recruiter-notes.md`, README; this file.

### Verification
| Check | Result |
|---|---|
| `python -m pytest -q` | 80 passed (v1 careers + regeneration with original prompts; v2 profile/pacing; v2 validation: 0 or 4 interests, bad hours, empty goal, long career field → 422 before Gemini; newline removal; duplicate interests merged; leftover v1 keys ignored) |
| v1 prompts | Byte-identical to the previous commit's prompts (scripted comparison) |
| Live `gemini-2.5-flash` (3 calls) | v2 careers: UX Designer 90 / Data Analyst 88 / Data Engineer 82 (career in mind, honestly lower); every reason cites 2 answers; explanation describes inferred strengths. v2 roadmap: 5 steps of 1–4 months at 5 h/week, ending in a career-switch portfolio. v1 regenerate: 200, 5 steps |
| Live `gemini-2.5-flash-lite` | Not possible: daily quota still exhausted; the frontend client showed the friendly "usage limit" 503 for both formats |
| Chrome (dev server) | The window was in the background (`visibilityState: hidden`), so framer-motion transitions can't run and the quiz can't advance past Q1 there. Checked in the page: 3-column grid with square checkboxes, "2 of 3 selected" state, progress "2 / 5". **Full visual walk-through not done (N-18).** localStorage backed up in the browser and restored byte-for-byte |
| `npm run lint` / `npm run build` | 12 errors, **0 warnings** (was 1) / passes |

### Open issues / notes
- **N-18:** walk through the quiz in a visible browser (desktop + 360 px + keyboard). I can do it once the Chrome window is in the foreground.
- **N-17:** after the flash-lite quota resets, run one quiz end to end and check the log for `career v2 attempt 1: ok … strategy=direct`.
- Two answer formats coexist until N-19. The tracking event log in localStorage will contain both shapes.
- Carried over from 2026-09-27: Gemini free tier = 20 requests/day (N-16, owner decision); Render deploy not done (F-1); `YOUTUBE_API_KEY` unset.
- **Git:** 3 code commits + 1 docs commit this session; `main` is **38 commits ahead of `origin/main`, not pushed.**

### Next recommended task
1. N-18 visual check + N-17 live check (small; needs a visible browser and the quota reset).
2. Owner decision on Gemini billing (N-16), then **F-1 deploy to Render**.
3. Frontend tests + CI (F-2–F-4); the quiz's multi-select and optional-field logic are good first Vitest targets.

### Open questions (for the owner)
1. Enable Gemini billing before deploying, or deploy on the free tier first (≈10 quiz runs/day)?
2. Render API plan: free (sleeps) or Starter (always on)?
3. How long to keep v1 answer support after deploy (suggest a few weeks, or until accounts can migrate data)?
4. Target market: Canada-first (CAD salaries, EN/FR) or US?
5. Database/auth preference: Supabase vs self-managed Postgres + FastAPI JWT?
6. Stay on Gemini, or add a provider abstraction? (`openai` is in requirements but unused.)
7. When should the GitHub repo go public (F-17)?

---

## History
- 2026-09-27 (part 2) — Investigated the "intermittent roadmap failure": 25 live calls, 0 malformed JSON; the real limit is Gemini's free tier (20 requests/day). Added JSON mode + response schema, per-item validation, one retry, 503 quota/busy messages, content-free diagnostics with request IDs, and the first 60 backend tests (ADR-015).
- 2026-09-27 (part 1) — Deployment readiness (ADR-014): env-only config (`ALLOWED_ORIGINS`, `VITE_API_URL`, build fails without it), every request through `lib/api.js`, Pydantic request validation, in-memory rate limits, generic errors, no user data in logs, `/health`, `render.yaml` (Render chosen, not deployed). Local `backend/.env` gained `ALLOWED_ORIGINS`; `frontend/.env.local` created.
- 2026-09-26 — Landing Log in / Sign up → "accounts coming soon" dialog; `/home` polish; real YouTube videos per step (ADR-012); dashboard redesign with persisted roadmap and per-roadmap progress (ADR-013); polish passes and shared `VideoCard`.
- 2026-09-25 (part 2) — Pushed full history to the private GitHub repo `YussafZarifi/pathway-ai` (secret scan of history clean; placeholder README commits replaced with `--force-with-lease` by the owner).
- 2026-09-25 (part 1) — Git initialized; fake data, dead buttons and unreachable code removed; `/home` rebuilt as an honest empty state (8 commits + docs). ADR-010.
- 2026-09-24 — Initial audit and documentation. No code changes.
