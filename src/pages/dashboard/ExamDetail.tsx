import { useState, useEffect } from "react";
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
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowRight, ArrowLeft, Plus, Trash2, UserPlus, Clock, Play, Square, Trophy, Settings2, Eye, Layers, Shuffle, LockOpen } from "lucide-react";
import { toast } from "sonner";
import { useDeleteConfirm, useConfirm } from "@/providers/confirm";
import { Can } from "@/lib/permissions";
import { MathText } from "@/components/MathText";

export default function ExamDetail() {
  const { id } = useParams<{ id: string }>();
  const examId = Number(id);
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const askDelete = useDeleteConfirm();
  const confirm = useConfirm();
  const data = trpc.exam.get.useQuery({ id: examId });
  const banks = trpc.bank.listBanks.useQuery();
  const [bankId, setBankId] = useState<number | undefined>();
  const approvedQs = trpc.bank.listQuestions.useQuery({ bankId, status: "approved" });
  const experts = trpc.exam.listExperts.useQuery();

  const invalidate = () => utils.exam.get.invalidate({ id: examId });
  const setStatus = trpc.exam.setStatus.useMutation({ onSuccess: invalidate, onError: (e) => toast.error(e.message) });
  const addQuestion = trpc.exam.addQuestion.useMutation({ onSuccess: invalidate, onError: (e) => toast.error(e.message) });
  const removeQuestion = trpc.exam.removeQuestion.useMutation({ onSuccess: invalidate });
  const removeQuestions = trpc.exam.removeQuestions.useMutation({
    onSuccess: (r) => { invalidate(); setSelQ(new Set()); toast.success(`${t("toastDeleted")} (${r.removed})`); },
    onError: (e) => toast.error(e.message),
  });
  // تحديد متعدد لأسئلة الاختبار (حذف جماعي)
  const [selQ, setSelQ] = useState<Set<number>>(new Set());
  const toggleQ = (id: number) => setSelQ((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const assignSup = trpc.exam.assignSupervisor.useMutation({ onSuccess: invalidate, onError: (e) => toast.error(e.message) });
  const removeSup = trpc.exam.removeSupervisor.useMutation({ onSuccess: invalidate });
  const registerByNid = trpc.exam.registerByNationalId.useMutation({
    onSuccess: () => { invalidate(); setNid(""); toast.success(t("toastAdded")); },
    onError: (e) => toast.error(e.message),
  });
  const registerOrCreate = trpc.exam.registerOrCreateCandidate.useMutation({
    onSuccess: (r) => {
      invalidate(); setNid(""); setNewName("");
      toast.success(r.alreadyRegistered ? t("alreadyRegisteredMsg") : r.createdNew ? `✓ ${r.name}` : `✓ ${r.name}`);
    },
    onError: (e) => toast.error(e.message),
  });
  const removeReg = trpc.exam.removeRegistration.useMutation({ onSuccess: invalidate });
  const extendReg = trpc.exam.extendRegistration.useMutation({ onSuccess: invalidate, onError: (e) => toast.error(e.message) });
  // (ب) إعادة فتح الاختبار لطالب مقفَل (ملاحظة 6)
  const reopenReg = trpc.exam.reopenRegistration.useMutation({
    onSuccess: (r) => { invalidate(); toast.success(`${t("reopenDone")} — ${t("remaining")}: ${Math.floor(r.remainingSec / 60)} ${t("minutes")}`); },
    onError: (e) => toast.error(e.message),
  });
  const [reopenMin, setReopenMin] = useState(0);
  const publish = trpc.exam.publishResults.useMutation({ onSuccess: invalidate });
  const updateExam = trpc.exam.update.useMutation({ onSuccess: () => { invalidate(); toast.success(t("toastUpdated")); }, onError: (e) => toast.error(e.message) });
  const addBulk = trpc.exam.addQuestionsFromBank.useMutation({
    onSuccess: (r) => { invalidate(); toast.success(`${r.added} ${t("addedCount")}`); },
    onError: (e) => toast.error(e.message),
  });

  const [nid, setNid] = useState("");
  const [newName, setNewName] = useState("");
  const lookup = trpc.exam.lookupCandidate.useQuery({ query: nid.trim() }, { enabled: nid.trim().length >= 2 });
  const [extendMin, setExtendMin] = useState(10);
  const [addOpen, setAddOpen] = useState(false);
  const [randomCount, setRandomCount] = useState(10);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [settings, setSettings] = useState<null | {
    titleAr: string; titleEn: string; durationMin: number; passScore: number;
    instructionsAr: string; instructionsEn: string;
    shuffleQuestions: boolean; shuffleOptions: boolean; lockdown: boolean; proctoring: boolean;
    cameraRequired: boolean; snapshotIntervalSec: number; maxFullscreenExits: number;
  }>(null);

  // تهيئة نموذج الإعدادات من بيانات الاختبار
  useEffect(() => {
    if (data.data && !settings) {
      const e = data.data.exam;
      setSettings({
        titleAr: e.titleAr, titleEn: e.titleEn ?? "", durationMin: e.durationMin, passScore: e.passScore,
        instructionsAr: e.instructionsAr ?? "", instructionsEn: e.instructionsEn ?? "",
        shuffleQuestions: e.shuffleQuestions, shuffleOptions: e.shuffleOptions, lockdown: e.lockdown,
        proctoring: e.proctoring, cameraRequired: e.cameraRequired,
        snapshotIntervalSec: e.snapshotIntervalSec, maxFullscreenExits: e.maxFullscreenExits,
      });
    }
  }, [data.data, settings]);

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
            <Button variant="destructive" onClick={async () => { if (await confirm({ title: t("closeExam"), description: t("confirmActionDesc"), danger: true, confirmText: t("closeExam") })) setStatus.mutate({ id: examId, status: "closed" }); }}>
              <Square className="me-2 h-4 w-4" /> {t("closeExam")}
            </Button>
          )}
          <Can permission="results.publish">
            <Button
              variant={exam.resultsPublished ? "outline" : "default"}
              className={exam.resultsPublished ? "" : "bg-accent-brand text-white"}
              onClick={() => publish.mutate({ id: examId, published: !exam.resultsPublished })}
            >
              <Trophy className="me-2 h-4 w-4" />
              {exam.resultsPublished ? t("hideResults") : t("publishResults")}
            </Button>
          </Can>
        </div>
      </div>

      <Tabs defaultValue="questions">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="questions">{t("addQuestions")} ({d.questions.length})</TabsTrigger>
          <TabsTrigger value="candidates">{t("registeredCandidates")} ({d.registrations.length})</TabsTrigger>
          <TabsTrigger value="supervisors">{t("supervisors")} ({d.supervisors.length})</TabsTrigger>
          <TabsTrigger value="settings">{t("examSettings")}</TabsTrigger>
        </TabsList>

        <TabsContent value="questions" className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setPreviewOpen(true)}>
            <Eye className="me-2 h-4 w-4" /> {t("previewAsStudent")}
          </Button>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button className="bg-accent-brand text-white"><Plus className="me-2 h-4 w-4" /> {t("addQuestions")}</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
              <DialogHeader><DialogTitle>{t("addQuestions")} ({t("qstatus_approved")})</DialogTitle></DialogHeader>
              <select className="rounded-md border px-3 py-2" value={bankId ?? ""} onChange={(e) => setBankId(e.target.value ? +e.target.value : undefined)}>
                <option value="">{t("bank")} — {t("all")}</option>
                {banks.data?.map((b) => <option key={b.id} value={b.id}>{lang === "ar" ? b.nameAr : b.nameEn || b.nameAr}</option>)}
              </select>
              {/* سحب جماعي / عشوائي من البنك (المتطلب 9) */}
              <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-secondary/40 p-2">
                <Button size="sm" variant="outline" disabled={addBulk.isPending}
                  onClick={() => addBulk.mutate({ examId, bankId, mode: "all" })}>
                  <Layers className="me-1 h-4 w-4" /> {t("addAllApproved")}
                </Button>
                <div className="mx-1 h-5 w-px bg-border" />
                <Input type="number" min={1} className="h-8 w-20" value={randomCount} onChange={(e) => setRandomCount(+e.target.value)} />
                <Button size="sm" variant="outline" disabled={addBulk.isPending}
                  onClick={() => addBulk.mutate({ examId, bankId, mode: "random", count: randomCount })}>
                  <Shuffle className="me-1 h-4 w-4" /> {t("addRandom")}
                </Button>
              </div>
              <div className="space-y-2">
                {approvedQs.data?.filter((q) => !attachedIds.has(q.id)).map((q) => (
                  <div key={q.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                    <div className="min-w-0">
                      <MathText as="p" className="truncate text-sm font-medium" text={lang === "ar" ? q.textAr : q.textEn || q.textAr} />
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
          </div>

          {/* شريط التحديد المتعدد: تحديد الكل + حذف المحدد */}
          {d.questions.length > 0 && (
            <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-xl border bg-secondary/60 p-3 shadow-sm">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox"
                  checked={selQ.size > 0 && d.questions.every((x) => selQ.has(x.id))}
                  onChange={(e) => setSelQ(e.target.checked ? new Set(d.questions.map((x) => x.id)) : new Set())} />
                {t("selectAll")} ({d.questions.length})
              </label>
              {selQ.size > 0 && (
                <>
                  <span className="rounded-full bg-brand px-2 py-0.5 text-xs text-white">{selQ.size} {t("selectedCount")}</span>
                  <Button size="sm" variant="destructive" disabled={removeQuestions.isPending}
                    onClick={() => askDelete(() => removeQuestions.mutate({ examId, examQuestionIds: [...selQ] }), { description: `${t("removeFromExamDesc")} (${selQ.size})` })}>
                    <Trash2 className="me-1 h-4 w-4" /> {t("removeFromExam")} ({selQ.size})
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSelQ(new Set())}>{t("clearSelection")}</Button>
                </>
              )}
              <span className="ms-auto text-xs text-muted-foreground">{totalPoints} {t("points")}</span>
            </div>
          )}

          {d.questions.map((x, i) => (
            <Card key={x.id} className={selQ.has(x.id) ? "ring-2 ring-brand" : ""}>
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div className="flex min-w-0 items-start gap-3">
                  <input type="checkbox" className="mt-1.5 h-4 w-4 shrink-0" checked={selQ.has(x.id)} onChange={() => toggleQ(x.id)} />
                  <div className="min-w-0">
                  <p className="font-medium">
                    <span className="me-2 text-muted-foreground">{i + 1}.</span>
                    <MathText text={lang === "ar" ? x.question?.textAr : x.question?.textEn || x.question?.textAr} />
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {x.question ? t(`type_${x.question.type}` as "type_single") : ""} · {x.points} {t("points")}
                    {x.section ? ` · ${x.section}` : ""}
                  </p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="text-destructive" onClick={() => askDelete(() => removeQuestion.mutate({ examId, examQuestionId: x.id }))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="candidates" className="mt-4 space-y-3">
          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="grid gap-1.5">
                <label className="text-sm font-medium">{t("registerCandidate")}</label>
                <div className="relative">
                  <Input dir="ltr" placeholder={t("typeIdOrName")} value={nid} onChange={(e) => setNid(e.target.value)} className="w-full max-w-md" />
                  {/* اقتراحات فورية أثناء الكتابة */}
                  {nid.trim().length >= 2 && !lookup.data?.exact && (lookup.data?.matches.length ?? 0) > 0 && (
                    <div className="absolute z-20 mt-1 w-full max-w-md rounded-lg border bg-white shadow-lg">
                      {lookup.data!.matches.map((m) => (
                        <button key={m.id} type="button" className="flex w-full items-center justify-between gap-2 border-b px-3 py-2 text-start text-sm last:border-0 hover:bg-secondary"
                          onClick={() => setNid(m.nationalId)}>
                          <span className="font-medium">{m.nameAr}</span>
                          <span className="font-mono text-xs text-muted-foreground" dir="ltr">{m.nationalId}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* الحالة: مسجّل → تأكيد الاسم | غير مسجّل → إضافة سريعة */}
              {nid.trim().length >= 5 && lookup.data?.exact && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-300 bg-emerald-50 p-3">
                  <div className="text-sm">
                    <span className="text-emerald-700">✓ {t("personFound")}</span>
                    <p className="font-bold">{lookup.data.exact.nameAr}
                      <span className="ms-2 font-normal text-muted-foreground">{lookup.data.exact.fellowship ?? ""} {lookup.data.exact.cohort ?? ""}</span>
                    </p>
                  </div>
                  <Button className="bg-emerald-600 text-white hover:bg-emerald-700"
                    onClick={() => registerByNid.mutate({ examId, nationalId: nid.trim() })} disabled={registerByNid.isPending}>
                    <UserPlus className="me-2 h-4 w-4" /> {t("registerConfirm")}
                  </Button>
                </div>
              )}

              {nid.trim().length >= 5 && lookup.isFetched && !lookup.data?.exact && (
                <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
                  <p className="text-sm text-amber-700">⚠️ {t("personNotFound")}</p>
                  <div className="flex flex-wrap items-end gap-2">
                    <Input className="w-64" placeholder={t("nameOptionalNow")} value={newName} onChange={(e) => setNewName(e.target.value)} />
                    <Button className="bg-accent-brand text-white"
                      onClick={() => registerOrCreate.mutate({ examId, nationalId: nid.trim(), nameAr: newName || undefined })}
                      disabled={registerOrCreate.isPending}>
                      <UserPlus className="me-2 h-4 w-4" /> {t("addAndRegister")}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          {d.registrations.map((r) => (
            <Card key={r.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-medium">{r.candidate?.nameAr}</p>
                  <p className="text-xs text-muted-foreground"><span dir="ltr">{r.candidate?.nationalIdMasked}</span> · {t(`rstatus_${r.status}` as "rstatus_invited")}</p>
                  {/* المدة الفعلية للطالب = مدة الاختبار + التمديد الخاص به */}
                  <p className="mt-1 text-xs">
                    <span className="rounded bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">{t("effectiveDuration")}: {exam.durationMin + r.extraTimeMin} {t("minutes")}</span>
                    <span className="ms-1 text-muted-foreground">({exam.durationMin}{r.extraTimeMin > 0 ? ` + ${r.extraTimeMin} ${t("extraLabel")}` : ""})</span>
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {/* (أ) تمديد الوقت: دقائق تُضاف فوق مدة الاختبار لهذا الطالب فقط */}
                  <label className="flex items-center gap-1 rounded-lg border px-2 py-1 text-xs text-muted-foreground" title={t("extendTimeHint")}>
                    <span>{t("extraMinutesLabel")}</span>
                    <Input type="number" className="h-7 w-16" value={extendMin} onChange={(e) => setExtendMin(+e.target.value)} min={1} max={300} />
                    <Button variant="outline" size="sm" className="h-7" onClick={() => extendReg.mutate({ registrationId: r.id, extraTimeMin: extendMin })}>
                      <Clock className="me-1 h-3.5 w-3.5" /> {t("extendTime")}
                    </Button>
                  </label>
                  {/* (ب) إعادة فتح الاختبار للطالب المقفَل مع الإبقاء على إجاباته (ملاحظة 6) */}
                  {r.status === "terminated" && (
                    <div className="flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 p-1">
                      <Input type="number" className="h-8 w-16" min={0} max={300} value={reopenMin} onChange={(e) => setReopenMin(+e.target.value)} title={t("reopenExtraMinutes")} />
                      <Button size="sm" className="bg-amber-600 text-white hover:bg-amber-700" disabled={reopenReg.isPending}
                        onClick={async () => { if (await confirm({ title: t("reopenExam"), description: `${t("reopenConfirmDesc")} (${r.candidate?.nameAr ?? ""})`, confirmText: t("reopenExam") })) reopenReg.mutate({ registrationId: r.id, extraMinutes: reopenMin }); }}>
                        <LockOpen className="me-1 h-3.5 w-3.5" /> {t("reopenExam")}
                      </Button>
                    </div>
                  )}
                  <Button variant="ghost" size="icon" className="text-destructive" onClick={() => askDelete(() => removeReg.mutate({ registrationId: r.id }), { description: `${t("confirmDeleteDesc")} (${r.candidate?.nameAr ?? ""})` })}>
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
                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => askDelete(() => removeSup.mutate({ examId, expertId: s.id }))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* تعديل إعدادات الاختبار بعد الإنشاء */}
        <TabsContent value="settings" className="mt-4">
          {settings && (
            <Card>
              <CardContent className="space-y-4 p-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label>{t("examTitle")}</Label>
                    <Input value={settings.titleAr} onChange={(e) => setSettings({ ...settings, titleAr: e.target.value })} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>{t("examTitleEn")}</Label>
                    <Input dir="ltr" value={settings.titleEn} onChange={(e) => setSettings({ ...settings, titleEn: e.target.value })} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>{t("duration")}</Label>
                    <Input type="number" min={1} max={600} value={settings.durationMin} onChange={(e) => setSettings({ ...settings, durationMin: +e.target.value })} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>{t("passScore")}</Label>
                    <Input type="number" min={0} max={100} value={settings.passScore} onChange={(e) => setSettings({ ...settings, passScore: +e.target.value })} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>{t("snapshotInterval")}</Label>
                    <Input type="number" min={10} max={600} value={settings.snapshotIntervalSec} onChange={(e) => setSettings({ ...settings, snapshotIntervalSec: +e.target.value })} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>{t("maxFullscreenExits")}</Label>
                    <Input type="number" min={0} max={20} value={settings.maxFullscreenExits} onChange={(e) => setSettings({ ...settings, maxFullscreenExits: +e.target.value })} />
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label>{t("instructions")} (عربي)</Label>
                  <Textarea rows={3} value={settings.instructionsAr} onChange={(e) => setSettings({ ...settings, instructionsAr: e.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label>{t("instructions")} (English)</Label>
                  <Textarea dir="ltr" rows={3} value={settings.instructionsEn} onChange={(e) => setSettings({ ...settings, instructionsEn: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                  {([
                    ["shuffleQuestions", t("shuffleQuestions")],
                    ["shuffleOptions", t("shuffleOptions")],
                    ["lockdown", t("lockdownMode")],
                    ["proctoring", t("proctoringMode")],
                    ["cameraRequired", t("cameraRequired")],
                  ] as const).map(([key, label]) => (
                    <div key={key} className="flex items-center justify-between rounded-lg border p-3">
                      <Label className="text-sm">{label}</Label>
                      <Switch checked={settings[key]} onCheckedChange={(v) => setSettings({ ...settings, [key]: v })} />
                    </div>
                  ))}
                </div>
                <Button className="bg-brand" disabled={updateExam.isPending}
                  onClick={() => updateExam.mutate({ id: examId, ...settings })}>
                  <Settings2 className="me-2 h-4 w-4" /> {t("saveSettings")}
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* معاينة كطالب (المتطلب 6) */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Eye className="h-5 w-5" /> {t("examPreviewTitle")}</DialogTitle></DialogHeader>
          {d.questions.length === 0 && <p className="py-8 text-center text-muted-foreground">{t("previewNoQuestions")}</p>}
          <div className="space-y-4">
            {d.questions.map((x, i) => {
              const q = x.question;
              if (!q) return null;
              const correct = q.correctAnswer;
              const isCorrect = (oid: string) => Array.isArray(correct) ? correct.includes(oid) : String(correct) === oid;
              return (
                <div key={x.id} className="rounded-xl border p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{t("question")} {i + 1} {t("of")} {d.questions.length}</span>
                    <Badge className="bg-secondary text-secondary-foreground">{x.points} {t("points")}</Badge>
                  </div>
                  <MathText as="p" className="mb-3 font-medium leading-relaxed" text={lang === "ar" ? q.textAr : q.textEn || q.textAr} />
                  {q.imageUrl && <img src={q.imageUrl} alt="" className="mb-3 max-h-72 rounded-lg border bg-white object-contain" />}
                  {(q.type === "single" || q.type === "multiple" || q.type === "truefalse") && (
                    <div className="space-y-2">
                      {(q.options ?? []).map((o) => (
                        <div key={o.id} className={`flex items-center gap-3 rounded-lg border-2 p-3 text-sm ${isCorrect(o.id) ? "border-emerald-400 bg-emerald-50" : ""}`}>
                          <span className={`flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs ${q.type === "multiple" ? "rounded" : "rounded-full"} ${isCorrect(o.id) ? "border-emerald-500 bg-emerald-500 text-white" : "border-muted-foreground/40"}`}>{o.id}</span>
                          <MathText text={lang === "ar" ? o.textAr : o.textEn || o.textAr} />
                          {isCorrect(o.id) && <span className="ms-auto text-xs text-emerald-600">✓</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  {q.type === "essay" && <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{t("typeYourAnswer")}</div>}
                  {(q.type === "short" || q.type === "numeric") && <div className="rounded-lg border p-2 text-sm text-muted-foreground">{t("typeYourAnswer")}</div>}
                  {q.allowImageAnswer && <p className="mt-2 text-xs text-muted-foreground">🖼️ {t("imageAnswerHint")}</p>}
                  {(q.type === "short" || q.type === "numeric" || q.type === "essay") && (correct != null && String(correct).length > 0 || q.modelAnswer) && (
                    <p className="mt-2 rounded bg-emerald-50 p-2 text-xs text-emerald-700">{t("correctMarked")}: <MathText text={Array.isArray(correct) ? correct.join(", ") : String(correct ?? q.modelAnswer ?? "")} /></p>
                  )}
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <div className="hidden"><Badge /></div>
    </div>
  );
}
