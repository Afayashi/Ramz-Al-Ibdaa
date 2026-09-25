import { Controller, Get, Injectable, Query, Res, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { IsOptional, IsUUID, IsDateString } from 'class-validator';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import { PrismaService } from '../prisma.service';
import { ScopeService } from '../common/scope.service';
import { CurrentUser, AuthUser } from '../common/decorators';

export class StatementQuery {
  @IsOptional() @IsUUID('4') ownerId?: string;
  @IsDateString() from: string;
  @IsDateString() to: string;
}
export class RangeQuery { @IsOptional() @IsDateString() from?: string; @IsOptional() @IsDateString() to?: string }

const r2 = (n: number) => Math.round(n * 100) / 100;
const DAY = 86_400_000;

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService, private scope: ScopeService) {}

  private async propWhere(u: AuthUser): Promise<Prisma.PropertyWhereInput> {
    if (!this.scope.isStaff(u) && !u.roles.includes('owner')) throw new ForbiddenException('غير مصرح');
    return { archivedAt: null, ...(await this.scope.propertyWhere(u)) };
  }

  async dashboard(u: AuthUser) {
    const pw = await this.propWhere(u);
    const cw: Prisma.ContractWhereInput = { archivedAt: null, unit: { property: pw } };
    const now = new Date(), today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const yearAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const [units, payments, dueMonth, overdue, expiring, maint, props] = await Promise.all([
      this.prisma.unit.groupBy({ by: ['status'], where: { archivedAt: null, property: pw }, _count: true }),
      this.prisma.payment.findMany({ where: { voidedAt: null, paidAt: { gte: yearAgo }, contract: cw }, select: { amount: true, paidAt: true, contract: { select: { unit: { select: { propertyId: true } } } } } }),
      this.prisma.installment.aggregate({ _sum: { total: true }, where: { contract: cw, status: { not: 'CANCELLED' }, dueDate: { gte: monthStart, lt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)) } } }),
      this.prisma.installment.findMany({ where: { contract: cw, status: 'OVERDUE' }, select: { total: true, paidAmount: true } }),
      this.prisma.contract.findMany({ where: { ...cw, status: 'ACTIVE', endDate: { gte: today, lt: new Date(today.getTime() + 90 * DAY) } },
        select: { id: true, code: true, endDate: true, renewedTo: { select: { id: true } }, tenant: { select: { fullName: true } }, unit: { select: { number: true, property: { select: { name: true } } } } }, orderBy: { endDate: 'asc' } }),
      this.prisma.maintenanceRequest.findMany({ where: { unit: { property: pw }, status: { in: ['NEW', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_PARTS'] } }, select: { dueAt: true } }),
      this.prisma.property.findMany({ where: pw, select: { id: true, name: true, units: { where: { archivedAt: null }, select: { status: true } } } }),
    ]);
    const byStatus = Object.fromEntries(units.map(x => [x.status, x._count]));
    const totalUnits = units.reduce((a, x) => a + x._count, 0);
    const months: { month: string; amount: number }[] = [];
    for (let i = 0; i < 12; i++) { const d = new Date(Date.UTC(yearAgo.getUTCFullYear(), yearAgo.getUTCMonth() + i, 1)); months.push({ month: d.toISOString().slice(0, 7), amount: 0 }); }
    const byProp: Record<string, number> = {};
    for (const p of payments) {
      const m = months.find(x => x.month === p.paidAt.toISOString().slice(0, 7)); if (m) m.amount = r2(m.amount + Number(p.amount));
      const pid = p.contract.unit.propertyId; byProp[pid] = r2((byProp[pid] ?? 0) + Number(p.amount));
    }
    const collectedMonth = months[11].amount, dueAmt = Number(dueMonth._sum.total ?? 0);
    const inDays = (d: Date) => Math.ceil((d.getTime() - today.getTime()) / DAY);
    return {
      units: { total: totalUnits, byStatus, occupancy: totalUnits ? Math.round(((byStatus.RENTED ?? 0) / totalUnits) * 100) : 0 },
      revenue: { months, last12: r2(months.reduce((a, m) => a + m.amount, 0)), thisMonth: collectedMonth, dueThisMonth: dueAmt, collectionRate: dueAmt ? Math.min(100, Math.round(collectedMonth / dueAmt * 100)) : 0 },
      overdue: { count: overdue.length, amount: r2(overdue.reduce((a, i) => a + Number(i.total) - Number(i.paidAmount), 0)) },
      expiring: { d30: expiring.filter(c => inDays(c.endDate) <= 30).length, d60: expiring.filter(c => inDays(c.endDate) <= 60).length, d90: expiring.length,
        list: expiring.slice(0, 8).map(c => ({ id: c.id, code: c.code, endDate: c.endDate, days: inDays(c.endDate), renewing: !!c.renewedTo, tenant: c.tenant.fullName, unit: `${c.unit.property.name} · ${c.unit.number}` })) },
      maintenance: { open: maint.length, overdue: maint.filter(m => m.dueAt < now).length },
      properties: props.map(p => ({ id: p.id, name: p.name, units: p.units.length, rented: p.units.filter(x => x.status === 'RENTED').length, revenue12m: byProp[p.id] ?? 0 }))
        .sort((a, b) => b.revenue12m - a.revenue12m),
    };
  }

  // Owner statement: collections − owner-charged maintenance − management commission = net payout
  async ownerStatement(u: AuthUser, q: StatementQuery) {
    let ownerId = q.ownerId;
    if (!this.scope.isStaff(u)) ownerId = (await this.scope.ownerId(u)) ?? undefined;
    if (!ownerId) throw new BadRequestException('حدد المالك');
    const owner = await this.prisma.owner.findFirst({ where: { id: ownerId, archivedAt: null }, include: { bankAccounts: { where: { isPrimary: true } } } });
    if (!owner) throw new NotFoundException('المالك غير موجود');
    const from = new Date(q.from), to = new Date(q.to + 'T23:59:59Z');
    if (to < from) throw new BadRequestException('نطاق التاريخ غير صحيح');
    const props = await this.prisma.property.findMany({ where: { ownerId, archivedAt: null }, select: { id: true, name: true } });
    const pids = props.map(p => p.id);
    const [pays, maint] = await Promise.all([
      this.prisma.payment.findMany({ where: { voidedAt: null, paidAt: { gte: from, lte: to }, contract: { unit: { propertyId: { in: pids } } } },
        select: { receiptNo: true, amount: true, paidAt: true, installment: { select: { vat: true, total: true } }, contract: { select: { code: true, tenant: { select: { fullName: true } }, unit: { select: { number: true, propertyId: true } } } } }, orderBy: { paidAt: 'asc' } }),
      this.prisma.maintenanceRequest.findMany({ where: { chargeTo: 'OWNER', cost: { gt: 0 }, completedAt: { gte: from, lte: to }, unit: { propertyId: { in: pids } } },
        select: { code: true, title: true, cost: true, completedAt: true, unit: { select: { number: true, propertyId: true } } } }),
    ]);
    const pct = Number(owner.commissionPct);
    const rows = props.map(p => {
      const pp = pays.filter(x => x.contract.unit.propertyId === p.id), mm = maint.filter(x => x.unit.propertyId === p.id);
      // VAT portion of each receipt is pass-through (not owner income)
      const gross = r2(pp.reduce((a, x) => a + Number(x.amount) * (1 - Number(x.installment.vat) / Math.max(1, Number(x.installment.total))), 0));
      const maintenance = r2(mm.reduce((a, x) => a + Number(x.cost), 0));
      const commission = r2(gross * pct / 100);
      return { propertyId: p.id, name: p.name, collected: gross, maintenance, commission, net: r2(gross - maintenance - commission) };
    });
    const sum = (k: 'collected' | 'maintenance' | 'commission' | 'net') => r2(rows.reduce((a, r) => a + r[k], 0));
    return {
      owner: { id: owner.id, fullName: owner.fullName, commissionPct: pct, iban: owner.bankAccounts[0]?.iban ?? null },
      period: { from: q.from, to: q.to }, properties: rows,
      totals: { collected: sum('collected'), maintenance: sum('maintenance'), commission: sum('commission'), net: sum('net') },
      receipts: pays.map(p => ({ receiptNo: p.receiptNo, date: p.paidAt, amount: Number(p.amount), contract: p.contract.code, tenant: p.contract.tenant.fullName, unit: p.contract.unit.number })),
      expenses: maint.map(m => ({ code: m.code, title: m.title, cost: Number(m.cost), date: m.completedAt, unit: m.unit.number })),
    };
  }

  async paymentsCsv(u: AuthUser, q: RangeQuery) {
    const pw = await this.propWhere(u);
    const rows = await this.prisma.payment.findMany({ where: { contract: { unit: { property: pw } },
      ...((q.from || q.to) && { paidAt: { ...(q.from && { gte: new Date(q.from) }), ...(q.to && { lte: new Date(q.to + 'T23:59:59Z') }) } }) },
      include: { contract: { select: { code: true, tenant: { select: { fullName: true } }, unit: { select: { number: true, property: { select: { name: true } } } } } } }, orderBy: { paidAt: 'asc' } });
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['رقم السند', 'التاريخ', 'المبلغ', 'الطريقة', 'المرجع', 'العقد', 'المستأجر', 'العقار', 'الوحدة', 'الحالة'];
    return '\uFEFF' + [head, ...rows.map(p => [p.receiptNo, p.paidAt.toISOString().slice(0, 10), p.amount, p.method, p.reference, p.contract.code, p.contract.tenant.fullName,
      p.contract.unit.property.name, p.contract.unit.number, p.voidedAt ? 'ملغي' : 'ساري'])].map(r => r.map(esc).join(',')).join('\r\n');
  }
}

@Controller('reports')
export class ReportsController {
  constructor(private svc: ReportsService) {}
  @Get('dashboard') dashboard(@CurrentUser() u: AuthUser) { return this.svc.dashboard(u); }
  @Get('owner-statement') statement(@CurrentUser() u: AuthUser, @Query() q: StatementQuery) { return this.svc.ownerStatement(u, q); }
  @Get('payments.csv') async csv(@CurrentUser() u: AuthUser, @Query() q: RangeQuery, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="payments.csv"');
    res.send(await this.svc.paymentsCsv(u, q));
  }
}
