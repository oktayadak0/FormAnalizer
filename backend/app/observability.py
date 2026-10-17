"""Local diagnostics without source text, personal facts, prompts or model output."""
import logging
import os
import time
from contextvars import ContextVar
from uuid import uuid4

from .config import ROOT

request_id: ContextVar[str] = ContextVar("formdedektifi_request_id", default="startup")


class RequestContext(logging.Filter):
    def filter(self, record):
        record.request_id = request_id.get()
        return True


logger = logging.getLogger("formdedektifi")
logger.setLevel(getattr(logging, os.getenv("FORMDEDEKTIFI_LOG_LEVEL", "INFO").upper(), logging.INFO))
logger.propagate = False
if not logger.handlers:
    folder = ROOT / ".tools" / "logs"
    folder.mkdir(parents=True, exist_ok=True)
    formatter = logging.Formatter("%(asctime)s %(levelname)s request=%(request_id)s %(message)s", datefmt="%H:%M:%S")
    for handler in [logging.StreamHandler(), logging.FileHandler(folder / "backend-events.log", encoding="utf-8")]:
        handler.setFormatter(formatter)
        handler.addFilter(RequestContext())
        logger.addHandler(handler)


class RequestLogging:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        trace = uuid4().hex[:12]
        token = request_id.set(trace)
        start = time.monotonic()
        path = scope.get("path", "")
        # Never log arbitrary URL parameters or a user-supplied path.
        route = path if path in {"/api/analyze", "/api/draft", "/api/missing", "/api/documents", "/api/status", "/api/diagnostics", "/api/runtime", "/openapi.json"} else "other"
        status = 500
        logger.info("request.start method=%s route=%s", scope.get("method", ""), route)

        async def logged_send(message):
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                message = {**message, "headers": list(message.get("headers", [])) + [(b"x-request-id", trace.encode())]}
            await send(message)

        try:
            await self.app(scope, receive, logged_send)
        finally:
            logger.info("request.end route=%s status=%s elapsed_ms=%d", route, status, (time.monotonic() - start) * 1000)
            request_id.reset(token)
