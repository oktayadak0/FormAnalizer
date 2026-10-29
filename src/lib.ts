import fixture from "../shared/demo.json";
import examples from "../shared/examples.json";
import type {
  Analysis,
  Draft,
  InfoStatus,
  MissingItem,
  Project,
  Requirement,
  TaskStatus,
  SampleApplication,
  QuestionExample,
  FollowUpAnswer,
  ProfileCategory,
  ProfileDocument,
  ProfileItem,
  UserProfile,
} from "./types";

export const SAMPLE_SOURCE = fixture.source;
export const SAMPLE_ANALYSIS = fixture.analysis as Analysis;
export const SAMPLES = [fixture, ...examples] as SampleApplication[];
// Fictional profile for the demo; does not describe a real person.
export const SAMPLE_PROFILE_DOCUMENTS: ProfileDocument[] = [
  {
    filename: "ozgecmis-notlari.txt",
    text: [
      "Bu belge yalnızca demo için hazırlanmış kurgusal bir profildir.",
      "Eğitim: Bilgisayar Mühendisliği öğrencisiyim.",
      "Proje: Python ile örnek bir kütüphane takip uygulaması geliştirdim.",
      "Deneyim: Üniversite açık kaynak topluluğunda gönüllü eğitmen olarak temel yazılım atölyeleri düzenledim.",
      "Beceri: Python, TypeScript, React, veri analizi ve doğal dil işleme araçlarıyla çalışıyorum.",
      "Hedef: Yapay zekâ ve doğal dil işleme alanında araştırmalar yaparak erişilebilir eğitim teknolojileri üretmek istiyorum.",
    ].join("\n"),
  },
];
export const profileCategoryLabels: Record<ProfileCategory, string> = {
  education: "Eğitim",
  experience: "Deneyim",
  project: "Proje",
  skill: "Beceri",
  achievement: "Başarı",
  goal: "Hedef",
  other: "Ek bilgi",
};
export function findSample(source: string) {
  return SAMPLES.find((sample) => sample.source.trim() === source.trim());
}
export function randomSample(currentSource: string, random = Math.random) {
  const candidates = SAMPLES.filter(
    (sample) => sample.source.trim() !== currentSource.trim(),
  );
  return candidates[Math.floor(random() * candidates.length)];
}
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
    answerModes: {},
    answerKinds: {},
    answerSuggestions: {},
    followUpAnswers: {},
    profileFiles: [],
    profile: null,
    profileMode: "live",
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
function classifyProfileLine(text: string): {
  category: ProfileCategory;
  defaultLabel: string;
} {
  const low = text.replace(/I/g, "ı").replace(/İ/g, "i").toLowerCase();
  if (
    /üniversite|fakülte|bölüm|lisans|lise|mezun|öğrenci|gano|gno|not ortalaması|sınıf|eğitim/.test(
      low,
    )
  )
    return { category: "education", defaultLabel: "Eğitim Bilgisi" };
  if (/staj|çalışt|deneyim|şirket|kurum|görev|asistan|gönüllü/.test(low))
    return { category: "experience", defaultLabel: "Deneyim" };
  if (
    /proje|geliştird|uygulama|sistem|platform|araç|github|açık kaynak|tasarlad/.test(
      low,
    )
  )
    return { category: "project", defaultLabel: "Proje" };
  if (
    /python|javascript|typescript|java|c\+\+|sql|react|fastapi|dil|ingilizce|beceri|yetkinlik/.test(
      low,
    )
  )
    return { category: "skill", defaultLabel: "Beceri ve Yetkinlik" };
  if (
    /ödül|derece|birinci|ikinci|üçüncü|başarı|burs|sertifika|hackathon|finalist/.test(
      low,
    )
  )
    return { category: "achievement", defaultLabel: "Başarı ve Sertifika" };
  if (/hedef|amaç|plan|motivasyon|istiyorum|kariyer|gelecek/.test(low))
    return { category: "goal", defaultLabel: "Hedef ve Motivasyon" };
  return { category: "other", defaultLabel: "Profil Notu" };
}
export function demoProfile(documents: ProfileDocument[]): UserProfile {
  const items: ProfileItem[] = [];
  for (const doc of documents) {
    const lines = doc.text
      .split(/\n+/)
      .map((line) => line.trim())
      .filter((line) => line.length >= 6);
    for (const line of lines) {
      if (items.length >= 15) break;
      const { category, defaultLabel } = classifyProfileLine(line);
      const colonIndex = line.indexOf(":");
      const label =
        colonIndex > 0
          ? line.slice(0, colonIndex).trim().slice(0, 160) || defaultLabel
          : defaultLabel;
      const detail =
        colonIndex > 0
          ? line.slice(colonIndex + 1).trim().slice(0, 600) || line.slice(0, 600)
          : line.slice(0, 600);
      items.push({
        category,
        label,
        detail,
        source_file: doc.filename,
        evidence: line.slice(0, 2000),
      });
    }
  }
  if (!items.length)
    throw new Error("Profil belgelerinde analiz edilebilecek yeterli metin bulunamadı.");
  const summary = items
    .slice(0, 3)
    .map((item) => item.detail.replace(/\.*$/, "."))
    .join(" ")
    .slice(0, 1200);
  return { summary, items };
}
export function profileFactsForQuestion(
  profile?: UserProfile | null,
  question?: Requirement,
): string[] {
  if (!profile?.items.length) return [];
  const qText = (question?.description ?? "")
    .replace(/I/g, "ı")
    .replace(/İ/g, "i")
    .toLowerCase();
  const preferred: ProfileCategory[] = /hedef|gelecek|plan|motivasyon|neden|katkı/.test(
    qText,
  )
    ? ["goal", "education", "project", "experience", "skill", "achievement", "other"]
    : /topluluk|çevre|aktar|paylaş|gönüllü|etki|sosyal/.test(qText)
      ? ["experience", "project", "goal", "education", "skill", "achievement", "other"]
      : ["project", "experience", "skill", "education", "achievement", "goal", "other"];
  const sorted = [...profile.items].sort(
    (a, b) => preferred.indexOf(a.category) - preferred.indexOf(b.category),
  );
  return [
    ...new Set(
      sorted
        .map((item) => item.detail.trim())
        .filter(Boolean),
    ),
  ].slice(0, 15);
}
export function draftInformation(
  personal: string,
  responses: Record<string, string> = {},
  profile?: UserProfile | null,
  question?: Requirement,
) {
  const followUpAnswers: FollowUpAnswer[] = Object.entries(responses)
    .filter(([, answer]) => answer.trim())
    .map(([questionText, answer]) => ({
      question: questionText,
      answer: answer.trim(),
    }));
  const profileFacts = profileFactsForQuestion(profile, question);
  const directFacts = [
    personal.trim(),
    ...followUpAnswers.map((item) => item.answer),
  ]
    .filter(Boolean)
    .join("\n");
  if (followUpAnswers.length > 20)
    throw new Error(
      "Bir form sorusu için en fazla 20 ek yanıt kullanılabilir.",
    );
  if (directFacts.length > 6000)
    throw new Error(
      "Kişisel bilgilerin ve ek yanıtların toplamı en fazla 6.000 karakter olabilir. Lütfen metni kısalt.",
    );
  const facts = [
    personal.trim(),
    ...profileFacts,
    ...followUpAnswers.map((item) => item.answer),
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 12000);
  return {
    personal_info: personal,
    follow_up_answers: followUpAnswers,
    profile_facts: profileFacts,
    facts,
  };
}


