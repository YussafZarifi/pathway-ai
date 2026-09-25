# Backend

`backend/main.py` — a single-file FastAPI app (179 lines). Run with `uvicorn main:app --reload --port 8000`.

## Setup
- `load_dotenv()` reads `backend/.env` → `GEMINI_API_KEY`.
- `genai.Client(api_key=...)` is created once at import time.
- CORS: `allow_origins=["http://localhost:5173"]` (hard-coded), credentials allowed, all methods and headers.

## Endpoints (✅)
| Method | Path | Handler | Summary |
|---|---|---|---|
| GET | `/` | `root` | `{"status":"ok","message":"Backend is running"}` |
| POST | `/api/ai/career` | `career_ai` | 3 tech careers + explanation |
| POST | `/api/ai/roadmap` | `roadmap_ai` | ≤5-step roadmap |

Full contracts: `docs/api.md`.

## Request models
```python
class CareerRequest(BaseModel):  answers: dict
class RoadmapRequest(BaseModel): answers: dict; career: str
```
There are no response models, and `answers` has no field-level schema or size limit.

## Handler flow
1. Check the `GEMINI_API_KEY` env var → 500 if missing.
2. (career only) Check that `answers` is a non-empty dict → 400.
3. `profile_text = "\n".join(f"{k}: {v}")`.
4. Build an f-string prompt (see `docs/ai-system.md`).
5. `client.models.generate_content(model="gemini-2.5-flash-lite", contents=prompt)` (blocking; FastAPI runs sync `def` handlers in a threadpool).
6. Strip code fences with `text.strip("`").replace("json", "", 1)` (fragile), then `json.loads`.
7. Return the parsed dict unvalidated.

## Error handling
- Career: `JSONDecodeError` → 500 with `"Failed to parse AI response: {e}"`; other exceptions → 500 with `"AI generation failed: {e}. Check backend console."` (⚠ leaks internals).
- Roadmap: any exception → 500 with a generic message (better).
- No retries, no timeout, no fallback.

## Logging
`print()` only. ⚠ Logs every user's full answers and the full parsed AI result. No request IDs, levels or structure.

## Dependencies (`requirements.txt`)
fastapi 0.128, uvicorn 0.40, pydantic 2.12, google-genai 2.25, python-dotenv, httpx, plus transitive packages. **`openai` 2.14 is listed but unused.** Two virtualenvs exist (repo root `.venv` and `backend/.venv`); consolidate to one.

## Security gaps
- No auth or rate limiting → anyone who can reach the server can spend the Gemini quota.
- Prompt injection through the free-text `curious_fields` answer and the `career` string.
- No input size limits.
- `.env` holds a real key and there's no root `.gitignore` yet.

## Planned structure (🗺️)
```
backend/
├── app/
│   ├── main.py            # app factory, middleware, routers
│   ├── config.py          # pydantic-settings (GEMINI_API_KEY, ALLOWED_ORIGINS, MODEL, …)
│   ├── api/               # routers: careers.py, roadmaps.py, progress.py, health.py
│   ├── schemas/           # Pydantic request/response models (shared with AI response_schema)
│   ├── services/llm.py    # prompt building, structured output, retries, caching, token logging
│   ├── prompts/           # versioned prompt templates
│   ├── db/                # SQLAlchemy/SQLModel models + Alembic migrations
│   └── core/              # logging, errors, rate limiting, auth
└── tests/                 # pytest with mocked LLM
```
