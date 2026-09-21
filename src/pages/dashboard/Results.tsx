import { useState } from "react";
import { Link } from "react-router";
import { useI18n } from "@/i18n";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, CheckCircle2, PencilLine, FileSpreadsheet, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { exportResultsXlsx } from "@/lib/excel";

export default function Results() {
  const { t, lang } = useI18n();
  const exams = trpc.exam.list.useQuery();
  const [examId, setExamId] = useState<number | undefined>();
  const results = trpc.exam.examResults.useQuery({ id: examId! }, { enabled: !!examId });
  const utils = trpc.useUtils();
  const approve = trpc.grading.approveResult.useMutation({
    onSuccess: () => { utils.exam.examResults.invalidate(); toast.success(t("toastUpdated")); },
    onError: (e) => toast.error(e.message),
  });
  const adjust = trpc.grading.adjustResult.useMutation({
    onSuccess: () => { utils.exam.examResults.invalidate(); toast.success(t("toastUpdated")); },
    onError: (e) => toast.error(e.message),
  });
  const [adj, setAdj] = useState<Record<number, { score: string; reason: string }>>({});
  // تصدير Excel (ملاحظة 2)
  const [exporting, setExporting] = useState(false);
  const doExport = async () => {
    if (!examId) return;
    setExporting(true);
    try {
      const data = await utils.exam.exportResults.fetch({ id: examId });
      await exportResultsXlsx({
        exam: data.exam, objectiveMax: data.objectiveMax, essayMax: data.essayMax, rows: data.rows,
        labels: {
          nationalId: t("xlsNationalId"), name: t("xlsName"), fellowship: t("fellowship"), objective: t("xlsObjective"),
          essay: t("xlsEssay"), total: t("xlsTotal"), percentage: t("percentage"), result: t("xlsResult"),
          passed: t("passed"), failed: t("failed"), notAttempted: t("notStarted"), sheet: t("results"),
        },
      });
      toast.success(t("exportDone"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-xl font-bold text-brand"><Trophy className="h-5 w-5" /> {t("results")}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <select className="rounded-md border bg-white px-3 py-2" value={examId ?? ""} onChange={(e) => setExamId(e.target.value ? +e.target.value : undefined)}>
            <option value="">{t("exams")}...</option>
            {exams.data?.map((x) => <option key={x.id} value={x.id}>{lang === "ar" ? x.titleAr : x.titleEn || x.titleAr}</option>)}
          </select>
          {/* تصدير الدرجات إلى Excel (ملاحظة 2) */}
          <Button variant="outline" className="border-emerald-600 text-emerald-700 hover:bg-emerald-50" disabled={!examId || exporting} onClick={doExport}>
            <FileSpreadsheet className="me-2 h-4 w-4" /> {exporting ? t("loading") : t("exportExcel")}
          </Button>
        </div>
      </div>

      {results.data?.length === 0 && <Card><CardContent className="p-10 text-center text-muted-foreground">—</CardContent></Card>}

      <div className="space-y-3">
        {results.data?.map((r) => {
          const done = r.sessions.find((s) => s.status !== "active");
          return (
            <Card key={r.registration.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
                <div>
                  <p className="font-bold">{r.candidate?.nameAr}</p>
                  <p className="text-xs text-muted-foreground" dir="ltr">{r.candidate?.nationalIdMasked}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {done ? `${t("status")}: ${t(`sstatus_${done.status}` as "sstatus_active")}` : t("notStarted")}
                  </p>
                </div>
                {r.result ? (
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="text-center">
                      <p className="text-2xl font-extrabold text-brand">{r.result.percentage}%</p>
                      <p className="text-xs text-muted-foreground">{r.result.totalScore} / {r.result.maxScore}</p>
                    </div>
                    <Badge className={r.result.passed ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}>
                      {r.result.passed ? t("passed") : t("failed")}
                    </Badge>
                    <Badge variant="outline">{t(`gstatus_${r.result.gradingStatus}` as "gstatus_pending")}</Badge>
                    {done && (
                      <Link to={`/dashboard/grading/${done.id}`}>
                        <Button size="sm" variant="outline" className="border-brand text-brand"><ListChecks className="me-1 h-3.5 w-3.5" /> {t("fullGradingReview")}</Button>
                      </Link>
                    )}
                    {done && r.result.gradingStatus !== "completed" && (
                      <Button size="sm" className="bg-emerald-600 text-white" onClick={() => approve.mutate({ sessionId: done.id })}>
                        <CheckCircle2 className="me-1 h-3.5 w-3.5" /> {t("approveResult")}
                      </Button>
                    )}
                    {done && (
                      <div className="flex items-center gap-1">
                        <Input type="number" className="h-8 w-20" placeholder={t("finalScore")}
                          value={adj[done.id]?.score ?? ""}
                          onChange={(e) => setAdj({ ...adj, [done.id]: { score: e.target.value, reason: adj[done.id]?.reason ?? "" } })} />
                        <Input className="h-8 w-40" placeholder={t("adjustReason")}
                          value={adj[done.id]?.reason ?? ""}
                          onChange={(e) => setAdj({ ...adj, [done.id]: { score: adj[done.id]?.score ?? "", reason: e.target.value } })} />
                        <Button size="sm" variant="outline"
                          disabled={!adj[done.id]?.score || (adj[done.id]?.reason ?? "").length < 3}
                          onClick={() => adjust.mutate({ sessionId: done.id, newTotal: Number(adj[done.id].score), reason: adj[done.id].reason })}>
                          <PencilLine className="me-1 h-3.5 w-3.5" /> {t("adjustResult")}
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{done ? t("noResultYet") : t("notStarted")}</Badge>
                    {done && (
                      <Link to={`/dashboard/grading/${done.id}`}>
                        <Button size="sm" variant="outline" className="border-brand text-brand"><ListChecks className="me-1 h-3.5 w-3.5" /> {t("fullGradingReview")}</Button>
                      </Link>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
