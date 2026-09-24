const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const backendModel = require("../services/brick-alpha-model");

const fixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures", "brick-alpha-baseline.json"), "utf8"),
);
const today = new Date(fixture.asOf);

function makeScenarioInput(overrides) {
  return {
    id: "scenario-parity",
    brand: "LEGO",
    name: "Scenario Parity Set",
    category: "LEGO Icons",
    sku: "20000",
    price: 9000,
    retailPrice: 10000,
    buyPrice: 7500,
    currentMarketValue: 9000,
    expectedRetirementDate: "2028-12-31",
    purchaseDate: "2026-02-01",
    sellByTargetDate: "2030-12-31",
    riskScore: 45,
    minifigureQuality: 70,
    exclusiveMinifigures: 2,
    numberOfMinifigures: 4,
    themeStrength: 75,
    retirementTimeline: 64,
    demandForSet: 72,
    supplyScarcity: 60,
    displayAppeal: 75,
    partOutValue: 60,
    liquidityScore: 62,
    historicalPerformance: 65,
    portfolioFit: 60,
    liquidity: "Medium",
    ...overrides,
  };
}

const SCENARIO_CASES = [
  { id: "parity-retired", input: makeScenarioInput({ actualRetirementDate: "2024-06-30", expectedRetirementDate: "2024-06-30" }) },
  { id: "parity-high-discount", input: makeScenarioInput({ retailPrice: 10000, buyPrice: 6000 }) },
  { id: "parity-low-discount", input: makeScenarioInput({ retailPrice: 10000, buyPrice: 9900 }) },
  { id: "parity-high-scarcity", input: makeScenarioInput({ supplyScarcity: 98 }) },
  { id: "parity-low-liquidity", input: makeScenarioInput({ liquidityScore: 10, liquidity: "Low" }) },
];

test("backend Brick Alpha port matches the frontend model for every fixture case", async () => {
  const frontendModel = await import(
    pathToFileURL(path.join(__dirname, "..", "..", "frontend", "src", "brickAlphaModel.js")).href
  );

  for (const testCase of fixture.cases) {
    const frontendEnriched = frontendModel.enrichBrickAlphaCollectible(testCase.input, today);
    const backendEnriched = backendModel.enrichBrickAlphaCollectible(testCase.input, today);
    assert.deepEqual(backendEnriched, frontendEnriched, `full enrich parity mismatch for ${testCase.id}`);
    assert.deepEqual(
      backendModel.buildBrickAlphaScoreBreakdown(backendEnriched),
      frontendModel.buildBrickAlphaScoreBreakdown(frontendEnriched),
      `breakdown parity mismatch for ${testCase.id}`,
    );
  }
});

test("backend Brick Alpha port matches the frontend model for scenario inputs", async () => {
  const frontendModel = await import(
    pathToFileURL(path.join(__dirname, "..", "..", "frontend", "src", "brickAlphaModel.js")).href
  );

  for (const testCase of SCENARIO_CASES) {
    const frontendEnriched = frontendModel.enrichBrickAlphaCollectible(testCase.input, today);
    const backendEnriched = backendModel.enrichBrickAlphaCollectible(testCase.input, today);
    assert.deepEqual(backendEnriched, frontendEnriched, `scenario enrich parity mismatch for ${testCase.id}`);
  }
});

