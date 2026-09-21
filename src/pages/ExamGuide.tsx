import { useEffect } from "react";
import { Link, useSearchParams } from "react-router";
import { useI18n } from "@/i18n";
import { LanguageSwitcher, Logo } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { guideSections, quickRules, fillVars } from "@/content/studentGuide";
import { useGuideVars } from "@/lib/guideVars";
import { Laptop, LogIn, ClipboardList, Monitor, ListChecks, ShieldCheck, Timer, Wifi, LockKeyhole, Send, Trophy, HelpCircle, Printer, ArrowRight, ArrowLeft, AlertTriangle } from "lucide-react";

const ICONS = { laptop: Laptop, login: LogIn, clipboard: ClipboardList, monitor: Monitor, list: ListChecks, shield: ShieldCheck, timer: Timer, wifi: Wifi, lock: LockKeyhole, send: Send, trophy: Trophy, help: HelpCircle };

/**
 * دليل الطالب الكامل للاختبار الشامل (طلب الإدارة): 12 قسمًا بالعربية والإنجليزية، فهرس، وقابل للطباعة.
 * عام (بلا تسجيل دخول) ليُرسَل للطلاب قبل الاختبار، ويُخصَّص بالأرقام الفعلية عند فتحه بعد إدخال رمز الاختبار.
 */
export default function ExamGuide() {
  const { t, lang, setLang } = useI18n();
  const vars = useGuideVars();
  // ?lang=ar|en يفرض اللغة (لتوليد PDF لكل لغة ولإرسال رابط بلغة محددة)
  const [params] = useSearchParams();
  useEffect(() => {
    const p = params.get("lang");
    if ((p === "ar" || p === "en") && p !== lang) setLang(p);
  }, [params, lang, setLang]);
  const L = (x: { ar: string; en: string }) => fillVars(lang === "ar" ? x.ar : x.en, vars);
  const Back = lang === "ar" ? ArrowRight : ArrowLeft;

  return (
    <div className="guide-page min-h-screen bg-background">
      <style>{`
        @page { size: A4; margin: 12mm 12mm 14mm; }
        @media print {
          .no-print { display: none !important; }
          .guide-page, body { background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .guide-page main { padding: 0 !important; max-width: none !important; font-size: 12.5px; }
          .guide-page main > * + * { margin-top: 10px !important; }
          .guide-section, .guide-toc, .guide-cover { padding: 12px 16px !important; border-radius: 10px !important; }
          .guide-section h2 { font-size: 15px; margin-bottom: 6px; }
          .guide-section ul, .guide-section ol { gap: 4px; }
          .guide-section li + li { margin-top: 4px !important; }
          .guide-cover h1 { font-size: 22px; }
          .guide-toc { display: none !important; } /* الدليل المختصر لا يحتاج فهرسًا */
          /* لا فراغات بيضاء: الأقسام تنكسر بين البنود لا قبلها، والعناوين تلتصق بما بعدها */
          .guide-section { break-inside: auto; box-shadow: none !important; }
          .guide-section h2 { break-after: avoid; }
          .guide-section li { break-inside: avoid; }
          .guide-toc { display: block !important; break-inside: avoid; }
          a[href]::after { content: none !important; }
          a { color: inherit; text-decoration: none; }
        }
      `}</style>
      <header className="no-print sticky top-0 z-40 border-b bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-2 px-4 py-3">
          <div className="flex items-center gap-3"><Logo size="sm" /><span className="hidden text-sm font-bold text-brand sm:block">{t("studentGuide")}</span></div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="me-1.5 h-4 w-4" /> {t("printGuide")}</Button>
            <Link to="/exam"><Button size="sm" className="bg-brand"><Back className="me-1.5 h-4 w-4" /> {t("backToEntry")}</Button></Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        {/* الغلاف */}
        <div className="guide-cover rounded-2xl brand-gradient p-6 text-white shadow-lg">
          <div className="mb-3 w-fit rounded-lg bg-white p-2"><Logo size="md" /></div>
          <h1 className="text-2xl font-extrabold md:text-3xl">{t("studentGuide")}</h1>
          <p className="mt-2 max-w-2xl text-white/85">{t("guideIntro")}</p>
          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            <span className="rounded-full bg-white/15 px-3 py-1">⏱ {t("duration")}: {vars.duration} {t("minutes")}{vars.extra ? ` (${t("extraLabel")} ${vars.extra})` : ""}</span>
            <span className="rounded-full bg-white/15 px-3 py-1">🖥 {t("maxFullscreenExits")}: {vars.exits}</span>
            <span className="rounded-full bg-white/15 px-3 py-1">📷 {t("snapshotInterval")}: {vars.snapshot}</span>
          </div>
        </div>

        {/* القواعد الأساسية */}
        <section className="guide-section rounded-2xl border-2 border-amber-300 bg-amber-50 p-5">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-amber-900"><AlertTriangle className="h-5 w-5" /> {t("keyRules")}</h2>
          <ol className="list-decimal space-y-2 ps-6 text-sm leading-relaxed text-amber-950">
            {quickRules.map((r, i) => <li key={i}>{L(r)}</li>)}
          </ol>
        </section>

        {/* الفهرس */}
        <nav className="guide-toc rounded-2xl border bg-white p-5">
          <h2 className="mb-3 text-base font-bold text-brand">{t("tableOfContents")}</h2>
          <ol className="grid gap-1.5 text-sm sm:grid-cols-2">
            {guideSections.map((s) => {
              const Icon = ICONS[s.icon];
              return <li key={s.id}><a href={`#${s.id}`} className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-secondary"><Icon className="h-4 w-4 text-brand" /> {L(s.title)}</a></li>;
            })}
          </ol>
        </nav>

        {/* الأقسام */}
        {guideSections.map((s) => {
          const Icon = ICONS[s.icon];
          return (
            <section key={s.id} id={s.id} className="guide-section scroll-mt-20 rounded-2xl border bg-white p-5 shadow-sm">
              <h2 className="mb-2 flex items-center gap-2 text-lg font-bold text-brand">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[hsl(193,37%,30%)]/10"><Icon className="h-5 w-5" /></span>
                {L(s.title)}
              </h2>
              {s.intro && <p className="mb-3 text-sm text-muted-foreground">{L(s.intro)}</p>}
              <ul className="space-y-2 text-sm leading-relaxed">
                {(lang === "ar" ? s.items.ar : s.items.en).map((it, i) => (
                  <li key={i} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(22,60%,55%)]" /><span>{fillVars(it, vars)}</span></li>
                ))}
              </ul>
              {s.warning && <p className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-800">⚠️ {L(s.warning)}</p>}
            </section>
          );
        })}

        <footer className="pb-8 text-center text-xs text-muted-foreground">{t("platformName")} © 2026 — {t("guideFooter")}</footer>
      </main>
    </div>
  );
}
