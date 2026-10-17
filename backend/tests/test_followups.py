import io
import json
import logging
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from backend.app.ai import AIError
from backend.app.demo import DEMO
from backend.app.grounding import assemble_draft
from backend.app.main import ai, app
from backend.app.observability import logger
from backend.app.schemas import GeneratedDraft

client = TestClient(app)


def request_data(personal=""):
    return {"source": DEMO["source"], "analysis": DEMO["analysis"], "demo": False,
        "requirement_id": "motivation", "personal_info": personal,
        "follow_up_answers": [{"question": "Hangi alanda gelişmek istiyorsunuz?", "answer": "Python öğrenmek istiyorum."}]}


@pytest.mark.parametrize("personal", ["", "Bursu kitaplar için kullanacağım."])
def test_live_draft_uses_followup_answers_and_preserves_original_information(monkeypatch, personal):
    answer = "Bu destekle Python öğrenmek ve eğitimime odaklanmak istiyorum."
    mocked = AsyncMock(side_effect=[{"model_info": {"general.architecture": "gemma4"}},
        {"message": {"content": json.dumps({"answer": answer, "supporting_facts": ["Python öğrenmek istiyorum."], "follow_up_questions": []})}}])
    monkeypatch.setattr(ai, "_request", mocked)
    response = client.post("/api/draft", json=request_data(personal))
    assert response.status_code == 200
    assert response.json()["answer"] == answer
    assert response.json()["generic"] is False
    assert response.json()["mode"] == "live"
    body = mocked.call_args_list[1].args[2]
    data = json.loads(body["messages"][1]["content"])
    assert data["personal_info"] == personal
    assert data["follow_up_answers"] == request_data(personal)["follow_up_answers"]
    assert body["format"]["properties"]["supporting_facts"]["maxItems"] == 20


def test_demo_revision_uses_actual_followup_answers_instead_of_fixed_example():
    data = request_data("Bursu kitaplar için kullanacağım.")
    response = client.post("/api/draft", json={**data, "demo": True})
    assert response.status_code == 200
    assert response.json()["answer"] == "Bursu kitaplar için kullanacağım.\nPython öğrenmek istiyorum."
    assert response.json()["mode"] == "demo"


@pytest.mark.parametrize("personal,answer", [("a" * 5500, "b" * 1000), ("", "b" * 1501)])
def test_followup_input_limits_are_validated_before_model_call(monkeypatch, personal, answer):
    mocked = AsyncMock()
    monkeypatch.setattr(ai, "_request", mocked)
    data = request_data(personal)
    data["follow_up_answers"][0]["answer"] = answer
    assert client.post("/api/draft", json=data).status_code == 422
    mocked.assert_not_called()


def test_suggested_question_is_not_a_personal_fact():
    with pytest.raises(ValueError, match="dayanağı"):
        assemble_draft(GeneratedDraft(answer="Python öğrenmek istiyorum.", supporting_facts=["Hangi alanda gelişmek istiyorsunuz?"], follow_up_questions=[]),
            "Python öğrenmek istiyorum.", 500)


def test_followup_question_and_answer_never_appear_in_debug_logs(monkeypatch):
    data = request_data()
    data["follow_up_answers"] = [{"question": "PRIVATE_FOLLOWUP_QUESTION_902", "answer": "PRIVATE_FOLLOWUP_ANSWER_903"}]
    messages = io.StringIO()
    handler = logging.StreamHandler(messages)
    logger.addHandler(handler)
    monkeypatch.setattr(ai, "_request", AsyncMock(side_effect=AIError("Ollama servisine ulaşılamadı.", reason="ollama_unreachable")))
    try:
        response = client.post("/api/draft", json=data)
        assert response.status_code == 503
        assert "answered_questions=1" in messages.getvalue()
        assert "PRIVATE_FOLLOWUP_QUESTION_902" not in messages.getvalue()
        assert "PRIVATE_FOLLOWUP_ANSWER_903" not in messages.getvalue()
    finally:
        logger.removeHandler(handler)
