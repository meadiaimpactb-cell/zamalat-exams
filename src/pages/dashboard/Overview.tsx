import { useI18n } from "@/i18n";
import { useAuth } from "@/providers/auth";
import { trpc } from "@/providers/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "react-router";
import { FileEdit, Database, GraduationCap, MonitorPlay, Eye, AlertTriangle, LockKeyhole } from "lucide-react";
import { can } from "@contracts/permissions";

export default function Overview() {
  const { t } = useI18n();
  const { user } = useAuth();
  const stats = trpc.admin.stats.useQuery();
  // لوحة المراقبة المباشرة بارزة في الواجهة الرئيسية — تحديث كل 10 ثوانٍ (ملاحظة 7)
  const canMonitor = can(user?.role, "monitoring.view");
  const live = trpc.monitor.liveSummary.useQuery(undefined, { enabled: canMonitor, refetchInterval: 10000 });

  const cards = [
    { icon: FileEdit, label: t("totalExams"), value: stats.data?.exams ?? "—" },
    { icon: Database, label: t("totalQuestions"), value: stats.data?.questions ?? "—" },
    { icon: GraduationCap, label: t("totalCandidates"), value: stats.data?.candidates ?? "—" },
    { icon: MonitorPlay, label: t("totalSessions"), value: stats.data?.sessions ?? "—" },
  ];

  const roleLabel = user?.role === "super_admin" ? t("role_super_admin") : user?.role === "admin" ? t("role_admin") : t("role_expert");

  return (
    <div className="space-y-6">
      <div className="rounded-2xl brand-gradient p-6 text-white shadow-lg">
        <h2 className="text-2xl font-bold">
          {t("welcome")}، {user?.nameAr}
        </h2>
        <p className="mt-1 text-white/80">{roleLabel}</p>
      </div>
      {canMonitor && live.data && (
        <Card className="border-2 border-emerald-500/60 shadow-md">
          <CardContent className="p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-lg font-bold text-brand">
                <span className="relative flex h-3 w-3"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" /></span>
                <Eye className="h-5 w-5" /> {t("liveMonitoring")}
              </h3>
              <Link to="/dashboard/monitoring" className="text-sm font-medium text-brand underline">{t("openMonitoring")}</Link>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                [t("openExamsCount"), live.data.openExams, "text-brand"],
                [t("activeNow"), live.data.active, "text-emerald-600"],
                [t("highRiskSessions"), live.data.highRisk, "text-amber-600"],
                [t("lockedSessions"), live.data.terminated, "text-red-600"],
              ].map(([label, val, cls], i) => (
                <div key={i} className="rounded-xl bg-secondary/50 p-3 text-center">
                  <p className={`text-3xl font-extrabold ${cls}`}>{val}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
            {live.data.exams.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {live.data.exams.map((e) => (
                  <div key={e.examId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2 text-sm">
                    <span className="font-medium">{e.titleAr} <span className="font-mono text-xs text-muted-foreground">{e.code}</span></span>
                    <span className="flex items-center gap-3 text-xs">
                      <span className="text-emerald-700">{t("activeNow")}: {e.active}/{e.registered}</span>
                      {e.highRisk > 0 && <span className="flex items-center gap-1 text-amber-600"><AlertTriangle className="h-3.5 w-3.5" /> {e.highRisk}</span>}
                      {e.terminated > 0 && <span className="flex items-center gap-1 text-red-600"><LockKeyhole className="h-3.5 w-3.5" /> {e.terminated}</span>}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {live.data.openExams === 0 && <p className="mt-2 text-sm text-muted-foreground">{t("noOpenExams")}</p>}
          </CardContent>
        </Card>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c, i) => (
          <Card key={i} className="shadow-sm">
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[hsl(193,37%,30%)]/10 text-brand">
                <c.icon className="h-6 w-6" />
              </div>
              <div>
                <p className="text-2xl font-extrabold text-brand">{c.value}</p>
                <p className="text-sm text-muted-foreground">{c.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
