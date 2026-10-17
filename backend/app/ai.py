import json
import time

import httpx
from pydantic import ValidationError

from .config import Settings
from .schemas import Ping


class AIError(Exception):
    def __init__(self, message: str, code: int = 503):
        super().__init__(message)
        self.code = code


class AIService:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.last_verified = 0.0

    async def _request(self, method: str, path: str, payload=None, timeout=None):
        try:
            self.settings.validate()
            async with httpx.AsyncClient(base_url=self.settings.base_url, timeout=timeout or self.settings.timeout,
                                         trust_env=False, follow_redirects=False) as client:
                response = await client.request(method, path, json=payload)
                response.raise_for_status()
                return response.json()
        except ValueError:
            raise AIError("Yerel model yapılandırması veya Ollama yanıtı geçersiz. README kurulumunu kontrol edin.") from None
        except httpx.TimeoutException:
            raise AIError("Gemma 4 yanıt süresi aşıldı. Modeli ve cihaz belleğini kontrol edip yeniden deneyin.") from None
        except httpx.HTTPError:
            raise AIError("Yerel Gemma 4 servisine ulaşılamadı. Ollama'yı başlatıp gemma4:e4b modelini yükleyin.") from None

    async def verify_local_model(self):
        show = await self._request("POST", "/api/show", {"model": self.settings.model}, timeout=10)
        if not isinstance(show, dict):
            raise AIError("Ollama model bilgisi geçersiz; yerel model doğrulanamadı.", 502)
        if show.get("remote_model") or show.get("remote_host"):
            raise AIError("Bulut modeline izin verilmiyor; yerel Gemma 4 kurulmalıdır.")
        info = show.get("model_info") or {}
        details = show.get("details") or {}
        if not isinstance(info, dict) or not isinstance(details, dict):
            raise AIError("Ollama model bilgisi geçersiz; yerel model doğrulanamadı.", 502)
        architecture = str(info.get("general.architecture", "")).lower()
        families = details.get("families", []) or []
        if not isinstance(families, list):
            raise AIError("Ollama model ailesi doğrulanamadı.", 502)
        if not architecture.startswith("gemma4") and "gemma4" not in families:
            raise AIError("Yüklü modelin Gemma 4 mimarisi doğrulanamadı. Ollama'yı güncelleyin.")

    async def structured(self, schema, prompt, data, validate=None):
        if self.settings.demo:
            raise AIError("Demo modu açık. Gerçek analiz için DEMO_MODE=false ayarlayın.")
        await self.verify_local_model()
        messages = [{"role": "system", "content": prompt + "\nJSON schema:\n" + json.dumps(schema.model_json_schema(), ensure_ascii=False)},
                    {"role": "user", "content": json.dumps(data, ensure_ascii=False)}]
        for attempt in range(2):
            result = await self._request("POST", "/api/chat", {
                "model": self.settings.model, "messages": messages, "stream": False,
                "format": schema.model_json_schema(),
                "options": {"temperature": 0, "num_predict": 10000, "num_ctx": 32768},
                "keep_alive": "5m",
            })
            try:
                content = result["message"]["content"].strip()
                if content.startswith("```json") and content.endswith("```"):
                    content = content[7:-3].strip()
                parsed = schema.model_validate_json(content)
                if validate:
                    validate(parsed)
                self.last_verified = time.monotonic()
                return parsed
            except (KeyError, TypeError, AttributeError, ValidationError, ValueError):
                if attempt == 1:
                    raise AIError("Model çıktısı şema veya kaynak doğrulamasını geçemedi. Sonuç gösterilmedi; yeniden deneyin.", 502) from None
                # Do not echo malformed output or document content into logs or repair prompts.
                messages.append({"role": "user", "content": "Önceki çıktı doğrulanamadı. JSON şemasını, birebir alıntıları, tüm kimlikleri ve karakter sınırını kontrol et. Yalnızca geçerli JSON üret."})

    async def status(self):
        if self.settings.demo:
            return {"state": "demo", "label": "Demo Modu", "detail": "Önceden hazırlanmış örnek sonuçlar; canlı model kullanılmıyor."}
        try:
            if not self.last_verified or time.monotonic() - self.last_verified > 30:
                await self.structured(Ping, 'Yalnızca {"ok":true} JSON yanıtı ver.', {"health_check": True})
            return {"state": "connected", "label": "Gemma 4 Bağlı", "detail": "Yerel modelden geçerli yanıt alındı."}
        except AIError as error:
            self.last_verified = 0
            return {"state": "unavailable", "label": "AI Kullanılamıyor", "detail": str(error)}
