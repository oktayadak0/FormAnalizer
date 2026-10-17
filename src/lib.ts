import fixture from "../shared/demo.json";
import type {
  Analysis,
  Draft,
  InfoStatus,
  MissingItem,
  Project,
  Requirement,
  TaskStatus,
} from "./types";

export const SAMPLE_SOURCE = fixture.source;
export const SAMPLE_ANALYSIS = fixture.analysis as Analysis;
export const kindLabels = {
  eligibility: "Uygunluk koşulu",
  document: "Gerekli belge",
  question: "Form sorusu",
  field: "Kişisel bilgi",
  deadline: "Son tarih",
  submission: "Gönderim",
  format: "Biçim kuralı",
};
export const statusLabels: Record<TaskStatus, string> = {
  not_started: "Başlanmadı",
  in_progress: "Devam ediyor",
  completed: "Tamamlandı",
};
export const infoLabels: Record<InfoStatus, string> = {
  provided: "Beyan sağlandı",
  missing: "Bilgi eksik",
  needs_confirmation: "Doğrulanmalı",
  not_applicable: "Uygulanmıyor beyanı",
};
export const characterCount = (text: string) => Array.from(text).length;
export function completion(
  requirements: Requirement[],
  statuses: Record<string, TaskStatus>,
) {
  return requirements.length
    ? Math.round(
        (requirements.filter((r) => statuses[r.id] === "completed").length /
          requirements.length) *
          100,
      )
    : 0;
}
export function newProject(): Project {
  return {
    id: crypto.randomUUID(),
    source: "",
    filename: "",
    analysis: null,
    mode: "live",
    statuses: {},
    facts: {},
    personal: {},
    answers: {},
    missing: null,
  };
}
export function initialMissing(project: Project): MissingItem[] {
  return (project.analysis?.requirements ?? []).map((r) => ({
    requirement_id: r.id,
    status: r.kind === "eligibility" ? "needs_confirmation" : "missing",
    user_evidence: "",
    question: "Bu gereklilik için bilginizi veya durumunuzu paylaşın.",
  }));
}
export function demoMissing(project: Project): MissingItem[] {
  return initialMissing(project).map((item) => {
    const fact = project.facts[item.requirement_id];
    return fact?.text.trim()
      ? {
          ...item,
          status: fact.not_applicable ? "not_applicable" : "needs_confirmation",
          user_evidence: fact.text.trim(),
        }
      : item;
  });
}
export function demoDraft(personal: string, limit: number | null): Draft {
  const lines = personal
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
  if (lines.length < 2)
    return {
      mode: "demo",
      answer: "",
      follow_up_questions: [
        "Eğitim hedefinizi bir cümleyle yazar mısınız?",
        "Bursun bu hedefe somut katkısını ayrı bir satırda yazar mısınız?",
      ],
    };
  const answer = lines.join("\n");
  if (limit && characterCount(answer) > limit)
    return {
      mode: "demo",
      answer: "",
      follow_up_questions: [
        `Bilgilerinizi toplam ${limit} karaktere sığacak şekilde kısaltır mısınız?`,
      ],
    };
  return { mode: "demo", answer, follow_up_questions: [] };
}
export function deadlineLabel(iso: string | null, now = new Date()) {
  if (!iso) return "Kesin tarih doğrulanmalı";
  const date = new Date(iso);
  if (date.getTime() < now.getTime()) return "Son tarih geçti";
  const localDay = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  if (localDay.format(date) === localDay.format(now))
    return "Bugün sona eriyor";
  const days = Math.ceil((date.getTime() - now.getTime()) / 86400000);
  return `${days} gün kaldı`;
}
export async function api<T>(
  path: string,
  body?: unknown,
  timeout = 255000,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/${path}`, {
      method: body ? "POST" : "GET",
      headers:
        body instanceof FormData
          ? undefined
          : { "Content-Type": "application/json" },
      body:
        body instanceof FormData
          ? body
          : body
            ? JSON.stringify(body)
            : undefined,
      signal: AbortSignal.timeout(timeout),
    });
  } catch {
    throw new Error(
      "Yerel servise ulaşılamadı veya yanıt süresi aşıldı. FastAPI servisini kontrol edin. Örnek bursu demo modunda açabilirsiniz.",
    );
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || !data)
    throw new Error(
      typeof data?.detail === "string"
        ? data.detail
        : "İstek doğrulanamadı. Girdi sınırlarını ve yerel servis kurulumunu kontrol edin.",
    );
  return data as T;
}
