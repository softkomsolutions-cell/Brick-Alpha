const test = require("node:test");
const assert = require("node:assert/strict");

const { createConnectorProviderRegistry } = require("../services/connectors/providers");
const { classifyFailure } = require("../services/connectors/failure");
const { encryptConnectorPayload, decryptConnectorPayload, maskValue } = require("../services/connectors/cipher");

const SECRET = "phase5-provider-test-secret";
const CREDENTIALS = { apiKey: "key-abcdef123456", apiSecret: "secret-abcdef1234567890" };

function registryWithFetch(fetchFn, config = {}) {
  return createConnectorProviderRegistry({ config, fetchFn });
}

function jsonResponse(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", ...extraHeaders },
  });
}

test("VALR provider is read-only: only GET /v1/account/balances ever issued, no order endpoints reachable", async () => {
  const calls = [];
  const registry = registryWithFetch(async (url, options) => {
    calls.push({ url: String(url), method: options?.method || "GET" });
    return jsonResponse([
      { currency: "BTC", available: "0.25", reserved: "0.05", total: "0.30" },
      { currency: "ZAR", available: "1000", reserved: "100", total: "1100" },
    ]);
  });
  const valr = registry.get("valr");
  const snapshot = await valr.fetchPortfolioSnapshot(CREDENTIALS, { config: { subAccountId: "" } });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "GET");
  assert.match(calls[0].url, /\/v1\/account\/balances$/);
  assert.ok(!/\/order/.test(calls[0].url), "no order endpoint may be contacted");
  assert.equal(valr.supportsOrders, false);

  assert.equal(snapshot.totalAssets, 2);
  assert.equal(snapshot.fundedAssets, 2);
  const byCurrency = Object.fromEntries(snapshot.balances.map(b => [b.currency, b]));
  assert.deepEqual(byCurrency.BTC, { currency: "BTC", available: 0.25, reserved: 0.05, total: 0.3 });
  assert.deepEqual(byCurrency.ZAR, { currency: "ZAR", available: 1000, reserved: 100, total: 1100 });
  assert.equal(snapshot.balances[0].currency, "ZAR", "balances sort largest total first");
});

test("VALR requests carry the HMAC signature headers and never the raw secret in a query", async () => {
  let captured = null;
  const registry = registryWithFetch(async (url, options) => {
    captured = { url: String(url), headers: options?.headers || {} };
    return jsonResponse([]);
  });
  await registry.get("valr").fetchPortfolioSnapshot(CREDENTIALS, { config: {} });
  assert.ok(captured.headers["X-VALR-API-KEY"]);
  assert.ok(captured.headers["X-VALR-TIMESTAMP"]);
  assert.ok(captured.headers["X-VALR-SIGNATURE"]);
  assert.ok(!String(captured.url).includes("secret-abcdef"));
});

test("VALR health returns available when the read-only probe succeeds", async () => {
  const registry = registryWithFetch(async () => jsonResponse([{ currency: "ZAR", available: "1", total: "1" }]));
  const probe = await registry.get("valr").health(CREDENTIALS, { config: {} });
  assert.equal(probe.available, true);
  assert.equal(probe.state, "healthy");
});

test("VALR http failures are classified with status codes for the failure pipeline", async () => {
  const registry429 = registryWithFetch(async () => jsonResponse({ message: "too fast" }, 429, { "retry-after": "30" }));
  try {
    await registry429.get("valr").fetchPortfolioSnapshot(CREDENTIALS, { config: {} });
    assert.fail("expected 429 to throw");
  } catch (error) {
    assert.equal(error.status, 429);
    assert.equal(classifyFailure(error).failureClass, "RATE_LIMITED");
  }

  const registry401 = registryWithFetch(async () => jsonResponse({ message: "nope" }, 401));
  try {
    await registry401.get("valr").fetchPortfolioSnapshot(CREDENTIALS, { config: {} });
    assert.fail("expected 401 to throw");
  } catch (error) {
    assert.equal(classifyFailure(error).failureClass, "AUTH_FAILED");
  }

  const registry503 = registryWithFetch(async () => jsonResponse({ message: "unavailable" }, 503));
  try {
    await registry503.get("valr").fetchPortfolioSnapshot(CREDENTIALS, { config: {} });
    assert.fail("expected 503 to throw");
  } catch (error) {
    assert.equal(classifyFailure(error).failureClass, "PROVIDER_UNAVAILABLE");
  }
});

test("VALR abort/timeout surfaces as TIMEOUT and can be auto-retried", async () => {
  const registry = registryWithFetch(async (_url, options) => {
    const signal = options?.signal;
    if (signal) {
      await new Promise(resolve => setTimeout(resolve, 20));
      if (signal.aborted) {
        throw Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
      }
    }
    return jsonResponse([]);
  });
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 5);
  try {
    await registry.get("valr").fetchPortfolioSnapshot(CREDENTIALS, { config: {}, signal: controller.signal });
    assert.fail("expected abort");
  } catch (error) {
    assert.equal(classifyFailure(error).failureClass, "TIMEOUT");
  }
});

test("manual providers answer configured() and never fabricate a portfolio snapshot", async () => {
  const registry = registryWithFetch(async () => jsonResponse([]));
  for (const id of ["ibkr", "saxo", "easyequities"]) {
    const provider = registry.get(id);
    assert.equal(provider.supportsOrders, false);
    await assert.rejects(
      provider.fetchPortfolioSnapshot({ apiKey: "x", apiSecret: "y" }, { config: {} }),
      /sync_not_supported/,
    );
  }
  assert.equal(
    registry.get("ibkr").configured({ config: { gatewayUrl: "https://gw", accountId: "U123" } }),
    true,
  );
  assert.equal(registry.get("saxo").configured({ authBlob: "blob" }), true);
  assert.equal(registry.get("easyequities").configured({ config: { accountLabel: "L" } }), true);
});

test("connector cipher round-trips credentials and masking never exposes the secret", async () => {
  const blob = encryptConnectorPayload(CREDENTIALS, SECRET);
  assert.deepEqual(decryptConnectorPayload(blob, SECRET), CREDENTIALS);
  assert.equal(decryptConnectorPayload("garbage", SECRET), null);
  assert.equal(decryptConnectorPayload(blob, "wrong-secret"), null);
  assert.equal(maskValue("key-abcdef123456"), "key-ab...3456");
  assert.ok(!maskValue("key-abcdef123456").includes("abcdef"));
});