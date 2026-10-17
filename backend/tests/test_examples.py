import pytest
from fastapi.testclient import TestClient

from backend.app.demo import EXAMPLES, demo_analysis
from backend.app.main import app


@pytest.mark.parametrize("sample", EXAMPLES, ids=lambda sample: sample["id"])
def test_each_sample_has_multiple_grounded_questions_and_matching_demo_answers(sample):
    analysis = demo_analysis(sample["source"])
    questions = [r for r in analysis.requirements if r.kind == "question"]
    assert len(questions) >= 3
    assert all(r.evidence in sample["source"] for r in analysis.requirements)
    client = TestClient(app)
    for question in questions:
        response = client.post("/api/draft", json={"source": sample["source"], "analysis": analysis.model_dump(mode="json"),
            "demo": True, "requirement_id": question.id, "personal_info": ""})
        assert response.status_code == 200
        answer = response.json()["answer"]
        assert answer == sample["question_examples"][question.id]["answer"]
        assert 0 < len(answer) <= question.character_limit
        assert response.json()["mode"] == "demo"
