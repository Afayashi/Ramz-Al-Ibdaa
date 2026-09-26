import { PaymentFrequency } from '@prisma/client';

const STEP: Record<PaymentFrequency, number> = { MONTHLY: 1, QUARTERLY: 3, SEMI_ANNUAL: 6, ANNUAL: 12 };

export function addMonths(d: Date, n: number): Date {
  const r = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const last = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(d.getUTCDate(), last));
  return r;
}
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

/** Whole months covered by [start, end] where end is inclusive (e.g. 2026-01-01 → 2026-12-31 = 12). */
export function contractMonths(start: Date, end: Date): number {
  const next = addDays(end, 1);
  const m = (next.getUTCFullYear() - start.getUTCFullYear()) * 12 + next.getUTCMonth() - start.getUTCMonth();
  if (m < 1 || addMonths(start, m).getTime() !== next.getTime()) return -1;   // not a whole number of months
  return m;
}

export interface PlannedInstallment { seq: number; dueDate: Date; amount: number; vat: number; total: number }

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Splits the contract value into installments due at the start of each period; rounding remainder goes to the last one. */
export function planInstallments(start: Date, months: number, annualRent: number, freq: PaymentFrequency, vatPct: number): PlannedInstallment[] {
  const step = STEP[freq];
  const count = Math.ceil(months / step);
  const totalRent = r2(annualRent * months / 12);
  const base = r2(totalRent * step / months);
  const out: PlannedInstallment[] = [];
  let acc = 0;
  for (let i = 0; i < count; i++) {
    const amount = i === count - 1 ? r2(totalRent - acc) : base;
    acc = r2(acc + amount);
    const vat = r2(amount * vatPct / 100);
    out.push({ seq: i + 1, dueDate: addMonths(start, i * step), amount, vat, total: r2(amount + vat) });
  }
  return out;
}
