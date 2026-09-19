# Connectors and background jobs - Phase 5

## Scope

Phase 5 introduces the production connector boundary: a provider-agnostic
connector domain with circuit-breaker health, freshness, failure classification
and retry budgets, persisted snapshots, and a standalone background job worker
with idempotency and bounded retries. It does not enable live trading, migrate
real connector data, change the frontend, switch production reads/writes to
PostgreSQL, or deploy the worker.

## Persistence modes

`CONNECTOR_PERSISTENCE_MODE` supports `legacy` (default, in-memory), `dual`, and
`postgres`. `dual` and `postgres` require `DATABASE_URL`. Connector persistence
is deliberately independent of auth, financial, and valuation persistence modes.

## Providers

`server/services/connectors/providers.js` builds a registry of four providers:

| Provider | Desk | Auth | Sync | Health |
|---|---|---|---|---|
| `valr` | crypto | VALR API key/secret | read-only balances | live health probe |
| `ibkr` | etfs | gateway config | manual (`sync_not_supported`) | manual |
| `saxo` | forex | oauth2 | manual (`sync_not_supported`) | manual |
| `easyequities` | jse | manual | manual (`sync_not_supported`) | manual |

Only `valr` has live sync, and it is read-only: `GET /v1/account/balances` is the
only endpoint called, so orders can never be routed through sync. Every provider
exposes `configured(credentialsOrRecord)` and `fetchPortfolioSnapshot` /
`fetchBalance` / `health` / `fetchMarketSnapshot`, and a registry `get`/`list`
and `describe`. `CONNECTOR_PROVIDERS` selects the enabled list (default all).

## Failure classification

`server/services/connectors/failure.js` normalizes any thrown provider error into
one of six classes plus a retry decision:

| Class | Retryable | Trigger |
|---|---|---|
| `RATE_LIMITED` | yes | HTTP 429 (+ `Retry-After`) |
| `AUTH_FAILED` | no | HTTP 401/403 |
| `TIMEOUT` | yes | `JOB_TIMEOUT`, `AbortError`, abort-on-provider-timeout |
| `PROVIDER_UNAVAILABLE` | yes | HTTP 503, `ENOTFOUND`/`ECONNRESET`/`ECONNREFUSED`/`EAI_AGAIN` |
| `RETRYABLE` | yes | HTTP 5xx and anything unclassified |
| `NON_RETRYABLE` | no | HTTP 4xx, `connector_not_configured`, `sync_not_supported` |

`extractRetryAfterSeconds` reads `Retry-After`/`retry-after`/`x-ratelimit-reset`
from `Headers` instances or plain objects. `safeSummary` redacts anything matching
credential patterns (`X-VALR-API-KEY`, `X-VALR-SIGNATURE`, `apiSecret`, `secret`,
`DATABASE_URL`, connection strings, cipher keys) so error summaries and
`lastError` fields never leak secrets.

## Health and freshness

`server/services/connectors/freshness.js` computes `FRESH` / `STALE` /
`REVIEW_REQUIRED` / `UNAVAILABLE` from `lastSyncAt` against
`CONNECTOR_FRESH_HOURS` (24) and `CONNECTOR_STALE_HOURS` (72); numeric ms and ISO
strings are both accepted. A circuit breaker (boundless, never permanently open)
records `unavailableUntil` and `healthState` (`UNKNOWN`, `HEALTHY`, `DEGRADED`,
`UNAVAILABLE`, `RATE_LIMITED`, `AUTH_FAILED`); the breaker releases the account
once the window passes. A successful sync always clears the breaker.

## Connector service

`server/services/connector-service.js` exposes refresh, health probe, status,
latest snapshot, valuation evidence bridging, and fleet health over either the
in-memory repository (`server/test-support/connector-memory.js`, tests) or the
Postgres repository (`server/repositories/postgresConnectorRepository.js`).

`refreshSnapshot({ userId, providerId, credentials, record, force, idempotencyKey, excludeJobId })`:

- Skips the fetch with `skipped: fresh` when `lastSyncAt` is within the fresh
  window and `force` is false.
- Marks the account `error` + health state + `unavailableUntil` on failure and
  rethrows a classified error; secrets never reach `lastError`.
- Persists a snapshot + balances, sets `lastSyncAt`, status `online`, health
  `HEALTHY`, and clears the breaker on success.
- When an `idempotencyKey` is supplied, a `QUEUED`, `RUNNING`, or `COMPLETED`
  job with that key short-circuits to `skipped: duplicate` unless it is the
  currently executing job (the worker passes `excludeJobId` so a claimed job
  never dedupes against itself).

## Job model and runner

The `Job` table (additive migration `20260918000001_phase5_connector_jobs`)
records type (`CONNECTOR_HEALTH`, `CONNECTOR_REFRESH`, `VALUATION_REFRESH`,
`MARKET_REFRESH`), status (`QUEUED`, `RUNNING`, `COMPLETED`, `FAILED`,
`CANCELLED`), idempotency key (unique), run id (unique), attempts/maxAttempts,
`runAt`/`startedAt`/`completedAt`, timeout, error code/summary, payload, and
result. `server/services/job-runner.js` provides:

- `enqueue(input)` dedupes by idempotency key; a repeat key returns the existing
  job with `duplicate: true`. The Postgres repository double-enforces this with
  `createMany({ skipDuplicates: true })`.
