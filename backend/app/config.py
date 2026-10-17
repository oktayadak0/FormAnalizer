import os
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")


@dataclass(frozen=True)
class Settings:
    base_url: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
    model: str = os.getenv("OLLAMA_MODEL", "gemma4:e4b")
    timeout: float = float(os.getenv("OLLAMA_TIMEOUT", "120"))
    demo: bool = os.getenv("DEMO_MODE", "false").lower() == "true"

    def validate(self):
        parsed = urlparse(self.base_url)
        if parsed.scheme != "http" or parsed.hostname not in {"localhost", "127.0.0.1", "::1"} or parsed.username or parsed.password or parsed.path not in {"", "/"} or parsed.query or parsed.fragment:
            raise ValueError("Gizlilik için Ollama adresi yalnızca yerel HTTP adresi olabilir.")
        if self.model not in {"gemma4:e4b", "gemma4:e2b", "gemma4:12b", "gemma4:26b", "gemma4:31b"}:
            raise ValueError("Doğrulanmış yerel bir Gemma 4 etiketi seçin; bulut modelleri kapalıdır.")
        if not 1 <= self.timeout <= 300:
            raise ValueError("OLLAMA_TIMEOUT 1–300 saniye olmalıdır.")
