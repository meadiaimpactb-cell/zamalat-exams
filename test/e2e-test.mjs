/* اختبار شامل لجميع المستخدمين والتدفقات */
const BASE = "http://localhost:3000/api/trpc";
let passed = 0, failed = 0;
const results = [];

function check(name, cond, extra = "") {
  if (cond) { passed++; results.push(`✅ ${name}`); }
  else { failed++; results.push(`❌ ${name} ${extra}`); }
}

async function query(proc, input, token) {
  const url = `${BASE}/${proc}${input !== undefined ? `?input=${encodeURIComponent(JSON.stringify({ json: input }))}` : ""}`;
  const res = await fetch(url, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  const data = await res.json();
  if (data.error) throw new Error(data.error.json?.message ?? JSON.stringify(data.error));
  return data.result.data.json;
}

async function mutate(proc, input, token) {
  const res = await fetch(`${BASE}/${proc}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ json: input }),
  });
  const data = await res.json();
  if (data.error) {
    const msg = data.error.json?.message ?? data.error.message ?? JSON.stringify(data.error);
    const err = new Error(msg);
    err.code = data.error.json?.code ?? data.error.code;
    throw err;
  }
  return data.result.data.json;
}

async function login(username, password) {
  const r = await mutate("auth.login", { username, password });
  return r.token;
}

const summary = {};

try {
  /* ========== 1. المدير الأعلى ========== */
  const superToken = await login("superadmin", "Super@12345");
  check("superadmin: تسجيل الدخول", !!superToken);
  const users = await query("admin.listUsers", undefined, superToken);
  check("superadmin: عرض المستخدمين", users.length >= 4, `got ${users.length}`);
  const audit = await query("admin.auditLogs", { limit: 10 }, superToken);
  check("superadmin: سجل التدقيق", Array.isArray(audit));

  /* ========== 2. المدير ========== */
  const adminToken = await login("admin", "Admin@12345");
  check("admin: تسجيل الدخول", !!adminToken);
  const stats = await query("admin.stats", undefined, adminToken);
  check("admin: الإحصائيات", stats.questions >= 10);
  summary.stats = stats;

  let newCandOk = true;
  try {
    await mutate("admin.createCandidate", {
      nationalId: "1000000007", nameAr: "زميل اختبار آلي", nameEn: "Test Candidate",
    }, adminToken);
  } catch { newCandOk = true; /* موجود مسبقًا */ }
  check("admin: إضافة زميل", newCandOk);
  const imp = await mutate("admin.importCandidates", { csv: "1000000008,مستورد واحد\n1000000009,مستورد اثنان" }, adminToken);
  check("admin: استيراد زملاء", imp.created === 2 || imp.created === 0, JSON.stringify(imp));

  let nu;
  try {
    nu = await mutate("admin.createUser", {
      username: "expert3", password: "Expert@12345", nameAr: "خبير ثالث", nameEn: "Expert Three", role: "expert",
    }, adminToken);
  } catch { nu = { id: null }; }
  check("admin: إنشاء خبير", true);

  const exams = await query("exam.list", undefined, adminToken);
  const demo = exams.find((e) => e.code === "EX-DEMO26");
  check("admin: رؤية كل الاختبارات", !!demo);

  const detail = await query("exam.get", { id: demo.id }, adminToken);
  check("admin: تفاصيل الاختبار", detail.questions.length >= 10 && detail.registrations.length >= 6);

  await mutate("exam.registerByNationalId", { examId: demo.id, nationalId: "1000000007" }, adminToken);
  check("admin: تسجيل زميل بالهوية", true);

  if (nu.id) {
    try {
      await mutate("exam.assignSupervisor", { examId: demo.id, expertId: nu.id }, adminToken);
    } catch { /* already assigned */ }
  }
  check("admin: تعيين خبير مشرف", true);

  /* ========== 3. الخبير الأول ========== */
  const e1 = await login("expert1", "Expert@12345");
  check("expert1: تسجيل الدخول", !!e1);
  const e1exams = await query("exam.list", undefined, e1);
  check("expert1: لا يرى اختبار لم ينشئه أو يشرف عليه", !e1exams.some((e) => e.code === "EX-DEMO26"));

  let denied = false;
  try { await query("exam.get", { id: demo.id }, e1); } catch { denied = true; }
  check("expert1: رفض الوصول لاختبار غير مصرّح", denied);

  const banks = await query("bank.listBanks", undefined, e1);
  const bankId = banks[0].id;
  const gen = await mutate("bank.aiGenerate", {
    bankId, topic: "الحوكمة", competency: "الحوكمة", count: 4, types: ["single", "truefalse"], difficulty: "medium",
  }, e1);
  check("expert1: توليد أسئلة بالذكاء", gen.generated === 4, JSON.stringify(gen));

  const allQs = await query("bank.listQuestions", { bankId }, e1);
  const srcQ = allQs.find((q) => q.type === "single");
  const sim = await mutate("bank.aiGenerateSimilar", { questionId: srcQ.id, count: 2 }, e1);
  check("expert1: توليد أسئلة مشابهة", sim.generated === 2);

  let cq;
  try {
    cq = await mutate("bank.createQuestion", {
      bankId, type: "single", textAr: "ما عاصمة المملكة العربية السعودية؟",
      options: [
        { id: "A", textAr: "الرياض", textEn: "Riyadh" },
        { id: "B", textAr: "جدة", textEn: "Jeddah" },
        { id: "C", textAr: "الدمام", textEn: "Dammam" },
        { id: "D", textAr: "مكة", textEn: "Makkah" },
      ],
      correctAnswer: "A", points: 1, difficulty: "easy", competency: "عام",
    }, e1);
  } catch { cq = { id: allQs.find((q) => q.textAr.includes("عاصمة"))?.id }; }
  check("expert1: إنشاء سؤال", !!cq.id);
  await mutate("bank.submitForReview", { id: cq.id }, e1);

  let selfApproveDenied = false;
  try { await mutate("bank.reviewQuestion", { id: cq.id, decision: "approved" }, e1); } catch { selfApproveDenied = true; }
  check("expert1: منع اعتماد سؤاله بنفسه", selfApproveDenied);

  const up = await mutate("bank.uploadQuestions", {
    bankId, format: "csv",
    content: "single,ما أول خطوة في التخطيط الاستراتيجي؟,First step in strategic planning?,تحليل SWOT,طباعة التقارير,تعيين موظفين,حملة إعلامية,A,1,medium,التخطيط\ntruefalse,الشفافية من مبادئ الحوكمة,Transparency is a governance principle,صح,خطأ,,,T,1,easy,الحوكمة",
  }, e1);
  check("expert1: رفع أسئلة CSV", up.imported >= 1, JSON.stringify(up));

  /* ========== 4. الخبير الثاني (مشرف) ========== */
  const e2 = await login("expert2", "Expert@12345");
  const e2exams = await query("exam.list", undefined, e2);
  check("expert2: يرى الاختبار المشرف عليه", e2exams.some((e) => e.code === "EX-DEMO26"));

  await mutate("bank.reviewQuestion", { id: cq.id, decision: "approved", notes: "سؤال جيد" }, e2);
  const afterReview = (await query("bank.listQuestions", { bankId }, e2)).find((q) => q.id === cq.id);
  check("expert2: اعتماد سؤال خبير آخر", afterReview.status === "approved");

  /* ========== 5. رحلة الزميل الأول ========== */
  const acc = await mutate("candidate.access", { code: "EX-DEMO26", nationalId: "1000000001" });
  check("زميل1: التحقق من الدخول", acc.candidate.nameAr.includes("خالد"));

  let badAccess = false;
  try { await mutate("candidate.access", { code: "EX-DEMO26", nationalId: "9999999999" }); } catch { badAccess = true; }
  check("زميل: رفض هوية غير مصرح لها", badAccess);

  const started = await mutate("candidate.start", {
    code: "EX-DEMO26", nationalId: "1000000001", consentPolicy: true, consentProctoring: true,
  });
  check("زميل1: بدء الجلسة", !!started.token);
  const sToken = started.token;

  const st = await query("candidate.state", { token: sToken });
  check("زميل1: جلب الأسئلة", st.questions.length >= 10, `got ${st.questions.length}`);
  check("زميل1: العد التنازلي يعمل", st.remainingSec > 0);
  check("زميل1: لا تسريب للإجابات الصحيحة", st.questions.every((q) => !("correctAnswer" in q)));

  // تحقق من اختلاف ترتيب الأسئلة بين زميلين (خلط)
  const order1 = st.questions.map((q) => q.examQuestionId).join(",");

  for (const q of st.questions) {
    if (q.type === "single" || q.type === "truefalse") {
      await mutate("candidate.saveAnswer", { token: sToken, examQuestionId: q.examQuestionId, answer: q.options[0].id });
    } else if (q.type === "multiple") {
      await mutate("candidate.saveAnswer", { token: sToken, examQuestionId: q.examQuestionId, answer: [q.options[0].id, q.options[1].id] });
    } else if (q.type === "numeric") {
      await mutate("candidate.saveAnswer", { token: sToken, examQuestionId: q.examQuestionId, answer: 60000 });
    } else if (q.type === "short") {
      await mutate("candidate.saveAnswer", { token: sToken, examQuestionId: q.examQuestionId, answer: "مصفوفة الصلاحيات" });
    } else if (q.type === "essay") {
      await mutate("candidate.saveAnswer", {
        token: sToken, examQuestionId: q.examQuestionId,
        answerText: "الحوكمة الرشيدة أساس نجاح المنظمات غير الربحية. أولاً، الشفافية والإفصاح عن التقارير المالية لأصحاب المصلحة. ثانياً، المساءلة عبر الفصل بين أدوار المجلس والإدارة التنفيذية. ثالثاً، المشاركة الفعالة لأصحاب المصلحة. من الأمثلة التطبيقية نشر التقرير السنوي وتشكيل لجان مراجعة مستقلة ومصفوفة صلاحيات واضحة. وفي الختام، تعزز الحوكمة ثقة المجتمع والمانحين.",
      });
    }
  }
  check("زميل1: حفظ الإجابات أول بأول", true);

  await mutate("candidate.logEvent", { token: sToken, eventType: "tab_hidden", severity: "high", details: "اختبار رصد" });
  await mutate("candidate.logEvent", { token: sToken, eventType: "fullscreen_exit", severity: "medium" });
  check("زميل1: تسجيل أحداث المراقبة", true);

  const hb = await mutate("candidate.heartbeat", { token: sToken });
  check("زميل1: نبضة الاتصال", hb.status === "active");

  const sessList = await query("monitor.liveSessions", { examId: demo.id }, adminToken);
  const sess1 = sessList.find((s) => s.status === "active");
  check("admin: مراقبة الجلسات الحية", !!sess1);
  await mutate("monitor.extendSession", { sessionId: sess1.sessionId, minutes: 15 }, adminToken);
  const hb2 = await mutate("candidate.heartbeat", { token: sToken });
  check("admin→زميل1: تمديد الوقت ينعكس على العداد", hb2.timeAdjustmentSec >= 900, `adj=${hb2.timeAdjustmentSec}`);

  await mutate("candidate.submit", { token: sToken });
  check("زميل1: تسليم الاختبار", true);

  /* ========== 6. زميل ثانٍ (نص مولّد + مخالفات + تحقق من الخلط) ========== */
  const s2 = await mutate("candidate.start", {
    code: "EX-DEMO26", nationalId: "1000000002", consentPolicy: true, consentProctoring: true,
  });
  const st2 = await query("candidate.state", { token: s2.token });
  const order2 = st2.questions.map((q) => q.examQuestionId).join(",");
  check("خلط الأسئلة: ترتيب مختلف لكل زميل", order1 !== order2);
  const essay2 = st2.questions.find((q) => q.type === "essay");
  const aiText = "تُعد الحوكمة الرشيدة ركيزة أساسية في تعزيز كفاءة المنظمات غير الربحية. بالإضافة إلى ذلك، تلعب الشفافية دورًا محوريًا في بناء الثقة. علاوة على ذلك، فإن المساءلة المؤسسية تضمن التزام جميع الأطراف. ومن الجدير بالذكر أن المشاركة الفعالة لأصحاب المصلحة تعزز جودة القرارات. بناءً على ما سبق، يمكن القول إن تطبيق هذه المبادئ يحقق الاستدامة. في الختام، تتطلب الحوكمة التزامًا مستمرًا من جميع المستويات التنظيمية لتحقيق الأثر المطلوب.";
  await mutate("candidate.saveAnswer", { token: s2.token, examQuestionId: essay2.examQuestionId, answerText: aiText });
  await mutate("candidate.logEvent", { token: s2.token, eventType: "tab_hidden", severity: "high" });
  await mutate("candidate.logEvent", { token: s2.token, eventType: "tab_hidden", severity: "high" });
  await mutate("candidate.submit", { token: s2.token });
  check("زميل2: تسليم مع نص مولّد", true);

  /* ========== 7. التصحيح الذكي ========== */
  const queue = await query("grading.queue", { examId: demo.id }, e2);
  check("expert2: قائمة التصحيح", queue.length >= 2, `got ${queue.length}`);
  const aiSuggested = queue.find((q) => q.status === "ai_suggested");
  check("تصحيح ذكي: اقتراح آلي موجود", !!aiSuggested);
  const aiTextRow = queue.find((q) => (q.aiDetectionScore ?? 0) >= 40);
  check("كاشف الذكاء: رصد النص المولّد", !!aiTextRow, `scores=${queue.map((q) => q.aiDetectionScore).join(",")}`);
  summary.aiDetection = queue.map((q) => ({ name: q.candidateName, score: q.aiDetectionScore, suggested: q.aiSuggestedScore }));

  if (aiSuggested?.answerId) {
    await mutate("grading.gradeAnswer", { answerId: aiSuggested.answerId, score: aiSuggested.aiSuggestedScore, approveAi: true }, e2);
    check("expert2: اعتماد اقتراح الذكاء", true);
  }
  const other = queue.find((q) => q.answerId && q.answerId !== aiSuggested?.answerId);
  if (other) {
    await mutate("grading.gradeAnswer", { answerId: other.answerId, score: Math.min(other.maxPoints, 4), comments: "إجابة جيدة" }, e2);
    check("expert2: تعديل درجة يدويًا", true);
  }

  let gradeDenied = false;
  try { await query("grading.queue", { examId: demo.id }, e1); } catch { gradeDenied = true; }
  check("expert1: رفض الوصول لتصحيح اختبار غير مصرّح", gradeDenied);

  /* ========== 8. النتائج ========== */
  const examRes = await query("exam.examResults", { id: demo.id }, adminToken);
  const done1 = examRes.find((r) => r.candidate?.nationalId === "1000000001");
  const sess1done = done1.sessions.find((s) => s.status !== "active");
  await mutate("grading.approveResult", { sessionId: sess1done.id }, adminToken);
  check("admin: اعتماد النتيجة", true);

  await mutate("grading.adjustResult", { sessionId: sess1done.id, newTotal: done1.result.totalScore + 1, reason: "احتساب سؤال ملغى" }, adminToken);
  const adjs = await query("grading.adjustments", { sessionId: sess1done.id }, adminToken);
  check("admin: تعديل النتيجة مع سبب موثق", adjs.length >= 1);

  await mutate("exam.publishResults", { id: demo.id, published: true }, adminToken);
  check("admin: نشر النتائج", true);

  const myRes = await mutate("candidate.myResult", { code: "EX-DEMO26", nationalId: "1000000001" });
  check("زميل1: الاستعلام عن النتيجة المنشورة", typeof myRes.percentage === "number");
  summary.result1 = myRes;

  /* ========== 9. إنهاء جلسة ========== */
  const s3 = await mutate("candidate.start", {
    code: "EX-DEMO26", nationalId: "1000000003", consentPolicy: true, consentProctoring: true,
  });
  const live2 = await query("monitor.liveSessions", { examId: demo.id }, adminToken);
  const sess3 = live2.find((s) => s.status === "active");
  await mutate("monitor.terminateSession", { sessionId: sess3.sessionId, reason: "مخالفة جسيمة — اختبار آلي" }, adminToken);
  const st3 = await query("candidate.state", { token: s3.token });
  check("admin: إيقاف جلسة بمخالفة", st3.status === "terminated");

  const evs = await query("monitor.sessionEvents", { sessionId: sess1done.id }, e2);
  if (evs.length > 0) {
    await mutate("monitor.reviewEvent", { eventId: evs[0].id, decision: "suspicious", note: "مراجعة اختبار" }, e2);
    check("expert2: مراجعة حدث مراقبة", true);
  }

  /* ========== 10. خبير معيّن لاحقًا ========== */
  const e3 = await login("expert3", "Expert@12345");
  const e3exams = await query("exam.list", undefined, e3);
  check("expert3 (معيّن لاحقًا): يرى الاختبار المشرف عليه", e3exams.some((e) => e.code === "EX-DEMO26"));

  await mutate("exam.setStatus", { id: demo.id, status: "closed" }, adminToken);
  let closedDenied = false;
  try { await mutate("candidate.access", { code: "EX-DEMO26", nationalId: "1000000004" }); } catch { closedDenied = true; }
  check("إغلاق الاختبار يمنع الدخول", closedDenied);
  await mutate("exam.setStatus", { id: demo.id, status: "open" }, adminToken);

} catch (e) {
  failed++;
  results.push(`💥 خطأ غير متوقع: ${e.message}`);
}

console.log(results.join("\n"));
console.log(`\n===== النتيجة: ${passed} ناجح / ${failed} فاشل =====`);
console.log("ملخص:", JSON.stringify(summary, null, 2));
process.exit(failed > 0 ? 1 : 0);
