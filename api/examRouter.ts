import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter } from "./middleware";
import { staffProcedure, adminProcedure, requireExamAccess, canManageExam, getUserFellowshipIds, audit } from "./authz";
import { getDb } from "./queries/connection";
import {
  exams, examQuestions, examSupervisors, examRegistrations, candidates,
  questions, examSessions, users, results, answers, answerScores,
  sessionEvents, sessionSnapshots, gradeAdjustments, fellowships,
} from "@db/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { sha256, maskNationalId } from "./lib/security";
import { can } from "@contracts/permissions";
import { reopenSession } from "./monitorRouter";

export const examRouter = createRouter({
  /** قائمة الاختبارات — مقيّدة حسب الدور */
  list: staffProcedure.query(async ({ ctx }) => {
    const db = getDb();
    const all = await db.select().from(exams).orderBy(desc(exams.id));
    // المدير الأعلى/المدير/الشؤون الفنية العام: كل الاختبارات
    if (["super_admin", "admin", "tech_general"].includes(ctx.user.role)) return all;
    // مدير الزمالة: اختبارات زمالاته فقط
    if (ctx.user.role === "fellowship_manager") {
      const fids = new Set(await getUserFellowshipIds(ctx.user.id));
      return all.filter((e) => e.fellowshipId && fids.has(e.fellowshipId));
    }
    // خبير: ما أنشأه أو أشرف عليه
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
      durationMin: z.number().min(1).max(600).default(360), // الافتراضي 360 دقيقة (ملاحظة 4)
      passScore: z.number().min(0).max(100).default(60),
      shuffleQuestions: z.boolean().default(true),
      shuffleOptions: z.boolean().default(true),
      lockdown: z.boolean().default(true),
      proctoring: z.boolean().default(true),
      cameraRequired: z.boolean().default(false),
      snapshotIntervalSec: z.number().min(10).max(600).default(60),
      maxFullscreenExits: z.number().min(0).max(20).default(3),
      openAt: z.string().optional(),
      closeAt: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const code = "EX-" + Math.random().toString(36).slice(2, 8).toUpperCase();
      // مدير الزمالة: يُربط الاختبار بزمالته تلقائيًا (ليظهر في قائمته المقيّدة)
      let fellowshipId = input.fellowshipId ?? null;
      if (ctx.user.role === "fellowship_manager") {
        const fids = await getUserFellowshipIds(ctx.user.id);
        fellowshipId = fids[0] ?? fellowshipId;
      }
      const [{ id }] = await getDb().insert(exams).values({
        titleAr: input.titleAr,
        titleEn: input.titleEn || null,
        fellowshipId,
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
        snapshotIntervalSec: input.snapshotIntervalSec,
        maxFullscreenExits: input.maxFullscreenExits,
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
      snapshotIntervalSec: z.number().min(10).max(600).optional(),
      maxFullscreenExits: z.number().min(0).max(20).optional(),
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

  /** حذف عدة أسئلة من الاختبار دفعة واحدة */
  removeQuestions: staffProcedure
    .input(z.object({ examId: z.number(), examQuestionIds: z.array(z.number()).min(1).max(500) }))
    .mutation(async ({ ctx, input }) => {
      await requireExamAccess(ctx.user, input.examId);
      const [res] = await getDb().delete(examQuestions).where(and(eq(examQuestions.examId, input.examId), inArray(examQuestions.id, input.examQuestionIds)));
      const removed = Number((res as { affectedRows?: number }).affectedRows ?? input.examQuestionIds.length);
      await audit(ctx.user.id, ctx.user.nameAr, "remove_exam_questions_bulk", "exam", input.examId, `n=${removed}`);
      return { removed };
    }),

  /** سحب أسئلة من بنك دفعة واحدة: الكل / عدد عشوائي (المتطلب 9) */
  addQuestionsFromBank: staffProcedure
    .input(z.object({
      examId: z.number(),
      bankId: z.number().optional(),
      mode: z.enum(["all", "random"]).default("all"),
      count: z.number().min(1).max(500).optional(),
      section: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireExamAccess(ctx.user, input.examId);
      const db = getDb();
      // الأسئلة المعتمدة في البنك المحدد (أو كل البنوك) غير المضافة أصلًا
      const approved = await db.select().from(questions).where(eq(questions.status, "approved"));
      const pool = approved.filter((q) => (input.bankId ? q.bankId === input.bankId : true));
      const attached = await db.select().from(examQuestions).where(eq(examQuestions.examId, input.examId));
      const attachedSet = new Set(attached.map((a) => a.questionId));
      let pick = pool.filter((q) => !attachedSet.has(q.id));
      if (input.mode === "random") {
        // خلط باستخدام مؤشر ثابت لتجنّب Math.random
        pick = pick
          .map((q, i) => ({ q, k: sha256(`${input.examId}:${q.id}:${i}`) }))
          .sort((a, b) => a.k.localeCompare(b.k))
          .map((x) => x.q);
        if (input.count) pick = pick.slice(0, input.count);
      }
      if (pick.length === 0) return { added: 0 };
      let sort = Date.now() % 100000;
      await db.insert(examQuestions).values(
        pick.map((q) => ({
          examId: input.examId, questionId: q.id, points: q.points,
          section: input.section || null, sortOrder: sort++,
        })),
      );
      await audit(ctx.user.id, ctx.user.nameAr, "add_exam_questions_bulk", "exam", input.examId, `mode=${input.mode} added=${pick.length}`);
      return { added: pick.length };
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

  /** تسجيل جماعي لزملاء محددين في اختبار (من صفحة الزملاء بعد الفلترة) */
  registerCandidates: staffProcedure
    .input(z.object({ examId: z.number(), candidateIds: z.array(z.number()).min(1).max(500) }))
    .mutation(async ({ ctx, input }) => {
      await requireExamAccess(ctx.user, input.examId);
      const db = getDb();
      const existing = await db.select({ candidateId: examRegistrations.candidateId }).from(examRegistrations).where(eq(examRegistrations.examId, input.examId));
      const have = new Set(existing.map((r) => r.candidateId));
      const cands = await db.select({ id: candidates.id }).from(candidates).where(inArray(candidates.id, input.candidateIds));
      const toAdd = cands.map((c) => c.id).filter((id) => !have.has(id));
      if (toAdd.length) await db.insert(examRegistrations).values(toAdd.map((candidateId) => ({ examId: input.examId, candidateId })));
      await audit(ctx.user.id, ctx.user.nameAr, "register_candidates_bulk", "exam", input.examId, `added=${toAdd.length} already=${input.candidateIds.length - toAdd.length}`);
      return { registered: toAdd.length, already: input.candidateIds.length - toAdd.length };
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

  /** بحث سريع عن زميل بالهوية أو الاسm (للتأكيد الفوري عند التسجيل) */
  lookupCandidate: staffProcedure
    .input(z.object({ query: z.string().min(1) }))
    .query(async ({ input }) => {
      const db = getDb();
      const q = input.query.trim();
      const all = await db.select().from(candidates);
      const matches = all
        .filter((c) => c.nationalId.includes(q) || c.nameAr.includes(q) || (c.nameEn ?? "").toLowerCase().includes(q.toLowerCase()))
        .slice(0, 8)
        .map((c) => ({
          id: c.id, nationalId: c.nationalId, nameAr: c.nameAr, nameEn: c.nameEn,
          fellowship: c.fellowship, cohort: c.cohort,
        }));
      const exact = all.find((c) => c.nationalId === q);
      return {
        exact: exact ? { id: exact.id, nationalId: exact.nationalId, nameAr: exact.nameAr, fellowship: exact.fellowship, cohort: exact.cohort } : null,
        matches,
      };
    }),

  /** تسجيل زميل في الاختبار — يُنشئه تلقائيًا إن لم يكن مسجّلًا (تجربة موحّدة) */
  registerOrCreateCandidate: staffProcedure
    .input(z.object({
      examId: z.number(),
      nationalId: z.string().min(5),
      nameAr: z.string().optional(),
      nameEn: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      fellowship: z.string().optional(),
      track: z.string().optional(),
      cohort: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireExamAccess(ctx.user, input.examId);
      const db = getDb();
      let cand = await db.query.candidates.findFirst({ where: eq(candidates.nationalId, input.nationalId) });
      let createdNew = false;
      if (!cand) {
        // إنشاء زميل جديد فورًا — الاسم اختياري (يُكمل لاحقًا)
        const [{ id }] = await db.insert(candidates).values({
          nationalId: input.nationalId,
          nationalIdMasked: maskNationalId(input.nationalId),
          nameAr: input.nameAr?.trim() || `زميل ${input.nationalId}`,
          nameEn: input.nameEn || null,
          email: input.email || null,
          phone: input.phone || null,
          fellowship: input.fellowship || null,
          track: input.track || null,
          cohort: input.cohort || null,
        }).$returningId();
        cand = (await db.query.candidates.findFirst({ where: eq(candidates.id, id) }))!;
        createdNew = true;
        await audit(ctx.user.id, ctx.user.nameAr, "create_candidate_inline", "candidate", id, input.nationalId);
      }
      const existing = await db.query.examRegistrations.findFirst({
        where: and(eq(examRegistrations.examId, input.examId), eq(examRegistrations.candidateId, cand.id)),
      });
      if (existing) return { registrationId: existing.id, name: cand.nameAr, createdNew, alreadyRegistered: true };
      const [{ id }] = await db.insert(examRegistrations).values({ examId: input.examId, candidateId: cand.id }).$returningId();
      await audit(ctx.user.id, ctx.user.nameAr, "register_candidate", "exam", input.examId, `candidate=${cand.id}`);
      return { registrationId: id, name: cand.nameAr, createdNew, alreadyRegistered: false };
    }),

  removeRegistration: staffProcedure
    .input(z.object({ registrationId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const reg = await db.query.examRegistrations.findFirst({ where: eq(examRegistrations.id, input.registrationId) });
      if (!reg) throw new TRPCError({ code: "NOT_FOUND", message: "التسجيل غير موجود" });
      await requireExamAccess(ctx.user, reg.examId);
      // تنظيف الجلسات التابعة لتجنّب سجلات يتيمة
      const sess = await db.select().from(examSessions).where(eq(examSessions.registrationId, input.registrationId));
      const sIds = sess.map((s) => s.id);
      if (sIds.length) {
        await db.delete(sessionSnapshots).where(inArray(sessionSnapshots.sessionId, sIds));
        await db.delete(sessionEvents).where(inArray(sessionEvents.sessionId, sIds));
        const ans = await db.select().from(answers).where(inArray(answers.sessionId, sIds));
        if (ans.length) await db.delete(answerScores).where(inArray(answerScores.answerId, ans.map((a) => a.id)));
        await db.delete(answers).where(inArray(answers.sessionId, sIds));
        const res = await db.select().from(results).where(inArray(results.sessionId, sIds));
        if (res.length) await db.delete(gradeAdjustments).where(inArray(gradeAdjustments.resultId, res.map((r) => r.id)));
        await db.delete(results).where(inArray(results.sessionId, sIds));
        await db.delete(examSessions).where(inArray(examSessions.id, sIds));
      }
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

  /** إعادة فتح الاختبار لطالب مقفَل من صفحة الاختبار (ملاحظة 6) — يبحث عن آخر جلسة منتهية بالإنهاء */
  reopenRegistration: staffProcedure
    .input(z.object({ registrationId: z.number(), extraMinutes: z.number().min(0).max(300).default(0) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const reg = await db.query.examRegistrations.findFirst({ where: eq(examRegistrations.id, input.registrationId) });
      if (!reg) throw new TRPCError({ code: "NOT_FOUND" });
      await requireExamAccess(ctx.user, reg.examId);
      const sess = await db.select().from(examSessions).where(eq(examSessions.registrationId, reg.id)).orderBy(desc(examSessions.id));
      const locked = sess.find((s) => s.status === "terminated");
      if (!locked) throw new TRPCError({ code: "BAD_REQUEST", message: "لا توجد جلسة مقفَلة لهذا الطالب" });
      return reopenSession(ctx.user, locked.id, input.extraMinutes);
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
      // نشر النتائج صلاحية مدير فقط (results.publish) — لا يملكها الخبير
      if (!can(ctx.user.role, "results.publish")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "نشر النتائج يتطلب صلاحية مدير الاختبارات" });
      }
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

  /**
   * بيانات تصدير الدرجات إلى Excel (ملاحظة 2): صف لكل زميل مسجّل —
   * الهوية الكاملة، الاسم، الزمالة، درجة الموضوعي، درجة المقالي، المجموع، النسبة، ناجح/غير ناجح.
   * (الهوية كاملة لأن الملف يُسلَّم رسميًا للجامعة)
   */
  exportResults: staffProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      if (!can(ctx.user.role, "results.view")) throw new TRPCError({ code: "FORBIDDEN" });
      await requireExamAccess(ctx.user, input.id);
      const db = getDb();
      const exam = await db.query.exams.findFirst({ where: eq(exams.id, input.id) });
      if (!exam) throw new TRPCError({ code: "NOT_FOUND" });
      const fellowship = exam.fellowshipId
        ? await db.query.fellowships.findFirst({ where: eq(fellowships.id, exam.fellowshipId) }) : null;
      const eqs = await db.select().from(examQuestions).where(eq(examQuestions.examId, input.id));
      const qIds = eqs.map((x) => x.questionId);
      const qs = qIds.length ? await db.select().from(questions).where(inArray(questions.id, qIds)) : [];
      // السؤال "مقالي" إن كان نوعه essay أو يسمح بإجابة صورة (تصحيح يدوي)
      const isEssayEq = (x: typeof eqs[number]) => {
        const q = qs.find((qq) => qq.id === x.questionId);
        return q?.type === "essay" || q?.allowImageAnswer === true;
      };
      const objectiveMax = eqs.filter((x) => !isEssayEq(x)).reduce((a, x) => a + x.points, 0);
      const essayMax = eqs.filter(isEssayEq).reduce((a, x) => a + x.points, 0);
      const regs = await db.select().from(examRegistrations).where(eq(examRegistrations.examId, input.id));
      const rows = [];
      for (const reg of regs) {
        const cand = await db.query.candidates.findFirst({ where: eq(candidates.id, reg.candidateId) });
        const sessions = await db.select().from(examSessions).where(eq(examSessions.registrationId, reg.id));
        const done = sessions.find((s) => s.status !== "active");
        let objective = 0, essay = 0;
        let result = null;
        if (done) {
          result = (await db.query.results.findFirst({ where: eq(results.sessionId, done.id) })) ?? null;
          const ans = await db.select().from(answers).where(eq(answers.sessionId, done.id));
          const scores = ans.length ? await db.select().from(answerScores).where(inArray(answerScores.answerId, ans.map((a) => a.id))) : [];
          for (const x of eqs) {
            const a = ans.find((aa) => aa.examQuestionId === x.id);
            const sc = a ? scores.find((ss) => ss.answerId === a.id) : null;
            const val = sc ? (sc.finalScore ?? sc.autoScore ?? 0) : 0;
            if (isEssayEq(x)) essay += val; else objective += val;
          }
        }
        rows.push({
          nationalId: cand?.nationalId ?? "",
          nameAr: cand?.nameAr ?? "",
          nameEn: cand?.nameEn ?? "",
          fellowship: cand?.fellowship || fellowship?.nameAr || "",
          track: cand?.track ?? "",
          cohort: cand?.cohort ?? "",
          attempted: !!done,
          objectiveScore: Math.round(objective * 100) / 100,
          essayScore: Math.round(essay * 100) / 100,
          // المجموع من جدول النتائج (يشمل التعديلات اليدوية بسبب)؛ وإلا مجموع الأسئلة
          totalScore: result ? result.totalScore : Math.round((objective + essay) * 100) / 100,
          maxScore: result?.maxScore ?? objectiveMax + essayMax,
          percentage: result?.percentage ?? 0,
          passed: result ? result.passed : null,
          gradingStatus: result?.gradingStatus ?? null,
          sessionStatus: done?.status ?? null,
        });
      }
      await audit(ctx.user.id, ctx.user.nameAr, "export_results_excel", "exam", input.id, `rows=${rows.length}`);
      return {
        exam: { code: exam.code, titleAr: exam.titleAr, titleEn: exam.titleEn, passScore: exam.passScore, fellowship: fellowship?.nameAr ?? "" },
        objectiveMax, essayMax,
        rows,
      };
    }),
});
