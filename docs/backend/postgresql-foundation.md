# PostgreSQL Foundation

Phase 1 establishes the PostgreSQL and Prisma foundation alongside the legacy application.
It does not activate PostgreSQL persistence.

## Confirmed Architecture

```text
Cloudflare frontend
        |
        v
Railway backend API
        |
        v
Railway PostgreSQL
```

Source repository: GitHub.

Render, Vercel, and Netlify are not migration targets. Existing configuration may remain temporarily for compatibility, but Phase 1 does not deploy or change those services.

## Prisma Version

- `prisma`: `7.10.0` development dependency.
- `@prisma/client`: `7.10.0` runtime dependency.
- Schema: `server/prisma/schema.prisma`.
- Prisma configuration: `server/prisma.config.ts`.
- Migration directory: `server/prisma/migrations/`.

## DATABASE_URL

`DATABASE_URL` is the only database credential/configuration input.

The application reads it only when PostgreSQL functionality is explicitly invoked.
An absent value does not prevent the legacy JSON application from starting.

`server/.env.example` documents the variable without a real value.

Railway owns the actual value in its environment configuration:

- Railway staging service receives the staging PostgreSQL URL.
- Railway production service receives the production PostgreSQL URL.
- Staging and production URLs must never be shared.
- No Railway credentials are committed to GitHub.

## Prisma Client Lifecycle

`server/db/prisma-client.js` provides:

- Lazy client creation.
- A singleton client within a process.
- Explicit `disconnectPrisma()` support.
- No client creation when `DATABASE_URL` is absent.

The legacy server does not create a PostgreSQL connection during normal startup when the variable is absent.

## Database Health

The existing `/api/health` response contract is preserved.

Phase 1 adds:

- `services.database`
- `metrics.databaseConfigured`
- `metrics.databaseEnvironment`

Expected status when the variable is absent:

```text
services.database = not_configured
```

When `DATABASE_URL` is configured, the health capability performs a lightweight `SELECT 1` check.
Database failure does not prevent the legacy application from starting during this phase.

## Initial Schema Domains

The initial schema includes foundation models for:

- Users, settings, sessions, and password reset tokens.
- Portfolios, assets, collectibles, and market instruments.
- Holdings, lots, transactions, sale allocations, executions, and fees.
- Valuations, evidence, and Brick Alpha assessments.
- Connector accounts, snapshots, and balances.
- Watchlists, alerts, and notifications.
- Feedback and intake requests.
- Import batches, positions, evidence, and reviews.
- Audit events and legacy snapshots.

Money and fractional quantities use Prisma `Decimal` backed by PostgreSQL `NUMERIC`.
No financial ledger uses `Float`.

JSON fields are reserved for raw provider payloads, evolving metadata, and compatibility data.
JSON is not the primary financial ledger.

## Current Source of Truth

```text
JSON
```

The application still reads and writes `server/data/app-store.json`.
No route has been switched to Prisma.
No route has been switched to PostgreSQL.

## Commands

From `server/`:

```text
npm run db:format
npm run db:validate
npm run db:generate
npm run db:migrate:dev
npm run db:migrate:deploy
npm run db:legacy:inspect -- --file <path>
```

`db:migrate:deploy` is not part of application startup.
It must only be run intentionally against a selected Railway database.

## Migration Status

The schema was formatted, validated, and the client was generated locally.
The initial additive migration was generated and applied to the staging Railway PostgreSQL service:

```text
prisma/migrations/20260916080000_init_backend_foundation/
```

Application status:

- Migration name: `20260916080000_init_backend_foundation`.
- Applied only to the staging environment (`patient-perfection` project, staging env, service `Postgres`).
- Applied over the project private network from a temporary Railway Function; no tunnel was used.
- Verified via `MIGRATION_OK tables=32` (31 domain tables plus `_prisma_migrations`) with checksum recorded.
- The migration ran in a transaction that rolls back fully on failure (verified during development).
- Staging portal credentials were rotated (`ALTER USER`) and the service variables were updated without a restart.
- Production (`patient-perfection` production env) has no services and was not touched.

## Phase 1.5 Final Validation (2026-09-16)

