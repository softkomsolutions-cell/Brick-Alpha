// Deterministic in-process provider used for local tests and staging validation.
// Produces stable evidence from the asset symbol. Never performs network I/O.
function deterministicHash(input) {
  let hash = 2166136261;
  const string = String(input || '');
  for (let index = 0; index < string.length; index += 1) {
    hash ^= string.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createMockProvider(options = {}) {
  const mode = String(options.mode || process.env.VALUATION_MOCK_PROVIDER_MODE || 'ok').trim().toLowerCase();
  const name = 'mock';
  return {
    name,
    configured: () => true,
    describe: () => 'mock',
    async fetchPriceEvidence({ asset, currency = 'USD', observedAt } = {}) {
      if (mode === 'fail') return { provider: name, available: false, evidence: [], price: null, error: 'mock_provider_unavailable' };
      const symbol = String(asset?.symbol || '');
      const hash = deterministicHash(symbol);
      const price = 40 + (hash % 400) + (hash % 7) / 10;
      const observedIso = observedAt || new Date().toISOString();
      if (mode === 'stale') {
        const stale = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
        return {
          provider: name,
          available: true,
          evidence: [
            { kind: 'CURRENT_PRICE', sourceUrl: 'mock://price', sourceLabel: 'Mock benchmark', observedAt: stale, salePrice: price, currency, condition: 'sealed', notes: 'synthetic', rawPayload: { stub: true } },
          ],
          price,
          error: null,
        };
      }
      return {
        provider: name,
        available: true,
        evidence: [
          { kind: 'CURRENT_PRICE', sourceUrl: 'mock://price', sourceLabel: 'Mock benchmark', observedAt: observedIso, salePrice: price, currency, condition: 'sealed', notes: 'synthetic', rawPayload: { stub: true } },
          { kind: 'SALE', sourceUrl: 'mock://sale', sourceLabel: 'Mock last sale', observedAt: observedIso, salePrice: Math.round(price * 10) / 10, currency, condition: 'sealed', notes: 'synthetic', rawPayload: { stub: true } },
        ],
        price,
        error: null,
      };
    },
  };
}

module.exports = { createMockProvider };