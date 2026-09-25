# ![Ramz Al-Ibdaa Logo](logo.png) شركة رمز الإبداع لإدارة العقارات

<div align="center">

## تطبيق إدارة العقارات الذكي

**منصة رقمية متكاملة لأتمتة وإدارة جميع العمليات العقارية**

</div>

---

## 📋 نبذة عن التطبيق

تطبيق إدارة العقارات هو منصة رقمية متكاملة تهدف إلى أتمتة وإدارة جميع العمليات العقارية من مكان واحد، حيث يربط بين إدارة الشركة والموظفين وملاك العقارات والمستأجرين والفنيين عبر نظام موحد يوفر الشفافية وسهولة التواصل وسرعة تنفيذ العمليات التشغيلية والمالية.

يعتمد النظام على بوابات دخول مستقلة لكل فئة من المستخدمين، مع صلاحيات مخصصة ولوحات تحكم تفاعلية تمكن جميع الأطراف من متابعة أعمالهم وإدارة طلباتهم بكفاءة عالية.

### 👥 الفئات المستفيدة

- **إدارة الشركة** — إدارة العقارات والموظفين والمالكين والعقود والمدفوعات
- **الموظفون** — إدارة العقارات والوحدات والعقود والصيانة والتحصيل
- **ملاك العقارات** — عرض عقاراتهم والتحصيلات وكشوف الحسابات
- **المستأجرون** — الوصول إلى عقودهم وتقديم بلاغات الصيانة والدفع
- **الفنيون** — إدارة طلبات الصيانة والقطع الغيار والتقارير

### 🎯 المتطلبات الأساسية

- ✅ بوابات دخول مستقلة لكل فئة من المستخدمين
- ✅ نظام صلاحيات مخصص حسب نوع المستخدم (RBAC)
- ✅ لوحات تحكم تفاعلية لمتابعة المهام والطلبات
- ✅ تحسين سرعة تنفيذ العمليات التشغيلية والمالية
- ✅ تعزيز الشفافية وسهولة التواصل بين جميع الأطراف
- ✅ نسخ احتياطي تلقائي وأمان مرتفع
- ✅ توقيع إلكتروني للعقود

---

## 🏗️ البنية المعمارية والتقنيات المستخدمة

```
الموبايل (Flutter)
        │
        ▼
   API Gateway
        │
   API (NestJS/Node.js)
        │
 ┌──────┼──────┬─────────┐
 ▼      ▼      ▼         ▼
 DB   Storage  AI      Auth
PostgreSQL Azure Services OAuth2
        │
        ▼
═════════════════════════════
  البوابات الإلكترونية (React)
═════════════════════════════
│ الإدارة │ الموظفون │ الملاك │ المستأجرون │ الفنيون │
```

### 1️⃣ تطبيقات المستخدمين (الواجهة الأمامية)

#### 📱 تطبيق الجوال — **Flutter**
- ✅ يعمل على Android و iPhone من قاعدة برمجية واحدة
- ✅ أداء سريع وواجهات حديثة
- ✅ دعم RTL (اللغة العربية)
- ✅ تطبيقات منفصلة لكل فئة (موظف، فني، مالك، مستأجر)

**الحالة:** مطور (Sprint 1-3)

---

### 2️⃣ لوحات التحكم والبوابات الإلكترونية

#### 🖥️ الويب — **React.js**
- ✅ بوابة الإدارة (Admin Portal) — إدارة كاملة للنظام
- ✅ بوابة الموظفين (Employee Portal) — إدارة العقارات والعقود والصيانة
- ✅ بوابة الملاك (Owner Portal) — عرض الأملاك والتحصيلات
- ✅ بوابة المستأجرين (Tenant Portal) — عرض العقود والدفع والصيانة
- ✅ بوابة الفنيين (Technician Portal) — إدارة أوامر العمل

**الميزات:**
- سرعة عالية وسهولة التوسع
- واجهات احترافية وتفاعلية
- دعم RTL كامل
- محمول وسطح مكتب

**الحالة:** مخطط (Sprint 10+)

---

### 3️⃣ الخادم الخلفي (Backend)

#### 🔧 **NestJS + Node.js** (الخيار الحالي)
- ✅ سريع وقابل للتطوير
- ✅ يدعم عدد كبير من المستخدمين
- ✅ معمارية نظيفة وقابلة للاختبار
- ✅ تكامل سهل مع الخدمات الخارجية

