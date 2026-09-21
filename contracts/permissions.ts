/* ============================================================================
 * نظام الصلاحيات المركزي (RBAC) — مصدر واحد للحقيقة (مشترك: عميل + خادم)
 * ========================================================================== */

export type Role = "super_admin" | "admin" | "tech_general" | "fellowship_manager" | "expert";

/** الأدوار المقيّدة بزمالة (نطاق رؤيتها محصور في زمالات محددة) */
export const SCOPED_ROLES: Role[] = ["fellowship_manager"];
export const isScopedRole = (role: Role | null | undefined) => !!role && SCOPED_ROLES.includes(role);

export type Permission =
  | "exams.create" | "exams.edit" | "exams.publish" | "exams.delete" | "exams.review" | "exams.extend_time"
  | "questions.manage"
  | "candidates.manage" | "candidates.import" | "candidates.view"
  | "fellowships.manage" | "fellowships.view"
  | "users.manage" | "roles.manage"
  | "monitoring.view"
  | "results.view" | "results.publish"
  | "audit.view"
  | "ai_studio.use";

const ALL: Permission[] = [
  "exams.create", "exams.edit", "exams.publish", "exams.delete", "exams.review", "exams.extend_time",
  "questions.manage", "candidates.manage", "candidates.import", "candidates.view", "fellowships.manage", "fellowships.view",
  "users.manage", "roles.manage", "monitoring.view", "results.view", "results.publish",
  "audit.view", "ai_studio.use",
];

/** خريطة الدور → صلاحياته (المكان المركزي الوحيد) */
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  // مدير النظام الأعلى: كل الصلاحيات
  super_admin: ALL,

  // مدير الاختبارات: كل شيء عدا إدارة الأدوار وسجل التدقيق
  admin: [
    "exams.create", "exams.edit", "exams.publish", "exams.delete", "exams.review", "exams.extend_time",
    "questions.manage", "candidates.manage", "candidates.import", "candidates.view", "fellowships.manage",
    "users.manage", "monitoring.view", "results.view", "results.publish", "ai_studio.use",
  ],

  // مسؤول الشؤون الفنية — عام: يصل ويطّلع على كل شيء (عدا إدارة المستخدمين والأدوار)
  tech_general: [
    "exams.create", "exams.edit", "exams.publish", "exams.delete", "exams.review", "exams.extend_time",
    "questions.manage", "candidates.manage", "candidates.import", "candidates.view", "fellowships.manage", "fellowships.view",
    "monitoring.view", "results.view", "results.publish", "audit.view", "ai_studio.use",
  ],

  // مدير الزمالة: كل ما يخص زمالته فقط. يعرض الزملاء (candidates.view) ويضيفهم عبر تسجيل الاختبار
  fellowship_manager: [
    "exams.create", "exams.edit", "exams.publish", "exams.review", "exams.extend_time",
    "questions.manage", "candidates.view", "fellowships.view",
    "monitoring.view", "results.view", "results.publish", "ai_studio.use",
  ],

  // خبير: إنشاء/مراجعة/تصحيح اختباراته أو ما عُيّن مشرفًا عليه (الملكية تُفرض على الخادم)
  expert: [
    "exams.create", "exams.edit", "exams.publish", "exams.review", "exams.extend_time",
    "questions.manage", "monitoring.view", "results.view", "ai_studio.use",
  ],
};

/**
 * الدالة المركزية للتحقق من الصلاحية — تُستخدم في العميل والخادم.
 * ملاحظة: قواعد الملكية (createdBy/supervisors) تُفرض إضافيًا على الخادم عبر requireExamAccess.
 */
export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/** صلاحية أي واحدة من عدة صلاحيات */
export function canAny(role: Role | null | undefined, permissions: Permission[]): boolean {
  return permissions.some((p) => can(role, p));
}
