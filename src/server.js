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

  app.get('/security/audit-logs', authenticateJwt, requireRoles(['system_admin', 'financial_auditor']), async (_req, res) => {
    const db = openDb(dbPath);
    try {
      const logs = await queryAll(
        db,
        'SELECT id, actor_user_id, action, target_type, target_id, created_at FROM audit_logs ORDER BY id DESC LIMIT 100',
      );
      res.json({ logs });
    } finally {
      await closeDb(db);
    }
  });

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

  app.post('/admin/properties', authenticateJwt, requireRoles(['system_admin', 'operations_manager']), async (req, res) => {
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

  app.post('/employees/contracts', authenticateJwt, requireRoles(['leasing_officer', 'operations_manager']), async (req, res) => {
    const { unitId, ownerId, tenantId, startDate, endDate } = req.body || {};
    if (!unitId || !ownerId || !tenantId || !startDate || !endDate) {
      res.status(400).json({ error: 'Missing contract fields' });
      return;
    }

    const db = openDb(dbPath);
    try {
      const result = await runStatement(
        db,
        'INSERT INTO contracts (unit_id, owner_id, tenant_id, start_date, end_date) VALUES (?, ?, ?, ?, ?)',
        [unitId, ownerId, tenantId, startDate, endDate],
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

  app.post('/tenants/payments', authenticateJwt, requireRoles(['tenant']), async (req, res) => {
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

  app.post('/tenants/maintenance-requests', authenticateJwt, requireRoles(['tenant']), async (req, res) => {
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
