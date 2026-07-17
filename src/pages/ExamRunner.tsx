import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, Navigate } from "react-router";
import { useI18n } from "@/i18n";
import { trpc } from "@/providers/trpc";
import { Logo } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Timer, Flag, ChevronRight, ChevronLeft, Send, ShieldCheck, LockKeyhole, AlertTriangle, Save,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Severity = "info" | "low" | "medium" | "high" | "critical";

export default function ExamRunner() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const token = sessionStorage.getItem("exam_token");

  const state = trpc.candidate.state.useQuery({ token: token ?? "" }, { enabled: !!token, refetchOnWindowFocus: false });
  const saveAnswer = trpc.candidate.saveAnswer.useMutation();
  const heartbeat = trpc.candidate.heartbeat.useMutation();
  const logEvent = trpc.candidate.logEvent.useMutation();
  const submitMut = trpc.candidate.submit.useMutation();

  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<number, { answer?: string[] | string | number | null; answerText?: string; flagged?: boolean }>>({});
  const [remaining, setRemaining] = useState<number | null>(null);
  const [fsWarning, setFsWarning] = useState(false);
  const [tabWarning, setTabWarning] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [savedTick, setSavedTick] = useState<number>(0);
  const [terminated, setTerminated] = useState(false);
  const essayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submittedRef = useRef(false);

  const log = useCallback(
    (eventType: string, severity: Severity, details?: string) => {
      if (!token) return;
      logEvent.mutate({ token, eventType, severity, details });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [token],
  );

  // ---------- init answers from server ----------
  useEffect(() => {
    if (state.data) {
      const map: Record<number, never> = {};
      for (const a of state.data.answers) {
        // @ts-expect-error fill
        map[a.examQuestionId] = { answer: a.answer, answerText: a.answerText ?? "", flagged: a.flagged };
      }
      setAnswers((prev) => ({ ...map, ...prev }));
      setRemaining(state.data.remainingSec);
      if (state.data.status === "terminated") setTerminated(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!state.data]);

  // ---------- desktop secure client hooks ----------
  useEffect(() => {
    const se = (window as unknown as { secureExam?: { examStarted: () => void; examFinished: () => void; onFocusForced: (cb: () => void) => void } }).secureExam;
    if (se && state.data?.status === "active") {
      se.examStarted();
      log("desktop_client_connected", "info", "جلسة عبر نسخة سطح المكتب الآمنة");
      se.onFocusForced(() => log("desktop_focus_forced", "high", "محاولة مغادرة نافذة الاختبار في نسخة سطح المكتب"));
    }
    return () => { se?.examFinished(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.data?.status]);

  // ---------- lockdown: fullscreen + event traps ----------
  const lockdown = state.data?.exam.lockdown ?? false;

  const enterFullscreen = useCallback(() => {
    document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);

  useEffect(() => {
    if (!lockdown || !state.data || state.data.status !== "active") return;
    enterFullscreen();
    document.body.classList.add("exam-lockdown-active");

    const onFsChange = () => {
      if (!document.fullscreenElement) {
        setFsWarning(true);
        log("fullscreen_exit", "medium", "خروج من ملء الشاشة");
      } else {
        setFsWarning(false);
      }
    };
    const onVisibility = () => {
      if (document.hidden) {
        log("tab_hidden", "high", "إخفاء صفحة الاختبار / تغيير التبويب");
        setTabWarning(true);
      }
    };
    const onBlur = () => {
      log("window_blur", "medium", "فقدان تركيز نافذة الاختبار");
    };
    const onCopy = (e: ClipboardEvent) => { e.preventDefault(); log("copy_attempt", "low", "محاولة نسخ"); };
    const onPaste = (e: ClipboardEvent) => { e.preventDefault(); log("paste_attempt", "low", "محاولة لصق"); };
    const onCut = (e: ClipboardEvent) => { e.preventDefault(); log("cut_attempt", "low", "محاولة قص"); };
    const onContext = (e: MouseEvent) => { e.preventDefault(); log("right_click", "low", "زر الفأرة الأيمن"); };
    const onKeys = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (e.key === "F12" || (e.ctrlKey && ["p", "s", "u", "c", "x", "v", "f", "t", "w", "tab"].includes(k)) || (e.metaKey && ["p", "s", "t", "w"].includes(k)) || e.key === "PrintScreen") {
        e.preventDefault();
        log("blocked_shortcut", "medium", `اختصار محظور: ${e.key}`);
      }
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      log("page_unload_attempt", "medium", "محاولة مغادرة الصفحة");
      e.preventDefault();
    };

    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onPaste);
    document.addEventListener("cut", onCut);
    document.addEventListener("contextmenu", onContext);
    document.addEventListener("keydown", onKeys, true);
    window.addEventListener("beforeunload", onBeforeUnload);
    log("lockdown_started", "info", "بدء وضع القفل الآمن");
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("cut", onCut);
      document.removeEventListener("contextmenu", onContext);
      document.removeEventListener("keydown", onKeys, true);
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.body.classList.remove("exam-lockdown-active");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockdown, state.data?.status]);

  // ---------- timer + heartbeat ----------
  useEffect(() => {
    if (remaining === null || terminated) return;
    const iv = setInterval(() => {
      setRemaining((r) => {
        if (r === null) return r;
        if (r <= 1) {
          clearInterval(iv);
          doSubmit(true);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining !== null, terminated]);

  useEffect(() => {
    if (!token || terminated) return;
    const iv = setInterval(async () => {
      try {
        const hb = await heartbeat.mutateAsync({ token });
        if (hb.status === "terminated") { setTerminated(true); return; }
        if (hb.status !== "active") { finishAndLeave(); return; }
        setRemaining(hb.remainingSec);
      } catch { /* offline: keep local timer */ }
    }, 15000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, terminated]);

  // ---------- save ----------
  const persist = useCallback(
    (examQuestionId: number, data: { answer?: string[] | string | number | null; answerText?: string; flagged?: boolean }) => {
      if (!token) return;
      saveAnswer.mutate(
        { token, examQuestionId, ...data },
        { onSuccess: () => setSavedTick(Date.now()) },
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [token],
  );

  const setAnswer = (examQuestionId: number, value: string[] | string | number | null, isEssay = false) => {
    setAnswers((prev) => {
      const next = { ...prev, [examQuestionId]: { ...prev[examQuestionId], answer: value, answerText: typeof value === "string" ? value : prev[examQuestionId]?.answerText } };
      return next;
    });
    if (isEssay) {
      if (essayTimer.current) clearTimeout(essayTimer.current);
      essayTimer.current = setTimeout(() => persist(examQuestionId, { answerText: String(value ?? "") }), 800);
    } else {
      persist(examQuestionId, { answer: value });
    }
  };

  const toggleFlag = (examQuestionId: number) => {
    const flagged = !answers[examQuestionId]?.flagged;
    setAnswers((prev) => ({ ...prev, [examQuestionId]: { ...prev[examQuestionId], flagged } }));
    persist(examQuestionId, { flagged });
  };

  // ---------- submit ----------
  const doSubmit = async (auto: boolean) => {
    if (submittedRef.current || !token) return;
    submittedRef.current = true;
    log(auto ? "auto_submit_time_up" : "manual_submit", "info");
    try {
      await submitMut.mutateAsync({ token });
    } catch { /* already submitted */ }
    finishAndLeave();
  };

  const finishAndLeave = () => {
    (window as unknown as { secureExam?: { examFinished: () => void } }).secureExam?.examFinished();
    sessionStorage.removeItem("exam_token");
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    navigate("/exam/done", { replace: true });
  };

  const questions = useMemo(() => state.data?.questions ?? [], [state.data]);
  const q = questions[current];

  if (!token) return <Navigate to="/exam" replace />;
  if (state.isLoading) return <div className="flex min-h-screen items-center justify-center"><ShieldCheck className="h-8 w-8 animate-pulse text-brand" /></div>;
  if (state.error) return <div className="flex min-h-screen items-center justify-center text-destructive">{state.error.message}</div>;

  if (terminated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-red-50 p-4">
        <div className="max-w-md rounded-2xl bg-white p-8 text-center shadow-xl">
          <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-red-600" />
          <h2 className="text-xl font-bold text-red-700">{t("examTerminated")}</h2>
          <Button className="mt-6" variant="outline" onClick={finishAndLeave}>{t("close")}</Button>
        </div>
      </div>
    );
  }

  const fmt = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
      : `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  const answeredCount = questions.filter((qq) => {
    const a = answers[qq.examQuestionId];
    if (!a) return false;
    if (qq.type === "essay") return (a.answerText ?? "").trim().length > 0;
    if (Array.isArray(a.answer)) return a.answer.length > 0;
    return a.answer !== null && a.answer !== undefined && a.answer !== "";
  }).length;

  const lowTime = (remaining ?? 9999) < 300;

  return (
    <div className="flex min-h-screen flex-col bg-slate-100">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b bg-[hsl(193,40%,22%)] text-white shadow">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2">
          <div className="flex items-center gap-3">
            <div className="rounded bg-white p-1"><Logo size="sm" /></div>
            <div className="hidden md:block">
              <p className="text-sm font-bold">{lang === "ar" ? state.data!.exam.titleAr : state.data!.exam.titleEn || state.data!.exam.titleAr}</p>
              <p className="text-xs text-white/70">{state.data!.candidate.nameAr}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {savedTick > 0 && (
              <span className="hidden items-center gap-1 text-xs text-emerald-300 md:flex">
                <Save className="h-3.5 w-3.5" /> {t("autoSaved")} {new Date(savedTick).toLocaleTimeString(lang === "ar" ? "ar-SA" : "en-US")}
              </span>
            )}
            {lockdown && (
              <Badge className="bg-white/15 text-white">
                <LockKeyhole className="me-1 h-3.5 w-3.5" /> {t("secureModeActive")}
              </Badge>
            )}
            <div className={cn("flex items-center gap-2 rounded-lg px-3 py-1.5 font-mono text-lg font-bold", lowTime ? "animate-pulse bg-red-600" : "bg-white/15")}>
              <Timer className="h-5 w-5" />
              {remaining !== null ? fmt(remaining) : "--:--"}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 gap-4 p-4">
        {/* Question nav */}
        <aside className="hidden w-52 shrink-0 md:block">
          <div className="sticky top-20 rounded-xl bg-white p-3 shadow-sm">
            <p className="mb-2 text-center text-xs text-muted-foreground">{answeredCount} / {questions.length} {t("answered")}</p>
            <div className="grid grid-cols-5 gap-1.5">
              {questions.map((qq, i) => {
                const a = answers[qq.examQuestionId];
                const isAns = (Array.isArray(a?.answer) && a!.answer!.length > 0) || (!!a?.answer && !Array.isArray(a.answer)) || ((a?.answerText ?? "").trim().length > 0);
                return (
                  <button
                    key={qq.examQuestionId}
                    onClick={() => setCurrent(i)}
                    className={cn(
                      "relative flex h-9 items-center justify-center rounded-md border text-sm font-semibold transition-colors",
                      i === current ? "border-brand bg-brand text-white" :
                      isAns ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "bg-white hover:bg-secondary",
                    )}
                  >
                    {i + 1}
                    {a?.flagged && <span className="absolute -end-1 -top-1 h-2.5 w-2.5 rounded-full bg-amber-500" />}
                  </button>
                );
              })}
            </div>
            <Button className="mt-3 w-full bg-accent-brand text-white" onClick={() => setConfirmSubmit(true)}>
              <Send className="me-2 h-4 w-4" /> {t("submitExam")}
            </Button>
          </div>
        </aside>

        {/* Question */}
        <main className="min-w-0 flex-1">
          {q && (
            <div className="rounded-xl bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <span className="text-sm text-muted-foreground">{t("question")} {current + 1} {t("of")} {questions.length}</span>
                  {q.section && <Badge variant="outline" className="ms-2">{q.section}</Badge>}
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-secondary text-secondary-foreground">{q.points} {t("points")}</Badge>
                  <Button variant={answers[q.examQuestionId]?.flagged ? "default" : "outline"} size="sm"
                    className={answers[q.examQuestionId]?.flagged ? "bg-amber-500 text-white" : ""}
                    onClick={() => toggleFlag(q.examQuestionId)}>
                    <Flag className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <p className="mb-6 text-lg font-medium leading-relaxed">{lang === "ar" ? q.textAr : q.textEn || q.textAr}</p>

              {/* Answer area */}
              {(q.type === "single" || q.type === "truefalse") && (
                <div className="space-y-2">
                  {q.options.map((o) => (
                    <button
                      key={o.id}
                      onClick={() => setAnswer(q.examQuestionId, o.id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg border-2 p-3.5 text-start transition-colors",
                        answers[q.examQuestionId]?.answer === o.id
                          ? "border-brand bg-[hsl(193,37%,30%)]/5 font-semibold"
                          : "hover:border-brand/40 hover:bg-secondary/50",
                      )}
                    >
                      <span className={cn("flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs",
                        answers[q.examQuestionId]?.answer === o.id ? "border-brand bg-brand text-white" : "border-muted-foreground/40")}>
                        {o.id}
                      </span>
                      {lang === "ar" ? o.textAr : o.textEn || o.textAr}
                    </button>
                  ))}
                </div>
              )}

              {q.type === "multiple" && (
                <div className="space-y-2">
                  {q.options.map((o) => {
                    const sel = (answers[q.examQuestionId]?.answer as string[] | undefined) ?? [];
                    const checked = sel.includes(o.id);
                    return (
                      <button
                        key={o.id}
                        onClick={() => setAnswer(q.examQuestionId, checked ? sel.filter((x) => x !== o.id) : [...sel, o.id])}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg border-2 p-3.5 text-start transition-colors",
                          checked ? "border-brand bg-[hsl(193,37%,30%)]/5 font-semibold" : "hover:border-brand/40 hover:bg-secondary/50",
                        )}
                      >
                        <span className={cn("flex h-6 w-6 items-center justify-center rounded border-2 text-xs",
                          checked ? "border-brand bg-brand text-white" : "border-muted-foreground/40")}>
                          {checked ? "✓" : ""}
                        </span>
                        {lang === "ar" ? o.textAr : o.textEn || o.textAr}
                      </button>
                    );
                  })}
                </div>
              )}

              {q.type === "essay" && (
                <Textarea
                  rows={10}
                  className="text-base leading-relaxed"
                  placeholder={t("typeYourAnswer")}
                  value={answers[q.examQuestionId]?.answerText ?? ""}
                  onChange={(e) => setAnswer(q.examQuestionId, e.target.value, true)}
                />
              )}

              {q.type === "short" && (
                <Input
                  className="text-base"
                  placeholder={t("typeYourAnswer")}
                  value={(answers[q.examQuestionId]?.answer as string) ?? ""}
                  onChange={(e) => setAnswer(q.examQuestionId, e.target.value, true)}
                />
              )}

              {q.type === "numeric" && (
                <Input
                  type="number"
                  dir="ltr"
                  className="w-48 text-base"
                  value={(answers[q.examQuestionId]?.answer as number | undefined) ?? ""}
                  onChange={(e) => setAnswer(q.examQuestionId, e.target.value === "" ? null : Number(e.target.value))}
                />
              )}

              {/* Nav buttons */}
              <div className="mt-6 flex items-center justify-between">
                <Button variant="outline" disabled={current === 0} onClick={() => setCurrent(current - 1)}>
                  {lang === "ar" ? <ChevronRight className="me-1 h-4 w-4" /> : <ChevronLeft className="me-1 h-4 w-4" />}
                  {t("previous")}
                </Button>
                <span className="text-sm text-muted-foreground md:hidden">{current + 1}/{questions.length}</span>
                {current < questions.length - 1 ? (
                  <Button className="bg-brand" onClick={() => setCurrent(current + 1)}>
                    {t("next")}
                    {lang === "ar" ? <ChevronLeft className="ms-1 h-4 w-4" /> : <ChevronRight className="ms-1 h-4 w-4" />}
                  </Button>
                ) : (
                  <Button className="bg-accent-brand text-white" onClick={() => setConfirmSubmit(true)}>
                    <Send className="me-1 h-4 w-4" /> {t("submitExam")}
                  </Button>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Fullscreen warning overlay */}
      <Dialog open={fsWarning && lockdown} onOpenChange={() => {}}>
        <DialogContent className="text-center" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader><DialogTitle className="flex items-center justify-center gap-2 text-amber-600"><AlertTriangle /> {t("warningTitle")}</DialogTitle></DialogHeader>
          <p className="text-muted-foreground">{t("fullscreenRequired")}</p>
          <Button className="bg-brand" onClick={() => { enterFullscreen(); setFsWarning(false); }}>
            <LockKeyhole className="me-2 h-4 w-4" /> {t("returnFullscreen")}
          </Button>
        </DialogContent>
      </Dialog>

      {/* Tab switch warning */}
      <Dialog open={tabWarning} onOpenChange={setTabWarning}>
        <DialogContent className="text-center">
          <DialogHeader><DialogTitle className="flex items-center justify-center gap-2 text-red-600"><AlertTriangle /> {t("warningTitle")}</DialogTitle></DialogHeader>
          <p className="text-muted-foreground">{t("tabSwitchWarning")}</p>
          <Button className="bg-brand" onClick={() => setTabWarning(false)}>{t("confirm")}</Button>
        </DialogContent>
      </Dialog>

      {/* Submit confirm */}
      <Dialog open={confirmSubmit} onOpenChange={setConfirmSubmit}>
        <DialogContent className="text-center">
          <DialogHeader><DialogTitle className="flex items-center justify-center gap-2"><Send /> {t("submitExam")}</DialogTitle></DialogHeader>
          <p className="text-muted-foreground">{t("submitConfirm")}</p>
          <p className="font-bold">
            {t("answered")}: {answeredCount} / {questions.length}
            {answeredCount < questions.length && (
              <span className="ms-2 text-amber-600">({t("unansweredCount")}: {questions.length - answeredCount})</span>
            )}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setConfirmSubmit(false)}>{t("cancel")}</Button>
            <Button className="flex-1 bg-accent-brand text-white" onClick={() => { setConfirmSubmit(false); doSubmit(false); }}>
              {t("submitExam")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
