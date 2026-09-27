# AI System

## Current implementation (✅)

**Provider:** Google Gemini via `google-genai`. **Model:** `gemini-2.5-flash-lite` (hard-coded in two places). **Pattern:** single-shot prompt → free text → parse JSON.

### Workflow 1 — Career matching (`POST /api/ai/career`)
Prompt structure (`backend/main.py:43-91`):
1. "Return STRICT JSON only (no markdown, no code fences) in this exact shape:" plus a literal example with 3 career objects and `explanation`.
2. Rules: exactly 3 careers; **technology-industry roles only, never non-tech**; reason 1–2 sentences; `match_score` 70–95; realistic USD `salary_range`; `growth_rate` with a descriptor; `education`; 4–5 `skills`; `explanation` 3–5 supportive sentences.
3. `User answers:` followed by raw `key: value` lines (question IDs, not human-readable labels).

### Workflow 2 — Roadmap (`POST /api/ai/roadmap`)
Prompt structure (`backend/main.py:132-163`):
1. "Return STRICT JSON only in this exact shape:" with `career` interpolated **inside the JSON example** plus one example step.
2. Rules: ≤5 steps; actionable and beginner-friendly; time estimates; 2–3 resources "with valid URLs"; 2–3 tasks; a 3–8 word `video_query` YouTube search phrase ("No URLs"); "tailor to user's stage + location if provided" (⚠ the quiz has no location question).
3. User answers + chosen career.
4. **Video enrichment (✅ 2026-09-26, ADR-012):** after parsing, `add_videos()` in `main.py` sends each step's `video_query` to `backend/youtube.py`, which calls the YouTube Data API v3 `search.list` (`type=video`, `maxResults=2`, `safeSearch=strict`) in parallel, with a 5 s timeout and an in-memory cache of successful lookups. The model never produces video URLs; it only chooses the search phrase. Without `YOUTUBE_API_KEY` or on API failure, `videos` is `[]` and the UI shows `video_search_url`. This is a small example of grounding: retrieval from a real source instead of model-invented links.

### Parsing
```python
text = (resp.text or "").strip()
if text.startswith("```"):
    text = text.strip("`").replace("json", "", 1).strip()
json.loads(text)
```
Fragile: it breaks on leading prose, a `JSON` tag or trailing commentary. No schema validation. The frontend defends with `Array.isArray` checks and `|| 85` fallbacks.

### What's missing
| Gap | Consequence |
|---|---|
| No `response_schema` / JSON mode | Occasional parse failures → 500 |
| No output validation | Wrong field names or types reach the UI |
| No retries or timeouts | Transient errors surface to users |
| No streaming | 3–8 s blank wait for roadmaps |
| No grounding | Salaries and resource URLs are model-invented (URLs may 404) |
| No caching | Same answers → new paid call every time |
| No evals | Prompt changes can't be checked for regressions |
| No token/cost/latency logging | No visibility into spend |
| Raw user text in prompt | Prompt-injection surface (`curious_fields`, `career`) |
| No memory | Every call is stateless; there's no coach |

## Planned improvements (🗺️) — in priority order

1. **Structured output.** Pass `config={"response_mime_type": "application/json", "response_schema": CareerResponse}` using Pydantic models that double as FastAPI `response_model`s. Validate; on failure retry once with the validation error appended; then return a typed error.
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
