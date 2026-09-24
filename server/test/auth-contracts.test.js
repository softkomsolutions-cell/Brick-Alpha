const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app, resetStore, registerUser } = require('../test-support/helpers');

test.beforeEach(resetStore);

function assertAuthEnvelope(body) {
  assert.deepEqual(Object.keys(body).sort(), ['ok', 'settings', 'token', 'user']);
  assert.equal(body.ok, true);
  assert.equal(typeof body.token, 'string');
  const baseKeys = ['createdAt', 'email', 'id', 'lastLoginAt', 'name', 'role'];
  const expectedKeys = [...baseKeys];
  if (body.user?.isDemo) {
    expectedKeys.push('isDemo');
  }
  assert.deepEqual(Object.keys(body.user).sort(), expectedKeys.sort());
  assert.equal(typeof body.settings, 'object');
}

test('register/login/demo/me retain envelopes and bearer authentication', async () => {
  const user = await registerUser({ email: 'Contract@EXAMPLE.test' });
  assert.equal(user.user.email, 'contract@example.test');
  const login = await request(app).post('/api/auth/login').send({ email: ' CONTRACT@example.test ', password: user.password });
  assert.equal(login.status, 200);
  assertAuthEnvelope(login.body);
  const demo = await request(app).post('/api/auth/demo').send({ name: 'D' });
  assert.equal(demo.status, 201);
  assertAuthEnvelope(demo.body);
  assert.equal(demo.body.user.role, 'partner');
  assert.equal(demo.body.user.name, 'D');
  for (const auth of [login.body, demo.body]) {
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${auth.token}`);
    assert.equal(me.status, 200);
    assert.deepEqual(Object.keys(me.body).sort(), ['ok', 'settings', 'user']);
    assert.deepEqual(me.body.user, auth.user);
    assert.deepEqual(me.body.settings, auth.settings);
  }
});

test('duplicate registration and invalid login retain status and errors', async () => {
  const user = await registerUser();
  const duplicate = await request(app).post('/api/auth/register').send({ name: user.name, email: user.email.toUpperCase(), password: user.password });
  assert.equal(duplicate.status, 409);
  assert.deepEqual(duplicate.body, { ok: false, error: 'email_in_use' });
  const login = await request(app).post('/api/auth/login').send({ email: user.email, password: 'incorrect' });
  assert.equal(login.status, 401);
  assert.deepEqual(login.body, { ok: false, error: 'invalid_credentials' });
});

test('reset response keys and development code remain frontend compatible', async () => {
  const user = await registerUser();
  const reset = await request(app).post('/api/auth/forgot-password/request').send({ email: user.email });
  assert.equal(reset.status, 200);
  assert.deepEqual(Object.keys(reset.body).sort(), ['demoCode', 'expiresAt', 'message', 'ok']);
  assert.match(reset.body.demoCode, /^\d{6}$/);
  const unknown = await request(app).post('/api/auth/forgot-password/request').send({ email: 'missing@example.test' });
  assert.equal(unknown.status, 200);
  assert.equal(unknown.body.demoCode, null);
  assert.equal(unknown.body.expiresAt, null);
});
