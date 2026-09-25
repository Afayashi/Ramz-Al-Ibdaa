import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../prisma.service';
import { Public } from '../common/decorators';

@Controller('health')
export class HealthController {
  constructor(private prisma: PrismaService) {}
  @Public() @SkipThrottle() @Get()
  async check() {
    const t = Date.now();
    try { await this.prisma.$queryRaw`SELECT 1`; }
    catch { throw new ServiceUnavailableException({ status: 'down', db: 'unreachable' }); }
    return { status: 'ok', db: 'up', dbMs: Date.now() - t, uptime: Math.round(process.uptime()), version: process.env.APP_VERSION ?? 'dev' };
  }
}
