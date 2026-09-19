const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createPostgresConnectorRepository,
  statusFromLegacy,
  statusToLegacy,
} = require('../repositories/postgresConnectorRepository');

const UUID = '11111111-1111-4111-8111-111111111111';

function accountRow(overrides = {}) {
  return {
    id: UUID,
    userId: 'db-user-1',
    provider: 'valr',
    status: 'ONLINE',
    healthState: 'HEALTHY',
    unavailableUntil: null,
    lastHealthCheckAt: new Date('2026-09-16T00:00:00.000Z'),
    config: { preferredPair: 'BTCUSDT' },
    encryptedCredentials: 'blob',
    lastTestAt: null,
    lastSyncAt: new Date('2026-09-16T12:00:00.000Z'),
    lastError: null,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    updatedAt: new Date('2026-09-16T12:00:00.000Z'),
    ...overrides,
  };
}

test('status mapping round-trips legacy statuses through the ConnectorStatus enum', () => {
  assert.equal(statusFromLegacy({ status: 'online' }), 'ONLINE');
  assert.equal(statusFromLegacy({ status: 'configured' }), 'CONFIGURED');
  assert.equal(statusFromLegacy({ status: 'error' }), 'ERROR');
  assert.equal(statusFromLegacy({ status: 'manual_setup' }), 'MANUAL_SETUP');
  assert.equal(statusFromLegacy({ status: 'unsupported' }), 'UNSUPPORTED');
  assert.equal(statusFromLegacy({}), 'NOT_CONFIGURED');
  assert.equal(statusToLegacy('ONLINE'), 'online');
  assert.equal(statusToLegacy('MANUAL_SETUP'), 'manual_setup');
});

test('userDatabaseId resolves legacyId and rejects unknown users', async () => {
  const queries = [];
  const client = {
    user: { findFirst: async query => { queries.push(query); return { id: 'db-user-1', legacyId: 'legacy-user-1' }; } },
    connectorAccount: { findUnique: async () => accountRow() },
  };
  const repo = createPostgresConnectorRepository(client);
  const record = await repo.getAccount('legacy-user-1', 'valr');
  assert.equal(record.id, UUID);
  assert.deepEqual(queries[0].where.OR[0], { legacyId: 'legacy-user-1' });

  const missing = { user: { findFirst: async () => null } };
  await assert.rejects(createPostgresConnectorRepository(missing).getAccount('nobody', 'valr'), /auth_user_not_found/);
});

test('ensureAccount upserts on the userId_provider composite and maps health fields additively', async () => {
  let captured;
  const client = {
    user: { findFirst: async () => ({ id: 'db-user-1', legacyId: 'legacy-user-1' }) },
    connectorAccount: {
      upsert: async query => {
        captured = query;
        return accountRow();
      },
    },
  };
  const repo = createPostgresConnectorRepository(client);
  const row = await repo.ensureAccount({
    userId: 'legacy-user-1',
    providerId: 'valr',
    record: { status: 'online', config: { preferredPair: 'BTCUSDT' }, authBlob: 'blob', lastError: 'gone' },
    now: Date.now(),
  });
  assert.deepEqual(captured.where, { userId_provider: { userId: 'db-user-1', provider: 'valr' } });
  assert.equal(captured.create.status, 'ONLINE');
  assert.equal(captured.update.status, 'ONLINE');
  assert.equal(captured.create.healthState, 'UNKNOWN');
  assert.equal(captured.create.encryptedCredentials, 'blob');
  assert.equal(row.provider, 'valr');
  assert.equal(row.status, 'online');
  assert.equal(row.healthState, 'HEALTHY');
  assert.equal(row.hasCredentials, true);
});

test('getAccountCredentials returns the encrypted blob, config, and a safe record view', async () => {
  const client = {
    user: { findFirst: async () => ({ id: 'db-user-1', legacyId: 'legacy-user-1' }) },
    connectorAccount: { findUnique: async () => accountRow() },
  };
  const repo = createPostgresConnectorRepository(client);
  const record = await repo.getAccountCredentials('legacy-user-1', 'valr');
  assert.equal(record.blob, 'blob');
  assert.deepEqual(record.config.preferredPair, 'BTCUSDT');
  assert.equal(record.record.hasCredentials, true);
  assert.equal(record.record.status, 'online');
});

