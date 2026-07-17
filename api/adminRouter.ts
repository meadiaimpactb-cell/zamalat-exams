import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter } from "./middleware";
import { adminProcedure, superAdminProcedure, staffProcedure, audit } from "./authz";
import { getDb } from "./queries/connection";
import {
  users,
  candidates,
  fellowships,
  auditLogs,
  exams,
  examSessions,
  examRegistrations,
  results,
  questions,
} from "@db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { hashPassword, maskNationalId } from "./lib/security";

export const adminRouter = createRouter({
  /* ------------------------------- users ------------------------------- */
  listUsers: adminProcedure.query(async () => {
    const db = getDb();
    const rows = await db.select().from(users).orderBy(users.id);
    return rows.map((u) => ({
      id: u.id, username: u.username, nameAr: u.nameAr, nameEn: u.nameEn,
      email: u.email, role: u.role, active: u.active, createdAt: u.createdAt,
    }));
  }),

  createUser: adminProcedure
    .input(z.object({
      username: z.string().min(3),
      password: z.string().min(8),
      nameAr: z.string().min(2),
      nameEn: z.string().min(2),
      email: z.string().email().optional().or(z.literal("")),
      role: z.enum(["super_admin", "admin", "expert"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (input.role === "super_admin" && ctx.user.role !== "super_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "إنشاء مدير نظام أعلى يتطلب صلاحية مدير النظام الأعلى" });
      }
      const existing = await db.query.users.findFirst({ where: eq(users.username, input.username) });
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "اسم المستخدم مستخدم مسبقًا" });
      const [{ id }] = await db.insert(users).values({
        username: input.username,
        passwordHash: hashPassword(input.password),
        nameAr: input.nameAr,
        nameEn: input.nameEn,
        email: input.email || null,
        role: input.role,
      }).$returningId();
      await audit(ctx.user.id, ctx.user.nameAr, "create_user", "user", id, `${input.username} (${input.role})`);
      return { id };
    }),

  updateUser: adminProcedure
    .input(z.object({
      id: z.number(),
      nameAr: z.string().optional(),
      nameEn: z.string().optional(),
      email: z.string().optional(),
      role: z.enum(["super_admin", "admin", "expert"]).optional(),
      active: z.boolean().optional(),
      password: z.string().min(8).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const target = await db.query.users.findFirst({ where: eq(users.id, input.id) });
      if (!target) throw new TRPCError({ code: "NOT_FOUND" });
      if (target.role === "super_admin" && ctx.user.role !== "super_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "تعديل مدير النظام الأعلى يتطلب صلاحيته" });
      }
      await db.update(users).set({
        ...(input.nameAr ? { nameAr: input.nameAr } : {}),
        ...(input.nameEn ? { nameEn: input.nameEn } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.role ? { role: input.role } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
        ...(input.password ? { passwordHash: hashPassword(input.password) } : {}),
      }).where(eq(users.id, input.id));
      await audit(ctx.user.id, ctx.user.nameAr, "update_user", "user", input.id);
      return { ok: true };
    }),

  /* ------------------------------- candidates ------------------------------- */
  listCandidates: staffProcedure.query(async () => {
    return getDb().select().from(candidates).orderBy(desc(candidates.id));
  }),

  createCandidate: adminProcedure
    .input(z.object({
      nationalId: z.string().min(5),
      nameAr: z.string().min(2),
      nameEn: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      fellowship: z.string().optional(),
      track: z.string().optional(),
      cohort: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const existing = await db.query.candidates.findFirst({ where: eq(candidates.nationalId, input.nationalId) });
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "رقم الهوية مسجل مسبقًا" });
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

  /** استيراد زملاء من نص CSV/لصق أرقام هوية */
  importCandidates: adminProcedure
    .input(z.object({ csv: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const lines = input.csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      let created = 0;
      let skipped = 0;
      for (const line of lines) {
        const parts = line.split(/[,\t;]/).map((p) => p.trim());
        const nationalId = parts[0];
        if (!nationalId || !/^\d{5,}$/.test(nationalId)) { skipped++; continue; }
        const nameAr = parts[1] || `زميل ${nationalId}`;
        const existing = await db.query.candidates.findFirst({ where: eq(candidates.nationalId, nationalId) });
        if (existing) { skipped++; continue; }
        await db.insert(candidates).values({
          nationalId,
          nationalIdMasked: maskNationalId(nationalId),
          nameAr,
          nameEn: parts[2] || null,
          email: parts[3] || null,
          phone: parts[4] || null,
          fellowship: parts[5] || null,
          track: parts[6] || null,
          cohort: parts[7] || null,
        });
        created++;
      }
      await audit(ctx.user.id, ctx.user.nameAr, "import_candidates", "candidate", undefined, `created=${created} skipped=${skipped}`);
      return { created, skipped };
    }),

  deleteCandidate: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await getDb().delete(candidates).where(eq(candidates.id, input.id));
      await audit(ctx.user.id, ctx.user.nameAr, "delete_candidate", "candidate", input.id);
      return { ok: true };
    }),

  /* ------------------------------- fellowships ------------------------------- */
  listFellowships: staffProcedure.query(async () => {
    return getDb().select().from(fellowships).orderBy(fellowships.id);
  }),

  createFellowship: adminProcedure
    .input(z.object({ nameAr: z.string().min(2), nameEn: z.string().min(2), description: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const [{ id }] = await getDb().insert(fellowships).values(input).$returningId();
      await audit(ctx.user.id, ctx.user.nameAr, "create_fellowship", "fellowship", id, input.nameAr);
      return { id };
    }),

  /* ------------------------------- audit & stats ------------------------------- */
  auditLogs: superAdminProcedure
    .input(z.object({ limit: z.number().default(100) }))
    .query(async ({ input }) => {
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
