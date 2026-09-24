// Synthetic PostgreSQL connector + job checks. A unique synthetic user, connector account,
// snapshot, balances, jobs, and a bridge valuation asset are removed in cleanup. Only the
// in-process deterministic mock provider is exercised. Named checkpoints report the exact
// validation STEP that failed (cleanup never overwrites it). No real provider is ever called
// and no synthetic credential is ever printed.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { getPrismaClient, disconnectPrisma } = require('../db/prisma-client');
const { readConnectorConfig } = require('../config/connector');
const { readValuationConfig } = require('../config/valuation');
const { createConnectorProviderRegistry } = require('../services/connectors/providers');
const { createPostgresConnectorRepository } = require('../repositories/postgresConnectorRepository');
const { createPostgresValuationRepository } = require('../repositories/postgresValuationRepository');
const { createValuationService } = require('../services/valuation-service');
const { createConnectorService } = require('../services/connector-service');
const { createJobRunner } = require('../services/job-runner');
const { buildHandlers } = require('../worker');
const { encryptConnectorPayload } = require('../services/connectors/cipher');
const brickAlphaModel = require('../services/brick-alpha-model');

const SANITY_ONLY = process.argv.includes('--sanity-only');
const SAFE_FIELD = /^[A-Z0-9_]+$/;

const logBuffer = [];
const __originalLog = console.log;
const __originalError = console.error;
console.log = (...args) => {
  logBuffer.push(args.map(String).join(' '));
  __originalLog(...args);
};
console.error = (...args) => {
  logBuffer.push(args.map(String).join(' '));
  __originalError(...args);
};

let currentStep = 'validate-start';

function step(name) {
  currentStep = name;
  console.log(`STEP ${name}`);
}

function safeMeta(meta) {
  const out = {};
  for (const [key, value] of Object.entries(meta || {})) {
    if (typeof value === 'number' || typeof value === 'boolean') out[key] = value;
    else if (typeof value === 'string' && !/passw|postgresql:\/\/|DATABASE_URL|connection.?string/i.test(value)) {
      out[key] = value.length > 400 ? `${value.slice(0, 400)}...` : value;
    }
  }
  return out;
}

function reportFailure(error) {
  console.error('FAIL staging connector/job validation');
  console.error(`STEP-FAILED=${currentStep}`);
  if (error.meta) {
    if (SAFE_FIELD.test(String(error.meta.code || ''))) console.error(`sqlstate=${error.meta.code}`);
    const meta = safeMeta(error.meta);
    if (Object.keys(meta).length) console.error(`error.meta=${JSON.stringify(meta)}`);
  }
  const message = String(error.message || '');
  if (message && !/DATABASE_URL|postgresql:\/\/|password|passw|connection.?string/i.test(message)) {
    console.error(`error.message=${message.slice(0, 400)}`);
  }
  const frame = String(error.stack || '').split('\n').find((line) => line.includes('server\\') || line.includes('server/'));
  if (frame) console.error(`error.frame=${frame.trim().slice(0, 250)}`);
}

function mockResponse(payload, status = 200, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers,
    async text() {
      if (status >= 200 && status < 300) return JSON.stringify(payload);
      return payload && typeof payload === 'object' ? JSON.stringify(payload) : String(payload || '');
    },
  };
}

function mockBtcBalancePayload() {
  return [
    { currency: 'BTC', available: '0.25', reserved: '0.05', total: '0.30' },
    { currency: 'ZAR', available: '5000', reserved: '200', total: '5200' },
  ];
}

function neverResolvingFetch() {
  return (_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => {
      reject(Object.assign(new Error('aborted'), { name: 'AbortError', code: 'AbortError' }));
    });
  });
}

