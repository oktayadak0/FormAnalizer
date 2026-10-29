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


def test_supporting_facts_allow_turkish_case_and_punctuation_differences():
    draft = assemble_draft(
        GeneratedDraft(
            answer="İstatistik ve Python alanında gelişmek istiyorum.",
            supporting_facts=["İstatistik ve python öğrenmek istiyorum."],
            follow_up_questions=[],
        ),
        "istatistik ve python öğrenmek istiyorum",
        500,
    )
    assert draft["generic"] is False


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


def test_profile_extraction_grounds_every_item_in_uploaded_documents(monkeypatch):
    docs = [
        {"filename": "ozgecmis.txt", "text": "Eğitim: Örnek Üniversite Bilgisayar Mühendisliği 3. sınıf öğrencisiyim.\nProje: Python ve FastAPI ile açık kaynak başvuru analiz aracı geliştirdim."},
        {"filename": "hedefler.txt", "text": "Hedef: Yapay zekâ ve doğal dil işleme alanında açık kaynak eğitim araçları üretmek istiyorum."},
    ]
    demo_res = client.post("/api/profile", json={"documents": docs, "demo": True})
    assert demo_res.status_code == 200
    assert demo_res.json()["mode"] == "demo"
    assert len(demo_res.json()["profile"]["items"]) == 3

    mocked = AsyncMock(side_effect=[
        {"model_info": {"general.architecture": "gemma4"}},
        {"message": {"content": json.dumps({
            "summary": "Bilgisayar Mühendisliği 3. sınıf öğrencisi; Python/FastAPI ve doğal dil işleme projeleri geliştiriyor.",
            "items": [
                {"category": "education", "label": "Bilgisayar Mühendisliği", "detail": "Örnek Üniversite Bilgisayar Mühendisliği 3. sınıf öğrencisiyim.", "evidence_id": 0},
                {"category": "project", "label": "Açık Kaynak Analiz Aracı", "detail": "Python ve FastAPI ile açık kaynak başvuru analiz aracı geliştirdim.", "evidence_id": 1},
                {"category": "goal", "label": "Doğal Dil İşleme Hedefi", "detail": "Yapay zekâ ve doğal dil işleme alanında açık kaynak eğitim araçları üretmek istiyorum.", "evidence_id": 2},
            ],
        })}},
    ])
    monkeypatch.setattr(ai, "_request", mocked)
    live_res = client.post("/api/profile", json={"documents": docs, "demo": False})
    assert live_res.status_code == 200
    profile = live_res.json()["profile"]
    assert live_res.json()["mode"] == "live"
    assert profile["items"][0]["source_file"] == "ozgecmis.txt"
    assert "Bilgisayar Mühendisliği" in profile["items"][0]["evidence"]
    assert profile["items"][2]["source_file"] == "hedefler.txt"


def test_draft_uses_extracted_profile_facts_even_when_personal_info_is_empty(monkeypatch):
    answer = "Bilgisayar Mühendisliği 3. sınıf öğrencisi olarak Python ve FastAPI ile açık kaynak eğitim araçları geliştirmeyi hedefliyorum."
    mocked = AsyncMock(side_effect=[
        {"model_info": {"general.architecture": "gemma4"}},
        {"message": {"content": json.dumps({
            "answer": answer,
            "supporting_facts": ["Örnek Üniversite Bilgisayar Mühendisliği 3. sınıf öğrencisiyim."],
            "follow_up_questions": [],
        })}},
    ])
    monkeypatch.setattr(ai, "_request", mocked)
    payload = {
        "source": DEMO["source"],
        "analysis": DEMO["analysis"],
        "demo": False,
        "requirement_id": "motivation",
        "personal_info": "",
        "profile_facts": [
            "Örnek Üniversite Bilgisayar Mühendisliği 3. sınıf öğrencisiyim.",
            "Python ve FastAPI ile açık kaynak başvuru analiz aracı geliştirdim.",
        ],
        "follow_up_answers": [],
    }
    response = client.post("/api/draft", json=payload)
    assert response.status_code == 200
    assert response.json()["answer"] == answer
    assert response.json()["generic"] is False
    sent = json.loads(mocked.call_args_list[1].args[2]["messages"][1]["content"])
    assert sent["profile_facts"] == payload["profile_facts"]


