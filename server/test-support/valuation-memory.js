const { randomUUID } = require('node:crypto');

function createMemoryValuationRepository() {
  const state = {
    valuations: new Map(),
    evidence: new Map(),
    assessments: new Map(),
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

  const now = () => new Date().toISOString();

  const repo = {
    __state: state,
    async reset() {
      const previous = chain;
      let release;
      chain = new Promise(resolve => { release = resolve; });
      await previous;
      for (const key of Object.keys(state)) state[key].clear();
      release();
    },
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
    async createValuation(input) {
      const row = {
        id: randomUUID(),
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
        createdAt: input.createdAt ?? now(),
        updatedAt: input.updatedAt ?? now(),
      };
      state.valuations.set(row.id, row);
      return row;
    },
    async createValuationEvidence(input) {
      const row = {
        id: randomUUID(),
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
        createdAt: input.createdAt ?? now(),
      };
      state.evidence.set(row.id, row);
      return row;
    },
    async createAssessment(input) {
      const row = {
        id: randomUUID(),
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
        createdAt: input.createdAt ?? now(),
        updatedAt: input.updatedAt ?? now(),
      };
      state.assessments.set(row.id, row);
      return row;
    },
    async findAssetById() { return null; },
    async getValuationById(id) {
      const row = state.valuations.get(id) || null;
      return row ? { ...row, evidence: [...state.evidence.values()].filter(item => item.valuationId === id) } : null;
    },
    async listValuationsByAsset(assetId) {
      const rows = [...state.valuations.values()]
        .filter(item => item.assetId === assetId)
        .sort((left, right) => String(left.asOf).localeCompare(String(right.asOf)) || String(left.createdAt).localeCompare(String(right.createdAt)));
      return rows.map(row => ({ ...row, evidence: [...state.evidence.values()].filter(item => item.valuationId === row.id) }));
    },
    async getLatestValuation(assetId) {
      const list = await repo.listValuationsByAsset(assetId);
      return list.length ? list[list.length - 1] : null;
    },
    async getAssessmentById(id) {
      const row = state.assessments.get(id) || null;
      return row ? { ...row } : null;
    },
    async listAssessmentsByAsset(assetId) {
      return [...state.assessments.values()]
        .filter(item => item.assetId === assetId)
        .sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)) || String(left.id).localeCompare(String(right.id)));
    },
    async getLatestAssessment(assetId) {
      const list = await repo.listAssessmentsByAsset(assetId);
      return list.length ? list[list.length - 1] : null;
    },
  };
  return repo;
}

module.exports = { createMemoryValuationRepository };