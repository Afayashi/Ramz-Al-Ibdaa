import { Body, Controller, Get, Injectable, Param, ParseUUIDPipe, Patch, Post, Query, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { IsString, IsNotEmpty, IsOptional, IsUUID, IsEnum, IsDateString, MaxLength } from 'class-validator';
import { MaintPriority, TaskStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, AuthUser, RequirePermissions } from '../common/decorators';

export class CreateTaskDto {
  @IsString() @IsNotEmpty({ message: 'العنوان مطلوب' }) @MaxLength(160) title: string;
  @IsOptional() @IsString() description?: string;
  @IsUUID('4') assigneeId: string;
  @IsOptional() @IsEnum(MaintPriority) priority?: MaintPriority;
  @IsOptional() @IsDateString() dueAt?: string;
  @IsOptional() @IsString() entityType?: string;
  @IsOptional() @IsUUID('4') entityId?: string;
}
export class UpdateTaskDto {
  @IsOptional() @IsEnum(TaskStatus) status?: TaskStatus;
  @IsOptional() @IsUUID('4') assigneeId?: string;
  @IsOptional() @IsDateString() dueAt?: string;
  @IsOptional() @IsEnum(MaintPriority) priority?: MaintPriority;
}
export class TaskQuery {
  @IsOptional() @IsString() scope?: 'mine' | 'all' | 'created';
  @IsOptional() @IsEnum(TaskStatus) status?: TaskStatus;
}

const INCLUDE = { assignee: { select: { id: true, fullName: true } } } satisfies Prisma.TaskInclude;

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService, private notif: NotificationsService, private audit: AuditService) {}
  private manager = (u: AuthUser) => u.roles.includes('admin');

  async list(u: AuthUser, q: TaskQuery) {
    const scope = q.scope ?? 'mine';
    if (scope === 'all' && !this.manager(u)) throw new ForbiddenException('غير مصرح');
    const rows = await this.prisma.task.findMany({
      where: { ...(scope === 'mine' && { assigneeId: u.sub }), ...(scope === 'created' && { createdById: u.sub }), ...(q.status ? { status: q.status } : { status: { in: ['TODO', 'IN_PROGRESS'] } }) },
      include: INCLUDE, orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }], take: 200,
    });
    const now = Date.now();
    return rows.map(t => ({ ...t, overdue: !!t.dueAt && t.dueAt.getTime() < now && (t.status === 'TODO' || t.status === 'IN_PROGRESS') }));
  }

  assignees() {
    return this.prisma.user.findMany({ where: { status: 'ACTIVE', roles: { some: { role: { code: { in: ['admin', 'employee', 'accountant'] } } } } }, select: { id: true, fullName: true }, orderBy: { fullName: 'asc' } });
  }

  async create(u: AuthUser, d: CreateTaskDto) {
    const a = await this.prisma.user.findFirst({ where: { id: d.assigneeId, status: 'ACTIVE' } });
    if (!a) throw new BadRequestException('المكلَّف غير موجود');
    if (d.dueAt && new Date(d.dueAt) < new Date(Date.now() - 86_400_000)) throw new BadRequestException('تاريخ الاستحقاق في الماضي');
    const t = await this.prisma.task.create({ data: { ...d, dueAt: d.dueAt ? new Date(d.dueAt) : null, createdById: u.sub }, include: INCLUDE });
    if (a.id !== u.sub) await this.notif.notify([a.id], { type: 'SYSTEM', title: 'مهمة جديدة', body: t.title, entityType: 'TASK', entityId: t.id });
    await this.audit.log('TASK_CREATED', u.sub, undefined, { id: t.id });
    return t;
  }

  async update(u: AuthUser, id: string, d: UpdateTaskDto) {
    const t = await this.prisma.task.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('المهمة غير موجودة');
    const owner = t.assigneeId === u.sub || t.createdById === u.sub || this.manager(u);
    if (!owner) throw new ForbiddenException('غير مصرح');
    if ((d.assigneeId || d.dueAt || d.priority) && t.createdById !== u.sub && !this.manager(u)) throw new ForbiddenException('التعديل لمنشئ المهمة فقط');
    const res = await this.prisma.task.update({ where: { id }, include: INCLUDE, data: {
      ...d, ...(d.dueAt && { dueAt: new Date(d.dueAt) }),
      ...(d.status === 'DONE' && { completedAt: new Date() }), ...(d.status && d.status !== 'DONE' && { completedAt: null }),
    } });
    if (d.assigneeId && d.assigneeId !== t.assigneeId) await this.notif.notify([d.assigneeId], { type: 'SYSTEM', title: 'أُسندت إليك مهمة', body: res.title, entityType: 'TASK', entityId: id });
    if (d.status === 'DONE' && t.createdById !== u.sub) await this.notif.notify([t.createdById], { type: 'SYSTEM', title: 'أُنجزت مهمة', body: res.title, entityType: 'TASK', entityId: id });
    return res;
  }

  // Called from the daily job: renewal follow-up 60 days before contract end (idempotent)
  async autoRenewalTasks() {
    const from = new Date(Date.now() + 59 * 86_400_000), to = new Date(Date.now() + 61 * 86_400_000);
    const cs = await this.prisma.contract.findMany({ where: { status: 'ACTIVE', endDate: { gte: from, lt: to }, renewedTo: null }, include: { tenant: true, unit: { include: { property: true } } } });
    const staff = await this.prisma.user.findMany({ where: { status: 'ACTIVE', roles: { some: { role: { code: 'employee' } } } }, select: { id: true } });
    if (!staff.length) return 0;
    let n = 0;
    for (const [i, c] of cs.entries()) {
      const assigneeId = staff[i % staff.length].id;
      const r = await this.prisma.task.createMany({ skipDuplicates: true, data: [{ title: 'متابعة تجديد العقد', description: `${c.code} · ${c.tenant.fullName} · ${c.unit.property.name} ${c.unit.number}`,
        assigneeId, createdById: assigneeId, priority: 'HIGH', dueAt: new Date(Date.now() + 14 * 86_400_000), entityType: 'CONTRACT', entityId: c.id }] });
      if (r.count) { n++; await this.notif.notify([assigneeId], { type: 'CONTRACT', title: 'مهمة تجديد', body: c.code, entityType: 'CONTRACT', entityId: c.id }); }
    }
    return n;
  }
}

@Controller('tasks')
export class TasksController {
  constructor(private svc: TasksService) {}
  @Get() list(@CurrentUser() u: AuthUser, @Query() q: TaskQuery) { return this.svc.list(u, q); }
  @Get('assignees') @RequirePermissions('tasks.write') assignees() { return this.svc.assignees(); }
  @Post() @RequirePermissions('tasks.write') create(@CurrentUser() u: AuthUser, @Body() d: CreateTaskDto) { return this.svc.create(u, d); }
  @Patch(':id') update(@CurrentUser() u: AuthUser, @Param('id', new ParseUUIDPipe()) id: string, @Body() d: UpdateTaskDto) { return this.svc.update(u, id, d); }
}
