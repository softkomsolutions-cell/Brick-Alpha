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

## Phase 1 - PostgreSQL and Prisma Foundation

- Add Prisma and Railway PostgreSQL configuration.
- Add schema and additive migrations.
- Add database health reporting.
- Add repository interfaces.
- Add legacy JSON import tooling.
- Keep all existing routes on legacy persistence initially.

## Phase 2 - Users and Authentication

- Import users while preserving current password compatibility.
- Add database-backed sessions and reset tokens.
- Add authorization policy boundaries.
- Preserve current auth response objects.
- Switch reads and writes behind a feature flag.

## Phase 3 - Portfolio, Holdings, Transactions, and Sales

- Import current trades.
- Introduce holdings and acquisition lots.
- Define cost-basis policy before cutover.
- Add partial-sale allocation.
- Add idempotent transaction handling.
- Preserve existing trade routes through response mappers.

## Phase 4 - Valuation and Brick Alpha

- Select the canonical scoring model.
- Add versioned valuations and evidence.
- Persist Brick Alpha assessments.
- Preserve current frontend fields and labels.
- Prove parity against `brick-alpha-baseline.json` before backend activation.

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
- Canonical frontend versus dormant backend Brick Alpha model.
- Whether VALR live trading remains in final Brick Alpha scope.
- Billing and subscription scope.
- Exact Cloudflare frontend product and deployment configuration.
- Railway service sizing, worker topology, backup retention, and observability configuration.

The hosting direction itself is not open: Cloudflare, Railway, Railway PostgreSQL, and GitHub are confirmed.
