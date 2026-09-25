import { Injectable, NotFoundException, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma, ContractStatus } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { ScopeService } from '../common/scope.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TasksService } from '../tasks/tasks';
import { AuthUser } from '../common/decorators';
import { contractMonths, planInstallments, addMonths } from './installments';
import { CreateContractDto, UpdateContractDto, PreviewDto, ContractQuery, RenewDto } from './dto';

// Workflow: DRAFT → PENDING_APPROVAL → ACTIVE → EXPIRED | TERMINATED ; DRAFT/PENDING → CANCELLED ; PENDING → DRAFT (reject)
const FLOW: Record<ContractStatus, ContractStatus[]> = {
  DRAFT: ['PENDING_APPROVAL', 'CANCELLED'],
  PENDING_APPROVAL: ['ACTIVE', 'DRAFT', 'CANCELLED'],
  ACTIVE: ['EXPIRED', 'TERMINATED'],
  EXPIRED: [], TERMINATED: [], CANCELLED: [],
};
const BLOCKING: ContractStatus[] = ['PENDING_APPROVAL', 'ACTIVE'];
const INCLUDE = {
  unit: { select: { id: true, number: true, type: true, property: { select: { id: true, name: true, code: true, ownerId: true } } } },
  tenant: { select: { id: true, fullName: true, phone: true, nationalId: true } },
} satisfies Prisma.ContractInclude;

@Injectable()
export class ContractsService {
  constructor(private prisma: PrismaService, private scope: ScopeService, private audit: AuditService, private notif: NotificationsService, private tasks: TasksService) {}

  // Staff: all · Owner: contracts on own properties · Tenant: own contracts
  private async where(u: AuthUser): Promise<Prisma.ContractWhereInput> {
    const base: Prisma.ContractWhereInput = { archivedAt: null };
    if (this.scope.isStaff(u)) return base;
    if (u.roles.includes('tenant')) {
      const t = await this.prisma.tenant.findUnique({ where: { userId: u.sub } });
      if (!t) throw new ForbiddenException('لا يوجد ملف مستأجر مرتبط بالحساب');
      return { ...base, tenantId: t.id };
    }
    return { ...base, unit: { property: await this.scope.propertyWhere(u) } };
  }

  private validate(startDate: string | Date, endDate: string | Date) {
    const s = new Date(startDate), e = new Date(endDate);
    if (e <= s) throw new BadRequestException('تاريخ النهاية يجب أن يكون بعد تاريخ البداية');
    const months = contractMonths(s, e);
    if (months < 0) throw new BadRequestException('مدة العقد يجب أن تكون أشهراً كاملة (مثال: 2026-01-01 إلى 2026-12-31)');
    return { s, e, months };
  }

  private async assertNoOverlap(unitId: string, s: Date, e: Date, exceptId?: string) {
    const clash = await this.prisma.contract.findFirst({ where: {
      unitId, archivedAt: null, status: { in: BLOCKING }, id: exceptId ? { not: exceptId } : undefined,
      startDate: { lte: e }, endDate: { gte: s },
    } });
    if (clash) throw new ConflictException(`الوحدة مرتبطة بعقد آخر في نفس الفترة (${clash.code})`);
  }

  private async nextCode(tx: Prisma.TransactionClient) {
    const y = new Date().getUTCFullYear();
    const n = await tx.contract.count({ where: { code: { startsWith: `CT-${y}-` } } });
    return `CT-${y}-${String(n + 1).padStart(5, '0')}`;
  }

  preview(d: PreviewDto) {
    const { s, months } = this.validate(d.startDate, d.endDate);
    const items = planInstallments(s, months, d.annualRent, d.frequency, d.vatPct ?? 0);
    const sum = (k: 'amount' | 'vat' | 'total') => Math.round(items.reduce((a, i) => a + i[k], 0) * 100) / 100;
    return { months, count: items.length, totalRent: sum('amount'), totalVat: sum('vat'), grandTotal: sum('total'), installments: items };
  }

