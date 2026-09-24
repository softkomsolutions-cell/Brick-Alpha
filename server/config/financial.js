function readFinancialConfig(environment = process.env) {
  const mode = String(environment.FINANCIAL_PERSISTENCE_MODE || 'legacy').trim().toLowerCase();
  if (!['legacy', 'dual', 'postgres'].includes(mode)) {
    throw new Error('invalid_financial_persistence_mode');
  }
  if ((mode === 'dual' || mode === 'postgres') && !String(environment.DATABASE_URL || '').trim()) {
    throw new Error('database_financial_requires_DATABASE_URL');
  }
  const lotAllocation = String(environment.FINANCIAL_LOT_ALLOCATION || 'FIFO').trim().toUpperCase();
  if (lotAllocation !== 'FIFO') {
    throw new Error('unsupported_financial_lot_allocation');
  }
  return {
    mode,
    defaultCurrency: String(environment.FINANCIAL_DEFAULT_CURRENCY || 'ZAR').trim().toUpperCase(),
    lotAllocation,
  };
}

module.exports = { readFinancialConfig };