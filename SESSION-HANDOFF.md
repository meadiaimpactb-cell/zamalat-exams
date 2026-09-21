# برومبت استكمال العمل — منصة اختبارات الزمالات المهنية (النسخة المنشورة)

> **كيف تستخدم هذا الملف:** افتح جلسة جديدة في مجلد `C:\laragon\www\zamalat-exams-main` وألصق:
> *«اقرأ `SESSION-HANDOFF.md` بالكامل، ثم أكّد لي فهمك في 5 أسطر، وانتظر الملاحظات الجديدة.»*
> بعد التأكيد أرسل الملاحظات واحدة تلو الأخرى أو دفعة واحدة.

---

## 1. ما هذا المشروع

منصة ويب لإدارة وتنفيذ **الاختبارات الشاملة للزمالات المهنية** — بنوك أسئلة، اختبارات مؤمَّنة بملء الشاشة ومراقبة كاميرا، تصحيح آلي ويدوي، نتائج. مبنية بلغة **TypeScript** واجهةً وخادماً.

| البند | القيمة |
|---|---|
| المسار المحلي | `C:\laragon\www\zamalat-exams-main` |
| الاستضافة | Hostinger — Deploy Web App (إطار Hono، Node 22) — الموقع `white-dolphin-104720.hostingersite.com` (سيُربط بـ `exam.pfellowships.sa`) |
| آخر نشر ناجح | `zamalat-DEPLOY-FINAL.zip` — 2026‑08‑25 10:55 — الحالة Current |
| **حالة الكود المحلي** | **أحدث من المنشور**: دفعة ملاحظات العميل 2026‑09‑17 (11 بنداً — انظر §4‑ب) جاهزة في `zamalat-DEPLOY-2026-09-17.zip` وتنتظر تطبيق migration `db/migrations/2026-09-client-review-batch.sql` ثم Redeploy |
| المستودع | **git repo** مرتبط بـ `https://github.com/meadiaimpactb-cell/zamalat-exams` (خاص، فرع `main`). الأسرار ونسخ القاعدة والحزم مستثناة في `.gitignore` (ملفات الترحيل تُرفع). النشر على هوستنجر ما زال بحزمة zip مؤرّخة |
| الوثيقة المرجعية الكاملة | `وثيقة-المتطلبات-الفنية-الشاملة.pdf` (32 صفحة: المخطط، الـ API، القواعد، الحدود) |

> **تنبيه:** يوجد مسار عمل موازٍ ومنفصل — إعادة بناء هذه الوحدة داخل منصة Laravel في `C:\laragon\www\Professional_Fellowships_Platform` (برومبت `docs/BUILD-PROMPT-exams-module-v2.md`). **لا تخلط بينهما.** هذه الجلسة تخصّ النسخة TypeScript المنشورة فقط.

---

## 2. التقنية

| الطبقة | التقنية |
|---|---|
| الواجهة | React 19 + Vite 7 + React Router 7 + Tailwind 3 + Radix/shadcn + lucide-react + sonner |
| الاتصال | tRPC 11 + TanStack Query 5 + SuperJSON |
| الخادم | Node + Hono 4 (`api/boot.ts`) |
| قاعدة البيانات | MySQL + Drizzle ORM (`db/schema.ts`) — 19 جدولاً |
| التحقق | Zod 4 — مخططات مشتركة في `contracts/validation.ts` |
| الصلاحيات | `contracts/permissions.ts` (مصدر واحد للواجهة والخادم) + `api/authz.ts` |
| اللغة | ثنائية عربي/إنجليزي — كل النصوص في `src/i18n/index.tsx` |

**الأوامر:** `npm run dev` · `npm run build` · `npm run check` (tsc) · `npm test` · `npx drizzle-kit push` (تطبيق المخطط محلياً).

---

## 3. هيكل الملفات المهم