  async list(u: AuthUser, q: ContractQuery) {
    const soon = q.expiringInDays ? new Date(Date.now() + q.expiringInDays * 86_400_000) : undefined;
    return this.prisma.contract.findMany({
      where: { ...(await this.where(u)),
        ...(q.status && { status: q.status }), ...(q.unitId && { unitId: q.unitId }), ...(q.tenantId && { tenantId: q.tenantId }),
        ...(q.propertyId && { unit: { propertyId: q.propertyId } }),
        ...(soon && { status: 'ACTIVE', endDate: { lte: soon } }) },
      include: INCLUDE, orderBy: { createdAt: 'desc' },
    });
  }

  async get(u: AuthUser, id: string) {
    const c = await this.prisma.contract.findFirst({ where: { id, ...(await this.where(u)) },
      include: { ...INCLUDE, installments: { orderBy: { seq: 'asc' }, include: { payments: { where: { voidedAt: null }, select: { id: true, receiptNo: true, amount: true, method: true, paidAt: true } } } }, statusLog: { orderBy: { createdAt: 'desc' } } } });
    if (!c) throw new NotFoundException('العقد غير موجود');
    return c;
  }

  async create(u: AuthUser, d: CreateContractDto) {
    const { s, e, months } = this.validate(d.startDate, d.endDate);
    const unit = await this.prisma.unit.findFirst({ where: { id: d.unitId, archivedAt: null, property: { archivedAt: null } } });
    if (!unit) throw new BadRequestException('الوحدة غير موجودة');
    if (unit.status === 'MAINTENANCE') throw new BadRequestException('الوحدة تحت الصيانة');
    const tenant = await this.prisma.tenant.findFirst({ where: { id: d.tenantId, archivedAt: null } });
    if (!tenant) throw new BadRequestException('المستأجر غير موجود');
    if (tenant.idExpiry && tenant.idExpiry < s) throw new BadRequestException('هوية المستأجر منتهية قبل بداية العقد');
    await this.assertNoOverlap(unit.id, s, e);
    const annualRent = d.annualRent ?? Number(unit.annualRent);
    const vatPct = d.vatPct ?? (['SHOP', 'OFFICE', 'WAREHOUSE'].includes(unit.type) ? 15 : 0);
    const plan = planInstallments(s, months, annualRent, d.frequency, vatPct);
    try {
      const c = await this.prisma.$transaction(async tx => tx.contract.create({ data: {
        code: await this.nextCode(tx), unitId: unit.id, tenantId: tenant.id, startDate: s, endDate: e, annualRent,
        frequency: d.frequency, deposit: d.deposit ?? 0, vatPct, ejarNumber: d.ejarNumber, notes: d.notes, createdById: u.sub,
        installments: { create: plan },
      }, include: { installments: true } }));
      await this.audit.log('CONTRACT_CREATED', u.sub, undefined, { id: c.id, code: c.code });
      return c;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new ConflictException('رقم عقد إيجار مستخدم مسبقاً');
      throw err;
    }
  }

  // Only drafts are editable; financial changes regenerate the installment schedule
  async update(u: AuthUser, id: string, d: UpdateContractDto) {
    const c = await this.get(u, id);
    if (c.status !== 'DRAFT') throw new BadRequestException('لا يمكن تعديل العقد إلا في حالة المسودة');
    const start = d.startDate ?? c.startDate, end = d.endDate ?? c.endDate;
    const { s, e, months } = this.validate(start, end);
    if (d.startDate || d.endDate) await this.assertNoOverlap(c.unitId, s, e, id);
    const annualRent = d.annualRent ?? Number(c.annualRent), frequency = d.frequency ?? c.frequency, vatPct = d.vatPct ?? Number(c.vatPct);
    const regen = ['startDate', 'endDate', 'annualRent', 'frequency', 'vatPct'].some(k => (d as any)[k] !== undefined);
    const updated = await this.prisma.$transaction(async tx => {
      if (regen) await tx.installment.deleteMany({ where: { contractId: id } });
      return tx.contract.update({ where: { id }, data: {
        ...d, startDate: s, endDate: e, annualRent, frequency, vatPct,
        ...(regen && { installments: { create: planInstallments(s, months, annualRent, frequency, vatPct) } }),
      }, include: { installments: { orderBy: { seq: 'asc' } } } });
    });
    await this.audit.log('CONTRACT_UPDATED', u.sub, undefined, { id, changes: Object.keys(d), regenerated: regen });
    return updated;
  }

