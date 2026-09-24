import test from "node:test";
import assert from "node:assert/strict";

import { enrichBrickAlphaCollectible } from "../src/brickAlphaModel.js";
import { buildDecisionSnapshot, mapVerdictVocabulary } from "../src/v3/decision/decisionModel.js";

const SET = enrichBrickAlphaCollectible(
  {
    id: "lego-icons-10305",
    sku: "10305",
    name: "Lion Knights' Castle",
    brand: "LEGO",
    legoTheme: "Icons",
    retailPrice: 17999,
    price: 15999,
    currentMarketValue: 15999,
    expectedRetirementDate: "2027-06-30",
    recommendation: "Strong Buy",
    brickAlphaScore: 91,
  },
  new Date("2026-09-23T12:00:00.000Z"),
);

test("decision snapshot freezes analysis fields used by verdict", () => {
  const snapshot = buildDecisionSnapshot({
    evaluation: SET,
    analyzedAt: "2026-09-23T12:00:00.000Z",
  });
  const before = JSON.stringify({
    score: snapshot.score,
    verdict: snapshot.verdict.label,
    months: snapshot.retirement.monthsRemaining,
    factors: snapshot.factors.map((factor) => factor.title),
  });

  SET.brickAlphaScore = 10;
  SET.recommendation = "Avoid";
  SET.monthsUntilRetirement = 1;

  const after = JSON.stringify({
    score: snapshot.score,
    verdict: snapshot.verdict.label,
    months: snapshot.retirement.monthsRemaining,
    factors: snapshot.factors.map((factor) => factor.title),
  });

  assert.equal(after, before);
  assert.equal(snapshot.factors.length, 9);
  assert.equal(snapshot.verdict.label, "Buy ×2 flywheel");
});

test("verdict vocabulary covers the four v3 outcomes", () => {
  assert.equal(mapVerdictVocabulary({ recommendation: "Avoid", brickAlphaScore: 40 }).label, "Skip");
  assert.equal(mapVerdictVocabulary({ recommendation: "Buy", brickAlphaScore: 80 }).label, "Buy ×1");
  assert.match(
    mapVerdictVocabulary({ recommendation: "Hold", brickAlphaScore: 65, currentMarketValue: 1000 }).label,
    /^Only below /,
  );
});
