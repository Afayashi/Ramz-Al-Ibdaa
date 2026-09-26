import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

/** Generic HTTP SMS connector (Unifonic / Taqnyat / Msegat style). Configure via env; without config messages are logged as SKIPPED. */
@Injectable()
export class SmsService {
  private log = new Logger('SMS');
  constructor(private prisma: PrismaService) {}
  get enabled() { return !!process.env.SMS_API_URL && process.env.SMS_ENABLED === 'true'; }

  static normalize(phone: string) {
    const d = phone.replace(/\D/g, '');
    if (/^05\d{8}$/.test(d)) return '966' + d.slice(1);
    if (/^9665\d{8}$/.test(d)) return d;
    return null;
  }

  async send(to: string, body: string) {
    const phone = SmsService.normalize(to);
    const msg = await this.prisma.outboundMessage.create({ data: { channel: 'SMS', to: phone ?? to, body, status: phone && this.enabled ? 'QUEUED' : 'SKIPPED', error: phone ? null : 'رقم غير صالح' } });
    if (!phone || !this.enabled) return msg;
    return this.deliver(msg.id);
  }

  async deliver(id: string) {
    const m = await this.prisma.outboundMessage.findUniqueOrThrow({ where: { id } });
    try {
      const res = await fetch(process.env.SMS_API_URL!, {
        method: 'POST', signal: AbortSignal.timeout(10_000),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SMS_API_KEY ?? ''}` },
        body: JSON.stringify({ recipient: m.to, body: m.body, sender: process.env.SMS_SENDER ?? 'RAMZ' }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      let ref: string | null = null; try { const j = JSON.parse(text); ref = j.id ?? j.messageId ?? j.data?.id ?? null; } catch {}
      return this.prisma.outboundMessage.update({ where: { id }, data: { status: 'SENT', sentAt: new Date(), providerRef: ref, attempts: { increment: 1 }, error: null } });
    } catch (e) {
      this.log.warn(`SMS ${id} failed: ${(e as Error).message}`);
      return this.prisma.outboundMessage.update({ where: { id }, data: { status: 'FAILED', error: (e as Error).message, attempts: { increment: 1 } } });
    }
  }

  // Retries failed messages (max 3 attempts) — called from the daily job
  async retryFailed() {
    if (!this.enabled) return 0;
    const failed = await this.prisma.outboundMessage.findMany({ where: { status: 'FAILED', attempts: { lt: 3 } }, take: 100 });
    for (const m of failed) await this.deliver(m.id);
    return failed.length;
  }
}
