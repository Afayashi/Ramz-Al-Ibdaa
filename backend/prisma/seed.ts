import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
const prisma = new PrismaClient();

const ROLES: Record<string, [string, string[]]> = {
  admin: ['مدير النظام', ['*']],
  employee: ['موظف إدارة الأملاك', ['owners.read', 'owners.write', 'attachments.write', 'properties.read', 'properties.write', 'units.read', 'units.write', 'contracts.read', 'contracts.write', 'tenants.read', 'tenants.write', 'maintenance.read', 'maintenance.write', 'handovers.write', 'tasks.write', 'reports.read']],
  accountant: ['المحاسب', ['owners.read', 'tenants.read', 'payments.read', 'payments.write', 'receipts.write', 'reports.read', 'contracts.read', 'tasks.write']],
  owner: ['المالك', ['properties.read.own', 'contracts.read.own', 'payments.read.own', 'reports.read.own', 'maintenance.read']],
  tenant: ['المستأجر', ['contracts.read.own', 'payments.read.own', 'payments.pay', 'maintenance.create', 'maintenance.read']],
  technician: ['الفني', ['workorders.read.own', 'workorders.update.own', 'maintenance.read']],
};
const ALL = ['integrations.manage', 'tasks.write', 'reports.read', 'handovers.write', 'payments.void', 'contracts.approve', 'contracts.terminate', 'users.read', 'users.write', 'roles.write', 'audit.read', 'owners.read', 'owners.write', 'properties.delete', 'units.delete', 'attachments.write', ...new Set(Object.values(ROLES).flatMap(r => r[1]).filter(p => p !== '*'))];

async function main() {
  for (const code of ALL) await prisma.permission.upsert({ where: { code }, update: {}, create: { code } });
  for (const [code, [nameAr, perms]] of Object.entries(ROLES)) {
    const role = await prisma.role.upsert({ where: { code }, update: { nameAr }, create: { code, nameAr } });
    const list = perms.includes('*') ? ALL : perms;
    for (const p of list) {
      const perm = await prisma.permission.findUniqueOrThrow({ where: { code: p } });
      await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } }, update: {}, create: { roleId: role.id, permissionId: perm.id } });
    }
  }
  const admin = await prisma.user.upsert({
    where: { email: 'admin@erp.local' }, update: {},
    create: { fullName: 'مدير النظام', email: 'admin@erp.local', phone: '0500000000', passwordHash: await bcrypt.hash('Admin@12345', 12) },
  });
  const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: 'admin' } });
  await prisma.userRole.upsert({ where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } }, update: {}, create: { userId: admin.id, roleId: adminRole.id } });
  // Demo owner + property + units
  const owner = await prisma.owner.upsert({ where: { nationalId: '1000000001' }, update: {}, create: { fullName: 'عبدالله العتيبي', nationalId: '1000000001', phone: '0551112222', city: 'الرياض',
    bankAccounts: { create: { bankName: 'مصرف الراجحي', holderName: 'عبدالله العتيبي', iban: 'SA0380000000608010167519', isPrimary: true } } } });
  for (const [fullName, nationalId, phone] of [['سارة الدوسري', '1098765432', '0553334444'], ['خالد الشمري', '1076543210', '0555556666'], ['فهد المطيري', '2012345678', '0557778888']])
    await prisma.tenant.upsert({ where: { nationalId }, update: {}, create: { fullName, nationalId, phone } });
  const prop = await prisma.property.upsert({
    where: { code: 'RYD-001' }, update: {},
    create: { code: 'RYD-001', name: 'برج النخيل', type: 'TOWER', ownerId: owner.id, city: 'الرياض', district: 'العليا', latitude: 24.7136, longitude: 46.6753, amenities: ['مواقف', 'مصاعد', 'حراسة'] },
  });
  const units: [string, any, number, number, number, number, any][] = [
    ['A-101', 'APARTMENT', 138, 3, 2, 68000, 'RENTED'], ['A-204', 'APARTMENT', 142, 3, 2, 72000, 'AVAILABLE'],
    ['A-305', 'APARTMENT', 96, 2, 1, 52000, 'RESERVED'], ['G-02', 'SHOP', 64, 0, 1, 95000, 'RENTED'], ['B-110', 'APARTMENT', 180, 4, 3, 88000, 'MAINTENANCE'],
  ];
  for (const [number, type, area, rooms, bathrooms, annualRent, status] of units)
    await prisma.unit.upsert({ where: { propertyId_number: { propertyId: prop.id, number } }, update: {}, create: { propertyId: prop.id, number, type, area, rooms, bathrooms, annualRent, status } });
  console.log('Seed done');
}
main().finally(() => prisma.$disconnect());
