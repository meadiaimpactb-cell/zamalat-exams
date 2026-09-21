import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter } from "./middleware";
import { staffProcedure, requireExamAccess, audit } from "./authz";
import { getDb } from "./queries/connection";
import {
  exams, examQuestions, examRegistrations, examSessions, candidates,
  questions, answers, answerScores, results, gradeAdjustments,
} from "@db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { suggestEssayScore } from "./lib/aiEngine";

export const gradingRouter = createRouter({
  /** قائمة التصحيح للاختبار: إجابات الأسئلة المفتوحة */
  queue: staffProcedure
    .input(z.object({ examId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireExamAccess(ctx.user, input.examId);
      const db = getDb();
      const eqs = await db.select().from(examQuestions).where(eq(examQuestions.examId, input.examId));
      const qIds = eqs.map((x) => x.questionId);
      const qs = qIds.length ? await db.select().from(questions).where(inArray(questions.id, qIds)) : [];
      // للتصحيح اليدوي: الأسئلة المقالية + أي سؤال يسمح بإجابة صورة (تُصحَّح يدويًا)
      const manualEqs = eqs.filter((x) => {
        const q = qs.find((qq) => qq.id === x.questionId);
        return q?.type === "essay" || q?.allowImageAnswer === true;
      });
      const regs = await db.select().from(examRegistrations).where(eq(examRegistrations.examId, input.examId));
      const sessions = regs.length
        ? await db.select().from(examSessions).where(inArray(examSessions.registrationId, regs.map((r) => r.id)))
        : [];
      const doneSessions = sessions.filter((s) => s.status !== "active");
      const out = [];
      for (const s of doneSessions) {
        const reg = regs.find((r) => r.id === s.registrationId)!;
        const cand = await db.query.candidates.findFirst({ where: eq(candidates.id, reg.candidateId) });
        for (const x of manualEqs) {
          const ans = await db.query.answers.findFirst({
            where: and(eq(answers.sessionId, s.id), eq(answers.examQuestionId, x.id)),
          });
          const q = qs.find((qq) => qq.id === x.questionId)!;
          const score = ans ? await db.query.answerScores.findFirst({ where: eq(answerScores.answerId, ans.id) }) : null;
          out.push({
            sessionId: s.id,
            answerId: ans?.id ?? null,
            candidateName: cand?.nameAr ?? "—",
            candidateMaskedId: cand?.nationalIdMasked ?? "—",
            examQuestionId: x.id,
            questionType: q.type,
            questionTextAr: q.textAr,
            modelAnswer: q.modelAnswer,
            maxPoints: x.points,
            answerText: ans?.answerText ?? "",
            answerImageUrl: ans?.answerImageUrl ?? null,
            aiDetectionScore: ans?.aiDetectionScore ?? null,
            aiDetectionLabel: ans?.aiDetectionLabel ?? null,
            scoreId: score?.id ?? null,
            aiSuggestedScore: score?.aiSuggestedScore ?? null,
            aiFeedback: score?.aiFeedback ?? null,
            finalScore: score?.finalScore ?? null,
            status: score?.status ?? (ans ? "pending_review" : "no_answer"),
            graderId: score?.graderId ?? null,
            comments: score?.comments ?? null,
          });
        }
      }
      return out;
    }),

  /**
   * ملخص التصحيح لاختبار: لماذا قائمة التصحيح فارغة؟ (لا مسلِّمين / لا أسئلة يدوية) + جدول الجلسات المسلَّمة
   * مع عدد الأسئلة المعلّقة لكل طالب وحالة النتيجة — بوابة إلى شاشة التصحيح الكاملة.
   */
  examSummary: staffProcedure
    .input(z.object({ examId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireExamAccess(ctx.user, input.examId);
      const db = getDb();
      const eqs = await db.select().from(examQuestions).where(eq(examQuestions.examId, input.examId));
      const qIds = eqs.map((x) => x.questionId);
      const qs = qIds.length ? await db.select().from(questions).where(inArray(questions.id, qIds)) : [];
      const manualCount = eqs.filter((x) => { const q = qs.find((qq) => qq.id === x.questionId); return q?.type === "essay" || q?.allowImageAnswer === true; }).length;
      const regs = await db.select().from(examRegistrations).where(eq(examRegistrations.examId, input.examId));
      const sessions = regs.length ? await db.select().from(examSessions).where(inArray(examSessions.registrationId, regs.map((r) => r.id))) : [];
      const done = sessions.filter((s) => s.status !== "active");
      const rows = [];
      for (const s of done) {
        const reg = regs.find((r) => r.id === s.registrationId)!;
        const cand = await db.query.candidates.findFirst({ where: eq(candidates.id, reg.candidateId) });
        const ans = await db.select().from(answers).where(eq(answers.sessionId, s.id));
        const scores = ans.length ? await db.select().from(answerScores).where(inArray(answerScores.answerId, ans.map((a) => a.id))) : [];
        const pending = scores.filter((sc) => sc.status === "pending_review" || sc.status === "ai_suggested").length;
        const result = await db.query.results.findFirst({ where: eq(results.sessionId, s.id) });
        rows.push({
          sessionId: s.id, status: s.status, submittedAt: s.submittedAt,
          candidateName: cand?.nameAr ?? "—", candidateMaskedId: cand?.nationalIdMasked ?? "—",
          answered: ans.length, pending,
          totalScore: result?.totalScore ?? null, maxScore: result?.maxScore ?? null, percentage: result?.percentage ?? null,
          passed: result?.passed ?? null, gradingStatus: result?.gradingStatus ?? null,
        });
      }
      rows.sort((a, b) => (b.pending - a.pending) || (b.sessionId - a.sessionId));
      return {
        questions: eqs.length, manualQuestions: manualCount,
        registered: regs.length, started: sessions.length, active: sessions.length - done.length, submitted: done.length,
        pendingAnswers: rows.reduce((a, r) => a + r.pending, 0),
        sessions: rows,
      };
    }),

  /** إعادة توليد اقتراح التصحيح الذكي */
  regenerateSuggestion: staffProcedure
    .input(z.object({ answerId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const ans = await db.query.answers.findFirst({ where: eq(answers.id, input.answerId) });
      if (!ans) throw new TRPCError({ code: "NOT_FOUND" });
      const session = await db.query.examSessions.findFirst({ where: eq(examSessions.id, ans.sessionId) });
      const reg = await db.query.examRegistrations.findFirst({ where: eq(examRegistrations.id, session!.registrationId) });
      await requireExamAccess(ctx.user, reg!.examId);
      const x = await db.query.examQuestions.findFirst({ where: eq(examQuestions.id, ans.examQuestionId) });
      const q = await db.query.questions.findFirst({ where: eq(questions.id, x!.questionId) });
      const sug = suggestEssayScore(ans.answerText ?? "", q!.modelAnswer, x!.points);
      await db.update(answerScores).set({
        aiSuggestedScore: sug.score,
        aiFeedback: sug.feedback,
        status: "ai_suggested",
      }).where(eq(answerScores.answerId, input.answerId));
      await audit(ctx.user.id, ctx.user.nameAr, "regenerate_ai_suggestion", "answer", input.answerId);
      return { score: sug.score, feedback: sug.feedback };
    }),

  /** اعتماد أو تعديل درجة سؤال مفتوح */
  gradeAnswer: staffProcedure
    .input(z.object({
      answerId: z.number(),
      score: z.number().min(0),
      comments: z.string().optional(),
      approveAi: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const ans = await db.query.answers.findFirst({ where: eq(answers.id, input.answerId) });
      if (!ans) throw new TRPCError({ code: "NOT_FOUND" });
      const session = await db.query.examSessions.findFirst({ where: eq(examSessions.id, ans.sessionId) });
      const reg = await db.query.examRegistrations.findFirst({ where: eq(examRegistrations.id, session!.registrationId) });
      await requireExamAccess(ctx.user, reg!.examId);
      const x = await db.query.examQuestions.findFirst({ where: eq(examQuestions.id, ans.examQuestionId) });
      if (input.score > x!.points) throw new TRPCError({ code: "BAD_REQUEST", message: "الدرجة تتجاوز الحد الأقصى للسؤال" });
      const existing = await db.query.answerScores.findFirst({ where: eq(answerScores.answerId, input.answerId) });
      const status = input.approveAi ? "approved" : "modified";
      if (existing) {
        await db.update(answerScores).set({
          finalScore: input.score,
          status,
          graderId: ctx.user.id,
          comments: input.comments ?? null,
          gradedAt: new Date(),
        }).where(eq(answerScores.id, existing.id));
      } else {
        await db.insert(answerScores).values({
          answerId: input.answerId,
          finalScore: input.score,
          status,
          graderId: ctx.user.id,
          comments: input.comments ?? null,
          gradedAt: new Date(),
        });
      }
      await audit(ctx.user.id, ctx.user.nameAr, `grade_answer_${status}`, "answer", input.answerId, `score=${input.score}`);
      // تحديث النتيجة الإجمالية
      await recomputeResult(session!.id);
      return { ok: true };
    }),

  /** إعادة احتساب نتيجة جلسة */
  recompute: staffProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const session = await db.query.examSessions.findFirst({ where: eq(examSessions.id, input.sessionId) });
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      const reg = await db.query.examRegistrations.findFirst({ where: eq(examRegistrations.id, session.registrationId) });
      await requireExamAccess(ctx.user, reg!.examId);
      await recomputeResult(input.sessionId);
      return { ok: true };
    }),

  /** اعتماد نتيجة نهائية */
  approveResult: staffProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const session = await db.query.examSessions.findFirst({ where: eq(examSessions.id, input.sessionId) });
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      const reg = await db.query.examRegistrations.findFirst({ where: eq(examRegistrations.id, session.registrationId) });
      await requireExamAccess(ctx.user, reg!.examId);
      await recomputeResult(input.sessionId);
      await db.update(results).set({
        gradingStatus: "completed",
        approvedBy: ctx.user.id,
        approvedAt: new Date(),
      }).where(eq(results.sessionId, input.sessionId));
      await audit(ctx.user.id, ctx.user.nameAr, "approve_result", "session", input.sessionId);
      return { ok: true };
    }),

  /** تعديل درجة نهائية مع سبب */
  adjustResult: staffProcedure
    .input(z.object({ sessionId: z.number(), newTotal: z.number().min(0), reason: z.string().min(3) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const session = await db.query.examSessions.findFirst({ where: eq(examSessions.id, input.sessionId) });
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      const reg = await db.query.examRegistrations.findFirst({ where: eq(examRegistrations.id, session.registrationId) });
      await requireExamAccess(ctx.user, reg!.examId);
      const exam = await db.query.exams.findFirst({ where: eq(exams.id, reg!.examId) });
      const result = await db.query.results.findFirst({ where: eq(results.sessionId, input.sessionId) });
      if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "لا توجد نتيجة" });
      await db.insert(gradeAdjustments).values({
        resultId: result.id,
        oldScore: result.totalScore,
        newScore: input.newTotal,
        reason: input.reason,
        createdBy: ctx.user.id,
      });
      const percentage = result.maxScore > 0 ? Math.round((input.newTotal / result.maxScore) * 100) : 0;
      await db.update(results).set({
        totalScore: input.newTotal,
        percentage,
        passed: percentage >= (exam?.passScore ?? 60),
      }).where(eq(results.id, result.id));
      await audit(ctx.user.id, ctx.user.nameAr, "adjust_result", "session", input.sessionId, `${result.totalScore}→${input.newTotal}: ${input.reason}`);
      return { ok: true, percentage };
    }),

  /**
   * شاشة التصحيح الكاملة لطالب (ملاحظتا 7 و11): كل سؤال بترتيب عرضه للطالب، إجابته، الإجابة الصحيحة،
   * صحة الإجابة، الدرجة الحالية ومصدرها (آلي/يدوي)، مع إجمالي النتيجة.
   */
  sessionReview: staffProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const session = await db.query.examSessions.findFirst({ where: eq(examSessions.id, input.sessionId) });
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "الجلسة غير موجودة" });
      const reg = (await db.query.examRegistrations.findFirst({ where: eq(examRegistrations.id, session.registrationId) }))!;
      await requireExamAccess(ctx.user, reg.examId);
      const exam = (await db.query.exams.findFirst({ where: eq(exams.id, reg.examId) }))!;
      const cand = await db.query.candidates.findFirst({ where: eq(candidates.id, reg.candidateId) });
      const eqs = await db.select().from(examQuestions).where(eq(examQuestions.examId, reg.examId));
      const qIds = eqs.map((x) => x.questionId);
      const qs = qIds.length ? await db.select().from(questions).where(inArray(questions.id, qIds)) : [];
      const ans = await db.select().from(answers).where(eq(answers.sessionId, session.id));
      const scores = ans.length ? await db.select().from(answerScores).where(inArray(answerScores.answerId, ans.map((a) => a.id))) : [];
      const result = (await db.query.results.findFirst({ where: eq(results.sessionId, session.id) })) ?? null;
      // ترتيب الأسئلة كما عُرضت للطالب
      const order = (session.questionOrder as number[] | null) ?? eqs.map((x) => x.id);
      const optionOrders = (session.optionOrders ?? {}) as Record<string, string[]>;
      const items = [];
      for (const eqId of order) {
        const x = eqs.find((e) => e.id === eqId);
        const q = x ? qs.find((qq) => qq.id === x.questionId) : null;
        if (!x || !q) continue;
        let opts = q.options ?? [];
        const oo = optionOrders[String(x.id)];
        if (oo) opts = oo.map((id) => opts.find((o) => o.id === id)!).filter(Boolean);
        const a = ans.find((aa) => aa.examQuestionId === x.id) ?? null;
        const sc = a ? scores.find((ss) => ss.answerId === a.id) ?? null : null;
        const isManual = q.type === "essay" || (q.allowImageAnswer && !!a?.answerImageUrl);
        const score = sc ? (sc.finalScore ?? sc.autoScore ?? null) : null;
        const hasAnswer = !!a && (
          (Array.isArray(a.answer) ? a.answer.length > 0 : a.answer !== null && a.answer !== undefined && a.answer !== "")
          || !!(a.answerText && a.answerText.trim()) || !!a.answerImageUrl);
        items.push({
          examQuestionId: x.id,
          answerId: a?.id ?? null,
          type: q.type,
          textAr: q.textAr, textEn: q.textEn, imageUrl: q.imageUrl ?? null,
          options: opts.map((o) => ({ id: o.id, textAr: o.textAr, textEn: o.textEn })),
          correctAnswer: q.correctAnswer ?? null,
          modelAnswer: q.modelAnswer ?? null,
          explanation: q.explanation ?? null,
          points: x.points,
          section: x.section,
          isManual,
          hasAnswer,
          answer: a?.answer ?? null,
          answerText: a?.answerText ?? null,
          answerImageUrl: a?.answerImageUrl ?? null,
          aiDetectionScore: a?.aiDetectionScore ?? null,
          score,
          scoreStatus: sc?.status ?? (hasAnswer ? (isManual ? "pending_review" : "auto") : "no_answer"),
          aiSuggestedScore: sc?.aiSuggestedScore ?? null,
          aiFeedback: sc?.aiFeedback ?? null,
          comments: sc?.comments ?? null,
          gradedAt: sc?.gradedAt ?? null,
          // صحة الإجابة: كاملة / جزئية / خاطئة / بانتظار التصحيح
          verdict: score === null ? "pending" : score >= x.points ? "correct" : score > 0 ? "partial" : "wrong",
        });
      }
      return {
        session: { id: session.id, status: session.status, startedAt: session.startedAt, submittedAt: session.submittedAt, riskScore: session.riskScore, reopenCount: session.reopenCount },
        exam: { id: exam.id, code: exam.code, titleAr: exam.titleAr, titleEn: exam.titleEn, passScore: exam.passScore, resultsPublished: exam.resultsPublished },
        candidate: { id: cand?.id ?? 0, nameAr: cand?.nameAr ?? "—", nameEn: cand?.nameEn ?? null, maskedId: cand?.nationalIdMasked ?? "—", fellowship: cand?.fellowship ?? null },
        result,
        items,
        maxScore: eqs.reduce((a, x) => a + x.points, 0),
      };
    }),

  /**
   * تعيين درجة سؤال محدد لطالب يدويًا (ملاحظة 11) — لأي نوع سؤال (مقالي أو موضوعي) —
   * مع أزرار "صحيح/خطأ" في الواجهة (الدرجة الكاملة/صفر). يُنشئ سجل إجابة فارغًا إن لم يُجب الطالب.
   * لا تتجاوز الدرجة درجة السؤال. تُعاد حساب النتيجة الإجمالية فورًا.
   */
  gradeQuestion: staffProcedure
    .input(z.object({
      sessionId: z.number(),
      examQuestionId: z.number(),
      score: z.number().min(0),
      comments: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const session = await db.query.examSessions.findFirst({ where: eq(examSessions.id, input.sessionId) });
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      if (session.status === "active") throw new TRPCError({ code: "BAD_REQUEST", message: "لا يمكن تصحيح جلسة ما زالت نشطة" });
      const reg = await db.query.examRegistrations.findFirst({ where: eq(examRegistrations.id, session.registrationId) });
      await requireExamAccess(ctx.user, reg!.examId);
      const x = await db.query.examQuestions.findFirst({ where: eq(examQuestions.id, input.examQuestionId) });
      if (!x || x.examId !== reg!.examId) throw new TRPCError({ code: "NOT_FOUND", message: "السؤال غير موجود في هذا الاختبار" });
      if (input.score > x.points) throw new TRPCError({ code: "BAD_REQUEST", message: `الدرجة تتجاوز الحد الأقصى للسؤال (${x.points})` });
      let ans = await db.query.answers.findFirst({
        where: and(eq(answers.sessionId, input.sessionId), eq(answers.examQuestionId, input.examQuestionId)),
      });
      if (!ans) {
        const [{ id }] = await db.insert(answers).values({ sessionId: input.sessionId, examQuestionId: input.examQuestionId, answer: null }).$returningId();
        ans = (await db.query.answers.findFirst({ where: eq(answers.id, id) }))!;
      }
      const existing = await db.query.answerScores.findFirst({ where: eq(answerScores.answerId, ans.id) });
      const old = existing ? (existing.finalScore ?? existing.autoScore ?? null) : null;
      if (existing) {
        await db.update(answerScores).set({
          finalScore: input.score, status: "modified", graderId: ctx.user.id,
          comments: input.comments ?? existing.comments, gradedAt: new Date(),
        }).where(eq(answerScores.id, existing.id));
      } else {
        await db.insert(answerScores).values({
          answerId: ans.id, finalScore: input.score, status: "modified", graderId: ctx.user.id,
          comments: input.comments ?? null, gradedAt: new Date(),
        });
      }
      await audit(ctx.user.id, ctx.user.nameAr, "grade_question_manual", "session", input.sessionId, `eq=${input.examQuestionId} ${old ?? "—"}→${input.score}`);
      await recomputeResult(input.sessionId);
      const result = await db.query.results.findFirst({ where: eq(results.sessionId, input.sessionId) });
      return { ok: true, totalScore: result?.totalScore ?? 0, percentage: result?.percentage ?? 0, passed: result?.passed ?? false };
    }),

  /** سجل التعديلات */
  adjustments: staffProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const result = await db.query.results.findFirst({ where: eq(results.sessionId, input.sessionId) });
      if (!result) return [];
      const session = await db.query.examSessions.findFirst({ where: eq(examSessions.id, input.sessionId) });
      const reg = await db.query.examRegistrations.findFirst({ where: eq(examRegistrations.id, session!.registrationId) });
      await requireExamAccess(ctx.user, reg!.examId);
      return db.select().from(gradeAdjustments).where(eq(gradeAdjustments.resultId, result.id));
    }),
});

