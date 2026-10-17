import asyncio
import json
from io import BytesIO
from unittest.mock import AsyncMock

import pymupdf
import pytest
from docx import Document
from fastapi.testclient import TestClient

from backend.app.ai import AIService
from backend.app.config import Settings
from backend.app.grounding import explicit_deadline, resolve_analysis, source_units
from backend.app.main import ai, app
from backend.app.schemas import ReferencedAnalysis

SOURCE = """Yazılım Atölyesi Başvurusu
Bu program öğrencilerin yazılım becerilerini geliştirmeyi amaçlar.
Güncel özgeçmiş PDF olarak
yüklenmelidir.
Motivasyonunuzu en fazla 400 karakter ile
açıklayın.
Son başvuru tarihi 30 Kasım 2026, saat 17.00 (Türkiye saati)."""


def selection(source):
    units = source_units(source)
    ref = lambda word: next(i for i, text in enumerate(units) if word in text)
    return {"name": "Yazılım Atölyesi", "name_evidence_id": 0,
            "purpose": "Öğrencilerin yazılım becerilerini geliştirmek.", "purpose_evidence_id": 0,
            "requirements": [
                {"id": "cv", "kind": "document", "description": "Güncel özgeçmiş PDF yükleyin.", "required": True,
                 "evidence_id": ref("özgeçmiş"), "character_limit": None, "deadline": None},
                {"id": "motivation", "kind": "question", "description": "Motivasyonunuzu açıklayın.", "required": True,
                 "evidence_id": ref("Motivasyonunuzu"), "character_limit": 400, "deadline": None}], "ambiguities": []}


def test_source_passages_preserve_pdf_line_breaks_and_exact_source():
    units = source_units(SOURCE)
    assert all(8 <= len(unit) <= 900 and unit in SOURCE for unit in units)
    result = resolve_analysis(ReferencedAnalysis.model_validate(selection(SOURCE)), units, SOURCE)
    assert "PDF olarak\nyüklenmelidir" in result.requirements[0].evidence
    assert result.requirements[1].character_limit == 400
    assert all(item.evidence in SOURCE for item in result.requirements)


def test_long_passages_remain_exact_and_fit_evidence_limits():
    text = ("Uzun başvuru metni ve koşulları " * 120) + "."
    units = source_units(text)
    assert len(units) > 1
    assert all(8 <= len(unit) <= 900 and unit in text for unit in units)


def test_model_cannot_reference_a_nonexistent_passage():
    data = selection(SOURCE)
    data["requirements"][0]["evidence_id"] = 999
    with pytest.raises(ValueError, match="kaynak bölümü"):
        resolve_analysis(ReferencedAnalysis.model_validate(data), source_units(SOURCE), SOURCE)


def test_model_cannot_add_a_limit_to_the_wrong_passage():
    data = selection(SOURCE)
    data["requirements"][1]["character_limit"] = 500
    with pytest.raises(ValueError, match="Karakter"):
        resolve_analysis(ReferencedAnalysis.model_validate(data), source_units(SOURCE), SOURCE)


def test_explicit_limit_and_response_kind_are_recovered_from_pdf_passage():
    data = selection(SOURCE)
    data["requirements"][1]["kind"] = "field"
    data["requirements"][1]["character_limit"] = None
    result = resolve_analysis(ReferencedAnalysis.model_validate(data), source_units(SOURCE), SOURCE)
    assert result.requirements[1].kind == "question"
    assert result.requirements[1].character_limit == 400
    assert next(r for r in result.requirements if r.kind == "deadline").deadline.isoformat() == "2026-11-30T17:00:00+03:00"


@pytest.mark.parametrize("text,expected", [
    ("30 Kasım 2026, saat 17.00 (Türkiye saati)", "2026-11-30T17:00:00+03:00"),
    ("30.11.2026 saat 17:00 UTC+3", "2026-11-30T17:00:00+03:00"),
    ("2026-11-30 saat 17:00 GMT+3", "2026-11-30T17:00:00+03:00"),
    ("30 KASIM 2026 saat 17:00 +03:00", "2026-11-30T17:00:00+03:00"),
    ("30 Kasım 2026 saat 17:00", None),
    ("30 Kasım 2026 Türkiye saati", None),
    ("30 Kasım saat 17:00 Türkiye saati", None),
    ("31 Şubat 2026 saat 17:00 Türkiye saati", None),
    ("30 Kasım 2026 saat 09:00 veya 17:00 Türkiye saati", None),
    ("1 Kasım 2026 ile 30 Kasım 2026 saat 17:00 Türkiye saati", None),
])
def test_deadline_only_uses_complete_explicit_date_time_and_timezone(text, expected):
    assert explicit_deadline(text) == expected


@pytest.mark.parametrize("extension", ["pdf", "docx"])
def test_uploaded_custom_document_uses_live_analysis_and_original_evidence(monkeypatch, extension):
    if extension == "pdf":
        # Embed a font so the real PDF parser preserves Turkish characters and wrapping.
        with pymupdf.open() as pdf:
            page = pdf.new_page()
            page.insert_font(fontname="custom", fontbuffer=pymupdf.Font("cjk").buffer)
            page.insert_text((50, 60), SOURCE, fontname="custom", fontsize=10)
            contents = pdf.tobytes()
    else:
        document = Document()
        for line in SOURCE.splitlines():
            document.add_paragraph(line)
        stream = BytesIO()
        document.save(stream)
        contents = stream.getvalue()
    client = TestClient(app)
    uploaded = client.post("/api/documents", files={"file": (f"custom.{extension}", contents)})
    assert uploaded.status_code == 200
    source = uploaded.json()["text"]
    mocked = AsyncMock(side_effect=[{"model_info": {"general.architecture": "gemma4"}},
        {"message": {"content": json.dumps(selection(source))}}])
    monkeypatch.setattr(ai, "_request", mocked)
    response = client.post("/api/analyze", json={"source": source, "demo": False})
    assert response.status_code == 200
    assert response.json()["mode"] == "live"
    assert all(r["evidence"] in source for r in response.json()["analysis"]["requirements"])
    payload = mocked.call_args_list[1].args[2]
    assert payload["options"]["num_ctx"] == 8192
    assert "passages" in json.loads(payload["messages"][1]["content"])


def test_status_does_not_start_another_inference_during_analysis():
    service = AIService(Settings(model="gemma4:e4b"))
    service.active_generations = 1
    service.diagnostics = AsyncMock(return_value={"state": "ready"})
    service.structured = AsyncMock()
    result = asyncio.run(service.status())
    assert result["code"] == "generation_in_progress"
    service.structured.assert_not_called()


def test_runtime_endpoint_identifies_backend_folder():
    response = TestClient(app).get("/api/runtime")
    assert response.status_code == 200
    assert response.json()["application"] == "FormDedektifi"
    assert response.json()["project_root"]


def test_bad_reference_is_retried_with_specific_safe_repair(monkeypatch):
    bad = selection(SOURCE)
    bad["requirements"][0]["evidence_id"] = 999
    mocked = AsyncMock(side_effect=[{"model_info": {"general.architecture": "gemma4"}},
        {"message": {"content": json.dumps(bad)}},
        {"message": {"content": json.dumps(selection(SOURCE))}}])
    monkeypatch.setattr(ai, "_request", mocked)
    response = TestClient(app).post("/api/analyze", json={"source": SOURCE, "demo": False})
    assert response.status_code == 200
    assert mocked.call_count == 3
    assert "passages listesinde" in mocked.call_args_list[2].args[2]["messages"][-1]["content"]
    assert ai.active_generations == 0
