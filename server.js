/**
 * نقطة الدخول للإنتاج (هوستنجر / أي استضافة Node).
 *
 * لا تُشغّل dist/boot.js مباشرة — هذا الملف يضبط أمرين يعتمد عليهما الخادم:
 *
 *   1. api/boot.ts ينادي serve() فقط عندما NODE_ENV === "production".
 *      بدونها يقلع التطبيق بصمت دون أن يستمع على أي منفذ.
 *
 *   2. serveStatic({ root: "./dist/public" }) يُحلّ نسبةً إلى مجلد العمل الحالي،
 *      فلو شغّلت المنصة من مجلد آخر لن تظهر الواجهة إطلاقًا.
 *
 * ملاحظة حرجة — لا تضع await هنا:
 *   LiteSpeed في هوستنجر يحمّل هذا الملف عبر require()، و require() يرفض أي
 *   وحدة ESM فيها top-level await ويرمي ERR_REQUIRE_ASYNC_MODULE.
 *   لذلك نستدعي import() دون انتظاره — فالاستيراد الديناميكي لا يجعل
 *   الرسم البياني للوحدة غير متزامن، و dist/boot.js يشغّل الخادم بنفسه.
 */
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

process.env.NODE_ENV ||= "production";
process.chdir(dirname(fileURLToPath(import.meta.url)));

import("./dist/boot.js").catch((err) => {
  console.error("فشل إقلاع الخادم:", err);
  process.exit(1);
});