**الميزات المطبقة:**
- نظام مصادقة OTP + MFA
- إدارة الأدوار والصلاحيات (RBAC)
- تسجيل شامل (Audit Log)
- معالجة الأخطاء الموحدة
- التحقق من البيانات

**الحالة:** قيد التطوير (Sprint 1-12)

#### 🔄 **ASP.NET Core** (خيار بديل للشركات الكبيرة)
- للشركات التي تتطلب تكاملاً مع أنظمة Microsoft
- أمان مرتفع
- أداء عالية جداً

---

### 4️⃣ قاعدة البيانات

#### 🗄️ **PostgreSQL** (المختار حالياً)
- ✅ قوية ومستقرة
- ✅ مناسبة للبيانات المالية والعقارية
- ✅ دعم الحركات (Transactions)
- ✅ دعم JSON والبيانات المعقدة
- ✅ النسخ الاحتياطي السهل

**الهجرات:**
- Sprint 1: المستخدمون والمصادقة
- Sprint 2: العقارات والوحدات
- Sprint 3: الملاك والمستأجرون
- Sprint 4: العقود والأقساط
- Sprint 5: المدفوعات
- Sprint 6: الاستلام والتسليم
- Sprint 7: الصيانة

**الحالة:** قيد التطوير

---

### 5️⃣ التخزين السحابي

#### ☁️ **Azure Storage** / **AWS S3** / **Supabase Storage**
- حفظ العقود (PDF)
- الصور والتصاميم المعمارية
- المرفقات والوثائق
- التقارير والكشوفات

**الحالة:** مخطط (Sprint 11+)

---

### 6️⃣ الخرائط والمواقع

#### 🗺️ **Google Maps API**
- تحديد مواقع العقارات
- عرض العقارات على الخريطة
- حساب المسافات والمسارات
- البحث الجغرافي

**الحالة:** مخطط (Sprint 10+)

---

### 7️⃣ الإشعارات

#### 🔔 **Firebase Cloud Messaging (FCM)** / **SendGrid**
- إشعارات الجوال (Push Notifications)
- تنبيهات العقود (التجديد والانتهاء)
- تنبيهات الصيانة والأولويات
- رسائل البريد الإلكتروني
- رسائل نصية قصيرة (SMS)

**الحالة:** مخطط (Sprint 11+)

---

### 8️⃣ الدفع الإلكتروني

#### 💳 **بوابات الدفع المدعومة:**

**المحليات:**
- مدى Mada
- STC Pay
- Payfort (للمنطقة العربية)

**العالمية:**
- Visa / Mastercard
- Apple Pay
- Google Pay

**موفري التكامل:**
- HyperPay
- Moyasar
- PayTabs
- 2Checkout

**الميزات:**
- دفع كامل أو جزئي
- حفظ بطاقات العملاء (Tokenization)
- إعادة المحاولة التلقائية
- التحويلات البنكية
- التحويلات بين الحسابات

**الحالة:** مخطط (Sprint 5-11)

---

### 9️⃣ التوقيع الإلكتروني

#### ✍️ **التوقيع الإلكتروني للعقود**
- توقيع رقمي آمن على العقود
- الربط مع منصة إيجار (ejar.sa) مستقبلاً
- اعتماد العقود رقمياً
- سجل تاريخي كامل للتوقيعات

**الخدمات المدعومة:**
- Adobe Sign
- DocuSign
- توقيع محلي مشفر

**الحالة:** مخطط (Sprint 4-12)

---

### 🔟 الذكاء الاصطناعي والتحليلات

#### 🤖 **الميزات المخطط إضافتها:**
- **مساعد ذكي** للإجابة على استفسارات العملاء (Chatbot)
- **تحليل نسب الإشغال** وتوقع الطلب على الوحدات
- **توقع العقود المنتهية** وإرسال تنبيهات قبل الانتهاء
- **تحليل الإيرادات والمصروفات** بنمط شهري/سنوي
- **إنشاء تقارير تلقائية** (PDF) بناءً على البيانات
- **تنبيهات الصيانة الذكية** بناءً على الأنماط التاريخية
- **توقع المتأخرات** ونسب التحصيل

**المنصات:**
- ChatGPT API
- Azure AI / Cognitive Services
- TensorFlow للتنبؤات

**الحالة:** مخطط (Sprint 13+)

---

### 🔐 الأمان والمصادقة

