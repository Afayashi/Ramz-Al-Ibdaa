const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');
const { createApp } = require('../src/server');

function makeTestContext() {
  process.env.NODE_ENV = 'test';
  process.env.APP_API_KEY = 'test-api-key';
  process.env.JWT_SECRET = 'test-jwt-secret';
  process.env.ENCRYPTION_KEY = 'test-encryption-key';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ramz-audit-test-'));
  const dbPath = path.join(dir, 'app.db');
  return { app: createApp({ dbPath }) };
}

async function registerAndLogin(app, user) {
  const register = await request(app)
    .post('/auth/register')
    .set('x-api-key', 'test-api-key')
    .send(user);
  assert.equal(register.status, 201);

  const login = await request(app)
    .post('/auth/login')
    .set('x-api-key', 'test-api-key')
    .send({ email: user.email, password: user.password });
  assert.equal(login.status, 200);

  const verify = await request(app)
    .post('/auth/verify-2fa')
    .set('x-api-key', 'test-api-key')
    .send({ challengeId: login.body.challengeId, code: login.body.testCode });
  assert.equal(verify.status, 200);

  return { userId: register.body.userId, token: verify.body.token };
}

test('audit APIs support filtering, pagination, summary and access control', async () => {
  const { app } = makeTestContext();

  const admin = await registerAndLogin(app, {
    fullName: 'Audit Admin',
    email: 'audit.admin@test.com',
    password: 'StrongPassword!123',
    role: 'system_admin',
  });
  const auditor = await registerAndLogin(app, {
    fullName: 'Audit User',
    email: 'audit.user@test.com',
    password: 'StrongPassword!123',
    role: 'financial_auditor',
  });
  const owner = await registerAndLogin(app, {
    fullName: 'Owner Audit',
    email: 'owner.audit@test.com',
    password: 'StrongPassword!123',
    role: 'owner',
  });

  await request(app)
    .post('/admin/properties')
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + admin.token)
    .send({ ownerId: owner.userId, propertyName: 'Audit P1', address: 'Riyadh' });
  await request(app)
    .post('/admin/properties')
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + admin.token)
    .send({ ownerId: owner.userId, propertyName: 'Audit P2', address: 'Jeddah' });

  const forbidden = await request(app)
    .get('/security/audit-logs')
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + owner.token);
  assert.equal(forbidden.status, 403);

  const paged = await request(app)
    .get('/security/audit-logs')
    .query({ action: 'PROPERTY_CREATE', page: 1, limit: 1 })
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + auditor.token);
  assert.equal(paged.status, 200);
  assert.equal(paged.body.page, 1);
  assert.equal(paged.body.limit, 1);
  assert.equal(paged.body.totalCount >= 2, true);
  assert.equal(paged.body.logs.length, 1);
  assert.equal(paged.body.logs[0].action, 'PROPERTY_CREATE');

  const byActor = await request(app)
    .get('/security/audit-logs')
    .query({ actorUserId: admin.userId, targetType: 'properties' })
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + auditor.token);
  assert.equal(byActor.status, 200);
  assert.equal(byActor.body.logs.length >= 2, true);

  const summary = await request(app)
    .get('/security/audit-logs/summary')
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + auditor.token);
  assert.equal(summary.status, 200);
  assert.equal(summary.body.summary.some((item) => item.action === 'PROPERTY_CREATE'), true);
});
