import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { ScopeService } from '../common/scope.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators';
import { SaveHandoverDto } from './dto';

export const DEFAULT_AREAS = ['المدخل', 'الصالة', 'المطبخ', 'غرف النوم', 'دورات المياه', 'التكييف', 'الكهرباء والإنارة', 'السباكة', 'الأبواب والنوافذ', 'الدهانات'];

@Injectable()
export class HandoversService {
  constructor(private prisma: PrismaService, private scope: ScopeService, private audit: AuditService) {}

  private async contractFor(u: AuthUser, id: string) {
    let where: Prisma.ContractWhereInput = { id, archivedAt: null };
    if (!this.scope.isStaff(u)) {
      if (u.roles.includes('tenant')) {
        const t = await this.prisma.tenant.findUnique({ where: { userId: u.sub } });
        if (!t) throw new ForbiddenException('غير مصرح');
        where = { ...where, tenantId: t.id };
      } else where = { ...where, unit: { property: await this.scope.propertyWhere(u) } };
    }
    const c = await this.prisma.contract.findFirst({ where });
    if (!c) throw new NotFoundException('العقد غير موجود');
    return c;
  }

  async forContract(u: AuthUser, contractId: string) {
    await this.contractFor(u, contractId);
    return { areas: DEFAULT_AREAS, handovers: await this.prisma.handover.findMany({ where: { contractId }, orderBy: { createdAt: 'asc' } }) };
  }

  // Upsert while DRAFT; MOVE_IN needs ACTIVE contract, MOVE_OUT needs a signed MOVE_IN and a non-draft contract
  async save(u: AuthUser, d: SaveHandoverDto) {
    const c = await this.contractFor(u, d.contractId);
    const existing = await this.prisma.handover.findUnique({ where: { contractId_type: { contractId: c.id, type: d.type } } });
    if (existing?.status === 'SIGNED') throw new BadRequestException('المحضر موقّع ولا يمكن تعديله');
    if (d.type === 'MOVE_IN' && c.status !== 'ACTIVE') throw new BadRequestException('محضر الاستلام يتطلب عقداً سارياً');
    if (d.type === 'MOVE_OUT') {
      if (!['ACTIVE', 'EXPIRED', 'TERMINATED'].includes(c.status)) throw new BadRequestException('لا يمكن التسليم على هذا العقد');
      const mi = await this.prisma.handover.findUnique({ where: { contractId_type: { contractId: c.id, type: 'MOVE_IN' } } });
      if (mi?.status !== 'SIGNED') throw new BadRequestException('يجب توقيع محضر الاستلام أولاً');
    } else if (d.deductions?.length) throw new BadRequestException('الخصومات خاصة بمحضر التسليم');
    if (!d.items.length) throw new BadRequestException('أضف بنود الفحص');
    const deductions = d.deductions ?? [];
    const totalDed = deductions.reduce((a, x) => a + x.amount, 0);
    if (totalDed > Number(c.deposit) + 0.001) throw new BadRequestException(`الخصومات تتجاوز مبلغ التأمين (${c.deposit})`);
    const data = { items: d.items as any, electricity: d.electricity, water: d.water, keysCount: d.keysCount, notes: d.notes,
      deductions: deductions as any, depositRefund: d.type === 'MOVE_OUT' ? Math.round((Number(c.deposit) - totalDed) * 100) / 100 : null };
    const h = existing
      ? await this.prisma.handover.update({ where: { id: existing.id }, data })
      : await this.prisma.handover.create({ data: { ...data, contractId: c.id, type: d.type, inspectedById: u.sub } });
    await this.audit.log('HANDOVER_SAVED', u.sub, undefined, { id: h.id, type: d.type });
    return h;
  }

  // Tenant signs (or staff on tenant's behalf); MOVE_OUT signing releases the unit
  async sign(u: AuthUser, id: string) {
    const h = await this.prisma.handover.findUnique({ where: { id } });
    if (!h) throw new NotFoundException('المحضر غير موجود');
    const c = await this.contractFor(u, h.contractId);
    if (h.status === 'SIGNED') throw new BadRequestException('المحضر موقّع مسبقاً');
    const res = await this.prisma.$transaction(async tx => {
      if (h.type === 'MOVE_OUT' && c.status !== 'ACTIVE') {
        const unit = await tx.unit.findUniqueOrThrow({ where: { id: c.unitId } });
        if (unit.status === 'RENTED') {
          await tx.unit.update({ where: { id: unit.id }, data: { status: 'AVAILABLE' } });
          await tx.unitStatusLog.create({ data: { unitId: unit.id, from: 'RENTED', to: 'AVAILABLE', byUserId: u.sub, reason: `محضر تسليم ${c.code}` } });
        }
      }
      return tx.handover.update({ where: { id }, data: { status: 'SIGNED', signedAt: new Date(), signedById: u.sub } });
    });
    await this.audit.log('HANDOVER_SIGNED', u.sub, undefined, { id, type: h.type });
    return res;
  }
}
