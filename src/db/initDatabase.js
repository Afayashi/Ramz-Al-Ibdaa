const fs = require('node:fs');
const path = require('node:path');
const sqlite3 = require('sqlite3').verbose();

const DEFAULT_DB_PATH = path.resolve(__dirname, '../../data/property_management.db');

const ROLE_NAMES = [
  'system_admin',
  'operations_manager',
  'leasing_officer',
  'collections_officer',
  'owner',
  'tenant',
  'technician',
  'financial_auditor',
];

const PERMISSION_KEYS = [
  'properties:create',
  'units:create',
  'contracts:create',
  'contracts:approve',
  'contracts:sign',
  'contracts:activate',
  'maintenance:request:create',
  'maintenance:assign',
  'maintenance:work:update',
  'maintenance:attachment:upload',
  'maintenance:attachment:read',
  'maintenance:approve',
  'maintenance:rate',
  'payments:create',
  'notifications:read:self',
  'notifications:mark-read:self',
  'messages:send:self',
  'messages:read:self',
  'messages:mark-read:self',
  'reports:view:management',
  'audit:view',
  'dashboard:view:management',
  'dashboard:view:employee',
  'dashboard:view:owner',
  'dashboard:view:tenant',
  'dashboard:view:technician',
  'rbac:manage',
];

const ROLE_PERMISSION_MAP = {
  system_admin: [
    'properties:create',
    'units:create',
    'contracts:create',
    'contracts:approve',
    'contracts:activate',
    'maintenance:assign',
    'maintenance:attachment:read',
    'maintenance:approve',
    'messages:send:self',
    'messages:read:self',
    'messages:mark-read:self',
    'reports:view:management',
    'audit:view',
    'dashboard:view:management',
    'rbac:manage',
  ],
  operations_manager: [
    'properties:create',
    'units:create',
    'contracts:create',
    'contracts:approve',
    'contracts:activate',
    'maintenance:assign',
    'maintenance:attachment:read',
    'maintenance:approve',
    'messages:send:self',
    'messages:read:self',
    'messages:mark-read:self',
    'reports:view:management',
    'audit:view',
    'dashboard:view:management',
    'dashboard:view:employee',
    'rbac:manage',
  ],
  leasing_officer: [
    'units:create',
    'contracts:create',
    'contracts:activate',
    'maintenance:assign',
    'maintenance:attachment:read',
    'maintenance:approve',
    'maintenance:attachment:upload',
    'messages:send:self',
    'messages:read:self',
    'messages:mark-read:self',
    'dashboard:view:employee',
  ],
  collections_officer: [
    'maintenance:assign',
    'maintenance:attachment:read',
    'maintenance:approve',
    'messages:send:self',
    'messages:read:self',
    'messages:mark-read:self',
    'dashboard:view:employee',
  ],
  owner: [
    'notifications:read:self',
    'notifications:mark-read:self',
    'maintenance:attachment:read',
    'messages:send:self',
    'messages:read:self',
    'messages:mark-read:self',
    'dashboard:view:owner',
  ],
  tenant: [
    'contracts:sign',
    'maintenance:request:create',
    'maintenance:attachment:read',
    'maintenance:rate',
    'payments:create',
    'notifications:read:self',
    'notifications:mark-read:self',
    'messages:send:self',
    'messages:read:self',
    'messages:mark-read:self',
    'dashboard:view:tenant',
  ],
  technician: [
    'maintenance:work:update',
    'maintenance:attachment:upload',
    'maintenance:attachment:read',
    'notifications:read:self',
    'notifications:mark-read:self',
    'messages:send:self',
    'messages:read:self',
    'messages:mark-read:self',
    'dashboard:view:technician',
  ],
  financial_auditor: [
    'reports:view:management',
    'audit:view',
    'messages:send:self',
    'messages:read:self',
    'messages:mark-read:self',
    'dashboard:view:management',
  ],
};

