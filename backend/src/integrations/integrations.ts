import { Body, Controller, Get, Headers, HttpCode, Injectable, Logger, Param, ParseUUIDPipe, Post, Query, Req, BadRequestException, UnauthorizedException, NotFoundException } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { SmsService } from './sms.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Public, RequirePermissions } from '../common/decorators';

const SYSTEM = { sub: 'system', roles: ['admin'], perms: [] as string[] };

export function verifySignature(raw: Buffer | undefined, sig: string | undefined, secret: string | undefined) {
  if (!secret) throw new UnauthorizedException('Webhook secret not configured');
  if (!raw || !sig) throw new UnauthorizedException('Missing signature');
  const expected = createHmac('sha256', secret).update(raw).digest('hex');
  const a = Buffer.from(expected), b = Buffer.from(sig.replace(/^sha256=/, ''));
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException('Invalid signature');
}

@Injectable()
export class IntegrationsService {
  private log = new Logger('Integrations');
  constructor(private prisma: PrismaService, private payments: PaymentsService, private sms: SmsService, private notif: NotificationsService) {}

  /** Store first (idempotent on provider+eventId), then process. Duplicate deliveries return the stored result. */
  async receive(provider: string, body: any) {
    const eventId = String(body?.id ?? '');
    if (!eventId) throw new BadRequestException('event id required');
    const existing = await this.prisma.integrationEvent.findUnique({ where: { provider_eventId: { provider, eventId } } });
    if (existing && existing.status !== 'FAILED') return { ok: true, duplicate: true, status: existing.status };
    const ev = existing ?? await this.prisma.integrationEvent.create({ data: { provider, eventId, type: String(body.type ?? 'unknown'), payload: body } });
    return this.process(ev.id);
  }

  async process(id: string) {
    const ev = await this.prisma.integrationEvent.findUniqueOrThrow({ where: { id } });
    try {
      let status: 'PROCESSED' | 'IGNORED' = 'IGNORED';
      if (ev.provider === 'gateway' && ev.type === 'payment.paid') { await this.handlePayment(ev.payload as any); status = 'PROCESSED'; }
      if (ev.provider === 'ejar' && ev.type.startsWith('contract.')) status = await this.handleEjar(ev.type, ev.payload as any);
      await this.prisma.integrationEvent.update({ where: { id }, data: { status, processedAt: new Date(), error: null, attempts: { increment: 1 } } });
      return { ok: true, status };
    } catch (e) {
      const msg = (e as Error).message;
      this.log.warn(`event ${id} failed: ${msg}`);
      await this.prisma.integrationEvent.update({ where: { id }, data: { status: 'FAILED', error: msg, attempts: { increment: 1 } } });
      return { ok: false, status: 'FAILED', error: msg };
    }
  }

  // Payment gateway: { id, type: 'payment.paid', data: { id, amount (halalas), source: { type }, metadata: { installmentId } } }
  private async handlePayment(p: any) {
    const d = p?.data ?? {};
    const installmentId = d.metadata?.installmentId;
    if (!installmentId) throw new Error('metadata.installmentId missing');
    const already = await this.prisma.payment.findFirst({ where: { reference: String(d.id), voidedAt: null } });
    if (already) return already;
    const amount = Math.round(Number(d.amount)) / 100;
    if (!(amount > 0)) throw new Error('invalid amount');
    const method = ({ mada: 'MADA', creditcard: 'MADA', applepay: 'MADA', sadad: 'SADAD', banktransfer: 'BANK_TRANSFER' } as const)[String(d.source?.type ?? 'mada').toLowerCase() as 'mada'] ?? 'MADA';
    return this.payments.record(SYSTEM as any, { installmentId, amount, method, reference: String(d.id), paidAt: d.paid_at ?? d.created_at, notes: 'دفع إلكتروني عبر البوابة' });
  }

  // Ejar: { id, type: 'contract.registered' | 'contract.terminated', data: { contractCode, ejarNumber, reason? } }
  private async handleEjar(type: string, p: any): Promise<'PROCESSED' | 'IGNORED'> {
    const d = p?.data ?? {};
    const c = await this.prisma.contract.findFirst({ where: { OR: [{ code: d.contractCode ?? '' }, ...(d.ejarNumber ? [{ ejarNumber: String(d.ejarNumber) }] : [])] } });
    if (!c) throw new Error('العقد غير موجود: ' + (d.contractCode ?? d.ejarNumber));
    if (type === 'contract.registered') {
      if (!d.ejarNumber) throw new Error('ejarNumber missing');
      if (c.ejarNumber === String(d.ejarNumber)) return 'IGNORED';
      await this.prisma.contract.update({ where: { id: c.id }, data: { ejarNumber: String(d.ejarNumber) } });
      await this.notif.notify(await this.notif.staff(), { type: 'CONTRACT', title: 'تم توثيق العقد في إيجار', body: `${c.code} · ${d.ejarNumber}`, entityType: 'CONTRACT', entityId: c.id });
      return 'PROCESSED';
    }
    if (type === 'contract.terminated') {
      await this.notif.notify(await this.notif.staff(['admin']), { type: 'CONTRACT', title: 'إنهاء عقد من منصة إيجار', body: `${c.code}${d.reason ? ' — ' + d.reason : ''} · يلزم إنهاؤه في النظام ومحضر التسليم`, entityType: 'CONTRACT', entityId: c.id });
      return 'PROCESSED';
    }
    return 'IGNORED';
  }

  async status() {
    const [byStatus, lastEvents, msgs] = await Promise.all([
      this.prisma.integrationEvent.groupBy({ by: ['provider', 'status'], _count: true }),
      this.prisma.integrationEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, provider: true, type: true, status: true, error: true, createdAt: true } }),
      this.prisma.outboundMessage.groupBy({ by: ['status'], _count: true }),
    ]);
    return {
      connectors: {
        gateway: { configured: !!process.env.GATEWAY_WEBHOOK_SECRET, webhook: '/api/webhooks/gateway' },
        sms: { configured: !!process.env.SMS_API_URL, enabled: this.sms.enabled },
        ejar: { configured: !!process.env.EJAR_WEBHOOK_SECRET, webhook: '/api/webhooks/ejar' },
      },
      events: byStatus.map(x => ({ provider: x.provider, status: x.status, count: x._count })),
      messages: Object.fromEntries(msgs.map(m => [m.status, m._count])),
      lastEvents,
    };
  }
}

@Controller()
export class IntegrationsController {
  constructor(private svc: IntegrationsService, private sms: SmsService) {}

  @Public() @Post('webhooks/:provider') @HttpCode(200)
  webhook(@Param('provider') provider: string, @Req() req: RawBodyRequest<Request>, @Headers('x-signature') sig: string, @Body() body: any) {
    const secrets: Record<string, string | undefined> = { gateway: process.env.GATEWAY_WEBHOOK_SECRET, ejar: process.env.EJAR_WEBHOOK_SECRET };
    if (!(provider in secrets)) throw new NotFoundException('Unknown provider');
    verifySignature(req.rawBody, sig, secrets[provider]);
    return this.svc.receive(provider, body);
  }

  @Get('integrations/status') @RequirePermissions('integrations.manage') status() { return this.svc.status(); }
  @Post('integrations/events/:id/retry') @RequirePermissions('integrations.manage') retry(@Param('id', new ParseUUIDPipe()) id: string) { return this.svc.process(id); }
  @Post('integrations/sms/test') @RequirePermissions('integrations.manage') test(@Query('to') to: string) { return this.sms.send(to, 'رسالة تجريبية من شركة رمز الإبداع لإدارة الأملاك'); }
}
