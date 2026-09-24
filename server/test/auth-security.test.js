const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const express = require('express');
const cors = require('cors');
const { app, registerUser, resetStore, support, dataDir } = require('../test-support/helpers');
const { readAuthConfig, corsOptions } = require('../config/auth');
const { createAuthService } = require('../services/auth-service');
const { tokenHash, signToken, passwordFields, verifyPassword } = require('../services/auth-crypto');
const { memoryAuth, settings } = require('../test-support/auth-memory');
const { createDualAuthRepository } = require('../repositories/dualAuthRepository');
const fs = require('node:fs');
const path = require('node:path');

test.beforeEach(resetStore);
test('sessions persist only bearer hashes; logout revokes and survives store reload', async () => {
  const user = await registerUser();
  const stored = JSON.parse(fs.readFileSync(path.join(dataDir, 'app-store.json')));
  assert.equal(stored.auth.sessions[0].tokenHash, tokenHash(user.token));
  assert.ok(!JSON.stringify(stored).includes(user.token));
  const logout = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${user.token}`);
  assert.equal(logout.status, 200);
  assert.ok(support.loadStore().auth.sessions[0].revokedAt);
  assert.equal((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${user.token}`)).status, 401);
});
test('expired persisted sessions and forged or extra token segments are rejected', async () => {
  const user = await registerUser();
  const session = await support.authRepository.findSession(tokenHash(user.token));
  session.expiresAt = new Date(0).toISOString();
  for (const token of [user.token, user.token + '.extra', 'invalid']) assert.equal(await support.authService.authenticate(token), null);
});
test('legacy PBKDF2 hashes and pre-session bearer tokens remain valid only in legacy mode', async () => {
  const user = await registerUser();
  const stored = support.getUsers()[0];
  const original = { salt: stored.passwordSalt, hash: stored.passwordHash };
  const login = await support.authService.login({ email: user.email, password: user.password });
  assert.equal(login.user.id, user.user.id);
  assert.equal(stored.passwordSalt, original.salt);
  assert.equal(stored.passwordHash, original.hash);
  assert.ok(verifyPassword(user.password, stored));
  assert.ok(verifyPassword(user.password, { ...stored, passwordHash: stored.passwordHash.toUpperCase() }));
  assert.equal(verifyPassword(user.password, { ...stored, passwordHash: 'malformed' }), false);
  const old = signToken({ sub: stored.id, exp: Date.now() + 60000 }, process.env.AUTH_SECRET);
  assert.ok(await support.authService.authenticate(old));
  await support.authService.revoke(old);
  assert.equal(await support.authService.authenticate(old), null);
});
test('password reset is single-use, invalidates old sessions, preserves new password login', async () => {
  const user = await registerUser();
  const reset = await support.authService.requestReset({ email: user.email });
  const disk = fs.readFileSync(path.join(dataDir, 'app-store.json'), 'utf8');
  assert.ok(!disk.includes(reset.demoCode));
  const input = { email: user.email, code: reset.demoCode, password: 'new-safe-password' };
  const results = await Promise.allSettled([support.authService.confirmReset(input), support.authService.confirmReset(input)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(await support.authService.authenticate(user.token), null);
  await assert.rejects(support.authService.login({ email: user.email, password: user.password }), /invalid_credentials/);
  assert.ok((await support.authService.login({ email: user.email, password: input.password })).token);
});
test('new reset supersedes previous code; invalid and expired codes cannot reset a password', async () => {
  const user = await registerUser();
  const first = await support.authService.requestReset({ email: user.email });
  const second = await support.authService.requestReset({ email: user.email });
  if (first.demoCode !== second.demoCode) await assert.rejects(support.authService.confirmReset({ email: user.email, code: first.demoCode, password: 'new-password' }), /invalid_reset_code/);
  await assert.rejects(support.authService.confirmReset({ email: user.email, code: 'not-a-code', password: 'new-password' }), /invalid_reset_code/);
  support.getUsers()[0].passwordResetExpiresAt = new Date(0).toISOString();
  await assert.rejects(support.authService.confirmReset({ email: user.email, code: second.demoCode, password: 'new-password' }), /reset_code_expired/);
});
test('all five sensitive routes enforce bounded rate limits', async () => {
  for (const [route, limit] of [['login', 20], ['register', 10], ['forgot-password/request', 5], ['forgot-password/confirm', 10], ['demo', 10]]) {
    resetStore();
    for (let i = 0; i < limit; i++) assert.notEqual((await request(app).post('/api/auth/' + route).send({})).status, 429);
    const blocked = await request(app).post('/api/auth/' + route).set('X-Forwarded-For', '192.0.2.99').send({});
    assert.equal(blocked.status, 429, route);
    assert.equal(blocked.body.error, 'rate_limited');
    assert.ok(blocked.headers['retry-after']);
  }
});
test('deployed secrets, explicit modes, and reset-code disclosure fail safely', () => {
  for (const NODE_ENV of ['staging', 'production']) {
    assert.throws(() => readAuthConfig({ NODE_ENV }), /AUTH_SECRET/);
    assert.throws(() => readAuthConfig({ NODE_ENV, AUTH_SECRET: 'collecttrade-local-development-secret' }), /AUTH_SECRET/);
    const config = readAuthConfig({ NODE_ENV, AUTH_SECRET: 'x'.repeat(40), AUTH_RESET_DEMO_CODES: 'true', COLLECTTRADE_TEST: '1' });
    assert.equal(config.exposeResetCode, false);
  }
  assert.throws(() => readAuthConfig({ AUTH_PERSISTENCE_MODE: 'automatic' }), /invalid_auth/);
  assert.throws(() => readAuthConfig({ AUTH_PERSISTENCE_MODE: 'postgres' }), /DATABASE_URL/);
  assert.equal(readAuthConfig({}).mode, 'legacy');
  assert.equal(readAuthConfig({ NODE_ENV: 'development' }).exposeResetCode, false);
});
test('staging reset response is indistinguishable for known and unknown emails', async () => {
  const mem = memoryAuth();
  const service = createAuthService({ repository: mem.repo, config: { secret: 's'.repeat(40), mode: 'legacy', exposeResetCode: false }, defaultSettings: settings });
  await service.register({ name: 'Staging Test', email: 'reset@example.test', password: 'compatible-password' });
  assert.deepEqual(await service.requestReset({ email: 'reset@example.test' }), await service.requestReset({ email: 'unknown@example.test' }));
});
test('CORS allows exact configured HTTPS origins and local development only', async () => {
  for (const deployed of [false, true]) {
    const server = express();
    server.use(cors(corsOptions({ deployed, origins: ['https://brick-alpha.example'] })));
    server.get('/', (_req, res) => res.json({ ok: true }));
    for (const origin of ['https://brick-alpha.example', 'http://localhost:5173', 'https://attacker.example', 'https://brick-alpha.example.attacker.test']) {
      const response = await request(server).get('/').set('Origin', origin);
      const allowed = origin === 'https://brick-alpha.example' || (!deployed && origin === 'http://localhost:5173');
      assert.equal(response.headers['access-control-allow-origin'], allowed ? origin : undefined);
    }
  }
  assert.throws(() => readAuthConfig({ CORS_ALLOWED_ORIGINS: '*' }), /CORS/);
});
test('dual mode compares records, mirrors writes, and fails closed on drift or database errors', async () => {
  const legacy = memoryAuth(), pg = memoryAuth();
  const repo = createDualAuthRepository(legacy.repo, pg.repo);
  const service = createAuthService({ repository: repo, config: { mode: 'dual', secret: 'dual-test-secret', exposeResetCode: true }, defaultSettings: settings });
  const user = await service.register({ name: 'Dual Test', email: 'dual@example.test', password: 'legacy-password' });
  assert.equal(legacy.users.length, 1); assert.equal(pg.users.length, 1);
  assert.ok(await service.authenticate(user.token));
  const old = signToken({ sub: user.user.id, exp: Date.now() + 10000 }, 'dual-test-secret');
  assert.equal(await service.authenticate(old), null);
  pg.users[0].passwordHash = passwordFields('changed-password').passwordHash;
  await assert.rejects(service.login({ email: 'dual@example.test', password: 'legacy-password' }), /auth_dual_mismatch/);
  pg.repo.findById = async () => { throw new Error('database unavailable'); };
  await assert.rejects(service.authenticate(user.token), /database unavailable/);
});
test('auth audits never contain passwords, hashes, raw tokens or reset codes', async () => {
  const user = await registerUser();
  const reset = await support.authService.requestReset({ email: user.email });
  await assert.rejects(support.authService.login({ email: user.email, password: 'wrong-password' }));
  await support.authService.revoke(user.token);
  const events = support.loadStore().auth.events;
  assert.ok(events.some(e => e.action === 'auth.login_failure'));
  for (const event of events) assert.deepEqual(Object.keys(event).sort(), ['action', 'occurredAt', 'userId']);
  for (const secret of [user.password, user.token, reset.demoCode, support.getUsers()[0].passwordHash]) assert.ok(!JSON.stringify(events).includes(secret));
});
