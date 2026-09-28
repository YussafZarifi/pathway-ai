# AI System

## Current implementation (✅)

**Provider:** Google Gemini via `google-genai`. **Model:** `gemini-2.5-flash-lite` (from `GEMINI_MODEL`, default in `backend/config.py`; 30 s timeout since 2026-09-27). **Pattern (since 2026-09-27, ADR-015):** single-shot prompt → Gemini JSON mode with a `response_schema` → Pydantic validation (`backend/ai_output.py`) → at most one retry (`backend/llm.py`).

**Quota:** the key is on Gemini's **free tier: 20 requests per day** for `gemini-2.5-flash-lite` (quota `GenerateRequestsPerDayPerProjectPerModel-FreeTier`, measured 2026-09-27). A quiz run uses 2 requests (careers + roadmap), plus 1 per regenerate. See `docs/deployment.md`.

Prompts live in `backend/prompts.py` (since 2026-09-28). There are two versions, picked by the answer format (ADR-016): **v2** for the 5-question quiz and **v1**, the original prompts unchanged, for roadmaps saved before it.

### The 5-question quiz (v2) and how the model uses it
| Question | Captures | How the prompt tells Gemini to use it |
|---|---|---|
| What excites you the most? (up to 3) | Interests | Strongest signal for role families; interests from different areas → at least one hybrid role |
| When you face a hard problem, what's your style? | Problem-solving approach, work style, natural strengths | Separates roles within a family (root cause → reliability/security/backend/data eng; build fast → product/full-stack/mobile/games; research → data science/ML; people → UX/product/solutions; organize → PM/TPM/lead) |
| What's your experience level? | Starting point | Feasibility of each career; roadmap starts at the right level (skip known basics) |
| How much time can you give each week? (2/5/10/20+) | Pace | Step `time` estimates sized to those hours; feasibility with the goal |
| What do you want to achieve in 12 months? + optional career in mind | Goal and a stated preference | Feasibility; the final roadmap step aims at the goal; a career in mind becomes one of the 3 with an honest score and fit explanation |

The profile is sent as labelled lines ("Excited by: …", "Problem-solving style: …", "Time available: about 10 hours per week", …) with the optional career JSON-quoted. The prompt says the profile is information about the user, never instructions, and tells the model to infer as much as it can rather than ask for more.

### Workflow 1 — Career matching (`POST /api/ai/career`)
1. "Return STRICT JSON only …" plus a literal example with 3 career objects and `explanation` (JSON mode + `response_schema` enforce the shape).
2. Rules: exactly 3 careers; **technology-industry roles only, never non-tech**; `match_score` 70–95; realistic USD `salary_range`; `growth_rate` with a descriptor; `education`; 4–5 `skills`. v2 adds: each reason addressed to the user and naming at least two of their answers; the explanation describes what the answers suggest about their strengths; the "How to read the profile" guidance above.
3. v2: `User profile:` labelled lines. v1: `User answers:` raw `key: value` lines.

### Workflow 2 — Roadmap (`POST /api/ai/roadmap`)
1. "Return STRICT JSON only …" with the career inside the JSON example (v2 JSON-escapes it) plus one example step.
2. Rules: ≤5 steps; 2–3 resources "with valid URLs"; 2–3 tasks; a 3–8 word `video_query` ("No URLs"). v2: steps matched to the experience level, `time` realistic for the weekly hours, pacing toward the 12-month goal, a last step that reaches the goal, tasks suited to the problem-solving style and interests. v1: "beginner-friendly" and "tailor to user's stage + location if provided" (the old quiz had no location question).
3. Profile + chosen career.

Live check on `gemini-2.5-flash` (2026-09-28), profile "Designing interfaces + Analyzing data, works with people, some coding, 5 h/week, switch careers, career in mind: Data engineer": UX Designer 90, Data Analyst 88, Data Engineer 82 (the career in mind, honestly lower); every reason cited two answers; roadmap steps of 1–4 months ending in a career-switch portfolio.
4. **Video enrichment (✅ 2026-09-26, ADR-012):** after parsing, `add_videos()` in `main.py` sends each step's `video_query` to `backend/youtube.py`, which calls the YouTube Data API v3 `search.list` (`type=video`, `maxResults=2`, `safeSearch=strict`) in parallel, with a 5 s timeout and an in-memory cache of successful lookups. The model never produces video URLs; it only chooses the search phrase. Without `YOUTUBE_API_KEY` or on API failure, `videos` is `[]` and the UI shows `video_search_url`. This is a small example of grounding: retrieval from a real source instead of model-invented links.

