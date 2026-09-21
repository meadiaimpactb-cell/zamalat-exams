import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Globe } from "lucide-react";

export function LanguageSwitcher({ variant = "outline" }: { variant?: "outline" | "ghost" | "secondary" }) {
  const { lang, setLang } = useI18n();
  return (
    <Button
      variant={variant}
      size="sm"
      onClick={() => setLang(lang === "ar" ? "en" : "ar")}
      className="gap-2"
    >
      <Globe className="h-4 w-4" />
      {lang === "ar" ? "English" : "عربي"}
    </Button>
  );
}

export function Logo({ size = "md", light = false }: { size?: "sm" | "md" | "lg"; light?: boolean }) {
  const heights = { sm: "h-9", md: "h-12", lg: "h-20" };
  return (
    <img
      src="/logo.png"
      alt="الزمالات المهنية | Professional Fellowships"
      className={`${heights[size]} w-auto object-contain ${light ? "brightness-0 invert" : ""}`}
    />
  );
}

export function RiskBadge({ score }: { score: number }) {
  const color =
    score >= 60 ? "bg-red-100 text-red-700 border-red-300" :
    score >= 30 ? "bg-amber-100 text-amber-700 border-amber-300" :
    "bg-emerald-100 text-emerald-700 border-emerald-300";
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${color}`}>
      {score}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: string }) {
  const { t } = useI18n();
  const map: Record<string, string> = {
    info: "bg-sky-100 text-sky-700 border-sky-300",
    low: "bg-slate-100 text-slate-600 border-slate-300",
    medium: "bg-amber-100 text-amber-700 border-amber-300",
    high: "bg-orange-100 text-orange-700 border-orange-300",
    critical: "bg-red-100 text-red-700 border-red-300",
  };
  const labels: Record<string, Parameters<ReturnType<typeof useI18n>["t"]>[0]> = {
    info: "severity_info", low: "severity_low", medium: "severity_medium", high: "severity_high", critical: "severity_critical",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${map[severity] ?? map.info}`}>
      {t(labels[severity] ?? "severity_info")}
    </span>
  );
}
