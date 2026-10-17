import { describe, expect, it } from "vitest";
import {
  characterCount,
  completion,
  deadlineLabel,
  demoDraft,
  demoMissing,
  newProject,
  SAMPLE_ANALYSIS,
  SAMPLE_SOURCE,
  SAMPLES,
  findSample,
  randomSample,
  draftInformation,
} from "./lib";

describe("source-grounded scholarship fixture", () => {
  it("preserves every supporting quote and the actual character limit", () => {
    expect(SAMPLE_ANALYSIS.requirements).toHaveLength(11);
    for (const r of SAMPLE_ANALYSIS.requirements)
      expect(SAMPLE_SOURCE).toContain(r.evidence);
    expect(
      SAMPLE_ANALYSIS.requirements.find((r) => r.kind === "question")
        ?.character_limit,
    ).toBe(500);
  });
});
describe("checklist progress", () => {
  it("counts only completed requirements and ignores unknown IDs", () => {
    expect(completion([], {})).toBe(0);
    expect(
      completion(SAMPLE_ANALYSIS.requirements, {
        student: "in_progress",
        gpa: "completed",
        unknown: "completed",
      }),
    ).toBe(9);
    expect(
      completion(
        SAMPLE_ANALYSIS.requirements,
        Object.fromEntries(
          SAMPLE_ANALYSIS.requirements.map((r) => [r.id, "completed"]),
        ),
      ),
    ).toBe(100);
  });
});
describe("random sample catalog", () => {
  it("provides multiple form questions and source evidence in every example", () => {
    expect(SAMPLES.length).toBeGreaterThanOrEqual(13);
    for (const sample of SAMPLES) {
      const questions = sample.analysis.requirements.filter(
        (r) => r.kind === "question",
      );
      expect(questions.length).toBeGreaterThanOrEqual(3);
      expect(findSample(sample.source)?.id).toBe(sample.id);
      for (const requirement of sample.analysis.requirements)
        expect(sample.source).toContain(requirement.evidence);
      for (const question of questions) {
        const example = sample.question_examples[question.id];
        expect(example.answer.length).toBeLessThanOrEqual(
          question.character_limit!,
        );
        expect(demoDraft("", question.character_limit, example).answer).toBe(
          example.answer,
        );
      }
    }
  });
  it("never immediately repeats the current example", () => {
    for (const sample of SAMPLES) {
      expect(randomSample(sample.source, () => 0).id).not.toBe(sample.id);
      expect(randomSample(sample.source, () => 0.9999).id).not.toBe(sample.id);
    }
    expect(findSample(SAMPLES[0].source + " Değiştirildi.")).toBeUndefined();
  });
});
describe("personal facts and draft safety", () => {
  it("shows a fixed demo example or available facts alongside optional suggestions", () => {
    expect(demoDraft("", 500).follow_up_questions).toHaveLength(2);
    expect(demoDraft("", 500).answer).toContain("Bu burs");
    expect(demoDraft("", 500).answer).not.toContain("[");
    expect(demoDraft("Tek bir bilgi.", 500).answer).toBe("Tek bir bilgi.");
    expect(demoDraft("Tek bir bilgi.", 500).follow_up_questions).toHaveLength(
      2,
    );
  });
  it("preserves user statements within the character limit", () => {
    const info =
      "Mühendislik eğitimimi geliştirmek istiyorum.\nBursu kitaplar için kullanacağım.";
    expect(demoDraft(info, 500).answer).toBe(info);
    expect(demoDraft("a".repeat(500) + "\nb", 500).answer).toBe(
      "a".repeat(500),
    );
    expect(characterCount(demoDraft("🎓".repeat(501), 500).answer)).toBe(500);
    expect(characterCount("İğüşçö 🎓")).toBe(8);
  });
  it("never interprets arbitrary demo text as confirmed eligibility", () => {
    const p = {
      ...newProject(),
      analysis: SAMPLE_ANALYSIS,
      facts: {
        student: {
          requirement_id: "student",
          text: "Emin değilim.",
          not_applicable: false,
        },
      },
    };
    const missing = demoMissing(p);
    expect(missing.find((m) => m.requirement_id === "student")?.status).toBe(
      "needs_confirmation",
    );
    expect(missing.find((m) => m.requirement_id === "transcript")?.status).toBe(
      "missing",
    );
  });
});
describe("deadline alerts", () => {
  it("distinguishes upcoming, elapsed, and uncertain deadlines", () => {
    expect(
      deadlineLabel(
        "2026-11-30T23:59:00+03:00",
        new Date("2026-11-29T23:59:00+03:00"),
      ),
    ).toBe("1 gün kaldı");
    expect(
      deadlineLabel(
        "2026-11-30T23:59:00+03:00",
        new Date("2026-12-02T00:00:00+03:00"),
      ),
    ).toBe("Son tarih geçti");
    expect(
      deadlineLabel(
        "2026-11-30T23:59:00+03:00",
        new Date("2026-12-01T00:01:00+03:00"),
      ),
    ).toBe("Son tarih geçti");
    expect(
      deadlineLabel(
        "2026-11-30T23:59:00+03:00",
        new Date("2026-11-30T09:00:00+03:00"),
      ),
    ).toBe("Bugün sona eriyor");
    expect(deadlineLabel(null)).toContain("doğrulanmalı");
  });
});

describe("follow-up answer context", () => {
  it("keeps original information and adds answers without treating questions as facts", () => {
    const context = draftInformation("Bursu kitaplar için kullanacağım.", {
      "Üç ödül kazandınız mı?": "Hayır.",
      "Hedefiniz nedir?": " Python öğrenmek istiyorum. ",
      "Boş yanıt": "   ",
    });
    expect(context.personal_info).toBe("Bursu kitaplar için kullanacağım.");
    expect(context.follow_up_answers).toHaveLength(2);
    expect(context.facts).toBe(
      "Bursu kitaplar için kullanacağım.\nHayır.\nPython öğrenmek istiyorum.",
    );
    expect(context.facts).not.toContain("ödül");
    expect(demoDraft(context.facts, 500).answer).toBe(context.facts);
  });
  it("rejects excessive combined information without truncating user answers", () => {
    expect(() =>
      draftInformation("a".repeat(5500), { "Hedefiniz?": "b".repeat(1000) }),
    ).toThrow("6.000");
  });
});
