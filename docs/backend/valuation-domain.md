# Brick Alpha valuation domain - Phase 4

## Scope

Phase 4 introduces the production valuation boundary: versioned valuations with
provider-attributed evidence, freshness/confidence signals, and persisted Brick
Alpha assessments proven by parity against the canonical frontend model. It does
not activate real valuation providers, migrate real valuation data, change the
frontend, or switch production reads/writes to PostgreSQL.

## Canonical model and versioning

The canonical scoring model is the active frontend model
(`frontend/src/brickAlphaModel.js`). It is ported byte-for-byte to
`server/services/brick-alpha-model.js` and versioned `brick-alpha-v1`.
`BRICK_ALPHA_MODEL_VERSION` is exported alongside the full frontend surface.

Parity is proven by `server/test/phase4-valuation-parity.test.js`: every fixture
case in `brick-alpha-baseline.json` plus scenario inputs (retired, high-discount,
low-discount, high-scarcity, low-liquidity) must produce an identical scoring
object from both the frontend module and the backend port, including score,
grade, recommendation, confidence, ROI forecasts, retirement intelligence, alpha
signal badges, and display-group and factor contributions.

Every persisted valuation references `modelVersion = brick-alpha-v1`, so a future
model upgrade becomes a versioned, auditable change instead of a silent behavior
shift. The dormant backend valuation services are never activated by this phase.

## Domain rules

- `Valuation` and `BrickAlphaAssessment` are append-only. A recalculate inserts a
  new valuation, evidence rows, and assessment; it never updates or deletes an
  earlier row. Repeated recalculation extends history and preserves prior rows
  bit-for-bit.
- `ValuationEvidence` records each normalized provider observation and carries a
  `provider` column (added by the `20260918000000_phase4_valuation_domain`
  migration) so provenance survives persistence.
- The provider never owns a score. Providers return normalized evidence; the
  versioned Brick Alpha model computes the score, grade, recommendation,
  confidence, ROI, and retirement fields.
- No value is ever fabricated. Persisted confidence is the model `confidenceFor`;
  evidence signal and bounded confidence are recorded additively in the
  assessment `breakdown` JSON and never alter the persisted confidence.
- A recalculate with no usable evidence returns `UNAVAILABLE` and persists
  nothing. A provider timeout (bounded, default 8000 ms) or failure produces the
  same result; partial evidence with an unavailable provider still scores using
  the available evidence.

## Freshness and currency

Freshness is measured against the most recent evidence `observedAt`:

- `FRESH` when within `VALUATION_FRESHNESS_MS` (default 24 hours).
- `STALE` beyond that and within `VALUATION_REVIEW_MS` (default 72 hours).
- `REVIEW_REQUIRED` beyond the review window or when a currency conversion is
  unavailable.

Currency normalization is honest: evidence already in the display currency
(`VALUATION_DISPLAY_CURRENCY`, default `FINANCIAL_DEFAULT_CURRENCY || 'ZAR'`) is
used as-is; a configured rate (`VALUATION_CURRENCY_RATES` JSON) converts to the
display currency; a missing rate stores the raw source amount with value kept in
the source currency, `displayValue` null, status `REVIEW_REQUIRED`, and notice
`currency_conversion_unavailable_<display>`. A conversion is never invented.

## Persistence modes

`VALUATION_PERSISTENCE_MODE` supports `legacy` (default, in-memory), `dual`, and
`postgres`. `dual` and `postgres` require `DATABASE_URL`. Valuation persistence is
deliberately independent of auth and financial persistence modes.

`server/services/valuation-service.js` exposes recalculate, latest valuation,
valuation history, latest assessment, and assessment history over either an
in-memory repository (tests) or the Postgres repository
(`server/repositories/postgresValuationRepository.js`), which uses serializable
transactions and retries P2034/P2002/SQLSTATE `40001`.

## HTTP API

All valuation routes require authentication and are thin wrappers over the
service. Records are asset-scoped reference data with no user context; the
same asset's valuation history is returned to any authenticated user. This is a
deliberate isolation decision: valuation rows describe the asset, not a user, and
carry no user-identifying fields.

- `GET /api/assets/:assetId/valuation` - latest valuation with evidence; 404
  `valuation_not_found` when none exists.
- `GET /api/assets/:assetId/valuations` - full valuation history, oldest first.
- `GET /api/assets/:assetId/brick-alpha` - latest Brick Alpha assessment; 404
  `brick_alpha_assessment_not_found` when none exists.
- `GET /api/assets/:assetId/brick-alpha/history` - assessment history, oldest
  first.