```
api/
  router.ts            تجميع الموجّهات: auth · admin · bank · exam · candidate · grading · monitor
  authz.ts             staffProcedure / adminProcedure / userMgmtProcedure / superAdminProcedure + requireExamAccess + audit()
  adminRouter.ts       المستخدمون · المشاركون · الزمالات · المسارات · الدفعات · التدقيق · الإحصاءات
  bankRouter.ts        البنوك · الأسئلة · المراجعة · الرفع · الذكاء الاصطناعي
  examRouter.ts        الاختبارات · الأسئلة · المشرفون · التسجيل · نشر النتائج
  candidateRouter.ts   مسار المشارك: access · start · state · saveAnswer · heartbeat · logEvent · uploadSnapshot · submit · myResult + التصحيح الآلي (gradeObjective / submitSession)
  gradingRouter.ts     طابور التصحيح · اعتماد · تعديل بسبب
  monitorRouter.ts     الجلسات الحية · الأحداث · اللقطات · إنهاء · تمديد
  lib/aiEngine.ts      محرك قواعد بسيط (ليس LLM) لتوليد الأسئلة واقتراح الدرجات
  lib/security.ts      scrypt · رموز · قناع الهوية · seededShuffle
contracts/
  permissions.ts       5 أدوار × 19 صلاحية
  validation.ts        Regex الهوية/الجوال/كلمة المرور + مخططات Zod عربية
db/
  schema.ts            المخطط الكامل
  migrations/          4 ملفات SQL تُطبَّق على الإنتاج عبر phpMyAdmin (انظر §6)
src/
  pages/               Home · Login · ExamEntry · ExamPrep · ExamRunner · ExamDone · ExamResult
  pages/dashboard/     Overview · Exams · ExamDetail · QuestionBank · AiStudio · Monitoring · Grading · Results · Users · Candidates · Fellowships · Audit · Layout
  providers/           auth · trpc · confirm (نافذة تأكيد موحّدة)
  lib/permissions.tsx  RequirePermission + Forbidden
  i18n/index.tsx       كل النصوص
server.js              نقطة دخول الإنتاج (لا تلمسها دون قراءة §6)
```

---

## 4. ما هو مُنجَز ومنشور (لا يُعاد بناؤه)

### الأدوار والمستخدمون
- 5 أدوار: `super_admin · admin · tech_general · fellowship_manager · expert`. مدير الزمالة مقيّد بزمالاته (`user_fellowships`) على الخادم.
- حماية `super_admin` من الحذف/الإيقاف · تفعيل/إيقاف الدخول · حذف جماعي مع تخطّي المحمي · صورة شخصية · جوال.

### الزمالات والمشاركون
- زمالات ← مسارات ← دفعات (ديناميكية). مشاركون بهوية 10 أرقام فريدة (تُعرض مقنّعة)، استيراد CSV، تفاصيل المشارك (محاولات/أحداث/لقطات/خطورة)، حذف جماعي (≤500).

### بنك الأسئلة
- بنك لكل زمالة. 6 أنواع: `single · multiple · truefalse · short · essay · numeric`. صورة داخل السؤال (`imageUrl` Base64 ≤8MB) + `allowImageAnswer`. دورة اعتماد draft→pending_review→approved/rejected مع إجراءات جماعية. رفع JSON/CSV. توليد آلي (قواعد).

### الاختبار
- إعدادات: مدة (1–600)، نجاح، تعليمات ar/en، `shuffleQuestions/shuffleOptions`، `lockdown`، `proctoring`، `cameraRequired`، `snapshotIntervalSec` (10–600)، `maxFullscreenExits` (0–20، 0 = بلا حد)، فتح/إغلاق، نشر/إخفاء النتائج.
- سحب من البنك (الكل المعتمد / N عشوائي). مشرفون. تسجيل بالبحث بالهوية أو الاسم مع إنشاء تلقائي. وقت إضافي. **معاينة كطالب**.

### مسار المشارك
- بوابة (رمز + هوية) → صفحة سياسات + فحص جهاز (شاشة/متصفح/إنترنت/كاميرا) + موافقتان إلزاميتان → استئناف الجلسة إن وُجدت.
- شاشة الاختبار: مؤقّت (مستغرق/متبقٍّ، الخادم مرجعاً، heartbeat)، حفظ تلقائي، ملء شاشة إجباري مع طبقة تحذير وعدّاد محاولات و**إنهاء تلقائي عند الحد**، رصد: `fullscreen_exit · window_blur · tab_hidden · copy/paste · contextmenu · blocked_shortcut`، كاميرا مع لقطات 320×240 JPEG كل N ثانية بسقف 300/جلسة، إرفاق صورة كإجابة، تسليم بتأكيد، تسليم تلقائي عند انتهاء الوقت.
- نتيجة بعد النشر فقط + طباعة/PDF.

