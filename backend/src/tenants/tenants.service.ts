import { Injectable, ConflictException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators';
import { CreateTenantDto, UpdateTenantDto } from './dto';

@Injectable()
export class TenantsService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  list(q?: string) {
    return this.prisma.tenant.findMany({
      where: { archivedAt: null, ...(q && { OR: [{ fullName: { contains: q, mode: 'insensitive' } }, { nationalId: { contains: q } }, { phone: { contains: q } }] }) },
      select: { id: true, kind: true, fullName: true, nationalId: true, phone: true, idExpiry: true },
      orderBy: { fullName: 'asc' }, take: 100,
    });
  }

  async get(id: string) {
    const t = await this.prisma.tenant.findFirst({ where: { id, archivedAt: null } });
    if (!t) throw new NotFoundException('المستأجر غير موجود');
    const attachments = await this.prisma.attachment.findMany({ where: { entityType: 'TENANT', entityId: id, archivedAt: null }, orderBy: { createdAt: 'desc' } });
    const idExpired = !!t.idExpiry && t.idExpiry < new Date();
    return { ...t, attachments, idExpired, hasIdDocument: attachments.some(a => a.category === 'NATIONAL_ID') };
  }

  // TC-RBAC-001: tenant sees own record only
  async me(u: AuthUser) {
    const t = await this.prisma.tenant.findUnique({ where: { userId: u.sub } });
    if (!t) throw new ForbiddenException('لا يوجد ملف مستأجر مرتبط بالحساب');
    return this.get(t.id);
  }

  async create(u: AuthUser, d: CreateTenantDto) {  // TC-TEN-001 / 002
    try {
      const t = await this.prisma.tenant.create({ data: { ...d, idExpiry: d.idExpiry ? new Date(d.idExpiry) : undefined } });
      await this.audit.log('TENANT_CREATED', u.sub, undefined, { id: t.id });
      return t;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('رقم الهوية مسجل لمستأجر آخر');
      throw e;
    }
  }

  async update(u: AuthUser, id: string, d: UpdateTenantDto) {
    await this.get(id);
    const t = await this.prisma.tenant.update({ where: { id }, data: { ...d, idExpiry: d.idExpiry ? new Date(d.idExpiry) : undefined } });
    await this.audit.log('TENANT_UPDATED', u.sub, undefined, { id, changes: Object.keys(d) });
    return t;
  }

  // Sprint 4 will block archiving tenants with an active contract
  async archive(u: AuthUser, id: string) {
    await this.get(id);
    await this.prisma.tenant.update({ where: { id }, data: { archivedAt: new Date() } });
    await this.audit.log('TENANT_ARCHIVED', u.sub, undefined, { id });
    return { ok: true };
  }
}
