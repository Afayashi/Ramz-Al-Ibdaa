import { Body, Controller, Get, Injectable, Post, Query, Res, BadRequestException, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { IsIn, IsUUID, IsOptional, IsDateString } from 'class-validator';
import type { Response } from 'express';
import { PrismaService } from '../prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { ContractsService } from '../contracts/contracts.service';
import { MaintenanceService } from '../maintenance/maintenance.service';
import { ReportsService } from '../reports/reports';
import { CurrentUser, AuthUser, Public } from '../common/decorators';

const TYPES = ['receipt', 'paymentDemand', 'renewalNotice', 'handoverIn', 'handoverOut', 'maintRequest', 'ownerStatement'] as const;
type DocType = typeof TYPES[number];
export class LinkDto {
  @IsIn(TYPES as unknown as string[]) type: DocType;
  @IsUUID('4') id: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const fmt = (n: unknown) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
const sar = (n: unknown) => fmt(n) + ' ﷼';
const d10 = (v: unknown) => (v ? new Date(v as any).toISOString().slice(0, 10) : '—');
const CO = { name: 'شركة رمز الإبداع لإدارة الأملاك', rep: process.env.DOC_SIGNER_NAME || 'علي فرحان موسى عياشي', bank: process.env.COMPANY_BANK || 'البنك الأهلي السعودي', iban: process.env.COMPANY_IBAN || 'SA9610000011100531178610' };

export function amountWords(n: number) {
  n = Math.round(n);
  const ones = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
  const tens = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
  const hund = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];
  const u = (x: number) => { const p: string[] = []; if (x >= 100) p.push(hund[Math.floor(x / 100)]); const r = x % 100; if (r) p.push(r < 20 ? ones[r] : r % 10 ? ones[r % 10] + ' و' + tens[Math.floor(r / 10)] : tens[Math.floor(r / 10)]); return p.join(' و'); };
  const sc = (x: number, one: string, two: string, few: string, many: string) => x === 1 ? one : x === 2 ? two : x <= 10 ? u(x) + ' ' + few : u(x) + ' ' + many;
  if (!n) return 'صفر ريال';
  const p: string[] = [], m = Math.floor(n / 1e6), t = Math.floor((n % 1e6) / 1000), r = n % 1000;
  if (m) p.push(sc(m, 'مليون', 'مليونان', 'ملايين', 'مليون'));
  if (t) p.push(sc(t, 'ألف', 'ألفان', 'آلاف', 'ألف'));
  if (r) p.push(u(r));
  return 'فقط ' + p.join(' و') + ' ريال سعودي لا غير';
}

interface Spec {
  title: string; subtitle?: string; status?: string; meta: [string, string][]; hero?: { label: string; amount: number };
  parties: [string, string][]; table?: { title: string; head: string[]; rows: string[][]; cols: string }; totals?: [string, string, boolean?][];
  paragraph?: string; kv?: [string, string][]; note?: string; signs: ('co' | 'stamp' | string)[]; ref: string;
}

function render(s: Spec) {
  const line = '<span class="blank"></span>';
  const sign = (x: string) => x === 'stamp' ? '<div class="sg c"><b>اعتماد الشركة</b><img class="stamp" src="/api/brand/stamp.jpg" alt=""></div>'
    : x === 'co' ? `<div class="sg"><b>ممثل الشركة</b><div class="sl"><img class="sig" src="/api/brand/signature.png" alt=""></div><small>${esc(CO.rep)}</small></div>`
    : `<div class="sg"><b>${esc(x.split('|')[0])}</b><div class="sl"></div><small>${esc(x.split('|')[1] ?? 'الاسم والتوقيع')}</small></div>`;
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(s.title)} · ${esc(s.meta[0]?.[1])}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Tajawal:wght@700;800&family=IBM+Plex+Sans+Arabic:wght@400;600;700&family=IBM+Plex+Mono:wght@500;600;700&display=swap">
<style>
@page{size:A4;margin:0}*{box-sizing:border-box}html,body{margin:0;background:#e9ebe8;direction:rtl}
body{font-family:'IBM Plex Sans Arabic',sans-serif;color:#1B2622;font-size:10.5pt;line-height:1.55}
.page{width:210mm;min-height:297mm;margin:10mm auto;background:#fff;padding:12mm 14mm 10mm;display:flex;flex-direction:column;gap:4.5mm;box-shadow:0 2px 12px rgba(0,0,0,.12)}
.mono{font-family:'IBM Plex Mono',monospace;unicode-bidi:isolate}.mut{color:#5B6B65}
.hd{display:flex;gap:5mm;align-items:flex-start}.hd img{width:24mm;height:24mm;object-fit:contain;margin-top:-2mm}.hd .t{flex:1}
.co{font-family:Tajawal;font-weight:700;color:#9A6B00}.ti{font-family:Tajawal;font-weight:800;font-size:20pt;line-height:1.2}
.pill{display:inline-block;padding:0 3mm;border-radius:99px;background:#FFF4D6;color:#7A5500;font-size:8.5pt;font-weight:700}
.meta{display:grid;grid-template-columns:auto auto;gap:1.5mm 5mm;padding:3.5mm 4.5mm;border:1px solid #DDE5E1;border-radius:3mm;background:#F7F7F4;font-size:9pt}.meta div:nth-child(even){font-weight:600;text-align:left}
.bar{height:.6mm;background:linear-gradient(to left,#1C1C1C 0 30%,#FDB913 30% 34%,#DDE5E1 34%)}
.hero{display:flex;justify-content:space-between;align-items:center;gap:6mm;padding:4.5mm 6mm;border-radius:3mm;background:#FFF4D6;border:1px solid #F2D88A}.hero .a{font-family:'IBM Plex Mono';font-weight:700;font-size:23pt;color:#7A5500;white-space:nowrap}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:#DDE5E1;border:1px solid #DDE5E1;border-radius:3mm;overflow:hidden}.grid>div{background:#fff;padding:2.6mm 4mm}.grid small{display:block;color:#5B6B65;font-size:8.5pt}.grid b{font-weight:600}
h3{font-family:Tajawal;font-size:12pt;margin:0 0 2mm}
.tb{border:1px solid #DDE5E1;border-radius:3mm;overflow:hidden;font-size:9.5pt}.tr{display:grid}.tr>div{padding:2.3mm 3mm}.th{background:#1C1C1C;color:#fff;font-weight:600}.tr:nth-child(odd):not(.th){background:#FAFAF7}
.tot{margin-inline-start:auto;width:78mm;border:1px solid #DDE5E1;border-radius:3mm;overflow:hidden}.tot div{display:flex;justify-content:space-between;padding:2.6mm 4mm}.tot .s{background:#FFF4D6;font-weight:700}.tot .s span:last-child{color:#7A5500;font-size:14pt}
.kv{border:1px solid #DDE5E1;border-radius:3mm;overflow:hidden}.kv div{display:grid;grid-template-columns:32mm 1fr;border-top:1px solid #EEF1EF}.kv div:first-child{border:0}.kv span{padding:2.8mm 4mm}.kv span:first-child{background:#F7F7F4;color:#5B6B65}.kv span:last-child{font-weight:600}
.blank{display:block;border-bottom:1px dotted #8FA39B;height:5mm}
.note{font-size:9pt;color:#5B6B65;padding:2.5mm 4mm;background:#F7F7F4;border-radius:3mm}.p{font-size:11pt;line-height:1.9}
.signs{margin-top:auto;display:grid;gap:8mm;align-items:end}.sg{display:flex;flex-direction:column;gap:1.5mm}.sg.c{align-items:center}.sl{height:20mm;border-bottom:1px solid #1B2622;display:flex;align-items:flex-end}
.sig{width:46mm;height:20mm;object-fit:cover;object-position:50% 52%;mix-blend-mode:multiply}.stamp{width:31mm;height:31mm;object-fit:contain;mix-blend-mode:multiply;transform:rotate(-8deg);opacity:.92}.sg small{color:#5B6B65}
.ft{display:flex;justify-content:space-between;border-top:1px solid #DDE5E1;padding-top:2.5mm;font-size:8pt;color:#5B6B65}
.bar-top{position:sticky;top:0;display:flex;justify-content:center;gap:8px;padding:10px;background:#1C1C1C}.bar-top button{font:inherit;font-weight:700;border:0;border-radius:8px;padding:8px 20px;background:#FDB913;cursor:pointer}
@media print{html,body{background:#fff}.page{margin:0;box-shadow:none;width:auto;min-height:297mm}.bar-top{display:none}}
</style></head><body>
<div class="bar-top"><button onclick="window.print()">طباعة / حفظ PDF</button></div>
<div class="page">
<div class="hd"><img src="/api/brand/logo.png" alt=""><div class="t"><div class="co">${CO.name}</div><div class="ti">${esc(s.title)}</div><div class="mut">${esc(s.subtitle ?? '')} ${s.status ? `<span class="pill">${esc(s.status)}</span>` : ''}</div></div>
<div class="meta">${s.meta.map(([k, v]) => `<div class="mut">${esc(k)}</div><div class="mono">${esc(v)}</div>`).join('')}</div></div>
<div class="bar"></div>
${s.hero ? `<div class="hero"><div><div style="color:#7A5500;font-size:9pt;font-weight:600">${esc(s.hero.label)}</div><b>${esc(amountWords(s.hero.amount))}</b></div><div class="a">${esc(sar(s.hero.amount))}</div></div>` : ''}
<div class="grid">${s.parties.map(([k, v]) => `<div><small>${esc(k)}</small><b class="${/^[\d\-A-Z]/.test(v) ? 'mono' : ''}">${esc(v || '—')}</b></div>`).join('')}</div>
${s.table ? `<div><h3>${esc(s.table.title)}</h3><div class="tb"><div class="tr th" style="grid-template-columns:${s.table.cols}">${s.table.head.map(h => `<div>${esc(h)}</div>`).join('')}</div>${s.table.rows.map(r => `<div class="tr" style="grid-template-columns:${s.table!.cols}">${r.map(c => `<div>${c === '' ? '&nbsp;' : esc(c)}</div>`).join('')}</div>`).join('')}</div></div>` : ''}
${s.totals ? `<div class="tot">${s.totals.map(([k, v, st]) => `<div class="${st ? 's' : ''}"><span>${esc(k)}</span><span class="mono">${esc(v)}</span></div>`).join('')}</div>` : ''}
${s.paragraph ? `<div class="p">${esc(s.paragraph)}</div>` : ''}
${s.kv ? `<div class="kv">${s.kv.map(([k, v]) => `<div><span>${esc(k)}</span><span>${v ? esc(v) : line}</span></div>`).join('')}</div>` : ''}
${s.note ? `<div class="note">${esc(s.note)}</div>` : ''}
<div class="signs" style="grid-template-columns:repeat(${s.signs.length},1fr)">${s.signs.map(sign).join('')}</div>
<div class="ft"><span>${CO.name}</span><span>مرجع داخلي: <span class="mono">${esc(s.ref)}</span></span></div>
</div></body></html>`;
}

@Injectable()
export class DocumentsService {
  constructor(private prisma: PrismaService, private jwt: JwtService, private payments: PaymentsService, private contracts: ContractsService, private maint: MaintenanceService, private reports: ReportsService) {}

  // Short-lived signed link so the document can open in any browser without the app's bearer token
  async link(u: AuthUser, d: LinkDto) {
    await this.spec(u, d); // authorizes + validates now
    const t = await this.jwt.signAsync({ p: 'doc', u: { sub: u.sub, roles: u.roles, perms: u.perms }, d }, { secret: process.env.JWT_ACCESS_SECRET, expiresIn: '10m' });
    return { url: `/api/documents/view?t=${t}`, expiresIn: 600 };
  }

  async view(t: string) {
    let payload: any;
    try { payload = await this.jwt.verifyAsync(t, { secret: process.env.JWT_ACCESS_SECRET }); } catch { throw new UnauthorizedException('انتهت صلاحية الرابط'); }
    if (payload.p !== 'doc') throw new UnauthorizedException();
    return render(await this.spec(payload.u, payload.d));
  }

  private async spec(u: AuthUser, d: LinkDto): Promise<Spec> {
    const today = d10(new Date());
    if (d.type === 'receipt') {
      const p = await this.payments.get(u, d.id);
      const c = await this.contracts.get(u, p.contractId);
      return { title: 'سند قبض', subtitle: `إيجار — القسط ${p.installment.seq}`, status: p.voidedAt ? 'ملغي' : undefined,
        meta: [['رقم السند', p.receiptNo], ['تاريخ السند', d10(p.paidAt)]], hero: { label: 'المبلغ المستلم', amount: Number(p.amount) },
        parties: [['المستأجر', c.tenant.fullName], ['رقم الهوية', c.tenant.nationalId], ['رقم التواصل', c.tenant.phone], ['العقار', c.unit.property.name], ['الوحدة', c.unit.number], ['رقم العقد', c.ejarNumber ?? c.code]],
        paragraph: `نقرّ نحن ${CO.name} باستلام مبلغ وقدره ${fmt(p.amount)} ريال سعودي من المستأجر الموضحة بياناته أعلاه، وذلك مقابل القسط رقم (${p.installment.seq}) المستحق بتاريخ ${d10(p.installment.dueDate)} من العقد ${c.code}.`,
        kv: [['طريقة السداد', ({ CASH: 'نقداً', BANK_TRANSFER: 'تحويل بنكي', MADA: 'مدى', SADAD: 'سداد', CHEQUE: 'شيك' } as any)[p.method]], ['المرجع', p.reference ?? ''], ['ملاحظات', p.notes ?? '']],
        note: 'هذا السند محرر للغرض الموضح أعلاه، ويحتفظ كل طرف بنسخة منه عند الحاجة.', signs: ['co', 'stamp'], ref: `${p.receiptNo}-${c.code}` };
    }
    if (d.type === 'maintRequest') {
      const m: any = await this.maint.get(u, d.id);
      const CAT: any = { PLUMBING: 'سباكة', ELECTRICAL: 'كهرباء', AC: 'تكييف', CARPENTRY: 'نجارة', PAINTING: 'دهانات', APPLIANCE: 'أجهزة', CLEANING: 'نظافة', OTHER: 'أخرى' };
      const PR: any = { URGENT: 'عاجل', HIGH: 'مرتفع', MEDIUM: 'عادي', LOW: 'منخفض' };
      const done = ['COMPLETED', 'CLOSED'].includes(m.status);
      return { title: 'نموذج طلب صيانة', subtitle: `${CAT[m.category]} · أولوية ${PR[m.priority]}`, status: done ? 'مكتمل' : 'قيد التنفيذ',
        meta: [['رقم الطلب', m.code], ['تاريخ الإصدار', d10(m.createdAt)]],
        parties: [['العقار', m.unit.property.name], ['الوحدة', m.unit.number], ['المدينة', m.unit.property.city], ['المستأجر', m.tenant?.fullName ?? '—'], ['رقم التواصل', m.tenant?.phone ?? '—'], ['الفني', m.technician?.fullName ?? '—']],
        kv: [['وصف العطل', m.description], ['الإجراء المتخذ', m.workReport ?? ''], ['التكلفة', Number(m.cost) ? sar(m.cost) : ''], ['تاريخ الإنجاز', m.completedAt ? d10(m.completedAt) : '']],
        signs: [`مقدّم الطلب|${m.tenant?.fullName ?? 'الاسم والتوقيع'}`, `الفني|${m.technician?.fullName ?? 'الاسم والتوقيع'}`, 'stamp'], ref: m.code };
    }
    if (d.type === 'ownerStatement') {
      const from = d.from ?? today.slice(0, 8) + '01', to = d.to ?? today;
      const r: any = await this.reports.ownerStatement(u, { ownerId: d.id, from, to });
      return { title: 'كشف حساب مالك', subtitle: `الفترة من ${from} إلى ${to}`, meta: [['رقم الكشف', `STM-${to.replace(/-/g, '')}`], ['تاريخ الإصدار', today]],
        parties: [['المالك', r.owner.fullName], ['نسبة العمولة', r.owner.commissionPct + '٪'], ['الآيبان', r.owner.iban ?? '—']],
        table: { title: 'التحصيلات', head: ['التاريخ', 'المستأجر', 'الوحدة', 'السند', 'المبلغ'], cols: '24mm 1fr 22mm 40mm 28mm',
          rows: r.receipts.length ? r.receipts.map((x: any) => [d10(x.date), x.tenant, x.unit, x.receiptNo, sar(x.amount)]) : [['—', 'لا توجد تحصيلات', '', '', '']] },
        totals: [['التحصيلات (بدون الضريبة)', sar(r.totals.collected)], ['مصروفات الصيانة', '- ' + sar(r.totals.maintenance)], ['عمولة الإدارة', '- ' + sar(r.totals.commission)], ['صافي المستحق', sar(r.totals.net), true]],
        note: 'أُعدّ هذا الكشف من سجلات التحصيل المعتمدة، ويُعد معتمداً ما لم ترد ملاحظات خلال سبعة أيام.', signs: ['co', 'stamp'], ref: `STM-${d.id.slice(0, 8)}-${to}` };
    }
    const c: any = await this.contracts.get(u, d.id);
    const parties: [string, string][] = [['المستأجر', c.tenant.fullName], ['رقم الهوية', c.tenant.nationalId], ['رقم التواصل', c.tenant.phone], ['العقار', c.unit.property.name], ['الوحدة', c.unit.number], ['رقم العقد', c.ejarNumber ?? c.code]];
    if (d.type === 'paymentDemand') {
      const late = c.installments.filter((i: any) => i.status === 'OVERDUE');
      const total = late.reduce((a: number, i: any) => a + Number(i.total) - Number(i.paidAmount), 0);
      return { title: 'إشعار مطالبة بالسداد', subtitle: 'مستحقات إيجار متأخرة', status: `${late.length} أقساط متأخرة`, meta: [['رقم الإشعار', `DMD-${c.code}`], ['التاريخ', today]], parties,
        table: { title: 'الأقساط المستحقة', head: ['القسط', 'الاستحقاق', 'أيام التأخير', 'المتبقي'], cols: '18mm 1fr 30mm 32mm',
          rows: late.length ? late.map((i: any) => [String(i.seq), d10(i.dueDate), String(Math.max(0, Math.round((Date.now() - new Date(i.dueDate).getTime()) / 864e5))), sar(Number(i.total) - Number(i.paidAmount))]) : [['—', 'لا توجد متأخرات', '', '']] },
        totals: [['إجمالي المستحق', sar(total), true]],
        paragraph: `نفيدكم بأن الأقساط الموضحة أعلاه من العقد ${c.ejarNumber ?? c.code} لم تُسدَّد حتى تاريخه. نأمل السداد خلال سبعة أيام من تاريخ هذا الإشعار، وفي حال عدم السداد ستُتخذ الإجراءات النظامية وفق بنود العقد والأنظمة المعمول بها في منصة إيجار.`,
        kv: [['البنك', CO.bank], ['الآيبان', CO.iban]], signs: ['co', 'stamp'], ref: `DMD-${c.code}-${today}` };
    }
    if (d.type === 'renewalNotice') return { title: 'إشعار تجديد عقد الإيجار', subtitle: `ينتهي العقد بتاريخ ${d10(c.endDate)}`, meta: [['رقم الإشعار', `RNW-${c.code}`], ['التاريخ', today]], parties,
      paragraph: `إشارة إلى العقد ${c.ejarNumber ?? c.code} المنتهي بتاريخ ${d10(c.endDate)}، نأمل إفادتنا برغبتكم في التجديد أو عدمه خلال ثلاثين يوماً قبل تاريخ الانتهاء، علماً بأن عدم الرد يُعد رغبة في عدم التجديد.`,
      table: { title: 'الشروط المقترحة', head: ['البند', 'الحالي', 'المجدد'], cols: '1fr 44mm 44mm', rows: [['الإيجار السنوي', sar(c.annualRent), sar(c.annualRent)], ['الضريبة', c.vatPct + '٪', c.vatPct + '٪'], ['التأمين', sar(c.deposit), sar(c.deposit)]] },
      kv: [['رد المستأجر', '☐ أرغب في التجديد    ☐ لا أرغب في التجديد']], signs: ['co', `المستأجر|${c.tenant.fullName}`, 'stamp'], ref: `RNW-${c.code}` };
    const type = d.type === 'handoverOut' ? 'MOVE_OUT' : 'MOVE_IN';
    const h: any = await this.prisma.handover.findUnique({ where: { contractId_type: { contractId: c.id, type } } });
    const CND: any = { GOOD: 'سليم', FAIR: 'مقبول', DAMAGED: 'تالف' };
    const items = (h?.items as any[]) ?? [];
    const deds = (h?.deductions as any[]) ?? [];
    return { title: type === 'MOVE_OUT' ? 'محضر تسليم وإخلاء وحدة' : 'محضر استلام وحدة', subtitle: `${c.unit.property.name} · وحدة ${c.unit.number}`, status: h ? (h.status === 'SIGNED' ? 'موقّع' : 'مسودة') : 'غير محرر',
      meta: [['رقم المحضر', `${type === 'MOVE_OUT' ? 'HO' : 'HI'}-${c.code}`], ['التاريخ', h ? d10(h.signedAt ?? h.updatedAt) : today]], parties,
      table: { title: 'فحص حالة الوحدة', head: ['البند', 'الحالة', 'ملاحظات'], cols: '1fr 26mm 1.3fr', rows: items.length ? items.map(i => [i.area, CND[i.condition] ?? '', i.note ?? '']) : [['—', '', '']] },
      kv: [['عداد الكهرباء', h?.electricity != null ? String(h.electricity) : ''], ['عداد المياه', h?.water != null ? String(h.water) : ''], ['عدد المفاتيح', h ? String(h.keysCount) : ''],
        ...(type === 'MOVE_OUT' ? [['مبلغ التأمين', sar(c.deposit)], ['الخصومات', deds.map(x => `${x.label}: ${sar(x.amount)}`).join('، ')], ['المبلغ المسترد', h?.depositRefund != null ? sar(h.depositRefund) : '']] as [string, string][] : [])],
      note: type === 'MOVE_OUT' ? 'يقرّ المستأجر بتسليم الوحدة بالحالة الموضحة، وتُخصم تكاليف سوء الاستخدام من التأمين ويُعاد المتبقي وفق العقد.' : 'يقرّ المستأجر باستلام الوحدة بالحالة الموضحة ويلتزم بإعادتها بنفس الحالة عدا الاستهلاك الطبيعي.',
      signs: [`المستأجر|${c.tenant.fullName}`, 'co', 'stamp'], ref: `${type}-${c.code}` };
  }
}

@Controller('documents')
export class DocumentsController {
  constructor(private svc: DocumentsService) {}
  @Post('link') link(@CurrentUser() u: AuthUser, @Body() d: LinkDto) { return this.svc.link(u, d); }
  @Public() @Get('view') async view(@Query('t') t: string, @Res() res: Response) {
    if (!t) throw new BadRequestException();
    const html = await this.svc.view(t);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'");
    res.send(html);
  }
}
