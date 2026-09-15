# Brick Alpha Model Baseline

Phase 0 freezes the active frontend model before any backend valuation migration.

## Current Canonical Runtime

The active Brick Alpha collectible model is:

```text
frontend/src/brickAlphaModel.js
```

The backend valuation services under `server/services/` are dormant and are not activated by this baseline.

The frontend receives basic collectible and trade data, then derives scores and recommendations locally.

## Baseline Date

The deterministic fixture uses:

```text
2026-09-15T00:00:00.000Z
```

Fixture file:

```text
server/test/fixtures/brick-alpha-baseline.json
```

Regression test:

```text
server/test/brick-alpha-baseline.test.js
```

## Representative Outputs

| Case | Score | Grade | Recommendation | Confidence | Estimated ROI | Projected ROI | Retirement |
|---|---:|---|---|---:|---:|---:|---|
| `baseline-strong-buy` | 94 | A+ | Strong Buy | 95 | 25.0% | 52.5% | Retired |
| `baseline-buy` | 67 | C | Hold | 63 | 11.1111% | 35.5556% | Approaching |
| `baseline-hold` | 57 | C | Watch | 54 | 3.0% | 25.66% | Active |
| `baseline-sell` | 58 | C | Sell | 71 | 50.0% | 83.0% | Retired |
| `baseline-watch` | 46 | C | Avoid | 47 | 0.0% | 22.0% | Active |
| `baseline-avoid` | 32 | C | Avoid | 35 | 0.0% | 22.0% | Active |
| `baseline-retiring-soon` | 74 | B | Buy | 63 | 14.2857% | 39.4286% | Imminent |

The fixture also records:

- Retirement probability.
- Retirement confidence.
- Discount percentage.
- Risk score.
- Liquidity score.
- Retirement timeline score.
- Alpha signal badges.
- Display-group score contributions.
- Factor-level score contributions.

## Current Model Behavior

- Scores are calculated in the browser.
- Recommendations are calculated in the browser.
- Confidence is calculated in the browser.
- Forecasts are calculated in the browser.
- Retirement intelligence is calculated in the browser.
- Scan processing is simulated and uses local demo data.
- No valuation snapshot is persisted.
- No model version is stored with a result.

## OPEN DECISIONS

- Canonical model: active frontend model or dormant backend model.
- Score scale: current 0-100 frontend scale versus dormant 0-100 and 0-10 recommendation scale.
- Canonical recommendation labels.
- Evidence requirements for confidence.
- Whether score changes should be historical and immutable.
- Whether backend responses should include all current derived frontend fields.

No model was moved or changed in Phase 0.
