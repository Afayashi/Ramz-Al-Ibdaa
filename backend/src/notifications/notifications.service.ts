import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { SmsService } from '../integrations/sms.service';

export interface NotifyInput { type: 'CONTRACT' | 'PAYMENT' | 'MAINTENANCE' | 'HANDOVER' | 'SYSTEM'; title: string; body: string; entityType?: string; entityId?: string }

@Injectable()
export class NotificationsService {
  private log = new Logger('Notifications');
  constructor(private prisma: PrismaService, private sms: SmsService) {}
  private static SMS_TYPES = new Set(['PAYMENT', 'CONTRACT']);

  // Never throws — a failed notification must not roll back business actions. Push/SMS channels plug in here (Sprint 11).
  async notify(userIds: (string | null | undefined)[], n: NotifyInput) {
    const ids = [...new Set(userIds.filter((x): x is string => !!x))];
    if (!ids.length) return;
    try {
      await this.prisma.notification.createMany({ data: ids.map(userId => ({ userId, ...n })) });
      if (this.sms.enabled && NotificationsService.SMS_TYPES.has(n.type)) {
        const users = await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { phone: true } });
        for (const u of users) await this.sms.send(u.phone, `${n.title}: ${n.body}`);
      }
    }
    catch (e) { this.log.warn(`notify failed: ${(e as Error).message}`); }
  }

  async staff(roles: string[] = ['admin', 'employee']) {
    const us = await this.prisma.user.findMany({ where: { status: 'ACTIVE', roles: { some: { role: { code: { in: roles } } } } }, select: { id: true } });
    return us.map(u => u.id);
  }
  async tenantUser(tenantId?: string | null) {
    if (!tenantId) return null;
    return (await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { userId: true } }))?.userId ?? null;
  }
  async ownerUserOfUnit(unitId: string) {
    const u = await this.prisma.unit.findUnique({ where: { id: unitId }, select: { property: { select: { owner: { select: { userId: true } } } } } });
    return u?.property.owner.userId ?? null;
  }

  list(userId: string) { return this.prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 100 }); }
  unread(userId: string) { return this.prisma.notification.count({ where: { userId, readAt: null } }).then(count => ({ count })); }
  read(userId: string, id: string) { return this.prisma.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } }); }
  readAll(userId: string) { return this.prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } }); }
}
