# Future Features

Everything here is **planned, not implemented**. Effort: Easy (1–2 h) · Medium (half day) · Large (1–3 days) · Huge (multiple days). Cross-references are `ROADMAP.md` IDs where they exist.

## Easy
| Feature | Why it matters | Roadmap |
|---|---|---|
| 404 route + error boundary | Basic robustness | F-12 |
| Env config (`VITE_API_URL`, `ALLOWED_ORIGINS`) + `.env.example` | Deployable | N-5 |
| Brand consistency, title, favicon, OG tags | Professional polish | N-12 |
| Reduced-motion + focus-visible | Accessibility | F-10 |
| Accessible modals (Esc, focus trap, ARIA) | Accessibility | F-10 |
| Quiz keyboard shortcuts | Power-user polish | B-1 |
| Save quiz progress to sessionStorage | Refresh-safe | B-1 |
| Copy roadmap as Markdown | Easy sharing | B-2 |
| Validate AI URLs (https only) | Safety | B-3 |
| Toast notifications | Replace `alert()` | B-4 |

## Medium
| Feature | Roadmap |
|---|---|
| Gemini structured output + Pydantic response models | N-8 |
| Central API client (timeout, retry, typed errors) | N-6 |
| Per-roadmap localStorage persistence | N-7 |
| Streaming roadmap (SSE) (Large if done with progressive UI) | F-6 |
| Rate limiting + input limits | N-9 |
| Per-step notes and target dates | B-5 |
| Regenerate one step / change difficulty | B-6 |
| Weekly plan view | B-7 |
| Structured logging with request IDs | F-11 |
| Vitest for tracking/scoring engines | F-2 |
| GitHub Actions CI | F-4 |
| Docker Compose | F-5 |
| Proper PDF export | B-9 |
| Response caching by answers hash | B-8 |
| Location question + CAD salaries | B-11 |

## Large
| Feature | Roadmap |
|---|---|
| Auth (Supabase/Clerk or FastAPI JWT) | F-7 |
| PostgreSQL persistence (schema in `database.md`) | F-8 |
| Real resume analyzer (PDF → Gemini multimodal → structured critique) | F-13 |
| Skill-gap analysis feeding the roadmap | F-14 |
| Shareable public roadmap pages | F-15 |
| Playwright E2E | F-3 |
| TypeScript + OpenAPI-generated types | F-16 |
| Product analytics funnel (PostHog) | B-10 |
| Sentry FE + BE | F-11 |
| Deploy with preview environments | F-1 |
| Design system + skeleton loaders | F-9 |
| Streaks and activity heatmap | B-17 |
| Weekly digest / inactivity emails (background job) | B-16 |

## Huge
| Feature | Roadmap |
|---|---|
| AI coach: memory + tool calling (read/update roadmap, find resources, search jobs) | S-1 |
| RAG over a curated resource catalogue + link-health job | S-2 |
| Real job-market data (Job Bank / Adzuna) for salary, demand, skills by city | S-3 |
| Prompt eval harness in CI | S-4 |
| Mock interviews (text → voice) with rubric scoring | S-5 |
| Embeddings-based career similarity | S-6 |
| GitHub integration (infer skills, auto-complete steps) | S-7 |
| EN/FR internationalization | S-8 |
| Admin dashboard: prompt versions, cost, latency, funnel | S-9 |
| Feature flags + prompt A/B tests | S-10 |
| OpenTelemetry tracing FE → API → LLM | S-11 |
| Offline PWA | S-12 |
| Mentor/cohort sharing | S-13 |
| LinkedIn profile import | — |
| Portfolio project generator per roadmap step | — |

## Explicitly not planned (gimmicks to avoid)
- Gamified badges without real progress meaning.
- "AI" labels on features that don't use a model.
- Invented salary or growth numbers without a source.
