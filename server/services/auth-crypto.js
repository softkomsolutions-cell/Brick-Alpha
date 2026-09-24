const crypto = require('node:crypto');
const normalizeEmail = email => String(email || '').trim().toLowerCase();
const hashPassword = (password, salt) => crypto.pbkdf2Sync(password, salt, 120000, 64, 'sha512').toString('hex');
function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
}
function verifyPassword(password, user) {
  return Boolean(user?.passwordSalt && /^[a-f0-9]{128}$/i.test(user.passwordHash || '') && safeEqual(hashPassword(password, user.passwordSalt), user.passwordHash.toLowerCase()));
}
function passwordFields(password) {
  const passwordSalt = crypto.randomBytes(16).toString('hex');
  return { passwordSalt, passwordHash: hashPassword(password, passwordSalt) };
}
const tokenHash = token => crypto.createHash('sha256').update(token).digest('hex');
function signToken(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${crypto.createHmac('sha256', secret).update(body).digest('base64url')}`;
}
function decodeToken(token, secret, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 4096) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  if (!safeEqual(signature, crypto.createHmac('sha256', secret).update(body).digest('base64url'))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return typeof payload.sub === 'string' && Number.isFinite(payload.exp) && payload.exp > now ? payload : null;
  } catch { return null; }
}
const resetHash = (userId, code, secret) => crypto.createHmac('sha256', secret).update(`reset:${userId}:${code}`).digest('hex');
module.exports = { normalizeEmail, hashPassword, safeEqual, verifyPassword, passwordFields, tokenHash, signToken, decodeToken, resetHash };
