import { useI18n } from "@/i18n";
import { trpc } from "@/providers/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollText } from "lucide-react";

export default function Audit() {
  const { t, lang } = useI18n();
  const logs = trpc.admin.auditLogs.useQuery({ limit: 200 });

  return (
    <div className="space-y-5">
      <h2 className="flex items-center gap-2 text-xl font-bold text-brand"><ScrollText className="h-5 w-5" /> {t("auditLog")}</h2>
      <Card>
        <CardContent className="space-y-2 p-4">
          {logs.data?.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="font-mono text-xs">{l.action}</Badge>
                <span className="font-medium">{l.actorName}</span>
                {l.entityType && <span className="text-muted-foreground">{l.entityType} #{l.entityId}</span>}
              </div>
              <div className="flex items-center gap-3">
                {l.details && <span className="text-xs text-muted-foreground">{l.details}</span>}
                <span className="text-xs text-muted-foreground">{new Date(l.createdAt).toLocaleString(lang === "ar" ? "ar-SA" : "en-US")}</span>
              </div>
            </div>
          ))}
          {logs.data?.length === 0 && <p className="py-8 text-center text-muted-foreground">—</p>}
        </CardContent>
      </Card>
    </div>
  );
}
