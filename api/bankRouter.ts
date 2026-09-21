import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter } from "./middleware";
import { staffProcedure, adminProcedure, getUserFellowshipIds, audit } from "./authz";
import { getDb } from "./queries/connection";
import { questionBanks, questions, users } from "@db/schema";
import { eq, desc, sql, inArray } from "drizzle-orm";
import { generateQuestions, generateSimilarQuestions } from "./lib/aiEngine";

const optionSchema = z.object({ id: z.string(), textAr: z.string(), textEn: z.string() });

const questionInput = z.object({
  bankId: z.number(),
  type: z.enum(["single", "multiple", "truefalse", "short", "essay", "numeric"]),
  textAr: z.string().min(3),
  textEn: z.string().optional(),
  imageUrl: z.string().max(8_000_000).nullable().optional(),
  allowImageAnswer: z.boolean().optional(),
  options: z.array(optionSchema).optional(),
  correctAnswer: z.union([z.array(z.string()), z.string(), z.number()]).optional(),
  modelAnswer: z.string().optional(),
  explanation: z.string().optional(),
  points: z.number().min(1).default(1),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  competency: z.string().optional(),
});

export const bankRouter = createRouter({
  listBanks: staffProcedure.query(async ({ ctx }) => {
    const db = getDb();
    let banks = await db.select().from(questionBanks).orderBy(questionBanks.id);
    // مدير الزمالة: بنوك زمالاته فقط
    if (ctx.user.role === "fellowship_manager") {
      const fids = new Set(await getUserFellowshipIds(ctx.user.id));
      banks = banks.filter((b) => b.fellowshipId && fids.has(b.fellowshipId));
    }
    const counts = await db.select({ bankId: questions.bankId, n: sql<number>`count(*)` }).from(questions).groupBy(questions.bankId);
    return banks.map((b) => ({ ...b, questionCount: Number(counts.find((c) => c.bankId === b.id)?.n ?? 0) }));
  }),

  createBank: staffProcedure
    .input(z.object({ nameAr: z.string().min(2), nameEn: z.string().optional(), fellowshipId: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      const [{ id }] = await getDb().insert(questionBanks).values({
        nameAr: input.nameAr, nameEn: input.nameEn?.trim() || null, fellowshipId: input.fellowshipId ?? null, // الإنجليزي اختياري (ملاحظة 9)
      }).$returningId();
      await audit(ctx.user.id, ctx.user.nameAr, "create_bank", "question_bank", id, input.nameAr);
      return { id };
    }),

  updateBank: staffProcedure
    .input(z.object({ id: z.number(), nameAr: z.string().min(2).optional(), nameEn: z.string().optional(), fellowshipId: z.number().nullable().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const bank = await db.query.questionBanks.findFirst({ where: eq(questionBanks.id, input.id) });
      if (!bank) throw new TRPCError({ code: "NOT_FOUND", message: "البنك غير موجود" });
      await db.update(questionBanks).set({
        ...(input.nameAr ? { nameAr: input.nameAr } : {}),
        ...(input.nameEn !== undefined ? { nameEn: input.nameEn.trim() || null } : {}),
        ...(input.fellowshipId !== undefined ? { fellowshipId: input.fellowshipId } : {}),
      }).where(eq(questionBanks.id, input.id));
      await audit(ctx.user.id, ctx.user.nameAr, "update_bank", "question_bank", input.id);
      return { ok: true };
    }),

  deleteBank: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const inBank = await db.select({ id: questions.id }).from(questions).where(eq(questions.bankId, input.id));
      if (inBank.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `لا يمكن حذف بنك يحتوي ${inBank.length} سؤالًا — احذف أسئلته أو انقلها أولًا` });
      }
      await db.delete(questionBanks).where(eq(questionBanks.id, input.id));
      await audit(ctx.user.id, ctx.user.nameAr, "delete_bank", "question_bank", input.id);
      return { ok: true };
    }),

  listQuestions: staffProcedure
    .input(z.object({ bankId: z.number().optional(), status: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db.select().from(questions).orderBy(desc(questions.id));
      // مدير الزمالة: أسئلة بنوك زمالته فقط
      let allowedBankIds: Set<number> | null = null;
      if (ctx.user.role === "fellowship_manager") {
        const fids = new Set(await getUserFellowshipIds(ctx.user.id));
        const myBanks = await db.select().from(questionBanks);
        allowedBankIds = new Set(myBanks.filter((b) => b.fellowshipId && fids.has(b.fellowshipId)).map((b) => b.id));
      }
      const filtered = rows.filter((q) =>
        (allowedBankIds ? allowedBankIds.has(q.bankId) : true) &&
        (input.bankId ? q.bankId === input.bankId : true) &&
        (input.status ? q.status === input.status : true),
      );
      // إرفاق أسماء المنشئ والمراجع (لتوثيق من أنشأ ومن اعتمد)
      const userIds = [...new Set([...filtered.map((q) => q.createdBy), ...filtered.map((q) => q.reviewedBy).filter(Boolean) as number[]])];
      const us = userIds.length ? await db.select().from(users).where(inArray(users.id, userIds)) : [];
      const nameOf = (id: number | null) => (id ? us.find((u) => u.id === id)?.nameAr ?? null : null);
      return filtered.map((q) => ({ ...q, createdByName: nameOf(q.createdBy), reviewedByName: nameOf(q.reviewedBy) }));
    }),

  createQuestion: staffProcedure
    .input(questionInput)
    .mutation(async ({ ctx, input }) => {
      const [{ id }] = await getDb().insert(questions).values({
        ...input, textEn: input.textEn || null, createdBy: ctx.user.id, status: "draft",
      }).$returningId();
      await audit(ctx.user.id, ctx.user.nameAr, "create_question", "question", id);
      return { id };
    }),

  updateQuestion: staffProcedure
    .input(questionInput.partial().extend({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const q = await db.query.questions.findFirst({ where: eq(questions.id, input.id) });
      if (!q) throw new TRPCError({ code: "NOT_FOUND" });
      if (q.createdBy !== ctx.user.id && ctx.user.role === "expert") {
        throw new TRPCError({ code: "FORBIDDEN", message: "يمكن للخبير تعديل أسئلته فقط قبل اعتمادها" });
      }
      const { id, ...data } = input;
      // Editing an approved question creates a new version
      await db.update(questions).set({
        ...data,
        version: q.status === "approved" ? q.version + 1 : q.version,
        status: q.status === "approved" ? "draft" : q.status,
      }).where(eq(questions.id, id));
      await audit(ctx.user.id, ctx.user.nameAr, "update_question", "question", id);
      return { ok: true };
    }),

  submitForReview: staffProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await getDb().update(questions).set({ status: "pending_review" }).where(eq(questions.id, input.id));
      await audit(ctx.user.id, ctx.user.nameAr, "submit_question_review", "question", input.id);
      return { ok: true };
    }),

  reviewQuestion: staffProcedure
    .input(z.object({ id: z.number(), decision: z.enum(["approved", "rejected"]), notes: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const q = await db.query.questions.findFirst({ where: eq(questions.id, input.id) });
      if (!q) throw new TRPCError({ code: "NOT_FOUND" });
      if (q.createdBy === ctx.user.id && ctx.user.role === "expert") {
        throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكن للخبير اعتماد سؤال أنشأه بنفسه" });
      }
      await db.update(questions).set({
        status: input.decision, reviewedBy: ctx.user.id, reviewNotes: input.notes || null,
      }).where(eq(questions.id, input.id));
      await audit(ctx.user.id, ctx.user.nameAr, `review_question_${input.decision}`, "question", input.id, input.notes);
      return { ok: true };
    }),

  /** إرسال جماعي للمراجعة: يحوّل المسودات المحددة إلى "قيد المراجعة" */
  submitQuestionsForReview: staffProcedure
    .input(z.object({ ids: z.array(z.number()).min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      let sent = 0, skipped = 0;
      for (const id of input.ids) {
        const q = await db.query.questions.findFirst({ where: eq(questions.id, id) });
        if (!q || q.status !== "draft") { skipped++; continue; }
        await db.update(questions).set({ status: "pending_review" }).where(eq(questions.id, id));
        sent++;
      }
      await audit(ctx.user.id, ctx.user.nameAr, "bulk_submit_review", "question", undefined, `sent=${sent} skipped=${skipped}`);
      return { sent, skipped };
    }),

  /** مراجعة جماعية: اعتماد/رفض عدة أسئلة دفعة واحدة + ملاحظة للمنشئ */
  reviewQuestions: staffProcedure
    .input(z.object({
      ids: z.array(z.number()).min(1).max(200),
      decision: z.enum(["approved", "rejected"]),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      let reviewed = 0;
      let skipped = 0;
      for (const id of input.ids) {
        const q = await db.query.questions.findFirst({ where: eq(questions.id, id) });
        if (!q) { skipped++; continue; }
        // مراجعة الأقران: الخبير لا يعتمد سؤاله
        if (q.createdBy === ctx.user.id && ctx.user.role === "expert") { skipped++; continue; }
        await db.update(questions).set({
          status: input.decision, reviewedBy: ctx.user.id, reviewNotes: input.notes || null,
        }).where(eq(questions.id, id));
        reviewed++;
      }
      await audit(ctx.user.id, ctx.user.nameAr, `bulk_review_${input.decision}`, "question", undefined, `reviewed=${reviewed} skipped=${skipped}`);
      return { reviewed, skipped };
    }),

  /** حذف جماعي: يحذف الأسئلة المحددة (الخبير يحذف أسئلته فقط) */
  deleteQuestions: staffProcedure
    .input(z.object({ ids: z.array(z.number()).min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      let deleted = 0, skipped = 0;
      for (const id of input.ids) {
        const q = await db.query.questions.findFirst({ where: eq(questions.id, id) });
        if (!q) { skipped++; continue; }
        if (q.createdBy !== ctx.user.id && ctx.user.role === "expert") { skipped++; continue; }
        await db.delete(questions).where(eq(questions.id, id));
        deleted++;
      }
      await audit(ctx.user.id, ctx.user.nameAr, "bulk_delete_questions", "question", undefined, `deleted=${deleted} skipped=${skipped}`);
      return { deleted, skipped };
    }),

  /** رفع أسئلة دفعة واحدة (JSON أو CSV) */
  uploadQuestions: staffProcedure
    .input(z.object({
      bankId: z.number(),
      format: z.enum(["json", "csv"]),
      content: z.string().min(2),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const parsed: z.infer<typeof questionInput>[] = [];
      const errors: string[] = [];
      if (input.format === "json") {
        try {
          const arr = JSON.parse(input.content);
          const list = Array.isArray(arr) ? arr : [arr];
          for (const [i, item] of list.entries()) {
            const r = questionInput.safeParse({ ...item, bankId: input.bankId });
            if (r.success) parsed.push(r.data);
            else errors.push(`سؤال ${i + 1}: بيانات غير مكتملة`);
          }
        } catch {
          throw new TRPCError({ code: "BAD_REQUEST", message: "صيغة JSON غير صالحة" });
        }
      } else {
        // CSV: type,textAr,textEn,optionA,optionB,optionC,optionD,correct,points,difficulty,competency
        const lines = input.content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        for (const [i, line] of lines.entries()) {
          const p = line.split(/[,\t;]/).map((x) => x.trim());
          if (p.length < 3 || ["type", "النوع"].includes(p[0])) continue; // header
          const type = (["single", "multiple", "truefalse", "short", "essay", "numeric"] as const).includes(p[0] as never)
            ? (p[0] as "single") : "single";
          const opts = [p[3], p[4], p[5], p[6]].filter(Boolean).map((t, k) => ({
            id: ["A", "B", "C", "D"][k], textAr: t, textEn: t,
          }));
          const correctRaw = p[7] || "";
          const correctAnswer = correctRaw.includes("|") ? correctRaw.split("|") : correctRaw;
          const r = questionInput.safeParse({
            bankId: input.bankId, type, textAr: p[1], textEn: p[2] || undefined,
            options: opts.length ? opts : undefined,
            correctAnswer: correctAnswer || undefined,
            points: p[8] ? parseInt(p[8]) : 1,
            difficulty: ["easy", "medium", "hard"].includes(p[9]) ? p[9] : "medium",
            competency: p[10] || undefined,
          });
          if (r.success) parsed.push(r.data);
          else errors.push(`سطر ${i + 1}: بيانات غير مكتملة`);
        }
      }
      if (parsed.length) {
        await db.insert(questions).values(
          parsed.map((q) => ({ ...q, textEn: q.textEn || null, createdBy: ctx.user.id, status: "draft" as const })),
        );
      }
      await audit(ctx.user.id, ctx.user.nameAr, "upload_questions", "question_bank", input.bankId, `imported=${parsed.length}`);
      return { imported: parsed.length, errors };
    }),

  /** توليد أسئلة بالذكاء الاصطناعي */
  aiGenerate: staffProcedure
    .input(z.object({
      bankId: z.number(),
      topic: z.string().min(2),
      competency: z.string().optional(),
      count: z.number().min(1).max(20).default(5),
      types: z.array(z.enum(["single", "multiple", "truefalse", "short", "essay", "numeric"])).min(1),
      difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
    }))
    .mutation(async ({ ctx, input }) => {
      const generated = generateQuestions(input);
      const db = getDb();
      const ids: number[] = [];
      for (const g of generated) {
        const [{ id }] = await db.insert(questions).values({
          bankId: input.bankId,
          type: g.type,
          textAr: g.textAr,
          textEn: g.textEn || null,
          options: g.options ?? null,
          correctAnswer: g.correctAnswer ?? null,
          modelAnswer: g.modelAnswer ?? null,
          explanation: g.explanation ?? null,
          points: g.points,
          difficulty: g.difficulty,
          competency: g.competency ?? null,
          status: "draft",
          aiGenerated: true,
          createdBy: ctx.user.id,
        }).$returningId();
        ids.push(id);
      }
      await audit(ctx.user.id, ctx.user.nameAr, "ai_generate_questions", "question_bank", input.bankId, `count=${ids.length} topic=${input.topic}`);
      return { generated: ids.length, ids };
    }),

  /** توليد أسئلة مشابهة من سؤال في البنك */
  aiGenerateSimilar: staffProcedure
    .input(z.object({ questionId: z.number(), count: z.number().min(1).max(10).default(3) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const q = await db.query.questions.findFirst({ where: eq(questions.id, input.questionId) });
      if (!q) throw new TRPCError({ code: "NOT_FOUND", message: "السؤال غير موجود" });
      const generated = generateSimilarQuestions({
        type: q.type, textAr: q.textAr, textEn: q.textEn, options: q.options,
        correctAnswer: q.correctAnswer, modelAnswer: q.modelAnswer,
        points: q.points, difficulty: q.difficulty, competency: q.competency,
      }, input.count);
      const ids: number[] = [];
      for (const g of generated) {
        const [{ id }] = await db.insert(questions).values({
          bankId: q.bankId,
          type: g.type,
          textAr: g.textAr,
          textEn: g.textEn || null,
          options: g.options ?? null,
          correctAnswer: g.correctAnswer ?? null,
          modelAnswer: g.modelAnswer ?? null,
          explanation: g.explanation ?? null,
          points: g.points,
          difficulty: g.difficulty,
          competency: g.competency ?? null,
          status: "draft",
          aiGenerated: true,
          sourceQuestionId: q.id,
          createdBy: ctx.user.id,
        }).$returningId();
        ids.push(id);
      }
      await audit(ctx.user.id, ctx.user.nameAr, "ai_generate_similar", "question", input.questionId, `count=${ids.length}`);
      return { generated: ids.length, ids };
    }),

  deleteQuestion: staffProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const q = await db.query.questions.findFirst({ where: eq(questions.id, input.id) });
      if (!q) throw new TRPCError({ code: "NOT_FOUND" });
      if (q.createdBy !== ctx.user.id && ctx.user.role === "expert") {
        throw new TRPCError({ code: "FORBIDDEN", message: "يمكن للخبير حذف أسئلته فقط" });
      }
      await db.delete(questions).where(eq(questions.id, input.id));
      await audit(ctx.user.id, ctx.user.nameAr, "delete_question", "question", input.id);
      return { ok: true };
    }),
});
