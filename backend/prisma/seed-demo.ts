// بيانات تجريبية واقعية (~20 سجل لكل كيان رئيسي). التشغيل: npm run seed:demo (بعد npx prisma db seed)
import { PrismaClient, PropertyType, UnitType, PaymentFrequency } from '@prisma/client';
import { planInstallments, contractMonths } from '../src/contracts/installments';
const prisma = new PrismaClient();
const D = (s: string) => new Date(s + 'T00:00:00Z');

const OWNERS = [
  ['عبدالله العتيبي', '1023456781', '0501234561', 'الرياض'],
  ['شركة الجوهرة للاستثمار', '7001234567', '0112345678', 'الرياض'],
  ['خالد العنزي', '1034567892', '0552345672', 'جدة'],
  ['نورة الشهري', '1045678903', '0563456783', 'مكة'],
  ['فيصل الحربي', '1056789014', '0544567894', 'الدمام'],
] as const;

const PROPS: [string, string, PropertyType, number, string, string][] = [
  ['PR-0001', 'برج النخيل السكني', 'TOWER', 0, 'الرياض', 'العليا'],
  ['PR-0002', 'مجمع الواحة', 'COMPOUND', 0, 'الرياض', 'الملقا'],
  ['PR-0003', 'برج الجوهرة التجاري', 'OFFICE_BUILDING', 1, 'الرياض', 'الورود'],
  ['PR-0004', 'عمارة الصفا', 'APARTMENT_BUILDING', 3, 'مكة', 'العزيزية'],
  ['PR-0005', 'مجمع النخيل', 'COMPOUND', 2, 'جدة', 'الشاطئ'],
  ['PR-0006', 'مستودعات السلي', 'WAREHOUSE', 4, 'الدمام', 'الصناعية الثانية'],
];

// [propIdx, number, type, floor, area, rooms, rent]
const UNITS: [number, string, UnitType, number, number, number, number][] = [
  [0, 'A-101', 'APARTMENT', 1, 138, 3, 68000], [0, 'A-204', 'APARTMENT', 2, 142, 3, 72000], [0, 'A-305', 'APARTMENT', 3, 165, 4, 85000], [0, 'A-402', 'STUDIO', 4, 55, 1, 36000],
  [1, 'V-01', 'VILLA', 0, 320, 5, 145000], [1, 'V-07', 'VILLA', 0, 300, 5, 138000], [1, '12', 'APARTMENT', 1, 120, 3, 45000], [1, '14', 'APARTMENT', 1, 120, 3, 45000],
  [2, 'O-501', 'OFFICE', 5, 120, 0, 110000], [2, 'O-502', 'OFFICE', 5, 95, 0, 90000], [2, 'S-01', 'SHOP', 0, 80, 0, 160000], [2, 'S-02', 'SHOP', 0, 65, 0, 130000],
  [3, '1', 'APARTMENT', 1, 110, 3, 40000], [3, '2', 'APARTMENT', 1, 110, 3, 40000], [3, '5', 'APARTMENT', 2, 130, 4, 48000],
  [4, 'B-110', 'APARTMENT', 1, 125, 3, 55000], [4, 'B-207', 'APARTMENT', 2, 125, 3, 55000], [4, 'B-301', 'APARTMENT', 3, 150, 4, 62000],
  [5, 'W-1', 'WAREHOUSE', 0, 1200, 0, 180000], [5, 'W-2', 'WAREHOUSE', 0, 900, 0, 140000],
];

const TENANTS = [
  ['سارة الدوسري', '1098765431', '0509876541', '2029-03-01', 'أرامكو'], ['فهد المطيري', '1087654322', '0558765432', '2027-11-15', 'STC'],
  ['نورة القحطاني', '1076543213', '0567654323', '2028-06-20', 'وزارة التعليم'], ['عبدالله الحربي', '1065432104', '0546543214', '2027-01-10', 'سابك'],
  ['محمد العتيبي', '1054321095', '0535432105', '2030-02-28', 'بنك الراجحي'], ['ريم القاسم', '1043210986', '0524321096', '2028-09-09', 'مستشفى الملك فيصل'],
  ['شركة الأفق للتقنية', '7009876543', '0114567890', null, null], ['مؤسسة الريادة التجارية', '7008765432', '0126789012', null, null],
  ['أحمد الزهراني', '2432109877', '0503210987', '2027-05-05', 'الخطوط السعودية'], ['هند السبيعي', '1021098768', '0552109878', '2029-12-12', 'جامعة الملك سعود'],
  ['شركة الإمداد اللوجستية', '7007654321', '0138901234', null, null], ['ماجد الغامدي', '1010987659', '0561098769', '2028-04-04', 'المراعي'],
];

