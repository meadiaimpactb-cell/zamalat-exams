import { useI18n } from "@/i18n";
import { Link } from "react-router";
import { Logo } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trophy, Download } from "lucide-react";

type ResultData = {
  examTitleAr: string; examTitleEn: string | null; candidateName: string;
  percentage: number; totalScore: number; maxScore: number; passed: boolean;
};

export default function ExamResult() {
  const { t, lang } = useI18n();
  const raw = sessionStorage.getItem("exam_result");
  const result: ResultData | null = raw ? JSON.parse(raw) : null;

  if (!result) {
    return (
      <div className="flex min-h-screen items-center justify-center brand-gradient p-4">
        <div className="rounded-2xl bg-white p-8 text-center shadow-xl">
          <p className="text-muted-foreground">—</p>
          <Link to="/exam"><Button className="mt-4 bg-brand">{t("back")}</Button></Link>
        </div>
      </div>
    );
  }

  const issuedAt = new Date().toLocaleString(lang === "ar" ? "ar-SA" : "en-US", { dateStyle: "long", timeStyle: "short" });

  return (
    <div className="result-page flex min-h-screen items-center justify-center brand-gradient p-4">
      {/* تنسيق الطباعة/التحميل: يُظهر البطاقة فقط بخلفية بيضاء */}
      <style>{`
        @media print {
          .result-page { background: #fff !important; min-height: auto !important; padding: 0 !important; }
          .no-print { display: none !important; }
          .result-card { box-shadow: none !important; border: 1px solid #e5e7eb; }
          body { background: #fff !important; }
        }
      `}</style>

      <div className="result-card w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-2xl">
        <div className="mb-4 flex justify-center"><Logo size="lg" /></div>
        <Trophy className={`mx-auto mb-4 h-14 w-14 ${result.passed ? "text-amber-500" : "text-slate-400"}`} />
        <h2 className="text-lg font-bold text-brand">{lang === "ar" ? result.examTitleAr : result.examTitleEn || result.examTitleAr}</h2>
        <p className="mt-1 text-muted-foreground">{result.candidateName}</p>
        <div className="my-6">
          <p className="text-6xl font-extrabold text-brand">{result.percentage}%</p>
          <p className="mt-1 text-muted-foreground">{result.totalScore} / {result.maxScore}</p>
        </div>
        <Badge className={`px-4 py-1.5 text-lg ${result.passed ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
          {result.passed ? t("passed") : t("failed")}
        </Badge>

        {/* تاريخ الإصدار — يظهر في النسخة المحمّلة */}
        <p className="mt-5 text-xs text-muted-foreground">{t("issuedAt")}: <span dir="ltr">{issuedAt}</span></p>

        <div className="no-print mt-6 flex justify-center gap-2">
          <Button className="bg-accent-brand text-white hover:opacity-90" onClick={() => window.print()}>
            <Download className="me-2 h-4 w-4" /> {t("downloadResult")}
          </Button>
          <Link to="/"><Button variant="outline">{t("back")}</Button></Link>
        </div>
      </div>
    </div>
  );
}
