import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCanonicalValuation,
  canonicalMarketValue,
  growthFromHistory,
  recordedGrowth,
} from "../src/v3/valuation/valuationAuthority.js";

test("BrickEconomy current value wins over a conflicting catalog price", () => {
  const valuation = canonicalMarketValue({
    currentMarketValue: 26999,
    price: 1000,
    retailPrice: 27999,
  });
  assert.equal(valuation.value, 26999);
  assert.equal(valuation.source, "BrickEconomy");
  assert.equal(valuation.authoritative, true);
});

test("catalogue, retail, and purchase prices do not become market value", () => {
  const valuation = canonicalMarketValue({
    price: 1000,
    retailPrice: 27999,
    entryPrice: 500,
    projectedFutureValue: 40000,
  });
  assert.equal(valuation.value, null);
  assert.equal(valuation.source, "Unavailable");
  assert.equal(valuation.authoritative, false);
});

test("growth stays unavailable until a recorded series exists", () => {
  const growth = recordedGrowth({ changePercent: 12, projectedFutureValue: 40000 });
  assert.equal(growth.annualPercent, null);
  assert.equal(growth.ninetyDayPercent, null);
  assert.equal(growth.annualSource, "Insufficient history");
  const recorded = recordedGrowth({ annualGrowth: 8.5, growth90Day: 1.2 });
  assert.equal(recorded.annualPercent, 8.5);
  assert.equal(recorded.ninetyDayPercent, 1.2);
});

test("recorded history supplies 90-day and annual growth", () => {
  const ninetyOnly = growthFromHistory(
    [
      { date: "2026-06-25", value: 26100 },
      { date: "2026-09-23", value: 26999 },
    ],
    "2026-09-23",
  );
  assert.equal(ninetyOnly.annualPercent, null);
  assert.equal(ninetyOnly.annualSource, "Insufficient history");
  assert.ok(Math.abs(ninetyOnly.ninetyDayPercent - ((26999 - 26100) / 26100) * 100) < 0.001);

  const both = growthFromHistory(
    [
      { date: "2025-09-23", value: 24000 },
      { date: "2026-06-25", value: 26100 },
      { date: "2026-09-23", value: 26999 },
    ],
    "2026-09-23",
  );
  assert.ok(Math.abs(both.annualPercent - ((26999 - 24000) / 24000) * 100) < 0.001);
  assert.equal(both.ninetyDayPercent, ninetyOnly.ninetyDayPercent);
  assert.equal(Number.isFinite(both.annualPercent), true);
  assert.equal(Number.isFinite(both.ninetyDayPercent), true);
});

test("same-day, zero, and invalid valuations do not create growth", () => {
  const collapsed = growthFromHistory([
    { date: "2025-09-23", value: 100 },
    { date: "2026-09-23", value: 50 },
    { date: "2026-09-23", value: 80 },
  ]);
  assert.equal(collapsed.annualPercent, -20);
  assert.equal(collapsed.valuationDate, "2026-09-23");

  const zeroed = growthFromHistory([
    { date: "2025-09-23", value: 0 },
    { date: "2026-09-23", value: 100 },
  ]);
  assert.equal(zeroed.annualPercent, null);
  assert.equal(zeroed.ninetyDayPercent, null);

  const invalid = growthFromHistory([
    { date: "not-a-date", value: 100 },
    { date: "2026-09-23", value: Number.NaN },
    { date: "2026-09-23", value: Number.POSITIVE_INFINITY },
  ]);
  assert.equal(invalid.annualPercent, null);
  assert.equal(invalid.ninetyDayPercent, null);
  for (const value of [invalid.annualPercent, invalid.ninetyDayPercent, collapsed.annualPercent]) {
    assert.equal(value == null || Number.isFinite(value), true);
  }
});

test("canonical valuation object exposes one BrickEconomy record", () => {
  const valuation = buildCanonicalValuation({
    currentMarketValue: 26999,
    price: 1000,
    valuationDate: "2026-09-23",
    valuationHistory: [
      { date: "2025-09-23", value: 24000 },
      { date: "2026-09-23", value: 26999 },
    ],
    dataConfidence: 74,
  });
  assert.equal(valuation.currentMarketValue, 26999);
  assert.equal(valuation.source, "BrickEconomy");
  assert.equal(valuation.valuationDate, "2026-09-23");
  assert.equal(valuation.confidence, 74);
  assert.equal(valuation.provenance, "BrickEconomy recorded value");
  assert.ok(valuation.annualGrowth > 0);
  assert.equal(valuation.ninetyDayGrowth, null);
});
