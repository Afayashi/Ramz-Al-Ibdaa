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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ramz-workflow-test-'));
  const dbPath = path.join(dir, 'app.db');
  return { app: createApp({ dbPath }), dbPath };
}

function queryAll(dbPath, sql, params = []) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath);
    db.all(sql, params, (error, rows) => {
      db.close(() => {
        if (error) {
          reject(error);
          return;
        }
        resolve(rows);
      });
    });
  });
}

async function registerAndLogin(app, { fullName, email, password, role }) {
  const registerResponse = await request(app)
    .post('/auth/register')
    .set('x-api-key', 'test-api-key')
    .send({ fullName, email, password, role });
  assert.equal(registerResponse.status, 201);

  const loginResponse = await request(app)
    .post('/auth/login')
    .set('x-api-key', 'test-api-key')
    .send({ email, password });
  assert.equal(loginResponse.status, 200);

  const verifyResponse = await request(app)
    .post('/auth/verify-2fa')
    .set('x-api-key', 'test-api-key')
    .send({
      challengeId: loginResponse.body.challengeId,
      code: loginResponse.body.testCode,
    });
  assert.equal(verifyResponse.status, 200);

  return {
    userId: registerResponse.body.userId,
    token: verifyResponse.body.token,
  };
}

test('contract workflow moves from create to approval to signature to activation', async () => {
  const { app, dbPath } = makeTestContext();

  const admin = await registerAndLogin(app, {
    fullName: 'Admin',
    email: 'admin@workflow.test',
    password: 'StrongPassword!123',
    role: 'system_admin',
  });
  const employee = await registerAndLogin(app, {
    fullName: 'Leasing',
    email: 'leasing@workflow.test',
    password: 'StrongPassword!123',
    role: 'leasing_officer',
  });
  const owner = await registerAndLogin(app, {
    fullName: 'Owner',
    email: 'owner@workflow.test',
    password: 'StrongPassword!123',
    role: 'owner',
  });
  const tenant = await registerAndLogin(app, {
    fullName: 'Tenant',
    email: 'tenant@workflow.test',
    password: 'StrongPassword!123',
    role: 'tenant',
  });

  const propertyResponse = await request(app)
    .post('/admin/properties')
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + admin.token)
    .send({ ownerId: owner.userId, propertyName: 'Property 1', address: 'Riyadh' });
  assert.equal(propertyResponse.status, 201);

  const unitResponse = await request(app)
    .post('/employees/units')
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + employee.token)
    .send({
      propertyId: propertyResponse.body.propertyId,
      unitNumber: 'A-101',
      unitType: 'apartment',
      rentAmount: 2500,
    });
  assert.equal(unitResponse.status, 201);

  const createContractResponse = await request(app)
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
  assert.equal(createContractResponse.status, 201);
  const contractId = createContractResponse.body.contractId;

  const approveResponse = await request(app)
    .patch(`/management/contracts/${contractId}/approve`)
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + admin.token);
  assert.equal(approveResponse.status, 200);
  assert.equal(approveResponse.body.status, 'approved');

  const signResponse = await request(app)
    .patch(`/tenants/contracts/${contractId}/sign`)
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + tenant.token);
  assert.equal(signResponse.status, 200);
  assert.equal(signResponse.body.status, 'signed');

  const activateResponse = await request(app)
    .patch(`/employees/contracts/${contractId}/activate`)
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + employee.token);
  assert.equal(activateResponse.status, 200);
  assert.equal(activateResponse.body.status, 'active');

  const contractRows = await queryAll(dbPath, 'SELECT status FROM contracts WHERE id = ?', [contractId]);
  assert.equal(contractRows[0].status, 'active');
});

test('maintenance workflow links tenant employee technician owner with notifications', async () => {
  const { app, dbPath } = makeTestContext();

  const admin = await registerAndLogin(app, {
    fullName: 'Admin',
    email: 'admin2@workflow.test',
    password: 'StrongPassword!123',
    role: 'system_admin',
  });
  const employee = await registerAndLogin(app, {
    fullName: 'Ops',
    email: 'ops@workflow.test',
    password: 'StrongPassword!123',
    role: 'operations_manager',
  });
  const owner = await registerAndLogin(app, {
    fullName: 'Owner 2',
    email: 'owner2@workflow.test',
    password: 'StrongPassword!123',
    role: 'owner',
  });
  const tenant = await registerAndLogin(app, {
    fullName: 'Tenant 2',
    email: 'tenant2@workflow.test',
    password: 'StrongPassword!123',
    role: 'tenant',
  });
  const technician = await registerAndLogin(app, {
    fullName: 'Tech',
    email: 'tech@workflow.test',
    password: 'StrongPassword!123',
    role: 'technician',
  });

  const propertyResponse = await request(app)
    .post('/admin/properties')
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + admin.token)
    .send({ ownerId: owner.userId, propertyName: 'Property M', address: 'Jeddah' });
  assert.equal(propertyResponse.status, 201);

  const createMaintenanceResponse = await request(app)
    .post('/tenants/maintenance-requests')
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + tenant.token)
    .send({
      propertyId: propertyResponse.body.propertyId,
      issueDescription: 'AC not cooling',
    });
  assert.equal(createMaintenanceResponse.status, 201);
  const maintenanceRequestId = createMaintenanceResponse.body.maintenanceRequestId;

  const assignResponse = await request(app)
    .post(`/employees/maintenance-requests/${maintenanceRequestId}/assign-technician`)
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + employee.token)
    .send({ technicianId: technician.userId });
  assert.equal(assignResponse.status, 201);
  const workOrderId = assignResponse.body.workOrderId;

  const progressResponse = await request(app)
    .patch(`/technicians/work-orders/${workOrderId}`)
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + technician.token)
    .send({ status: 'in_progress', report: 'Started diagnostics' });
  assert.equal(progressResponse.status, 200);

  const completeResponse = await request(app)
    .patch(`/technicians/work-orders/${workOrderId}`)
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + technician.token)
    .send({ status: 'completed', report: 'Replaced compressor' });
  assert.equal(completeResponse.status, 200);

  const approveCloseResponse = await request(app)
    .patch(`/employees/maintenance-requests/${maintenanceRequestId}/approve-completion`)
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + employee.token);
  assert.equal(approveCloseResponse.status, 200);
  assert.equal(approveCloseResponse.body.status, 'closed');

  const rateResponse = await request(app)
    .post(`/tenants/maintenance-requests/${maintenanceRequestId}/rating`)
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + tenant.token)
    .send({ rating: 5, comment: 'Excellent service' });
  assert.equal(rateResponse.status, 201);

  const requestRows = await queryAll(dbPath, 'SELECT status FROM maintenance_requests WHERE id = ?', [
    maintenanceRequestId,
  ]);
  assert.equal(requestRows[0].status, 'closed');

  const notificationRows = await queryAll(
    dbPath,
    'SELECT COUNT(*) AS count FROM notifications WHERE user_id IN (?, ?, ?)',
    [technician.userId, owner.userId, tenant.userId],
  );
  assert.equal(notificationRows[0].count >= 3, true);
});
