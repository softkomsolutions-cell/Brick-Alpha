const { randomUUID } = require('node:crypto');

function createMemoryConnectorRepository() {
  const state = {
    users: new Map(),
    accounts: new Map(),
    snapshots: new Map(),
    balances: new Map(),
    jobs: new Map(),
  };
  let chain = Promise.resolve();

  function cloneState() {
    return Object.fromEntries(Object.entries(state).map(([key, value]) => [key, new Map(value)]));
  }
  function restore(snapshot) {
    for (const [key, value] of Object.entries(snapshot)) {
      state[key].clear();
      for (const [id, row] of value) state[key].set(id, row);
    }
  }

  const nowIso = () => new Date().toISOString();
  const statusFromLegacy = (record) => {
    const map = {
      not_configured: 'NOT_CONFIGURED',
      configured: 'CONFIGURED',
      online: 'ONLINE',
      error: 'ERROR',
      manual_setup: 'MANUAL_SETUP',
      unsupported: 'UNSUPPORTED',
    };
    return map[String(record?.status || '').trim().toLowerCase()] || 'NOT_CONFIGURED';
  };

  async function userDatabaseId(userId) {
    let user = state.users.get(userId);
    if (!user) {
      user = { id: userId, legacyId: userId };
      state.users.set(userId, user);
    }
    return user.id;
  }

  const repo = {
    __state: state,
    async reset() {
      const previous = chain;
      let release;
      chain = new Promise(resolve => { release = resolve; });
      await previous;
      for (const key of Object.keys(state)) state[key].clear();
      release();
    },
    async seedUser(userId) {
      const previous = chain;
      let release;
      chain = new Promise(resolve => { release = resolve; });
      await previous;
      state.users.set(userId, { id: userId, legacyId: userId });
      release();
    },
    async transaction(work) {
      const previous = chain;
      let release;
      chain = new Promise(resolve => { release = resolve; });
      await previous;
      const snapshot = cloneState();
      try {
        return await work(repo);
      } catch (error) {
        restore(snapshot);
        throw error;
      } finally {
        release();
      }
    },

    async ensureAccount({ userId, providerId, record, now }) {
      const dbId = await userDatabaseId(userId);
      const key = `${dbId}:${providerId}`;
      const existing = state.accounts.get(key);
      const row = {
        id: existing?.id || randomUUID(),
        userId: dbId,
        provider: providerId,
        status: statusFromLegacy(record),
        healthState: existing?.healthState || 'UNKNOWN',
        unavailableUntil: existing?.unavailableUntil ?? null,
        lastHealthCheckAt: existing?.lastHealthCheckAt ?? null,
        config: record?.config || {},
        encryptedCredentials: record?.authBlob || null,
        lastTestAt: record?.lastTestAt ? new Date(record.lastTestAt).toISOString() : null,
        lastSyncAt: record?.lastSyncAt ? new Date(record.lastSyncAt).toISOString() : null,
        lastError: record?.lastError ? String(record.lastError).slice(0, 220) : null,
        createdAt: existing?.createdAt || nowIso(),
        updatedAt: nowIso(),
      };
      state.accounts.set(key, row);
      return viewAccount(row);
    },

    async getAccount(userId, providerId) {
      const dbId = await userDatabaseId(userId);
      const row = state.accounts.get(`${dbId}:${providerId}`) || null;
      return row ? viewAccount(row) : null;
    },

    async getAccountCredentials(userId, providerId) {
      const dbId = await userDatabaseId(userId);
      const row = state.accounts.get(`${dbId}:${providerId}`) || null;
      return row ? { blob: row.encryptedCredentials, config: row.config || {}, record: viewAccount(row) } : null;
    },

    async listAccounts({ userId, providerId } = {}) {
      const dbId = userId ? await userDatabaseId(userId) : null;
      const rows = [...state.accounts.values()]
        .filter(row => (dbId ? row.userId === dbId : true))
        .filter(row => (providerId ? row.provider === providerId : true))
        .sort((a, b) => a.provider.localeCompare(b.provider));
      return rows.map(viewAccount);
    },

    async createSnapshotWithBalances({ accountId, snapshot, balances, now }) {
      const id = randomUUID();
      const fetchedAt = (snapshot.fetchedAt ? new Date(snapshot.fetchedAt) : new Date(now || Date.now())).toISOString();
      const row = {
        id,
        connectorAccountId: accountId,
        fetchedAt,
        totalAssets: snapshot.totalAssets ?? balances.length,
        fundedAssets: snapshot.fundedAssets ?? balances.filter(b => Math.abs(b.total) > 0).length,
        rawPayload: snapshot.rawPayload ?? null,
      };
      state.snapshots.set(id, row);
      for (const balance of balances.slice(0, 50)) {
        const balanceRow = {
          id: randomUUID(),
          snapshotId: id,
          currency: balance.currency,
          available: Number(balance.available),
          reserved: Number(balance.reserved),
          total: Number(balance.total),
        };
        state.balances.set(`${id}:${balance.currency}`, balanceRow);
      }
      return { id, fetchedAt };
    },

    async countSnapshots(accountId) {
      return [...state.snapshots.values()].filter(row => row.connectorAccountId === accountId).length;
    },

    async listSnapshots(accountId, { limit = 20 } = {}) {
      return [...state.snapshots.values()]
        .filter(row => row.connectorAccountId === accountId)
        .sort((a, b) => String(b.fetchedAt).localeCompare(String(a.fetchedAt)) || String(b.id).localeCompare(String(a.id)))
        .slice(0, Math.max(1, Math.min(100, limit)))
        .map(row => viewSnapshot(row, state.balances));
    },

    async getLatestSnapshot(accountId) {
      const rows = await repo.listSnapshots(accountId, { limit: 1 });
      return rows[0] || null;
    },

    async recordHealth({ accountId, healthState, unavailableUntil, lastHealthCheckAt, status, lastError, now }) {
      const accounts = state.accounts.values();
      const row = [...accounts].find(account => account.id === accountId);
      if (row) {
        row.healthState = healthState || 'UNKNOWN';
        row.unavailableUntil = unavailableUntil ? new Date(unavailableUntil).toISOString() : null;
        row.lastHealthCheckAt = (lastHealthCheckAt ? new Date(lastHealthCheckAt) : new Date(now || Date.now())).toISOString();
        if (status) row.status = statusFromLegacy({ status });
        if (lastError !== undefined) row.lastError = lastError;
        row.updatedAt = nowIso();
      }
    },

    async touchLastSync({ accountId, lastSyncAt, status, now }) {
      const row = [...state.accounts.values()].find(account => account.id === accountId);
      if (row) {
        row.lastSyncAt = (lastSyncAt ? new Date(lastSyncAt) : new Date(now || Date.now())).toISOString();
        if (status) row.status = statusFromLegacy({ status });
        row.lastError = null;
        row.healthState = 'HEALTHY';
        row.unavailableUntil = null;
        row.updatedAt = nowIso();
      }
    },

    async recordFailure({ accountId, status, healthState, unavailableUntil, lastError, now }) {
      const row = [...state.accounts.values()].find(account => account.id === accountId);
      if (row) {
        if (status) row.status = statusFromLegacy({ status });
        row.healthState = healthState || 'DEGRADED';
        row.unavailableUntil = unavailableUntil ? new Date(unavailableUntil).toISOString() : null;
        if (lastError != null) row.lastError = String(lastError).slice(0, 220);
        row.updatedAt = nowIso();
      }
    },

    // ──────────────────────── Jobs ────────────────────────

    async enqueueJob(input) {
      const idempotencyKey = String(input.idempotencyKey || '').trim();
      if (!idempotencyKey) throw new Error('idempotency_key_required');
      for (const job of state.jobs.values()) {
        if (job.idempotencyKey === idempotencyKey) {
          return { ...viewJob(job), duplicate: true };
        }
      }
      const row = {
        id: randomUUID(),
        type: input.type,
        provider: input.provider || null,
        status: 'QUEUED',
        idempotencyKey,
        runId: null,
        correlationId: input.correlationId || null,
        attempts: 0,
        maxAttempts: input.maxAttempts ?? 3,
        runAt: (input.runAt ? new Date(input.runAt) : new Date()).toISOString(),
        startedAt: null,
        completedAt: null,
        timeoutMs: input.timeoutMs ?? 45000,
        retryPolicy: input.retryPolicy ?? null,
        errorCode: null,
        errorSummary: null,
        payload: input.payload ?? null,
        result: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      state.jobs.set(row.id, row);
      return viewJob(row);
    },

    async getJobByRunId(runId) {
      const row = [...state.jobs.values()].find(job => job.runId === runId) || null;
      return row ? viewJob(row) : null;
    },

    async getJobByIdempotencyKey(idempotencyKey) {
      const row = [...state.jobs.values()].find(job => job.idempotencyKey === idempotencyKey) || null;
      return row ? viewJob(row) : null;
    },

    async claimDueJobs({ limit = 20, now = Date.now() } = {}) {
      return repo.transaction(async txWork => {
        const due = [...state.jobs.values()]
          .filter(job => job.status === 'QUEUED' && Date.parse(job.runAt) <= now)
          .sort((a, b) => Date.parse(a.runAt) - Date.parse(b.runAt));
        const claimed = due.slice(0, limit);
        for (const job of claimed) {
          job.status = 'RUNNING';
          job.startedAt = new Date(now).toISOString();
          job.runId = randomUUID();
          job.updatedAt = nowIso();
        }
        return claimed.map(viewJob);
      });
    },

    async markRunning({ jobId, now = Date.now() }) {
      const job = state.jobs.get(jobId);
      if (job) {
        job.status = 'RUNNING';
        job.startedAt = new Date(now).toISOString();
        job.runId = randomUUID();
        job.updatedAt = nowIso();
      }
    },

    async markCompleted({ jobId, result, attempts, now = Date.now() }) {
      const job = state.jobs.get(jobId);
      if (job) {
        job.status = 'COMPLETED';
        job.completedAt = new Date(now).toISOString();
        if (attempts !== undefined) job.attempts = attempts;
        if (result !== undefined) job.result = result;
        job.updatedAt = nowIso();
      }
    },

    async scheduleRetry({ jobId, nextRunAt, attempts, errorCode, errorSummary, now = Date.now() }) {
      const job = state.jobs.get(jobId);
      if (job) {
        job.status = 'QUEUED';
        job.startedAt = null;
        job.runId = null;
        job.runAt = new Date(nextRunAt).toISOString();
        if (attempts !== undefined) job.attempts = attempts;
        if (errorCode !== undefined) job.errorCode = errorCode;
        if (errorSummary != null) job.errorSummary = String(errorSummary).slice(0, 220);
        job.updatedAt = new Date(now).toISOString();
      }
    },

    async markFailed({ jobId, attempts, errorCode, errorSummary, now = Date.now() }) {
      const job = state.jobs.get(jobId);
      if (job) {
        job.status = 'FAILED';
        job.completedAt = new Date(now).toISOString();
        job.runId = null;
        if (attempts !== undefined) job.attempts = attempts;
        if (errorCode !== undefined) job.errorCode = errorCode;
        if (errorSummary != null) job.errorSummary = String(errorSummary).slice(0, 220);
        job.updatedAt = new Date(now).toISOString();
      }
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
    status: String(row.status).toLowerCase(),
    healthState: row.healthState || 'UNKNOWN',
    unavailableUntil: row.unavailableUntil || null,
    lastHealthCheckAt: row.lastHealthCheckAt || null,
    config: row.config || {},
    hasCredentials: Boolean(row.encryptedCredentials),
    lastTestAt: row.lastTestAt || null,
    lastSyncAt: row.lastSyncAt || null,
    lastError: row.lastError || null,
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null,
  };
}

function viewSnapshot(row, balances = new Map()) {
  if (!row) return null;
  const balanceRows = [...balances.values()]
    .filter(balance => balance.snapshotId === row.id)
    .sort((a, b) => a.currency.localeCompare(b.currency));
  const fundedAssets = balanceRows.filter(balance => Math.abs(balance.total) > 0).length;
  return {
    id: row.id,
    connectorAccountId: row.connectorAccountId,
    fetchedAt: row.fetchedAt,
    totalAssets: row.totalAssets ?? balanceRows.length,
    fundedAssets,
    balances: balanceRows.map(balance => ({
      id: balance.id,
      snapshotId: balance.snapshotId,
      currency: balance.currency,
      available: balance.available,
      reserved: balance.reserved,
      total: balance.total,
    })),
    rawPayload: row.rawPayload || null,
  };
}

function viewJob(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    provider: row.provider,
    status: row.status,
    idempotencyKey: row.idempotencyKey,
    runId: row.runId,
    correlationId: row.correlationId,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    runAt: row.runAt,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    timeoutMs: row.timeoutMs,
    errorCode: row.errorCode,
    errorSummary: row.errorSummary,
    payload: row.payload,
    result: row.result,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

module.exports = { createMemoryConnectorRepository };