async function recomputeResult(sessionId: number) {
  const db = getDb();
  const session = await db.query.examSessions.findFirst({ where: eq(examSessions.id, sessionId) });
  if (!session) return;
  const reg = await db.query.examRegistrations.findFirst({ where: eq(examRegistrations.id, session.registrationId) });
  const exam = await db.query.exams.findFirst({ where: eq(exams.id, reg!.examId) });
  const eqs = await db.select().from(examQuestions).where(eq(examQuestions.examId, reg!.examId));
  let total = 0, max = 0, pending = 0;
  for (const x of eqs) {
    max += x.points;
    const ans = await db.query.answers.findFirst({
      where: and(eq(answers.sessionId, sessionId), eq(answers.examQuestionId, x.id)),
    });
    const score = ans ? await db.query.answerScores.findFirst({ where: eq(answerScores.answerId, ans.id) }) : null;
    if (score?.status === "auto" || score?.status === "approved" || score?.status === "modified") {
      total += score.finalScore ?? score.autoScore ?? 0;
    } else if (score?.status === "ai_suggested" || score?.status === "pending_review") {
      pending++;
    }
  }
  const percentage = max > 0 ? Math.round((total / max) * 100) : 0;
  const existing = await db.query.results.findFirst({ where: eq(results.sessionId, sessionId) });
  if (existing) {
    await db.update(results).set({
      totalScore: Math.round(total * 100) / 100,
      maxScore: max,
      percentage,
      passed: percentage >= (exam?.passScore ?? 60),
      gradingStatus: pending > 0 ? "in_review" : existing.gradingStatus === "completed" ? "completed" : "in_review",
    }).where(eq(results.id, existing.id));
  } else {
    // جلسة أُنهيت دون تسليم (لا نتيجة بعد) وقرر المصحح تصحيحها يدويًا → أنشئ سجل النتيجة
    await db.insert(results).values({
      sessionId,
      totalScore: Math.round(total * 100) / 100,
      maxScore: max,
      percentage,
      passed: percentage >= (exam?.passScore ?? 60),
      gradingStatus: pending > 0 ? "in_review" : "in_review",
    });
  }
}
