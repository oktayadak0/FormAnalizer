import asyncio
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.middleware.trustedhost import TrustedHostMiddleware

from . import prompts
from .ai import AIError, AIService
from .config import ROOT, Settings
from .demo import demo_analysis, demo_draft, demo_missing
from .documents import MAX_FILE_SIZE, extract_document
from .grounding import assemble_draft, resolve_analysis, source_units, validate_grounding, validate_missing
from .schemas import AnalyzeRequest, DraftRequest, MissingRequest, MissingResult, ReferencedAnalysis, draft_schema
from .observability import RequestLogging, logger, request_id

app = FastAPI(title="FormDedektifi", version="1.0.0")
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["localhost", "127.0.0.1", "[::1]", "testserver"])
ai = AIService(Settings())
capacity = asyncio.Semaphore(2)


class BodyLimit:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        # Reject non-local browser origins (CORS alone does not block form POSTs).
        headers = dict(scope.get("headers", []))
        origin = headers.get(b"origin", b"").decode()
        if origin and origin not in {"http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173", "http://127.0.0.1:4173", "http://localhost:8000", "http://127.0.0.1:8000"}:
            return await JSONResponse({"detail": "Yalnızca yerel arayüz erişimi desteklenir."}, status_code=403)(scope, receive, send)
        size = 0

        async def limited_receive():
            nonlocal size
            message = await receive()
            size += len(message.get("body", b""))
            if size > 6 * 1024 * 1024:
                raise HTTPException(413, "İstek boyutu sınırı aşıldı.")
            return message

        await self.app(scope, limited_receive, send)


app.add_middleware(BodyLimit)
app.add_middleware(RequestLogging)


@app.exception_handler(AIError)
async def ai_error_handler(request, error):
    ai.last_verified = 0
    logger.warning("request.ai_error code=%s status=%s", error.reason, error.code)
    return JSONResponse(status_code=error.code, content={"detail": str(error), "code": error.reason, "request_id": request_id.get()})


@app.exception_handler(ValueError)
async def validation_error_handler(request, error):
    logger.warning("request.validation_error kind=grounding")
    return JSONResponse(status_code=422, content={"detail": str(error), "code": "source_validation_failed", "request_id": request_id.get()})


@app.exception_handler(RequestValidationError)
async def input_error_handler(request, error):
    allowed = {"source", "demo", "analysis", "requirements", "facts", "personal_info", "follow_up_answers", "question", "answer", "requirement_id", "character_limit", "evidence", "text", "not_applicable"}
    fields = sorted({str(e["loc"][-1]) if str(e["loc"][-1]) in allowed else "other" for e in error.errors()})
    logger.warning("request.validation_error kind=input fields=%s", ",".join(fields))
    return JSONResponse(status_code=422, content={"detail": "Girdi sınırlarını kontrol edin: " + ", ".join(fields), "code": "invalid_input", "request_id": request_id.get()})


@asynccontextmanager
async def model_slot():
    try:
        await asyncio.wait_for(capacity.acquire(), timeout=0.1)
    except TimeoutError:
        raise HTTPException(429, "Model meşgul. Biraz sonra yeniden deneyin.") from None
    try:
        yield
    finally:
        capacity.release()


def check_context(request):
    validate_grounding(request.analysis, request.source)
    if request.demo:
        expected = demo_analysis(request.source)
        if request.analysis != expected:
            raise ValueError("Demo analizi değiştirilmiş. Örneği yeniden açın.")


@app.get("/api/status")
async def status():
    # Background connection checks must not consume user generation slots.
    return await ai.status()


@app.get("/api/diagnostics")
async def diagnostics():
    # Cheap installation checks; never loads a model or consumes the generation semaphore.
    return await ai.diagnostics()


@app.get("/api/runtime")
async def runtime():
    # Let launchers following a reused service locate that service's actual logs.
    return {"application": "FormDedektifi", "project_root": str(ROOT), "process_id": os.getpid()}


@app.post("/api/documents")
async def document(file: UploadFile = File(...)):
    try:
        data = await file.read(MAX_FILE_SIZE + 1)
        text = await run_in_threadpool(extract_document, file.filename or "", data)
        return {"text": text, "characters": len(text)}
    finally:
        await file.close()


@app.post("/api/analyze")
async def analyze(request: AnalyzeRequest):
    if request.demo:
        return {"analysis": demo_analysis(request.source), "mode": "demo"}
    units = source_units(request.source)
    if not units:
        raise HTTPException(422, "Belgede analiz edilebilecek yeterli metin bulunamadı.")
    logger.info("analysis.request source_characters=%d passages=%d", len(request.source), len(units))
    async with model_slot():
        result = await ai.structured(ReferencedAnalysis, prompts.ANALYZE,
            {"passages": [{"id": index, "text": text} for index, text in enumerate(units)]},
            lambda result: resolve_analysis(result, units, request.source))
    return {"analysis": resolve_analysis(result, units, request.source), "mode": "live"}


@app.post("/api/missing")
async def missing(request: MissingRequest):
    check_context(request)
    if request.demo:
        return {**demo_missing(request).model_dump(), "mode": "demo"}
    async with model_slot():
        result = await ai.structured(MissingResult, prompts.MISSING, request.model_dump(mode="json"),
                                     lambda result: validate_missing(result, request))
    return {**result.model_dump(), "mode": "live"}


@app.post("/api/draft")
async def draft(request: DraftRequest):
    facts = request.personal_facts()
    logger.info("draft.request mode=%s personal_characters=%d answered_questions=%d", "demo" if request.demo else "live", len(facts), len(request.follow_up_answers))
    check_context(request)
    question = next((r for r in request.analysis.requirements if r.id == request.requirement_id and r.kind == "question"), None)
    if not question:
        raise HTTPException(422, "Geçerli bir başvuru sorusu seçin.")
    if request.demo:
        return demo_draft(request, question.character_limit)
    async with model_slot():
        selection = await ai.structured(draft_schema(facts, question.character_limit), prompts.DRAFT,
            {"question": question.model_dump(mode="json"), "personal_info": request.personal_info,
             "follow_up_answers": [item.model_dump() for item in request.follow_up_answers]},
            lambda result: assemble_draft(result, facts, question.character_limit))
    return {**assemble_draft(selection, facts, question.character_limit), "mode": "live"}