- `processQueue()` claims due jobs with `FOR UPDATE SKIP LOCKED` (raw SQL over
  `status = 'QUEUED' AND runAt <= now`), marks them `RUNNING` with a `runId`,
  executes the registered handler with a `JOB_TIMEOUT` bound, then transitions to
  `COMPLETED`, `QUEUED` retry, or `FAILED`.
- Retry policy: only retryable classes retry, exponential backoff is bounded
  (`backoff = min(backoffMs * 2^(attempts-1), maxBackoffMs)`), `RATE_LIMITED`
  honors `Retry-After` (minimum 1s), `PROVIDER_UNAVAILABLE` uses the same or
  `Retry-After`; a job exhausts `maxAttempts` and becomes `FAILED`. Unknown job
  types and handler payload defects fail immediately (`UNKNOWN_JOB_TYPE`,
  `connector_refresh_missing_payload` as non-retryable 400).
- `createWorker({ pollIntervalMs, graceMs })` polls due jobs and `stop()` drains
  in-flight work gracefully so a shutdown never abandons a claimed job orphaned
  as `RUNNING`.

## Worker

`server/worker.js` (`npm run worker`) is a standalone process: no HTTP, no
secrets in logs, and a top-level handler installs SIGTERM/SIGINT drain + `stop()`
then `disconnectPrisma()`. `buildHandlers` wires the four job types to the
connector service; `connector_refresh` decrypts the account credentials with the
shared AES-GCM cipher (`server/services/connectors/cipher.js`, key derived from
`CONNECTOR_SECRET`) before refreshing, so the same secret the server uses to
encrypt at write time decrypts in the worker.

## HTTP API (additive, legacy mode preserved)

All routes below are thin authenticated wrappers. With connector persistence in
`legacy` mode they read/write the same JSON connector records as existing routes,
so the pre-existing connector API contracts are untouched.

- `GET /api/connectors/:providerId/status` - effective status: `configured`
  (true only when credentials are stored), `healthState`, `freshness`,
  `lastSyncAt`, `lastHealthCheckAt`, `unavailableUntil`, `lastError`,
  `snapshotCount`, `latestSnapshot`.
- `POST /api/connectors/:providerId/refresh` - refresh a connector's portfolio.
  With the job runner available it enqueues an idempotent `connector_refresh`
  job and returns 202 with the queued/duplicate job; otherwise it syncs inline.
  A provider without sync support returns 400 `sync_not_supported`; no
  credentials returns 400 `connector_not_configured`. 404 on an unknown provider.
- `GET /api/health/providers` - fleet health across providers: configured /
  online / error counts and provider `configuration` + `health` status.

## Valuation evidence bridge

`connectorService.evaluateValuationEvidence` turns funded snapshot balances into
`CURRENT_PRICE` evidence attributed to `connector:<providerId>` and hands it to
the valuation recalculate pipeline; see `docs/backend/valuation-domain.md`.

## Tests and validation

`server/test/phase5-*.test.js` cover the matrix end-to-end with a deterministic
mock provider and an in-memory repository, plus a Postgres repository contract
against a mocked Prisma client:

- `phase5-connector-failure` - classification, retryability, `Retry-After`
  parsing, secret redaction, health-state mapping, freshness thresholds.
- `phase5-connector-providers` - VALR read-only guarantee (GET balances only),
  HMAC header construction, health degradation, timeout/abort, manual providers,
  cipher round-trip + masking.
- `phase5-connector-domain` - service matrix: refresh persists snapshot and
  ONLINE/HEALTHY, snapshot history, stale/fresh/force, timeout, unavailable with
  `unavailableUntil`, auth failure, 429 stand-down + recovery, multi-user
  isolation, idempotency dedupe, credentials never exposed, valuation evidence
  bridge.
- `phase5-connector-jobs` - enqueue dedupe, claim-only-due, bounded backoff,
  non-retryable never repeated, 429 stand-down, unknown job types, worker
  start/stop drain, handler decrypt + persist, missing-payload failure.
- `phase5-connector-api` - additive HTTP routes in `legacy` mode.
- `phase5-connector-postgres` - repository contract against a mocked client.
- `phase5-migration-additive` - migration ordering, byte-identical prior
  migrations, and additive-only assertions (no DROP/TRUNCATE/destructive ALTER,
  enums, appended columns, Job table and indexes).

The staging validator `server/scripts/validate-staging-connectors-jobs.js`
(`npm run db:connector:validate-staging`) runs only against the staging
environment and service, rewrites `DATABASE_URL` to the tunnel, and names every
checkpoint. It creates one synthetic user/account, encrypts synthetic
credentials, refreshes through the service against a deterministic mock provider,
exercises the 429-then-recover circuit breaker, walks the full job lifecycle and
the worker `connector_refresh` handler, verifies no raw credentials anywhere, and
removes all synthetic data (balances, snapshots, jobs, account, user) with the
remaining rows verified at zero.

## Rollout gates

Phase 5 changes no default runtime behavior. Connector persistence defaults to
`legacy`. Switching `CONNECTOR_PERSISTENCE_MODE` to `postgres`/`dual`, enabling
`CONNECTOR_JOBS_ENABLED`, applying the phase5 migration to staging, running the
staging validator, deploying the worker, enabling real provider calls, and
migrating real connector data remain separate, explicitly controlled decisions.
Live execution stays disabled until explicitly approved. Production was not
touched.