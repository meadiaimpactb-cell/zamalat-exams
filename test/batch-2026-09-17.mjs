/* فحص ديناميكي لدفعة ملاحظات العميل 2026-09-17 — يُشغَّل على خادم التطوير: node test/batch-2026-09-17.mjs */
const BASE = "http://localhost:3000/api/trpc";
let passed = 0, failed = 0;
const out = [];
const check = (name, cond, extra = "") => { if (cond) { passed++; out.push(`✅ ${name}`); } else { failed++; out.push(`❌ ${name} ${extra}`); } };

async function query(proc, input, token) {
  const url = `${BASE}/${proc}${input !== undefined ? `?input=${encodeURIComponent(JSON.stringify({ json: input }))}` : ""}`;
  const res = await fetch(url, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  const data = await res.json();
  if (data.error) { const e = new Error(data.error.json?.message ?? JSON.stringify(data.error)); e.code = data.error.json?.data?.code ?? data.error.json?.code; throw e; }
  return data.result.data.json;
}
async function mutate(proc, input, token) {
  const res = await fetch(`${BASE}/${proc}`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ json: input }) });
  const data = await res.json();
  if (data.error) { const e = new Error(data.error.json?.message ?? JSON.stringify(data.error)); e.code = data.error.json?.data?.code ?? data.error.json?.code; throw e; }
  return data.result.data.json;
}
const expectFail = async (fn, codeOrMsg) => { try { await fn(); return false; } catch (e) { return !codeOrMsg || e.code === codeOrMsg || String(e.message).includes(codeOrMsg); } };
const stamp = Date.now().toString().slice(-6);

