const { Prisma } = require('@prisma/client');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function statusFromLegacy(record) {
  const map = {
    not_configured: 'NOT_CONFIGURED',
    configured: 'CONFIGURED',
    online: 'ONLINE',
    error: 'ERROR',
    manual_setup: 'MANUAL_SETUP',
    unsupported: 'UNSUPPORTED',
  };
  return map[String(record?.status || '').trim().toLowerCase()] || 'NOT_CONFIGURED';
}

function statusToLegacy(prismaStatus) {
  return String(prismaStatus || 'NOT_CONFIGURED').trim().toLowerCase();
}

function createPostgresConnectorRepository(client, insideTransaction = false) {
  const db = () => typeof client === 'function' ? client() : client;

  async function userDatabaseId(legacyUserId) {
    const user = await db().user.findFirst({
      where: { OR: [{ legacyId: legacyUserId }, ...(UUID.test(legacyUserId) ? [{ id: legacyUserId }] : [])] },
    });
    if (!user) throw new Error('auth_user_not_found');
    return user.id;
  }

  const repo = {
    async transaction(work) {
      if (insideTransaction) return work(repo);
      let lastError = null;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          return await db().$transaction(
            tx => work(createPostgresConnectorRepository(tx, true)),
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 },
          );
        } catch (error) {
          lastError = error;
          if (error?.code !== 'P2034' && error?.code !== 'P2002' && String(error?.meta?.code) !== '40001') {
            throw error;
          }
        }
      }
      throw lastError;
    },

    async ensureAccount({ userId, providerId, record, now }) {
      const dbId = await userDatabaseId(userId);
      const data = {
        status: statusFromLegacy(record),
        healthState: 'UNKNOWN',
        config: record?.config || {},
        encryptedCredentials: record?.authBlob || null,
        lastTestAt: record?.lastTestAt ? new Date(record.lastTestAt) : null,
        lastSyncAt: record?.lastSyncAt ? new Date(record.lastSyncAt) : null,
        lastError: record?.lastError ? String(record.lastError).slice(0, 220) : null,
        updatedAt: now ? new Date(now) : undefined,
      };
      const row = await db().connectorAccount.upsert({
        where: { userId_provider: { userId: dbId, provider: providerId } },
        create: { userId: dbId, provider: providerId, ...data, createdAt: now ? new Date(now) : undefined },
        update: data,
      });
      return viewAccount(row);
    },

    async getAccount(userId, providerId) {
      const dbId = await userDatabaseId(userId);
      const row = await db().connectorAccount.findUnique({ where: { userId_provider: { userId: dbId, provider: providerId } } });
      return row ? viewAccount(row) : null;
    },

    async getAccountCredentials(userId, providerId) {
      const dbId = await userDatabaseId(userId);
      const row = await db().connectorAccount.findUnique({ where: { userId_provider: { userId: dbId, provider: providerId } } });
      return row ? { blob: row.encryptedCredentials, config: row.config || {}, record: viewAccount(row) } : null;
    },

    async listAccounts({ userId, providerId } = {}) {
      const where = {};
      if (userId) where.userId = await userDatabaseId(userId);
      if (providerId) where.provider = providerId;
      const rows = await db().connectorAccount.findMany({ where, orderBy: [{ provider: 'asc' }] });
      return rows.map(viewAccount);
    },

    async createSnapshotWithBalances({ accountId, snapshot, balances, now }) {
      const db = () => typeof client === 'function' ? client() : client;
      const snapshotRow = await db().connectorSnapshot.create({
        data: {
          connectorAccountId: accountId,
          fetchedAt: snapshot.fetchedAt ? new Date(snapshot.fetchedAt) : now ? new Date(now) : undefined,
          totalAssets: snapshot.totalAssets ?? null,
          fundedAssets: snapshot.fundedAssets ?? null,
          rawPayload: snapshot.rawPayload ?? null,
        },
      });
      for (const balance of balances.slice(0, 50)) {
        await db().connectorBalance.create({
          data: {
            snapshotId: snapshotRow.id,
            currency: balance.currency,
            available: balance.available,
            reserved: balance.reserved,
            total: balance.total,
          },
        });
      }
      return { id: snapshotRow.id, fetchedAt: snapshotRow.fetchedAt.toISOString() };
    },

    async countSnapshots(accountId) {
      return db().connectorSnapshot.count({ where: { connectorAccountId: accountId } });
    },

    async listSnapshots(accountId, { limit = 20 } = {}) {
      const rows = await db().connectorSnapshot.findMany({
        where: { connectorAccountId: accountId },
        orderBy: [{ fetchedAt: 'desc' }, { id: 'desc' }],
        take: Math.max(1, Math.min(100, limit)),
        include: { balances: { orderBy: { currency: 'asc' } } },
      });
      return rows.map(viewSnapshot);
    },

    async getLatestSnapshot(accountId) {
      const row = await db().connectorSnapshot.findFirst({
        where: { connectorAccountId: accountId },
        orderBy: [{ fetchedAt: 'desc' }, { id: 'desc' }],
        include: { balances: { orderBy: { currency: 'asc' } } },
      });
      return row ? viewSnapshot(row) : null;
    },

    async recordHealth({ accountId, healthState, unavailableUntil, lastHealthCheckAt, status, lastError, now }) {
      await db().connectorAccount.update({
        where: { id: accountId },
        data: {
          healthState: healthState || 'UNKNOWN',
          unavailableUntil: unavailableUntil ? new Date(unavailableUntil) : null,
          lastHealthCheckAt: lastHealthCheckAt ? new Date(lastHealthCheckAt) : now ? new Date(now) : undefined,
          ...(status ? { status: statusFromLegacy({ status }) } : {}),
          lastError: lastError !== undefined ? lastError : undefined,
          updatedAt: now ? new Date(now) : undefined,
        },
      });
    },

    async touchLastSync({ accountId, lastSyncAt, status, now }) {
      await db().connectorAccount.update({
        where: { id: accountId },
        data: {
          lastSyncAt: lastSyncAt ? new Date(lastSyncAt) : now ? new Date(now) : undefined,
          ...(status ? { status: statusFromLegacy({ status }) } : {}),
          lastError: null,
          healthState: 'HEALTHY',
          unavailableUntil: null,
          updatedAt: now ? new Date(now) : undefined,
        },
      });
    },

    async recordFailure({ accountId, status, healthState, unavailableUntil, lastError, now }) {
      await db().connectorAccount.update({
        where: { id: accountId },
        data: {
          ...(status ? { status: statusFromLegacy({ status }) } : {}),
          healthState: healthState || 'DEGRADED',
          unavailableUntil: unavailableUntil ? new Date(unavailableUntil) : null,
          lastError: lastError != null ? String(lastError).slice(0, 220) : null,
          updatedAt: now ? new Date(now) : undefined,
        },
      });
    },

    // ──────────────────────── Jobs ────────────────────────

    async enqueueJob(input) {
      const idempotencyKey = String(input.idempotencyKey || '').trim();
      if (!idempotencyKey) throw new Error('idempotency_key_required');
      const db = () => typeof client === 'function' ? client() : client;
      const result = await db().job.createMany({
        data: [{
          type: input.type,
          provider: input.provider || null,
          status: 'QUEUED',
          idempotencyKey,
          correlationId: input.correlationId || null,
          attempts: 0,
          maxAttempts: input.maxAttempts ?? 3,
          runAt: input.runAt ? new Date(input.runAt) : new Date(),
          timeoutMs: input.timeoutMs ?? 45000,
          retryPolicy: input.retryPolicy ?? null,
          payload: input.payload ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }],
        skipDuplicates: true,
      });
      if (result.count) {
        return (await db().job.findUnique({ where: { idempotencyKey } }));
      }
      return { ...(await db().job.findUnique({ where: { idempotencyKey } })), duplicate: true };
    },

    async getJobByRunId(runId) {
      const db = () => typeof client === 'function' ? client() : client;
      return db().job.findUnique({ where: { runId } });
    },

    async getJobByIdempotencyKey(idempotencyKey) {
      const db = () => typeof client === 'function' ? client() : client;
      return db().job.findUnique({ where: { idempotencyKey } });
    },

    async claimDueJobs({ limit = 20, now = Date.now() } = {}) {
      const db = () => typeof client === 'function' ? client() : client;
      const maxRunAt = new Date(now);
      const ids = await db().$queryRawUnsafe(
        `SELECT "id" FROM "Job" WHERE "status" = 'QUEUED' AND "runAt" <= $1 ORDER BY "runAt" LIMIT $2 FOR UPDATE SKIP LOCKED`,
        maxRunAt,
        limit,
      );
      if (!ids.length) return [];
      const idValues = ids.map(row => row.id);
      await db().job.updateMany({
        where: { id: { in: idValues } },
        data: {
          status: 'RUNNING',
          startedAt: new Date(now),
          runId: require('node:crypto').randomUUID(),
          updatedAt: new Date(now),
        },
      });
      const rows = await db().job.findMany({ where: { id: { in: idValues } } });
      return rows.map(viewJob);
    },

    async markRunning({ jobId, now = Date.now() }) {
      const db = () => typeof client === 'function' ? client() : client;
      await db().job.update({
        where: { id: jobId },
        data: {
          status: 'RUNNING',
          startedAt: new Date(now),
          runId: require('node:crypto').randomUUID(),
          updatedAt: new Date(now),
        },
      });
    },

    async markCompleted({ jobId, result, attempts, now = Date.now() }) {
      const db = () => typeof client === 'function' ? client() : client;
      await db().job.update({
        where: { id: jobId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(now),
          attempts: attempts ?? undefined,
          result: result ?? undefined,
          updatedAt: new Date(now),
        },
      });
    },

    async scheduleRetry({ jobId, nextRunAt, attempts, errorCode, errorSummary, now = Date.now() }) {
      const db = () => typeof client === 'function' ? client() : client;
      await db().job.update({
        where: { id: jobId },
        data: {
          status: 'QUEUED',
          startedAt: null,
          runId: null,
          runAt: new Date(nextRunAt),
          attempts: attempts ?? undefined,
          errorCode: errorCode ?? undefined,
          errorSummary: errorSummary != null ? String(errorSummary).slice(0, 220) : undefined,
          updatedAt: new Date(now),
        },
      });
    },

    async markFailed({ jobId, attempts, errorCode, errorSummary, now = Date.now() }) {
      const db = () => typeof client === 'function' ? client() : client;
      await db().job.update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          completedAt: new Date(now),
          attempts: attempts ?? undefined,
          runId: null,
          errorCode: errorCode ?? undefined,
          errorSummary: errorSummary != null ? String(errorSummary).slice(0, 220) : undefined,
          updatedAt: new Date(now),
        },
      });
    },
  };

  return repo;
}

