import json
import re

from .config import ROOT
from .grounding import profile_units, validate_grounding, validate_missing
from .schemas import Analysis, MissingItem, MissingResult, ProfileItem, ProfileRequest, UserProfile

DEMO = json.loads((ROOT / "shared" / "demo.json").read_text(encoding="utf-8"))
EXAMPLES = [DEMO, *json.loads((ROOT / "shared" / "examples.json").read_text(encoding="utf-8"))]


def find_demo(source: str):
    return next((sample for sample in EXAMPLES if sample["source"].strip() == source.strip()), None)


def demo_analysis(source: str):
    sample = find_demo(source)
    if not sample:
        raise ValueError("Demo yalnızca hazır örnek başvurularla çalışır. Kendi belgeniz için Gemma 4 gerekir.")
    return validate_grounding(Analysis.model_validate(sample["analysis"]), source)


def demo_missing(request):
    facts = {f.requirement_id: f for f in request.facts}
    items = []
    for r in request.analysis.requirements:
        fact = facts.get(r.id)
        status = "needs_confirmation" if r.kind == "eligibility" else "missing"
        evidence = ""
        if fact and fact.text:
            evidence = fact.text
            # Demo does not interpret arbitrary personal text or assess eligibility.
            status = "not_applicable" if fact.not_applicable else "needs_confirmation"
        question = "Bu gereklilik için durumunu veya bilginizi yazar mısınız?"
        items.append(MissingItem(requirement_id=r.id, status=status, user_evidence=evidence, question=question))
    return validate_missing(MissingResult(items=items), request)


def demo_draft(request, limit):
    # Explicit offline demo: fixed sample when no facts were supplied; never claim AI use.
    lines = [line.strip() for line in request.personal_facts().splitlines() if line.strip()]
    sample = find_demo(request.source)
    example = sample["question_examples"][request.requirement_id] if sample else None
    answer = "\n".join(lines) or (example["answer"] if example else DEMO["draft_example"])
    answered = {item.question.strip() for item in request.follow_up_answers if item.answer.strip()}
    suggestions = []
    if len(lines) < 2:
        raw_suggestions = example["suggestions"] if example else [
            "Eğitim hedefinizi bir cümleyle yazar mısınız?",
            "Bursun bu hedefe somut katkısını ayrı bir satırda yazar mısınız?",
        ]
        suggestions = [q for q in raw_suggestions if q.strip() not in answered]
    if limit and len(answer) > limit:
        answer = answer[:limit].rstrip()
        suggestions = [f"Yanıtınızı {limit} karakter içinde daha iyi anlatmak için hangi bilgileri öne çıkarmak istersiniz?"]
    return {"answer": answer, "follow_up_questions": suggestions, "mode": "demo",
            "character_count": len(answer), "character_limit": limit, "generic": not bool(lines),
            "method": "demo_example" if not lines else "user_text", "review_required": True}


def _classify_profile_line(text: str):
    low = text.replace("I", "ı").replace("İ", "i").lower()
    if re.search(r"üniversite|fakülte|bölüm|lisans|lise|mezun|öğrenci|gano|gno|not ortalaması|sınıf|eğitim", low):
        return "education", "Eğitim Bilgisi"
    if re.search(r"staj|çalışt|deneyim|şirket|kurum|görev|asistan|gönüllü", low):
        return "experience", "Deneyim"
    if re.search(r"proje|geliştird|uygulama|sistem|platform|araç|github|açık kaynak|tasarlad", low):
        return "project", "Proje"
    if re.search(r"python|javascript|typescript|java|c\+\+|sql|react|fastapi|dil|ingilizce|beceri|yetkinlik", low):
        return "skill", "Beceri ve Yetkinlik"
    if re.search(r"ödül|derece|birinci|ikinci|üçüncü|başarı|burs|sertifika|hackathon|finalist", low):
        return "achievement", "Başarı ve Sertifika"
    if re.search(r"hedef|amaç|plan|motivasyon|istiyorum|kariyer|gelecek", low):
        return "goal", "Hedef ve Motivasyon"
    return "other", "Profil Notu"


def demo_profile(request: ProfileRequest) -> UserProfile:
    units = profile_units(request.documents)
    if not units:
        raise ValueError("Profil belgelerinde yeterli metin bulunamadı.")
    items: list[ProfileItem] = []
    for unit in units[:15]:
        text = unit["text"].strip()
        category, default_label = _classify_profile_line(text)
        if ":" in text:
            head, tail = text.split(":", 1)
            label = head.strip()[:160] or default_label
            detail = tail.strip()[:600] or text[:600]
        else:
            label = default_label
            detail = text[:600]
        items.append(ProfileItem(
            category=category,
            label=label,
            detail=detail,
            source_file=unit["filename"],
            evidence=text[:2000],
        ))
    summary = " ".join(item.detail.rstrip(".") + "." for item in items[:3])[:1200]
    return UserProfile(summary=summary, items=items)

