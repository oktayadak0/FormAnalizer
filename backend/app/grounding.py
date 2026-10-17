import re

from .schemas import Analysis, DraftSelection, MissingRequest, MissingResult


MONTHS = ["ocak", "şubat", "mart", "nisan", "mayıs", "haziran", "temmuz", "ağustos", "eylül", "ekim", "kasım", "aralık"]


def validate_grounding(analysis: Analysis, source: str) -> Analysis:
    quotes = [analysis.name_evidence, analysis.purpose_evidence]
    quotes += [r.evidence for r in analysis.requirements]
    quotes += [a.evidence for a in analysis.ambiguities]
    if any(q not in source for q in quotes):
        raise ValueError("Kaynak alıntısı özgün belgede birebir bulunamadı.")
    for r in analysis.requirements:
        if r.character_limit is not None:
            if not re.search(rf"(?<!\d){r.character_limit}(?!\d)\s*karakter", r.evidence, re.I):
                raise ValueError("Karakter sınırı kaynak cümlesiyle doğrulanamadı.")
        if r.deadline:
            d = r.deadline
            normalized = r.evidence.lower().replace("i̇", "i")
            patterns = [rf"\b0?{d.day}\s+{MONTHS[d.month-1]}\s+{d.year}\b", rf"\b0?{d.day}[./-]0?{d.month}[./-]{d.year}\b", rf"\b{d.year}-0?{d.month}-0?{d.day}\b"]
            time_pattern = rf"\b0?{d.hour}[.:]{d.minute:02d}\b"
            if not any(re.search(p, normalized) for p in patterns) or not re.search(time_pattern, normalized):
                raise ValueError("Kesin tarih/saat kaynakta doğrulanamadı; belirsiz tarih deadline=null olmalıdır.")
            if not any(t in normalized for t in ["türkiye", "+03:00", "utc+3", "gmt+3"]):
                raise ValueError("Saat dilimi belirsiz; kesin tarih üretilemez.")
            if d.utcoffset().total_seconds() != 10800:
                raise ValueError("Türkiye saat dilimi +03:00 olmalıdır.")
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


def assemble_draft(selection: DraftSelection, personal_info: str, limit: int | None) -> dict:
    if any(not q.strip() or q not in personal_info for q in selection.excerpts):
        raise ValueError("Taslakta kullanıcı tarafından verilmeyen bir ifade bulundu.")
    answer = "\n".join(selection.excerpts)
    if limit and len(answer) > limit:
        raise ValueError("Model yanıtı karakter sınırını aşıyor.")
    if not answer and not selection.follow_up_questions:
        raise ValueError("Taslak veya takip sorusu gerekli.")
    # A model asking for essential facts must not simultaneously present a final draft.
    if selection.follow_up_questions:
        answer = ""
    return {"answer": answer, "follow_up_questions": selection.follow_up_questions,
            "character_count": len(answer), "character_limit": limit,
            "method": "extractive", "review_required": True}
