const { decimal, money, nonNegative, positive } = require('./financial-decimal');

const ISO_CURRENCY = /^[A-Z]{3}$/;
const FEE_TYPES = ['BROKER', 'MARKETPLACE', 'SHIPPING', 'STORAGE', 'TAX', 'OTHER'];
const EXECUTION_MODES = ['PAPER', 'LIVE', 'SIMULATED'];

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
function toNumber(value) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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
    const rawFeeType = input.feeType ? String(input.feeType).trim().toUpperCase() : 'OTHER';
    const feeType = FEE_TYPES.includes(rawFeeType) ? rawFeeType : 'OTHER';
    const rawMode = String(input.executionMode || 'paper').trim().toUpperCase();
    const executionMode = EXECUTION_MODES.includes(rawMode) ? rawMode : 'PAPER';
    const executionProvider = input.executionProvider ? String(input.executionProvider).trim() : null;

    return repository.transaction(async tx => {
      if (idempotencyKey) {
        const existing = await tx.findTransactionByIdempotencyKey(idempotencyKey);
        if (existing) return existing;
      }
      const portfolio = await tx.ensurePortfolio(userId, code);
      const asset = await tx.ensureAsset(assetInput(source, assetType));
      const holding = await tx.lockHolding(portfolio.id, asset.id, code);
      if (holding.currency !== code) throw new Error('holding_currency_mismatch');

      let transaction;
      if (side === 'BUY') {
        const gross = money(unitPrice.times(quantity));
        const totalCost = money(gross.plus(fee));
        transaction = await tx.createTransaction({
          portfolioId: portfolio.id, holdingId: holding.id, assetId: asset.id,
          type: 'BUY', side: 'BUY', quantity, unitPrice, grossAmount: gross,
          netAmount: totalCost, currency: code, idempotencyKey, occurredAt,
          notes: input.orderNote || null,
          metadata: { acquisitionPriceExplicit: true, ...(currentPrice !== null ? { currentPrice } : {}) },
        });
        if (fee.gt(0)) await tx.createFee({ transactionId: transaction.id, type: feeType, amount: fee, currency: code });
        await tx.createLot({ holdingId: holding.id, sourceTransactionId: transaction.id, quantity, remainingQuantity: quantity, unitCost: money(totalCost.div(quantity)), costBasis: totalCost, currency: code, acquiredAt: occurredAt });
        await tx.refreshHolding(holding.id, currentPrice);
      } else {
        const lots = await tx.listOpenLotsForUpdate(holding.id);
        const available = lots.reduce((sum, lot) => sum.plus(decimal(lot.remainingQuantity)), decimal(0));
        if (available.lt(quantity)) throw new Error('insufficient_inventory');
        const gross = money(unitPrice.times(quantity));
        const net = money(gross.minus(fee));
        transaction = await tx.createTransaction({
          portfolioId: portfolio.id, holdingId: holding.id, assetId: asset.id,
          type: 'SELL', side: 'SELL', quantity, unitPrice, grossAmount: gross,
          netAmount: net, currency: code, idempotencyKey, occurredAt,
          notes: input.orderNote || null,
          metadata: currentPrice !== null ? { currentPrice } : {},
        });
        if (fee.gt(0)) await tx.createFee({ transactionId: transaction.id, type: feeType, amount: fee, currency: code });

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
      }
      await tx.createExecution({
        transactionId: transaction.id, mode: executionMode, providerId: executionProvider,
        status: 'FILLED', requestedQuantity: quantity, filledQuantity: quantity,
        requestedPrice: unitPrice, filledPrice: unitPrice, currency: code,
        submittedAt: occurredAt, completedAt: occurredAt,
      });
      return tx.getTransactionById(transaction.id);
    });
  }

  async function closeTransaction(userId, transactionId, input = {}) {
    const existing = await repository.getTransactionById(transactionId);
    if (!existing) throw new Error('unknown_trade');
    if (existing.type === 'SELL') throw new Error('trade_already_closed');

    const quantity = positive(input.quantity ?? existing.quantity, 'invalid_quantity');
    const salePrice = positive(input.salePrice ?? input.unitPrice ?? (existing.unitPrice ?? existing.metadata?.currentPrice), 'sale_price_required');
    const currentPrice = input.currentPrice === undefined || input.currentPrice === null ? toNumber(salePrice) : nonNegative(input.currentPrice, 'invalid_current_price');
    const orderNote = input.orderNote ? String(input.orderNote) : null;
    const asset = existing.asset || {};
    const closeInput = {
      side: 'SELL',
      quantity,
      salePrice,
      currentPrice: input.currentPrice ?? salePrice,
      currency: input.currency || existing.currency,
      feeAmount: input.feeAmount || 0,
      feeType: input.feeType,
      orderNote,
      idempotencyKey: input.idempotencyKey ? String(input.idempotencyKey) : (existing.idempotencyKey ? `${existing.idempotencyKey}:close` : null),
      executionMode: input.executionMode || 'paper',
      executionProvider: input.executionProvider || null,
      occurredAt: input.occurredAt,
    };

    if (asset.assetType === 'MARKET_INSTRUMENT') {
      const source = {
        ticker: asset.marketInstrument?.ticker || asset.symbol,
        label: asset.name,
        price: toNumber(salePrice),
        desk: asset.marketInstrument?.desk || 'market',
        currency: existing.currency,
      };
      return createTrade(userId, source, closeInput, 'MARKET_INSTRUMENT');
    }
    const source = {
      id: asset.symbol,
      sku: asset.collectible?.sku || asset.symbol,
      name: asset.name,
      brand: asset.collectible?.brand,
      category: asset.collectible?.category,
      family: asset.collectible?.theme,
      price: toNumber(salePrice),
      currency: existing.currency,
    };
    return createTrade(userId, source, closeInput, 'COLLECTIBLE');
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

  async function getPortfolioView(userId) {
    const transactions = await repository.listPortfolioTransactions(userId);
    return transactions.map(tradeViewFromTransaction);
  }

  return {
    closeTransaction,
    createCollectibleTrade: (userId, collectible, input) => createTrade(userId, collectible, input, 'COLLECTIBLE'),
    createMarketTrade: (userId, instrument, input) => createTrade(userId, instrument, input, 'MARKET_INSTRUMENT'),
    getPortfolioState,
    getPortfolioView,
  };
}

