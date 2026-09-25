# تطبيق إدارة العقارات الذكي

## نبذة عن التطبيق

تطبيق إدارة العقارات هو منصة رقمية متكاملة تهدف إلى أتمتة وإدارة جميع العمليات العقارية من مكان واحد، حيث يربط بين إدارة الشركة والموظفين وملاك العقارات والمستأجرين والفنيين عبر نظام موحد يوفر الشفافية وسهولة التواصل وسرعة تنفيذ العمليات التشغيلية والمالية.

يعتمد النظام على بوابات دخول مستقلة لكل فئة من المستخدمين، مع صلاحيات مخصصة ولوحات تحكم تفاعلية تمكن جميع الأطراف من متابعة أعمالهم وإدارة طلباتهم بكفاءة عالية.

## الفئات المستفيدة

- إدارة الشركة
- الموظفون
- ملاك العقارات
- المستأجرون
- الفنيون

## المتطلبات الأساسية

- بوابات دخول مستقلة لكل فئة من المستخدمين
- نظام صلاحيات مخصص حسب نوع المستخدم
- لوحات تحكم تفاعلية لمتابعة المهام والطلبات
- تحسين سرعة تنفيذ العمليات التشغيلية والمالية
- تعزيز الشفافية وسهولة التواصل بين جميع الأطراف

## الاختبارات

- تثبيت Node.js (الإصدار 20.17 أو أحدث)
- تشغيل الاختبارات:

```bash
npm test
```

## قاعدة البيانات

- المشروع يستخدم قاعدة بيانات SQLite حقيقية.
- تهيئة القاعدة وإنشاء الجداول الأساسية:

```bash
npm run db:init
```

- مسار ملف القاعدة الناتج:
  - `data/property_management.db`

## تشغيل الخادم الخلفي

```bash
npm run db:init
npm start
```

## الأمان المطبق

- تشفير كلمات المرور باستخدام BCrypt.
- مصادقة JWT بعد التحقق بخطوتين (2FA code).
- تشفير البيانات الحساسة المخزنة (مثل الهوية والحساب البنكي) باستخدام AES-256-GCM.
- حماية API عبر:
  - API Key (`x-api-key`)
  - JWT access token
  - Rate Limiting
- تسجيل العمليات الأمنية في `audit_logs`.

## مسارات التنقل (Navigation Flow)

- نقطة البداية: Splash → Login → توجيه حسب الدور.
- بوابات مدعومة: الإدارة، الموظف، المالك، المستأجر، الفني.
- يمكن جلب مخطط التنقل الكامل عبر:

```http
GET /navigation/flow
```

مع تمرير:
- `x-api-key`
- `Authorization` header مع bearer token

ولإرجاع المسار الخاص بدور المستخدم فقط:

```http
GET /navigation/portal
```

## OAuth 2.0 (مبدئي وعملي)

- يدعم endpoint التالي:

```http
POST /auth/oauth/token
```

- `grant_type=password`:
  - الخطوة 1: إرسال `username` و`password` وسيُعاد `two_factor_required` مع `challenge_id`.
  - الخطوة 2: إعادة الطلب مع `challenge_id` و`otp_code` للحصول على `access_token`.

- `grant_type=client_credentials`:
  - يتطلب `client_id` و`client_secret` (من متغيرات البيئة `OAUTH_CLIENT_ID` و`OAUTH_CLIENT_SECRET`).

## تدفقات العمليات المترابطة (End-to-End)

- تدفق العقود:
  - `POST /employees/contracts` (إنشاء عقد بحالة pending_approval)
  - `PATCH /management/contracts/:id/approve` (اعتماد الإدارة)
  - `PATCH /tenants/contracts/:id/sign` (توقيع المستأجر)
  - `PATCH /employees/contracts/:id/activate` (تفعيل العقد وإشعارات المالك/المستأجر)

- تدفق الصيانة:
  - `POST /tenants/maintenance-requests` (إنشاء طلب)
  - `POST /employees/maintenance-requests/:id/assign-technician` (تعيين فني + أمر عمل)
  - `PATCH /technicians/work-orders/:id` (in_progress / completed + تقرير)
  - `PATCH /employees/maintenance-requests/:id/approve-completion` (اعتماد الإغلاق + إشعارات)
  - `POST /tenants/maintenance-requests/:id/rating` (تقييم الخدمة بعد الإغلاق)

## الإشعارات والتقارير

- الإشعارات:
  - `GET /me/notifications` (جلب إشعارات المستخدم الحالي)
  - `PATCH /me/notifications/:id/read` (تعليم الإشعار كمقروء)

- التقارير (للإدارة):
  - `GET /reports/occupancy` (نسبة الإشغال والوحدات الشاغرة)
  - `GET /reports/contracts-summary` (ملخص حالات العقود)
  - `GET /reports/financial-summary` (الإيرادات، المصروفات، وصافي الدخل)

## Dashboard APIs حسب الدور

- `GET /dashboard/management` (للإدارة)
- `GET /dashboard/employee` (للموظف)
- `GET /dashboard/owner` (للمالك)
- `GET /dashboard/tenant` (للمستأجر)
- `GET /dashboard/technician` (للفني)
- `GET /dashboard/me` (يرجع لوحة الدور الحالي تلقائياً)

## إدارة الصلاحيات (RBAC Permissions)

- `GET /admin/permissions` (قائمة جميع الصلاحيات المتاحة)
- `GET /admin/roles/:roleName/permissions` (عرض صلاحيات دور محدد)
- `POST /admin/roles/:roleName/permissions` (إسناد صلاحيات إضافية لدور محدد)

مثال body:

```json
{
  "permissions": ["notifications:read:self"]
}
```
