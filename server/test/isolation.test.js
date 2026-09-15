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

test("user-scoped portfolio, watchlist, alerts, notifications, and connectors are isolated", async () => {
  const userA = await registerUser({ email: "isolation-a@example.test" });
  const userB = await registerUser({ email: "isolation-b@example.test" });
  const signals = await require("supertest")(app).get("/api/signals");
  const signal = signals.body.signals[0];
  const collectible = (await require("supertest")(app).get("/api/collectibles")).body.items[0];

  const tradeA = await authenticated(userA.token)
    .post("/api/trades")
    .send({ marketTicker: signal.ticker, side: "BUY", quantity: 1 });
  const watchA = await authenticated(userA.token)
    .post("/api/watchlist")
    .send({ ticker: signal.ticker, label: signal.label, desk: signal.desk });
  const alertA = await authenticated(userA.token)
    .post("/api/alerts")
    .send({ ticker: signal.ticker, label: signal.label, desk: signal.desk, kind: "price_above", threshold: 0 });
  await authenticated(userA.token)
    .put("/api/connectors/ibkr")
    .send({ gatewayUrl: "https://gateway.example.test", accountId: "A-ACCOUNT" });

  const tradeB = await authenticated(userB.token)
    .post("/api/collectibles/trades")
    .send({ collectibleId: collectible.id, side: "BUY", quantity: 1 });
  const watchB = await authenticated(userB.token)
    .post("/api/watchlist")
    .send({ ticker: signal.ticker, label: signal.label, desk: signal.desk });
  const alertB = await authenticated(userB.token)
    .post("/api/alerts")
    .send({ ticker: signal.ticker, label: signal.label, desk: signal.desk, kind: "price_above", threshold: 0 });
  await authenticated(userB.token)
    .put("/api/connectors/ibkr")
    .send({ gatewayUrl: "https://gateway.example.test", accountId: "B-ACCOUNT" });

  support.runEngineTick();

  const portfolioA = await authenticated(userA.token).get("/api/portfolio");
  const portfolioB = await authenticated(userB.token).get("/api/portfolio");
  assert.equal(portfolioA.body.length, 1);
  assert.equal(portfolioA.body[0].id, tradeA.body.trade.id);
  assert.equal(portfolioB.body.length, 1);
  assert.equal(portfolioB.body[0].id, tradeB.body.trade.id);

  const watchlistA = await authenticated(userA.token).get("/api/watchlist");
  const watchlistB = await authenticated(userB.token).get("/api/watchlist");
  assert.equal(watchlistA.body.items.length, 1);
  assert.equal(watchlistA.body.items[0].id, watchA.body.item.id);
  assert.equal(watchlistB.body.items.length, 1);
  assert.equal(watchlistB.body.items[0].id, watchB.body.item.id);

  const alertsA = await authenticated(userA.token).get("/api/alerts");
  const alertsB = await authenticated(userB.token).get("/api/alerts");
  assert.equal(alertsA.body.items.length, 1);
  assert.equal(alertsA.body.items[0].id, alertA.body.item.id);
  assert.equal(alertsB.body.items.length, 1);
  assert.equal(alertsB.body.items[0].id, alertB.body.item.id);

  const notificationsA = await authenticated(userA.token).get("/api/notifications");
  const notificationsB = await authenticated(userB.token).get("/api/notifications");
  assert.ok(notificationsA.body.items.length > 0);
  assert.ok(notificationsB.body.items.length > 0);
  assert.notEqual(notificationsA.body.items[0].id, notificationsB.body.items[0].id);

  const connectorsA = await authenticated(userA.token).get("/api/connectors");
  const connectorsB = await authenticated(userB.token).get("/api/connectors");
  const ibkrA = connectorsA.body.providers.find((provider) => provider.id === "ibkr");
  const ibkrB = connectorsB.body.providers.find((provider) => provider.id === "ibkr");
  assert.equal(ibkrA.config.accountId, "A-ACCOUNT");
  assert.equal(ibkrB.config.accountId, "B-ACCOUNT");
});

test("a user cannot mutate another user's user-scoped records by identifier", async () => {
  const userA = await registerUser({ email: "mutate-a@example.test" });
  const userB = await registerUser({ email: "mutate-b@example.test" });
  const signals = await require("supertest")(app).get("/api/signals");
  const signal = signals.body.signals[0];

  const tradeA = await authenticated(userA.token)
    .post("/api/trades")
    .send({ marketTicker: signal.ticker, side: "BUY", quantity: 1 });
  const watchA = await authenticated(userA.token)
    .post("/api/watchlist")
    .send({ ticker: signal.ticker, label: signal.label, desk: signal.desk });
  const alertA = await authenticated(userA.token)
    .post("/api/alerts")
    .send({ ticker: signal.ticker, label: signal.label, desk: signal.desk, kind: "price_above", threshold: 0 });

  const closeOtherTrade = await authenticated(userB.token)
    .post(`/api/trades/${tradeA.body.trade.id}/close`)
    .send({});
  assert.equal(closeOtherTrade.status, 404);
  assert.equal(closeOtherTrade.body.error, "unknown_trade");

  const deleteOtherWatch = await authenticated(userB.token).delete(`/api/watchlist/${watchA.body.item.id}`);
  assert.equal(deleteOtherWatch.status, 404);
  assert.equal(deleteOtherWatch.body.error, "unknown_watchlist_item");

  const patchOtherAlert = await authenticated(userB.token)
    .patch(`/api/alerts/${alertA.body.item.id}`)
    .send({ enabled: false });
  assert.equal(patchOtherAlert.status, 404);
  assert.equal(patchOtherAlert.body.error, "unknown_alert");

  await authenticated(userB.token)
    .put("/api/settings")
    .send({ preferredRegion: "global" });
  const settingsA = await authenticated(userA.token).get("/api/settings");
  assert.equal(settingsA.body.settings.preferredRegion, "south-africa");
});
