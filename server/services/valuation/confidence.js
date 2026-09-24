const { safeNormalizePrice } = require('./currency');
const { evidenceObservedAt } = require('./freshness');

function evidenceSignal({ evidence = [], freshMs, now }) {
  const count = evidence.length;
  if (count === 0) return { evidenceCount: 0, freshCount: 0, providerCount: 0, dispersion: null, dispersionFactor: 0, freshRatio: 0, overallSignal: 'empty', notes: [] };
  const providerSet = new Set(evidence.map(item => item.provider).filter(Boolean));
  const freshCount = evidence.filter(item => {
    const base = evidenceObservedAt(item.observedAt);
    if (!base) return false;
    return (now || Date.now()) - new Date(base).getTime() <= freshMs;
  }).length;
  const prices = evidence
    .map(item => safeNormalizePrice({ amount: item.salePrice, sourceCurrency: item.currency || 'USD', displayCurrency: 'USD', rates: { USD_USD: 1 } }))
    .map(item => item.conversion === 'unavailable' || item.normalizedAmount === null ? null : item.normalizedAmount)
    .filter(value => value !== null);
  const avg = prices.length ? prices.reduce((sum, value) => sum + value, 0) / prices.length : null;
  const dispersion = avg && avg > 0 && prices.length > 1
    ? Math.sqrt(prices.reduce((sum, value) => sum + (value - avg) ** 2, 0) / prices.length) / avg
    : null;
  const dispersionFactor = dispersion !== null && dispersion < 0.25 ? 1 : dispersion !== null && dispersion < 0.5 ? 0.8 : 0.5;
  const notes = [];
  if (freshCount < count) notes.push(`${count - freshCount}_stale_prices`);
  if (providerSet.size < 1) notes.push('no_provider');
  if (dispersion !== null && dispersion >= 0.5) notes.push('high_dispersion');
  return {
    evidenceCount: count,
    freshCount,
    providerCount: providerSet.size,
    aggregatedPrice: avg,
    dispersion,
    dispersionFactor,
    freshRatio: count > 0 ? freshCount / count : 0,
    overallSignal: count >= 2 && freshCount >= count * 0.5 ? 'sufficient' : count === 1 ? 'minimal' : 'insufficient',
    notes,
  };
}

function boundConfidence(modelConfidence, signal = {}) {
  const base = Math.max(0, Math.min(100, Math.round(Number(modelConfidence) || 0)));
  const ratio = Number(signal.freshRatio) || 0;
  const bounded = Math.max(0, Math.min(100, Math.round(base * 0.92 + ratio * 100 * 0.08)));
  return { confidence: base, boundedConfidence: bounded, overallSignal: signal.overallSignal || 'empty', notes: signal.notes || [] };
}

module.exports = { evidenceSignal, boundConfidence };