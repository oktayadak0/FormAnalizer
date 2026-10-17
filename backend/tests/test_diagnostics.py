import asyncio
import io
import json
import logging
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi.testclient import TestClient

from backend.app.ai import AIError, AIService
from backend.app.config import Settings
from backend.app.demo import DEMO
from backend.app.main import app, ai
from backend.app.observability import logger

client = TestClient(app)


def test_missing_runtime_is_explicit_and_no_api_key_required():
    service = AIService(Settings(model="gemma4:e4b"))
    service._request = AsyncMock(side_effect=AIError("Ollama çalışmıyor", reason="ollama_unreachable"))
    result = asyncio.run(service.diagnostics())
    assert result["code"] == "ollama_unreachable"
    assert result["ollama_reachable"] is False
    assert result["model_installed"] is None
    assert result["api_key_required"] is False


def test_parallel_status_checks_use_one_model_probe():
    service = AIService(Settings(model="gemma4:e4b"))
    service.diagnostics = AsyncMock(return_value={"state": "ready", "model_installed": True})

    async def check():
        started = asyncio.Event()
        release = asyncio.Event()

        async def generate(*args, **kwargs):
            started.set()
            await release.wait()

        service.structured = AsyncMock(side_effect=generate)
        first = asyncio.create_task(service.status())
        await started.wait()
        second = await service.status()
        assert second["state"] == "checking"
        assert service.structured.call_count == 1
        release.set()
        assert (await first)["state"] == "connected"
        assert service.health_busy is False

    asyncio.run(check())


def test_reachable_ollama_with_missing_model_never_shows_connected():
    service = AIService(Settings(model="gemma4:e4b"))
    service._request = AsyncMock(side_effect=[{"version": "test"}, {"models": [{"name": "different-model"}]}])
    result = asyncio.run(service.status())
    assert result["state"] == "unavailable"
    assert result["code"] == "model_missing"
    assert result["ollama_reachable"] is True
    assert result["model_installed"] is False
    assert result["api_key_required"] is False
    assert service._request.call_count == 2


def test_installed_model_diagnostics_do_not_claim_verified_inference(monkeypatch):
    monkeypatch.setattr(ai, "last_verified", 0)
    mocked = AsyncMock(side_effect=[{"version": "test"}, {"models": [{"name": "gemma4:e4b"}]}])
    monkeypatch.setattr(ai, "_request", mocked)
    response = client.get("/api/diagnostics")
    assert response.status_code == 200
    result = response.json()
    assert result["model_installed"] is True
    assert result["inference_verified"] is False
    assert result["state"] == "ready"
    assert response.headers["x-request-id"]
    assert all(call.args[1] != "/api/chat" for call in mocked.call_args_list)


@pytest.mark.parametrize("personal", ["", "Yazılım eğitimi almak istiyorum.\nBursu eğitim kitapları için kullanacağım."])
def test_live_draft_writes_new_text_with_or_without_personal_information(monkeypatch, personal):
    answer = "Bu burs, eğitim kaynaklarına erişimimi kolaylaştırarak öğrenmeye odaklanmama katkı sağlayabilir."
    suggestions = ["Bu kaynaklarla hangi projeyi yapmak istersiniz?"]
    mocked = AsyncMock(side_effect=[{"model_info": {"general.architecture": "gemma4"}},
                                    {"message": {"content": json.dumps({"answer": answer, "supporting_facts": personal.splitlines(), "follow_up_questions": suggestions})}}])
    monkeypatch.setattr(ai, "_request", mocked)
    response = client.post("/api/draft", json={"source": DEMO["source"], "analysis": DEMO["analysis"],
        "demo": False, "requirement_id": "motivation", "personal_info": personal})
    assert response.status_code == 200
    assert response.json()["answer"] == answer
    assert answer != personal
    assert response.json()["generic"] is (not bool(personal))
    assert response.json()["mode"] == "live"
    assert response.json()["follow_up_questions"] == suggestions
    assert mocked.call_args_list[1].args[2]["model"] == "gemma4:e4b"
    assert mocked.call_args_list[1].args[2]["options"]["num_ctx"] == 8192
    assert mocked.call_args_list[1].args[2]["think"] is False
    schema = mocked.call_args_list[1].args[2]["format"]["properties"]
    assert schema["answer"]["maxLength"] == 500
    assert schema["supporting_facts"]["maxItems"] == (20 if personal else 0)


