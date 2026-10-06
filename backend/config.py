"""Backend settings, read once from environment variables.

Locally they come from backend/.env (see .env.example); on Render they are
set in the service's environment. Nothing here has a localhost default:
without ALLOWED_ORIGINS no browser origin may call the API.
"""

import os

from dotenv import load_dotenv

load_dotenv()


def _int(name: str, default: int) -> int:
    raw = os.getenv(name, "").strip()
    try:
        return int(raw) if raw else default
    except ValueError:
        raise RuntimeError(f"{name} must be an integer") from None


def _bool(name: str, default: bool) -> bool:
    raw = os.getenv(name, "").strip().lower()
    if not raw:
        return default
    if raw in ("1", "true", "yes", "on"):
        return True
    if raw in ("0", "false", "no", "off"):
        return False
    raise RuntimeError(f"{name} must be true or false")


def _origins(raw: str) -> list[str]:
    # Browsers send origins without a trailing slash; tolerate one in config.
    return [o.strip().rstrip("/") for o in raw.split(",") if o.strip()]


GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "").strip() or "gemini-2.5-flash-lite"
GEMINI_TIMEOUT_SECONDS = _int("GEMINI_TIMEOUT_SECONDS", 30)

# Comma-separated frontend origins, e.g. "https://pathwayai.onrender.com".
ALLOWED_ORIGINS = _origins(os.getenv("ALLOWED_ORIGINS", ""))

# Rate limits for the AI endpoints (each call spends Gemini quota; each
# roadmap also spends up to 5 YouTube searches).
RATE_LIMIT_PER_MINUTE = _int("RATE_LIMIT_PER_MINUTE", 8)
RATE_LIMIT_PER_DAY = _int("RATE_LIMIT_PER_DAY", 50)
GLOBAL_AI_LIMIT_PER_DAY = _int("GLOBAL_AI_LIMIT_PER_DAY", 500)

# Supabase project URL (ADR-018), e.g. "https://<ref>.supabase.co". Used to
# verify users' access tokens against the project's public keys. Optional:
# without it, account routes return 503 and the AI routes work as before.
SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip().rstrip("/")

# Server-only Postgres connection as the pathwayai_api role (ADR-019),
# through Supabase's transaction pooler (port 6543). A secret: it holds the
# role's password. Optional: without it the app starts normally, guests
# work, and the saved-roadmap routes (/api/roadmaps*) return 503.
DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
DB_POOL_MAX = _int("DB_POOL_MAX", 5)

# Résumé analysis (ADR-020). Off unless explicitly enabled: turn it on only
# with a Gemini key on a paid (billing-enabled) project, because Google's
# unpaid-tier terms forbid sending personal information. While off,
# POST /api/resume-analyses returns 503 before reading any upload.
RESUME_ANALYSIS_ENABLED = _bool("RESUME_ANALYSIS_ENABLED", False)
# Per signed-in user, plus a global daily cap (each analysis is a Gemini
# call with a whole PDF).
RESUME_LIMIT_PER_HOUR = _int("RESUME_LIMIT_PER_HOUR", 3)
RESUME_LIMIT_PER_DAY = _int("RESUME_LIMIT_PER_DAY", 10)
RESUME_GLOBAL_LIMIT_PER_DAY = _int("RESUME_GLOBAL_LIMIT_PER_DAY", 100)

LOG_LEVEL =os.getenv("LOG_LEVEL", "").strip().upper() or "INFO"
