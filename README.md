# Property ERP — الكود (Sprint 1 + 2 + 3)

## المحتوى
- `backend/` NestJS + Prisma + PostgreSQL: Login، OTP (MFA)، Refresh Token، Logout، Forgot/Reset Password، Change Password، Profile، RBAC، Audit Log، قفل الحساب بعد 5 محاولات.
- `mobile/` Flutter: Splash، Login، OTP، Forgot Password، Profile، Change Password (RTL، ألوان Ramz).

## تشغيل الـ Backend
```bash
cd backend
cp .env.example .env        # عدّل DATABASE_URL والأسرار
npm install
npx prisma migrate dev --name init
npm run seed                # أدوار + صلاحيات + مستخدم admin
npm run start:dev           # http://localhost:3000/api
```
مستخدم تجريبي: `admin@erp.local` / `Admin@12345`. رمز OTP يُطبع في سجل الخادم (أضف مزود SMS في Sprint 11).

## تشغيل تطبيق Flutter
```bash
cd mobile
flutter create . --platforms=android,ios   # يولّد مجلدات المنصات فقط
flutter pub get
flutter run --dart-define=API_URL=http://10.0.2.2:3000/api
```

## واجهات API
| Method | Path | Auth |
|---|---|---|
| POST | /api/auth/login | — ← يرجع otpToken |
| POST | /api/auth/verify-otp | — ← accessToken + refreshToken |
| POST | /api/auth/refresh | — |
| POST | /api/auth/logout | Bearer |
| POST | /api/auth/forgot-password | — |
| POST | /api/auth/reset-password | — |
| POST | /api/auth/change-password | Bearer |
| GET | /api/users/me | Bearer |
| GET | /api/users | Bearer + users.read |

## حالات الاختبار المغطاة
TC-AUTH-001/002/003، SEC-003/004/005/006، TC-RBAC-004.

---
# Sprint 2: العقارات والوحدات

بعد التحديث نفّذ:
```bash
cd backend && npm install && npx prisma migrate dev --name sprint2 && npm run seed
cd ../mobile && flutter pub get
```
لرفع الصور من الجوال أضف أذونات الكاميرا/المعرض (iOS: NSPhotoLibraryUsageDescription في Info.plist).

## واجهات API الجديدة
| Method | Path | الصلاحية |
|---|---|---|
| GET | /api/properties?q=&type=&page= | موظف/مدير، والمالك يرى عقاراته فقط |
| GET | /api/properties/:id | نفس النطاق |
| POST | /api/properties | properties.write |
| PATCH | /api/properties/:id | properties.write |
| DELETE | /api/properties/:id (أرشفة) | properties.delete |
| POST | /api/properties/:id/images (multipart: images[]) | properties.write |
| GET | /api/owners?q= | properties.write |
| GET | /api/units?propertyId=&status= | نفس نطاق العقار |
| POST / PATCH | /api/units, /api/units/:id | units.write |
| PATCH | /api/units/:id/status | units.write |
| DELETE | /api/units/:id (أرشفة) | units.delete |

## قواعد العمل المطبقة
- TC-PRO-001/002: لا عقار بدون مالك موجود.
- TC-PRO-003: كود العقار فريد (409).
- TC-UNIT-001: الوحدة مرتبطة بعقار، ورقمها فريد داخل العقار.
- TC-UNIT-002: منع حذف وحدة مؤجرة، ومنع حذف عقار به وحدات مؤجرة.
- TC-UNIT-003: انتقالات الحالة اليدوية محددة، وحالة «مؤجرة» تُضبط من اعتماد العقد (Sprint 4)، مع سجل لكل تغيير.
- TC-RBAC-002: المالك يرى عقاراته فقط.
- SEC-007: الصور مقيدة بـ jpg/png/webp وبحد 10MB، وبأسماء ملفات عشوائية.
- الحذف أرشفة (archivedAt) وليس حذفاً نهائياً.

