import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { parseQuestionsSmart, parseRows, type ImportedQuestion } from "@/lib/questionImport";
// @ts-expect-error وحدة JS بلا أنواع
import { questions as seed } from "../../db/seed-pm-questions.mjs";

const dir = path.resolve(__dirname, "../../docs/samples");
const AR = ["أ", "ب", "ج", "د", "هـ"];
type Seed = { type: string; textAr: string; options?: { id: string; textAr: string }[]; correctAnswer?: unknown; modelAnswer?: string; points: number; competency: string; difficulty: string };

/** يقارن ما أعاده المحلّل بسؤال البذر الأصلي */
function expectSame(got: ImportedQuestion, want: Seed, label: string) {
  expect(got.type, `${label}: type`).toBe(want.type);
  expect(got.points, `${label}: points`).toBe(want.points);
  expect(got.competency, `${label}: competency`).toBe(want.competency);
  expect(got.difficulty, `${label}: difficulty`).toBe(want.difficulty);
  if (want.type === "single" || want.type === "multiple") {
    expect(got.options?.map((o) => o.textAr), `${label}: options`).toEqual(want.options!.map((o) => o.textAr));
    // معرّفات الخيارات تُعاد توليدها A,B,C… بنفس الترتيب
    const wantIds = Array.isArray(want.correctAnswer) ? want.correctAnswer : [want.correctAnswer];
    const wantIdx = (wantIds as string[]).map((id) => want.options!.findIndex((o) => o.id === id)).sort();
    const gotIds = Array.isArray(got.correctAnswer) ? got.correctAnswer : [got.correctAnswer];
    const gotIdx = (gotIds as string[]).map((id) => got.options!.findIndex((o) => o.id === id)).sort();
    expect(gotIdx, `${label}: correct`).toEqual(wantIdx);
  } else if (want.type === "truefalse") {
    expect(got.correctAnswer, `${label}: tf`).toBe(want.correctAnswer);
  } else if (want.type === "numeric") {
    expect(got.correctAnswer, `${label}: numeric`).toBe(want.correctAnswer);
  } else if (want.type === "short") {
    expect(got.correctAnswer, `${label}: short`).toBe(want.correctAnswer);
  } else {
    expect(got.modelAnswer, `${label}: model`).toBe(want.modelAnswer);
  }
  expect(got.warnings, `${label}: warnings`).toEqual([]);
}

describe("ملفات العينات docs/samples تمر عبر الاستيراد الذكي كاملة (120/120)", () => {
  it("pm-questions.txt", () => {
    const { questions, format } = parseQuestionsSmart(fs.readFileSync(path.join(dir, "pm-questions.txt"), "utf8"));
    expect(format).toBe("text");
    expect(questions).toHaveLength(120);
    (seed as Seed[]).forEach((w, i) => expectSame(questions[i], w, `txt #${i + 1}`));
  });
  it("pm-questions.json", () => {
    const { questions, format } = parseQuestionsSmart(fs.readFileSync(path.join(dir, "pm-questions.json"), "utf8"));
    expect(format).toBe("json");
    expect(questions).toHaveLength(120);
    (seed as Seed[]).forEach((w, i) => expectSame(questions[i], w, `json #${i + 1}`));
  });
  it("pm-questions.xlsx (رؤوس أعمدة)", () => {
    const wb = XLSX.read(fs.readFileSync(path.join(dir, "pm-questions.xlsx")), { type: "buffer" });
    const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "" })
      .map((r) => r.map((c) => (c === null || c === undefined ? "" : String(c).trim())));
    const questions = parseRows(rows);
    expect(questions).toHaveLength(120);
    (seed as Seed[]).forEach((w, i) => expectSame(questions[i], w, `xlsx #${i + 1}`));
    void AR;
  });
  it("pm-candidates.xlsx: 20 صفًا بهوية 10 أرقام", () => {
    const wb = XLSX.read(fs.readFileSync(path.join(dir, "pm-candidates.xlsx")), { type: "buffer" });
    const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "" });
    expect(rows.length - 1).toBe(20);
    expect(rows.slice(1).every((r) => /^\d{10}$/.test(String(r[0])))).toBe(true);
  });
});
