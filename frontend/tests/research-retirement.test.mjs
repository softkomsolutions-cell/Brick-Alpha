import test from "node:test";
import assert from "node:assert/strict";
import { buildDecisionSnapshot } from "../src/v3/decision/decisionModel.js";
import { readDecisionSnapshot, saveDecisionSnapshot } from "../src/v3/decision/decisionSession.js";
import { personaliseRecommendation } from "../src/v3/personalisation/personalisationModel.js";
import { buildResearchCard } from "../src/v3/research/researchModel.js";
import { buildCanonicalRetirement } from "../src/v3/retirement/retirementModel.js";
import { buildCanonicalValuation } from "../src/v3/valuation/valuationAuthority.js";
import { applyWatchTriggers, upsertWatchTarget } from "../src/v3/watch/watchTargets.js";
import { exitRecommendation } from "../src/v3/collection/ownershipModel.js";

const AS_OF = "2026-09-23T12:00:00.000Z";

const SET = {
  id: "lego-star-wars-75367",
  sku: "75367",
  name: "Venator",
  brand: "LEGO",
  legoTheme: "Star Wars",
  currentMarketValue: 26999,
  price: 1000,
  valuationDate: "2026-09-23",
  valuationHistory: [
    { date: "2025-09-23", value: 24000 },
    { date: "2026-06-25", value: 26100 },
    { date: "2026-09-23", value: 26999 },
  ],
  expectedRetirementDate: "2027-06-30",
  recommendation: "Buy",
  brickAlphaScore: 80,
  riskScore: 42,
};

function baseVerdict() {
  return { id: "buy-2", label: "Buy ×2 flywheel", quantity: 2, targetPrice: 20000 };
}

test("retirement months stay fixed when unrelated fields change", () => {
  const first = buildCanonicalRetirement(SET, AS_OF);
  const second = buildCanonicalRetirement({ ...SET, recommendation: "Avoid", brickAlphaScore: 10, price: 1 }, AS_OF);
  assert.equal(second.monthsRemaining, first.monthsRemaining);
  assert.equal(second.daysRemaining, first.daysRemaining);
  assert.equal(second.retirementState, "Approaching");
  assert.equal(Number.isFinite(first.monthsRemaining), true);
});

test("60-day and 30-day reminders follow the recorded date", () => {
  const thirty = buildCanonicalRetirement({ expectedRetirementDate: "2026-10-20" }, AS_OF);
  const sixty = buildCanonicalRetirement({ expectedRetirementDate: "2026-11-10" }, AS_OF);
  const later = buildCanonicalRetirement({ expectedRetirementDate: "2026-12-31" }, AS_OF);
  assert.equal(thirty.reminders.thirtyDay, true);
  assert.equal(thirty.reminders.sixtyDay, false);
  assert.equal(thirty.insideSixMonths, true);
  assert.equal(sixty.reminders.sixtyDay, true);
  assert.equal(sixty.reminders.thirtyDay, false);
  assert.equal(later.reminders.sixtyDay, false);
  assert.equal(later.reminders.thirtyDay, false);
  assert.equal(later.insideSixMonths, true);
});

test("watching a target does not change the frozen analysis", () => {
  const snapshot = buildDecisionSnapshot({ evaluation: SET, analyzedAt: AS_OF });
  saveDecisionSnapshot(snapshot);
  const before = JSON.stringify(readDecisionSnapshot());
  upsertWatchTarget([], {
    setNumber: "75367",
    name: "Venator",
    currentValue: 26999,
    targetBuyPrice: 25000,
    targetVerdict: snapshot.verdict.label,
    retirementState: snapshot.retirement.retirementState,
    createdAt: AS_OF,
  });
  assert.equal(JSON.stringify(readDecisionSnapshot()), before);
});

test("research, home valuation, and verdict share one market value", () => {
  const card = buildResearchCard(SET, { asOf: AS_OF });
  const valuation = buildCanonicalValuation(SET);
  const snapshot = buildDecisionSnapshot({ evaluation: SET, analyzedAt: AS_OF });
  assert.equal(card.currentMarketValue, valuation.currentMarketValue);
  assert.equal(snapshot.currentValue, valuation.currentMarketValue);
  assert.equal(card.annualGrowth, snapshot.annualGrowth);
  assert.equal(card.ninetyDayGrowth, snapshot.growth90Day);
  assert.equal(card.verdict.label, snapshot.verdict.label);
  assert.equal(card.currentMarketValue === 1000, false);
});

