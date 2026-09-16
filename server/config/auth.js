function readAuthConfig(env = process.env) {
  const mode = env.AUTH_PERSISTENCE_MODE || 'legacy';
  if (!['legacy', 'dual', 'postgres'].includes(mode)) throw new Error('invalid_auth_persistence_mode');
  const deployed = ['production', 'staging'].includes(env.NODE_ENV) || Boolean(env.RAILWAY_ENVIRONMENT_NAME);
  const secret = env.AUTH_SECRET || (deployed ? '' : 'collecttrade-local-development-secret');
  if (!secret || (deployed && (secret.length < 32 || /replace-with|local-development-secret/.test(secret)))) {
    throw new Error('AUTH_SECRET must be configured with at least 32 random characters');
  }
  if (mode !== 'legacy' && !/^postgres(?:ql)?:\/\//.test(env.DATABASE_URL || '')) throw new Error('database_auth_requires_DATABASE_URL');
  const origins = (env.CORS_ALLOWED_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean);
  for (const origin of origins) {
    let url;
    try { url = new URL(origin); } catch { throw new Error('invalid_CORS_ALLOWED_ORIGINS'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin || (deployed && url.protocol !== 'https:')) throw new Error('invalid_CORS_ALLOWED_ORIGINS');
  }
  return { mode, secret, deployed, origins, exposeResetCode: !deployed && (env.NODE_ENV === 'test' || env.AUTH_RESET_DEMO_CODES === 'true' || env.COLLECTTRADE_TEST === '1') };
}

function corsOptions(config) {
  return { origin(origin, callback) {
    if (!origin) return callback(null, true);
    const local = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(origin);
    callback(null, config.origins.includes(origin) || (!config.deployed && local));
  } };
}

module.exports = { readAuthConfig, corsOptions };
