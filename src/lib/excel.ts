/* ============================================================================
 * أدوات Excel (ملاحظتا 2 و10) — تُحمَّل مكتبة xlsx عند الطلب فقط (تقسيم الحزمة)
 * ========================================================================== */

type XLSX = typeof import("xlsx");
let xlsxMod: Promise<XLSX> | null = null;
const loadXlsx = () => (xlsxMod ??= import("xlsx"));

export type ResultExportRow = {
  nationalId: string; nameAr: string; nameEn: string; fellowship: string; track: string; cohort: string;
  attempted: boolean; objectiveScore: number; essayScore: number; totalScore: number; maxScore: number;
  percentage: number; passed: boolean | null; gradingStatus: string | null; sessionStatus: string | null;
};

/**
 * تصدير درجات اختبار إلى ملف Excel (ملاحظة 2):
 * أعمدة إلزامية فقط، أرقام لاتينية (خلايا رقمية)، اتجاه الورقة RTL، دون أعمدة نظامية زائدة.
 */
export async function exportResultsXlsx(opts: {
  exam: { code: string; titleAr: string; passScore: number };
  objectiveMax: number; essayMax: number;
  rows: ResultExportRow[];
  labels: { nationalId: string; name: string; fellowship: string; objective: string; essay: string; total: string; percentage: string; result: string; passed: string; failed: string; notAttempted: string; sheet: string };
}) {
  const XLSX = await loadXlsx();
  const { labels: L } = opts;
  const header = [L.nationalId, L.name, L.fellowship, `${L.objective} (${opts.objectiveMax})`, `${L.essay} (${opts.essayMax})`, `${L.total} (${opts.objectiveMax + opts.essayMax})`, L.percentage, L.result];
  const data = opts.rows.map((r) => [
    r.nationalId,
    r.nameAr,
    r.fellowship,
    r.attempted ? r.objectiveScore : null,
    r.attempted ? r.essayScore : null,
    r.attempted ? r.totalScore : null,
    r.attempted ? r.percentage : null,
    !r.attempted ? L.notAttempted : r.passed ? L.passed : L.failed,
  ]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
  // الهوية نصية حتى لا تُعرض بصيغة علمية؛ الأرقام أرقام حقيقية
  for (let i = 0; i < data.length; i++) {
    const cell = ws[XLSX.utils.encode_cell({ r: i + 1, c: 0 })];
    if (cell) { cell.t = "s"; cell.v = String(cell.v ?? ""); }
  }
  ws["!cols"] = [{ wch: 14 }, { wch: 30 }, { wch: 28 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 10 }, { wch: 12 }];
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: data.length, c: header.length - 1 } }) };
  const wb = XLSX.utils.book_new();
  // اتجاه RTL للورقة
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, L.sheet.slice(0, 31));
  const safe = opts.exam.code.replace(/[^A-Za-z0-9_-]/g, "");
  XLSX.writeFile(wb, `results-${safe}.xlsx`, { bookType: "xlsx", compression: true });
}

/** قالب استيراد الزملاء الجاهز (ملاحظة 10): ورقة بيانات + ورقة تعليمات */
export async function downloadCandidateTemplate(labels: {
  nationalId: string; nameAr: string; nameEn: string; email: string; phone: string; fellowship: string; track: string; cohort: string;
  sheet: string; notesSheet: string; notes: string[];
}, fellowshipNames: string[]) {
  const XLSX = await loadXlsx();
  const header = [labels.nationalId, labels.nameAr, labels.nameEn, labels.email, labels.phone, labels.fellowship, labels.track, labels.cohort];
  const example = [
    ["1000000010", "أحمد محمد العتيبي", "Ahmed Alotaibi", "ahmed@example.com", "0500000010", fellowshipNames[0] ?? "زمالة القيادة الصحية", "إدارة المنشآت", "دفعة 2026"],
    ["1000000011", "سارة خالد الحربي", "", "", "0500000011", fellowshipNames[0] ?? "", "", ""],
  ];
  const ws = XLSX.utils.aoa_to_sheet([header, ...example]);
  ws["!cols"] = [{ wch: 14 }, { wch: 28 }, { wch: 24 }, { wch: 26 }, { wch: 14 }, { wch: 30 }, { wch: 22 }, { wch: 14 }];
  // الهوية والجوال نصيّان (للمحافظة على الصفر البادئ)
  for (let r = 1; r <= example.length; r++) for (const c of [0, 4]) {
    const cell = ws[XLSX.utils.encode_cell({ r, c })];
    if (cell) { cell.t = "s"; cell.v = String(cell.v); }
  }
  const notes = XLSX.utils.aoa_to_sheet([[labels.notesSheet], ...labels.notes.map((n) => [n]), [""], [labels.fellowship + ":"], ...fellowshipNames.map((n) => [n])]);
  notes["!cols"] = [{ wch: 90 }];
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, labels.sheet.slice(0, 31));
  XLSX.utils.book_append_sheet(wb, notes, labels.notesSheet.slice(0, 31));
  XLSX.writeFile(wb, "candidates-template.xlsx", { bookType: "xlsx" });
}

/** يقرأ أول ورقة من ملف Excel/CSV إلى مصفوفة صفوف نصية */
export async function readSheetRows(file: File): Promise<string[][]> {
  const XLSX = await loadXlsx();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", raw: false, codepage: 65001 });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, { header: 1, raw: false, defval: "" });
  return rows.map((r) => r.map((c) => (c === null || c === undefined ? "" : String(c).trim())));
}

/** تصدير عام لجدول (رؤوس + صفوف) إلى Excel بورقة RTL — يُستخدم لتصدير الزملاء (المفلترين/المحددين) */
export async function exportTableXlsx(opts: { fileName: string; sheet: string; header: string[]; rows: (string | number | null)[][]; textCols?: number[]; widths?: number[] }) {
  const XLSX = await loadXlsx();
  const ws = XLSX.utils.aoa_to_sheet([opts.header, ...opts.rows]);
  for (let r = 1; r <= opts.rows.length; r++) for (const c of opts.textCols ?? []) {
    const cell = ws[XLSX.utils.encode_cell({ r, c })];
    if (cell && cell.v !== null && cell.v !== undefined) { cell.t = "s"; cell.v = String(cell.v); }
  }
  ws["!cols"] = (opts.widths ?? opts.header.map(() => 18)).map((wch) => ({ wch }));
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: opts.rows.length, c: opts.header.length - 1 } }) };
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, opts.sheet.slice(0, 31));
  XLSX.writeFile(wb, opts.fileName, { bookType: "xlsx", compression: true });
}
