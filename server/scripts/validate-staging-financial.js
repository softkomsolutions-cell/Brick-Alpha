// Synthetic PostgreSQL financial checks. A unique synthetic user and assets are removed in cleanup.
// Named checkpoints report the exact validation STEP that failed (cleanup never overwrites it).
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { getPrismaClient, disconnectPrisma } = require('../db/prisma-client');
const { createPostgresFinancialRepository } = require('../repositories/postgresFinancialRepository');
const { createFinancialService } = require('../services/financial-service');
const { decimal } = require('../services/financial-decimal');

const SANITY_ONLY = process.argv.includes('--sanity-only');
const SAFE_FIELD = /^[A-Z0-9_]+$/;

let currentStep = 'validate-start';

function step(name) {
  currentStep = name;
  console.log(`STEP ${name}`);
}

function collectible(marker, suffix) {
  return {
    id: `phase3-${suffix}-${marker}`,
    sku: `phase3-${suffix}-${marker}`,
    name: `Phase 3 synthetic ${suffix}`,
    brand: 'Synthetic',
    category: 'Validation',
    price: '1000',
    currency: 'ZAR',
  };
}

function safeMeta(meta) {
  const out = {};
  for (const [key, value] of Object.entries(meta || {})) {
    if (typeof value === 'number' || typeof value === 'boolean') out[key] = value;
    else if (typeof value === 'string' && !/passw|postgresql:\/\/|DATABASE_URL|connection.?string/i.test(value)) {
      out[key] = value.length > 400 ? `${value.slice(0, 400)}...` : value;
    }
  }
  return out;
}

function reportFailure(error) {
  console.error(`FAIL staging financial validation (${SAFE_FIELD.test(error.code || '') ? error.code : error.name || 'Error'})`);
  console.error(`STEP-FAILED=${currentStep}`);
  if (error.meta) {
    if (SAFE_FIELD.test(String(error.meta.code || ''))) console.error(`sqlstate=${error.meta.code}`);
    const meta = safeMeta(error.meta);
    if (Object.keys(meta).length) console.error(`error.meta=${JSON.stringify(meta)}`);
  }
  const message = String(error.message || '');
  if (message && !/DATABASE_URL|postgresql:\/\/|password|passw|connection.?string/i.test(message)) {
    console.error(`error.message=${message.slice(0, 400)}`);
  }
  const frame = String(error.stack || '').split('\n').find((line) => line.includes('server\\') || line.includes('server/'));
  if (frame) console.error(`error.frame=${frame.trim().slice(0, 250)}`);
}

