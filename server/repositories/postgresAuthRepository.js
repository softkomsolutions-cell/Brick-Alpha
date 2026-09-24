const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SETTINGS = ['preferredRegion', 'timezone', 'riskMode', 'subscriptionTier', 'alertPreferences', 'routinePreferences', 'executionProfiles', 'usdZarRate'];
const selectSettings = settings => Object.fromEntries(SETTINGS.filter(key => settings[key] !== undefined).map(key => [key, settings[key]]));
function view(user) {
  if (!user) return null;
  return { ...user, id: user.legacyId || user.id, databaseId: user.id, role: user.role.toLowerCase(), createdAt: user.createdAt.toISOString(), lastLoginAt: user.lastLoginAt?.toISOString() || null };
}
function createPostgresAuthRepository(client, insideTransaction = false) {
  const db = () => typeof client === 'function' ? client() : client;
  const lookup = id => db().user.findFirst({ where: { OR: [{ legacyId: id }, ...(UUID.test(id) ? [{ id }] : [])] } });
  async function databaseId(id) {
    const user = await lookup(id);
    if (!user) throw new Error('auth_user_not_found');
    return user.id;
  }
  const repo = {
    async transaction(work) {
      if (insideTransaction) return work(repo);
      // Do not replay callbacks: dual mode can also write to the legacy store.
      return db().$transaction(tx => work(createPostgresAuthRepository(tx, true)), { isolationLevel: 'Serializable', timeout: 15000 });
    },
    async listUsers() { return (await db().user.findMany()).map(view); },
    async findById(id) { return view(await lookup(id)); },
    async findByEmail(email) { return view(await db().user.findUnique({ where: { email } })); },
    async createUser(user, settings) {
      return view(await db().user.create({ data: {
        ...(UUID.test(user.id) ? { id: user.id } : {}), legacyId: user.legacyId || user.id,
        name: user.name, email: user.email, role: user.role.toUpperCase(),
        passwordHash: user.passwordHash || null, passwordSalt: user.passwordSalt || null,
        createdAt: new Date(user.createdAt), lastLoginAt: user.lastLoginAt ? new Date(user.lastLoginAt) : null,
        settings: { create: selectSettings(settings) },
      } }));
    },
    async updateUser(id, patch) {
      const data = Object.fromEntries(['name', 'passwordHash', 'passwordSalt', 'lastLoginAt'].filter(key => key in patch).map(key => [key, key === 'lastLoginAt' ? new Date(patch[key]) : patch[key]]));
      return view(await db().user.update({ where: { id: await databaseId(id) }, data }));
    },
    async getSettings(id) {
      const settings = await db().userSettings.findUnique({ where: { userId: await databaseId(id) } });
      if (!settings) throw new Error('auth_settings_missing');
      return selectSettings(settings);
    },
    async setSettings(id, settings) {
      await db().userSettings.update({ where: { userId: await databaseId(id) }, data: selectSettings(settings) });
      return settings;
    },
    async createSession(session) {
      await db().session.create({ data: { tokenHash: session.tokenHash, userId: await databaseId(session.userId), expiresAt: new Date(session.expiresAt) } });
    },
    async findSession(tokenHash) {
      const session = await db().session.findUnique({ where: { tokenHash }, include: { user: { select: { id: true, legacyId: true } } } });
      return session ? { ...session, userId: session.user.legacyId || session.user.id } : null;
    },
    async revokeSession(tokenHash, at) { await db().session.updateMany({ where: { tokenHash, revokedAt: null }, data: { revokedAt: new Date(at) } }); },
    async revokeUserSessions(id, at) { await db().session.updateMany({ where: { userId: await databaseId(id), revokedAt: null }, data: { revokedAt: new Date(at) } }); },
    async legacyTokensAllowed() { return false; },
    async replaceReset(id, record) {
      const userId = await databaseId(id);
      await db().user.update({ where: { id: userId }, data: { passwordResetRequestedAt: new Date(record.createdAt) } });
      await db().passwordResetToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date(record.createdAt) } });
      await db().passwordResetToken.create({ data: { userId, tokenHash: record.tokenHash, expiresAt: new Date(record.expiresAt) } });
    },
    async getReset(id, tokenHash) { return db().passwordResetToken.findFirst({ where: { userId: await databaseId(id), tokenHash, usedAt: null } }); },
    async consumeReset(id, tokenHash, now) {
      const result = await db().passwordResetToken.updateMany({ where: { userId: await databaseId(id), tokenHash, usedAt: null, expiresAt: { gt: new Date(now) } }, data: { usedAt: new Date(now) } });
      return result.count === 1;
    },
    async audit(action, id, at) { await db().auditEvent.create({ data: { action, userId: id ? await databaseId(id) : null, entityType: 'auth', occurredAt: new Date(at) } }); },
  };
  return repo;
}
module.exports = { createPostgresAuthRepository, selectSettings, UUID };
