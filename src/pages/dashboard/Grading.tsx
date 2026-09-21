import { useState } from "react";
import { Link } from "react-router";
import { useI18n } from "@/i18n";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClipboardCheck, Sparkles, BotMessageSquare, CheckCircle2, RefreshCw, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { MathText } from "@/components/MathText";

export default function Grading() {
  const { t, lang } = useI18n();
  const exams = trpc.exam.list.useQuery();
  const [examId, setExamId] = useState<number | undefined>();
  const queue = trpc.grading.queue.useQuery({ examId: examId! }, { enabled: !!examId });
  const summary = trpc.grading.examSummary.useQuery({ examId: examId! }, { enabled: !!examId, refetchInterval: 15000 });
  const utils = trpc.useUtils();
  const grade = trpc.grading.gradeAnswer.useMutation({
    onSuccess: () => { utils.grading.queue.invalidate(); toast.success(t("toastUpdated")); },
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

      {!examId && <Card><CardContent className="p-10 text-center text-muted-foreground">{t("selectExamFirst")}</CardContent></Card>}

      {/* ملخص التصحيح للاختبار + جدول الجلسات المسلَّمة */}
      {summary.data && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
              {[
                [t("registered"), summary.data.registered],
                [t("submitted"), summary.data.submitted],
                [t("activeNow"), summary.data.active],
                [t("totalQuestionsLabel"), summary.data.questions],
                [t("manualQuestionsLabel"), summary.data.manualQuestions],
                [t("pendingManualCount"), summary.data.pendingAnswers],
              ].map(([label, val], i) => (
                <div key={i} className="rounded-lg bg-secondary/50 p-2 text-center">
                  <p className="text-xl font-extrabold text-brand">{val}</p>
                  <p className="text-[11px] text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
            {summary.data.submitted === 0 && (
              <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">{t("gradingEmptyNoSubmissions")}</p>
            )}
            {summary.data.submitted > 0 && summary.data.manualQuestions === 0 && (
              <p className="rounded-lg border border-sky-300 bg-sky-50 p-3 text-sm text-sky-800">{t("gradingEmptyNoManual")}</p>
            )}
            {summary.data.sessions.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-secondary/40">
                    <tr>{[t("name"), t("status"), t("answered"), t("pendingManualCount"), t("finalScore"), t("actions")].map((h) => <th key={h} className="p-2 text-start font-semibold">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {summary.data.sessions.map((s) => (
                      <tr key={s.sessionId} className="border-b last:border-0 hover:bg-secondary/30">
                        <td className="p-2 font-medium">{s.candidateName} <span className="text-xs text-muted-foreground" dir="ltr">{s.candidateMaskedId}</span></td>
                        <td className="p-2"><Badge variant={s.status === "terminated" ? "destructive" : "secondary"}>{t(`sstatus_${s.status}` as "sstatus_active")}</Badge></td>
                        <td className="p-2">{s.answered} / {summary.data!.questions}</td>
                        <td className="p-2">{s.pending > 0 ? <Badge className="bg-amber-100 text-amber-700">{s.pending}</Badge> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}</td>
                        <td className="p-2">{s.percentage !== null ? <span className={s.passed ? "text-emerald-700" : "text-red-600"}>{s.totalScore} / {s.maxScore} ({s.percentage}%)</span> : "—"}{s.gradingStatus && <span className="ms-1 text-xs text-muted-foreground">· {t(`gstatus_${s.gradingStatus}` as "gstatus_pending")}</span>}</td>
                        <td className="p-2">
                          <Link to={`/dashboard/grading/${s.sessionId}`}>
                            <Button size="sm" variant="outline" className="h-7 border-brand text-xs text-brand"><ListChecks className="me-1 h-3.5 w-3.5" /> {t("fullGradingReview")}</Button>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {queue.data && queue.data.length > 0 && <h3 className="text-base font-bold text-brand">{t("manualAnswersQueue")} ({queue.data.length})</h3>}

      {queue.data?.map((item) => (
        <Card key={`${item.sessionId}-${item.examQuestionId}`} className="shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                {item.candidateName} <span className="text-xs text-muted-foreground" dir="ltr">{item.candidateMaskedId}</span>
                <Link to={`/dashboard/grading/${item.sessionId}`}>
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-brand"><ListChecks className="me-1 h-3.5 w-3.5" /> {t("fullGradingReview")}</Button>
                </Link>
              </CardTitle>
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
                <MathText as="p" className="text-sm font-medium" text={item.questionTextAr} />
              </div>
              <div className="rounded-lg border p-3">
                <p className="mb-1 text-xs font-bold text-muted-foreground">{t("candidateAnswer")}</p>
                {item.answerText
                  ? <MathText as="p" className="text-sm leading-relaxed" text={item.answerText} />
                  : !item.answerImageUrl && <span className="text-sm text-muted-foreground">—</span>}
                {/* إجابة على شكل صورة (المتطلب 1) */}
                {item.answerImageUrl && (
                  <a href={item.answerImageUrl} target="_blank" rel="noreferrer" className="mt-2 block">
                    <img src={item.answerImageUrl} alt="" className="max-h-80 w-full rounded-lg border bg-white object-contain" />
                    <span className="mt-1 block text-center text-xs text-brand underline">{t("view")}</span>
                  </a>
                )}
              </div>
              {item.modelAnswer && (
                <div className="rounded-lg border border-dashed p-3">
                  <p className="mb-1 text-xs font-bold text-muted-foreground">{t("modelAnswer")}</p>
                  <MathText as="p" className="text-sm text-muted-foreground" text={item.modelAnswer} />
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
