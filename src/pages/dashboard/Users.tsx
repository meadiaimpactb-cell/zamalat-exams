import { useState } from "react";
import { useI18n } from "@/i18n";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Users as UsersIcon } from "lucide-react";
import { toast } from "sonner";

export default function Users() {
  const { t } = useI18n();
  const utils = trpc.useUtils();
  const users = trpc.admin.listUsers.useQuery();
  const create = trpc.admin.createUser.useMutation({
    onSuccess: () => { utils.admin.listUsers.invalidate(); setOpen(false); toast.success("✓"); },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.admin.updateUser.useMutation({
    onSuccess: () => utils.admin.listUsers.invalidate(),
    onError: (e) => toast.error(e.message),
  });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ username: "", password: "", nameAr: "", nameEn: "", email: "", role: "expert" as "expert" | "admin" | "super_admin" });

  const roleLabel = (r: string) => (r === "super_admin" ? t("role_super_admin") : r === "admin" ? t("role_admin") : t("role_expert"));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-xl font-bold text-brand"><UsersIcon className="h-5 w-5" /> {t("users")}</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-accent-brand text-white"><Plus className="me-2 h-4 w-4" /> {t("createUser")}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("createUser")}</DialogTitle></DialogHeader>
            <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); create.mutate(form); }}>
              <div className="grid gap-1.5"><Label>{t("username")} *</Label><Input required dir="ltr" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></div>
              <div className="grid gap-1.5"><Label>{t("password")} * (8+)</Label><Input required type="password" dir="ltr" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
              <div className="grid gap-1.5"><Label>{t("name")} (عربي) *</Label><Input required value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} /></div>
              <div className="grid gap-1.5"><Label>{t("name")} (English) *</Label><Input required dir="ltr" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} /></div>
              <div className="grid gap-1.5"><Label>{t("email")}</Label><Input dir="ltr" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div className="grid gap-1.5">
                <Label>{t("role")}</Label>
                <select className="rounded-md border px-3 py-2" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as "expert" })}>
                  <option value="expert">{t("role_expert")}</option>
                  <option value="admin">{t("role_admin")}</option>
                  <option value="super_admin">{t("role_super_admin")}</option>
                </select>
              </div>
              <Button type="submit" className="bg-brand" disabled={create.isPending}>{t("save")}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-3">
        {users.data?.map((u) => (
          <Card key={u.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-bold">{u.nameAr} <span className="text-sm font-normal text-muted-foreground">({u.nameEn})</span></p>
                <p className="text-xs text-muted-foreground" dir="ltr">@{u.username} · {u.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-brand">{roleLabel(u.role)}</Badge>
                <Badge variant={u.active ? "outline" : "destructive"}>{u.active ? t("active") : "—"}</Badge>
                <Button size="sm" variant="outline" onClick={() => update.mutate({ id: u.id, active: !u.active })}>
                  {u.active ? t("delete") : t("active")}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
