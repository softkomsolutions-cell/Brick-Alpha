const test = require("node:test");
const assert = require("node:assert/strict");

const { createMemoryConnectorRepository } = require("../test-support/connector-memory");
const { createConnectorService } = require("../services/connector-service");
const { createConnectorProviderRegistry } = require("../services/connectors/providers");

const HOUR = 60 * 60 * 1000;
const CONFIG = {
  mode: "postgres",
  refreshAfterMs: 24 * HOUR,
  reviewMs: 72 * HOUR,
  providerTimeoutMs: 2000,
  backoffMs: 60 * 1000,
  jobTimeoutMs: 2000,
  jobMaxAttempts: 3,
  jobPollIntervalMs: 50,
  jobGraceMs: 300,
  jobClaimLimit: 20,
  jobsEnabled: true,
};

const CREDENTIALS = { apiKey: "key-phase5-domain", apiSecret: "secret-phase5-domain" };

function jsonBody(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json", ...headers } });
}

function balancesResponse(rows = [
  { currency: "BTC", available: "0.25", reserved: "0.05", total: "0.30" },
  { currency: "ZAR", available: "1000", reserved: "100", total: "1100" },
]) {
  return () => jsonBody(rows);
}

function harness(fetchFn = balancesResponse()) {
  const repository = createMemoryConnectorRepository();
  const providers = createConnectorProviderRegistry({ config: {}, fetchFn });
  const service = createConnectorService({ repository, providers, config: CONFIG });
  return { repository, providers, service };
}

test("a successful refresh persists a snapshot, marks the account ONLINE/HEALTHY, and records freshness", async () => {
  const { repository, service } = harness();
  await repository.seedUser("user-a");

  const result = await service.refreshSnapshot({
    userId: "user-a",
    providerId: "valr",
    credentials: CREDENTIALS,
    record: { status: "configured", config: {} },
  });

  assert.equal(result.status, "refreshed");
  assert.equal(result.snapshot.totalAssets, 2);
  assert.equal(result.snapshot.fundedAssets, 2);

  const status = await service.status({ userId: "user-a", providerId: "valr" });
  assert.equal(status.configured, true);
  assert.equal(status.status, "online");
  assert.equal(status.healthState, "HEALTHY");
  assert.equal(status.freshness, "FRESH");
  assert.equal(status.snapshotCount, 1);
  assert.equal(status.latestSnapshot.balances.length, 2);

  const account = await repository.getAccount("user-a", "valr");
  assert.equal(account.lastSyncAt, result.snapshot.fetchedAt);
});

test("snapshot history is retained and never silently overwritten (matrix F)", async () => {
  const { repository, service } = harness(() => jsonBody([
    { currency: "BTC", available: "0.2", total: "0.2" },
    { currency: "ZAR", available: "500", total: "500" },
  ]));
  await repository.seedUser("user-a");

  await service.refreshSnapshot({ userId: "user-a", providerId: "valr", credentials: CREDENTIALS, record: { status: "configured" } });
  await service.refreshSnapshot({ userId: "user-a", providerId: "valr", credentials: CREDENTIALS, record: { status: "configured" }, force: true });

  const account = await repository.getAccount("user-a", "valr");
  assert.equal(await repository.countSnapshots(account.id), 2);
  const snapshots = await repository.listSnapshots(account.id);
  assert.equal(snapshots.length, 2);
  assert.ok(snapshots[0].fetchedAt >= snapshots[1].fetchedAt);
  assert.deepEqual(snapshots[0].balances.map(b => b.currency), ["BTC", "ZAR"]);
});

test("stale accounts refresh, fresh accounts are skipped, and force always wins (matrix R/S)", async () => {
  const { repository, service } = harness();
  await repository.seedUser("user-a");
  const account = await repository.ensureAccount({
    userId: "user-a",
    providerId: "valr",
    record: { status: "configured", config: {}, lastSyncAt: new Date(Date.now() - 30 * HOUR).toISOString() },
    now: Date.now(),
  });

  const stale = await service.refreshSnapshot({ userId: "user-a", providerId: "valr", credentials: CREDENTIALS, record: { status: "configured" } });
  assert.notEqual(stale.skipped, "fresh");

  const fresh = await service.refreshSnapshot({ userId: "user-a", providerId: "valr", credentials: CREDENTIALS, record: { status: "online" } });
  assert.equal(fresh.skipped, "fresh");
  assert.equal(await repository.countSnapshots(account.id), 1);

  const forced = await service.refreshSnapshot({ userId: "user-a", providerId: "valr", credentials: CREDENTIALS, record: { status: "online" }, force: true });
  assert.equal(forced.status, "refreshed");
  assert.equal(await repository.countSnapshots(account.id), 2);
});

