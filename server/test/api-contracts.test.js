const test = require("node:test");
const assert = require("node:assert/strict");

const {
  app,
  authenticated,
  installFetchMock,
  jsonResponse,
  registerUser,
  resetStore,
  support,
} = require("../test-support/helpers");

test.beforeEach(() => {
  resetStore();
});

test("GET /api/health preserves the current health response shape", async () => {
  const response = await require("supertest")(app).get("/api/health");

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(typeof response.body.services, "object");
  assert.equal(typeof response.body.metrics, "object");
  assert.ok(Array.isArray(response.body.sources));
  assert.ok(Array.isArray(response.body.marketSources));
  assert.ok(Array.isArray(response.body.connectors));
});

test("auth register, login, me, and password reset preserve current contracts", async () => {
  const email = "auth-contract@example.test";
  const password = "Phase0-password-123";
  const registered = await require("supertest")(app)
    .post("/api/auth/register")
    .send({ name: "Auth Contract", email, password });

  assert.equal(registered.status, 201);
  assert.deepEqual(Object.keys(registered.body).sort(), ["ok", "settings", "token", "user"]);
  assert.equal(registered.body.ok, true);
  assert.equal(typeof registered.body.token, "string");
  assert.equal(typeof registered.body.user.id, "string");
  assert.equal(registered.body.user.email, email);
  assert.equal(typeof registered.body.settings, "object");

  const login = await require("supertest")(app)
    .post("/api/auth/login")
    .send({ email, password });
  assert.equal(login.status, 200);
  assert.deepEqual(Object.keys(login.body).sort(), ["ok", "settings", "token", "user"]);

  const me = await authenticated(login.body.token).get("/api/auth/me");
  assert.equal(me.status, 200);
  assert.deepEqual(Object.keys(me.body).sort(), ["ok", "settings", "user"]);
  assert.equal(me.body.user.email, email);

  const resetRequest = await require("supertest")(app)
    .post("/api/auth/forgot-password/request")
    .send({ email });
  assert.equal(resetRequest.status, 200);
  assert.equal(resetRequest.body.ok, true);
  assert.equal(typeof resetRequest.body.message, "string");
  assert.match(resetRequest.body.demoCode, /^\d{6}$/);
  assert.equal(typeof resetRequest.body.expiresAt, "string");

  const resetConfirm = await require("supertest")(app)
    .post("/api/auth/forgot-password/confirm")
    .send({
      email,
      code: resetRequest.body.demoCode,
      password: "Phase0-password-456",
    });
  assert.equal(resetConfirm.status, 200);
  assert.deepEqual(Object.keys(resetConfirm.body).sort(), ["message", "ok"]);

  const loginAfterReset = await require("supertest")(app)
    .post("/api/auth/login")
    .send({ email, password: "Phase0-password-456" });
  assert.equal(loginAfterReset.status, 200);
  assert.equal(loginAfterReset.body.ok, true);
});

test("GET /api/collectibles and GET /api/portfolio preserve current shapes", async () => {
  const user = await registerUser();
  const collectibles = await require("supertest")(app).get("/api/collectibles");
  assert.equal(collectibles.status, 200);
  assert.ok(Array.isArray(collectibles.body.items));
  assert.ok(Array.isArray(collectibles.body.categories));
  assert.ok(Array.isArray(collectibles.body.brands));
  assert.ok(Array.isArray(collectibles.body.referenceShelves));

  const portfolio = await authenticated(user.token).get("/api/portfolio");
  assert.equal(portfolio.status, 200);
  assert.ok(Array.isArray(portfolio.body));
  assert.equal(portfolio.body.length, 0);
});

test("settings GET and PUT preserve the current response envelope", async () => {
  const user = await registerUser();
  const initial = await authenticated(user.token).get("/api/settings");
  assert.equal(initial.status, 200);
  assert.deepEqual(Object.keys(initial.body), ["ok", "settings"]);

  const updated = await authenticated(user.token)
    .put("/api/settings")
    .send({ riskMode: "defensive", preferredRegion: "global" });
  assert.equal(updated.status, 200);
  assert.deepEqual(Object.keys(updated.body), ["ok", "settings"]);
  assert.equal(updated.body.settings.riskMode, "defensive");
  assert.equal(updated.body.settings.preferredRegion, "global");
});

