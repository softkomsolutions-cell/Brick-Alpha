const { normalizeEmail, safeEqual } = require('../services/auth-crypto');
function createLegacyAuthRepository({ getUsers, getUserState, getAuthState, persist, removeUserState = () => {} }) {
  let tail = Promise.resolve();
  let inTransaction = false;
  const save = () => { if (!inTransaction) persist(); };
  const find = id => getUsers().find(user => user.id === id) || null;
  const repo = {
    async transaction(work) {
      const previous = tail;
      let release;
      tail = new Promise(resolve => { release = resolve; });
      await previous;
      const users = structuredClone(getUsers());
      const auth = structuredClone(getAuthState());
      const settings = new Map(users.map(user => [user.id, structuredClone(getUserState(user.id).settings)]));
      inTransaction = true;
      try { const value = await work(repo); persist(); return value; }
      catch (error) {
        for (const user of getUsers()) if (!users.some(old => old.id === user.id)) removeUserState(user.id);
        getUsers().splice(0, getUsers().length, ...users);
        Object.assign(getAuthState(), auth);
        for (const [id, value] of settings) getUserState(id).settings = value;
        persist();
        throw error;
      } finally { inTransaction = false; release(); }
    },
    async listUsers() { return getUsers(); },
    async findById(id) { return find(id); },
    async findByEmail(email) { return getUsers().find(user => normalizeEmail(user.email) === email) || null; },
    async createUser(user, settings) {
      if (await repo.findByEmail(user.email)) throw Object.assign(new Error('email_in_use'), { code: 'P2002' });
      getUsers().push(structuredClone(user));
      getUserState(user.id).settings = structuredClone(settings);
      save(); return find(user.id);
    },
    async updateUser(id, patch) { Object.assign(find(id), patch); save(); return find(id); },
    async getSettings(id) { return getUserState(id).settings; },
    async setSettings(id, settings) { getUserState(id).settings = structuredClone(settings); save(); return settings; },
    async createSession(session) { getAuthState().sessions.push(structuredClone(session)); save(); },
    async findSession(hash) { return getAuthState().sessions.find(session => safeEqual(session.tokenHash, hash)) || null; },
    async revokeSession(hash, at) { const session = await repo.findSession(hash); if (session) session.revokedAt = at; save(); },
    async revokeUserSessions(id, at) {
      for (const session of getAuthState().sessions) if (session.userId === id) session.revokedAt = at;
      getAuthState().legacyTokenCutoffs[id] = at;
      save();
    },
    async legacyTokensAllowed(id) { return !getAuthState().legacyTokenCutoffs[id]; },
    async replaceReset(id, record) {
      Object.assign(find(id), { passwordResetHash: record.tokenHash, passwordResetSalt: 'hmac-sha256', passwordResetRequestedAt: record.createdAt, passwordResetExpiresAt: record.expiresAt });
      save();
    },
    async getReset(id, hash) {
      const user = find(id);
      return user?.passwordResetHash && safeEqual(user.passwordResetHash, hash)
        ? { tokenHash: hash, expiresAt: user.passwordResetExpiresAt, usedAt: null } : null;
    },
    async consumeReset(id, hash, now) {
      const reset = await repo.getReset(id, hash);
      if (!reset || !Number.isFinite(Date.parse(reset.expiresAt)) || Date.parse(reset.expiresAt) <= Date.parse(now)) return false;
      Object.assign(find(id), { passwordResetHash: '', passwordResetSalt: '', passwordResetRequestedAt: null, passwordResetExpiresAt: null });
      save(); return true;
    },
    async audit(action, userId, at) {
      getAuthState().events.push({ action, userId: userId || null, occurredAt: at });
      getAuthState().events = getAuthState().events.slice(-1000);
      save();
    },
  };
  return repo;
}
module.exports = { createLegacyAuthRepository };
