const { randomUUID } = require('node:crypto');
const { decimal, money } = require('../services/financial-decimal');

function createMemoryFinancialRepository() {
  const state = {
    users: new Map(), portfolios: new Map(), assets: new Map(), holdings: new Map(), lots: new Map(),
    transactions: new Map(), saleAllocations: new Map(), fees: new Map(), executions: new Map(),
  };
  let chain = Promise.resolve();

  function cloneState() {
    return Object.fromEntries(Object.entries(state).map(([key, value]) => [key, new Map(value)]));
  }
  function restore(snapshot) {
    for (const [key, value] of Object.entries(snapshot)) {
      state[key].clear();
      for (const [id, row] of value) state[key].set(id, row);
    }
  }
  function portfolioFor(userId) {
    return [...state.portfolios.values()].find(item => item.userId === userId);
  }
  function holdingFor(portfolioId, assetId) {
    return [...state.holdings.values()].find(item => item.portfolioId === portfolioId && item.assetId === assetId && item.status === 'OPEN');
  }
  function withRelations(transaction) {
    const saleAllocations = [...state.saleAllocations.values()].filter(item => item.transactionId === transaction.id);
    const execution = [...state.executions.values()].find(item => item.transactionId === transaction.id) || null;
    return { ...transaction, asset: state.assets.get(transaction.assetId) || null, saleAllocations, execution };
  }

  const repo = {
    __state: state,
    addUser(user) { state.users.set(user.id, { ...user }); },
    async transaction(work) {
      const previous = chain;
      let release;
      chain = new Promise(resolve => { release = resolve; });
      await previous;
      const snapshot = cloneState();
      try { return await work(repo); }
      catch (error) { restore(snapshot); throw error; }
      finally { release(); }
    },
    async ensurePortfolio(userId, baseCurrency) {
      if (!state.users.has(userId)) throw new Error('financial_user_not_found');
      let portfolio = portfolioFor(userId);
      if (!portfolio) {
        portfolio = { id: randomUUID(), userId, name: 'Primary Portfolio', baseCurrency };
        state.portfolios.set(portfolio.id, portfolio);
      }
      return portfolio;
    },
    async ensureAsset(input) {
      let asset = [...state.assets.values()].find(item => item.assetType === input.assetType && item.symbol === input.symbol);
      if (!asset) {
        asset = { id: randomUUID(), ...input };
        state.assets.set(asset.id, asset);
      }
      return asset;
    },
    async lockHolding(portfolioId, assetId, currency) {
      let holding = holdingFor(portfolioId, assetId);
      if (!holding) {
        holding = { id: randomUUID(), portfolioId, assetId, status: 'OPEN', quantity: decimal(0), averageCost: decimal(0), costBasis: decimal(0), currentPrice: null, currentValue: null, currency, closedAt: null };
        state.holdings.set(holding.id, holding);
      }
      return holding;
    },
    async findTransactionByIdempotencyKey(key) {
      const row = [...state.transactions.values()].find(item => item.idempotencyKey === key) || null;
      return row ? withRelations(row) : null;
    },
    async getTransactionById(id) {
      const row = state.transactions.get(id) || null;
      return row ? withRelations(row) : null;
    },
    async createTransaction(input) {
      const row = { id: randomUUID(), ...input };
      state.transactions.set(row.id, row);
      return row;
    },
    async createFee(input) {
      const row = { id: randomUUID(), ...input };
      state.fees.set(row.id, row);
      return row;
    },
    async createExecution(input) {
      const row = { id: randomUUID(), ...input };
      state.executions.set(row.id, row);
      return row;
    },
    async createLot(input) {
      const row = { id: randomUUID(), ...input };
      state.lots.set(row.id, row);
      return row;
    },
    async listOpenLotsForUpdate(holdingId) {
      return [...state.lots.values()]
        .filter(item => item.holdingId === holdingId && decimal(item.remainingQuantity).gt(0))
        .sort((a, b) => String(a.acquiredAt).localeCompare(String(b.acquiredAt)) || String(a.id).localeCompare(String(b.id)));
    },
    async createSaleAllocation(input) {
      const row = { id: randomUUID(), ...input };
      state.saleAllocations.set(row.id, row);
      return row;
    },
    async consumeLot(id, quantity) {
      const lot = state.lots.get(id);
      const next = decimal(lot.remainingQuantity).minus(decimal(quantity));
      if (next.lt(0)) throw new Error('insufficient_inventory');
      const updated = { ...lot, remainingQuantity: next };
      state.lots.set(id, updated);
      return updated;
    },
    async refreshHolding(holdingId, suppliedCurrentPrice = null) {
      const holding = state.holdings.get(holdingId);
      const lots = [...state.lots.values()].filter(item => item.holdingId === holdingId && decimal(item.remainingQuantity).gt(0));
      const quantity = lots.reduce((sum, lot) => sum.plus(decimal(lot.remainingQuantity)), decimal(0));
      const costBasis = lots.reduce((sum, lot) => sum.plus(decimal(lot.unitCost).times(decimal(lot.remainingQuantity))), decimal(0));
      const averageCost = quantity.gt(0) ? money(costBasis.div(quantity)) : decimal(0);
      const currentPrice = suppliedCurrentPrice === null ? holding.currentPrice : suppliedCurrentPrice;
      const currentValue = currentPrice === null || currentPrice === undefined ? null : money(decimal(currentPrice).times(quantity));
      const updated = { ...holding, quantity, costBasis: money(costBasis), averageCost, currentPrice, currentValue, closedAt: quantity.eq(0) ? new Date().toISOString() : null };
      state.holdings.set(holdingId, updated);
      return updated;
    },
    async getPortfolioState(userId) {
      const portfolioIds = [...state.portfolios.values()].filter(item => item.userId === userId).map(item => item.id);
      const holdings = [...state.holdings.values()].filter(item => portfolioIds.includes(item.portfolioId) && decimal(item.quantity).gt(0)).map(item => ({ ...item, asset: state.assets.get(item.assetId) }));
      const transactionIds = [...state.transactions.values()].filter(item => portfolioIds.includes(item.portfolioId)).map(item => item.id);
      const saleAllocations = [...state.saleAllocations.values()].filter(item => transactionIds.includes(item.transactionId));
      return { holdings, saleAllocations };
    },
    async listPortfolioTransactions(userId) {
      const portfolioIds = [...state.portfolios.values()].filter(item => item.userId === userId).map(item => item.id);
      return [...state.transactions.values()]
        .filter(item => portfolioIds.includes(item.portfolioId))
        .sort((left, right) => String(right.occurredAt).localeCompare(String(left.occurredAt)))
        .map(withRelations);
    },
  };
  return repo;
}

module.exports = { createMemoryFinancialRepository };
