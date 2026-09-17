const { decimal, money, nonNegative, positive } = require('./financial-decimal');

const ISO_CURRENCY = /^[A-Z]{3}$/;
function currency(value, fallback = 'ZAR') {
  const code = String(value || fallback).trim().toUpperCase();
  if (!ISO_CURRENCY.test(code)) throw new Error('invalid_currency');
  return code;
}
function iso(value) {
  const date = value ? new Date(value) : new Date();
  if (!Number.isFinite(date.getTime())) throw new Error('invalid_transaction_date');
  return date.toISOString();
}
function assetInput(source, type) {
  const symbol = String(source.id || source.sku || source.ticker || source.symbol || '').trim();
  if (!symbol) throw new Error('asset_identifier_required');
  return {
    assetType: type,
    symbol,
    name: String(source.name || source.label || symbol).trim(),
    currency: source.currency ? currency(source.currency) : null,
    metadata: { referencePrice: source.price ?? null },
    collectible: type === 'COLLECTIBLE' ? {
      brand: source.brand || null, category: source.category || source.family || null,
      sku: source.sku || source.id || null, description: source.description || null,
      theme: source.theme || source.family || null,
    } : null,
    marketInstrument: type === 'MARKET_INSTRUMENT' ? {
      ticker: source.ticker || source.symbol || symbol, desk: source.desk || null,
      providerSymbol: source.providerSymbol || null, exchange: source.exchange || null,
      quoteCurrency: source.currency ? currency(source.currency) : null,
    } : null,
  };
}

