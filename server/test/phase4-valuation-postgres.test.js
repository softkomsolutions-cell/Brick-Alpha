const test = require('node:test');
const assert = require('node:assert/strict');
const { createPostgresValuationRepository } = require('../repositories/postgresValuationRepository');

const assetId = 'phase4-asset-a';
const valuationId = 'val-1';
const assessmentId = 'assess-1';
const evidenceId = 'ev-1';

function evidenceRow(input) {
  return { id: evidenceId, valuationId, kind: 'CURRENT_PRICE', sourceUrl: 's://mock/1', sourceLabel: 'Mock', provider: 'mock', observedAt: input.observedAt ?? null, salePrice: 120, currency: 'ZAR', condition: 'sealed', notes: null, rawPayload: { stub: true } };
}

test('Postgres valuation creates persist the provider-attributed evidence column', async () => {
  const queries = [];
  const client = {
    valuation: { create: async query => { queries.push(['valuation', query.data]); return { id: valuationId, ...query.data }; } },
    valuationEvidence: { create: async query => { queries.push(['evidence', query.data]); return { id: evidenceId, ...query.data }; } },
  };
  const repo = createPostgresValuationRepository(client);
  await repo.createValuation({ assetId, source: 'mock', status: 'FRESH', value: 120, currency: 'ZAR', confidence: 74, asOf: new Date('2026-09-15T00:00:00.000Z'), metadata: { modelVersion: 'brick-alpha-v1' } });
  await repo.createValuationEvidence({ valuationId, kind: 'CURRENT_PRICE', sourceUrl: 's://mock/1', sourceLabel: 'Mock', provider: 'mock', observedAt: new Date('2026-09-15T00:00:00.000Z'), salePrice: 120, currency: 'ZAR', condition: 'sealed', rawPayload: { stub: true } });
  assert.deepEqual(queries[0][0], 'valuation');
  assert.equal(queries[0][1].assetId, assetId);
  assert.equal(queries[0][1].metadata.modelVersion, 'brick-alpha-v1');
  assert.equal(queries[1][0], 'evidence');
  assert.equal(queries[1][1].provider, 'mock');
  assert.equal(queries[1][1].valuationId, valuationId);
  assert.equal(queries[1][1].kind, 'CURRENT_PRICE');
  assert.equal(queries[1][1].currency, 'ZAR');
});

test('Postgres assessment creation persists factorScores, breakdown, and model version', async () => {
  let data;
  const client = { brickAlphaAssessment: { create: async query => { data = query.data; return { id: assessmentId, ...query.data }; } } };
  const repo = createPostgresValuationRepository(client);
  await repo.createAssessment({ valuationId, assetId, modelVersion: 'brick-alpha-v1', score: 78, grade: 'Strong Buy', recommendation: 'BUY', confidence: 74, factorScores: [{ factor: 'age' }], breakdown: { displayGroups: [], boundedConfidence: 74 } });
  assert.equal(data.modelVersion, 'brick-alpha-v1');
  assert.equal(data.score, 78);
  assert.equal(data.recommendation, 'BUY');
  assert.deepEqual(data.factorScores, [{ factor: 'age' }]);
  assert.deepEqual(data.breakdown.displayGroups, []);
  assert.equal(data.breakdown.boundedConfidence, 74);
});

test('Postgres latest/list valuation queries order by asOf new-to-old and include ordered evidence', async () => {
  const queries = [];
  const rows = [{ id: valuationId, assetId, status: 'FRESH', value: 120, currency: 'ZAR', createdAt: new Date(0), asOf: new Date('2026-09-15T00:00:00.000Z'), evidence: [evidenceRow({})] }];
  const client = {
    valuation: { findMany: async query => { queries.push(['many', query]); return rows; }, findFirst: async query => { queries.push(['first', query]); return rows[0]; } },
  };
  const repo = createPostgresValuationRepository(client);
  const history = await repo.listValuationsByAsset(assetId);
  assert.equal(history.length, 1);
  assert.deepEqual(queries[0][1].orderBy, [{ asOf: 'asc' }, { createdAt: 'asc' }]);
  assert.deepEqual(queries[0][1].include.evidence.orderBy, { createdAt: 'asc' });

  const latest = await repo.getLatestValuation(assetId);
  assert.equal(latest.id, valuationId);
  assert.deepEqual(queries[1][1].where, { assetId });
  assert.deepEqual(queries[1][1].orderBy, [{ asOf: 'desc' }, { createdAt: 'desc' }]);
  assert.deepEqual(queries[1][1].include.evidence.orderBy, { createdAt: 'asc' });
});

test('Postgres latest/list assessment queries order chronologically', async () => {
  const queries = [];
  const rows = [{ id: assessmentId, assetId, modelVersion: 'brick-alpha-v1', score: 78, recommendation: 'BUY' }];
  const client = {
    brickAlphaAssessment: { findMany: async query => { queries.push(['many', query]); return rows; }, findFirst: async query => { queries.push(['first', query]); return rows[0]; } },
  };
  const repo = createPostgresValuationRepository(client);
  const history = await repo.listAssessmentsByAsset(assetId);
  assert.equal(history.length, 1);
  assert.deepEqual(queries[0][1].orderBy, [{ createdAt: 'asc' }, { id: 'asc' }]);

  const latest = await repo.getLatestAssessment(assetId);
  assert.equal(latest.id, assessmentId);
  assert.deepEqual(queries[1][1].orderBy, [{ createdAt: 'desc' }, { id: 'desc' }]);
});

test('Postgres valuation transactions are serializable and retried only on known conflict codes', async () => {
  let attempts = 0;
  let opCount = 0;
  const client = {
    $transaction: async (work, options) => {
      assert.equal(options.isolationLevel, 'Serializable');
      attempts += 1;
      if (attempts === 1) throw Object.assign(new Error('conflict'), { code: 'P2034' });
      return work(client);
    },
  };
  const repo = createPostgresValuationRepository(client);
  const value = await repo.transaction(async tx => { opCount += 1; return 'committed'; });
  assert.equal(value, 'committed');
  assert.equal(attempts, 2);
  assert.equal(opCount, 1);

  let nonRetryableAttempts = 0;
  const failing = { $transaction: async () => { nonRetryableAttempts += 1; throw Object.assign(new Error('boom'), { code: 'P2025' }); } };
  const failingRepo = createPostgresValuationRepository(failing);
  await assert.rejects(failingRepo.transaction(async () => {}), /boom/);
  assert.equal(nonRetryableAttempts, 1);
});

test('Postgres inside-transaction reads resolve the client thunk and include ordered evidence', async () => {
  let getValuationQuery;
  const rows = { id: valuationId, assetId, status: 'FRESH', value: 120, evidence: [evidenceRow({})] };
  const client = {
    valuation: { findUnique: async query => { getValuationQuery = query; return rows; } },
  };
  const repo = createPostgresValuationRepository(client, true);
  const valuation = await repo.getValuationById(valuationId);
  assert.equal(valuation.id, valuationId);
  assert.deepEqual(getValuationQuery, { where: { id: valuationId }, include: { evidence: { orderBy: { createdAt: 'asc' } } } });
});

test('Postgres asset lookup includes the collectible join', async () => {
  let query;
  const client = { asset: { findUnique: async value => { query = value; return { id: assetId, collectible: { symbol: 'LEGO-X' } }; } } };
  const repo = createPostgresValuationRepository(client);
  const asset = await repo.findAssetById(assetId);
  assert.equal(asset.collectible.symbol, 'LEGO-X');
  assert.deepEqual(query, { where: { id: assetId }, include: { collectible: true } });
});