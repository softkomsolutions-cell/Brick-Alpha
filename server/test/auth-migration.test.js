const test = require('node:test');
const assert = require('node:assert/strict');
const { inspectSource, migrateUsers } = require('../services/user-migration');
const { parseArgs } = require('../scripts/migrate-auth-users');
const { memoryAuth, settings } = require('../test-support/auth-memory');
const { passwordFields } = require('../services/auth-crypto');
const { createAuthService } = require('../services/auth-service');
function fixture() {
  const user = { id: 'legacy-user-42', name: 'Migrated User', email: ' MIGRATED@example.test ', role: 'partner', ...passwordFields('unchanged-legacy-password'), createdAt: '2026-01-01T00:00:00.000Z', lastLoginAt: null };
  return { users: [user], userStates: { [user.id]: { settings, trades: [{ secretFinancialRecord: true }], connectors: { secret: 'never-import' } } }, feedbackItems: [{ neverImport: true }] };
}
test('source and staging target must be explicit, with exclusive dry-run/apply', () => {
  assert.throws(() => parseArgs([]), /explicit_source/);
  assert.throws(() => parseArgs(['--file', 'source.json', '--dry-run', '--apply']), /explicit_source/);
  assert.throws(() => parseArgs(['--file', 'source.json', '--apply']), /staging/);
});
test('dry-run is read-only; apply is idempotent and preserves legacy password and ID', async () => {
  const source = fixture(), bytes = Buffer.from(JSON.stringify(source)), memory = memoryAuth();
  const hash = inspectSource(bytes).sourceHash;
  const preview = await migrateUsers({ bytes, repository: memory.repo });
  assert.equal(preview.users, 1); assert.equal(preview.inserts, 1); assert.equal(memory.users.length, 0);
  assert.ok(!JSON.stringify(preview).includes(source.users[0].passwordHash));
  await assert.rejects(migrateUsers({ bytes, repository: memory.repo, apply: true, confirmedHash: 'wrong' }), /source_hash/);
  assert.equal((await migrateUsers({ bytes, repository: memory.repo, apply: true, confirmedHash: hash })).applied, 1);
  const again = await migrateUsers({ bytes, repository: memory.repo, apply: true, confirmedHash: hash });
  assert.equal(again.applied, 0); assert.equal(again.skippedRecords, 1); assert.equal(again.existingDestinationUsers, 1);
  assert.equal(memory.users[0].id, source.users[0].id);
  assert.equal(memory.users[0].passwordHash, source.users[0].passwordHash);
  assert.deepEqual(Object.keys(memory.states[source.users[0].id]), ['settings']);
  assert.ok(!JSON.stringify(memory).includes('never-import'));
  const service = createAuthService({ repository: memory.repo, config: { secret: 'migration-tests', mode: 'postgres' }, defaultSettings: settings });
  const login = await service.login({ email: 'migrated@example.test', password: 'unchanged-legacy-password' });
  assert.equal(login.user.id, 'legacy-user-42');
  assert.ok(await service.authenticate(login.token));
});
test('duplicate normalized emails, invalid records and destination conflicts stop all apply', async () => {
  const source = fixture(); source.users.push({ ...source.users[0], id: 'second-id', email: 'migrated@EXAMPLE.test' });
  source.userStates['second-id'] = { settings };
  const bytes = Buffer.from(JSON.stringify(source)), memory = memoryAuth(), inspected = inspectSource(bytes);
  assert.equal(inspected.duplicateNormalizedEmails, 1);
  await assert.rejects(migrateUsers({ bytes, repository: memory.repo, apply: true, confirmedHash: inspected.sourceHash }), /conflicts/);
  assert.equal(memory.users.length, 0);
  const valid = fixture(), validBytes = Buffer.from(JSON.stringify(valid));
  await memory.repo.createUser({ ...valid.users[0], email: 'migrated@example.test', id: 'conflicting-id' }, settings);
  assert.equal((await migrateUsers({ bytes: validBytes, repository: memory.repo })).conflicts, 1);
  await assert.rejects(migrateUsers({ bytes: validBytes, repository: memory.repo, apply: true, confirmedHash: inspectSource(validBytes).sourceHash }), /conflicts/);
});

test('unsafe legacy object keys and malformed hashes are invalid import records', () => {
  for (const id of ['__proto__', 'constructor', 'prototype']) {
    const source = fixture(); source.users[0].id = id;
    assert.equal(inspectSource(Buffer.from(JSON.stringify(source))).invalidRecords, 1);
  }
  const source = fixture(); source.users[0].passwordHash = 'not-a-valid-hash';
  assert.equal(inspectSource(Buffer.from(JSON.stringify(source))).invalidRecords, 1);
});
