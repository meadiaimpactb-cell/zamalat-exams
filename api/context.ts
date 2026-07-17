import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { getDb } from "./queries/connection";
import { staffSessions, users, type User } from "@db/schema";
import { eq } from "drizzle-orm";

export type TrpcContext = {
  req: Request;
  resHeaders: Headers;
  user: User | null;
};

export async function createContext(
  opts: FetchCreateContextFnOptions,
): Promise<TrpcContext> {
  let user: User | null = null;
  try {
    const auth = opts.req.headers.get("authorization");
    if (auth?.startsWith("Bearer ")) {
      const token = auth.slice(7);
      const db = getDb();
      const session = await db.query.staffSessions.findFirst({
        where: eq(staffSessions.token, token),
      });
      if (session && session.expiresAt > new Date()) {
        user =
          (await db.query.users.findFirst({
            where: eq(users.id, session.userId),
          })) ?? null;
        if (user && !user.active) user = null;
      }
    }
  } catch {
    user = null;
  }
  return { req: opts.req, resHeaders: opts.resHeaders, user };
}
