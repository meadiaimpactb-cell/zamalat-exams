import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import {
  exams, examQuestions, examRegistrations, candidates, examSessions,
  questions, answers, answerScores, results, sessionEvents, sessionSnapshots,
} from "@db/schema";
import { eq, and, inArray, gt, desc } from "drizzle-orm";
import { generateToken, seededShuffle, sha256 } from "./lib/security";
import { suggestEssayScore, detectAIText } from "./lib/aiEngine";
import { FEATURES } from "@contracts/features";

async function gradeObjective(
  qType: string,
  correct: unknown,
  answer: unknown,
  points: number,
): Promise<number | null> {
  if (answer === null || answer === undefined || answer === "") return 0;
  if (qType === "single" || qType === "truefalse") {
    return String(answer) === String(correct) ? points : 0;
  }
  if (qType === "multiple") {
    const correctSet = new Set((correct as string[]) ?? []);
    const ansSet = new Set((answer as string[]) ?? []);
    if (correctSet.size === 0) return 0;
    let good = 0, bad = 0;
    for (const a of ansSet) { if (correctSet.has(a)) good++; else bad++; }
    const ratio = Math.max(0, (good - bad * 0.5) / correctSet.size);
    return Math.round(ratio * points * 100) / 100;
  }
  if (qType === "short") {
    const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
    return norm(String(answer)) === norm(String(correct ?? "")) ? points : 0;
  }
  if (qType === "numeric") {
    const diff = Math.abs(Number(answer) - Number(correct));
    return diff <= 0.01 ? points : 0;
  }
  return null; // essay → manual
}

/**
 * عدد مرات الخروج من ملء الشاشة المحتسبة (ملاحظة 6): بعد إعادة الفتح يبدأ العدّاد من الصفر —
 * نحسب أحداث fullscreen_exit التي معرّفها أكبر من معرّف آخر حدث session_reopened
 * (المعرّف أدق من الطابع الزمني ذي الثانية الواحدة).
 */
async function countFullscreenExits(sessionId: number): Promise<number> {
  const db = getDb();
  const [lastReopen] = await db.select({ id: sessionEvents.id }).from(sessionEvents)
    .where(and(eq(sessionEvents.sessionId, sessionId), eq(sessionEvents.eventType, "session_reopened")))
    .orderBy(desc(sessionEvents.id)).limit(1);
  const rows = await db.select({ id: sessionEvents.id }).from(sessionEvents)
    .where(and(
      eq(sessionEvents.sessionId, sessionId),
      eq(sessionEvents.eventType, "fullscreen_exit"),
      ...(lastReopen ? [gt(sessionEvents.id, lastReopen.id)] : []),
    ));
  return rows.length;
}

async function getSession(token: string) {
  const db = getDb();
  const session = await db.query.examSessions.findFirst({ where: eq(examSessions.token, token) });
  if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "الجلسة غير موجودة" });
  const reg = await db.query.examRegistrations.findFirst({ where: eq(examRegistrations.id, session.registrationId) });
  const exam = reg ? await db.query.exams.findFirst({ where: eq(exams.id, reg.examId) }) : null;
  const cand = reg ? await db.query.candidates.findFirst({ where: eq(candidates.id, reg.candidateId) }) : null;
  return { session, reg: reg!, exam: exam!, cand: cand! };
}

async function finalizeIfNeeded(sessionId: number) {
  const { session, reg, exam } = await getSessionById(sessionId);
  if (session.status !== "active") return session;
  const deadline = new Date(session.deadline.getTime() + session.timeAdjustmentSec * 1000);
  if (new Date() > deadline) {
    await submitSession(session, reg, exam, true);
    return (await getSessionById(sessionId)).session;
  }
  return session;
}

async function getSessionById(id: number) {
  const db = getDb();
  const session = (await db.query.examSessions.findFirst({ where: eq(examSessions.id, id) }))!;
  const reg = (await db.query.examRegistrations.findFirst({ where: eq(examRegistrations.id, session.registrationId) }))!;
  const exam = (await db.query.exams.findFirst({ where: eq(exams.id, reg.examId) }))!;
  const cand = (await db.query.candidates.findFirst({ where: eq(candidates.id, reg.candidateId) }))!;
  return { session, reg, exam, cand };
}

