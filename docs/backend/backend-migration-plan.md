# Backend Migration Plan

This is the incremental PostgreSQL and Prisma migration plan for Brick Alpha.
Phase 0 protects current behavior. PostgreSQL and Prisma are not part of Phase 0.

## CONFIRMED Hosting and Source Decisions

These decisions are confirmed for the current architecture:

| Area | Confirmed target |
|---|---|
| Frontend hosting | Cloudflare |
| Backend API hosting | Railway |
| PostgreSQL database | Railway PostgreSQL |
| Source repository | GitHub |

The following are not future targets for this migration:

- Netlify is not the frontend target.
- Render is not the backend target.
- Vercel is not the backend target.

Existing Render, Vercel, or other deployment configuration may remain temporarily during Phase 0 where removing it could affect current behavior. No deployment configuration is changed by Phase 0 solely to implement the confirmed hosting decision.

## Compatibility Requirements

- Preserve current frontend behavior.
- Preserve current API routes.
- Preserve current HTTP methods and status codes.
- Preserve current response envelopes, including the bare `/api/portfolio` array.
- Preserve current business behavior until a separately approved domain change.
- Keep legacy JSON data available until reconciliation is complete.
- Avoid a full rewrite.
- Allow per-domain rollback.

## Phase 0 - Regression Protection

Phase 0 adds:

- Node built-in `node:test` backend test infrastructure.
- Supertest API tests.
- Isolated temporary persistence tests.
- External provider mocks.
- User-isolation tests.
- Current financial behavior fixtures.
- Current frontend Brick Alpha fixtures.
- Current API and persistence documentation.

Phase 0 does not add a database or change business behavior.

## Phase 1 Status

Phase 1 foundation work is limited to:

- Prisma 7.10 package installation.
- PostgreSQL schema foundation.
- Optional `DATABASE_URL` configuration.
- Lazy Prisma client support.
- Non-blocking database health capability.
- Legacy JSON repository abstraction.
- Read-only legacy store inspection.

The current application source of truth remains JSON.
No route reads from PostgreSQL.
No route writes to PostgreSQL.
The staging Railway PostgreSQL database has received the credential rotation and the additive schema foundation only.
No initial-migration state remains outstanding: `20260916080000_init_backend_foundation` was generated and applied to staging.
Production has no Railway services and was not touched.

Detailed foundation documentation is in `docs/backend/postgresql-foundation.md`.

## Phase 1 - PostgreSQL and Prisma Foundation

- Add Prisma and Railway PostgreSQL configuration.
- Add schema and additive migrations.
- Add database health reporting.
- Add repository interfaces.
- Add legacy JSON import tooling.
- Keep all existing routes on legacy persistence initially.

## Phase 1.5 - Staging Foundation Finalization

Completed on 2026-09-16 from the existing Phase 1 repository state:

- Retained the committed UUID user foreign-key corrections and
  `20260916080000_init_backend_foundation` migration.
- Reviewed migration SQL: additive only, Decimal financial columns, matching
  foreign-key types, expected indexes and uniqueness, no production references.
- Passed Prisma format, validate, and generate without changing the schema.
- Passed all 32 backend tests, including Phase 0 regressions, backend syntax,
  frontend build, and frontend lint (four existing warnings, zero errors).
- Passed local smoke checks for `/`, `/api/health`, `/api/signals`, and `/api/news`
  using isolated temporary JSON data with provider refresh disabled.
- Confirmed health reports `not_configured` without `DATABASE_URL`.
- Reviewed tracked files for credentials and scratch artifacts; only synthetic
  test credentials were found. Reviewed both migration documents for Markdown
  corruption and duplicate sections.

Staging is online and the migration is applied with its checksum reconciled to
the committed file, as confirmed by the OpenCode handover. Finalization did not
repeat Railway setup, credential rotation, or migration application, and did not
deploy the application or touch production. Live staging state was not queried
again. JSON remains the source of truth; application data reads and writes remain
on JSON. The optional PostgreSQL health probe performs only `SELECT 1`.