function DecimalMin(left, right) { return left.lte(right) ? left : right; }

function tradeViewFromTransaction(transaction) {
  const tx = transaction || {};
  const asset = tx.asset || {};
  const marketInstrument = asset.marketInstrument || null;
  const isMarket = Boolean(marketInstrument) || asset.assetType === 'MARKET_INSTRUMENT';
  const execution = tx.execution || null;
  const isSell = String(tx.type || tx.side || '').toUpperCase() === 'SELL';
  const realizedPnl = Array.isArray(tx.saleAllocations)
    ? tx.saleAllocations.reduce((sum, row) => sum + Number(row.realizedPnl || 0), 0)
    : 0;
  return {
    id: tx.id,
    side: String(tx.side || tx.type || '').toLowerCase(),
    status: isSell ? 'closed' : 'open',
    quantity: toNumber(tx.quantity),
    entryPrice: isSell ? null : toNumber(tx.unitPrice),
    exitPrice: isSell ? toNumber(tx.unitPrice) : null,
    currentPrice: toNumber(tx.metadata?.currentPrice) || toNumber(tx.currentPrice) || toNumber(tx.unitPrice),
    currency: tx.currency || null,
    assetClass: isMarket ? 'market' : 'collectible',
    marketTicker: isMarket ? String(asset.symbol || marketInstrument?.ticker || '') : `COLLECTIBLE:${String(asset.symbol || '')}`,
    ticker: asset.name || asset.symbol || '',
    collectibleId: isMarket ? null : String(asset.symbol || '') || null,
    realizedPnl: money(decimal(realizedPnl)).toNumber(),
    createdAt: tx.occurredAt ? new Date(tx.occurredAt).toISOString() : null,
    updatedAt: tx.updatedAt ? new Date(tx.updatedAt).toISOString() : null,
    closedAt: isSell && tx.occurredAt ? new Date(tx.occurredAt).toISOString() : null,
    orderNote: tx.notes || null,
    executionMode: execution?.mode ? String(execution.mode).toLowerCase() : null,
    executionProvider: execution?.providerId || null,
    executionPair: isMarket ? String(marketInstrument?.ticker || asset.symbol || '') : null,
    remoteStatus: execution?.status ? String(execution.status).toLowerCase() : null,
  };
}

module.exports = { createFinancialService, tradeViewFromTransaction };