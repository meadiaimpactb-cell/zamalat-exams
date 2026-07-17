import { useState } from "react";
import { useI18n } from "@/i18n";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { GraduationCap, Plus, ClipboardPaste, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function Candidates() {
  const { t } = useI18n();
  const utils = trpc.useUtils();
  const candidates = trpc.admin.listCandidates.useQuery();
  const create = trpc.admin.createCandidate.useMutation({
    onSuccess: () => { utils.admin.listCandidates.invalidate(); setOpen(false); toast.success("✓"); },
    onError: (e) => toast.error(e.message),
  });
  const importMut = trpc.admin.importCandidates.useMutation({
    onSuccess: (r) => { utils.admin.listCandidates.invalidate(); setImportOpen(false); toast.success(`${r.created} ✓ (${r.skipped} ⤼)`); },
    onError: (e) => toast.error(e.message),
  });
  const del = trpc.admin.deleteCandidate.useMutation({ onSuccess: () => utils.admin.listCandidates.invalidate() });

  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [csv, setCsv] = useState("");
  const [form, setForm] = useState({ nationalId: "", nameAr: "", nameEn: "", email: "", phone: "", fellowship: "", track: "", cohort: "" });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-xl font-bold text-brand"><GraduationCap className="h-5 w-5" /> {t("candidates")}</h2>
        <div className="flex gap-2">
          <Dialog open={importOpen} onOpenChange={setImportOpen}>
            <DialogTrigger asChild>
              <Button variant="outline"><ClipboardPaste className="me-2 h-4 w-4" /> {t("importCandidates")}</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl">
              <DialogHeader><DialogTitle>{t("importCandidates")}</DialogTitle></DialogHeader>
              <p className="text-xs text-muted-foreground">{t("importHint")}</p>
              <Textarea rows={10} dir="ltr" className="font-mono text-xs" value={csv} onChange={(e) => setCsv(e.target.value)}
                placeholder={"1000000010,أحمد الزميل,Ahmed,ahmed@x.com,0500000010,زمالة القيادة الصحية,إدارة المنشآت,دفعة 2026"} />
              <Button className="bg-brand" disabled={!csv || importMut.isPending} onClick={() => importMut.mutate({ csv })}>{t("importCandidates")}</Button>
            </DialogContent>
          </Dialog>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-accent-brand text-white"><Plus className="me-2 h-4 w-4" /> {t("createCandidate")}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{t("createCandidate")}</DialogTitle></DialogHeader>
              <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); create.mutate(form); }}>
                <div className="grid gap-1.5"><Label>{t("nationalId")} *</Label><Input required dir="ltr" value={form.nationalId} onChange={(e) => setForm({ ...form, nationalId: e.target.value })} /></div>
                <div className="grid gap-1.5"><Label>{t("name")} (عربي) *</Label><Input required value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} /></div>
                <div className="grid gap-1.5"><Label>{t("name")} (English)</Label><Input dir="ltr" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5"><Label>{t("email")}</Label><Input dir="ltr" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                  <div className="grid gap-1.5"><Label>{t("phone")}</Label><Input dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="grid gap-1.5"><Label>{t("fellowship")}</Label><Input value={form.fellowship} onChange={(e) => setForm({ ...form, fellowship: e.target.value })} /></div>
                  <div className="grid gap-1.5"><Label>{t("track")}</Label><Input value={form.track} onChange={(e) => setForm({ ...form, track: e.target.value })} /></div>
                  <div className="grid gap-1.5"><Label>{t("cohort")}</Label><Input value={form.cohort} onChange={(e) => setForm({ ...form, cohort: e.target.value })} /></div>
                </div>
                <Button type="submit" className="bg-brand" disabled={create.isPending}>{t("save")}</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b bg-secondary/50">
              <tr>
                {[t("nationalId"), t("name"), t("email"), t("phone"), t("fellowship"), t("cohort"), t("actions")].map((h) => (
                  <th key={h} className="p-3 text-start font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {candidates.data?.map((c) => (
                <tr key={c.id} className="border-b last:border-0 hover:bg-secondary/30">
                  <td className="p-3 font-mono" dir="ltr">{c.nationalIdMasked}</td>
                  <td className="p-3 font-medium">{c.nameAr}</td>
                  <td className="p-3" dir="ltr">{c.email}</td>
                  <td className="p-3" dir="ltr">{c.phone}</td>
                  <td className="p-3">{c.fellowship}</td>
                  <td className="p-3">{c.cohort}</td>
                  <td className="p-3">
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => del.mutate({ id: c.id })}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
