# ابدأ هنا — Property ERP في VS Code

## المتطلبات
Node.js 20 · Docker Desktop · Flutter 3.19+ (مع Android Studio أو Xcode) · VS Code

## الفتح
1. فك الضغط ثم: **File → Open Workspace from File… → `property-erp.code-workspace`**
2. وافق على تثبيت الإضافات المقترحة (Prisma · Flutter · Docker · REST Client).

## التشغيل لأول مرة — من **Terminal → Run Task**
| الترتيب | المهمة |
|---|---|
| 1 | DB: start PostgreSQL (Docker) |
| 2 | Backend: install |
| — | انسخ `backend/.env.example` إلى `backend/.env` وضع `DATABASE_URL=postgresql://erp:change-me-db@localhost:5432/erp` و `JWT_ACCESS_SECRET` (32 حرفاً على الأقل) |
| 3 | Backend: migrate + seed + demo |
| 4 | Backend: dev server ← الخادم على http://localhost:3000/api |
| — | Mobile: pub get |

ثم **Run and Debug (F5) → «Full stack (API + Android)»** لتشغيل الخادم والتطبيق معاً.

## الحسابات التجريبية
admin@erp.local / Admin@12345 · tech1@erp.local / Tech@12345

## هيكل المشروع
```
backend/            NestJS + Prisma + PostgreSQL
  prisma/           schema.prisma · seed.ts · seed-demo.ts
  src/              auth · properties · units · owners · tenants · contracts · payments · handovers
                    maintenance · tasks · notifications · reports · integrations · documents · health
  public/brand/     الشعار والتوقيع والختم (للنماذج المطبوعة)
mobile/lib/         Flutter — core (api · router · shell · theme · documents) + features/*
deploy/             nginx · backup · restore
docs/               SECURITY.md · UAT.md · DEPLOY.md
api.http            طلبات جاهزة للتجربة من VS Code
```

## أثناء التطوير
- تعديل الجداول: عدّل `schema.prisma` ← `npx prisma migrate dev -n وصف_التغيير`
- تصفح البيانات: مهمة **Backend: Prisma Studio**
- قبل كل رفع: مهمتا **Backend: typecheck** و **Backend: tests** و **Mobile: analyze** (نفسها تعمل في GitHub Actions)
- التفاصيل الكاملة لكل Sprint ونقاط النهاية في `README.md`