The OpenCode handover confirms that staging is online, the migration is applied,
and its database checksum was reconciled to the canonical committed migration file.
Credentials were already rotated, `DATABASE_URL` is configured in Railway, and
temporary Railway services and sensitive local files were removed. These staging
facts are carried forward from the verified handover; this finalization did not
connect to the database, rotate credentials, apply migrations, or deploy services.

The existing schema fix and migration were already committed and were retained.
Local validation completed on `feature/backend-production-upgrade`:

| Check | Result |
|---|---|
| Prisma format, validate, generate | PASS (Prisma 7.10.0); no schema content change |
| Backend tests, including Phase 0 regressions | PASS: 32 tests, no failures or skips |
| Frontend lint | PASS: zero errors, four existing React hook warnings |
| Backend syntax | PASS |
| Frontend build | PASS |
| Local smoke: `/`, `/api/health`, `/api/signals`, `/api/news` | PASS: HTTP 200 and expected content |
| Database health without configuration | PASS: `services.database = not_configured` |
| Tracked-file credential and scratch-artifact review | PASS: only synthetic test credentials found |

Smoke checks used the built frontend and an isolated temporary JSON store with
provider refresh disabled. They validate local application responses, not live
provider feeds or deployed staging API connectivity. The initial sandbox attempts
were blocked by filesystem permissions; the successful checks ran outside that
sandbox. No application or frontend source changes were needed.

The committed migration contains 31 domain tables, 42 foreign keys, 73 indexes
(including unique indexes), and 38 Decimal columns. All foreign-key column types
match their referenced columns, including UUID references to `User.id`. Review
found no `DROP`, `DELETE`, or `TRUNCATE` statements, destructive `ALTER` statements,
floating-point financial columns, credentials, or production references. The
`ALTER TABLE` statements only add foreign-key constraints. Financial amounts are
relational Decimal fields; JSON remains limited to metadata, provider payloads,
assessment details, and compatibility data.

JSON remains the application source of truth. Business routes do not read or
write PostgreSQL; the optional health probe is limited to `SELECT 1`. No users,
trades, or portfolios were migrated. API contracts, financial behavior, valuation
logic, Brick Alpha scoring, and frontend behavior remain unchanged. Phase 2 has
not started, and production was not touched.

## Phase 2 Auth Extension (2026-09-16)

Auth/users now have explicit `legacy` (default), `dual`, and `postgres` repository
implementations behind an auth service. Prisma uses `@prisma/adapter-pg` for real
PostgreSQL connections. Existing models cover users, settings, sessions, reset
tokens, and audit events; no schema changes or new migration were required.
`20260916080000_init_backend_foundation` remains unchanged.

Synthetic integration checks passed on the existing Railway staging `Postgres`
service, including migration checksum verification. The validation transaction
was rolled back and no synthetic users remained. A temporary TCP proxy and
authenticated public CA certificate enabled verified TLS access and were removed
afterward. No credentials were rotated or printed and no application was deployed.

PostgreSQL auth reads/writes are available only in the explicitly selected database
auth modes. Runtime configuration was not switched; the default remains JSON.
Financial/business PostgreSQL reads and writes remain disabled in every mode.
No actual user or financial data was migrated and production was not touched.
See `docs/backend/auth-migration.md` for the migration, security, and rollback policy.

## Phase 3 Financial Extension (2026-09-18)

The financial domain now has explicit `legacy` (default), `dual`, and `postgres`
repository implementations behind a financial service boundary. The additive
foundation schema already covers portfolios, assets, holdings, lots, transactions,
sale allocations, executions, and fees; no schema change or new migration was
required. `20260916080000_init_backend_foundation` remains unchanged.

Synthetic accounting validation passed on the existing Railway staging `Postgres`
service inside a temporary SSH tunnel: all named checkpoints passed,
`VALIDATOR-EXIT=0`, and every synthetic user and asset was deleted afterward
(`PASS synthetic staging financial data removed`). The advisory lock runs as
`SELECT pg_advisory_xact_lock(hashtextextended(portfolio:asset key, 0::bigint))`
via `$executeRaw`; financial mutations use serializable transactions and retry
SQLSTATE `40001` serialization conflicts. Concurrent sales allowed exactly one
winner with final inventory zero and never negative.