- `POST /api/assets/:assetId/valuation/recalculate` - run providers, persist a
  new valuation + evidence + assessment and return `{ status, created,
  modelVersion, providers, valuation, evidence, assessment }`. 201 on success,
  409 `valuation_unavailable` when there is no usable evidence (`created: false`),
  400 `invalid_asset_id` when the id is missing or exceeds 128 characters.

The existing `/api/assets/:assetId/brick-alpha` legacy response envelope is
preserved through the response mapper.

## Connector evidence bridge (Phase 5)

The connector service can feed persisted balance snapshots into the valuation
pipeline as deterministic evidence through
`connectorService.evaluateValuationEvidence({ userId, providerId, assetId, asset, asOf })`:

- Funded snapshot balances (absolute `total` greater than zero, capped at 25) are
  normalized into `CURRENT_PRICE` evidence entries attributed to
  `connector:<providerId>` with `observedAt` = snapshot `fetchedAt`.
- With no snapshot or no funded balances the call returns `UNAVAILABLE`
  (`no_connector_snapshot` / `no_funded_balances`) and persists nothing.
- Otherwise the evidence is handed to the standard recalculate pipeline, so the
  same append-only, versioned `brick-alpha-v1` semantics and `UNAVAILABLE` guards
  apply; the connector never owns a score.

This bridge is covered by `server/test/phase5-connector-domain.test.js` and is
exercised only behind connector persistence modes that have snapshots; legacy
mode returns `no_connector_snapshot`. No route is switched to it by this phase.

## Providers

`server/services/valuation/providers/index.js` provides a registry that degrades
to the deterministic in-process mock provider (`server/services/valuation/providers/mockProvider.js`).
The mock is driven from `VALUATION_MOCK_PROVIDER_MODE` (`ok`, `stale`, `fail`)
and never performs network I/O. Bricklink and Brickeconomy adapters
(`providers.js`) are real HTTP shells: they are enabled only when their credential
environment variables are configured, send no secrets, honor the timeout and
retry budget, and return normalized evidence only. `VALUATION_PROVIDERS` selects
the enabled provider list (default `['mock']`).

## Phase 4 validation (2026-09-18)

The PostgreSQL valuation domain was validated end-to-end against the reviewed
Railway staging database over a temporary SSH tunnel. The additive migration
`20260918000000_phase4_valuation_domain` was applied first with
`prisma migrate deploy` over the tunnel (`MIGRATE_DEPLOY_EXIT=0`) and verified
via `information_schema.columns`. Only the deterministic mock provider was
exercised; no real provider call was made.

The validator (`server/scripts/validate-staging-valuation.js`) runs only against
the staging environment and service, rewrites `DATABASE_URL` to the tunnel, and
names every checkpoint so a failure reports the exact step: `provider-column-applied`,
`seed-synthetic-asset`, `recalculate-ok`, `recalculate-append-only`,
`degraded-aged`, `degraded-unavailable`, `validate-complete`, then deterministic
synthetic cleanup (assessments, valuations with cascading evidence, collectible,
asset) with the remaining rows verified at zero. A `--sanity-only` mode exercises
`raw-sanity` and `provider-column-applied`.

Result: all checkpoints passed, `STAGING_VALIDATION_EXIT=0`. The append-only
checkpoint verified the first valuation row remains bit-identical after a second
recalculate; the aged checkpoint verified `REVIEW_REQUIRED` from 90-day-old mock
evidence; the unavailable checkpoint verified `UNAVAILABLE` with the valuation row
count unchanged; and cleanup removed every synthetic row, verified at zero.

## Previous regression coverage

- `server/test/phase4-valuation-parity.test.js` - model parity against the
  frontend (fixture cases + scenario inputs + shared export surface).
- `server/test/phase4-valuation-domain.test.js` - service matrix: freshness,
  append-only invariance, UNAVAILABLE, timeout containment, stale and critical
  age bands, partial evidence, currency as-is/converted/unavailable, asset-scoped
  reference data with no user context, config and currency unit checks.
- `server/test/phase4-valuation-api.test.js` - HTTP contracts: 401 without auth,
  201 create, latest/history reads, 404 unknown asset, 409 empty evidence, append
  across recalcs, and asset-scoped sharing semantics across authenticated users.
- `server/test/phase4-valuation-postgres.test.js` - Postgres repository contract
  against a mocked Prisma client: provider-attributed evidence column mapping,
  assessment breakdown/factorScores/version persistence, ordered latest/list
  queries, Serializable transactions with retry only on known conflict codes, and
  the collectible join.

## Rollout gates

Phase 4 changes no default runtime behavior. Valuation persistence defaults to
`legacy` (in-memory). Switching `VALUATION_PERSISTENCE_MODE` to `postgres` or
`dual`, enabling real Bricklink/Brickeconomy providers, and migrating real
valuation history remain separate, explicitly controlled decisions. Production
was not touched.