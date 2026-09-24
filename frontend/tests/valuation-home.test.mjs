import test from "node:test";
import assert from "node:assert/strict";
import { portfolioFitFor } from "../src/brickAlphaModel.js";
import { buildHomeView } from "../src/v3/home/homeModel.js";
import { buildDecisionSnapshot, presentResearchFields } from "../src/v3/decision/decisionModel.js";
import { getCopilotResponse } from "../src/scanEvaluationData.js";
import { convertUsdToZar, resolveExchangeRate } from "../src/v3/valuation/exchangeRate.js";
import { buildCanonicalValuation } from "../src/v3/valuation/valuationAuthority.js";

const HISTORY = [
  { date: "2025-09-23", value: 24000 },
  { date: "2026-06-25", value: 26100 },
  { date: "2026-09-23", value: 26999 },
];

const VENATOR = {
  id: "lego-star-wars-75367",
  sku: "75367",
  name: "UCS Venator",
  brand: "LEGO",
  legoTheme: "Star Wars",
  currentMarketValue: 26999,
  price: 1000,
  retailPrice: 27999,
  valuationDate: "2026-09-23",
  valuationHistory: HISTORY,
  recommendation: "Buy",
  brickAlphaScore: 80,
  retirementStatus: "Approaching",
  monthsUntilRetirement: 9,
  expectedRetirementDate: "2027-06-30",
};

function trade(partial) {
  return {
    assetClass: "collectible",
    status: "open",
    quantity: 1,
    legoTheme: "Star Wars",
    ...partial,
  };
}

test("exchange rate defaults to R18.50 and is shared by conversions", () => {
  const fallback = resolveExchangeRate({});
  const configured = resolveExchangeRate({ usdZarRate: 18.5 });
  assert.equal(fallback.rate, 18.5);
  assert.equal(configured.rate, 18.5);
  assert.equal(convertUsdToZar(10, {}).zar, 185);
  assert.equal(convertUsdToZar(10, { usdZarRate: 19 }).zar, 190);
  assert.equal(convertUsdToZar("nope", { usdZarRate: 18.5 }).zar, null);
});

test("home keeps owned value separate from realised cash", () => {
  const home = buildHomeView({
    openTrades: [
      trade({
        id: "open-1",
        label: "Rivendell",
        collectibleId: "rivendell",
        entryPrice: 14900,
        currentPrice: 18684,
        legoTheme: "Icons",
      }),
    ],
    closedTrades: [
      trade({
        id: "closed-1",
        status: "closed",
        label: "Castle",
        entryPrice: 6999,
        exitPrice: 8540,
        currentPrice: 8540,
        closedAt: "2026-09-23",
        orderNote: "local buyer groups",
      }),
    ],
    settings: { usdZarRate: 18.5 },
  });
  assert.equal(home.ownedValue, 18684);
  assert.equal(home.realisedProfit, 8113 - 6999);
  assert.equal(home.realisedCash, 8113);
  assert.notEqual(home.ownedValue + home.realisedCash, home.ownedValue + 8540);
  assert.equal(home.exchangeRate, 18.5);
  assert.equal(home.source, "BrickEconomy");
  for (const value of [home.ownedValue, home.costBasis, home.unrealisedProfit, home.blendedRoi, home.exchangeRate]) {
    assert.equal(Number.isFinite(value), true);
  }
});

test("curated book ignores full-only positions for performance and theme caps", () => {
  const curatedHolding = trade({
    id: "curated",
    collectibleId: "lego-star-wars-curated",
    label: "Venator",
    entryPrice: 20000,
    currentPrice: 22000,
    legoTheme: "Star Wars",
    collectionBook: "curated",
  });
  const fullOnly = trade({
    id: "full-only",
    collectibleId: "lego-icons-extra",
    label: "Rivendell",
    entryPrice: 1000,
    currentPrice: 50000,
    legoTheme: "Icons",
    collectionBook: "full",
  });
  const curated = buildHomeView({ openTrades: [curatedHolding, fullOnly], book: "curated" });
  const full = buildHomeView({ openTrades: [curatedHolding, fullOnly], book: "full" });
  assert.equal(curated.ownedValue, 22000);
  assert.equal(full.ownedValue, 72000);
  assert.equal(curated.uniqueSets, 1);
  assert.equal(full.uniqueSets, 2);
  const curatedIcons = curated.themes.find((theme) => theme.theme === "Icons");
  const fullIcons = full.themes.find((theme) => theme.theme === "Icons");
  assert.equal(curatedIcons.share, 0);
  assert.equal(curatedIcons.overCap, false);
  assert.equal(fullIcons.overCap, true);

  const without = portfolioFitFor({ id: "next", legoTheme: "Icons" }, [curatedHolding]);
  const withFullOnly = portfolioFitFor({ id: "next", legoTheme: "Icons" }, [curatedHolding, fullOnly]);
  const curatedFit = portfolioFitFor({ id: "next", legoTheme: "Icons" }, [curatedHolding]);
  assert.notEqual(without, withFullOnly);
  assert.equal(curatedFit, without);
});

