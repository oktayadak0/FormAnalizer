import json
import time

import httpx
from pydantic import ValidationError

from .config import Settings
from .grounding import DraftValidationError, SourceValidationError
from .observability import logger
from .schemas import Ping


class AIError(Exception):
    def __init__(self, message: str, code: int = 503, reason: str = "ai_unavailable"):
        super().__init__(message)
        self.code = code
        self.reason = reason


class AIService:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.last_verified = 0.0
        self.health_busy = False
        self.active_generations = 0

    async def _request(self, method: str, path: str, payload=None, timeout=None):
        start = time.monotonic()
        try:
            self.settings.validate()
            logger.debug("ollama.request method=%s endpoint=%s model=%s", method, path, self.settings.model)
            async with httpx.AsyncClient(base_url=self.settings.base_url, timeout=timeout or self.settings.timeout,
                                         trust_env=False, follow_redirects=False) as client:
                response = await client.request(method, path, json=payload)
                response.raise_for_status()
                logger.debug("ollama.response endpoint=%s status=%s elapsed_ms=%d", path, response.status_code, (time.monotonic() - start) * 1000)
                return response.json()
        except ValueError:
            raise AIError("Yerel model yapılandırması veya Ollama yanıtı geçersiz. .env ayarlarını kontrol edin.", reason="configuration_or_json_invalid") from None
        except httpx.TimeoutException:
            logger.warning("ollama.timeout endpoint=%s timeout_seconds=%s", path, timeout or self.settings.timeout)
            raise AIError("Gemma 4 yanıt süresi aşıldı. İlk yükleme veya cihaz belleği nedeniyle olabilir. run.bat kayıtlarını ve OLLAMA_TIMEOUT ayarını kontrol edin.", reason="ollama_timeout") from None
        except httpx.HTTPStatusError as error:
            status = error.response.status_code
            logger.warning("ollama.http_error endpoint=%s status=%s", path, status)
            if status == 404 and path in {"/api/show", "/api/chat"}:
                raise AIError(f"{self.settings.model} modeli bulunamadı. installer.bat ile model kurulumunu tamamlayın. API key gerekmez.", reason="model_missing") from None
            raise AIError(f"Ollama isteği başarısız (HTTP {status}). Ayrıntılı hata kodu run.bat penceresinde; API key gerekmez.", reason="ollama_http_error") from None
        except httpx.HTTPError:
            logger.warning("ollama.unreachable endpoint=%s", path)
            raise AIError("Ollama servisine ulaşılamadı. installer.bat ile kurulumu tamamlayıp run.bat ile başlatın. Yerel kullanım için API key gerekmez.", reason="ollama_unreachable") from None

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
        if schema is Ping:
            return await self._structured(schema, prompt, data, validate)
        self.active_generations += 1
        try:
            return await self._structured(schema, prompt, data, validate)
        finally:
            self.active_generations -= 1

    async def _structured(self, schema, prompt, data, validate=None):
        if self.settings.demo:
            raise AIError("Demo modu açık. Gerçek analiz için DEMO_MODE=false ayarlayın.")
        await self.verify_local_model()
        logger.info("ai.start task=%s model=%s", schema.__name__, self.settings.model)
        messages = [{"role": "system", "content": prompt + "\nJSON schema:\n" + json.dumps(schema.model_json_schema(), ensure_ascii=False)},
                    {"role": "user", "content": json.dumps(data, ensure_ascii=False)}]
        ping = schema is Ping
        draft = schema.__name__ == "GeneratedDraft"
        analysis = schema.__name__ == "ReferencedAnalysis"
        small_input = len(json.dumps(data, ensure_ascii=False)) <= 12000
        options = {"temperature": 0, "num_predict": 64 if ping else 2048 if draft else 10000,
                   "num_ctx": (16384 if not small_input else 8192) if draft else 8192 if ping or (analysis and small_input) else 32768}
        for attempt in range(2):
            result = await self._request("POST", "/api/chat", {
                "model": self.settings.model, "messages": messages, "stream": False,
                "think": False,
                "format": schema.model_json_schema(),
                "options": options,
                "keep_alive": "5m",
            })
            if isinstance(result, dict):
                finish = result.get("done_reason")
                logger.debug("ai.generation task=%s finish=%s tokens=%s", schema.__name__,
                             finish if finish in {"stop", "length", "load", "unload"} else "other",
                             result.get("eval_count") if isinstance(result.get("eval_count"), int) else "unknown")
            try:
                content = result["message"]["content"].strip()
                if content.startswith("```json") and content.endswith("```"):
                    content = content[7:-3].strip()
                parsed = schema.model_validate_json(content)
                if validate:
                    validate(parsed)
                self.last_verified = time.monotonic()
                logger.info("ai.success task=%s attempt=%d", schema.__name__, attempt + 1)
                return parsed
            except (KeyError, TypeError, AttributeError, ValidationError, ValueError) as error:
                # ValidationError text can contain personal input; log only safe error categories.
                reason = error.code if isinstance(error, (DraftValidationError, SourceValidationError)) else type(error).__name__
                if isinstance(error, ValidationError):
                    reason += ":" + ",".join(e["type"] for e in error.errors(include_input=False))
                logger.warning("ai.validation_failed task=%s attempt=%d reason=%s", schema.__name__, attempt + 1, reason)
                if attempt == 1:
                    raise AIError("Model çıktısı şema veya kaynak doğrulamasını geçemedi. Sonuç gösterilmedi; run.bat penceresindeki tanı numarasını kontrol edin.", 502, "model_output_invalid") from None
                # Do not echo malformed output or document content into logs or repair prompts.
                repair = ("Önceki yanıt doğrulanamadı. answer alanına soruyu yanıtlayan, boş olmayan gerçek bir paragraf yaz. "
                          "Köşeli parantez, doldurma talimatı veya yalnızca soru yazma. Karakter sınırını aşma; "
                          "supporting_facts yalnızca personal_info veya follow_up_answers cevaplarından birebir alıntılar olmalı."
                          if draft else "Önceki çıktı doğrulanamadı. JSON şemasını, birebir alıntıları, tüm kimlikleri ve karakter sınırını kontrol et.")
                if draft and isinstance(error, DraftValidationError):
                    repair += {"draft_placeholder": " Tamamlanmış, yer tutucu içermeyen iki kısa cümle yaz.",
                               "draft_too_long": " Önceki yanıt fazla uzundu. En fazla 150 karakter yaz.",
                               "draft_unverified_fact": " Verilmemiş kişisel bilgileri çıkar; supporting_facts boş olabilir."}[error.code]
                if isinstance(error, SourceValidationError):
                    repair += {"source_reference_invalid": " evidence_id yalnızca passages listesinde bulunan id sayısı olmalı.",
                               "source_quote_missing": " Yalnızca özgün kaynak bölümlerini kullan.",
                               "character_limit_unsupported": " Seçilen bölümde açıkça N karakter yazmıyorsa character_limit=null kullan.",
                               "deadline_unsupported": " Seçilen bölümde kesin tarih VE saat yoksa deadline=null kullan.",
                               "timezone_unsupported": " Seçilen bölümde Türkiye veya UTC+3 saat dilimi yoksa deadline=null kullan."}[error.code]
                messages.append({"role": "user", "content": repair + " Yalnızca geçerli JSON üret."})

    async def diagnostics(self):
        result = {"model": self.settings.model, "provider": "Ollama (yerel)", "api_key_required": False,
                  "ollama_reachable": False, "model_installed": None, "inference_verified": False,
                  "setup_command": "installer.bat"}
        if self.settings.demo:
            return {**result, "state": "demo", "label": "Demo Modu", "code": "demo_enabled",
                    "detail": "DEMO_MODE=true: canlı AI kapalı. Yerel Gemma 4 için API key gerekmez."}
        try:
            version = await self._request("GET", "/api/version", timeout=3)
            if not isinstance(version, dict) or not version.get("version"):
                raise AIError("Ollama sürüm yanıtı doğrulanamadı.", 502, "ollama_metadata_invalid")
            result["ollama_reachable"] = True
            tags = await self._request("GET", "/api/tags", timeout=3)
            if not isinstance(tags, dict) or not isinstance(tags.get("models"), list):
                raise AIError("Ollama model listesi doğrulanamadı.", 502, "ollama_metadata_invalid")
            installed = any(isinstance(m, dict) and (m.get("name") == self.settings.model or m.get("model") == self.settings.model) for m in tags["models"])
            result["model_installed"] = installed
            if not installed:
                return {**result, "state": "unavailable", "label": "Gemma 4 Kurulu Değil", "code": "model_missing",
                        "detail": f"Ollama çalışıyor; {self.settings.model} indirilmemiş. installer.bat ile modeli kurun. API key gerekmez."}
            verified = bool(self.last_verified and time.monotonic() - self.last_verified <= 30)
            return {**result, "inference_verified": verified, "state": "ready", "label": "Gemma 4 Kurulu",
                    "code": "model_installed", "detail": "Model yerel serviste mevcut. Bağlı durumu için gerçek yanıt kontrol edilir. API key gerekmez."}
        except AIError as error:
            return {**result, "state": "unavailable", "label": "AI Kullanılamıyor", "code": error.reason, "detail": str(error)}

    async def status(self):
        metadata = await self.diagnostics()
        if metadata["state"] != "ready":
            self.last_verified = 0
            return metadata
        if self.active_generations:
            return {**metadata, "state": "checking", "label": "Gemma 4 Çalışıyor", "code": "generation_in_progress",
                    "detail": "Belgeniz işleniyor. İşlem sürerken ek model kontrolü başlatılmaz."}
        if self.health_busy:
            return {**metadata, "state": "checking", "label": "Gemma 4 Yanıtı Bekleniyor", "code": "model_warming",
                    "detail": "Model bağlantısı doğrulanıyor. İlk yükleme biraz sürebilir; durum otomatik güncellenir."}
        self.health_busy = True
        try:
            if not self.last_verified or time.monotonic() - self.last_verified > 30:
                await self.structured(Ping, 'Yalnızca {"ok":true} JSON yanıtı ver.', {"health_check": True})
            return {**metadata, "state": "connected", "label": "Gemma 4 Bağlı", "code": "connected", "inference_verified": True,
                    "detail": "Yerel Gemma 4 modelinden geçerli yanıt alındı. API key gerekmez."}
        except AIError as error:
            self.last_verified = 0
            return {**metadata, "state": "unavailable", "label": "AI Kullanılamıyor", "code": error.reason, "inference_verified": False, "detail": str(error)}
        finally:
            self.health_busy = False
