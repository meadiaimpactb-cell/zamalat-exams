import { drizzle } from "drizzle-orm/mysql2";
import { env } from "../lib/env";
import * as schema from "@db/schema";
import * as relations from "@db/relations";

const fullSchema = { ...schema, ...relations };

let instance: ReturnType<typeof drizzle<typeof fullSchema>>;

export function getDb() {
  if (!instance) {
    instance = drizzle({
      // ترميز الاتصال صريح utf8mb4 حتى لا تتلف الرموز الرياضية (× ÷ − √ ²) والأحرف الرباعية مهما كان الإعداد الافتراضي للخادم (ملاحظة 1)
      connection: { uri: env.databaseUrl, charset: "utf8mb4_unicode_ci" },
      mode: "planetscale",
      schema: fullSchema,
    });
  }
  return instance;
}
