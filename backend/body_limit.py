"""Request body size limits, enforced while the body is read.

Checking only the Content-Length header isn't enough: a client can send the
body with `Transfer-Encoding: chunked` and no length, and the whole body was
then read into memory and parsed (found in the 2026-10-04 audit: a 2 MB
chunked body was accepted). This ASGI middleware:

- rejects a declared Content-Length over the limit at once (413, nothing
  read), and
- counts the bytes actually received and stops with 413 as soon as the
  limit is passed, whatever the headers say.

It raises FastAPI's HTTPException from the body reader (FastAPI re-raises
that class unchanged during body parsing; any other error becomes a 400), so
the client gets the same 413 response either way.
"""

from fastapi import HTTPException
from starlette.responses import JSONResponse

TOO_LARGE = "Request is too large."


class BodySizeLimitMiddleware:
    def __init__(self, app, default_limit: int, limits_by_path: dict[str, int] | None = None):
        self.app = app
        self.default_limit = default_limit
        self.limits_by_path = limits_by_path or {}

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        limit = self.limits_by_path.get(scope["path"], self.default_limit)

        declared = None
        for name, value in scope.get("headers", []):
            if name == b"content-length":
                declared = value.decode("latin-1").strip()
                break
        if declared is not None and (not declared.isdigit() or int(declared) > limit):
            await JSONResponse(status_code=413, content={"detail": TOO_LARGE})(scope, receive, send)
            return

        received = 0

        async def limited_receive():
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > limit:
                    raise HTTPException(status_code=413, detail=TOO_LARGE)
            return message

        await self.app(scope, limited_receive, send)
