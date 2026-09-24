const test = require('node:test');
const assert = require('node:assert/strict');
const { createPostgresAuthRepository } = require('../repositories/postgresAuthRepository');
const { settings } = require('../test-support/auth-memory');
const id = '9256d966-a7d8-4f35-a8c8-ef01a837c6e8';
const row = { id, legacyId: 'legacy-42', email: 'user@example.test', name: 'Test User', role: 'PARTNER', passwordSalt: null, passwordHash: null, createdAt: new Date(0), lastLoginAt: null };
test('Postgres repository maps external legacy IDs while querying UUID foreign keys', async () => {
  let settingsQuery;
  const client = { user: { findFirst: async query => { assert.deepEqual(query.where.OR, [{ legacyId: 'legacy-42' }]); return row; } }, userSettings: { findUnique: async query => { settingsQuery = query; return { ...settings, userId: id, id: 'internal-settings-id' }; } } };
  const repo = createPostgresAuthRepository(client);
  const user = await repo.findById('legacy-42');
  assert.equal(user.id, 'legacy-42'); assert.equal(user.databaseId, id); assert.equal(user.role, 'partner');
  assert.deepEqual(await repo.getSettings('legacy-42'), settings);
  assert.deepEqual(settingsQuery, { where: { userId: id } });
});
test('Postgres reset consume is conditional on user, hash, unused state, and future expiry', async () => {
  let query;
  const client = { user: { findFirst: async () => row }, passwordResetToken: { updateMany: async value => { query = value; return { count: 1 }; } } };
  const repo = createPostgresAuthRepository(client);
  const now = new Date().toISOString();
  assert.equal(await repo.consumeReset('legacy-42', 'test-hash', now), true);
  assert.deepEqual(query.where, { userId: id, tokenHash: 'test-hash', usedAt: null, expiresAt: { gt: new Date(now) } });
  assert.deepEqual(query.data, { usedAt: new Date(now) });
});
test('Postgres transactions use serializable isolation and never replay side effects', async () => {
  let calls = 0;
  const client = { $transaction: async (work, options) => { assert.equal(options.isolationLevel, 'Serializable'); await work(client); throw Object.assign(new Error('conflict'), { code: 'P2034' }); } };
  const repo = createPostgresAuthRepository(client);
  await assert.rejects(repo.transaction(async () => { calls += 1; }), /conflict/);
  assert.equal(calls, 1);
});
test('Postgres user creation copies auth/settings only, never embedded business data', async () => {
  let data;
  const client = { user: { create: async query => { data = query.data; return row; } } };
  const repo = createPostgresAuthRepository(client);
  await repo.createUser({ ...row, id: 'legacy-42', role: 'partner', createdAt: new Date(0).toISOString(), trades: [{ ignored: true }] }, { ...settings, connectors: { ignored: true } });
  assert.equal(data.legacyId, 'legacy-42'); assert.equal(data.id, undefined);
  assert.equal(data.trades, undefined); assert.equal(data.settings.create.connectors, undefined);
});