Default financial persistence remains `legacy`; no business route was switched and
no financial data was migrated. Production was not touched. Local verification on
`feature/backend-production-upgrade`: Prisma format/validate/generate passed,
all 72 backend tests passed, frontend lint passed (zero errors, four existing
warnings), backend syntax passed, and the production frontend build passed.
See `docs/backend/financial-domain.md`.

## Phase 4 Valuation Extension (2026-09-18)

The valuation domain now has explicit `legacy` (default), `dual`, and `postgres`
repository implementations behind a valuation service boundary. One additive
migration extends the foundation:

```text
prisma/migrations/20260918000000_phase4_valuation_domain/
```

The migration performs a single additive statement: `ALTER TABLE
"ValuationEvidence" ADD COLUMN "provider" TEXT;`. It was applied to the staging
Railway PostgreSQL service:

- Applied over a temporary SSH tunnel with `prisma migrate deploy`
  (`MIGRATE_DEPLOY_EXIT=0`).
- Verified immediately afterward: the `provider` column exists on
  `ValuationEvidence` via `information_schema.columns`.
- Local Prisma format, validate, and generate all pass; the foundation migration
  is unchanged.

Synthetic valuation validation passed on the existing Railway staging `Postgres`
service inside the same tunnel using only the deterministic in-process mock
provider (`ok`, `stale`, and `fail` modes): fresh recalculation persisted a
`brick-alpha-v1` assessment with provider-attributed evidence, a second
recalculate appended history without altering the first row, aged evidence mapped
to `REVIEW_REQUIRED`, an unavailable provider yielded `UNAVAILABLE` with nothing
persisted, and every synthetic asset/valuation/assessment row was deleted and
verified gone (`STAGING_VALIDATION_EXIT=0`). No real provider call was made and no
real valuation data was migrated.

Default valuation persistence remains `legacy`; no business route was switched,
the frontend was not changed, and production was not touched. See
`docs/backend/valuation-domain.md`.

## Phase 5 Connector and Job Extension (2026-09-19)

The connector domain now has explicit `legacy` (default), `dual`, and `postgres`
repository implementations behind a connector service boundary, plus a standalone
background job worker. One additive migration extends the foundation:

```text
prisma/migrations/20260918000001_phase5_connector_jobs/
```

The migration is additive only (no DROP, no TRUNCATE, no destructive ALTER, no
backfill) and adds:

- `ConnectorHealthState` enum and `healthState` (default `UNKNOWN`),
  `unavailableUntil`, and `lastHealthCheckAt` columns on `ConnectorAccount`.
- `JobStatus` and `JobType` enums and the `Job` table with a unique
  `idempotencyKey` index and a unique `runId` index, plus supporting
  `status`/`runAt` and `type`/`status` indexes.
- `ConnectorSnapshot` and `ConnectorBalance` tables for persisted balance
  snapshots (snaphots reference the account with cascade deletes; balances are
  unique per snapshot and currency).

The previous three migrations (foundation, phase4) are unchanged and the local
Prisma format, validate, and generate checks all pass. Job claiming uses `FOR
UPDATE` `SKIP LOCKED`, so concurrent workers never double-process a job; job
production defaults to `QUEUED` and requires `CONNECTOR_JOBS_ENABLED` when
connector persistence is `postgres`.

The synthetic staging validator `server/scripts/validate-staging-connectors-jobs.js`
(`npm run db:connector:validate-staging`) is ready but has not yet been run
against staging; that run remains a separate rollout action. See
`docs/backend/connectors-and-jobs.md`.

Default connector persistence remains `legacy`; no business route was switched,
the frontend was not changed, and production was not touched.

## Legacy Store Inspection

The dry-run inspector is:

```text
server/scripts/inspect-legacy-store.js
```

Example:

```text
npm run db:legacy:inspect -- --file C:\path\to\app-store.json
```

It reports:

- SHA-256 checksum.
- User count.
- User-state count.
- Trade count.
- Feedback count.
- Validation status.
- Migration readiness.

It never modifies the source file and never prints password hashes, connector credentials, or raw user records.

## Rollback and Coexistence

- Legacy JSON remains active.
- The PostgreSQL schema is additive groundwork only.
- Legacy snapshots will be checksum-addressed before future migration.
- Repository implementations can be selected per domain later.
- PostgreSQL reads and writes remain disabled until a later approved phase.
- A future rollback can return to the JSON implementation without deleting the database foundation.
