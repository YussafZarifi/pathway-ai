# Architecture Decision Records

Format: **Context → Decision → Consequences → Status**. Add a new ADR whenever a significant architectural choice is made or reversed. Never rewrite an accepted ADR: supersede it with a new one and link them.

ADR-001 to ADR-008 were **reconstructed on 2026-09-24** from the existing code during the audit. The original reasoning wasn't written down, so their "Context" describes the most likely rationale.

| ID | Title | Status |
|---|---|---|
| ADR-001 | React + Vite single-page app | Accepted |
| ADR-002 | FastAPI backend as an AI proxy | Accepted |
| ADR-003 | Google Gemini 2.5 Flash-Lite as the model | Accepted |
| ADR-004 | Browser localStorage for persistence (MVP) | Accepted · to be superseded |
| ADR-005 | Technology-careers-only scope | Accepted |
| ADR-006 | Plain global CSS for styling | Accepted · under review |
| ADR-007 | React Router state as cross-page data transport | Accepted · to be superseded |
| ADR-008 | Client-side tracking and scoring engines | Accepted · under review |
| ADR-009 | Project documentation as persistent memory | Accepted |
| ADR-010 | One dashboard: keep `/dashboard`, keep `/home` as the future signed-in hub, delete the `/app/*` shell | Accepted |

---

## ADR-001 — React + Vite single-page app
- **Context:** an interactive, animation-heavy flow (quiz → results → dashboard) with no SEO-critical content beyond the landing page. The team knows React.
- **Decision:** React 19 SPA built with Vite 7, React Router 7 (`BrowserRouter`), framer-motion for motion, lucide-react for icons. Plain JavaScript.
- **Consequences:** fast dev loop and simple static hosting. No SSR, so the landing page relies on client rendering. No TypeScript means API contracts are implicit (field-name drift has already happened). Revisit TypeScript before the codebase grows (ROADMAP F-16).
- **Status:** Accepted.

## ADR-002 — FastAPI backend as an AI proxy
- **Context:** the LLM API key must not ship to the browser, and prompts should live server-side.
- **Decision:** a small Python FastAPI service with endpoints that build prompts, call Gemini and return JSON.
- **Consequences:** key stays secret; Python has a strong AI ecosystem; Pydantic is available for validation. Currently a single file with no validation, rate limiting or auth, so it acts as an open proxy (TD-03). Planned: app structure with routers, services, schemas and config (see `backend.md`).
- **Status:** Accepted.

## ADR-003 — Google Gemini 2.5 Flash-Lite
- **Context:** short structured generations; cost and latency matter for a free product and a portfolio budget.
- **Decision:** `google-genai` SDK, model `gemini-2.5-flash-lite`.
- **Consequences:** cheap and fast. Supports JSON mode and `response_schema` (not used yet), multimodal PDF input (useful for the resume analyzer) and Google Search grounding. The model name is hard-coded twice; move it to config. `openai` is in requirements but unused, which suggests an earlier provider experiment; decide whether to add a provider abstraction or remove the dependency.
- **Status:** Accepted.

## ADR-004 — localStorage persistence (MVP)
- **Context:** ship without accounts or a database.
- **Decision:** one localStorage key `pathwayai_tracking` holding events, metrics and step progress. Careers and roadmaps aren't stored (router state only; see ADR-007).
- **Consequences:** zero backend state and no auth needed. But no cross-device sync, data loss on clearing storage, unbounded growth, progress keys that collide across roadmaps (TD-08) and no durable roadmap (TD-09).
- **Status:** Accepted, **to be superseded** in two steps: (1) per-roadmap localStorage v2 (ROADMAP N-7); (2) PostgreSQL + auth (F-7/F-8). Each step gets its own ADR.

## ADR-005 — Technology-careers-only scope
- **Context:** early data (`careers.js`, `careerDetails.js`) covered general careers (nurse, plumber, teacher…). Broad scope produced shallow guidance.
- **Decision:** the product focuses on technology-industry careers. It's enforced in the career prompt ("ALL careers must be technology-industry roles only") and the quiz asks about tech fields.
- **Consequences:** deeper, more accurate roadmaps and a clearer audience. Legacy non-tech data and icon mappings remain as debt (TD-31). Don't widen the scope without a new ADR.
- **Status:** Accepted.

