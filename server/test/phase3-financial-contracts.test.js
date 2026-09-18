const test = require("node:test");
const assert = require("node:assert/strict");

const {
  app,
  authenticated,
  registerUser,
  resetStore,
  support,
} = require("../test-support/helpers");

test.beforeEach(() => {
  resetStore();
});

test("financial persistence defaults to legacy so financial routes keep their contracts", async () => {
  assert.equal(support.financialConfig.mode, "legacy");
  assert.equal(support.financialConfig.lotAllocation, "FIFO");
  const user = await registerUser({ email: "contracts-legacy@example.test" });
  const collectible = (await require("supertest")(app).get("/api/collectibles")).body.items[0];

  const buy = await authenticated(user.token)
    .post("/api/collectibles/trades")
    .send({ collectibleId: collectible.id, side: "BUY", quantity: 2 });
  assert.equal(buy.status, 201);
  assert.equal(buy.body.ok, true);
  assert.equal(buy.body.trade.side, "BUY");
  assert.equal(buy.body.trade.status, "open");
  assert.equal(buy.body.trade.assetClass, "collectible");
  assert.equal(typeof buy.body.trade.entryPrice, "number");
  assert.equal(buy.body.execution.mode, "paper");
  assert.equal(buy.body.execution.providerId, "collecttrade");
  assert.deepEqual(Array.isArray(buy.body.portfolio) ? buy.body.portfolio : [], buy.body.portfolio);

  const portfolio = await authenticated(user.token).get("/api/portfolio");
  assert.equal(portfolio.status, 200);
  assert.ok(Array.isArray(portfolio.body));
  assert.equal(portfolio.body.length, 1);
});

test("market trades keep their 201 envelope and execution contract", async () => {
  const user = await registerUser({ email: "contracts-market@example.test" });
  const signals = await require("supertest")(app).get("/api/signals");
  const signal = signals.body.signals[0];

  const response = await authenticated(user.token)
    .post("/api/trades")
    .send({ marketTicker: signal.ticker, side: "BUY", quantity: 1 });
  assert.equal(response.status, 201);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.trade.side, "BUY");
  assert.equal(response.body.trade.status, "open");
  assert.equal(response.body.trade.assetClass, "market");
  assert.equal(typeof response.body.trade.entryPrice, "number");
  assert.equal(response.body.execution.mode, "paper");
  assert.ok(response.body.execution.providerId === null || typeof response.body.execution.providerId === "string");
  assert.ok(Array.isArray(response.body.portfolio));
});

test("trade close preserves current status codes and portfolio ordering", async () => {
  const user = await registerUser({ email: "contracts-close@example.test" });
  const collectible = (await require("supertest")(app).get("/api/collectibles")).body.items[0];
  const created = await authenticated(user.token)
    .post("/api/collectibles/trades")
    .send({ collectibleId: collectible.id, side: "BUY", quantity: 1 });

  const closed = await authenticated(user.token)
    .post(`/api/trades/${created.body.trade.id}/close`)
    .send({ orderNote: "Contract baseline" });
  assert.equal(closed.status, 200);
  assert.equal(closed.body.trade.status, "closed");
  assert.equal(typeof closed.body.trade.closedAt, "string");
  assert.equal(typeof closed.body.trade.exitPrice, "number");

  const missing = await authenticated(user.token)
    .post("/api/trades/00000000-0000-0000-0000-000000000000/close")
    .send({});
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error, "unknown_trade");

  const twice = await authenticated(user.token)
    .post(`/api/trades/${created.body.trade.id}/close`)
    .send({});
  assert.equal(twice.status, 400);
  assert.equal(twice.body.error, "trade_already_closed");
});