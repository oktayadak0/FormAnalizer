import pytest

from backend.app.config import Settings
from backend.app.main import ai


@pytest.fixture(autouse=True)
def isolated_model_configuration(monkeypatch):
    # Tests must never depend on or contact the user's real configured model.
    monkeypatch.setattr(ai, "settings", Settings(model="gemma4:e4b", base_url="http://localhost:11434", timeout=120, demo=False))
    monkeypatch.setattr(ai, "last_verified", 0.0)
    monkeypatch.setattr(ai, "health_busy", False)
