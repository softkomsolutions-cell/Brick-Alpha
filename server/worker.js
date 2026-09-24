// Background job worker for connector health, connector refresh, valuation
// refresh, and market refresh jobs. Runs standalone: no HTTP server, no legacy
// store, no secrets in logs. Uses PostgreSQL-safe coordination via
// FOR UPDATE SKIP LOCKED claims and unique idempotency keys.
const { requireDatabaseUrl } = require('./config/database');
const { readConnectorConfig } = require('./config/connector');
const { readValuationConfig } = require('./config/valuation');
const { getPrismaClient, disconnectPrisma } = require('./db/prisma-client');
const { createPostgresConnectorRepository } = require('./repositories/postgresConnectorRepository');
const { createPostgresValuationRepository } = require('./repositories/postgresValuationRepository');
const { createValuationService } = require('./services/valuation-service');
const { createProviderRegistry } = require('./services/valuation/providers');
const { createConnectorProviderRegistry } = require('./services/connectors/providers');
const { createConnectorService } = require('./services/connector-service');
const { createJobRunner } = require('./services/job-runner');
const { decryptConnectorPayload } = require('./services/connectors/cipher');
const { safeSummary } = require('./services/connectors/failure');

const CONNECTOR_SECRET = () => process.env.CONNECTOR_SECRET || process.env.AUTH_SECRET || '';

function buildHandlers({ connectorService, providerRegistry, connectorConfig, repository }) {
  const connectorRepository = repository;

  return {
    async connector_refresh({ job }) {
      const payload = job.payload || {};
      const userId = payload.userId;
      const providerId = payload.providerId;
      if (!userId || !providerId) throw Object.assign(new Error('connector_refresh_missing_payload'), { status: 400, code: 'connector_refresh_missing_payload' });
      const credentialsRecord = await connectorRepository.getAccountCredentials(userId, providerId);
      if (!credentialsRecord) throw Object.assign(new Error('connector_account_missing'), { code: 'connector_account_missing' });
      const credentials = decryptConnectorPayload(credentialsRecord.blob, CONNECTOR_SECRET()) || {};
      return connectorService.refreshSnapshot({
        userId,
        providerId,
        credentials,
        record: credentialsRecord.record,
        idempotencyKey: job.idempotencyKey,
        excludeJobId: job.id,
        force: Boolean(payload.force),
      });
    },

    async connector_health({ job }) {
      const payload = job.payload || {};
      const providerId = payload.providerId || null;
      const accounts = await connectorRepository.listAccounts({ providerId });
      const results = [];
      for (const account of accounts) {
        const credentialsRecord = await connectorRepository.getAccountCredentials(account.userId, account.provider);
        const credentials = decryptConnectorPayload(credentialsRecord?.blob, CONNECTOR_SECRET()) || {};
        const probe = await connectorService.health({
          userId: account.userId,
          providerId: account.provider,
          credentials,
          record: { config: account.config, status: account.status },
        });
        results.push({ userId: account.userId, provider: account.provider, ...probe });
      }
      return { checked: results.length, results };
    },

    async valuation_refresh({ job }) {
      const payload = job.payload || {};
      const { userId, providerId, assetId, asset } = payload;
      if (!userId || !providerId || !assetId) throw new Error('valuation_refresh_missing_payload');
      return connectorService.evaluateValuationEvidence({
        userId,
        providerId,
        assetId,
        asset: asset || {},
        asOf: payload.asOf || null,
      });
    },

    async market_refresh({ job }) {
      const payload = job.payload || {};
      const providerId = payload.providerId || 'valr';
      const provider = providerRegistry.get(providerId);
      return provider.fetchMarketSnapshot({
        config: { pairs: payload.pairs || null, timeoutMs: connectorConfig.providerTimeoutMs },
      });
    },
  };
}

async function createWorkerRuntime(environment = process.env) {
  const databaseUrl = requireDatabaseUrl(environment);
  const connectorConfig = readConnectorConfig(environment);
  const valuationConfig = readValuationConfig(environment);
  const prisma = getPrismaClient(environment);

  const connectorRepository = createPostgresConnectorRepository(() => prisma);
  const providerRegistry = createConnectorProviderRegistry({ config: connectorConfig });

  let valuationService = null;
  if (environment.VALUATION_PERSISTENCE_MODE !== 'legacy') {
    valuationService = createValuationService({
      repository: createPostgresValuationRepository(() => prisma),
      config: valuationConfig,
      providers: createProviderRegistry({ config: valuationConfig }),
    });
  }

  const connectorService = createConnectorService({
    repository: connectorRepository,
    providers: providerRegistry,
    config: connectorConfig,
    valuation: valuationService,
  });

  const jobRunner = createJobRunner({
    repository: connectorRepository,
    config: connectorConfig,
    handlers: buildHandlers({ connectorService, providerRegistry, connectorConfig, repository: connectorRepository }),
    logger: message => console.log(`worker ${message}`),
  });

  const worker = jobRunner.createWorker({
    pollIntervalMs: connectorConfig.jobPollIntervalMs,
    graceMs: connectorConfig.jobGraceMs,
  });

  return {
    connectorConfig,
    connectorRepository,
    connectorService,
    databaseUrl: databaseUrl ? 'configured' : 'missing',
    jobRunner,
    prisma,
    providerRegistry,
    worker,
  };
}

async function main() {
  const runtime = await createWorkerRuntime();
  console.log(`worker started jobs=${runtime.connectorConfig.jobTypes.join(',')} poll=${runtime.connectorConfig.jobPollIntervalMs}ms`);

  let stopping = false;
  const shutdown = async signal => {
    if (stopping) return;
    stopping = true;
    console.log(`worker received ${signal}; draining in-flight jobs`);
    const drained = await runtime.worker.stop();
    console.log(`worker stopped drained=${drained.drained}`);
    await disconnectPrisma();
    process.exit(0);
  };

  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));

  runtime.worker.start();
  return runtime;
}

if (require.main === module) {
  main().catch(error => {
    console.error(`worker failed start: ${safeSummary(error?.message)}`);
    disconnectPrisma().catch(() => undefined);
    process.exit(1);
  });
}

module.exports = { buildHandlers, createWorkerRuntime, main };