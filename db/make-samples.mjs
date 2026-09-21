/* ============================================================================
 * مولّد ملفات الاستيراد (docs/samples/) لمجموعة أسئلة:
 *   node db/make-samples.mjs pm   → زمالة إدارة المشاريع الاحترافية (120 سؤالًا + 20 طالبًا)
 *   node db/make-samples.mjs gi   → الاختبار الشامل — الزمالة السعودية للابتكار الحكومي (120 سؤالًا / 1200 درجة)
 *   node db/make-samples.mjs      → الكل
 * لكل مجموعة: <prefix>-questions.txt (نص حر) · .json (كامل) · .xlsx (جدول برؤوس أعمدة + تعليمات)
 * ========================================================================== */
import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";

const SETS = {
  pm: { module: "./seed-pm-questions.mjs", prefix: "pm-questions", title: "الاختبار الشامل — زمالة إدارة المشاريع الاحترافية", candidates: "pm-candidates" },
  gi: { module: "./gi-exam-questions.mjs", prefix: "gi-exam-questions", title: "الاختبار الشامل النهائي — الزمالة السعودية للابتكار الحكومي" },
};
const which = process.argv[2] ? [process.argv[2]] : Object.keys(SETS);
const outDir = path.resolve("docs/samples");
fs.mkdirSync(outDir, { recursive: true });

const AR = ["أ", "ب", "ج", "د", "هـ", "و", "ز", "ح"];
const DIFF = { easy: "سهل", medium: "متوسط", hard: "صعب" };
const TYPE_AR = { single: "اختيار من واحد", multiple: "اختيار متعدد", truefalse: "صح/خطأ", short: "إجابة قصيرة", numeric: "رقمي", essay: "مقالي" };
const ptsLabel = (n) => `(${n} ${n === 1 ? "درجة" : n === 2 ? "درجتان" : n <= 10 ? "درجات" : "درجة"})`;

