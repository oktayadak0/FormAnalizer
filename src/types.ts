export type Kind =
  | "eligibility"
  | "document"
  | "question"
  | "field"
  | "deadline"
  | "submission"
  | "format";
export type Requirement = {
  id: string;
  kind: Kind;
  description: string;
  evidence: string;
  required: boolean;
  character_limit: number | null;
  deadline: string | null;
};
export type Analysis = {
  name: string;
  name_evidence: string;
  purpose: string;
  purpose_evidence: string;
  requirements: Requirement[];
  ambiguities: { description: string; evidence: string }[];
};
export type TaskStatus = "not_started" | "in_progress" | "completed";
export type QuestionExample = { answer: string; suggestions: string[] };
export type SampleApplication = {
  id: string;
  category: string;
  filename: string;
  source: string;
  analysis: Analysis;
  question_examples: Record<string, QuestionExample>;
};
export type InfoStatus =
  | "provided"
  | "missing"
  | "needs_confirmation"
  | "not_applicable";
export type Fact = {
  requirement_id: string;
  text: string;
  not_applicable: boolean;
};
export type MissingItem = {
  requirement_id: string;
  status: InfoStatus;
  user_evidence: string;
  question: string;
};
export type Draft = {
  answer: string;
  follow_up_questions: string[];
  mode: "demo" | "live";
  generic?: boolean;
};
export type FollowUpAnswer = { question: string; answer: string };
export type ProfileCategory =
  | "education"
  | "experience"
  | "project"
  | "skill"
  | "achievement"
  | "goal"
  | "other";
export type ProfileDocument = {
  filename: string;
  text: string;
};
export type ProfileItem = {
  category: ProfileCategory;
  label: string;
  detail: string;
  source_file: string;
  evidence: string;
};
export type UserProfile = {
  summary: string;
  items: ProfileItem[];
};
export type Project = {
  id: string;
  source: string;
  filename: string;
  analysis: Analysis | null;
  mode: "demo" | "live";
  statuses: Record<string, TaskStatus>;
  facts: Record<string, Fact>;
  personal: Record<string, string>;
  answers: Record<string, string>;
  answerModes?: Record<string, "live" | "demo" | "manual">;
  answerKinds?: Record<string, "generic" | "personal">;
  answerSuggestions?: Record<string, string[]>;
  followUpAnswers?: Record<string, Record<string, string>>;
  profileFiles?: ProfileDocument[];
  profile?: UserProfile | null;
  profileMode?: "demo" | "live";
  missing: MissingItem[] | null;
};
export type AIStatus = {
  state: "checking" | "connected" | "demo" | "unavailable";
  label: string;
  detail: string;
  model?: string;
  code?: string;
  provider?: string;
  api_key_required?: boolean;
  ollama_reachable?: boolean;
  model_installed?: boolean | null;
  inference_verified?: boolean;
};

