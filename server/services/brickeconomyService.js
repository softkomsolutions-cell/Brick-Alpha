const rateLimits = require("./rateLimitManager");

const BRICKECONOMY_BASE_URL =
  process.env.BRICKECONOMY_BASE_URL || "https://www.brickeconomy.com/api/v1";
const CACHE_TTL_MS = Number(process.env.BRICKECONOMY_CACHE_TTL_MS || 12 * 60 * 60 * 1000);
const cache = new Map();

function resolveApiKey(apiKey) {
  return String(apiKey || process.env.BRICKECONOMY_API_KEY || "").trim();
}

function configured(apiKey) {
  return Boolean(resolveApiKey(apiKey));
}

async function requestJson(pathname, apiKey, cacheKey = null) {
  const resolvedApiKey = resolveApiKey(apiKey);
  const quota = rateLimits.canRequest("brickeconomy");
  if (!configured(resolvedApiKey)) return { ok: false, reason: "credentials_not_configured", quota };
  if (!quota.allowed) return { ok: false, reason: "quota_reserve_active", quota };
  const cached = cacheKey ? cache.get(cacheKey) : null;
  if (cached && cached.expiresAt > Date.now()) return { ...cached.value, cache: "fresh" };
  rateLimits.recordRequest("brickeconomy");
  try {
    const response = await fetch(`${BRICKECONOMY_BASE_URL}${pathname}`, {
      headers: { Accept: "application/json", "User-Agent": "BrickAlpha-Beta/1.0", "x-apikey": resolvedApiKey },
      signal: AbortSignal.timeout(8000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const retryAfter = response.headers.get("retry-after");
      rateLimits.recordError("brickeconomy", new Error(`brickeconomy_http_${response.status}`), retryAfter);
      return cached ? { ...cached.value, cache: "stale" } : { ok: false, reason: `http_${response.status}`, quota: rateLimits.canRequest("brickeconomy") };
    }
    const value = { ok: true, data: payload?.data || payload, quota: rateLimits.canRequest("brickeconomy") };
    if (cacheKey) cache.set(cacheKey, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  } catch (error) {
    rateLimits.recordError("brickeconomy", error);
    return cached ? { ...cached.value, cache: "stale" } : { ok: false, reason: error.name === "TimeoutError" ? "timeout" : "request_failed", quota: rateLimits.canRequest("brickeconomy") };
  }
}

async function getSet(setNum, apiKey = null, currency = "USD") {
  const normalized = String(setNum || "").trim();
  const safeCurrency = String(currency || "USD").trim().toUpperCase();
  const cacheKey = `set:${normalized}:${safeCurrency}`;
  return requestJson(
    `/set/${encodeURIComponent(normalized)}?currency=${encodeURIComponent(safeCurrency)}`,
    apiKey,
    cacheKey,
  );
}

async function getCollectionSets(apiKey = null, currency = "ZAR") {
  const safeCurrency = String(currency || "ZAR").trim().toUpperCase();
  return requestJson(
    `/collection/sets?currency=${encodeURIComponent(safeCurrency)}`,
    apiKey,
    `collection:sets:${safeCurrency}`,
  );
}

function status(apiKey = null) {
  return {
    configured: configured(apiKey),
    source: "BrickEconomy",
    quota: rateLimits.canRequest("brickeconomy"),
  };
}

module.exports = {
  getCollectionSets,
  getSet,
  status,
};
