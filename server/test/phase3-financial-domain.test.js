const test = require('node:test');
const assert = require('node:assert/strict');

const { readFinancialConfig } = require('../config/financial');
const { createFinancialService } = require('../services/financial-service');
const { decimal } = require('../services/financial-decimal');
const { createMemoryFinancialRepository } = require('../test-support/financial-memory');

function setup() {
  const repository = createMemoryFinancialRepository();
  repository.addUser({ id: 'user-a', email: 'a@example.test' });
  repository.addUser({ id: 'user-b', email: 'b@example.test' });
  return { repository, service: createFinancialService({ repository }) };
}
function lego(overrides = {}) {
  return {
    id: overrides.id || 'lego-10307', sku: overrides.sku || '10307',
    name: overrides.name || 'LEGO 10307 Eiffel Tower', brand: 'LEGO', category: 'Icons', family: 'Icons',
    price: overrides.price || '1000',
  };
}
function holding(repository, userId = 'user-a') {
  const portfolio = [...repository.__state.portfolios.values()].find(item => item.userId === userId);
  return [...repository.__state.holdings.values()].find(item => item.portfolioId === portfolio.id);
}
function lots(repository) {
  return [...repository.__state.lots.values()].sort((a, b) => String(a.acquiredAt).localeCompare(String(b.acquiredAt)));
}

test('financial persistence defaults to legacy and database modes require DATABASE_URL', () => {
  assert.equal(readFinancialConfig({}).mode, 'legacy');
  assert.equal(readFinancialConfig({ FINANCIAL_PERSISTENCE_MODE: 'postgres', DATABASE_URL: 'postgresql://example.test/db' }).mode, 'postgres');
  assert.equal(readFinancialConfig({ FINANCIAL_PERSISTENCE_MODE: 'dual', DATABASE_URL: 'postgresql://example.test/db' }).mode, 'dual');
  assert.throws(() => readFinancialConfig({ FINANCIAL_PERSISTENCE_MODE: 'postgres' }), /database_financial_requires_DATABASE_URL/);
  assert.throws(() => readFinancialConfig({ FINANCIAL_PERSISTENCE_MODE: 'surprise' }), /invalid_financial_persistence_mode/);
});

test('single purchase creates a holding and explicit acquisition lot', async () => {
  const { repository, service } = setup();
  await service.createCollectibleTrade('user-a', lego(), { side: 'BUY', quantity: 1, acquisitionPrice: '1000', currentPrice: '1100', currency: 'ZAR', occurredAt: '2026-01-01T00:00:00.000Z' });
  const current = holding(repository);
  assert.equal(decimal(current.quantity).toString(), '1');
  assert.equal(decimal(current.costBasis).toString(), '1000');
  assert.equal(decimal(current.averageCost).toString(), '1000');
  assert.equal(lots(repository).length, 1);
  assert.equal(decimal(lots(repository)[0].unitCost).toString(), '1000');
});

test('multiple purchases preserve acquisition lots and aggregate cost basis', async () => {
  const { repository, service } = setup();
  await service.createCollectibleTrade('user-a', lego({ price: '7500' }), { side: 'BUY', quantity: 1, acquisitionPrice: '7500', currency: 'ZAR', occurredAt: '2026-01-01T00:00:00.000Z' });
  await service.createCollectibleTrade('user-a', lego({ price: '8000' }), { side: 'BUY', quantity: 2, acquisitionPrice: '8000', currency: 'ZAR', occurredAt: '2026-02-01T00:00:00.000Z' });
  const current = holding(repository);
  assert.equal(decimal(current.quantity).toString(), '3');
  assert.equal(decimal(current.costBasis).toString(), '23500');
  assert.equal(decimal(current.averageCost).toFixed(8), '7833.33333333');
  assert.deepEqual(lots(repository).map(lot => decimal(lot.remainingQuantity).toString()), ['1', '2']);
});

test('partial FIFO sale consumes oldest lots and realizes reproducible P/L', async () => {
  const { repository, service } = setup();
  await service.createCollectibleTrade('user-a', lego(), { side: 'BUY', quantity: 1, acquisitionPrice: '1000', currency: 'ZAR', occurredAt: '2026-01-01T00:00:00.000Z' });
  await service.createCollectibleTrade('user-a', lego(), { side: 'BUY', quantity: 2, acquisitionPrice: '1200', currency: 'ZAR', occurredAt: '2026-02-01T00:00:00.000Z' });
  await service.createCollectibleTrade('user-a', lego(), { side: 'SELL', quantity: 2, salePrice: '1500', currency: 'ZAR', occurredAt: '2026-03-01T00:00:00.000Z' });
  const current = holding(repository);
  const allocations = [...repository.__state.saleAllocations.values()];
  assert.equal(decimal(current.quantity).toString(), '1');
  assert.equal(decimal(current.costBasis).toString(), '1200');
  assert.deepEqual(lots(repository).map(lot => decimal(lot.remainingQuantity).toString()), ['0', '1']);
  assert.equal(allocations.reduce((sum, row) => sum.plus(decimal(row.costBasis)), decimal(0)).toString(), '2200');
  assert.equal(allocations.reduce((sum, row) => sum.plus(decimal(row.proceeds)), decimal(0)).toString(), '3000');
  assert.equal(allocations.reduce((sum, row) => sum.plus(decimal(row.realizedPnl)), decimal(0)).toString(), '800');
});