## ADR-006 — Plain global CSS
- **Context:** fast iteration on a custom visual style; snippets adopted from community sources.
- **Decision:** global CSS in `src/index.css` (plus `styles/dashboard.css`), camelCase class names, framer-motion for animation.
- **Consequences:** no build tooling needed. But the file has grown to about 3,900 lines with few tokens, many colour literals, duplicate selectors and three theme mechanisms (TD-25, TD-34). Under review: introduce design tokens and split per area (CSS Modules or per-page files). Record the choice (tokens + CSS Modules vs Tailwind) as a new ADR when it's made.
- **Status:** Accepted · under review.

## ADR-007 — Router state as cross-page data transport
- **Context:** simplest way to pass quiz answers and AI results between pages without a store or backend persistence.
- **Decision:** `navigate(path, { state })` carries `answers` (Quiz → Results) and `{career, roadmap}` (Results → Dashboard).
- **Consequences:** zero setup. It survives same-tab reloads (history.state), but data is lost on new tabs, direct links or shared URLs, and pages redirect to `/quiz` when state is missing.
- **Status:** Accepted, **to be superseded** by persisted roadmaps (N-7) and later server data with a client cache (TanStack Query).

## ADR-008 — Client-side tracking and scoring engines
- **Context:** show users progress and "career readiness" without a backend.
- **Decision:** `lib/trackingEngine.js` (validated events, metrics history, progress) and `lib/scoringEngine.js` (employability, momentum, readiness, recommendations), computed in the browser.
- **Consequences:** works offline and without accounts, and shows analytics thinking. But the scores mostly measure app engagement (quiz duration, sessions), one input (resume score) only came from a simulated feature, and storage performance degrades over time (TD-27–TD-29). Under review: move scoring server-side with honest, explainable inputs, and move product analytics to a dedicated tool.
- **Status:** Accepted · under review.

## ADR-009 — Project documentation as persistent memory
- **Date:** 2026-09-24
- **Context:** development happens across many AI-assisted sessions; context must survive between them.
- **Decision:** keep `CLAUDE.md` (project memory), `SESSION.md` (latest session), `ROADMAP.md` (living plan) and `docs/*` (area docs, ADRs, debt register) in the repo. Update `CLAUDE.md`, `ROADMAP.md`, `SESSION.md` and this file at the end of every coding session.
- **Consequences:** any new session can resume without re-explaining. The docs need discipline to stay accurate, and must always separate implemented, partial and planned work.
- **Status:** Accepted.

## ADR-010 — One dashboard: keep `/dashboard`, keep `/home` as the future signed-in hub, delete the `/app/*` shell
- **Date:** 2026-09-25
- **Context:** the audit found two competing dashboard designs: the routed, tabbed `/dashboard` (roadmap timeline and readiness meters) and an unrouted `/app/*` shell (`AppShell`, `DashboardLayout`, `DashboardHome`, `Coach`, `styles/dashboard.css`) that was never wired into `App.jsx`. `/home` existed but showed hard-coded stats and activity. Keeping unreachable code and fake data hurts honesty and recruiter perception.
- **Decision:**
  - `/dashboard` stays the view for the active roadmap.
  - `/home` is **kept** as the future authenticated user hub. Until accounts and saved roadmaps exist it is an honest empty state: no stats, activity or achievements, only real entry points and features clearly labelled "Planned".
  - The `/app/*` shell and every other unreachable file are **deleted**. Git keeps the history.
- **Alternatives considered:** delete `/home` and use `/dashboard` as the only hub (rejected by the owner: `/home` is the natural home for multiple saved roadmaps after auth); wire up the `/app/*` shell instead (rejected: it duplicated `/dashboard`, carried dead Settings/Upgrade buttons and a third brand name).
- **Consequences:** one dashboard design and one fewer theme mechanism. `/home` needs real data (auth F-7 + persistence N-7/F-8) before it can show anything personal; it isn't linked from Landing yet. When auth lands, `/home` shows the user's saved roadmaps and `/dashboard` becomes a per-roadmap route (e.g. `/dashboard/:roadmapId`).
- **Status:** Accepted.

---

## Template
```
## ADR-NNN — Title
- **Date:** YYYY-MM-DD
- **Context:** what forces are at play
- **Decision:** what we chose
- **Alternatives considered:** …
- **Consequences:** trade-offs, follow-ups
- **Status:** Proposed | Accepted | Superseded by ADR-XXX
```
