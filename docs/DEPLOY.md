# دليل النشر والتشغيل

## 1. المتطلبات
خادم Ubuntu 22.04+ (2 vCPU · 4GB) · Docker + Compose v2 · نطاق يشير إلى الخادم (A record) · منفذا 80 و443 مفتوحان.

## نشر الصفحة الثابتة عبر Cloudflare Workers
إذا كانت بيئة النشر تشغّل الأمر `npx wrangler deploy` من جذر المستودع، فسيتم نشر الملفات الثابتة الموجودة داخل `public/` باستخدام الإعداد الموجود في `wrangler.toml`.

## 2. الإعداد الأول
```bash
git clone <repo> erp && cd erp/code_sprint1
cp backend/.env.example backend/.env
# عدّل: JWT_ACCESS_SECRET (openssl rand -hex 32) · CORS_ORIGINS · GATEWAY_WEBHOOK_SECRET · SMS_* · COMPANY_IBAN
export DB_PASSWORD=$(openssl rand -hex 16)   # احفظه في مدير الأسرار
sed -i 's/erp.example.sa/YOUR.DOMAIN/g' deploy/nginx/erp.conf
```

## 3. شهادة HTTPS (مرة واحدة)
```bash
# تشغيل nginx على 80 فقط لإصدار الشهادة: علّق كتلة 443 مؤقتاً ثم
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d nginx
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm certbot certonly --webroot -w /var/www/certbot -d YOUR.DOMAIN --email ops@YOUR.DOMAIN --agree-tos
# أعد كتلة 443 ثم:
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```
التجديد تلقائي كل 12 ساعة (خدمة certbot) · أعد تحميل nginx أسبوعياً: `docker compose exec nginx nginx -s reload` (cron).

## 4. البيانات الأولية
```bash
docker compose exec api npx prisma migrate deploy
cd backend && DATABASE_URL=postgresql://erp:$DB_PASSWORD@localhost:5432/erp npx prisma db seed   # من جهاز إداري عبر نفق SSH
```
غيّر كلمة مرور admin@erp.local فوراً بعد أول دخول.

## 5. النسخ الاحتياطي
- **القاعدة:** خدمة `backup` تنفذ `pg_dump` يومياً وتتحقق من قابلية الاستعادة وتحذف ما يتجاوز 30 يوماً. اضبط `S3_BUCKET` للنسخ خارج الخادم.
- **الملفات:** `deploy/uploads-backup.sh` عبر cron يومي: `0 3 * * * /opt/erp/code_sprint1/deploy/uploads-backup.sh`
- **اختبار الاستعادة شهرياً** على بيئة منفصلة: `docker compose exec backup sh /scripts/restore.sh /backups/erp-<ts>.dump`
- الهدف: RPO ≤ 24 ساعة · RTO ≤ 2 ساعة.

## 6. التحقق بعد كل نشر
```bash
BASE=https://YOUR.DOMAIN/api TOKEN=<admin token> ./scripts/smoke.sh
curl -sI https://YOUR.DOMAIN | grep -i strict-transport   # HSTS
```
ثم نفّذ docs/UAT.md يدوياً قبل الإطلاق الأول.

## 7. تطبيق الجوال
```bash
cd mobile
flutter build apk --release --dart-define=API_URL=https://YOUR.DOMAIN/api
flutter build ipa --release --dart-define=API_URL=https://YOUR.DOMAIN/api
```

## 8. اختبار الاختراق (قبل الإطلاق)
النطاق المقترح للجهة المستقلة: المصادقة وOTP والقفل · تجاوز نطاق البيانات بين الأدوار (IDOR) · رفع الملفات · Webhooks · روابط النماذج الموقّعة · إعدادات TLS والترويسات. سلّمهم docs/SECURITY.md وحسابات اختبار لكل دور على بيئة staging منفصلة.

## 9. المراقبة
- `/api/health` كل دقيقة (UptimeRobot / Better Stack) مع تنبيه عند 503.
- السجلات بصيغة JSON مع request-id: `docker compose logs -f api | grep '"s":5'` للأخطاء.
- راجع `/api/integrations/status` يومياً للأحداث الفاشلة.
