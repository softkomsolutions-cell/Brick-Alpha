// Synthetic PostgreSQL valuation checks. A unique synthetic asset, collectible, valuations, and
// assessments are removed in cleanup. Only the in-process deterministic mock provider is exercised.
// Named checkpoints report the exact validation STEP that failed (cleanup never overwrites it).
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { getPrismaClient, disconnectPrisma } = require('../db/prisma-client');
const { readValuationConfig } = require('../config/valuation');
const { createProviderRegistry } = require('../services/valuation/providers');
const { createMockProvider } = require('../services/valuation/providers/mockProvider');
const { createPostgresValuationRepository } = require('../repositories/postgresValuationRepository');
const { createValuationService } = require('../services/valuation-service');

const SANITY_ONLY = process.argv.includes('--sanity-only');
const SAFE_FIELD = /^[A-Z0-9_]+$/;

let currentStep = 'validate-start';

function step(name) {
  currentStep = name;
  console.log(`STEP ${name}`);
}

function assetRows(marker) {
  return {
    asset: {
      assetType: 'COLLECTIBLE',
      symbol: `phase4-${marker}`,
      name: 'Phase 4 synthetic set',
      currency: 'ZAR',
      metadata: { synthetic: true },
    },
    collectible: {
      brand: 'Synthetic',
      category: 'Validation',
      theme: 'Staging',
      sku: `phase4-${marker}`,
      condition: 'sealed',
      expectedRetirementDate: new Date('2028-12-31T00:00:00.000Z'),
    },
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
  console.error('FAIL staging valuation validation');
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

function providerWithMode(mode) {
  const provider = createMockProvider({ mode });
  return { fetchAll: async (asset, context) => [await provider.fetchPriceEvidence({ asset, ...context })] };
}

function assetInput(assetId) {
  return {
    id: assetId,
    symbol: assetId,
    name: 'Phase 4 synthetic set',
    brand: 'Synthetic',
    category: 'Validation',
    theme: 'Staging',
    retailPrice: 100,
    buyPrice: 80,
    expectedRetirementDate: '2028-12-31',
  };
}

async function validate(client) {
  const marker = crypto.randomUUID();
  const { asset: assetSeed, collectible: collectibleSeed } = assetRows(marker);
  let assetId = null;
  try {
    step('raw-sanity');
    await client.$queryRaw`SELECT 1 AS ok`;
    console.log('PASS raw category');

    step('provider-column-applied');
    const providerColumn = await client.$queryRawUnsafe(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'ValuationEvidence' AND column_name = 'provider'`,
    );
    assert.ok(providerColumn.length === 1, 'phase4 migration must add ValuationEvidence.provider');
    console.log('PASS phase4_valuation_domain migration applied (ValuationEvidence.provider exists)');

    if (SANITY_ONLY) {
      currentStep = 'sanity-complete';
      return;
    }

    step('seed-synthetic-asset');
    const createdAsset = await client.asset.create({
      data: {
        ...assetSeed,
        collectible: { create: collectibleSeed },
      },
      include: { collectible: true },
    });
    assetId = createdAsset.id;

    const config = readValuationConfig({
      VALUATION_PERSISTENCE_MODE: 'postgres',
      DATABASE_URL: process.env.DATABASE_URL,
    });
    assert.equal(config.modelVersion, 'brick-alpha-v1');
    const repository = createPostgresValuationRepository(() => client);
    const service = createValuationService({ repository, config, providers: createProviderRegistry({ config }) });

    step('recalculate-ok');
    const firstAsOf = '2026-09-15T00:00:00.000Z';
    const first = await service.recalculate({ assetId, asset: assetInput(assetId), asOf: firstAsOf });
    assert.equal(first.created, true);
    assert.equal(first.status, 'FRESH');
    assert.equal(first.modelVersion, 'brick-alpha-v1');
    assert.deepEqual(first.providers, [{ name: 'mock', available: true, error: null }]);
    assert.equal(first.valuation.status, 'FRESH');
    assert.equal(first.valuation.currency, 'ZAR');
    assert.equal(first.valuation.source, 'mock');
    assert.ok(Number(first.valuation.value) > 0);
    assert.ok(first.evidence.length >= 1);
    assert.ok(first.evidence.every((entry) => entry.provider === 'mock'), 'mock evidence is provider-attributed');
    assert.equal(first.assessment.modelVersion, 'brick-alpha-v1');
    assert.equal(first.assessment.assetId, assetId);
    assert.ok(Array.isArray(first.assessment.factorScores) && first.assessment.factorScores.length);
    assert.ok(first.assessment.breakdown && Array.isArray(first.assessment.breakdown.displayGroups));
    assert.ok('evidenceSignal' in (first.assessment.breakdown || {}));
    assert.ok('boundedConfidence' in (first.assessment.breakdown || {}));
    assert.ok(Number(first.assessment.confidence) > 0);
    console.log('PASS recalculate persists FRESH valuation, provider-attributed evidence, and brick-alpha-v1 assessment');

    step('recalculate-append-only');
    const secondAsOf = '2026-09-16T00:00:00.000Z';
    const second = await service.recalculate({ assetId, asset: assetInput(assetId), asOf: secondAsOf });
    assert.equal(second.created, true);
    assert.notEqual(second.valuation.id, first.valuation.id);
    assert.notEqual(second.assessment.id, first.assessment.id);
    const persistedFirst = await repository.getValuationById(first.valuation.id);
    assert.deepEqual(
      JSON.parse(JSON.stringify({ status: persistedFirst.status, value: String(persistedFirst.value), currency: persistedFirst.currency, metadata: persistedFirst.metadata })),
      JSON.parse(JSON.stringify({ status: first.valuation.status, value: String(first.valuation.value), currency: first.valuation.currency, metadata: first.valuation.metadata })),
      'first valuation row must remain bit-identical after a later recalculate',
    );
    const history = await service.getValuationHistory(assetId);
    assert.equal(history.length, 2);
    assert.ok(history[0].evidence.length >= 1);
    assert.ok(history[0].evidence.every((entry) => entry.provider === 'mock'), 'history includes provider-attributed evidence');
    const latest = await service.getValuation(assetId);
    assert.equal(latest.id, second.valuation.id);
    const assessmentHistory = await service.getAssessmentHistory(assetId);
    assert.equal(assessmentHistory.length, 2);
    assert.ok(assessmentHistory.every((item) => item.modelVersion === 'brick-alpha-v1'));
    assert.ok(assessmentHistory.every((item) => item.breakdown && 'boundedConfidence' in item.breakdown), 'boundedConfidence JSON survives an assessment round trip');
    assert.ok(assessmentHistory.every((item) => item.breakdown && 'evidenceSignal' in item.breakdown), 'evidenceSignal JSON survives an assessment round trip');
    console.log('PASS recalculate is append-only: first valuation and assessment rows unchanged, history is chronological and versioned');

    step('degraded-aged');
    const agedConfig = readValuationConfig({
      VALUATION_PERSISTENCE_MODE: 'postgres',
      DATABASE_URL: process.env.DATABASE_URL,
      VALUATION_MOCK_PROVIDER_MODE: 'stale',
    });
    const agedService = createValuationService({ repository, config: agedConfig, providers: { fetchAll: providerWithMode('stale').fetchAll } });
    const aged = await agedService.recalculate({ assetId, asset: assetInput(assetId), asOf: '2026-09-17T00:00:00.000Z' });
    assert.equal(aged.created, true);
    assert.equal(aged.status, 'REVIEW_REQUIRED');
    assert.equal(aged.valuation.status, 'REVIEW_REQUIRED');
    console.log('PASS aged mock evidence maps to REVIEW_REQUIRED while still persisting an editable, honest valuation');

    step('degraded-unavailable');
    const beforeUnavailable = await client.valuation.count({ where: { assetId } });
    const failingService = createValuationService({ repository, config, providers: { fetchAll: providerWithMode('fail').fetchAll } });
    const unavailable = await failingService.recalculate({ assetId, asset: assetInput(assetId), asOf: '2026-09-18T00:00:00.000Z' });
    assert.equal(unavailable.created, false);
    assert.equal(unavailable.status, 'UNAVAILABLE');
    assert.equal(unavailable.reason, 'no_evidence');
    assert.equal(await client.valuation.count({ where: { assetId } }), beforeUnavailable, 'UNAVAILABLE recalculate persists nothing');
    console.log('PASS unavailable provider yields UNAVAILABLE with no rows fabricated or persisted');

    step('validate-complete');
    const totalValuations = await client.valuation.count({ where: { assetId } });
    const totalAssessments = await client.brickAlphaAssessment.count({ where: { assetId } });
    const totalEvidence = await client.valuationEvidence.count({ where: { valuation: { assetId } } });
    assert.equal(totalValuations, 3);
    assert.equal(totalAssessments, 3);
    assert.ok(totalEvidence >= 3);
    const providerAttributed = await client.valuationEvidence.count({ where: { valuation: { assetId }, provider: { not: null } } });
    assert.equal(providerAttributed, totalEvidence);
    console.log('PASS PostgreSQL valuations, evidence, and assessments persisted with provider attribution and versioning');

    console.log('PASS synthetic PostgreSQL valuation domain validated end-to-end with the deterministic mock provider only');
  } finally {
    console.log('CLEANUP-STARTED');
    if (assetId) {
      await client.brickAlphaAssessment.deleteMany({ where: { assetId } }).catch(() => undefined);
      await client.valuation.deleteMany({ where: { assetId } }).catch(() => undefined);
      await client.collectible.deleteMany({ where: { assetId } }).catch(() => undefined);
      await client.asset.deleteMany({ where: { id: assetId } }).catch(() => undefined);
      assert.equal(await client.valuation.count({ where: { assetId } }), 0, `valuation cleanup failed (${currentStep})`);
      assert.equal(await client.asset.count({ where: { id: assetId } }), 0, `asset cleanup failed (${currentStep})`);
    }
    console.log('PASS synthetic staging valuation data removed');
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