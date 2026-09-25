import { createHmac } from 'crypto';
import { verifySignature } from './integrations';
import { SmsService } from './sms.service';

describe('webhook signature', () => {
  const raw = Buffer.from('{"id":"evt_1","type":"payment.paid"}');
  const sig = createHmac('sha256', 's3cret').update(raw).digest('hex');
  it('accepts valid', () => expect(() => verifySignature(raw, sig, 's3cret')).not.toThrow());
  it('accepts sha256= prefix', () => expect(() => verifySignature(raw, 'sha256=' + sig, 's3cret')).not.toThrow());
  it('rejects tampered', () => expect(() => verifySignature(Buffer.from('{}'), sig, 's3cret')).toThrow());
  it('rejects missing secret', () => expect(() => verifySignature(raw, sig, undefined)).toThrow());
});
describe('phone normalize', () => {
  it('05 → 966', () => expect(SmsService.normalize('0538521809')).toBe('966538521809'));
  it('rejects landline', () => expect(SmsService.normalize('0112345678')).toBeNull());
});
