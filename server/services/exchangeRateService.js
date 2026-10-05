const DEFAULT_USD_ZAR_RATE = 16.67;
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const SOURCE_URL = "https://api.frankfurter.app/latest?from=USD&to=ZAR";

let cache = null;

function fallback(reason = "fallback") {
  return {
    ok: false,
    rate: DEFAULT_USD_ZAR_RATE,
    pair: "USD/ZAR",
    source: "Fallback",
    asOf: null,
    reason,
  };
}

async function getUsdZarRate({ force = false, fetchFn = fetch } = {}) {
  if (!force && cache && cache.expiresAt > Date.now()) {
    return { ...cache.value, cache: "fresh" };
  }

  try {
    const response = await fetchFn(SOURCE_URL, {
      headers: { Accept: "application/json", "User-Agent": "BrickAlpha/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return fallback(`http_${response.status}`);
    const body = await response.json();
    const rate = Number(body?.rates?.ZAR);
    if (!Number.isFinite(rate) || rate <= 0) return fallback("invalid_rate");

    const value = {
      ok: true,
      rate: Math.round(rate * 10000) / 10000,
      pair: "USD/ZAR",
      source: "Frankfurter / South African Reserve Bank",
      asOf: body?.date || new Date().toISOString().slice(0, 10),
    };
    cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return { ...value, cache: "refreshed" };
  } catch (error) {
    if (cache?.value) return { ...cache.value, cache: "stale", reason: "refresh_failed" };
    return fallback(error?.name === "TimeoutError" ? "timeout" : "unavailable");
  }
}

module.exports = { getUsdZarRate, DEFAULT_USD_ZAR_RATE };