test('createSnapshotWithBalances persists a snapshot row and its balances (capped at 50)', async () => {
  const calls = [];
  const client = {
    connectorSnapshot: { create: async query => { calls.push(['snapshot', query]); return { id: UUID, fetchedAt: new Date('2026-09-16T12:00:00.000Z') }; } },
    connectorBalance: { create: async query => { calls.push(['balance', query]); return { id: UUID, ...query.data }; } },
  };
  const repo = createPostgresConnectorRepository(client);
  const balances = Array.from({ length: 60 }, (_, i) => ({ currency: `C${i}`, available: i, reserved: 0, total: i }));
  const result = await repo.createSnapshotWithBalances({
    accountId: UUID,
    snapshot: { fetchedAt: '2026-09-16T12:00:00.000Z', totalAssets: 60, fundedAssets: 60 },
    balances,
    now: Date.now(),
  });
  assert.equal(result.id, UUID);
  const snapshotCalls = calls.filter(([kind]) => kind === 'snapshot');
  const balanceCalls = calls.filter(([kind]) => kind === 'balance');
  assert.equal(snapshotCalls.length, 1);
  assert.equal(balanceCalls.length, 50, 'balances are persisted in bounded batches');
  assert.equal(snapshotCalls[0][1].data.totalAssets, 60);
  assert.equal(balanceCalls[0][1].data.currency, 'C0');
});

test('snapshot reads include ordered balances and funding counts', async () => {
  const rows = [{
    id: UUID,
    connectorAccountId: UUID,
    fetchedAt: new Date('2026-09-16T12:00:00.000Z'),
    totalAssets: 2,
    fundedAssets: 2,
    rawPayload: null,
    balances: [
      { id: 'b1', snapshotId: UUID, currency: 'ZAR', available: 5000, reserved: 200, total: 5200 },
      { id: 'b2', snapshotId: UUID, currency: 'BTC', available: 0.1, reserved: 0, total: 0.1 },
    ],
  }];
  const client = {
    connectorSnapshot: {
      findMany: async query => { assert.deepEqual(query.orderBy, [{ fetchedAt: 'desc' }, { id: 'desc' }]); assert.deepEqual(query.include.balances.orderBy, { currency: 'asc' }); return rows; },
      findFirst: async query => { assert.deepEqual(query.orderBy, [{ fetchedAt: 'desc' }, { id: 'desc' }]); assert.deepEqual(query.include.balances.orderBy, { currency: 'asc' }); return rows[0]; },
      count: async query => 2,
    },
  };
  const repo = createPostgresConnectorRepository(client);
  const list = await repo.listSnapshots(UUID);
  assert.equal(list.length, 1);
  assert.equal(list[0].fundedAssets, 2);
  assert.equal(list[0].balances[0].currency, 'ZAR');
  const latest = await repo.getLatestSnapshot(UUID);
  assert.equal(latest.id, UUID);
  assert.equal(await repo.countSnapshots(UUID), 2);
});

test('claimDueJobs uses FOR UPDATE SKIP LOCKED and leaves other rows untouched', async () => {
  const calls = [];
  const dueIds = ['job-alpha', 'job-beta'];
  const client = {
    $queryRawUnsafe: async (sql, runAt, limit) => {
      calls.push(['raw']);
      assert.match(sql, /FOR UPDATE SKIP LOCKED/);
      assert.ok(runAt instanceof Date);
      assert.equal(limit, 10);
      return dueIds.map(id => ({ id }));
    },
    job: {
      updateMany: async query => {
        calls.push(['updateMany']);
        assert.deepEqual(query.where.id.in, dueIds);
        assert.equal(query.data.status, 'RUNNING');
        assert.ok(query.data.runId);
      },
      findMany: async query => dueIds.map(id => ({ id, type: 'connector_refresh', provider: 'valr', status: 'RUNNING', idempotencyKey: `key-${id}`, runId: 'run-1', correlationId: null, attempts: 0, maxAttempts: 3, runAt: new Date(), startedAt: new Date(), completedAt: null, timeoutMs: 45000, errorCode: null, errorSummary: null, payload: null, result: null, createdAt: new Date(), updatedAt: new Date() })),
    },
  };
  const repo = createPostgresConnectorRepository(client);
  const jobs = await repo.claimDueJobs({ limit: 10, now: Date.now() });
  assert.equal(jobs.length, 2);
  assert.ok(calls.some(call => call[0] === 'raw'));
  assert.ok(calls.some(call => call[0] === 'updateMany'));
  assert.equal(jobs[0].status, 'RUNNING');
  assert.equal(jobs[0].runId, 'run-1');

  const empty = await createPostgresConnectorRepository({
    $queryRawUnsafe: async () => [],
    job: { updateMany: async () => { throw new Error('should not run'); }, findMany: async () => [] },
  }).claimDueJobs({ limit: 10 });
  assert.deepEqual(empty, []);
});

