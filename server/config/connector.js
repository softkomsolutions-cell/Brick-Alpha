const DEFAULT_JOB_TYPES = [
  'connector_health',
  'connector_refresh',
  'valuation_refresh',
  'market_refresh',
];

function modeFrom(value) {
  const mode = String(value || 'legacy').trim().toLowerCase();
  if (!['legacy', 'dual', 'postgres'].includes(mode)) {
    throw new Error('invalid_connector_persistence_mode');
  }
  return mode;
}

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function readConnectorConfig(environment = process.env) {
  const mode = modeFrom(environment.CONNECTOR_PERSISTENCE_MODE);
  const requiresDatabase = mode === 'dual' || mode === 'postgres';
  if (requiresDatabase && !String(environment.DATABASE_URL || '').trim()) {
    throw new Error('database_connectors_requires_DATABASE_URL');
  }
  if (process.env.COLLECTTRADE_TEST !== '1' && requiresDatabase) {
    // Dual/postgres connector persistence depends on the same database the rest
    // of the backend already uses; no additional secret wiring is required here.
  }

  const rawTypes = String(environment.CONNECTOR_JOB_TYPES || '').trim();
  const jobTypes = rawTypes
    ? rawTypes.split(',').map(item => item.trim().toLowerCase()).filter(Boolean)
    : DEFAULT_JOB_TYPES;

  const hoursToMs = hours => Math.max(0, Number(hours) || 0) * 60 * 60 * 1000;

  return {
    mode,
    refreshAfterMs: hoursToMs(nonNegativeNumber(environment.CONNECTOR_FRESH_HOURS, 24)),
    reviewMs: hoursToMs(nonNegativeNumber(environment.CONNECTOR_STALE_HOURS, 72)),
    providerTimeoutMs: positiveNumber(environment.CONNECTOR_PROVIDER_TIMEOUT_MS, 8000),
    providerRetryLimit: nonNegativeNumber(environment.CONNECTOR_PROVIDER_RETRY_LIMIT, 2),
    jobTimeoutMs: positiveNumber(environment.CONNECTOR_JOB_TIMEOUT_MS, 45000),
    jobMaxAttempts: nonNegativeNumber(environment.CONNECTOR_JOB_MAX_ATTEMPTS, 3),
    backoffMs: positiveNumber(environment.CONNECTOR_RATE_LIMIT_BACKOFF_MS, 60000),
    maxBackoffMs: positiveNumber(environment.CONNECTOR_MAX_BACKOFF_MS, 5 * 60 * 1000),
    jobPollIntervalMs: positiveNumber(environment.JOB_POLL_INTERVAL_MS, 5000),
    jobGraceMs: positiveNumber(environment.JOB_GRACE_MS, 30000),
    jobClaimLimit: nonNegativeNumber(environment.JOB_CLAIM_LIMIT, 20) || 20,
    jobTypes,
    jobsEnabled: requiresDatabase && String(environment.CONNECTOR_JOBS_ENABLED || 'true').trim() !== 'false',
  };
}

module.exports = { readConnectorConfig };