test("a watch target triggers when value is at or below the target", () => {
  const targets = upsertWatchTarget([], {
    setNumber: "75367",
    name: "Venator",
    currentValue: 26999,
    targetBuyPrice: 27000,
    targetVerdict: "Buy ×1",
    retirementState: "Approaching",
    createdAt: AS_OF,
  });
  const triggered = applyWatchTriggers(targets, { 75367: 26999 });
  const waiting = applyWatchTriggers(targets, { 75367: 28000 });
  assert.equal(triggered[0].triggered, true);
  assert.equal(waiting[0].triggered, false);
});

test("budget, theme cap, risk, hold period, and stack size adjust the book verdict only", () => {
  const budget = personaliseRecommendation({
    baseVerdict: baseVerdict(),
    profile: { budgetPerSet: 15000 },
    currentValue: 20000,
    theme: "Ideas",
  });
  assert.equal(budget.verdict.id, "below");
  assert.equal(budget.baseVerdict.id, "buy-2");

  const cap = personaliseRecommendation({
    baseVerdict: baseVerdict(),
    theme: "Star Wars",
    openTrades: [
      { assetClass: "collectible", status: "open", legoTheme: "Star Wars", currentPrice: 9000, quantity: 1, sku: "1" },
    ],
  });
  assert.equal(cap.themeShare, 100);
  assert.equal(cap.verdict.id, "buy-1");

  const risk = personaliseRecommendation({
    baseVerdict: { id: "buy-1", label: "Buy ×1", quantity: 1, targetPrice: 10000 },
    profile: { riskTolerance: "conservative" },
    riskScore: 80,
    theme: "Ideas",
  });
  assert.equal(risk.verdict.id, "below");

  const hold = personaliseRecommendation({
    baseVerdict: { id: "buy-1", label: "Buy ×1", quantity: 1, targetPrice: 10000 },
    profile: { holdPeriod: "short" },
    retirement: { monthsRemaining: 30 },
    theme: "Ideas",
  });
  assert.equal(hold.verdict.id, "below");

  const stack = personaliseRecommendation({
    baseVerdict: { id: "buy-1", label: "Buy ×1", quantity: 1, targetPrice: 10000 },
    setNumber: "75367",
    theme: "Ideas",
    openTrades: [
      { assetClass: "collectible", status: "open", sku: "75367", quantity: 2, currentPrice: 1000, legoTheme: "Ideas" },
    ],
  });
  assert.equal(stack.verdict.quantity, 0);

  const before = buildCanonicalValuation(SET);
  const afterProfile = buildDecisionSnapshot({
    evaluation: SET,
    analyzedAt: AS_OF,
    buyingProfile: { budgetPerSet: 1000, holdPeriod: "short", riskTolerance: "conservative", preferredThemes: ["Icons"] },
    openTrades: [{ assetClass: "collectible", status: "open", legoTheme: "Star Wars", currentPrice: 50000, quantity: 1 }],
  });
  const after = buildCanonicalValuation(SET);
  assert.deepEqual(after, before);
  assert.equal(afterProfile.currentValue, before.currentMarketValue);
  assert.equal(afterProfile.verdict.label, "Buy ×1");
  assert.notEqual(afterProfile.personalisation.verdict.id, "buy-2");
});

test("flywheel ready stays a cost test when retirement is inside 6 months", () => {
  const ready = exitRecommendation({
    flywheelReady: true,
    belowCost: false,
    sellWindowMonths: 2,
  });
  assert.equal(ready, "Sell one unit and recycle the cash");
  const retirement = buildCanonicalRetirement({ expectedRetirementDate: "2026-10-20" }, AS_OF);
  assert.equal(retirement.insideSixMonths, true);
  assert.equal(ready.includes("Flywheel") || ready.includes("recycle"), true);
});

test("research numbers stay finite", () => {
  const card = buildResearchCard({ ...SET, annualGrowth: null, valuationHistory: [] }, { asOf: AS_OF });
  for (const value of [card.currentMarketValue, card.annualGrowth, card.ninetyDayGrowth, card.confidence, card.retirement.monthsRemaining]) {
    assert.equal(value == null || Number.isFinite(value), true);
  }
});
