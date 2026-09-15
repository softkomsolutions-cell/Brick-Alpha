# Current API Contracts

Phase 0 baseline for the existing Brick Alpha backend.

This document records current behavior. It is not a proposed API redesign.
Response inconsistencies are intentional compatibility requirements until a separately approved migration changes them.

## Authentication

`POST /api/auth/register`, `POST /api/auth/login`, and `POST /api/auth/demo` return:

```json
{
  "ok": true,
  "token": "...",
  "user": {},
  "settings": {}
}
```

`GET /api/auth/me` returns:

```json
{
  "ok": true,
  "user": {},
  "settings": {}
}
```

Missing or invalid authentication returns:

```json
{
  "ok": false,
  "error": "unauthorized"
}
```

Password reset request returns `ok`, `message`, `demoCode`, and `expiresAt`.
Password reset confirmation returns `ok` and `message`.

## Public Read Routes

| Route | Current response contract |
|---|---|
| `GET /api/health` | `{ ok, services, metrics, sources[], marketSources[], connectors[] }` |
| `GET /api/signals` | `{ generatedAt, leadSignal, signals[], marketData, strategyRules[] }` |
| `GET /api/news` | `{ region, refreshedAt, items[], sources[], sourceStatus[] }` |
| `GET /api/collectibles` | `{ updatedAt, categories[], brands[], items[], referenceShelves[] }` |
| `GET /api/catalog` | `{ updatedAt, generatedAt, items[], count, brands[], families[], brandCount, familyCount, printPresets[], sourceFile, sourceLabel }` |

## Portfolio and Trade Routes

`GET /api/portfolio` returns a bare array, not an object envelope:

```json
[
  {
    "id": 1,
    "assetClass": "collectible",
    "status": "open"
  }
]
```

The following successful mutations return the current trade envelope:

```json
{
  "ok": true,
  "trade": {},
  "portfolio": [],
  "execution": {
    "mode": "paper",
    "providerId": "collecttrade",
    "pair": null,
    "remoteStatus": null
  }
}
```

Affected routes:

- `POST /api/trades`
- `POST /api/collectibles/trades`
- `POST /api/trades/:tradeId/close`

## Settings and User State

| Route | Current response contract |
|---|---|
| `GET /api/settings` | `{ ok, settings }` |
| `PUT /api/settings` | `{ ok, settings }` |
| `GET /api/watchlist` | `{ ok, items[] }` |
| `POST /api/watchlist` | `{ ok, item, items[] }` |
| `DELETE /api/watchlist/:watchId` | `{ ok, items[] }` |
| `GET /api/alerts` | `{ ok, items[], summary, plan, deliverySummary, deliveryQueue[] }` |
| `POST /api/alerts` | Alert response with the same alert collection fields |
| `PATCH /api/alerts/:alertId` | Alert response with the same alert collection fields |
| `DELETE /api/alerts/:alertId` | Alert response with the same alert collection fields |
| `GET /api/notifications` | `{ ok, items[], summary }` |
| `PATCH /api/notifications/:notificationId` | `{ ok, item, items[], summary }` |
| `POST /api/notifications/mark-all-read` | `{ ok, items[], summary }` |
| `GET /api/session-routine` | `{ ok, routine }` |
| `PUT /api/session-routine` | `{ ok, routine }` |
| `GET /api/news/targets` | `{ ok, items[] }` |
| `POST /api/news/targets` | `{ ok, items[] }` |
| `GET /api/share-status` | `{ ok, share }` |

## Feedback

`GET`, `POST`, and successful `PATCH` feedback responses contain:

```json
{
  "ok": true,
  "item": {},
  "items": [],
  "summary": {},
  "permissions": {
    "canManage": false
  }
}
```

`GET` does not include `item`, but retains `ok`, `items`, `summary`, and `permissions`.

## Connectors

`GET /api/connectors` returns:

```json
{
  "ok": true,
  "providers": []
}
```

`PUT`, `POST /test`, and `POST /sync` return:

```json
{
  "ok": true,
  "detail": "...",
  "provider": {}
}
```

`DELETE /api/connectors/:providerId` returns:

```json
{
  "ok": true,
  "provider": {}
}
```

Current quirk: deleting a VALR connector returns a default `preferredPair` of `BTCUSDT`, and the sanitized provider may still report `configured: true` because the current sanitizer treats the default pair as configuration. Phase 0 captures this behavior and does not correct it.

## Frontend Contract Consumers

The current frontend API client is `frontend/src/App.jsx::requestJson`.

Current consumers include:

- `refreshCore` for health, signals, news, and collectibles.
- `refreshContext` for portfolio, settings, targets, connectors, feedback, watchlist, alerts, notifications, routine, and share status.
- `handleAuthSubmit`, `handleResetRequest`, `handleResetConfirm`, and `handleDemoLaunch` for authentication.
- `submitOrderTicket` and `submitCloseTrade` for trades.
- Settings, connector, feedback, watchlist, alert, notification, and routine mutation handlers.

The current frontend does not call the dormant valuation routes described in older README documentation.

## Regression Coverage

Contract tests are in:

- `server/test/api-contracts.test.js`
- `server/test/isolation.test.js`
- `server/test/security.test.js`

Run them with:

```text
npm run test:backend
```
