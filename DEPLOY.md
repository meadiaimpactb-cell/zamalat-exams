<div dir="rtl">

# النشر على هوستنجر — exam.pfellowships.sa

> ⚠️ **هذا تطبيق Node.js وليس PHP.** لا تضعه في `public_html`. لن يعمل.
> يجب رفعه من قسم **Node.js** في hPanel، وهو متاح فقط على خطط **Business / Cloud / VPS**.

---

## 1) قاعدة البيانات

لا توجد قاعدة بيانات على السيرفر — أنشئها أولاً.

**hPanel → Databases → MySQL Databases → Create**

احفظ: اسم القاعدة، المستخدم، كلمة المرور، والـ host (عادةً `localhost`).

ثم **Databases → phpMyAdmin → Import** وارفع ملف `database.sql` المرفق.

يحتوي على 17 جدولًا + كل البيانات التجريبية (المستخدمون، 11 سؤالًا، 6 زملاء، اختبار `EX-DEMO26`).
بهذا لن تحتاج `db:push` ولا `seed` على السيرفر إطلاقًا.

> بديل: `npx drizzle-kit push` من جهازك مع `DATABASE_URL` يشير للسيرفر — يتطلب تفعيل Remote MySQL في hPanel.

---

## 2) إنشاء تطبيق Node.js

**hPanel → Website → Node.js → Create application**

| الحقل | القيمة |
|---|---|
| Node version | **20.x** أو أعلى |
| Entry file / Startup file | `server.js` |
| Build command | `npm run build` |
| Domain | `exam.pfellowships.sa` |

ثم ارفع ملف `zamalat-exams-deploy.zip`.

هوستنجر ينفّذ `npm install` ← `npm run build` ← يشغّل `server.js` تلقائيًا.

---

## 3) متغيرات البيئة — إلزامية

في إعدادات التطبيق → **Environment variables**:

```
NODE_ENV=production
APP_ID=zamalat-exams
APP_SECRET=<سلسلة عشوائية طويلة — لا تستخدم قيمة التطوير>
DATABASE_URL=mysql://USER:PASSWORD@localhost:3306/DBNAME
```

> `APP_SECRET` يوقّع جلسات الدخول. غيّره عن قيمة التطوير وإلا كانت الجلسات قابلة للتزوير.
>
> لو كانت كلمة مرور القاعدة تحوي `@` أو `:` أو `/` فرمّزها (URL-encode) داخل `DATABASE_URL`.

بدون هذه المتغيرات **سيتوقف التطبيق عند الإقلاع** — [api/lib/env.ts:5-7](api/lib/env.ts#L5-L7) يرمي خطأ صريحًا في وضع الإنتاج.

---

## 4) لماذا `server.js` وليس `dist/boot.js`؟

الملف يعالج مشكلتين تمنعان التشغيل التلقائي:

1. [api/boot.ts:26](api/boot.ts#L26) ينادي `serve()` **فقط** إذا كان `NODE_ENV === "production"`.
   بدونها يقلع التطبيق بصمت ولا يستمع على أي منفذ — ستحصل على 502 دون أي خطأ في السجل.
2. [api/lib/vite.ts:12](api/lib/vite.ts#L12) يقدّم الملفات من `./dist/public` نسبةً إلى **مجلد العمل**.
   لو شغّلت المنصة من مسار آخر لن تظهر الواجهة.

`server.js` يضبط الاثنين ثم يستورد الخادم. المنفذ يُقرأ من `process.env.PORT` تلقائيًا.

---

## 5) بعد النشر — تحقّق

| الفحص | المتوقع |
|---|---|
| `https://exam.pfellowships.sa/api/trpc/ping` | `{"result":{"data":{"json":{"ok":true,...}}}}` |
| `https://exam.pfellowships.sa/` | الصفحة الرئيسية بالشعار |
| `https://exam.pfellowships.sa/login` | `superadmin` / `Super@12345` |
| `https://exam.pfellowships.sa/exam` | `EX-DEMO26` + `1000000001` |

`ping` هو أسرع فحص — لو رجع JSON فالخادم وقاعدة البيانات والدومين كلها سليمة.

---

## 6) أول شيء بعد نجاح النشر

غيّر كلمات مرور الحسابات التجريبية الأربعة (`superadmin`, `admin`, `expert1`, `expert2`) —
كلماتها منشورة في [README.md](README.md) وقابلة للتخمين.

الشاشة: **لوحة التحكم → تغيير كلمة المرور** ([api/authRouter.ts:42](api/authRouter.ts#L42)).

---

## غير مرفوع في الحزمة

- `node_modules/` و `dist/` — يُبنيان على السيرفر
- `.env` — القيم تُضبط في hPanel
- `desktop/` — تطبيق Electron منفصل، يُبنى على جهازك لا على السيرفر

</div>
