import { useState, useEffect } from "react";
import { useI18n } from "@/i18n";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Users as UsersIcon, ShieldCheck, Trash2, Lock, Unlock, Pencil, Upload } from "lucide-react";
import { toast } from "sonner";
import { useConfirm, useDeleteConfirm } from "@/providers/confirm";
import { v, type VKey } from "@contracts/validation";

export default function Users() {
  const { t, lang } = useI18n();
  const utils = trpc.useUtils();
  const confirm = useConfirm();
  const askDelete = useDeleteConfirm();
  const users = trpc.admin.listUsers.useQuery();
  const removeUser = trpc.admin.deleteUser.useMutation({
    onSuccess: () => { utils.admin.listUsers.invalidate(); toast.success(t("toastDeleted")); },
    onError: (e) => toast.error(e.message),
  });
  const bulkDelUsers = trpc.admin.deleteUsers.useMutation({
    onSuccess: (r) => { utils.admin.listUsers.invalidate(); setSelected(new Set()); toast.success(`${t("toastDeleted")} (${r.deleted})${r.skipped ? ` — ${r.skipped} ⤼` : ""}`); },
    onError: (e) => toast.error(e.message),
  });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const deletable = (users.data ?? []).filter((u) => u.role !== "super_admin");
  const create = trpc.admin.createUser.useMutation({
    onSuccess: () => { utils.admin.listUsers.invalidate(); setOpen(false); toast.success(t("toastAdded")); },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.admin.updateUser.useMutation({
    onSuccess: () => { utils.admin.listUsers.invalidate(); toast.success(t("toastUpdated")); },
    onError: (e) => toast.error(e.message),
  });
  const fellowships = trpc.admin.listFellowships.useQuery();
  const [open, setOpen] = useState(false);
  const [errs, setErrs] = useState<Record<string, VKey>>({});
  const [form, setForm] = useState({ username: "", password: "", nameAr: "", nameEn: "", email: "", phone: "", avatarUrl: "", role: "expert" as "expert" | "admin" | "super_admin" | "tech_general" | "fellowship_manager", fellowshipIds: [] as number[] });

  const roleLabel = (r: string) => t(`role_${r}` as "role_expert");

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
            <form className="grid gap-3" onSubmit={(e) => {
              e.preventDefault();
              const er = { username: v.username(form.username), password: v.password(form.password), nameAr: v.min(form.nameAr, 2), nameEn: null, email: v.email(form.email), phone: v.phone(form.phone) }; // الإنجليزي اختياري (ملاحظة 9)
              setErrs(er);
              if (Object.values(er).some(Boolean)) return;
              if (form.role === "fellowship_manager" && form.fellowshipIds.length === 0) { toast.error(t("fellowshipRequiredForManager")); return; }
              create.mutate(form);
            }}>
              <div className="grid gap-1.5"><Label>{t("profilePicture")}</Label><AvatarPicker value={form.avatarUrl} onChange={(v) => setForm({ ...form, avatarUrl: v })} /></div>
              <div className="grid gap-1.5"><Label>{t("username")} *</Label><Input required dir="ltr" aria-invalid={!!errs.username} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} onBlur={() => setErrs({ ...errs, username: v.username(form.username) })} />{errs.username && <p className="text-xs text-destructive">{t(errs.username)}</p>}</div>
              <div className="grid gap-1.5"><Label>{t("password")} *</Label><Input required type="password" dir="ltr" aria-invalid={!!errs.password} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} onBlur={() => setErrs({ ...errs, password: v.password(form.password) })} />{errs.password && <p className="text-xs text-destructive">{t(errs.password)}</p>}</div>
              <div className="grid gap-1.5"><Label>{t("name")} (عربي) *</Label><Input required aria-invalid={!!errs.nameAr} value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} onBlur={() => setErrs({ ...errs, nameAr: v.min(form.nameAr, 2) })} />{errs.nameAr && <p className="text-xs text-destructive">{t(errs.nameAr)}</p>}</div>
              <div className="grid gap-1.5"><Label>{t("name")} (English) <span className="text-xs text-muted-foreground">({t("optionalLabel")})</span></Label><Input dir="ltr" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} /></div>
              <div className="grid gap-1.5"><Label>{t("email")}</Label><Input dir="ltr" aria-invalid={!!errs.email} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} onBlur={() => setErrs({ ...errs, email: v.email(form.email) })} />{errs.email && <p className="text-xs text-destructive">{t(errs.email)}</p>}</div>
              <div className="grid gap-1.5"><Label>{t("phone")}</Label><Input dir="ltr" placeholder="05XXXXXXXX" aria-invalid={!!errs.phone} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} onBlur={() => setErrs({ ...errs, phone: v.phone(form.phone) })} />{errs.phone && <p className="text-xs text-destructive">{t(errs.phone)}</p>}</div>
              <div className="grid gap-1.5">
                <Label>{t("role")}</Label>
                <select className="rounded-md border px-3 py-2" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as "expert", fellowshipIds: [] })}>
                  <option value="expert">{t("role_expert")}</option>
                  <option value="fellowship_manager">{t("role_fellowship_manager")}</option>
                  <option value="tech_general">{t("role_tech_general")}</option>
                  <option value="admin">{t("role_admin")}</option>
                  <option value="super_admin">{t("role_super_admin")}</option>
                </select>
              </div>
              {/* اختيار الزمالة المُدارة — زمالة واحدة فقط لمدير الزمالة */}
              {form.role === "fellowship_manager" && (
                <div className="grid gap-1.5 rounded-lg border p-3">
                  <Label>{t("selectFellowshipsForManager")} *</Label>
                  <select className="rounded-md border bg-background px-3 py-2 text-sm"
                    value={form.fellowshipIds[0] ?? ""}
                    onChange={(e) => setForm({ ...form, fellowshipIds: e.target.value ? [+e.target.value] : [] })}>
                    <option value="">— {t("fellowship")} —</option>
                    {fellowships.data?.map((f) => (
                      <option key={f.id} value={f.id}>{lang === "ar" ? f.nameAr : f.nameEn || f.nameAr}</option>
                    ))}
                  </select>
                </div>
              )}
              <Button type="submit" className="bg-brand" disabled={create.isPending}>{t("save")}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* شريط الإجراءات الجماعية + تحديد الكل (لغير مديري النظام) */}
      {deletable.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-secondary/60 p-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox"
              checked={selected.size > 0 && deletable.every((u) => selected.has(u.id))}
              onChange={(e) => setSelected(e.target.checked ? new Set(deletable.map((u) => u.id)) : new Set())} />
            {t("selectAll")} ({deletable.length})
          </label>
          {selected.size > 0 && (
            <>
              <span className="rounded-full bg-brand px-2 py-0.5 text-xs text-white">{selected.size} {t("selectedCount")}</span>
              <Button size="sm" variant="destructive" disabled={bulkDelUsers.isPending}
                onClick={() => askDelete(() => bulkDelUsers.mutate({ ids: [...selected] }), { description: `${t("deleteUserWarn")} (${selected.size})` })}>
                <Trash2 className="me-1 h-4 w-4" /> {t("delete")} ({selected.size})
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>{t("clearSelection")}</Button>
            </>
          )}
        </div>
      )}

      <div className="grid gap-3">
        {users.data?.map((u) => (
          <Card key={u.id} className={selected.has(u.id) ? "ring-2 ring-brand" : ""}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex items-center gap-3">
                {u.role !== "super_admin" && (
                  <input type="checkbox" className="h-4 w-4" checked={selected.has(u.id)} onChange={() => setSelected((s) => { const n = new Set(s); if (n.has(u.id)) n.delete(u.id); else n.add(u.id); return n; })} />
                )}
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-secondary">
                  {u.avatarUrl ? <img src={u.avatarUrl} alt={u.nameAr} className="h-full w-full object-cover" /> : <UsersIcon className="h-5 w-5 text-muted-foreground" />}
                </div>
                <div>
                  <p className="font-bold">{u.nameAr} <span className="text-sm font-normal text-muted-foreground">{u.nameEn ? `(${u.nameEn})` : ""}</span></p>
                  <p className="text-xs text-muted-foreground" dir="ltr">@{u.username}{u.email ? ` · ${u.email}` : ""}{u.phone ? ` · ${u.phone}` : ""}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge className="bg-brand">{roleLabel(u.role)}</Badge>
                <EditUserDialog user={u} />
                {u.role === "super_admin" ? (
                  <Badge variant="outline" className="gap-1 border-emerald-300 text-emerald-700" title={t("superAdminProtected")}>
                    <ShieldCheck className="h-3.5 w-3.5" /> {t("protectedAccount")}
                  </Badge>
                ) : (
                  <>
                    {/* زر التفعيل/التعطيل المستقل (Open/Close) — يتحكم بصلاحية الدخول */}
                    <div className="flex items-center gap-2 rounded-lg border px-3 py-1.5" title={t("loginAccess")}>
                      {u.active ? <Unlock className="h-4 w-4 text-emerald-600" /> : <Lock className="h-4 w-4 text-muted-foreground" />}
                      <span className={`text-xs font-medium ${u.active ? "text-emerald-700" : "text-muted-foreground"}`}>
                        {u.active ? t("enabledLabel") : t("disabledLabel")}
                      </span>
                      <Switch
                        checked={u.active}
                        onCheckedChange={async (val) => {
                          if (val) { update.mutate({ id: u.id, active: true }); return; }
                          if (await confirm({ title: t("deactivateUserTitle"), description: `${t("deactivateUserWarn")} (${u.nameAr})`, danger: true, confirmText: t("disabledLabel") })) {
                            update.mutate({ id: u.id, active: false });
                          }
                        }}
                      />
                    </div>
                    {/* زر الحذف النهائي */}
                    <Button size="sm" variant="ghost" className="text-destructive" title={t("delete")}
                      onClick={() => askDelete(() => removeUser.mutate({ id: u.id }), { title: t("confirmDeleteTitle"), description: `${t("deleteUserWarn")} (${u.nameAr})` })}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

type EditableRole = "expert" | "admin" | "super_admin" | "tech_general" | "fellowship_manager";
type UserRow = {
  id: number; username: string; nameAr: string; nameEn: string | null;
  email: string | null; phone?: string | null; avatarUrl?: string | null; role: EditableRole; active: boolean;
};

/** قراءة صورة وتصغيرها إلى 256×256 JPEG (تبقى الصورة صغيرة الحجم) */
function fileToAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const size = 256;
        const canvas = document.createElement("canvas");
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("canvas"));
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale, h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** منتقي الصورة الشخصية (معاينة دائرية + رفع/إزالة) */
function AvatarPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useI18n();
  const [inputId] = useState(() => "avatar-" + Math.random().toString(36).slice(2));
  const pick = async (file?: File) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { toast.error(t("imageTooLarge")); return; }
    try { onChange(await fileToAvatar(file)); } catch { toast.error(t("imageTooLarge")); }
  };
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-secondary">
        {value ? <img src={value} alt="" className="h-full w-full object-cover" /> : <UsersIcon className="h-6 w-6 text-muted-foreground" />}
      </div>
      <div className="flex flex-col items-start gap-1.5">
        <input id={inputId} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        <Button type="button" size="sm" variant="outline" onClick={() => document.getElementById(inputId)?.click()}>
          <Upload className="me-1.5 h-3.5 w-3.5" /> {value ? t("changePhoto") : t("uploadPhoto")}
        </Button>
        {value && <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive" onClick={() => onChange("")}>{t("removePhoto")}</Button>}
      </div>
    </div>
  );
}

/** نافذة تعديل بيانات المستخدم + تغيير كلمة المرور (اختياري) */
function EditUserDialog({ user }: { user: UserRow }) {
  const { t, lang } = useI18n();
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [errs, setErrs] = useState<Record<string, VKey>>({});
  const [form, setForm] = useState({
    nameAr: user.nameAr, nameEn: user.nameEn ?? "", email: user.email ?? "", phone: user.phone ?? "",
    avatarUrl: user.avatarUrl ?? "", role: user.role as EditableRole, password: "", fellowshipIds: [] as number[],
  });

  const fellowships = trpc.admin.listFellowships.useQuery(undefined, { enabled: open });
  const currentFellowships = trpc.admin.userFellowships.useQuery(
    { userId: user.id },
    { enabled: open && user.role === "fellowship_manager" },
  );

  // إعادة ضبط النموذج عند فتح النافذة
  useEffect(() => {
    if (open) {
      setErrs({});
      setForm({
        nameAr: user.nameAr, nameEn: user.nameEn ?? "", email: user.email ?? "", phone: user.phone ?? "",
        avatarUrl: user.avatarUrl ?? "", role: user.role, password: "", fellowshipIds: [],
      });
    }
  }, [open, user]);

  // تعبئة الزمالة الحالية لمدير الزمالة
  useEffect(() => {
    if (currentFellowships.data) setForm((f) => ({ ...f, fellowshipIds: currentFellowships.data! }));
  }, [currentFellowships.data]);

  const update = trpc.admin.updateUser.useMutation({
    onSuccess: () => { utils.admin.listUsers.invalidate(); setOpen(false); toast.success(t("toastUpdated")); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" title={t("edit")}><Pencil className="h-4 w-4" /></Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("editUser")} — {user.nameAr}</DialogTitle></DialogHeader>
        <form className="grid gap-3" onSubmit={(e) => {
          e.preventDefault();
          const er: Record<string, VKey> = {
            nameAr: v.min(form.nameAr, 2), nameEn: null,
            email: v.email(form.email), phone: v.phone(form.phone),
          };
          if (form.password) er.password = v.password(form.password);
          setErrs(er);
          if (Object.values(er).some(Boolean)) return;
          if (form.role === "fellowship_manager" && form.fellowshipIds.length === 0) { toast.error(t("fellowshipRequiredForManager")); return; }
          update.mutate({
            id: user.id,
            nameAr: form.nameAr, nameEn: form.nameEn, email: form.email, phone: form.phone,
            role: form.role, avatarUrl: form.avatarUrl,
            ...(form.password ? { password: form.password } : {}),
            fellowshipIds: form.role === "fellowship_manager" ? form.fellowshipIds : [],
          });
        }}>
          <div className="grid gap-1.5"><Label className="text-xs text-muted-foreground" dir="ltr">@{user.username}</Label></div>
          <div className="grid gap-1.5"><Label>{t("profilePicture")}</Label><AvatarPicker value={form.avatarUrl} onChange={(v) => setForm({ ...form, avatarUrl: v })} /></div>
          <div className="grid gap-1.5"><Label>{t("name")} (عربي)</Label><Input aria-invalid={!!errs.nameAr} value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} onBlur={() => setErrs({ ...errs, nameAr: v.min(form.nameAr, 2) })} />{errs.nameAr && <p className="text-xs text-destructive">{t(errs.nameAr)}</p>}</div>
          <div className="grid gap-1.5"><Label>{t("name")} (English) <span className="text-xs text-muted-foreground">({t("optionalLabel")})</span></Label><Input dir="ltr" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} /></div>
          <div className="grid gap-1.5"><Label>{t("email")}</Label><Input dir="ltr" aria-invalid={!!errs.email} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} onBlur={() => setErrs({ ...errs, email: v.email(form.email) })} />{errs.email && <p className="text-xs text-destructive">{t(errs.email)}</p>}</div>
          <div className="grid gap-1.5"><Label>{t("phone")}</Label><Input dir="ltr" placeholder="05XXXXXXXX" aria-invalid={!!errs.phone} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} onBlur={() => setErrs({ ...errs, phone: v.phone(form.phone) })} />{errs.phone && <p className="text-xs text-destructive">{t(errs.phone)}</p>}</div>
          <div className="grid gap-1.5">
            <Label>{t("role")}</Label>
            <select className="rounded-md border px-3 py-2" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as EditableRole, fellowshipIds: e.target.value === "fellowship_manager" ? form.fellowshipIds : [] })}>
              <option value="expert">{t("role_expert")}</option>
              <option value="fellowship_manager">{t("role_fellowship_manager")}</option>
              <option value="tech_general">{t("role_tech_general")}</option>
              <option value="admin">{t("role_admin")}</option>
              <option value="super_admin">{t("role_super_admin")}</option>
            </select>
          </div>
          {form.role === "fellowship_manager" && (
            <div className="grid gap-1.5 rounded-lg border p-3">
              <Label>{t("selectFellowshipsForManager")} *</Label>
              <select className="rounded-md border bg-background px-3 py-2 text-sm"
                value={form.fellowshipIds[0] ?? ""}
                onChange={(e) => setForm({ ...form, fellowshipIds: e.target.value ? [+e.target.value] : [] })}>
                <option value="">— {t("fellowship")} —</option>
                {fellowships.data?.map((f) => (
                  <option key={f.id} value={f.id}>{lang === "ar" ? f.nameAr : f.nameEn || f.nameAr}</option>
                ))}
              </select>
            </div>
          )}
          <div className="grid gap-1.5 rounded-lg border border-amber-200 bg-amber-50/50 p-3 dark:bg-amber-950/20">
            <Label className="flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" /> {t("changePassword")}</Label>
            <Input type="password" dir="ltr" autoComplete="new-password" placeholder={t("newPasswordOptional")} aria-invalid={!!errs.password} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} onBlur={() => setErrs({ ...errs, password: form.password ? v.password(form.password) : null })} />
            {errs.password ? <p className="text-xs text-destructive">{t(errs.password)}</p> : <p className="text-xs text-muted-foreground">{t("passwordUnchangedHint")}</p>}
          </div>
          <Button type="submit" className="bg-brand" disabled={update.isPending}>{t("save")}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
