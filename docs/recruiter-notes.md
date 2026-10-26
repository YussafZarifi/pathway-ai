# Recruiter Notes

How this project is likely to be perceived, and what increases its portfolio value. Based on the 2026-09-24 audit.

## Audit scorecard (baseline)
| Dimension | Score /10 | Target after Foundation + Production baseline |
|---|---|---|
| Technical complexity | 3 | 6–7 |
| UI/UX | 5.5 | 7.5 |
| Code quality | 3.5 | 7 |
| Architecture | 3 | 7 |
| Scalability | 2 | 6 |
| Originality | 4 | 6 (with grounding, resume gap and coach) |
| AI integration | 3 | 7–8 |
| Production readiness | 1.5 | 7 |

## What impresses recruiters (already present)
- A polished, animated 5-question assessment (reduced from 8 on 2026-09-28) whose answers are turned into a labelled profile the AI reasons over.
- A Results page with real product thinking: compare, regenerate, expand, share and export.
- A tracking schema with validation and a documented scoring formula.
- A clear, relevant problem (career guidance for students entering tech).

## What hurts impressions (fix first)
1. ~~**Simulated AI** (`ResumeAnalyzer.jsx` random score)~~ — deleted 2026-09-25.
2. ~~**Fake dashboard data** on `/home`~~ — replaced by an honest empty state 2026-09-25.
3. ~~**No git history.**~~ — repo initialized 2026-09-25 with small, explained commits. Pushed to a private GitHub repo on 2026-09-25; it becomes visible to recruiters once made public (ROADMAP F-17).
4. ~~Default Vite README, "roadmap-ai" tab title, Vite favicon~~ — README replaced; PathwayAI title, favicon, description and link-preview tags since 2026-09-29.
5. ~~**Dead buttons** and fake Copy Link~~ — removed 2026-09-25.
6. ~~**Not deployable:** hard-coded localhost~~ — env-only config and a Render Blueprint since 2026-09-27; code-complete for an initial release since 2026-09-29. **Still no live demo** (ROADMAP D-1–D-4).
7. **Test and CI coverage.** Version 1.0 has 182 frontend tests, 674 backend tests, local Playwright coverage and a GitHub Actions workflow.
8. ~~**Visible bugs:** "Roadmap 100%" after one step; progress leaking between careers~~ — fixed 2026-09-26 with the dashboard redesign (ADR-013).
9. ~~**About 40% dead code** in the repo~~ — unreachable files deleted 2026-09-25; some dead CSS rules remain in `index.css`.

## Recruiter-style review (2026-09-29)
A walkthrough of the running app as a first-time visitor (desktop with a mouse, plus 360 px and keyboard from the QA passes), looking only at what a recruiter would see. **Verdict:** the core loop (quiz → matches → roadmap → dashboard) is strong and the dashboard feels like a real product; what reads as "student project" is mostly presentation and trust around it, not engineering. Findings, ranked by recruiter impact (tracked as ROADMAP P-1–P-11, TD-21, TD-59–TD-63):

**Critical**
1. No attribution: no name, GitHub, LinkedIn, About or "how it's built"; the footer is only "© 2026 PathwayAI" (P-1, P-2).
2. The live site can look broken or slow: the Gemini free tier runs out after ~7–10 visitors ("usage limit"), and Render's free plan wakes in ~1 min (D-2, D-6).
3. AI resource links: 3 of 13 broken in one roadmap (two 404s, an invented YouTube video) (P-7, TD-21).
4. Unbuilt features are promoted: 2 of 3 Landing cards say "Coming soon"; the gradient Sign up button opens "Accounts are coming soon"; "Soon" repeats on `/home` and the dashboard (P-6).

**High**
5. "No video found yet" placeholders on every step and in Today's focus (no `YOUTUBE_API_KEY`) (D-5).
6. Results trust: unsorted matches (90/85/88), one icon for every career, full-time US$ salaries for an internship goal, unsourced growth figures, no "AI estimate" label (P-4, P-5, TD-63).
7. Thin Landing: one short screen, no "how it works", no product screenshot; the hero waits for JS (P-3).
8. Inconsistent navigation: three header styles, no brand on Quiz/Results, no way back to a saved roadmap from Landing (P-9, TD-60).
9. Dashboard padding on a first visit: streak 1, active days 1/14, 3 achievements in a minute, an out-of-order "Quick win", check marks on undone tasks (P-11, TD-62).

