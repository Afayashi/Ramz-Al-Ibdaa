import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}
  log(action: string, userId?: string | null, ctx?: { ip?: string; userAgent?: string }, meta?: any) {
    return this.prisma.auditLog.create({ data: { action, userId: userId ?? null, ip: ctx?.ip, userAgent: ctx?.userAgent, meta } });
  }
}
