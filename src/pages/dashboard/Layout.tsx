import { NavLink, Outlet, useNavigate, Navigate } from "react-router";
import { useI18n } from "@/i18n";
import { useAuth } from "@/providers/auth";
import { LanguageSwitcher, Logo } from "@/components/shared";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, FileEdit, Database, BrainCircuit, Eye, ClipboardCheck,
  Trophy, Users, GraduationCap, ScrollText, LogOut, Menu, X,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export default function DashboardLayout() {
  const { t } = useI18n();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  if (!user) return <Navigate to="/login" replace />;

  const isAdmin = user.role === "admin" || user.role === "super_admin";
  const nav = [
    { to: "/dashboard", icon: LayoutDashboard, label: t("overview"), end: true },
    { to: "/dashboard/exams", icon: FileEdit, label: t("exams") },
    { to: "/dashboard/bank", icon: Database, label: t("questionBank") },
    { to: "/dashboard/ai", icon: BrainCircuit, label: t("aiStudio") },
    { to: "/dashboard/monitoring", icon: Eye, label: t("monitoring") },
    { to: "/dashboard/grading", icon: ClipboardCheck, label: t("grading") },
    { to: "/dashboard/results", icon: Trophy, label: t("results") },
    ...(isAdmin ? [
      { to: "/dashboard/candidates", icon: GraduationCap, label: t("candidates") },
      { to: "/dashboard/users", icon: Users, label: t("users") },
    ] : []),
    ...(user.role === "super_admin" ? [{ to: "/dashboard/audit", icon: ScrollText, label: t("auditLog") }] : []),
  ];

  const roleLabel = user.role === "super_admin" ? t("role_super_admin") : user.role === "admin" ? t("role_admin") : t("role_expert");

  const sidebar = (
    <div className="flex h-full flex-col bg-[hsl(193,40%,22%)] text-white">
      <div className="flex items-center justify-center border-b border-white/10 bg-white p-3">
        <Logo size="md" />
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {nav.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive ? "bg-[hsl(22,60%,55%)] text-white shadow" : "text-white/75 hover:bg-white/10 hover:text-white",
              )
            }
          >
            <n.icon className="h-4.5 w-4.5 shrink-0" />
            {n.label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-white/10 p-3">
        <div className="mb-2 rounded-lg bg-white/5 p-3">
          <p className="text-sm font-bold">{user.nameAr}</p>
          <p className="text-xs text-white/60">{roleLabel}</p>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start text-white/80 hover:bg-white/10 hover:text-white"
          onClick={() => { logout(); navigate("/"); }}
        >
          <LogOut className="me-2 h-4 w-4" />
          {t("logout")}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 lg:block">{sidebar}</aside>
      {/* Mobile sidebar */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 start-0 w-64">{sidebar}</aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-white px-4 py-2.5">
          <div className="flex items-center gap-2">
            <button className="lg:hidden" onClick={() => setOpen(!open)}>
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <h1 className="text-lg font-bold text-brand">{t("platformShort")} — {t("dashboard")}</h1>
          </div>
          <LanguageSwitcher />
        </header>
        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
