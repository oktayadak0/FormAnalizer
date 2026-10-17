import re
from datetime import datetime, timedelta, timezone

from .schemas import Analysis, GeneratedDraft, MissingRequest, MissingResult, ReferencedAnalysis


MONTHS = ["ocak", "şubat", "mart", "nisan", "mayıs", "haziran", "temmuz", "ağustos", "eylül", "ekim", "kasım", "aralık"]


class SourceValidationError(ValueError):
    def __init__(self, message, code):
        super().__init__(message)
        self.code = code


def source_units(source: str) -> list[str]:
    # Keep original characters, whitespace and PDF line breaks inside each passage.
    # Bound passages to fit name_evidence as well as requirement evidence.
    boundaries = [m.end() for m in re.finditer(r"[.!?](?=\s|$)|\n[ \t]*\n", source)] + [len(source)]
    units = []
    start = 0
    for end in boundaries:
        if len(source[start:end].strip()) < 8:
            continue
        while end - start > 900:
            cut = source.rfind(" ", start + 8, start + 900)
            cut = cut if cut > start else start + 900
            units.append(source[start:cut].strip())
            start = cut
        passage = source[start:end].strip()
        if len(passage) >= 8:
            units.append(passage)
            start = end
    if source[start:].strip():
        tail = source[start:].strip()
        if len(tail) >= 8:
            units.append(tail)
        elif units:
            # Keep short final instructions together with preceding source context.
            last_start = source.rfind(units[-1], 0, start)
            combined = source[last_start:].strip() if last_start >= 0 else ""
            if 8 <= len(combined) <= 900:
                units[-1] = combined
            else:
                contextual_tail = source[-900:].strip()
                if len(contextual_tail) >= 8:
                    units.append(contextual_tail)
    return units


def resolve_analysis(result: ReferencedAnalysis, units: list[str], source: str) -> Analysis:
    def quote(index):
        if index >= len(units):
            raise SourceValidationError("Modelin seçtiği kaynak bölümü belgede bulunamadı.", "source_reference_invalid")
        return units[index]

    data = result.model_dump(mode="json")
    data["name_evidence"] = quote(data.pop("name_evidence_id"))
    data["purpose_evidence"] = quote(data.pop("purpose_evidence_id"))
    for item in data["requirements"] + data["ambiguities"]:
        item["evidence"] = quote(item.pop("evidence_id"))
    for item in data["requirements"]:
        evidence = item["evidence"]
        # The model selects requirements; numeric metadata comes from that exact passage.
        limits = set(map(int, re.findall(r"(?<!\d)(\d{1,6})(?!\d)\s*karakter\b", evidence, re.I)))
        if len(limits) == 1 and 1 <= next(iter(limits)) <= 100000:
            if item["character_limit"] is None:
                item["character_limit"] = next(iter(limits))
            if item["kind"] == "field" and re.search(r"motivasyon|hedef|açıkla|anlat|yanıt|cevap", evidence, re.I):
                item["kind"] = "question"
        if item["kind"] == "deadline" and item["deadline"] is None:
            item["deadline"] = explicit_deadline(evidence)
    # A clearly stated closing date must not disappear when the model omits that row.
    # Only fully specified dates with an explicit local timezone can be supplemented.
    ids = {item["id"] for item in data["requirements"]}
    for index, passage in enumerate(units):
        if not re.search(r"son\s+başvuru\s+tarih", passage, re.I):
            continue
        deadline = explicit_deadline(passage)
        if not deadline or any(item["kind"] == "deadline" and item["evidence"] == passage for item in data["requirements"]):
            continue
        if len(data["requirements"]) >= 120:
            break
        identifier = f"source_deadline_{index}"
        while identifier in ids:
            identifier += "_"
        ids.add(identifier)
        data["requirements"].append({"id": identifier, "kind": "deadline", "description": passage,
            "evidence": passage, "required": True, "character_limit": None, "deadline": deadline})
    return validate_grounding(Analysis.model_validate(data), source)


def explicit_deadline(evidence: str):
    text = evidence.replace("I", "ı").replace("İ", "i").lower()
    if not re.search(r"türkiye\s+saati|\+03:00|utc\s*\+\s*3|gmt\s*\+\s*3", text):
        return None
    clocks = re.findall(r"(?<![\d+])\b(?:saat\s*)?(\d{1,2})[:.](\d{2})(?!\d|[./-]\d)", text)
    named = re.findall(r"\b(\d{1,2})\s+(" + "|".join(MONTHS) + r")\s+(\d{4})\b", text)
    numeric = re.findall(r"\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b", text)
    iso = re.findall(r"\b(\d{4})-(\d{1,2})-(\d{1,2})\b", text)
    if len(clocks) != 1 or len(named) + len(numeric) + len(iso) != 1:
        return None
    if named:
        day, month, year = int(named[0][0]), MONTHS.index(named[0][1]) + 1, int(named[0][2])
    elif numeric:
        day, month, year = map(int, numeric[0])
    else:
        year, month, day = map(int, iso[0])
    try:
        return datetime(year, month, day, int(clocks[0][0]), int(clocks[0][1]), tzinfo=timezone(timedelta(hours=3))).isoformat()
    except ValueError:
        return None


