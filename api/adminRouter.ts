import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter } from "./middleware";
import { adminProcedure, staffProcedure, userMgmtProcedure, getUserFellowshipIds, audit } from "./authz";
import { can } from "@contracts/permissions";
import { getDb } from "./queries/connection";
import {
  users,
  staffSessions,
  userFellowships,
  candidates,
  fellowships,
  tracks,
  cohorts,
  questionBanks,
  auditLogs,
  exams,
  examSessions,
  examRegistrations,
  results,
  questions,
  sessionEvents,
  sessionSnapshots,
} from "@db/schema";
import { eq, desc, sql, inArray } from "drizzle-orm";
import { hashPassword, maskNationalId } from "./lib/security";
import { userCreateSchema, candidateSchema, zNationalId } from "@contracts/validation";

export const adminRouter = createRouter({
  /* ------------------------------- users ------------------------------- */
  listUsers: adminProcedure.query(async () => {
    const db = getDb();
    const rows = await db.select().from(users).orderBy(users.id);
    return rows.map((u) => ({
      id: u.id, username: u.username, nameAr: u.nameAr, nameEn: u.nameEn,
      email: u.email, phone: u.phone, avatarUrl: u.avatarUrl,
      role: u.role, active: u.active, createdAt: u.createdAt,
    }));
  }),

  createUser: userMgmtProcedure
    .input(userCreateSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (input.role === "super_admin" && ctx.user.role !== "super_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "إنشاء مدير نظام أعلى يتطلب صلاحية مدير النظام الأعلى" });
      }
      const existing = await db.query.users.findFirst({ where: eq(users.username, input.username) });
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "اسم المستخدم مستخدم مسبقًا" });
      if (input.email) {
        const dupEmail = await db.query.users.findFirst({ where: eq(users.email, input.email) });
        if (dupEmail) throw new TRPCError({ code: "CONFLICT", message: "البريد الإلكتروني مستخدم مسبقًا" });
      }
      const [{ id }] = await db.insert(users).values({
        username: input.username,
        passwordHash: hashPassword(input.password),
        nameAr: input.nameAr,
        nameEn: input.nameEn?.trim() || null, // اختياري (ملاحظة 9)
        email: input.email || null,
        phone: input.phone || null,
        avatarUrl: input.avatarUrl || null,
        role: input.role,
      }).$returningId();
      // ربط مدير الزمالة بزمالاته
      if (input.role === "fellowship_manager" && input.fellowshipIds?.length) {
        await db.insert(userFellowships).values(input.fellowshipIds.map((fid) => ({ userId: id, fellowshipId: fid })));
      }
      await audit(ctx.user.id, ctx.user.nameAr, "create_user", "user", id, `${input.username} (${input.role})`);
      return { id };
    }),

  updateUser: userMgmtProcedure
    .input(z.object({
      id: z.number(),
      nameAr: z.string().optional(),
      nameEn: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      role: z.enum(["super_admin", "admin", "tech_general", "fellowship_manager", "expert"]).optional(),
      active: z.boolean().optional(),
      password: z.string().min(8).optional(),
      avatarUrl: z.string().nullable().optional(),
      fellowshipIds: z.array(z.number()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const target = await db.query.users.findFirst({ where: eq(users.id, input.id) });
      if (!target) throw new TRPCError({ code: "NOT_FOUND" });
      if (target.role === "super_admin" && ctx.user.role !== "super_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "تعديل مدير النظام الأعلى يتطلب صلاحيته" });
      }
      // منع تصعيد الصلاحية: لا يرقّي أحد مستخدمًا إلى مدير نظام أعلى إلا مدير نظام أعلى
      if (input.role === "super_admin" && ctx.user.role !== "super_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "ترقية مستخدم إلى مدير نظام أعلى تتطلب صلاحية مدير النظام الأعلى" });
      }
      // حماية مدير النظام الأعلى: لا يُعطَّل ولا تُنزَّل رتبته إطلاقًا
      const deactivating = input.active === false;
      const demoting = input.role && input.role !== "super_admin" && target.role === "super_admin";
      if (deactivating && target.id === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "لا يمكنك تعطيل حسابك الخاص" });
      }
      if (deactivating && target.role === "super_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "مدير النظام الأعلى محمي — لا يمكن تعطيله إطلاقًا" });
      }
      if (demoting) {
        throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكن تنزيل رتبة مدير النظام الأعلى" });
      }
      await db.update(users).set({
        ...(input.nameAr ? { nameAr: input.nameAr } : {}),
        ...(input.nameEn !== undefined ? { nameEn: input.nameEn.trim() || null } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
        ...(input.role ? { role: input.role } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
        ...(input.password ? { passwordHash: hashPassword(input.password) } : {}),
        ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl || null } : {}),
      }).where(eq(users.id, input.id));
      // تحديث زمالات مدير الزمالة
      if (input.fellowshipIds) {
        await db.delete(userFellowships).where(eq(userFellowships.userId, input.id));
        if (input.fellowshipIds.length) {
          await db.insert(userFellowships).values(input.fellowshipIds.map((fid) => ({ userId: input.id, fellowshipId: fid })));
        }
      }
      await audit(ctx.user.id, ctx.user.nameAr, "update_user", "user", input.id);
      return { ok: true };
    }),

  /** زمالات مستخدم (لمدير الزمالة) */
  userFellowships: adminProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input }) => {
      const rows = await getDb().select().from(userFellowships).where(eq(userFellowships.userId, input.userId));
      return rows.map((r) => r.fellowshipId);
    }),

  /** حذف نهائي لمستخدم — محمي: لا يُحذف مدير النظام الأعلى ولا حسابك الخاص */
  deleteUser: userMgmtProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const target = await db.query.users.findFirst({ where: eq(users.id, input.id) });
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "المستخدم غير موجود" });
      if (target.role === "super_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "مدير النظام الأعلى محمي — لا يمكن حذفه إطلاقًا" });
      }
      if (target.id === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "لا يمكنك حذف حسابك الخاص" });
      }
      await db.delete(staffSessions).where(eq(staffSessions.userId, input.id));
      await db.delete(users).where(eq(users.id, input.id));
      await audit(ctx.user.id, ctx.user.nameAr, "delete_user", "user", input.id, target.username);
      return { ok: true };
    }),

  /* ------------------------------- candidates ------------------------------- */
  listCandidates: staffProcedure.query(async ({ ctx }) => {
    const db = getDb();
    const all = await db.select().from(candidates).orderBy(desc(candidates.id));
    // مدير الزمالة: زملاء زمالاته فقط (المطابقة بالاسم)
    if (ctx.user.role === "fellowship_manager") {
      const fids = await getUserFellowshipIds(ctx.user.id);
      if (!fids.length) return [];
      const fels = await db.select().from(fellowships).where(inArray(fellowships.id, fids));
      const names = new Set(fels.map((f) => f.nameAr));
      return all.filter((c) => c.fellowship && names.has(c.fellowship));
    }
    return all;
  }),

  createCandidate: adminProcedure
    .input(candidateSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const existing = await db.query.candidates.findFirst({ where: eq(candidates.nationalId, input.nationalId) });
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "رقم الهوية مسجل مسبقًا" });
      if (input.email) {
        const dupEmail = await db.query.candidates.findFirst({ where: eq(candidates.email, input.email) });
        if (dupEmail) throw new TRPCError({ code: "CONFLICT", message: "البريد الإلكتروني مسجل لزميل آخر" });
      }
      const [{ id }] = await db.insert(candidates).values({
        nationalId: input.nationalId,
        nationalIdMasked: maskNationalId(input.nationalId),
        nameAr: input.nameAr,
        nameEn: input.nameEn || null,
        email: input.email || null,
        phone: input.phone || null,
        fellowship: input.fellowship || null,
        track: input.track || null,
        cohort: input.cohort || null,
      }).$returningId();
      await audit(ctx.user.id, ctx.user.nameAr, "create_candidate", "candidate", id, input.nationalId);
      return { id };
    }),

  /**
   * استيراد زملاء من نص CSV/لصق (سطر لكل زميل: هوية، اسم، اسم إنجليزي، بريد، جوال، زمالة، مسار، دفعة).
   * - defaults: قيم افتراضية (زمالة/مسار/دفعة) تُطبَّق على الخلايا الفارغة → استيراد "ضمن زمالة معينة".
   * - updateExisting: تحديث الحقول غير الفارغة للزملاء الموجودين بدل تخطيهم.
   * - يعيد تقريرًا مفصّلًا بالسطر (أخطاء/تخطي) ليُعرض للمستخدم.
   */
  importCandidates: adminProcedure
    .input(z.object({
      csv: z.string().min(1),
      defaults: z.object({ fellowship: z.string().optional(), track: z.string().optional(), cohort: z.string().optional() }).optional(),
      updateExisting: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const lines = input.csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const d = input.defaults ?? {};
      let created = 0, updated = 0, skipped = 0;
      const errors: string[] = [];
      const seen = new Set<string>();
      for (const [i, line] of lines.entries()) {
        const parts = line.split(/[,\t;]/).map((p) => p.trim());
        // تحويل الأرقام العربية في الهوية/الجوال
        const digits = (s: string) => s.replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c)));
        const nationalId = digits(parts[0] ?? "");
        if (!nationalId || !/^\d{5,}$/.test(nationalId)) {
          if (/^(هوية|رقم|id|national)/i.test(parts[0] ?? "")) continue; // صف عناوين
          errors.push(`سطر ${i + 1}: رقم هوية غير صالح «${parts[0] ?? ""}»`); skipped++; continue;
        }
        if (seen.has(nationalId)) { errors.push(`سطر ${i + 1}: الهوية ${nationalId} مكررة داخل الملف`); skipped++; continue; }
        seen.add(nationalId);
        const row = {
          nameAr: parts[1] || "",
          nameEn: parts[2] || null,
          email: parts[3] || null,
          phone: parts[4] ? digits(parts[4]) : null,
          fellowship: parts[5] || d.fellowship || null,
          track: parts[6] || d.track || null,
          cohort: parts[7] || d.cohort || null,
        };
        const existing = await db.query.candidates.findFirst({ where: eq(candidates.nationalId, nationalId) });
        if (existing) {
          if (!input.updateExisting) { errors.push(`سطر ${i + 1}: ${nationalId} موجود مسبقًا (${existing.nameAr}) — تم التخطي`); skipped++; continue; }
          await db.update(candidates).set({
            ...(row.nameAr ? { nameAr: row.nameAr } : {}),
            ...(row.nameEn ? { nameEn: row.nameEn } : {}),
            ...(row.email ? { email: row.email } : {}),
            ...(row.phone ? { phone: row.phone } : {}),
            ...(row.fellowship ? { fellowship: row.fellowship } : {}),
            ...(row.track ? { track: row.track } : {}),
            ...(row.cohort ? { cohort: row.cohort } : {}),
          }).where(eq(candidates.id, existing.id));
          updated++;
          continue;
        }
        await db.insert(candidates).values({
          nationalId,
          nationalIdMasked: maskNationalId(nationalId),
          nameAr: row.nameAr || `زميل ${nationalId}`,
          nameEn: row.nameEn, email: row.email, phone: row.phone,
          fellowship: row.fellowship, track: row.track, cohort: row.cohort,
        });
        created++;
      }
      await audit(ctx.user.id, ctx.user.nameAr, "import_candidates", "candidate", undefined, `created=${created} updated=${updated} skipped=${skipped}${d.fellowship ? ` fellowship=${d.fellowship}` : ""}`);
      return { created, updated, skipped, errors };
    }),

  /** تحديث جماعي لحقول الزمالة/المسار/الدفعة/الحالة لعدة زملاء (نقل دفعة كاملة إلى زمالة مثلًا) */
  bulkUpdateCandidates: adminProcedure
    .input(z.object({
      ids: z.array(z.number()).min(1).max(500),
      fellowship: z.string().nullable().optional(),
      track: z.string().nullable().optional(),
      cohort: z.string().nullable().optional(),
      active: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { ids, ...fields } = input;
      const set: Record<string, unknown> = {};
      if (fields.fellowship !== undefined) set.fellowship = fields.fellowship;
      if (fields.track !== undefined) set.track = fields.track;
      if (fields.cohort !== undefined) set.cohort = fields.cohort;
      if (fields.active !== undefined) set.active = fields.active;
      if (!Object.keys(set).length) return { updated: 0 };
      await getDb().update(candidates).set(set).where(inArray(candidates.id, ids));
      await audit(ctx.user.id, ctx.user.nameAr, "bulk_update_candidates", "candidate", undefined, `n=${ids.length} ${JSON.stringify(set)}`);
      return { updated: ids.length };
    }),

  /** تعديل بيانات زميل */
  updateCandidate: adminProcedure
    .input(z.object({
      id: z.number(),
      nationalId: zNationalId.optional(),
      nameAr: z.string().min(2).optional(),
      nameEn: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      fellowship: z.string().optional(),
      track: z.string().optional(),
      cohort: z.string().optional(),
      active: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const target = await db.query.candidates.findFirst({ where: eq(candidates.id, input.id) });
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "الزميل غير موجود" });
      // عند تغيير رقم الهوية: تأكد من عدم تكراره + أعد توليد القناع
      if (input.nationalId && input.nationalId !== target.nationalId) {
        const dup = await db.query.candidates.findFirst({ where: eq(candidates.nationalId, input.nationalId) });
        if (dup) throw new TRPCError({ code: "CONFLICT", message: "رقم الهوية مسجل لزميل آخر" });
      }
      await db.update(candidates).set({
        ...(input.nationalId ? { nationalId: input.nationalId, nationalIdMasked: maskNationalId(input.nationalId) } : {}),
        ...(input.nameAr ? { nameAr: input.nameAr } : {}),
        ...(input.nameEn !== undefined ? { nameEn: input.nameEn || null } : {}),
        ...(input.email !== undefined ? { email: input.email || null } : {}),
        ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
        ...(input.fellowship !== undefined ? { fellowship: input.fellowship || null } : {}),
        ...(input.track !== undefined ? { track: input.track || null } : {}),
        ...(input.cohort !== undefined ? { cohort: input.cohort || null } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      }).where(eq(candidates.id, input.id));
      await audit(ctx.user.id, ctx.user.nameAr, "update_candidate", "candidate", input.id);
      return { ok: true };
    }),

  /** ملف الزميل الكامل: بياناته + محاولاته + مخالفاته + نتائجه (المتطلب: استعراض التفاصيل) */
  candidateDetails: staffProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const cand = await db.query.candidates.findFirst({ where: eq(candidates.id, input.id) });
      if (!cand) throw new TRPCError({ code: "NOT_FOUND", message: "الزميل غير موجود" });
      // مدير الزمالة: زملاء زمالته فقط
      if (ctx.user.role === "fellowship_manager") {
        const fids = await getUserFellowshipIds(ctx.user.id);
        const fels = fids.length ? await db.select().from(fellowships).where(inArray(fellowships.id, fids)) : [];
        const names = new Set(fels.map((f) => f.nameAr));
        if (!cand.fellowship || !names.has(cand.fellowship)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية على هذا الزميل" });
        }
      }
      const isAdmin = ctx.user.role === "admin" || ctx.user.role === "super_admin";
      const regs = await db.select().from(examRegistrations).where(eq(examRegistrations.candidateId, cand.id));
      const attempts = [];
      for (const reg of regs) {
        const exam = await db.query.exams.findFirst({ where: eq(exams.id, reg.examId) });
        const sessions = await db.select().from(examSessions).where(eq(examSessions.registrationId, reg.id));
        for (const s of sessions) {
          const events = await db.select().from(sessionEvents).where(eq(sessionEvents.sessionId, s.id));
          const [snap] = await db.select({ n: sql<number>`count(*)` }).from(sessionSnapshots).where(eq(sessionSnapshots.sessionId, s.id));
          const result = await db.query.results.findFirst({ where: eq(results.sessionId, s.id) });
          attempts.push({
            sessionId: s.id,
            examId: reg.examId,
            examTitleAr: exam?.titleAr ?? "—",
            examCode: exam?.code ?? "—",
            status: s.status,
            startedAt: s.startedAt,
            submittedAt: s.submittedAt,
            riskScore: s.riskScore,
            eventsCount: events.length,
            highEvents: events.filter((e) => e.severity === "high" || e.severity === "critical").length,
            snapshotsCount: Number(snap?.n ?? 0),
            percentage: result?.percentage ?? null,
            passed: result?.passed ?? null,
            ipAddress: s.ipAddress,
          });
        }
        if (sessions.length === 0) {
          attempts.push({
            sessionId: null, examId: reg.examId, examTitleAr: exam?.titleAr ?? "—", examCode: exam?.code ?? "—",
            status: reg.status, startedAt: null, submittedAt: null, riskScore: 0,
            eventsCount: 0, highEvents: 0, snapshotsCount: 0, percentage: null, passed: null, ipAddress: null,
          });
        }
      }
      return {
        candidate: {
          id: cand.id,
          nationalId: isAdmin ? cand.nationalId : cand.nationalIdMasked, // الهوية كاملة للمدير فقط
          nationalIdMasked: cand.nationalIdMasked,
          nameAr: cand.nameAr, nameEn: cand.nameEn, email: cand.email, phone: cand.phone,
          fellowship: cand.fellowship, track: cand.track, cohort: cand.cohort,
          active: cand.active, createdAt: cand.createdAt,
        },
        attempts,
      };
    }),

  deleteCandidate: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await getDb().delete(candidates).where(eq(candidates.id, input.id));
      await audit(ctx.user.id, ctx.user.nameAr, "delete_candidate", "candidate", input.id);
      return { ok: true };
    }),

  /** حذف جماعي للزملاء */
  deleteCandidates: adminProcedure
    .input(z.object({ ids: z.array(z.number()).min(1).max(500) }))
    .mutation(async ({ ctx, input }) => {
      await getDb().delete(candidates).where(inArray(candidates.id, input.ids));
      await audit(ctx.user.id, ctx.user.nameAr, "bulk_delete_candidates", "candidate", undefined, `count=${input.ids.length}`);
      return { deleted: input.ids.length };
    }),

  /** حذف جماعي للمستخدمين — محمي: يتخطّى مدير النظام الأعلى وحسابك */
  deleteUsers: userMgmtProcedure
    .input(z.object({ ids: z.array(z.number()).min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      let deleted = 0, skipped = 0;
      for (const id of input.ids) {
        const u = await db.query.users.findFirst({ where: eq(users.id, id) });
        if (!u || u.role === "super_admin" || u.id === ctx.user.id) { skipped++; continue; }
        await db.delete(staffSessions).where(eq(staffSessions.userId, id));
        await db.delete(users).where(eq(users.id, id));
        deleted++;
      }
      await audit(ctx.user.id, ctx.user.nameAr, "bulk_delete_users", "user", undefined, `deleted=${deleted} skipped=${skipped}`);
      return { deleted, skipped };
    }),

  /* ------------------------------- fellowships ------------------------------- */
  listFellowships: staffProcedure.query(async ({ ctx }) => {
    const db = getDb();
    const all = await db.select().from(fellowships).orderBy(fellowships.id);
    // مدير الزمالة: زمالته فقط
    if (ctx.user.role === "fellowship_manager") {
      const fids = new Set(await getUserFellowshipIds(ctx.user.id));
      return all.filter((f) => fids.has(f.id));
    }
    return all;
  }),

  createFellowship: adminProcedure
    .input(z.object({ nameAr: z.string().min(2), nameEn: z.string().optional(), description: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const [{ id }] = await getDb().insert(fellowships).values({
        nameAr: input.nameAr, nameEn: input.nameEn?.trim() || null, description: input.description || null,
      }).$returningId();
      await audit(ctx.user.id, ctx.user.nameAr, "create_fellowship", "fellowship", id, input.nameAr);
      return { id };
    }),

  updateFellowship: adminProcedure
    .input(z.object({ id: z.number(), nameAr: z.string().min(2).optional(), nameEn: z.string().optional(), description: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const f = await db.query.fellowships.findFirst({ where: eq(fellowships.id, input.id) });
      if (!f) throw new TRPCError({ code: "NOT_FOUND", message: "الزمالة غير موجودة" });
      await db.update(fellowships).set({
        ...(input.nameAr ? { nameAr: input.nameAr } : {}),
        ...(input.nameEn !== undefined ? { nameEn: input.nameEn.trim() || null } : {}),
        ...(input.description !== undefined ? { description: input.description || null } : {}),
      }).where(eq(fellowships.id, input.id));
      await audit(ctx.user.id, ctx.user.nameAr, "update_fellowship", "fellowship", input.id);
      return { ok: true };
    }),

  deleteFellowship: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      // فكّ الارتباط من البنوك والاختبارات + حذف المسارات والدفعات التابعة
      await db.update(questionBanks).set({ fellowshipId: null }).where(eq(questionBanks.fellowshipId, input.id));
      await db.update(exams).set({ fellowshipId: null }).where(eq(exams.fellowshipId, input.id));
      await db.delete(tracks).where(eq(tracks.fellowshipId, input.id));
      await db.delete(cohorts).where(eq(cohorts.fellowshipId, input.id));
      await db.delete(fellowships).where(eq(fellowships.id, input.id));
      await audit(ctx.user.id, ctx.user.nameAr, "delete_fellowship", "fellowship", input.id);
      return { ok: true };
    }),

  /* ------------------------------- tracks (مسارات الزمالة) ------------------------------- */
  listTracks: staffProcedure
    .input(z.object({ fellowshipId: z.number().optional() }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db.select().from(tracks).orderBy(tracks.id);
      return input?.fellowshipId ? rows.filter((r) => r.fellowshipId === input.fellowshipId) : rows;
    }),

  createTrack: adminProcedure
    .input(z.object({ fellowshipId: z.number(), nameAr: z.string().min(1), nameEn: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const [{ id }] = await getDb().insert(tracks).values({
        fellowshipId: input.fellowshipId, nameAr: input.nameAr, nameEn: input.nameEn || null,
      }).$returningId();
      await audit(ctx.user.id, ctx.user.nameAr, "create_track", "track", id, input.nameAr);
      return { id };
    }),

  deleteTrack: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await getDb().delete(tracks).where(eq(tracks.id, input.id));
      await audit(ctx.user.id, ctx.user.nameAr, "delete_track", "track", input.id);
      return { ok: true };
    }),

  /* ------------------------------- cohorts (دفعات الزمالة) ------------------------------- */
  listCohorts: staffProcedure
    .input(z.object({ fellowshipId: z.number().optional() }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db.select().from(cohorts).orderBy(cohorts.id);
      return input?.fellowshipId ? rows.filter((r) => r.fellowshipId === input.fellowshipId) : rows;
    }),

  createCohort: adminProcedure
    .input(z.object({ fellowshipId: z.number(), nameAr: z.string().min(1), nameEn: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const [{ id }] = await getDb().insert(cohorts).values({
        fellowshipId: input.fellowshipId, nameAr: input.nameAr, nameEn: input.nameEn || null,
      }).$returningId();
      await audit(ctx.user.id, ctx.user.nameAr, "create_cohort", "cohort", id, input.nameAr);
      return { id };
    }),

  deleteCohort: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await getDb().delete(cohorts).where(eq(cohorts.id, input.id));
      await audit(ctx.user.id, ctx.user.nameAr, "delete_cohort", "cohort", input.id);
      return { ok: true };
    }),

  /* ------------------------------- audit & stats ------------------------------- */
  auditLogs: staffProcedure
    .input(z.object({ limit: z.number().default(100) }))
    .query(async ({ ctx, input }) => {
      // سجل التدقيق: مدير النظام الأعلى + مسؤول الشؤون الفنية العام (audit.view)
      if (!can(ctx.user.role, "audit.view")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "سجل التدقيق يتطلب صلاحية الاطلاع" });
      }
      return getDb().select().from(auditLogs).orderBy(desc(auditLogs.id)).limit(input.limit);
    }),

  stats: staffProcedure.query(async () => {
    const db = getDb();
    const [ex] = await db.select({ c: sql<number>`count(*)` }).from(exams);
    const [qs] = await db.select({ c: sql<number>`count(*)` }).from(questions);
    const [cd] = await db.select({ c: sql<number>`count(*)` }).from(candidates);
    const [ss] = await db.select({ c: sql<number>`count(*)` }).from(examSessions);
    const [rs] = await db.select({ c: sql<number>`count(*)` }).from(results);
    const [rg] = await db.select({ c: sql<number>`count(*)` }).from(examRegistrations);
    return {
      exams: ex.c, questions: qs.c, candidates: cd.c,
      sessions: ss.c, results: rs.c, registrations: rg.c,
    };
  }),
});
