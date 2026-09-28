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

LOG_LEVEL = os.getenv("LOG_LEVEL", "").strip().upper() or "INFO"