#### 🛡️ **معايير الأمان المطبقة:**
- ✅ تسجيل دخول عبر OTP (One-Time Password)
- ✅ المصادقة الثنائية (2FA) اختيارية
- ✅ تشفير البيانات (AES-256)
- ✅ تشفير كلمات المرور (bcrypt)
- ✅ صلاحيات متعددة المستويات (RBAC)
- ✅ نسخ احتياطي تلقائي يومي
- ✅ سجل تدقيق شامل (Audit Log)
- ✅ حد المحاولات الفاشلة (Brute Force Protection)
- ✅ التحقق من رقم الهوية السعودية/الإقامة
- ✅ التحقق من IBAN السعودي

**الحالة:** قيد التطوير

---

## 🚀 التقنيات المستخدمة

### Backend Stack
```
┌─────────────────────────────────────┐
│         NestJS + TypeScript         │
│  Node.js Runtime (LTS - v20+)       │
├─────────────────────────────────────┤
│ Prisma ORM | PostgreSQL             │
│ JWT & OAuth2 | Passport.js          │
│ Class-validator | Compression       │
│ Winston Logger | Error Handling     │
├─────────────────────────────────────┤
│ Jest | Supertest (Testing)          │
│ ESLint | Prettier (Code Quality)    │
├─────────────────────────────────────┤
│ Docker | Docker Compose             │
│ GitHub Actions | CI/CD              │
└─────────────────────────────────────┘
```

### Frontend Stack
```
┌─────────────────────────────────────┐
│      React.js + TypeScript (Web)    │
│     Flutter + Dart (Mobile)         │
├─────────────────────────────────────┤
│ Material-UI / Flutter Material      │
│ RTL Support | Responsive Design     │
├─────────────────────────────────────┤
│ Axios / HTTP Client                 │
│ Redux / State Management            │
│ React Router / Navigation           │
├─────────────────────────────────────┤
│ Vitest | React Testing Library      │
│ ESLint | Prettier                   │
└─────────────────────────────────────┘
```

### Database & Storage
```
┌─────────────────────────────────────┐
│    PostgreSQL 15+ (Primary DB)      │
│  Prisma Migrations & Schema         │
├─────────────────────────────────────┤
│  Azure Storage / AWS S3 (Files)     │
│  Redis (Caching) - Future           │
├─────────────────────────────────────┤
│  Automated Daily Backups            │
│  Point-in-time Recovery             │
└─────────────────────────────────────┘
```

### External Integrations
```
┌─────────────────────────────────────┐
│    Google Maps API (Geolocation)    │
│  Firebase Cloud Messaging (Push)    │
│  Payment Gateways (HyperPay, etc)   │
│  SMS Services (Twilio / Local)      │
│  Email Services (SendGrid)          │
│  Digital Signature (Adobe Sign)     │
│  ejar.sa (Real Estate Registry)     │
└─────────────────────────────────────┘
```

---

## 📦 المحتوى والملفات

```
Ramz-Al-Ibdaa/
├── backend/                          # خادم NestJS
│   ├── src/
│   │   ├── auth/                    # المصادقة و OTP
│   │   ├── users/                   # إدارة المستخدمين و RBAC
│   │   ├── properties/              # العقارات والوحدات
│   │   ├── contracts/               # العقود والأقساط
│   │   ├── payments/                # الدفع والتحصيل
│   │   ├── maintenance/             # الصيانة وأوامر العمل
│   │   ├── tenants/                 # المستأجرون
│   │   ├── owners/                  # الملاك
│   │   ├── reports/                 # التقارير واللوحات
│   │   ├── integrations/            # التكاملات الخارجية
│   │   ├── common/                  # Utilities و Guards
│   │   └── database/                # Prisma Schema
│   ├── test/                        # اختبارات العمل
│   ├── .github/workflows/           # CI/CD Pipeline
│   ├── docker-compose.yml           # تطوير محلي
│   ├── .env.example
│   └── package.json
├── mobile/                           # تطبيق Flutter
│   ├── lib/
│   │   ├── screens/                 # الشاشات حسب الدور
│   │   ├── widgets/                 # المكونات المشتركة
│   │   ├── services/                # التكامل مع API
│   │   ├── models/                  # نماذج البيانات
│   │   └── providers/               # State Management
│   ├── assets/
│   ├── pubspec.yaml
│   └── android/ / ios/              # تكوين المنصات
├── web/                             # (مخطط) React Portals
│   ├── admin/                       # بوابة الإدارة
│   ├── employee/                    # بوابة الموظفين
│   ├── owner/                       # بوابة الملاك
│   ├── tenant/                      # بوابة المستأجرين
│   └── technician/                  # بوابة الفنيين
├── docs/
│   ├── SECURITY.md                  # معايير الأمان
│   ├── DEPLOY.md                    # نشر إنتاجي
│   ├── UAT.md                       # سيناريوهات الاختبار
│   ├── API.md                       # توثيق API
│   └── ARCHITECTURE.md              # البنية المعمارية
└── README.md                         # هذا الملف
```