**Medium / Low:** mixed typography and misaligned Landing icon (P-8); quiz card jumps between questions (P-10); inconsistent names (Resume Feedback / Analyzer, Share icon = download); easy-to-miss error wording; disabled "Generate roadmap" without a hint; mobile Results fold; compare "N/A" row; Esc and focus for keyboard users (N-21).

**Already impressive:** a fast 5-question quiz; AI reasons that quote the user's own answers; roadmaps paced to weekly hours; honest progress, dates and empty states; a real 404; a Gemini 503 absorbed by the retry without the user noticing.

## How to reach production quality
1. Git + clean commits + GitHub repo with description, topics and a pinned live URL.
2. Remove fakes, fix bugs, env config, API client.
3. Backend hardening: schemas, rate limits, safe errors, no personal data in logs.
4. Structured AI output + validation.
5. Tests (unit, API, one E2E) + GitHub Actions CI with a status badge.
6. Docker Compose + deployment + Sentry.
7. Auth + Postgres persistence.
8. README with a GIF demo, architecture diagram, ADRs and a "what I'd do next" section.

## Standing out, by company

| Company | What they value | What to build or show |
|---|---|---|
| **Google** | Scale thinking, clean design, testing, data | System-design doc with capacity estimates; caching layer; load test (k6/Locust) results; strong test pyramid; OpenTelemetry traces |
| **Microsoft** | Reliable, accessible enterprise software, TypeScript | Full TypeScript; WCAG 2.1 AA audit (axe) in CI; error boundaries; telemetry; clear ADRs |
| **Amazon** | Ownership, operational excellence, metrics | Dashboards for latency, error rate and token cost; alarms; runbook; background jobs; cost optimization story (caching, model choice) |
| **Shopify** | Product craft, speed, pragmatic React | Design system; optimistic UI; Core Web Vitals scores; feature flags; E2E tests; fast, polished flows |
| **Bell** | Reliable consumer-scale services, bilingual Canada | EN/FR i18n; uptime monitoring; accessible UI; CI/CD with environments |
| **RBC** | Security, compliance, accessibility, data governance | Auth done right (httpOnly sessions / OIDC); OWASP hardening; rate limiting; audit log; data export and delete; AODA/WCAG; PII-free logs; threat model doc |
| **TD** | Similar to RBC, plus a digital-product mindset | Same security story plus analytics funnel and A/B-ready feature flags |
| **Wealthsimple** | Clean consumer UX, trust, simplicity, testing | Honest, explained scores (show the formula); polished mobile UX; strong tests; transparent privacy; no dark patterns |
| **OpenAI** | Applied LLM engineering | Structured outputs; eval harness with regression tracking; RAG with citations; streaming; tool-using agent; write-up of failure modes found by evals |
| **Anthropic** | Safe, reliable, well-evaluated AI systems | Prompt-injection defences; output validation; grounded claims with sources; eval suite incl. adversarial cases; clear model-limitation disclosures in the UI; thoughtful ADRs |

## Top 20 improvements (ranked by portfolio impact)
1. Git history + GitHub
2. Remove simulated AI and fake data
3. Professional README with live demo and GIF
4. Deploy
5. Fix progress bugs + persist roadmaps
6. Structured AI output + validation
7. Auth + Postgres
8. Backend security hardening
9. Tests (unit, API, E2E)
10. CI/CD
11. Streaming generation
12. Real resume analysis + skill-gap
13. Grounded resources and salaries (RAG + real data, with citations)
14. Prompt eval harness
15. TypeScript + generated API types
16. Design-system pass, no dead buttons
17. WCAG AA accessibility
18. AI coach with memory + tool calling
19. Observability (Sentry, logs, cost/latency)
20. Docker Compose + ADRs

## Interview talking points to prepare
- Why a backend proxy for the LLM (key safety, validation, rate limiting, caching).
- How you'd stop the model inventing URLs and salaries (retrieval, validation, citations).
- How you'd test non-deterministic AI output (schema checks, golden sets, LLM-as-judge).
- The localStorage → Postgres migration and the trade-offs.
- A bug you found and fixed (e.g. progress keys not scoped per roadmap), and the test that now guards it.
