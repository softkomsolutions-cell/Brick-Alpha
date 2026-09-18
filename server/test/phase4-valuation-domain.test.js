const test = require("node:test");
const assert = require("node:assert/strict");

const { readValuationConfig } = require("../config/valuation");
const { safeNormalizePrice, currencyCode } = require("../services/valuation/currency");
const { createProviderRegistry } = require("../services/valuation/providers");
const { createValuationService, modelInputFromAsset } = require("../services/valuation-service");
const { createMemoryValuationRepository } = require("../test-support/valuation-memory");
const model = require("../services/brick-alpha-model");

const ASSET = {
  id: "phase4-asset-a",
  symbol: "LEGO-PHASE4-A",
  name: "Phase Four Test Set",
  brand: "LEGO",
  category: "LEGO Icons",
  theme: "Icons",
  retailPrice: 100,
  buyPrice: 80,
  expectedRetirementDate: "2028-12-31",
};
const AS_OF = "2026-09-15T00:00:00.000Z";

function defaultConfig() {
  return readValuationConfig({});
}
function makeService({ providers } = {}) {
  const config = defaultConfig();
  const repository = createMemoryValuationRepository();
  const registry = providers || createProviderRegistry({ config });
  return {
    config,
    repository,
    service: createValuationService({ repository, config, providers: registry }),
  };
}

test("valuation config defaults and validation", () => {
  const config = defaultConfig();
  assert.equal(config.mode, "legacy");
  assert.equal(config.displayCurrency, "ZAR");
  assert.equal(config.modelVersion, "brick-alpha-v1");
  assert.deepEqual(config.providers, ["mock"]);
  assert.throws(() => readValuationConfig({ VALUATION_PERSISTENCE_MODE: "postgres" }), /database_valuation_requires_DATABASE_URL/);
  assert.throws(() => readValuationConfig({ VALUATION_PERSISTENCE_MODE: "surprise" }), /invalid_valuation_persistence_mode/);
  assert.throws(() => readValuationConfig({ VALUATION_CURRENCY_RATES: "{not json" }), /invalid_valuation_currency_rates/);
  assert.throws(() => readValuationConfig({ VALUATION_DISPLAY_CURRENCY: "ZZ" }), /invalid_valuation_display_currency/);
  assert.equal(readValuationConfig({ VALUATION_PERSISTENCE_MODE: "postgres", DATABASE_URL: "postgresql://x/db" }).mode, "postgres");
  assert.equal(readValuationConfig({ VALUATION_CURRENCY_RATES: '{"USD_ZAR":17.5}' }).rates.USD_ZAR, 17.5);
});

test("currency normalization never fabricates missing conversions", () => {
  assert.deepEqual(safeNormalizePrice({ amount: 100, sourceCurrency: "ZAR", displayCurrency: "ZAR" }).conversion, "as-is");
  const converted = safeNormalizePrice({ amount: 10, sourceCurrency: "USD", displayCurrency: "ZAR", rates: { USD_ZAR: 17.5 } });
  assert.equal(converted.conversion, "converted");
  assert.equal(converted.normalizedAmount, 175);
  const unavailable = safeNormalizePrice({ amount: 10, sourceCurrency: "USD", displayCurrency: "ZAR", rates: {} });
  assert.equal(unavailable.conversion, "unavailable");
  assert.equal(unavailable.normalizedAmount, null);
  assert.equal(unavailable.reason, "missing_rate_USD_ZAR");
  assert.throws(() => currencyCode("US"), /invalid_currency/);
});

