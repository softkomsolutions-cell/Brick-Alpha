const test = require("node:test");
const assert = require("node:assert/strict");

const { createMemoryConnectorRepository } = require("../test-support/connector-memory");
const { createJobRunner, nextRunAt } = require("../services/job-runner");
const { buildHandlers } = require("../worker");
const { createConnectorService } = require("../services/connector-service");
const { createConnectorProviderRegistry } = require("../services/connectors/providers");
const { encryptConnectorPayload } = require("../services/connectors/cipher");

const HOUR = 60 * 60 * 1000;
const CONFIG = {
  mode: "postgres",
  refreshAfterMs: 24 * HOUR,
  reviewMs: 72 * HOUR,
  providerTimeoutMs: 2000,
  providerRetryLimit: 2,
  backoffMs: 40,
  maxBackoffMs: 100,
  jobTimeoutMs: 2000,
  jobMaxAttempts: 3,
  jobPollIntervalMs: 20,
  jobGraceMs: 300,
  jobClaimLimit: 20,
  jobsEnabled: true,
};

function retryableError(status = 500, extra = {}) {
  return Object.assign(new Error(`http ${status}`), { status, ...extra });
}

test("jobs require an idempotency key and dedupe on enqueue (matrix N/O)", async () => {
  const repository = createMemoryConnectorRepository();
  const runner = createJobRunner({ repository, config: CONFIG, handlers: {} });

  await assert.rejects(runner.enqueue({ type: "connector_refresh", payload: {} }), /idempotency_key_required/);

  const first = await runner.enqueue({ type: "connector_refresh", provider: "valr", idempotencyKey: "k-1", payload: { userId: "u1" } });
  const second = await runner.enqueue({ type: "connector_refresh", provider: "valr", idempotencyKey: "k-1", payload: { userId: "u1" } });

  assert.equal(second.duplicate, true);
  assert.equal(second.id, first.id);
  const all = [...repository.__state.jobs.values()];
  assert.equal(all.filter(job => job.idempotencyKey === "k-1").length, 1);
});

test("processQueue claims only due jobs and executes handlers (matrix C/D baseline)", async () => {
  const repository = createMemoryConnectorRepository();
  const ran = [];
  const runner = createJobRunner({
    repository,
    config: CONFIG,
    handlers: {
      sample: async ({ job }) => {
        ran.push(job.idempotencyKey);
        return { ok: true };
      },
    },
  });

  await runner.enqueue({ type: "sample", idempotencyKey: "due-1", runAt: Date.now() - 10 });
  await runner.enqueue({ type: "sample", idempotencyKey: "due-2", runAt: Date.now() - 5 });
  await runner.enqueue({ type: "sample", idempotencyKey: "future-1", runAt: Date.now() + 60 * 1000 });

  const summary = await runner.processQueue();
  assert.equal(summary.claimed, 2);
  assert.equal(summary.completed, 2);
  assert.equal(ran.length, 2);
  assert.ok(ran.includes("due-1") && ran.includes("due-2"));

  const futureJob = await repository.getJobByIdempotencyKey("future-1");
  assert.equal(futureJob.status, "QUEUED");
  const doneJob = await repository.getJobByIdempotencyKey("due-1");
  assert.equal(doneJob.status, "COMPLETED");
  assert.equal(doneJob.attempts, 1);
});

test("5xx failures retry with exponential backoff bounded by maxAttempts, then fail (matrix L)", async () => {
  const repository = createMemoryConnectorRepository();
  let calls = 0;
  const runner = createJobRunner({
    repository,
    config: CONFIG,
    handlers: {
      flaky: async () => {
        calls += 1;
        throw retryableError(500);
      },
    },
  });
  await runner.enqueue({ type: "flaky", idempotencyKey: "flaky-1", maxAttempts: 2 });

  const first = await runner.processQueue();
  assert.equal(first.retried, 1);
  let job = await repository.getJobByIdempotencyKey("flaky-1");
  assert.equal(job.status, "QUEUED");
  assert.equal(job.attempts, 1);
  assert.equal(job.errorCode, "RETRYABLE");
  assert.ok(Date.parse(job.runAt) > Date.now() - 1, "retry scheduled into the future");

  job = await repository.getJobByIdempotencyKey("flaky-1");
  const queued = { ...job, runAt: new Date(Date.now() - 1).toISOString() };
  await repository.scheduleRetry({ jobId: job.id, nextRunAt: queued.runAt, attempts: job.attempts });

  const second = await runner.processQueue();
  assert.equal(second.failed, 1);
  job = await repository.getJobByIdempotencyKey("flaky-1");
  assert.equal(job.status, "FAILED");
  assert.equal(job.attempts, 2);
  assert.equal(calls, 2);
});

