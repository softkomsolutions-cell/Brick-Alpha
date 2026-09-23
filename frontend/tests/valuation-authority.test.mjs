import test from "node:test";
import assert from "node:assert/strict";
import { canonicalMarketValue, recordedGrowth } from "../src/v3/valuation/valuationAuthority.js";

test("BrickEconomy current value wins over a conflicting catalog price", () => {
  const valuation = canonicalMarketValue({
    currentMarketValue: 26999,
    price: 1000,
  });
  assert.equal(valuation.value, 26999);
  assert.equal(valuation.source, "BrickEconomy");
  assert.equal(valuation.authoritative, true);
});

test("growth stays unavailable until a recorded series exists", () => {
  const growth = recordedGrowth({ changePercent: 12, projectedFutureValue: 40000 });
  assert.equal(growth.annualPercent, null);
  assert.equal(growth.ninetyDayPercent, null);
  assert.equal(growth.annualSource, "Unavailable");
  const recorded = recordedGrowth({ annualGrowth: 8.5, growth90Day: 1.2 });
  assert.equal(recorded.annualPercent, 8.5);
  assert.equal(recorded.ninetyDayPercent, 1.2);
});
