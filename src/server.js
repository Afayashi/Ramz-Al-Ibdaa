const express = require('express');
const rateLimit = require('express-rate-limit');

const {
  DEFAULT_DB_PATH,
  initDatabase,
  openDb,
  queryAll,
  runStatement,
  closeDb,
} = require('./db/initDatabase');
const { encryptText } = require('./security/crypto');
const {
  createToken,
  generateOtpCode,
  hashPassword,
  verifyPassword,
  verifyToken,
} = require('./security/auth');
const { NAVIGATION_FLOW } = require('./navigation/flow');

const TWO_FACTOR_TTL_MINUTES = 10;
const TOKEN_EXPIRES_IN_SECONDS = 3600;

function createApp(options = {}) {
  const dbPath = options.dbPath || process.env.DB_PATH || DEFAULT_DB_PATH;
  const initialization = initDatabase(dbPath);
  const app = express();
  const requirePermission = (permissionKey) => async (req, res, next) => {
    const role = req.user?.role;
    if (!role) {
      res.status(401).json({ error: 'Role is required' });
      return;
    }

    const db = openDb(dbPath);
    try {
      const rows = await queryAll(
        db,
        `SELECT 1
         FROM roles r
         INNER JOIN role_permissions rp ON rp.role_id = r.id
         INNER JOIN permissions p ON p.id = rp.permission_id
         WHERE r.name = ? AND p.key = ?
         LIMIT 1`,
        [role, permissionKey],
      );
      if (rows.length === 0) {
        res.status(403).json({ error: `Missing permission: ${permissionKey}` });
        return;
      }
      next();
    } finally {
      await closeDb(db);
    }
  };

  app.use(express.json());
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 200,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  app.use((req, res, next) => {
    if (req.path === '/health') {
      next();
      return;
    }

    const apiKey = req.header('x-api-key');
    const expectedApiKey = process.env.APP_API_KEY || 'dev-api-key';
    if (!apiKey || apiKey !== expectedApiKey) {
      res.status(401).json({ error: 'Invalid API key' });
      return;
    }

    next();
  });

  app.use(async (_req, _res, next) => {
    try {
      await initialization;
      next();
    } catch (error) {
      next(error);
    }
  });

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      security: {
        jwt: true,
        rbac: true,
        apiKey: true,
        rateLimiting: true,
        passwordHashing: 'bcrypt',
        sensitiveDataEncryption: 'aes-256-gcm',
      },
    });
  });

  app.post('/auth/register', async (req, res) => {
    const { fullName, email, password, role, nationalId, bankAccount } = req.body || {};
    if (!fullName || !email || !password || !role) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    const allowedRoles = new Set([
      'system_admin',
      'operations_manager',
      'leasing_officer',
      'collections_officer',
      'owner',
      'tenant',
      'technician',
      'financial_auditor',
    ]);

    if (!allowedRoles.has(role)) {
      res.status(400).json({ error: 'Unsupported role' });
      return;
    }

    const db = openDb(dbPath);
    try {
      const passwordHash = await hashPassword(password);
      const result = await runStatement(
        db,
        `INSERT INTO users (
          full_name, email, role, password_hash, national_id_encrypted, bank_account_encrypted
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          fullName,
          email.toLowerCase(),
          role,
          passwordHash,
          encryptText(nationalId),
          encryptText(bankAccount),
        ],
      );
      await runStatement(
        db,
        'INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, metadata) VALUES (?, ?, ?, ?, ?)',
        [result.lastID, 'USER_REGISTER', 'users', String(result.lastID), JSON.stringify({ role })],
      );

      res.status(201).json({ userId: result.lastID });
    } catch (error) {
      if (String(error.message).includes('UNIQUE')) {
        res.status(409).json({ error: 'Email already exists' });
        return;
      }
      res.status(500).json({ error: 'Registration failed' });
    } finally {
      await closeDb(db);
    }
  });

  app.post(
    '/auth/login',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 20,
      standardHeaders: true,
      legacyHeaders: false,
    }),
    async (req, res) => {
      const { email, password } = req.body || {};
      if (!email || !password) {
        res.status(400).json({ error: 'Missing credentials' });
        return;
      }

      const db = openDb(dbPath);
      try {
        const users = await queryAll(db, 'SELECT * FROM users WHERE email = ? LIMIT 1', [
          email.toLowerCase(),
        ]);
        const user = users[0];
        if (!user || !user.password_hash) {
          res.status(401).json({ error: 'Invalid credentials' });
          return;
        }

        const isValid = await verifyPassword(password, user.password_hash);
        if (!isValid) {
          res.status(401).json({ error: 'Invalid credentials' });
          return;
        }

        const { challengeId, code } = await createTwoFactorChallenge(db, user.id);

        await runStatement(
          db,
          'INSERT INTO audit_logs (actor_user_id, action, target_type, target_id) VALUES (?, ?, ?, ?)',
          [user.id, 'LOGIN_PASSWORD_OK', 'two_factor_challenges', String(challengeId)],
        );

        const response = { challengeId, twoFactorRequired: true };
        if (process.env.NODE_ENV === 'test') {
          response.testCode = code;
        }
        res.json(response);
      } finally {
        await closeDb(db);
      }
    },
  );

  app.post('/auth/verify-2fa', async (req, res) => {
    const { challengeId, code } = req.body || {};
    if (!challengeId || !code) {
      res.status(400).json({ error: 'challengeId and code are required' });
      return;
    }

    const db = openDb(dbPath);
    try {
      const challenges = await queryAll(
        db,
        `SELECT c.*, u.email, u.role
         FROM two_factor_challenges c
         INNER JOIN users u ON u.id = c.user_id
         WHERE c.id = ?
           AND c.consumed_at IS NULL
           AND datetime(c.expires_at) >= datetime('now')
         LIMIT 1`,
        [challengeId],
      );

      const challenge = challenges[0];
      if (!challenge) {
        res.status(401).json({ error: 'Invalid or expired challenge' });
        return;
      }

      const matches = await verifyPassword(code, challenge.code_hash);
      if (!matches) {
        res.status(401).json({ error: 'Invalid code' });
        return;
      }

      await runStatement(db, 'UPDATE two_factor_challenges SET consumed_at = CURRENT_TIMESTAMP WHERE id = ?', [
        challengeId,
      ]);

      const token = createToken({ id: challenge.user_id, email: challenge.email, role: challenge.role });
      await runStatement(
        db,
        'INSERT INTO audit_logs (actor_user_id, action, target_type, target_id) VALUES (?, ?, ?, ?)',
        [challenge.user_id, 'LOGIN_2FA_OK', 'users', String(challenge.user_id)],
      );

      res.json({ token, tokenType: 'Bearer' });
    } finally {
      await closeDb(db);
    }
  });

  app.get(
    '/security/audit-logs',
    authenticateJwt,
    requireRoles(['system_admin', 'financial_auditor']),
    requirePermission('audit:view'),
    async (req, res) => {
      const actorUserId = req.query.actorUserId ? Number(req.query.actorUserId) : null;
      const action = req.query.action ? String(req.query.action) : null;
      const targetType = req.query.targetType ? String(req.query.targetType) : null;
      const dateFrom = req.query.dateFrom ? String(req.query.dateFrom) : null;
      const dateTo = req.query.dateTo ? String(req.query.dateTo) : null;
      const page = Math.max(1, Number(req.query.page || 1));
      const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
      const offset = (page - 1) * limit;

      const whereParts = [];
      const params = [];
      if (Number.isInteger(actorUserId) && actorUserId > 0) {
        whereParts.push('actor_user_id = ?');
        params.push(actorUserId);
      }
      if (action) {
        whereParts.push('action = ?');
        params.push(action);
      }
      if (targetType) {
        whereParts.push('target_type = ?');
        params.push(targetType);
      }
      if (dateFrom) {
        whereParts.push('datetime(created_at) >= datetime(?)');
        params.push(dateFrom);
      }
      if (dateTo) {
        whereParts.push('datetime(created_at) <= datetime(?)');
        params.push(dateTo);
      }
      const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';

      const db = openDb(dbPath);
      try {
        const logs = await queryAll(
          db,
          `SELECT id, actor_user_id, action, target_type, target_id, metadata, created_at
           FROM audit_logs
           ${whereSql}
           ORDER BY id DESC
           LIMIT ? OFFSET ?`,
          [...params, limit, offset],
        );

        const countRows = await queryAll(
          db,
          `SELECT COUNT(*) AS totalCount
           FROM audit_logs
           ${whereSql}`,
          params,
        );
        const totalCount = Number(countRows[0]?.totalCount || 0);
        res.json({
          page,
          limit,
          totalCount,
          totalPages: Math.ceil(totalCount / limit),
          logs,
        });
      } finally {
        await closeDb(db);
      }
    },
  );

  app.get(
    '/security/audit-logs/summary',
    authenticateJwt,
    requireRoles(['system_admin', 'financial_auditor']),
    requirePermission('audit:view'),
    async (req, res) => {
      const dateFrom = req.query.dateFrom ? String(req.query.dateFrom) : null;
      const dateTo = req.query.dateTo ? String(req.query.dateTo) : null;
      const whereParts = [];
      const params = [];
      if (dateFrom) {
        whereParts.push('datetime(created_at) >= datetime(?)');
        params.push(dateFrom);
      }
      if (dateTo) {
        whereParts.push('datetime(created_at) <= datetime(?)');
        params.push(dateTo);
      }
      const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';

      const db = openDb(dbPath);
      try {
        const summary = await queryAll(
          db,
          `SELECT action, COUNT(*) AS total
           FROM audit_logs
           ${whereSql}
           GROUP BY action
           ORDER BY total DESC, action ASC`,
          params,
        );
        res.json({
          summary: summary.map((row) => ({
            action: row.action,
            total: Number(row.total || 0),
          })),
        });
      } finally {
        await closeDb(db);
      }
    },
  );

  app.get('/navigation/flow', authenticateJwt, (req, res) => {
    res.json({
      role: req.user.role,
      flow: NAVIGATION_FLOW,
    });
  });

  app.get('/navigation/portal', authenticateJwt, (req, res) => {
    const portalKey = resolvePortalForRole(req.user.role);
    if (!portalKey) {
      res.status(403).json({ error: 'No portal mapping for this role' });
      return;
    }

    res.json({
      role: req.user.role,
      portal: portalKey,
      entry: NAVIGATION_FLOW.entry,
      portalFlow: NAVIGATION_FLOW.portals[portalKey],
      workflows: NAVIGATION_FLOW.workflows,
    });
  });

  app.get(
    '/admin/permissions',
    authenticateJwt,
    requireRoles(['system_admin', 'operations_manager']),
    requirePermission('rbac:manage'),
    async (_req, res) => {
      const db = openDb(dbPath);
      try {
        const permissions = await queryAll(
          db,
          'SELECT id, key, description FROM permissions ORDER BY key ASC',
        );
        res.json({ permissions });
      } finally {
        await closeDb(db);
      }
    },
  );

  app.get(
    '/admin/roles/:roleName/permissions',
    authenticateJwt,
    requireRoles(['system_admin', 'operations_manager']),
    requirePermission('rbac:manage'),
    async (req, res) => {
      const roleName = req.params.roleName;
      const db = openDb(dbPath);
      try {
        const permissions = await queryAll(
          db,
          `SELECT p.key
           FROM role_permissions rp
           INNER JOIN roles r ON r.id = rp.role_id
           INNER JOIN permissions p ON p.id = rp.permission_id
           WHERE r.name = ?
           ORDER BY p.key ASC`,
          [roleName],
        );
        res.json({ role: roleName, permissions: permissions.map((row) => row.key) });
      } finally {
        await closeDb(db);
      }
    },
  );

  app.post(
    '/admin/roles/:roleName/permissions',
    authenticateJwt,
    requireRoles(['system_admin', 'operations_manager']),
    requirePermission('rbac:manage'),
    async (req, res) => {
      const roleName = req.params.roleName;
      const permissions = Array.isArray(req.body?.permissions) ? req.body.permissions : [];
      if (permissions.length === 0) {
        res.status(400).json({ error: 'permissions array is required' });
        return;
      }

      const db = openDb(dbPath);
      try {
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
        await runStatement(
          db,
          'INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, metadata) VALUES (?, ?, ?, ?, ?)',
          [req.user.sub, 'RBAC_ROLE_PERMISSION_ASSIGN', 'roles', roleName, JSON.stringify({ permissions })],
        );

        res.status(201).json({ role: roleName, permissionsAssigned: permissions });
      } finally {
        await closeDb(db);
      }
    },
  );

  app.post('/admin/properties', authenticateJwt, requireRoles(['system_admin', 'operations_manager']), requirePermission('properties:create'), async (req, res) => {
    const { ownerId, propertyName, address } = req.body || {};
    if (!ownerId || !propertyName || !address) {
      res.status(400).json({ error: 'ownerId, propertyName, address are required' });
      return;
    }

    const db = openDb(dbPath);
    try {
      const result = await runStatement(
        db,
        'INSERT INTO properties (owner_id, property_name, address) VALUES (?, ?, ?)',
        [ownerId, propertyName, address],
      );
      await runStatement(
        db,
        'INSERT INTO audit_logs (actor_user_id, action, target_type, target_id) VALUES (?, ?, ?, ?)',
        [req.user.sub, 'PROPERTY_CREATE', 'properties', String(result.lastID)],
      );
      res.status(201).json({ propertyId: result.lastID });
    } finally {
      await closeDb(db);
    }
  });

  app.post('/employees/units', authenticateJwt, requireRoles(['leasing_officer', 'operations_manager']), requirePermission('units:create'), async (req, res) => {
    const { propertyId, unitNumber, unitType, rentAmount } = req.body || {};
    if (!propertyId || !unitNumber) {
      res.status(400).json({ error: 'propertyId and unitNumber are required' });
      return;
    }

    const db = openDb(dbPath);
    try {
      const result = await runStatement(
        db,
        'INSERT INTO units (property_id, unit_number, unit_type, rent_amount, occupancy_status) VALUES (?, ?, ?, ?, ?)',
        [propertyId, unitNumber, unitType || null, rentAmount || null, 'vacant'],
      );
      await runStatement(
        db,
        'INSERT INTO audit_logs (actor_user_id, action, target_type, target_id) VALUES (?, ?, ?, ?)',
        [req.user.sub, 'UNIT_CREATE', 'units', String(result.lastID)],
      );
      res.status(201).json({ unitId: result.lastID });
    } finally {
      await closeDb(db);
    }
  });

  app.post('/employees/contracts', authenticateJwt, requireRoles(['leasing_officer', 'operations_manager']), requirePermission('contracts:create'), async (req, res) => {
    const { unitId, ownerId, tenantId, startDate, endDate } = req.body || {};
    if (!unitId || !ownerId || !tenantId || !startDate || !endDate) {
      res.status(400).json({ error: 'Missing contract fields' });
      return;
    }

    const db = openDb(dbPath);
    try {
      const result = await runStatement(
        db,
        'INSERT INTO contracts (unit_id, owner_id, tenant_id, start_date, end_date, status) VALUES (?, ?, ?, ?, ?, ?)',
        [unitId, ownerId, tenantId, startDate, endDate, 'pending_approval'],
      );
      await runStatement(
        db,
        'INSERT INTO audit_logs (actor_user_id, action, target_type, target_id) VALUES (?, ?, ?, ?)',
        [req.user.sub, 'CONTRACT_CREATE', 'contracts', String(result.lastID)],
      );
      res.status(201).json({ contractId: result.lastID });
    } finally {
      await closeDb(db);
    }
  });

  app.patch('/management/contracts/:id/approve', authenticateJwt, requireRoles(['system_admin', 'operations_manager']), requirePermission('contracts:approve'), async (req, res) => {
    const contractId = req.params.id;
    const db = openDb(dbPath);
    try {
      const contracts = await queryAll(db, 'SELECT id, status FROM contracts WHERE id = ? LIMIT 1', [contractId]);
      const contract = contracts[0];
      if (!contract) {
        res.status(404).json({ error: 'Contract not found' });
        return;
      }
      if (contract.status !== 'pending_approval') {
        res.status(400).json({ error: 'Contract is not pending approval' });
        return;
      }

      await runStatement(db, 'UPDATE contracts SET status = ? WHERE id = ?', ['approved', contractId]);
      await runStatement(
        db,
        'INSERT INTO audit_logs (actor_user_id, action, target_type, target_id) VALUES (?, ?, ?, ?)',
        [req.user.sub, 'CONTRACT_APPROVE', 'contracts', String(contractId)],
      );
      res.json({ contractId: Number(contractId), status: 'approved' });
    } finally {
      await closeDb(db);
    }
  });

  app.patch('/tenants/contracts/:id/sign', authenticateJwt, requireRoles(['tenant']), requirePermission('contracts:sign'), async (req, res) => {
    const contractId = req.params.id;
    const db = openDb(dbPath);
    try {
      const contracts = await queryAll(
        db,
        'SELECT id, tenant_id, status FROM contracts WHERE id = ? AND tenant_id = ? LIMIT 1',
        [contractId, req.user.sub],
      );
      const contract = contracts[0];
      if (!contract) {
        res.status(404).json({ error: 'Contract not found for this tenant' });
        return;
      }
      if (!['approved', 'pending_signature'].includes(contract.status)) {
        res.status(400).json({ error: 'Contract is not ready for signature' });
        return;
      }

      await runStatement(db, 'UPDATE contracts SET status = ? WHERE id = ?', ['signed', contractId]);
      await runStatement(
        db,
        'INSERT INTO audit_logs (actor_user_id, action, target_type, target_id) VALUES (?, ?, ?, ?)',
        [req.user.sub, 'CONTRACT_SIGN', 'contracts', String(contractId)],
      );
      res.json({ contractId: Number(contractId), status: 'signed' });
    } finally {
      await closeDb(db);
    }
  });

  app.patch('/employees/contracts/:id/activate', authenticateJwt, requireRoles(['leasing_officer', 'operations_manager']), requirePermission('contracts:activate'), async (req, res) => {
    const contractId = req.params.id;
    const db = openDb(dbPath);
    try {
      const contracts = await queryAll(
        db,
        'SELECT id, owner_id, tenant_id, status FROM contracts WHERE id = ? LIMIT 1',
        [contractId],
      );
      const contract = contracts[0];
      if (!contract) {
        res.status(404).json({ error: 'Contract not found' });
        return;
      }
      if (contract.status !== 'signed') {
        res.status(400).json({ error: 'Contract must be signed before activation' });
        return;
      }

      await runStatement(db, 'UPDATE contracts SET status = ? WHERE id = ?', ['active', contractId]);
      await runStatement(
        db,
        `INSERT INTO notifications (user_id, channel, subject, body, status) VALUES
         (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)`,
        [
          contract.tenant_id, 'in_app', 'تفعيل العقد', 'تم تفعيل عقد الإيجار الخاص بك.', 'queued',
          contract.owner_id, 'in_app', 'تفعيل العقد', 'تم تفعيل عقد إيجار جديد لعقارك.', 'queued',
        ],
      );
      await runStatement(
        db,
        'INSERT INTO audit_logs (actor_user_id, action, target_type, target_id) VALUES (?, ?, ?, ?)',
        [req.user.sub, 'CONTRACT_ACTIVATE', 'contracts', String(contractId)],
      );
      res.json({ contractId: Number(contractId), status: 'active' });
    } finally {
      await closeDb(db);
    }
  });

  app.post('/tenants/payments', authenticateJwt, requireRoles(['tenant']), requirePermission('payments:create'), async (req, res) => {
    const { contractId, amount, paymentDate } = req.body || {};
    if (!contractId || !amount || !paymentDate) {
      res.status(400).json({ error: 'Missing payment fields' });
      return;
    }

    const db = openDb(dbPath);
    try {
      const result = await runStatement(
        db,
        'INSERT INTO payments (contract_id, amount, payment_date, status) VALUES (?, ?, ?, ?)',
        [contractId, amount, paymentDate, 'paid'],
      );
      await runStatement(
        db,
        'INSERT INTO audit_logs (actor_user_id, action, target_type, target_id) VALUES (?, ?, ?, ?)',
        [req.user.sub, 'PAYMENT_CREATE', 'payments', String(result.lastID)],
      );
      res.status(201).json({ paymentId: result.lastID });
    } finally {
      await closeDb(db);
    }
  });

  app.post('/tenants/maintenance-requests', authenticateJwt, requireRoles(['tenant']), requirePermission('maintenance:request:create'), async (req, res) => {
    const { propertyId, issueDescription } = req.body || {};
    if (!propertyId || !issueDescription) {
      res.status(400).json({ error: 'Missing maintenance fields' });
      return;
    }

    const db = openDb(dbPath);
    try {
      const result = await runStatement(
        db,
        'INSERT INTO maintenance_requests (property_id, tenant_id, issue_description) VALUES (?, ?, ?)',
        [propertyId, req.user.sub, issueDescription],
      );
      await runStatement(
        db,
        'INSERT INTO audit_logs (actor_user_id, action, target_type, target_id) VALUES (?, ?, ?, ?)',
        [req.user.sub, 'MAINTENANCE_REQUEST_CREATE', 'maintenance_requests', String(result.lastID)],
      );
      res.status(201).json({ maintenanceRequestId: result.lastID });
    } finally {
      await closeDb(db);
    }
  });

  app.post('/employees/maintenance-requests/:id/assign-technician', authenticateJwt, requireRoles(['leasing_officer', 'collections_officer', 'operations_manager']), requirePermission('maintenance:assign'), async (req, res) => {
    const requestId = req.params.id;
    const { technicianId } = req.body || {};
    if (!technicianId) {
      res.status(400).json({ error: 'technicianId is required' });
      return;
    }

    const db = openDb(dbPath);
    try {
      const requests = await queryAll(
        db,
        `SELECT mr.id, mr.property_id, mr.tenant_id, p.owner_id
         FROM maintenance_requests mr
         INNER JOIN properties p ON p.id = mr.property_id
         WHERE mr.id = ? LIMIT 1`,
        [requestId],
      );
      const maintenanceRequest = requests[0];
      if (!maintenanceRequest) {
        res.status(404).json({ error: 'Maintenance request not found' });
        return;
      }

      const workOrderResult = await runStatement(
        db,
        'INSERT INTO work_orders (maintenance_request_id, technician_id, status, notes) VALUES (?, ?, ?, ?)',
        [requestId, technicianId, 'assigned', 'Assigned by employee'],
      );
      await runStatement(
        db,
        'UPDATE maintenance_requests SET technician_id = ?, status = ? WHERE id = ?',
        [technicianId, 'assigned', requestId],
      );
      await runStatement(
        db,
        `INSERT INTO notifications (user_id, channel, subject, body, status) VALUES
         (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)`,
        [
          technicianId, 'in_app', 'أمر عمل جديد', 'تم تعيين طلب صيانة جديد لك.', 'queued',
          maintenanceRequest.owner_id, 'in_app', 'تحديث صيانة', 'تم تعيين فني لمعالجة طلب الصيانة.', 'queued',
        ],
      );
      await runStatement(
        db,
        'INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, metadata) VALUES (?, ?, ?, ?, ?)',
        [req.user.sub, 'MAINTENANCE_ASSIGN_TECHNICIAN', 'maintenance_requests', String(requestId), JSON.stringify({ technicianId, workOrderId: workOrderResult.lastID })],
      );
      res.status(201).json({ maintenanceRequestId: Number(requestId), workOrderId: workOrderResult.lastID, status: 'assigned' });
    } finally {
      await closeDb(db);
    }
  });

  app.patch('/technicians/work-orders/:id', authenticateJwt, requireRoles(['technician']), requirePermission('maintenance:work:update'), async (req, res) => {
    const workOrderId = req.params.id;
    const { status, report } = req.body || {};
    if (!status) {
      res.status(400).json({ error: 'status is required' });
      return;
    }
    const allowedStatuses = new Set(['in_progress', 'completed']);
    if (!allowedStatuses.has(status)) {
      res.status(400).json({ error: 'Unsupported work order status' });
      return;
    }

    const db = openDb(dbPath);
    try {
      const rows = await queryAll(
        db,
        'SELECT id, maintenance_request_id, technician_id FROM work_orders WHERE id = ? LIMIT 1',
        [workOrderId],
      );
      const workOrder = rows[0];
      if (!workOrder || workOrder.technician_id !== req.user.sub) {
        res.status(404).json({ error: 'Work order not found for this technician' });
        return;
      }

      await runStatement(
        db,
        'UPDATE work_orders SET status = ?, notes = ? WHERE id = ?',
        [status, report || null, workOrderId],
      );
      const requestStatus = status === 'completed' ? 'awaiting_employee_approval' : 'in_progress';
      await runStatement(
        db,
        'UPDATE maintenance_requests SET status = ? WHERE id = ?',
        [requestStatus, workOrder.maintenance_request_id],
      );
      await runStatement(
        db,
        'INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, metadata) VALUES (?, ?, ?, ?, ?)',
        [req.user.sub, 'WORK_ORDER_STATUS_UPDATE', 'work_orders', String(workOrderId), JSON.stringify({ status, report: report || null })],
      );
      res.json({ workOrderId: Number(workOrderId), status });
    } finally {
      await closeDb(db);
    }
  });

  app.patch('/employees/maintenance-requests/:id/approve-completion', authenticateJwt, requireRoles(['leasing_officer', 'collections_officer', 'operations_manager']), requirePermission('maintenance:approve'), async (req, res) => {
    const requestId = req.params.id;
    const db = openDb(dbPath);
    try {
      const requests = await queryAll(
        db,
        `SELECT mr.id, mr.tenant_id, p.owner_id
         FROM maintenance_requests mr
         INNER JOIN properties p ON p.id = mr.property_id
         WHERE mr.id = ? LIMIT 1`,
        [requestId],
      );
      const maintenanceRequest = requests[0];
      if (!maintenanceRequest) {
        res.status(404).json({ error: 'Maintenance request not found' });
        return;
      }

      await runStatement(db, 'UPDATE maintenance_requests SET status = ? WHERE id = ?', ['closed', requestId]);
      await runStatement(
        db,
        'UPDATE work_orders SET status = ? WHERE maintenance_request_id = ? AND status = ?',
        ['approved', requestId, 'completed'],
      );
      await runStatement(
        db,
        `INSERT INTO notifications (user_id, channel, subject, body, status) VALUES
         (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)`,
        [
          maintenanceRequest.owner_id, 'in_app', 'إغلاق طلب صيانة', 'تم إغلاق طلب الصيانة بعد الاعتماد.', 'queued',
          maintenanceRequest.tenant_id, 'in_app', 'تقييم الصيانة', 'يرجى تقييم خدمة الصيانة بعد الإغلاق.', 'queued',
        ],
      );
      await runStatement(
        db,
        'INSERT INTO audit_logs (actor_user_id, action, target_type, target_id) VALUES (?, ?, ?, ?)',
        [req.user.sub, 'MAINTENANCE_CLOSE_APPROVED', 'maintenance_requests', String(requestId)],
      );
      res.json({ maintenanceRequestId: Number(requestId), status: 'closed' });
    } finally {
      await closeDb(db);
    }
  });

  app.post('/tenants/maintenance-requests/:id/rating', authenticateJwt, requireRoles(['tenant']), requirePermission('maintenance:rate'), async (req, res) => {
    const requestId = req.params.id;
    const { rating, comment } = req.body || {};
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      res.status(400).json({ error: 'rating must be an integer between 1 and 5' });
      return;
    }

    const db = openDb(dbPath);
    try {
      const rows = await queryAll(
        db,
        'SELECT id, tenant_id, status FROM maintenance_requests WHERE id = ? LIMIT 1',
        [requestId],
      );
      const maintenanceRequest = rows[0];
      if (!maintenanceRequest || maintenanceRequest.tenant_id !== req.user.sub) {
        res.status(404).json({ error: 'Maintenance request not found for this tenant' });
        return;
      }
      if (maintenanceRequest.status !== 'closed') {
        res.status(400).json({ error: 'Maintenance request must be closed before rating' });
        return;
      }

      await runStatement(
        db,
        'INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, metadata) VALUES (?, ?, ?, ?, ?)',
        [req.user.sub, 'MAINTENANCE_RATE_SERVICE', 'maintenance_requests', String(requestId), JSON.stringify({ rating, comment: comment || null })],
      );
      res.status(201).json({ maintenanceRequestId: Number(requestId), rating });
    } finally {
      await closeDb(db);
    }
  });

  app.patch('/technicians/maintenance-requests/:id/status', authenticateJwt, requireRoles(['technician']), async (req, res) => {
    const { status, report } = req.body || {};
    const requestId = req.params.id;
    if (!status) {
      res.status(400).json({ error: 'status is required' });
      return;
    }

    const db = openDb(dbPath);
    try {
      await runStatement(
        db,
        'UPDATE maintenance_requests SET status = ?, technician_id = ? WHERE id = ?',
        [status, req.user.sub, requestId],
      );
      await runStatement(
        db,
        'INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, metadata) VALUES (?, ?, ?, ?, ?)',
        [req.user.sub, 'MAINTENANCE_STATUS_UPDATE', 'maintenance_requests', String(requestId), JSON.stringify({ report: report || null })],
      );
      res.json({ maintenanceRequestId: Number(requestId), status });
    } finally {
      await closeDb(db);
    }
  });

  app.get('/owners/revenue', authenticateJwt, requireRoles(['owner']), async (req, res) => {
    const db = openDb(dbPath);
    try {
      const result = await queryAll(
        db,
        `SELECT COALESCE(SUM(p.amount), 0) AS totalRevenue
         FROM payments p
         INNER JOIN contracts c ON c.id = p.contract_id
         WHERE c.owner_id = ? AND p.status = 'paid'`,
        [req.user.sub],
      );
      res.json({ totalRevenue: result[0]?.totalRevenue || 0 });
    } finally {
      await closeDb(db);
    }
  });

  app.get('/me/notifications', authenticateJwt, requirePermission('notifications:read:self'), async (req, res) => {
    if (typeof req.user.sub !== 'number') {
      res.status(403).json({ error: 'User notifications are not available for this token type' });
      return;
    }

    const db = openDb(dbPath);
    try {
      const notifications = await queryAll(
        db,
        `SELECT id, channel, subject, body, status, created_at
         FROM notifications
         WHERE user_id = ?
         ORDER BY id DESC
         LIMIT 100`,
        [req.user.sub],
      );
      res.json({ notifications });
    } finally {
      await closeDb(db);
    }
  });

  app.patch('/me/notifications/:id/read', authenticateJwt, requirePermission('notifications:mark-read:self'), async (req, res) => {
    if (typeof req.user.sub !== 'number') {
      res.status(403).json({ error: 'User notifications are not available for this token type' });
      return;
    }

    const notificationId = req.params.id;
    const db = openDb(dbPath);
    try {
      const rows = await queryAll(
        db,
        'SELECT id, user_id FROM notifications WHERE id = ? LIMIT 1',
        [notificationId],
      );
      const notification = rows[0];
      if (!notification || notification.user_id !== req.user.sub) {
        res.status(404).json({ error: 'Notification not found' });
        return;
      }

      await runStatement(db, 'UPDATE notifications SET status = ? WHERE id = ?', ['read', notificationId]);
      await runStatement(
        db,
        'INSERT INTO audit_logs (actor_user_id, action, target_type, target_id) VALUES (?, ?, ?, ?)',
        [req.user.sub, 'NOTIFICATION_MARK_READ', 'notifications', String(notificationId)],
      );
      res.json({ notificationId: Number(notificationId), status: 'read' });
    } finally {
      await closeDb(db);
    }
  });

  app.get('/reports/occupancy', authenticateJwt, requireRoles(['system_admin', 'operations_manager', 'financial_auditor']), requirePermission('reports:view:management'), async (_req, res) => {
    const db = openDb(dbPath);
    try {
      const rows = await queryAll(
        db,
        `SELECT
           COUNT(*) AS totalUnits,
           SUM(CASE WHEN occupancy_status = 'vacant' THEN 1 ELSE 0 END) AS vacantUnits,
           SUM(CASE WHEN occupancy_status <> 'vacant' THEN 1 ELSE 0 END) AS occupiedUnits
         FROM units`,
      );
      const row = rows[0] || { totalUnits: 0, vacantUnits: 0, occupiedUnits: 0 };
      const totalUnits = Number(row.totalUnits || 0);
      const vacantUnits = Number(row.vacantUnits || 0);
      const occupiedUnits = Number(row.occupiedUnits || 0);
      const occupancyRate = totalUnits === 0 ? 0 : Number(((occupiedUnits / totalUnits) * 100).toFixed(2));
      res.json({ totalUnits, vacantUnits, occupiedUnits, occupancyRate });
    } finally {
      await closeDb(db);
    }
  });

  app.get('/reports/contracts-summary', authenticateJwt, requireRoles(['system_admin', 'operations_manager', 'financial_auditor']), requirePermission('reports:view:management'), async (_req, res) => {
    const db = openDb(dbPath);
    try {
      const rows = await queryAll(
        db,
        `SELECT
           COUNT(*) AS totalContracts,
           SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS activeContracts,
           SUM(CASE WHEN status = 'signed' THEN 1 ELSE 0 END) AS signedContracts,
           SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approvedContracts,
           SUM(CASE WHEN status = 'pending_approval' THEN 1 ELSE 0 END) AS pendingApprovalContracts
         FROM contracts`,
      );
      const row = rows[0] || {};
      res.json({
        totalContracts: Number(row.totalContracts || 0),
        activeContracts: Number(row.activeContracts || 0),
        signedContracts: Number(row.signedContracts || 0),
        approvedContracts: Number(row.approvedContracts || 0),
        pendingApprovalContracts: Number(row.pendingApprovalContracts || 0),
      });
    } finally {
      await closeDb(db);
    }
  });

  app.get('/reports/financial-summary', authenticateJwt, requireRoles(['system_admin', 'operations_manager', 'financial_auditor']), requirePermission('reports:view:management'), async (_req, res) => {
    const db = openDb(dbPath);
    try {
      const paymentRows = await queryAll(
        db,
        `SELECT COALESCE(SUM(amount), 0) AS collectedRent
         FROM payments
         WHERE status = 'paid'`,
      );
      const revenueRows = await queryAll(
        db,
        'SELECT COALESCE(SUM(amount), 0) AS otherRevenue FROM revenues',
      );
      const expenseRows = await queryAll(
        db,
        'SELECT COALESCE(SUM(amount), 0) AS totalExpenses FROM expenses',
      );

      const collectedRent = Number(paymentRows[0]?.collectedRent || 0);
      const otherRevenue = Number(revenueRows[0]?.otherRevenue || 0);
      const totalExpenses = Number(expenseRows[0]?.totalExpenses || 0);
      const totalRevenue = collectedRent + otherRevenue;
      res.json({
        collectedRent,
        otherRevenue,
        totalRevenue,
        totalExpenses,
        netIncome: totalRevenue - totalExpenses,
      });
    } finally {
      await closeDb(db);
    }
  });

  app.get('/dashboard/management', authenticateJwt, requireRoles(['system_admin', 'operations_manager', 'financial_auditor']), requirePermission('dashboard:view:management'), async (_req, res) => {
    const db = openDb(dbPath);
    try {
      const dashboard = await buildManagementDashboard(db);
      res.json(dashboard);
    } finally {
      await closeDb(db);
    }
  });

  app.get('/dashboard/employee', authenticateJwt, requireRoles(['leasing_officer', 'collections_officer', 'operations_manager']), requirePermission('dashboard:view:employee'), async (req, res) => {
    const db = openDb(dbPath);
    try {
      const dashboard = await buildEmployeeDashboard(db, req.user.sub);
      res.json(dashboard);
    } finally {
      await closeDb(db);
    }
  });

  app.get('/dashboard/owner', authenticateJwt, requireRoles(['owner']), requirePermission('dashboard:view:owner'), async (req, res) => {
    const db = openDb(dbPath);
    try {
      const dashboard = await buildOwnerDashboard(db, req.user.sub);
      res.json(dashboard);
    } finally {
      await closeDb(db);
    }
  });

  app.get('/dashboard/tenant', authenticateJwt, requireRoles(['tenant']), requirePermission('dashboard:view:tenant'), async (req, res) => {
    const db = openDb(dbPath);
    try {
      const dashboard = await buildTenantDashboard(db, req.user.sub);
      res.json(dashboard);
    } finally {
      await closeDb(db);
    }
  });

  app.get('/dashboard/technician', authenticateJwt, requireRoles(['technician']), requirePermission('dashboard:view:technician'), async (req, res) => {
    const db = openDb(dbPath);
    try {
      const dashboard = await buildTechnicianDashboard(db, req.user.sub);
      res.json(dashboard);
    } finally {
      await closeDb(db);
    }
  });

  app.get('/dashboard/me', authenticateJwt, async (req, res) => {
    const db = openDb(dbPath);
    try {
      const role = req.user.role;
      if (['system_admin', 'operations_manager', 'financial_auditor'].includes(role)) {
        if (!(await roleHasPermission(db, role, 'dashboard:view:management'))) {
          res.status(403).json({ error: 'Missing permission: dashboard:view:management' });
          return;
        }
        res.json(await buildManagementDashboard(db));
        return;
      }
      if (['leasing_officer', 'collections_officer'].includes(role)) {
        if (!(await roleHasPermission(db, role, 'dashboard:view:employee'))) {
          res.status(403).json({ error: 'Missing permission: dashboard:view:employee' });
          return;
        }
        res.json(await buildEmployeeDashboard(db, req.user.sub));
        return;
      }
      if (role === 'owner') {
        if (!(await roleHasPermission(db, role, 'dashboard:view:owner'))) {
          res.status(403).json({ error: 'Missing permission: dashboard:view:owner' });
          return;
        }
        res.json(await buildOwnerDashboard(db, req.user.sub));
        return;
      }
      if (role === 'tenant') {
        if (!(await roleHasPermission(db, role, 'dashboard:view:tenant'))) {
          res.status(403).json({ error: 'Missing permission: dashboard:view:tenant' });
          return;
        }
        res.json(await buildTenantDashboard(db, req.user.sub));
        return;
      }
      if (role === 'technician') {
        if (!(await roleHasPermission(db, role, 'dashboard:view:technician'))) {
          res.status(403).json({ error: 'Missing permission: dashboard:view:technician' });
          return;
        }
        res.json(await buildTechnicianDashboard(db, req.user.sub));
        return;
      }
      res.status(403).json({ error: 'No dashboard for this role' });
    } finally {
      await closeDb(db);
    }
  });

  app.post('/auth/oauth/token', async (req, res) => {
    const {
      grant_type: grantType,
      username,
      password,
      challenge_id: challengeId,
      otp_code: otpCode,
      client_id: clientId,
      client_secret: clientSecret,
    } = req.body || {};

    if (grantType === 'client_credentials') {
      const expectedClientId = process.env.OAUTH_CLIENT_ID || 'default-client';
      const expectedClientSecret = process.env.OAUTH_CLIENT_SECRET || 'default-secret';
      if (clientId !== expectedClientId || clientSecret !== expectedClientSecret) {
        res.status(401).json({ error: 'invalid_client' });
        return;
      }

      const token = createToken({
        id: `service:${clientId}`,
        email: `${clientId}@service.local`,
        role: 'oauth_client',
      });
      res.json({
        access_token: token,
        token_type: 'Bearer',
        expires_in: TOKEN_EXPIRES_IN_SECONDS,
      });
      return;
    }

    if (grantType !== 'password') {
      res.status(400).json({ error: 'unsupported_grant_type' });
      return;
    }

    if (!username || !password) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }

    const db = openDb(dbPath);
    try {
      const users = await queryAll(db, 'SELECT * FROM users WHERE email = ? LIMIT 1', [
        username.toLowerCase(),
      ]);
      const user = users[0];
      if (!user || !user.password_hash) {
        res.status(401).json({ error: 'invalid_grant' });
        return;
      }

      const isValid = await verifyPassword(password, user.password_hash);
      if (!isValid) {
        res.status(401).json({ error: 'invalid_grant' });
        return;
      }

      if (!challengeId || !otpCode) {
        const { challengeId: generatedChallengeId, code } = await createTwoFactorChallenge(db, user.id);
        const payload = {
          error: 'two_factor_required',
          challenge_id: generatedChallengeId,
        };
        if (process.env.NODE_ENV === 'test') {
          payload.testCode = code;
        }
        res.status(401).json(payload);
        return;
      }

      const challenges = await queryAll(
        db,
        `SELECT id, user_id, code_hash
         FROM two_factor_challenges
         WHERE id = ?
           AND user_id = ?
           AND consumed_at IS NULL
           AND datetime(expires_at) >= datetime('now')
         LIMIT 1`,
        [challengeId, user.id],
      );
      const challenge = challenges[0];
      if (!challenge) {
        res.status(401).json({ error: 'invalid_grant' });
        return;
      }

      const otpMatches = await verifyPassword(otpCode, challenge.code_hash);
      if (!otpMatches) {
        res.status(401).json({ error: 'invalid_grant' });
        return;
      }

      await runStatement(db, 'UPDATE two_factor_challenges SET consumed_at = CURRENT_TIMESTAMP WHERE id = ?', [
        challenge.id,
      ]);

      const token = createToken({
        id: user.id,
        email: user.email,
        role: user.role,
      });
      res.json({
        access_token: token,
        token_type: 'Bearer',
        expires_in: TOKEN_EXPIRES_IN_SECONDS,
      });
    } finally {
      await closeDb(db);
    }
  });

  app.use((error, _req, res, _next) => {
    res.status(500).json({ error: error.message || 'Internal server error' });
  });

  return app;
}

function authenticateJwt(req, res, next) {
  const authorization = req.header('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing bearer token' });
    return;
  }

  const token = authorization.replace('Bearer ', '').trim();
  try {
    req.user = verifyToken(token);
    next();
  } catch (_error) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function requireRoles(allowedRoles) {
  const allowed = new Set(allowedRoles);
  return (req, res, next) => {
    if (!req.user?.role || !allowed.has(req.user.role)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    next();
  };
}

async function createTwoFactorChallenge(db, userId) {
  const code = generateOtpCode();
  const codeHash = await hashPassword(code);
  const challengeResult = await runStatement(
    db,
    `INSERT INTO two_factor_challenges (user_id, code_hash, expires_at)
     VALUES (?, ?, datetime('now', ?))`,
    [userId, codeHash, `+${TWO_FACTOR_TTL_MINUTES} minutes`],
  );
  return { challengeId: challengeResult.lastID, code };
}

function resolvePortalForRole(role) {
  if (['system_admin', 'operations_manager', 'financial_auditor'].includes(role)) {
    return 'management';
  }
  if (['leasing_officer', 'collections_officer'].includes(role)) {
    return 'employee';
  }
  if (role === 'owner') {
    return 'owner';
  }
  if (role === 'tenant') {
    return 'tenant';
  }
  if (role === 'technician') {
    return 'technician';
  }
  return null;
}

async function roleHasPermission(db, role, permissionKey) {
  const rows = await queryAll(
    db,
    `SELECT 1
     FROM roles r
     INNER JOIN role_permissions rp ON rp.role_id = r.id
     INNER JOIN permissions p ON p.id = rp.permission_id
     WHERE r.name = ? AND p.key = ?
     LIMIT 1`,
    [role, permissionKey],
  );
  return rows.length > 0;
}

async function buildManagementDashboard(db) {
  const [contractsRow] = await queryAll(
    db,
    `SELECT
       COUNT(*) AS totalContracts,
       SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS activeContracts
     FROM contracts`,
  );
  const [maintenanceRow] = await queryAll(
    db,
    `SELECT
       SUM(CASE WHEN status IN ('open', 'assigned', 'in_progress', 'awaiting_employee_approval') THEN 1 ELSE 0 END) AS openMaintenance,
       SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) AS closedMaintenance
     FROM maintenance_requests`,
  );
  const [financeRow] = await queryAll(
    db,
    `SELECT COALESCE(SUM(amount), 0) AS collectedRent
     FROM payments WHERE status = 'paid'`,
  );

  return {
    role: 'management',
    contracts: {
      total: Number(contractsRow?.totalContracts || 0),
      active: Number(contractsRow?.activeContracts || 0),
    },
    maintenance: {
      open: Number(maintenanceRow?.openMaintenance || 0),
      closed: Number(maintenanceRow?.closedMaintenance || 0),
    },
    finance: {
      collectedRent: Number(financeRow?.collectedRent || 0),
    },
  };
}

async function buildEmployeeDashboard(db, userId) {
  const [contractRow] = await queryAll(
    db,
    `SELECT
       SUM(CASE WHEN status = 'pending_approval' THEN 1 ELSE 0 END) AS pendingApprovalContracts,
       SUM(CASE WHEN status = 'signed' THEN 1 ELSE 0 END) AS readyToActivateContracts
     FROM contracts`,
  );
  const [maintenanceRow] = await queryAll(
    db,
    `SELECT
       SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS newMaintenance,
       SUM(CASE WHEN status = 'awaiting_employee_approval' THEN 1 ELSE 0 END) AS awaitingApprovalMaintenance
     FROM maintenance_requests`,
  );
  const [notificationsRow] = await queryAll(
    db,
    `SELECT COUNT(*) AS unreadNotifications
     FROM notifications
     WHERE user_id = ? AND status <> 'read'`,
    [userId],
  );

  return {
    role: 'employee',
    contracts: {
      pendingApproval: Number(contractRow?.pendingApprovalContracts || 0),
      readyToActivate: Number(contractRow?.readyToActivateContracts || 0),
    },
    maintenance: {
      new: Number(maintenanceRow?.newMaintenance || 0),
      awaitingApproval: Number(maintenanceRow?.awaitingApprovalMaintenance || 0),
    },
    notifications: {
      unread: Number(notificationsRow?.unreadNotifications || 0),
    },
  };
}

async function buildOwnerDashboard(db, ownerId) {
  const [propertyRow] = await queryAll(
    db,
    'SELECT COUNT(*) AS propertiesCount FROM properties WHERE owner_id = ?',
    [ownerId],
  );
  const [contractRow] = await queryAll(
    db,
    `SELECT COUNT(*) AS activeContracts
     FROM contracts
     WHERE owner_id = ? AND status = 'active'`,
    [ownerId],
  );
  const [revenueRow] = await queryAll(
    db,
    `SELECT COALESCE(SUM(p.amount), 0) AS totalRevenue
     FROM payments p
     INNER JOIN contracts c ON c.id = p.contract_id
     WHERE c.owner_id = ? AND p.status = 'paid'`,
    [ownerId],
  );
  const [maintenanceRow] = await queryAll(
    db,
    `SELECT COUNT(*) AS openMaintenance
     FROM maintenance_requests mr
     INNER JOIN properties p ON p.id = mr.property_id
     WHERE p.owner_id = ? AND mr.status <> 'closed'`,
    [ownerId],
  );

  return {
    role: 'owner',
    properties: Number(propertyRow?.propertiesCount || 0),
    activeContracts: Number(contractRow?.activeContracts || 0),
    totalRevenue: Number(revenueRow?.totalRevenue || 0),
    openMaintenance: Number(maintenanceRow?.openMaintenance || 0),
  };
}

async function buildTenantDashboard(db, tenantId) {
  const [contractRow] = await queryAll(
    db,
    `SELECT
       SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS activeContracts,
       SUM(CASE WHEN status IN ('pending_approval', 'approved', 'signed') THEN 1 ELSE 0 END) AS pendingContracts
     FROM contracts
     WHERE tenant_id = ?`,
    [tenantId],
  );
  const [paymentsRow] = await queryAll(
    db,
    `SELECT COUNT(*) AS paidPayments
     FROM payments p
     INNER JOIN contracts c ON c.id = p.contract_id
     WHERE c.tenant_id = ? AND p.status = 'paid'`,
    [tenantId],
  );
  const [maintenanceRow] = await queryAll(
    db,
    `SELECT
       SUM(CASE WHEN status <> 'closed' THEN 1 ELSE 0 END) AS openMaintenance,
       SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) AS closedMaintenance
     FROM maintenance_requests
     WHERE tenant_id = ?`,
    [tenantId],
  );
  const [notificationsRow] = await queryAll(
    db,
    `SELECT COUNT(*) AS unreadNotifications
     FROM notifications
     WHERE user_id = ? AND status <> 'read'`,
    [tenantId],
  );

  return {
    role: 'tenant',
    contracts: {
      active: Number(contractRow?.activeContracts || 0),
      pending: Number(contractRow?.pendingContracts || 0),
    },
    payments: {
      paid: Number(paymentsRow?.paidPayments || 0),
    },
    maintenance: {
      open: Number(maintenanceRow?.openMaintenance || 0),
      closed: Number(maintenanceRow?.closedMaintenance || 0),
    },
    notifications: {
      unread: Number(notificationsRow?.unreadNotifications || 0),
    },
  };
}

async function buildTechnicianDashboard(db, technicianId) {
  const [workOrderRow] = await queryAll(
    db,
    `SELECT
       SUM(CASE WHEN status = 'assigned' THEN 1 ELSE 0 END) AS assignedOrders,
       SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS inProgressOrders,
       SUM(CASE WHEN status IN ('completed', 'approved') THEN 1 ELSE 0 END) AS completedOrders
     FROM work_orders
     WHERE technician_id = ?`,
    [technicianId],
  );
  const [notificationsRow] = await queryAll(
    db,
    `SELECT COUNT(*) AS unreadNotifications
     FROM notifications
     WHERE user_id = ? AND status <> 'read'`,
    [technicianId],
  );

  return {
    role: 'technician',
    workOrders: {
      assigned: Number(workOrderRow?.assignedOrders || 0),
      inProgress: Number(workOrderRow?.inProgressOrders || 0),
      completed: Number(workOrderRow?.completedOrders || 0),
    },
    notifications: {
      unread: Number(notificationsRow?.unreadNotifications || 0),
    },
  };
}

function startServer(port = process.env.PORT || 3000) {
  const app = createApp();
  return app.listen(port, () => {
    console.log(`Backend running on port ${port}`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = {
  createApp,
  startServer,
};
