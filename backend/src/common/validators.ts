import { registerDecorator, ValidationOptions } from 'class-validator';

// Saudi national ID / iqama: 10 digits, starts with 1 or 2, Luhn checksum. CR numbers (companies) are 10 digits starting with 1-7.
export function isSaudiId(v: string) {
  if (!/^[12]\d{9}$/.test(v)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    let d = Number(v[i]);
    if (i % 2 === 0) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}
export function isCr(v: string) { return /^[1-7]\d{9}$/.test(v); }

// ISO 13616 mod-97; Saudi IBAN = SA + 22 digits
export function isSaIban(raw: string) {
  const v = raw.replace(/\s+/g, '').toUpperCase();
  if (!/^SA\d{22}$/.test(v)) return false;
  const r = (v.slice(4) + v.slice(0, 4)).replace(/[A-Z]/g, c => String(c.charCodeAt(0) - 55));
  let m = 0;
  for (const ch of r) m = (m * 10 + Number(ch)) % 97;
  return m === 1;
}

const make = (name: string, fn: (v: any, o: any) => boolean, msg: string) => (opts?: ValidationOptions) => (obj: object, prop: string) =>
  registerDecorator({ name, target: obj.constructor, propertyName: prop, options: { message: msg, ...opts }, validator: { validate: (v, a) => typeof v === 'string' && fn(v, a!.object) } });

export const IsPartyId = make('isPartyId', (v, o) => (o.kind === 'COMPANY' ? isCr(v) : isSaudiId(v)), 'رقم الهوية أو السجل التجاري غير صحيح');
export const IsSaIban = make('isSaIban', isSaIban, 'رقم الآيبان غير صحيح');
export const IsSaMobile = make('isSaMobile', v => /^05\d{8}$/.test(v), 'رقم الجوال يجب أن يكون 05XXXXXXXX');
