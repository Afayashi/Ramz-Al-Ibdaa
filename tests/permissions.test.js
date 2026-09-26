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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ramz-perm-test-'));
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

test('admin can manage role permissions and permission checks are enforced', async () => {
  const { app } = makeTestContext();

  const admin = await registerAndLogin(app, {
    fullName: 'Admin P',
    email: 'admin.permissions@test.com',
    password: 'StrongPassword!123',
    role: 'system_admin',
  });
  const ops = await registerAndLogin(app, {
    fullName: 'Ops P',
    email: 'ops.permissions@test.com',
    password: 'StrongPassword!123',
    role: 'operations_manager',
  });

  const listPermissions = await request(app)
    .get('/admin/permissions')
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + admin.token);
  assert.equal(listPermissions.status, 200);
  assert.equal(Array.isArray(listPermissions.body.permissions), true);
  assert.equal(
    listPermissions.body.permissions.some((p) => p.key === 'notifications:read:self'),
    true,
  );

  const beforeRead = await request(app)
    .get('/me/notifications')
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + ops.token);
  assert.equal(beforeRead.status, 403);

  const assignPermission = await request(app)
    .post('/admin/roles/operations_manager/permissions')
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + admin.token)
    .send({ permissions: ['notifications:read:self'] });
  assert.equal(assignPermission.status, 201);

  const afterRead = await request(app)
    .get('/me/notifications')
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + ops.token);
  assert.equal(afterRead.status, 200);
});
