import { useState } from "react";
import { useI18n } from "@/i18n";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, CheckCircle2, PencilLine } from "lucide-react";
import { toast } from "sonner";

export default function Results() {
  const { t, lang } = useI18n();
  const exams = trpc.exam.list.useQuery();
  const [examId, setExamId] = useState<number | undefined>();
  const results = trpc.exam.examResults.useQuery({ id: examId! }, { enabled: !!examId });
  const utils = trpc.useUtils();
  const approve = trpc.grading.approveResult.useMutation({
    onSuccess: () => { utils.exam.examResults.invalidate(); toast.success("✓"); },
    onError: (e) => toast.error(e.message),
  });
  const adjust = trpc.grading.adjustResult.useMutation({
    onSuccess: () => { utils.exam.examResults.invalidate(); toast.success("✓"); },
    onError: (e) => toast.error(e.message),
  });
  const [adj, setAdj] = useState<Record<number, { score: string; reason: string }>>({});

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-xl font-bold text-brand"><Trophy className="h-5 w-5" /> {t("results")}</h2>
        <select className="rounded-md border bg-white px-3 py-2" value={examId ?? ""} onChange={(e) => setExamId(e.target.value ? +e.target.value : undefined)}>
          <option value="">{t("exams")}...</option>
          {exams.data?.map((x) => <option key={x.id} value={x.id}>{lang === "ar" ? x.titleAr : x.titleEn || x.titleAr}</option>)}
        </select>
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
                    {done ? (lang === "ar" ? `الحالة: ${done.status}` : `Status: ${done.status}`) : t("notStarted")}
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
                    <Badge variant="outline">{r.result.gradingStatus}</Badge>
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
                  <Badge variant="secondary">{done ? t("loading") : t("notStarted")}</Badge>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
