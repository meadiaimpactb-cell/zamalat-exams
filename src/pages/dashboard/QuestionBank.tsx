import { useState } from "react";
import { useI18n } from "@/i18n";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/providers/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Database, Upload, CheckCircle2, XCircle, Send, Sparkles, Trash2, Pencil, Eye, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useDeleteConfirm } from "@/providers/confirm";
import { MathText } from "@/components/MathText";
import { MathToolbar } from "@/components/MathToolbar";
import { hasMath } from "@/lib/mathText";
import { SmartImportDialog } from "@/components/SmartImportDialog";

const TYPE_KEYS = ["single", "multiple", "truefalse", "short", "essay", "numeric"] as const;
type QType = (typeof TYPE_KEYS)[number];

export default function QuestionBank() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const banks = trpc.bank.listBanks.useQuery();
  const fellowships = trpc.admin.listFellowships.useQuery();
  const askDelete = useDeleteConfirm();
  const [bankId, setBankId] = useState<number | undefined>();
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [fellowshipFilter, setFellowshipFilter] = useState<number | undefined>();
  const visibleBanks = (banks.data ?? []).filter((b) => !fellowshipFilter || b.fellowshipId === fellowshipFilter);
  // نجلب كل الأسئلة ضمن نطاق المستخدم، ثم نفلتر محليًا (فلترة مرنة وفورية)
  const questions = trpc.bank.listQuestions.useQuery({});

  const createBank = trpc.bank.createBank.useMutation({
    onSuccess: () => { utils.bank.listBanks.invalidate(); closeBank(); toast.success(t("toastAdded")); },
    onError: (e) => toast.error(e.message),
  });
  const updateBank = trpc.bank.updateBank.useMutation({
    onSuccess: () => { utils.bank.listBanks.invalidate(); closeBank(); toast.success(t("toastUpdated")); },
    onError: (e) => toast.error(e.message),
  });
  const deleteBank = trpc.bank.deleteBank.useMutation({
    onSuccess: () => { utils.bank.listBanks.invalidate(); setBankId(undefined); toast.success(t("toastDeleted")); },
    onError: (e) => toast.error(e.message),
  });
  const createQuestion = trpc.bank.createQuestion.useMutation({
    onSuccess: () => { utils.bank.listQuestions.invalidate(); closeQuestion(); toast.success(t("toastAdded")); },
    onError: (e) => toast.error(e.message),
  });
  const updateQuestion = trpc.bank.updateQuestion.useMutation({
    onSuccess: () => { utils.bank.listQuestions.invalidate(); closeQuestion(); toast.success(t("toastUpdated")); },
    onError: (e) => toast.error(e.message),
  });
  const submitReview = trpc.bank.submitForReview.useMutation({ onSuccess: () => utils.bank.listQuestions.invalidate() });
  const review = trpc.bank.reviewQuestion.useMutation({
    onSuccess: () => { utils.bank.listQuestions.invalidate(); toast.success(t("toastUpdated")); },
    onError: (e) => toast.error(e.message),
  });
  const bulkReview = trpc.bank.reviewQuestions.useMutation({
    onSuccess: (r) => { utils.bank.listQuestions.invalidate(); setSelected(new Set()); setReviewNote(""); toast.success(`${t("bulkDone")} ${r.reviewed}${r.skipped ? ` (${r.skipped} ⤼)` : ""}`); },
    onError: (e) => toast.error(e.message),
  });
  const bulkDelete = trpc.bank.deleteQuestions.useMutation({
    onSuccess: (r) => { utils.bank.listQuestions.invalidate(); setSelected(new Set()); toast.success(`${t("toastDeleted")} (${r.deleted})`); },
    onError: (e) => toast.error(e.message),
  });
  const bulkSubmit = trpc.bank.submitQuestionsForReview.useMutation({
    onSuccess: (r) => { utils.bank.listQuestions.invalidate(); setSelected(new Set()); toast.success(`${t("submitReview")} ✓ (${r.sent})`); },
    onError: (e) => toast.error(e.message),
  });
  const del = trpc.bank.deleteQuestion.useMutation({
    onSuccess: () => { utils.bank.listQuestions.invalidate(); toast.success(t("toastDeleted")); },
    onError: (e) => toast.error(e.message),
  });
  const genSimilar = trpc.bank.aiGenerateSimilar.useMutation({
    onSuccess: (r) => { utils.bank.listQuestions.invalidate(); toast.success(`${r.generated} ✓`); },
    onError: (e) => toast.error(e.message),
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false); // الاستيراد الذكي (ملاحظة 8)

  // إنشاء/تعديل بنك بتفاصيل كاملة
  const [bankOpen, setBankOpen] = useState(false);
  const [editingBankId, setEditingBankId] = useState<number | null>(null);
  const [bankForm, setBankForm] = useState({ nameAr: "", nameEn: "", fellowshipId: undefined as number | undefined });
  const closeBank = () => { setBankOpen(false); setEditingBankId(null); setBankForm({ nameAr: "", nameEn: "", fellowshipId: undefined }); };
  const openBankCreate = () => { setEditingBankId(null); setBankForm({ nameAr: "", nameEn: "", fellowshipId: fellowshipFilter }); setBankOpen(true); };
  const openBankEdit = () => {
    const b = (banks.data ?? []).find((x) => x.id === bankId);
    if (!b) return;
    setEditingBankId(b.id);
    setBankForm({ nameAr: b.nameAr, nameEn: b.nameEn ?? "", fellowshipId: b.fellowshipId ?? undefined });
    setBankOpen(true);
  };
  const submitBank = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingBankId) updateBank.mutate({ id: editingBankId, ...bankForm, fellowshipId: bankForm.fellowshipId ?? null });
    else createBank.mutate(bankForm);
  };

  const LETTER = (i: number) => String.fromCharCode(65 + i); // 0→A, 1→B...
  type Opt = { id: string; textAr: string; textEn: string; correct: boolean };
  const emptyQForm = {
    type: "single" as QType, textAr: "", textEn: "", points: 1, difficulty: "medium" as "easy" | "medium" | "hard",
    competency: "", modelAnswer: "", correctText: "", imageUrl: "", allowImageAnswer: false, explanation: "",
    options: [0, 1, 2, 3].map((i) => ({ id: LETTER(i), textAr: "", textEn: "", correct: false })) as Opt[],
    correctSingle: "A", // لصح/خطأ فقط
  };
  const [form, setForm] = useState(emptyQForm);
  const [editingQuestionId, setEditingQuestionId] = useState<number | null>(null);
  const [viewQ, setViewQ] = useState<NonNullable<typeof questions.data>[number] | null>(null);

  // إدارة خيارات السؤال
  const setOptText = (i: number, val: string) =>
    setForm((f) => ({ ...f, options: f.options.map((o, idx) => (idx === i ? { ...o, textAr: val, textEn: val } : o)) }));
  const setSingleCorrect = (i: number) =>
    setForm((f) => ({ ...f, options: f.options.map((o, idx) => ({ ...o, correct: idx === i })) }));
  const toggleMultiCorrect = (i: number) =>
    setForm((f) => ({ ...f, options: f.options.map((o, idx) => (idx === i ? { ...o, correct: !o.correct } : o)) }));
  const addOption = () =>
    setForm((f) => (f.options.length >= 10 ? f : { ...f, options: [...f.options, { id: LETTER(f.options.length), textAr: "", textEn: "", correct: false }] }));
  const removeOption = (i: number) =>
    setForm((f) => (f.options.length <= 2 ? f : { ...f, options: f.options.filter((_, idx) => idx !== i).map((o, idx) => ({ ...o, id: LETTER(idx) })) }));
  // المراجعة الجماعية
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [reviewNote, setReviewNote] = useState("");
  const canReview = (q: NonNullable<typeof questions.data>[number]) =>
    q.status === "pending_review" && !(user?.role === "expert" && q.createdBy === user?.id);
  // خريطة البنك → الزمالة (لفلترة الأسئلة حسب الزمالة)
  const bankFellowship = new Map((banks.data ?? []).map((b) => [b.id, b.fellowshipId]));
  // فلترة مرنة: أي فلتر غير مختار = "الكل"، والمختار يضيّق النتائج (AND)
  const allQuestions = (questions.data ?? []).filter((q) =>
    (!fellowshipFilter || bankFellowship.get(q.bankId) === fellowshipFilter) &&
    (!bankId || q.bankId === bankId) &&
    (!statusFilter || q.status === statusFilter),
  );
  // من بين المحدد: الأسئلة القابلة للاعتماد/الرفض (قيد المراجعة)
  const selectedReviewable = allQuestions.filter((q) => selected.has(q.id) && canReview(q)).map((q) => q.id);
  // من بين المحدد: المسودات (قابلة للإرسال للمراجعة)
  const selectedDrafts = allQuestions.filter((q) => selected.has(q.id) && q.status === "draft").map((q) => q.id);
  const toggleSelect = (id: number) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const closeQuestion = () => { setCreateOpen(false); setEditingQuestionId(null); setForm(emptyQForm); };
  const openQuestionCreate = () => { setEditingQuestionId(null); setForm(emptyQForm); setCreateOpen(true); };
  const openQuestionEdit = (q: NonNullable<typeof questions.data>[number]) => {
    setEditingQuestionId(q.id);
    const opts = (q.options ?? []) as { id: string; textAr: string; textEn: string }[];
    const ca = q.correctAnswer;
    setForm({
      type: q.type as QType,
      textAr: q.textAr,
      textEn: q.textEn ?? "",
      points: q.points,
      difficulty: q.difficulty as "easy" | "medium" | "hard",
      competency: q.competency ?? "",
      modelAnswer: q.modelAnswer ?? "",
      explanation: q.explanation ?? "",
      imageUrl: q.imageUrl ?? "",
      allowImageAnswer: q.allowImageAnswer,
      correctText: q.type === "short" || q.type === "numeric" ? String(ca ?? "") : "",
      options: q.type === "single" || q.type === "multiple"
        ? (opts.length ? opts : emptyQForm.options).map((o, idx) => ({
            id: LETTER(idx), textAr: o.textAr ?? "", textEn: o.textEn ?? "",
            correct: Array.isArray(ca) ? ca.includes(o.id) : String(ca) === o.id,
          }))
        : emptyQForm.options,
      correctSingle: q.type === "truefalse" ? (ca === "T" ? "A" : "B") : "A",
    });
    setCreateOpen(true);
  };

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      draft: "bg-slate-100 text-slate-600",
      pending_review: "bg-amber-100 text-amber-700",
      approved: "bg-emerald-100 text-emerald-700",
      rejected: "bg-red-100 text-red-700",
    };
    return <Badge className={map[s]}>{t(`qstatus_${s}` as "qstatus_draft")}</Badge>;
  };

  const submitCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQuestionId && !bankId) { toast.error(t("bank")); return; }
    const payload: Parameters<typeof createQuestion.mutate>[0] = {
      bankId: bankId ?? 0,
      type: form.type,
      textAr: form.textAr,
      textEn: form.textEn || undefined,
      points: form.points,
      difficulty: form.difficulty,
      competency: form.competency || undefined,
      modelAnswer: form.modelAnswer || undefined,
      explanation: form.explanation || undefined,
      imageUrl: form.imageUrl || undefined,
      allowImageAnswer: form.allowImageAnswer,
    };
    if (form.type === "single" || form.type === "multiple") {
      const opts = form.options.filter((o) => o.textAr.trim());
      if (opts.length < 2) { toast.error(t("needTwoOptions")); return; }
      const correctIds = opts.filter((o) => o.correct).map((o) => o.id);
      if (correctIds.length === 0) { toast.error(t("needCorrectAnswer")); return; }
      payload.options = opts.map(({ id, textAr, textEn }) => ({ id, textAr, textEn }));
      payload.correctAnswer = form.type === "single" ? correctIds[0] : correctIds;
    } else if (form.type === "truefalse") {
      payload.options = [
        { id: "T", textAr: "صح", textEn: "True" },
        { id: "F", textAr: "خطأ", textEn: "False" },
      ];
      payload.correctAnswer = form.correctSingle === "A" ? "T" : "F";
    } else if (form.type === "short") {
      if (!form.correctText.trim()) { toast.error(t("needCorrectAnswer")); return; }
      payload.correctAnswer = form.correctText;
    } else if (form.type === "numeric") {
      if (form.correctText.trim() === "" || Number.isNaN(Number(form.correctText))) { toast.error(t("needValidNumber")); return; }
      payload.correctAnswer = Number(form.correctText);
    }
    if (editingQuestionId) {
      const { bankId: _b, ...rest } = payload;
      void _b;
      updateQuestion.mutate({ id: editingQuestionId, ...rest });
    } else {
      createQuestion.mutate(payload);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-xl font-bold text-brand">
          <Database className="h-5 w-5" /> {t("questionBank")}
        </h2>
        <div className="flex flex-wrap gap-2">
          {/* إنشاء سؤال — أولًا */}
          <Button className="bg-accent-brand text-white" onClick={openQuestionCreate}><Plus className="me-2 h-4 w-4" /> {t("createQuestion")}</Button>
          {/* الاستيراد الذكي للأسئلة (ملاحظة 8): لصق/ملف → تحليل تلقائي للنوع → مراجعة → استيراد إلى بنك ضمن زمالة */}
          <Button variant="outline" className="border-brand text-brand" onClick={() => setUploadOpen(true)}><Upload className="me-2 h-4 w-4" /> {t("smartImport")}</Button>
          <SmartImportDialog
            open={uploadOpen}
            onOpenChange={setUploadOpen}
            banks={banks.data ?? []}
            fellowships={fellowships.data ?? []}
            defaultFellowshipId={fellowshipFilter}
            defaultBankId={bankId}
            onImported={() => { utils.bank.listQuestions.invalidate(); utils.bank.listBanks.invalidate(); }}
          />

          {/* حوار إنشاء/تعديل السؤال (متحكَّم به) */}
          <Dialog open={createOpen} onOpenChange={(v) => (v ? setCreateOpen(true) : closeQuestion())}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
              <DialogHeader><DialogTitle>{editingQuestionId ? t("edit") : t("createQuestion")}</DialogTitle></DialogHeader>
              <form onSubmit={submitCreate} className="grid gap-4">
                {!editingQuestionId && (
                  <select className="rounded-md border px-3 py-2" required value={bankId ?? ""} onChange={(e) => setBankId(e.target.value ? +e.target.value : undefined)}>
                    <option value="">{t("bank")} *</option>
                    {visibleBanks.map((b) => <option key={b.id} value={b.id}>{lang === "ar" ? b.nameAr : b.nameEn || b.nameAr}</option>)}
                  </select>
                )}
                <div className="grid grid-cols-3 gap-3">
                  <div className="grid gap-1.5">
                    <Label>{t("questionType")}</Label>
                    <select className="rounded-md border px-3 py-2" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as QType })}>
                      {TYPE_KEYS.map((k) => <option key={k} value={k}>{t(`type_${k}` as "type_single")}</option>)}
                    </select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label>{t("points")}</Label>
                    <Input type="number" min={1} value={form.points} onChange={(e) => setForm({ ...form, points: +e.target.value })} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>{t("difficulty")}</Label>
                    <select className="rounded-md border px-3 py-2" value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value as "easy" })}>
                      <option value="easy">{t("diff_easy")}</option>
                      <option value="medium">{t("diff_medium")}</option>
                      <option value="hard">{t("diff_hard")}</option>
                    </select>
                  </div>
                </div>
                {/* شريط رموز المعادلات + معاينة حية (ملاحظة 1) */}
                <MathToolbar previewText={form.textAr} />
                <div className="grid gap-1.5">
                  <Label>{t("questionText")} *</Label>
                  <Textarea required className="math-input" value={form.textAr} onChange={(e) => setForm({ ...form, textAr: e.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label>{t("questionTextEn")}</Label>
                  <Textarea dir="ltr" className="math-input" value={form.textEn} onChange={(e) => setForm({ ...form, textEn: e.target.value })} />
                </div>

                {/* صورة/مخطط للسؤال (المتطلب 1) */}
                <div className="grid gap-1.5">
                  <Label>{t("questionImageLabel")}</Label>
                  {form.imageUrl ? (
                    <div className="flex items-center gap-3">
                      <img src={form.imageUrl} alt="" className="h-20 rounded border bg-white object-contain" />
                      <Button type="button" size="sm" variant="outline" className="text-destructive" onClick={() => setForm({ ...form, imageUrl: "" })}>
                        <Trash2 className="me-1 h-4 w-4" /> {t("removeImage")}
                      </Button>
                    </div>
                  ) : (
                    <label className="flex w-fit cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-secondary">
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        if (f.size > 5 * 1024 * 1024) { toast.error(t("imageTooLarge")); return; }
                        const r = new FileReader();
                        r.onload = () => setForm((prev) => ({ ...prev, imageUrl: String(r.result) }));
                        r.readAsDataURL(f);
                      }} />
                      <Upload className="h-4 w-4" /> {t("uploadImage")}
                    </label>
                  )}
                </div>

                {/* السماح بإجابة صورة (المتطلب 1) — للأسئلة المقالية/القصيرة/الرقمية */}
                {(form.type === "essay" || form.type === "short" || form.type === "numeric") && (
                  <label className="flex items-center gap-2 rounded-lg border p-3 text-sm">
                    <input type="checkbox" checked={form.allowImageAnswer} onChange={(e) => setForm({ ...form, allowImageAnswer: e.target.checked })} />
                    {t("allowImageAnswerLabel")}
                  </label>
                )}

                {(form.type === "single" || form.type === "multiple") && (
                  <div className="space-y-2 rounded-lg border p-3">
                    <div className="flex items-center justify-between">
                      <Label>{t("options")}</Label>
                      <span className="text-xs text-muted-foreground">{t("markCorrectHint")}</span>
                    </div>
                    {form.options.map((o, i) => (
                      <div key={i} className={cn(
                        "flex items-center gap-2 rounded-lg border-2 p-2 transition-colors",
                        o.correct ? "border-emerald-400 bg-emerald-50" : "border-transparent",
                      )}>
                        <input
                          type={form.type === "single" ? "radio" : "checkbox"}
                          name="correct"
                          className="h-4 w-4 accent-emerald-600"
                          checked={o.correct}
                          onChange={() => (form.type === "single" ? setSingleCorrect(i) : toggleMultiCorrect(i))}
                        />
                        <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                          o.correct ? "bg-emerald-500 text-white" : "bg-secondary")}>{o.id}</span>
                        <div className="min-w-0 flex-1">
                          <Input className="math-input" placeholder={`${t("options")} ${o.id}`} value={o.textAr} onChange={(e) => setOptText(i, e.target.value)} />
                          {hasMath(o.textAr) && <MathText className="mt-1 block text-xs text-muted-foreground" text={o.textAr} />}
                        </div>
                        {o.correct && <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-medium text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> {t("correctAnswer")}</span>}
                        {form.options.length > 2 && (
                          <Button type="button" size="icon" variant="ghost" className="h-7 w-7 shrink-0 text-destructive" title={t("removeOption")} onClick={() => removeOption(i)}>
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                    {form.options.length < 10 && (
                      <Button type="button" size="sm" variant="outline" onClick={addOption}>
                        <Plus className="me-1 h-4 w-4" /> {t("addOption")}
                      </Button>
                    )}
                  </div>
                )}
                {form.type === "truefalse" && (
                  <div className="flex gap-3 rounded-lg border p-3">
                    {["A", "B"].map((v, i) => (
                      <label key={v} className="flex items-center gap-2">
                        <input type="radio" name="tf" checked={form.correctSingle === v} onChange={() => setForm({ ...form, correctSingle: v })} />
                        {i === 0 ? t("trueLabel") : t("falseLabel")}
                      </label>
                    ))}
                  </div>
                )}
                {(form.type === "short" || form.type === "numeric") && (
                  <div className="grid gap-1.5">
                    <Label>{t("correctAnswer")}</Label>
                    {form.type === "numeric" ? (
                      <Input type="number" step="any" dir="ltr" inputMode="decimal" placeholder="0"
                        value={form.correctText}
                        onChange={(e) => setForm({ ...form, correctText: e.target.value })}
                        onKeyDown={(e) => { if (["e", "E", "+"].includes(e.key)) e.preventDefault(); }} />
                    ) : (
                      <Input className="math-input" value={form.correctText} onChange={(e) => setForm({ ...form, correctText: e.target.value })} />
                    )}
                  </div>
                )}
                {form.type === "essay" && (
                  <div className="grid gap-1.5">
                    <Label>{t("modelAnswer")}</Label>
                    <Textarea rows={4} className="math-input" value={form.modelAnswer} onChange={(e) => setForm({ ...form, modelAnswer: e.target.value })} />
                    {hasMath(form.modelAnswer) && <MathText className="text-xs text-muted-foreground" text={form.modelAnswer} />}
                  </div>
                )}
                <div className="grid gap-1.5">
                  <Label>{t("competency")}</Label>
                  <Input value={form.competency} onChange={(e) => setForm({ ...form, competency: e.target.value })} />
                </div>
                {/* الشرح/التعليل: يظهر للمصحّح فقط ولا يراه الطالب */}
                <div className="grid gap-1.5">
                  <Label>{t("explanationLabel")} <span className="text-xs text-muted-foreground">({t("graderOnly")})</span></Label>
                  <Textarea rows={2} className="math-input" value={form.explanation} onChange={(e) => setForm({ ...form, explanation: e.target.value })} />
                </div>
                <Button type="submit" className="bg-brand" disabled={createQuestion.isPending || updateQuestion.isPending}>{t("save")}</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {/* فلترة حسب الزمالة (المتطلب 9) */}
        <select className="rounded-md border bg-white px-3 py-2" value={fellowshipFilter ?? ""} onChange={(e) => { setFellowshipFilter(e.target.value ? +e.target.value : undefined); setBankId(undefined); }}>
          <option value="">{t("fellowship")} — {t("all")}</option>
          {fellowships.data?.map((f) => <option key={f.id} value={f.id}>{lang === "ar" ? f.nameAr : f.nameEn || f.nameAr}</option>)}
        </select>
        <select className="rounded-md border bg-white px-3 py-2" value={bankId ?? ""} onChange={(e) => setBankId(e.target.value ? +e.target.value : undefined)}>
          <option value="">{t("bank")} — {t("all")}</option>
          {visibleBanks.map((b) => <option key={b.id} value={b.id}>{lang === "ar" ? b.nameAr : b.nameEn || b.nameAr} ({b.questionCount})</option>)}
        </select>
        {/* إدارة البنك المحدد */}
        {bankId && (
          <div className="flex items-center gap-1 rounded-md border bg-white px-1">
            <Button size="sm" variant="ghost" title={t("editBank")} onClick={openBankEdit}><Pencil className="h-4 w-4" /></Button>
            <Button size="sm" variant="ghost" className="text-destructive" title={t("delete")} onClick={() => askDelete(() => deleteBank.mutate({ id: bankId }))}><Trash2 className="h-4 w-4" /></Button>
          </div>
        )}
        <select className="rounded-md border bg-white px-3 py-2" value={statusFilter ?? ""} onChange={(e) => setStatusFilter(e.target.value || undefined)}>
          <option value="">{t("status")} — {t("all")}</option>
          <option value="draft">{t("qstatus_draft")}</option>
          <option value="pending_review">{t("qstatus_pending_review")}</option>
          <option value="approved">{t("qstatus_approved")}</option>
          <option value="rejected">{t("qstatus_rejected")}</option>
        </select>
        <Button variant="outline" onClick={openBankCreate}><Plus className="me-2 h-4 w-4" /> {t("createBankFull")}</Button>
      </div>

      {/* نافذة إنشاء/تعديل بنك بتفاصيل كاملة */}
      <Dialog open={bankOpen} onOpenChange={(v) => (v ? setBankOpen(true) : closeBank())}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingBankId ? t("editBank") : t("createBankFull")}</DialogTitle></DialogHeader>
          <form className="grid gap-3" onSubmit={submitBank}>
            <div className="grid gap-1.5"><Label>{t("bankNameAr")} *</Label><Input required value={bankForm.nameAr} onChange={(e) => setBankForm({ ...bankForm, nameAr: e.target.value })} /></div>
            <div className="grid gap-1.5"><Label>{t("bankNameEn")} <span className="text-xs text-muted-foreground">({t("optionalLabel")})</span></Label><Input dir="ltr" value={bankForm.nameEn} onChange={(e) => setBankForm({ ...bankForm, nameEn: e.target.value })} /></div>
            <div className="grid gap-1.5">
              <Label>{t("linkedFellowship")}</Label>
              <select className="rounded-md border bg-background px-3 py-2" value={bankForm.fellowshipId ?? ""} onChange={(e) => setBankForm({ ...bankForm, fellowshipId: e.target.value ? +e.target.value : undefined })}>
                <option value="">{t("noneLabel")}</option>
                {fellowships.data?.map((f) => <option key={f.id} value={f.id}>{lang === "ar" ? f.nameAr : f.nameEn || f.nameAr}</option>)}
              </select>
            </div>
            <Button type="submit" className="bg-brand" disabled={createBank.isPending || updateBank.isPending}>{t("save")}</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* شريط الإجراءات الجماعية — تحديد الكل + حذف/اعتماد/رفض المحدد */}
      {allQuestions.length > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-xl border bg-secondary/60 p-3 shadow-sm">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox"
              checked={selected.size > 0 && allQuestions.every((q) => selected.has(q.id))}
              onChange={(e) => setSelected(e.target.checked ? new Set(allQuestions.map((q) => q.id)) : new Set())} />
            {t("selectAll")} ({allQuestions.length})
          </label>
          {selected.size > 0 && (
            <>
              <span className="rounded-full bg-brand px-2 py-0.5 text-xs text-white">{selected.size} {t("selectedCount")}</span>
              {/* إرسال للمراجعة — للمسودات ضمن المحدد */}
              {selectedDrafts.length > 0 && (
                <Button size="sm" className="bg-brand text-white" disabled={bulkSubmit.isPending}
                  onClick={() => bulkSubmit.mutate({ ids: selectedDrafts })}>
                  <Send className="me-1 h-4 w-4" /> {t("submitReview")} ({selectedDrafts.length})
                </Button>
              )}
              {/* حذف المحدد — لأي أسئلة */}
              <Button size="sm" variant="destructive" disabled={bulkDelete.isPending}
                onClick={() => askDelete(() => bulkDelete.mutate({ ids: [...selected] }), { description: `${t("confirmDeleteDesc")} (${selected.size})` })}>
                <Trash2 className="me-1 h-4 w-4" /> {t("delete")} ({selected.size})
              </Button>
              {/* اعتماد/رفض — فقط لِما هو قيد المراجعة ضمن المحدد */}
              {selectedReviewable.length > 0 && (
                <>
                  <div className="mx-1 h-6 w-px bg-border" />
                  <Input className="h-8 w-48" placeholder={t("reviewNotesPh")} value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} />
                  <Button size="sm" className="bg-emerald-600 text-white" disabled={bulkReview.isPending}
                    onClick={() => bulkReview.mutate({ ids: selectedReviewable, decision: "approved", notes: reviewNote || undefined })}>
                    <CheckCircle2 className="me-1 h-4 w-4" /> {t("bulkApprove")} ({selectedReviewable.length})
                  </Button>
                  <Button size="sm" variant="outline" className="border-red-300 text-red-600" disabled={bulkReview.isPending}
                    onClick={() => bulkReview.mutate({ ids: selectedReviewable, decision: "rejected", notes: reviewNote || undefined })}>
                    <XCircle className="me-1 h-4 w-4" /> {t("bulkReject")} ({selectedReviewable.length})
                  </Button>
                </>
              )}
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>{t("clearSelection")}</Button>
            </>
          )}
        </div>
      )}

      {/* Questions */}
      <div className="space-y-3">
        {allQuestions.map((q) => (
          <Card key={q.id} className={`shadow-sm ${selected.has(q.id) ? "ring-2 ring-brand" : ""}`}>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <input type="checkbox" className="mt-1.5 h-4 w-4 shrink-0" checked={selected.has(q.id)} onChange={() => toggleSelect(q.id)} title={t("selectAll")} />
                  <div className="min-w-0 flex-1">
                  <MathText as="p" className="font-medium leading-relaxed" text={lang === "ar" ? q.textAr : q.textEn || q.textAr} />
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant="outline">{t(`type_${q.type}` as "type_single")}</Badge>
                    <Badge variant="outline">{q.points} {t("points")}</Badge>
                    <Badge variant="outline">{t(`diff_${q.difficulty}` as "diff_easy")}</Badge>
                    {q.competency && <Badge variant="outline">{q.competency}</Badge>}
                    {q.aiGenerated && <Badge className="bg-violet-100 text-violet-700"><Sparkles className="me-1 h-3 w-3" />{t("aiGenerated")}</Badge>}
                    {statusBadge(q.status)}
                  </div>
                  {/* توثيق: من أنشأ ومن اعتمد/رفض ومتى */}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                    {q.createdByName && <span>{t("createdByLabel")}: <span className="font-medium text-foreground/70">{q.createdByName}</span></span>}
                    {(q.status === "approved" || q.status === "rejected") && q.reviewedByName && (
                      <span className={q.status === "approved" ? "text-emerald-700" : "text-red-600"}>
                        {q.status === "approved" ? t("approvedByLabel") : t("rejectedByLabel")}: <span className="font-medium">{q.reviewedByName}</span>
                        {" · "}{new Date(q.updatedAt).toLocaleString(lang === "ar" ? "ar-SA" : "en-US", { dateStyle: "short", timeStyle: "short" })}
                      </span>
                    )}
                  </div>
                  {/* ملاحظة المراجع تظهر للمنشئ (خاصة عند الرفض) */}
                  {q.reviewNotes && (
                    <p className="mt-1.5 rounded-md bg-amber-50 p-2 text-xs text-amber-800">
                      <span className="font-bold">{t("reviewNoteLabel")}: </span>{q.reviewNotes}
                    </p>
                  )}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1">
                  {q.status === "draft" && (
                    <Button size="sm" variant="outline" onClick={() => submitReview.mutate({ id: q.id })}>
                      <Send className="me-1 h-3.5 w-3.5" /> {t("submitReview")}
                    </Button>
                  )}
                  {/* الاعتماد/الرفض: يظهر عند "قيد المراجعة" — ويُمنع فقط على الخبير الذي كتب السؤال (مراجعة أقران) */}
                  {q.status === "pending_review" && !(user?.role === "expert" && q.createdBy === user?.id) && (
                    <>
                      <Button size="icon" className="h-8 w-8 bg-emerald-600 text-white hover:bg-emerald-700" title={t("approveHint")} aria-label={t("approve")}
                        onClick={() => review.mutate({ id: q.id, decision: "approved" })}>
                        <CheckCircle2 className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="destructive" className="h-8 w-8" title={t("rejectHint")} aria-label={t("reject")}
                        onClick={() => review.mutate({ id: q.id, decision: "rejected" })}>
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  {/* توضيح للخبير: لماذا لا يظهر الاعتماد على سؤاله */}
                  {q.status === "pending_review" && user?.role === "expert" && q.createdBy === user?.id && (
                    <Badge variant="outline" className="text-amber-600">{t("ownQuestionNoApprove")}</Badge>
                  )}
                  <Button size="sm" variant="ghost" title={t("viewDetails")} onClick={() => setViewQ(q)}>
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" title={t("edit")} onClick={() => openQuestionEdit(q)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="outline" title={t("generateSimilarHint")}
                    onClick={() => genSimilar.mutate({ questionId: q.id, count: 3 })} disabled={genSimilar.isPending}>
                    <Sparkles className="me-1 h-3.5 w-3.5" /> {t("generateSimilar")}
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => askDelete(() => del.mutate({ id: q.id }))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {allQuestions.length === 0 && <Card><CardContent className="p-10 text-center text-muted-foreground">—</CardContent></Card>}
      </div>

      {/* عرض تفاصيل السؤال الكاملة */}
      <Dialog open={!!viewQ} onOpenChange={() => setViewQ(null)}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Eye className="h-5 w-5" /> {t("viewDetails")}</DialogTitle></DialogHeader>
          {viewQ && (() => {
            const q = viewQ;
            const ca = q.correctAnswer;
            const isCorrect = (oid: string) => Array.isArray(ca) ? ca.includes(oid) : String(ca) === oid;
            return (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant="outline">{t(`type_${q.type}` as "type_single")}</Badge>
                  <Badge variant="outline">{q.points} {t("points")}</Badge>
                  <Badge variant="outline">{t(`diff_${q.difficulty}` as "diff_easy")}</Badge>
                  {q.competency && <Badge variant="outline">{q.competency}</Badge>}
                  {statusBadge(q.status)}
                </div>
                <MathText as="p" className="text-lg font-medium leading-relaxed" text={q.textAr} />
                {q.textEn && <MathText as="p" className="text-sm text-muted-foreground" text={q.textEn} />}
                {q.imageUrl && <img src={q.imageUrl} alt="" className="max-h-72 rounded-lg border bg-white object-contain" />}

                {(q.type === "single" || q.type === "multiple" || q.type === "truefalse") && (
                  <div className="space-y-2">
                    {(q.options ?? []).map((o) => (
                      <div key={o.id} className={`flex items-center gap-3 rounded-lg border-2 p-3 text-sm ${isCorrect(o.id) ? "border-emerald-400 bg-emerald-50" : ""}`}>
                        <span className={`flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs ${isCorrect(o.id) ? "border-emerald-500 bg-emerald-500 text-white" : "border-muted-foreground/40"}`}>{o.id}</span>
                        <MathText text={o.textAr} />
                        {isCorrect(o.id) && <CheckCircle2 className="ms-auto h-4 w-4 text-emerald-600" />}
                      </div>
                    ))}
                  </div>
                )}
                {(q.type === "short" || q.type === "numeric") && (
                  <div className="rounded-lg bg-emerald-50 p-3 text-sm">
                    <span className="font-bold text-emerald-700">{t("correctAnswer")}: </span><MathText text={String(ca ?? "")} />
                  </div>
                )}
                {q.type === "essay" && q.modelAnswer && (
                  <div className="rounded-lg border border-dashed p-3 text-sm">
                    <p className="mb-1 font-bold text-muted-foreground">{t("modelAnswer")}</p>
                    <MathText as="p" className="text-muted-foreground" text={q.modelAnswer} />
                  </div>
                )}
                {q.explanation && (
                  <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm">
                    <p className="mb-1 text-xs font-bold text-sky-700">{t("explanationLabel")} ({t("graderOnly")})</p>
                    <MathText as="p" className="text-sky-900/90" text={q.explanation} />
                  </div>
                )}
                {q.allowImageAnswer && <p className="text-xs text-muted-foreground">🖼️ {t("allowImageAnswerLabel")}</p>}
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => { const qq = viewQ; setViewQ(null); openQuestionEdit(qq); }}>
                    <Pencil className="me-2 h-4 w-4" /> {t("edit")}
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