---

## 🔧 تشغيل الـ Backend

```bash
cd backend
cp .env.example .env        # عدّل DATABASE_URL والأسرار
npm install
npx prisma migrate dev --name init
npm run seed                # أدوار + صلاحيات + مستخدم admin
npm run start:dev           # http://localhost:3000/api
```

**مستخدم تجريبي:** `admin@erp.local` / `Admin@12345`  
**رمز OTP يُطبع في سجل الخادم** (أضف مزود SMS في Sprint 11)

---

## 📱 تشغيل تطبيق Flutter

```bash
cd mobile
flutter create . --platforms=android,ios   # يولّد مجلدات المنصات فقط
flutter pub get
flutter run --dart-define=API_URL=http://10.0.2.2:3000/api
```

---

## 📡 واجهات API الأساسية

### المصادقة
| Method | Path | Auth | الوصف |
|---|---|---|---|
| POST | /api/auth/login | — | إدخال رقم الهوية + كلمة المرور |
| POST | /api/auth/verify-otp | — | التحقق من رمز OTP |
| POST | /api/auth/refresh | — | تحديث التوكن |
| POST | /api/auth/logout | Bearer | تسجيل الخروج |
| POST | /api/auth/forgot-password | — | استعادة كلمة المرور |
| POST | /api/auth/reset-password | — | إعادة تعيين كلمة المرور |
| POST | /api/auth/change-password | Bearer | تغيير كلمة المرور |

### المستخدمون
| Method | Path | Auth | الوصف |
|---|---|---|---|
| GET | /api/users/me | Bearer | الملف الشخصي |
| GET | /api/users | Bearer + users.read | قائمة المستخدمين |
| POST | /api/users | Bearer + users.write | إضافة مستخدم |
| PATCH | /api/users/:id | Bearer + users.write | تعديل مستخدم |
| DELETE | /api/users/:id | Bearer + users.delete | حذف مستخدم (أرشفة) |

### العقارات والوحدات
| Method | Path | الصلاحية | الوصف |
|---|---|---|---|
| GET | /api/properties?q=&type=&page= | properties.read | قائمة العقارات |
| POST | /api/properties | properties.write | إضافة عقار |
| GET | /api/properties/:id | properties.read | تفاصيل العقار |
| PATCH | /api/properties/:id | properties.write | تعديل العقار |
| DELETE | /api/properties/:id | properties.delete | حذف العقار (أرشفة) |
| POST | /api/units | units.write | إضافة وحدة |
| GET | /api/units?propertyId= | units.read | قائمة الوحدات |

### العقود والأقساط
| Method | Path | الصلاحية | الوصف |
|---|---|---|---|
| GET | /api/contracts | contracts.read | قائمة العقود |
| POST | /api/contracts | contracts.write | إنشاء عقد |
| POST | /api/contracts/:id/approve | contracts.approve | اعتماد العقد |
| POST | /api/contracts/:id/submit | contracts.write | تقديم العقد للاعتماد |
| GET | /api/contracts/:id | contracts.read | تفاصيل العقد |

### الدفع والتحصيل
| Method | Path | الصلاحية | الوصف |
|---|---|---|---|
| GET | /api/payments/summary | payments.read | ملخص التحصيل |
| GET | /api/payments | payments.read | قائمة السندات |
| POST | /api/payments | payments.write | تسجيل دفعة |
| POST | /api/payments/:id/void | payments.void | إلغاء السند |

### الصيانة
| Method | Path | الصلاحية | الوصف |
|---|---|---|---|
| GET | /api/maintenance | maintenance.read | قائمة البلاغات |
| POST | /api/maintenance | maintenance.write | بلاغ جديد |
| POST | /api/maintenance/:id/assign | maintenance.write | إسناد فني |
| POST | /api/maintenance/:id/complete | maintenance.write | إنهاء البلاغ |

---

## 🛠️ تشغيل قاعدة البيانات

### محلياً (PostgreSQL):
```bash
docker run -d --name erp-db \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=erp \
  -p 5432:5432 \
  postgres:15

# في .env:
# DATABASE_URL="postgresql://postgres:postgres@localhost:5432/erp"

npx prisma migrate dev -n init
npx prisma db seed
npm run seed:demo      # بيانات تجريبية غنية
```

