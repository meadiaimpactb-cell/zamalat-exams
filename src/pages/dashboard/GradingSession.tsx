import { useState } from "react";
import { useParams, Link } from "react-router";
import { useI18n } from "@/i18n";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MathText } from "@/components/MathText";
import { RiskBadge } from "@/components/shared";
import { ArrowRight, ArrowLeft, CheckCircle2, XCircle, Save, Printer, ClipboardCheck, Sparkles, MinusCircle, Clock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * شاشة التصحيح الكاملة لطالب (ملاحظتا 7 و11): كل سؤال بترتيب عرضه للطالب، إجابته، الإجابة الصحيحة،
 * صحة الإجابة، الدرجة، وإمكانية تعيين/تعديل الدرجة يدويًا سؤالًا بسؤال (صحيح = كامل الدرجة، خطأ = صفر، أو قيمة).
 * كل تعديل يُعاد بعده احتساب النتيجة الإجمالية فورًا ويُسجَّل في سجل التدقيق.
 */
export default function GradingSession() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const sid = Number(sessionId);
  const { t, lang } = useI18n();
  const utils = trpc.useUtils();
  const review = trpc.grading.sessionReview.useQuery({ sessionId: sid }, { enabled: !!sid });
  const grade = trpc.grading.gradeQuestion.useMutation({
    onSuccess: (r) => {
      utils.grading.sessionReview.invalidate({ sessionId: sid });
      utils.exam.examResults.invalidate();
      toast.success(`${t("toastUpdated")} — ${t("xlsTotal")}: ${r.totalScore} (${r.percentage}%)`);
    },
    onError: (e) => toast.error(e.message),
  });
  const approve = trpc.grading.approveResult.useMutation({
    onSuccess: () => { utils.grading.sessionReview.invalidate({ sessionId: sid }); utils.exam.examResults.invalidate(); toast.success(t("toastUpdated")); },
    onError: (e) => toast.error(e.message),
  });
  const [scores, setScores] = useState<Record<number, string>>({});
  const [comments, setComments] = useState<Record<number, string>>({});

  if (review.isLoading) return <p>{t("loading")}</p>;
  if (review.error) return <Card><CardContent className="p-8 text-center text-destructive">{review.error.message}</CardContent></Card>;
  const d = review.data!;
  const Back = lang === "ar" ? ArrowRight : ArrowLeft;
  const answered = d.items.filter((i) => i.hasAnswer).length;
  const pending = d.items.filter((i) => i.verdict === "pending").length;

  const verdictBadge = (v: string) => {
    const map: Record<string, [string, string]> = {
      correct: ["bg-emerald-100 text-emerald-700", t("verdict_correct")],
      partial: ["bg-amber-100 text-amber-700", t("verdict_partial")],
      wrong: ["bg-red-100 text-red-700", t("verdict_wrong")],
      pending: ["bg-slate-100 text-slate-600", t("verdict_pending")],
    };
    const [cls, label] = map[v] ?? map.pending;
    return <Badge className={cls}>{label}</Badge>;
  };

  const submitScore = (examQuestionId: number, value: number) => {
    grade.mutate({ sessionId: sid, examQuestionId, score: value, comments: comments[examQuestionId] || undefined });
  };

  return (
    <div className="space-y-5 print:space-y-3">
      <style>{`@media print { .no-print { display: none !important; } .print-card { break-inside: avoid; box-shadow: none !important; } }`}</style>
      {/* رأس الصفحة */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/dashboard/results" className="no-print"><Button variant="ghost" size="icon"><Back className="h-5 w-5" /></Button></Link>
          <div>
            <h2 className="flex items-center gap-2 text-xl font-bold text-brand"><ClipboardCheck className="h-5 w-5" /> {t("fullGradingReview")}</h2>
            <p className="text-sm text-muted-foreground">
              {lang === "ar" ? d.exam.titleAr : d.exam.titleEn || d.exam.titleAr} · <span className="font-mono">{d.exam.code}</span>
            </p>
          </div>
        </div>
        <div className="no-print flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => window.print()}><Printer className="me-2 h-4 w-4" /> {t("printReport")}</Button>
          {d.result && d.result.gradingStatus !== "completed" && (
            <Button className="bg-emerald-600 text-white" disabled={approve.isPending || pending > 0} title={pending > 0 ? t("pendingBeforeApprove") : ""}
              onClick={() => approve.mutate({ sessionId: sid })}>
              <CheckCircle2 className="me-2 h-4 w-4" /> {t("approveResult")}
            </Button>
          )}
        </div>
      </div>

      {/* ملخص الطالب والنتيجة */}
      <Card className="print-card">
        <CardContent className="grid gap-4 p-5 md:grid-cols-[1fr_auto]">
          <div className="space-y-1 text-sm">
            <p className="text-lg font-bold">{d.candidate.nameAr} <span className="font-mono text-xs text-muted-foreground" dir="ltr">{d.candidate.maskedId}</span></p>
            {d.candidate.fellowship && <p className="text-muted-foreground">{t("fellowship")}: {d.candidate.fellowship}</p>}
            <p className="text-muted-foreground">
              {t("status")}: {t(`sstatus_${d.session.status}` as "sstatus_active")}
              {d.session.submittedAt ? ` · ${new Date(d.session.submittedAt).toLocaleString(lang === "ar" ? "ar-SA" : "en-US")}` : ""}
              {d.session.reopenCount > 0 ? ` · ${t("reopenedTimes")}: ${d.session.reopenCount}` : ""}
            </p>
            <p className="flex items-center gap-2 text-muted-foreground">
              {t("answered")}: {answered} / {d.items.length}
              <span className="flex items-center gap-1">· {t("riskScore")}: <RiskBadge score={d.session.riskScore} /></span>
            </p>
          </div>
          <div className="flex items-center gap-4 rounded-xl border bg-secondary/40 p-4">
            {d.result ? (
              <>
                <div className="text-center">
                  <p className="text-3xl font-extrabold text-brand">{d.result.percentage}%</p>
                  <p className="text-xs text-muted-foreground">{d.result.totalScore} / {d.result.maxScore}</p>
                </div>
                <div className="space-y-1">
                  <Badge className={d.result.passed ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}>{d.result.passed ? t("passed") : t("failed")}</Badge>
                  <br />
                  <Badge variant="outline">{t(`gstatus_${d.result.gradingStatus}` as "gstatus_pending")}</Badge>
                  {pending > 0 && <p className="text-xs text-amber-700">{t("pendingManualCount")}: {pending}</p>}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{t("noResultYet")} — {t("gradeToCreateResult")}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* الأسئلة */}
      {d.items.map((item, idx) => {
        const correct = item.correctAnswer;
        const isCorrectOpt = (oid: string) => Array.isArray(correct) ? correct.includes(oid) : String(correct) === oid;
        const chosen = (oid: string) => Array.isArray(item.answer) ? item.answer.includes(oid) : String(item.answer) === oid;
        const scoreVal = scores[item.examQuestionId] ?? (item.score !== null ? String(item.score) : "");
        return (
          <Card key={item.examQuestionId} className={cn("print-card shadow-sm", item.verdict === "pending" && "border-amber-300")}>
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-sm font-bold text-brand">{t("question")} {idx + 1}</span>
                  <Badge variant="outline">{t(`type_${item.type}` as "type_single")}</Badge>
                  <Badge variant="outline">{item.points} {t("points")}</Badge>
                  {item.section && <Badge variant="outline">{item.section}</Badge>}
                  {item.isManual && <Badge className="bg-violet-100 text-violet-700">{t("manualGrading")}</Badge>}
                </div>
                <div className="flex items-center gap-2">
                  {verdictBadge(item.verdict)}
                  <span className="text-sm font-bold">{item.score !== null ? item.score : "—"} / {item.points}</span>
                </div>
              </div>

              <MathText as="p" className="font-medium leading-relaxed" text={lang === "ar" ? item.textAr : item.textEn || item.textAr} />
              {item.imageUrl && <img src={item.imageUrl} alt="" className="max-h-64 rounded-lg border bg-white object-contain" />}

              {/* الخيارات: إجابة الطالب مقابل الصحيحة */}
              {(item.type === "single" || item.type === "multiple" || item.type === "truefalse") && (
                <div className="space-y-1.5">
                  {item.options.map((o) => {
                    const c = isCorrectOpt(o.id), s = chosen(o.id);
                    return (
                      <div key={o.id} className={cn("flex items-center gap-3 rounded-lg border-2 p-2.5 text-sm",
                        c && s ? "border-emerald-500 bg-emerald-50" : c ? "border-emerald-300 border-dashed bg-emerald-50/40" : s ? "border-red-400 bg-red-50" : "border-transparent bg-secondary/30")}>
                        <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs",
                          c ? "border-emerald-500 bg-emerald-500 text-white" : s ? "border-red-400 bg-red-400 text-white" : "border-muted-foreground/40")}>{o.id}</span>
                        <MathText text={lang === "ar" ? o.textAr : o.textEn || o.textAr} />
                        <span className="ms-auto flex items-center gap-1 text-xs">
                          {s && <Badge variant="outline" className={c ? "text-emerald-700" : "text-red-600"}>{t("candidateAnswer")}</Badge>}
                          {c && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                          {s && !c && <XCircle className="h-4 w-4 text-red-500" />}
                        </span>
                      </div>
                    );
                  })}
                  {!item.hasAnswer && <p className="text-xs text-muted-foreground">{t("noAnswer")}</p>}
                </div>
              )}

              {(item.type === "short" || item.type === "numeric") && (
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="rounded-lg border p-3 text-sm">
                    <p className="mb-1 text-xs font-bold text-muted-foreground">{t("candidateAnswer")}</p>
                    {item.hasAnswer ? <MathText text={String(item.answer ?? "")} /> : <span className="text-muted-foreground">{t("noAnswer")}</span>}
                  </div>
                  <div className="rounded-lg bg-emerald-50 p-3 text-sm">
                    <p className="mb-1 text-xs font-bold text-emerald-700">{t("correctAnswer")}</p>
                    <MathText text={String(correct ?? "")} />
                  </div>
                </div>
              )}

              {(item.type === "essay" || item.answerImageUrl) && (
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="rounded-lg border p-3 text-sm">
                    <p className="mb-1 text-xs font-bold text-muted-foreground">{t("candidateAnswer")}</p>
                    {item.answerText ? <MathText as="p" className="leading-relaxed" text={item.answerText} /> : !item.answerImageUrl && <span className="text-muted-foreground">{t("noAnswer")}</span>}
                    {item.answerImageUrl && <img src={item.answerImageUrl} alt="" className="mt-2 max-h-72 w-full rounded-lg border bg-white object-contain" />}
                    {item.aiDetectionScore !== null && <p className="mt-2 text-[11px] text-muted-foreground">{t("aiDetector")}: {item.aiDetectionScore}%</p>}
                  </div>
                  <div className="space-y-2">
                    {item.modelAnswer && (
                      <div className="rounded-lg border border-dashed p-3 text-sm">
                        <p className="mb-1 text-xs font-bold text-muted-foreground">{t("modelAnswer")}</p>
                        <MathText as="p" className="text-muted-foreground" text={item.modelAnswer} />
                      </div>
                    )}
                    {item.aiSuggestedScore !== null && (
                      <div className="rounded-lg border border-violet-300 bg-violet-50 p-3 text-xs">
                        <p className="flex items-center gap-1 font-bold text-violet-700"><Sparkles className="h-3.5 w-3.5" /> {t("aiSuggestion")}: {item.aiSuggestedScore} / {item.points}</p>
                        {item.aiFeedback && <p className="mt-1 whitespace-pre-wrap text-violet-900/80">{item.aiFeedback}</p>}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {item.explanation && (
                <div className="rounded-lg border border-sky-200 bg-sky-50 p-2 text-xs">
                  <span className="font-bold text-sky-700">{t("explanationLabel")}: </span><MathText text={item.explanation} />
                </div>
              )}

              {/* تعيين/تعديل الدرجة يدويًا (ملاحظة 11) */}
              {d.session.status !== "active" && (
                <div className="no-print flex flex-wrap items-end gap-2 rounded-lg bg-secondary/40 p-3">
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="outline" className="border-emerald-500 text-emerald-700" disabled={grade.isPending}
                      onClick={() => submitScore(item.examQuestionId, item.points)}>
                      <CheckCircle2 className="me-1 h-3.5 w-3.5" /> {t("markCorrectFull")}
                    </Button>
                    <Button size="sm" variant="outline" className="border-red-400 text-red-600" disabled={grade.isPending}
                      onClick={() => submitScore(item.examQuestionId, 0)}>
                      <MinusCircle className="me-1 h-3.5 w-3.5" /> {t("markWrongZero")}
                    </Button>
                  </div>
                  <div className="mx-1 h-6 w-px bg-border" />
                  <div className="flex items-center gap-1">
                    <Input type="number" min={0} max={item.points} step="0.5" className="h-8 w-20" placeholder={`0-${item.points}`}
                      value={scoreVal} onChange={(e) => setScores({ ...scores, [item.examQuestionId]: e.target.value })} />
                    <span className="text-xs text-muted-foreground">/ {item.points}</span>
                  </div>
                  <Textarea rows={1} className="h-8 min-h-8 flex-1 py-1 text-xs" placeholder={t("graderComments")}
                    value={comments[item.examQuestionId] ?? item.comments ?? ""}
                    onChange={(e) => setComments({ ...comments, [item.examQuestionId]: e.target.value })} />
                  <Button size="sm" className="bg-brand" disabled={grade.isPending || scoreVal === ""}
                    onClick={() => submitScore(item.examQuestionId, Number(scoreVal))}>
                    <Save className="me-1 h-3.5 w-3.5" /> {t("save")}
                  </Button>
                  {item.gradedAt && <span className="flex items-center gap-1 text-[11px] text-muted-foreground"><Clock className="h-3 w-3" /> {new Date(item.gradedAt).toLocaleString(lang === "ar" ? "ar-SA" : "en-US")}</span>}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
      {d.items.length === 0 && <Card><CardContent className="p-10 text-center text-muted-foreground">—</CardContent></Card>}
    </div>
  );
}
