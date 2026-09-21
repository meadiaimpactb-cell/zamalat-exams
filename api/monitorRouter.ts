import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter } from "./middleware";
import { staffProcedure, requireExamAccess, canManageExam, audit } from "./authz";
import { getDb } from "./queries/connection";
import {
  examRegistrations, examSessions, candidates, sessionEvents, exams, sessionSnapshots,
} from "@db/schema";
import { eq, desc, inArray, sql } from "drizzle-orm";
import type { User } from "@db/schema";

/**
 * إعادة فتح جلسة مقفَلة (ملاحظة 6): يعود الطالب بنفس بياناته ويجد إجاباته المحفوظة.
 * - تُقبل الجلسات المنتهية بالإنهاء فقط (إنهاء تلقائي لملء الشاشة أو إنهاء المراقب).
 * - عدّاد الخروج من ملء الشاشة يبدأ من الصفر بعد إعادة الفتح (يُحسب من reopenedAt).
 * - يُمنح وقت إضافي اختياري؛ وإن كان المتبقي أقل من 5 دقائق يُرفع إلى 5 دقائق ليتمكن من الدخول.
 */
export async function reopenSession(user: User, sessionId: number, extraMinutes: number) {
  const db = getDb();
  const session = await db.query.examSessions.findFirst({ where: eq(examSessions.id, sessionId) });
  if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "الجلسة غير موجودة" });
  if (session.status !== "terminated") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "إعادة الفتح متاحة للجلسات المقفَلة (المنتهية بالإنهاء) فقط" });
  }
  const reg = await db.query.examRegistrations.findFirst({ where: eq(examRegistrations.id, session.registrationId) });
  await requireExamAccess(user, reg!.examId);
  const now = Date.now();
  let adj = session.timeAdjustmentSec + extraMinutes * 60;
  const remaining = Math.floor((session.deadline.getTime() + adj * 1000 - now) / 1000);
  const MIN_SEC = 5 * 60;
  if (remaining < MIN_SEC) adj += MIN_SEC - remaining;
  await db.update(examSessions).set({
    status: "active",
    submittedAt: null,
    reopenedAt: new Date(now),
    reopenCount: session.reopenCount + 1,
    timeAdjustmentSec: adj,
    lastActivityAt: new Date(now),
  }).where(eq(examSessions.id, sessionId));
  await db.update(examRegistrations).set({ status: "in_progress" }).where(eq(examRegistrations.id, reg!.id));
  await db.insert(sessionEvents).values({
    sessionId,
    eventType: "session_reopened",
    severity: "info",
    details: `أعاد ${user.nameAr} فتح الاختبار للطالب مع الاحتفاظ بإجاباته` + (extraMinutes > 0 ? ` (+${extraMinutes} دقيقة)` : ""),
  });
  await audit(user.id, user.nameAr, "reopen_session", "session", sessionId, `extra=${extraMinutes}min`);
  const newRemaining = Math.max(0, Math.floor((session.deadline.getTime() + adj * 1000 - now) / 1000));
  return { ok: true, remainingSec: newRemaining };
}