test("non-retryable and auth failures are never repeated (matrix I/M)", async () => {
  const repository = createMemoryConnectorRepository();
  let badCalls = 0;
  let authCalls = 0;
  const runner = createJobRunner({
    repository,
    config: CONFIG,
    handlers: {
      bad: async () => {
        badCalls += 1;
        throw retryableError(400);
      },
      authed: async () => {
        authCalls += 1;
        throw retryableError(401);
      },
    },
  });

  await runner.enqueue({ type: "bad", idempotencyKey: "bad-1", maxAttempts: 5 });
  await runner.enqueue({ type: "authed", idempotencyKey: "auth-1", maxAttempts: 5 });
  await runner.processQueue();

  assert.equal(badCalls, 1);
  assert.equal(authCalls, 1);
  assert.equal((await repository.getJobByIdempotencyKey("bad-1")).status, "FAILED");
  assert.equal((await repository.getJobByIdempotencyKey("bad-1")).errorCode, "NON_RETRYABLE");
  assert.equal((await repository.getJobByIdempotencyKey("auth-1")).errorCode, "AUTH_FAILED");
});

test("429 stands down with Retry-After and recovers when the window passes (matrix J/K)", async () => {
  const repository = createMemoryConnectorRepository();
  const runner = createJobRunner({
    repository,
    config: CONFIG,
    handlers: {
      rate: async () => {
        throw Object.assign(new Error("too fast"), { status: 429, headers: { "retry-after": "3" } });
      },
    },
  });
  await runner.enqueue({ type: "rate", idempotencyKey: "rate-1" });
  const summary = await runner.processQueue();
  assert.equal(summary.retried, 1);

  const job = await repository.getJobByIdempotencyKey("rate-1");
  const waitSeconds = (Date.parse(job.runAt) - Date.now()) / 1000;
  assert.ok(waitSeconds >= 3 - 1, `retry window ~${waitSeconds}s`);

  const back = nextRunAt(
    { failureClass: "RATE_LIMITED", retryAfterSeconds: 10 },
    2,
    Date.now(),
    CONFIG,
  );
  assert.ok(back - Date.now() >= 9500);
});

test("unknown job types fail without touching handler state (matrix Q-safe)", async () => {
  const repository = createMemoryConnectorRepository();
  const runner = createJobRunner({ repository, config: CONFIG, handlers: {} });
  await runner.enqueue({ type: "nope", idempotencyKey: "nope-1" });
  const summary = await runner.processQueue();
  assert.equal(summary.failed, 1);
  const job = await repository.getJobByIdempotencyKey("nope-1");
  assert.equal(job.status, "FAILED");
  assert.equal(job.errorCode, "UNKNOWN_JOB_TYPE");
});

test("worker start processes due jobs and stop() drains in-flight work gracefully (matrix U)", async () => {
  const repository = createMemoryConnectorRepository();
  let completed = [];
  const runner = createJobRunner({
    repository,
    config: CONFIG,
    handlers: {
      slow: async ({ job }) => {
        await new Promise(resolve => setTimeout(resolve, 120));
        completed.push(job.idempotencyKey);
        return { ok: true };
      },
    },
  });
  const worker = runner.createWorker({ pollIntervalMs: 15, graceMs: 1000 });

  await runner.enqueue({ type: "slow", idempotencyKey: "slow-1" });
  await runner.enqueue({ type: "slow", idempotencyKey: "slow-2" });

  worker.start();
  await new Promise(resolve => setTimeout(resolve, 500));
  const stopped = await worker.stop();

  assert.equal(stopped.drained, true);
  assert.equal(completed.length, 2);
  assert.equal((await repository.getJobByIdempotencyKey("slow-1")).status, "COMPLETED");
  assert.equal((await repository.getJobByIdempotencyKey("slow-2")).status, "COMPLETED");

  await runner.enqueue({ type: "slow", idempotencyKey: "slow-3" });
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal((await repository.getJobByIdempotencyKey("slow-3")).status, "QUEUED", "stopped worker must not pick up new work");
});