def validate_grounding(analysis: Analysis, source: str) -> Analysis:
    quotes = [analysis.name_evidence, analysis.purpose_evidence]
    quotes += [r.evidence for r in analysis.requirements]
    quotes += [a.evidence for a in analysis.ambiguities]
    if any(q not in source for q in quotes):
        raise SourceValidationError("Kaynak alıntısı özgün belgede birebir bulunamadı.", "source_quote_missing")
    for r in analysis.requirements:
        if r.character_limit is not None:
            if not re.search(rf"(?<!\d){r.character_limit}(?!\d)\s*karakter", r.evidence, re.I):
                raise SourceValidationError("Karakter sınırı kaynak cümlesiyle doğrulanamadı.", "character_limit_unsupported")
        if r.deadline:
            d = r.deadline
            normalized = r.evidence.replace("I", "ı").replace("İ", "i").lower()
            patterns = [rf"\b0?{d.day}\s+{MONTHS[d.month-1]}\s+{d.year}\b", rf"\b0?{d.day}[./-]0?{d.month}[./-]{d.year}\b", rf"\b{d.year}-0?{d.month}-0?{d.day}\b"]
            time_pattern = rf"\b0?{d.hour}[.:]{d.minute:02d}\b"
            if not any(re.search(p, normalized) for p in patterns) or not re.search(time_pattern, normalized):
                raise SourceValidationError("Kesin tarih/saat kaynakta doğrulanamadı; belirsiz tarih deadline=null olmalıdır.", "deadline_unsupported")
            if not any(t in normalized for t in ["türkiye", "+03:00", "utc+3", "gmt+3"]):
                raise SourceValidationError("Saat dilimi belirsiz; kesin tarih üretilemez.", "timezone_unsupported")
            if d.utcoffset().total_seconds() != 10800:
                raise SourceValidationError("Türkiye saat dilimi +03:00 olmalıdır.", "timezone_unsupported")
    return analysis


def validate_missing(result: MissingResult, request: MissingRequest) -> MissingResult:
    requirements = {r.id: r for r in request.analysis.requirements}
    ids = [i.requirement_id for i in result.items]
    if len(ids) != len(set(ids)) or set(ids) != set(requirements):
        raise ValueError("Eksik bilgi yanıtı tüm gereklilikleri birer kez içermelidir.")
    facts = {f.requirement_id: f for f in request.facts}
    if not set(facts).issubset(requirements):
        raise ValueError("Bilinmeyen gereklilik bilgisi.")
    for item in result.items:
        fact = facts.get(item.requirement_id)
        if item.user_evidence and (not fact or item.user_evidence not in fact.text):
            raise ValueError("Kişisel bilgi alıntısı kullanıcı beyanında bulunamadı.")
        if item.status == "provided" and (not fact or not fact.text or not item.user_evidence):
            raise ValueError("Kullanıcının vermediği bilgi sağlanmış sayılamaz.")
        if item.status == "not_applicable" and (not fact or not fact.not_applicable or not fact.text):
            raise ValueError("Uygulanamaz durumu açık kullanıcı beyanı gerektirir.")
    return result


class DraftValidationError(ValueError):
    def __init__(self, message, code):
        super().__init__(message)
        self.code = code


def assemble_draft(result: GeneratedDraft, personal_info: str, limit: int | None) -> dict:
    if any(not fact.strip() or fact not in personal_info for fact in result.supporting_facts):
        raise DraftValidationError("Kişisel bilgi dayanağı kullanıcı beyanında bulunamadı.", "draft_unverified_fact")
    answer = result.answer.strip()
    if not answer or re.search(r"\[[^\]\n]*\]", answer):
        raise DraftValidationError("Model doldurulacak alan yerine gerçek bir yanıt üretmelidir.", "draft_placeholder")
    if answer.rstrip(".! ").lower() in {"yanıtınızı kendi bilgilerinizle buraya yazın", "yanıtınızı buraya yazın"}:
        raise DraftValidationError("Model boş şablon döndüremez.", "draft_placeholder")
    if limit and len(answer) > limit:
        raise DraftValidationError("Model yanıtı karakter sınırını aşıyor.", "draft_too_long")
    return {"answer": answer, "follow_up_questions": result.follow_up_questions,
            "character_count": len(answer), "character_limit": limit,
            "method": "generated", "generic": not bool(personal_info.strip()), "review_required": True}