### التصحيح والنتائج والمتابعة
- تصحيح آلي عند التسليم؛ `multiple` بدرجة جزئية: `ratio = max(0,(good − 0.5·bad)/n)`. المقالي والصورة → يدوي مع درجة مقترحة + كاشف نص آلي.
- طابور تصحيح، اعتماد/تعديل، تعديل النتيجة بسبب (سجل `grade_adjustments`)، اعتماد، نشر.
- متابعة لحظية: جلسات نشطة، درجة خطورة (`info 0 · low 2 · medium 6 · high 15 · critical 30`)، أحداث، معرض لقطات مع تمييز، تمديد وقت، إنهاء بسبب.

### عام
- سجل تدقيق لكل عملية حسّاسة. نوافذ تأكيد موحّدة. إشعارات. تحقق فوري بالحقول برسائل عربية. RTL/LTR كامل.

### 4‑ب. دفعة ملاحظات مراجعة العميل 2026‑09‑17 (مبنية محلياً — بانتظار النشر)
1. **المعادلات**: `src/lib/mathText.ts` (محلّل نقي + اختبارات) · `src/components/MathText.tsx` (عرض موحّد يعزل المقاطع الرياضية LTR بخط يغطي الرموز) · `MathToolbar.tsx` (شريط رموز + معاينة حية). مستخدَم في إنشاء السؤال، البنك، معاينة الطالب، شاشة الاختبار، التصحيح. الاتصال بالقاعدة صار `charset: utf8mb4_unicode_ci` صراحةً. السبب الأصلي كان عرضاً لا تخزيناً (Tajawal + انعكاس bidi).
2. **تصدير Excel**: `exam.exportResults` + `src/lib/excel.ts` (xlsx يُحمَّل عند الطلب) — زر في صفحة النتائج. الهوية كاملة في الملف.
3. **إخفاء استعلام النتيجة للطالب**: مفتاح `contracts/features.ts → candidateResultLookup=false` (واجهة + `candidate.myResult`).
4. **المدة الافتراضية 360**: schema + migration + نموذج الإنشاء.
5. **انقطاع الإنترنت**: طابور إجابات محلي (localStorage) يُزامَن تلقائياً، شريط حالة، تسليم مؤجَّل، حدث `network_reconnected` (info، بلا خطورة) في سجل المراقبة.
6. **إعادة فتح المقفَل**: `exam_sessions.reopenedAt/reopenCount` · `monitor.reopenSession` · `exam.reopenRegistration` · أزرار في المراقبة وصفحة الاختبار. عدّاد ملء الشاشة يُحسب بعد آخر إعادة فتح.
7/11. **شاشة التصحيح الكاملة**: `/dashboard/grading/:sessionId` (`GradingSession.tsx`) + `grading.sessionReview` + `grading.gradeQuestion` (لأي نوع سؤال؛ صحيح/خطأ/قيمة؛ يُنشئ النتيجة إن لم توجد). لوحة مراقبة حيّة في الرئيسية + شارة نشطة في القائمة (`monitor.liveSummary`).
8. **الاستيراد الذكي**: `src/lib/questionImport.ts` (+اختبارات) · `SmartImportDialog.tsx` (لصق/ملف txt/csv/xlsx/json → كشف النوع → مراجعة → استيراد كمسودات).
9. **الإنجليزي اختياري**: `nameEn` NULL في users/fellowships/question_banks + كل النماذج والعرض بالـ fallback.
10. **نموذج Excel للزملاء** + رفع xlsx/csv في نافذة الاستيراد.
12. **صفحة الزملاء المتقدمة** (طلب لاحق في نفس الجلسة): بحث + فلاتر (زمالة/مسار/دفعة/حالة/ترتيب) مع عدّادات ورقائق سريعة، تصدير Excel للمعروض أو المحدد (`exportTableXlsx`)، استيراد ضمن زمالة محددة مع خيار تحديث الموجودين وتقرير أخطاء بالسطر (`admin.importCandidates` موسّع)، إجراءات جماعية: نقل لزمالة/مسار/دفعة وتفعيل/تعطيل (`admin.bulkUpdateCandidates`) وتسجيل جماعي في اختبار (`exam.registerCandidates`). ملفات عينات للاستيراد: `docs/samples/` — مجموعتان: `pm-*` (إدارة المشاريع، تجريبية) و **`gi-exam-questions.*` (الاختبار الشامل الحقيقي للزمالة السعودية للابتكار الحكومي: 100 موضوعي + 20 مقالي = 1200، مع الشرح)** من `db/gi-exam-questions.mjs`. حقل `explanation` (الشرح للمصحّح) مدعوم في المحلّل والنموذج وشاشة التصحيح. (تُولَّد بـ `node db/make-samples.mjs`، مختبرة 120/120 في `samples.test.ts`). حذف متعدد لأسئلة الاختبار (`exam.removeQuestions`)، عرض «المدة الفعلية للطالب» في صف التسجيل، وملخص التصحيح `grading.examSummary` مع أسباب فراغ القائمة. بيانات تجريبية: `db/seed-pm-demo.mjs` (زمالة إدارة المشاريع، 120 سؤالاً، اختبار `EX-BB4LTF`، 20 طالباً).
13. **دليل الطالب** (طلب الإدارة 2026-09-21): صفحة عامة `/exam/guide` (`ExamGuide.tsx`، محتوى `src/content/studentGuide.ts`، 12 قسماً + 10 قواعد أساسية، ar/en، طباعة، أرقام الاختبار الفعلية من `candidate.access` الذي صار يعيد `maxFullscreenExits/snapshotIntervalSec`). زر في بوابة الدخول، القواعد + إقرار «قرأت التعليمات» (شرط واجهة ثالث قبل البدء) في صفحة الاستعداد، وزر «؟» داخل شاشة الاختبار. نسخ للتوزيع: `docs/student-guide-ar/en.md` + **`docs/student-guide-ar/en.pdf`** بنفس تصميم الصفحة (6 صفحات A4) — تُولَّد كلها بـ `node db/make-guide.mjs` (يحتاج `npm run dev` شغّالاً وChrome). الصفحة تقبل `?lang=ar|en`.
- البند المفتوح (عدد محاولات الخروج): **قابل للتهيئة لكل اختبار أصلاً** (`maxFullscreenExits` 0–20) — لم يُغيَّر.
- **فحص ديناميكي**: `test/batch-2026-09-17.mjs` (38 حالة عبر tRPC على خادم التطوير — كلها ناجحة) — شغّله بـ `npm run dev` ثم `node test/batch-2026-09-17.mjs`. اختبار `test/e2e-test.mjs` القديم يحتاج بيانات البذر (`EX-DEMO26`) غير الموجودة في القاعدة المحلية الحالية.
- عدّاد الخروج من ملء الشاشة بعد إعادة الفتح يُحسب بمعرّف الحدث (بعد آخر `session_reopened`) لا بالطابع الزمني (دقة الثانية كانت تُبقي الأحداث القديمة محسوبة).