test("watchlist, alerts, notifications, and routine preserve current contracts", async () => {
  const user = await registerUser();
  const signals = await require("supertest")(app).get("/api/signals");
  const signal = signals.body.signals[0];
  assert.ok(signal);

  const watchlistInitial = await authenticated(user.token).get("/api/watchlist");
  assert.equal(watchlistInitial.status, 200);
  assert.ok(Array.isArray(watchlistInitial.body.items));

  const watchlistCreated = await authenticated(user.token)
    .post("/api/watchlist")
    .send({ ticker: signal.ticker, label: signal.label, desk: signal.desk });
  assert.equal(watchlistCreated.status, 201);
  assert.equal(watchlistCreated.body.ok, true);
  assert.ok(watchlistCreated.body.item);
  assert.ok(Array.isArray(watchlistCreated.body.items));

  const alertCreated = await authenticated(user.token)
    .post("/api/alerts")
    .send({
      ticker: signal.ticker,
      label: signal.label,
      desk: signal.desk,
      kind: "price_above",
      threshold: 0,
    });
  assert.equal(alertCreated.status, 201);
  assert.equal(alertCreated.body.ok, true);
  assert.ok(Array.isArray(alertCreated.body.items));
  assert.equal(typeof alertCreated.body.summary, "object");
  assert.equal(typeof alertCreated.body.plan, "object");
  assert.equal(typeof alertCreated.body.deliverySummary, "object");
  assert.ok(Array.isArray(alertCreated.body.deliveryQueue));

  support.runEngineTick();

  const notifications = await authenticated(user.token).get("/api/notifications");
  assert.equal(notifications.status, 200);
  assert.ok(Array.isArray(notifications.body.items));
  assert.equal(typeof notifications.body.summary, "object");
  assert.ok(notifications.body.items.length > 0);

  const notificationUpdate = await authenticated(user.token)
    .patch(`/api/notifications/${notifications.body.items[0].id}`)
    .send({ status: "read" });
  assert.equal(notificationUpdate.status, 200);
  assert.equal(notificationUpdate.body.ok, true);
  assert.ok(Array.isArray(notificationUpdate.body.items));
  assert.equal(typeof notificationUpdate.body.summary, "object");

  const markAllRead = await authenticated(user.token)
    .post("/api/notifications/mark-all-read")
    .send({});
  assert.equal(markAllRead.status, 200);
  assert.ok(Array.isArray(markAllRead.body.items));

  const alertList = await authenticated(user.token).get("/api/alerts");
  assert.equal(alertList.status, 200);
  assert.ok(Array.isArray(alertList.body.items));

  const alertId = alertCreated.body.item.id;
  const alertPatched = await authenticated(user.token)
    .patch(`/api/alerts/${alertId}`)
    .send({ enabled: false });
  assert.equal(alertPatched.status, 200);
  assert.ok(Array.isArray(alertPatched.body.items));

  const alertDeleted = await authenticated(user.token).delete(`/api/alerts/${alertId}`);
  assert.equal(alertDeleted.status, 200);
  assert.ok(Array.isArray(alertDeleted.body.items));

  const routine = await authenticated(user.token).get("/api/session-routine");
  assert.equal(routine.status, 200);
  assert.equal(routine.body.ok, true);
  assert.equal(typeof routine.body.routine, "object");
  assert.ok(Array.isArray(routine.body.routine.completedStepIds));

  const routineUpdated = await authenticated(user.token)
    .put("/api/session-routine")
    .send({ stepId: "macro", completed: true });
  assert.equal(routineUpdated.status, 200);
  assert.equal(typeof routineUpdated.body.routine, "object");

  const watchId = watchlistCreated.body.item.id;
  const watchlistDeleted = await authenticated(user.token).delete(`/api/watchlist/${watchId}`);
  assert.equal(watchlistDeleted.status, 200);
  assert.ok(Array.isArray(watchlistDeleted.body.items));
});

test("news targets preserve current GET and POST contracts", async () => {
  const user = await registerUser();
  const initial = await authenticated(user.token).get("/api/news/targets");
  assert.equal(initial.status, 200);
  assert.equal(initial.body.ok, true);
  assert.ok(Array.isArray(initial.body.items));

  const created = await authenticated(user.token)
    .post("/api/news/targets")
    .send({ target: "Phase 0 contract target" });
  assert.equal(created.status, 201);
  assert.equal(created.body.ok, true);
  assert.ok(created.body.items.includes("Phase 0 contract target"));
});

