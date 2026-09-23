import test from "node:test";
import assert from "node:assert/strict";
import {
  annualisedReturnPercent,
  buildCollectionView,
  buildRealisedLedger,
  filterCollectionSets,
  formatSignedPercent,
} from "../src/v3/collection/ownershipModel.js";

const castle = {
  id: "lego-icons-10305",
  sku: "10305",
  name: "Lion Knights' Castle",
  brand: "LEGO",
  category: "LEGO Icons",
  currentMarketValue: 8299,
  price: 8299,
  retailPrice: 19999,
  buyPrice: 6999,
  expectedRetirementDate: "2027-06-30",
};

function trade(overrides) {
  return {
    assetClass: "collectible",
    status: "open",
    side: "BUY",
    quantity: 1,
    collectibleId: castle.id,
    ticker: "10305",
    sku: "10305",
    label: castle.name,
    entryPrice: 6999,
    currentPrice: 8299,
    createdAt: "2024-01-01T00:00:00.000Z",
    orderNote: "Condition: sealed",
    ...overrides,
  };
}

test("collection groups a stack into one set sorted by market value", () => {
  const source = [
    trade({ id: "a", entryPrice: 6000, currentPrice: 8000, orderNote: "Condition: sealed" }),
    trade({ id: "b", entryPrice: 4000, currentPrice: 8000, orderNote: "Condition: opened" }),
    trade({
      id: "c",
      collectibleId: "lego-star-wars-75367",
      sku: "75367",
      ticker: "75367",
      label: "Venator",
      entryPrice: 20000,
      currentPrice: 10000,
      category: "LEGO Star Wars",
    }),
  ];
  const frozen = JSON.stringify(source);
  const view = buildCollectionView(source, [castle, { ...castle, id: "lego-star-wars-75367", sku: "75367", name: "Venator", category: "LEGO Star Wars" }]);
  assert.equal(JSON.stringify(source), frozen);
  assert.equal(view.summary.uniqueSets, 2);
  assert.equal(view.summary.positions, 3);
  assert.equal(view.summary.stacks, 1);
  assert.equal(view.summary.sealed, 2);
  assert.equal(view.summary.opened, 1);
  assert.equal(view.sets[0].setNumber, "10305");
  const stack = view.sets.find((set) => set.setNumber === "10305");
  assert.equal(stack.units, 2);
  assert.equal(stack.condition, "Sealed + Opened");
  assert.equal(stack.flywheelReady, true);
  const share = stack.unitRows.reduce((sum, unit) => sum + unit.shareOfStackCost, 0);
  assert.ok(Math.abs(share - 100) < 0.01);
  assert.equal(filterCollectionSets(view.sets, "below").length, 1);
  assert.equal(filterCollectionSets(view.sets, "stacks").length, 1);
  assert.equal(formatSignedPercent(stack.roi).includes("NaN"), false);
  assert.equal(formatSignedPercent(annualisedReturnPercent(0, 10, 10)), "—");
  assert.equal(annualisedReturnPercent(100, 122, 2), null);
  const year = annualisedReturnPercent(100, 122, 365);
  assert.ok(year > 21 && year < 23);
});

test("realised ledger keeps cost, fees, net, and recovery finite", () => {
  const ledger = buildRealisedLedger([
    {
      id: "closed-1",
      assetClass: "collectible",
      status: "closed",
      sku: "10305",
      label: "Lion Knights' Castle",
      quantity: 1,
      entryPrice: 7000,
      exitPrice: 10000,
      pnlAmount: 3000,
      closedAt: "2026-09-01T00:00:00.000Z",
      exitReason: "Manual close: Channel: BrickLink",
    },
  ]);
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].cost, 7000);
  assert.equal(ledger[0].gross, 10000);
  assert.equal(ledger[0].fees, 1200);
  assert.equal(ledger[0].net, 8800);
  assert.equal(ledger[0].realisedProfit, 3000);
  assert.equal(ledger[0].channel, "BrickLink");
  assert.equal(ledger[0].recovery, "Recovered — ready to recycle");
  assert.equal(JSON.stringify(ledger).includes("NaN"), false);
});