test('fees reduce net proceeds and realized P/L', async () => {
  const { repository, service } = setup();
  await service.createCollectibleTrade('user-a', lego(), { side: 'BUY', quantity: 1, acquisitionPrice: '1000', currency: 'ZAR' });
  await service.createCollectibleTrade('user-a', lego(), { side: 'SELL', quantity: 1, salePrice: '1500', feeAmount: '100', feeType: 'marketplace', currency: 'ZAR' });
  const [allocation] = [...repository.__state.saleAllocations.values()];
  assert.equal(decimal(allocation.proceeds).toString(), '1400');
  assert.equal(decimal(allocation.realizedPnl).toString(), '400');
  assert.equal([...repository.__state.fees.values()].length, 1);
});

test('oversells are rejected and complete disposal removes sold inventory from NAV', async () => {
  const { repository, service } = setup();
  await service.createCollectibleTrade('user-a', lego(), { side: 'BUY', quantity: 1, acquisitionPrice: '1000', currentPrice: '1500', currency: 'ZAR' });
  await assert.rejects(() => service.createCollectibleTrade('user-a', lego(), { side: 'SELL', quantity: 2, salePrice: '1500', currency: 'ZAR' }), /insufficient_inventory/);
  await service.createCollectibleTrade('user-a', lego(), { side: 'SELL', quantity: 1, salePrice: '1500', currency: 'ZAR' });
  const state = await service.getPortfolioState('user-a');
  assert.equal(state.summary.costBasis, 0);
  assert.equal(state.summary.currentValue, 0);
  assert.equal(state.summary.unrealizedPnl, 0);
  assert.equal(state.summary.realizedPnl, 500);
  assert.equal(decimal(holding(repository).quantity).toString(), '0');
});

test('concurrent sales cannot drive inventory negative', async () => {
  const { repository, service } = setup();
  await service.createCollectibleTrade('user-a', lego(), { side: 'BUY', quantity: 1, acquisitionPrice: '1000', currency: 'ZAR' });
  const results = await Promise.allSettled([
    service.createCollectibleTrade('user-a', lego(), { side: 'SELL', quantity: 1, salePrice: '1200', currency: 'ZAR' }),
    service.createCollectibleTrade('user-a', lego(), { side: 'SELL', quantity: 1, salePrice: '1200', currency: 'ZAR' }),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
  assert.equal(decimal(holding(repository).quantity).toString(), '0');
});

test('asset and user isolation prevent cross-allocation and cross-user sales', async () => {
  const { repository, service } = setup();
  const setA = lego({ id: 'lego-a', sku: 'A', name: 'Set A' });
  const setB = lego({ id: 'lego-b', sku: 'B', name: 'Set B' });
  await service.createCollectibleTrade('user-a', setA, { side: 'BUY', quantity: 1, acquisitionPrice: '1000', currency: 'ZAR' });
  await service.createCollectibleTrade('user-a', setB, { side: 'BUY', quantity: 1, acquisitionPrice: '2000', currency: 'ZAR' });
  await service.createCollectibleTrade('user-a', setA, { side: 'SELL', quantity: 1, salePrice: '1500', currency: 'ZAR' });
  const holdings = await service.getPortfolioState('user-a');
  const openSet = holdings.holdings.find(item => decimal(item.quantity).gt(0));
  assert.equal(openSet.asset.symbol, 'lego-b');
  assert.equal(decimal(openSet.costBasis).toString(), '2000');
  await assert.rejects(() => service.createCollectibleTrade('user-b', setB, { side: 'SELL', quantity: 1, salePrice: '2500', currency: 'ZAR' }), /insufficient_inventory/);
});

test('market instruments support fractional quantities and idempotency', async () => {
  const { repository, service } = setup();
  const signal = { ticker: 'BTCUSD', label: 'Bitcoin', price: '100000', desk: 'crypto', currency: 'USD' };
  const input = { side: 'BUY', quantity: '0.12345678', acquisitionPrice: '100000', currency: 'USD', idempotencyKey: 'btc-buy-1' };
  await service.createMarketTrade('user-a', signal, input);
  await service.createMarketTrade('user-a', signal, input);
  assert.equal([...repository.__state.transactions.values()].length, 1);
  assert.equal(decimal(holding(repository).quantity).toFixed(8), '0.12345678');
});
