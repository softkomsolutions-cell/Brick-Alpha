const FRESH_STATUS = 'FRESH';
const STALE_STATUS = 'STALE';
const REFRESH_REQUIRED_STATUS = 'REFRESH_REQUIRED';
const UNAVAILABLE_STATUS = 'UNAVAILABLE';

// Reuses the same threshold semantics as Phase 4 valuation freshness
// (services/valuation/freshness.js): an observedAt newer than the fresh window
// is FRESH, newer than the review window is STALE, older is REFRESH_REQUIRED,
// and a missing/disabled source or unknown timestamp is UNAVAILABLE.
function connectorFreshness({
  observedAt,
  now = Date.now(),
  refreshAfterMs,
  reviewMs,
  sourceAvailable = true,
} = {}) {
  function parseTime(value) {
    if (value instanceof Date) return value.valueOf();
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    return Date.parse(String(value || ''));
  }
  const base = parseTime(observedAt);
  if (!sourceAvailable) return UNAVAILABLE_STATUS;
  if (!Number.isFinite(base)) return UNAVAILABLE_STATUS;

  const age = (now || Date.now()) - base;
  if (age <= refreshAfterMs) return FRESH_STATUS;
  if (age <= reviewMs) return STALE_STATUS;
  return REFRESH_REQUIRED_STATUS;
}

function shouldRefresh(freshness, force = false) {
  if (force) return true;
  return freshness === REFRESH_REQUIRED_STATUS || freshness === STALE_STATUS || freshness === UNAVAILABLE_STATUS;
}

function labelForProvider(providerId) {
  return String(providerId || 'unknown').toUpperCase();
}

module.exports = {
  FRESH_STATUS,
  STALE_STATUS,
  REFRESH_REQUIRED_STATUS,
  UNAVAILABLE_STATUS,
  connectorFreshness,
  labelForProvider,
  shouldRefresh,
};