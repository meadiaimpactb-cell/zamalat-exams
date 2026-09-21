import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useI18n } from "@/i18n";
import { trpc } from "@/providers/trpc";
import { LanguageSwitcher, Logo } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { GraduationCap, Loader2, Trophy, BookOpen } from "lucide-react";
import { FEATURES } from "@contracts/features";

export default function ExamEntry() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [nid, setNid] = useState("");
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"enter" | "result">("enter");
  const access = trpc.candidate.access.useMutation();
  const myResult = trpc.candidate.myResult.useMutation();

  const onVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const res = await access.mutateAsync({ code: code.trim(), nationalId: nid.trim() });
      sessionStorage.setItem("exam_access", JSON.stringify({ code: code.trim().toUpperCase(), nationalId: nid.trim(), info: res }));
      navigate("/exam/prep");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onResult = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const res = await myResult.mutateAsync({ code: code.trim(), nationalId: nid.trim() });
      sessionStorage.setItem("exam_result", JSON.stringify(res));
      navigate("/exam/result");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center brand-gradient p-4">
      <div className="absolute end-4 top-4"><LanguageSwitcher variant="secondary" /></div>
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="items-center text-center">
          <Logo size="lg" />
          <CardTitle className="mt-4 flex items-center gap-2 text-2xl text-brand">
            {mode === "enter" ? <GraduationCap className="h-6 w-6" /> : <Trophy className="h-6 w-6" />}
            {mode === "enter" ? t("enterExam") : t("checkResult")}
          </CardTitle>
          <CardDescription>{t("examEntrySub")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={mode === "enter" ? onVerify : onResult} className="space-y-4">
            <div className="space-y-2">
              <Label>{t("examCode")}</Label>
              <Input dir="ltr" className="text-center font-mono uppercase" placeholder="EX-XXXXXX" value={code} onChange={(e) => setCode(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>{t("nationalId")}</Label>
              <Input dir="ltr" className="text-center font-mono" placeholder="10XXXXXXXX" value={nid} onChange={(e) => setNid(e.target.value)} required />
            </div>
            {error && <p className="rounded-lg bg-destructive/10 p-2 text-center text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full bg-brand hover:opacity-90" disabled={access.isPending || myResult.isPending}>
              {(access.isPending || myResult.isPending) && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              {mode === "enter" ? t("verify") : t("checkResult")}
            </Button>
            {/* الاستعلام عن النتيجة خلف مفتاح تهيئة (ملاحظة 3) — النتائج تُعلن عبر موقع الزمالة الرئيسي */}
            {FEATURES.candidateResultLookup && (
              <button type="button" className="w-full text-center text-sm text-brand underline" onClick={() => { setMode(mode === "enter" ? "result" : "enter"); setError(""); }}>
                {mode === "enter" ? t("checkResult") : t("enterExam")}
              </button>
            )}
            {/* دليل الطالب الكامل (طلب الإدارة) */}
            <Link to="/exam/guide" className="block">
              <Button type="button" variant="outline" className="w-full border-brand text-brand"><BookOpen className="me-2 h-4 w-4" /> {t("studentGuide")}</Button>
            </Link>
            <Link to="/" className="block text-center text-sm text-muted-foreground hover:text-brand">← {t("back")}</Link>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