export const monitorRouter = createRouter({
  /** ملخص المراقبة الحي لكل الاختبارات المفتوحة ضمن نطاق المستخدم (لإبراز اللوحة في الواجهة — ملاحظة 7) */
  liveSummary: staffProcedure.query(async ({ ctx }) => {
    const db = getDb();
    const open = await db.select().from(exams).where(eq(exams.status, "open"));
    const mine = [];
    for (const e of open) if (await canManageExam(ctx.user, e.id)) mine.push(e);
    const out = [];
    let active = 0, terminated = 0, highRisk = 0;
    for (const e of mine) {
      const regs = await db.select({ id: examRegistrations.id }).from(examRegistrations).where(eq(examRegistrations.examId, e.id));
      const sessions = regs.length
        ? await db.select().from(examSessions).where(inArray(examSessions.registrationId, regs.map((r) => r.id))) : [];
      const a = sessions.filter((s) => s.status === "active");
      const t = sessions.filter((s) => s.status === "terminated").length;
      const h = a.filter((s) => s.riskScore >= 30).length;
      active += a.length; terminated += t; highRisk += h;
      out.push({ examId: e.id, code: e.code, titleAr: e.titleAr, titleEn: e.titleEn, registered: regs.length, active: a.length, terminated: t, highRisk: h });
    }
    return { openExams: mine.length, active, terminated, highRisk, exams: out, at: Date.now() };
  }),

  /** لوحة المراقبة المباشرة: جلسات الاختبار */
  liveSessions: staffProcedure
    .input(z.object({ examId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireExamAccess(ctx.user, input.examId);
      const db = getDb();
      const regs = await db.select().from(examRegistrations).where(eq(examRegistrations.examId, input.examId));
      const sessions = regs.length
        ? await db.select().from(examSessions).where(inArray(examSessions.registrationId, regs.map((r) => r.id)))
        : [];
      const out = [];
      for (const s of sessions) {
        const reg = regs.find((r) => r.id === s.registrationId)!;
        const cand = await db.query.candidates.findFirst({ where: eq(candidates.id, reg.candidateId) });
        const events = await db.select().from(sessionEvents).where(eq(sessionEvents.sessionId, s.id));
        const [snapCount] = await db.select({ n: sql<number>`count(*)` }).from(sessionSnapshots).where(eq(sessionSnapshots.sessionId, s.id));
        const deadline = new Date(s.deadline.getTime() + s.timeAdjustmentSec * 1000);
        out.push({
          sessionId: s.id,
          status: s.status,
          candidateName: cand?.nameAr ?? "—",
          candidateMaskedId: cand?.nationalIdMasked ?? "—",
          startedAt: s.startedAt,
          submittedAt: s.submittedAt,
          lastActivityAt: s.lastActivityAt,
          remainingSec: s.status === "active" ? Math.max(0, Math.floor((deadline.getTime() - Date.now()) / 1000)) : 0,
          riskScore: s.riskScore,
          eventsCount: events.length,
          highEvents: events.filter((e) => e.severity === "high" || e.severity === "critical").length,
          snapshotsCount: Number(snapCount?.n ?? 0),
          ipAddress: s.ipAddress,
          reopenCount: s.reopenCount,
          // سبب الإقفال (آخر حدث إنهاء) لعرضه بجانب زر إعادة الفتح
          terminationReason: s.status === "terminated"
            ? (events.filter((e) => e.eventType === "auto_terminated_fullscreen" || e.eventType === "session_terminated_by_staff").at(-1)?.details ?? null)
            : null,
        });
      }
      return out;
    }),

  /** أحداث جلسة محددة */
  sessionEvents: staffProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const session = await db.query.examSessions.findFirst({ where: eq(examSessions.id, input.sessionId) });
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      const reg = await db.query.examRegistrations.findFirst({ where: eq(examRegistrations.id, session.registrationId) });
      await requireExamAccess(ctx.user, reg!.examId);
      return db.select().from(sessionEvents).where(eq(sessionEvents.sessionId, input.sessionId)).orderBy(desc(sessionEvents.id));
    }),

  /** لقطات الكاميرا لجلسة محددة (المتطلب 5) — أحدث أولًا، بدون تحميل الصور الثقيلة إلا عند الطلب */
  sessionSnapshots: staffProcedure
    .input(z.object({ sessionId: z.number(), limit: z.number().min(1).max(300).default(60) }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const session = await db.query.examSessions.findFirst({ where: eq(examSessions.id, input.sessionId) });
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      const reg = await db.query.examRegistrations.findFirst({ where: eq(examRegistrations.id, session.registrationId) });
      await requireExamAccess(ctx.user, reg!.examId);
      const rows = await db.select().from(sessionSnapshots)
        .where(eq(sessionSnapshots.sessionId, input.sessionId))
        .orderBy(desc(sessionSnapshots.id))
        .limit(input.limit);
      return rows.map((r) => ({ id: r.id, image: r.image, kind: r.kind, flagged: r.flagged, capturedAt: r.capturedAt }));
    }),

  /** وسم لقطة كمشتبه بها */
  flagSnapshot: staffProcedure
    .input(z.object({ snapshotId: z.number(), flagged: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const snap = await db.query.sessionSnapshots.findFirst({ where: eq(sessionSnapshots.id, input.snapshotId) });
      if (!snap) throw new TRPCError({ code: "NOT_FOUND" });
      const session = await db.query.examSessions.findFirst({ where: eq(examSessions.id, snap.sessionId) });
      const reg = await db.query.examRegistrations.findFirst({ where: eq(examRegistrations.id, session!.registrationId) });
      await requireExamAccess(ctx.user, reg!.examId);
      await db.update(sessionSnapshots).set({ flagged: input.flagged }).where(eq(sessionSnapshots.id, input.snapshotId));
      return { ok: true };
    }),

  /** مراجعة حدث مراقبة: سليم / مشتبه / مخالفة */
  reviewEvent: staffProcedure
    .input(z.object({ eventId: z.number(), decision: z.enum(["clean", "suspicious", "violation"]), note: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const event = await db.query.sessionEvents.findFirst({ where: eq(sessionEvents.id, input.eventId) });
      if (!event) throw new TRPCError({ code: "NOT_FOUND" });
      const session = await db.query.examSessions.findFirst({ where: eq(examSessions.id, event.sessionId) });
      const reg = await db.query.examRegistrations.findFirst({ where: eq(examRegistrations.id, session!.registrationId) });
      await requireExamAccess(ctx.user, reg!.examId);
      await db.update(sessionEvents).set({
        reviewedBy: ctx.user.id,
        reviewDecision: input.decision + (input.note ? `: ${input.note}` : ""),
      }).where(eq(sessionEvents.id, input.eventId));
      await audit(ctx.user.id, ctx.user.nameAr, "review_proctor_event", "session_event", input.eventId, input.decision);
      return { ok: true };
    }),

  /** إيقاف جلسة بسبب مخالفة جسيمة */
  terminateSession: staffProcedure
    .input(z.object({ sessionId: z.number(), reason: z.string().min(3) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const session = await db.query.examSessions.findFirst({ where: eq(examSessions.id, input.sessionId) });
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      const reg = await db.query.examRegistrations.findFirst({ where: eq(examRegistrations.id, session.registrationId) });
      await requireExamAccess(ctx.user, reg!.examId);
      await db.update(examSessions).set({ status: "terminated", submittedAt: new Date() })
        .where(eq(examSessions.id, input.sessionId));
      await db.update(examRegistrations).set({ status: "terminated" }).where(eq(examRegistrations.id, reg!.id));
      await db.insert(sessionEvents).values({
        sessionId: input.sessionId,
        eventType: "session_terminated_by_staff",
        severity: "critical",
        details: `أُوقفت الجلسة بواسطة ${ctx.user.nameAr}: ${input.reason}`,
      });
      await audit(ctx.user.id, ctx.user.nameAr, "terminate_session", "session", input.sessionId, input.reason);
      return { ok: true };
    }),

  /** إعادة فتح جلسة مقفَلة مع الاحتفاظ بالإجابات (ملاحظة 6) */
  reopenSession: staffProcedure
    .input(z.object({ sessionId: z.number(), extraMinutes: z.number().min(0).max(300).default(0) }))
    .mutation(async ({ ctx, input }) => reopenSession(ctx.user, input.sessionId, input.extraMinutes)),

  /** تمديد وقت جلسة نشطة */
  extendSession: staffProcedure
    .input(z.object({ sessionId: z.number(), minutes: z.number().min(1).max(300) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const session = await db.query.examSessions.findFirst({ where: eq(examSessions.id, input.sessionId) });
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      if (session.status !== "active") throw new TRPCError({ code: "BAD_REQUEST", message: "الجلسة غير نشطة" });
      const reg = await db.query.examRegistrations.findFirst({ where: eq(examRegistrations.id, session.registrationId) });
      await requireExamAccess(ctx.user, reg!.examId);
      await db.update(examSessions).set({
        timeAdjustmentSec: session.timeAdjustmentSec + input.minutes * 60,
      }).where(eq(examSessions.id, input.sessionId));
      await db.insert(sessionEvents).values({
        sessionId: input.sessionId,
        eventType: "time_extended",
        severity: "info",
        details: `مدّد ${ctx.user.nameAr} الوقت ${input.minutes} دقيقة إضافية`,
      });
      await audit(ctx.user.id, ctx.user.nameAr, "extend_session_time", "session", input.sessionId, `+${input.minutes}min`);
      return { ok: true };
    }),

  /** إحصائيات مراقبة الاختبار */
  examOverview: staffProcedure
    .input(z.object({ examId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireExamAccess(ctx.user, input.examId);
      const db = getDb();
      const exam = await db.query.exams.findFirst({ where: eq(exams.id, input.examId) });
      const regs = await db.select().from(examRegistrations).where(eq(examRegistrations.examId, input.examId));
      const sessions = regs.length
        ? await db.select().from(examSessions).where(inArray(examSessions.registrationId, regs.map((r) => r.id)))
        : [];
      const active = sessions.filter((s) => s.status === "active").length;
      const submitted = sessions.filter((s) => s.status === "submitted" || s.status === "auto_submitted").length;
      const terminated = sessions.filter((s) => s.status === "terminated").length;
      const eventRows = sessions.length
        ? await db.select().from(sessionEvents).where(inArray(sessionEvents.sessionId, sessions.map((s) => s.id)))
        : [];
      return {
        examTitle: exam?.titleAr,
        registered: regs.length,
        started: sessions.length,
        active, submitted, terminated,
        notStarted: regs.length - sessions.length,
        totalEvents: eventRows.length,
        highSeverityEvents: eventRows.filter((e) => e.severity === "high" || e.severity === "critical").length,
        avgRisk: sessions.length ? Math.round(sessions.reduce((a, s) => a + s.riskScore, 0) / sessions.length) : 0,
      };
    }),
});