def test_live_draft_retries_placeholder_and_returns_actual_generated_text(monkeypatch):
    answer = "Bu destek, eğitim kaynaklarından daha fazla yararlanmama katkı sağlayabilir."
    replies = [{"answer": "[Yanıtınızı kendi bilgilerinizle buraya yazın.]", "supporting_facts": [], "follow_up_questions": []},
               {"answer": answer, "supporting_facts": [], "follow_up_questions": ["Eğitim hedefiniz nedir?"]}]
    mocked = AsyncMock(side_effect=[{"model_info": {"general.architecture": "gemma4"}}] +
        [{"message": {"content": json.dumps(reply)}} for reply in replies])
    monkeypatch.setattr(ai, "_request", mocked)
    response = client.post("/api/draft", json={"source": DEMO["source"], "analysis": DEMO["analysis"],
        "demo": False, "requirement_id": "motivation", "personal_info": ""})
    assert response.status_code == 200
    assert response.json()["answer"] == answer
    assert mocked.call_count == 3


def test_draft_failure_has_trace_and_logs_exclude_private_content(monkeypatch):
    private = "PRIVATE_FACT_9274"
    messages = io.StringIO()
    handler = logging.StreamHandler(messages)
    logger.addHandler(handler)
    monkeypatch.setattr(ai, "_request", AsyncMock(side_effect=AIError("Ollama servisine ulaşılamadı. API key gerekmez.", reason="ollama_unreachable")))
    try:
        response = client.post("/api/draft", json={"source": DEMO["source"], "analysis": DEMO["analysis"],
            "demo": False, "requirement_id": "motivation", "personal_info": private})
        assert response.status_code == 503
        assert response.json()["code"] == "ollama_unreachable"
        assert response.json()["request_id"] == response.headers["x-request-id"]
        output = messages.getvalue()
        assert "draft.request mode=live" in output
        assert "ollama_unreachable" in output
        assert private not in output
        assert DEMO["source"] not in output
    finally:
        logger.removeHandler(handler)


def test_invalid_input_logs_do_not_include_arbitrary_user_field_names():
    private = "PRIVATE_FIELD_NAME_7391"
    messages = io.StringIO()
    handler = logging.StreamHandler(messages)
    logger.addHandler(handler)
    try:
        response = client.post("/api/analyze", json={"source": "a", private: "PRIVATE_FIELD_VALUE"})
        assert response.status_code == 422
        assert response.json()["code"] == "invalid_input"
        assert private not in messages.getvalue()
        assert "PRIVATE_FIELD_VALUE" not in messages.getvalue()
    finally:
        logger.removeHandler(handler)


def test_http_404_identifies_missing_model_and_does_not_echo_ollama_body(monkeypatch):
    service = AIService(Settings(model="gemma4:e4b"))
    request = httpx.Request("POST", "http://localhost:11434/api/show")
    response = httpx.Response(404, request=request, json={"error": "SENSITIVE_RESPONSE_CONTENT"})
    fake = AsyncMock()
    fake.request.return_value = response
    context = AsyncMock()
    context.__aenter__.return_value = fake
    monkeypatch.setattr("backend.app.ai.httpx.AsyncClient", lambda **kwargs: context)
    try:
        asyncio.run(service._request("POST", "/api/show", {"model": "gemma4:e4b"}))
        assert False, "Expected missing model error"
    except AIError as error:
        assert error.reason == "model_missing"
        assert "SENSITIVE_RESPONSE_CONTENT" not in str(error)