function createFinancialService({ repository, defaultCurrency = 'ZAR' }) {
  if (!repository) throw new Error('financial_repository_required');

  async function createTrade(userId, source, input, assetType) {
    const side = String(input.side || '').toUpperCase();
    if (!['BUY', 'SELL'].includes(side)) throw new Error('invalid_trade_side');
    const quantity = positive(input.quantity, 'invalid_quantity');
    if (assetType === 'COLLECTIBLE' && !quantity.isInteger()) throw new Error('collectible_quantity_must_be_integer');
    const code = currency(input.currency || source.currency, defaultCurrency);
    const occurredAt = iso(input.occurredAt);
    const unitPrice = positive(side === 'BUY' ? input.acquisitionPrice : input.salePrice, side === 'BUY' ? 'acquisition_price_required' : 'sale_price_required');
    const fee = nonNegative(input.feeAmount || 0, 'invalid_fee');
    const idempotencyKey = input.idempotencyKey ? String(input.idempotencyKey) : null;
    const currentPrice = input.currentPrice === undefined || input.currentPrice === null ? null : nonNegative(input.currentPrice, 'invalid_current_price');

    return repository.transaction(async tx => {
      if (idempotencyKey) {
        const existing = await tx.findTransactionByIdempotencyKey(idempotencyKey);
        if (existing) return existing;
      }
      const portfolio = await tx.ensurePortfolio(userId, code);
      const asset = await tx.ensureAsset(assetInput(source, assetType));
      const holding = await tx.lockHolding(portfolio.id, asset.id, code);
      if (holding.currency !== code) throw new Error('holding_currency_mismatch');

      if (side === 'BUY') {
        const gross = money(unitPrice.times(quantity));
        const totalCost = money(gross.plus(fee));
        const transaction = await tx.createTransaction({
          portfolioId: portfolio.id, holdingId: holding.id, assetId: asset.id,
          type: 'BUY', side: 'BUY', quantity, unitPrice, grossAmount: gross,
          netAmount: totalCost, currency: code, idempotencyKey, occurredAt,
          metadata: { acquisitionPriceExplicit: true },
        });
        if (fee.gt(0)) await tx.createFee({ transactionId: transaction.id, type: input.feeType || 'OTHER', amount: fee, currency: code });
        await tx.createLot({ holdingId: holding.id, sourceTransactionId: transaction.id, quantity, remainingQuantity: quantity, unitCost: money(totalCost.div(quantity)), costBasis: totalCost, currency: code, acquiredAt: occurredAt });
        await tx.refreshHolding(holding.id, currentPrice);
        return transaction;
      }

      const lots = await tx.listOpenLotsForUpdate(holding.id);
      const available = lots.reduce((sum, lot) => sum.plus(decimal(lot.remainingQuantity)), decimal(0));
      if (available.lt(quantity)) throw new Error('insufficient_inventory');
      const gross = money(unitPrice.times(quantity));
      const net = money(gross.minus(fee));
      const transaction = await tx.createTransaction({
        portfolioId: portfolio.id, holdingId: holding.id, assetId: asset.id,
        type: 'SELL', side: 'SELL', quantity, unitPrice, grossAmount: gross,
        netAmount: net, currency: code, idempotencyKey, occurredAt,
      });
      if (fee.gt(0)) await tx.createFee({ transactionId: transaction.id, type: input.feeType || 'OTHER', amount: fee, currency: code });

      let remaining = quantity;
      let allocatedGross = decimal(0);
      let allocatedFee = decimal(0);
      for (let index = 0; index < lots.length && remaining.gt(0); index += 1) {
        const lot = lots[index];
        const lotRemaining = decimal(lot.remainingQuantity);
        const allocatedQuantity = DecimalMin(remaining, lotRemaining);
        const isLast = allocatedQuantity.eq(remaining);
        const allocationGross = isLast ? gross.minus(allocatedGross) : money(gross.times(allocatedQuantity).div(quantity));
        const allocationFee = isLast ? fee.minus(allocatedFee) : money(fee.times(allocatedQuantity).div(quantity));
        const proceeds = money(allocationGross.minus(allocationFee));
        const costBasis = money(decimal(lot.unitCost).times(allocatedQuantity));
        await tx.createSaleAllocation({ transactionId: transaction.id, holdingLotId: lot.id, quantity: allocatedQuantity, costBasis, proceeds, realizedPnl: money(proceeds.minus(costBasis)), currency: code });
        await tx.consumeLot(lot.id, allocatedQuantity);
        remaining = remaining.minus(allocatedQuantity);
        allocatedGross = allocatedGross.plus(allocationGross);
        allocatedFee = allocatedFee.plus(allocationFee);
      }
      await tx.refreshHolding(holding.id, currentPrice);
      return transaction;
    });
  }

  async function getPortfolioState(userId) {
    const state = await repository.getPortfolioState(userId);
    const holdings = state.holdings.map(item => {
      const quantity = decimal(item.quantity);
      const costBasis = decimal(item.costBasis);
      const currentValue = item.currentValue === null || item.currentValue === undefined ? costBasis : decimal(item.currentValue);
      return { ...item, unrealizedPnl: money(currentValue.minus(costBasis)) };
    });
    const summary = holdings.reduce((acc, item) => ({
      costBasis: acc.costBasis.plus(decimal(item.costBasis)),
      currentValue: acc.currentValue.plus(decimal(item.currentValue === null || item.currentValue === undefined ? item.costBasis : item.currentValue)),
      unrealizedPnl: acc.unrealizedPnl.plus(decimal(item.unrealizedPnl)),
    }), { costBasis: decimal(0), currentValue: decimal(0), unrealizedPnl: decimal(0) });
    const realizedPnl = state.saleAllocations.reduce((sum, item) => sum.plus(decimal(item.realizedPnl)), decimal(0));
    return {
      holdings,
      summary: {
        costBasis: Number(money(summary.costBasis)), currentValue: Number(money(summary.currentValue)),
        unrealizedPnl: Number(money(summary.unrealizedPnl)), realizedPnl: Number(money(realizedPnl)),
      },
    };
  }

  return {
    createCollectibleTrade: (userId, collectible, input) => createTrade(userId, collectible, input, 'COLLECTIBLE'),
    createMarketTrade: (userId, instrument, input) => createTrade(userId, instrument, input, 'MARKET_INSTRUMENT'),
    getPortfolioState,
  };
}

function DecimalMin(left, right) { return left.lte(right) ? left : right; }

module.exports = { createFinancialService };