for (const key of which) {
  const set = SETS[key];
  if (!set) { console.error("مجموعة غير معروفة:", key, "— المتاح:", Object.keys(SETS).join(", ")); process.exit(1); }
  const mod = await import(set.module);
  const questions = mod.questions;
  const total = questions.reduce((a, q) => a + q.points, 0);

  /* ---------- TXT ---------- */
  const txt = [];
  txt.push(`# ${set.title} — ${questions.length} سؤالًا — الدرجة الكلية ${total}`);
  txt.push("# الصيغة: رقم) نص السؤال (الدرجات) · الخيارات أ) ب) ج) مع * بجانب الصحيح · أو سطر «الإجابة: …» · «الشرح: …» · «الكفاءة: …» · [مقالي] + «الإجابة النموذجية: …»");
  txt.push("");
  questions.forEach((q, i) => {
    const n = i + 1;
    const isCorrect = (id) => Array.isArray(q.correctAnswer) ? q.correctAnswer.includes(id) : q.correctAnswer === id;
    if (q.type === "truefalse") {
      txt.push(`${n}) ${q.textAr} (صح أم خطأ) ${ptsLabel(q.points)}`);
      txt.push(`الإجابة: ${q.correctAnswer === "T" ? "صح" : "خطأ"}`);
    } else if (q.type === "single" || q.type === "multiple") {
      txt.push(`${n}) ${q.textAr} ${q.type === "multiple" ? "[متعدد] " : ""}${ptsLabel(q.points)}`);
      q.options.forEach((o, k) => txt.push(`${AR[k]}) ${o.textAr}${isCorrect(o.id) ? " *" : ""}`));
    } else if (q.type === "essay") {
      txt.push(`${n}) ${q.textAr} [مقالي] ${ptsLabel(q.points)}`);
      txt.push(`الإجابة النموذجية: ${q.modelAnswer}`);
    } else {
      txt.push(`${n}) ${q.textAr} ${q.type === "numeric" ? "[رقمي] " : ""}${ptsLabel(q.points)}`);
      txt.push(`الإجابة: ${q.correctAnswer}`);
    }
    if (q.explanation) txt.push(`الشرح: ${q.explanation}`);
    if (q.competency) txt.push(`الكفاءة: ${q.competency}`);
    txt.push(`الصعوبة: ${DIFF[q.difficulty]}`);
    txt.push("");
  });
  fs.writeFileSync(path.join(outDir, `${set.prefix}.txt`), "﻿" + txt.join("\n"), "utf8");

  /* ---------- JSON ---------- */
  fs.writeFileSync(path.join(outDir, `${set.prefix}.json`), JSON.stringify(questions, null, 2), "utf8");

  /* ---------- XLSX (رؤوس أعمدة) ---------- */
  const header = ["السؤال", "النوع", "أ", "ب", "ج", "د", "هـ", "الإجابة", "الإجابة النموذجية", "الشرح", "الدرجة", "الكفاءة", "الصعوبة"];
  const rows = questions.map((q) => {
    const o = q.type === "truefalse" ? ["صح", "خطأ", "", "", ""] : [0, 1, 2, 3, 4].map((k) => q.options?.[k]?.textAr ?? "");
    let answer = "";
    if (q.type === "truefalse") answer = q.correctAnswer === "T" ? "صح" : "خطأ";
    else if (q.type === "single") answer = AR[q.options.findIndex((x) => x.id === q.correctAnswer)];
    else if (q.type === "multiple") answer = q.correctAnswer.map((id) => AR[q.options.findIndex((x) => x.id === id)]).join("، ");
    else if (q.type !== "essay") answer = String(q.correctAnswer);
    return [q.textAr, TYPE_AR[q.type], ...o, answer, q.modelAnswer ?? "", q.explanation ?? "", q.points, q.competency ?? "", DIFF[q.difficulty]];
  });
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws["!cols"] = [60, 14, 24, 24, 24, 24, 18, 12, 50, 50, 8, 22, 10].map((wch) => ({ wch }));
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: header.length - 1 } }) };
  const guide = XLSX.utils.aoa_to_sheet([
    ["تعليمات ملء ورقة الأسئلة"],
    ["السؤال: نص السؤال (يمكن كتابة معادلات: x^{2}، sqrt(16)، frac(a,b)، والرموز − × ÷)."],
    ["النوع: اختيار من واحد / اختيار متعدد / صح-خطأ / إجابة قصيرة / رقمي / مقالي — إن تُرك فارغًا يستنتجه النظام."],
    ["أ..هـ: الخيارات (اتركها فارغة للأسئلة بلا خيارات). لصح/خطأ لا تحتاج خيارات."],
    ["الإجابة: حرف الخيار الصحيح (ب) أو عدة أحرف للمتعدد (أ، ج) أو صح/خطأ أو الرقم أو النص القصير."],
    ["الإجابة النموذجية: للأسئلة المقالية (تُستخدم في اقتراح الدرجة والتصحيح اليدوي)."],
    ["الشرح: تعليل الإجابة الصحيحة — يظهر للمصحّح فقط ولا يراه الطالب."],
    ["الدرجة: رقم (افتراضي 1). الكفاءة: تصنيف حر. الصعوبة: سهل / متوسط / صعب."],
    ["لا تغيّر صف العناوين. احذف الصفوف أو استبدلها بأسئلتك."],
  ]);
  guide["!cols"] = [{ wch: 110 }];
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, "الأسئلة");
  XLSX.utils.book_append_sheet(wb, guide, "تعليمات");
  XLSX.writeFile(wb, path.join(outDir, `${set.prefix}.xlsx`));

  /* ---------- XLSX الطلاب (إن وُجدوا) ---------- */
  if (set.candidates && mod.candidates) {
    const ch = ["رقم الهوية", "الاسم (عربي)", "الاسم (English)", "البريد", "الجوال", "الزمالة", "المسار", "الدفعة"];
    const crows = mod.candidates.map(([nid, ar, en], i) => [nid, ar, en, `${en.split(" ")[0].toLowerCase()}${i + 1}@example.com`, `05${String(10000000 + i * 7919).slice(0, 8)}`, "زمالة إدارة المشاريع الاحترافية", i % 2 ? "إدارة المشاريع الإنشائية" : "إدارة مشاريع التحول الرقمي", "دفعة 2026"]);
    const cws = XLSX.utils.aoa_to_sheet([ch, ...crows]);
    for (let r = 1; r <= crows.length; r++) for (const c of [0, 4]) { const cell = cws[XLSX.utils.encode_cell({ r, c })]; if (cell) { cell.t = "s"; cell.v = String(cell.v); } }
    cws["!cols"] = [14, 28, 24, 28, 14, 32, 26, 12].map((wch) => ({ wch }));
    const cwb = XLSX.utils.book_new();
    cwb.Workbook = { Views: [{ RTL: true }] };
    XLSX.utils.book_append_sheet(cwb, cws, "الزملاء");
    XLSX.writeFile(cwb, path.join(outDir, `${set.candidates}.xlsx`));
  }
  const byType = questions.reduce((a, q) => ((a[q.type] = (a[q.type] ?? 0) + 1), a), {});
  console.log(`✓ ${key}: ${questions.length} سؤالًا، ${total} درجة`, byType);
}
console.log("  " + fs.readdirSync(outDir).map((f) => `${f} (${fs.statSync(path.join(outDir, f)).size} B)`).join("\n  "));
