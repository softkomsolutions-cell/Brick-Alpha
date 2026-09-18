function statusFor({ observedAt, now, freshMs, reviewMs, evidenceCount = 0, providerAvailable = true }) {
  const base = Date.parse(String(observedAt));
  if (!providerAvailable) return 'UNAVAILABLE';
  if (evidenceCount <= 0) return 'UNAVAILABLE';
  if (!Number.isFinite(base)) return 'REVIEW_REQUIRED';
  const age = (now || Date.now()) - base;
  if (age <= freshMs) return 'FRESH';
  if (age <= reviewMs) return 'STALE';
  return 'REVIEW_REQUIRED';
}

function evidenceObservedAt(value) {
  const date = value ? new Date(value) : null;
  const ms = date ? date.getTime() : NaN;
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

module.exports = { statusFor, evidenceObservedAt };