Validation scope and evidence are recorded in `docs/backend/postgresql-foundation.md`.

## Phase 2 - Users and Authentication

Phase 2 implementation and synthetic staging validation are complete. Deployment
and actual user import remain separate, explicitly controlled rollout actions.
Default auth persistence remains `legacy`; business/financial persistence remains JSON.

- Import users while preserving current password compatibility.
- Add database-backed sessions and reset tokens.
- Add authorization policy boundaries.
- Preserve current auth response objects.
- Switch reads and writes behind a feature flag.

Implemented `legacy`, strict comparison/mirroring `dual`, and `postgres` auth
repositories behind a service boundary. Password hashing remains compatible;
hashed durable sessions, revocation, secure single-use resets, auth audits,
environment-aware reset disclosure, rate limits, and configured CORS are covered
by tests. The explicit-source user/settings import supports dry-run, checksum
confirmation, conflict detection, transactions, and idempotency.

Real PostgreSQL auth checks passed on the existing staging service inside a
transaction that was deliberately rolled back. No actual user data was imported,
no new Prisma migration was needed, no application was deployed, and production
was not touched. The initial migration is unchanged. See
`docs/backend/auth-migration.md` for contracts, validation, rollback, and rollout gates.

## Phase 3 - Portfolio, Holdings, Transactions, and Sales

Phase 3 implementation and synthetic staging validation are complete. Default
financial persistence remains `legacy`; no financial data has been migrated, the
frontend is unchanged, and production was not touched. Rollout of real reads and
writes to PostgreSQL remains a separate, explicitly controlled decision.

Implemented behind the `legacy`, `dual`, and `postgres` financial persistence
modes:

- Import current trades and introduce holdings and acquisition lots.
- Define the cost-basis policy before any cutover: deterministic FIFO across
  acquisition lots, with explicit acquisition unit cost never substituted by
  catalog, current, or estimated value.
- Add partial-sale allocation, aggregated cost basis, realized and unrealized P/L,
  and exclusion of disposed inventory from NAV/cost/unrealized P/L.
- Add idempotent transaction handling and executions separate from accounting.
- Preserve existing trade routes through response mappers; API contracts are frozen.
- Add a financial inspector that is explicit-source, dry-run, and refuses to invent
  legacy acquisition history.

Concurrency is enforced with a serializable transaction, a transaction-scoped
PostgreSQL advisory lock (`$executeRaw` over a deterministic `hashtextextended`
key), and `FOR UPDATE` row locks on open lots, with retries on SQLSTATE `40001`
so the losing concurrent sale rejects cleanly. See
`docs/backend/financial-domain.md`.

Validation completed 2026-09-18 against the existing Railway staging `Postgres`
service over a temporary SSH tunnel: all validator checkpoints passed,
`VALIDATOR-EXIT=0`, synthetic data was removed, and the full local regression
passed (72 backend tests, Prisma checks, frontend lint/build). No new migration was
needed; `20260916080000_init_backend_foundation` is unchanged. See
`docs/backend/financial-domain.md` for contracts, validation, and policies.

## Phase 4 - Valuation and Brick Alpha

Phase 4 implementation and synthetic staging validation are complete. Default
valuation persistence remains `legacy`; no valuation data has been migrated, the
frontend is unchanged, and production was not touched. Rollout of real reads and
writes to PostgreSQL remains a separate, explicitly controlled decision.

Decisions locked in Phase 4:

- The canonical scoring model is the frontend `frontend/src/brickAlphaModel.js`,
  versioned `brick-alpha-v1`. It was ported byte-for-byte to
  `server/services/brick-alpha-model.js` and proven by deep-equality parity tests
  against the fixture baseline and scenario inputs. Dormant backend valuation
  services are not activated.
- Valuations and evidence are append-only. A recalculate never overwrites a prior
  row; repeated recalculations extend history and preserve the earlier rows
  bit-for-bit.