async function submitSession(session: typeof examSessions.$inferSelect, reg: typeof examRegistrations.$inferSelect, exam: typeof exams.$inferSelect, auto: boolean) {
  const db = getDb();
  const now = new Date();
  await db.update(examSessions).set({
    status: auto ? "auto_submitted" : "submitted",
    submittedAt: now,
  }).where(eq(examSessions.id, session.id));
  await db.update(examRegistrations).set({ status: "completed" }).where(eq(examRegistrations.id, reg.id));

  const eqs = await db.select().from(examQuestions).where(eq(examQuestions.examId, exam.id));
  const qIds = eqs.map((x) => x.questionId);
  const qs = qIds.length ? await db.select().from(questions).where(
    eq(questions.id, qIds[0]),
  ) : [];
  // fetch all questions
  const allQ = [];
  for (const x of eqs) {
    const q = await db.query.questions.findFirst({ where: eq(questions.id, x.questionId) });
    if (q) allQ.push({ eq: x, q });
  }
  void qs;

  let total = 0, max = 0, pendingManual = 0;
  for (const { eq: x, q } of allQ) {
    max += x.points;
    const ans = await db.query.answers.findFirst({
      where: and(eq(answers.sessionId, session.id), eq(answers.examQuestionId, x.id)),
    });
    const existing = await db.query.answerScores.findFirst({ where: eq(answerScores.answerId, ans?.id ?? -1) });
    if (existing) { total += existing.finalScore ?? existing.autoScore ?? 0; if (existing.status === "ai_suggested" || existing.status === "pending_review") pendingManual++; continue; }
    // إجابة صورة على سؤال يسمح بها → تصحيح يدوي مثل المقالي (المتطلب 1 / قرار 10-أ)
    const isImageManual = q.allowImageAnswer && !!ans?.answerImageUrl;
    if (q.type === "essay" || isImageManual) {
      let aiScore: number | null = null;
      let aiFeedback: string | null = null;
      let status: "pending_review" | "ai_suggested" = "pending_review";
      if (ans?.answerText && ans.answerText.trim().length > 0) {
        const det = detectAIText(ans.answerText);
        await db.update(answers).set({ aiDetectionScore: det.score, aiDetectionLabel: det.label }).where(eq(answers.id, ans.id));
        const sug = suggestEssayScore(ans.answerText, q.modelAnswer, x.points);
        aiScore = sug.score;
        aiFeedback = sug.feedback + "\n\n[كاشف الذكاء الاصطناعي: " + det.score + "% — " + det.reasons.join(" ") + "]";
        status = "ai_suggested";
      }
      if (ans) {
        await db.insert(answerScores).values({
          answerId: ans.id,
          aiSuggestedScore: aiScore,
          aiFeedback,
          status,
        });
      }
      pendingManual++;
    } else {
      const score = await gradeObjective(q.type, q.correctAnswer, ans?.answer ?? null, x.points);
      total += score ?? 0;
      if (ans) {
        await db.insert(answerScores).values({
          answerId: ans.id,
          autoScore: score ?? 0,
          finalScore: score ?? 0,
          status: "auto",
          gradedAt: now,
        });
      }
    }
  }
  const percentage = max > 0 ? Math.round((total / max) * 100) : 0;
  const existingResult = await db.query.results.findFirst({ where: eq(results.sessionId, session.id) });
  if (existingResult) {
    await db.update(results).set({
      totalScore: Math.round(total * 100) / 100,
      maxScore: max,
      percentage,
      passed: percentage >= exam.passScore,
      gradingStatus: pendingManual > 0 ? "in_review" : "completed",
    }).where(eq(results.id, existingResult.id));
  } else {
    await db.insert(results).values({
      sessionId: session.id,
      totalScore: Math.round(total * 100) / 100,
      maxScore: max,
      percentage,
      passed: percentage >= exam.passScore,
      gradingStatus: pendingManual > 0 ? "in_review" : "completed",
    });
  }
}

