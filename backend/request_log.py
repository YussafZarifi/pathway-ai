"""Logging setup with a per-request ID.

Every log line carries `rid=<id>` so the lines of one request (Gemini
attempts, retries, validation problems) can be read together. The same ID
is returned to the client in the X-Request-ID header.
"""

import contextvars
import logging
import uuid

request_id: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="-")


def new_request_id() -> str:
    rid = uuid.uuid4().hex[:12]
    request_id.set(rid)
    return rid


class _RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.rid = request_id.get()
        return True


def setup(level: str) -> None:
    handler = logging.StreamHandler()
    handler.addFilter(_RequestIdFilter())
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s rid=%(rid)s: %(message)s"))
    logging.basicConfig(level=level, handlers=[handler])
