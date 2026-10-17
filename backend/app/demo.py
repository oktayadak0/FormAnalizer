import json

from .config import ROOT
from .grounding import assemble_draft, validate_grounding, validate_missing
from .schemas import Analysis, DraftSelection, MissingItem, MissingResult

DEMO = json.loads((ROOT / "shared" / "demo.json").read_text(encoding="utf-8"))


def demo_analysis(source: str):
    if source.strip() != DEMO["source"].strip():
        raise ValueError("Demo yalnızca değiştirilmemiş örnek burs yönergesiyle çalışır. Kendi belgeniz için Gemma 4 gerekir.")
    return validate_grounding(Analysis.model_validate(DEMO["analysis"]), source)


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
    # Only reorder user-authored complete lines; never manufacture a personal statement.
    lines = [line.strip() for line in request.personal_info.splitlines() if line.strip()]
    if len(lines) < 2:
        selection = DraftSelection(excerpts=[], follow_up_questions=[
            "Eğitim hedefinizi bir cümleyle yazar mısınız?",
            "Bursun bu hedefe somut katkısını ayrı bir satırda yazar mısınız?",
        ])
    elif limit and len("\n".join(lines)) > limit:
        selection = DraftSelection(excerpts=[], follow_up_questions=[f"Bilgilerinizi toplam {limit} karaktere sığacak şekilde kısaltır mısınız?"])
    else:
        selection = DraftSelection(excerpts=lines, follow_up_questions=[])
    result = assemble_draft(selection, request.personal_info, limit)
    result["mode"] = "demo"
    return result