---

## 5. قرارات محسومة (لا تُعاد مناقشتها)
- الإجابة المصوّرة: تصحيح **يدوي** فقط.
- الخروج من ملء الشاشة: إنهاء تلقائي بعد عدد مُعدّ لكل اختبار.
- ترتيب العمل: ميزة تلو الأخرى، وعرض كل ميزة عند اكتمالها.
- الصور واللقطات Base64 في القاعدة (قرار النسخة الحالية — لا يُغيَّر إلا بطلب صريح).

**بنود مفتوحة بانتظار الإدارة** (لا تنفّذها من تلقاء نفسك): درجة `multiple` جزئية أم كل-أو-لا-شيء نهائياً؛ أداة رسم داخل المنصة بدل رفع صورة؛ تصحيح آلي للصور.

---

## 6. النشر على هوستنجر — الوصفة المؤكّدة (اقرأها قبل أي نشر)

1. **قاعدة الإنتاج:** `u153052345_zamalat` (المستخدم `u153052345_zamalat`، ليس `_admin`) على localhost. **أي تغيير في المخطط = ملف SQL جديد في `db/migrations/` بصيغة `IF NOT EXISTS` يُطبَّق مرة واحدة عبر phpMyAdmin قبل النشر.** الملفات القائمة: `2026-08-phase1-features.sql · 2026-08-roles-fellowship-manager.sql · 2026-08-tracks-cohorts.sql · 2026-08-user-avatar.sql` — كلها مطبَّقة. **`2026-09-client-review-batch.sql` — مطبَّق محلياً (عبر النسخة `…LOCAL-mysql8.sql`)، غير مطبَّق على الإنتاج بعد**. ملاحظة: الإنتاج MariaDB (يقبل `ADD COLUMN IF NOT EXISTS`)، أما MySQL 8.4 المحلي فلا — استخدم `ADD COLUMN` بلا `IF NOT EXISTS` محلياً.
2. **`server.js` لا يحتوي top-level await** (LiteSpeed يحمّله بـ `require()` ويرفض ذلك → 503 في حلقة). يستخدم `import("./dist/boot.js").catch(...)` دون انتظار، ويضبط `NODE_ENV=production` و `chdir` قبله. **لا تعدّله.**
3. **الحزمة = المصدر الكامل** (بلا `node_modules` · `dist` · `.git` · ملفات `.sql`) + **`package-lock.json` إلزامي** + ملفان صغيران:
   - `.npmrc` بمحتوى `include=dev` و `production=false` (وإلا `vite: command not found`).
   - `.env` بالمتغيرات `APP_ID · APP_SECRET · DATABASE_URL` (+`NODE_ENV=production`) — يُقرأ عبر `dotenv/config` ويتجاوز فشل حقن متغيرات hPanel.
