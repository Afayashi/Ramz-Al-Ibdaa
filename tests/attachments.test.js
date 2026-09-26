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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ramz-attachment-test-'));
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

test('technician uploads maintenance attachment and related roles can view it', async () => {
  const { app } = makeTestContext();

  const admin = await registerAndLogin(app, {
    fullName: 'Admin A',
    email: 'admin.attach@test.com',
    password: 'StrongPassword!123',
    role: 'system_admin',
  });
  const employee = await registerAndLogin(app, {
    fullName: 'Emp A',
    email: 'emp.attach@test.com',
    password: 'StrongPassword!123',
    role: 'leasing_officer',
  });
  const owner = await registerAndLogin(app, {
    fullName: 'Owner A',
    email: 'owner.attach@test.com',
    password: 'StrongPassword!123',
    role: 'owner',
  });
  const tenant = await registerAndLogin(app, {
    fullName: 'Tenant A',
    email: 'tenant.attach@test.com',
    password: 'StrongPassword!123',
    role: 'tenant',
  });
  const otherTenant = await registerAndLogin(app, {
    fullName: 'Tenant B',
    email: 'tenant2.attach@test.com',
    password: 'StrongPassword!123',
    role: 'tenant',
  });
  const technician = await registerAndLogin(app, {
    fullName: 'Tech A',
    email: 'tech.attach@test.com',
    password: 'StrongPassword!123',
    role: 'technician',
  });

  const property = await request(app)
    .post('/admin/properties')
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + admin.token)
    .send({ ownerId: owner.userId, propertyName: 'Attach Property', address: 'Riyadh' });
  assert.equal(property.status, 201);

  const maintenance = await request(app)
    .post('/tenants/maintenance-requests')
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + tenant.token)
    .send({ propertyId: property.body.propertyId, issueDescription: 'Leak in bathroom' });
  assert.equal(maintenance.status, 201);

  const assignment = await request(app)
    .post(`/employees/maintenance-requests/${maintenance.body.maintenanceRequestId}/assign-technician`)
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + employee.token)
    .send({ technicianId: technician.userId });
  assert.equal(assignment.status, 201);

  const upload = await request(app)
    .post(`/technicians/work-orders/${assignment.body.workOrderId}/attachments`)
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + technician.token)
    .send({
      fileName: 'before-fix.jpg',
      fileUrl: 'https://cdn.example.com/work-orders/before-fix.jpg',
      fileType: 'image',
    });
  assert.equal(upload.status, 201);
  assert.equal(typeof upload.body.attachmentId, 'number');

  const tenantView = await request(app)
    .get(`/maintenance-requests/${maintenance.body.maintenanceRequestId}/attachments`)
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + tenant.token);
  assert.equal(tenantView.status, 200);
  assert.equal(tenantView.body.attachments.length, 1);

  const ownerView = await request(app)
    .get(`/maintenance-requests/${maintenance.body.maintenanceRequestId}/attachments`)
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + owner.token);
  assert.equal(ownerView.status, 200);
  assert.equal(ownerView.body.attachments.length, 1);

  const otherTenantView = await request(app)
    .get(`/maintenance-requests/${maintenance.body.maintenanceRequestId}/attachments`)
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + otherTenant.token);
  assert.equal(otherTenantView.status, 403);
});