test("connector_refresh handler decrypts credentials and persists a snapshot through the service (matrix C/D/E)", async () => {
  process.env.CONNECTOR_SECRET = "phase5-job-handler-secret";
  const repository = createMemoryConnectorRepository();
  await repository.seedUser("user-handler");

  const blob = encryptConnectorPayload({ apiKey: "key-h", apiSecret: "secret-h" }, process.env.CONNECTOR_SECRET);
  await repository.ensureAccount({
    userId: "user-handler",
    providerId: "valr",
    record: { status: "configured", config: { preferredPair: "BTCUSDT" }, authBlob: blob },
    now: Date.now(),
  });

  const providers = createConnectorProviderRegistry({
    config: {},
    fetchFn: async () => new Response(JSON.stringify([{ currency: "BTC", available: "1", total: "1" }]), { status: 200, headers: { "content-type": "application/json" } }),
  });
  const service = createConnectorService({ repository, providers, config: CONFIG });
  const handlers = buildHandlers({ connectorService: service, providerRegistry: providers, connectorConfig: CONFIG, repository });

  const runner = createJobRunner({ repository, config: CONFIG, handlers, logger: () => undefined });
  await runner.enqueue({ type: "connector_refresh", provider: "valr", idempotencyKey: "handler-1", payload: { userId: "user-handler", providerId: "valr" } });
  const summary = await runner.processQueue();

  assert.equal(summary.completed, 1);
  const account = await repository.getAccount("user-handler", "valr");
  assert.equal(account.status, "online");
  assert.equal(account.lastError, null);
  const status = await service.status({ userId: "user-handler", providerId: "valr" });
  assert.equal(status.snapshotCount, 1);
  assert.equal(status.latestSnapshot.balances[0].currency, "BTC");
});

test("connector_refresh handler missing payload fails without secrets in the summary", async () => {
  process.env.CONNECTOR_SECRET = "phase5-job-handler-secret";
  const repository = createMemoryConnectorRepository();
  const providers = createConnectorProviderRegistry({ config: {} });
  const service = createConnectorService({ repository, providers, config: CONFIG });
  const handlers = buildHandlers({ connectorService: service, providerRegistry: providers, connectorConfig: CONFIG, repository });

  const runner = createJobRunner({ repository, config: CONFIG, handlers });
  await runner.enqueue({ type: "connector_refresh", idempotencyKey: "handler-2", payload: { userId: "nobody" } });
  const summary = await runner.processQueue();
  assert.equal(summary.failed, 1);
  const job = await repository.getJobByIdempotencyKey("handler-2");
  assert.match(job.errorSummary, /connector_refresh_missing_payload/);
});

test("connector_health and market_refresh handlers cover fleets read-only (matrix Y)", async () => {
  process.env.CONNECTOR_SECRET = "phase5-job-handler-secret";
  const repository = createMemoryConnectorRepository();
  await repository.seedUser("user-health");
  const blob = encryptConnectorPayload({ apiKey: "key-2", apiSecret: "secret-2" }, process.env.CONNECTOR_SECRET);
  await repository.ensureAccount({
    userId: "user-health",
    providerId: "valr",
    record: { status: "configured", config: {}, authBlob: blob },
    now: Date.now(),
  });

  const calls = [];
  const providers = createConnectorProviderRegistry({
    config: {},
    fetchFn: async url => {
      calls.push(String(url));
      return new Response(JSON.stringify([{ currency: "ZAR", available: "5", total: "5" }]), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  const service = createConnectorService({ repository, providers, config: CONFIG });
  const handlers = buildHandlers({ connectorService: service, providerRegistry: providers, connectorConfig: CONFIG, repository });

  const healthHandle = handlers.connector_health({ job: { payload: { providerId: "valr" } } });
  const result = await healthHandle;
  assert.equal(result.checked, 1);
  assert.equal(calls.every(url => !/order/i.test(url)), true, "health must only touch read-only endpoints");
  assert.equal(result.results[0].available, true);

  const market = await handlers.market_refresh({ job: { payload: { providerId: "valr", pairs: ["BTCUSDT"] } } });
  assert.equal(market.ok, true);
  assert.equal(market.markets.length, 1);
});

test("nextRunAt computes bounded exponential backoff (matrix L)", () => {
  const now = Date.now();
  const first = nextRunAt({ failureClass: "RETRYABLE" }, 1, now, { ...CONFIG, backoffMs: 1000, maxBackoffMs: 20000 });
  assert.equal(first - now, 1000);
  const doubled = nextRunAt({ failureClass: "RETRYABLE" }, 2, now, { ...CONFIG, backoffMs: 1000, maxBackoffMs: 20000 });
  assert.equal(doubled - now, 2000);
  const capped = nextRunAt({ failureClass: "RETRYABLE" }, 5, now, { ...CONFIG, backoffMs: 1000, maxBackoffMs: 3000 });
  assert.equal(capped - now, 3000);
});