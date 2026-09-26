import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuthUser } from './decorators';

// Row-level scoping: owners only see their own properties (TC-RBAC-002)
@Injectable()
export class ScopeService {
  constructor(private prisma: PrismaService) {}
  isStaff(u: AuthUser) { return u.roles.some(r => ['admin', 'employee', 'accountant'].includes(r)); }
  async ownerId(u: AuthUser): Promise<string | null> {
    if (this.isStaff(u)) return null;
    if (!u.roles.includes('owner')) throw new ForbiddenException('غير مصرح');
    const o = await this.prisma.owner.findUnique({ where: { userId: u.sub } });
    if (!o) throw new ForbiddenException('لا يوجد ملف مالك مرتبط بالحساب');
    return o.id;
  }
  async propertyWhere(u: AuthUser) { const id = await this.ownerId(u); return id ? { ownerId: id } : {}; }
}
