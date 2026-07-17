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
      const essayEqs = eqs.filter((x) => qs.find((q) => q.id === x.questionId)?.type === "essay");
      const regs = await db.select().from(examRegistrations).where(eq(examRegistrations.examId, input.examId));
      const sessions = regs.length
        ? await db.select().from(examSessions).where(inArray(examSessions.registrationId, regs.map((r) => r.id)))
        : [];
      const doneSessions = sessions.filter((s) => s.status !== "active");
      const out = [];
      for (const s of doneSessions) {
        const reg = regs.find((r) => r.id === s.registrationId)!;
        const cand = await db.query.candidates.findFirst({ where: eq(candidates.id, reg.candidateId) });
        for (const x of essayEqs) {
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
            questionTextAr: q.textAr,
            modelAnswer: q.modelAnswer,
            maxPoints: x.points,
            answerText: ans?.answerText ?? "",
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
  }
}