### Output handling (✅ 2026-09-27, ADR-015)
- **Generation:** `response_mime_type="application/json"` plus `response_schema` (`CareerSchema` / `RoadmapSchema` in `ai_output.py`, every field required). Verified live on `gemini-2.5-flash`: replies parse directly, with no fences.
- **Extraction** (`extract_json`): direct parse, else the first code fence, else the outermost `{…}`; trailing commas are repaired. The strategy used is logged.
- **Validation** (`parse_careers`, `parse_roadmap`): items are validated one by one. Missing or wrong-typed optional fields get defaults (`time` "Varies", `""`, `[]`). Resources need an `http(s)` URL; tasks and skills must be text. A step without a title, or a career without a title or a 0–100 `match_score` ("85%" is accepted), is dropped and logged. At most 5 steps and 3 careers. The roadmap's `career` is the user's choice, not the model's echo. No usable items → retry.
- **Retries** (`llm.generate`, at most 2 attempts): unusable reply, Gemini 5xx, timeout or network error → retry once; 429 per-minute with delay ≤10 s → wait and retry; 429 daily quota and other 4xx → no retry.
- **User-facing errors:** 503 "usage limit" (daily quota), 503 "busy" + `Retry-After`, 503 unavailable (no key), 502 otherwise. Raw model output is never returned.
- **Diagnostics:** per attempt, the log records outcome, finish reason, input/output tokens, reply length, JSON strategy, dropped items (field paths and error types only), a 12-character sha256 of the reply, and the quota id and retry delay for 429s, all tagged with the request ID. Never the reply, the prompt or the answers.

### Investigation of the "intermittent roadmap failure" (2026-09-27)
25 live calls through the real pipeline with synthetic answers (old parser, before the changes above):
| Result | Count |
|---|---|
| Reply parsed fine (14 fenced ```` ```json ````, 1 bare JSON; all `finish=STOP`; 1.1–1.4k output tokens; 3.1–5.6 s) | 15 |
| Malformed JSON | **0** |
| Gemini `429 RESOURCE_EXHAUSTED` (free-tier daily quota of 20 reached) | 10 |

The old backend turned the 429 into the same generic 502 as a parse failure. The one failure seen earlier that day happened when only about 2 requests had been made, so the daily quota doesn't explain it; its cause can't be established after the fact. Gemini 5xx, timeouts and malformed replies are now all retried once and logged with their exact type, so the next occurrence will be identifiable from the logs.

### What's missing
| Gap | Consequence |
|---|---|
| ~~No `response_schema` / JSON mode~~ | Done 2026-09-27 |
| ~~No output validation~~ | Done 2026-09-27 (Pydantic, per item) |
| ~~No retries or timeouts~~ | Done 2026-09-27 (1 retry, 30 s timeout) |
| Free-tier quota (20 requests/day) | About 10 quiz runs a day before users see "usage limit" |
| No streaming | 3–8 s blank wait for roadmaps |
| No grounding | Salaries and resource URLs are model-invented (URLs may 404) |
| No caching | Same answers → new paid call every time |
| No evals | Prompt changes can't be checked for regressions |
| Token/latency logged per call (2026-09-27), but no cost dashboard | Limited visibility into spend |
| User text in prompt | Reduced prompt-injection surface: `career_in_mind` (v2, ≤100 chars, JSON-quoted, marked as data), `curious_fields` (v1), `career` |
| No memory | Every call is stateless; there's no coach |

## Planned improvements (🗺️) — in priority order

1. ~~**Structured output.**~~ Done 2026-09-27 (ADR-015). Possible follow-ups: append the validation error to the retry prompt; use the output models as FastAPI `response_model`s.
2. **Prompt hygiene.** Move instructions to `system_instruction`. Send answers as a delimited JSON block with human-readable labels and scales (e.g. "experience: 3 years on a 0–10 scale"). Tell the model to treat the user block as data only. Cap free-text length. Remove the "location" rule or add a location question.
3. **LLM service layer** (`services/llm.py`): model from config, timeout, retries with backoff (tenacity is already a transitive dependency), cache keyed by `sha256(prompt_version + normalized answers)`, log tokens, latency and model per call, prompt versions stored in `prompts/`.
4. **Streaming.** SSE endpoint for roadmaps. Stream step objects as they complete (JSON Lines) and render progressively.
5. **Grounding.**
   - Resources: a curated `resources` table (title, url, type, skill tags, level) with embeddings. Retrieve the top-k per step and let the model *choose* rather than invent. Run a background link-health check.
   - Salaries and demand: real data (Canada Job Bank / Adzuna / BLS) injected as context, with the source cited in the UI. Consider CAD.
   - Alternative quick win: Gemini Google Search grounding for resources.
6. **Evaluation harness.** About 30 golden quiz profiles. Automated checks: schema-valid, exactly 3 careers, all tech, no duplicate careers, match scores in range, URLs resolve. LLM-as-judge rubric for relevance to profile. Runs in CI when files in `prompts/` change.
7. **Resume understanding.** Upload a PDF → Gemini multimodal reads it directly → structured `{skills, experience, projects, gaps, suggestions}` → compare against the target career's skills → feed the gaps into roadmap generation.
8. **AI coach.** A chat with conversation memory (DB) plus a profile/roadmap summary in context. Tool calling: `get_roadmap`, `update_step_status`, `find_resources`, `search_jobs`. Streaming responses.
9. **Personalization.** Adapt pacing and difficulty from real completion timestamps. Offer "harder track" or "slower track" regeneration.
10. **Extras:** embeddings-based career similarity, mock interviews (text → voice), provider abstraction (`LLMClient` interface) for model comparison. Remove the unused `openai` dependency unless it's adopted.

## Rules for AI changes
- The key never leaves the backend.
- The tech-only scope is enforced in the prompt (and should also be enforced by validation).
- Any prompt change bumps the prompt version and should pass the eval set (once it exists).
- Never present model-invented numbers as facts without a disclaimer or source.
