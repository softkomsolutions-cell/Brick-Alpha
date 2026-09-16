const crypto = require('node:crypto');
const { normalizeEmail, safeEqual } = require('./auth-crypto');
const { selectSettings } = require('../repositories/postgresAuthRepository');
const { isDeepStrictEqual } = require('node:util');

function inspectSource(bytes) {
  const sourceHash = crypto.createHash('sha256').update(bytes).digest('hex');
  let source;
  try { source = JSON.parse(bytes.toString('utf8')); } catch { throw new Error('invalid_source_json'); }
  if (!Array.isArray(source.users)) throw new Error('source_users_array_required');
  const emails = new Set(), ids = new Set(), records = [];
  let duplicates = 0, invalid = 0;
  for (const user of source.users) {
    const email = normalizeEmail(user?.email);
    const duplicate = emails.has(email) || ids.has(user?.id);
    if (emails.has(email)) duplicates += 1;
    emails.add(email); ids.add(user?.id);
    const hasPassword = Boolean(user?.passwordHash || user?.passwordSalt);
    const valid = user && typeof user.id === 'string' && user.id.length > 0 && user.id.length <= 80 && !['__proto__', 'constructor', 'prototype'].includes(user.id) &&
      typeof user.name === 'string' && user.name.trim().length >= 2 && email.includes('@') &&
      ['owner', 'partner'].includes(user.role) && Number.isFinite(Date.parse(user.createdAt)) &&
      (!user.lastLoginAt || Number.isFinite(Date.parse(user.lastLoginAt))) &&
      (!hasPassword || (/^[a-f0-9]{128}$/i.test(user.passwordHash || '') && /^[a-f0-9]{32}$/i.test(user.passwordSalt || '')));
    const settings = source.userStates?.[user?.id]?.settings;
    // Require the exact effective settings snapshot; never invent user preferences.
    const completeSettings = settings && ['preferredRegion', 'timezone', 'riskMode', 'subscriptionTier'].every(key => typeof settings[key] === 'string') &&
      ['alertPreferences', 'routinePreferences', 'executionProfiles'].every(key => settings[key] && typeof settings[key] === 'object' && !Array.isArray(settings[key]));
    if (!valid || !completeSettings || duplicate) { invalid += 1; continue; }
    records.push({ user: { id: user.id, name: user.name, email, role: user.role, passwordHash: user.passwordHash || '', passwordSalt: user.passwordSalt || '', createdAt: user.createdAt, lastLoginAt: user.lastLoginAt || null }, settings: selectSettings(settings) });
  }
  return { sourceHash, users: source.users.length, duplicateNormalizedEmails: duplicates, invalidRecords: invalid, records };
}

async function planMigration(source, repository) {
  const report = { sourceHash: source.sourceHash, users: source.users, duplicateNormalizedEmails: source.duplicateNormalizedEmails, invalidRecords: source.invalidRecords, existingDestinationUsers: 0, inserts: 0, conflicts: 0, skippedRecords: 0 };
  const inserts = [];
  for (const record of source.records) {
    const byId = await repository.findById(record.user.id), byEmail = await repository.findByEmail(record.user.email);
    if (!byId && !byEmail) { report.inserts += 1; inserts.push(record); continue; }
    report.existingDestinationUsers += 1;
    const matching = byId && byEmail && byId.id === byEmail.id && ['id', 'name', 'email', 'role'].every(key => byId[key] === record.user[key]) &&
      safeEqual(byId.passwordHash || 'empty', record.user.passwordHash || 'empty') && safeEqual(byId.passwordSalt || 'empty', record.user.passwordSalt || 'empty') &&
      isDeepStrictEqual(await repository.getSettings(byId.id), record.settings);
    if (matching) report.skippedRecords += 1;
    else report.conflicts += 1;
  }
  report.skippedRecords += source.invalidRecords;
  return { report, inserts };
}

async function migrateUsers({ bytes, repository, apply = false, confirmedHash }) {
  const source = inspectSource(bytes);
  if (apply && confirmedHash !== source.sourceHash) throw new Error('source_hash_confirmation_required');
  const work = async repo => {
    const { report, inserts } = await planMigration(source, repo);
    if (apply) {
      if (report.invalidRecords || report.duplicateNormalizedEmails || report.conflicts) throw new Error('migration_conflicts_apply_blocked');
      for (const record of inserts) {
        await repo.createUser(record.user, record.settings);
        await repo.audit('auth.user_import', record.user.id, new Date().toISOString());
      }
    }
    return { ...report, applied: apply ? inserts.length : 0 };
  };
  return apply ? repository.transaction(work) : work(repository);
}
module.exports = { inspectSource, planMigration, migrateUsers };
