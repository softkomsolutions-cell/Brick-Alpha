---
mode: agent
description: Finish Brick Alpha v3 UI, interactions, and release QA without changing locked financial semantics.
---

# Brick Alpha v3 final release task

Work from the current branch and repository state.

Read first:
- .github/copilot-instructions.md
- .github/instructions/brick-alpha-v3.instructions.md
- frontend/src/v3/
- frontend/src/App.jsx

Do not write another high-level plan. Briefly map the current screen to the intended v3 role, then start implementing.

## Goal
Make the live Gavin build feel like a polished commercial LEGO investment product.

The final visible product must include:
- Home
- Research
- Scan
- Collection
- Portfolio
- Exits
- Verdict
- Set Analysis
- Log Purchase
- Settings

Portfolio is required and must contain meaningful visual intelligence/charting from existing real app data:
- current portfolio value
- blended ROI
- capital deployed
- unrealised profit
- realised profit
- realised cash/cash recycled
- theme allocation and concentration vs caps
- realised vs unrealised profit mix
- capital flow
- holding contribution by value/ROI

Do not use speculative forecasts in these charts.

## UI refinement
Make visible improvements, not tiny cosmetic patches:
- stronger hierarchy
- tighter vertical rhythm
- professional cards
- text that fits without awkward wrapping
- consistent button sizing
- meaningful empty states
- less dead space
- responsive layouts
- coherent visual language across all pages

Check long LEGO names, Rand values, percentages, and mobile widths.

## Interaction QA
Verify every visible control:
- sidebar and mobile navigation
- Home attention links
- Research tabs, filters, cards, watch target
- Scan/photo/upload/set-number actions
- Verdict watch, Set Analysis, Add to Collection
- Set Analysis disclosures and Log Purchase
- Log Purchase save/back
- Collection filters, expansion, links
- Portfolio navigation and analytics
- Exits sale preview, Record Sale, Cancel, Save
- Settings and Reset Demo
- logout and allowed support actions

If a control is visible but non-functional, fix it or remove it.

## Locked semantics
Do not change:
- BrickEconomy canonical valuation authority
- recorded-growth rules
- realised-profit net-of-fees accounting
- sold-set exclusion from owned NAV
- no owned-value + realised-cash double count
- flywheel recovery rule
- curated/full book separation
- free-gift ROI handling
- analysis immutability

## Verification
Run:
- npm --prefix frontend run test
- npm --prefix server test
- npm run check:full

Then browser-test desktop and 390px mobile.

Report:
- exact commit SHA
- routes verified
- buttons/actions verified
- UI issues fixed
- accounting/valuation invariants rechecked
- test counts
- any genuine blocker

Do not commit docs/Brick_Alpha_App_Structure_Spec_v3.pdf.
