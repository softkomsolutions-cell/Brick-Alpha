// Synthetic PostgreSQL connector + job checks. A unique synthetic user, connector account,
// snapshot, balances, and jobs are removed in cleanup. Only the in-process deterministic mock
// provider is exercised. Named checkpoints report the exact validation STEP that failed
// (cleanup never overwrites it).
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { getPrismaClient, disconnectPrisma } = require('../db/prisma-client');
const { readConnectorConfig } = require('../config/connector');
const { createConnectorProviderRegistry } = require('../services/connectors/providers');
const { createPostgresConnectorRepository } = require('../repositories/postgresConnectorRepository');
const { createConnectorService } = require('../services/connector-service');
const { createJobRunner } = require('../services/job-runner');
const { buildHandlers } = require('../worker');
const { encryptConnectorPayload } = require('../services/connectors/cipher');

const SANITY_ONLY = process.argv.includes('--sanity-only');
const SAFE_FIELD = /^[A-Z0-9_]+$/;

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

function mockResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {},
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

async function validate(client) {
  const marker = crypto.randomUUID();
  const userEmail = `connslack-${marker}@example.test`;
  const secret = process.env.CONNECTOR_SECRET || process.env.AUTH_SECRET || crypto.randomBytes(24).toString('hex');
  const connectionLabel = `${marker.slice(0, 8)}`;
  process.env.CONNECTOR_SECRET = secret;

  let userId = null;
  let account = null;
  const jobKeys = [`val-job-${marker}`, `val-job-${marker}-dup`];

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
    console.log('PASS phase5_connector_jobs migration applied (Job tables, ConnectorAccount.healthState, JobType enum)');

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
      fetchFn: async () => mockResponse({ message: 'too many requests' }, 429),
    });
    const limitedService = createConnectorService({ repository, providers: limitedRegistry, config });
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
    console.log('PASS 429 maps to RATE_LIMITED with no secret leakage; a later provider pass recovers to HEALTHY');

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

    step('validate-complete');
    const account2 = await repository.getAccount(marker, 'valr');
    assert.ok(account2.lastSyncAt);
    assert.equal(await repository.countSnapshots(account2.id), (await repository.listSnapshots(account2.id)).length);
    for (const jobIdKey of [...jobKeys, `val-handler-${marker}`]) {
      const job = await repository.getJobByIdempotencyKey(jobIdKey);
      assert.ok(job, `job ${jobIdKey} must exist`);
      assert.ok(!JSON.stringify(job).includes('connslack'), 'jobs must never store raw credentials');
    }
    console.log('PASS connector accounts, snapshots, balances, and jobs persisted; no raw credentials anywhere');

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
    await client.job.deleteMany({ where: { idempotencyKey: { in: [...jobKeys, `val-handler-${marker}`] } } }).catch(() => undefined);
    assert.equal(
      await client.job.count({ where: { idempotencyKey: { in: [...jobKeys, `val-handler-${marker}`] } } }),
      0,
      `job cleanup failed (${currentStep})`,
    );
    if (userId) {
      await client.connectorAccount.deleteMany({ where: { userId } }).catch(() => undefined);
      await client.user.delete({ where: { id: userId } }).catch(() => undefined);
      assert.equal(await client.user.count({ where: { email: userEmail } }), 0, `user cleanup failed (${currentStep})`);
    }
    console.log('PASS synthetic staging connector and job data removed');
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