## شاشات Flutter الجديدة
شريط سفلي (العقارات، الوحدات، حسابي)، قائمة العقارات مع البحث والتصفية حسب النوع ونسبة الإشغال، تفاصيل العقار (الصور، المالك، الموقع، المرافق، الوحدات)، إضافة/تعديل عقار، قائمة الوحدات حسب الحالة، تفاصيل الوحدة مع تغيير الحالة وسجلها، إضافة/تعديل وحدة.

---
# Sprint 3: الملاك والمستأجرون

```bash
cd backend && npm install && npx prisma migrate dev --name sprint3 && npm run seed
cd ../mobile && flutter pub get
```

## واجهات API الجديدة
| Method | Path | الصلاحية |
|---|---|---|
| GET | /api/owners?q= · /api/owners/:id | owners.read |
| GET | /api/owners/me | المالك نفسه |
| POST / PATCH / DELETE | /api/owners, /api/owners/:id | owners.write |
| POST | /api/owners/:id/bank-accounts | owners.write |
| PATCH | /api/owners/:id/bank-accounts/:accId/primary | owners.write |
| DELETE | /api/owners/:id/bank-accounts/:accId | owners.write |
| GET | /api/tenants?q= · /api/tenants/:id | tenants.read |
| GET | /api/tenants/me | المستأجر نفسه |
| POST / PATCH / DELETE | /api/tenants, /api/tenants/:id | tenants.write |
| POST | /api/attachments (multipart: file, entityType, entityId, category) | attachments.write |
| DELETE | /api/attachments/:id (أرشفة) | attachments.write |

## قواعد العمل المطبقة
- TC-OWN-001/002: إنشاء المالك وتعديله، ولا يُحذف مالك لديه عقارات نشطة.
- TC-TEN-001/002: إنشاء المستأجر، ورفض رقم هوية مكرر (409).
- TC-TEN-003 / TC-DOC-001: رفع الهوية والمرفقات (PDF أو صورة، بحد 10MB).
- TC-DOC-002: حذف المرفق أرشفة.
- التحقق من رقم الهوية السعودية/الإقامة (Luhn) والسجل التجاري للمنشآت، وجوال 05XXXXXXXX.
- التحقق من IBAN السعودي (SA + 22 رقماً، mod-97)، ورقم الآيبان فريد، وحساب رئيسي واحد لكل مالك.
- الآيبان يظهر مخفياً (آخر 4 أرقام) لغير الموظفين.
- TC-RBAC-001: المستأجر يرى ملفه فقط عبر /tenants/me.

## شاشات Flutter الجديدة
تبويب «العملاء» (الملاك والمستأجرون مع بحث)، ملف كامل لكل منهما (البيانات، والحسابات البنكية وعقارات المالك، وتنبيه عند عدم رفع هوية المستأجر أو انتهائها، والمرفقات مع فتحها وأرشفتها)، ونموذج إضافة وتعديل لفرد أو منشأة، ونافذة إضافة حساب بنكي مع التحقق من الآيبان.

يحتاج رفع الملفات إلى أذونات الوصول للملفات والصور في Android وiOS.


## Sprint 4 — العقود

```bash
npx prisma migrate dev -n contracts && npx prisma db seed && npm test -- installments
```

| Endpoint | الصلاحية | الوصف |
|---|---|---|
| POST /contracts/preview | contracts.write | حساب الأقساط قبل الحفظ (خطوة 3 في المعالج) |
| GET /contracts?status=&propertyId=&expiringInDays=30 | مقيّد بالدور | القائمة |
| POST /contracts | contracts.write | إنشاء مسودة + توليد الأقساط |
| PATCH /contracts/:id | contracts.write | تعديل المسودة (يعيد توليد الأقساط) |
| POST /contracts/:id/submit · approve · reject · cancel · terminate · renew | حسب الإجراء | سير العمل |
| POST /contracts/jobs/daily | contracts.approve | تعليم الأقساط المتأخرة + انتهاء العقود (اربطه بـ cron) |

**قواعد العمل:** لا تداخل عقود على نفس الوحدة · الاعتماد وحده يجعل الوحدة «مؤجرة» · لا يعتمد المنشئ عقده (فصل المهام) · ضريبة 15٪ تلقائياً للوحدات التجارية · المدة أشهر كاملة · فرق التقريب في القسط الأخير · الإنهاء المبكر يلغي الأقساط المستقبلية غير المدفوعة ويحرر الوحدة.

