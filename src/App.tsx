import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  Copy,
  FileCheck2,
  FileSearch,
  FileText,
  FolderOpen,
  GraduationCap,
  LayoutDashboard,
  Leaf,
  ListChecks,
  LoaderCircle,
  LockKeyhole,
  Menu,
  MessageSquareText,
  Plus,
  ScanText,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  TriangleAlert,
  UploadCloud,
  X,
} from "lucide-react";
import {
  api,
  ApiError,
  characterCount,
  completion,
  deadlineLabel,
  demoDraft,
  demoMissing,
  draftInformation,
  infoLabels,
  initialMissing,
  kindLabels,
  newProject,
  SAMPLES,
  findSample,
  randomSample,
  statusLabels,
} from "./lib";
import type {
  AIStatus,
  Analysis,
  Draft,
  Fact,
  MissingItem,
  Project,
  Requirement,
  TaskStatus,
} from "./types";

type Tab = "overview" | "source" | "missing" | "answers";
type Modal = "privacy" | "help" | "settings" | "clear" | null;
const icons = {
  eligibility: ShieldCheck,
  document: FileText,
  question: MessageSquareText,
  field: FileCheck2,
  deadline: CalendarDays,
  submission: ArrowUpRight,
  format: ListChecks,
};

function Evidence({ text }: { text: string }) {
  return (
    <details className="evidence">
      <summary>
        <Search size={12} /> Kaynak cümlesini gör <ChevronDown size={12} />
      </summary>
      <blockquote>{text}</blockquote>
    </details>
  );
}

