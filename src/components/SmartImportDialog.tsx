import { useMemo, useState } from "react";
import { useI18n } from "@/i18n";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MathText } from "@/components/MathText";
import { parseQuestionsSmart, parseRows, type ImportedQuestion, type ImportType } from "@/lib/questionImport";
import { readSheetRows } from "@/lib/excel";
import { Upload, Wand2, Trash2, AlertTriangle, CheckCircle2, FileUp } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const TYPES: ImportType[] = ["single", "multiple", "truefalse", "short", "essay", "numeric"];

/**
 * الاستيراد الذكي للأسئلة (ملاحظة 8): الصق نصًا من Word/Excel أو ارفع ملفًا (txt/csv/xlsx/json)،
 * يُحلَّل تلقائيًا ويُعرض للمراجعة (النوع/الإجابة/الدرجة قابلة للتعديل) ثم يُستورد إلى البنك المحدد
 * ضمن الزمالة المحددة — كمسودات تمر بدورة الاعتماد المعتادة.
 */
export function SmartImportDialog({ open, onOpenChange, banks, fellowships, defaultFellowshipId, defaultBankId, onImported }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  banks: { id: number; nameAr: string; nameEn: string | null; fellowshipId: number | null }[];
  fellowships: { id: number; nameAr: string; nameEn: string | null }[];
  defaultFellowshipId?: number;
  defaultBankId?: number;
  onImported: () => void;
}) {
  const { t, lang } = useI18n();
  const [fellowshipId, setFellowshipId] = useState<number | undefined>(defaultFellowshipId);
  const [bankId, setBankId] = useState<number | undefined>(defaultBankId);
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<ImportedQuestion[] | null>(null);
  const [format, setFormat] = useState<string>("");
  const [reading, setReading] = useState(false);
  const visibleBanks = useMemo(() => banks.filter((b) => !fellowshipId || b.fellowshipId === fellowshipId), [banks, fellowshipId]);

  const upload = trpc.bank.uploadQuestions.useMutation({
    onSuccess: (r) => {
      toast.success(`${t("importedCount")}: ${r.imported}${r.errors.length ? ` — ${t("skippedCount")}: ${r.errors.length}` : ""}`);
      onImported(); reset(); onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const reset = () => { setText(""); setParsed(null); setFormat(""); };

  const analyze = (src = text) => {
    const r = parseQuestionsSmart(src);
    setParsed(r.questions);
    setFormat(r.format);
    if (r.questions.length === 0) toast.error(t("noQuestionsDetected"));
  };

  const onFile = async (f: File | null) => {
    if (!f) return;
    setReading(true);
    try {
      if (/\.(xlsx|xls|csv)$/i.test(f.name)) {
        const rows = await readSheetRows(f);
        const qs = parseRows(rows);
        setText(rows.map((r) => r.join("\t")).join("\n"));
        setParsed(qs); setFormat("table");
        if (qs.length === 0) toast.error(t("noQuestionsDetected"));
      } else {
        const content = await f.text();
        setText(content);
        analyze(content);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setReading(false);
    }
  };

  const update = (i: number, patch: Partial<ImportedQuestion>) =>
    setParsed((p) => (p ? p.map((q, idx) => (idx === i ? { ...q, ...patch } : q)) : p));
  const remove = (i: number) => setParsed((p) => (p ? p.filter((_, idx) => idx !== i) : p));

  const doImport = () => {
    if (!bankId || !parsed?.length) return;
    const payload = parsed.map(({ warnings: _w, ...q }) => { void _w; return q; });
    upload.mutate({ bankId, format: "json", content: JSON.stringify(payload) });
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const q of parsed ?? []) c[q.type] = (c[q.type] ?? 0) + 1;
    return c;
  }, [parsed]);
  const warnCount = (parsed ?? []).filter((q) => q.warnings.length).length;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Wand2 className="h-5 w-5" /> {t("smartImport")}</DialogTitle></DialogHeader>

        {/* 1) الوجهة: الزمالة → البنك */}
        <div className="grid gap-3 md:grid-cols-2">
          <div className="grid gap-1.5">
            <Label>{t("fellowship")}</Label>
            <select className="rounded-md border bg-background px-3 py-2" value={fellowshipId ?? ""} onChange={(e) => { setFellowshipId(e.target.value ? +e.target.value : undefined); setBankId(undefined); }}>
              <option value="">{t("all")}</option>
              {fellowships.map((f) => <option key={f.id} value={f.id}>{lang === "ar" ? f.nameAr : f.nameEn || f.nameAr}</option>)}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label>{t("bank")} *</Label>
            <select className="rounded-md border bg-background px-3 py-2" value={bankId ?? ""} onChange={(e) => setBankId(e.target.value ? +e.target.value : undefined)}>
              <option value="">{t("bank")}...</option>
              {visibleBanks.map((b) => <option key={b.id} value={b.id}>{lang === "ar" ? b.nameAr : b.nameEn || b.nameAr}</option>)}
            </select>
          </div>
        </div>

        {/* 2) المصدر: لصق أو ملف */}
        {!parsed && (
          <div className="space-y-2">
            <p className="rounded-lg bg-secondary/60 p-3 text-xs leading-relaxed text-muted-foreground whitespace-pre-line">{t("smartImportHint")}</p>
            <Textarea rows={12} className="math-input text-sm" placeholder={t("smartImportPlaceholder")} value={text} onChange={(e) => setText(e.target.value)} />
            <div className="flex flex-wrap items-center gap-2">
              <Button className="bg-brand" disabled={!text.trim()} onClick={() => analyze()}><Wand2 className="me-2 h-4 w-4" /> {t("analyze")}</Button>
              <label className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-secondary">
                <input type="file" accept=".txt,.csv,.json,.xlsx,.xls,text/plain" className="hidden" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
                <FileUp className="h-4 w-4" /> {reading ? t("loading") : t("chooseFile")} (txt / csv / xlsx / json)
              </label>
            </div>
          </div>
        )}

        {/* 3) المراجعة قبل الاستيراد */}
        {parsed && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-secondary/40 p-2 text-sm">
              <Badge className="bg-brand text-white">{parsed.length} {t("question")}</Badge>
              {TYPES.filter((k) => counts[k]).map((k) => <Badge key={k} variant="outline">{t(`type_${k}` as "type_single")}: {counts[k]}</Badge>)}
              {warnCount > 0 && <Badge className="bg-amber-100 text-amber-700"><AlertTriangle className="me-1 h-3 w-3" /> {t("needsReview")}: {warnCount}</Badge>}
              <span className="ms-auto text-xs text-muted-foreground">{t("detectedFormat")}: {format}</span>
              <Button size="sm" variant="ghost" onClick={() => setParsed(null)}>{t("back")}</Button>
            </div>

            <div className="max-h-[50vh] space-y-2 overflow-y-auto pe-1">
              {parsed.map((q, i) => (
                <div key={i} className={cn("rounded-lg border p-3", q.warnings.length ? "border-amber-300 bg-amber-50/40" : "")}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <MathText as="p" className="text-sm font-medium" text={`${i + 1}. ${q.textAr}`} />
                      {q.options && q.type !== "truefalse" && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {q.options.map((o) => {
                            const c = Array.isArray(q.correctAnswer) ? q.correctAnswer.includes(o.id) : q.correctAnswer === o.id;
                            return (
                              <button key={o.id} type="button" title={t("markCorrectHint")}
                                onClick={() => {
                                  if (q.type === "multiple") {
                                    const cur = Array.isArray(q.correctAnswer) ? q.correctAnswer : [];
                                    update(i, { correctAnswer: cur.includes(o.id) ? cur.filter((x) => x !== o.id) : [...cur, o.id], warnings: [] });
                                  } else update(i, { correctAnswer: o.id, warnings: [] });
                                }}
                                className={cn("rounded-md border px-2 py-0.5 text-xs", c ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "bg-white")}>
                                <span className="font-bold">{o.id}</span> <MathText text={o.textAr} /> {c && <CheckCircle2 className="ms-1 inline h-3 w-3" />}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      {q.type === "truefalse" && (
                        <div className="mt-1.5 flex gap-1.5">
                          {(["T", "F"] as const).map((v) => (
                            <button key={v} type="button" onClick={() => update(i, { correctAnswer: v, warnings: [] })}
                              className={cn("rounded-md border px-2 py-0.5 text-xs", q.correctAnswer === v ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "bg-white")}>
                              {v === "T" ? t("trueLabel") : t("falseLabel")}
                            </button>
                          ))}
                        </div>
                      )}
                      {(q.type === "short" || q.type === "numeric") && (
                        <div className="mt-1.5 flex items-center gap-2 text-xs">
                          <span className="text-muted-foreground">{t("correctAnswer")}:</span>
                          <Input className="h-7 w-56 text-xs" value={String(q.correctAnswer ?? "")}
                            onChange={(e) => update(i, { correctAnswer: q.type === "numeric" ? Number(e.target.value) : e.target.value, warnings: [] })} />
                        </div>
                      )}
                      {q.type === "essay" && (
                        <div className="mt-1.5 text-xs">
                          <span className="text-muted-foreground">{t("modelAnswer")}: </span>
                          <Textarea rows={2} className="mt-1 text-xs" value={q.modelAnswer ?? ""} onChange={(e) => update(i, { modelAnswer: e.target.value })} />
                        </div>
                      )}
                      {q.explanation && <p className="mt-1 text-[11px] text-sky-700">{t("explanationLabel")}: {q.explanation}</p>}
                      {q.warnings.map((w, wi) => <p key={wi} className="mt-1 flex items-center gap-1 text-[11px] text-amber-700"><AlertTriangle className="h-3 w-3" /> {w}</p>)}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <select className="rounded-md border bg-white px-2 py-1 text-xs" value={q.type}
                        onChange={(e) => {
                          const nt = e.target.value as ImportType;
                          const patch: Partial<ImportedQuestion> = { type: nt };
                          if (nt === "truefalse") { patch.options = [{ id: "T", textAr: "صح", textEn: "True" }, { id: "F", textAr: "خطأ", textEn: "False" }]; patch.correctAnswer = undefined; }
                          else if (nt === "single" && Array.isArray(q.correctAnswer)) patch.correctAnswer = q.correctAnswer[0];
                          else if (nt === "multiple" && typeof q.correctAnswer === "string") patch.correctAnswer = [q.correctAnswer];
                          else if (nt === "essay" || nt === "short" || nt === "numeric") { patch.options = undefined; if (typeof q.correctAnswer !== "string" && typeof q.correctAnswer !== "number") patch.correctAnswer = undefined; }
                          update(i, patch);
                        }}>
                        {TYPES.map((k) => <option key={k} value={k}>{t(`type_${k}` as "type_single")}</option>)}
                      </select>
                      <div className="flex items-center gap-1 text-xs">
                        <Input type="number" min={1} className="h-7 w-14 text-xs" value={q.points} onChange={(e) => update(i, { points: Math.max(1, +e.target.value) })} />
                        <span className="text-muted-foreground">{t("points")}</span>
                      </div>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => remove(i)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <Button className="w-full bg-accent-brand text-white" disabled={!bankId || !parsed.length || upload.isPending} onClick={doImport}>
              <Upload className="me-2 h-4 w-4" /> {t("importNQuestions")} ({parsed.length})
            </Button>
            {!bankId && <p className="text-center text-xs text-amber-700">{t("selectBankFirst")}</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
