const fs = require('node:fs');
const crypto = require('node:crypto');

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function inspectLegacyFinancialStore(filePath) {
  if (!filePath) throw new Error('legacy_financial_source_required');
  const bytes = fs.readFileSync(filePath);
  const store = JSON.parse(bytes.toString('utf8'));
  const users = Array.isArray(store.users) ? store.users : [];
  const rootTrades = Array.isArray(store.trades) ? store.trades : [];
  const stateTrades = Object.entries(store.userStates || {}).flatMap(([userId, state]) => (Array.isArray(state?.trades) ? state.trades : []).map(trade => ({ ...trade, __userId: userId })));
  const trades = [...rootTrades, ...stateTrades];
  const seen = new Set();
  const duplicates = [];
  const invalid = [];
  const ambiguous = [];
  const currencies = new Set();
  let open = 0;
  let closed = 0;
  let totalQuantity = 0;
  let explicitCostBasis = 0;
  let legacyRealized = 0;

  for (const trade of trades) {
    const key = trade.id || trade.tradeId || trade.externalId || null;
    if (key && seen.has(key)) duplicates.push(key);
    if (key) seen.add(key);
    const quantity = number(trade.quantity ?? trade.qty);
    if (quantity === null || quantity <= 0) invalid.push({ id: key, reason: 'invalid_quantity' });
    else totalQuantity += quantity;
    const currency = String(trade.currency || '').trim().toUpperCase();
    if (currency) currencies.add(currency);
    const isClosed = Boolean(trade.closedAt || trade.status === 'closed' || trade.status === 'CLOSED');
    if (isClosed) closed += 1; else open += 1;
    const acquisition = number(trade.acquisitionPrice ?? trade.purchasePrice ?? trade.entryPrice);
    const costBasis = number(trade.costBasis);
    if (costBasis !== null) explicitCostBasis += costBasis;
    else if (acquisition !== null && quantity !== null) explicitCostBasis += acquisition * quantity;
    else ambiguous.push({ id: key, reason: 'acquisition_price_or_cost_basis_missing' });
    const realized = number(trade.pnlAmount ?? trade.realizedPnl);
    if (realized !== null && isClosed) legacyRealized += realized;
  }

  return {
    source: filePath,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    dryRun: true,
    counts: { users: users.length, trades: trades.length, open, closed, duplicates: duplicates.length, invalid: invalid.length, ambiguous: ambiguous.length },
    currencies: [...currencies].sort(),
    totals: { quantity: totalQuantity, explicitCostBasis, legacyRealized },
    duplicates,
    invalid,
    manualReview: ambiguous,
    policy: {
      acquisitionPrice: 'never inferred from catalog/current/estimated price',
      lotHistory: 'never invented; ambiguous records require manual review',
      writePerformed: false,
    },
  };
}

module.exports = { inspectLegacyFinancialStore };
