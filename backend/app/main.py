import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from starlette.middleware.trustedhost import TrustedHostMiddleware

from . import prompts
from .ai import AIError, AIService
from .config import Settings
from .demo import demo_analysis, demo_draft, demo_missing
from .documents import MAX_FILE_SIZE, extract_document
from .grounding import assemble_draft, validate_grounding, validate_missing
from .schemas import Analysis, AnalyzeRequest, DraftRequest, DraftSelection, MissingRequest, MissingResult

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


@app.exception_handler(AIError)
async def ai_error_handler(request, error):
    ai.last_verified = 0
    return JSONResponse(status_code=error.code, content={"detail": str(error)})


@app.exception_handler(ValueError)
async def validation_error_handler(request, error):
    return JSONResponse(status_code=422, content={"detail": str(error)})


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
    async with model_slot():
        return await ai.status()


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
    async with model_slot():
        result = await ai.structured(Analysis, prompts.ANALYZE, {"source": request.source},
                                     lambda result: validate_grounding(result, request.source))
    return {"analysis": result, "mode": "live"}


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
    check_context(request)
    question = next((r for r in request.analysis.requirements if r.id == request.requirement_id and r.kind == "question"), None)
    if not question:
        raise HTTPException(422, "Geçerli bir başvuru sorusu seçin.")
    if request.demo:
        return demo_draft(request, question.character_limit)
    async with model_slot():
        selection = await ai.structured(DraftSelection, prompts.DRAFT,
            {"question": question.model_dump(mode="json"), "personal_info": request.personal_info},
            lambda result: assemble_draft(result, request.personal_info, question.character_limit))
    return {**assemble_draft(selection, request.personal_info, question.character_limit), "mode": "live"}