// [unitNumber, tenantIdx, start, end, freq, status]
const CONTRACTS: [string, number, string, string, PaymentFrequency, 'ACTIVE' | 'DRAFT' | 'PENDING_APPROVAL' | 'EXPIRED'][] = [
  ['A-101', 0, '2026-01-01', '2026-12-31', 'QUARTERLY', 'ACTIVE'], ['A-204', 1, '2025-11-01', '2026-10-31', 'MONTHLY', 'ACTIVE'],
  ['12', 2, '2025-08-01', '2026-07-31', 'QUARTERLY', 'EXPIRED'], ['14', 3, '2026-03-01', '2027-02-28', 'SEMI_ANNUAL', 'ACTIVE'],
  ['V-01', 4, '2026-02-01', '2027-01-31', 'ANNUAL', 'ACTIVE'], ['O-501', 6, '2026-01-01', '2027-12-31', 'QUARTERLY', 'ACTIVE'],
  ['S-01', 7, '2025-10-01', '2026-09-30', 'QUARTERLY', 'ACTIVE'], ['1', 8, '2026-06-01', '2027-05-31', 'MONTHLY', 'ACTIVE'],
  ['B-110', 9, '2026-04-01', '2027-03-31', 'QUARTERLY', 'ACTIVE'], ['B-207', 5, '2025-12-01', '2026-11-30', 'MONTHLY', 'ACTIVE'],
  ['W-1', 10, '2026-01-01', '2028-12-31', 'SEMI_ANNUAL', 'ACTIVE'], ['A-305', 11, '2026-11-01', '2027-10-31', 'QUARTERLY', 'PENDING_APPROVAL'],
  ['5', 11, '2026-10-01', '2027-09-30', 'QUARTERLY', 'DRAFT'],
];