export const candidateRouter = createRouter({
  /** التحقق من الدخول برمز الاختبار ورقم الهوية */
  access: publicQuery
    .input(z.object({ code: z.string().min(3), nationalId: z.string().min(5) }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const exam = await db.query.exams.findFirst({ where: eq(exams.code, input.code.toUpperCase()) });
      if (!exam) throw new TRPCError({ code: "NOT_FOUND", message: "رمز الاختبار غير صحيح" });
      if (exam.status !== "open") throw new TRPCError({ code: "BAD_REQUEST", message: "الاختبار غير متاح حاليًا" });
      const now = new Date();
      if (exam.openAt && now < exam.openAt) throw new TRPCError({ code: "BAD_REQUEST", message: "لم يبدأ وقت الاختبار بعد" });
      if (exam.closeAt && now > exam.closeAt) throw new TRPCError({ code: "BAD_REQUEST", message: "انتهى وقت الاختبار" });
      const cand = await db.query.candidates.findFirst({ where: eq(candidates.nationalId, input.nationalId) });
      if (!cand || !cand.active) throw new TRPCError({ code: "FORBIDDEN", message: "رقم الهوية غير مصرح له بهذا الاختبار" });
      const reg = await db.query.examRegistrations.findFirst({
        where: and(eq(examRegistrations.examId, exam.id), eq(examRegistrations.candidateId, cand.id)),
      });
      if (!reg) throw new TRPCError({ code: "FORBIDDEN", message: "رقم الهوية غير مصرح له بهذا الاختبار" });
      const sessions = await db.select().from(examSessions).where(eq(examSessions.registrationId, reg.id));
      const done = sessions.filter((s) => s.status !== "active").length;
      if (done >= reg.maxAttempts) throw new TRPCError({ code: "FORBIDDEN", message: "استنفدت عدد المحاولات المسموحة" });
      const active = sessions.find((s) => s.status === "active");
      return {
        exam: {
          id: exam.id, code: exam.code, titleAr: exam.titleAr, titleEn: exam.titleEn,
          instructionsAr: exam.instructionsAr, instructionsEn: exam.instructionsEn,
          durationMin: exam.durationMin, lockdown: exam.lockdown, proctoring: exam.proctoring,
          cameraRequired: exam.cameraRequired,
          // لدليل الطالب والقواعد الأساسية قبل البدء
          maxFullscreenExits: exam.maxFullscreenExits, snapshotIntervalSec: exam.snapshotIntervalSec,
        },
        candidate: { nameAr: cand.nameAr, nameEn: cand.nameEn, maskedId: cand.nationalIdMasked },
        extraTimeMin: reg.extraTimeMin,
        resumeToken: active?.token ?? null,
        ip: ctx.req.headers.get("x-forwarded-for") ?? "",
      };
    }),

  /** بدء جلسة اختبار */
  start: publicQuery
    .input(z.object({
      code: z.string(), nationalId: z.string(),
      consentPolicy: z.boolean(), consentProctoring: z.boolean(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!input.consentPolicy || !input.consentProctoring) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "يجب الموافقة على السياسات والمراقبة" });
      }
      const db = getDb();
      const exam = await db.query.exams.findFirst({ where: eq(exams.code, input.code.toUpperCase()) });
      if (!exam || exam.status !== "open") throw new TRPCError({ code: "BAD_REQUEST", message: "الاختبار غير متاح" });
      const cand = await db.query.candidates.findFirst({ where: eq(candidates.nationalId, input.nationalId) });
      if (!cand) throw new TRPCError({ code: "FORBIDDEN" });
      const reg = await db.query.examRegistrations.findFirst({
        where: and(eq(examRegistrations.examId, exam.id), eq(examRegistrations.candidateId, cand.id)),
      });
      if (!reg) throw new TRPCError({ code: "FORBIDDEN" });
      const sessions = await db.select().from(examSessions).where(eq(examSessions.registrationId, reg.id));
      const active = sessions.find((s) => s.status === "active");
      if (active) return { token: active.token, resumed: true };
      const done = sessions.filter((s) => s.status !== "active").length;
      if (done >= reg.maxAttempts) throw new TRPCError({ code: "FORBIDDEN", message: "استنفدت المحاولات" });

      const eqs = await db.select().from(examQuestions).where(eq(examQuestions.examId, exam.id));
      if (eqs.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "لا توجد أسئلة في الاختبار" });
      const token = generateToken();
      const seed = parseInt(sha256(token).slice(0, 8), 16);
      const order = exam.shuffleQuestions ? seededShuffle(eqs.map((x) => x.id), seed) : eqs.map((x) => x.id);
      const optionOrders: Record<string, string[]> = {};
      if (exam.shuffleOptions) {
        for (const x of eqs) {
          const q = await db.query.questions.findFirst({ where: eq(questions.id, x.questionId) });
          if (q?.options && q.type !== "truefalse") {
            optionOrders[String(x.id)] = seededShuffle(q.options.map((o) => o.id), seed + x.id);
          }
        }
      }
      const durationSec = (exam.durationMin + reg.extraTimeMin) * 60;
      const deadline = new Date(Date.now() + durationSec * 1000);
      await db.insert(examSessions).values({
        registrationId: reg.id,
        token,
        questionOrder: order,
        optionOrders,
        deadline,
        ipAddress: ctx.req.headers.get("x-forwarded-for") ?? "",
        userAgent: ctx.req.headers.get("user-agent") ?? "",
      });
      await db.update(examRegistrations).set({ status: "in_progress" }).where(eq(examRegistrations.id, reg.id));
      return { token, resumed: false };
    }),

  /** حالة الجلسة + الأسئلة (بدون الإجابات الصحيحة) */
  state: publicQuery
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const { session, exam, cand, reg } = await getSession(input.token);
      const s = await finalizeIfNeeded(session.id);
      const db = getDb();
      const eqs = await db.select().from(examQuestions).where(eq(examQuestions.examId, exam.id));
      const order = (s.questionOrder ?? eqs.map((x) => x.id)) as number[];
      const optionOrders = (s.optionOrders ?? {}) as Record<string, string[]>;
      const out = [];
      for (const eqId of order) {
        const x = eqs.find((e) => e.id === eqId);
        if (!x) continue;
        const q = await db.query.questions.findFirst({ where: eq(questions.id, x.questionId) });
        if (!q) continue;
        let opts = q.options ?? [];
        const oo = optionOrders[String(x.id)];
        if (oo) opts = oo.map((id) => opts.find((o) => o.id === id)!).filter(Boolean);
        out.push({
          examQuestionId: x.id,
          type: q.type,
          textAr: q.textAr,
          textEn: q.textEn,
          imageUrl: q.imageUrl ?? null,
          allowImageAnswer: q.allowImageAnswer,
          options: opts.map((o) => ({ id: o.id, textAr: o.textAr, textEn: o.textEn })),
          points: x.points,
          section: x.section,
        });
      }
      const saved = await db.select().from(answers).where(eq(answers.sessionId, s.id));
      // عدد مرات الخروج من ملء الشاشة المحتسبة حتى الآن (بعد آخر إعادة فتح) — لعرض المتبقي عند الاستئناف
      const fullscreenExitsUsed = await countFullscreenExits(s.id);
      const deadline = new Date(s.deadline.getTime() + s.timeAdjustmentSec * 1000);
      const durationSec = (exam.durationMin + reg.extraTimeMin) * 60 + s.timeAdjustmentSec;
      return {
        status: s.status,
        exam: {
          titleAr: exam.titleAr, titleEn: exam.titleEn, code: exam.code,
          lockdown: exam.lockdown, proctoring: exam.proctoring, cameraRequired: exam.cameraRequired,
          snapshotIntervalSec: exam.snapshotIntervalSec, maxFullscreenExits: exam.maxFullscreenExits,
          durationSec,
        },
        candidate: { nameAr: cand.nameAr, maskedId: cand.nationalIdMasked },
        questions: out,
        answers: saved.map((a) => ({ examQuestionId: a.examQuestionId, answer: a.answer, answerText: a.answerText, answerImageUrl: a.answerImageUrl ?? null, flagged: a.flagged })),
        remainingSec: Math.max(0, Math.floor((deadline.getTime() - Date.now()) / 1000)),
        elapsedSec: Math.max(0, Math.floor((Date.now() - s.startedAt.getTime()) / 1000)),
        serverTime: Date.now(),
        riskScore: s.riskScore,
        fullscreenExitsUsed,
        reopened: !!s.reopenedAt,
      };
    }),

  /** حفظ إجابة (أول بأول) */
  saveAnswer: publicQuery
    .input(z.object({
      token: z.string(),
      examQuestionId: z.number(),
      answer: z.union([z.array(z.string()), z.string(), z.number(), z.null()]).optional(),
      answerText: z.string().optional(),
      answerImageUrl: z.string().max(8_000_000).nullable().optional(),
      flagged: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const { session } = await getSession(input.token);
      if (session.status !== "active") throw new TRPCError({ code: "BAD_REQUEST", message: "الجلسة منتهية" });
      await finalizeIfNeeded(session.id);
      const db = getDb();
      const existing = await db.query.answers.findFirst({
        where: and(eq(answers.sessionId, session.id), eq(answers.examQuestionId, input.examQuestionId)),
      });
      if (existing) {
        await db.update(answers).set({
          answer: input.answer !== undefined ? input.answer : existing.answer,
          answerText: input.answerText !== undefined ? input.answerText : existing.answerText,
          answerImageUrl: input.answerImageUrl !== undefined ? input.answerImageUrl : existing.answerImageUrl,
          flagged: input.flagged !== undefined ? input.flagged : existing.flagged,
        }).where(eq(answers.id, existing.id));
      } else {
        await db.insert(answers).values({
          sessionId: session.id,
          examQuestionId: input.examQuestionId,
          answer: input.answer ?? null,
          answerText: input.answerText ?? null,
          answerImageUrl: input.answerImageUrl ?? null,
          flagged: input.flagged ?? false,
        });
      }
      await db.update(examSessions).set({ lastActivityAt: new Date() }).where(eq(examSessions.id, session.id));
      return { ok: true, savedAt: Date.now() };
    }),

  /** نبضة اتصال + تحقق من التمديد أو الإيقاف */
  heartbeat: publicQuery
    .input(z.object({ token: z.string() }))
    .mutation(async ({ input }) => {
      const { session } = await getSession(input.token);
      const s = await finalizeIfNeeded(session.id);
      const db = getDb();
      await db.update(examSessions).set({ lastActivityAt: new Date() }).where(eq(examSessions.id, s.id));
      const deadline = new Date(s.deadline.getTime() + s.timeAdjustmentSec * 1000);
      return {
        status: s.status,
        remainingSec: Math.max(0, Math.floor((deadline.getTime() - Date.now()) / 1000)),
        timeAdjustmentSec: s.timeAdjustmentSec,
      };
    }),

  /** تسجيل حدث مراقبة */
  logEvent: publicQuery
    .input(z.object({
      token: z.string(),
      eventType: z.string().max(80),
      severity: z.enum(["info", "low", "medium", "high", "critical"]).default("info"),
      details: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { session, exam } = await getSession(input.token);
      const db = getDb();
      // انقطاع الإنترنت (ملاحظة 5): يُسجَّل في سجل المراقبة كمعلومة فقط — لا يُحتسب مخالفة ولا يرفع درجة الخطورة
      const isNetwork = input.eventType === "network_offline" || input.eventType === "network_reconnected";
      const severity = isNetwork ? "info" : input.severity;
      await db.insert(sessionEvents).values({
        sessionId: session.id,
        eventType: input.eventType,
        severity,
        details: input.details ?? null,
      });
      const riskAdd = { info: 0, low: 2, medium: 6, high: 15, critical: 30 }[severity];
      if (riskAdd > 0) {
        await db.update(examSessions).set({ riskScore: Math.min(100, session.riskScore + riskAdd) })
          .where(eq(examSessions.id, session.id));
      }

      // الإنهاء التلقائي بعد تجاوز حد الخروج من ملء الشاشة (المتطلب 8/10)
      let terminated = false;
      let fullscreenExits = 0;
      if (input.eventType === "fullscreen_exit" && exam.maxFullscreenExits > 0 && session.status === "active") {
        // بعد إعادة الفتح (ملاحظة 6) يبدأ عدّاد الخروج من الصفر: نحسب الأحداث اللاحقة لآخر إعادة فتح فقط
        fullscreenExits = await countFullscreenExits(session.id);
        if (fullscreenExits >= exam.maxFullscreenExits) {
          await db.update(examSessions).set({ status: "terminated", submittedAt: new Date() })
            .where(eq(examSessions.id, session.id));
          await db.update(examRegistrations).set({ status: "terminated" })
            .where(eq(examRegistrations.id, session.registrationId));
          await db.insert(sessionEvents).values({
            sessionId: session.id,
            eventType: "auto_terminated_fullscreen",
            severity: "critical",
            details: `إنهاء تلقائي بعد ${fullscreenExits} مرات خروج من ملء الشاشة (الحد ${exam.maxFullscreenExits})`,
          });
          terminated = true;
        }
      }
      return { ok: true, terminated, fullscreenExits, maxFullscreenExits: exam.maxFullscreenExits };
    }),

  /** رفع لقطة كاميرا دورية أثناء الاختبار (المتطلب 5) */
  uploadSnapshot: publicQuery
    .input(z.object({
      token: z.string(),
      image: z.string().min(20).max(4_000_000), // data URL base64
      kind: z.enum(["camera", "screen"]).default("camera"),
    }))
    .mutation(async ({ input }) => {
      const { session } = await getSession(input.token);
      if (session.status !== "active") return { ok: false };
      const db = getDb();
      // سقف أمان: احتفظ بحد أقصى ~300 لقطة لكل جلسة (اختبار 4 ساعات كل دقيقة ≈ 240)
      const existing = await db.select({ id: sessionSnapshots.id }).from(sessionSnapshots)
        .where(eq(sessionSnapshots.sessionId, session.id));
      if (existing.length >= 300) {
        // احذف الأقدم للحفاظ على السعة
        const oldest = existing.slice(0, existing.length - 299).map((r) => r.id);
        if (oldest.length) await db.delete(sessionSnapshots).where(inArray(sessionSnapshots.id, oldest));
      }
      await db.insert(sessionSnapshots).values({
        sessionId: session.id,
        image: input.image,
        kind: input.kind,
      });
      return { ok: true };
    }),

  /** تسليم الاختبار */
  submit: publicQuery
    .input(z.object({ token: z.string() }))
    .mutation(async ({ input }) => {
      const { session, reg, exam } = await getSession(input.token);
      if (session.status !== "active") return { ok: true, already: true };
      await submitSession(session, reg, exam, false);
      return { ok: true };
    }),

  /** نتيجة الزميل (بعد النشر فقط) */
  myResult: publicQuery
    .input(z.object({ code: z.string(), nationalId: z.string() }))
    .mutation(async ({ input }) => {
      // ملاحظة 3: الاستعلام معطَّل بمفتاح تهيئة — النتائج تُعلن عبر موقع الزمالة الرئيسي فقط
      if (!FEATURES.candidateResultLookup) {
        throw new TRPCError({ code: "FORBIDDEN", message: "تُعلن النتائج عبر موقع الزمالة الرئيسي" });
      }
      const db = getDb();
      const exam = await db.query.exams.findFirst({ where: eq(exams.code, input.code.toUpperCase()) });
      if (!exam) throw new TRPCError({ code: "NOT_FOUND", message: "رمز الاختبار غير صحيح" });
      if (!exam.resultsPublished) throw new TRPCError({ code: "FORBIDDEN", message: "النتائج غير منشورة بعد" });
      const cand = await db.query.candidates.findFirst({ where: eq(candidates.nationalId, input.nationalId) });
      if (!cand) throw new TRPCError({ code: "FORBIDDEN", message: "رقم الهوية غير مصرح" });
      const reg = await db.query.examRegistrations.findFirst({
        where: and(eq(examRegistrations.examId, exam.id), eq(examRegistrations.candidateId, cand.id)),
      });
      if (!reg) throw new TRPCError({ code: "FORBIDDEN" });
      const sessions = await db.select().from(examSessions).where(eq(examSessions.registrationId, reg.id));
      const done = sessions.find((s) => s.status !== "active");
      if (!done) throw new TRPCError({ code: "NOT_FOUND", message: "لا توجد جلسة مكتملة" });
      const result = await db.query.results.findFirst({ where: eq(results.sessionId, done.id) });
      if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "النتيجة قيد الاعتماد" });
      return {
        examTitleAr: exam.titleAr, examTitleEn: exam.titleEn,
        candidateName: cand.nameAr,
        percentage: result.percentage,
        totalScore: result.totalScore, maxScore: result.maxScore,
        passed: result.passed,
      };
    }),
});
