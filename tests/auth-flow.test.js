const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');
const sqlite3 = require('sqlite3').verbose();
const { createApp } = require('../src/server');

function makeTestApp() {
  process.env.NODE_ENV = 'test';
  process.env.APP_API_KEY = 'test-api-key';
  process.env.JWT_SECRET = 'test-jwt-secret';
  process.env.ENCRYPTION_KEY = 'test-encryption-key';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ramz-api-test-'));
  const dbPath = path.join(dir, 'app.db');
  return { app: createApp({ dbPath }), dbPath };
}

function queryOne(dbPath, sql, params = []) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath);
    db.get(sql, params, (error, row) => {
      db.close(() => {
        if (error) {
          reject(error);
          return;
        }
        resolve(row);
      });
    });
  });
}

test('register, login with 2FA, then access navigation flow', async () => {
  const { app, dbPath } = makeTestApp();

  const registerResponse = await request(app)
    .post('/auth/register')
    .set('x-api-key', 'test-api-key')
    .send({
      fullName: 'System Admin',
      email: 'admin@example.com',
      password: 'StrongPassword!123',
      role: 'system_admin',
      nationalId: '1023456789',
      bankAccount: 'SA0000000000000000000000',
    });

  assert.equal(registerResponse.status, 201);
  assert.equal(typeof registerResponse.body.userId, 'number');
  const registered = await queryOne(
    dbPath,
    'SELECT password_hash, national_id_encrypted, bank_account_encrypted FROM users WHERE id = ?',
    [registerResponse.body.userId],
  );
  assert.equal(registered.password_hash === 'StrongPassword!123', false);
  assert.equal(registered.national_id_encrypted === '1023456789', false);
  assert.equal(registered.bank_account_encrypted === 'SA0000000000000000000000', false);

  const loginResponse = await request(app)
    .post('/auth/login')
    .set('x-api-key', 'test-api-key')
    .send({
      email: 'admin@example.com',
      password: 'StrongPassword!123',
    });

  assert.equal(loginResponse.status, 200);
  assert.equal(loginResponse.body.twoFactorRequired, true);
  assert.equal(typeof loginResponse.body.challengeId, 'number');
  assert.equal(typeof loginResponse.body.testCode, 'string');

  const verifyResponse = await request(app)
    .post('/auth/verify-2fa')
    .set('x-api-key', 'test-api-key')
    .send({
      challengeId: loginResponse.body.challengeId,
      code: loginResponse.body.testCode,
    });

  assert.equal(verifyResponse.status, 200);
  assert.equal(typeof verifyResponse.body.token, 'string');

  const flowResponse = await request(app)
    .get('/navigation/flow')
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + verifyResponse.body.token);

  assert.equal(flowResponse.status, 200);
  assert.equal(flowResponse.body.role, 'system_admin');
  assert.equal(Array.isArray(flowResponse.body.flow.entry), true);
  assert.equal(Array.isArray(flowResponse.body.flow.workflows.maintenance), true);
});

test('RBAC blocks tenant from admin property creation endpoint', async () => {
  const { app } = makeTestApp();

  await request(app).post('/auth/register').set('x-api-key', 'test-api-key').send({
    fullName: 'Tenant User',
    email: 'tenant@example.com',
    password: 'StrongPassword!123',
    role: 'tenant',
  });

  const loginResponse = await request(app)
    .post('/auth/login')
    .set('x-api-key', 'test-api-key')
    .send({
      email: 'tenant@example.com',
      password: 'StrongPassword!123',
    });

  const verifyResponse = await request(app)
    .post('/auth/verify-2fa')
    .set('x-api-key', 'test-api-key')
    .send({
      challengeId: loginResponse.body.challengeId,
      code: loginResponse.body.testCode,
    });

  const blockedResponse = await request(app)
    .post('/admin/properties')
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + verifyResponse.body.token)
    .send({
      ownerId: 1,
      propertyName: 'Tower A',
      address: 'Riyadh',
    });

  assert.equal(blockedResponse.status, 403);
});
