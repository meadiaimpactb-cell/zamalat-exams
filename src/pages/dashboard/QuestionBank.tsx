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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Database, Upload, CheckCircle2, XCircle, Send, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";

const TYPE_KEYS = ["single", "multiple", "truefalse", "short", "essay", "numeric"] as const;
type QType = (typeof TYPE_KEYS)[number];

export default function QuestionBank() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const banks = trpc.bank.listBanks.useQuery();
  const [bankId, setBankId] = useState<number | undefined>();
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const questions = trpc.bank.listQuestions.useQuery({ bankId, status: statusFilter });

  const createBank = trpc.bank.createBank.useMutation({ onSuccess: () => utils.bank.listBanks.invalidate() });
  const createQuestion = trpc.bank.createQuestion.useMutation({
    onSuccess: () => { utils.bank.listQuestions.invalidate(); setCreateOpen(false); toast.success("✓"); },
    onError: (e) => toast.error(e.message),
  });
  const submitReview = trpc.bank.submitForReview.useMutation({ onSuccess: () => utils.bank.listQuestions.invalidate() });
  const review = trpc.bank.reviewQuestion.useMutation({
    onSuccess: () => utils.bank.listQuestions.invalidate(),
    onError: (e) => toast.error(e.message),
  });
  const del = trpc.bank.deleteQuestion.useMutation({
    onSuccess: () => utils.bank.listQuestions.invalidate(),
    onError: (e) => toast.error(e.message),
  });
  const upload = trpc.bank.uploadQuestions.useMutation({
    onSuccess: (r) => { utils.bank.listQuestions.invalidate(); toast.success(`${r.imported} ✓`); setUploadOpen(false); },
    onError: (e) => toast.error(e.message),
  });
  const genSimilar = trpc.bank.aiGenerateSimilar.useMutation({
    onSuccess: (r) => { utils.bank.listQuestions.invalidate(); toast.success(`${r.generated} ✓`); },
    onError: (e) => toast.error(e.message),
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [newBankName, setNewBankName] = useState("");
  const [uploadText, setUploadText] = useState("");
  const [uploadFormat, setUploadFormat] = useState<"json" | "csv">("json");

  const [form, setForm] = useState({
    type: "single" as QType, textAr: "", textEn: "", points: 1, difficulty: "medium" as "easy" | "medium" | "hard",
    competency: "", modelAnswer: "", correctText: "",
    options: [
      { id: "A", textAr: "", textEn: "" },
      { id: "B", textAr: "", textEn: "" },
      { id: "C", textAr: "", textEn: "" },
      { id: "D", textAr: "", textEn: "" },
    ],
    correctSingle: "A", correctMulti: [] as string[],
  });

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
    if (!bankId) { toast.error(t("bank")); return; }
    const payload: Parameters<typeof createQuestion.mutate>[0] = {
      bankId,
      type: form.type,
      textAr: form.textAr,
      textEn: form.textEn || undefined,
      points: form.points,
      difficulty: form.difficulty,
      competency: form.competency || undefined,
      modelAnswer: form.modelAnswer || undefined,
    };
    if (form.type === "single" || form.type === "multiple") {
      payload.options = form.options.filter((o) => o.textAr);
      payload.correctAnswer = form.type === "single" ? form.correctSingle : form.correctMulti;
    } else if (form.type === "truefalse") {
      payload.options = [
        { id: "T", textAr: "صح", textEn: "True" },
        { id: "F", textAr: "خطأ", textEn: "False" },
      ];
      payload.correctAnswer = form.correctSingle === "A" ? "T" : "F";
    } else if (form.type === "short") {
      payload.correctAnswer = form.correctText;
    } else if (form.type === "numeric") {
      payload.correctAnswer = Number(form.correctText);
    }
    createQuestion.mutate(payload);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-xl font-bold text-brand">
          <Database className="h-5 w-5" /> {t("questionBank")}
        </h2>
        <div className="flex flex-wrap gap-2">
          <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
            <DialogTrigger asChild>
              <Button variant="outline"><Upload className="me-2 h-4 w-4" /> {t("uploadQuestions")}</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl">
              <DialogHeader><DialogTitle>{t("uploadQuestions")}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <select className="w-full rounded-md border px-3 py-2" value={bankId ?? ""} onChange={(e) => setBankId(e.target.value ? +e.target.value : undefined)}>
                  <option value="">{t("bank")}...</option>
                  {banks.data?.map((b) => <option key={b.id} value={b.id}>{lang === "ar" ? b.nameAr : b.nameEn}</option>)}
                </select>
                <div className="flex gap-2">
                  {(["json", "csv"] as const).map((f) => (
                    <Button key={f} variant={uploadFormat === f ? "default" : "outline"} size="sm" onClick={() => setUploadFormat(f)}>{f.toUpperCase()}</Button>
                  ))}
                </div>
                <Textarea
                  rows={10}
                  dir="ltr"
                  className="font-mono text-xs"
                  placeholder={uploadFormat === "json"
                    ? '[{"type":"single","textAr":"...","options":[{"id":"A","textAr":"...","textEn":"..."}],"correctAnswer":"A","points":1}]'
                    : "single,نص السؤال,Question text,خيار أ,خيار ب,خيار ج,خيار د,A,1,medium,الحوكمة"}
                  value={uploadText}
                  onChange={(e) => setUploadText(e.target.value)}
                />
                <Button className="w-full bg-brand" disabled={!bankId || !uploadText || upload.isPending}
                  onClick={() => upload.mutate({ bankId: bankId!, format: uploadFormat, content: uploadText })}>
                  {t("uploadQuestions")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="bg-accent-brand text-white"><Plus className="me-2 h-4 w-4" /> {t("createQuestion")}</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
              <DialogHeader><DialogTitle>{t("createQuestion")}</DialogTitle></DialogHeader>
              <form onSubmit={submitCreate} className="grid gap-4">
                <select className="rounded-md border px-3 py-2" required value={bankId ?? ""} onChange={(e) => setBankId(e.target.value ? +e.target.value : undefined)}>
                  <option value="">{t("bank")} *</option>
                  {banks.data?.map((b) => <option key={b.id} value={b.id}>{lang === "ar" ? b.nameAr : b.nameEn}</option>)}
                </select>
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
                <div className="grid gap-1.5">
                  <Label>{t("questionText")} *</Label>
                  <Textarea required value={form.textAr} onChange={(e) => setForm({ ...form, textAr: e.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label>{t("questionTextEn")}</Label>
                  <Textarea dir="ltr" value={form.textEn} onChange={(e) => setForm({ ...form, textEn: e.target.value })} />
                </div>
                {(form.type === "single" || form.type === "multiple") && (
                  <div className="space-y-2 rounded-lg border p-3">
                    <Label>{t("options")}</Label>
                    {form.options.map((o, i) => (
                      <div key={o.id} className="flex items-center gap-2">
                        <input
                          type={form.type === "single" ? "radio" : "checkbox"}
                          name="correct"
                          checked={form.type === "single" ? form.correctSingle === o.id : form.correctMulti.includes(o.id)}
                          onChange={(e) => {
                            if (form.type === "single") setForm({ ...form, correctSingle: o.id });
                            else setForm({ ...form, correctMulti: e.target.checked ? [...form.correctMulti, o.id] : form.correctMulti.filter((x) => x !== o.id) });
                          }}
                        />
                        <span className="w-5 font-bold">{o.id}</span>
                        <Input placeholder={`${t("options")} ${o.id}`} value={o.textAr}
                          onChange={(e) => {
                            const opts = [...form.options];
                            opts[i] = { ...o, textAr: e.target.value, textEn: e.target.value };
                            setForm({ ...form, options: opts });
                          }} />
                      </div>
                    ))}
                    <p className="text-xs text-muted-foreground">{t("correctAnswer")}</p>
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
                    <Input value={form.correctText} onChange={(e) => setForm({ ...form, correctText: e.target.value })} />
                  </div>
                )}
                {form.type === "essay" && (
                  <div className="grid gap-1.5">
                    <Label>{t("modelAnswer")}</Label>
                    <Textarea rows={4} value={form.modelAnswer} onChange={(e) => setForm({ ...form, modelAnswer: e.target.value })} />
                  </div>
                )}
                <div className="grid gap-1.5">
                  <Label>{t("competency")}</Label>
                  <Input value={form.competency} onChange={(e) => setForm({ ...form, competency: e.target.value })} />
                </div>
                <Button type="submit" className="bg-brand" disabled={createQuestion.isPending}>{t("save")}</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select className="rounded-md border bg-white px-3 py-2" value={bankId ?? ""} onChange={(e) => setBankId(e.target.value ? +e.target.value : undefined)}>
          <option value="">{t("bank")} — {t("all")}</option>
          {banks.data?.map((b) => <option key={b.id} value={b.id}>{lang === "ar" ? b.nameAr : b.nameEn}</option>)}
        </select>
        <select className="rounded-md border bg-white px-3 py-2" value={statusFilter ?? ""} onChange={(e) => setStatusFilter(e.target.value || undefined)}>
          <option value="">{t("status")} — {t("all")}</option>
          <option value="draft">{t("qstatus_draft")}</option>
          <option value="pending_review">{t("qstatus_pending_review")}</option>
          <option value="approved">{t("qstatus_approved")}</option>
          <option value="rejected">{t("qstatus_rejected")}</option>
        </select>
        <div className="flex items-center gap-2 rounded-md border bg-white px-3">
          <Input className="w-40 border-0 px-0 focus-visible:ring-0" placeholder={t("createBank")} value={newBankName} onChange={(e) => setNewBankName(e.target.value)} />
          <Button size="sm" variant="ghost" disabled={!newBankName}
            onClick={() => { createBank.mutate({ nameAr: newBankName, nameEn: newBankName }); setNewBankName(""); }}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Questions */}
      <div className="space-y-3">
        {questions.data?.map((q) => (
          <Card key={q.id} className="shadow-sm">
            <CardContent className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium leading-relaxed">{lang === "ar" ? q.textAr : q.textEn || q.textAr}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant="outline">{t(`type_${q.type}` as "type_single")}</Badge>
                    <Badge variant="outline">{q.points} {t("points")}</Badge>
                    <Badge variant="outline">{t(`diff_${q.difficulty}` as "diff_easy")}</Badge>
                    {q.competency && <Badge variant="outline">{q.competency}</Badge>}
                    {q.aiGenerated && <Badge className="bg-violet-100 text-violet-700"><Sparkles className="me-1 h-3 w-3" />{t("aiGenerated")}</Badge>}
                    {statusBadge(q.status)}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1">
                  {q.status === "draft" && (
                    <Button size="sm" variant="outline" onClick={() => submitReview.mutate({ id: q.id })}>
                      <Send className="me-1 h-3.5 w-3.5" /> {t("submitReview")}
                    </Button>
                  )}
                  {q.status === "pending_review" && q.createdBy !== user?.id && (
                    <>
                      <Button size="sm" className="bg-emerald-600 text-white" onClick={() => review.mutate({ id: q.id, decision: "approved" })}>
                        <CheckCircle2 className="me-1 h-3.5 w-3.5" /> {t("approve")}
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => review.mutate({ id: q.id, decision: "rejected" })}>
                        <XCircle className="me-1 h-3.5 w-3.5" /> {t("reject")}
                      </Button>
                    </>
                  )}
                  <Button size="sm" variant="outline" title={t("generateSimilar")}
                    onClick={() => genSimilar.mutate({ questionId: q.id, count: 3 })} disabled={genSimilar.isPending}>
                    <Sparkles className="me-1 h-3.5 w-3.5" /> {t("generateSimilar")}
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => del.mutate({ id: q.id })}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {questions.data?.length === 0 && <Card><CardContent className="p-10 text-center text-muted-foreground">—</CardContent></Card>}
      </div>
    </div>
  );
}
