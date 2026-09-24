const { createHash } = require('node:crypto');
const LIMITS = { login: 20, register: 10, 'forgot-password/request': 5, 'forgot-password/confirm': 10, demo: 10 };
function createAuthRateLimiter({ now = Date.now, windowMs = 15 * 60 * 1000, maxKeys = 10000 } = {}) {
  const buckets = new Map();
  function middleware(action) {
    return (req, res, next) => {
      const time = now();
      for (const [key, value] of buckets) if (value.until <= time) buckets.delete(key);
      // Ignore untrusted forwarding headers. Proxy trust must be configured explicitly by the app.
      const identity = createHash('sha256').update(String(req.body?.email || '').trim().toLowerCase()).digest('hex');
      const keys = [`${action}:ip:${req.ip}`, ...(req.body?.email ? [`${action}:account:${identity}`] : [])];
      if (keys.some(key => !buckets.has(key)) && buckets.size + keys.length > maxKeys) return res.status(429).json({ ok: false, error: 'rate_limited' });
      let limited = false;
      for (const key of keys) {
        const bucket = buckets.get(key) || { count: 0, until: time + windowMs };
        bucket.count += 1;
        buckets.set(key, bucket);
        limited ||= bucket.count > LIMITS[action];
      }
      if (limited) {
        res.set('Retry-After', String(Math.ceil(windowMs / 1000)));
        return res.status(429).json({ ok: false, error: 'rate_limited' });
      }
      next();
    };
  }
  return { middleware, clear: () => buckets.clear() };
}
module.exports = { createAuthRateLimiter, LIMITS };
