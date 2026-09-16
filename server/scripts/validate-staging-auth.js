// Synthetic PostgreSQL integration checks. All auth writes roll back together.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { getPrismaClient, disconnectPrisma } = require('../db/prisma-client');
const { createPostgresAuthRepository } = require('../repositories/postgresAuthRepository');
const { createAuthService } = require('../services/auth-service');
const { passwordFields, tokenHash, signToken } = require('../services/auth-crypto');
const { migrateUsers } = require('../services/user-migration');
const { settings, memoryAuth } = require('../test-support/auth-memory');
const { createDualAuthRepository } = require('../repositories/dualAuthRepository');

async function validate(client) {
  const migration = '20260916080000_init_backend_foundation';
  const sql = fs.readFileSync(path.join(__dirname, '../prisma/migrations', migration, 'migration.sql'), 'utf8').replace(/\r\n/g, '\n');
  const checksum = crypto.createHash('sha256').update(sql).digest('hex');
  const migrations = await client.$queryRaw`SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations"`;
  assert.equal(migrations.length, 1, 'Unexpected migration history; stop');
  assert.equal(migrations[0].migration_name, migration);
  assert.equal(migrations[0].checksum, checksum, 'Migration checksum differs; stop');
  assert.ok(migrations[0].finished_at);
  assert.equal(migrations[0].rolled_back_at, null);
  console.log('PASS staging migration history and canonical checksum');
  const marker = crypto.randomUUID();
  const email = `phase2-${marker}@example.test`;
  const rollback = new Error('intentional_validation_rollback');
  let completed = false;
  try {
    await client.$transaction(async tx => {
      const repo = createPostgresAuthRepository(tx, true);
      const config = { mode: 'postgres', secret: crypto.randomBytes(48).toString('hex'), exposeResetCode: true };
      const service = createAuthService({ repository: repo, config, defaultSettings: settings });
      const registration = await service.register({ name: 'Phase Two Synthetic', email, password: 'synthetic-validation-password' });
      assert.ok(await service.authenticate(registration.token));
      assert.equal((await repo.findByEmail(email)).id, registration.user.id);
      assert.deepEqual(await service.getSettings(registration.user.id), settings);
      await service.setSettings(registration.user.id, { ...settings, riskMode: 'conservative' });
      assert.equal((await service.getSettings(registration.user.id)).riskMode, 'conservative');
      const session = await tx.session.findUnique({ where: { tokenHash: tokenHash(registration.token) } });
      assert.ok(session); assert.notEqual(session.tokenHash, registration.token);
      await assert.rejects(service.register({ name: 'Duplicate', email, password: 'synthetic-validation-password' }), /email_in_use/);
      await assert.rejects(service.login({ email, password: 'incorrect' }), /invalid_credentials/);
      const login = await service.login({ email: email.toUpperCase(), password: 'synthetic-validation-password' });
      await service.revoke(login.token);
      assert.equal(await service.authenticate(login.token), null);
      const expired = await service.login({ email, password: 'synthetic-validation-password' });
      await tx.session.update({ where: { tokenHash: tokenHash(expired.token) }, data: { expiresAt: new Date(0) } });
      assert.equal(await service.authenticate(expired.token), null);
      const old = signToken({ sub: registration.user.id, exp: Date.now() + 10000 }, config.secret);
      assert.equal(await service.authenticate(old), null);
      assert.equal(await service.authenticate(registration.token + '.extra'), null);
      const reset = await service.requestReset({ email });
      await service.confirmReset({ email, code: reset.demoCode, password: 'replacement-validation-password' });
      await assert.rejects(service.confirmReset({ email, code: reset.demoCode, password: 'another-password' }), /invalid_reset_code/);
      assert.equal(await service.authenticate(registration.token), null);
      assert.ok((await service.login({ email, password: 'replacement-validation-password' })).token);
      const expiring = await service.requestReset({ email });
      await tx.passwordResetToken.updateMany({ where: { userId: registration.user.id, usedAt: null }, data: { expiresAt: new Date(0) } });
      await assert.rejects(service.confirmReset({ email, code: expiring.demoCode, password: 'another-password' }), /reset_code_expired/);
      const imported = { id: `legacy-${marker}`, name: 'Synthetic Import', email: `import-${email}`, role: 'partner', ...passwordFields('legacy-compatible-password'), createdAt: new Date().toISOString(), lastLoginAt: null };
      const bytes = Buffer.from(JSON.stringify({ users: [imported], userStates: { [imported.id]: { settings, trades: [{ forbidden: true }] } } }));
      const preview = await migrateUsers({ bytes, repository: repo });
      assert.equal(preview.inserts, 1);
      assert.equal((await migrateUsers({ bytes, repository: repo, apply: true, confirmedHash: preview.sourceHash })).applied, 1);
      assert.equal((await migrateUsers({ bytes, repository: repo, apply: true, confirmedHash: preview.sourceHash })).applied, 0);
      const migrated = await service.login({ email: imported.email, password: 'legacy-compatible-password' });
      assert.equal(migrated.user.id, imported.id);
      assert.ok(await service.authenticate(migrated.token));
      assert.notEqual((await repo.findById(imported.id)).databaseId, imported.id);
      const other = await service.register({ name: 'Isolated User', email: `other-${email}`, password: 'isolated-user-password' });
      assert.notEqual((await service.authenticate(other.token)).id, migrated.user.id);
      assert.deepEqual(await service.getSettings(other.user.id), settings);
      const audit = await tx.auditEvent.findMany({ where: { userId: registration.user.id } });
      for (const event of ['registration', 'login_success', 'login_failure', 'password_reset_request', 'password_reset_completion', 'session_revocation']) assert.ok(audit.some(e => e.action === `auth.${event}`));
      assert.ok(audit.every(e => e.metadata === null));
      // Exercise dual reads/writes against real PostgreSQL, with synthetic legacy mirrors.
      const mirror = memoryAuth();
      for (const id of [registration.user.id, imported.id, other.user.id]) {
        const user = await repo.findById(id);
        await mirror.repo.createUser(user, await repo.getSettings(user.id));
      }
      const dual = createAuthService({ repository: createDualAuthRepository(mirror.repo, repo), config: { ...config, mode: 'dual' }, defaultSettings: settings });
      const dualLogin = await dual.login({ email: imported.email, password: 'legacy-compatible-password' });
      assert.ok(await dual.authenticate(dualLogin.token));
      await dual.revoke(dualLogin.token);
      assert.equal(await dual.authenticate(dualLogin.token), null);
      completed = true;
      throw rollback;
    }, { isolationLevel: 'Serializable', timeout: 120000 });
  } catch (error) { if (error !== rollback) throw error; }
  assert.ok(completed);
  assert.equal(await client.user.count({ where: { email: { contains: marker } } }), 0);
  console.log('PASS PostgreSQL auth, sessions, revocation, reset expiry/reuse, settings, isolation, audits, synthetic import/idempotency, and dual mode');
  console.log('PASS synthetic transaction rolled back; no test users retained');
}
async function main() {
  try {
    if (process.env.RAILWAY_ENVIRONMENT_ID !== '145568f8-f723-427c-ab72-2839cd0ba9d4' || process.env.RAILWAY_SERVICE_ID !== '763f488b-f1d6-4304-b62d-1c3185dff88b') throw new Error('staging_context_required');
    await validate(getPrismaClient());
  } catch (error) {
    // Never print driver errors, connection strings, query parameters, or assertions with actual records.
    console.error('FAIL staging auth validation (' + (error.code && /^[A-Z0-9_]+$/.test(error.code) ? error.code : error.name || 'Error') + ')');
    const diagnostic = JSON.stringify(error);
    for (const [label, pattern] of [
      ['TLS certificate validation', /self.signed|certificate|CERT_/i],
      ['database authentication', /password authentication|28P01/i],
      ['network timeout', /ETIMEDOUT|ECONNREFUSED|ENOTFOUND|timeout/i],
      ['missing database relation', /42P01|does not exist/i],
    ]) if (pattern.test(diagnostic)) console.error('FAIL category: ' + label);
    if (/^[A-Z0-9]{5}$/.test(error.meta?.code || '')) console.error('FAIL database code: ' + error.meta.code);
    process.exitCode = 1;
  } finally { await disconnectPrisma(); }
}
if (require.main === module) main();
module.exports = { validate };
