# Current Persistence Baseline

Phase 0 records the current JSON persistence behavior before PostgreSQL or Prisma work begins.

## Runtime Store

The active backend uses:

```text
server/data/app-store.json
```

The file is loaded at module startup by `loadStore()` and rewritten by `persistStore()`.
The current checkout does not contain this runtime file because `server/data/*` is ignored by Git.

The root store contains:

- `users`
- `userStates`
- `settings`
- `trades`
- `newsTargets`
- `feedbackItems`

Each `userStates[userId]` value contains:

- `trades`
- `intakeRequests`
- `watchlistItems`
- `alertRules`
- `notifications`
- `alertEmailQueue`
- `routine`
- `settings`
- `newsTargets`
- `connectors`

## Other Files

| File | Current use |
|---|---|
| `server/data/product-catalog.json` | 398 print-consumable catalog records loaded at startup |
| `server/data/share-status.json` | Temporary partner tunnel status, written by `scripts/partner-share.mjs` |
| `server/fixtures/reviewed-lego-portfolio-v36.json` | Tracked 131-position reviewed LEGO fixture; not loaded by the active backend |

## Current Relationships

Relationships are represented by object keys and strings rather than database constraints.

- `userStates` is keyed by user ID.
- Trades contain an owner string and optional collectible ID.
- Feedback stores author identity fields but has no foreign key.
- Intake requests store an owner string.
- Alerts and watchlists identify instruments by ticker strings.
- Notifications are not relationally linked to their originating alert rule.
- Collectible trades refer to static IDs in `server.js`.

## Current Write Behavior

- The complete store is held in process memory.
- Most writes serialize the complete store synchronously.
- Writes are not atomic temp-file-and-rename operations.
- There is no file lock.
- There is no backup or version history.
- Multiple processes can overwrite one another.
- A malformed store logs a warning and returns an empty store.
- The malformed source is not quarantined.

## Phase 0 Isolation

Tests set these environment variables before loading the server:

```text
COLLECTTRADE_TEST=1
COLLECTTRADE_DISABLE_RUNTIME=1
COLLECTTRADE_DATA_DIR=<temporary directory>
COLLECTTRADE_SHARE_STATUS_FILE=<temporary file>
AUTH_SECRET=phase0-test-auth-secret
CONNECTOR_SECRET=phase0-test-connector-secret
```

The production default paths and runtime behavior remain unchanged.
No test writes to the real `server/data/app-store.json`.

## Persistence Regression Coverage

`server/test/persistence.test.js` covers:

- Empty store behavior.
- `loadStore()`.
- `persistStore()`.
- Fresh-process reload.
- Malformed JSON behavior.
- User-state creation.

The malformed JSON test intentionally records current recovery behavior. It does not repair the behavior.