test('enqueueJob dedupes on the unique idempotency key and requires one', async () => {
  let uniqueResult = { id: UUID, idempotencyKey: 'dup-key', type: 'connector_refresh', status: 'QUEUED' };
  const client = {
    job: {
      createMany: async query => {
        assert.equal(query.skipDuplicates, true);
        assert.equal(query.data[0].idempotencyKey, 'dup-key');
        return { count: 1 };
      },
      findUnique: async () => uniqueResult,
    },
  };
  const repo = createPostgresConnectorRepository(client);
  const enqueued = await repo.enqueueJob({ type: 'connector_refresh', provider: 'valr', idempotencyKey: 'dup-key' });
  assert.equal(enqueued.duplicate, undefined);

  const dupRepo = createPostgresConnectorRepository({
    job: { createMany: async () => ({ count: 0 }), findUnique: async () => uniqueResult },
  });
  const dup = await dupRepo.enqueueJob({ type: 'connector_refresh', idempotencyKey: 'dup-key' });
  assert.equal(dup.duplicate, true);
  assert.equal(dup.id, UUID);

  await assert.rejects(repo.enqueueJob({ type: 'connector_refresh' }), /idempotency_key_required/);
});

test('job lifecycle writes persist attempts, error codes, and bounded summaries', async () => {
  const calls = [];
  const client = {
    job: {
      update: async query => { calls.push(query); return { id: UUID, ...query.data }; },
    },
  };
  const repo = createPostgresConnectorRepository(client);

  await repo.markCompleted({ jobId: UUID, result: { ok: true }, attempts: 1 });
  await repo.scheduleRetry({ jobId: UUID, nextRunAt: new Date('2026-09-17T00:00:00.000Z'), attempts: 2, errorCode: 'RATE_LIMITED', errorSummary: 'too fast' });
  await repo.markFailed({ jobId: UUID, attempts: 2, errorCode: 'AUTH_FAILED', errorSummary: 'bad key' });

  assert.equal(calls[0].data.status, 'COMPLETED');
  assert.deepEqual(calls[0].data.result, { ok: true });
  assert.equal(calls[1].data.status, 'QUEUED');
  assert.equal(calls[1].data.errorCode, 'RATE_LIMITED');
  assert.equal(calls[2].data.status, 'FAILED');
  assert.equal(calls[2].data.attempts, 2);
  assert.equal(calls[2].data.errorCode, 'AUTH_FAILED');
});

test('transactions retry only on serializable conflict codes (P2034/P2002/40001)', async () => {
  const calls = [];
  const client = {
    $transaction: async (work, options) => {
      assert.equal(options.isolationLevel, 'Serializable');
      calls.push(1);
      if (calls.length < 2) throw Object.assign(new Error('conflict'), { code: 'P2034' });
      return work({ ...client, connectorAccount: { findUnique: async () => null } });
    },
  };
  const repo = createPostgresConnectorRepository(client);
  const value = await repo.transaction(async tx => 'committed');
  assert.equal(value, 'committed');
  assert.equal(calls.length, 2);

  const fatal = createPostgresConnectorRepository({
    $transaction: async () => { throw Object.assign(new Error('boom'), { code: 'P2025' }); },
  });
  await assert.rejects(fatal.transaction(async () => 1), /boom/);
});