  private async transition(u: AuthUser, id: string, to: ContractStatus, reason?: string, extra: (tx: Prisma.TransactionClient, c: any) => Promise<Prisma.ContractUpdateInput> = async () => ({})) {
    const c = await this.get(u, id);
    if (!FLOW[c.status].includes(to)) throw new BadRequestException(`لا يمكن نقل العقد من ${c.status} إلى ${to}`);
    const updated = await this.prisma.$transaction(async tx => {
      const data = await extra(tx, c);
      await tx.contractStatusLog.create({ data: { contractId: id, from: c.status, to, byUserId: u.sub, reason } });
      return tx.contract.update({ where: { id }, data: { ...data, status: to }, include: INCLUDE });
    });
    await this.audit.log(`CONTRACT_${to}`, u.sub, undefined, { id, from: c.status, reason });
    return updated;
  }

  private async setUnit(tx: Prisma.TransactionClient, unitId: string, to: 'RENTED' | 'AVAILABLE', by: string, reason: string) {
    const unit = await tx.unit.findUniqueOrThrow({ where: { id: unitId } });
    if (unit.status === to) return;
    await tx.unit.update({ where: { id: unitId }, data: { status: to } });
    await tx.unitStatusLog.create({ data: { unitId, from: unit.status, to, byUserId: by, reason } });
  }

  async submit(u: AuthUser, id: string) {
    const c = await this.transition(u, id, 'PENDING_APPROVAL');
    await this.notif.notify((await this.notif.staff(['admin'])).filter(x => x !== u.sub), { type: 'CONTRACT', title: 'عقد بانتظار الاعتماد', body: `${c.code} · ${c.unit.property.name} ${c.unit.number}`, entityType: 'CONTRACT', entityId: id });
    return c;
  }
  reject(u: AuthUser, id: string, reason: string) { return this.transition(u, id, 'DRAFT', reason); }
  cancel(u: AuthUser, id: string, reason?: string) { return this.transition(u, id, 'CANCELLED', reason); }

  // Approval rents the unit (only path to RENTED — see UnitsService.MANUAL)
  async approve(u: AuthUser, id: string) {
    const c = await this.approveTx(u, id);
    await this.notif.notify([await this.notif.tenantUser(c.tenantId), await this.notif.ownerUserOfUnit(c.unitId)], { type: 'CONTRACT', title: 'تم اعتماد العقد', body: `${c.code} · ${c.unit.property.name} ${c.unit.number}`, entityType: 'CONTRACT', entityId: id });
    return c;
  }
  private approveTx(u: AuthUser, id: string) {
    return this.transition(u, id, 'ACTIVE', undefined, async (tx, c) => {
      if (c.createdById === u.sub && !u.roles.includes('admin')) throw new ForbiddenException('لا يمكن اعتماد عقد أنشأته بنفسك');
      const unit = await tx.unit.findUniqueOrThrow({ where: { id: c.unitId } });
      if (!['AVAILABLE', 'RESERVED'].includes(unit.status)) throw new BadRequestException('الوحدة غير متاحة للتأجير');
      await this.setUnit(tx, c.unitId, 'RENTED', u.sub, `اعتماد العقد ${c.code}`);
      return { approvedById: u.sub, approvedAt: new Date() };
    });
  }