test("a free gift adds market value and does not distort blended ROI", () => {
  const home = buildHomeView({
    openTrades: [
      trade({ id: "paid", collectibleId: "paid-set", label: "Paid", entryPrice: 10000, currentPrice: 11000, legoTheme: "Ideas" }),
      trade({ id: "gift", collectibleId: "gift-set", label: "Gift", entryPrice: 0, currentPrice: 5000, legoTheme: "Marvel" }),
    ],
  });
  assert.equal(home.ownedValue, 16000);
  assert.equal(home.costBasis, 10000);
  assert.equal(home.unrealisedProfit, 6000);
  assert.equal(home.blendedRoi, 10);
  assert.equal(Number.isFinite(home.blendedRoi), true);
});

test("retired home attention does not show a negative month count", () => {
  const home = buildHomeView({
    openTrades: [
      trade({
        id: "retired-set",
        collectibleId: "lego-star-wars-75252",
        label: "Imperial Star Destroyer",
        entryPrice: 22999,
        currentPrice: 28295,
        expectedRetirementDate: "2022-12-31",
        monthsUntilRetirement: -1,
      }),
    ],
  });
  const item = home.attention.find((entry) => entry.kind === "Retiring soon");
  assert.equal(item.detail, "Already retired");
  assert.equal(item.detail.includes("-"), false);
  assert.equal(item.section, "retiring");
});

test("home retiring-soon attention uses the canonical retirement clock", () => {
  const home = buildHomeView({
    openTrades: [
      trade({
        id: "soon",
        collectibleId: "lego-marvel-76218",
        label: "Sanctum",
        entryPrice: 5000,
        currentPrice: 8690,
        legoTheme: "Marvel",
        expectedRetirementDate: "2026-12-31",
      }),
    ],
  });
  const item = home.attention.find((entry) => entry.kind === "Retiring soon");
  assert.equal(item.detail, "3 months");
});

test("research, verdict, and valuation share one BrickEconomy record", () => {
  const valuation = buildCanonicalValuation(VENATOR);
  const research = presentResearchFields(VENATOR);
  const snapshot = buildDecisionSnapshot({ evaluation: VENATOR, analyzedAt: "2026-09-23T00:00:00.000Z" });
  assert.equal(research.currentMarketValue, valuation.currentMarketValue);
  assert.equal(snapshot.currentValue, valuation.currentMarketValue);
  assert.equal(snapshot.valuationSource, "BrickEconomy");
  assert.equal(research.annualGrowth, valuation.annualGrowth);
  assert.equal(snapshot.annualGrowth, valuation.annualGrowth);
  assert.equal(research.ninetyDayGrowth, valuation.ninetyDayGrowth);
  assert.equal(snapshot.growth90Day, valuation.ninetyDayGrowth);
  assert.equal(research.verdictLabel, snapshot.verdict.label);
  assert.equal(snapshot.forecasts, undefined);
  assert.equal(research.currentMarketValue === 1000, false);
  const advisor = snapshot.aiSummary.action + snapshot.aiSummary.bullets.join(" ");
  assert.equal(advisor.toLowerCase().includes("forecast return"), false);
  assert.equal(advisor.includes("1 Year"), false);
  const answer = getCopilotResponse("what is the roi?", { evaluation: VENATOR });
  assert.equal(answer.toLowerCase().includes("forecast return"), false);
  assert.equal(answer.includes("No recorded value"), false);
});
