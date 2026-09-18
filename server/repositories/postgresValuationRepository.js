const { Prisma } = require('@prisma/client');

function createPostgresValuationRepository(client, insideTransaction = false) {
  const db = () => typeof client === 'function' ? client() : client;
  const repo = {
    async transaction(work) {
      if (insideTransaction) return work(repo);
      let lastError = null;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          return await db().$transaction(
            tx => work(createPostgresValuationRepository(tx, true)),
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 },
          );
        } catch (error) {
          lastError = error;
          if (error?.code !== 'P2034' && error?.code !== 'P2002' && String(error?.meta?.code) !== '40001') throw error;
        }
      }
      throw lastError;
    },
    async findAssetById(assetId) {
      return db().asset.findUnique({ where: { id: assetId }, include: { collectible: true } }) || null;
    },
    async createValuation(input) {
      return db().valuation.create({ data: {
        assetId: input.assetId,
        source: input.source,
        providerRecordId: input.providerRecordId ?? null,
        status: input.status ?? 'FRESH',
        value: input.value,
        currency: input.currency,
        confidence: input.confidence ?? null,
        asOf: input.asOf,
        rawPayload: input.rawPayload ?? null,
        metadata: input.metadata ?? null,
      } });
    },
    async createValuationEvidence(input) {
      return db().valuationEvidence.create({ data: {
        valuationId: input.valuationId,
        kind: input.kind,
        sourceUrl: input.sourceUrl ?? null,
        sourceLabel: input.sourceLabel ?? null,
        provider: input.provider ?? null,
        observedAt: input.observedAt ?? null,
        salePrice: input.salePrice ?? null,
        currency: input.currency ?? null,
        condition: input.condition ?? null,
        notes: input.notes ?? null,
        rawPayload: input.rawPayload ?? null,
      } });
    },
    async createAssessment(input) {
      return db().brickAlphaAssessment.create({ data: {
        valuationId: input.valuationId ?? null,
        assetId: input.assetId,
        modelVersion: input.modelVersion,
        score: input.score,
        grade: input.grade ?? null,
        recommendation: input.recommendation,
        confidence: input.confidence ?? null,
        estimatedRoi: input.estimatedRoi ?? null,
        projectedRoi: input.projectedRoi ?? null,
        retirementStatus: input.retirementStatus ?? null,
        retirementProbability: input.retirementProbability ?? null,
        factorScores: input.factorScores,
        breakdown: input.breakdown ?? null,
      } });
    },
    async getValuationById(id) {
      return db().valuation.findUnique({ where: { id }, include: { evidence: { orderBy: { createdAt: 'asc' } } } });
    },
    async listValuationsByAsset(assetId) {
      return db().valuation.findMany({
        where: { assetId },
        orderBy: [{ asOf: 'asc' }, { createdAt: 'asc' }],
        include: { evidence: { orderBy: { createdAt: 'asc' } } },
      });
    },
    async getLatestValuation(assetId) {
      return db().valuation.findFirst({
        where: { assetId },
        orderBy: [{ asOf: 'desc' }, { createdAt: 'desc' }],
        include: { evidence: { orderBy: { createdAt: 'asc' } } },
      });
    },
    async getAssessmentById(id) {
      return db().brickAlphaAssessment.findUnique({ where: { id } });
    },
    async listAssessmentsByAsset(assetId) {
      return db().brickAlphaAssessment.findMany({
        where: { assetId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
    },
    async getLatestAssessment(assetId) {
      return db().brickAlphaAssessment.findFirst({
        where: { assetId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
    },
    async listEvidenceByValuationId(valuationId) {
      return db().valuationEvidence.findMany({ where: { valuationId }, orderBy: { createdAt: 'asc' } });
    },
  };
  return repo;
}

module.exports = { createPostgresValuationRepository };