"""Backend settings, read once from environment variables.

Locally they come from backend/.env (see .env.example); on Render they are
set in the service's environment. Nothing here has a localhost default:
without ALLOWED_ORIGINS no browser origin may call the API.
"""

import os

from dotenv import load_dotenv

load_dotenv()


def _origins(raw: str) -> list[str]:
    # Browsers send origins without a trailing slash; tolerate one in config.
    return [o.strip().rstrip("/") for o in raw.split(",") if o.strip()]


GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "").strip() or "gemini-2.5-flash-lite"

# Comma-separated frontend origins, e.g. "https://pathwayai.onrender.com".
ALLOWED_ORIGINS = _origins(os.getenv("ALLOWED_ORIGINS", ""))