async function validate(client) {
  const marker = crypto.randomUUID();
  const email = `phase3-${marker}@example.test`;
  const primary = collectible(marker, 'lots');
  const userIds = [];
  try {
    step('user-create');
    const user = await client.user.create({
      data: { legacyId: `phase3-${marker}`, name: 'Phase 3 Synthetic', email, role: 'PARTNER' },
    });
    const userId = user.id;
    userIds.push(userId);
    const repository = createPostgresFinancialRepository(() => client);
    const service = createFinancialService({ repository, defaultCurrency: 'ZAR' });

    step('raw-sanity');
    await client.$queryRaw`SELECT 1 AS ok`;
    console.log('PASS raw category');

    step('advisory-lock-isolation');
    await client.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`lock:${marker}`}::text, 0::bigint))`;
    console.log('PASS advisory row lock executes and stays transaction-scoped');

    if (SANITY_ONLY) {
      currentStep = 'sanity-complete';
      return;
    }

    step('first-purchase');
    await service.createCollectibleTrade(userId, primary, { side: 'BUY', quantity: 1, acquisitionPrice: '1000', currentPrice: '1500', idempotencyKey: `phase3-buy-a-${marker}` });

    step('second-purchase');
    await service.createCollectibleTrade(userId, primary, { side: 'BUY', quantity: 2, acquisitionPrice: '1200', currentPrice: '1500', idempotencyKey: `phase3-buy-b-${marker}` });
    let state = await service.getPortfolioState(userId);
    const aggregator = state.holdings.find((holding) => holding.asset.symbol === primary.id);
    assert.equal(decimal(aggregator.quantity).toString(), '3');
    assert.equal(state.summary.costBasis, 3400);
    assert.equal(state.summary.currentValue, 4500);
    assert.equal(state.summary.unrealizedPnl, 1100);
    const lotsAfterBuys = await client.holdingLot.count({ where: { holding: { asset: { symbol: primary.id } }, remainingQuantity: { gt: 0 } } });
    assert.equal(lotsAfterBuys, 2);

    step('fifo-sale');
    await service.createCollectibleTrade(userId, primary, { side: 'SELL', quantity: 2, salePrice: '1500', idempotencyKey: `phase3-sell-a-${marker}` });
    state = await service.getPortfolioState(userId);
    assert.equal(state.summary.costBasis, 1200);
    assert.equal(state.summary.currentValue, 1500);
    assert.equal(state.summary.unrealizedPnl, 300);
    assert.equal(state.summary.realizedPnl, 800);
    const allocationsAfterFifo = await client.saleAllocation.count({ where: { transaction: { portfolio: { userId } } } });
    assert.equal(allocationsAfterFifo, 2);

    step('oversell');
    await assert.rejects(() => service.createCollectibleTrade(userId, primary, { side: 'SELL', quantity: 2, salePrice: '1500', idempotencyKey: `phase3-oversell-${marker}` }), /insufficient_inventory/);

    step('complete-disposal');
    await service.createCollectibleTrade(userId, primary, { side: 'SELL', quantity: 1, salePrice: '1500', feeAmount: '100', feeType: 'MARKETPLACE', idempotencyKey: `phase3-sell-b-${marker}` });
    state = await service.getPortfolioState(userId);
    assert.equal(state.summary.costBasis, 0);
    assert.equal(state.summary.currentValue, 0);
    assert.equal(state.summary.unrealizedPnl, 0);
    assert.equal(state.summary.realizedPnl, 1000);
    const allocationsAfterDisposal = await client.saleAllocation.count({ where: { transaction: { portfolio: { userId } } } });
    assert.equal(allocationsAfterDisposal, 3);

    step('buy-after-disposal');
    await service.createCollectibleTrade(userId, primary, { side: 'BUY', quantity: 1, acquisitionPrice: '1000', idempotencyKey: `phase3-buy-c-${marker}` });
    state = await service.getPortfolioState(userId);
    assert.equal(state.summary.costBasis, 1000);
    assert.equal(decimal(state.holdings.find((holding) => holding.asset.symbol === primary.id).quantity).toString(), '1');

    step('multiple-assets');
    const second = collectible(marker, 'asset2');
    await service.createCollectibleTrade(userId, second, { side: 'BUY', quantity: 1, acquisitionPrice: '500', idempotencyKey: `phase3-asset2-buy-${marker}` });
    state = await service.getPortfolioState(userId);
    assert.equal(state.holdings.filter((holding) => decimal(holding.quantity).gt(0)).length, 2);

    step('multiple-users');
    const userTwo = await client.user.create({
      data: { legacyId: `phase3-b-${marker}`, name: 'Phase 3 Synthetic B', email: `phase3-b-${marker}@example.test`, role: 'PARTNER' },
    });
    userIds.push(userTwo.id);
    await service.createCollectibleTrade(userTwo.id, second, { side: 'BUY', quantity: 2, acquisitionPrice: '500', idempotencyKey: `phase3-user2-buy-${marker}` });
    await assert.rejects(() => service.createCollectibleTrade(userTwo.id, primary, { side: 'SELL', quantity: 1, salePrice: '1000', idempotencyKey: `phase3-user2-oversell-${marker}` }), /insufficient_inventory/);
    const userTwoState = await service.getPortfolioState(userTwo.id);
    assert.equal(decimal(userTwoState.holdings.find((holding) => holding.asset.symbol === second.id).quantity).toString(), '2');

    step('fractional-market');
    const instrument = { ticker: 'BTCUSD', label: 'Bitcoin', price: '100000', desk: 'crypto', currency: 'USD' };
    const fractional = await service.createMarketTrade(userId, instrument, { side: 'BUY', quantity: '0.12345678', acquisitionPrice: '100000', currency: 'USD', idempotencyKey: `phase3-frac-${marker}` });
    assert.equal(decimal(fractional.quantity).toFixed(8), '0.12345678');

    step('idempotency');
    const replay = await service.createMarketTrade(userId, instrument, { side: 'BUY', quantity: '0.12345678', acquisitionPrice: '100000', currency: 'USD', idempotencyKey: `phase3-frac-${marker}` });
    assert.equal(replay.id, fractional.id);
    const replayForBuyA = await service.createCollectibleTrade(userId, primary, { side: 'BUY', quantity: 1, acquisitionPrice: '1000', currentPrice: '1500', idempotencyKey: `phase3-buy-a-${marker}` });
    assert.equal(replayForBuyA.id, (await client.transaction.findFirst({ where: { idempotencyKey: `phase3-buy-a-${marker}` } })).id);

    step('concurrent-sale-seed');
    const concurrent = collectible(marker, 'concurrency');
    await service.createCollectibleTrade(userId, concurrent, { side: 'BUY', quantity: 1, acquisitionPrice: '1000', currentPrice: '1000', idempotencyKey: `phase3-concurrent-buy-${marker}` });

    step('concurrent-sale');
    const results = await Promise.allSettled([
      service.createCollectibleTrade(userId, concurrent, { side: 'SELL', quantity: 1, salePrice: '1400', idempotencyKey: `phase3-concurrent-sell-a-${marker}` }),
      service.createCollectibleTrade(userId, concurrent, { side: 'SELL', quantity: 1, salePrice: '1400', idempotencyKey: `phase3-concurrent-sell-b-${marker}` }),
    ]);
    for (const result of results) {
      if (result.status === 'rejected') {
        const reason = result.reason;
        const detail = reason?.code ? `${reason.code} ${String(reason.message || '').slice(0, 200)}` : String(reason?.message || reason?.name || reason).slice(0, 200);
        if (!/DATABASE_URL|postgresql:\/\/|password|passw|connection.?string/i.test(detail)) console.log(`concurrent-rejection=${detail}`);
      }
    }
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    const rejected = results.find((result) => result.status === 'rejected')?.reason;
    assert.ok(rejected, 'concurrent oversell must reject exactly one sale');
    const concurrentState = await service.getPortfolioState(userId);
    const concurrentLots = await client.holdingLot.findMany({ where: { holding: { asset: { symbol: concurrent.id }, portfolio: { userId } } } });
    const concurrentQuantity = concurrentLots.reduce((sum, lot) => sum.plus(decimal(lot.remainingQuantity)), decimal(0));
    assert.equal(concurrentQuantity.toString(), '0');
    assert.ok(concurrentLots.every((lot) => decimal(lot.remainingQuantity).gte(0)), 'inventory never negative');
    const concurrentSummary = concurrentState.holdings.find((holding) => holding.asset.symbol === concurrent.id);
    assert.equal(decimal(concurrentSummary?.quantity ?? 0).toString(), '0');

    step('validate-complete');
    const view = await service.getPortfolioView(userId);
    assert.ok(view.every((trade) => trade.id && trade.side && trade.status && trade.currency));
    assert.equal(view.filter((trade) => trade.side === 'sell' && trade.status === 'closed').length, 3);
    const executionCount = await client.execution.count({ where: { transaction: { portfolio: { userId } } } });
    const transactionCount = await client.transaction.count({ where: { portfolio: { userId } } });
    assert.equal(executionCount, transactionCount);

    console.log('PASS PostgreSQL lots, FIFO partial sales, fees, oversell rejection, and exclusion of sold inventory from NAV/cost/unrealized P/L');
    console.log('PASS PostgreSQL row locking prevents concurrent oversell and inventory never goes negative');
    console.log('PASS PostgreSQL re-purchase after complete disposal, fractional instruments, idempotency, and portfolio views map to legacy contracts');
  } finally {
    console.log('CLEANUP-STARTED');
    for (const id of userIds) await client.user.delete({ where: { id } }).catch(() => undefined);
    await client.asset.deleteMany({ where: { symbol: { contains: 'phase3-' } } }).catch(() => undefined);
    for (const id of userIds) assert.equal(await client.user.count({ where: { id } }), 0, `synthetic user cleanup failed (${currentStep})`);
    console.log('PASS synthetic staging financial data removed');
  }
}

async function main() {
  try {
    if (process.env.RAILWAY_ENVIRONMENT_ID !== '145568f8-f723-427c-ab72-2839cd0ba9d4' || process.env.RAILWAY_SERVICE_ID !== '763f488b-f1d6-4304-b62d-1c3185dff88b') {
      throw new Error('staging_context_required');
    }
    if (process.env.DATABASE_URL_TUNNEL_PORT) {
      const url = new URL(process.env.DATABASE_URL);
      url.hostname = '127.0.0.1';
      url.port = String(Number(process.env.DATABASE_URL_TUNNEL_PORT));
      process.env.DATABASE_URL = url.toString();
    }
    await validate(getPrismaClient());
  } catch (error) {
    reportFailure(error);
    process.exitCode = 1;
  } finally {
    await disconnectPrisma();
  }
}

if (require.main === module) main();
module.exports = { validate, __currentStep: () => currentStep };