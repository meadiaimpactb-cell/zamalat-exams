import { useI18n } from "@/i18n";
import { useAuth } from "@/providers/auth";
import { trpc } from "@/providers/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { FileEdit, Database, GraduationCap, MonitorPlay } from "lucide-react";

export default function Overview() {
  const { t } = useI18n();
  const { user } = useAuth();
  const stats = trpc.admin.stats.useQuery();

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
