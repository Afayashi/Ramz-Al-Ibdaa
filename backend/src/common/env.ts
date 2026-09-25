// Fail fast on missing / weak configuration (TC-SEC-001)
const REQUIRED = ['DATABASE_URL', 'JWT_ACCESS_SECRET'];

export function validateEnv() {
  const errors: string[] = [];
  for (const k of REQUIRED) if (!process.env[k]) errors.push(`${k} is required`);
  const prod = process.env.NODE_ENV === 'production';
  const s = process.env.JWT_ACCESS_SECRET ?? '';
  if (s && s.length < 32) errors.push('JWT_ACCESS_SECRET must be at least 32 characters');
  if (prod) {
    if (!process.env.CORS_ORIGINS) errors.push('CORS_ORIGINS must be set in production');
    if (/change|secret|example/i.test(s)) errors.push('JWT_ACCESS_SECRET looks like a placeholder');
    if (process.env.OTP_DEV_ECHO === 'true') errors.push('OTP_DEV_ECHO must be disabled in production');
  }
  if (errors.length) { console.error('Invalid configuration:\n - ' + errors.join('\n - ')); process.exit(1); }
}
