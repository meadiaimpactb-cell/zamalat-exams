/* يولّد نسخًا مستقلة من دليل الطالب للتوزيع خارج المنصة:  node db/make-guide.mjs
 *   - docs/student-guide-ar.md / -en.md  (Markdown من المحتوى مباشرة)
 *   - docs/student-guide-ar.pdf / -en.pdf (بنفس تصميم الصفحة — يتطلب خادم التطوير شغّالًا على 3000 و Chrome/Edge مثبّتًا)
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const tmp = path.join(os.tmpdir(), "zamalat-guide.mjs");
execSync(`npx esbuild src/content/studentGuide.ts --format=esm --outfile="${tmp}" --log-level=error`, { stdio: "inherit" });
const { guideSections, quickRules, fillVars, DEFAULT_VARS } = await import("file:///" + tmp.replace(/\\/g, "/"));

const render = (lang) => {
  const L = (x) => fillVars(lang === "ar" ? x.ar : x.en, DEFAULT_VARS);
  const out = [];
  out.push(lang === "ar" ? "# دليل الطالب وتعليمات الاختبار الشامل — منصة اختبارات الزمالات المهنية" : "# Student Guide & Comprehensive Exam Instructions — Professional Fellowships Exam Platform");
  out.push("");
  out.push(lang === "ar"
    ? "> القيم الافتراضية: المدة 360 دقيقة · حد الخروج من ملء الشاشة 3 · لقطة كاميرا كل 60 ثانية. تظهر أرقام اختبارك الفعلية داخل المنصة بعد إدخال رمز الاختبار."
    : "> Defaults: 360 minutes · fullscreen-exit limit 3 · camera snapshot every 60 s. Your exam's actual numbers appear inside the platform after entering the exam code.");
  out.push("");
  out.push(lang === "ar" ? "## القواعد الأساسية — اقرأها قبل البدء" : "## Key rules — read before you start");
  out.push("");
  quickRules.forEach((r, i) => out.push(`${i + 1}. ${L(r)}`));
  for (const s of guideSections) {
    out.push("", "## " + L(s.title));
    if (s.intro) out.push("", "_" + L(s.intro) + "_");
    out.push("");
    for (const it of (lang === "ar" ? s.items.ar : s.items.en)) out.push("- " + fillVars(it, DEFAULT_VARS));
    if (s.warning) out.push("", "> ⚠️ " + L(s.warning));
  }
  return out.join("\n") + "\n";
};

fs.writeFileSync("docs/student-guide-ar.md", "﻿" + render("ar"), "utf8");
fs.writeFileSync("docs/student-guide-en.md", render("en"), "utf8");
console.log("✓ docs/student-guide-ar.md", fs.statSync("docs/student-guide-ar.md").size, "B ·", "docs/student-guide-en.md", fs.statSync("docs/student-guide-en.md").size, "B");

/* ---------- PDF بنفس تصميم الصفحة عبر Chrome/Edge بلا واجهة ---------- */
const BASE = process.env.BASE ?? "http://localhost:3000";
const browsers = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
];
const browser = browsers.find((b) => fs.existsSync(b));
if (!browser) { console.log("⚠ لم يُعثر على Chrome/Edge — تخطّي توليد PDF (استخدم زر الطباعة في الصفحة)."); process.exit(0); }
try { await fetch(`${BASE}/api/trpc/ping`); } catch { console.log(`⚠ الخادم غير شغّال على ${BASE} — شغّل npm run dev ثم أعد التشغيل لتوليد PDF.`); process.exit(0); }
const profile = path.join(os.tmpdir(), "zamalat-chrome-pdf");
for (const lang of ["ar", "en"]) {
  const out = path.resolve(`docs/student-guide-${lang}.pdf`);
  execSync(`"${browser}" --headless=new --disable-gpu --no-first-run --no-default-browser-check --user-data-dir="${profile}" --run-all-compositor-stages-before-draw --virtual-time-budget=15000 --no-pdf-header-footer --print-to-pdf="${out}" "${BASE}/exam/guide?lang=${lang}"`, { stdio: "ignore" });
  console.log(`✓ ${out} (${fs.statSync(out).size} B)`);
}
