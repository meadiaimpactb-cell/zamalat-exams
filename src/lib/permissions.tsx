import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { useAuth } from "@/providers/auth";
import { useI18n } from "@/i18n";
import { can, canAny, type Permission } from "@contracts/permissions";
import { ShieldAlert } from "lucide-react";

/** hook مركزي للصلاحيات — مربوط بالمستخدم الحالي */
export function usePermission() {
  const { user } = useAuth();
  const role = user?.role ?? null;
  return {
    role,
    can: (p: Permission) => can(role, p),
    canAny: (ps: Permission[]) => canAny(role, ps),
  };
}

/** لفّ أي عنصر واجهة ليظهر فقط لمن يملك الصلاحية */
export function Can({ permission, any, children, fallback = null }: {
  permission?: Permission;
  any?: Permission[];
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { can: has, canAny: hasAny } = usePermission();
  const allowed = permission ? has(permission) : any ? hasAny(any) : true;
  return <>{allowed ? children : fallback}</>;
}

/** حارس مسار: يعرض المحتوى إن سُمح، وإلا يعيد التوجيه لصفحة "غير مصرّح" */
export function RequirePermission({ permission, children }: { permission: Permission; children: ReactNode }) {
  const { user } = useAuth();
  const { can: has } = usePermission();
  if (!user) return <Navigate to="/login" replace />;
  if (!has(permission)) return <Navigate to="/dashboard/403" replace />;
  return <>{children}</>;
}

/** صفحة "غير مصرّح — 403" */
export function Forbidden() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <ShieldAlert className="h-16 w-16 text-destructive" />
      <h2 className="text-2xl font-bold text-destructive">403</h2>
      <p className="text-lg font-semibold">{t("forbiddenTitle")}</p>
      <p className="max-w-md text-sm text-muted-foreground">{t("forbiddenDesc")}</p>
    </div>
  );
}
