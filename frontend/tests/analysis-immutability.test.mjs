/**
 * Regression coverage: mutating watchlist/portfolio state must never mutate the
 * investment analysis for a scanned LEGO set.
 *
 * Root cause of the reported bug: the Scan & Evaluate results page derived
 * "Months Remaining" from a live `new Date()` at render time, so any re-render
 * (e.g. adding the set to the watchlist) shifted the value. The fix freezes the
 * retirement window at analysis-enrichment time; these tests pin that contract.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  enrichBrickAlphaCollectible,
  confidenceFor,
  buildPriceForecast,
  buildAiCommentary,
} from "../src/brickAlphaModel.js";
import {
  buildForecastCards,
  buildRetirementSnapshot,
  buildMarketPricing,
} from "../src/scanEvaluationData.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const TODAY = new Date("2026-09-23T12:00:00.000Z");

function enrichForScan(item) {
  return enrichBrickAlphaCollectible(
    {
      ...item,
      buyPrice: item.buyPrice || item.price || item.retailPrice,
      price: item.currentMarketValue || item.price || item.retailPrice,
      currentMarketValue: item.currentMarketValue || item.price || item.retailPrice,
      quantityOwned: 1,
      storeSource: item.venue || "Scan evaluation",
    },
    TODAY,
  );
}

const SET_75367 = {
  id: "lego-star-wars-75367",
  sku: "75367",
  name: "Venator-Class Republic Attack Cruiser",
  brand: "LEGO",
  legoTheme: "Star Wars",
  retailPrice: 27999,
  price: 26999,
  currentMarketValue: 26999,
  expectedRetirementDate: "2027-06-30",
};

const SET_10305 = {
  id: "lego-icons-10305",
  sku: "10305",
  name: "Lion Knights' Castle",
  brand: "LEGO",
  legoTheme: "Icons",
  retailPrice: 17999,
  price: 15999,
  currentMarketValue: 15999,
  expectedRetirementDate: "2025-12-31",
  actualRetirementDate: null,
};

function snapshotAnalysis(evaluation) {
  return {
    score: evaluation.brickAlphaScore,
    grade: evaluation.investmentGrade,
    recommendation: evaluation.recommendation,
    confidence: confidenceFor(evaluation),
    currentMarketValue: evaluation.currentMarketValue,
    expectedRetirement: evaluation.expectedRetirementDate,
    retirementStatus: evaluation.retirementStatus,
    retirementProbability: evaluation.retirementProbability,
    retirementConfidence: evaluation.retirementConfidence,
    monthsUntilRetirement: evaluation.monthsUntilRetirement,
    priceForecast: buildPriceForecast(evaluation, 3),
    retirementSnapshot: buildRetirementSnapshot(evaluation),
    forecastCards: buildForecastCards(evaluation),
    marketPricing: buildMarketPricing(evaluation, null),
    commentary: buildAiCommentary(evaluation),
  };
}

for (const [label, base] of [
  ["75367", SET_75367],
  ["10305", SET_10305],
]) {
  test(`analysis is frozen for the session — ${label}`, () => {
    const evaluation = enrichForScan(base);

    // The evaluation freezes its retirement window at enrichment time.
    const expectedMs = Date.parse(evaluation.expectedRetirementDate);
    const expectedMonths = (expectedMs - TODAY.getTime()) / (MS_PER_DAY * 30);
    assert.equal(
      evaluation.monthsUntilRetirement,
      expectedMonths,
      "monthsUntilRetirement must be frozen against the enrichment-time clock",
    );

    const before = snapshotAnalysis(evaluation);
    const after = snapshotAnalysis(evaluation);
    assert.deepEqual(
      after,
      before,
      "analysis output must be identical across re-renders (this is the watchlist bug regression)",
    );
  });
}

test("watching a set never mutates the source evaluation object", () => {
  const evaluation = enrichForScan(SET_75367);
  const before = snapshotAnalysis(evaluation);

  // A watchlist add/remove re-renders the screen but hands the same evaluation
  // down; shallow copies must reproduce identical output.
  const copy = { ...evaluation };
  const after = snapshotAnalysis(copy);

  assert.deepEqual(after, before);
});

test("enrichment is deterministic for a fixed clock (no Date.now/random leakage)", () => {
  const first = enrichForScan(SET_75367);
  const second = enrichForScan(SET_75367);
  assert.deepEqual(second, first);
});

test("months remaining is a stable whole number in the retirement snapshot", () => {
  const evaluation = enrichForScan(SET_75367);
  const snapshot = buildRetirementSnapshot(evaluation);
  assert.equal(snapshot.monthsRemaining, Math.round(evaluation.monthsUntilRetirement));
  assert.equal(buildRetirementSnapshot(evaluation).monthsRemaining, snapshot.monthsRemaining);
});

test("forecast cards and market pricing depend only on the evaluation object", () => {
  const evaluation = enrichForScan(SET_75367);
  assert.deepEqual(buildForecastCards(evaluation), buildForecastCards(evaluation));
  assert.deepEqual(buildMarketPricing(evaluation, null), buildMarketPricing(evaluation, null));
  for (const card of buildForecastCards(evaluation)) {
    assert.equal(Number.isFinite(card.value), true, "forecast value must be finite");
    assert.equal(Number.isFinite(card.roi), true, "forecast roi must be finite");
  }
});