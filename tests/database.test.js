const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sqlite3 = require('sqlite3').verbose();
const { initDatabase } = require('../src/db/initDatabase');

function query(dbPath, sql) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath);
    db.all(sql, (error, rows) => {
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

test('initDatabase creates sqlite file and required tables', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ramz-db-test-'));
  const dbPath = path.join(tempDir, 'app.db');

  await initDatabase(dbPath);

  assert.equal(fs.existsSync(dbPath), true);

  const rows = await query(
    dbPath,
    "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('roles','permissions','role_permissions','users','owners','tenants','properties','units','amenities','contracts','payments','maintenance_requests','work_orders','work_order_attachments','vendors','revenues','expenses','journal_entries','transfers','notifications','messages','two_factor_challenges','audit_logs') ORDER BY name",
  );

  assert.deepEqual(rows.map((row) => row.name), [
    'amenities',
    'audit_logs',
    'contracts',
    'expenses',
    'journal_entries',
    'maintenance_requests',
    'messages',
    'notifications',
    'owners',
    'payments',
    'permissions',
    'properties',
    'revenues',
    'role_permissions',
    'roles',
    'tenants',
    'transfers',
    'two_factor_challenges',
    'units',
    'users',
    'vendors',
    'work_order_attachments',
    'work_orders',
  ]);
});
