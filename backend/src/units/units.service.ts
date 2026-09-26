import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma, UnitStatus } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { ScopeService } from '../common/scope.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators';
import { CreateUnitDto, UpdateUnitDto, ChangeStatusDto, UnitQuery } from './dto';

// RENTED is set only by contract approval (Sprint 4); manual transitions allowed below
const MANUAL: Record<UnitStatus, UnitStatus[]> = {
  AVAILABLE: ['RESERVED', 'MAINTENANCE'],
  RESERVED: ['AVAILABLE', 'MAINTENANCE'],
  MAINTENANCE: ['AVAILABLE'],
  RENTED: ['MAINTENANCE'],
};

@Injectable()
export class UnitsService {
  constructor(private prisma: PrismaService, private scope: ScopeService, private audit: AuditService) {}

  private async where(u: AuthUser): Promise<Prisma.UnitWhereInput> {
    return { archivedAt: null, property: { archivedAt: null, ...(await this.scope.propertyWhere(u)) } };
  }

  async list(u: AuthUser, q: UnitQuery) {
    return this.prisma.unit.findMany({
      where: { ...(await this.where(u)), ...(q.propertyId && { propertyId: q.propertyId }), ...(q.status && { status: q.status }), ...(q.type && { type: q.type }) },
      include: { property: { select: { id: true, name: true, code: true } } }, orderBy: [{ propertyId: 'asc' }, { number: 'asc' }],
    });
  }

  async get(u: AuthUser, id: string) {
    const unit = await this.prisma.unit.findFirst({ where: { id, ...(await this.where(u)) }, include: { property: { select: { id: true, name: true, code: true, city: true } }, statusLog: { orderBy: { createdAt: 'desc' }, take: 20 } } });
    if (!unit) throw new NotFoundException('الوحدة غير موجودة');
    return unit;
  }

  async create(u: AuthUser, d: CreateUnitDto) {
    const p = await this.prisma.property.findFirst({ where: { id: d.propertyId, archivedAt: null } });
    if (!p) throw new BadRequestException('العقار غير موجود');   // TC-UNIT-001
    try {
      const unit = await this.prisma.unit.create({ data: d });
      await this.audit.log('UNIT_CREATED', u.sub, undefined, { id: unit.id, propertyId: p.id });
      return unit;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('رقم الوحدة مستخدم في هذا العقار');
      throw e;
    }
  }

  async update(u: AuthUser, id: string, d: UpdateUnitDto) {
    await this.get(u, id);
    const unit = await this.prisma.unit.update({ where: { id }, data: d });
    await this.audit.log('UNIT_UPDATED', u.sub, undefined, { id, changes: Object.keys(d) });
    return unit;
  }

  // TC-UNIT-003
  async changeStatus(u: AuthUser, id: string, d: ChangeStatusDto) {
    const unit = await this.get(u, id);
    if (unit.status === d.status) return unit;
    if (!MANUAL[unit.status].includes(d.status)) throw new BadRequestException(`لا يمكن تغيير الحالة من ${unit.status} إلى ${d.status}`);
    const [updated] = await this.prisma.$transaction([
      this.prisma.unit.update({ where: { id }, data: { status: d.status } }),
      this.prisma.unitStatusLog.create({ data: { unitId: id, from: unit.status, to: d.status, byUserId: u.sub, reason: d.reason } }),
    ]);
    await this.audit.log('UNIT_STATUS_CHANGED', u.sub, undefined, { id, from: unit.status, to: d.status });
    return updated;
  }

  // TC-UNIT-002: a rented unit cannot be deleted
  async archive(u: AuthUser, id: string) {
    const unit = await this.get(u, id);
    if (unit.status === 'RENTED') throw new BadRequestException('لا يمكن حذف وحدة مؤجرة');
    await this.prisma.unit.update({ where: { id }, data: { archivedAt: new Date() } });
    await this.audit.log('UNIT_ARCHIVED', u.sub, undefined, { id });
    return { ok: true };
  }
}
