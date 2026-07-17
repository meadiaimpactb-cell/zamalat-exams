import { useState } from "react";
import { useI18n } from "@/i18n";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClipboardCheck, Sparkles, BotMessageSquare, CheckCircle2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export default function Grading() {
  const { t, lang } = useI18n();
  const exams = trpc.exam.list.useQuery();
  const [examId, setExamId] = useState<number | undefined>();
  const queue = trpc.grading.queue.useQuery({ examId: examId! }, { enabled: !!examId });
  const utils = trpc.useUtils();
  const grade = trpc.grading.gradeAnswer.useMutation({
    onSuccess: () => { utils.grading.queue.invalidate(); toast.success("✓"); },
    onError: (e) => toast.error(e.message),
  });
  const regen = trpc.grading.regenerateSuggestion.useMutation({
    onSuccess: () => utils.grading.queue.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  const [scores, setScores] = useState<Record<number, string>>({});
  const [comments, setComments] = useState<Record<number, string>>({});

  const aiLabel = (label: string | null, score: number | null) => {
    if (score === null) return null;
    const color = score >= 70 ? "bg-red-100 text-red-700" : score >= 40 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700";
    const text = label === "high_ai_likelihood"
      ? (lang === "ar" ? "احتمال عالٍ لاستخدام ذكاء اصطناعي" : "High AI likelihood")
      : label === "medium_ai_likelihood"
        ? (lang === "ar" ? "احتمال متوسط" : "Medium AI likelihood")
        : (lang === "ar" ? "كتابة بشرية على الأرجح" : "Likely human");
    return <Badge className={color}><BotMessageSquare className="me-1 h-3 w-3" />{score}% — {text}</Badge>;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-xl font-bold text-brand"><ClipboardCheck className="h-5 w-5" /> {t("gradingQueue")}</h2>
        <select className="rounded-md border bg-white px-3 py-2" value={examId ?? ""} onChange={(e) => setExamId(e.target.value ? +e.target.value : undefined)}>
          <option value="">{t("exams")}...</option>
          {exams.data?.map((x) => <option key={x.id} value={x.id}>{lang === "ar" ? x.titleAr : x.titleEn || x.titleAr}</option>)}
        </select>
      </div>

      {queue.data?.length === 0 && <Card><CardContent className="p-10 text-center text-muted-foreground">—</CardContent></Card>}

      {queue.data?.map((item) => (
        <Card key={`${item.sessionId}-${item.examQuestionId}`} className="shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">{item.candidateName} <span className="text-xs text-muted-foreground" dir="ltr">{item.candidateMaskedId}</span></CardTitle>
              <div className="flex items-center gap-2">
                {aiLabel(item.aiDetectionLabel, item.aiDetectionScore)}
                <Badge variant={item.status === "approved" || item.status === "modified" ? "default" : "secondary"}
                  className={item.status === "approved" || item.status === "modified" ? "bg-emerald-600" : ""}>
                  {item.status === "no_answer" ? t("noAnswer") : item.status}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <div className="rounded-lg bg-secondary/60 p-3">
                <p className="mb-1 text-xs font-bold text-muted-foreground">{t("questionText")} ({item.maxPoints} {t("points")})</p>
                <p className="text-sm font-medium">{item.questionTextAr}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="mb-1 text-xs font-bold text-muted-foreground">{t("candidateAnswer")}</p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{item.answerText || <span className="text-muted-foreground">—</span>}</p>
              </div>
              {item.modelAnswer && (
                <div className="rounded-lg border border-dashed p-3">
                  <p className="mb-1 text-xs font-bold text-muted-foreground">{t("modelAnswer")}</p>
                  <p className="text-sm text-muted-foreground">{item.modelAnswer}</p>
                </div>
              )}
            </div>
            <div className="space-y-3">
              {item.aiSuggestedScore !== null && (
                <div className="rounded-lg border border-violet-300 bg-violet-50 p-3">
                  <p className="mb-1 flex items-center gap-1 text-xs font-bold text-violet-700">
                    <Sparkles className="h-3.5 w-3.5" /> {t("aiSuggestion")}: {item.aiSuggestedScore} / {item.maxPoints}
                  </p>
                  <p className="whitespace-pre-wrap text-xs leading-relaxed text-violet-900/80">{item.aiFeedback}</p>
                  {item.status === "ai_suggested" && item.answerId && (
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" className="bg-violet-600 text-white"
                        onClick={() => grade.mutate({ answerId: item.answerId!, score: item.aiSuggestedScore!, approveAi: true })}>
                        <CheckCircle2 className="me-1 h-3.5 w-3.5" /> {t("approveAiScore")}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => regen.mutate({ answerId: item.answerId! })}>
                        <RefreshCw className="me-1 h-3.5 w-3.5" /> {t("regenerate")}
                      </Button>
                    </div>
                  )}
                </div>
              )}
              {item.answerId && item.status !== "no_answer" && (
                <div className="rounded-lg border p-3">
                  <p className="mb-2 text-xs font-bold text-muted-foreground">{t("modifyScore")}</p>
                  <div className="flex items-center gap-2">
                    <Input type="number" min={0} max={item.maxPoints} className="w-24"
                      placeholder={`0-${item.maxPoints}`}
                      value={scores[item.answerId] ?? (item.finalScore ?? "")}
                      onChange={(e) => setScores({ ...scores, [item.answerId!]: e.target.value })} />
                    <span className="text-sm text-muted-foreground">/ {item.maxPoints}</span>
                  </div>
                  <Textarea className="mt-2" rows={2} placeholder={t("graderComments")}
                    value={comments[item.answerId] ?? item.comments ?? ""}
                    onChange={(e) => setComments({ ...comments, [item.answerId!]: e.target.value })} />
                  <Button className="mt-2 bg-brand" size="sm"
                    onClick={() => grade.mutate({
                      answerId: item.answerId!,
                      score: Number(scores[item.answerId!] ?? item.finalScore ?? 0),
                      comments: comments[item.answerId!] || undefined,
                    })}>
                    {t("save")} {t("finalScore")}
                  </Button>
                  {item.finalScore !== null && (
                    <p className="mt-2 text-sm font-bold text-emerald-700">{t("finalScore")}: {item.finalScore} / {item.maxPoints}</p>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
