<div dir="rtl">

# منصة اختبارات الزمالات المهنية

نظام اختبارات إلكتروني آمن ومتكامل بهوية [الزمالات المهنية](https://pfellowships.sa/) — **عربي / إنجليزي** بالكامل، مع بنك أسئلة مركزي، توليد أسئلة بالذكاء الاصطناعي، مراقبة ذكية، وضع قفل آمن، نسخة سطح مكتب مقفلة، وتصحيح ذكي معتمد من الخبراء.

---

## 📋 ما الذي يقدمه هذا المشروع؟

| المحور | الوصف |
|---|---|
| 🌐 منصة ويب ثنائية اللغة | واجهة عربية/إنجليزية كاملة مع دعم RTL/LTR وهوية الزمالات البصرية |
| 🏦 بنك أسئلة مركزي | 6 أنواع أسئلة + دورة مراجعة واعتماد + رفع جماعي CSV/JSON |
| 🤖 ذكاء اصطناعي | توليد أسئلة جديدة + توليد أسئلة مشابهة + اقتراح تصحيح + كاشف نصوص مولّدة |
| 🔀 خلط الأسئلة | ترتيب أسئلة وخيارات مختلف لكل زميل (بذرة ثابتة لكل جلسة) |
| 🔒 وضع القفل الآمن | ملء شاشة إجباري، حظر نسخ/لصق/اختصارات، رصد مغادرة الصفحة |
| 💻 نسخة سطح مكتب | تطبيق Electron يقفل الجهاز كاملًا (Kiosk) ويرتبط بالموقع فقط |
| 👁️ مراقبة ذكية | تسجيل كل التحركات + درجة خطورة + مراجعة أحداث + إيقاف جلسات |
| ⏱️ عداد وتمديد | عداد تنازلي مزامَن مع الخادم + تمديد للمدير والخبير المشرف |
| ✅ تصحيح ذكي معتمد | اقتراح آلي للأسئلة المفتوحة يعتمده الخبير أو يعدّله |
| 📊 نتائج موثقة | اعتماد، تعديل بأسباب مسجلة، نشر، واستعلام للزميل |

---

## 🚀 التشغيل السريع

```bash
# 1) المتطلبات: Node.js 20+ وقاعدة MySQL (أو TiDB)
npm install

# 2) إعداد البيئة
cp .env.example .env   # ثم املأ DATABASE_URL وبقية القيم

# 3) إنشاء الجداول + البيانات التجريبية
npm run db:push
npx tsx db/seed.ts

# 4) التطوير
npm run dev            # http://localhost:3000

# 5) الإنتاج
npm run build && npm start
```

### Docker

```bash
docker build -t zamalat-exams .
docker run -p 3000:3000 zamalat-exams
```

### نسخة سطح المكتب الآمنة

```bash
cd desktop
npm install
# عدّل config.json (رابط المنصة + رمز خروج المراقب)
npm start          # تشغيل
npm run dist:win   # بناء مثبّت Windows
```

تفاصيل كاملة في [`desktop/README.md`](desktop/README.md).

---

## 👥 الحسابات التجريبية

### الموظفون — بوابة `/login`

| المستخدم | كلمة المرور | الدور | ملاحظات |
|---|---|---|---|
| `superadmin` | `Super@12345` | مدير النظام الأعلى | كل الصلاحيات + سجل التدقيق |
| `admin` | `Admin@12345` | مدير الاختبارات | إدارة كاملة + تعيين الخبراء المشرفين |
| `expert1` | `Expert@12345` | خبير | أنشأ الأسئلة — **لا يملك وصولًا للاختبار التجريبي** |
| `expert2` | `Expert@12345` | خبير (مشرفة) | عيّنها المدير على الاختبار التجريبي |

### الزملاء — بوابة `/exam`

رمز الاختبار: **`EX-DEMO26`** — والهويات: `1000000001` … `1000000006`

> ملف Excel كامل بالحسابات ودليل التجربة مرفق مع التسليم.

---

## 🧪 الاختبار

تم تنفيذ **اختبار شامل آلي (50/50 ناجح)** يغطي جميع المستخدمين والتدفقات:

```bash
npm run dev          # في نافذة
node test/e2e-test.mjs
```

يشمل: دخول كل الأدوار، مصفوفة الصلاحيات، توليد الأسئلة، خلط الأسئلة، الحفظ اللحظي، التمديد، الإيقاف، كشف النص المولّد، التصحيح والاعتماد والنشر. التفاصيل في [`docs/IMPLEMENTATION.md`](docs/IMPLEMENTATION.md).

---

## 📚 التوثيق

| الملف | المحتوى |
|---|---|
| [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md) | **ما كان مطلوبًا** — المتطلبات كاملة كما وردت |
| [`docs/IMPLEMENTATION.md`](docs/IMPLEMENTATION.md) | **ما تم تنفيذه** — البنية، قاعدة البيانات، الـ API، مصفوفة الصلاحيات، الذكاء الاصطناعي، القفل والمراقبة |
| [`desktop/README.md`](desktop/README.md) | نسخة سطح المكتب الآمنة |

---

## 🛠️ التقنيات

- **الواجهة**: React 19 · TypeScript · Vite · Tailwind CSS · shadcn/ui
- **الخلفية**: Hono · tRPC 11 · Drizzle ORM
- **قاعدة البيانات**: MySQL / TiDB
- **سطح المكتب**: Electron (وضع Kiosk)
- **المصادقة**: جلسات مخصصة (scrypt) بأدوار — الزميل يدخل برمز الاختبار + رقم الهوية

---

## English Summary

A secure, bilingual (Arabic/English) exam platform for Professional Fellowships: central question bank with review workflow, AI question generation & similar-question generation, per-candidate question shuffling, browser lockdown + smart proctoring with full event logging, an Electron desktop kiosk client, AI-generated-text detection, AI-assisted essay grading approved by experts, countdown timer with extension rights, and documented results with publishing. Staff roles: super admin, exam admin, expert (experts manage only exams they created or were assigned to supervise). Candidates enter with exam code + national ID. Includes seed data, demo accounts, and a 50-case automated end-to-end test (`test/e2e-test.mjs`, 50/50 passing).

</div>
