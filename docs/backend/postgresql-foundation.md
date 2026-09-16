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