- Valuation records carry no user context and are asset-scoped reference data
  returned to any authenticated user; user isolation concerns do not apply to
  valuation rows.
- Provider runs are normalized into provider-attributed evidence (`provider`
  column added on `ValuationEvidence`). The provider never owns a score: the
  versioned Brick Alpha model owns the assessment.
- No value is ever fabricated. A conversion with no configured rate holds the raw
  source amount with status `REVIEW_REQUIRED` and notice
  `currency_conversion_unavailable_<display>`; an unavailable provider yields
  `UNAVAILABLE` and nothing is persisted.
- Stale evidence maps to `STALE`/`REVIEW_REQUIRED` by age; confidence is preserved
  from the model, and evidence signal/bounded confidence are recorded additively
  in the assessment `breakdown` JSON.

Implemented behind the `legacy`, `dual`, and `postgres` valuation persistence
modes:

- `GET /api/assets/:assetId/valuation`, `GET /api/assets/:assetId/valuations`,
  `GET /api/assets/:assetId/brick-alpha`, `GET /api/assets/:assetId/brick-alpha/history`,
  and `POST /api/assets/:assetId/valuation/recalculate` (thin, authenticated;
  404 `valuation_not_found`/`brick_alpha_assessment_not_found`, 409
  `valuation_unavailable` when there is no usable evidence).
- A deterministic in-process mock provider (with `ok`, `stale`, and `fail` modes)
  plus Bricklink/Brickeconomy adapters behind a provider registry that degrades to
  mock; provider runs are bounded by timeout and retry budget.
- `server/repositories/postgresValuationRepository.js` with transactional,
  serializable persistence of valuations, evidence, and assessments.

Validation completed 2026-09-18 against the existing Railway staging `Postgres`
service over a temporary SSH tunnel: the additive migration
`20260918000000_phase4_valuation_domain` was applied, every validator checkpoint
passed (`STAGING_VALIDATION_EXIT=0`), synthetic data was removed and verified
gone. Only the deterministic mock provider was exercised; no real provider call
was made and no real valuation data was migrated. Detailed contracts and policy
are in `docs/backend/valuation-domain.md`.

## Phase 5 - Connectors and Background Jobs

- Persist market candles, news, provider refresh state, connector snapshots, and executions.
- Move timers into Railway worker/background processes where appropriate.
- Add timeouts, retries, backoff, idempotency, and reconciliation.
- Keep live execution disabled until explicitly approved.

## Phase 6 - Imports, Feedback, Audit, and Admin

- Add reviewed import batches and evidence.
- Add import reconciliation and approval records.
- Add audit events.
- Move feedback and intake records into relational persistence.
- Add explicit admin authorization.

## Phase 7 - Reconciliation and Legacy Retirement

- Reconcile user counts and IDs.
- Reconcile portfolios, quantities, cost basis, realized gain, and unrealized gain.
- Reconcile feedback, alerts, connectors, and imports.
- Run Railway backup and restore drills.
- Switch reads to PostgreSQL behind feature flags.
- Preserve immutable JSON snapshots.
- Retire legacy writes only after sign-off.

## Rollback Strategy

- Support `legacy`, `dual`, and `postgres` persistence modes per domain.
- Preserve legacy JSON snapshots.
- Use idempotent dual writes during transition.
- Compare legacy and PostgreSQL response projections.
- Keep route response mappers stable.
- Do not delete or overwrite the final legacy snapshot until reconciliation is approved.

## OPEN DECISIONS

The following remain open because the existing code does not establish a reliable product decision:

- Cost-basis method.
- Fees, shipping, commission, tax, and storage treatment.
- Holding consolidation rules.
- Whether VALR live trading remains in final Brick Alpha scope.
- Billing and subscription scope.
- Exact Cloudflare frontend product and deployment configuration.
- Railway service sizing, worker topology, backup retention, and observability configuration.

The hosting direction itself is not open: Cloudflare, Railway, Railway PostgreSQL, and GitHub are confirmed.