test("N: fresh recalculate persists valuation, evidence with provider, and versioned assessment", async () => {
  const { service, repository } = makeService();
  const outcome = await service.recalculate({ assetId: ASSET.id, asset: ASSET, asOf: AS_OF });
  assert.equal(outcome.created, true);
  assert.equal(outcome.status, "FRESH");
  assert.equal(outcome.modelVersion, "brick-alpha-v1");
  assert.ok(outcome.valuation.id);
  assert.ok(outcome.assessment.id);
  assert.equal(outcome.valuation.status, "FRESH");
  assert.equal(outcome.valuation.assetId, ASSET.id);
  assert.equal(outcome.valuation.source, "mock");
  assert.equal(outcome.valuation.metadata.modelVersion, "brick-alpha-v1");
  assert.ok(outcome.evidence.length >= 1);
  for (const entry of outcome.evidence) {
    assert.equal(entry.provider, "mock");
    assert.ok(entry.kind);
    assert.ok(entry.sourceUrl);
    assert.ok(entry.salePrice !== null);
    assert.ok(entry.observedAt);
    assert.ok(entry.rawPayload !== null);
  }
  assert.equal(outcome.assessment.modelVersion, "brick-alpha-v1");
  assert.equal(outcome.assessment.assetId, ASSET.id);
  assert.equal(outcome.assessment.recommendation, model.enrichBrickAlphaCollectible(modelInputFromAsset(ASSET, outcome.valuation.value), new Date(AS_OF)).recommendation);
  assert.equal(outcome.assessment.confidence, model.confidenceFor(model.enrichBrickAlphaCollectible(modelInputFromAsset(ASSET, outcome.valuation.value), new Date(AS_OF))));
  assert.ok(Array.isArray(outcome.assessment.factorScores));
  assert.ok(outcome.assessment.breakdown.displayGroups.length >= 1);

  const latest = await service.getValuation(ASSET.id);
  assert.equal(latest.id, outcome.valuation.id);
  assert.ok(latest.evidence.length >= 1);
  const history = await service.getValuationHistory(ASSET.id);
  assert.equal(history.length, 1);
  const assessmentHistory = await service.getAssessmentHistory(ASSET.id);
  assert.equal(assessmentHistory.length, 1);
  assert.ok(repository.__state.valuations.size === 1);
  assert.ok(repository.__state.assessments.size === 1);
});

test("O/P/Q/X: append-only valuation and assessment history preserves earlier rows", async () => {
  const { service, repository } = makeService();
  const first = await service.recalculate({ assetId: ASSET.id, asset: ASSET, asOf: AS_OF });
  const firstValuationRow = repository.__state.valuations.get(first.valuation.id);
  const firstAssessmentRow = repository.__state.assessments.get(first.assessment.id);
  const before = JSON.parse(JSON.stringify({ value: firstValuationRow, score: firstAssessmentRow }));

  const second = await service.recalculate({ assetId: ASSET.id, asset: ASSET, asOf: AS_OF });
  assert.notEqual(second.valuation.id, first.valuation.id);
  assert.notEqual(second.assessment.id, first.assessment.id);
  assert.equal(first.status, "FRESH");

  assert.deepEqual(JSON.parse(JSON.stringify({ value: firstValuationRow, score: firstAssessmentRow })), before, "first rows must be bit-for-bit unchanged");
  assert.equal(repository.__state.valuations.size, 2);
  assert.equal(repository.__state.assessments.size, 2);

  const history = await service.getValuationHistory(ASSET.id);
  assert.equal(history.length, 2);
  assert.equal(history[0].id, first.valuation.id);
  assert.equal(history[1].id, second.valuation.id);

  const assessments = await service.getAssessmentHistory(ASSET.id);
  assert.equal(assessments.length, 2);
  assert.ok(assessments.every(item => item.modelVersion === "brick-alpha-v1"));
  assert.equal((await service.getValuation(ASSET.id)).id, second.valuation.id);
  await service.recalculate({ assetId: ASSET.id, asset: ASSET, asOf: AS_OF });
  assert.equal((await service.getAssessmentHistory(ASSET.id)).length, 3);
  assert.equal((await service.getValuationHistory(ASSET.id)).length, 3);
});

test("R: unavailable provider returns UNAVAILABLE and persists nothing", async () => {
  const { service, repository } = makeService({
    providers: { fetchAll: async () => [{ provider: "mock", available: false, evidence: [], price: null, error: "mock_down" }] },
  });
  const outcome = await service.recalculate({ assetId: ASSET.id, asset: ASSET });
  assert.equal(outcome.created, false);
  assert.equal(outcome.status, "UNAVAILABLE");
  assert.equal(outcome.reason, "no_evidence");
  assert.equal(repository.__state.valuations.size, 0);
  assert.equal(repository.__state.assessments.size, 0);
  assert.equal(await service.getValuation(ASSET.id), null);
});

test("U: provider timeout is contained and reported without raising", async () => {
  const { service, repository } = makeService({
    providers: { fetchAll: async () => { throw new Error("timeout_after_8000ms"); } },
  });
  const outcome = await service.recalculate({ assetId: ASSET.id, asset: ASSET });
  assert.equal(outcome.status, "UNAVAILABLE");
  assert.equal(outcome.created, false);
  assert.deepEqual(outcome.providers[0], { name: "error", available: false, error: "timeout_after_8000ms" });
  assert.equal(repository.__state.valuations.size, 0);
});

