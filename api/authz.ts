import { TRPCError } from "@trpc/server";
import { publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { auditLogs, exams, examSupervisors, userFellowships } from "@db/schema";
import { and, eq } from "drizzle-orm";
import type { User } from "@db/schema";

/** الزمالات التي يديرها المستخدم (لمدير الزمالة) */
export async function getUserFellowshipIds(userId: number): Promise<number[]> {
  const rows = await getDb().select().from(userFellowships).where(eq(userFellowships.userId, userId));
  return rows.map((r) => r.fellowshipId);
}

/** Requires a logged-in staff user (admin / expert / super_admin). */
export const staffProcedure = publicQuery.use(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "يجب تسجيل الدخول" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

/** Requires admin or super_admin or tech_general (وصول تشغيلي كامل). */
export const adminProcedure = staffProcedure.use(async ({ ctx, next }) => {
  if (!["admin", "super_admin", "tech_general"].includes(ctx.user.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "صلاحية المدير مطلوبة" });
  }
  return next({ ctx });
});

/** إدارة المستخدمين والأدوار — المدير ومدير النظام الأعلى فقط (لا الشؤون الفنية). */
export const userMgmtProcedure = staffProcedure.use(async ({ ctx, next }) => {
  if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "إدارة المستخدمين تتطلب صلاحية المدير" });
  }
  return next({ ctx });
});

/** Requires super_admin only. */
export const superAdminProcedure = staffProcedure.use(async ({ ctx, next }) => {
  if (ctx.user.role !== "super_admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "صلاحية مدير النظام الأعلى مطلوبة" });
  }
  return next({ ctx });
});

/**
 * Can this user manage/review this exam?
 * - super_admin / admin: all exams
 * - expert: exams they created OR exams they were assigned to supervise
 */
export async function canManageExam(user: User, examId: number): Promise<boolean> {
  // مدير أعلى/مدير/الشؤون الفنية العام: كل الاختبارات
  if (user.role === "admin" || user.role === "super_admin" || user.role === "tech_general") return true;
  const db = getDb();
  const exam = await db.query.exams.findFirst({ where: eq(exams.id, examId) });
  if (!exam) return false;
  // مدير الزمالة: اختبارات زمالاته أو ما أنشأه بنفسه
  if (user.role === "fellowship_manager") {
    if (exam.createdBy === user.id) return true;
    if (!exam.fellowshipId) return false;
    const fids = await getUserFellowshipIds(user.id);
    return fids.includes(exam.fellowshipId);
  }
  if (exam.createdBy === user.id) return true;
  const sup = await db.query.examSupervisors.findFirst({
    where: and(eq(examSupervisors.examId, examId), eq(examSupervisors.expertId, user.id)),
  });
  return !!sup;
}

export async function requireExamAccess(user: User, examId: number) {
  const ok = await canManageExam(user, examId);
  if (!ok) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "لا تملك صلاحية على هذا الاختبار — يمكن للخبير إدارة الاختبارات التي أنشأها أو عُيّن مشرفًا عليها فقط",
    });
  }
}

export async function audit(
  userId: number | null,
  actorName: string,
  action: string,
  entityType?: string,
  entityId?: number,
  details?: string,
) {
  try {
    await getDb().insert(auditLogs).values({
      userId,
      actorName,
      action,
      entityType,
      entityId,
      details,
    });
  } catch (e) {
    console.error("audit failed", e);
  }
}
