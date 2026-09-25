import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { ScopeService } from '../common/scope.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../common/decorators';
import { RecordPaymentDto, PaymentQuery } from './dto';

const r2 = (n: number) => Math.round(n * 100) / 100;
const INCLUDE = {
  contract: { select: { id: true, code: true, tenant: { select: { fullName: true } }, unit: { select: { number: true, property: { select: { name: true } } } } } },
  installment: { select: { seq: true, dueDate: true, total: true } },
} satisfies Prisma.PaymentInclude;

@Injectable()
export class PaymentsService {
  constructor(private prisma: PrismaService, private scope: ScopeService, private audit: AuditService, private notif: NotificationsService) {}

  private async contractWhere(u: AuthUser): Promise<Prisma.ContractWhereInput> {
    if (this.scope.isStaff(u)) return {};
    if (u.roles.includes('tenant')) {
      const t = await this.prisma.tenant.findUnique({ where: { userId: u.sub } });
      if (!t) throw new ForbiddenException('لا يوجد ملف مستأجر مرتبط بالحساب');
      return { tenantId: t.id };
    }
    return { unit: { property: await this.scope.propertyWhere(u) } };
  }

  private async nextReceipt(tx: Prisma.TransactionClient) {
    const y = new Date().getUTCFullYear();
    const n = await tx.payment.count({ where: { receiptNo: { startsWith: `RC-${y}-` } } });
    return `RC-${y}-${String(n + 1).padStart(6, '0')}`;
  }

  async list(u: AuthUser, q: PaymentQuery) {
    return this.prisma.payment.findMany({
      where: { contract: await this.contractWhere(u), ...(q.contractId && { contractId: q.contractId }), ...(q.method && { method: q.method }),
        ...((q.from || q.to) && { paidAt: { ...(q.from && { gte: new Date(q.from) }), ...(q.to && { lte: new Date(q.to + 'T23:59:59Z') }) } }) },
      include: INCLUDE, orderBy: { paidAt: 'desc' }, take: 200,
    });
  }

  async get(u: AuthUser, id: string) {
    const p = await this.prisma.payment.findFirst({ where: { id, contract: await this.contractWhere(u) }, include: INCLUDE });
    if (!p) throw new NotFoundException('السند غير موجود');
    return p;
  }

  // Partial payments allowed; installment becomes PAID when fully settled
  async record(u: AuthUser, d: RecordPaymentDto) {
    const inst = await this.prisma.installment.findFirst({ where: { id: d.installmentId, contract: await this.contractWhere(u) }, include: { contract: true } });
    if (!inst) throw new NotFoundException('القسط غير موجود');
    if (!['ACTIVE', 'EXPIRED', 'TERMINATED'].includes(inst.contract.status)) throw new BadRequestException('لا يمكن التحصيل على عقد غير معتمد');
    if (inst.status === 'PAID' || inst.status === 'CANCELLED') throw new BadRequestException('القسط مسدد أو ملغي');
    const remaining = r2(Number(inst.total) - Number(inst.paidAmount));
    if (d.amount > remaining + 0.001) throw new BadRequestException(`المبلغ يتجاوز المتبقي (${remaining})`);
    if (['BANK_TRANSFER', 'CHEQUE', 'SADAD'].includes(d.method) && !d.reference) throw new BadRequestException('رقم المرجع مطلوب لهذه الطريقة');
    const paidAt = d.paidAt ? new Date(d.paidAt) : new Date();
    if (paidAt > new Date()) throw new BadRequestException('تاريخ الدفع لا يمكن أن يكون في المستقبل');
    const p = await this.prisma.$transaction(async tx => {
      const newPaid = r2(Number(inst.paidAmount) + d.amount);
      const full = newPaid >= Number(inst.total) - 0.001;
      await tx.installment.update({ where: { id: inst.id }, data: { paidAmount: newPaid, ...(full && { status: 'PAID', paidAt }) } });
      return tx.payment.create({ data: { receiptNo: await this.nextReceipt(tx), contractId: inst.contractId, installmentId: inst.id,
        amount: d.amount, method: d.method, reference: d.reference, paidAt, notes: d.notes, receivedById: u.sub }, include: INCLUDE });
    });
    await this.audit.log('PAYMENT_RECORDED', u.sub, undefined, { id: p.id, receiptNo: p.receiptNo, amount: d.amount });
    await this.notif.notify([await this.notif.tenantUser(inst.contract.tenantId)], { type: 'PAYMENT', title: 'تم استلام دفعتك', body: `سند ${p.receiptNo} بمبلغ ${d.amount} ﷼`, entityType: 'CONTRACT', entityId: inst.contractId });
    return p;
  }

  // Receipts are never deleted — voiding reverses the installment balance
  async void(u: AuthUser, id: string, reason: string) {
    const p = await this.get(u, id);
    if (p.voidedAt) throw new BadRequestException('السند ملغي مسبقاً');
    const inst = await this.prisma.installment.findUniqueOrThrow({ where: { id: p.installmentId } });
    const res = await this.prisma.$transaction(async tx => {
      const newPaid = Math.max(0, r2(Number(inst.paidAmount) - Number(p.amount)));
      const today = new Date(); today.setUTCHours(0, 0, 0, 0);
      await tx.installment.update({ where: { id: inst.id }, data: { paidAmount: newPaid, paidAt: null,
        status: inst.status === 'CANCELLED' ? 'CANCELLED' : inst.dueDate < today ? 'OVERDUE' : 'PENDING' } });
      return tx.payment.update({ where: { id }, data: { voidedAt: new Date(), voidedById: u.sub, voidReason: reason }, include: INCLUDE });
    });
    await this.audit.log('PAYMENT_VOIDED', u.sub, undefined, { id, reason });
    return res;
  }

  async summary(u: AuthUser) {
    const cw = await this.contractWhere(u);
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
    const [collected, due, overdue, upcoming] = await Promise.all([
      this.prisma.payment.aggregate({ _sum: { amount: true }, _count: true, where: { contract: cw, voidedAt: null, paidAt: { gte: monthStart } } }),
      this.prisma.installment.aggregate({ _sum: { total: true }, where: { contract: cw, status: { not: 'CANCELLED' }, dueDate: { gte: monthStart, lte: monthEnd } } }),
      this.prisma.installment.findMany({ where: { contract: cw, status: 'OVERDUE' }, select: { total: true, paidAmount: true } }),
      this.prisma.installment.findMany({ where: { contract: { ...cw, status: 'ACTIVE' }, status: { in: ['PENDING', 'OVERDUE'] } }, orderBy: { dueDate: 'asc' }, take: 10,
        include: { contract: { select: { id: true, code: true, tenant: { select: { fullName: true } }, unit: { select: { number: true, property: { select: { name: true } } } } } } } }),
    ]);
    const collectedAmt = Number(collected._sum.amount ?? 0), dueAmt = Number(due._sum.total ?? 0);
    return {
      collectedThisMonth: collectedAmt, receiptsThisMonth: collected._count,
      dueThisMonth: dueAmt, collectionRate: dueAmt ? Math.round(collectedAmt / dueAmt * 100) : 0,
      overdueCount: overdue.length, overdueAmount: r2(overdue.reduce((a, i) => a + Number(i.total) - Number(i.paidAmount), 0)),
      upcoming,
    };
  }
}