try {
  const admin = (await mutate("auth.login", { username: "admin", password: "Admin@12345" })).token;
  check("تسجيل دخول المدير", !!admin);

  /* ---- (9) الإنجليزي اختياري ---- */
  const fel = await mutate("admin.createFellowship", { nameAr: `زمالة فحص ${stamp}` }, admin);
  check("(9) إنشاء زمالة بلا اسم إنجليزي", !!fel.id);
  const bank = await mutate("bank.createBank", { nameAr: `بنك فحص ${stamp}`, fellowshipId: fel.id }, admin);
  check("(9) إنشاء بنك بلا اسم إنجليزي", !!bank.id);
  const banks = await query("bank.listBanks", undefined, admin);
  check("(9) البنك يعود بـ nameEn = null", banks.find((b) => b.id === bank.id)?.nameEn === null);
  const superT = (await mutate("auth.login", { username: "superadmin", password: "Super@12345" })).token;
  const u = await mutate("admin.createUser", { username: `exp${stamp}`, password: "Expert@12345", nameAr: "خبير فحص", role: "expert" }, superT);
  check("(9) إنشاء مستخدم بلا اسم إنجليزي", !!u.id);

  /* ---- (1) رموز رياضية عبر الاستيراد الذكي (8) ---- */
  const imported = await mutate("bank.uploadQuestions", {
    bankId: bank.id, format: "json",
    content: JSON.stringify([
      { type: "single", textAr: "ما ناتج 10 − 3 × 2 ؟ (x^{2} + sqrt(16))", options: [{ id: "A", textAr: "4", textEn: "4" }, { id: "B", textAr: "14", textEn: "14" }, { id: "C", textAr: "√16 ÷ 2", textEn: "√16 ÷ 2" }], correctAnswer: "A", points: 2 },
      { type: "truefalse", textAr: "5 + 5 = 10", options: [{ id: "T", textAr: "صح", textEn: "True" }, { id: "F", textAr: "خطأ", textEn: "False" }], correctAnswer: "T", points: 1 },
      { type: "numeric", textAr: "كم يساوي 7 × 6 ؟", correctAnswer: 42, points: 1 },
      { type: "essay", textAr: "اشرح قانون فيثاغورس a^{2} + b^{2} = c^{2}", modelAnswer: "مجموع مربعي الضلعين = مربع الوتر", points: 4 },
    ]),
  }, admin);
  check("(8) استيراد 4 أسئلة بأنواع مختلفة", imported.imported === 4, JSON.stringify(imported));
  const qs = (await query("bank.listQuestions", { bankId: bank.id }, admin));
  check("(1) الرموز الرياضية محفوظة كما هي (− × ÷ √)", qs.some((q) => q.textAr.includes("−") && q.textAr.includes("×")) && qs.some((q) => (q.options ?? []).some((o) => o.textAr.includes("√16 ÷ 2"))));
  await mutate("bank.reviewQuestions", { ids: qs.map((q) => q.id), decision: "approved" }, admin);

  /* ---- (4) المدة الافتراضية 360 ---- */
  const ex = await mutate("exam.create", { titleAr: `اختبار فحص ${stamp}`, fellowshipId: fel.id, lockdown: false, proctoring: false, maxFullscreenExits: 2 }, admin);
  const exam = (await query("exam.get", { id: ex.id }, admin)).exam;
  check("(4) اختبار جديد دون تحديد مدة → 360 دقيقة", exam.durationMin === 360, `got ${exam.durationMin}`);
  await mutate("exam.addQuestionsFromBank", { examId: ex.id, bankId: bank.id, mode: "all" }, admin);
  check("(8→exam) الأسئلة المستوردة أُضيفت للاختبار", (await query("exam.get", { id: ex.id }, admin)).questions.length === 4);
  await mutate("exam.setStatus", { id: ex.id, status: "open" }, admin);

  /* ---- طالب: دخول + إجابات + إقفال بملء الشاشة ---- */
  const nid = `19${stamp}00`.slice(0, 10);
  const reg = await mutate("exam.registerOrCreateCandidate", { examId: ex.id, nationalId: nid, nameAr: "طالب فحص" }, admin);
  check("تسجيل طالب", !!reg.registrationId);
  const access = await mutate("candidate.access", { code: ex.code, nationalId: nid });
  check("(4) الطالب يرى مدة 360", access.exam.durationMin === 360);
  const start = await mutate("candidate.start", { code: ex.code, nationalId: nid, consentPolicy: true, consentProctoring: true });
  const tok = start.token;
  let st = await query("candidate.state", { token: tok });
  check("state يعيد fullscreenExitsUsed/reopened", st.fullscreenExitsUsed === 0 && st.reopened === false);
  const byType = Object.fromEntries(st.questions.map((q) => [q.type, q]));
  await mutate("candidate.saveAnswer", { token: tok, examQuestionId: byType.single.examQuestionId, answer: "A" });
  await mutate("candidate.saveAnswer", { token: tok, examQuestionId: byType.truefalse.examQuestionId, answer: "T" });
  // (5) حدث انقطاع الشبكة: يُسجَّل info ولا يرفع الخطورة
  const before = (await query("candidate.state", { token: tok })).riskScore;
  await mutate("candidate.logEvent", { token: tok, eventType: "network_reconnected", severity: "high", details: "اختبار" });
  const after = (await query("candidate.state", { token: tok })).riskScore;
  check("(5) حدث الشبكة لا يرفع درجة الخطورة حتى لو أُرسل بخطورة عالية", before === after);
  // إقفال: خروجان من ملء الشاشة (الحد 2)
  const e1 = await mutate("candidate.logEvent", { token: tok, eventType: "fullscreen_exit", severity: "medium" });
  const e2 = await mutate("candidate.logEvent", { token: tok, eventType: "fullscreen_exit", severity: "medium" });
  check("الإنهاء التلقائي عند الحد (2)", !e1.terminated && e2.terminated && e2.fullscreenExits === 2);
  check("الطالب لا يستطيع الدخول وهو مقفَل", await expectFail(() => mutate("candidate.access", { code: ex.code, nationalId: nid }), "FORBIDDEN"));

  /* ---- (7) لوحة المراقبة الحية ---- */
  const live = await query("monitor.liveSummary", undefined, admin);
  const liveEx = live.exams.find((x) => x.examId === ex.id);
  check("(7) liveSummary يُظهر الاختبار المفتوح والجلسة المقفَلة", !!liveEx && liveEx.terminated === 1);
  const sessions = await query("monitor.liveSessions", { examId: ex.id }, admin);
  const s = sessions[0];
  check("(6) liveSessions يعرض سبب الإقفال", s.status === "terminated" && !!s.terminationReason);

  /* ---- (6) إعادة الفتح ---- */
  const reopened = await mutate("monitor.reopenSession", { sessionId: s.sessionId, extraMinutes: 15 }, admin);
  check("(6) إعادة الفتح تعيد وقتًا متبقيًا", reopened.ok && reopened.remainingSec > 0);
  check("(6) لا تُعاد جلسة نشطة أصلًا", await expectFail(() => mutate("monitor.reopenSession", { sessionId: s.sessionId }, admin), "BAD_REQUEST"));
  const access2 = await mutate("candidate.access", { code: ex.code, nationalId: nid });
  check("(6) الطالب يدخل بنفس بياناته ويستأنف الجلسة نفسها", access2.resumeToken === tok);
  st = await query("candidate.state", { token: tok });
  check("(6) الإجابات السابقة محفوظة بعد إعادة الفتح", st.answers.length === 2 && st.reopened === true && st.fullscreenExitsUsed === 0);
  const e3 = await mutate("candidate.logEvent", { token: tok, eventType: "fullscreen_exit", severity: "medium" });
  check("(6) عدّاد الخروج بدأ من الصفر بعد إعادة الفتح", e3.fullscreenExits === 1 && !e3.terminated);
  const audit = await query("admin.auditLogs", { limit: 30 }, superT);
  check("(6) إعادة الفتح في سجل التدقيق", audit.some((a) => a.action === "reopen_session"));
  const events = await query("monitor.sessionEvents", { sessionId: s.sessionId }, admin);
  check("(6)+(5) أحداث session_reopened و network_reconnected (info) مسجّلة", events.some((e) => e.eventType === "session_reopened") && events.some((e) => e.eventType === "network_reconnected" && e.severity === "info"));

  /* ---- تسليم + (7/11) شاشة التصحيح الكاملة ---- */
  await mutate("candidate.saveAnswer", { token: tok, examQuestionId: byType.numeric.examQuestionId, answer: 40 }); // خطأ مقصود
  await mutate("candidate.saveAnswer", { token: tok, examQuestionId: byType.essay.examQuestionId, answerText: "مجموع مربعي الضلعين يساوي مربع الوتر" });
  await mutate("candidate.submit", { token: tok });
  let rev = await query("grading.sessionReview", { sessionId: s.sessionId }, admin);
  check("(11) sessionReview يعيد كل الأسئلة بترتيب الطالب", rev.items.length === 4 && rev.items.map((i) => i.examQuestionId).join() === st.questions.map((q) => q.examQuestionId).join());
  const vs = Object.fromEntries(rev.items.map((i) => [i.type, i]));
  check("(11) الحكم: single صحيح، numeric خطأ، essay بانتظار", vs.single.verdict === "correct" && vs.numeric.verdict === "wrong" && vs.essay.verdict === "pending");
  check("(11) الدرجة الآلية للموضوعي", vs.single.score === 2 && vs.truefalse.score === 1 && vs.numeric.score === 0);
  const g1 = await mutate("grading.gradeQuestion", { sessionId: s.sessionId, examQuestionId: vs.essay.examQuestionId, score: 3, comments: "جيد" }, admin);
  check("(11) تعيين درجة المقالي يدويًا 3/4 ويُعاد الحساب", g1.totalScore === 6 && g1.percentage === 75, JSON.stringify(g1));
  const g2 = await mutate("grading.gradeQuestion", { sessionId: s.sessionId, examQuestionId: vs.numeric.examQuestionId, score: 1 }, admin);
  check("(11) تعديل سؤال موضوعي يدويًا (خطأ→صحيح)", g2.totalScore === 7 && g2.percentage === 88, JSON.stringify(g2));
  check("(11) رفض درجة أعلى من درجة السؤال", await expectFail(() => mutate("grading.gradeQuestion", { sessionId: s.sessionId, examQuestionId: vs.single.examQuestionId, score: 5 }, admin), "BAD_REQUEST"));
  rev = await query("grading.sessionReview", { sessionId: s.sessionId }, admin);
  check("(11) الحكم يتحدث بعد التعديل", rev.items.find((i) => i.type === "numeric").verdict === "correct" && rev.items.find((i) => i.type === "essay").verdict === "partial");
  await mutate("grading.approveResult", { sessionId: s.sessionId }, admin);
  check("اعتماد النتيجة", (await query("grading.sessionReview", { sessionId: s.sessionId }, admin)).result.gradingStatus === "completed");

  /* ---- (2) تصدير Excel ---- */
  const xp = await query("exam.exportResults", { id: ex.id }, admin);
  const row = xp.rows[0];
  check("(2) بيانات التصدير: هوية كاملة واسم وزمالة", row.nationalId === nid && row.nameAr === "طالب فحص" && row.fellowship.includes("زمالة فحص"));
  check("(2) موضوعي/مقالي/مجموع/نسبة/ناجح", row.objectiveScore === 4 && row.essayScore === 3 && row.totalScore === 7 && row.percentage === 88 && row.passed === true, JSON.stringify(row));
  check("(2) الحد الأقصى للموضوعي والمقالي", xp.objectiveMax === 4 && xp.essayMax === 4);

  /* ---- (3) استعلام النتيجة معطَّل ---- */
  await mutate("exam.publishResults", { id: ex.id, published: true }, admin);
  check("(3) candidate.myResult مرفوض حتى بعد النشر", await expectFail(() => mutate("candidate.myResult", { code: ex.code, nationalId: nid }), "FORBIDDEN"));

  /* ---- صلاحيات: الخبير الجديد لا يرى الاختبار ---- */
  const expT = (await mutate("auth.login", { username: `exp${stamp}`, password: "Expert@12345" })).token;
  check("الأمان: خبير غير معيَّن لا يفتح sessionReview", await expectFail(() => query("grading.sessionReview", { sessionId: s.sessionId }, expT), "FORBIDDEN"));
  check("الأمان: خبير غير معيَّن لا يعيد فتح جلسة", await expectFail(() => mutate("monitor.reopenSession", { sessionId: s.sessionId }, expT)));
} catch (e) {
  failed++; out.push(`💥 توقف: ${e.message}`);
}
console.log(out.join("\n"));
console.log(`\n${passed} ✅ / ${failed} ❌`);
process.exit(failed ? 1 : 0);
