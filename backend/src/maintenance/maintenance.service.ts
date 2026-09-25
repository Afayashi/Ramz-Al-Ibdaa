import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { Prisma, MaintStatus, MaintPriority } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { ScopeService } from '../common/scope.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../common/decorators';
import { CreateMaintenanceDto, AssignDto, CompleteDto, CloseDto, MaintQuery } from './dto';

export const SLA_HOURS: Record<MaintPriority, number> = { URGENT: 4, HIGH: 24, MEDIUM: 72, LOW: 168 };
const FLOW: Record<MaintStatus, MaintStatus[]> = {
  NEW: ['ASSIGNED', 'CANCELLED'], ASSIGNED: ['ASSIGNED', 'IN_PROGRESS', 'CANCELLED'], IN_PROGRESS: ['WAITING_PARTS', 'COMPLETED'],
  WAITING_PARTS: ['IN_PROGRESS'], COMPLETED: ['CLOSED', 'IN_PROGRESS'], CLOSED: [], CANCELLED: [],
};
const OPEN: MaintStatus[] = ['NEW', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_PARTS', 'COMPLETED'];
const INCLUDE = {
  unit: { select: { id: true, number: true, property: { select: { id: true, name: true, city: true } } } },
  tenant: { select: { id: true, fullName: true, phone: true } },
  technician: { select: { id: true, fullName: true, phone: true } },
} satisfies Prisma.MaintenanceRequestInclude;

@Injectable()
export class MaintenanceService {
  constructor(private prisma: PrismaService, private scope: ScopeService, private audit: AuditService, private notif: NotificationsService) {}

  private isTech = (u: AuthUser) => u.roles.includes('technician') && !this.scope.isStaff(u);
  private async tenantOf(u: AuthUser) {
    const t = await this.prisma.tenant.findUnique({ where: { userId: u.sub } });
    if (!t) throw new ForbiddenException('لا يوجد ملف مستأجر مرتبط بالحساب');
    return t;
  }
  private async where(u: AuthUser): Promise<Prisma.MaintenanceRequestWhereInput> {
    if (this.scope.isStaff(u)) return {};
    if (this.isTech(u)) return { technicianId: u.sub };
    if (u.roles.includes('tenant')) return { tenantId: (await this.tenantOf(u)).id };
    return { unit: { property: await this.scope.propertyWhere(u) } };
  }

  async list(u: AuthUser, q: MaintQuery) {
    const rows = await this.prisma.maintenanceRequest.findMany({
      where: { ...(await this.where(u)), ...(q.status && { status: q.status }), ...(q.unitId && { unitId: q.unitId }), ...(q.open === 'true' && { status: { in: OPEN } }) },
      include: INCLUDE, orderBy: [{ createdAt: 'desc' }], take: 200,
    });
    const now = Date.now();
    return rows.map(r => ({ ...r, overdue: OPEN.includes(r.status) && r.status !== 'COMPLETED' && r.dueAt.getTime() < now }));
  }

  async get(u: AuthUser, id: string) {
    const r = await this.prisma.maintenanceRequest.findFirst({ where: { id, ...(await this.where(u)) }, include: { ...INCLUDE, log: { orderBy: { createdAt: 'desc' } }, photos: { orderBy: { createdAt: 'asc' } } } });
    if (!r) throw new NotFoundException('الطلب غير موجود');
    return { ...r, overdue: OPEN.includes(r.status) && r.status !== 'COMPLETED' && r.dueAt.getTime() < Date.now() };
  }

  technicians() {
    return this.prisma.user.findMany({ where: { status: 'ACTIVE', roles: { some: { role: { code: 'technician' } } } },
      select: { id: true, fullName: true, phone: true, _count: { select: { workOrders: { where: { status: { in: ['ASSIGNED', 'IN_PROGRESS', 'WAITING_PARTS'] } } } } } }, orderBy: { fullName: 'asc' } });
  }

  private async nextCode(tx: Prisma.TransactionClient) {
    const y = new Date().getUTCFullYear();
    const n = await tx.maintenanceRequest.count({ where: { code: { startsWith: `MR-${y}-` } } });
    return `MR-${y}-${String(n + 1).padStart(5, '0')}`;
  }

  async create(u: AuthUser, d: CreateMaintenanceDto) {
    let unitId = d.unitId, tenantId: string | null = null;
    if (this.scope.isStaff(u)) {
      if (!u.perms.includes('maintenance.write') && !u.roles.includes('admin')) throw new ForbiddenException('غير مصرح');
      if (!unitId) throw new BadRequestException('حدد الوحدة');
      const active = await this.prisma.contract.findFirst({ where: { unitId, status: 'ACTIVE' } });
      tenantId = active?.tenantId ?? null;
    } else if (u.roles.includes('tenant')) {
      const t = await this.tenantOf(u);
      const c = await this.prisma.contract.findFirst({ where: { tenantId: t.id, status: 'ACTIVE', ...(unitId && { unitId }) }, orderBy: { startDate: 'desc' } });
      if (!c) throw new BadRequestException('لا يوجد عقد ساري لهذه الوحدة');
      unitId = c.unitId; tenantId = t.id;
    } else throw new ForbiddenException('غير مصرح');
    const unit = await this.prisma.unit.findFirst({ where: { id: unitId, archivedAt: null } });
    if (!unit) throw new BadRequestException('الوحدة غير موجودة');
    const priority = d.priority ?? (d.category === 'ELECTRICAL' || d.category === 'PLUMBING' ? 'HIGH' : 'MEDIUM');
    const r = await this.prisma.$transaction(async tx => {
      const req = await tx.maintenanceRequest.create({ data: { code: await this.nextCode(tx), unitId: unit.id, tenantId, category: d.category, priority,
        title: d.title, description: d.description, dueAt: new Date(Date.now() + SLA_HOURS[priority] * 3600_000), createdById: u.sub }, include: INCLUDE });
      await tx.maintenanceLog.create({ data: { requestId: req.id, to: 'NEW', byUserId: u.sub } });
      return req;
    });
    await this.audit.log('MAINT_CREATED', u.sub, undefined, { id: r.id, code: r.code });
    await this.notif.notify(await this.notif.staff(), { type: 'MAINTENANCE', title: 'بلاغ صيانة جديد', body: `${r.title} · ${r.unit.property.name} ${r.unit.number}`, entityType: 'MAINTENANCE', entityId: r.id });
    return r;
  }

  private async move(u: AuthUser, id: string, to: MaintStatus, data: Prisma.MaintenanceRequestUncheckedUpdateInput = {}, note?: string) {
    const r = await this.get(u, id);
    if (!FLOW[r.status].includes(to)) throw new BadRequestException(`لا يمكن نقل الطلب من ${r.status} إلى ${to}`);
    const res = await this.prisma.$transaction(async tx => {
      await tx.maintenanceLog.create({ data: { requestId: id, from: r.status, to, byUserId: u.sub, note } });
      return tx.maintenanceRequest.update({ where: { id }, data: { ...data, status: to }, include: INCLUDE });
    });
    await this.audit.log(`MAINT_${to}`, u.sub, undefined, { id, from: r.status, note });
    return { before: r, after: res };
  }
  private assertStaff(u: AuthUser) { if (!this.scope.isStaff(u)) throw new ForbiddenException('غير مصرح'); }
  private assertTech(u: AuthUser, r: { technicianId: string | null }) {
    if (!u.roles.includes('admin') && r.technicianId !== u.sub) throw new ForbiddenException('الطلب غير مسند إليك');
  }

  async assign(u: AuthUser, id: string, d: AssignDto) {
    this.assertStaff(u);
    const tech = await this.prisma.user.findFirst({ where: { id: d.technicianId, status: 'ACTIVE', roles: { some: { role: { code: 'technician' } } } } });
    if (!tech) throw new BadRequestException('الفني غير موجود');
    const { after } = await this.move(u, id, 'ASSIGNED', { technicianId: tech.id, scheduledAt: d.scheduledAt ? new Date(d.scheduledAt) : null,
      ...(d.priority && { priority: d.priority, dueAt: new Date(Date.now() + SLA_HOURS[d.priority] * 3600_000) }) }, `إسناد إلى ${tech.fullName}`);
    await this.notif.notify([tech.id], { type: 'MAINTENANCE', title: 'أمر عمل جديد', body: `${after.title} · ${after.unit.property.name} ${after.unit.number}`, entityType: 'MAINTENANCE', entityId: id });
    await this.notif.notify([await this.notif.tenantUser(after.tenantId)], { type: 'MAINTENANCE', title: 'تم تعيين فني', body: `${tech.fullName} سيتولى طلب «${after.title}»`, entityType: 'MAINTENANCE', entityId: id });
    return after;
  }

  async start(u: AuthUser, id: string) {
    const r = await this.get(u, id); this.assertTech(u, r);
    return (await this.move(u, id, 'IN_PROGRESS', r.startedAt ? {} : { startedAt: new Date() })).after;
  }
  async waitParts(u: AuthUser, id: string, partsNote: string) {
    const r = await this.get(u, id); this.assertTech(u, r);
    const { after } = await this.move(u, id, 'WAITING_PARTS', { partsNote }, partsNote);
    await this.notif.notify(await this.notif.staff(), { type: 'MAINTENANCE', title: 'طلب قطع غيار', body: `${after.code}: ${partsNote}`, entityType: 'MAINTENANCE', entityId: id });
    return after;
  }
  // Photos: tenant/staff add BEFORE while open; assigned technician adds AFTER while working
  async addPhotos(u: AuthUser, id: string, files: Express.Multer.File[], stage: 'BEFORE' | 'AFTER') {
    if (!files?.length) throw new BadRequestException('لم يتم إرفاق صور');
    const r = await this.get(u, id);
    if (['CLOSED', 'CANCELLED'].includes(r.status)) throw new BadRequestException('الطلب مغلق');
    if (this.isTech(u)) { this.assertTech(u, r); stage = 'AFTER'; }
    else if (!this.scope.isStaff(u) && stage === 'AFTER') throw new ForbiddenException('صور ما بعد الإصلاح للفني');
    if (r.photos.length + files.length > 12) throw new BadRequestException('الحد الأقصى 12 صورة لكل طلب');
    await this.prisma.maintenancePhoto.createMany({ data: files.map(f => ({ requestId: id, url: '/uploads/maintenance/' + f.filename, stage, uploadedBy: u.sub })) });
    await this.audit.log('MAINT_PHOTOS', u.sub, undefined, { id, count: files.length, stage });
    return this.get(u, id);
  }
  async removePhoto(u: AuthUser, id: string, photoId: string) {
    const r = await this.get(u, id);
    const p = r.photos.find(x => x.id === photoId);
    if (!p) throw new NotFoundException('الصورة غير موجودة');
    if (p.uploadedBy !== u.sub && !this.scope.isStaff(u)) throw new ForbiddenException('غير مصرح');
    await this.prisma.maintenancePhoto.delete({ where: { id: photoId } });
    return this.get(u, id);
  }

  async complete(u: AuthUser, id: string, d: CompleteDto) {
    const r = await this.get(u, id); this.assertTech(u, r);
    if (process.env.MAINT_REQUIRE_AFTER_PHOTO === 'true' && !r.photos.some(p => p.stage === 'AFTER')) throw new BadRequestException('أرفق صورة بعد الإصلاح قبل الإنهاء');
    const { after } = await this.move(u, id, 'COMPLETED', { workReport: d.workReport, cost: d.cost ?? 0, chargeTo: d.chargeTo ?? 'OWNER', completedAt: new Date() }, d.workReport);
    await this.notif.notify([await this.notif.tenantUser(after.tenantId), ...(await this.notif.staff())], { type: 'MAINTENANCE', title: 'اكتمل طلب الصيانة', body: `«${after.title}» — يرجى التأكيد والتقييم`, entityType: 'MAINTENANCE', entityId: id });
    return after;
  }
  // Tenant confirms (with rating) or staff closes; tenant may reopen instead
  async close(u: AuthUser, id: string, d: CloseDto) {
    const r = await this.get(u, id);
    if (this.isTech(u)) throw new ForbiddenException('الإغلاق من المستأجر أو الإدارة');
    const { after } = await this.move(u, id, 'CLOSED', { ...(d.rating && { rating: d.rating, ratingComment: d.ratingComment }) }, d.rating ? `تقييم ${d.rating}/5` : undefined);
    await this.notif.notify([r.technicianId], { type: 'MAINTENANCE', title: 'أُغلق أمر العمل', body: d.rating ? `حصلت على تقييم ${d.rating} من 5` : after.title, entityType: 'MAINTENANCE', entityId: id });
    return after;
  }
  async reopen(u: AuthUser, id: string, reason: string) {
    if (this.isTech(u)) throw new ForbiddenException('غير مصرح');
    const r = await this.get(u, id);
    const { after } = await this.move(u, id, 'IN_PROGRESS', { completedAt: null }, `إعادة فتح: ${reason}`);
    await this.notif.notify([r.technicianId], { type: 'MAINTENANCE', title: 'أُعيد فتح أمر عمل', body: `${after.code}: ${reason}`, entityType: 'MAINTENANCE', entityId: id });
    return after;
  }
  async cancel(u: AuthUser, id: string, reason: string) {
    const r = await this.get(u, id);
    if (this.isTech(u) || (!this.scope.isStaff(u) && r.createdById !== u.sub)) throw new ForbiddenException('غير مصرح');
    return (await this.move(u, id, 'CANCELLED', {}, reason)).after;
  }

  async stats(u: AuthUser) {
    const w = await this.where(u);
    const [byStatus, overdue, rated] = await Promise.all([
      this.prisma.maintenanceRequest.groupBy({ by: ['status'], where: w, _count: true }),
      this.prisma.maintenanceRequest.count({ where: { ...w, status: { in: ['NEW', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_PARTS'] }, dueAt: { lt: new Date() } } }),
      this.prisma.maintenanceRequest.aggregate({ where: { ...w, rating: { not: null } }, _avg: { rating: true } }),
    ]);
    return { byStatus: Object.fromEntries(byStatus.map(s => [s.status, s._count])), overdue, avgRating: rated._avg.rating ? Math.round(rated._avg.rating * 10) / 10 : null };
  }
}
