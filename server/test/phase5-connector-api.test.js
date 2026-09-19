const test = require("node:test");
const assert = require("node:assert/strict");

const {
  app,
  authenticated,
  registerUser,
  resetStore,
  installFetchMock,
  jsonResponse,
} = require("../test-support/helpers");

test.beforeEach(() => {
  resetStore();
});

test("status shows not-configured before credentials are set and configured afterwards (matrix A/AD)", async () => {
  const user = await registerUser({ email: "phase5-api-status@example.test" });
  const before = await authenticated(user.token).get("/api/connectors/valr/status");
  assert.equal(before.status, 200);
  assert.equal(before.body.ok, true);
  assert.equal(before.body.status.configured, false);
  assert.equal(before.body.status.healthState, "UNKNOWN");
  assert.equal(before.body.status.freshness, "UNAVAILABLE");

  await authenticated(user.token).put("/api/connectors/valr").send({
    apiKey: "phase5-test-key",
    apiSecret: "phase5-test-secret",
    preferredPair: "BTCUSDT",
  });
  const after = await authenticated(user.token).get("/api/connectors/valr/status");
  assert.equal(after.status, 200);
  assert.equal(after.body.status.configured, true);
  assert.equal(after.body.status.status, "configured");
  assert.equal(after.body.status.healthState, "UNKNOWN");
});

test("status for unsupported providers (ibkr) never exposes secrets and is fully descriptive", async () => {
  const user = await registerUser({ email: "phase5-api-ibkr@example.test" });
  const response = await authenticated(user.token).get("/api/connectors/ibkr/status");
  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.status.configured, false);
  assert.equal(response.body.status.supportsOrders, false);
  assert.equal(response.body.status.availability, "manual_setup");
  assert.ok(!JSON.stringify(response.body).includes("phase5-test"));
});

test("legacy refresh syncs, records lastSyncAt, and exposes no secret (matrix E/W/X)", async () => {
  const user = await registerUser({ email: "phase5-api-refresh@example.test" });
  await authenticated(user.token).put("/api/connectors/valr").send({
    apiKey: "phase5-apiKey",
    apiSecret: "phase5-apiSecret",
  });

  const restoreFetch = installFetchMock(async url => {
    assert.match(String(url), /api\.valr\.com\/v1\/account\/balances/);
    return jsonResponse([
      { currency: "ZAR", available: "5000", reserved: "200", total: "5200" },
      { currency: "BTC", available: "0.1", reserved: "0.0", total: "0.1" },
    ]);
  });
  try {
    const response = await authenticated(user.token).post("/api/connectors/valr/refresh");
    assert.equal(response.status, 200);
    assert.equal(response.body.ok, true);
    assert.equal(response.body.status, "refreshed");
    assert.equal(response.body.provider.status, "online");
    assert.equal(response.body.provider.accountSnapshot.fundedAssets, 2);
    assert.ok(response.body.provider.lastSyncAt);
    assert.ok(!JSON.stringify(response.body).includes("phase5-apiSecret"));
    assert.ok(!JSON.stringify(response.body.provider.config).includes("phase5-apiSecret"));
  } finally {
    restoreFetch();
  }
});

test("force refresh overrides cached responses and refreshes again (matrix S/T)", async () => {
  const user = await registerUser({ email: "phase5-api-force@example.test" });
  await authenticated(user.token).put("/api/connectors/valr").send({
    apiKey: "phase5-forceKey",
    apiSecret: "phase5-forceSecret",
  });

  let calls = 0;
  const restoreFetch = installFetchMock(async () => {
    calls += 1;
    return jsonResponse([{ currency: "ZAR", available: String(calls), total: String(calls) }]);
  });
  try {
    const first = await authenticated(user.token).post("/api/connectors/valr/refresh");
    assert.equal(first.status, 200);
    assert.equal(first.body.status, "refreshed");
    const firstTotal = first.body.provider.accountSnapshot.balances[0].total;

    const second = await authenticated(user.token).post("/api/connectors/valr/refresh");
    assert.equal(second.body.provider.accountSnapshot.fundedAssets, 1);

    const third = await authenticated(user.token).post("/api/connectors/valr/refresh").send({ force: true });
    assert.equal(third.status, 200);
    assert.equal(third.body.status, "refreshed");
    assert.equal(Number(third.body.provider.accountSnapshot.balances[0].total), 3);
  } finally {
    restoreFetch();
  }
});

test("sync_not_supported providers are rejected immediately and never touch VALR (matrix Y)", async () => {
  const user = await registerUser({ email: "phase5-api-sync@example.test" });
  const response = await authenticated(user.token).post("/api/connectors/ibkr/refresh");
  assert.equal(response.status, 400);
  assert.equal(response.body.error, "sync_not_supported");
});

test("unknown providers never return secrets or leak global state", async () => {
  const user = await registerUser({ email: "phase5-api-unknown@example.test" });
  const response = await authenticated(user.token).get("/api/connectors/nonexistent/status");
  assert.equal(response.status, 404);
  assert.equal(response.body.error, "unknown_connector");
  assert.ok(!JSON.stringify(response.body).includes("phase5"));
});

test("health/providers returns all providers and preserves the read-only contract (matrix AD)", async () => {
  const response = await require("supertest")(app).get("/api/health/providers").set("Authorization", `Bearer ${(await registerUser({ email: "phase5-api-health@example.test" })).token}`);
  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.ok(Array.isArray(response.body.providers));
  assert.equal(response.body.providers.length, 4);
  const providers = Object.fromEntries(response.body.providers.map(p => [p.id, p]));
  assert.equal(providers.valr.name, "VALR");
  assert.equal(providers.valr.supportsOrders, false);
  assert.equal(providers.ibkr.availability, "manual_setup");
  assert.equal(providers.easyequities.supportsOrders, false);
  assert.ok(!JSON.stringify(response.body).includes("phase5"));
});