import { useState } from "react";
import { Link } from "react-router";
import { useI18n } from "@/i18n";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/providers/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, FileEdit, Clock, Settings2 } from "lucide-react";
import { toast } from "sonner";

export default function Exams() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const exams = trpc.exam.list.useQuery();
  const fellowships = trpc.admin.listFellowships.useQuery();
  const create = trpc.exam.create.useMutation({
    onSuccess: () => { utils.exam.list.invalidate(); setOpen(false); toast.success("✓"); },
    onError: (e) => toast.error(e.message),
  });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    titleAr: "", titleEn: "", durationMin: 60, passScore: 60,
    shuffleQuestions: true, shuffleOptions: true, lockdown: true, proctoring: true, cameraRequired: false,
    instructionsAr: "", instructionsEn: "", fellowshipId: undefined as number | undefined,
  });

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      draft: "bg-slate-100 text-slate-600",
      open: "bg-emerald-100 text-emerald-700",
      closed: "bg-red-100 text-red-700",
      archived: "bg-zinc-200 text-zinc-600",
    };
    const labelKey = `status_${s}` as "status_draft";
    return <Badge className={map[s]}>{t(labelKey)}</Badge>;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-brand">{t("exams")}</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-accent-brand text-white hover:opacity-90">
              <Plus className="me-2 h-4 w-4" /> {t("createExam")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{t("createExam")}</DialogTitle>
            </DialogHeader>
            <form
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                create.mutate(form);
              }}
            >
              <div className="grid gap-2">
                <Label>{t("examTitle")} *</Label>
                <Input required value={form.titleAr} onChange={(e) => setForm({ ...form, titleAr: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>{t("examTitleEn")}</Label>
                <Input dir="ltr" value={form.titleEn} onChange={(e) => setForm({ ...form, titleEn: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>{t("duration")}</Label>
                  <Input type="number" min={5} value={form.durationMin} onChange={(e) => setForm({ ...form, durationMin: +e.target.value })} />
                </div>
                <div className="grid gap-2">
                  <Label>{t("passScore")}</Label>
                  <Input type="number" min={0} max={100} value={form.passScore} onChange={(e) => setForm({ ...form, passScore: +e.target.value })} />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>{t("fellowship")}</Label>
                <select
                  className="rounded-md border bg-background px-3 py-2"
                  value={form.fellowshipId ?? ""}
                  onChange={(e) => setForm({ ...form, fellowshipId: e.target.value ? +e.target.value : undefined })}
                >
                  <option value="">—</option>
                  {fellowships.data?.map((f) => (
                    <option key={f.id} value={f.id}>{lang === "ar" ? f.nameAr : f.nameEn}</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label>{t("instructions")} (عربي)</Label>
                <Textarea rows={4} value={form.instructionsAr} onChange={(e) => setForm({ ...form, instructionsAr: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>{t("instructions")} (English)</Label>
                <Textarea dir="ltr" rows={4} value={form.instructionsEn} onChange={(e) => setForm({ ...form, instructionsEn: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                {([
                  ["shuffleQuestions", t("shuffleQuestions")],
                  ["shuffleOptions", t("shuffleOptions")],
                  ["lockdown", t("lockdownMode")],
                  ["proctoring", t("proctoringMode")],
                  ["cameraRequired", t("cameraRequired")],
                ] as const).map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between rounded-lg border p-3">
                    <Label className="text-sm">{label}</Label>
                    <Switch
                      checked={form[key]}
                      onCheckedChange={(v) => setForm({ ...form, [key]: v })}
                    />
                  </div>
                ))}
              </div>
              <Button type="submit" className="bg-brand" disabled={create.isPending}>
                {create.isPending ? t("loading") : t("createExam")}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {exams.data?.length === 0 && (
        <Card><CardContent className="p-10 text-center text-muted-foreground">—</CardContent></Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {exams.data?.map((exam) => (
          <Card key={exam.id} className="flex flex-col shadow-sm transition-shadow hover:shadow-md">
            <CardContent className="flex flex-1 flex-col gap-3 p-5">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-bold leading-snug">{lang === "ar" ? exam.titleAr : exam.titleEn || exam.titleAr}</h3>
                {statusBadge(exam.status)}
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span className="rounded bg-secondary px-2 py-0.5 font-mono text-xs">{exam.code}</span>
                <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {exam.durationMin} {t("minutes")}</span>
                {exam.lockdown && <Badge variant="outline" className="text-xs">{t("lockdownMode")}</Badge>}
                {exam.shuffleQuestions && <Badge variant="outline" className="text-xs">{t("shuffleQuestions")}</Badge>}
              </div>
              {user?.role === "expert" && (
                <p className="text-xs text-muted-foreground">
                  {exam.createdBy === user.id ? `✓ ${t("createdByYou")}` : `✓ ${t("supervising")}`}
                </p>
              )}
              <div className="mt-auto pt-2">
                <Link to={`/dashboard/exams/${exam.id}`}>
                  <Button variant="outline" className="w-full border-brand text-brand hover:bg-brand hover:text-white">
                    <Settings2 className="me-2 h-4 w-4" />
                    {t("manageExam")}
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="hidden"><FileEdit /></div>
    </div>
  );
}
