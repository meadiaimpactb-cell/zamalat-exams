import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, publicQuery } from "./middleware";
import { staffProcedure, audit } from "./authz";
import { getDb } from "./queries/connection";
import { staffSessions, users } from "@db/schema";
import { eq } from "drizzle-orm";
import { hashPassword, verifyPassword, generateToken } from "./lib/security";

export const authRouter = createRouter({
  login: publicQuery
    .input(z.object({ username: z.string().min(1), password: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const user = await db.query.users.findFirst({ where: eq(users.username, input.username) });
      if (!user || !user.active || !verifyPassword(input.password, user.passwordHash)) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "بيانات الدخول غير صحيحة" });
      }
      const token = generateToken();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await db.insert(staffSessions).values({ userId: user.id, token, expiresAt });
      await audit(user.id, user.nameAr, "staff_login", "user", user.id);
      return {
        token,
        user: { id: user.id, username: user.username, nameAr: user.nameAr, nameEn: user.nameEn, role: user.role, email: user.email },
      };
    }),

  logout: staffProcedure.mutation(async ({ ctx }) => {
    const auth = ctx.req.headers.get("authorization");
    if (auth?.startsWith("Bearer ")) {
      await getDb().delete(staffSessions).where(eq(staffSessions.token, auth.slice(7)));
    }
    return { ok: true };
  }),

  me: staffProcedure.query(({ ctx }) => {
    const u = ctx.user;
    return { id: u.id, username: u.username, nameAr: u.nameAr, nameEn: u.nameEn, role: u.role, email: u.email };
  }),

  changePassword: staffProcedure
    .input(z.object({ oldPassword: z.string(), newPassword: z.string().min(8) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const user = await db.query.users.findFirst({ where: eq(users.id, ctx.user.id) });
      if (!user || !verifyPassword(input.oldPassword, user.passwordHash)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "كلمة المرور الحالية غير صحيحة" });
      }
      await db.update(users).set({ passwordHash: hashPassword(input.newPassword) }).where(eq(users.id, ctx.user.id));
      await audit(ctx.user.id, ctx.user.nameAr, "change_password", "user", ctx.user.id);
      return { ok: true };
    }),
});
