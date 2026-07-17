import { TRPCError } from "@trpc/server";
import { publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { auditLogs, exams, examSupervisors } from "@db/schema";
import { and, eq } from "drizzle-orm";
import type { User } from "@db/schema";

/** Requires a logged-in staff user (admin / expert / super_admin). */
export const staffProcedure = publicQuery.use(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "يجب تسجيل الدخول" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

/** Requires admin or super_admin. */
export const adminProcedure = staffProcedure.use(async ({ ctx, next }) => {
  if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "صلاحية المدير مطلوبة" });
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
  if (user.role === "admin" || user.role === "super_admin") return true;
  const db = getDb();
  const exam = await db.query.exams.findFirst({ where: eq(exams.id, examId) });
  if (!exam) return false;
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