export function demoDraft(
  personal: string,
  limit: number | null,
  example?: QuestionExample,
): Draft {
  const lines = personal
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
  if (lines.length < 2)
    return {
      mode: "demo",
      answer: Array.from(
        lines.join("\n") || example?.answer || fixture.draft_example,
      )
        .slice(0, limit ?? undefined)
        .join(""),
      follow_up_questions: example?.suggestions ?? [
        "Eğitim hedefinizi bir cümleyle yazar mısınız?",
        "Bursun bu hedefe somut katkısını ayrı bir satırda yazar mısınız?",
      ],
      generic: !lines.length,
    };
  const answer = lines.join("\n");
  if (limit && characterCount(answer) > limit)
    return {
      mode: "demo",
      answer: Array.from(answer).slice(0, limit).join("").trimEnd(),
      follow_up_questions: [
        `Yanıtınızı ${limit} karakter içinde daha iyi anlatmak için hangi bilgileri öne çıkarmak istersiniz?`,
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
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly requestId?: string,
    public readonly status?: number,
  ) {
    super(requestId ? `${message} [Tanı: ${requestId}]` : message);
    this.name = "ApiError";
  }
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
    throw new ApiError(
      "Yerel servise ulaşılamadı veya yanıt süresi aşıldı. FastAPI servisini kontrol edin. Örnek bursu demo modunda açabilirsiniz.",
      "backend_unreachable",
    );
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || !data)
    throw new ApiError(
      typeof data?.detail === "string"
        ? data.detail
        : "İstek doğrulanamadı. Girdi sınırlarını ve yerel servis kurulumunu kontrol edin.",
      data?.code ?? "request_failed",
      data?.request_id ?? response.headers.get("x-request-id") ?? undefined,
      response.status,
    );
  return data as T;
}
