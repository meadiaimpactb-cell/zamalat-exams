import { useEffect, useState } from "react";
import { useNavigate, Navigate } from "react-router";
import { useI18n } from "@/i18n";
import { trpc } from "@/providers/trpc";
import { Logo } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { MonitorCheck, Wifi, Camera, ScreenShare, Loader2, ShieldCheck } from "lucide-react";

type AccessInfo = {
  code: string;
  nationalId: string;
  info: {
    exam: {
      id: number; code: string; titleAr: string; titleEn: string | null;
      instructionsAr: string | null; instructionsEn: string | null;
      durationMin: number; lockdown: boolean; proctoring: boolean; cameraRequired: boolean;
    };
    candidate: { nameAr: string; nameEn: string | null; maskedId: string };
    extraTimeMin: number;
    resumeToken: string | null;
  };
};

export default function ExamPrep() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [access] = useState<AccessInfo | null>(() => {
    const raw = sessionStorage.getItem("exam_access");
    return raw ? JSON.parse(raw) : null;
  });
  const [consentPolicy, setConsentPolicy] = useState(false);
  const [consentProctoring, setConsentProctoring] = useState(false);
  const [checks, setChecks] = useState({ screen: false, browser: false, internet: false, camera: false });
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const start = trpc.candidate.start.useMutation();

  useEffect(() => {
    setChecks({
      screen: window.screen.width >= 1024,
      browser: true,
      internet: navigator.onLine,
      camera: false,
    });
    if (access?.info.exam.cameraRequired) {
      navigator.mediaDevices?.getUserMedia({ video: true })
        .then((s) => { s.getTracks().forEach((tr) => tr.stop()); setChecks((c) => ({ ...c, camera: true })); })
        .catch(() => setChecks((c) => ({ ...c, camera: false })));
    } else {
      setChecks((c) => ({ ...c, camera: true }));
    }
  }, [access]);

  if (!access) return <Navigate to="/exam" replace />;
  const { exam, candidate } = access.info;
  const allChecks = checks.screen && checks.browser && checks.internet && checks.camera;
  const canStart = consentPolicy && consentProctoring && allChecks;

  const onStart = async () => {
    setStarting(true);
    setError("");
    try {
      const res = await start.mutateAsync({
        code: access.code,
        nationalId: access.nationalId,
        consentPolicy,
        consentProctoring,
      });
      sessionStorage.setItem("exam_token", res.token);
      navigate("/exam/run");
    } catch (err) {
      setError((err as Error).message);
      setStarting(false);
    }
  };

  const checkItems = [
    { key: "screen", icon: ScreenShare, label: t("checkScreen"), ok: checks.screen, detail: `${window.screen.width}×${window.screen.height}` },
    { key: "browser", icon: MonitorCheck, label: t("checkBrowser"), ok: checks.browser, detail: navigator.userAgent.split(") ").pop() },
    { key: "internet", icon: Wifi, label: t("checkInternet"), ok: checks.internet },
    { key: "camera", icon: Camera, label: t("checkCamera"), ok: checks.camera },
  ];

  return (
    <div className="min-h-screen bg-background py-8">
      <div className="mx-auto max-w-3xl space-y-5 px-4">
        <div className="flex justify-center rounded-xl bg-white p-4 shadow-sm"><Logo size="lg" /></div>

        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-xl text-brand">{lang === "ar" ? exam.titleAr : exam.titleEn || exam.titleAr}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {candidate.nameAr} · <span dir="ltr">{candidate.maskedId}</span> · {exam.durationMin + access.info.extraTimeMin} {t("minutes")}
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="rounded-lg bg-secondary/50 p-4">
              <h3 className="mb-2 font-bold text-brand">{t("instructionsTitle")}</h3>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {lang === "ar" ? exam.instructionsAr : exam.instructionsEn || exam.instructionsAr}
              </p>
            </div>

            <div className="space-y-2">
              <h3 className="font-bold text-brand">{t("deviceCheck")}</h3>
              <div className="grid grid-cols-2 gap-2">
                {checkItems.map((c) => (
                  <div key={c.key} className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${c.ok ? "border-emerald-300 bg-emerald-50" : "border-red-300 bg-red-50"}`}>
                    <c.icon className={`h-4 w-4 ${c.ok ? "text-emerald-600" : "text-red-600"}`} />
                    <span>{c.label}</span>
                    <span className="ms-auto">{c.ok ? "✓" : "✗"}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3 rounded-lg border p-4">
              <label className="flex items-start gap-3 text-sm">
                <Checkbox checked={consentPolicy} onCheckedChange={(v) => setConsentPolicy(!!v)} className="mt-0.5" />
                {t("consentPolicy")}
              </label>
              <label className="flex items-start gap-3 text-sm">
                <Checkbox checked={consentProctoring} onCheckedChange={(v) => setConsentProctoring(!!v)} className="mt-0.5" />
                {t("consentProctoring")}
              </label>
            </div>

            {error && <p className="rounded-lg bg-destructive/10 p-2 text-center text-sm text-destructive">{error}</p>}

            <Button size="lg" className="w-full bg-accent-brand text-lg text-white hover:opacity-90" disabled={!canStart || starting} onClick={onStart}>
              {starting ? <Loader2 className="me-2 h-5 w-5 animate-spin" /> : <ShieldCheck className="me-2 h-5 w-5" />}
              {t("startExam")}
            </Button>
            {access.info.resumeToken && (
              <p className="text-center text-xs text-muted-foreground">↻ {lang === "ar" ? "لديك جلسة سابقة — سيتم استئنافها" : "You have an existing session — it will be resumed"}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