## التشغيل في VS Code

المتطلبات: Node 20 · PostgreSQL 15 · Flutter 3.19+

```bash
cd backend
npm install
cp .env.example .env          # عدّل DATABASE_URL
npx prisma migrate dev -n init
npx prisma db seed
npm run typecheck && npm test
npm run start:dev             # أو F5 في VS Code
```
دخول تجريبي: admin@erp.local / Admin@12345

## قاعدة البيانات

**محلياً (PostgreSQL):**
```bash
docker run -d --name erp-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=erp -p 5432:5432 postgres:15
# DATABASE_URL="postgresql://postgres:postgres@localhost:5432/erp"
npx prisma migrate dev -n init && npx prisma db seed && npm run seed:demo
npx prisma studio   # تصفح الجداول
```

**سحابياً (Supabase):** أنشئ مشروعاً على supabase.com ← انسخ رابط الاتصال المباشر (5432) إلى `DATABASE_URL` ← نفّذ نفس الأوامر. الجداول تظهر في Table Editor.

**البيانات التجريبية:** 5 ملاك · 6 عقارات · 20 وحدة · 12 مستأجراً · 13 عقداً بأقساطها (مدفوعة/متأخرة/قادمة). `npm run db:reset` يعيد كل شيء.

**النموذج (Real Estate App):** يحفظ التعديلات في المتصفح تلقائياً (localStorage: `property-erp-db-v1`). لإعادة الضبط احذف المفتاح من أدوات المطوّر.

## Sprint 5 — المدفوعات والتحصيل

```bash
npx prisma migrate dev -n payments && npx prisma db seed && npm run seed:demo
```

| Endpoint | الصلاحية | الوصف |
|---|---|---|
| GET /payments/summary | مقيّد بالدور | محصّل الشهر · نسبة التحصيل · المتأخرات · الأقساط القادمة |
| GET /payments?from=&to=&contractId= | مقيّد بالدور | السندات |
| POST /payments | payments.write | تسجيل دفعة (كلية أو جزئية) + سند قبض RC-YYYY-NNNNNN |
| POST /payments/:id/void | payments.void | إلغاء سند مع السبب (لا حذف) |

**قواعد:** لا دفع يتجاوز المتبقي · رقم مرجع إلزامي للتحويل/الشيك/سداد · لا تاريخ مستقبلي · إلغاء السند يعيد القسط إلى «قادم» أو «متأخر».

**Flutter:** اضغط على قسط في تفاصيل العقد لتسجيل دفعة · أيقونة التحصيل في شريط العقود تفتح لوحة التحصيل.

## Sprint 6 — الاستلام والتسليم

```bash
npx prisma migrate dev -n handovers && npx prisma db seed
```

| Endpoint | الصلاحية | الوصف |
|---|---|---|
| GET /handovers/contract/:id | مقيّد بالدور | محاضر العقد + بنود الفحص الافتراضية |
| POST /handovers | handovers.write | حفظ/تعديل المسودة (MOVE_IN أو MOVE_OUT) |
| POST /handovers/:id/sign | المستأجر أو الموظف | توقيع (يقفل المحضر) |

**قواعد:** محضر واحد لكل نوع لكل عقد · الاستلام يتطلب عقداً سارياً · التسليم يتطلب توقيع الاستلام أولاً ويبدأ من حالته للمقارنة · الخصومات لا تتجاوز التأمين ويُحسب المسترد تلقائياً · توقيع التسليم على عقد منتهٍ يحرر الوحدة.

## Sprint 7 — الصيانة وأوامر العمل

```bash
npx prisma migrate dev -n maintenance_notifications && npx prisma db seed && npm run seed:demo
```
حسابات الفنيين التجريبية: tech1@erp.local / tech2@erp.local — كلمة المرور Tech@12345