const TABLE_DEFINITIONS = [
  `CREATE TABLE IF NOT EXISTS roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS permissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    description TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS role_permissions (
    role_id INTEGER NOT NULL,
    permission_id INTEGER NOT NULL,
    PRIMARY KEY(role_id, permission_id),
    FOREIGN KEY(role_id) REFERENCES roles(id),
    FOREIGN KEY(permission_id) REFERENCES permissions(id)
  )`,
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL,
    password_hash TEXT,
    national_id_encrypted TEXT,
    bank_account_encrypted TEXT,
    two_factor_enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS owners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    company_name TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS tenants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    emergency_contact TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
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
  `CREATE TABLE IF NOT EXISTS units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id INTEGER NOT NULL,
    unit_number TEXT NOT NULL,
    unit_type TEXT,
    rent_amount REAL,
    occupancy_status TEXT NOT NULL DEFAULT 'vacant',
    FOREIGN KEY(property_id) REFERENCES properties(id)
  )`,
  `CREATE TABLE IF NOT EXISTS amenities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    FOREIGN KEY(property_id) REFERENCES properties(id)
  )`,
  `CREATE TABLE IF NOT EXISTS contracts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    unit_id INTEGER NOT NULL,
    owner_id INTEGER NOT NULL,
    tenant_id INTEGER NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(unit_id) REFERENCES units(id),
    FOREIGN KEY(owner_id) REFERENCES users(id),
    FOREIGN KEY(tenant_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    payment_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    receipt_reference TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(contract_id) REFERENCES contracts(id)
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
  `CREATE TABLE IF NOT EXISTS work_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    maintenance_request_id INTEGER NOT NULL,
    technician_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'assigned',
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(maintenance_request_id) REFERENCES maintenance_requests(id),
    FOREIGN KEY(technician_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS work_order_attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    work_order_id INTEGER NOT NULL,
    uploaded_by INTEGER NOT NULL,
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_type TEXT NOT NULL DEFAULT 'image',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(work_order_id) REFERENCES work_orders(id),
    FOREIGN KEY(uploaded_by) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS vendors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT,
    service_type TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS revenues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id INTEGER,
    amount REAL NOT NULL,
    reference TEXT,
    recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id INTEGER,
    amount REAL NOT NULL,
    category TEXT,
    recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS journal_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_type TEXT NOT NULL,
    amount REAL NOT NULL,
    reference TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS transfers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_account TEXT NOT NULL,
    to_account TEXT NOT NULL,
    amount REAL NOT NULL,
    transfer_date TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    channel TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL,
    recipient_id INTEGER NOT NULL,
    body TEXT NOT NULL,
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(sender_id) REFERENCES users(id),
    FOREIGN KEY(recipient_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS two_factor_challenges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    consumed_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_user_id INTEGER,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    metadata TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(actor_user_id) REFERENCES users(id)
  )`,
];

function openDb(dbPath) {
  return new sqlite3.Database(dbPath);
}

function runStatement(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve(this);
    });
  });
}

function queryAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows);
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

async function ensureLegacyUserColumns(db) {
  const columns = await queryAll(db, 'PRAGMA table_info(users)');
  const existing = new Set(columns.map((column) => column.name));
  const requiredColumns = [
    ['password_hash', 'TEXT'],
    ['national_id_encrypted', 'TEXT'],
    ['bank_account_encrypted', 'TEXT'],
    ['two_factor_enabled', 'INTEGER NOT NULL DEFAULT 1'],
  ];

  for (const [name, definition] of requiredColumns) {
    if (!existing.has(name)) {
      await runStatement(db, `ALTER TABLE users ADD COLUMN ${name} ${definition}`);
    }
  }
}

async function ensureLegacyMessageColumns(db) {
  const columns = await queryAll(db, 'PRAGMA table_info(messages)');
  const existing = new Set(columns.map((column) => column.name));
  if (!existing.has('is_read')) {
    await runStatement(db, 'ALTER TABLE messages ADD COLUMN is_read INTEGER NOT NULL DEFAULT 0');
  }
}

async function seedRoles(db) {
  for (const roleName of ROLE_NAMES) {
    await runStatement(
      db,
      'INSERT OR IGNORE INTO roles (name, description) VALUES (?, ?)',
      [roleName, `Role: ${roleName}`],
    );
  }
}

async function seedPermissions(db) {
  for (const permissionKey of PERMISSION_KEYS) {
    await runStatement(
      db,
      'INSERT OR IGNORE INTO permissions (key, description) VALUES (?, ?)',
      [permissionKey, `Permission: ${permissionKey}`],
    );
  }
}

async function seedRolePermissions(db) {
  for (const [roleName, permissions] of Object.entries(ROLE_PERMISSION_MAP)) {
    for (const permissionKey of permissions) {
      await runStatement(
        db,
        `INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
         SELECT r.id, p.id
         FROM roles r
         INNER JOIN permissions p ON p.key = ?
         WHERE r.name = ?`,
        [permissionKey, roleName],
      );
    }
  }
}

async function initDatabase(dbPath = DEFAULT_DB_PATH) {
  const directoryPath = path.dirname(dbPath);
  fs.mkdirSync(directoryPath, { recursive: true });

  const db = openDb(dbPath);

  try {
    await runStatement(db, 'PRAGMA foreign_keys = ON');
    for (const sql of TABLE_DEFINITIONS) {
      await runStatement(db, sql);
    }
    await ensureLegacyUserColumns(db);
    await ensureLegacyMessageColumns(db);
    await seedRoles(db);
    await seedPermissions(db);
    await seedRolePermissions(db);
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
  PERMISSION_KEYS,
  ROLE_NAMES,
  ROLE_PERMISSION_MAP,
  TABLE_DEFINITIONS,
  closeDb,
  initDatabase,
  openDb,
  queryAll,
  runStatement,
};
