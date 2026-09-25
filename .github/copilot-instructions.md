# Brick Alpha repository instructions for GitHub Copilot

## Product
Brick Alpha is a LEGO investment-intelligence application. The current product direction is Brick Alpha v3.

Preserve the useful investment intelligence that Gavin approved, while presenting it through the v3 LEGO workflow and visual system.

Primary v3 journey:
Home → Research → Scan → Verdict → Set Analysis → Log Purchase → Collection → Portfolio → Exits.

Settings is supporting configuration, not a primary investment screen.

## Non-negotiable financial/data rules
Do not change these rules unless the task explicitly requests it:
- BrickEconomy is the canonical current valuation source.
- Never substitute catalogue price, retail price, purchase price, or a forecast for current market value.
- If BrickEconomy value is unavailable, show an unavailable state; do not fabricate a fallback value.
- Annual and 90-day growth come only from recorded valuation history.
- Do not use speculative 1-year/5-year/10-year forecasts in the canonical v3 decision path.
- Realised profit = net sale proceeds after fees minus cost basis.
- Sold sets must leave open Collection NAV.
- Realised cash/profit must stay separate from owned market value and must never be double-counted.
- Flywheel-ready means one unit's current value is greater than or equal to total stack cost. Retirement proximity alone cannot make a stack flywheel-ready.
- R0 free gifts contribute to owned value but not the ROI denominator; display ROI as unavailable for a zero-cost individual position and never divide by zero.
- Exchange rate comes from Settings and must be consistent everywhere.
- Curated and Full Collection books remain distinct. Full-only positions must not affect curated concentration, performance, theme caps, or buy-fit logic.

## Decision workflow
The canonical decision path is:
Scan → Verdict → Set Analysis → Log Purchase.

Verdict is the quick decision. Preserve:
- set image/name/number
- current BrickEconomy value
- Brick Alpha score
- verdict
- confidence
- recorded annual/90-day growth
- risk
- thesis
- retirement summary
- net exit by channel
- watch target
- Set Analysis action
- Add to Collection action

Canonical verdict wording:
- Buy ×2 flywheel
- Buy ×1
- Only below target
- Skip

Set Analysis contains the deeper nine-factor analysis and progressive disclosure. Do not dump every detail open at once.

Watchlist, purchase, sale, and navigation actions must not silently mutate the frozen/canonical set analysis.

## Collection vs Portfolio
Do not collapse these screens into one:
- Collection = owned LEGO positions, units, cost basis, current value, unrealised performance, stack detail.
- Portfolio = portfolio-level intelligence: performance, theme allocation, concentration, realised vs unrealised return, capital deployed/recycled, holding contribution, and portfolio health.

Portfolio must derive from the same Collection/Exits source data. Do not create a second accounting source of truth.

## UI / UX standard
The product must look like a finished commercial LEGO investment app, not a generic trading desk.

Rules:
- Keep the visible LEGO journey free of legacy trading-desk language.
- Use concise headings and labels. Text must fit cards and buttons without awkward wrapping.
- Prefer strong information hierarchy, compact spacing, intentional whitespace, and responsive layouts.
- Every visible button must work. If an action is not implemented, do not show the control.
- Desktop and 390px mobile are both release requirements.
- Mobile primary navigation must preserve Home, Research, Scan, Collection, Portfolio/Exits access with Scan prominent.
- Avoid endless CSS overrides. Refactor conflicting styles/components when practical.
- Prefer new/refactored v3 components under frontend/src/v3/.
- Do not grow frontend/src/components/workspaceScreens.jsx unless unavoidable.
- Do not reintroduce legacy Subscriptions or generic market/trading surfaces into the Gavin LEGO journey.
- Preserve accessibility semantics: real buttons for actions, labels for inputs, visible focus states, sensible aria attributes.

## Release discipline
Before considering a change complete:
1. Run frontend tests.
2. Run server tests.
3. Run npm run check:full.
4. Browser-test desktop and 390px mobile.
5. Verify every visible navigation item and CTA.
6. Verify the full journey Scan → Verdict → Set Analysis → Log Purchase → Collection → Portfolio → Exits.
7. Confirm Gavin demo baseline/accounting values remain stable.
8. Confirm no NaN, Infinity, undefined, or null leaks into user-visible financial output.

Do not commit docs/Brick_Alpha_App_Structure_Spec_v3.pdf. It is a local source document.

Do not alter verified accounting/valuation semantics merely to make a UI test pass. Fix the UI, test fixture, or integration instead.

When making UI changes, make them visibly meaningful and coherent across the product rather than layering tiny one-off patches.
