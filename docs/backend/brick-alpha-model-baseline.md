# Brick Alpha Model Baseline

Phase 0 freezes the active frontend model before any backend valuation migration.

## Current Canonical Runtime

The canonical Brick Alpha collectible model is:

```text
frontend/src/brickAlphaModel.js
```

## Canonical Decision (Phase 4, 2026-09-18)

The canonical model is the active frontend model above. It is versioned as
`brick-alpha-v1` and ported byte-for-byte to the backend:

```text
server/services/brick-alpha-model.js
```

The backend port exports the full frontend surface plus
`BRICK_ALPHA_MODEL_VERSION = 'brick-alpha-v1'`. The dormant backend valuation
services under `server/services/` remain dormant and are never activated by this
decision. The frontend model is never "improved" during migration; improvements
require a new model version.

Parity is proven, not assumed, by deep-equality tests:

```text
server/test/phase4-valuation-parity.test.js
```

The parity suite runs every fixture case from `brick-alpha-baseline.json` and a
set of scenario inputs (retired, high-discount, low-discount, high-scarcity,
low-liquidity) through both the frontend module and the backend port and requires
the full scoring object to be identical, including score, grade, recommendation,
confidence, ROI forecasts, retirement intelligence, alpha signal badges,
display-group contributions, and factor-level contributions.

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
- No valuation snapshot is persisted by the frontend.

Phase 4 adds the backend valuation domain that persists versioned snapshots via
`POST /api/assets/:assetId/valuation/recalculate`. The persisted assessment stores
`modelVersion = brick-alpha-v1` with every persisted result, so a model upgrade
becomes a versioned, auditable change. The model's 0-100 score scale and
recommendation labels are retained exactly; the backend port does not reinterpret
them.

## RESOLVED DECISIONS (Phase 4)

| Decision | Resolution |
|---|---|
| Canonical model | Active frontend model, ported and versioned `brick-alpha-v1`. |
| Score scale | Current 0-100 frontend scale preserved; dormant backend scales unused. |
| Recommendation labels | Current frontend labels preserved. |
| Confidence | Model `confidenceFor` preserved; evidence signal and bounded confidence are recorded additively in assessment `breakdown` JSON and never change the persisted confidence. |
| Historical immutability | Valuations and assessments are append-only; recalculate never overwrites an earlier row. |
| Backend response fields | All current derived frontend fields are returned through the legacy response mapper plus versioned assessment payloads. |