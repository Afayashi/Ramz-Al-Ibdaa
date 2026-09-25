import { planInstallments, contractMonths } from './installments';
const D = (s: string) => new Date(s + 'T00:00:00Z');

describe('installments', () => {
  it('counts whole months', () => {
    expect(contractMonths(D('2026-01-01'), D('2026-12-31'))).toBe(12);
    expect(contractMonths(D('2026-01-31'), D('2026-02-27'))).toBe(1);
    expect(contractMonths(D('2026-01-01'), D('2026-12-15'))).toBe(-1);
  });
  it('quarterly 12 months → 4 equal', () => {
    const p = planInstallments(D('2026-01-01'), 12, 60000, 'QUARTERLY', 0);
    expect(p.map(i => i.amount)).toEqual([15000, 15000, 15000, 15000]);
    expect(p[3].dueDate.toISOString().slice(0, 10)).toBe('2026-10-01');
  });
  it('rounding remainder on last + VAT', () => {
    const p = planInstallments(D('2026-01-01'), 12, 10000, 'MONTHLY', 15);
    expect(p.reduce((a, i) => a + i.amount, 0)).toBeCloseTo(10000, 2);
    expect(p[0].vat).toBe(125);
  });
  it('partial last period (8 months semi-annual)', () => {
    const p = planInstallments(D('2026-01-01'), 8, 12000, 'SEMI_ANNUAL', 0);
    expect(p.map(i => i.amount)).toEqual([6000, 2000]);
  });
});