test("S: stale and critically-stale evidence map to STALE and REVIEW_REQUIRED", async () => {
  const { service } = makeService();
  const stale = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const staleOutcome = await service.recalculate({
    assetId: ASSET.id,
    asset: ASSET,
    evidenceInputs: [{ kind: "CURRENT_PRICE", salePrice: 88, currency: "ZAR", observedAt: stale, sourceUrl: "s://x", sourceLabel: "X" }],
  });
  assert.equal(staleOutcome.status, "STALE");
  assert.equal(staleOutcome.valuation.status, "STALE");

  const ancient = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
  const ancientOutcome = await service.recalculate({
    assetId: ASSET.id,
    asset: ASSET,
    evidenceInputs: [{ kind: "CURRENT_PRICE", salePrice: 88, currency: "ZAR", observedAt: ancient, sourceUrl: "s://x", sourceLabel: "X" }],
  });
  assert.equal(ancientOutcome.status, "REVIEW_REQUIRED");
  assert.equal(ancientOutcome.valuation.status, "REVIEW_REQUIRED");
});

test("T: partial evidence with an unavailable provider still scores with no fabricated confidence", async () => {
  const { service, repository } = makeService({
    providers: {
      fetchAll: async () => [
        { provider: "mock", available: true, error: null, evidence: [{ kind: "CURRENT_PRICE", salePrice: 120, currency: "ZAR", sourceUrl: "s://mock", sourceLabel: "M", rawPayload: {} }] },
        { provider: "bricklink", available: false, error: "not_configured", evidence: [] },
      ],
    },
  });
  const outcome = await service.recalculate({ assetId: ASSET.id, asset: ASSET, asOf: AS_OF });
  assert.equal(outcome.created, true);
  assert.equal(outcome.status, "FRESH");
  assert.equal(outcome.providers.length, 2);
  assert.equal(outcome.providers[1].available, false);
  assert.ok(outcome.assessment.confidence > 0 && outcome.assessment.confidence <= 100);
  assert.ok(repository.__state.valuations.size === 1);
});

test("V: currency conversion unavailable is flagged REVIEW_REQUIRED and never fabricates a display value", async () => {
  const { service } = makeService();
  const outcome = await service.recalculate({
    assetId: ASSET.id,
    asset: ASSET,
    evidenceInputs: [{ kind: "CURRENT_PRICE", salePrice: 19.5, currency: "USD", sourceUrl: "s://us", sourceLabel: "US" }],
  });
  assert.equal(outcome.created, true);
  assert.equal(outcome.status, "REVIEW_REQUIRED");
  assert.equal(outcome.valuation.status, "REVIEW_REQUIRED");
  assert.equal(outcome.valuation.currency, "USD");
  assert.equal(Number(outcome.valuation.value), 19.5);
  assert.equal(outcome.valuation.metadata.displayValue, null);
  assert.deepEqual(outcome.valuation.metadata.notices, ["currency_conversion_unavailable_ZAR"]);
});

test("V: currency conversion with an explicit rate normalizes without changing precedent", async () => {
  const config = readValuationConfig({ VALUATION_CURRENCY_RATES: '{"USD_ZAR":17.5}' });
  const repository = createMemoryValuationRepository();
  const service = createValuationService({ repository, config, providers: createProviderRegistry({ config }) });
  const outcome = await service.recalculate({
    assetId: ASSET.id,
    asset: ASSET,
    evidenceInputs: [{ kind: "CURRENT_PRICE", salePrice: 10, currency: "USD", sourceUrl: "s://us", sourceLabel: "US" }],
  });
  assert.equal(outcome.created, true);
  assert.equal(outcome.status, "FRESH");
  assert.equal(outcome.valuation.currency, "ZAR");
  assert.ok(Math.abs(Number(outcome.valuation.value) - 175) < 0.001);
  assert.equal(outcome.valuation.metadata.conversion, "converted");
  assert.equal(outcome.valuation.metadata.displayValue, outcome.valuation.value);
});

test("W: valuation records are asset-scoped reference data with no user context", async () => {
  const { service, repository } = makeService();
  await service.recalculate({ assetId: ASSET.id, asset: ASSET, asOf: AS_OF });
  assert.equal((await service.getValuationHistory("phase4-asset-b")).length, 0);
  assert.equal((await service.getAssessmentHistory("phase4-asset-b")).length, 0);
  const stored = [...repository.__state.valuations.values()];
  assert.ok(!("userId" in stored[0]));
  assert.ok(!("user" in stored[0]));
  const assessments = [...repository.__state.assessments.values()];
  assert.ok(!("userId" in assessments[0]));
});

test("model input shaping keeps asset identity and price surfaces", () => {
  const input = modelInputFromAsset(ASSET, 123);
  assert.equal(input.id, ASSET.symbol);
  assert.equal(input.currentMarketValue, 123);
  assert.equal(input.price, 123);
  assert.equal(input.legoTheme, "Icons");
  assert.equal(modelInputFromAsset({ id: "x-only" }, 1).name, "x-only");
});