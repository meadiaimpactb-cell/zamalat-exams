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
  Camera, Image as ImageIcon, X, Hourglass, WifiOff, Wifi, HelpCircle,
} from "lucide-react";
import { quickRules, fillVars } from "@/content/studentGuide";
import { cn } from "@/lib/utils";
import { MathText } from "@/components/MathText";

type Severity = "info" | "low" | "medium" | "high" | "critical";
type AnswerPatch = { answer?: string[] | string | number | null; answerText?: string; answerImageUrl?: string | null; flagged?: boolean };

/** خطأ شبكة (لا رد من الخادم) وليس خطأ منطقيًا من الخادم */
const isNetworkError = (err: unknown) => !navigator.onLine || !(err as { data?: unknown } | null)?.data;

export default function ExamRunner() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const token = sessionStorage.getItem("exam_token");

  const state = trpc.candidate.state.useQuery({ token: token ?? "" }, { enabled: !!token, refetchOnWindowFocus: false });
  const saveAnswer = trpc.candidate.saveAnswer.useMutation();
  const heartbeat = trpc.candidate.heartbeat.useMutation();
  const logEvent = trpc.candidate.logEvent.useMutation();
  const submitMut = trpc.candidate.submit.useMutation();
  const uploadSnapshot = trpc.candidate.uploadSnapshot.useMutation();

  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<number, { answer?: string[] | string | number | null; answerText?: string; answerImageUrl?: string | null; flagged?: boolean }>>({});
  const [remaining, setRemaining] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [fsWarning, setFsWarning] = useState(false);
  const [fsExitsLeft, setFsExitsLeft] = useState<number | null>(null);
  const [tabWarning, setTabWarning] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false); // نافذة التعليمات أثناء الاختبار (داخل ملء الشاشة)
  const [savedTick, setSavedTick] = useState<number>(0);
  const [terminated, setTerminated] = useState(false);
  const [terminatedReason, setTerminatedReason] = useState<"proctor" | "fullscreen">("proctor");
  const [cameraOn, setCameraOn] = useState(false);
  const [imgError, setImgError] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const essayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submittedRef = useRef(false);
  // عند فتح نافذة رفع صورة/ملف: عملية مشروعة — نوقف رصد الخروج/فقدان التركيز مؤقتًا
  const proctorSuppressed = useRef(false);

  // ---------- انقطاع الإنترنت (ملاحظة 5) ----------
  // الإجابات التي تعذّر إرسالها تُحفظ محليًا (ذاكرة + localStorage) وتُرسل تلقائيًا عند عودة الاتصال.
  // الانقطاع لا يُحتسب مخالفة ولا يُخرج الطالب؛ المؤقّت يستمر محليًا ويُعاد ضبطه من الخادم عند العودة.
  const [offline, setOffline] = useState(!navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [reconnectedMsg, setReconnectedMsg] = useState<string | null>(null);
  const [submitQueued, setSubmitQueued] = useState(false);
  const offlineSince = useRef<number | null>(null);
  const pendingRef = useRef<Map<number, AnswerPatch>>(new Map());
  const flushing = useRef(false);
  const pendingKey = `exam_pending_${token ?? ""}`;
  const savePendingToStorage = () => {
    try {
      const obj: Record<string, AnswerPatch> = {};
      pendingRef.current.forEach((v, k) => { obj[String(k)] = v; });
      if (pendingRef.current.size) localStorage.setItem(pendingKey, JSON.stringify(obj));
      else localStorage.removeItem(pendingKey);
    } catch { /* التخزين المحلي غير متاح */ }
    setPendingCount(pendingRef.current.size);
  };
  const queuePatch = (examQuestionId: number, data: AnswerPatch) => {
    pendingRef.current.set(examQuestionId, { ...(pendingRef.current.get(examQuestionId) ?? {}), ...data });
    savePendingToStorage();
  };

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
        map[a.examQuestionId] = { answer: a.answer, answerText: a.answerText ?? "", answerImageUrl: a.answerImageUrl ?? null, flagged: a.flagged };
      }
      // الإجابات المعلّقة محليًا (لم تصل للخادم قبل الانقطاع/إغلاق الصفحة) لها الأولوية على نسخة الخادم
      let local: Record<string, AnswerPatch> = {};
      try { local = JSON.parse(localStorage.getItem(pendingKey) ?? "{}"); } catch { local = {}; }
      for (const [k, v] of Object.entries(local)) {
        pendingRef.current.set(Number(k), v);
        // @ts-expect-error merge
        map[Number(k)] = { ...(map[Number(k)] ?? {}), ...v };
      }
      setPendingCount(pendingRef.current.size);
      setAnswers((prev) => ({ ...map, ...prev }));
      setRemaining(state.data.remainingSec);
      setElapsed(state.data.elapsedSec);
      if (state.data.status === "terminated") setTerminated(true);
      // عند الاستئناف: أظهر المتبقي من محاولات الخروج (يبدأ من الصفر بعد إعادة الفتح)
      if (state.data.exam.maxFullscreenExits > 0 && state.data.fullscreenExitsUsed > 0) {
        setFsExitsLeft(Math.max(0, state.data.exam.maxFullscreenExits - state.data.fullscreenExitsUsed));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!state.data]);

  // ---------- مزامنة الإجابات المعلّقة ----------
  const flushPending = useCallback(async (): Promise<number> => {
    if (!token || flushing.current || pendingRef.current.size === 0) return 0;
    flushing.current = true;
    let sent = 0;
    try {
      for (const [qid, data] of [...pendingRef.current.entries()]) {
        try {
          await saveAnswer.mutateAsync({ token, examQuestionId: qid, ...data });
          pendingRef.current.delete(qid);
          sent++;
        } catch (err) {
          if (isNetworkError(err)) break; // ما زال الاتصال مقطوعًا
          pendingRef.current.delete(qid); // خطأ منطقي (مثل جلسة منتهية): لا فائدة من الإعادة
        }
      }
    } finally {
      flushing.current = false;
      savePendingToStorage();
      if (sent > 0) setSavedTick(Date.now());
    }
    return sent;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    const goOffline = () => {
      if (offlineSince.current === null) offlineSince.current = Date.now();
      setOffline(true);
    };
    const goOnline = async () => {
      setOffline(false);
      const since = offlineSince.current;
      offlineSince.current = null;
      const sent = await flushPending();
      if (since !== null && token) {
        const sec = Math.round((Date.now() - since) / 1000);
        // يُسجَّل في سجل المراقبة كمعلومة (لا مخالفة) — ملاحظة 5
        logEvent.mutate({ token, eventType: "network_reconnected", severity: "info", details: `عاد الاتصال بعد انقطاع ${sec} ثانية — أُعيد إرسال ${sent} إجابة محفوظة محليًا` });
      }
      setReconnectedMsg(`${sent}`);
      setTimeout(() => setReconnectedMsg(null), 6000);
      if (submitQueued) { submittedRef.current = false; setSubmitQueued(false); doSubmit(false); }
    };
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    // محاولة دورية لتفريغ الطابور (بعض المتصفحات لا تطلق online بدقة)
    const iv = setInterval(() => { if (pendingRef.current.size > 0 && navigator.onLine) flushPending(); }, 10000);
    return () => { window.removeEventListener("offline", goOffline); window.removeEventListener("online", goOnline); clearInterval(iv); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, submitQueued]);

  // ---------- camera proctoring: keep stream + periodic snapshots (المتطلب 5) ----------
  useEffect(() => {
    if (!state.data || state.data.status !== "active") return;
    const ex = state.data.exam;
    if (!ex.proctoring && !ex.cameraRequired) return;
    let stopped = false;
    let iv: ReturnType<typeof setInterval> | undefined;
    navigator.mediaDevices?.getUserMedia({ video: { width: 320, height: 240 }, audio: false })
      .then((stream) => {
        if (stopped) { stream.getTracks().forEach((tr) => tr.stop()); return; }
        streamRef.current = stream;
        setCameraOn(true);
        if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play().catch(() => {}); }
        const capture = () => {
          const v = videoRef.current;
          if (!v || v.videoWidth === 0 || !token) return;
          const canvas = document.createElement("canvas");
          canvas.width = 320; canvas.height = 240;
          const cx = canvas.getContext("2d");
          if (!cx) return;
          cx.drawImage(v, 0, 0, 320, 240);
          try {
            const data = canvas.toDataURL("image/jpeg", 0.5);
            uploadSnapshot.mutate({ token, image: data, kind: "camera" });
          } catch { /* ignore */ }
        };
        const intervalMs = Math.max(15, ex.snapshotIntervalSec) * 1000;
        setTimeout(capture, 3000);
        iv = setInterval(capture, intervalMs);
      })
      .catch(() => {
        setCameraOn(false);
        if (ex.cameraRequired) log("camera_lost", "high", "تعذّر الوصول للكاميرا أثناء الاختبار");
      });
    return () => {
      stopped = true;
      if (iv) clearInterval(iv);
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
      setCameraOn(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.data?.status]);

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

    const onFsChange = async () => {
      if (!document.fullscreenElement) {
        // رفع صورة/ملف مشروع: لا يُحتسب خروجًا — سيُعاد ملء الشاشة عند عودة التركيز
        if (proctorSuppressed.current) return;
        setFsWarning(true);
        if (!token) return;
        try {
          const res = await logEvent.mutateAsync({ token, eventType: "fullscreen_exit", severity: "medium", details: "خروج من ملء الشاشة" });
          if (res.terminated) {
            setFsWarning(false);
            setTerminatedReason("fullscreen");
            setTerminated(true);
          } else if (res.maxFullscreenExits > 0) {
            setFsExitsLeft(Math.max(0, res.maxFullscreenExits - res.fullscreenExits));
          }
        } catch { /* offline */ }
      } else {
        setFsWarning(false);
      }
    };
    const onVisibility = () => {
      if (proctorSuppressed.current) return; // نافذة رفع ملف مشروعة
      if (document.hidden) {
        log("tab_hidden", "high", "إخفاء صفحة الاختبار / تغيير التبويب");
        setTabWarning(true);
      }
    };
    const onBlur = () => {
      if (proctorSuppressed.current) return; // نافذة رفع ملف مشروعة
      log("window_blur", "medium", "فقدان تركيز نافذة الاختبار");
    };
    // عودة التركيز بعد نافذة رفع الملف: أنهِ الاستثناء، وأعِد ملء الشاشة
    const onFocus = () => {
      if (!proctorSuppressed.current) return;
      // حاول العودة تلقائيًا؛ فإن رفض المتصفح، أظهر زر العودة (دون احتساب مخالفة)
      if (!document.fullscreenElement) enterFullscreen();
      setTimeout(() => {
        proctorSuppressed.current = false;
        if (!document.fullscreenElement) setFsWarning(true);
        else setFsWarning(false);
      }, 400);
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
    window.addEventListener("focus", onFocus);
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
      window.removeEventListener("focus", onFocus);
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
      setElapsed((e) => e + 1);
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
        if (offlineSince.current !== null) window.dispatchEvent(new Event("online")); // عاد الاتصال دون حدث من المتصفح
        else if (pendingRef.current.size > 0) flushPending();
      } catch (err) {
        // انقطاع: المؤقّت يستمر محليًا ولا يُخرج الطالب (ملاحظة 5)
        if (isNetworkError(err)) { if (offlineSince.current === null) offlineSince.current = Date.now(); setOffline(true); }
      }
    }, 15000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, terminated]);

  // ---------- save ----------
  const persist = useCallback(
    (examQuestionId: number, data: AnswerPatch) => {
      if (!token) return;
      // دائمًا نحفظ محليًا أولًا ثم نرسل؛ يُحذف من الطابور عند نجاح الإرسال (ملاحظة 5)
      queuePatch(examQuestionId, data);
      if (!navigator.onLine) { setOffline(true); if (offlineSince.current === null) offlineSince.current = Date.now(); return; }
      saveAnswer.mutate(
        { token, examQuestionId, ...data },
        {
          onSuccess: () => {
            // لا نحذف إن كُتب تعديل أحدث أثناء الإرسال
            const cur = pendingRef.current.get(examQuestionId);
            if (cur && JSON.stringify(cur) === JSON.stringify({ ...(cur), ...data })) pendingRef.current.delete(examQuestionId);
            savePendingToStorage();
            setSavedTick(Date.now());
          },
          onError: (err) => {
            if (isNetworkError(err)) { setOffline(true); if (offlineSince.current === null) offlineSince.current = Date.now(); }
          },
        },
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

  // استثناء رفع الصورة من رصد الغش: يُستدعى لحظة فتح نافذة اختيار الملف
  const beginSecureUpload = useCallback(() => {
    proctorSuppressed.current = true;
    // أمان: إن لم يعُد التركيز خلال 60ث، أعِد التفعيل تلقائيًا
    setTimeout(() => { proctorSuppressed.current = false; }, 60000);
  }, []);

  // إجابة على شكل صورة (المتطلب 1)
  const setAnswerImage = (examQuestionId: number, file: File | null) => {
    setImgError("");
    if (!file) {
      setAnswers((prev) => ({ ...prev, [examQuestionId]: { ...prev[examQuestionId], answerImageUrl: null } }));
      persist(examQuestionId, { answerImageUrl: null });
      return;
    }
    if (file.size > 5 * 1024 * 1024) { setImgError(t("imageTooLarge")); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      setAnswers((prev) => ({ ...prev, [examQuestionId]: { ...prev[examQuestionId], answerImageUrl: dataUrl } }));
      persist(examQuestionId, { answerImageUrl: dataUrl });
    };
    reader.readAsDataURL(file);
  };

  // ---------- submit ----------
  async function doSubmit(auto: boolean) {
    if (submittedRef.current || !token) return;
    submittedRef.current = true;
    // أرسل الإجابات المعلّقة أولًا حتى لا يُسلَّم الاختبار ناقصًا
    await flushPending();
    if (pendingRef.current.size > 0 || !navigator.onLine) {
      // لا اتصال: يُؤجَّل التسليم ويُعاد تلقائيًا عند عودة الاتصال (والخادم يسلّم تلقائيًا عند انتهاء الوقت)
      submittedRef.current = false;
      setSubmitQueued(true);
      setOffline(true);
      return;
    }
    log(auto ? "auto_submit_time_up" : "manual_submit", "info");
    try {
      await submitMut.mutateAsync({ token });
    } catch (err) {
      if (isNetworkError(err)) { submittedRef.current = false; setSubmitQueued(true); setOffline(true); return; }
      /* already submitted */
    }
    finishAndLeave();
  }

  function finishAndLeave() {
    (window as unknown as { secureExam?: { examFinished: () => void } }).secureExam?.examFinished();
    try { localStorage.removeItem(pendingKey); } catch { /* ignore */ }
    sessionStorage.removeItem("exam_token");
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    navigate("/exam/done", { replace: true });
  }

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
          <h2 className="text-xl font-bold text-red-700">{terminatedReason === "fullscreen" ? t("examTerminatedFs") : t("examTerminated")}</h2>
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
            {cameraOn && (
              <Badge className="hidden bg-emerald-500/25 text-white sm:flex">
                <Camera className="me-1 h-3.5 w-3.5" /> {t("cameraProctorOn")}
              </Badge>
            )}
            {lockdown && (
              <Badge className="hidden bg-white/15 text-white md:flex">
                <LockKeyhole className="me-1 h-3.5 w-3.5" /> {t("secureModeActive")}
              </Badge>
            )}
            <Button size="sm" variant="ghost" className="h-8 text-white hover:bg-white/15" title={t("helpRules")} onClick={() => setHelpOpen(true)}>
              <HelpCircle className="h-5 w-5" />
            </Button>
            {/* الوقت المنقضي (المتطلب 4) */}
            <div className="hidden items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 font-mono text-sm sm:flex" title={t("elapsed")}>
              <Hourglass className="h-4 w-4 text-white/70" />
              {fmt(elapsed)}
            </div>
            {/* الوقت المتبقّي */}
            <div className={cn("flex items-center gap-2 rounded-lg px-3 py-1.5 font-mono text-lg font-bold", lowTime ? "animate-pulse bg-red-600" : "bg-white/15")} title={t("remaining")}>
              <Timer className="h-5 w-5" />
              {remaining !== null ? fmt(remaining) : "--:--"}
            </div>
          </div>
        </div>
      </header>

      {/* شريط حالة الاتصال (ملاحظة 5) */}
      {(offline || submitQueued) && (
        <div className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2">
            <WifiOff className="h-4 w-4 shrink-0" />
            <span className="font-semibold">{t("offlineTitle")}</span>
            <span className="text-amber-800/80">{submitQueued ? t("offlineSubmitQueued") : t("offlineDesc")}</span>
            {pendingCount > 0 && <span className="ms-auto rounded-full bg-amber-200 px-2 py-0.5 text-xs font-bold">{t("pendingAnswers")}: {pendingCount}</span>}
          </div>
        </div>
      )}
      {!offline && reconnectedMsg !== null && (
        <div className="border-b border-emerald-300 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          <div className="mx-auto flex max-w-6xl items-center gap-2">
            <Wifi className="h-4 w-4" /> {t("reconnectedMsg")} ({reconnectedMsg})
          </div>
        </div>
      )}

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

              <MathText as="p" className="mb-4 text-lg font-medium leading-relaxed" text={lang === "ar" ? q.textAr : q.textEn || q.textAr} />

              {/* صورة/مخطط داخل السؤال (المتطلب 1) */}
              {q.imageUrl && (
                <img src={q.imageUrl} alt={t("questionImage")} className="mb-6 max-h-96 rounded-lg border bg-white object-contain" />
              )}

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
                      <MathText text={lang === "ar" ? o.textAr : o.textEn || o.textAr} />
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
                        <MathText text={lang === "ar" ? o.textAr : o.textEn || o.textAr} />
                      </button>
                    );
                  })}
                </div>
              )}

              {q.type === "essay" && (
                <Textarea
                  rows={10}
                  className="math-input text-base leading-relaxed"
                  placeholder={t("typeYourAnswer")}
                  value={answers[q.examQuestionId]?.answerText ?? ""}
                  onChange={(e) => setAnswer(q.examQuestionId, e.target.value, true)}
                />
              )}

              {q.type === "short" && (
                <Input
                  className="math-input text-base"
                  placeholder={t("typeYourAnswer")}
                  value={(answers[q.examQuestionId]?.answer as string) ?? ""}
                  onChange={(e) => setAnswer(q.examQuestionId, e.target.value)}
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

              {/* إجابة على شكل صورة/مخطط (المتطلب 1) */}
              {q.allowImageAnswer && (
                <div className="mt-4 rounded-lg border border-dashed p-4">
                  <p className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <ImageIcon className="h-4 w-4" /> {t("imageAnswerHint")}
                  </p>
                  {answers[q.examQuestionId]?.answerImageUrl ? (
                    <div className="space-y-2">
                      <img src={answers[q.examQuestionId]!.answerImageUrl as string} alt="" className="max-h-72 rounded-lg border bg-white object-contain" />
                      <div className="flex gap-2">
                        <label className="cursor-pointer">
                          <input type="file" accept="image/*" className="hidden" onClick={beginSecureUpload} onChange={(e) => setAnswerImage(q.examQuestionId, e.target.files?.[0] ?? null)} />
                          <span className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-secondary"><Camera className="h-4 w-4" /> {t("replaceImage")}</span>
                        </label>
                        <Button variant="outline" size="sm" className="text-destructive" onClick={() => setAnswerImage(q.examQuestionId, null)}>
                          <X className="me-1 h-4 w-4" /> {t("removeImage")}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed py-6 text-sm text-muted-foreground hover:border-brand/40 hover:bg-secondary/40">
                      <input type="file" accept="image/*" className="hidden" onClick={beginSecureUpload} onChange={(e) => setAnswerImage(q.examQuestionId, e.target.files?.[0] ?? null)} />
                      <Camera className="h-5 w-5" /> {t("attachImage")}
                    </label>
                  )}
                  {imgError && <p className="mt-2 text-sm text-destructive">{imgError}</p>}
                </div>
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

      {/* Self-view camera (المتطلب 5) — always mounted so the capture ref exists */}
      <video
        ref={videoRef}
        muted
        playsInline
        className={cn(
          "fixed bottom-3 end-3 z-50 h-24 w-32 rounded-lg border-2 border-emerald-400 bg-black object-cover shadow-lg",
          cameraOn ? "block" : "hidden",
        )}
      />

      {/* Fullscreen warning overlay */}
      <Dialog open={fsWarning && lockdown} onOpenChange={() => {}}>
        <DialogContent className="text-center" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader><DialogTitle className="flex items-center justify-center gap-2 text-amber-600"><AlertTriangle /> {t("warningTitle")}</DialogTitle></DialogHeader>
          <p className="text-muted-foreground">{t("fullscreenRequired")}</p>
          {fsExitsLeft !== null && (
            <p className="font-bold text-red-600">{t("fullscreenExitsLeft")}: {fsExitsLeft}</p>
          )}
          <Button className="bg-brand" onClick={() => { enterFullscreen(); setFsWarning(false); }}>
            <LockKeyhole className="me-2 h-4 w-4" /> {t("returnFullscreen")}
          </Button>
        </DialogContent>
      </Dialog>

      {/* التعليمات أثناء الاختبار — نافذة داخلية لا تُخرج من ملء الشاشة */}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><HelpCircle className="h-5 w-5 text-brand" /> {t("keyRules")}</DialogTitle></DialogHeader>
          <ol className="list-decimal space-y-2 ps-5 text-sm leading-relaxed">
            {quickRules.map((r, i) => (
              <li key={i}>{fillVars(lang === "ar" ? r.ar : r.en, {
                duration: Math.round((state.data?.exam.durationSec ?? 0) / 60),
                exits: state.data?.exam.maxFullscreenExits === 0 ? "∞" : (state.data?.exam.maxFullscreenExits ?? "—"),
                snapshot: state.data?.exam.snapshotIntervalSec ?? "—",
              })}</li>
            ))}
          </ol>
          <Button className="bg-brand" onClick={() => setHelpOpen(false)}>{t("confirm")}</Button>
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
