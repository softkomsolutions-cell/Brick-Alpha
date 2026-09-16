const crypto = require('node:crypto');
const { normalizeEmail, passwordFields, verifyPassword, tokenHash, signToken, decodeToken, resetHash } = require('./auth-crypto');
class AuthError extends Error { constructor(status, code) { super(code); this.status = status; } }
const fail = (status, code) => { throw new AuthError(status, code); };
const publicUser = user => Object.fromEntries(['id', 'name', 'email', 'role', 'createdAt', 'lastLoginAt'].map(key => [key, user[key]]));
function createAuthService({ repository, config, defaultSettings, now = Date.now }) {
  const iso = () => new Date(now()).toISOString();
  const audit = (repo, action, user) => repo.audit(`auth.${action}`, user?.id || null, iso());
  async function issue(repo, user) {
    const expires = now() + 7 * 24 * 60 * 60 * 1000;
    const token = signToken({ sub: user.id, email: user.email, exp: expires, sid: crypto.randomUUID() }, config.secret);
    await repo.createSession({ userId: user.id, tokenHash: tokenHash(token), expiresAt: new Date(expires).toISOString(), revokedAt: null });
    return { ok: true, token, user: publicUser(user), settings: await repo.getSettings(user.id) };
  }
  return {
    async register(input, demo = false) {
      const name = demo ? String(input?.name || 'Partner Demo').trim().slice(0, 120) || 'Partner Demo' : String(input?.name || '').trim();
      const email = demo ? `demo-${crypto.randomUUID()}@collecttrade.local` : normalizeEmail(input?.email);
      const password = String(input?.password || '');
      if (!demo && name.length < 2) fail(400, 'name_too_short');
      if (!email.includes('@')) fail(400, 'invalid_email');
      if (!demo && password.length < 8) fail(400, 'password_too_short');
      try { return await repository.transaction(async repo => {
        if (await repo.findByEmail(email)) fail(409, 'email_in_use');
        const users = await repo.listUsers();
        const owner = !demo && users.every(user => /@(collecttrade\.local|example\.com)$/.test(user.email));
        const user = await repo.createUser({ id: crypto.randomUUID(), name, email, ...(demo ? { passwordSalt: '', passwordHash: '' } : passwordFields(password)), role: owner ? 'owner' : 'partner', createdAt: iso(), lastLoginAt: iso() }, structuredClone(defaultSettings));
        await audit(repo, 'registration', user);
        return issue(repo, user);
      }); } catch (error) { if (error.code === 'P2002') fail(409, 'email_in_use'); throw error; }
    },
    async login(input) {
      const result = await repository.transaction(async repo => {
        const user = await repo.findByEmail(normalizeEmail(input?.email));
        if (!verifyPassword(String(input?.password || ''), user)) {
          await audit(repo, 'login_failure', user);
          return null;
        }
        const updated = await repo.updateUser(user.id, { lastLoginAt: iso() });
        await audit(repo, 'login_success', updated);
        return issue(repo, updated);
      });
      if (!result) fail(401, 'invalid_credentials');
      return result;
    },
    async authenticate(token) {
      const payload = decodeToken(token, config.secret, now());
      if (!payload) return null;
      const user = await repository.findById(payload.sub);
      if (!user) return null;
      const session = await repository.findSession(tokenHash(token));
      if (!session) return !payload.sid && config.mode === 'legacy' && await repository.legacyTokensAllowed(user.id) ? user : null;
      return session.userId === user.id && !session.revokedAt && new Date(session.expiresAt).getTime() > now() ? user : null;
    },
    async requestReset(input) {
      const email = normalizeEmail(input?.email);
      if (!email.includes('@')) fail(400, 'invalid_email');
      return repository.transaction(async repo => {
        const user = await repo.findByEmail(email);
        let demoCode = null, expiresAt = null;
        if (user?.passwordHash) {
          const code = String(crypto.randomInt(100000, 1000000));
          const expires = new Date(now() + 15 * 60 * 1000).toISOString();
          await repo.replaceReset(user.id, { tokenHash: resetHash(user.id, code, config.secret), createdAt: iso(), expiresAt: expires });
          if (config.exposeResetCode) { demoCode = code; expiresAt = expires; }
        }
        await audit(repo, 'password_reset_request', user);
        return { ok: true, message: 'If that account exists, a reset code has been prepared for this build.', demoCode, expiresAt };
      });
    },
    async confirmReset(input) {
      const email = normalizeEmail(input?.email), code = String(input?.code || '').trim(), password = String(input?.password || '');
      if (!email.includes('@')) fail(400, 'invalid_email');
      if (!code) fail(400, 'reset_code_required');
      if (password.length < 8) fail(400, 'password_too_short');
      return repository.transaction(async repo => {
        const user = await repo.findByEmail(email);
        if (!user) fail(400, 'invalid_reset_code');
        const hash = resetHash(user.id, code, config.secret);
        const reset = await repo.getReset(user.id, hash);
        if (!reset || reset.usedAt) fail(400, 'invalid_reset_code');
        if (!Number.isFinite(new Date(reset.expiresAt).getTime()) || new Date(reset.expiresAt).getTime() <= now()) fail(400, 'reset_code_expired');
        if (!await repo.consumeReset(user.id, hash, iso())) fail(400, 'invalid_reset_code');
        await repo.updateUser(user.id, passwordFields(password));
        await repo.revokeUserSessions(user.id, iso());
        await audit(repo, 'password_reset_completion', user);
        await audit(repo, 'session_revocation', user);
        return { ok: true, message: 'Password updated. Sign in with your new password.' };
      });
    },
    async revoke(token) {
      const user = await this.authenticate(token);
      if (!user) fail(401, 'unauthorized');
      await repository.transaction(async repo => {
        await repo.revokeSession(tokenHash(token), iso());
        // Pre-session tokens cannot be individually revoked; invalidate their legacy cohort.
        if (!decodeToken(token, config.secret, now()).sid) await repo.revokeUserSessions(user.id, iso());
        await audit(repo, 'session_revocation', user);
      });
      return { ok: true };
    },
    getSettings: id => repository.getSettings(id),
    setSettings: (id, settings) => repository.transaction(repo => repo.setSettings(id, settings)),
  };
}
module.exports = { createAuthService, AuthError, publicUser };
