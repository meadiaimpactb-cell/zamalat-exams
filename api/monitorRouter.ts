import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter } from "./middleware";
import { staffProcedure, requireExamAccess, audit } from "./authz";
import { getDb } from "./queries/connection";
import {
  examRegistrations, examSessions, candidates, sessionEvents, exams,
} from "@db/schema";
import { eq, desc, inArray } from "drizzle-orm";

export const monitorRouter = createRouter({
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
          ipAddress: s.ipAddress,
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
