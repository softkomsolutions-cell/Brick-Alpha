function readValuationConfig(environment = process.env) {
  const mode = String(environment.VALUATION_PERSISTENCE_MODE || 'legacy').trim().toLowerCase();
  if (!['legacy', 'dual', 'postgres'].includes(mode)) {
    throw new Error('invalid_valuation_persistence_mode');
  }
  if ((mode === 'dual' || mode === 'postgres') && !String(environment.DATABASE_URL || '').trim()) {
    throw new Error('database_valuation_requires_DATABASE_URL');
  }

  const displayCurrency = String(
    environment.VALUATION_DISPLAY_CURRENCY || environment.FINANCIAL_DEFAULT_CURRENCY || 'ZAR',
  ).trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(displayCurrency)) {
    throw new Error('invalid_valuation_display_currency');
  }

  const rawRates = String(environment.VALUATION_CURRENCY_RATES || '').trim();
  let rates = {};
  if (rawRates) {
    try { rates = JSON.parse(rawRates); } catch { throw new Error('invalid_valuation_currency_rates'); }
    if (rates && typeof rates !== 'object') throw new Error('invalid_valuation_currency_rates');
  }

  const providerList = String(environment.VALUATION_PROVIDERS || 'mock')
    .split(',')
    .map(item => item.trim().toLowerCase())
    .filter(Boolean);

  return {
    mode,
    displayCurrency,
    rates,
    modelVersion: String(environment.VALUATION_MODEL_VERSION || 'brick-alpha-v1').trim(),
    providers: providerList,
    freshnessMs: Math.max(0, Number(environment.VALUATION_FRESHNESS_HOURS || 24) || 24) * 60 * 60 * 1000,
    reviewMs: Math.max(0, Number(environment.VALUATION_REVIEW_HOURS || 72) || 72) * 60 * 60 * 1000,
    providerTimeoutMs: Math.max(1000, Number(environment.VALUATION_PROVIDER_TIMEOUT_MS || 8000) || 8000),
    providerRetryLimit: Math.max(0, Number(environment.VALUATION_PROVIDER_RETRY_LIMIT || 2) || 2),
  };
}

module.exports = { readValuationConfig };
