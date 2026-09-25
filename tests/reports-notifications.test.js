const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sqlite3 = require('sqlite3').verbose();
const request = require('supertest');
const { createApp } = require('../src/server');

function makeTestContext() {
  process.env.NODE_ENV = 'test';
  process.env.APP_API_KEY = 'test-api-key';
  process.env.JWT_SECRET = 'test-jwt-secret';
  process.env.ENCRYPTION_KEY = 'test-encryption-key';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ramz-reports-test-'));
  const dbPath = path.join(dir, 'app.db');
  return { app: createApp({ dbPath }), dbPath };
}

function runStatement(dbPath, sql, params = []) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath);
    db.run(sql, params, (error) => {
      db.close(() => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  });
}

async function registerAndLogin(app, user) {
  const registerResponse = await request(app)
    .post('/auth/register')
    .set('x-api-key', 'test-api-key')
    .send(user);
  assert.equal(registerResponse.status, 201);

  const loginResponse = await request(app)
    .post('/auth/login')
    .set('x-api-key', 'test-api-key')
    .send({
      email: user.email,
      password: user.password,
    });
  assert.equal(loginResponse.status, 200);

  const verifyResponse = await request(app)
    .post('/auth/verify-2fa')
    .set('x-api-key', 'test-api-key')
    .send({
      challengeId: loginResponse.body.challengeId,
      code: loginResponse.body.testCode,
    });
  assert.equal(verifyResponse.status, 200);

  return { userId: registerResponse.body.userId, token: verifyResponse.body.token };
}

test('reports and notifications endpoints return linked operational data', async () => {
  const { app, dbPath } = makeTestContext();

  const admin = await registerAndLogin(app, {
    fullName: 'Admin R',
    email: 'admin.reports@test.com',
    password: 'StrongPassword!123',
    role: 'system_admin',
  });
  const employee = await registerAndLogin(app, {
    fullName: 'Employee R',
    email: 'employee.reports@test.com',
    password: 'StrongPassword!123',
    role: 'leasing_officer',
  });
  const owner = await registerAndLogin(app, {
    fullName: 'Owner R',
    email: 'owner.reports@test.com',
    password: 'StrongPassword!123',
    role: 'owner',
  });
  const tenant = await registerAndLogin(app, {
    fullName: 'Tenant R',
    email: 'tenant.reports@test.com',
    password: 'StrongPassword!123',
    role: 'tenant',
  });
  const technician = await registerAndLogin(app, {
    fullName: 'Tech R',
    email: 'tech.reports@test.com',
    password: 'StrongPassword!123',
    role: 'technician',
  });

  const propertyResponse = await request(app)
    .post('/admin/properties')
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + admin.token)
    .send({ ownerId: owner.userId, propertyName: 'Report Property', address: 'Dammam' });
  assert.equal(propertyResponse.status, 201);

  const unitResponse = await request(app)
    .post('/employees/units')
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + employee.token)
    .send({
      propertyId: propertyResponse.body.propertyId,
      unitNumber: 'B-201',
      unitType: 'apartment',
      rentAmount: 3000,
    });
  assert.equal(unitResponse.status, 201);

  const contractResponse = await request(app)
    .post('/employees/contracts')
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + employee.token)
    .send({
      unitId: unitResponse.body.unitId,
      ownerId: owner.userId,
      tenantId: tenant.userId,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    });
  assert.equal(contractResponse.status, 201);
  const contractId = contractResponse.body.contractId;

  await request(app)
    .patch(`/management/contracts/${contractId}/approve`)
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + admin.token);
  await request(app)
    .patch(`/tenants/contracts/${contractId}/sign`)
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + tenant.token);
  await request(app)
    .patch(`/employees/contracts/${contractId}/activate`)
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + employee.token);

  const paymentResponse = await request(app)
    .post('/tenants/payments')
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + tenant.token)
    .send({ contractId, amount: 3000, paymentDate: '2026-02-01' });
  assert.equal(paymentResponse.status, 201);

  const maintenanceResponse = await request(app)
    .post('/tenants/maintenance-requests')
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + tenant.token)
    .send({ propertyId: propertyResponse.body.propertyId, issueDescription: 'Water leak' });
  assert.equal(maintenanceResponse.status, 201);
  const maintenanceId = maintenanceResponse.body.maintenanceRequestId;

  const assignResponse = await request(app)
    .post(`/employees/maintenance-requests/${maintenanceId}/assign-technician`)
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + employee.token)
    .send({ technicianId: technician.userId });
  assert.equal(assignResponse.status, 201);

  await request(app)
    .patch(`/technicians/work-orders/${assignResponse.body.workOrderId}`)
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + technician.token)
    .send({ status: 'completed', report: 'Maintenance done' });
  await request(app)
    .patch(`/employees/maintenance-requests/${maintenanceId}/approve-completion`)
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + employee.token);

  await runStatement(
    dbPath,
    'INSERT INTO revenues (property_id, amount, reference) VALUES (?, ?, ?)',
    [propertyResponse.body.propertyId, 500, 'Parking'],
  );
  await runStatement(
    dbPath,
    'INSERT INTO expenses (property_id, amount, category) VALUES (?, ?, ?)',
    [propertyResponse.body.propertyId, 1200, 'Maintenance'],
  );

  const ownerNotificationsResponse = await request(app)
    .get('/me/notifications')
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + owner.token);
  assert.equal(ownerNotificationsResponse.status, 200);
  assert.equal(ownerNotificationsResponse.body.notifications.length > 0, true);

  const firstNotificationId = ownerNotificationsResponse.body.notifications[0].id;
  const markReadResponse = await request(app)
    .patch(`/me/notifications/${firstNotificationId}/read`)
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + owner.token);
  assert.equal(markReadResponse.status, 200);
  assert.equal(markReadResponse.body.status, 'read');

  const occupancyReport = await request(app)
    .get('/reports/occupancy')
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + admin.token);
  assert.equal(occupancyReport.status, 200);
  assert.equal(occupancyReport.body.totalUnits >= 1, true);

  const contractsReport = await request(app)
    .get('/reports/contracts-summary')
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + admin.token);
  assert.equal(contractsReport.status, 200);
  assert.equal(contractsReport.body.activeContracts >= 1, true);

  const financialReport = await request(app)
    .get('/reports/financial-summary')
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + admin.token);
  assert.equal(financialReport.status, 200);
  assert.equal(financialReport.body.collectedRent >= 3000, true);
  assert.equal(financialReport.body.totalExpenses >= 1200, true);
});
