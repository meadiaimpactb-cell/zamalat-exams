import { Link } from "react-router";
import { useI18n } from "@/i18n";
import { Logo } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";

export default function ExamDone() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen items-center justify-center brand-gradient p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-2xl">
        <div className="mb-4 flex justify-center"><Logo size="lg" /></div>
        <CheckCircle2 className="mx-auto mb-4 h-16 w-16 text-emerald-600" />
        <h2 className="text-2xl font-bold text-brand">{t("examSubmitted")}</h2>
        <p className="mt-3 text-muted-foreground">{t("resultLater")}</p>
        <Link to="/exam">
          <Button className="mt-6 bg-brand">{t("checkResult")}</Button>
        </Link>
      </div>
    </div>
  );
}
