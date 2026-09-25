const fs = require('node:fs');
const path = require('node:path');
const sqlite3 = require('sqlite3').verbose();

const DEFAULT_DB_PATH = path.resolve(__dirname, '../../data/property_management.db');

const TABLE_DEFINITIONS = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL CHECK(role IN ('admin', 'employee', 'owner', 'tenant', 'technician')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS properties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER NOT NULL,
    property_name TEXT NOT NULL,
    address TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'available',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(owner_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS leases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id INTEGER NOT NULL,
    tenant_id INTEGER NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    monthly_rent REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(property_id) REFERENCES properties(id),
    FOREIGN KEY(tenant_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS maintenance_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id INTEGER NOT NULL,
    tenant_id INTEGER NOT NULL,
    technician_id INTEGER,
    issue_description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(property_id) REFERENCES properties(id),
    FOREIGN KEY(tenant_id) REFERENCES users(id),
    FOREIGN KEY(technician_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lease_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    payment_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(lease_id) REFERENCES leases(id)
  )`,
];

function runStatement(db, sql) {
  return new Promise((resolve, reject) => {
    db.run(sql, (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

function closeDb(db) {
  return new Promise((resolve, reject) => {
    db.close((err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

async function initDatabase(dbPath = DEFAULT_DB_PATH) {
  const directoryPath = path.dirname(dbPath);
  fs.mkdirSync(directoryPath, { recursive: true });

  const db = new sqlite3.Database(dbPath);

  try {
    await runStatement(db, 'PRAGMA foreign_keys = ON');
    for (const sql of TABLE_DEFINITIONS) {
      await runStatement(db, sql);
    }
  } finally {
    await closeDb(db);
  }

  return dbPath;
}

if (require.main === module) {
  initDatabase()
    .then((dbPath) => {
      console.log(`Database initialized at: ${dbPath}`);
    })
    .catch((error) => {
      console.error('Failed to initialize database:', error);
      process.exitCode = 1;
    });
}

module.exports = {
  DEFAULT_DB_PATH,
  initDatabase,
  TABLE_DEFINITIONS,
};