async function main() {
  const admin = await prisma.user.findFirstOrThrow({ where: { email: 'admin@erp.local' } });
  const owners = [];
  for (const [fullName, nationalId, phone, city] of OWNERS)
    owners.push(await prisma.owner.upsert({ where: { nationalId }, update: {}, create: { fullName, nationalId, phone, city, kind: nationalId.startsWith('7') ? 'COMPANY' : 'INDIVIDUAL' } }));
  await prisma.bankAccount.createMany({ skipDuplicates: true, data: owners.map((o, i) => ({ ownerId: o.id, bankName: ['الراجحي', 'الأهلي', 'الرياض', 'الإنماء', 'البلاد'][i], holderName: o.fullName, iban: 'SA03800000000608010' + String(16750 + i).padStart(5, '0'), isPrimary: true })) });

  const props = [];
  for (const [code, name, type, oi, city, district] of PROPS)
    props.push(await prisma.property.upsert({ where: { code }, update: {}, create: { code, name, type, ownerId: owners[oi].id, city, district, deedNumber: '3' + code.slice(3) + '0077' + oi, amenities: ['مواقف', 'أمن 24/7'] } }));

  const units: Record<string, any> = {};
  for (const [pi, number, type, floor, area, rooms, annualRent] of UNITS)
    units[number] = await prisma.unit.upsert({ where: { propertyId_number: { propertyId: props[pi].id, number } }, update: {},
      create: { propertyId: props[pi].id, number, type, floor, area, rooms, bathrooms: Math.max(1, rooms - 1), annualRent } });

  const tenants = [];
  for (const [fullName, nationalId, phone, idExpiry, employer] of TENANTS)
    tenants.push(await prisma.tenant.upsert({ where: { nationalId }, update: {}, create: { fullName, nationalId, phone, employer, nationality: nationalId.startsWith('2') ? 'مقيم' : 'سعودي', idExpiry: idExpiry ? D(idExpiry) : null, kind: nationalId.startsWith('7') ? 'COMPANY' : 'INDIVIDUAL' } }));

  let n = 0;
  for (const [un, ti, start, end, frequency, status] of CONTRACTS) {
    const code = 'CT-2026-' + String(++n).padStart(5, '0');
    if (await prisma.contract.findUnique({ where: { code } })) continue;
    const u = units[un], s = D(start), e = D(end);
    const vatPct = ['SHOP', 'OFFICE', 'WAREHOUSE'].includes(u.type) ? 15 : 0;
    const plan = planInstallments(s, contractMonths(s, e), Number(u.annualRent), frequency, vatPct);
    const today = new Date();
    await prisma.contract.create({ data: {
      code, unitId: u.id, tenantId: tenants[ti].id, startDate: s, endDate: e, annualRent: u.annualRent, frequency, vatPct, deposit: Number(u.annualRent) / 12,
      status, createdById: admin.id, ...(status === 'ACTIVE' || status === 'EXPIRED' ? { approvedById: admin.id, approvedAt: s } : {}),
      installments: { create: plan.map((p, i) => {
        const past = status !== 'DRAFT' && status !== 'PENDING_APPROVAL' && p.dueDate < today;
        const late = past && (ti === 1 || ti === 5) && i >= plan.findIndex(x => x.dueDate < today && x.dueDate > new Date(today.getTime() - 90 * 864e5));
        return { ...p, status: late ? 'OVERDUE' : past ? 'PAID' : 'PENDING', paidAmount: past && !late ? p.total : 0, paidAt: past && !late ? p.dueDate : null };
      }) },
    } });
    if (status === 'ACTIVE') await prisma.unit.update({ where: { id: u.id }, data: { status: 'RENTED' } });
  }
  const paidInst = await prisma.installment.findMany({ where: { status: 'PAID', payments: { none: {} } }, orderBy: { paidAt: 'asc' } });
  let rc = await prisma.payment.count();
  for (const [k, i] of paidInst.entries())
    await prisma.payment.create({ data: { receiptNo: 'RC-2026-' + String(++rc).padStart(6, '0'), contractId: i.contractId, installmentId: i.id, amount: i.total,
      method: (['BANK_TRANSFER', 'MADA', 'SADAD', 'CASH'] as const)[k % 4], reference: k % 4 === 3 || k % 4 === 1 ? null : 'REF' + (100200 + k), paidAt: i.paidAt!, receivedById: admin.id } });
  await prisma.unit.update({ where: { id: units['B-301'].id }, data: { status: 'MAINTENANCE', notes: 'تجديد الحمامات' } });
  await prisma.unit.update({ where: { id: units['A-305'].id }, data: { status: 'RESERVED' } });

  // technicians + maintenance requests
  const bcrypt = await import('bcrypt');
  const techRole = await prisma.role.findUniqueOrThrow({ where: { code: 'technician' } });
  const techs = [];
  for (const [fullName, email, phone] of [['محمد الفني', 'tech1@erp.local', '0591110001'], ['خالد الشهري', 'tech2@erp.local', '0591110002']]) {
    const t = await prisma.user.upsert({ where: { email }, update: {}, create: { fullName, email, phone, passwordHash: await bcrypt.hash('Tech@12345', 10) } });
    await prisma.userRole.upsert({ where: { userId_roleId: { userId: t.id, roleId: techRole.id } }, update: {}, create: { userId: t.id, roleId: techRole.id } });
    techs.push(t);
  }
  const MR: [string, number | null, 'PLUMBING' | 'ELECTRICAL' | 'AC' | 'CARPENTRY' | 'APPLIANCE', 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT', string, 'NEW' | 'ASSIGNED' | 'IN_PROGRESS' | 'WAITING_PARTS' | 'COMPLETED' | 'CLOSED', number | null][] = [
    ['A-101', 0, 'PLUMBING', 'HIGH', 'تسريب مياه - المطبخ', 'IN_PROGRESS', 0], ['14', 3, 'AC', 'MEDIUM', 'عطل تكييف الصالة', 'CLOSED', 1],
    ['B-110', 9, 'ELECTRICAL', 'URGENT', 'انقطاع كهرباء جزئي', 'ASSIGNED', 1], ['O-501', 6, 'CARPENTRY', 'LOW', 'إصلاح باب المكتب', 'NEW', null],
    ['V-01', 4, 'APPLIANCE', 'MEDIUM', 'عطل سخان المياه', 'WAITING_PARTS', 0], ['B-301', null, 'PLUMBING', 'MEDIUM', 'تجديد الحمامات', 'COMPLETED', 1],
  ];
  let mr = await prisma.maintenanceRequest.count();
  if (mr === 0) for (const [un, ti, category, priority, title, status, tk] of MR) {
    const hrs = { URGENT: 4, HIGH: 24, MEDIUM: 72, LOW: 168 }[priority];
    await prisma.maintenanceRequest.create({ data: { code: 'MR-2026-' + String(++mr).padStart(5, '0'), unitId: units[un].id, tenantId: ti === null ? null : tenants[ti].id,
      category, priority, title, description: title, status, dueAt: new Date(Date.now() + (status === 'ASSIGNED' ? -2 : hrs) * 3600_000),
      technicianId: tk === null ? null : techs[tk].id, createdById: admin.id, ...(status === 'WAITING_PARTS' && { partsNote: 'عنصر تسخين 50 لتر' }),
      ...(['COMPLETED', 'CLOSED'].includes(status) && { workReport: 'تم الإصلاح والاختبار', cost: 450, completedAt: new Date() }), ...(status === 'CLOSED' && { rating: 5, ratingComment: 'خدمة ممتازة' }),
      log: { create: { to: status, byUserId: admin.id } } } });
  }

  const c = await Promise.all([prisma.owner.count(), prisma.property.count(), prisma.unit.count(), prisma.tenant.count(), prisma.contract.count(), prisma.installment.count(), prisma.payment.count()]);
  console.log('ملاك', c[0], '· عقارات', c[1], '· وحدات', c[2], '· مستأجرون', c[3], '· عقود', c[4], '· أقساط', c[5], '· سندات', c[6]);
}
main().finally(() => prisma.$disconnect());
