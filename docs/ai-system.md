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
| Career and roadmap grounding | Salaries and most learning-resource selections are still model-generated; only résumé coaching retrieves curated guidance |
| No caching | Same answers → new paid call every time |
| No evals | Prompt changes can't be checked for regressions |
| Token/latency logged per call (2026-09-27), but no cost dashboard | Limited visibility into spend |
| User text in prompt | Reduced prompt-injection surface: `career_in_mind` (v2, ≤100 chars, JSON-quoted, marked as data), `curious_fields` (v1), `career` |
| No memory | Every call is stateless; there's no coach |

### Resume Analyzer scoring (M3-X, ADR-024)
The résumé path is separate from career/roadmap generation. pypdf extracts up to 10 pages and 30,000 characters from a text-based PDF in memory (2 MB upload cap, per-page stream limits); the full text is supplied alongside the original PDF to Gemini. Gemini returns only a strict checklist: one binary finding per rubric criterion, a short source-page excerpt for each positive finding, a short note for each item, skill-to-roadmap links, and recommendations linked to missing criterion IDs. The backend normalizes whitespace/Unicode and verifies every excerpt against its claimed extracted page. Unknown, duplicate, missing, unsupported, out-of-range, or contact-detail content fails closed and follows the normal single retry.

backend/resume_scoring.py selects one of eight career-family rubrics (software engineering, data science, AI/ML, cybersecurity, UI/UX, product management, cloud engineering, DevOps) or a general technology rubric. Fixed category weights total 100. Points are split evenly across named criteria within a category, with hundredth-point remainder distribution so the displayed criterion maximums add back to the category weight. Gemini never sends a score. Python computes category values, total, ATS coverage, readiness coverage, and recommendation point potential. Priority gains only count linked criteria that were not found; a criterion cannot be counted twice. The internship/junior/mid-level percentages are coverage indexes across selected rubric categories, not hiring probabilities.

The full PDF and extracted text are discarded after the request. analysis.score_report is additive within the existing analysis JSON and stores only structured findings and short verified excerpts. This deliberately changes the earlier M3 privacy description: no original file or full text is persisted, but excerpts are retained to make awarded points reviewable. Old rows without score_report continue to render as qualitative reports. See ADR-024 and docs/api.md for the persisted shape and limitations.

### Grounded résumé coaching (Version 1.0)
After deterministic analysis is saved, `backend/rag/production.py` selects the three highest-priority verified gaps and retrieves matching chunks from the curated résumé-writing knowledge base. `RAG_RETRIEVER=langchain` is the default production adapter; the native retriever implements the same contract. Gemini receives only the verified criterion IDs, bounded résumé citations, scores, target role/level and retrieved guidance — never the PDF or raw extracted text.

The coaching engine validates the returned JSON, criterion IDs, résumé citations and guidance citation IDs. It rejects unsupported recommendations and invented technologies, experience, employers or metrics. Coaching is response-only: it cannot alter deterministic scores, findings or citations. Retrieval, embedding, timeout, provider or validation failure produces `ai_coaching.status: "unavailable"` while the saved deterministic analysis still succeeds.

## Planned improvements (🗺️) — in priority order

1. ~~**Structured output.**~~ Done 2026-09-27 (ADR-015). Possible follow-ups: append the validation error to the retry prompt; use the output models as FastAPI `response_model`s.
2. **Prompt hygiene.** Partly done: v2 sends a labelled profile, marks it as data, caps free text (≤100/≤300 chars) and dropped the "location" rule (2026-09-28). Still to do: move instructions to `system_instruction`; remove v1 prompts (N-19).
3. **LLM service layer.** Partly done in `llm.py` (2026-09-27): model from config, timeout, one retry, tokens/latency logged per call; prompts in `prompts.py` with v1/v2. Still to do: a response cache keyed by `sha256(prompt_version + normalized answers)` and explicit prompt version ids.
4. **Streaming.** SSE endpoint for roadmaps. Stream step objects as they complete (JSON Lines) and render progressively.
5. **Career and roadmap grounding.** Résumé coaching already retrieves curated résumé-writing guidance. Future work can ground learning resources, salaries and demand in verified sources with citations.
6. **Evaluation harness.** About 30 golden quiz profiles. Automated checks: schema-valid, exactly 3 careers, all tech, no duplicate careers, match scores in range, URLs resolve. LLM-as-judge rubric for relevance to profile. Runs in CI when files in `prompts/` change.
7. **Résumé-to-roadmap integration.** Deterministic résumé analysis and grounded coaching are complete; feeding verified gaps into roadmap generation remains intentionally out of scope.
8. **AI coach.** A chat with conversation memory (DB) plus a profile/roadmap summary in context. Tool calling: `get_roadmap`, `update_step_status`, `find_resources`, `search_jobs`. Streaming responses.
9. **Personalization.** Adapt pacing and difficulty from real completion timestamps. Offer "harder track" or "slower track" regeneration.
10. **Extras:** embeddings-based career similarity, mock interviews (text → voice), provider abstraction (`LLMClient` interface) for model comparison. Remove the unused `openai` dependency unless it's adopted.

## Rules for AI changes
- The key never leaves the backend.
- The tech-only scope is enforced in the prompt (and should also be enforced by validation).
- Any prompt change bumps the prompt version and should pass the eval set (once it exists).
- Never present model-invented numbers as facts without a disclaimer or source.
