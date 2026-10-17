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
} from "./lib";

describe("source-grounded scholarship fixture", () => {
  it("preserves every supporting quote and the actual character limit", () => {
    expect(SAMPLE_ANALYSIS.requirements).toHaveLength(9);
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
    ).toBe(11);
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
describe("personal facts and draft safety", () => {
  it("asks for essential information before the demo drafts", () => {
    expect(demoDraft("", 500).follow_up_questions).toHaveLength(2);
    expect(demoDraft("Tek bir bilgi.", 500).answer).toBe("");
  });
  it("preserves user statements and refuses to truncate excess characters", () => {
    const info =
      "Mühendislik eğitimimi geliştirmek istiyorum.\nBursu kitaplar için kullanacağım.";
    expect(demoDraft(info, 500).answer).toBe(info);
    expect(demoDraft("a".repeat(500) + "\nb", 500).answer).toBe("");
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