export default function App() {
  const [projects, setProjects] = useState<Project[]>(() => [newProject()]);
  const [activeId, setActiveId] = useState("");
  const project = projects.find((p) => p.id === activeId) ?? projects[0];
  const [tab, setTab] = useState<Tab>("overview");
  const [ai, setAI] = useState<AIStatus>({
    state: "checking",
    label: "Bağlantı kontrol ediliyor",
    detail: "",
  });
  const [busy, setBusy] = useState("");
  const [waitSeconds, setWaitSeconds] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [modal, setModal] = useState<Modal>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [focusedQuestionId, setFocusedQuestionId] = useState("");
  const [draftQuestionId, setDraftQuestionId] = useState("");
  const [liveDraft, setLiveDraft] = useState(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const modalCloseRef = useRef<HTMLButtonElement>(null);
  const actionVersion = useRef(0);
  const aiRequestInFlight = useRef(false);
  const analysis = project.analysis;
  const sample = findSample(project.source);
  const requirements = analysis?.requirements ?? [];
  const questions = requirements.filter((r) => r.kind === "question");
  const progress = completion(requirements, project.statuses);
  const missing = project.missing ?? initialMissing(project);
  const completed = requirements.filter(
    (r) => project.statuses[r.id] === "completed",
  ).length;
  const deadlines = requirements.filter((r) => r.kind === "deadline");
  const demo = project.mode === "demo";
  const draftUsesDemo = demo && !liveDraft;

  function patch(update: Partial<Project>, id = project.id) {
    setProjects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...update } : p)),
    );
  }
  async function checkAI() {
    if (aiRequestInFlight.current) return;
    aiRequestInFlight.current = true;
    setAI((prev) => ({
      ...prev,
      state: "checking",
      label: "Bağlantı kontrol ediliyor",
      detail: "",
    }));
    try {
      setAI(await api<AIStatus>("status"));
    } catch {
      setAI((prev) => ({
        ...prev,
        state: "unavailable",
        label: "AI Kullanılamıyor",
        detail:
          "Yerel FastAPI veya Ollama servisi çalışmıyor. Demo kullanıma hazır.",
        ollama_reachable: undefined,
        model_installed: undefined,
        inference_verified: false,
      }));
    } finally {
      aiRequestInFlight.current = false;
    }
  }
  useEffect(() => {
    void checkAI();
    const refresh = () => {
      void checkAI();
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);
  useEffect(() => {
    if (ai.state !== "checking") return;
    const timer = setInterval(() => {
      void checkAI();
    }, 3000);
    return () => clearInterval(timer);
  }, [ai.state]);
  useEffect(() => {
    setWaitSeconds(0);
    if (!busy) return;
    const timer = setInterval(() => setWaitSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [busy]);
  useEffect(() => {
    if (tab !== "answers" || !focusedQuestionId) return;
    const card = document.getElementById(`question-${focusedQuestionId}`);
    card?.focus({ preventScroll: true });
    card?.scrollIntoView({ block: "start" });
  }, [tab, focusedQuestionId]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement as HTMLElement;
    modalCloseRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setModal(null);
      if (event.key === "Tab") {
        const nodes = Array.from(
          document.querySelectorAll<HTMLElement>(
            '[role="dialog"] button, [role="dialog"] a',
          ),
        );
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [modal]);

  function changeProject(id: string) {
    if (busy) return;
    actionVersion.current++;
    setActiveId(id);
    setTab("overview");
    setError("");
    setFocusedQuestionId("");
    setLiveDraft(true);
    setMobileNav(false);
  }
  function addProject() {
    if (busy) return;
    if (projects.length >= 10) {
      setError(
        "Bu oturumda en fazla 10 başvuru açabilirsiniz. Verileri temizleyerek yeniden başlayın.",
      );
      return;
    }
    const next = newProject();
    setProjects((prev) => [...prev, next]);
    changeProject(next.id);
  }
  function loadSample() {
    if (busy) return;
    actionVersion.current++;
    const nextSample = randomSample(project.source);
    patch({
      ...newProject(),
      id: project.id,
      source: nextSample.source,
      filename: nextSample.filename,
      mode: ai.state === "connected" ? "live" : "demo",
    });
    setTab("overview");
    setError("");
    setFocusedQuestionId("");
    setNotice(
      `${nextSample.analysis.name} örneği eklendi. 3 form sorusu hazır; analizi başlatabilirsiniz.`,
    );
    setLiveDraft(true);
  }
  async function analyze() {
    const version = ++actionVersion.current;
    const id = project.id;
    setError("");
    setBusy("analyze");
    try {
      if (
        characterCount(project.source.trim()) < 30 ||
        characterCount(project.source) > 40000
      )
        throw new Error("Yönerge 30–40.000 karakter arasında olmalıdır.");
      if (demo) {
        if (!sample)
          throw new Error(
            "Demo yalnızca hazır örnek başvuruları analiz edebilir. Kendi belgeniz için yerel Gemma 4 bağlantısı gerekir.",
          );
        patch(
          {
            analysis: structuredClone(sample.analysis),
            statuses: {},
            facts: {},
            personal: {},
            answers: {},
            answerModes: {},
            answerKinds: {},
            answerSuggestions: {},
            followUpAnswers: {},
            missing: null,
          },
          id,
        );
      } else {
        const result = await api<{ analysis: Analysis; mode: "live" }>(
          "analyze",
          { source: project.source, demo: false },
        );
        if (version !== actionVersion.current) return;
        patch(
          {
            analysis: result.analysis,
            mode: result.mode,
            statuses: {},
            facts: {},
            personal: {},
            answers: {},
            answerModes: {},
            answerKinds: {},
            answerSuggestions: {},
            followUpAnswers: {},
            missing: null,
          },
          id,
        );
        setAI((prev) => ({
          ...prev,
          state: "connected",
          label: "Gemma 4 Bağlı",
          detail: "Yerel modelden doğrulanmış analiz alındı.",
        }));
      }
      setTab("overview");
      setNotice(
        demo
          ? "Önceden hazırlanmış örnek analiz açıldı."
          : "Analiz ve kaynak alıntıları doğrulandı.",
      );
    } catch (e) {
      setError((e as Error).message);
      if (
        !demo &&
        e instanceof ApiError &&
        [
          "ollama_unreachable",
          "ollama_timeout",
          "model_missing",
          "backend_unreachable",
        ].includes(e.code)
      )
        setAI((prev) => ({
          ...prev,
          state: "unavailable",
          label: "AI Kullanılamıyor",
          detail: "Son analiz tamamlanamadı. Bağlantıyı yeniden kontrol edin.",
        }));
    } finally {
      setBusy("");
    }
  }
  async function upload(file?: File) {
    if (!file || busy) return;
    setError("");
    setBusy("upload");
    try {
      if (
        !/\.(txt|pdf|docx)$/i.test(file.name) ||
        file.size > 5 * 1024 * 1024 ||
        !file.size
      )
        throw new Error(
          "Boş olmayan TXT, PDF veya DOCX dosyası seçin. En fazla 5 MB.",
        );
      let text: string;
      if (/\.txt$/i.test(file.name)) {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        text = new TextDecoder(
          bytes[0] === 255 && bytes[1] === 254
            ? "utf-16le"
            : bytes[0] === 254 && bytes[1] === 255
              ? "utf-16be"
              : "utf-8",
          { fatal: true },
        )
          .decode(bytes)
          .trim();
        if (text.includes("\0"))
          throw new Error("Geçerli bir metin dosyası seçin.");
      } else {
        const form = new FormData();
        form.append("file", file);
        text = (await api<{ text: string }>("documents", form)).text;
      }
      if (characterCount(text) < 30 || characterCount(text) > 40000)
        throw new Error("Belge 30–40.000 karakter arasında olmalıdır.");
      patch({
        source: text,
        filename: file.name,
        mode: "live",
        analysis: null,
        statuses: {},
        facts: {},
        personal: {},
        answers: {},
        answerModes: {},
        answerKinds: {},
        answerSuggestions: {},
        followUpAnswers: {},
        missing: null,
      });
      setNotice("Belge metni yerel olarak okundu. Analizi başlatabilirsiniz.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  function updateFact(id: string, value: Partial<Fact>) {
    const current = project.facts[id] ?? {
      requirement_id: id,
      text: "",
      not_applicable: false,
    };
    patch({
      facts: { ...project.facts, [id]: { ...current, ...value } },
      missing: null,
    });
  }
  async function detectMissing() {
    setError("");
    setBusy("missing");
    try {
      if (demo) patch({ missing: demoMissing(project) });
      else {
        const result = await api<{ items: MissingItem[] }>("missing", {
          source: project.source,
          analysis,
          facts: Object.values(project.facts),
          demo: false,
        });
        patch({ missing: result.items });
      }
      setNotice(
        "Bilgi karşılaştırması güncellendi. Beyanlar belge doğrulaması sayılmaz.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function makeDraft(question: Requirement) {
    if (busy) return;
    const targetProjectId = project.id;
    setError("");
    setDraftQuestionId(question.id);
    setBusy("draft");
    try {
      const information = draftInformation(
        project.personal[question.id] ?? "",
        project.followUpAnswers?.[question.id],
      );
      const result = draftUsesDemo
        ? demoDraft(
            information.facts,
            question.character_limit,
            sample?.question_examples[question.id],
          )
        : await api<Draft>("draft", {
            source: project.source,
            analysis,
            demo: false,
            requirement_id: question.id,
            personal_info: information.personal_info,
            follow_up_answers: information.follow_up_answers,
          });
      setProjects((current) =>
        current.map((currentProject) =>
          currentProject.id !== targetProjectId
            ? currentProject
            : {
                ...currentProject,
                answers: {
                  ...currentProject.answers,
                  [question.id]: result.answer,
                },
                answerModes: {
                  ...currentProject.answerModes,
                  [question.id]: result.mode,
                },
                answerKinds: {
                  ...currentProject.answerKinds,
                  [question.id]: result.generic ? "generic" : "personal",
                },
                answerSuggestions: {
                  ...currentProject.answerSuggestions,
                  [question.id]: result.follow_up_questions,
                },
              },
        ),
      );
      if (result.answer)
        setNotice(
          result.mode === "demo"
            ? "Demo yanıtı hazır. İstersen düzenleyebilirsin."
            : "Gemma 4 önerisi hazır. Göndermeden önce kontrol edin.",
        );
      else
        setNotice(
          "Paylaştığınız bilgilerle taslak hazırlanamadı. Bilgilerinizi kontrol edin.",
        );
    } catch (e) {
      setError((e as Error).message);
      if (
        e instanceof ApiError &&
        [
          "ollama_unreachable",
          "ollama_timeout",
          "model_missing",
          "backend_unreachable",
        ].includes(e.code)
      ) {
        setAI((prev) => ({
          ...prev,
          state: "unavailable",
          label:
            e.code === "model_missing"
              ? "Gemma 4 Kurulu Değil"
              : "AI Kullanılamıyor",
          detail: e.message,
          code: e.code,
        }));
      }
    } finally {
      setBusy("");
      setDraftQuestionId("");
    }
  }
  function updateFollowUpAnswer(
    questionId: string,
    followUp: string,
    value: string,
  ) {
    setProjects((current) =>
      current.map((item) =>
        item.id !== project.id
          ? item
          : {
              ...item,
              followUpAnswers: {
                ...item.followUpAnswers,
                [questionId]: {
                  ...item.followUpAnswers?.[questionId],
                  [followUp]: value,
                },
              },
            },
      ),
    );
  }
  async function copyAnswer(questionId: string) {
    try {
      await navigator.clipboard.writeText(project.answers[questionId] ?? "");
      setNotice("Yanıt panoya kopyalandı.");
    } catch {
      setError(
        "Panoya erişilemedi. Yanıt alanındaki metni seçip kopyalayabilirsiniz.",
      );
    }
  }
  function cycleStatus(id: string) {
    const order: TaskStatus[] = ["not_started", "in_progress", "completed"];
    patch({
      statuses: {
        ...project.statuses,
        [id]: order[
          (order.indexOf(project.statuses[id] ?? "not_started") + 1) % 3
        ],
      },
    });
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        İçeriğe geç
      </a>
      <aside
        className={`sidebar ${mobileNav ? "mobile-open" : ""}`}
        aria-label="Ana menü"
      >
        <a
          href="#"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            setTab("overview");
          }}
        >
          <span className="brand-symbol">
            <FileSearch size={25} />
          </span>
          <span>
            Form<span className="brand-light">Dedektifi</span>
            <small>BAŞVURUNUN YOL ARKADAŞI</small>
          </span>
        </a>
        <button className="new-button" onClick={addProject} disabled={!!busy}>
          <Plus size={18} /> Yeni başvuru <span>+</span>
        </button>
        <div className="nav-label">ÇALIŞMA ALANI</div>
        <button
          className="nav-item active"
          onClick={() => {
            setTab("overview");
            setMobileNav(false);
          }}
        >
          <LayoutDashboard size={18} /> Başvurularım{" "}
          <span className="nav-count">
            {projects.length.toString().padStart(2, "0")}
          </span>
        </button>
        <button className="nav-item" onClick={() => setModal("help")}>
          <BookOpen size={18} /> Nasıl çalışır? <ArrowUpRight size={14} />
        </button>
        <div className="nav-label projects-label">
          BU OTURUMDA <span>{projects.length}</span>
        </div>
        <div className="project-list">
          {projects.map((p) => (
            <button
              key={p.id}
              disabled={!!busy}
              className={`project-item ${p.id === project.id ? "selected" : ""}`}
              onClick={() => changeProject(p.id)}
            >
              <span className={`project-dot ${p.analysis ? "green" : ""}`} />
              <span>
                {p.analysis?.name ?? (p.filename || "Yeni başvuru")}
                <small>
                  {p.mode === "demo"
                    ? "Örnek veri"
                    : p.analysis
                      ? "Analiz edildi"
                      : "Yönerge bekleniyor"}
                </small>
              </span>
              <ChevronRight size={13} />
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          <div className="local-card">
            <span className="local-icon">
              <LockKeyhole size={18} />
            </span>
            <strong>Belgelerin sende kalır.</strong>
            <p>Yerel yapay zekâ. Daha fazla gizlilik, daha az soru işareti.</p>
            <button onClick={() => setModal("privacy")}>
              Gizlilik yaklaşımımız <ArrowUpRight size={13} />
            </button>
          </div>
          <button className="nav-item" onClick={() => setModal("settings")}>
            <Settings2 size={17} /> Model ve bağlantı
          </button>
          <div className="event-brand">
            <span className="event-mark">h.</span>
            <span>
              Hacktoberfest <strong>Elazığ 2026</strong>
              <small>Açık kaynakla, birlikte.</small>
            </span>
            <Leaf size={17} />
          </div>
        </div>
      </aside>

      <div className="page-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="mobile-toggle icon-button"
              aria-label="Menüyü aç/kapat"
              aria-expanded={mobileNav}
              onClick={() => setMobileNav(!mobileNav)}
            >
              <Menu size={20} />
            </button>
            <FolderOpen size={16} />
            <span>Çalışma alanı</span>
            <ChevronRight size={13} />
            <strong>Başvurularım</strong>
          </div>
          <div className="header-right">
            <button
              className={`ai-status ${demo && !liveDraft ? "demo" : ai.state}`}
              onClick={() => setModal("settings")}
            >
              <span className="status-dot" />
              {demo && !liveDraft ? "Demo Modu" : ai.label}
              <ChevronDown size={12} />
            </button>
            <span className="header-divider" />
            <button
              className="icon-button help-button"
              aria-label="Yardım"
              onClick={() => setModal("help")}
            >
              <CircleHelp size={19} />
            </button>
            <span className="avatar" title="Yerel çalışma oturumu">
              S
            </span>
          </div>
        </header>

        <div className="workspace-grid">
          <main id="main" className="main-content">
            <section className="welcome">
              <div className="eyebrow">
                <span /> DAHA AZ KARMAŞA, DAHA ÇOK FIRSAT
              </div>
              <h1>
                Başvurunu anlamak kolay.
                <br />
                <span>Eksiklerini görmek daha kolay.</span>
              </h1>
              <p>
                Uzun yönergeleri net adımlara dönüştür.
                <br className="mobile-break" /> Her gerekliliği kaynağıyla gör,
                güvenle ilerle.
              </p>
              <div className="welcome-stamp">
                <ScanText size={30} />
                <span>
                  Bir başvuru.
                  <br />
                  <strong>Net bir yol haritası.</strong>
                </span>
                <span className="stamp-star">✳</span>
              </div>
            </section>

            <div className="journey" aria-label="Başvuru adımları">
              {[
                {
                  label: "Yönergeni ekle",
                  icon: FileText,
                  done: !!project.source,
                },
                {
                  label: "Gereklilikleri gör",
                  icon: ScanText,
                  done: !!analysis,
                },
                {
                  label: "Adım adım tamamla",
                  icon: CheckCheck,
                  done: progress === 100,
                },
              ].map((step, i) => (
                <div
                  key={step.label}
                  className={`journey-step ${step.done ? "done" : ""}`}
                >
                  <span className="step-number">
                    {step.done ? <Check size={13} /> : `0${i + 1}`}
                  </span>
                  <span>{step.label}</span>
                  {i < 2 && <span className="step-line" />}
                </div>
              ))}
            </div>

            {error && (
              <div className="alert error" role="alert">
                <TriangleAlert size={18} />
                <span>{error}</span>
                <button
                  className="icon-button"
                  aria-label="Hata mesajını kapat"
                  onClick={() => setError("")}
                >
                  <X size={16} />
                </button>
              </div>
            )}
            {demo && (
              <div className="demo-banner">
                <span className="demo-badge">ÖRNEK VERİ</span>
                <span>
                  Bu yönerge analizi örnek veridir; analiz için canlı AI
                  kullanılmadı.
                </span>
              </div>
            )}

            {!analysis ? (
              <section className="input-card card">
                <div className="card-heading">
                  <div>
                    <span className="section-kicker">BURADAN BAŞLA</span>
                    <h2>Bir sonraki fırsatın ne?</h2>
                    <p>
                      Başvuru yönergesini ekle, detayları birlikte
                      netleştirelim.
                    </p>
                  </div>
                  <span className="heading-icon">
                    <FileSearch size={23} />
                  </span>
                </div>
                <div className="input-toolbar">
                  <span>
                    <FileText size={15} /> Başvuru metni
                  </span>
                  <span>veya</span>
                  <label className={`upload-link ${busy ? "disabled" : ""}`}>
                    <UploadCloud size={16} /> Belge yükle
                    <input
                      aria-label="Belge yükle"
                      type="file"
                      accept=".txt,.pdf,.docx"
                      disabled={!!busy}
                      onChange={(e) => {
                        void upload(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
                <label htmlFor="source" className="sr-only">
                  Başvuru yönergesi
                </label>
                <textarea
                  ref={inputRef}
                  id="source"
                  className="source-input"
                  placeholder={
                    "Burs, staj veya yarışma başvurusunun yönergesini buraya yapıştır…\n\nKimler başvurabilir? Hangi belgeler gerekiyor? Son tarih ne?\nHepsini senin için bir araya getirelim."
                  }
                  value={project.source}
                  maxLength={80000}
                  disabled={!!busy}
                  onChange={(e) =>
                    patch({
                      source: e.target.value,
                      filename: "",
                      mode: "live",
                    })
                  }
                />
                <div className="input-meta">
                  <span>
                    {project.filename ? (
                      <>
                        <FileText size={12} /> {project.filename}
                      </>
                    ) : (
                      "TXT, PDF, DOCX · En fazla 5 MB"
                    )}
                  </span>
                  <span
                    className={
                      characterCount(project.source) > 40000
                        ? "text-danger"
                        : ""
                    }
                  >
                    {characterCount(project.source).toLocaleString("tr-TR")} /
                    40.000
                  </span>
                </div>
                {sample && (
                  <label className="demo-switch">
                    <input
                      type="checkbox"
                      checked={demo}
                      disabled={!!busy}
                      onChange={(e) =>
                        patch({ mode: e.target.checked ? "demo" : "live" })
                      }
                    />
                    Önceden hazırlanmış demo sonuçlarını kullan
                  </label>
                )}
                <div className="input-footer">
                  <span>
                    <LockKeyhole size={13} /> Belgelerin cihazında işlenir.
                  </span>
                  <button
                    className="button primary"
                    onClick={() => void analyze()}
                    disabled={!!busy || !project.source.trim()}
                  >
                    {busy ? (
                      <LoaderCircle className="spin" size={16} />
                    ) : (
                      <Sparkles size={16} />
                    )}
                    {busy === "analyze"
                      ? `Analiz ediliyor · ${waitSeconds} sn`
                      : busy === "upload"
                        ? "Belge okunuyor…"
                        : "Başvurumu Analiz Et"}
                    {!busy && <ArrowRight size={16} />}
                  </button>
                </div>
              </section>
            ) : (
              <>
                <section className="application-heading">
                  <div className="application-title-icon">
                    <GraduationCap size={25} />
                  </div>
                  <div>
                    <div className="section-kicker">
                      {demo ? "ÖRNEK BURS BAŞVURUSU" : "ANALİZ EDİLEN BAŞVURU"}
                    </div>
                    <h2>{analysis.name}</h2>
                  </div>
                  <button
                    className="icon-button clear-button"
                    disabled={!!busy}
                    aria-label="Başvuru verilerini temizle"
                    onClick={() => setModal("clear")}
                  >
                    <Trash2 size={17} />
                  </button>
                </section>
                <div
                  className="tabs"
                  role="tablist"
                  aria-label="Başvuru görünümü"
                >
                  {(
                    [
                      {
                        id: "overview",
                        label: "Genel bakış",
                        icon: LayoutDashboard,
                      },
                      { id: "source", label: "Kaynak metin", icon: FileText },
                      { id: "missing", label: "Eksik bilgiler", icon: Search },
                      {
                        id: "answers",
                        label: "Yanıt asistanı",
                        icon: Sparkles,
                      },
                    ] as const
                  ).map((t) => (
                    <button
                      id={`tab-${t.id}`}
                      role="tab"
                      aria-selected={tab === t.id}
                      aria-controls="tab-panel"
                      key={t.id}
                      className={tab === t.id ? "selected" : ""}
                      onClick={() => setTab(t.id)}
                    >
                      <t.icon size={14} />
                      {t.label}
                    </button>
                  ))}
                </div>
                <div
                  id="tab-panel"
                  role="tabpanel"
                  aria-labelledby={`tab-${tab}`}
                >
                  {tab === "overview" && (
                    <div className="overview-content">
                      <div className="summary-card">
                        <span className="summary-icon">
                          <Sparkles size={18} />
                        </span>
                        <div>
                          <h3>Yönergenin kısa özeti</h3>
                          <p>{analysis.purpose}</p>
                          <Evidence text={analysis.purpose_evidence} />
                        </div>
                      </div>
                      <div className="mini-stats">
                        <div>
                          <FileText size={17} />
                          <strong>
                            {
                              requirements.filter((r) => r.kind === "document")
                                .length
                            }
                          </strong>
                          <span>gerekli belge</span>
                        </div>
                        <div>
                          <MessageSquareText size={17} />
                          <strong>{questions.length}</strong>
                          <span>form sorusu</span>
                        </div>
                        <div>
                          <ShieldCheck size={17} />
                          <strong>
                            {
                              requirements.filter(
                                (r) => r.kind === "eligibility",
                              ).length
                            }
                          </strong>
                          <span>uygunluk koşulu</span>
                        </div>
                      </div>
                      <div className="section-heading">
                        <h3>Başvurunun gereklilikleri</h3>
                        <span>{requirements.length} madde</span>
                      </div>
                      <div className="requirement-list">
                        {requirements.map((r) => {
                          const Icon = icons[r.kind];
                          return (
                            <article className="requirement-row" key={r.id}>
                              <span className={`requirement-icon ${r.kind}`}>
                                <Icon size={18} />
                              </span>
                              <div className="requirement-body">
                                <div className="requirement-meta">
                                  {kindLabels[r.kind]}{" "}
                                  {r.required && <span>Gerekli</span>}
                                </div>
                                <h4>{r.description}</h4>
                                {r.character_limit && (
                                  <span className="char-tag">
                                    En fazla {r.character_limit} karakter
                                  </span>
                                )}
                                <Evidence text={r.evidence} />
                              </div>
                              {r.kind === "question" && (
                                <button
                                  className="icon-button"
                                  aria-label={`${r.description} sorusunu yanıtla`}
                                  onClick={() => {
                                    setFocusedQuestionId(r.id);
                                    setTab("answers");
                                  }}
                                >
                                  <ArrowUpRight size={18} />
                                </button>
                              )}
                            </article>
                          );
                        })}
                      </div>
                      {analysis.ambiguities.map((a, i) => (
                        <div className="ambiguity" key={i}>
                          <TriangleAlert size={17} />
                          <div>
                            <strong>Belirsiz yönerge</strong>
                            <p>{a.description}</p>
                            <Evidence text={a.evidence} />
                          </div>
                        </div>
                      ))}
                      <p className="disclosure">
                        <ShieldCheck size={13} /> Alıntılar özgün metinle
                        eşleştirildi. AI yorumlarını kaynağıyla kontrol edin.
                      </p>
                    </div>
                  )}
                  {tab === "source" && (
                    <section className="card source-card">
                      <div className="section-heading">
                        <h3>Özgün yönerge</h3>
                        <span>{characterCount(project.source)} karakter</span>
                      </div>
                      <p className="muted">
                        Analizin dayandığı metin. Yeni bir sürüm için yeni
                        başvuru açabilirsiniz.
                      </p>
                      <pre>{project.source}</pre>
                    </section>
                  )}
                  {tab === "missing" && (
                    <section className="missing-section">
                      <div className="section-heading">
                        <div>
                          <h3>Bildiklerinle başlayalım.</h3>
                          <p className="muted">
                            Her madde için kendi bilginizi veya belge durumunuzu
                            yazın.
                          </p>
                        </div>
                        <button
                          className="button secondary compact"
                          disabled={!!busy}
                          onClick={() => void detectMissing()}
                        >
                          {busy === "missing" ? (
                            <LoaderCircle size={15} className="spin" />
                          ) : (
                            <Search size={15} />
                          )}{" "}
                          Karşılaştır
                        </button>
                      </div>
                      <div className="info-note">
                        <ShieldCheck size={15} />
                        <span>
                          {demo
                            ? "Demo, serbest metnin anlamını yorumlamaz. Yazılan bilgiler doğrulama bekleyen beyan olarak gösterilir."
                            : "Beyanlarınız yalnızca yerel modele gönderilir. Belge içeriği ve uygunluk ayrıca kontrol edilmelidir."}
                        </span>
                      </div>
                      {requirements.map((r) => {
                        const item = missing.find(
                          (m) => m.requirement_id === r.id,
                        );
                        const fact = project.facts[r.id];
                        return (
                          <article className="fact-card card" key={r.id}>
                            <div className="fact-title">
                              <label htmlFor={`fact-${r.id}`}>
                                {r.description}
                              </label>
                              <span
                                className={`info-badge ${item?.status ?? "missing"}`}
                              >
                                {infoLabels[item?.status ?? "missing"]}
                              </span>
                            </div>
                            <Evidence text={r.evidence} />
                            <textarea
                              id={`fact-${r.id}`}
                              rows={2}
                              maxLength={2000}
                              disabled={!!busy}
                              placeholder={
                                r.kind === "document"
                                  ? "Örnek: Güncel PDF belgem hazır; henüz göndermedim."
                                  : "Bu madde için yalnızca kendi bildiğiniz bilgiyi yazın…"
                              }
                              value={fact?.text ?? ""}
                              onChange={(e) =>
                                updateFact(r.id, { text: e.target.value })
                              }
                            />
                            <label className="not-applicable">
                              <input
                                type="checkbox"
                                disabled={!!busy}
                                checked={fact?.not_applicable ?? false}
                                onChange={(e) =>
                                  updateFact(r.id, {
                                    not_applicable: e.target.checked,
                                  })
                                }
                              />
                              Bana uygulanmadığını beyan ediyorum (nedenini
                              yukarıya yazın)
                            </label>
                            {item?.question && (
                              <p className="followup-inline">
                                <CircleHelp size={13} />
                                {item.question}
                              </p>
                            )}
                            {item?.user_evidence && (
                              <p className="user-evidence">
                                Sizin beyanınız: “{item.user_evidence}”
                              </p>
                            )}
                          </article>
                        );
                      })}
                      <p className="disclosure">
                        “Uygulanmıyor” beyanı zorunlu bir koşulu kaldırmaz.
                        Resmî kurumdan teyit alın.
                      </p>
                    </section>
                  )}
                  {tab === "answers" && (
                    <section className="answer-section">
                      {!questions.length ? (
                        <div className="card empty-state">
                          <MessageSquareText size={28} />
                          <h3>Bu yönergede form sorusu bulunamadı.</h3>
                          <p>
                            Gereklilikleri ve özgün metni kontrol edebilirsiniz.
                          </p>
                        </div>
                      ) : (
                        <>
                          <div className="info-note answer-ai-note">
                            <ShieldCheck size={16} />
                            <div>
                              <strong>
                                {draftUsesDemo
                                  ? "Demo taslağı · AI üretimi değil"
                                  : `Yerel AI · ${ai.model ?? "Gemma 4"}`}
                              </strong>
                              <p>
                                API key gerekmez.{" "}
                                {draftUsesDemo
                                  ? "Demo, hazır örnek yanıtı veya yazdığınız bilgileri gösterir. Yeni bir yanıt yazdırmak için gerçek Gemma 4 seçeneğini açın."
                                  : ai.detail ||
                                    "Gemma 4 durumu Model ve bağlantı ekranından kontrol edilebilir."}
                              </p>
                              {demo && (
                                <label className="demo-switch">
                                  <input
                                    type="checkbox"
                                    checked={liveDraft}
                                    disabled={!!busy}
                                    onChange={(e) => {
                                      setLiveDraft(e.target.checked);
                                    }}
                                  />
                                  Taslağı gerçek Gemma 4 ile oluştur
                                </label>
                              )}
                              <button
                                className="button secondary compact"
                                onClick={() => {
                                  setModal("settings");
                                  void checkAI();
                                }}
                              >
                                Model kurulumunu kontrol et
                              </button>
                            </div>
                          </div>
                          <div className="answer-list-heading">
                            <h3>Form soruları</h3>
                            <p>
                              {questions.length} sorunun tamamı aşağıda. Her
                              yanıtı kendi alanında hazırlayabilirsin.
                            </p>
                          </div>
                          <div className="question-answer-list">
                            {questions.map((question, index) => {
                              const answerMode =
                                project.answerModes?.[question.id] ??
                                (draftUsesDemo ? "demo" : "live");
                              const responses =
                                project.followUpAnswers?.[question.id] ?? {};
                              const followUps = [
                                ...new Set([
                                  ...(project.answerSuggestions?.[
                                    question.id
                                  ] ?? []),
                                  ...Object.keys(responses).filter((key) =>
                                    responses[key].trim(),
                                  ),
                                ]),
                              ];
                              const answeredCount = Object.values(
                                responses,
                              ).filter((value) => value.trim()).length;
                              const isGenerating =
                                busy === "draft" &&
                                draftQuestionId === question.id;
                              return (
                                <article
                                  className="question-answer"
                                  key={question.id}
                                  id={`question-${question.id}`}
                                  aria-label={`${index + 1}. form sorusu`}
                                  tabIndex={-1}
                                >
                                  <div className="question-callout">
                                    <span className="section-kicker">
                                      FORM SORUSU {index + 1} /{" "}
                                      {questions.length}
                                    </span>
                                    <h3>{question.description}</h3>
                                    <span>
                                      {question.character_limit
                                        ? `En fazla ${question.character_limit} karakter`
                                        : "Kaynakta karakter sınırı belirtilmemiş"}
                                    </span>
                                    <Evidence text={question.evidence} />
                                  </div>
                                  <div className="card personal-card">
                                    <label
                                      className="field-label"
                                      htmlFor={`personal-${question.id}`}
                                    >
                                      Yanıtına hangi bilgileri ekleyelim?
                                    </label>
                                    <p>
                                      İstersen hedefini ve eklemek istediğin
                                      bilgileri yaz. Boş bırakırsan Gemma 4
                                      soruya uygun genel bir yanıt önerir.
                                    </p>
                                    <textarea
                                      id={`personal-${question.id}`}
                                      rows={3}
                                      maxLength={6000}
                                      disabled={isGenerating}
                                      value={
                                        project.personal[question.id] ?? ""
                                      }
                                      placeholder={
                                        "Bu soruyla ilgili hedeflerini, planlarını veya deneyimlerini ekleyebilirsin…"
                                      }
                                      onChange={(e) => {
                                        patch({
                                          personal: {
                                            ...project.personal,
                                            [question.id]: e.target.value,
                                          },
                                          answers: {
                                            ...project.answers,
                                            [question.id]: "",
                                          },
                                        });
                                      }}
                                    />
                                    <div className="personal-footer">
                                      <span>
                                        <LockKeyhole size={13} /> Yalnızca senin
                                        paylaştıkların
                                      </span>
                                      <button
                                        className="button primary compact"
                                        disabled={!!busy}
                                        onClick={() => void makeDraft(question)}
                                      >
                                        {isGenerating ? (
                                          <LoaderCircle
                                            className="spin"
                                            size={15}
                                          />
                                        ) : (
                                          <Sparkles size={15} />
                                        )}
                                        {isGenerating
                                          ? `Yanıt bekleniyor · ${waitSeconds} sn`
                                          : draftUsesDemo
                                            ? "Demo taslağı oluştur"
                                            : "Gemma 4 ile taslak oluştur"}
                                      </button>
                                    </div>
                                  </div>
                                  {isGenerating && (
                                    <div className="info-note" role="status">
                                      <LoaderCircle
                                        size={16}
                                        className="spin"
                                      />
                                      <span>
                                        Yerel model yanıt hazırlıyor. İlk
                                        yükleme ve yanıt cihazın hızına göre bir
                                        dakika kadar sürebilir. Ayrıntılar
                                        run.bat penceresinde görünür.
                                      </span>
                                    </div>
                                  )}
                                  <div className="card draft-card">
                                    <div className="section-heading">
                                      <h3>Senin yanıtın</h3>
                                      <span className="draft-label">
                                        {!project.answers[question.id]
                                          ? "Yanıt henüz hazırlanmadı"
                                          : answerMode === "demo"
                                            ? "Demo düzenlemesi"
                                            : answerMode === "manual"
                                              ? "Kendi yanıtın"
                                              : "AI önerisi · Düzenlenebilir"}
                                      </span>
                                    </div>
                                    <label
                                      htmlFor={`answer-${question.id}`}
                                      className="sr-only"
                                    >
                                      Düzenlenebilir yanıt
                                    </label>
                                    <textarea
                                      id={`answer-${question.id}`}
                                      rows={5}
                                      disabled={isGenerating}
                                      placeholder="Taslağın burada görünecek. İstersen yanıtını kendin de yazabilirsin."
                                      value={project.answers[question.id] ?? ""}
                                      onChange={(e) =>
                                        patch({
                                          answers: {
                                            ...project.answers,
                                            [question.id]: e.target.value,
                                          },
                                          answerModes: {
                                            ...project.answerModes,
                                            [question.id]: "manual",
                                          },
                                        })
                                      }
                                    />
                                    <div className="draft-footer">
                                      <span
                                        className={
                                          question.character_limit &&
                                          characterCount(
                                            project.answers[question.id] ?? "",
                                          ) > question.character_limit
                                            ? "text-danger"
                                            : "muted"
                                        }
                                        aria-live="polite"
                                      >
                                        {characterCount(
                                          project.answers[question.id] ?? "",
                                        )}
                                        {question.character_limit
                                          ? ` / ${question.character_limit}`
                                          : ""}{" "}
                                        karakter
                                        {question.character_limit &&
                                        characterCount(
                                          project.answers[question.id] ?? "",
                                        ) > question.character_limit
                                          ? " · Sınır aşıldı"
                                          : ""}
                                      </span>
                                      <button
                                        className="button secondary compact"
                                        disabled={!project.answers[question.id]}
                                        onClick={() =>
                                          void copyAnswer(question.id)
                                        }
                                      >
                                        <Copy size={14} /> Kopyala
                                      </button>
                                    </div>
                                    <p className="disclosure">
                                      {answerMode === "demo"
                                        ? "Bu, hazır bir demo örneği veya kendi yazdığınız metindir; AI üretimi değildir."
                                        : answerMode === "manual"
                                          ? "Bu yanıtı siz düzenlediniz."
                                          : project.answerKinds?.[
                                                question.id
                                              ] === "generic"
                                            ? "Kişisel bilgi paylaşmadığınız için bu genel bir yanıt önerisidir. Kendi durumunuza göre düzenleyin."
                                            : "Gemma 4, paylaştığınız bilgilerle yeni bir yanıt yazar."}{" "}
                                      Göndermeden önce tüm kişisel ifadelerin
                                      doğruluğunu kontrol edin.
                                    </p>
                                  </div>
                                  {followUps.length > 0 && (
                                    <section
                                      className="followup-box"
                                      aria-label="Taslağı geliştirmek için ek sorular"
                                    >
                                      <strong>
                                        Şu soruları da yanıtlarsanız taslağınız
                                        güçlenir.
                                      </strong>
                                      {followUps.map((q, followUpIndex) => (
                                        <div className="followup-field" key={q}>
                                          <label
                                            htmlFor={`followup-${question.id}-${followUpIndex}`}
                                          >
                                            <CircleHelp size={14} />
                                            {q}
                                          </label>
                                          <textarea
                                            id={`followup-${question.id}-${followUpIndex}`}
                                            rows={2}
                                            maxLength={1500}
                                            disabled={isGenerating}
                                            placeholder="Cevabını buraya yaz…"
                                            value={responses[q] ?? ""}
                                            onChange={(event) =>
                                              updateFollowUpAnswer(
                                                question.id,
                                                q,
                                                event.target.value,
                                              )
                                            }
                                          />
                                        </div>
                                      ))}
                                      <span>
                                        Cevapların mevcut bilgilerine eklenir.
                                        İstersen boş bırakabilir veya daha sonra
                                        düzenleyebilirsin.
                                      </span>
                                      <div className="followup-actions">
                                        <span>
                                          {answeredCount} soru yanıtlandı
                                        </span>
                                        <button
                                          className="button primary compact"
                                          disabled={!!busy || !answeredCount}
                                          onClick={() =>
                                            void makeDraft(question)
                                          }
                                        >
                                          {isGenerating ? (
                                            <LoaderCircle
                                              size={15}
                                              className="spin"
                                            />
                                          ) : (
                                            <Sparkles size={15} />
                                          )}
                                          {isGenerating
                                            ? `Taslak güncelleniyor · ${waitSeconds} sn`
                                            : "Yanıtlarımla taslağı güncelle"}
                                        </button>
                                      </div>
                                    </section>
                                  )}
                                </article>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </section>
                  )}
                </div>
              </>
            )}

            {
              <button
                className="sample-card"
                disabled={!!busy}
                onClick={loadSample}
              >
                <span className="sample-icon">
                  <GraduationCap size={26} />
                </span>
                <span>
                  <strong>
                    {sample
                      ? "Başka bir örnek dene."
                      : "Önce bir örnekle tanış."}
                  </strong>
                  <span>
                    {SAMPLES.length} farklı başvuru{" "}
                    <span className="sample-dot">·</span> Her birinde 3 form
                    sorusu.
                    {sample
                      ? ` Şu an: ${sample.category}.`
                      : " Burs, staj, yarışma ve daha fazlası."}
                  </span>
                </span>
                <span className="sample-cta">
                  Örnek ekle <ArrowRight size={16} />
                </span>
              </button>
            }
            {!analysis && (
              <div className="benefits">
                <div>
                  <ScanText size={19} />
                  <h3>Satır aralarını yakala</h3>
                  <p>
                    Koşullar, belgeler ve sınırlar.
                    <br />
                    Hiçbir detay gözden kaçmasın.
                  </p>
                </div>
                <div>
                  <ListChecks size={19} />
                  <h3>Eksiklerini fark et</h3>
                  <p>
                    Sana özel bir kontrol listesiyle
                    <br />
                    bir sonraki adımın belli olsun.
                  </p>
                </div>
                <div>
                  <ShieldCheck size={19} />
                  <h3>Kaynağıyla güven</h3>
                  <p>
                    Her çıkarımın dayandığı
                    <br />
                    orijinal cümleyi gör.
                  </p>
                </div>
              </div>
            )}
            <footer className="page-footer">
              <span>Bir fırsatın ilk adımı, onu anlamak.</span>
              <span>
                Açık kaynak. Yerel AI. <span className="tiny-leaf">✳</span>
              </span>
            </footer>
          </main>

          <aside
            className="insights-panel"
            aria-label="Başvuru özeti ve kontrol listesi"
          >
            <div className="panel-heading">
              <ClipboardCheck size={19} />
              <h2>Yol haritan</h2>
              <span className="panel-dot" />
            </div>
            <p className="panel-description">
              Büyük başvurular, küçük adımlarla.
            </p>
            <section className="progress-card">
              <div className="progress-chart">
                <svg viewBox="0 0 100 100" aria-hidden="true">
                  <circle className="progress-track" cx="50" cy="50" r="41" />
                  <circle
                    className="progress-value"
                    cx="50"
                    cy="50"
                    r="41"
                    strokeDasharray={`${progress * 2.576} 257.6`}
                  />
                </svg>
                <span>
                  <strong>%{progress}</strong>
                  <small>tamamlanan</small>
                </span>
              </div>
              <div className="progress-caption">
                <strong>
                  {completed} / {requirements.length} adım
                </strong>
                <span>
                  {analysis
                    ? "İşaretlediğin kontrol listesi ilerlemesi"
                    : "Yönergeni ekleyince yol haritan hazır."}
                </span>
              </div>
              {analysis && (
                <p className="progress-disclaimer">
                  Resmî başvuru tamamlanma onayı değildir.
                </p>
              )}
            </section>
            <div className="checklist-heading">
              <h3>Kontrol listesi</h3>
              <span>{requirements.length.toString().padStart(2, "0")}</span>
            </div>
            {analysis ? (
              <div className="checklist">
                {requirements.map((r) => (
                  <div className="checklist-item" key={r.id}>
                    <button
                      className={`check-button ${project.statuses[r.id] ?? "not_started"}`}
                      aria-label={`${r.description}: ${statusLabels[project.statuses[r.id] ?? "not_started"]}. Durumu değiştir`}
                      onClick={() => cycleStatus(r.id)}
                    >
                      {project.statuses[r.id] === "completed" ? (
                        <Check size={12} />
                      ) : project.statuses[r.id] === "in_progress" ? (
                        <span />
                      ) : null}
                    </button>
                    <div>
                      <strong
                        className={
                          project.statuses[r.id] === "completed"
                            ? "task-done"
                            : ""
                        }
                      >
                        {r.description}
                      </strong>
                      <select
                        aria-label={`${r.description} durumu`}
                        value={project.statuses[r.id] ?? "not_started"}
                        onChange={(e) =>
                          patch({
                            statuses: {
                              ...project.statuses,
                              [r.id]: e.target.value as TaskStatus,
                            },
                          })
                        }
                      >
                        {Object.entries(statusLabels).map(([v, label]) => (
                          <option value={v} key={v}>
                            {label}
                          </option>
                        ))}
                      </select>
                      <Evidence text={r.evidence} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="checklist-placeholder">
                <div>
                  <span />
                  <i />
                </div>
                <div>
                  <span />
                  <i />
                </div>
                <div>
                  <span />
                  <i />
                </div>
                <p>
                  Analizden sonra gerekli belgeler,
                  <br />
                  sorular ve koşullar burada listelenir.
                </p>
              </div>
            )}
            <section className="attention-card">
              <div className="attention-heading">
                <span>
                  <TriangleAlert size={15} />
                </span>
                <h3>Gözün üzerinde olsun</h3>
              </div>
              {analysis ? (
                <>
                  {deadlines.length ? (
                    deadlines.map((deadline) => (
                      <div className="risk-item" key={deadline.id}>
                        <CalendarDays size={14} />
                        <div>
                          <strong>{deadline.description}</strong>
                          <span>{deadlineLabel(deadline.deadline)}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="risk-item">
                      <CalendarDays size={14} />
                      <div>
                        <strong>Son tarih doğrulanmalı</strong>
                        <span>Kaynakta kesin son tarih bulunamadı.</span>
                      </div>
                    </div>
                  )}
                  {requirements
                    .filter(
                      (r) =>
                        r.required &&
                        (r.kind === "eligibility" ||
                          (r.kind === "document" &&
                            project.statuses[r.id] !== "completed") ||
                          (r.kind === "question" &&
                            (!project.answers[r.id]?.trim() ||
                              project.statuses[r.id] !== "completed"))),
                    )
                    .map((r) => (
                      <div className="risk-item" key={r.id}>
                        <span className="risk-bullet" />
                        <div>
                          <strong>{r.description}</strong>
                          <span>
                            {r.kind === "eligibility"
                              ? "Uygunluğu ayrıca doğrulayın"
                              : r.kind === "document"
                                ? "Belge hazırlığı bekleniyor"
                                : project.answers[r.id]?.trim()
                                  ? "Yanıtın kontrolü ve gönderimi bekleniyor"
                                  : "Henüz yanıt yazılmadı"}
                          </span>
                        </div>
                      </div>
                    ))}
                  {analysis.ambiguities.map((a, i) => (
                    <div className="risk-item" key={`a-${i}`}>
                      <TriangleAlert size={14} />
                      <span>{a.description}</span>
                    </div>
                  ))}
                  <p className="risk-note">
                    İşaretli maddeler kullanıcı beyanıdır. Uygunluk ve
                    eksiksizlik onayı verilmez.
                  </p>
                </>
              ) : (
                <p>
                  Son tarihler, eksik belgeler ve doğrulanması gereken koşullar
                  burada seni bekleyecek.
                </p>
              )}
            </section>
            <div className="trust-note">
              <ShieldCheck size={17} />
              <p>
                Bilmediğimizi uydurmayız.
                <br />
                <strong>Eksikse, sana sorarız.</strong>
              </p>
            </div>
          </aside>
        </div>
      </div>

      {notice && (
        <div className="toast" role="status">
          <Check size={17} />
          {notice}
          <button
            className="icon-button"
            aria-label="Bildirimi kapat"
            onClick={() => setNotice("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {modal && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <button
              ref={modalCloseRef}
              className="icon-button modal-close"
              aria-label="Pencereyi kapat"
              onClick={() => setModal(null)}
            >
              <X size={20} />
            </button>
            <span className="modal-icon">
              {modal === "privacy" ? (
                <LockKeyhole />
              ) : modal === "clear" ? (
                <Trash2 />
              ) : modal === "help" ? (
                <BookOpen />
              ) : (
                <Settings2 />
              )}
            </span>
            <h2 id="modal-title">
              {modal === "privacy"
                ? "Bilgilerin kontrolü sende."
                : modal === "clear"
                  ? "Başvuru verilerini temizle"
                  : modal === "help"
                    ? "Karmaşadan netliğe, üç adım."
                    : "Yerel model ve bağlantı"}
            </h2>
            {modal === "privacy" && (
              <>
                <p>
                  Başvurular, kişisel beyanlar ve taslaklar yalnızca bu sekmenin
                  belleğinde tutulur. Sayfayı yenileyince silinir. Tarayıcı
                  depolaması kullanılmaz.
                </p>
                <p>
                  PDF ve DOCX belgeleri yerel FastAPI servisinde bellekte
                  okunur; uygulama bunları diske kaydetmez. Analiz metni
                  yalnızca cihazındaki Ollama servisine gönderilir. Bulut
                  modelleri ve dış adresler engellenir.
                </p>
                <p>
                  Kontrol listesindeki tamamlanma işaretleri belge gönderimi
                  veya uygunluk kanıtı değildir. Tanılama kayıtlarına belge
                  içeriği yazılmaz.
                </p>
                <button
                  className="button secondary"
                  onClick={() => setModal("clear")}
                >
                  <Trash2 size={15} /> Mevcut başvuruyu temizle
                </button>
              </>
            )}
            {modal === "help" && (
              <>
                <ol className="help-steps">
                  <li>
                    <strong>Yönergeni ekle.</strong>
                    <p>
                      Metin yapıştır veya en fazla 5 MB TXT, PDF, DOCX yükle.
                    </p>
                  </li>
                  <li>
                    <strong>Gereklilikleri kaynaklarıyla incele.</strong>
                    <p>
                      Analiz, her maddenin dayandığı cümleyi gösterir. Eksik
                      bilgiler sekmesinde kendi beyanlarını ekle.
                    </p>
                  </li>
                  <li>
                    <strong>Adımları tamamla, yanıtını hazırla.</strong>
                    <p>
                      Durumları güncelle. Yanıt asistanına kendi bilgilerini yaz
                      ve taslağını oluştur. Ek sorular, yanıtının altında isteğe
                      bağlı öneriler olarak görünür.
                    </p>
                  </li>
                </ol>
                <div className="info-note">
                  Model olmadan denemek için örnek bursu açıp demo seçeneğini
                  kullan.
                </div>
                <button
                  className="button primary"
                  onClick={() => {
                    setModal(null);
                    loadSample();
                  }}
                >
                  Örnekle başla <ArrowRight size={15} />
                </button>
              </>
            )}
            {modal === "settings" && (
              <>
                <div className={`connection-detail ${ai.state}`}>
                  <span className="status-dot" />
                  <strong>{ai.label}</strong>
                  <p>{ai.detail}</p>
                </div>
                <p>
                  Çekirdek analiz modeli <strong>Gemma 4</strong>. Bağlı durumu
                  yalnızca yerel modelden geçerli bir yanıt alındığında
                  gösterilir.
                </p>
                <div className="info-note">
                  <ShieldCheck size={16} />
                  <strong>
                    API key gerekmez. Gemma 4, Ollama üzerinden bu bilgisayarda
                    çalışır.
                  </strong>
                </div>
                <dl className="model-diagnostics">
                  <div>
                    <dt>Seçili model</dt>
                    <dd>{ai.model ?? "Sunucuya bağlanınca görülecek"}</dd>
                  </div>
                  <div>
                    <dt>Ollama servisi</dt>
                    <dd>
                      {ai.ollama_reachable === true
                        ? "Ulaşılabiliyor"
                        : ai.ollama_reachable === false
                          ? "Ulaşılamıyor"
                          : "Henüz doğrulanmadı"}
                    </dd>
                  </div>
                  <div>
                    <dt>Model kurulu mu?</dt>
                    <dd>
                      {ai.model_installed === true
                        ? "Evet"
                        : ai.model_installed === false
                          ? "Hayır"
                          : "Servis bağlantısı olmadan doğrulanamaz"}
                    </dd>
                  </div>
                  <div>
                    <dt>Gerçek yanıt</dt>
                    <dd>
                      {ai.inference_verified === true
                        ? "Alındı"
                        : "Henüz doğrulanmadı"}
                    </dd>
                  </div>
                </dl>
                <p>Otomatik kurulum ve başlatma (proje klasöründe):</p>
                <pre>installer.bat{"\n"}run.bat</pre>
                <p>
                  <code>installer.bat -Demo</code> modeli indirmez. API anahtarı
                  eklemek bu eksikliği gidermez.
                </p>
                <p>
                  FastAPI:{" "}
                  <code>python -m uvicorn backend.app.main:app --reload</code>
                </p>
                <p className="muted">
                  Model etiketi ve yerel adres proje kökündeki .env dosyasında
                  ayarlanır. Başka modele otomatik geçiş yapılmaz.
                </p>
                <button
                  className="button secondary"
                  onClick={() => void checkAI()}
                  disabled={ai.state === "checking"}
                >
                  {ai.state === "checking" ? (
                    <LoaderCircle size={15} className="spin" />
                  ) : (
                    <Settings2 size={15} />
                  )}{" "}
                  Bağlantıyı yeniden kontrol et
                </button>
              </>
            )}
            {modal === "clear" && (
              <>
                <p>
                  Bu başvurunun kaynak metni, beyanları, kontrol listesi ve
                  yanıtları bellekten silinecek. Diğer başvuruların korunur.
                </p>
                <div className="modal-actions">
                  <button
                    className="button secondary"
                    onClick={() => setModal(null)}
                  >
                    Vazgeç
                  </button>
                  <button
                    className="button danger"
                    disabled={!!busy}
                    onClick={() => {
                      actionVersion.current++;
                      patch({ ...newProject(), id: project.id });
                      setFocusedQuestionId("");
                      setError("");
                      setTab("overview");
                      setModal(null);
                      setNotice("Başvurunun verileri temizlendi.");
                    }}
                  >
                    Verileri temizle
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