async function validate(client) {
  const marker = crypto.randomUUID();
  const connectionLabel = `${marker.slice(0, 8)}`;
  const userEmail = `connslack-${marker}@example.test`;
  const secret = process.env.CONNECTOR_SECRET || process.env.AUTH_SECRET || crypto.randomBytes(24).toString('hex');
  process.env.CONNECTOR_SECRET = secret;

  let userId = null;
  let account = null;
  let bridgeAssetId = null;
  const jobKeys = [
    `val-job-${marker}`,
    `val-job-${marker}-dup`,
    `val-dedupe-${marker}`,
    `val-concurrent-${marker}`,
    `val-concurrent-race-${marker}`,
  ];
  const allJobKeys = [...jobKeys, `val-handler-${marker}`];

  const config = readConnectorConfig({
    CONNECTOR_PERSISTENCE_MODE: 'postgres',
    CONNECTOR_FRESH_HOURS: '24',
    CONNECTOR_STALE_HOURS: '72',
    CONNECTOR_PROVIDER_TIMEOUT_MS: '8000',
    CONNECTOR_JOBS_ENABLED: 'true',
    DATABASE_URL: process.env.DATABASE_URL,
  });
  assert.equal(config.mode, 'postgres');
  assert.equal(config.jobsEnabled, true);

  try {
    step('raw-sanity');
    await client.$queryRaw`SELECT 1 AS ok`;
    console.log('PASS raw connectivity');

    step('phase5-migration-applied');
    const migrations = await client.$queryRaw`SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"`;
    assert.ok(
      migrations.some(row => row.migration_name === '20260918000001_phase5_connector_jobs' && row.finished_at && row.rolled_back_at === null),
      'phase5_connector_jobs migration must be applied and finished',
    );
    const jobTable = await client.$queryRawUnsafe(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('Job', 'ConnectorSnapshot', 'ConnectorBalance')`,
    );
    assert.equal(jobTable.length, 3, 'Job, ConnectorSnapshot, and ConnectorBalance tables must exist');
    const healthColumn = await client.$queryRawUnsafe(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'ConnectorAccount' AND column_name = 'healthState'`,
    );
    assert.equal(healthColumn.length, 1, 'phase5 migration must add ConnectorAccount.healthState');
    const jobTypes = await client.$queryRawUnsafe(
      `SELECT enumlabel FROM pg_enum WHERE enumtypid = 'JobType'::regtype ORDER BY enumlabel`,
    );
    assert.equal(jobTypes.length, 4, 'JobType enum must have four members');
    const connectorHealthStates = await client.$queryRawUnsafe(
      `SELECT enumlabel FROM pg_enum WHERE enumtypid = 'ConnectorHealthState'::regtype`,
    );
    assert.equal(connectorHealthStates.length, 6, 'ConnectorHealthState enum must have six members');
    const jobStatuses = await client.$queryRawUnsafe(
      `SELECT enumlabel FROM pg_enum WHERE enumtypid = 'JobStatus'::regtype`,
    );
    assert.equal(jobStatuses.length, 5, 'JobStatus enum must have five members');
    const jobUnique = await client.$queryRawUnsafe(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'Job' AND indexname = 'Job_idempotencyKey_key'`,
    );
    assert.equal(jobUnique.length, 1, 'Job.idempotencyKey must have a unique index');
    console.log('PASS phase5_connector_jobs migration applied (Job tables, ConnectorAccount.healthState, ConnectorHealthState/JobType/JobStatus enums, Job idempotency uniqueness)');

    if (SANITY_ONLY) {
      currentStep = 'sanity-complete';
      return;
    }

    step('seed-synthetic-user');
    const user = await client.user.create({
      data: {
        legacyId: marker,
        name: 'Connector Validation Synthetic',
        email: userEmail,
        role: 'PARTNER',
      },
    });
    userId = user.id;

    const repository = createPostgresConnectorRepository(() => client);
    const registry = createConnectorProviderRegistry({ config: {}, fetchFn: async () => mockResponse(mockBtcBalancePayload()) });
    const service = createConnectorService({ repository, providers: registry, config });

    step('save-credentials');
    const blob = encryptConnectorPayload({ apiKey: 'connslack-key', apiSecret: 'connslack-secret' }, secret);
    account = await repository.ensureAccount({
      userId: marker,
      providerId: 'valr',
      record: { status: 'configured', config: { preferredPair: 'BTCUSDT' }, authBlob: blob },
      now: Date.now(),
    });
    const credentials = await repository.getAccountCredentials(marker, 'valr');
    assert.equal(credentials.record.hasCredentials, true);
    assert.equal(credentials.record.status, 'configured');
    assert.ok(!JSON.stringify(credentials.record).includes('connslack-secret'), 'viewAccount must never expose the raw secret');
    console.log('PASS encrypted credentials persisted and readable, no raw secret in any view');

    step('refresh-persists-snapshot');
    const refreshed = await service.refreshSnapshot({
      userId: marker,
      providerId: 'valr',
      credentials: { apiKey: 'connslack-key', apiSecret: 'connslack-secret' },
      record: { config: { preferredPair: 'BTCUSDT' } },
      force: true,
    });
    assert.equal(refreshed.status, 'refreshed');
    assert.equal(refreshed.freshness, 'FRESH');
    const persisted = await repository.getLatestSnapshot(account.id);
    assert.ok(persisted, 'a snapshot row must persist');
    assert.ok(persisted.balances.length >= 2, 'balance rows must persist');
    assert.equal(persisted.fundedAssets, 2);
    const health = await repository.getAccount(marker, 'valr');
    assert.equal(health.status, 'online');
    assert.equal(health.healthState, 'HEALTHY');
    assert.equal(health.unavailableUntil, null);
    assert.ok(health.lastSyncAt);
    assert.ok(health.lastError === null);
    const freshness = await service.status({ userId: marker, providerId: 'valr' });
    assert.equal(freshness.freshness, 'FRESH');
    console.log('PASS connector refresh persists a snapshot, balances, ONLINE + HEALTHY state, and FRESH freshness');

    step('rate-limit-then-recover');
    const limitedRegistry = createConnectorProviderRegistry({
      config: {},
      fetchFn: async () => mockResponse({ message: 'too many requests' }, 429, { 'Retry-After': '3' }),
    });
    const limitedService = createConnectorService({ repository, providers: limitedRegistry, config });
    const rateLimitedAt = Date.now();
    await assert.rejects(
      limitedService.refreshSnapshot({
        userId: marker,
        providerId: 'valr',
        credentials: { apiKey: 'connslack-key', apiSecret: 'connslack-secret' },
        record: { config: { preferredPair: 'BTCUSDT' } },
        force: true,
      }),
      error => error?.failure?.failureClass === 'RATE_LIMITED' && error?.failure?.retryable === true,
    );
    const limited = await repository.getAccount(marker, 'valr');
    assert.equal(limited.healthState, 'RATE_LIMITED');
    assert.ok(limited.unavailableUntil, 'Retry-After must persist a backoff window');
    const retryAfterWindowMs = Date.parse(limited.unavailableUntil) - rateLimitedAt;
    assert.ok(retryAfterWindowMs >= 2500, `Retry-After ~3s must be reflected in unavailableUntil (got ${retryAfterWindowMs}ms)`);
    assert.ok(!String(limited.lastError || '').includes('connslack'), 'lastError must not expose credentials');
    const recoveredRegistry = createConnectorProviderRegistry({ config: {}, fetchFn: async () => mockResponse(mockBtcBalancePayload()) });
    const recoveredService = createConnectorService({ repository, providers: recoveredRegistry, config });
    const recovered = await recoveredService.refreshSnapshot({
      userId: marker,
      providerId: 'valr',
      credentials: { apiKey: 'connslack-key', apiSecret: 'connslack-secret' },
      record: { config: { preferredPair: 'BTCUSDT' } },
      force: true,
    });
    assert.equal(recovered.status, 'refreshed');
    assert.equal((await repository.getAccount(marker, 'valr')).healthState, 'HEALTHY');
    assert.equal((await repository.getAccount(marker, 'valr')).unavailableUntil, null);
    console.log('PASS 429 + Retry-After maps to RATE_LIMITED with a backoff window and no secret leakage; a later provider pass recovers to HEALTHY');

    step('timeout-handled');
    const timeoutRegistry = createConnectorProviderRegistry({ config: {}, fetchFn: neverResolvingFetch() });
    const timeoutConfig = readConnectorConfig({
      CONNECTOR_PERSISTENCE_MODE: 'postgres',
      CONNECTOR_PROVIDER_TIMEOUT_MS: '700',
      CONNECTOR_JOBS_ENABLED: 'true',
      DATABASE_URL: process.env.DATABASE_URL,
    });
    const timeoutService = createConnectorService({ repository, providers: timeoutRegistry, config: timeoutConfig });
    await assert.rejects(
      timeoutService.refreshSnapshot({
        userId: marker,
        providerId: 'valr',
        credentials: { apiKey: 'connslack-key', apiSecret: 'connslack-secret' },
        record: { config: { preferredPair: 'BTCUSDT' } },
        force: true,
      }),
      error => error?.failure?.failureClass === 'TIMEOUT' && error?.failure?.retryable === true,
    );
    const timedOut = await repository.getAccount(marker, 'valr');
    assert.equal(timedOut.healthState, 'DEGRADED');
    assert.ok(!String(timedOut.lastError || '').includes('connslack'), 'timeout summary must not leak credentials');
    const afterTimeoutRecover = await service.refreshSnapshot({
      userId: marker,
      providerId: 'valr',
      credentials: { apiKey: 'connslack-key', apiSecret: 'connslack-secret' },
      record: { config: { preferredPair: 'BTCUSDT' } },
      force: true,
    });
    assert.equal(afterTimeoutRecover.status, 'refreshed');
    assert.equal((await repository.getAccount(marker, 'valr')).healthState, 'HEALTHY');
    console.log('PASS provider timeout maps to TIMEOUT -> DEGRADED with no leak; provider recovery clears it');

    step('job-lifecycle');
    const first = await repository.enqueueJob({ type: 'connector_refresh', provider: 'valr', idempotencyKey: jobKeys[0], maxAttempts: 3 });
    assert.equal(first.status, 'QUEUED');
    const duplicate = await repository.enqueueJob({ type: 'connector_refresh', provider: 'valr', idempotencyKey: jobKeys[0] });
    assert.equal(duplicate.duplicate, true, 'same idempotency key must dedupe');
    const second = await repository.enqueueJob({ type: 'connector_refresh', provider: 'valr', idempotencyKey: jobKeys[1] });
    assert.equal(second.status, 'QUEUED');
    const claimed = await repository.claimDueJobs({ limit: 10, now: Date.now() + 1000 });
    assert.ok(claimed.some(job => job.idempotencyKey === jobKeys[0]), 'due job must be claimed');
    const [claimedJob] = claimed.filter(job => job.idempotencyKey === jobKeys[0]);
    assert.ok(claimedJob.runId, 'claim must assign a runId');
    assert.equal(claimedJob.status, 'RUNNING');
    await repository.markCompleted({ jobId: claimedJob.id, result: { ok: true }, attempts: 1 });
    assert.equal((await repository.getJobByIdempotencyKey(jobKeys[0])).status, 'COMPLETED');
    const claimedSecond = claimed.filter(job => job.idempotencyKey === jobKeys[1]);
    assert.ok(claimedSecond.length, 'both due jobs must be claimed');
    await repository.markCompleted({ jobId: claimedSecond[0].id, result: { ok: true }, attempts: 1 });
    assert.equal((await repository.getJobByIdempotencyKey(jobKeys[1])).status, 'COMPLETED');
    console.log('PASS enqueue dedupes by idempotency key and the claim lifecycle transitions QUEUED -> RUNNING -> COMPLETED');

    step('service-idempotency');
    const dedupeJob = await repository.enqueueJob({ type: 'connector_refresh', provider: 'valr', idempotencyKey: jobKeys[2] });
    assert.equal(dedupeJob.status, 'QUEUED');
    const snapshotsBeforeDedupe = await repository.countSnapshots(account.id);
    const duplicateGuard = await service.refreshSnapshot({
      userId: marker,
      providerId: 'valr',
      credentials: { apiKey: 'connslack-key', apiSecret: 'connslack-secret' },
      record: { config: { preferredPair: 'BTCUSDT' } },
      idempotencyKey: jobKeys[2],
      force: true,
    });
    assert.equal(duplicateGuard.skipped, 'duplicate', 'service must short-circuit on an already-queued job');
    assert.equal(await repository.countSnapshots(account.id), snapshotsBeforeDedupe, 'no snapshot may be created by the skipped duplicate');
    const selfExecution = await service.refreshSnapshot({
      userId: marker,
      providerId: 'valr',
      credentials: { apiKey: 'connslack-key', apiSecret: 'connslack-secret' },
      record: { config: { preferredPair: 'BTCUSDT' } },
      idempotencyKey: jobKeys[2],
      excludeJobId: dedupeJob.id,
      force: true,
    });
    assert.equal(selfExecution.status, 'refreshed', 'the executing job itself must not be dropped as a duplicate');
    await repository.markCompleted({ jobId: dedupeJob.id, result: { ok: true }, attempts: 0 });
    console.log('PASS an already-queued logical refresh is deduped while the executing job is allowed through');

    step('handler-job-refresh');
    const handlers = buildHandlers({ connectorService: service, providerRegistry: registry, connectorConfig: config, repository });
    const runner = createJobRunner({ repository, config, handlers });
    const enqueued = await runner.enqueue({
      type: 'connector_refresh',
      provider: 'valr',
      idempotencyKey: `val-handler-${marker}`,
      payload: { userId: marker, providerId: 'valr' },
    });
    assert.equal(enqueued.status, 'QUEUED');
    const jobSummary = await runner.processQueue();
    assert.equal(jobSummary.completed, 1, 'handler job must complete');
    assert.equal(jobSummary.failed, 0);
    const handlerJob = await repository.getJobByIdempotencyKey(`val-handler-${marker}`);
    assert.equal(handlerJob.status, 'COMPLETED');
    assert.equal(handlerJob.errorCode, null);
    assert.ok((await repository.countSnapshots(account.id)) >= 3, 'handler refresh must persist another snapshot');
    console.log('PASS worker connector_refresh handler decrypts credentials and persists a snapshot through the job runner');

    step('concurrent-refresh');
    const snapshotsBeforeConcurrent = await repository.countSnapshots(account.id);
    const [enqueueA, enqueueB] = await Promise.all([
      repository.enqueueJob({ type: 'connector_refresh', provider: 'valr', idempotencyKey: jobKeys[3] }),
      repository.enqueueJob({ type: 'connector_refresh', provider: 'valr', idempotencyKey: jobKeys[3] }),
    ]);
    assert.equal(await client.job.count({ where: { idempotencyKey: jobKeys[3] } }), 1, 'concurrent enqueue must produce exactly one row');
    assert.ok(enqueueA.duplicate || enqueueB.duplicate, 'one of the two concurrent enqueues must report duplicate');
    const [sumA, sumB] = await Promise.all([runner.processQueue(), runner.processQueue()]);
    const summaryTotal = {
      claimed: sumA.claimed + sumB.claimed,
      completed: sumA.completed + sumB.completed,
      failed: sumA.failed + sumB.failed,
    };
    assert.equal(summaryTotal.claimed, 1, 'two concurrent claim attempts must yield exactly one claim');
    assert.equal(summaryTotal.completed, 1, 'exactly one logical refresh must run');
    assert.equal(summaryTotal.failed, 0);
    const concurrentJob = await repository.getJobByIdempotencyKey(jobKeys[3]);
    assert.equal(concurrentJob.status, 'COMPLETED');
    assert.equal(concurrentJob.attempts, 1, 'handler must have run exactly once');
    const snapshotsAfterConcurrent = await repository.countSnapshots(account.id);
    const duplicateLogicalResults = (snapshotsAfterConcurrent - snapshotsBeforeConcurrent) - summaryTotal.completed;
    assert.equal(duplicateLogicalResults, 0, 'no duplicate logical work may be persisted');
    const [raceA, raceB] = await Promise.all([
      repository.enqueueJob({ type: 'connector_refresh', provider: 'valr', idempotencyKey: jobKeys[4] }),
      repository.enqueueJob({ type: 'connector_refresh', provider: 'valr', idempotencyKey: jobKeys[4] }),
    ]);
    assert.equal(await client.job.count({ where: { idempotencyKey: jobKeys[4] } }), 1, 'enqueue race must leave exactly one row');
    assert.ok(raceA.duplicate || raceB.duplicate, 'enqueue race must surface a duplicate');
    console.log('CONCURRENT_ATTEMPTS=2');
    console.log(`LOGICAL_REFRESHES=${summaryTotal.completed}`);
    console.log(`DUPLICATE_LOGICAL_RESULTS=${duplicateLogicalResults}`);
    console.log('CONCURRENT_REFRESH_TEST=PASS');
    console.log('PASS two concurrent attempts for one logical refresh yield one claimed job, one handler run, and one persisted snapshot (PostgreSQL SKIP LOCKED + unique idempotency)');

    step('valuation-evidence-bridge');
    const bridgeSymbol = `valbridge-${marker}`;
    const createdBridge = await client.asset.create({
      data: {
        assetType: 'COLLECTIBLE',
        symbol: bridgeSymbol,
        name: 'Connector bridge synthetic set',
        currency: 'ZAR',
        metadata: { synthetic: true },
        collectible: {
          create: {
            brand: 'Synthetic',
            category: 'Validation',
            theme: 'Staging',
            sku: bridgeSymbol,
            condition: 'sealed',
            expectedRetirementDate: new Date('2028-12-31T00:00:00.000Z'),
          },
        },
      },
    });
    bridgeAssetId = createdBridge.id;
    const valuationConfig = readValuationConfig({ VALUATION_PERSISTENCE_MODE: 'postgres', DATABASE_URL: process.env.DATABASE_URL });
    assert.equal(valuationConfig.modelVersion, 'brick-alpha-v1');
    assert.equal(brickAlphaModel.BRICK_ALPHA_MODEL_VERSION, 'brick-alpha-v1');
    const valuationRepository = createPostgresValuationRepository(() => client);
    const valuationService = createValuationService({ repository: valuationRepository, config: valuationConfig, providers: { fetchAll: async () => [] } });
    const bridgedService = createConnectorService({ repository, providers: registry, config, valuation: valuationService });
    const latestBridgeSnapshot = await repository.getLatestSnapshot(account.id);
    assert.ok(latestBridgeSnapshot, 'bridge step needs a connector snapshot');
    const bridgeOutcome = await bridgedService.evaluateValuationEvidence({
      userId: marker,
      providerId: 'valr',
      assetId: bridgeAssetId,
      asset: { symbol: bridgeSymbol, name: 'Connector bridge synthetic set', brand: 'Synthetic', category: 'Validation', theme: 'Staging', retailPrice: 100, buyPrice: 80 },
      asOf: latestBridgeSnapshot.fetchedAt,
    });
    assert.equal(bridgeOutcome.created, true);
    assert.equal(bridgeOutcome.modelVersion, 'brick-alpha-v1');
    assert.equal(bridgeOutcome.assessment.modelVersion, 'brick-alpha-v1');
    assert.ok(bridgeOutcome.evidence.length >= 2, 'connector balances must become normalized valuation evidence');
    assert.ok(bridgeOutcome.evidence.every(entry => entry.provider === 'connector:valr'), 'evidence must be attributed to the connector');
    const bridgePersisted = await valuationService.getValuation(bridgeAssetId);
    assert.ok(bridgePersisted, 'bridge valuation must persist');
    assert.ok(bridgePersisted.evidence.length >= 2, 'persisted evidence must include the connector rows');
    assert.ok(bridgePersisted.evidence.every(entry => entry.provider === 'connector:valr'));
    assert.ok(bridgePersisted.evidence.every(entry => Number(entry.salePrice) > 0));
    assert.equal(bridgePersisted.metadata?.modelVersion, 'brick-alpha-v1', 'brick-alpha-v1 must remain unchanged');
    assert.equal((await valuationService.getAssessment(bridgeAssetId)).modelVersion, 'brick-alpha-v1');
    console.log('PASS mock connector refresh persists normalized valuation evidence through the connector|valuation bridge while brick-alpha-v1 model remains unchanged');

    step('validate-complete');
    const account2 = await repository.getAccount(marker, 'valr');
    assert.ok(account2.lastSyncAt);
    assert.equal(await repository.countSnapshots(account2.id), (await repository.listSnapshots(account2.id)).length);
    const snapshots = await repository.listSnapshots(account2.id);
    assert.ok(snapshots.length >= 4, 'snapshot history must be retrievable');
    assert.ok(snapshots.every(snapshotRow => Array.isArray(snapshotRow.balances) && snapshotRow.balances.length >= 2), 'every snapshot row must include its balance history');
    const latestHistory = await repository.getLatestSnapshot(account2.id);
    assert.ok(latestHistory && latestHistory.fundedAssets === 2, 'latest snapshot must be retrievable with its funded assets');
    for (const jobIdKey of allJobKeys) {
      const job = await repository.getJobByIdempotencyKey(jobIdKey);
      assert.ok(job, `job ${jobIdKey} must exist`);
      assert.ok(!JSON.stringify(job).includes('connslack'), 'jobs must never store raw credentials');
    }
    console.log('PASS connector accounts, snapshots (with history), balances, and jobs persisted; no raw credentials anywhere');

    step('credential-leak-check');
    const leakSurface = [
      refreshed,
      recovered,
      duplicateGuard,
      selfExecution,
      afterTimeoutRecover,
      await service.status({ userId: marker, providerId: 'valr' }),
      await repository.getLatestSnapshot(account2.id),
      await repository.listSnapshots(account2.id),
      await repository.getAccount(marker, 'valr'),
      bridgeOutcome,
      bridgePersisted,
      await client.job.findMany({ where: { idempotencyKey: { in: allJobKeys } } }),
    ];
    for (const item of leakSurface) {
      const serialized = JSON.stringify(item);
      assert.ok(!serialized.includes('connslack-secret'), 'synthetic secret must never appear in any response surface');
      assert.ok(!serialized.includes('connslack-key'), 'synthetic key material must never appear in any response surface');
    }
    const capturedOutput = logBuffer.join('\n');
    assert.ok(!capturedOutput.includes('connslack-secret'), 'validator output must never contain the synthetic secret');
    console.log('CREDENTIAL_LEAK_CHECK=PASS');
    console.log('STAGING_CONNECTOR_VALIDATION=PASS');
    console.log('VALIDATOR-EXIT=0');
    console.log(`PASS synthetic PostgreSQL connector and job domain validated end-to-end with the deterministic mock provider only (${connectionLabel})`);
  } finally {
    console.log('CLEANUP-STARTED');
    if (account?.id) {
      await client.connectorBalance.deleteMany({ where: { snapshot: { connectorAccountId: account.id } } }).catch(() => undefined);
      await client.connectorSnapshot.deleteMany({ where: { connectorAccountId: account.id } }).catch(() => undefined);
      assert.equal(
        await client.connectorSnapshot.count({ where: { connectorAccountId: account.id } }),
        0,
        `snapshot cleanup failed (${currentStep})`,
      );
    }
    if (bridgeAssetId) {
      await client.brickAlphaAssessment.deleteMany({ where: { assetId: bridgeAssetId } }).catch(() => undefined);
      await client.valuation.deleteMany({ where: { assetId: bridgeAssetId } }).catch(() => undefined);
      await client.collectible.deleteMany({ where: { assetId: bridgeAssetId } }).catch(() => undefined);
      await client.asset.deleteMany({ where: { id: bridgeAssetId } }).catch(() => undefined);
      assert.equal(await client.valuation.count({ where: { assetId: bridgeAssetId } }), 0, `valuation cleanup failed (${currentStep})`);
      assert.equal(await client.brickAlphaAssessment.count({ where: { assetId: bridgeAssetId } }), 0, `assessment cleanup failed (${currentStep})`);
      assert.equal(await client.asset.count({ where: { id: bridgeAssetId } }), 0, `bridge asset cleanup failed (${currentStep})`);
    }
    await client.job.deleteMany({ where: { idempotencyKey: { in: allJobKeys } } }).catch(() => undefined);
    assert.equal(
      await client.job.count({ where: { idempotencyKey: { in: allJobKeys } } }),
      0,
      `job cleanup failed (${currentStep})`,
    );
    if (userId) {
      await client.connectorAccount.deleteMany({ where: { userId } }).catch(() => undefined);
      await client.user.delete({ where: { id: userId } }).catch(() => undefined);
      assert.equal(await client.user.count({ where: { email: userEmail } }), 0, `user cleanup failed (${currentStep})`);
    }
    const syntheticRemaining = (await client.user.count({ where: { email: userEmail } }))
      + (await client.connectorAccount.count({ where: { userId } }))
      + (await client.job.count({ where: { idempotencyKey: { in: allJobKeys } } }));
    assert.equal(syntheticRemaining, 0, `synthetic rows remain (${currentStep})`);
    console.log('SYNTHETIC_ROWS_REMAINING=0');
    console.log('PASS synthetic staging connector, job, and bridge valuation data removed');
  }
}

async function main() {
  try {
    if (process.env.RAILWAY_ENVIRONMENT_ID !== '145568f8-f723-427c-ab72-2839cd0ba9d4' || process.env.RAILWAY_SERVICE_ID !== '763f488b-f1d6-4304-b62d-1c3185dff88b') {
      throw new Error('staging_context_required');
    }
    if (process.env.DATABASE_URL_TUNNEL_PORT) {
      const url = new URL(process.env.DATABASE_URL);
      url.hostname = '127.0.0.1';
      url.port = String(Number(process.env.DATABASE_URL_TUNNEL_PORT));
      process.env.DATABASE_URL = url.toString();
    }
    await validate(getPrismaClient());
  } catch (error) {
    reportFailure(error);
    process.exitCode = 1;
  } finally {
    await disconnectPrisma();
  }
}

if (require.main === module) main();
module.exports = { validate, __currentStep: () => currentStep };