  // Early termination: unpaid future installments are cancelled, unit released
  terminate(u: AuthUser, id: string, reason: string) {
    return this.transition(u, id, 'TERMINATED', reason, async (tx, c) => {
      const now = new Date();
      await tx.installment.updateMany({ where: { contractId: id, status: { in: ['PENDING', 'OVERDUE'] }, dueDate: { gt: now } }, data: { status: 'CANCELLED' } });
      await this.setUnit(tx, c.unitId, 'AVAILABLE', u.sub, `إنهاء العقد ${c.code}`);
      return { terminatedAt: now, terminationReason: reason };
    });
  }

  // Renewal: new DRAFT starting the day after current end; approving it later keeps the unit RENTED
  async renew(u: AuthUser, id: string, d: RenewDto) {
    const c = await this.get(u, id);
    if (c.status !== 'ACTIVE' && c.status !== 'EXPIRED') throw new BadRequestException('يمكن تجديد العقود السارية أو المنتهية فقط');
    if (await this.prisma.contract.findUnique({ where: { renewedFromId: id } })) throw new ConflictException('تم إنشاء تجديد لهذا العقد مسبقاً');
    const start = new Date(c.endDate.getTime() + 86_400_000);
    const draft = await this.create(u, { unitId: c.unitId, tenantId: c.tenantId, startDate: start.toISOString(), endDate: d.endDate,
      annualRent: d.annualRent ?? Number(c.annualRent), frequency: d.frequency ?? c.frequency, vatPct: Number(c.vatPct), deposit: Number(c.deposit) });
    return this.prisma.contract.update({ where: { id: draft.id }, data: { renewedFromId: id } });
  }

  // Called daily by the scheduler (Sprint 9 notifications build on this)
  async runDaily() {
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const late = await this.prisma.installment.findMany({ where: { status: 'PENDING', dueDate: { lt: today }, contract: { status: 'ACTIVE' } }, include: { contract: { select: { id: true, code: true, tenantId: true } } } });
    const overdue = await this.prisma.installment.updateMany({ where: { id: { in: late.map(i => i.id) } }, data: { status: 'OVERDUE' } });
    for (const i of late) await this.notif.notify([await this.notif.tenantUser(i.contract.tenantId)], { type: 'PAYMENT', title: 'دفعة متأخرة', body: `القسط ${i.seq} بقيمة ${i.total} ﷼ تجاوز موعد استحقاقه`, entityType: 'CONTRACT', entityId: i.contract.id });
    const soon = new Date(today.getTime() + 30 * 86_400_000), soon1 = new Date(soon.getTime() + 86_400_000);
    const ending = await this.prisma.contract.findMany({ where: { status: 'ACTIVE', endDate: { gte: soon, lt: soon1 }, renewedTo: null } });
    for (const c of ending) await this.notif.notify([await this.notif.tenantUser(c.tenantId), ...(await this.notif.staff())], { type: 'CONTRACT', title: 'عقد ينتهي خلال 30 يوماً', body: c.code, entityType: 'CONTRACT', entityId: c.id });
    const ended = await this.prisma.contract.findMany({ where: { status: 'ACTIVE', endDate: { lt: today } }, include: { renewedTo: true } });
    for (const c of ended) {
      await this.prisma.$transaction(async tx => {
        await tx.contractStatusLog.create({ data: { contractId: c.id, from: 'ACTIVE', to: 'EXPIRED', byUserId: 'system' } });
        await tx.contract.update({ where: { id: c.id }, data: { status: 'EXPIRED' } });
        if (c.renewedTo?.status !== 'ACTIVE') await this.setUnit(tx, c.unitId, 'AVAILABLE', 'system', `انتهاء العقد ${c.code}`);
      });
    }
    const renewalTasks = await this.tasks.autoRenewalTasks();
    return { overdue: overdue.count, expired: ended.length, renewalTasks };
  }
}
