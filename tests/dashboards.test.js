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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ramz-dashboard-test-'));
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

test('dashboard/me returns role-specific aggregates', async () => {
  const { app } = makeTestContext();

  const admin = await registerAndLogin(app, {
    fullName: 'Admin D',
    email: 'admin.dashboard@test.com',
    password: 'StrongPassword!123',
    role: 'system_admin',
  });
  const employee = await registerAndLogin(app, {
    fullName: 'Employee D',
    email: 'employee.dashboard@test.com',
    password: 'StrongPassword!123',
    role: 'leasing_officer',
  });
  const owner = await registerAndLogin(app, {
    fullName: 'Owner D',
    email: 'owner.dashboard@test.com',
    password: 'StrongPassword!123',
    role: 'owner',
  });
  const tenant = await registerAndLogin(app, {
    fullName: 'Tenant D',
    email: 'tenant.dashboard@test.com',
    password: 'StrongPassword!123',
    role: 'tenant',
  });
  const technician = await registerAndLogin(app, {
    fullName: 'Tech D',
    email: 'tech.dashboard@test.com',
    password: 'StrongPassword!123',
    role: 'technician',
  });

  const property = await request(app)
    .post('/admin/properties')
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + admin.token)
    .send({ ownerId: owner.userId, propertyName: 'Dash Prop', address: 'Riyadh' });
  assert.equal(property.status, 201);

  const unit = await request(app)
    .post('/employees/units')
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + employee.token)
    .send({ propertyId: property.body.propertyId, unitNumber: 'C-10', unitType: 'apartment', rentAmount: 2000 });
  assert.equal(unit.status, 201);

  const contract = await request(app)
    .post('/employees/contracts')
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + employee.token)
    .send({
      unitId: unit.body.unitId,
      ownerId: owner.userId,
      tenantId: tenant.userId,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    });
  assert.equal(contract.status, 201);

  await request(app)
    .patch(`/management/contracts/${contract.body.contractId}/approve`)
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + admin.token);
  await request(app)
    .patch(`/tenants/contracts/${contract.body.contractId}/sign`)
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + tenant.token);
  await request(app)
    .patch(`/employees/contracts/${contract.body.contractId}/activate`)
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + employee.token);

  await request(app)
    .post('/tenants/payments')
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + tenant.token)
    .send({ contractId: contract.body.contractId, amount: 2000, paymentDate: '2026-02-01' });

  const maintenance = await request(app)
    .post('/tenants/maintenance-requests')
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + tenant.token)
    .send({ propertyId: property.body.propertyId, issueDescription: 'Broken AC' });
  assert.equal(maintenance.status, 201);

  const assign = await request(app)
    .post(`/employees/maintenance-requests/${maintenance.body.maintenanceRequestId}/assign-technician`)
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + employee.token)
    .send({ technicianId: technician.userId });
  assert.equal(assign.status, 201);

  await request(app)
    .patch(`/technicians/work-orders/${assign.body.workOrderId}`)
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + technician.token)
    .send({ status: 'in_progress', report: 'Working' });

  const managementDashboard = await request(app)
    .get('/dashboard/me')
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + admin.token);
  assert.equal(managementDashboard.status, 200);
  assert.equal(managementDashboard.body.role, 'management');
  assert.equal(typeof managementDashboard.body.finance.collectedRent, 'number');

  const ownerDashboard = await request(app)
    .get('/dashboard/me')
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + owner.token);
  assert.equal(ownerDashboard.status, 200);
  assert.equal(ownerDashboard.body.role, 'owner');
  assert.equal(ownerDashboard.body.properties >= 1, true);

  const tenantDashboard = await request(app)
    .get('/dashboard/me')
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + tenant.token);
  assert.equal(tenantDashboard.status, 200);
  assert.equal(tenantDashboard.body.role, 'tenant');
  assert.equal(tenantDashboard.body.contracts.active >= 1, true);

  const technicianDashboard = await request(app)
    .get('/dashboard/me')
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + technician.token);
  assert.equal(technicianDashboard.status, 200);
  assert.equal(technicianDashboard.body.role, 'technician');
  assert.equal(technicianDashboard.body.workOrders.inProgress >= 1, true);
});

test('service token cannot access dashboard/me', async () => {
  process.env.OAUTH_CLIENT_ID = 'svc-client';
  process.env.OAUTH_CLIENT_SECRET = 'svc-secret';
  const { app } = makeTestContext();

  const tokenResponse = await request(app)
    .post('/auth/oauth/token')
    .set('x-api-key', 'test-api-key')
    .send({
      grant_type: 'client_credentials',
      client_id: 'svc-client',
      client_secret: 'svc-secret',
    });
  assert.equal(tokenResponse.status, 200);

  const dashboardResponse = await request(app)
    .get('/dashboard/me')
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + tokenResponse.body.access_token);
  assert.equal(dashboardResponse.status, 403);
});