test("provider timeout degrades health and never swallows the failure code (matrix G)", async () => {
  const { repository, service } = harness(async () => {
    throw Object.assign(new Error("The request was aborted"), { name: "AbortError" });
  });
  await repository.seedUser("user-a");

  await assert.rejects(
    service.refreshSnapshot({ userId: "user-a", providerId: "valr", credentials: CREDENTIALS, record: { status: "configured" } }),
    error => error?.code === "connector_refresh_failed" && error?.failure?.failureClass === "TIMEOUT",
  );

  const status = await service.status({ userId: "user-a", providerId: "valr" });
  assert.equal(status.healthState, "DEGRADED");
  assert.ok(status.lastError);
  assert.equal(status.unavailableUntil, null);
});

test("provider unavailability enters UNAVAILABLE with a bounded unavailableUntil (matrix H)", async () => {
  const { repository, service } = harness(async () => {
    throw Object.assign(new Error("getaddrinfo ENOTFOUND api.valr.com"), { code: "ENOTFOUND" });
  });
  await repository.seedUser("user-a");
  const now = Date.now();

  await assert.rejects(
    service.refreshSnapshot({ userId: "user-a", providerId: "valr", credentials: CREDENTIALS, record: { status: "configured" }, now }),
    error => error?.failure?.failureClass === "PROVIDER_UNAVAILABLE",
  );

  const status = await service.status({ userId: "user-a", providerId: "valr", now });
  assert.equal(status.healthState, "UNAVAILABLE");
  assert.ok(status.unavailableUntil);
  const until = Date.parse(status.unavailableUntil);
  assert.ok(until >= now + 55 * 1000, "unavailableUntil should be bounded near backoff window");
  assert.ok(until <= now + CONFIG.backoffMs + 1000);
});

test("auth failures never retry and are not marked as provider outages (matrix I)", async () => {
  const { repository, service } = harness(async () => jsonBody({ message: "Unauthorized" }, 401));
  await repository.seedUser("user-a");

  await assert.rejects(
    service.refreshSnapshot({ userId: "user-a", providerId: "valr", credentials: CREDENTIALS, record: { status: "configured" } }),
    error => error?.failure?.failureClass === "AUTH_FAILED" && error?.failure?.retryable === false,
  );

  const status = await service.status({ userId: "user-a", providerId: "valr" });
  assert.equal(status.healthState, "AUTH_FAILED");
  assert.equal(status.status, "error");
  assert.equal(status.unavailableUntil, null);
});

test("rate limiting honours Retry-After and suppresses further refresh until the window passes (matrix J/K)", async () => {
  let rateLimited = false;
  const { repository, service } = harness(async () => {
    if (rateLimited) return jsonBody({ message: "too fast" }, 429, { "retry-after": "120" });
    return jsonBody([{ currency: "ZAR", available: "1000", total: "1000" }]);
  });
  await repository.seedUser("user-a");
  const now = Date.now();

  await service.refreshSnapshot({ userId: "user-a", providerId: "valr", credentials: CREDENTIALS, record: { status: "configured" }, now });

  rateLimited = true;
  await assert.rejects(
    service.refreshSnapshot({ userId: "user-a", providerId: "valr", credentials: CREDENTIALS, record: { status: "online" }, now, force: true }),
    error => error?.failure?.failureClass === "RATE_LIMITED",
  );

  const status = await service.status({ userId: "user-a", providerId: "valr", now });
  assert.equal(status.healthState, "RATE_LIMITED");
  assert.equal(status.lastError.length > 0, true);
  const until = Date.parse(status.unavailableUntil);
  assert.ok(until >= now + 119 * 1000, "Retry-After should be honoured");
  assert.equal(status.freshness, "UNAVAILABLE", "breaker suppresses freshness until the window passes");

  const recovered = await service.status({ userId: "user-a", providerId: "valr", now: until + 1 });
  assert.equal(recovered.freshness, "FRESH", "data falls back to last known sync once the breaker releases");
  assert.equal(recovered.latestSnapshot.balances[0].currency, "ZAR");
});

test("providers recover after failure: health clears and snapshots resume (matrix T)", async () => {
  let failing = true;
  const { repository, service } = harness(async () => {
    if (failing) throw Object.assign(new Error("Service Unavailable"), { status: 503 });
    return jsonBody([{ currency: "ZAR", available: "10", total: "10" }]);
  });
  await repository.seedUser("user-a");

  await assert.rejects(
    service.refreshSnapshot({ userId: "user-a", providerId: "valr", credentials: CREDENTIALS, record: { status: "configured" } }),
  );

  failing = false;
  const result = await service.refreshSnapshot({
    userId: "user-a",
    providerId: "valr",
    credentials: CREDENTIALS,
    record: { status: "configured" },
    force: true,
  });
  assert.equal(result.status, "refreshed");

  const status = await service.status({ userId: "user-a", providerId: "valr" });
  assert.equal(status.healthState, "HEALTHY");
  assert.equal(status.status, "online");
  assert.equal(status.unavailableUntil, null);
  assert.equal(status.lastError, null);
});

