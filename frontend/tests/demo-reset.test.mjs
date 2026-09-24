import test from "node:test";
import assert from "node:assert/strict";
import { buildHomeView } from "../src/v3/home/homeModel.js";
import { buildRealisedLedger } from "../src/v3/collection/ownershipModel.js";
import { clearDecisionSnapshot, readDecisionSnapshot, saveDecisionSnapshot } from "../src/v3/decision/decisionSession.js";
import { clearV3DemoDeviceState } from "../src/v3/demo/demoDeviceState.js";
import { consumeResearchSection, readResearchSection, stageResearchSection } from "../src/v3/research/researchModel.js";
import { v3MobileMenuItems } from "../src/v3/v3Nav.js";

const open = [{
  assetClass: "collectible",
  status: "open",
  sku: "75252",
  label: "Star Wars Imperial Star Destroyer",
  legoTheme: "Star Wars",
  quantity: 1,
  entryPrice: 22999,
  currentPrice: 28295,
  currentMarketValue: 28295,
  brickEconomyValue: 28295,
}];

const closed = [
  {
    assetClass: "collectible",
    status: "closed",
    sku: "10305",
    label: "Lion Knights' Castle",
    quantity: 1,
    entryPrice: 6999,
    exitPrice: 8540,
    exitReason: "Local buyer groups",
    closedAt: "2026-09-23T12:00:00.000Z",
  },
  {
    assetClass: "collectible",
    status: "closed",
    sku: "10316",
    label: "The Lord of the Rings: Rivendell",
    quantity: 1,
    entryPrice: 14900,
    exitPrice: 18684,
    exitReason: "Local buyer groups",
    closedAt: "2026-09-23T12:00:00.000Z",
  },
];

test("the Gavin demo baseline is the open ISD plus the realised Castle and Rivendell ledger", () => {
  const home = buildHomeView({
    openTrades: open,
    closedTrades: closed,
    settings: { usdZarRate: 18.5 },
  });
  const ledger = buildRealisedLedger(closed);
  const castle = ledger.find((sale) => sale.setNumber === "10305");
  const rivendell = ledger.find((sale) => sale.setNumber === "10316");
  assert.equal(home.ownedValue, 28295);
  assert.equal(home.costBasis, 22999);
  assert.equal(home.unrealisedProfit, 5296);
  assert.equal(home.realisedProfit, 3964);
  assert.equal(home.realisedCash, 25863);
  assert.equal(home.positions, 1);
  assert.equal(Math.round(home.blendedRoi * 10) / 10, 40.3);
  assert.equal(home.source, "BrickEconomy");
  assert.equal(castle.net, 8113);
  assert.equal(castle.realisedProfit, 1114);
  assert.equal(rivendell.realisedProfit, 2850);
});

test("demo reset clears the device snapshot and staged research section", () => {
  saveDecisionSnapshot({ setNumber: "75367", verdict: { label: "Buy ×1" } });
  stageResearchSection("performers");
  clearV3DemoDeviceState();
  assert.equal(readDecisionSnapshot(), null);
  assert.equal(readResearchSection(), "search");
  consumeResearchSection();
  clearDecisionSnapshot();
});

test("the v3 mobile menu hides legacy desks", () => {
  const items = [
    { id: "menu-news", label: "News" },
    { id: "menu-trading", label: "Trading" },
    { id: "menu-crypto", label: "Crypto" },
    { id: "menu-research", label: "Research" },
    { id: "forex", label: "Forex" },
    { id: "etfs", label: "ETFs" },
    { id: "jse", label: "JSE" },
    { id: "menu-settings", label: "Settings" },
  ];
  const visible = v3MobileMenuItems(items, true).map((item) => item.label);
  assert.deepEqual(visible, ["Research", "Settings"]);
  assert.equal(v3MobileMenuItems(items, false).length, items.length);
});
