import { useMemo, useState } from "react";
import { useI18n } from "@/i18n";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { GraduationCap, Plus, ClipboardPaste, Trash2, Pencil, Eye, ShieldAlert, Camera, ListChecks, Search, Filter, X, FileSpreadsheet, FileUp, UserPlus, Award, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { RiskBadge, SeverityBadge } from "@/components/shared";
import { toast } from "sonner";
import { useDeleteConfirm } from "@/providers/confirm";
import { usePermission } from "@/lib/permissions";
import { v, type VKey } from "@contracts/validation";
import { downloadCandidateTemplate, readSheetRows, exportTableXlsx } from "@/lib/excel";
import { cn } from "@/lib/utils";

const emptyForm = { nationalId: "", nameAr: "", nameEn: "", email: "", phone: "", fellowship: "", track: "", cohort: "" };

export default function Candidates() {
  const { t, lang } = useI18n();
  const utils = trpc.useUtils();
  const { can } = usePermission();
  const canManage = can("candidates.manage"); // مدير الزمالة: عرض فقط
  const candidates = trpc.admin.listCandidates.useQuery();
  const fellowships = trpc.admin.listFellowships.useQuery();
  const tracks = trpc.admin.listTracks.useQuery();
  const cohorts = trpc.admin.listCohorts.useQuery();
  const askDelete = useDeleteConfirm();
  const create = trpc.admin.createCandidate.useMutation({
    onSuccess: () => { utils.admin.listCandidates.invalidate(); setOpen(false); setForm(emptyForm); toast.success(t("toastAdded")); },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.admin.updateCandidate.useMutation({
    onSuccess: () => { utils.admin.listCandidates.invalidate(); setOpen(false); setEditingId(null); setForm(emptyForm); toast.success(t("toastUpdated")); },
    onError: (e) => toast.error(e.message),
  });
  const importMut = trpc.admin.importCandidates.useMutation({
    onSuccess: (r) => {
      utils.admin.listCandidates.invalidate();
      setImportReport(r);
      toast.success(`${t("importedCount")}: ${r.created}${r.updated ? ` · ${t("updatedCount")}: ${r.updated}` : ""}${r.skipped ? ` · ${t("skippedCount")}: ${r.skipped}` : ""}`);
      if (r.errors.length === 0) { setImportOpen(false); setCsv(""); setFileRows(null); }
    },
    onError: (e) => toast.error(e.message),
  });
  const bulkUpdate = trpc.admin.bulkUpdateCandidates.useMutation({
    onSuccess: (r) => { utils.admin.listCandidates.invalidate(); setSelected(new Set()); setMoveOpen(false); toast.success(`${t("toastUpdated")} (${r.updated})`); },
    onError: (e) => toast.error(e.message),
  });
  const exams = trpc.exam.list.useQuery();
  const registerBulk = trpc.exam.registerCandidates.useMutation({
    onSuccess: (r) => { setRegisterOpen(false); toast.success(`${t("registered")}: ${r.registered}${r.already ? ` · ${t("alreadyRegisteredCount")}: ${r.already}` : ""}`); },
    onError: (e) => toast.error(e.message),
  });
  const del = trpc.admin.deleteCandidate.useMutation({ onSuccess: () => { utils.admin.listCandidates.invalidate(); toast.success(t("toastDeleted")); }, onError: (e) => toast.error(e.message) });
  const bulkDel = trpc.admin.deleteCandidates.useMutation({
    onSuccess: (r) => { utils.admin.listCandidates.invalidate(); setSelected(new Set()); toast.success(`${t("toastDeleted")} (${r.deleted})`); },
    onError: (e) => toast.error(e.message),
  });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const toggleSel = (id: number) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [detailsId, setDetailsId] = useState<number | null>(null);
  const [csv, setCsv] = useState("");
  // ---------- الفلترة والبحث (عرض الكل / ضمن زمالة / مسار / دفعة / حالة) ----------
  const [search, setSearch] = useState("");
  const [fFellowship, setFFellowship] = useState<string>(""); // "" = الكل، "__none" = بلا زمالة
  const [fTrack, setFTrack] = useState<string>("");
  const [fCohort, setFCohort] = useState<string>("");
  const [fActive, setFActive] = useState<"" | "1" | "0">("");
  const [sortBy, setSortBy] = useState<"newest" | "name" | "fellowship">("newest");
  const clearFilters = () => { setSearch(""); setFFellowship(""); setFTrack(""); setFCohort(""); setFActive(""); };
  const hasFilters = !!(search || fFellowship || fTrack || fCohort || fActive);
  const all = useMemo(() => candidates.data ?? [], [candidates.data]);
  // القيم الموجودة فعليًا في بيانات الزملاء (تشمل أسماء قديمة غير مطابقة لقائمة الزمالات)
  const fellowshipValues = useMemo(() => {
    const names = new Set<string>((fellowships.data ?? []).map((f) => f.nameAr));
    for (const c of all) if (c.fellowship) names.add(c.fellowship);
    return [...names];
  }, [all, fellowships.data]);
  const trackValues = useMemo(() => [...new Set(all.filter((c) => !fFellowship || fFellowship === "__none" ? true : c.fellowship === fFellowship).map((c) => c.track).filter(Boolean) as string[])], [all, fFellowship]);
  const cohortValues = useMemo(() => [...new Set(all.filter((c) => !fFellowship || fFellowship === "__none" ? true : c.fellowship === fFellowship).map((c) => c.cohort).filter(Boolean) as string[])], [all, fFellowship]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const digits = q.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
    const list = all.filter((c) =>
      (!fFellowship || (fFellowship === "__none" ? !c.fellowship : c.fellowship === fFellowship)) &&
      (!fTrack || c.track === fTrack) &&
      (!fCohort || c.cohort === fCohort) &&
      (!fActive || (fActive === "1" ? c.active : !c.active)) &&
      (!q || c.nameAr.toLowerCase().includes(q) || (c.nameEn ?? "").toLowerCase().includes(q) || c.nationalId.includes(digits) || (c.email ?? "").toLowerCase().includes(q) || (c.phone ?? "").includes(digits)),
    );
    if (sortBy === "name") list.sort((a, b) => a.nameAr.localeCompare(b.nameAr, "ar"));
    else if (sortBy === "fellowship") list.sort((a, b) => (a.fellowship ?? "").localeCompare(b.fellowship ?? "", "ar") || a.nameAr.localeCompare(b.nameAr, "ar"));
    return list;
  }, [all, search, fFellowship, fTrack, fCohort, fActive, sortBy]);
  const countByFellowship = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of all) m.set(c.fellowship ?? "__none", (m.get(c.fellowship ?? "__none") ?? 0) + 1);
    return m;
  }, [all]);
  // ---------- الاستيراد ضمن زمالة + التقرير ----------
  const [importDefaults, setImportDefaults] = useState({ fellowship: "", track: "", cohort: "" });
  const [updateExisting, setUpdateExisting] = useState(false);
  const [importReport, setImportReport] = useState<{ created: number; updated: number; skipped: number; errors: string[] } | null>(null);
  // ---------- إجراءات جماعية ----------
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveTo, setMoveTo] = useState({ fellowship: "", track: "", cohort: "" });
  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerExamId, setRegisterExamId] = useState<number | undefined>();
  const selectedRows = () => filtered.filter((c) => selected.has(c.id));
  // ---------- التصدير ----------
  const exportRows = async (rows: typeof all, label: string) => {
    if (!rows.length) return;
    await exportTableXlsx({
      fileName: `candidates-${label}-${new Date().toISOString().slice(0, 10)}.xlsx`,
      sheet: t("candidates"),
      header: [t("nationalId"), `${t("name")} (عربي)`, `${t("name")} (English)`, t("email"), t("phone"), t("fellowship"), t("track"), t("cohort"), t("status")],
      rows: rows.map((c) => [c.nationalId, c.nameAr, c.nameEn ?? "", c.email ?? "", c.phone ?? "", c.fellowship ?? "", c.track ?? "", c.cohort ?? "", c.active ? t("active") : t("disabledLabel")]),
      textCols: [0, 4],
      widths: [14, 28, 24, 26, 14, 30, 22, 14, 10],
    });
    toast.success(t("exportDone"));
  };
  // استيراد من ملف Excel/CSV + تنزيل نموذج جاهز (ملاحظة 10)
  const [fileRows, setFileRows] = useState<string[][] | null>(null);
  const [fileName, setFileName] = useState("");
  const onImportFile = async (f: File | null) => {
    if (!f) return;
    try {
      const rows = (await readSheetRows(f)).filter((r) => r.some((c) => c));
      // تخطّي صف العناوين إن كانت أول خلية ليست رقم هوية
      const body = rows.length && !/^\d{5,}$/.test(rows[0][0] ?? "") ? rows.slice(1) : rows;
      setFileRows(body); setFileName(f.name);
      setCsv(body.map((r) => r.slice(0, 8).map((c) => c.replace(/[,\t;\r\n]/g, " ")).join(",")).join("\n"));
    } catch (e) { toast.error((e as Error).message); }
  };
  const downloadTemplate = () => downloadCandidateTemplate({
    nationalId: t("nationalId"), nameAr: `${t("name")} (عربي)`, nameEn: `${t("name")} (English)`, email: t("email"), phone: t("phone"),
    fellowship: t("fellowship"), track: t("track"), cohort: t("cohort"),
    sheet: t("candidates"), notesSheet: t("templateNotesSheet"),
    notes: [t("templateNote1"), t("templateNote2"), t("templateNote3"), t("templateNote4")],
  }, (fellowships.data ?? []).map((f) => f.nameAr));
  const [form, setForm] = useState(emptyForm);
  const details = trpc.admin.candidateDetails.useQuery({ id: detailsId! }, { enabled: !!detailsId });
  // الدليل الفعلي: سجل الأحداث + لقطات الكاميرا لجلسة محددة
  const [evSession, setEvSession] = useState<number | null>(null);
  const [snSession, setSnSession] = useState<number | null>(null);
  const [lightbox, setLightbox] = useState<{ image: string; time: string } | null>(null);
  const evQuery = trpc.monitor.sessionEvents.useQuery({ sessionId: evSession! }, { enabled: !!evSession });
  const snQuery = trpc.monitor.sessionSnapshots.useQuery({ sessionId: snSession!, limit: 200 }, { enabled: !!snSession });

  const openCreate = () => { setEditingId(null); setForm(emptyForm); setErrs({}); setOpen(true); };
  const openEdit = (c: NonNullable<typeof candidates.data>[number]) => {
    setEditingId(c.id);
    setErrs({});
    setForm({
      nationalId: c.nationalId, nameAr: c.nameAr, nameEn: c.nameEn ?? "", email: c.email ?? "",
      phone: c.phone ?? "", fellowship: c.fellowship ?? "", track: c.track ?? "", cohort: c.cohort ?? "",
    });
    setOpen(true);
  };
  const [errs, setErrs] = useState<Record<string, VKey>>({});
  const validate = () => {
    const e: Record<string, VKey> = {
      nationalId: v.nid(form.nationalId),
      nameAr: v.min(form.nameAr, 2),
      email: v.email(form.email),
      phone: v.phone(form.phone),
    };
    setErrs(e);
    return !Object.values(e).some(Boolean);
  };
  const submitForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    if (editingId) update.mutate({ id: editingId, ...form });
    else create.mutate(form);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-xl font-bold text-brand"><GraduationCap className="h-5 w-5" /> {t("candidates")}</h2>
        {canManage && (
        <div className="flex gap-2">
          <Dialog open={importOpen} onOpenChange={setImportOpen}>
            <DialogTrigger asChild>
              <Button variant="outline"><ClipboardPaste className="me-2 h-4 w-4" /> {t("importCandidates")}</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl">
              <DialogHeader><DialogTitle>{t("importCandidates")}</DialogTitle></DialogHeader>
              {/* نموذج Excel جاهز + رفع ملف (ملاحظة 10) */}
              <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-secondary/40 p-3">
                <Button variant="outline" className="border-emerald-600 text-emerald-700" onClick={downloadTemplate}>
                  <FileSpreadsheet className="me-2 h-4 w-4" /> {t("downloadTemplate")}
                </Button>
                <label className="flex cursor-pointer items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm hover:bg-secondary">
                  <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => onImportFile(e.target.files?.[0] ?? null)} />
                  <FileUp className="h-4 w-4" /> {t("chooseFile")} (xlsx / csv)
                </label>
                {fileRows && <span className="text-xs text-emerald-700">✓ {fileName} — {fileRows.length} {t("rowsLabel")}</span>}
              </div>
              {/* الاستيراد ضمن زمالة/مسار/دفعة محددة: تُطبَّق على الخلايا الفارغة في الملف */}
              <div className="grid gap-2 rounded-lg border p-3 md:grid-cols-3">
                <div className="grid gap-1 md:col-span-3"><Label className="text-xs">{t("importIntoScope")}</Label></div>
                <select className="rounded-md border bg-background px-2 py-1.5 text-sm" value={importDefaults.fellowship} onChange={(e) => setImportDefaults({ fellowship: e.target.value, track: "", cohort: "" })}>
                  <option value="">{t("fellowship")}: {t("fromFileOnly")}</option>
                  {fellowships.data?.map((f) => <option key={f.id} value={f.nameAr}>{f.nameAr}</option>)}
                </select>
                <select className="rounded-md border bg-background px-2 py-1.5 text-sm disabled:opacity-50" disabled={!importDefaults.fellowship} value={importDefaults.track} onChange={(e) => setImportDefaults({ ...importDefaults, track: e.target.value })}>
                  <option value="">{t("track")}: {t("fromFileOnly")}</option>
                  {(tracks.data ?? []).filter((x) => x.fellowshipId === fellowships.data?.find((f) => f.nameAr === importDefaults.fellowship)?.id).map((x) => <option key={x.id} value={x.nameAr}>{x.nameAr}</option>)}
                </select>
                <select className="rounded-md border bg-background px-2 py-1.5 text-sm disabled:opacity-50" disabled={!importDefaults.fellowship} value={importDefaults.cohort} onChange={(e) => setImportDefaults({ ...importDefaults, cohort: e.target.value })}>
                  <option value="">{t("cohort")}: {t("fromFileOnly")}</option>
                  {(cohorts.data ?? []).filter((x) => x.fellowshipId === fellowships.data?.find((f) => f.nameAr === importDefaults.fellowship)?.id).map((x) => <option key={x.id} value={x.nameAr}>{x.nameAr}</option>)}
                </select>
                <label className="flex items-center gap-2 text-xs md:col-span-3">
                  <input type="checkbox" checked={updateExisting} onChange={(e) => setUpdateExisting(e.target.checked)} /> {t("updateExistingLabel")}
                </label>
              </div>
              <p className="text-xs text-muted-foreground">{t("importHint")}</p>
              <Textarea rows={7} dir="ltr" className="font-mono text-xs" value={csv} onChange={(e) => { setCsv(e.target.value); setFileRows(null); setImportReport(null); }}
                placeholder={"1000000010,أحمد الزميل,Ahmed,ahmed@x.com,0500000010,زمالة القيادة الصحية,إدارة المنشآت,دفعة 2026"} />
              {importReport && (
                <div className={cn("max-h-40 overflow-y-auto rounded-lg border p-2 text-xs", importReport.errors.length ? "border-amber-300 bg-amber-50" : "border-emerald-300 bg-emerald-50")}>
                  <p className="font-bold">{t("importedCount")}: {importReport.created} · {t("updatedCount")}: {importReport.updated} · {t("skippedCount")}: {importReport.skipped}</p>
                  {importReport.errors.map((e, i) => <p key={i} className="text-amber-800">• {e}</p>)}
                </div>
              )}
              <Button className="bg-brand" disabled={!csv || importMut.isPending}
                onClick={() => importMut.mutate({ csv, updateExisting, defaults: { fellowship: importDefaults.fellowship || undefined, track: importDefaults.track || undefined, cohort: importDefaults.cohort || undefined } })}>
                <ClipboardPaste className="me-2 h-4 w-4" /> {t("importCandidates")}{csv ? ` (${csv.split("\n").filter((l) => l.trim()).length})` : ""}{importDefaults.fellowship ? ` → ${importDefaults.fellowship}` : ""}
              </Button>
            </DialogContent>
          </Dialog>
          <Button variant="outline" className="border-emerald-600 text-emerald-700" disabled={!filtered.length} onClick={() => exportRows(filtered, hasFilters ? "filtered" : "all")} title={t("exportFilteredHint")}>
            <FileSpreadsheet className="me-2 h-4 w-4" /> {t("exportExcel")} ({filtered.length})
          </Button>
          <Button className="bg-accent-brand text-white" onClick={openCreate}><Plus className="me-2 h-4 w-4" /> {t("createCandidate")}</Button>
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditingId(null); setForm(emptyForm); } }}>
            <DialogContent>
              <DialogHeader><DialogTitle>{editingId ? t("editCandidate") : t("createCandidate")}</DialogTitle></DialogHeader>
              <form className="grid gap-3" onSubmit={submitForm}>
                <div className="grid gap-1.5">
                  <Label>{t("nationalId")} *</Label>
                  <Input required dir="ltr" aria-invalid={!!errs.nationalId} value={form.nationalId}
                    onChange={(e) => setForm({ ...form, nationalId: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                    onBlur={() => setErrs({ ...errs, nationalId: v.nid(form.nationalId) })} />
                  {errs.nationalId && <p className="text-xs text-destructive">{t(errs.nationalId)}</p>}
                </div>
                <div className="grid gap-1.5">
                  <Label>{t("name")} (عربي) *</Label>
                  <Input required aria-invalid={!!errs.nameAr} value={form.nameAr}
                    onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
                    onBlur={() => setErrs({ ...errs, nameAr: v.min(form.nameAr, 2) })} />
                  {errs.nameAr && <p className="text-xs text-destructive">{t(errs.nameAr)}</p>}
                </div>
                <div className="grid gap-1.5"><Label>{t("name")} (English)</Label><Input dir="ltr" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label>{t("email")}</Label>
                    <Input dir="ltr" aria-invalid={!!errs.email} value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      onBlur={() => setErrs({ ...errs, email: v.email(form.email) })} />
                    {errs.email && <p className="text-xs text-destructive">{t(errs.email)}</p>}
                  </div>
                  <div className="grid gap-1.5">
                    <Label>{t("phone")}</Label>
                    <Input dir="ltr" aria-invalid={!!errs.phone} value={form.phone} placeholder="05XXXXXXXX"
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      onBlur={() => setErrs({ ...errs, phone: v.phone(form.phone) })} />
                    {errs.phone && <p className="text-xs text-destructive">{t(errs.phone)}</p>}
                  </div>
                </div>
                {/* الزمالة → المسار/الدفعة مترابطة (المسارات والدفعات تتبع الزمالة المختارة) */}
                {(() => {
                  const selFel = (fellowships.data ?? []).find((f) => f.nameAr === form.fellowship);
                  const fid = selFel?.id;
                  const felTracks = (tracks.data ?? []).filter((x) => x.fellowshipId === fid);
                  const felCohorts = (cohorts.data ?? []).filter((x) => x.fellowshipId === fid);
                  return (
                    <div className="grid gap-3">
                      {/* الزمالة: صف كامل (أسماؤها طويلة) */}
                      <div className="grid gap-1.5">
                        <Label>{t("fellowship")}</Label>
                        <select className="w-full min-w-0 truncate rounded-md border bg-background px-3 py-2 text-sm"
                          value={form.fellowship}
                          onChange={(e) => setForm({ ...form, fellowship: e.target.value, track: "", cohort: "" })}>
                          <option value="">{t("noneLabel")}</option>
                          {fellowships.data?.map((f) => <option key={f.id} value={f.nameAr}>{lang === "ar" ? f.nameAr : f.nameEn || f.nameAr}</option>)}
                          {form.fellowship && !selFel && <option value={form.fellowship}>{form.fellowship}</option>}
                        </select>
                      </div>
                      {/* المسار + الدفعة: صف من عمودين */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="grid gap-1.5">
                          <Label>{t("track")}</Label>
                          <select className="w-full min-w-0 truncate rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-50"
                            disabled={!fid} value={form.track}
                            onChange={(e) => setForm({ ...form, track: e.target.value })}>
                            <option value="">{fid ? t("noneLabel") : t("selectFellowshipFirst")}</option>
                            {felTracks.map((tr) => <option key={tr.id} value={tr.nameAr}>{lang === "ar" ? tr.nameAr : tr.nameEn || tr.nameAr}</option>)}
                            {form.track && !felTracks.some((tr) => tr.nameAr === form.track) && <option value={form.track}>{form.track}</option>}
                          </select>
                        </div>
                        <div className="grid gap-1.5">
                          <Label>{t("cohort")}</Label>
                          <select className="w-full min-w-0 truncate rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-50"
                            disabled={!fid} value={form.cohort}
                            onChange={(e) => setForm({ ...form, cohort: e.target.value })}>
                            <option value="">{fid ? t("noneLabel") : t("selectFellowshipFirst")}</option>
                            {felCohorts.map((co) => <option key={co.id} value={co.nameAr}>{lang === "ar" ? co.nameAr : co.nameEn || co.nameAr}</option>)}
                            {form.cohort && !felCohorts.some((co) => co.nameAr === form.cohort) && <option value={form.cohort}>{form.cohort}</option>}
                          </select>
                        </div>
                      </div>
                    </div>
                  );
                })()}
                <Button type="submit" className="bg-brand" disabled={create.isPending || update.isPending}>{t("save")}</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
        )}
      </div>

      {/* شريط الفلترة: بحث + زمالة + مسار + دفعة + حالة + ترتيب */}
      <Card>
        <CardContent className="space-y-3 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute start-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="ps-8" placeholder={t("searchCandidates")} value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <select className="rounded-md border bg-white px-3 py-2 text-sm" value={fFellowship} onChange={(e) => { setFFellowship(e.target.value); setFTrack(""); setFCohort(""); }}>
              <option value="">{t("fellowship")} — {t("all")} ({all.length})</option>
              {fellowshipValues.map((n) => <option key={n} value={n}>{n} ({countByFellowship.get(n) ?? 0})</option>)}
              <option value="__none">{t("noFellowshipAssigned")} ({countByFellowship.get("__none") ?? 0})</option>
            </select>
            <select className="rounded-md border bg-white px-3 py-2 text-sm disabled:opacity-50" disabled={!trackValues.length} value={fTrack} onChange={(e) => setFTrack(e.target.value)}>
              <option value="">{t("track")} — {t("all")}</option>
              {trackValues.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <select className="rounded-md border bg-white px-3 py-2 text-sm disabled:opacity-50" disabled={!cohortValues.length} value={fCohort} onChange={(e) => setFCohort(e.target.value)}>
              <option value="">{t("cohort")} — {t("all")}</option>
              {cohortValues.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <select className="rounded-md border bg-white px-3 py-2 text-sm" value={fActive} onChange={(e) => setFActive(e.target.value as "" | "1" | "0")}>
              <option value="">{t("status")} — {t("all")}</option>
              <option value="1">{t("active")}</option>
              <option value="0">{t("disabledLabel")}</option>
            </select>
            <select className="rounded-md border bg-white px-3 py-2 text-sm" value={sortBy} onChange={(e) => setSortBy(e.target.value as "newest")}>
              <option value="newest">{t("sortNewest")}</option>
              <option value="name">{t("sortByName")}</option>
              <option value="fellowship">{t("sortByFellowship")}</option>
            </select>
            {hasFilters && (
              <Button size="sm" variant="ghost" onClick={clearFilters}><X className="me-1 h-4 w-4" /> {t("clearFilters")}</Button>
            )}
          </div>
          {/* رقائق سريعة لكل زمالة */}
          <div className="flex flex-wrap items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <button type="button" onClick={() => { setFFellowship(""); setFTrack(""); setFCohort(""); }}
              className={cn("rounded-full border px-2.5 py-0.5 text-xs", !fFellowship ? "border-brand bg-brand text-white" : "bg-white hover:bg-secondary")}>
              {t("all")} <span className="opacity-80">({all.length})</span>
            </button>
            {fellowshipValues.map((n) => (
              <button key={n} type="button" onClick={() => { setFFellowship(n); setFTrack(""); setFCohort(""); }}
                className={cn("rounded-full border px-2.5 py-0.5 text-xs", fFellowship === n ? "border-brand bg-brand text-white" : "bg-white hover:bg-secondary")}>
                <Award className="me-1 inline h-3 w-3" />{n} <span className="opacity-80">({countByFellowship.get(n) ?? 0})</span>
              </button>
            ))}
            <span className="ms-auto text-xs text-muted-foreground"><Users className="me-1 inline h-3.5 w-3.5" />{t("showingCount")}: <b>{filtered.length}</b> / {all.length}</span>
          </div>
        </CardContent>
      </Card>

      {/* شريط الإجراءات الجماعية على المحدد */}
      {canManage && selected.size > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-xl border bg-secondary/60 p-3 shadow-sm">
          <span className="rounded-full bg-brand px-2 py-0.5 text-xs text-white">{selected.size} {t("selectedCount")}</span>
          <Button size="sm" variant="outline" onClick={() => exportRows(selectedRows(), "selected")}>
            <FileSpreadsheet className="me-1 h-4 w-4" /> {t("exportSelected")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => { setRegisterExamId(undefined); setRegisterOpen(true); }}>
            <UserPlus className="me-1 h-4 w-4" /> {t("registerInExam")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => { setMoveTo({ fellowship: fFellowship && fFellowship !== "__none" ? fFellowship : "", track: "", cohort: "" }); setMoveOpen(true); }}>
            <Award className="me-1 h-4 w-4" /> {t("moveToFellowship")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => bulkUpdate.mutate({ ids: [...selected], active: true })}>{t("enabledLabel")}</Button>
          <Button size="sm" variant="outline" onClick={() => bulkUpdate.mutate({ ids: [...selected], active: false })}>{t("disabledLabel")}</Button>
          <Button size="sm" variant="destructive" disabled={bulkDel.isPending}
            onClick={() => askDelete(() => bulkDel.mutate({ ids: [...selected] }), { description: `${t("confirmDeleteDesc")} (${selected.size})` })}>
            <Trash2 className="me-1 h-4 w-4" /> {t("delete")} ({selected.size})
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>{t("clearSelection")}</Button>
        </div>
      )}

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b bg-secondary/50">
              <tr>
                {canManage && (
                  <th className="p-3">
                    <input type="checkbox" title={t("selectAllFiltered")}
                      checked={filtered.length > 0 && filtered.every((c) => selected.has(c.id))}
                      onChange={(e) => setSelected(e.target.checked ? new Set(filtered.map((c) => c.id)) : new Set())} />
                  </th>
                )}
                {[t("nationalId"), t("name"), t("email"), t("phone"), t("fellowship"), t("track"), t("cohort"), t("status"), t("actions")].map((h) => (
                  <th key={h} className="p-3 text-start font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className={`border-b last:border-0 hover:bg-secondary/30 ${selected.has(c.id) ? "bg-brand/5" : ""} ${!c.active ? "opacity-60" : ""}`}>
                  {canManage && <td className="p-3"><input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSel(c.id)} /></td>}
                  <td className="p-3 font-mono" dir="ltr">{c.nationalIdMasked}</td>
                  <td className="p-3 font-medium">{c.nameAr}{c.nameEn && <span className="block text-[11px] font-normal text-muted-foreground" dir="ltr">{c.nameEn}</span>}</td>
                  <td className="p-3" dir="ltr">{c.email}</td>
                  <td className="p-3" dir="ltr">{c.phone}</td>
                  <td className="p-3">
                    {c.fellowship ? (
                      <button type="button" className="text-start text-brand hover:underline" onClick={() => { setFFellowship(c.fellowship!); setFTrack(""); setFCohort(""); }}>{c.fellowship}</button>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="p-3">{c.track || "—"}</td>
                  <td className="p-3">{c.cohort || "—"}</td>
                  <td className="p-3"><Badge className={c.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}>{c.active ? t("active") : t("disabledLabel")}</Badge></td>
                  <td className="p-3">
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" title={t("viewDetails")} onClick={() => setDetailsId(c.id)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      {canManage && (
                        <>
                          <Button size="sm" variant="ghost" title={t("edit")} onClick={() => openEdit(c)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" className="text-destructive" title={t("delete")} onClick={() => askDelete(() => del.mutate({ id: c.id }), { description: `${t("confirmDeleteDesc")} (${c.nameAr})` })}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={10} className="p-10 text-center text-muted-foreground">{hasFilters ? t("noMatches") : "—"}</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* تسجيل المحدد في اختبار */}
      <Dialog open={registerOpen} onOpenChange={setRegisterOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5" /> {t("registerInExam")} ({selected.size})</DialogTitle></DialogHeader>
          <select className="w-full rounded-md border bg-background px-3 py-2" value={registerExamId ?? ""} onChange={(e) => setRegisterExamId(e.target.value ? +e.target.value : undefined)}>
            <option value="">{t("exams")}...</option>
            {exams.data?.filter((x) => x.status !== "archived").map((x) => <option key={x.id} value={x.id}>{x.titleAr} — {x.code} ({t(`status_${x.status}` as "status_draft")})</option>)}
          </select>
          <Button className="bg-brand" disabled={!registerExamId || registerBulk.isPending} onClick={() => registerBulk.mutate({ examId: registerExamId!, candidateIds: [...selected] })}>
            {t("registerConfirm")} ({selected.size})
          </Button>
        </DialogContent>
      </Dialog>

      {/* نقل المحدد إلى زمالة/مسار/دفعة */}
      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Award className="h-5 w-5" /> {t("moveToFellowship")} ({selected.size})</DialogTitle></DialogHeader>
          {(() => {
            const fid = (fellowships.data ?? []).find((f) => f.nameAr === moveTo.fellowship)?.id;
            return (
              <div className="grid gap-3">
                <select className="rounded-md border bg-background px-3 py-2" value={moveTo.fellowship} onChange={(e) => setMoveTo({ fellowship: e.target.value, track: "", cohort: "" })}>
                  <option value="">{t("noneLabel")}</option>
                  {fellowships.data?.map((f) => <option key={f.id} value={f.nameAr}>{f.nameAr}</option>)}
                </select>
                <select className="rounded-md border bg-background px-3 py-2 disabled:opacity-50" disabled={!fid} value={moveTo.track} onChange={(e) => setMoveTo({ ...moveTo, track: e.target.value })}>
                  <option value="">{t("track")}: {t("noneLabel")}</option>
                  {(tracks.data ?? []).filter((x) => x.fellowshipId === fid).map((x) => <option key={x.id} value={x.nameAr}>{x.nameAr}</option>)}
                </select>
                <select className="rounded-md border bg-background px-3 py-2 disabled:opacity-50" disabled={!fid} value={moveTo.cohort} onChange={(e) => setMoveTo({ ...moveTo, cohort: e.target.value })}>
                  <option value="">{t("cohort")}: {t("noneLabel")}</option>
                  {(cohorts.data ?? []).filter((x) => x.fellowshipId === fid).map((x) => <option key={x.id} value={x.nameAr}>{x.nameAr}</option>)}
                </select>
                <Button className="bg-brand" disabled={bulkUpdate.isPending}
                  onClick={() => bulkUpdate.mutate({ ids: [...selected], fellowship: moveTo.fellowship || null, track: moveTo.track || null, cohort: moveTo.cohort || null })}>
                  {t("save")}
                </Button>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ملف الزميل الكامل: البيانات + المحاولات + المخالفات */}
      <Dialog open={!!detailsId} onOpenChange={() => setDetailsId(null)}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><GraduationCap className="h-5 w-5" /> {t("candidateDetails")}</DialogTitle></DialogHeader>
          {details.isLoading && <p className="py-6 text-center text-muted-foreground">{t("loading")}</p>}
          {details.data && (
            <div className="space-y-5">
              {/* البيانات الأساسية */}
              <div>
                <h4 className="mb-2 text-sm font-bold text-brand">{t("basicInfo")}</h4>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg border p-4 text-sm md:grid-cols-3">
                  <div><span className="text-muted-foreground">{t("name")}: </span><span className="font-medium">{details.data.candidate.nameAr}</span></div>
                  <div dir="ltr" className="text-start"><span className="text-muted-foreground">{t("fullNationalId")}: </span><span className="font-mono font-medium">{details.data.candidate.nationalId}</span></div>
                  <div><span className="text-muted-foreground">{t("active")}: </span>{details.data.candidate.active ? "✅" : "⛔"}</div>
                  <div dir="ltr" className="text-start"><span className="text-muted-foreground">{t("email")}: </span>{details.data.candidate.email || "—"}</div>
                  <div dir="ltr" className="text-start"><span className="text-muted-foreground">{t("phone")}: </span>{details.data.candidate.phone || "—"}</div>
                  <div><span className="text-muted-foreground">{t("fellowship")}: </span>{details.data.candidate.fellowship || "—"}</div>
                  <div><span className="text-muted-foreground">{t("track")}: </span>{details.data.candidate.track || "—"}</div>
                  <div><span className="text-muted-foreground">{t("cohort")}: </span>{details.data.candidate.cohort || "—"}</div>
                </div>
              </div>

              {/* المحاولات والمخالفات */}
              <div>
                <h4 className="mb-2 flex items-center gap-2 text-sm font-bold text-brand"><ShieldAlert className="h-4 w-4" /> {t("attemptsLabel")}</h4>
                {details.data.attempts.length === 0 && <p className="rounded-lg border p-4 text-center text-sm text-muted-foreground">{t("noAttempts")}</p>}
                <div className="space-y-2">
                  {details.data.attempts.map((a, i) => (
                    <div key={i} className="rounded-lg border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-medium">{a.examTitleAr} <span className="font-mono text-xs text-muted-foreground">{a.examCode}</span></p>
                          <p className="text-xs text-muted-foreground">
                            {a.startedAt ? new Date(a.startedAt).toLocaleString(lang === "ar" ? "ar-SA" : "en-US") : "—"}
                            {a.ipAddress ? ` · IP ${a.ipAddress}` : ""}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <Badge variant={a.status === "active" ? "default" : a.status === "terminated" ? "destructive" : "secondary"}
                            className={a.status === "active" ? "bg-emerald-600" : ""}>{a.status}</Badge>
                          {a.percentage !== null && (
                            <Badge className={a.passed ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}>{a.percentage}%</Badge>
                          )}
                        </div>
                      </div>
                      {a.sessionId && (
                        <>
                          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">{t("riskScore")}: <RiskBadge score={a.riskScore} /></span>
                            <Button size="sm" variant="outline" className="h-7 text-xs"
                              onClick={() => setEvSession(evSession === a.sessionId ? null : a.sessionId)}>
                              <ListChecks className="me-1 h-3.5 w-3.5" /> {t("events")}: {a.eventsCount}{a.highEvents > 0 ? ` (${a.highEvents} ⚠)` : ""}
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={a.snapshotsCount === 0}
                              onClick={() => setSnSession(snSession === a.sessionId ? null : a.sessionId)}>
                              <Camera className="me-1 h-3.5 w-3.5" /> {t("snapshots")}: {a.snapshotsCount}
                            </Button>
                          </div>

                          {/* سجل الأحداث الفعلي (بالوقت) — دليل موثّق */}
                          {evSession === a.sessionId && (
                            <div className="mt-2 max-h-64 space-y-1.5 overflow-y-auto rounded-lg border bg-secondary/30 p-2">
                              {evQuery.isLoading && <p className="text-center text-xs text-muted-foreground">{t("loading")}</p>}
                              {evQuery.data?.length === 0 && <p className="text-center text-xs text-muted-foreground">—</p>}
                              {evQuery.data?.map((e) => (
                                <div key={e.id} className="flex items-start justify-between gap-2 rounded border bg-white p-2 text-xs">
                                  <div className="flex items-center gap-2">
                                    <SeverityBadge severity={e.severity} />
                                    <div>
                                      <span className="font-mono">{e.eventType}</span>
                                      {e.details && <p className="text-muted-foreground">{e.details}</p>}
                                    </div>
                                  </div>
                                  <span className="shrink-0 text-muted-foreground" dir="ltr">{new Date(e.createdAt).toLocaleString(lang === "ar" ? "ar-SA" : "en-US")}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* لقطات الكاميرا الفعلية — الدليل المصوَّر */}
                          {snSession === a.sessionId && (
                            <div className="mt-2 rounded-lg border bg-secondary/30 p-2">
                              {snQuery.isLoading && <p className="text-center text-xs text-muted-foreground">{t("loading")}</p>}
                              {snQuery.data?.length === 0 && <p className="text-center text-xs text-muted-foreground">{t("noSnapshots")}</p>}
                              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                                {snQuery.data?.map((sn) => {
                                  const time = new Date(sn.capturedAt).toLocaleTimeString(lang === "ar" ? "ar-SA" : "en-US");
                                  return (
                                    <button key={sn.id} type="button" onClick={() => setLightbox({ image: sn.image, time })}
                                      className={`overflow-hidden rounded border ${sn.flagged ? "ring-2 ring-red-300" : ""}`}>
                                      <img src={sn.image} alt="" className="aspect-[4/3] w-full bg-black object-cover" loading="lazy" />
                                      <span className="block bg-black/60 text-center text-[9px] text-white" dir="ltr">{time}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* عرض اللقطة مُكبّرة داخل النظام (بديل فتح data: في تبويب — يمنعه المتصفح) */}
      <Dialog open={!!lightbox} onOpenChange={() => setLightbox(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Camera className="h-5 w-5" /> {t("cameraSnapshots")} <span className="text-sm font-normal text-muted-foreground" dir="ltr">{lightbox?.time}</span></DialogTitle></DialogHeader>
          {lightbox && <img src={lightbox.image} alt="" className="max-h-[75vh] w-full rounded-lg bg-black object-contain" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