4. إعدادات hPanel: Framework **Hono** · Entry `server.js` · Build `npm run build` (لا يمكن تفريغه). الرفع من **Deployments → Redeploy** برفع الـ zip. **ليس** في `public_html`.
5. **الفحص بعد النشر:** `/api/trpc/ping` يرجع JSON → الخادم والقاعدة سليمان. ثم `/login` و `/exam`.
6. الحجم المتوقع ~0.5 م.ب / ~160 ملفاً. اسم الحزمة الجديدة بتاريخ: `zamalat-DEPLOY-YYYY-MM-DD.zip`. **ابنِ الحزمة بـ Python `zipfile` (مسارات بشرطة أمامية) — `Compress-Archive` في PowerShell يُنتج مسارات بشرطة خلفية تُفسد التفريغ على لينكس.**

---

## 7. حسابات الاختبار
`superadmin` · `admin` · `expert1` · `expert2` (كلمات المرور في `README.md` — للتطوير فقط). اختبار تجريبي `EX-DEMO26` بهوية `1000000001`.

---

## 8. قواعد العمل في هذه الجلسة

1. **ابدأ بقراءة:** هذا الملف → `db/schema.ts` → `contracts/permissions.ts` → `contracts/validation.ts` → `src/i18n/index.tsx` (الأسماء فقط). لا تقرأ كل الصفحات مقدّماً؛ اقرأ ما تمسّه الملاحظة.
2. **لكل ملاحظة جديدة:** (أ) أعد صياغتها كما فهمتها في سطر؛ (ب) اذكر الملفات التي ستمسّها؛ (ج) إن غيّرت المخطط فأنشئ ملف migration SQL جديداً **قبل** تعديل `schema.ts`؛ (د) نفّذ؛ (هـ) أضف النصوص الجديدة في `i18n` بالعربية والإنجليزية؛ (و) `npm run check` ثم `npm run build`؛ (ز) قل لي ماذا أجرّب بالضبط في المتصفح.
3. **لا تكسر ما هو منشور:** أي تغيير في سلوك قائم (مثل التصحيح أو الإنهاء التلقائي) تذكره صراحة قبل التنفيذ.
4. **الحدود والافتراضيات** من الوثيقة PDF (ملحق ب) — لا تخترع قيماً جديدة.
5. **الصلاحيات** تُضاف في `contracts/permissions.ts` أولاً ثم تُستخدم في الواجهة والخادم معاً.
6. **الأمان:** القواعد تُفرض في الخادم (`authz.ts` / Zod). الواجهة تُخفي فقط.
7. **لا حذف لملفات أو جداول قائمة** دون إذن صريح.
8. بعد إنهاء دفعة الملاحظات: لخّص ما تغيّر (ميزات + migrations + ملفات)، وابنِ حزمة النشر وفق §6، واكتب خطوات النشر بالترتيب.

---

## 9. ابدأ الآن
أكّد فهمك في 5 أسطر (المشروع، الحالة، أخطر قاعدة في النشر، ما لن تلمسه، جاهزيتك)، ثم انتظر الملاحظات الجديدة التي سأرسلها.
