const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const fixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures", "brick-alpha-baseline.json"), "utf8"),
);

test("frontend Brick Alpha outputs match the Phase 0 baseline fixtures", async () => {
  const model = await import(
    pathToFileURL(path.join(__dirname, "..", "..", "frontend", "src", "brickAlphaModel.js")).href
  );
  const today = new Date(fixture.asOf);

  for (const testCase of fixture.cases) {
    const item = model.enrichBrickAlphaCollectible(testCase.input, today);
    const breakdown = model.buildBrickAlphaScoreBreakdown(item);
    const expected = testCase.expected;
    const actual = {
      brickAlphaScore: item.brickAlphaScore,
      grade: model.letterGradeFor(item.brickAlphaScore),
      recommendation: item.recommendation,
      confidence: model.confidenceFor(item),
      estimatedRoi: Number(item.estimatedRoi.toFixed(4)),
      projectedRoi: Number(item.projectedRoi.toFixed(4)),
      retirementStatus: item.retirementStatus,
      retirementProbability: item.retirementProbability,
      retirementConfidence: item.retirementConfidence,
      discountPercentage: Number(item.discountPercentage.toFixed(4)),
      riskScore: item.riskScore,
      liquidityScore: item.liquidityScore,
      retirementTimeline: item.retirementTimeline,
      alphaSignals: item.alphaSignals,
      displayGroups: breakdown.displayGroups.map(({ key, score, contribution }) => [
        key,
        score,
        contribution,
      ]),
      factors: breakdown.factors.map(({ key, score, contribution }) => [
        key,
        score,
        contribution,
      ]),
    };

    assert.deepEqual(actual, expected, `Brick Alpha baseline mismatch for ${testCase.id}`);
  }
});
