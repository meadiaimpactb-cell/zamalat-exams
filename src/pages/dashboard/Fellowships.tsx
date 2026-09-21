import { useState } from "react";
import { useI18n } from "@/i18n";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Award, Plus, Pencil, Trash2, X, Route, Users } from "lucide-react";
import { toast } from "sonner";
import { useDeleteConfirm } from "@/providers/confirm";
import { usePermission } from "@/lib/permissions";

const empty = { nameAr: "", nameEn: "", description: "" };

export default function Fellowships() {
  const { t, lang } = useI18n();
  const utils = trpc.useUtils();
  const askDelete = useDeleteConfirm();
  const { can } = usePermission();
  const canManage = can("fellowships.manage"); // مدير الزمالة: عرض فقط
  const fellowships = trpc.admin.listFellowships.useQuery();
  const banks = trpc.bank.listBanks.useQuery();
  const tracks = trpc.admin.listTracks.useQuery();
  const cohorts = trpc.admin.listCohorts.useQuery();

  const create = trpc.admin.createFellowship.useMutation({
    onSuccess: () => { utils.admin.listFellowships.invalidate(); close(); toast.success(t("toastAdded")); },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.admin.updateFellowship.useMutation({
    onSuccess: () => { utils.admin.listFellowships.invalidate(); close(); toast.success(t("toastUpdated")); },
    onError: (e) => toast.error(e.message),
  });
  const del = trpc.admin.deleteFellowship.useMutation({
    onSuccess: () => { utils.admin.listFellowships.invalidate(); utils.bank.listBanks.invalidate(); utils.admin.listTracks.invalidate(); utils.admin.listCohorts.invalidate(); toast.success(t("toastDeleted")); },
    onError: (e) => toast.error(e.message),
  });
  const addTrack = trpc.admin.createTrack.useMutation({ onSuccess: () => utils.admin.listTracks.invalidate(), onError: (e) => toast.error(e.message) });
  const delTrack = trpc.admin.deleteTrack.useMutation({ onSuccess: () => utils.admin.listTracks.invalidate() });
  const addCohort = trpc.admin.createCohort.useMutation({ onSuccess: () => utils.admin.listCohorts.invalidate(), onError: (e) => toast.error(e.message) });
  const delCohort = trpc.admin.deleteCohort.useMutation({ onSuccess: () => utils.admin.listCohorts.invalidate() });

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(empty);
  const [trackInput, setTrackInput] = useState<Record<number, string>>({});
  const [cohortInput, setCohortInput] = useState<Record<number, string>>({});

  const close = () => { setOpen(false); setEditingId(null); setForm(empty); };
  const openCreate = () => { setEditingId(null); setForm(empty); setOpen(true); };
  const openEdit = (f: NonNullable<typeof fellowships.data>[number]) => {
    setEditingId(f.id);
    setForm({ nameAr: f.nameAr, nameEn: f.nameEn ?? "", description: f.description ?? "" });
    setOpen(true);
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) update.mutate({ id: editingId, ...form });
    else create.mutate(form);
  };

  const bankCount = (fid: number) => (banks.data ?? []).filter((b) => b.fellowshipId === fid).length;
  const fTracks = (fid: number) => (tracks.data ?? []).filter((x) => x.fellowshipId === fid);
  const fCohorts = (fid: number) => (cohorts.data ?? []).filter((x) => x.fellowshipId === fid);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-xl font-bold text-brand"><Award className="h-5 w-5" /> {t("fellowships")}</h2>
        {canManage && <Button className="bg-accent-brand text-white" onClick={openCreate}><Plus className="me-2 h-4 w-4" /> {t("createFellowship")}</Button>}
      </div>

      {fellowships.data?.length === 0 && (
        <Card><CardContent className="p-10 text-center text-muted-foreground">{t("noFellowships")}</CardContent></Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {fellowships.data?.map((f) => (
          <Card key={f.id} className="shadow-sm">
            <CardContent className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-brand">{lang === "ar" ? f.nameAr : f.nameEn || f.nameAr}</p>
                  <p className="text-xs text-muted-foreground">{f.description || (lang === "ar" ? f.nameEn : f.nameAr)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{bankCount(f.id)} {t("questionBank")}</p>
                </div>
                {canManage && (
                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant="ghost" title={t("edit")} onClick={() => openEdit(f)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" className="text-destructive" title={t("delete")} onClick={() => askDelete(() => del.mutate({ id: f.id }), { description: `${t("confirmDeleteDesc")} (${lang === "ar" ? f.nameAr : f.nameEn || f.nameAr})` })}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                )}
              </div>

              {/* المسارات التابعة للزمالة */}
              <div className="rounded-lg border bg-secondary/30 p-3">
                <p className="mb-2 flex items-center gap-1.5 text-sm font-medium"><Route className="h-4 w-4 text-brand" /> {t("tracksLabel")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {fTracks(f.id).map((tr) => (
                    <Badge key={tr.id} variant="outline" className="gap-1 py-1">
                      {lang === "ar" ? tr.nameAr : tr.nameEn || tr.nameAr}
                      {canManage && <button onClick={() => askDelete(() => delTrack.mutate({ id: tr.id }))} className="text-destructive hover:opacity-70"><X className="h-3 w-3" /></button>}
                    </Badge>
                  ))}
                  {fTracks(f.id).length === 0 && <span className="text-xs text-muted-foreground">{t("noTracksYet")}</span>}
                </div>
                {canManage && (
                <div className="mt-2 flex gap-2">
                  <Input className="h-8 text-sm" placeholder={t("addTrackPh")}
                    value={trackInput[f.id] ?? ""} onChange={(e) => setTrackInput({ ...trackInput, [f.id]: e.target.value })}
                    onKeyDown={(e) => { if (e.key === "Enter" && trackInput[f.id]?.trim()) { addTrack.mutate({ fellowshipId: f.id, nameAr: trackInput[f.id].trim() }); setTrackInput({ ...trackInput, [f.id]: "" }); } }} />
                  <Button size="sm" variant="outline" disabled={!trackInput[f.id]?.trim()}
                    onClick={() => { addTrack.mutate({ fellowshipId: f.id, nameAr: trackInput[f.id].trim() }); setTrackInput({ ...trackInput, [f.id]: "" }); }}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                )}
              </div>

              {/* الدفعات التابعة للزمالة */}
              <div className="rounded-lg border bg-secondary/30 p-3">
                <p className="mb-2 flex items-center gap-1.5 text-sm font-medium"><Users className="h-4 w-4 text-brand" /> {t("cohortsLabel")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {fCohorts(f.id).map((co) => (
                    <Badge key={co.id} variant="outline" className="gap-1 py-1">
                      {lang === "ar" ? co.nameAr : co.nameEn || co.nameAr}
                      {canManage && <button onClick={() => askDelete(() => delCohort.mutate({ id: co.id }))} className="text-destructive hover:opacity-70"><X className="h-3 w-3" /></button>}
                    </Badge>
                  ))}
                  {fCohorts(f.id).length === 0 && <span className="text-xs text-muted-foreground">{t("noCohortsYet")}</span>}
                </div>
                {canManage && (
                <div className="mt-2 flex gap-2">
                  <Input className="h-8 text-sm" placeholder={t("addCohortPh")}
                    value={cohortInput[f.id] ?? ""} onChange={(e) => setCohortInput({ ...cohortInput, [f.id]: e.target.value })}
                    onKeyDown={(e) => { if (e.key === "Enter" && cohortInput[f.id]?.trim()) { addCohort.mutate({ fellowshipId: f.id, nameAr: cohortInput[f.id].trim() }); setCohortInput({ ...cohortInput, [f.id]: "" }); } }} />
                  <Button size="sm" variant="outline" disabled={!cohortInput[f.id]?.trim()}
                    onClick={() => { addCohort.mutate({ fellowshipId: f.id, nameAr: cohortInput[f.id].trim() }); setCohortInput({ ...cohortInput, [f.id]: "" }); }}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : close())}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingId ? t("editFellowship") : t("createFellowship")}</DialogTitle></DialogHeader>
          <form className="grid gap-3" onSubmit={submit}>
            <div className="grid gap-1.5"><Label>{t("fellowshipNameAr")} *</Label><Input required value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} /></div>
            <div className="grid gap-1.5"><Label>{t("fellowshipNameEn")} <span className="text-xs text-muted-foreground">({t("optionalLabel")})</span></Label><Input dir="ltr" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} /></div>
            <div className="grid gap-1.5"><Label>{t("descriptionLabel")}</Label><Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <Button type="submit" className="bg-brand" disabled={create.isPending || update.isPending}>{t("save")}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