| Endpoint | من | الوصف |
|---|---|---|
| GET /maintenance?open=true · /maintenance/stats | مقيّد بالدور | الفني يرى أوامره فقط · المستأجر بلاغاته · المالك عقاراته |
| POST /maintenance | المستأجر أو الموظف | بلاغ جديد (المستأجر: الوحدة من عقده الساري) |
| POST /maintenance/:id/assign | maintenance.write | إسناد لفني + موعد |
| POST /maintenance/:id/start · parts · complete | الفني المُسند | تنفيذ · قطع غيار · تقرير وتكلفة |
| POST /maintenance/:id/close · reopen · cancel | المستأجر أو الموظف | تأكيد + تقييم 1–5 · إعادة فتح · إلغاء |

**المهلة (SLA):** طارئة 4 س · عالية 24 س · متوسطة 72 س · منخفضة 7 أيام — تُحسب عند الإنشاء وتُعاد عند تغيير الأولوية.

## Sprint 9 — الإشعارات (داخل التطبيق)

GET /notifications · GET /notifications/unread-count · POST /notifications/:id/read · POST /notifications/read-all

تُرسل تلقائياً عند: بلاغ جديد · إسناد فني · طلب قطع · إنجاز · إغلاق وتقييم · عقد بانتظار الاعتماد · اعتماد العقد · استلام دفعة · قسط متأخر · عقد ينتهي خلال 30 يوماً (عبر المهمة اليومية). قناة Push/SMS تُضاف في `NotificationsService.notify` (Sprint 11).

**Flutter:** شريط تنقل حسب الدور — الموظف: العقارات/الوحدات/العقود/الصيانة/العملاء · الفني: أوامر العمل/الإشعارات · المستأجر: عقدي/الصيانة/الإشعارات · المالك: العقارات/العقود/الصيانة/الإشعارات.

## Sprint 8 — المهام

GET /tasks?scope=mine|created|all&status= · GET /tasks/assignees · POST /tasks · PATCH /tasks/:id (الحالة/الإسناد/الموعد)

مهمة «متابعة تجديد العقد» تُنشأ تلقائياً قبل انتهاء العقد بـ 60 يوماً وتوزّع على الموظفين بالتناوب (بدون تكرار). المهمة اليومية تعمل تلقائياً عند تشغيل الخادم ثم كل 24 ساعة — عطّلها بـ `DISABLE_SCHEDULER=true`.

## Sprint 10 — لوحات المؤشرات والتقارير

| Endpoint | الوصف |
|---|---|
| GET /reports/dashboard | الإشغال · تحصيل 12 شهراً · نسبة تحصيل الشهر · المتأخرات · عقود تنتهي 30/60/90 · الصيانة · أداء العقارات (الموظف: الكل · المالك: عقاراته) |
| GET /reports/owner-statement?ownerId=&from=&to= | التحصيلات بدون الضريبة − صيانة على المالك − عمولة الإدارة = الصافي |
| GET /reports/payments.csv?from=&to= | تصدير السندات (Excel يفتحه مباشرة بالعربية) |

```bash
npx prisma migrate dev -n tasks && npx prisma db seed
```

**Flutter:** الموظف والمالك: الرئيسية · العقارات · العقود · الصيانة · المزيد (الوحدات، العملاء، المهام، التحصيل، كشف المالك، الإشعارات، حسابي).

## Sprint 11 — التكاملات الخارجية

```bash
npx prisma migrate dev -n integrations && npx prisma db seed && npm test -- signature
```

| Endpoint | الوصف |
|---|---|
| POST /api/webhooks/gateway | استقبال أحداث بوابة الدفع — توقيع HMAC-SHA256 في `x-signature` · `payment.paid` يسجّل الدفعة على القسط `metadata.installmentId` ويصدر سند قبض تلقائياً |
| POST /api/webhooks/ejar | استقبال أحداث منصة إيجار (تُحفظ وتُعلَّم IGNORED حتى تُفعّل معالجتها) |
| GET /api/integrations/status | حالة الموصلات · إحصاء الأحداث والرسائل · آخر 20 حدثاً |
| POST /api/integrations/events/:id/retry | إعادة معالجة حدث فاشل |
| POST /api/integrations/sms/test?to=05xxxxxxxx | رسالة تجريبية |

