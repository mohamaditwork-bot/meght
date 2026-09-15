# النشر — منصة الموارد البشرية + نظام التقييم (موحّد على قاعدة بيانات)

كل شيء الآن في مشروع واحد وخادم واحد وقاعدة بيانات واحدة:

- **منصة الموارد البشرية** على `/` — رفع ملفات الإكسل والتحليلات. عند ضبط
  MySQL، **كل ملف ترفعه يُحفظ تلقائياً في قاعدة البيانات** ويبقى بعد إعادة
  النشر (لا يعود للبيانات القديمة).
- **نظام التقييم** على `/appraisal` — تقييم الأداء + **روابط التقييم** التي
  ترسلها للمدير المباشر (`/appraisal/e/<token>`).
- **تسجيل دخول واحد** (رمز `056023`): الدخول لمنصة الموارد البشرية يفتح نظام
  التقييم تلقائياً.

## النشر على Railway (Node + MySQL)

1. **New Project → Deploy from GitHub repo** واختر مستودع `meght`.
2. في **Settings → Source**:
   - **Branch** = `claude/hr-intelligence-analytics-platform-jptxre`
   - **Root Directory** = اتركه فارغاً (جذر المستودع) — أمر التشغيل `npm start`.
3. **New → Database → Add MySQL**.
4. في خدمة الخادم → **Variables** أضف:
   - `DATABASE_URL` = `${{MySQL.MYSQL_URL}}`
   - `HR_ADMIN_PASSCODE` = رمز دخول آمن (أو `056023` مؤقتاً)
5. **Settings → Networking → Generate Domain** ثم افتح الرابط.
   - منصة الموارد البشرية: `https://<domain>/`
   - نظام التقييم: `https://<domain>/appraisal/`

عند الإقلاع سيطبع اللوق: `storage backend: mysql` و`MySQL connected`.

## محلياً

```bash
npm install
# مع قاعدة بيانات:
DATABASE_URL=mysql://root@127.0.0.1:3306/maysan npm start
# أو بدون قاعدة بيانات (ملفات على القرص):
npm start
```