### سحابياً (Supabase):
```bash
# 1. أنشئ مشروع على supabase.com
# 2. انسخ رابط الاتصال إلى DATABASE_URL
# 3. نفّذ:
npx prisma migrate dev -n init
npx prisma db seed
```

### استعراض البيانات:
```bash
npx prisma studio   # واجهة رسومية في المتصفح
```

---

## 📊 البيانات التجريبية

```bash
npm run seed:demo
```

يتضمن:
- 5 ملاك
- 6 عقارات متنوعة
- 20 وحدة سكنية
- 12 مستأجر
- 13 عقد مع أقساط (مدفوعة/متأخرة/قادمة)
- 3 موظفين بأدوار مختلفة
- 2 فني صيانة
- 50+ بلاغ صيانة

---

## ✅ حالات الاختبار المغطاة

- **TC-AUTH-001/002/003**: المصادقة والمفاتيح
- **TC-PRO-001/002/003**: العقارات والتحقق
- **TC-UNIT-001/002/003**: الوحدات والحالات
- **TC-OWN-001/002**: الملاك وحماية البيانات
- **TC-TEN-001/002/003**: المستأجرون والمرفقات
- **TC-DOC-001/002**: المستندات والحذف الآمن
- **TC-RBAC-001/002/003/004**: الأدوار والصلاحيات
- **SEC-003/004/005/006/007**: الأمان والتشفير

---

## 🚢 التشغيل الإنتاجي

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

**راجع وثائق التشغيل الكاملة في:** `docs/DEPLOY.md`

### المتطلبات الإنتاجية:
- HTTPS عبر Nginx + Let's Encrypt
- تجديد شهادة SSL تلقائي
- HSTS (HTTP Strict Transport Security)
- نسخ احتياطي يومي للقاعدة (30 يوم احتفاظ)
- نسخة ساخنة (Hot Standby)
- مراقبة الصحة والأداء
- Logging و Error Tracking

---

## 📅 خريطة الطريق والمراحل

```
Sprint 1  ✅ المصادقة و RBAC
Sprint 2  ✅ العقارات والوحدات
Sprint 3  ✅ الملاك والمستأجرون
Sprint 4  🔄 العقود والأقساط
Sprint 5  🔄 المدفوعات والتحصيل
Sprint 6  🔄 الاستلام والتسليم
Sprint 7  🔄 الصيانة وأوامر العمل
Sprint 8  🔄 المهام والتخطيط
Sprint 9  🔄 الإشعارات (في التطبيق)
Sprint 10 📋 لوحات المؤشرات والتقارير
Sprint 11 📋 التكاملات الخارجية (Webhooks، SMS)
Sprint 12 📋 الأمان والإطلاق
Sprint 13 🔮 الذكاء الاصطناعي والتحليلات
```

**🟢 جاهز** | **🟡 قيد التطوير** | **🟠 مخطط** | **⚫ مستقبلي**

---

## 📚 الوثائق الإضافية

- **[API Documentation](docs/API.md)** — توثيق جميع نقاط الاتصال
- **[Security Policy](docs/SECURITY.md)** — 15 ضابطاً أمنياً
- **[Deployment Guide](docs/DEPLOY.md)** — نشر آمن وموثوق
- **[UAT Scenarios](docs/UAT.md)** — سيناريوهات القبول لكل دور
- **[Architecture](docs/ARCHITECTURE.md)** — البنية المعمارية التفصيلية

---

## 🤝 المساهمة

نرحب بالمساهمات! يرجى:

1. Fork المستودع
2. إنشاء فرع `feature/your-feature`
3. Commit التغييرات مع رسائل واضحة
4. Push إلى الفرع
5. فتح Pull Request

---

## 📞 التواصل والدعم

- **البريد الإلكتروني**: support@ramzalibdaa.sa
- **الموقع**: https://ramzalibdaa.sa
- **المشاكل والاقتراحات**: [GitHub Issues](https://github.com/Afayashi/Ramz-Al-Ibdaa/issues)

---

## 📄 الترخيص

هذا المشروع مرخص تحت [MIT License](LICENSE)

---

<div align="center">

**شركة رمز الإبداع لإدارة العقارات © 2024**

تم بناء هذا التطبيق بـ ❤️ بواسطة فريق متخصص في إدارة العقارات الذكية

</div>
