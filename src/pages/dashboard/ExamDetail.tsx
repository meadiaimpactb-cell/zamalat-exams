import { useState } from "react";
import { useParams, Link } from "react-router";
import { useI18n } from "@/i18n";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/providers/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowRight, ArrowLeft, Plus, Trash2, UserPlus, Clock, Play, Square, Trophy } from "lucide-react";
import { toast } from "sonner";

export default function ExamDetail() {
  const { id } = useParams<{ id: string }>();
  const examId = Number(id);
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const data = trpc.exam.get.useQuery({ id: examId });
  const banks = trpc.bank.listBanks.useQuery();
  const [bankId, setBankId] = useState<number | undefined>();
  const approvedQs = trpc.bank.listQuestions.useQuery({ bankId, status: "approved" });
  const experts = trpc.exam.listExperts.useQuery();

  const invalidate = () => utils.exam.get.invalidate({ id: examId });
  const setStatus = trpc.exam.setStatus.useMutation({ onSuccess: invalidate, onError: (e) => toast.error(e.message) });
  const addQuestion = trpc.exam.addQuestion.useMutation({ onSuccess: invalidate, onError: (e) => toast.error(e.message) });
  const removeQuestion = trpc.exam.removeQuestion.useMutation({ onSuccess: invalidate });
  const assignSup = trpc.exam.assignSupervisor.useMutation({ onSuccess: invalidate, onError: (e) => toast.error(e.message) });
  const removeSup = trpc.exam.removeSupervisor.useMutation({ onSuccess: invalidate });
  const registerByNid = trpc.exam.registerByNationalId.useMutation({
    onSuccess: () => { invalidate(); setNid(""); toast.success("✓"); },
    onError: (e) => toast.error(e.message),
  });
  const removeReg = trpc.exam.removeRegistration.useMutation({ onSuccess: invalidate });
  const extendReg = trpc.exam.extendRegistration.useMutation({ onSuccess: invalidate, onError: (e) => toast.error(e.message) });
  const publish = trpc.exam.publishResults.useMutation({ onSuccess: invalidate });

  const [nid, setNid] = useState("");
  const [extendMin, setExtendMin] = useState(10);
  const [addOpen, setAddOpen] = useState(false);

  if (data.isLoading) return <p>{t("loading")}</p>;
  if (data.error) return <Card><CardContent className="p-8 text-center text-destructive">{data.error.message}</CardContent></Card>;
  const d = data.data!;
  const exam = d.exam;
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const Back = lang === "ar" ? ArrowRight : ArrowLeft;
  const attachedIds = new Set(d.questions.map((q) => q.questionId));
  const totalPoints = d.questions.reduce((a, q) => a + q.points, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/dashboard/exams"><Button variant="ghost" size="icon"><Back className="h-5 w-5" /></Button></Link>
          <div>
            <h2 className="text-xl font-bold text-brand">{lang === "ar" ? exam.titleAr : exam.titleEn || exam.titleAr}</h2>
            <p className="text-sm text-muted-foreground">
              <span className="font-mono">{exam.code}</span> · {exam.durationMin} {t("minutes")} · {totalPoints} {t("points")} · {d.questions.length} {t("question")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {exam.status !== "open" ? (
            <Button className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => setStatus.mutate({ id: examId, status: "open" })}>
              <Play className="me-2 h-4 w-4" /> {t("openExam")}
            </Button>
          ) : (
            <Button variant="destructive" onClick={() => setStatus.mutate({ id: examId, status: "closed" })}>
              <Square className="me-2 h-4 w-4" /> {t("closeExam")}
            </Button>
          )}
          <Button
            variant={exam.resultsPublished ? "outline" : "default"}
            className={exam.resultsPublished ? "" : "bg-accent-brand text-white"}
            onClick={() => publish.mutate({ id: examId, published: !exam.resultsPublished })}
          >
            <Trophy className="me-2 h-4 w-4" />
            {exam.resultsPublished ? t("hideResults") : t("publishResults")}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="questions">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="questions">{t("addQuestions")} ({d.questions.length})</TabsTrigger>
          <TabsTrigger value="candidates">{t("registeredCandidates")} ({d.registrations.length})</TabsTrigger>
          <TabsTrigger value="supervisors">{t("supervisors")} ({d.supervisors.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="questions" className="mt-4 space-y-3">
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button className="bg-accent-brand text-white"><Plus className="me-2 h-4 w-4" /> {t("addQuestions")}</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
              <DialogHeader><DialogTitle>{t("addQuestions")} ({t("qstatus_approved")})</DialogTitle></DialogHeader>
              <select className="rounded-md border px-3 py-2" value={bankId ?? ""} onChange={(e) => setBankId(e.target.value ? +e.target.value : undefined)}>
                <option value="">{t("bank")} — {t("all")}</option>
                {banks.data?.map((b) => <option key={b.id} value={b.id}>{lang === "ar" ? b.nameAr : b.nameEn}</option>)}
              </select>
              <div className="space-y-2">
                {approvedQs.data?.filter((q) => !attachedIds.has(q.id)).map((q) => (
                  <div key={q.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{lang === "ar" ? q.textAr : q.textEn || q.textAr}</p>
                      <p className="text-xs text-muted-foreground">{t(`type_${q.type}` as "type_single")} · {q.points} {t("points")} · {q.competency}</p>
                    </div>
                    <Button size="sm" onClick={() => addQuestion.mutate({ examId, questionId: q.id })}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {approvedQs.data?.filter((q) => !attachedIds.has(q.id)).length === 0 && (
                  <p className="py-6 text-center text-sm text-muted-foreground">—</p>
                )}
              </div>
            </DialogContent>
          </Dialog>

          {d.questions.map((x, i) => (
            <Card key={x.id}>
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-medium">
                    <span className="me-2 text-muted-foreground">{i + 1}.</span>
                    {lang === "ar" ? x.question?.textAr : x.question?.textEn || x.question?.textAr}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {x.question ? t(`type_${x.question.type}` as "type_single") : ""} · {x.points} {t("points")}
                    {x.section ? ` · ${x.section}` : ""}
                  </p>
                </div>
                <Button variant="ghost" size="icon" className="text-destructive" onClick={() => removeQuestion.mutate({ examId, examQuestionId: x.id })}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="candidates" className="mt-4 space-y-3">
          <Card>
            <CardContent className="flex flex-wrap items-end gap-3 p-4">
              <div className="grid gap-1.5">
                <label className="text-sm font-medium">{t("registerCandidate")}</label>
                <Input dir="ltr" placeholder="10XXXXXXXX" value={nid} onChange={(e) => setNid(e.target.value)} className="w-56" />
              </div>
              <Button onClick={() => registerByNid.mutate({ examId, nationalId: nid })} disabled={!nid || registerByNid.isPending}>
                <UserPlus className="me-2 h-4 w-4" /> {t("add")}
              </Button>
            </CardContent>
          </Card>
          {d.registrations.map((r) => (
            <Card key={r.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-medium">{r.candidate?.nameAr}</p>
                  <p className="text-xs text-muted-foreground" dir="ltr">{r.candidate?.nationalIdMasked} · {r.status}{r.extraTimeMin > 0 ? ` · +${r.extraTimeMin} ${t("minutes")}` : ""}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Input type="number" className="w-20" value={extendMin} onChange={(e) => setExtendMin(+e.target.value)} min={1} />
                  <Button variant="outline" size="sm" onClick={() => extendReg.mutate({ registrationId: r.id, extraTimeMin: extendMin })}>
                    <Clock className="me-1 h-3.5 w-3.5" /> {t("extendTime")}
                  </Button>
                  <Button variant="ghost" size="icon" className="text-destructive" onClick={() => removeReg.mutate({ registrationId: r.id })}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="supervisors" className="mt-4 space-y-3">
          {isAdmin ? (
            <Card>
              <CardHeader><CardTitle className="text-base">{t("assignSupervisor")}</CardTitle></CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {experts.data?.filter((e) => !d.supervisors.some((s) => s.id === e.id)).map((e) => (
                  <Button key={e.id} variant="outline" onClick={() => assignSup.mutate({ examId, expertId: e.id })}>
                    <UserPlus className="me-2 h-4 w-4" /> {e.nameAr}
                  </Button>
                ))}
                {experts.data?.filter((e) => !d.supervisors.some((s) => s.id === e.id)).length === 0 && (
                  <p className="text-sm text-muted-foreground">—</p>
                )}
              </CardContent>
            </Card>
          ) : (
            <p className="rounded-lg bg-secondary p-3 text-sm text-muted-foreground">{t("noAccessExam")}</p>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            {d.supervisors.map((s) => (
              <Card key={s.id}>
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium">{s.nameAr}</p>
                    <p className="text-xs text-muted-foreground">{s.nameEn}</p>
                  </div>
                  {isAdmin && (
                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => removeSup.mutate({ examId, expertId: s.id })}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
      <div className="hidden"><Badge /></div>
    </div>
  );
}
