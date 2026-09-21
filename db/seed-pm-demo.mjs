/* ============================================================================
 * بيانات تجريبية: زمالة إدارة المشاريع الاحترافية — 120 سؤالاً + اختبار شامل + 20 طالبًا
 * يعمل عبر واجهة tRPC على خادم التطوير (المسارات الحقيقية للكود):  node db/seed-pm-demo.mjs
 * آمن للتكرار: إن وُجدت الزمالة بالاسم نفسه يتوقف دون تكرار.
 * ========================================================================== */
const BASE = process.env.BASE ?? "http://localhost:3000/api/trpc";
const ADMIN = { username: process.env.SEED_USER ?? "admin", password: process.env.SEED_PASS ?? "Admin@12345" };

async function call(proc, input, token, method = "POST") {
  const url = method === "GET" ? `${BASE}/${proc}${input !== undefined ? `?input=${encodeURIComponent(JSON.stringify({ json: input }))}` : ""}` : `${BASE}/${proc}`;
  const res = await fetch(url, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, ...(method === "POST" ? { body: JSON.stringify({ json: input }) } : {}) });
  const data = await res.json();
  if (data.error) throw new Error(`${proc}: ${data.error.json?.message ?? JSON.stringify(data.error)}`);
  return data.result.data.json;
}
const q = (p, i, t) => call(p, i, t, "GET");
const m = (p, i, t) => call(p, i, t, "POST");

import { questions, candidates } from "./seed-pm-questions.mjs";

/* ---------------------------------- التنفيذ ---------------------------------- */
const FEL_AR = "زمالة إدارة المشاريع الاحترافية";
const token = (await m("auth.login", ADMIN)).token;

const existing = (await q("admin.listFellowships", undefined, token)).find((f) => f.nameAr === FEL_AR);
if (existing) { console.log(`الزمالة موجودة مسبقًا (id=${existing.id}) — لن تُكرَّر.`); process.exit(0); }

const fel = await m("admin.createFellowship", { nameAr: FEL_AR, nameEn: "Professional Project Management Fellowship", description: "برنامج زمالة يغطي مجالات المعرفة العشرة في إدارة المشاريع والمنهجيات الرشيقة." }, token);
await m("admin.createTrack", { fellowshipId: fel.id, nameAr: "إدارة مشاريع التحول الرقمي", nameEn: "Digital Transformation Projects" }, token);
await m("admin.createTrack", { fellowshipId: fel.id, nameAr: "إدارة المشاريع الإنشائية", nameEn: "Construction Projects" }, token);
await m("admin.createCohort", { fellowshipId: fel.id, nameAr: "دفعة 2026", nameEn: "Cohort 2026" }, token);
console.log(`✓ الزمالة #${fel.id} + مساران + دفعة`);

const bank = await m("bank.createBank", { nameAr: "بنك أسئلة إدارة المشاريع الاحترافية", nameEn: "PM Fellowship Question Bank", fellowshipId: fel.id }, token);
const up = await m("bank.uploadQuestions", { bankId: bank.id, format: "json", content: JSON.stringify(questions) }, token);
console.log(`✓ البنك #${bank.id}: استُورد ${up.imported} سؤالًا${up.errors.length ? ` (أخطاء: ${up.errors.join(" | ")})` : ""}`);
const list = await q("bank.listQuestions", { bankId: bank.id }, token);
for (let i = 0; i < list.length; i += 100) await m("bank.reviewQuestions", { ids: list.slice(i, i + 100).map((x) => x.id), decision: "approved", notes: "اعتماد بيانات تجريبية" }, token);
console.log(`✓ اعتُمد ${list.length} سؤالًا`);
const byType = list.reduce((a, x) => ((a[x.type] = (a[x.type] ?? 0) + 1), a), {});
console.log("  التوزيع:", byType);

const exam = await m("exam.create", {
  titleAr: "الاختبار الشامل — زمالة إدارة المشاريع الاحترافية (دفعة 2026)",
  titleEn: "Comprehensive Exam — PM Fellowship (Cohort 2026)",
  fellowshipId: fel.id, passScore: 60, lockdown: true, proctoring: true, cameraRequired: false, snapshotIntervalSec: 60, maxFullscreenExits: 3,
  instructionsAr: "الاختبار 120 سؤالًا (100 موضوعي + 20 مقالي). المدة 360 دقيقة. يُمنع مغادرة ملء الشاشة أكثر من 3 مرات. تُحفظ إجاباتك تلقائيًا.",
  instructionsEn: "120 questions (100 objective + 20 essay). Duration 360 minutes. Leaving fullscreen more than 3 times ends the exam. Answers auto-save.",
}, token);
const added = await m("exam.addQuestionsFromBank", { examId: exam.id, bankId: bank.id, mode: "all" }, token);
await m("exam.setStatus", { id: exam.id, status: "open" }, token);
const detail = await q("exam.get", { id: exam.id }, token);
console.log(`✓ الاختبار ${exam.code} (#${exam.id}): ${added.added} سؤالًا، المدة ${detail.exam.durationMin} دقيقة، الدرجة الكلية ${detail.questions.reduce((a, x) => a + x.points, 0)}`);

let created = 0, registered = 0;
for (const [nid, nameAr, nameEn] of candidates) {
  const r = await m("exam.registerOrCreateCandidate", { examId: exam.id, nationalId: nid, nameAr, nameEn, fellowship: FEL_AR, track: "إدارة مشاريع التحول الرقمي", cohort: "دفعة 2026" }, token);
  if (r.createdNew) created++;
  if (!r.alreadyRegistered) registered++;
}
console.log(`✓ الطلاب: أُنشئ ${created} وسُجِّل ${registered} في الاختبار (الأول: 2568411306)`);
console.log(`\nجرّب: /exam → الرمز ${exam.code} + الإقامة 2568411306`);
