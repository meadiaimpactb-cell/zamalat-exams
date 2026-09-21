import { z } from "zod";

/* ============================================================================
 * التحقق المركزي — مشترك بين العميل والخادم
 *  - REGEX: أنماط موحّدة (هوية/جوال/كلمة مرور)
 *  - مخططات Zod (رسائل عربية) تُستخدم على الخادم قبل الحفظ
 *  - مدقّقات العميل: تُرجِع مفتاح i18n (ثنائي اللغة) لعرض الخطأ أسفل الحقل
 * ========================================================================== */

export const RE = {
  nationalId: /^\d{10}$/,                       // 10 خانات أرقام فقط
  saudiPhone: /^(?:05\d{8}|\+9665\d{8})$/,      // 05XXXXXXXX أو +9665XXXXXXXX
  password: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/, // 8+ كبير/صغير/رقم/رمز
  username: /^[A-Za-z0-9._-]{3,}$/,             // 3+ حروف/أرقام/. _ -
  latin: /^[A-Za-z\s.'-]+$/,                    // حروف لاتينية للأسماء الإنجليزية
};

/* ---------------------------------- مخططات الخادم (Zod عربي) ---------------------------------- */
export const zNationalId = z.string().regex(RE.nationalId, "رقم الهوية يجب أن يكون 10 أرقام");
export const zEmailOptional = z.string().email("صيغة البريد غير صحيحة").optional().or(z.literal(""));
export const zSaudiPhoneOptional = z.union([z.string().regex(RE.saudiPhone, "الجوال يجب أن يكون 05XXXXXXXX"), z.literal("")]).optional();
export const zStrongPassword = z.string().regex(RE.password, "كلمة المرور: 8 أحرف على الأقل وتشمل حرفًا كبيرًا وصغيرًا ورقمًا ورمزًا");
export const zRole = z.enum(["super_admin", "admin", "tech_general", "fellowship_manager", "expert"], { message: "الدور غير صالح" });

export const loginSchema = z.object({
  username: z.string().min(1, "اسم المستخدم مطلوب"),
  password: z.string().min(1, "كلمة المرور مطلوبة"),
});

export const candidateSchema = z.object({
  nationalId: zNationalId,
  nameAr: z.string().min(2, "الاسم بالعربية مطلوب"),
  nameEn: z.string().optional(),
  email: zEmailOptional,
  phone: zSaudiPhoneOptional,
  fellowship: z.string().optional(),
  track: z.string().optional(),
  cohort: z.string().optional(),
});

export const userCreateSchema = z.object({
  username: z.string().regex(RE.username, "اسم المستخدم: 3 أحرف على الأقل (حروف/أرقام)"),
  password: zStrongPassword,
  nameAr: z.string().min(2, "الاسم بالعربية مطلوب"),
  nameEn: z.string().optional(), // اختياري (ملاحظة 9)
  email: zEmailOptional,
  phone: zSaudiPhoneOptional,
  role: zRole,
  avatarUrl: z.string().nullable().optional(), // صورة البروفايل (base64)
  fellowshipIds: z.array(z.number()).optional(), // لمدير الزمالة
});

export const examSchema = z.object({
  titleAr: z.string().min(3, "عنوان الاختبار بالعربية مطلوب"),
  titleEn: z.string().optional(),
  durationMin: z.number().int("المدة عدد صحيح").min(1, "المدة يجب أن تكون أكبر من صفر").max(600),
  passScore: z.number().min(0, "بين 0 و100").max(100, "بين 0 و100"),
  snapshotIntervalSec: z.number().int().min(10).max(600),
  maxFullscreenExits: z.number().int().min(0).max(20),
});

/* ---------------------------------- مدقّقات العميل (تُرجِع مفتاح i18n) ---------------------------------- */
export type VKey =
  | "v_required" | "v_nid" | "v_email" | "v_phone" | "v_password"
  | "v_username" | "v_min3" | "v_min2" | "v_positive" | "v_range100" | null;

export const v = {
  required: (val: string | number | undefined | null): VKey =>
    val === undefined || val === null || String(val).trim() === "" ? "v_required" : null,
  nid: (val: string): VKey => (RE.nationalId.test(val.trim()) ? null : "v_nid"),
  email: (val: string): VKey => (!val ? null : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim()) ? null : "v_email"),
  phone: (val: string): VKey => (!val ? null : RE.saudiPhone.test(val.trim()) ? null : "v_phone"),
  password: (val: string): VKey => (RE.password.test(val) ? null : "v_password"),
  username: (val: string): VKey => (RE.username.test(val.trim()) ? null : "v_username"),
  min: (val: string, n: 2 | 3): VKey => (val.trim().length >= n ? null : n === 3 ? "v_min3" : "v_min2"),
  positive: (val: number): VKey => (val > 0 ? null : "v_positive"),
  range100: (val: number): VKey => (val >= 0 && val <= 100 ? null : "v_range100"),
};

/** يُنقّي كائن الأخطاء من القيم الفارغة */
export function firstErrors<T extends Record<string, VKey>>(errs: T): Partial<Record<keyof T, VKey>> {
  const out: Partial<Record<keyof T, VKey>> = {};
  for (const k in errs) if (errs[k]) out[k] = errs[k];
  return out;
}