test("accounts and snapshots are isolated per user (matrix V)", async () => {
  const { repository, service } = harness();
  await repository.seedUser("user-a");
  await repository.seedUser("user-b");

  await service.refreshSnapshot({ userId: "user-a", providerId: "valr", credentials: CREDENTIALS, record: { status: "configured" } });
  assert.equal(await repository.getAccount("user-b", "valr"), null);

  await service.refreshSnapshot({ userId: "user-b", providerId: "valr", credentials: CREDENTIALS, record: { status: "configured" } });

  const statusA = await service.status({ userId: "user-a", providerId: "valr" });
  const statusB = await service.status({ userId: "user-b", providerId: "valr" });
  assert.equal(statusA.snapshotCount, 1);
  assert.equal(statusB.snapshotCount, 1);
  assert.notEqual(statusA.latestSnapshot.balances[0].id, statusB.latestSnapshot.balances[0].id);
});

test("refresh is idempotent: an existing COMPLETED/RUNNING job for the key short-circuits (matrix N/O)", async () => {
  const { repository, service } = harness();
  await repository.seedUser("user-a");
  await service.refreshSnapshot({ userId: "user-a", providerId: "valr", credentials: CREDENTIALS, record: { status: "configured" }, force: true });

  const existing = await repository.enqueueJob({ type: "connector_refresh", provider: "valr", idempotencyKey: "request-key-123", payload: {} });
  const duplicate = await service.refreshSnapshot({
    userId: "user-a",
    providerId: "valr",
    credentials: CREDENTIALS,
    record: { status: "configured" },
    idempotencyKey: "request-key-123",
  });
  assert.equal(duplicate.skipped, "duplicate");
  assert.equal(duplicate.reason, "idempotency_key_already_ran");
  assert.equal(duplicate.job.id, existing.id);

  const account = await repository.getAccount("user-a", "valr");
  assert.equal(await repository.countSnapshots(account.id), 1, "no extra snapshot for duplicate");
});

test("credentials never appear in returned status, snapshots, or error surfaces (matrix W/X)", async () => {
  const { repository, service } = harness();
  await repository.seedUser("user-a");

  await service.refreshSnapshot({ userId: "user-a", providerId: "valr", credentials: CREDENTIALS, record: { status: "configured" } });

  const status = await service.status({ userId: "user-a", providerId: "valr" });
  const serialized = JSON.stringify(status);
  assert.ok(!serialized.includes("secret-phase5-domain"));
  assert.ok(!serialized.includes("key-phase5-domain"));

  const latest = await service.latestSnapshot("user-a", "valr");
  assert.ok(!JSON.stringify(latest).includes("secret-phase5-domain"));

  const failing = harness(async () => {
    throw new Error(`boom X-VALR-API-KEY=${CREDENTIALS.apiKey} secret=${CREDENTIALS.apiSecret}`);
  });
  await failing.repository.seedUser("user-b");
  await assert.rejects(
    failing.service.refreshSnapshot({ userId: "user-b", providerId: "valr", credentials: CREDENTIALS, record: { status: "configured" } }),
  );
  const failed = await failing.service.status({ userId: "user-b", providerId: "valr" });
  assert.equal(failed.lastError, "error_detail_redacted");
  assert.ok(!JSON.stringify(failed).includes("secret-phase5-domain"));
});

test("valuation evidence bridge produces CURRENT_PRICE evidence and returns the reassessment outcome (matrix P/Q)", async () => {
  const outcomes = [];
  const mockValuation = {
    async recalculate(input) {
      outcomes.push(input);
      return { status: "REASSESSED", assessment: "brick-alpha-v1" };
    },
  };
  const { repository, service } = (() => {
    const repository = createMemoryConnectorRepository();
    const providers = createConnectorProviderRegistry({
      config: {},
      fetchFn: () => jsonBody([{ currency: "ZAR", available: "1000", total: "1000" }]),
    });
    return {
      repository,
      service: createConnectorService({
        repository,
        providers,
        config: CONFIG,
        valuation: mockValuation,
      }),
    };
  })();
  await repository.seedUser("user-a");
  await service.refreshSnapshot({ userId: "user-a", providerId: "valr", credentials: CREDENTIALS, record: { status: "configured" } });

  const evidence = await service.evaluateValuationEvidence({
    userId: "user-a",
    providerId: "valr",
    assetId: "brick-alpha-v1",
    asset: { ticker: "BRICK" },
  });
  assert.equal(evidence.status, "REASSESSED");
  assert.equal(evidence.assessment, "brick-alpha-v1");
  assert.equal(outcomes.length, 1);
  assert.ok(outcomes[0].evidenceInputs.length > 0);
  assert.equal(outcomes[0].evidenceInputs[0].kind, "CURRENT_PRICE");
  assert.equal(outcomes[0].evidenceInputs[0].provider, "connector:valr");

  const none = await service.evaluateValuationEvidence({ userId: "user-b", providerId: "valr", assetId: "x" });
  assert.equal(none.status, "UNAVAILABLE");
  assert.equal(none.reason, "no_connector_snapshot");
});