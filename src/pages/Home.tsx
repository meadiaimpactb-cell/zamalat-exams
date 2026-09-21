import { Link } from "react-router";
import { useI18n } from "@/i18n";
import { LanguageSwitcher, Logo } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ShieldCheck, BrainCircuit, LockKeyhole, Eye, BotMessageSquare, ClipboardCheck,
  Shuffle, TimerReset, GraduationCap, ArrowLeft, ArrowRight, Laptop,
} from "lucide-react";

export default function Home() {
  const { t, lang } = useI18n();
  const Arrow = lang === "ar" ? ArrowLeft : ArrowRight;

  const features = [
    { icon: GraduationCap, title: t("f1t"), desc: t("f1d") },
    { icon: BrainCircuit, title: t("f2t"), desc: t("f2d") },
    { icon: LockKeyhole, title: t("f3t"), desc: t("f3d") },
    { icon: Eye, title: t("f4t"), desc: t("f4d") },
    { icon: BotMessageSquare, title: t("f5t"), desc: t("f5d") },
    { icon: ClipboardCheck, title: t("f6t"), desc: t("f6d") },
    { icon: Shuffle, title: t("f7t"), desc: t("f7d") },
    { icon: TimerReset, title: t("f8t"), desc: t("f8d") },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Logo size="md" />
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <Link to="/login">
              <Button variant="default" className="bg-brand hover:opacity-90">
                <ShieldCheck className="me-2 h-4 w-4" />
                {t("staffPortal")}
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="brand-gradient relative overflow-hidden text-white">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)", backgroundSize: "60px 60px" }} />
        <div className="relative mx-auto max-w-7xl px-4 py-20 text-center">
          <div className="mx-auto mb-6 flex justify-center rounded-2xl bg-white p-4 shadow-xl" style={{ width: "fit-content" }}>
            <Logo size="lg" />
          </div>
          <h1 className="mx-auto max-w-3xl text-3xl font-extrabold leading-snug md:text-5xl md:leading-tight">
            {t("heroTitle")}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base text-white/85 md:text-lg">{t("heroSub")}</p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link to="/exam">
              <Button size="lg" className="bg-accent-brand text-white hover:opacity-90 shadow-lg">
                <GraduationCap className="me-2 h-5 w-5" />
                {t("candidatePortal")}
                <Arrow className="ms-2 h-4 w-4" />
              </Button>
            </Link>
            <Link to="/login">
              <Button size="lg" variant="outline" className="border-white/60 bg-white/10 text-white hover:bg-white/20">
                <ShieldCheck className="me-2 h-5 w-5" />
                {t("staffPortal")}
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-7xl px-4 py-16">
        <h2 className="mb-10 text-center text-2xl font-bold text-brand md:text-3xl">{t("featuresTitle")}</h2>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f, i) => (
            <Card key={i} className="border-t-4 border-t-[hsl(22,60%,55%)] shadow-sm transition-shadow hover:shadow-md">
              <CardContent className="p-5">
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[hsl(193,37%,30%)]/10 text-brand">
                  <f.icon className="h-6 w-6" />
                </div>
                <h3 className="mb-1.5 font-bold">{f.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Desktop lockdown */}
      <section className="border-t bg-white">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-6 px-4 py-14 md:flex-row">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-brand text-white">
            <Laptop className="h-10 w-10" />
          </div>
          <div className="flex-1 text-center md:text-start">
            <h3 className="text-xl font-bold text-brand">{t("desktopApp")}</h3>
            <p className="mt-2 max-w-2xl text-muted-foreground">{t("desktopDesc")}</p>
          </div>
          <Link to="/exam">
            <Button className="bg-accent-brand text-white hover:opacity-90">
              <LockKeyhole className="me-2 h-4 w-4" />
              {t("candidatePortal")}
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="brand-gradient py-8 text-center text-white/80">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-3 px-4">
          <div className="rounded-lg bg-white p-2">
            <Logo size="sm" />
          </div>
          <p className="text-sm">{t("platformName")} © 2026</p>
        </div>
      </footer>
    </div>
  );
}
