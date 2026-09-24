const { Prisma } = require('@prisma/client');
const { decimal, money } = require('../services/financial-decimal');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TRANSACTION_INCLUDE = {
  asset: { include: { marketInstrument: true } },
  saleAllocations: true,
  execution: true,
};

function createPostgresFinancialRepository(client, insideTransaction = false) {
  const db = () => typeof client === 'function' ? client() : client;
  async function userDatabaseId(userId) {
    const user = await db().user.findFirst({ where: { OR: [{ legacyId: userId }, ...(UUID.test(String(userId)) ? [{ id: userId }] : [])] }, select: { id: true } });
    if (!user) throw new Error('financial_user_not_found');
    return user.id;
  }
  async function portfolioIds(databaseUserId) {
    const portfolios = await db().portfolio.findMany({ where: { userId: databaseUserId }, select: { id: true } });
    return portfolios.map(item => item.id);
  }
  const repo = {
    async transaction(work) {
      if (insideTransaction) return work(repo);
      let lastError = null;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          return await db().$transaction(tx => work(createPostgresFinancialRepository(tx, true)), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 });
        } catch (error) {
          lastError = error;
          if (error?.code !== 'P2034' && error?.code !== 'P2002' && String(error?.meta?.code) !== '40001') throw error;
        }
      }
      throw lastError;
    },
    async ensurePortfolio(userId, baseCurrency) {
      const databaseUserId = await userDatabaseId(userId);
      const existing = await db().portfolio.findFirst({ where: { userId: databaseUserId }, orderBy: { createdAt: 'asc' } });
      if (existing) return existing;
      return db().portfolio.create({ data: { userId: databaseUserId, name: 'Primary Portfolio', baseCurrency } });
    },
    async ensureAsset(input) {
      const existing = await db().asset.findUnique({ where: { assetType_symbol: { assetType: input.assetType, symbol: input.symbol } }, include: { collectible: true, marketInstrument: true } });
      if (existing) return existing;
      try {
        return await db().asset.create({ data: {
          assetType: input.assetType, symbol: input.symbol, name: input.name, currency: input.currency, metadata: input.metadata,
          ...(input.collectible ? { collectible: { create: input.collectible } } : {}),
          ...(input.marketInstrument ? { marketInstrument: { create: input.marketInstrument } } : {}),
        } });
      } catch (error) {
        if (error?.code === 'P2002') {
          const created = await db().asset.findUnique({ where: { assetType_symbol: { assetType: input.assetType, symbol: input.symbol } }, include: { collectible: true, marketInstrument: true } });
          if (created) return created;
        }
        throw error;
      }
    },
    async lockHolding(portfolioId, assetId, currency) {
      await db().$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${portfolioId}:${assetId}`}::text, 0::bigint))`;
      let holding = await db().holding.findUnique({ where: { portfolioId_assetId_status: { portfolioId, assetId, status: 'OPEN' } } });
      if (!holding) {
        try {
          holding = await db().holding.create({ data: { portfolioId, assetId, status: 'OPEN', quantity: 0, averageCost: 0, costBasis: 0, currency } });
        } catch (error) {
          if (error?.code !== 'P2002') throw error;
          holding = await db().holding.findUnique({ where: { portfolioId_assetId_status: { portfolioId, assetId, status: 'OPEN' } } });
          if (!holding) throw error;
        }
      }
      return holding;
    },
    async findTransactionByIdempotencyKey(key) {
      return db().transaction.findUnique({ where: { idempotencyKey: key }, include: TRANSACTION_INCLUDE });
    },
    async getTransactionById(id) {
      return db().transaction.findUnique({ where: { id }, include: TRANSACTION_INCLUDE });
    },
    async createTransaction(input) { return db().transaction.create({ data: input }); },
    async createFee(input) {
      const rawType = String(input.type || 'OTHER').toUpperCase();
      const type = ['BROKER', 'MARKETPLACE', 'SHIPPING', 'STORAGE', 'TAX', 'OTHER'].includes(rawType) ? rawType : 'OTHER';
      return db().fee.create({ data: { ...input, type } });
    },
    async createExecution(input) {
      return db().execution.create({ data: {
        transactionId: input.transactionId,
        mode: String(input.mode || 'PAPER').toUpperCase(),
        providerId: input.providerId ?? null,
        status: String(input.status || 'FILLED').toUpperCase(),
        requestedQuantity: input.requestedQuantity ?? null,
        filledQuantity: input.filledQuantity ?? null,
        requestedPrice: input.requestedPrice ?? null,
        filledPrice: input.filledPrice ?? null,
        currency: input.currency ?? null,
        failureReason: input.failureReason ?? null,
        submittedAt: input.submittedAt ?? null,
        completedAt: input.completedAt ?? null,
      } });
    },
    async createLot(input) { return db().holdingLot.create({ data: input }); },
    async listOpenLotsForUpdate(holdingId) {
      await db().$queryRaw`SELECT id FROM "HoldingLot" WHERE "holdingId" = ${holdingId}::uuid AND "remainingQuantity" > 0 ORDER BY "acquiredAt" ASC, "createdAt" ASC, id ASC FOR UPDATE`;
      return db().holdingLot.findMany({ where: { holdingId, remainingQuantity: { gt: 0 } }, orderBy: [{ acquiredAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] });
    },
    async createSaleAllocation(input) { return db().saleAllocation.create({ data: input }); },
    async consumeLot(id, quantity) {
      const lot = await db().holdingLot.findUnique({ where: { id } });
      const next = decimal(lot.remainingQuantity).minus(decimal(quantity));
      if (next.lt(0)) throw new Error('insufficient_inventory');
      return db().holdingLot.update({ where: { id }, data: { remainingQuantity: next } });
    },
    async refreshHolding(holdingId, suppliedCurrentPrice = null) {
      const holding = await db().holding.findUnique({ where: { id: holdingId } });
      const lots = await db().holdingLot.findMany({ where: { holdingId, remainingQuantity: { gt: 0 } } });
      const quantity = lots.reduce((sum, lot) => sum.plus(decimal(lot.remainingQuantity)), decimal(0));
      const costBasis = lots.reduce((sum, lot) => sum.plus(decimal(lot.unitCost).times(decimal(lot.remainingQuantity))), decimal(0));
      const averageCost = quantity.gt(0) ? money(costBasis.div(quantity)) : decimal(0);
      const currentPrice = suppliedCurrentPrice === null ? holding.currentPrice : suppliedCurrentPrice;
      const currentValue = currentPrice === null || currentPrice === undefined ? null : money(decimal(currentPrice).times(quantity));
      return db().holding.update({ where: { id: holdingId }, data: {
        quantity, costBasis: money(costBasis), averageCost, currentPrice,
        currentValue, ...(quantity.eq(0) ? { closedAt: new Date() } : { closedAt: null }),
      } });
    },
    async listPortfolioTransactions(userId) {
      const databaseUserId = await userDatabaseId(userId);
      const ids = await portfolioIds(databaseUserId);
      if (!ids.length) return [];
      return db().transaction.findMany({
        where: { portfolioId: { in: ids } },
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
        include: TRANSACTION_INCLUDE,
      });
    },
    async getPortfolioState(userId) {
      const databaseUserId = await userDatabaseId(userId);
      const ids = await portfolioIds(databaseUserId);
      if (!ids.length) return { holdings: [], saleAllocations: [] };
      const holdings = await db().holding.findMany({ where: { portfolioId: { in: ids }, quantity: { gt: 0 } }, include: { asset: true } });
      const saleAllocations = await db().saleAllocation.findMany({ where: { transaction: { portfolioId: { in: ids } } } });
      return { holdings, saleAllocations };
    },
  };
  return repo;
}

module.exports = { createPostgresFinancialRepository };