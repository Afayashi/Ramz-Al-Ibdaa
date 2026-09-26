import { Injectable, ConflictException, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators';
import { CreateOwnerDto, UpdateOwnerDto, BankAccountDto } from './dto';

const dup = (e: unknown, msg: string) => { if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException(msg); throw e; };
// Mask IBAN for non-staff viewers except last 4
const mask = (iban: string) => iban.slice(0, 4) + ' •••• •••• ' + iban.slice(-4);

@Injectable()
export class OwnersService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  list(q?: string) {
    return this.prisma.owner.findMany({
      where: { archivedAt: null, ...(q && { OR: [{ fullName: { contains: q, mode: 'insensitive' } }, { nationalId: { contains: q } }, { phone: { contains: q } }] }) },
      select: { id: true, kind: true, fullName: true, nationalId: true, phone: true, city: true, _count: { select: { properties: { where: { archivedAt: null } } } } },
      orderBy: { fullName: 'asc' }, take: 100,
    });
  }

  async get(id: string, u?: AuthUser) {
    const o = await this.prisma.owner.findFirst({
      where: { id, archivedAt: null },
      include: { bankAccounts: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] }, properties: { where: { archivedAt: null }, select: { id: true, code: true, name: true, city: true, _count: { select: { units: true } } } } },
    });
    if (!o) throw new NotFoundException('المالك غير موجود');
    const attachments = await this.prisma.attachment.findMany({ where: { entityType: 'OWNER', entityId: id, archivedAt: null }, orderBy: { createdAt: 'desc' } });
    const staff = !u || u.roles.some(r => ['admin', 'employee', 'accountant'].includes(r));
    return { ...o, bankAccounts: o.bankAccounts.map(b => ({ ...b, iban: staff ? b.iban : mask(b.iban) })), attachments };
  }

  async me(u: AuthUser) {
    const o = await this.prisma.owner.findUnique({ where: { userId: u.sub } });
    if (!o) throw new ForbiddenException('لا يوجد ملف مالك مرتبط بالحساب');
    return this.get(o.id, u);
  }

  async create(u: AuthUser, d: CreateOwnerDto) {  // TC-OWN-001
    try {
      const o = await this.prisma.owner.create({ data: d });
      await this.audit.log('OWNER_CREATED', u.sub, undefined, { id: o.id });
      return o;
    } catch (e) { dup(e, 'يوجد مالك مسجل بنفس رقم الهوية'); }
  }

  async update(u: AuthUser, id: string, d: UpdateOwnerDto) {  // TC-OWN-002
    await this.get(id);
    const o = await this.prisma.owner.update({ where: { id }, data: d });
    await this.audit.log('OWNER_UPDATED', u.sub, undefined, { id, changes: Object.keys(d) });
    return o;
  }

  async archive(u: AuthUser, id: string) {
    await this.get(id);
    const n = await this.prisma.property.count({ where: { ownerId: id, archivedAt: null } });
    if (n) throw new BadRequestException(`لا يمكن حذف مالك لديه ${n} عقار نشط`);
    await this.prisma.owner.update({ where: { id }, data: { archivedAt: new Date() } });
    await this.audit.log('OWNER_ARCHIVED', u.sub, undefined, { id });
    return { ok: true };
  }

  async addBank(u: AuthUser, ownerId: string, d: BankAccountDto) {
    await this.get(ownerId);
    const first = (await this.prisma.bankAccount.count({ where: { ownerId } })) === 0;
    const primary = first || !!d.isPrimary;
    try {
      const [, acc] = await this.prisma.$transaction([
        this.prisma.bankAccount.updateMany({ where: { ownerId, ...(primary ? {} : { id: '__none__' }) }, data: { isPrimary: false } }),
        this.prisma.bankAccount.create({ data: { ...d, ownerId, isPrimary: primary } }),
      ]);
      await this.audit.log('BANK_ACCOUNT_ADDED', u.sub, undefined, { ownerId, last4: d.iban.slice(-4) });
      return acc;
    } catch (e) { dup(e, 'رقم الآيبان مسجل مسبقاً'); }
  }

  async setPrimary(u: AuthUser, ownerId: string, accId: string) {
    const acc = await this.prisma.bankAccount.findFirst({ where: { id: accId, ownerId } });
    if (!acc) throw new NotFoundException('الحساب غير موجود');
    await this.prisma.$transaction([
      this.prisma.bankAccount.updateMany({ where: { ownerId }, data: { isPrimary: false } }),
      this.prisma.bankAccount.update({ where: { id: accId }, data: { isPrimary: true } }),
    ]);
    return { ok: true };
  }

  async removeBank(u: AuthUser, ownerId: string, accId: string) {
    const acc = await this.prisma.bankAccount.findFirst({ where: { id: accId, ownerId } });
    if (!acc) throw new NotFoundException('الحساب غير موجود');
    if (acc.isPrimary && (await this.prisma.bankAccount.count({ where: { ownerId } })) > 1) throw new BadRequestException('عيّن حساباً رئيسياً آخر قبل حذف هذا الحساب');
    await this.prisma.bankAccount.delete({ where: { id: accId } });
    await this.audit.log('BANK_ACCOUNT_REMOVED', u.sub, undefined, { ownerId, last4: acc.iban.slice(-4) });
    return { ok: true };
  }
}