**الضمانات:** كل حدث يُحفظ قبل المعالجة · لا تكرار (provider + eventId فريد، ومرجع الدفعة فريد) · الحدث الفاشل قابل لإعادة المحاولة · الرسائل النصية تُسجَّل في OutboundMessage (SENT / FAILED / SKIPPED) وتُرسل تلقائياً لإشعارات الدفع والعقود عند تفعيل SMS_ENABLED.

اختبار محلي للـ webhook:
```bash
BODY='{"id":"evt_1","type":"payment.paid","data":{"id":"pay_123","amount":375000,"source":{"type":"mada"},"metadata":{"installmentId":"<UUID>"}}}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$GATEWAY_WEBHOOK_SECRET" -hex | cut -d' ' -f2)
curl -X POST localhost:3000/api/webhooks/gateway -H "Content-Type: application/json" -H "x-signature: $SIG" -d "$BODY"
```

## Sprint 12 — الأمان والإطلاق

- **فحص الإعدادات عند الإقلاع** (`src/common/env.ts`): يرفض التشغيل عند غياب الأسرار أو ضعفها.
- **Request-ID** وسجل وصول منظم لكل طلب بدون بيانات شخصية.
- **/api/health** لفحص الخادم والقاعدة (للموازن وDocker).
- حد حجم الطلب 1MB · حد عام قابل للضبط `RATE_LIMIT_PER_MIN` · إيقاف آمن.
- **Docker:** `docker compose up -d --build` (قاعدة + خادم، migrate تلقائي، مستخدم غير root).
- **CI:** `.github/workflows/ci.yml` — typecheck · tests · build · seed · npm audit · flutter analyze.
- **الوثائق:** `docs/SECURITY.md` (15 ضابطاً) · `docs/UAT.md` (سيناريوهات القبول لكل دور).

## ملحق — صور الصيانة ومنصة إيجار

```bash
npx prisma migrate dev -n maintenance_photos
```
- POST /maintenance/:id/photos?stage=BEFORE|AFTER (حقل `files`، حتى 10 صور JPG/PNG/WebP، 12 لكل طلب) · DELETE /maintenance/:id/photos/:photoId
- المستأجر يرفق «قبل» عند البلاغ · الفني المُسند يرفق «بعد» · `MAINT_REQUIRE_AFTER_PHOTO=true` يمنع الإنهاء بدون صورة.
- **إيجار:** `contract.registered` يحفظ رقم التوثيق على العقد (بالمطابقة مع contractCode) ويُشعر الموظفين · `contract.terminated` يُشعر المدير لإنهاء العقد وإعداد محضر التسليم.

## النماذج المطبوعة من التطبيق

POST /api/documents/link `{ type, id, from?, to? }` ← رابط موقّع صالح 10 دقائق · GET /api/documents/view?t=… صفحة A4 عربية RTL بالشعار والتوقيع والختم، جاهزة للطباعة أو الحفظ PDF.

| النوع | id | من أين في التطبيق |
|---|---|---|
| receipt | معرّف السند | نافذة سند القبض ← «طباعة السند» |
| paymentDemand · renewalNotice · handoverIn · handoverOut | معرّف العقد | أيقونة الطباعة في تفاصيل العقد |
| maintRequest | معرّف طلب الصيانة | أيقونة الطباعة في الطلب |
| ownerStatement | معرّف المالك + from/to | أيقونة الطباعة في كشف الحساب |

الصلاحيات تُفحص عند إنشاء الرابط وعند فتحه (نفس نطاق المستخدم). ملفات الهوية في `backend/public/brand/` (logo.png · signature.png · stamp.jpg) — استبدلها بنفس الأسماء. اسم الموقّع والبنك من `DOC_SIGNER_NAME` · `COMPANY_BANK` · `COMPANY_IBAN`.

## التشغيل الإنتاجي
راجع **docs/DEPLOY.md**: HTTPS عبر Nginx + Let's Encrypt (تجديد تلقائي، HSTS) · نسخ احتياطي يومي للقاعدة مع تحقق واحتفاظ 30 يوماً + نسخ الملفات · `scripts/smoke.sh` اختبار آلي بعد كل نشر · نطاق اختبار الاختراق · المراقبة.
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```
