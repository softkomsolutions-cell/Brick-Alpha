const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const {
  app,
  authenticated,
  registerUser,
  resetStore,
} = require("../test-support/helpers");

test.beforeEach(() => {
  resetStore();
});

test("collectible BUY captures the current legacy mark-to-market P/L behavior", async () => {
  const user = await registerUser({ email: "financial-buy@example.test" });
  const item = (await require("supertest")(app).get("/api/collectibles")).body.items[0];
  const response = await authenticated(user.token)
    .post("/api/collectibles/trades")
    .send({ collectibleId: item.id, side: "BUY", quantity: 2 });

  assert.equal(response.status, 201);
  const trade = response.body.trade;
  assert.equal(trade.assetClass, "collectible");
  assert.equal(trade.side, "BUY");
  assert.equal(trade.status, "open");
  assert.equal(trade.quantity, 2);
  assert.equal(trade.entryValue, Number((trade.entryPrice * trade.quantity).toFixed(2)));
  assert.equal(trade.currentValue, Number((trade.currentPrice * trade.quantity).toFixed(2)));
  assert.equal(trade.pnlAmount, Number(((trade.currentPrice - trade.entryPrice) * trade.quantity).toFixed(2)));
});

test("collectible SELL currently succeeds without inventory validation", async () => {
  const user = await registerUser({ email: "financial-sell@example.test" });
  const item = (await require("supertest")(app).get("/api/collectibles")).body.items[0];
  const response = await authenticated(user.token)
    .post("/api/collectibles/trades")
    .send({ collectibleId: item.id, side: "SELL", quantity: 1 });

  assert.equal(response.status, 201);
  assert.equal(response.body.trade.side, "SELL");
  assert.equal(response.body.trade.status, "open");
  assert.equal(response.body.portfolio.length, 1);
});

test("trade close preserves open and closed positions in the portfolio array", async () => {
  const user = await registerUser({ email: "financial-close@example.test" });
  const item = (await require("supertest")(app).get("/api/collectibles")).body.items[0];
  const created = await authenticated(user.token)
    .post("/api/collectibles/trades")
    .send({ collectibleId: item.id, side: "BUY", quantity: 2 });

  const closed = await authenticated(user.token)
    .post(`/api/trades/${created.body.trade.id}/close`)
    .send({ orderNote: "Legacy close baseline" });
  assert.equal(closed.status, 200);
  assert.equal(closed.body.trade.status, "closed");
  assert.equal(typeof closed.body.trade.closedAt, "string");
  assert.equal(typeof closed.body.trade.exitPrice, "number");
  assert.equal(typeof closed.body.trade.pnlAmount, "number");

  const portfolio = await authenticated(user.token).get("/api/portfolio");
  assert.equal(portfolio.status, 200);
  assert.equal(portfolio.body.length, 1);
  assert.equal(portfolio.body[0].status, "closed");
});

test("known legacy behavior: partial sales are unsupported and quantity remains whole", async () => {
  const user = await registerUser({ email: "financial-partial@example.test" });
  const item = (await require("supertest")(app).get("/api/collectibles")).body.items[0];
  const created = await authenticated(user.token)
    .post("/api/collectibles/trades")
    .send({ collectibleId: item.id, side: "BUY", quantity: 2 });

  const closeAttempt = await authenticated(user.token)
    .post(`/api/trades/${created.body.trade.id}/close`)
    .send({ quantity: 1 });
  assert.equal(closeAttempt.status, 200);
  assert.equal(closeAttempt.body.trade.status, "closed");
  assert.equal(closeAttempt.body.trade.quantity, 2);
  assert.equal(closeAttempt.body.trade.saleQuantity, undefined);
});

test("known legacy behavior: no acquisition lots or cost-basis allocations exist", async () => {
  const user = await registerUser({ email: "financial-lots@example.test" });
  const item = (await require("supertest")(app).get("/api/collectibles")).body.items[0];
  const response = await authenticated(user.token)
    .post("/api/collectibles/trades")
    .send({ collectibleId: item.id, side: "BUY", quantity: 2 });

  assert.equal(response.status, 201);
  assert.equal(response.body.trade.lots, undefined);
  assert.equal(response.body.trade.costBasisAllocation, undefined);
  assert.equal(response.body.trade.costBasisMethod, undefined);
});

test("known legacy behavior: closed collectible trades still contribute to frontend NAV and unrealized gain", async () => {
  const model = await import(
    pathToFileURL(path.join(__dirname, "..", "..", "frontend", "src", "brickAlphaModel.js")).href
  );
  const summary = model.summarizeBrickAlphaPortfolio([
    {
      assetClass: "collectible",
      status: "closed",
      quantity: 1,
      entryPrice: 100,
      currentPrice: 150,
      pnlAmount: 50,
      brickAlphaScore: 80,
      riskScore: 40,
      category: "LEGO",
    },
  ]);

  assert.equal(summary.costBasis, 100);
  assert.equal(summary.netAssetValue, 150);
  assert.equal(summary.realizedGain, 50);
  assert.equal(summary.unrealizedGain, 50);
});
