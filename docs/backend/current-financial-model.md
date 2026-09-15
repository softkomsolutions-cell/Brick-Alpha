# Current Financial Model Baseline

This document freezes the current financial behavior before the portfolio model is redesigned.

## Current Backend Trade Record

Trades are stored inside a user's `trades` array.
There is no separate holding, transaction, sale, lot, or cost-basis entity.

Important fields include:

- `assetClass`
- `side`
- `status`
- `entryPrice`
- `currentPrice`
- `quantity`
- `pnl`
- `pnlAmount`
- `entryValue`
- `currentValue`
- `exitPrice`
- `closedAt`
- `executionMode`
- `executionProvider`

## Collectible BUY

`POST /api/collectibles/trades` creates a generic paper trade.

- The entry price comes from the static collectible item price.
- The current price is marked using the item's `changePercent`.
- Quantity must be a positive integer.
- No user acquisition record is created.
- No acquisition lot is created.

## Collectible SELL

`POST /api/collectibles/trades` accepts `side: "SELL"` without checking whether the user owns the item.
It creates a generic open sell trade.

This is a known legacy behavior and is covered by regression tests.

## Trade Close

`POST /api/trades/:tradeId/close` closes the complete stored trade quantity.
The request body does not implement partial sale quantity semantics.

For collectible trades, the close uses the stored current price.
For market trades, it uses the current signal price when available.

## Current P/L Calculation

The backend currently calculates:

```text
pnlPercent = ((currentPrice - entryPrice) / entryPrice) * 100 * direction
pnlAmount = (currentPrice - entryPrice) * quantity * direction
entryValue = entryPrice * quantity
currentValue = currentPrice * quantity
```

`direction` is `1` for BUY and `-1` for SELL.

The calculation does not include:

- Fees.
- Shipping.
- Marketplace commissions.
- Tax.
- Currency conversion.
- Slippage.
- External fill prices.
- Lot allocation.

## Current Frontend Portfolio Summary

`frontend/src/brickAlphaModel.js::summarizeBrickAlphaPortfolio` calculates:

```text
costBasis = sum(entryPrice * quantity)
netAssetValue = sum(currentPrice * quantity)
realizedGain = sum(pnlAmount for closed collectible trades)
```

Closed collectible trades remain in the NAV and cost-basis sums while also contributing to realized gain.
This is captured as known legacy behavior and is not fixed in Phase 0.

## Known Legacy Behaviors Captured by Tests

- Collectible BUY uses static catalog pricing.
- Collectible SELL succeeds without inventory validation.
- Partial sales are unsupported.
- Closing a quantity-two trade closes the entire quantity.
- Acquisition lots do not exist.
- Cost-basis allocations do not exist.
- Closed collectible positions can still contribute to frontend NAV and unrealized gain.
- `/api/portfolio` returns a bare array containing both open and closed trades.

## OPEN DECISIONS

These decisions remain unresolved and must not be guessed during migration:

- Cost-basis method: FIFO, average cost, specific identification, or another policy.
- Treatment of fees, shipping, commissions, taxes, and storage costs.
- Holding consolidation rules for duplicate set numbers and physical items.
- Whether market and collectible positions share one portfolio or use separate portfolios.
- Whether current generic trades remain in final Brick Alpha scope.
- Whether VALR live trading remains in final Brick Alpha scope.

## Regression Coverage

Current financial behavior is captured in:

```text
server/test/financial.test.js
```

The tests intentionally assert current behavior, including known defects, so Phase 1 cannot silently change financial meaning.
