#!/usr/bin/env bash
# يحدّث مستودع GitHub بالملفات اللازمة للنشر على هوستنجر.
# لا يمسّ ملفاتك المحلية ولا يعيد كتابة تاريخ المستودع.
#
# التشغيل من Git Bash داخل مجلد المشروع:
#   bash push-to-github.sh
#
# سيطلب منك GitHub تسجيل الدخول أول مرة (نافذة متصفح).

set -euo pipefail

REPO="https://github.com/meadiaimpactb-cell/zamalat-exams.git"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK="$(mktemp -d)"

echo "▶ استنساخ المستودع..."
git clone --quiet "$REPO" "$WORK/repo"
cd "$WORK/repo"

echo "▶ نسخ ملفات النشر..."
mkdir -p public
cp "$SRC/server.js"          ./server.js
cp "$SRC/drizzle.config.ts"  ./drizzle.config.ts
cp "$SRC/DEPLOY.md"          ./DEPLOY.md
cp "$SRC/.gitignore"         ./.gitignore
cp "$SRC/public/logo.png"    ./public/logo.png
cp "$SRC/public/favicon.png" ./public/favicon.png

# حارس: لا ترفع أسرارًا أو نسخ قاعدة بيانات مهما حدث
rm -f .env database.sql ./*.zip

echo "▶ فحص ما سيُرفع..."
git add -A
if git diff --cached --name-only | grep -qE '(^|/)\.env$|\.sql$|\.zip$'; then
  echo "✗ توقف: ملف حساس ضمن التغييرات." >&2
  git diff --cached --name-only >&2
  exit 1
fi

if git diff --cached --quiet; then
  echo "✓ لا جديد — المستودع محدّث أصلاً."
  exit 0
fi

git diff --cached --name-status | sed 's/^/   /'

git -c user.name="meadiaimpactb-cell" -c user.email="meadiaimpactb@gmail.com" \
  commit --quiet -m "feat(deploy): production entry point, drizzle config, brand assets

- server.js: يضبط NODE_ENV ومجلد العمل قبل إقلاع الخادم.
  بدونه لا ينادي api/boot.ts دالة serve() ولا يستمع على أي منفذ.
- drizzle.config.ts: كان مفقودًا، وبدونه يفشل db:push.
- public/logo.png + favicon.png: الشعار الرسمي (كان المسار /logo.png مكسورًا).
- .gitignore: منع رفع *.sql و *.zip."

echo "▶ الدفع إلى GitHub..."
git push --quiet origin HEAD

echo "✓ تم. حدّث الصفحة على GitHub."
