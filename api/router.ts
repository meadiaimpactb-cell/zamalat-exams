import { createRouter, publicQuery } from "./middleware";
import { authRouter } from "./authRouter";
import { adminRouter } from "./adminRouter";
import { bankRouter } from "./bankRouter";
import { examRouter } from "./examRouter";
import { candidateRouter } from "./candidateRouter";
import { gradingRouter } from "./gradingRouter";
import { monitorRouter } from "./monitorRouter";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  admin: adminRouter,
  bank: bankRouter,
  exam: examRouter,
  candidate: candidateRouter,
  grading: gradingRouter,
  monitor: monitorRouter,
});

export type AppRouter = typeof appRouter;