test("feedback GET, POST, and PATCH preserve current contracts", async () => {
  const user = await registerUser();
  const initial = await authenticated(user.token).get("/api/feedback");
  assert.equal(initial.status, 200);
  assert.equal(initial.body.ok, true);
  assert.ok(Array.isArray(initial.body.items));
  assert.equal(typeof initial.body.summary, "object");
  assert.equal(typeof initial.body.permissions, "object");

  const created = await authenticated(user.token)
    .post("/api/feedback")
    .send({
      title: "Phase 0 feedback contract",
      area: "backend",
      type: "improvement",
      severity: "low",
      notes: "This feedback exists to freeze the current API response contract.",
    });
  assert.equal(created.status, 201);
  assert.equal(created.body.ok, true);
  assert.ok(created.body.item);
  assert.ok(Array.isArray(created.body.items));
  assert.equal(typeof created.body.summary, "object");
  assert.equal(typeof created.body.permissions, "object");

  const updated = await authenticated(user.token)
    .patch(`/api/feedback/${created.body.item.id}`)
    .send({ status: "resolved" });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.ok, true);
  assert.equal(updated.body.item.status, "resolved");
  assert.ok(Array.isArray(updated.body.items));
});

test("connector GET, PUT, test, sync, and DELETE preserve current contracts with mocked VALR", async () => {
  const user = await registerUser();
  const initial = await authenticated(user.token).get("/api/connectors");
  assert.equal(initial.status, 200);
  assert.equal(initial.body.ok, true);
  assert.equal(initial.body.providers.length, 4);

  const saved = await authenticated(user.token)
    .put("/api/connectors/valr")
    .send({
      apiKey: "phase0-api-key",
      apiSecret: "phase0-api-secret",
      preferredPair: "BTCUSDT",
    });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.ok, true);
  assert.equal(typeof saved.body.provider, "object");
  assert.equal(saved.body.provider.config.apiKeyMasked, "phase0...-key");

  const restoreFetch = installFetchMock(async (url) => {
    assert.match(String(url), /api\.valr\.com\/v1\/account\/balances/);
    return jsonResponse([
      { currency: "ZAR", available: "10", reserved: "1", total: "11" },
    ]);
  });

  try {
    const tested = await authenticated(user.token).post("/api/connectors/valr/test");
    assert.equal(tested.status, 200);
    assert.equal(tested.body.ok, true);
    assert.equal(typeof tested.body.provider, "object");

    const synced = await authenticated(user.token).post("/api/connectors/valr/sync");
    assert.equal(synced.status, 200);
    assert.equal(synced.body.ok, true);
    assert.equal(synced.body.provider.accountSnapshot.fundedAssets, 1);
  } finally {
    restoreFetch();
  }

  const deleted = await authenticated(user.token).delete("/api/connectors/valr");
  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.ok, true);
  assert.equal(typeof deleted.body.provider.configured, "boolean");
  assert.equal(deleted.body.provider.config.preferredPair, "BTCUSDT");
});

test("market and collectible trade mutations preserve current envelopes", async () => {
  const user = await registerUser();
  const signals = await require("supertest")(app).get("/api/signals");
  const signal = signals.body.signals[0];
  const collectible = (await require("supertest")(app).get("/api/collectibles")).body.items[0];

  const marketTrade = await authenticated(user.token)
    .post("/api/trades")
    .send({
      marketTicker: signal.ticker,
      side: "BUY",
      quantity: 1,
      orderNote: "Phase 0 market trade",
      stopPrice: signal.tradePlan.buy.stopPrice,
      targetPrice: signal.tradePlan.buy.targetPrice,
      riskBudget: 500,
    });
  assert.equal(marketTrade.status, 201);
  assert.equal(marketTrade.body.ok, true);
  assert.ok(marketTrade.body.trade);
  assert.ok(Array.isArray(marketTrade.body.portfolio));
  assert.equal(typeof marketTrade.body.execution, "object");

  const collectibleBuy = await authenticated(user.token)
    .post("/api/collectibles/trades")
    .send({ collectibleId: collectible.id, side: "BUY", quantity: 1 });
  assert.equal(collectibleBuy.status, 201);
  assert.equal(collectibleBuy.body.ok, true);
  assert.ok(collectibleBuy.body.trade);
  assert.ok(Array.isArray(collectibleBuy.body.portfolio));
  assert.equal(typeof collectibleBuy.body.execution, "object");

  const collectibleSell = await authenticated(user.token)
    .post("/api/collectibles/trades")
    .send({ collectibleId: collectible.id, side: "SELL", quantity: 1 });
  assert.equal(collectibleSell.status, 201);
  assert.equal(collectibleSell.body.ok, true);

  const closed = await authenticated(user.token)
    .post(`/api/trades/${marketTrade.body.trade.id}/close`)
    .send({ orderNote: "Phase 0 close" });
  assert.equal(closed.status, 200);
  assert.equal(closed.body.ok, true);
  assert.equal(closed.body.trade.status, "closed");
  assert.equal(typeof closed.body.trade.pnlAmount, "number");
  assert.ok(Array.isArray(closed.body.portfolio));
  assert.equal(typeof closed.body.execution, "object");
});