function viewAccount(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.userId,
    provider: row.provider,
    status: statusToLegacy(row.status),
    healthState: String(row.healthState || 'UNKNOWN'),
    unavailableUntil: row.unavailableUntil?.toISOString?.() || null,
    lastHealthCheckAt: row.lastHealthCheckAt?.toISOString?.() || null,
    config: row.config || {},
    hasCredentials: Boolean(row.encryptedCredentials),
    lastTestAt: row.lastTestAt?.toISOString?.() || null,
    lastSyncAt: row.lastSyncAt?.toISOString?.() || null,
    lastError: row.lastError || null,
    createdAt: row.createdAt?.toISOString?.() || null,
    updatedAt: row.updatedAt?.toISOString?.() || null,
  };
}

function viewSnapshot(row) {
  if (!row) return null;
  const balances = Array.isArray(row.balances)
    ? row.balances.map(b => ({
        id: b.id,
        snapshotId: b.snapshotId,
        currency: b.currency,
        available: Number(b.available),
        reserved: Number(b.reserved),
        total: Number(b.total),
      }))
    : [];
  const fundedAssets = balances.filter(b => Math.abs(b.total) > 0).length;
  return {
    id: row.id,
    connectorAccountId: row.connectorAccountId,
    fetchedAt: row.fetchedAt?.toISOString?.() || null,
    totalAssets: row.totalAssets ?? balances.length,
    fundedAssets,
    balances,
    rawPayload: row.rawPayload || null,
  };
}

function viewJob(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: String(row.type),
    provider: row.provider || null,
    status: String(row.status),
    idempotencyKey: row.idempotencyKey,
    runId: row.runId || null,
    correlationId: row.correlationId || null,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    runAt: row.runAt?.toISOString?.() || null,
    startedAt: row.startedAt?.toISOString?.() || null,
    completedAt: row.completedAt?.toISOString?.() || null,
    timeoutMs: row.timeoutMs,
    errorCode: row.errorCode || null,
    errorSummary: row.errorSummary || null,
    payload: row.payload || null,
    result: row.result || null,
    createdAt: row.createdAt?.toISOString?.() || null,
    updatedAt: row.updatedAt?.toISOString?.() || null,
  };
}

module.exports = {
  createPostgresConnectorRepository,
  statusFromLegacy,
  statusToLegacy,
};