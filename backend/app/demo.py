import json

from .config import ROOT
from .grounding import validate_grounding, validate_missing
from .schemas import Analysis, MissingItem, MissingResult

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
    suggestions = []
    if len(lines) < 2:
        suggestions = example["suggestions"] if example else [
            "Eğitim hedefinizi bir cümleyle yazar mısınız?",
            "Bursun bu hedefe somut katkısını ayrı bir satırda yazar mısınız?",
        ]
    if limit and len(answer) > limit:
        answer = answer[:limit].rstrip()
        suggestions = [f"Yanıtınızı {limit} karakter içinde daha iyi anlatmak için hangi bilgileri öne çıkarmak istersiniz?"]
    return {"answer": answer, "follow_up_questions": suggestions, "mode": "demo",
            "character_count": len(answer), "character_limit": limit, "generic": not bool(lines),
            "method": "demo_example" if not lines else "user_text", "review_required": True}
