import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter } from "./middleware";
import { staffProcedure, adminProcedure, requireExamAccess, canManageExam, audit } from "./authz";
import { getDb } from "./queries/connection";
import {
  exams, examQuestions, examSupervisors, examRegistrations, candidates,
  questions, examSessions, users, results,
} from "@db/schema";
import { eq, and, desc, inArray } from "drizzle-orm";

export const examRouter = createRouter({
  /** قائمة الاختبارات: المدير يرى الكل، الخبير يرى ما أنشأه أو أشرف عليه */
  list: staffProcedure.query(async ({ ctx }) => {
    const db = getDb();
    const all = await db.select().from(exams).orderBy(desc(exams.id));
    if (ctx.user.role !== "expert") return all;
    const supervised = await db.select().from(examSupervisors).where(eq(examSupervisors.expertId, ctx.user.id));
    const supIds = new Set(supervised.map((s) => s.examId));
    return all.filter((e) => e.createdBy === ctx.user.id || supIds.has(e.id));
  }),

  get: staffProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireExamAccess(ctx.user, input.id);
      const db = getDb();
      const exam = await db.query.exams.findFirst({ where: eq(exams.id, input.id) });
      if (!exam) throw new TRPCError({ code: "NOT_FOUND" });
      const eqs = await db.select().from(examQuestions).where(eq(examQuestions.examId, input.id));
      const qIds = eqs.map((x) => x.questionId);
      const qs = qIds.length ? await db.select().from(questions).where(inArray(questions.id, qIds)) : [];
      const sups = await db.select().from(examSupervisors).where(eq(examSupervisors.examId, input.id));
      const supUsers = sups.length
        ? await db.select({ id: users.id, nameAr: users.nameAr, nameEn: users.nameEn }).from(users)
            .where(inArray(users.id, sups.map((s) => s.expertId)))
        : [];
      const regs = await db.select().from(examRegistrations).where(eq(examRegistrations.examId, input.id));
      const candIds = regs.map((r) => r.candidateId);
      const cands = candIds.length
        ? await db.select().from(candidates).where(inArray(candidates.id, candIds)) : [];
      return {
        exam,
        questions: eqs.map((x) => ({ ...x, question: qs.find((q) => q.id === x.questionId) })),
        supervisors: supUsers,
        registrations: regs.map((r) => ({ ...r, candidate: cands.find((c) => c.id === r.candidateId) })),
      };
    }),

  create: staffProcedure
    .input(z.object({
      titleAr: z.string().min(3),
      titleEn: z.string().optional(),
      fellowshipId: z.number().optional(),
      description: z.string().optional(),
      instructionsAr: z.string().optional(),
      instructionsEn: z.string().optional(),
      durationMin: z.number().min(5).max(600).default(60),
      passScore: z.number().min(0).max(100).default(60),
      shuffleQuestions: z.boolean().default(true),
      shuffleOptions: z.boolean().default(true),
      lockdown: z.boolean().default(true),
      proctoring: z.boolean().default(true),
      cameraRequired: z.boolean().default(false),
      openAt: z.string().optional(),
      closeAt: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const code = "EX-" + Math.random().toString(36).slice(2, 8).toUpperCase();
      const [{ id }] = await getDb().insert(exams).values({
        titleAr: input.titleAr,
        titleEn: input.titleEn || null,
        fellowshipId: input.fellowshipId ?? null,
        description: input.description || null,
        instructionsAr: input.instructionsAr || null,
        instructionsEn: input.instructionsEn || null,
        durationMin: input.durationMin,
        passScore: input.passScore,
        shuffleQuestions: input.shuffleQuestions,
        shuffleOptions: input.shuffleOptions,
        lockdown: input.lockdown,
        proctoring: input.proctoring,
        cameraRequired: input.cameraRequired,
        code,
        createdBy: ctx.user.id,
        openAt: input.openAt ? new Date(input.openAt) : null,
        closeAt: input.closeAt ? new Date(input.closeAt) : null,
      }).$returningId();
      await audit(ctx.user.id, ctx.user.nameAr, "create_exam", "exam", id, input.titleAr);
      return { id, code };
    }),

  update: staffProcedure
    .input(z.object({
      id: z.number(),
      titleAr: z.string().optional(),
      titleEn: z.string().optional(),
      description: z.string().optional(),
      instructionsAr: z.string().optional(),
      instructionsEn: z.string().optional(),
      durationMin: z.number().optional(),
      passScore: z.number().optional(),
      shuffleQuestions: z.boolean().optional(),
      shuffleOptions: z.boolean().optional(),
      lockdown: z.boolean().optional(),
      proctoring: z.boolean().optional(),
      cameraRequired: z.boolean().optional(),
      openAt: z.string().nullable().optional(),
      closeAt: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireExamAccess(ctx.user, input.id);
      const { id, openAt, closeAt, ...rest } = input;
      await getDb().update(exams).set({
        ...rest,
        ...(openAt !== undefined ? { openAt: openAt ? new Date(openAt) : null } : {}),
        ...(closeAt !== undefined ? { closeAt: closeAt ? new Date(closeAt) : null } : {}),
      }).where(eq(exams.id, id));
      await audit(ctx.user.id, ctx.user.nameAr, "update_exam", "exam", id);
      return { ok: true };
    }),

  setStatus: staffProcedure
    .input(z.object({ id: z.number(), status: z.enum(["draft", "open", "closed", "archived"]) }))
    .mutation(async ({ ctx, input }) => {
      await requireExamAccess(ctx.user, input.id);
      await getDb().update(exams).set({ status: input.status }).where(eq(exams.id, input.id));
      await audit(ctx.user.id, ctx.user.nameAr, `exam_status_${input.status}`, "exam", input.id);
      return { ok: true };
    }),

  /** إضافة سؤال معتمد للاختبار */
  addQuestion: staffProcedure
    .input(z.object({ examId: z.number(), questionId: z.number(), points: z.number().min(1).optional(), section: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      await requireExamAccess(ctx.user, input.examId);
      const db = getDb();
      const q = await db.query.questions.findFirst({ where: eq(questions.id, input.questionId) });
      if (!q) throw new TRPCError({ code: "NOT_FOUND", message: "السؤال غير موجود" });
      if (q.status !== "approved") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "لا يمكن إضافة سؤال غير معتمد للاختبار" });
      }
      const existing = await db.query.examQuestions.findFirst({
        where: and(eq(examQuestions.examId, input.examId), eq(examQuestions.questionId, input.questionId)),
      });
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "السؤال مضاف مسبقًا" });
      const [{ id }] = await db.insert(examQuestions).values({
        examId: input.examId, questionId: input.questionId,
        points: input.points ?? q.points, section: input.section || null,
        sortOrder: Date.now() % 100000,
      }).$returningId();
      await audit(ctx.user.id, ctx.user.nameAr, "add_exam_question", "exam", input.examId, `q=${input.questionId}`);
      return { id };
    }),

  removeQuestion: staffProcedure
    .input(z.object({ examId: z.number(), examQuestionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireExamAccess(ctx.user, input.examId);
      await getDb().delete(examQuestions).where(eq(examQuestions.id, input.examQuestionId));
      return { ok: true };
    }),

  /** تعيين خبير مشرف على اختبار (مدير فقط) */
  assignSupervisor: adminProcedure
    .input(z.object({ examId: z.number(), expertId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const expert = await db.query.users.findFirst({ where: eq(users.id, input.expertId) });
      if (!expert || expert.role !== "expert") throw new TRPCError({ code: "BAD_REQUEST", message: "المستخدم ليس خبيرًا" });
      const existing = await db.query.examSupervisors.findFirst({
        where: and(eq(examSupervisors.examId, input.examId), eq(examSupervisors.expertId, input.expertId)),
      });
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "الخبير معيّن مسبقًا" });
      await db.insert(examSupervisors).values({ examId: input.examId, expertId: input.expertId, assignedBy: ctx.user.id });
      await audit(ctx.user.id, ctx.user.nameAr, "assign_supervisor", "exam", input.examId, `expert=${input.expertId}`);
      return { ok: true };
    }),

  removeSupervisor: adminProcedure
    .input(z.object({ examId: z.number(), expertId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db.delete(examSupervisors).where(
        and(eq(examSupervisors.examId, input.examId), eq(examSupervisors.expertId, input.expertId)),
      );
      await audit(ctx.user.id, ctx.user.nameAr, "remove_supervisor", "exam", input.examId, `expert=${input.expertId}`);
      return { ok: true };
    }),

  /** تسجيل زميل في اختبار */
  registerCandidate: staffProcedure
    .input(z.object({ examId: z.number(), candidateId: z.number(), extraTimeMin: z.number().default(0) }))
    .mutation(async ({ ctx, input }) => {
      await requireExamAccess(ctx.user, input.examId);
      const db = getDb();
      const existing = await db.query.examRegistrations.findFirst({
        where: and(eq(examRegistrations.examId, input.examId), eq(examRegistrations.candidateId, input.candidateId)),
      });
      if (existing) return { id: existing.id };
      const [{ id }] = await db.insert(examRegistrations).values({
        examId: input.examId, candidateId: input.candidateId, extraTimeMin: input.extraTimeMin,
      }).$returningId();
      return { id };
    }),

  registerByNationalId: staffProcedure
    .input(z.object({ examId: z.number(), nationalId: z.string().min(5) }))
    .mutation(async ({ ctx, input }) => {
      await requireExamAccess(ctx.user, input.examId);
      const db = getDb();
      const cand = await db.query.candidates.findFirst({ where: eq(candidates.nationalId, input.nationalId) });
      if (!cand) throw new TRPCError({ code: "NOT_FOUND", message: "رقم الهوية غير مسجل كزميل" });
      const existing = await db.query.examRegistrations.findFirst({
        where: and(eq(examRegistrations.examId, input.examId), eq(examRegistrations.candidateId, cand.id)),
      });
      if (existing) return { id: existing.id, name: cand.nameAr };
      const [{ id }] = await db.insert(examRegistrations).values({ examId: input.examId, candidateId: cand.id }).$returningId();
      return { id, name: cand.nameAr };
    }),

  removeRegistration: staffProcedure
    .input(z.object({ registrationId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const reg = await db.query.examRegistrations.findFirst({ where: eq(examRegistrations.id, input.registrationId) });
      if (reg) await requireExamAccess(ctx.user, reg.examId);
      await db.delete(examRegistrations).where(eq(examRegistrations.id, input.registrationId));
      return { ok: true };
    }),

  /** تمديد وقت زميل (تسجيل) — للمدير أو الخبير المشرف */
  extendRegistration: staffProcedure
    .input(z.object({ registrationId: z.number(), extraTimeMin: z.number().min(1).max(300) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const reg = await db.query.examRegistrations.findFirst({ where: eq(examRegistrations.id, input.registrationId) });
      if (!reg) throw new TRPCError({ code: "NOT_FOUND" });
      await requireExamAccess(ctx.user, reg.examId);
      await db.update(examRegistrations)
        .set({ extraTimeMin: reg.extraTimeMin + input.extraTimeMin })
        .where(eq(examRegistrations.id, reg.id));
      await audit(ctx.user.id, ctx.user.nameAr, "extend_registration_time", "exam", reg.examId, `+${input.extraTimeMin}min`);
      return { ok: true, newExtra: reg.extraTimeMin + input.extraTimeMin };
    }),

  listExperts: staffProcedure.query(async () => {
    const rows = await getDb().select({ id: users.id, nameAr: users.nameAr, nameEn: users.nameEn, username: users.username })
      .from(users).where(eq(users.role, "expert"));
    return rows;
  }),

  /** نشر النتائج للزملاء */
  publishResults: staffProcedure
    .input(z.object({ id: z.number(), published: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await requireExamAccess(ctx.user, input.id);
      await getDb().update(exams).set({ resultsPublished: input.published }).where(eq(exams.id, input.id));
      await audit(ctx.user.id, ctx.user.nameAr, input.published ? "publish_results" : "hide_results", "exam", input.id);
      return { ok: true };
    }),

  /** نتائج الاختبار مع الجلسات */
  examResults: staffProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireExamAccess(ctx.user, input.id);
      const db = getDb();
      const regs = await db.select().from(examRegistrations).where(eq(examRegistrations.examId, input.id));
      const out = [];
      for (const reg of regs) {
        const cand = await db.query.candidates.findFirst({ where: eq(candidates.id, reg.candidateId) });
        const sessions = await db.select().from(examSessions).where(eq(examSessions.registrationId, reg.id));
        let result = null;
        const done = sessions.find((s) => s.status !== "active");
        if (done) {
          result = (await db.query.results.findFirst({ where: eq(results.sessionId, done.id) })) ?? null;
        }
        out.push({ registration: reg, candidate: cand, sessions, result });
      }
      return out;
    }),

  canManage: staffProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => ({ can: await canManageExam(ctx.user, input.id) })),
});
