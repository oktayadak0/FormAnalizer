from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, create_model, field_validator, model_validator


class Schema(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Requirement(Schema):
    id: str = Field(min_length=1, max_length=80, pattern=r"^[a-zA-Z0-9_-]+$")
    kind: Literal["eligibility", "document", "question", "field", "deadline", "submission", "format"]
    description: str = Field(min_length=1, max_length=1000)
    evidence: str = Field(min_length=8, max_length=3000)
    required: bool
    character_limit: int | None = Field(default=None, ge=1, le=100000)
    deadline: datetime | None = None

    @field_validator("deadline")
    @classmethod
    def timezone_required(cls, value):
        if value and value.tzinfo is None:
            raise ValueError("Tarih için saat dilimi gereklidir.")
        return value


class Ambiguity(Schema):
    description: str = Field(min_length=1, max_length=1500)
    evidence: str = Field(min_length=8, max_length=3000)


class Analysis(Schema):
    name: str = Field(min_length=1, max_length=200)
    name_evidence: str = Field(min_length=1, max_length=1000)
    purpose: str = Field(min_length=1, max_length=1500)
    purpose_evidence: str = Field(min_length=1, max_length=3000)
    requirements: list[Requirement] = Field(min_length=1, max_length=120)
    ambiguities: list[Ambiguity] = Field(max_length=30)

    @model_validator(mode="after")
    def unique_ids(self):
        ids = [r.id for r in self.requirements]
        if len(set(ids)) != len(ids):
            raise ValueError("Gereklilik kimlikleri benzersiz olmalıdır.")
        return self


def referenced_schema(model, name):
    fields = {key: (field.annotation, field) for key, field in model.model_fields.items() if key != "evidence"}
    fields["evidence_id"] = (int, Field(ge=0))
    return create_model(name, __base__=Schema, **fields)


ReferencedRequirement = referenced_schema(Requirement, "ReferencedRequirement")
ReferencedAmbiguity = referenced_schema(Ambiguity, "ReferencedAmbiguity")


class ReferencedAnalysis(Schema):
    name: str = Field(min_length=1, max_length=200)
    name_evidence_id: int = Field(ge=0)
    purpose: str = Field(min_length=1, max_length=1500)
    purpose_evidence_id: int = Field(ge=0)
    requirements: list[ReferencedRequirement] = Field(min_length=1, max_length=120)
    ambiguities: list[ReferencedAmbiguity] = Field(max_length=30)


class AnalyzeRequest(Schema):
    source: str = Field(min_length=30, max_length=40000)
    demo: bool = False


class ContextRequest(AnalyzeRequest):
    analysis: Analysis


class Fact(Schema):
    requirement_id: str = Field(min_length=1, max_length=80)
    text: str = Field(max_length=2000)
    not_applicable: bool = False


class MissingRequest(ContextRequest):
    facts: list[Fact] = Field(max_length=120)

    @model_validator(mode="after")
    def unique_facts(self):
        ids = [f.requirement_id for f in self.facts]
        if len(ids) != len(set(ids)) or sum(len(f.text) for f in self.facts) > 16000:
            raise ValueError("Bilgiler benzersiz ve toplam en fazla 16.000 karakter olmalıdır.")
        return self


class MissingItem(Schema):
    requirement_id: str
    status: Literal["provided", "missing", "needs_confirmation", "not_applicable"]
    user_evidence: str = Field(max_length=2000)
    question: str = Field(max_length=500)


class MissingResult(Schema):
    items: list[MissingItem] = Field(max_length=120)


class FollowUpAnswer(Schema):
    question: str = Field(min_length=1, max_length=500)
    answer: str = Field(min_length=1, max_length=1500)


ProfileCategory = Literal["education", "experience", "project", "skill", "achievement", "goal", "other"]


class ProfileDocumentInput(Schema):
    filename: str = Field(min_length=1, max_length=200)
    text: str = Field(min_length=10, max_length=20000)


class ProfileRequest(Schema):
    documents: list[ProfileDocumentInput] = Field(min_length=1, max_length=10)
    demo: bool = False

    @model_validator(mode="after")
    def validate_total_length(self):
        if sum(len(doc.text) for doc in self.documents) > 40000:
            raise ValueError("Profil belgeleri toplam en fazla 40.000 karakter olabilir.")
        return self


class ProfileItem(Schema):
    category: ProfileCategory
    label: str = Field(min_length=1, max_length=160)
    detail: str = Field(min_length=1, max_length=600)
    source_file: str = Field(min_length=1, max_length=200)
    evidence: str = Field(min_length=5, max_length=2000)


class UserProfile(Schema):
    summary: str = Field(min_length=1, max_length=1200)
    items: list[ProfileItem] = Field(min_length=1, max_length=30)


class ReferencedProfileItem(Schema):
    category: ProfileCategory
    label: str = Field(min_length=1, max_length=160)
    detail: str = Field(min_length=1, max_length=600)
    evidence_id: int = Field(ge=0)


class ReferencedUserProfile(Schema):
    summary: str = Field(min_length=1, max_length=1200)
    items: list[ReferencedProfileItem] = Field(min_length=1, max_length=30)


class DraftRequest(ContextRequest):
    requirement_id: str = Field(max_length=80)
    personal_info: str = Field(max_length=6000)
    follow_up_answers: list[FollowUpAnswer] = Field(default_factory=list, max_length=20)
    profile_facts: list[Annotated[str, Field(min_length=1, max_length=1500)]] = Field(default_factory=list, max_length=30)

    def personal_facts(self):
        return "\n".join(
            part
            for part in [
                self.personal_info,
                *self.profile_facts,
                *[item.answer for item in self.follow_up_answers],
            ]
            if part
        )

    @model_validator(mode="after")
    def combined_information_limit(self):
        direct_facts = "\n".join(part for part in [self.personal_info, *[item.answer for item in self.follow_up_answers]] if part)
        if len(direct_facts) > 6000:
            raise ValueError("Kişisel bilgiler ve ek yanıtlar toplam en fazla 6.000 karakter olmalıdır.")
        if len(self.personal_facts()) > 12000:
            raise ValueError("Kişisel bilgiler, profil ve ek yanıtlar toplam en fazla 12.000 karakter olmalıdır.")
        return self


class GeneratedDraft(Schema):
    answer: str = Field(min_length=1, max_length=6000)
    supporting_facts: list[str] = Field(max_length=20)
    follow_up_questions: list[Annotated[str, Field(min_length=1, max_length=500)]] = Field(max_length=5)


def draft_schema(personal_info: str, limit: int | None):
    # Give Ollama the actual answer bound; without personal input no personal evidence is allowed.
    return create_model("GeneratedDraft", __base__=GeneratedDraft,
        answer=(str, Field(min_length=1, max_length=min(limit or 6000, 6000))),
        supporting_facts=(list[str], Field(max_length=20 if personal_info.strip() else 0)))


class Ping(Schema):
    ok: Literal[True]

