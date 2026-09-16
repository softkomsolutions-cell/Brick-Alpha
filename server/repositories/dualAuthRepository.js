const { isDeepStrictEqual } = require('node:util');
const { safeEqual } = require('../services/auth-crypto');
function compareUser(a, b) {
  if (!a || !b) return a === b;
  return ['id', 'email', 'name', 'role'].every(key => a[key] === b[key]) &&
    safeEqual(a.passwordHash || 'empty', b.passwordHash || 'empty') && safeEqual(a.passwordSalt || 'empty', b.passwordSalt || 'empty');
}
function createDualAuthRepository(legacy, postgres, nested = false) {
  const repo = {};
  repo.transaction = work => nested ? work(repo) : legacy.transaction(l => postgres.transaction(p => work(createDualAuthRepository(l, p, true))));
  for (const method of ['findById', 'findByEmail']) repo[method] = async (...args) => {
    const a = await legacy[method](...args), b = await postgres[method](...args);
    if (!compareUser(a, b)) throw new Error('auth_dual_mismatch');
    return a;
  };
  repo.listUsers = async () => {
    const a = await legacy.listUsers(), b = await postgres.listUsers();
    if (a.length !== b.length || a.some(user => !compareUser(user, b.find(other => user.id === other.id)))) throw new Error('auth_dual_mismatch');
    return a;
  };
  repo.getSettings = async id => {
    const a = await legacy.getSettings(id), b = await postgres.getSettings(id);
    if (!isDeepStrictEqual(a, b)) throw new Error('auth_dual_mismatch');
    return a;
  };
  for (const method of ['createUser', 'updateUser', 'setSettings', 'createSession', 'revokeSession', 'revokeUserSessions', 'replaceReset', 'consumeReset', 'audit']) repo[method] = async (...args) => {
    const result = await postgres[method](...args);
    const mirror = await legacy[method](...args);
    if (method === 'consumeReset' && result !== mirror) throw new Error('auth_dual_mismatch');
    return mirror;
  };
  // Both copies must permit a session/reset; never silently fall back on DB failure.
  repo.findSession = async hash => {
    const a = await legacy.findSession(hash), b = await postgres.findSession(hash);
    if (!a || !b) return null;
    if (a.userId !== b.userId || a.revokedAt || b.revokedAt) return null;
    return { ...b, expiresAt: new Date(Math.min(new Date(a.expiresAt), new Date(b.expiresAt))) };
  };
  repo.getReset = async (id, hash) => {
    const a = await legacy.getReset(id, hash), b = await postgres.getReset(id, hash);
    return a && b ? { ...b, expiresAt: new Date(Math.min(new Date(a.expiresAt), new Date(b.expiresAt))) } : null;
  };
  repo.legacyTokensAllowed = async () => false;
  return repo;
}
module.exports = { createDualAuthRepository };
