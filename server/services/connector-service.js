const { classifyFailure, healthStateFor, safeSummary } = require('./connectors/failure');
const { connectorFreshness, shouldRefresh, UNAVAILABLE_STATUS } = require('./connectors/freshness');
const { withTimeout } = require('./connectors/timeout');

function createConnectorService({ repository, providers, config, valuation = null }) {
  if (!repository) throw new Error('connector_repository_required');
  if (!providers) throw new Error('connector_providers_required');

  const refreshAfterMs = config.refreshAfterMs;
  const reviewMs = config.reviewMs;
  const providerTimeoutMs = config.providerTimeoutMs;

  function providerContext(record = {}, signal) {
    return {
      config: {
        subAccountId: record.config?.subAccountId || '',
        preferredPair: record.config?.preferredPair || '',
        timeoutMs: providerTimeoutMs,
      },
      signal,
    };
  }

  async function refreshSnapshot({ userId, providerId, credentials, record = {}, now = Date.now(), force = false, idempotencyKey = null, excludeJobId = null }) {
    const provider = providers.get(providerId);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), providerTimeoutMs);

    if (idempotencyKey) {
      const existing = await repository.getJobByIdempotencyKey(idempotencyKey);
      if (existing && existing.id !== excludeJobId && ['QUEUED', 'RUNNING', 'COMPLETED'].includes(existing.status)) {
        clearTimeout(timeout);
        return { skipped: 'duplicate', reason: 'idempotency_key_already_ran', job: existing };
      }
    }

    let account = await repository.getAccount(userId, providerId);
    if (!account) {
      account = await repository.ensureAccount({ userId, providerId, record: record.status ? record : { ...record, status: 'configured' }, now });
    }

    const freshness = connectorFreshness({
      observedAt: account.lastSyncAt,
      now,
      refreshAfterMs,
      reviewMs,
      sourceAvailable: true,
    });

    if (!force && !shouldRefresh(freshness)) {
      return { skipped: 'fresh', status: 'skipped_fresh', freshness, account };
    }

    try {
      const snapshot = await withTimeout(
        provider.fetchPortfolioSnapshot(credentials, providerContext(record, controller.signal)),
        providerTimeoutMs,
        'JOB_TIMEOUT',
      ).finally(() => clearTimeout(timeout));

      const balances = Array.isArray(snapshot.balances) ? snapshot.balances : [];
      await repository.transaction(async tx => {
        await tx.touchLastSync({ accountId: account.id, lastSyncAt: snapshot.fetchedAt || now, status: 'online', now });
        await tx.createSnapshotWithBalances({ accountId: account.id, snapshot, balances, now });
      });
      const refreshedAccount = await repository.getAccount(userId, providerId);
      return {
        status: 'refreshed',
        freshness: connectorFreshness({ observedAt: refreshedAccount.lastSyncAt, now, refreshAfterMs, reviewMs, sourceAvailable: true }),
        account: refreshedAccount,
        snapshot: {
          id: refreshedAccount.lastSyncAt,
          fetchedAt: refreshedAccount.lastSyncAt,
          totalAssets: snapshot.totalAssets,
          fundedAssets: snapshot.fundedAssets,
          balances: balances.slice(0, 50),
        },
      };
    } catch (error) {
      const failure = classifyFailure(error, { timeoutMs: providerTimeoutMs });
      const healthState = healthStateFor(failure.failureClass, account.healthState);
      const unavailableUntil = failure.failureClass === 'RATE_LIMITED'
        ? new Date(now + (failure.retryAfterSeconds ? failure.retryAfterSeconds * 1000 : config.backoffMs)).toISOString()
        : failure.failureClass === 'PROVIDER_UNAVAILABLE'
          ? new Date(now + config.backoffMs).toISOString()
          : null;
      await repository.recordFailure({
        accountId: account.id,
        status: 'error',
        healthState,
        unavailableUntil,
        lastError: safeSummary(error?.message),
        now,
      });
      throw Object.assign(new Error(safeSummary(error?.message) || 'connector_refresh_failed'), {
        code: 'connector_refresh_failed',
        failure: { ...failure.failureClass, ...failure },
        healthState,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  async function health({ userId, providerId, credentials, record = {}, now = Date.now() }) {
    const provider = providers.get(providerId);
    const account = await repository.getAccount(userId, providerId);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), providerTimeoutMs);

    try {
      const probe = await withTimeout(
        provider.health(credentials, providerContext(record, controller.signal)),
        providerTimeoutMs,
        'JOB_TIMEOUT',
      );
      const healthState = probe.available ? 'HEALTHY' : 'DEGRADED';
      const failure = probe.available ? null : classifyFailure(probe, { timeoutMs: providerTimeoutMs });
      if (account) {
        await repository.recordHealth({
          accountId: account.id,
          healthState: probe.available ? 'HEALTHY' : healthStateFor(failure?.failureClass || 'RETRYABLE', account.healthState),
          unavailableUntil: probe.available ? null : new Date(now + config.backoffMs).toISOString(),
          lastHealthCheckAt: now,
          status: probe.available ? 'online' : 'error',
          lastError: probe.available ? null : safeSummary(probe.detail || 'provider_unavailable'),
          now,
        });
      }
      return { available: probe.available, healthState, probe, checkedAt: new Date(now).toISOString() };
    } catch (error) {
      const failure = classifyFailure(error, { timeoutMs: providerTimeoutMs });
      const healthState = healthStateFor(failure.failureClass, account?.healthState || 'UNKNOWN');
      if (account) {
        await repository.recordHealth({
          accountId: account.id,
          healthState,
          unavailableUntil: new Date(now + config.backoffMs).toISOString(),
          lastHealthCheckAt: now,
          status: 'error',
          lastError: safeSummary(error?.message),
          now,
        });
      }
      return { available: false, healthState, probe: { detail: safeSummary(error?.message) }, checkedAt: new Date(now).toISOString() };
    } finally {
      clearTimeout(timeout);
    }
  }

  async function status({ userId, providerId, now = Date.now() }) {
    const provider = providers.get(providerId);
    const account = await repository.getAccount(userId, providerId);
    const latestSnapshot = account ? await repository.getLatestSnapshot(account.id) : null;
    const snapshotCount = account ? await repository.countSnapshots(account.id) : 0;
    const unavailableUntil = account?.unavailableUntil || null;
    const sourceAvailable = !unavailableUntil || Date.parse(unavailableUntil) <= now;
    const freshness = account
      ? connectorFreshness({ observedAt: account.lastSyncAt, now, refreshAfterMs, reviewMs, sourceAvailable })
      : UNAVAILABLE_STATUS;
    const healthState = account?.healthState || (freshness === UNAVAILABLE_STATUS ? 'UNAVAILABLE' : 'UNKNOWN');
    return {
      provider: provider.id,
      name: provider.name,
      desk: provider.desk,
      availability: provider.availability,
      supportsOrders: provider.supportsOrders,
      configured: Boolean(account?.hasCredentials) || Boolean(account),
      status: account?.status || 'not_configured',
      healthState,
      freshness,
      lastSyncAt: account?.lastSyncAt || null,
      lastHealthCheckAt: account?.lastHealthCheckAt || null,
      unavailableUntil,
      lastError: account?.lastError || null,
      snapshotCount,
      latestSnapshot,
    };
  }

  async function latestSnapshot(userId, providerId) {
    const account = await repository.getAccount(userId, providerId);
    if (!account) return null;
    return repository.getLatestSnapshot(account.id);
  }

  async function evaluateValuationEvidence({ userId, providerId, assetId, asset = {}, asOf = null, now = Date.now() }) {
    if (!valuation) throw new Error('valuation_service_unavailable');
    const snapshot = await latestSnapshot(userId, providerId);
    if (!snapshot) {
      return { status: 'UNAVAILABLE', reason: 'no_connector_snapshot', assetId, modelVersion: null };
    }
    const evidenceInputs = (snapshot.balances || [])
      .filter(balance => Math.abs(balance.total) > 0)
      .slice(0, 25)
      .map(balance => ({
        provider: `connector:${providerId}`,
        kind: 'CURRENT_PRICE',
        sourceLabel: `${providerId.toUpperCase()} balance`,
        sourceUrl: null,
        observedAt: snapshot.fetchedAt,
        salePrice: Number(balance.total),
        currency: balance.currency,
        condition: null,
        notes: 'connector_balance_evidence',
        rawPayload: { connectorProvider: providerId, currency: balance.currency, balance: String(balance.total) },
      }));
    if (!evidenceInputs.length) {
      return { status: 'UNAVAILABLE', reason: 'no_funded_balances', assetId, modelVersion: config?.modelVersion || null };
    }
    const outcome = await valuation.recalculate({
      assetId,
      asset: { ...asset, symbol: asset.symbol || assetId },
      observedAt: snapshot.fetchedAt,
      asOf: asOf || snapshot.fetchedAt,
      evidenceInputs,
    });
    return { assetId, modelVersion: config?.modelVersion || null, ...outcome };
  }

  async function fleetHealth({ now = Date.now() } = {}) {
    const accounts = await repository.listAccounts();
    const byProvider = new Map();
    for (const account of accounts) {
      if (!byProvider.has(account.provider)) byProvider.set(account.provider, []);
      byProvider.get(account.provider).push(account);
    }
    return providers.list().map(providerId => {
      const provider = providers.get(providerId);
      const rows = byProvider.get(providerId) || [];
      const healths = rows.map(row => row.healthState || 'UNKNOWN');
      const health = healths.includes('HEALTHY') ? 'healthy'
        : healths.includes('RATE_LIMITED') ? 'rate_limited'
          : healths.includes('AUTH_FAILED') ? 'auth_failed'
            : healths.includes('UNAVAILABLE') ? 'unavailable'
              : healths.includes('DEGRADED') ? 'degraded'
                : rows.length ? 'unknown' : 'not_configured';
      return {
        id: providerId,
        name: provider.name,
        desk: provider.desk,
        availability: provider.availability,
        supportsOrders: provider.supportsOrders,
        configured: rows.filter(row => row.hasCredentials || row.status !== 'not_configured').length,
        online: rows.filter(row => row.status === 'online').length,
        errors: rows.filter(row => row.lastError).length,
        health,
      };
    });
  }

  function describe() {
    return providers.describe();
  }

  return {
    describe,
    evaluateValuationEvidence,
    fleetHealth,
    health,
    latestSnapshot,
    refreshSnapshot,
    status,
  };
}

module.exports = { createConnectorService };