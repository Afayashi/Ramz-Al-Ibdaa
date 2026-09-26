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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ramz-message-test-'));
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

test('users can send/read messages and message read status updates', async () => {
  const { app } = makeTestContext();

  const tenant = await registerAndLogin(app, {
    fullName: 'Tenant Msg',
    email: 'tenant.message@test.com',
    password: 'StrongPassword!123',
    role: 'tenant',
  });
  const owner = await registerAndLogin(app, {
    fullName: 'Owner Msg',
    email: 'owner.message@test.com',
    password: 'StrongPassword!123',
    role: 'owner',
  });

  const sendMessage = await request(app)
    .post('/me/messages')
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + tenant.token)
    .send({ recipientId: owner.userId, body: 'مرحباً، تم إرسال دفعة الإيجار.' });
  assert.equal(sendMessage.status, 201);
  assert.equal(typeof sendMessage.body.messageId, 'number');

  const sent = await request(app)
    .get('/me/messages/sent')
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + tenant.token);
  assert.equal(sent.status, 200);
  assert.equal(sent.body.messages.length >= 1, true);

  const inbox = await request(app)
    .get('/me/messages/inbox')
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + owner.token);
  assert.equal(inbox.status, 200);
  assert.equal(inbox.body.messages.length >= 1, true);
  const inboxMessageId = inbox.body.messages[0].id;
  assert.equal(inbox.body.messages[0].is_read, 0);

  const markRead = await request(app)
    .patch(`/me/messages/${inboxMessageId}/read`)
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + owner.token);
  assert.equal(markRead.status, 200);
  assert.equal(markRead.body.status, 'read');

  const unreadInbox = await request(app)
    .get('/me/messages/inbox')
    .query({ unreadOnly: true })
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + owner.token);
  assert.equal(unreadInbox.status, 200);
  assert.equal(unreadInbox.body.messages.length, 0);
});

test('service tokens cannot use user messaging endpoints', async () => {
  process.env.OAUTH_CLIENT_ID = 'msg-client';
  process.env.OAUTH_CLIENT_SECRET = 'msg-secret';
  const { app } = makeTestContext();

  const tokenResponse = await request(app)
    .post('/auth/oauth/token')
    .set('x-api-key', 'test-api-key')
    .send({
      grant_type: 'client_credentials',
      client_id: 'msg-client',
      client_secret: 'msg-secret',
    });
  assert.equal(tokenResponse.status, 200);

  const inboxResponse = await request(app)
    .get('/me/messages/inbox')
    .set('x-api-key', 'test-api-key')
    .set('authorization', 'Bearer ' + tokenResponse.body.access_token);
  assert.equal(inboxResponse.status, 403);
});