test("each shared export of the backend port matches the frontend module", async () => {
  const frontendModel = await import(
    pathToFileURL(path.join(__dirname, "..", "..", "frontend", "src", "brickAlphaModel.js")).href
  );
  const scores = [0, 69, 70, 79, 80, 89, 90, 95];
  const assertEqualByCase = (name, frontendValue, backendValue) => {
    assert.deepEqual(backendValue, frontendValue, `shared export mismatch: ${name}`);
  };

  assertEqualByCase("THEME_ALLOCATION_TARGETS", frontendModel.THEME_ALLOCATION_TARGETS, backendModel.THEME_ALLOCATION_TARGETS);
  assertEqualByCase("BRICK_ALPHA_SIGNALS", frontendModel.BRICK_ALPHA_SIGNALS, backendModel.BRICK_ALPHA_SIGNALS);
  assert.equal(backendModel.BRICK_ALPHA_MODEL_VERSION, "brick-alpha-v1");
  for (const score of scores) {
    assertEqualByCase(`letterGradeFor(${score})`, frontendModel.letterGradeFor(score), backendModel.letterGradeFor(score));
    assertEqualByCase(`investmentGradeFor(${score})`, frontendModel.investmentGradeFor(score), backendModel.investmentGradeFor(score));
  }

  for (const raw of [fixture.cases[0].input, fixture.cases[6].input, SCENARIO_CASES[0].input]) {
    const enrichedFrontend = frontendModel.enrichBrickAlphaCollectible(raw, today);
    const enrichedBackend = backendModel.enrichBrickAlphaCollectible(raw, today);
    for (const years of [1, 3, 5]) {
      assertEqualByCase(
        `buildPriceForecast(${years})`,
        frontendModel.buildPriceForecast(enrichedFrontend, years),
        backendModel.buildPriceForecast(enrichedBackend, years),
      );
    }
    assertEqualByCase("buildAiCommentary", frontendModel.buildAiCommentary(enrichedFrontend), backendModel.buildAiCommentary(enrichedBackend));
    assertEqualByCase("availabilityStatusFor", frontendModel.availabilityStatusFor(enrichedFrontend), backendModel.availabilityStatusFor(enrichedBackend));
    assertEqualByCase("alphaSignalsFor", frontendModel.alphaSignalsFor(enrichedFrontend), backendModel.alphaSignalsFor(enrichedBackend));
    assertEqualByCase("confidenceFor", frontendModel.confidenceFor(enrichedFrontend), backendModel.confidenceFor(enrichedBackend));
    assertEqualByCase("retirementOutlookFor", frontendModel.retirementOutlookFor({ ...enrichedFrontend }, today), backendModel.retirementOutlookFor({ ...enrichedBackend }, today));
    assertEqualByCase("themeAllocationFor", frontendModel.themeAllocationFor([tradeLike(enrichedFrontend)]), backendModel.themeAllocationFor([tradeLike(enrichedBackend)]));
    assertEqualByCase("portfolioFitFor", frontendModel.portfolioFitFor(enrichedFrontend, [tradeLike(enrichedFrontend)]), backendModel.portfolioFitFor(enrichedBackend, [tradeLike(enrichedBackend)]));
    assertEqualByCase("legoThemeFor", frontendModel.legoThemeFor(enrichedFrontend), backendModel.legoThemeFor(enrichedBackend));
  }

  const trade = {
    id: "trade-1",
    assetClass: "collectible",
    status: "open",
    side: "buy",
    label: "Parity Trade",
    ticker: "LEGO-10000",
    quantity: 1,
    entryPrice: 20000,
    currentPrice: 24000,
    collectibleId: "baseline-strong-buy",
    createdAt: "2025-01-15T00:00:00.000Z",
  };
  const collectibles = fixture.cases.map((testCase) => ({
    id: testCase.input.id,
    ...testCase.input,
  }));
  const enrichedTrades = collectibles.map((item) => enrichTradeFor(item));
  const ttrades = [trade, ...enrichedTrades];
  function enrichTradeFor(item) {
    return {
      id: item.id,
      assetClass: "collectible",
      status: "open",
      side: "buy",
      label: item.name,
      ticker: item.sku,
      quantity: 1,
      entryPrice: item.buyPrice,
      currentPrice: item.price,
      collectibleId: item.id,
      createdAt: item.purchaseDate,
      category: item.category,
    };
  }

  assertEqualByCase(
    "enrichBrickAlphaTrade",
    frontendModel.enrichBrickAlphaTrade(trade, collectibles, ttrades),
    backendModel.enrichBrickAlphaTrade(trade, collectibles, ttrades),
  );
  assertEqualByCase(
    "summarizeBrickAlphaPortfolio",
    frontendModel.summarizeBrickAlphaPortfolio(
      ttrades.map((t) => ({ ...t, brickAlphaScore: backendModel.enrichBrickAlphaTrade(t, collectibles, ttrades).brickAlphaScore })),
    ),
    backendModel.summarizeBrickAlphaPortfolio(
      ttrades.map((t) => ({ ...t, brickAlphaScore: backendModel.enrichBrickAlphaTrade(t, collectibles, ttrades).brickAlphaScore })),
    ),
  );
});

function tradeLike(enriched) {
  return {
    assetClass: "collectible",
    quantity: 1,
    currentPrice: enriched.currentMarketValue,
    entryPrice: enriched.buyPrice,
    category: enriched.category,
    status: "open",
  };
}