# Brick Alpha financial domain - Phase 3

## Scope

Phase 3 introduces the production accounting boundary for portfolios, assets, holdings, acquisition lots, immutable transactions, sale allocations, executions and fees. It does not activate valuation providers, change Brick Alpha scoring, migrate real financial data, change the frontend, or switch production reads/writes to PostgreSQL.

## Accounting rules

- `Asset` identifies the economic asset. LEGO/collectibles and market instruments remain distinct asset types.
- `Holding` is the current owned inventory for one portfolio and asset. It is derived from remaining lot quantities, not from closed legacy trades.
- `HoldingLot` preserves each acquisition separately. The acquisition unit cost is explicit and is never substituted with catalog, current, or estimated value.
- `Transaction` is append-only financial history. Purchases and sales create transactions; disposal history is not represented by mutating a purchase into a closed trade.
- `SaleAllocation` records which acquisition lots funded a sale. Phase 3 uses deterministic FIFO ordered by acquisition timestamp, creation timestamp and lot ID.
- `Fee` records transaction costs. Purchase fees increase lot cost basis; sale fees reduce net proceeds and realized P/L.
- `Execution` remains separate from accounting so paper/simulated/live provider execution can be represented without changing transaction ownership.
- Collectible quantities must be whole units. Market instruments may be fractional to eight decimal places.
- Money and quantities use Prisma/PostgreSQL Decimal/NUMERIC. Financial calculations round HALF_UP to eight decimal places at persisted monetary boundaries.

## P/L and NAV

Unrealized P/L applies only to currently owned inventory:

`unrealized = current value of remaining quantity - remaining cost basis`

Realized P/L applies only to disposed inventory:

`realized = net sale proceeds - FIFO allocated cost basis`

A completely disposed holding therefore contributes zero quantity, zero remaining cost basis and zero current NAV while its sale allocations continue to contribute realized P/L. This intentionally fixes the legacy double-counting behavior without changing the legacy implementation or its regression tests.

## Concurrency and inventory safety

The PostgreSQL repository uses a serializable database transaction for each financial mutation. It takes a transaction-scoped PostgreSQL advisory lock keyed by portfolio and asset (a deterministic `hashtextextended(portfolio:asset)` key executed with `$executeRaw`) and locks open holding-lot rows with `SELECT ... FOR UPDATE` before allocation. Inventory is checked after those locks are held. This prevents two concurrent sales from independently consuming the same units.

When PostgreSQL detects a serialization anomaly (SQLSTATE `40001`) between concurrent financial writes, the repository retries the transaction on a fresh snapshot, so the losing sale re-reads current inventory and rejects cleanly rather than surfacing a database-level error. The winning sale commits once and its side effects are never replayed.

Idempotency keys are persisted on transactions and checked inside the transaction boundary. PostgreSQL also enforces uniqueness for the key.

## Persistence modes

`FINANCIAL_PERSISTENCE_MODE` supports `legacy`, `dual`, and `postgres`. The default is `legacy`. `dual` and `postgres` require `DATABASE_URL`. Financial persistence is deliberately independent of `AUTH_PERSISTENCE_MODE`.

Phase 3 does not switch the existing HTTP handlers to PostgreSQL by default. Existing API contracts remain frozen while the new domain is validated.

## Legacy migration safety

`npm --prefix server run db:financial:inspect -- --source=/absolute/path/to/app-store.json` performs a read-only inspection. The caller must explicitly name the source snapshot. The report includes SHA-256, user/trade/open/closed/duplicate/invalid/ambiguous counts, currencies, quantities, explicit cost basis and legacy realized P/L.

The inspector never infers acquisition cost from catalog/current/estimated prices and never invents lot history. Records without sufficient acquisition evidence are marked for manual review. Phase 3 performs no real financial migration.

## Phase 3 validation (2026-09-18)

The PostgreSQL financial domain was validated end-to-end against the reviewed Railway staging database over a temporary SSH tunnel. The validator (`server/scripts/validate-staging-financial.js`) runs only against the staging environment and service, rewrites `DATABASE_URL` to the tunnel, and names every checkpoint so a failure reports the exact step.

Checkpoint sequence: `user-create`, `raw-sanity`, `advisory-lock-isolation`, `first-purchase`, `second-purchase`, `fifo-sale`, `oversell`, `complete-disposal`, `buy-after-disposal`, `multiple-assets`, `multiple-users`, `fractional-market`, `idempotency`, `concurrent-sale`, `validate-complete`, then deterministic synthetic cleanup. A `--sanity-only` mode exercises just `raw-sanity` and `advisory-lock-isolation`.

Result: all checkpoints passed, `VALIDATOR-EXIT=0`, and cleanup removed every synthetic user and asset (`PASS synthetic staging financial data removed`). The concurrent-sale checkpoint produced exactly one successful sale and exactly one rejected sale (PostgreSQL `40001` serialization enforcement, then clean re-read of zero inventory), with final quantity zero and inventory never negative.

Root-cause fix: the advisory lock had initially failed under Prisma with P2010 because `SELECT pg_advisory_xact_lock(...)` returns a `void` result column that `$queryRaw` cannot deserialize. The lock now executes in `$executeRaw` (which sends the query without deserializing columns), keeping the same transaction-scoped lock and deterministic key.

Local regression on `feature/backend-production-upgrade` after the fixes: Prisma format/validate/generate passed, `node --test` passed all 72 tests, frontend lint passed with zero errors (four pre-existing warnings), backend syntax passed, and the production frontend build passed.

## Phase 3 release gates

Before changing application reads to PostgreSQL: run the complete backend/frontend regression suite, validate Prisma, run synthetic PostgreSQL accounting tests against the reviewed Railway staging database, prove concurrent oversell protection at PostgreSQL level, reconcile synthetic totals, and remove all synthetic staging records. Production remains untouched until a later explicit release decision.
