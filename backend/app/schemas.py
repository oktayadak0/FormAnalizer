from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


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


class DraftRequest(ContextRequest):
    requirement_id: str = Field(max_length=80)
    personal_info: str = Field(max_length=6000)


class DraftSelection(Schema):
    # Exact user quotes are intentional: free paraphrases cannot be verified locally.
    excerpts: list[str] = Field(max_length=20)
    follow_up_questions: list[str] = Field(max_length=5)


class Ping(Schema):
    ok: Literal[True]
