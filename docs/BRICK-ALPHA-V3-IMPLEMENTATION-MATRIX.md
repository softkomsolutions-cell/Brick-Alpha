# Brick Alpha v3 — Implementation Matrix

This matrix is the delivery contract for the v3 rebuild.

## Locked product rule

Brick Alpha v3 combines:
1. Existing Brick Alpha content and intelligence that Gavin approved.
2. New information and functionality defined in the v3 PDF.
3. The v3 end-to-end workflow.
4. The v3 design direction incorporated into the polished application.

Existing useful intelligence must not be removed merely because a PDF mock-up is simpler. PDF requirements must not be marked complete merely because a similar legacy feature exists.

## Status vocabulary

- **EXISTS** — working capability can be preserved and adapted.
- **PARTIAL** — useful foundation exists but does not yet satisfy v3.
- **MISSING** — must be built.
- **NEEDS REWORK** — current capability conflicts with v3 workflow/UX and must be restructured.

## v3 product flow

One-time onboarding:
Welcome → How You Buy → Add Your Sets → Home

Ongoing investment loop:
Home → Scan → Verdict → Set Analysis → Log Purchase → Collection → Exits → Home

Primary mobile navigation:
Home / Research / Scan / Collection / Exits

## Requirements matrix

| Area | v3 requirement | Current state | Delivery action |
|---|---|---|---|
| Brand | Rising-brick Brick Alpha identity | PARTIAL | Incorporate v3 mark and tokens while retaining polished Brick Alpha presentation |
| Onboarding | Welcome step | PARTIAL | Rework existing entry/auth experience into v3 onboarding |
| Onboarding | How You Buy profile | MISSING | Add budget/set, hold period, risk tolerance, preferred themes |
| Onboarding | Add Your Sets | PARTIAL | Add manual, CSV and photo/import paths |
| Profile | Persist buying profile | MISSING | Store profile and expose to scoring/personalisation |
| Navigation | Home / Research / Scan / Collection / Exits | NEEDS REWORK | Replace legacy workspace-first IA with v3 primary journey |
| Home | Collection value / cost basis / gain / return | PARTIAL | Reuse accounting model; present v3 hierarchy |
| Home | Portfolio/collection signals | EXISTS | Preserve useful current intelligence without filler/repetition |
| Research | Search LEGO investment opportunities | PARTIAL | Rework catalogue/browse into Research |
| Research | New Releases | MISSING | Add research category |
| Research | Retiring Soon | PARTIAL | Promote retirement intelligence into Research |
| Research | Top Performers | PARTIAL | Add performance-led research view |
| Scan | Set number/manual identification | EXISTS | Preserve |
| Scan | Photo identification | PARTIAL | Prove and harden |
| Verdict | Dedicated fast decision screen | NEEDS REWORK | Split current long analysis into decision-first Verdict |
| Verdict | Recommendation / score / confidence / ROI / risk | EXISTS | Preserve current intelligence and simplify hierarchy |
| Verdict | Thesis checklist | PARTIAL | Convert strongest reasons/evidence into concise checklist |
| Verdict | Net exit values | PARTIAL | Derive from valuation + cost/fees rules |
| Analysis | Separate deep Set Analysis | NEEDS REWORK | Move detail behind Verdict |
| Analysis | Retirement factor | EXISTS | Preserve |
| Analysis | Minifigures factor | EXISTS | Preserve/harden |
| Analysis | Demand factor | PARTIAL | Normalize into nine-factor model |
| Analysis | Scarcity factor | EXISTS | Preserve |
| Analysis | Liquidity factor | PARTIAL | Normalize |
| Analysis | Theme factor | EXISTS | Preserve |
| Analysis | Portfolio Fit factor | PARTIAL | Connect buying profile + collection |
| Analysis | Price Trend factor | PARTIAL | Implement source-backed trend |
| Analysis | Historical Performance factor | PARTIAL | Normalize peer/history evidence |
| Valuation | BrickEconomy single valuation source | NEEDS REWORK | Make source-of-truth explicit and remove conflicting valuation inputs |
| Valuation | Annual growth | PARTIAL | Expose as decision input |
| Valuation | 90-day growth | MISSING | Add as decision input |
| Valuation | Remove speculative forecasts as decision inputs | NEEDS REWORK | Retain only where appropriate as secondary/non-authoritative context |
| Purchase | Log Purchase workflow | NEEDS REWORK | Replace generic trading/order-ticket UX |
| Purchase | Actual acquisition price | EXISTS | Preserve |
| Purchase | Purchase date | PARTIAL | Make first-class |
| Purchase | Retailer/source | PARTIAL | Make first-class |
| Purchase | Quantity | EXISTS | Preserve |
| Purchase | Sealed/opened condition | PARTIAL | Make first-class |
| Purchase | Notes | EXISTS | Preserve |
| Collection | Collection rather than trading portfolio UX | NEEDS REWORK | Preserve accounting engine, rebuild user-facing terminology |
| Collection | Cost basis | EXISTS | Preserve |
| Collection | Current value | EXISTS | Preserve |
| Collection | Total gain | EXISTS | Preserve |
| Collection | Annualised return | PARTIAL | Add/standardize |
| Collection | Per-set performance | EXISTS | Re-present |
| Collection | Filters | PARTIAL | Align to v3 |
| Exits | Dedicated Exits screen | MISSING | Build |
| Exits | Sell-window proximity | PARTIAL | Connect retirement/holding rules |
| Exits | Estimated net proceeds | PARTIAL | Build canonical calculation |
| Exits | Gain % | EXISTS | Reuse accounting |
| Exits | Annualised return | PARTIAL | Add |
| Exits | Exit recommendation | PARTIAL | Build rules/evidence |
| Flywheel | Purchase history informs future recommendations | PARTIAL | Connect profile + holdings + realized outcomes |
| Flywheel | Actual performance feedback | PARTIAL | Add closed-loop learning inputs |
| AI | Advisor/copilot | PARTIAL | Preserve useful current content; align canonical recommendation vocabulary |
| Evidence | Explainability and provenance | EXISTS | Preserve and surface progressively |
| Mobile | Bottom navigation with Scan centre action | NEEDS REWORK | Implement v3 mobile IA |
| Mobile | 44px touch targets / decision-first density | PARTIAL | Harden |
| Cleanup | Remove trading-desk language from LEGO journey | NEEDS REWORK | Remove from user-facing v3 surfaces |
| Cleanup | Remove repeated heroes/KPI/filler structures | NEEDS REWORK | Consolidate per v3 hierarchy |
| QA | Every visible control works or is disabled/removed | PARTIAL | Full browser interaction pass |
| QA | Analysis immutable after watchlist/portfolio actions | EXISTS | Preserve regression tests |
| Demo | Public review/demo mode | EXISTS | Keep isolated deterministic demo path |

## Delivery order

### Wave 1 — Structure
- v3 information architecture and navigation
- onboarding shell
- Home / Research / Scan / Collection / Exits routes
- remove legacy trading language from LEGO journey

### Wave 2 — Decision journey
- Scan
- Verdict
- nine-factor Set Analysis
- progressive disclosure of existing intelligence

### Wave 3 — Ownership journey
- Log Purchase
- Collection
- cost basis / P&L / annualised return
- acquisition details and condition/source

### Wave 4 — Exit + flywheel
- Exits
- sell-window logic
- net proceeds
- exit recommendation
- performance feedback into future recommendations

### Wave 5 — Data authority
- BrickEconomy valuation source
- annual and 90-day growth
- provenance/confidence
- eliminate conflicting canonical values

### Wave 6 — QA/release
- desktop/mobile visual QA
- all links/actions
- end-to-end demo
- regression suite
- deploy isolated v3 review build

## Non-negotiable acceptance rule

A requirement is not complete because code exists. It is complete only when the end-to-end user path works in the browser, values remain internally consistent, existing approved intelligence has not been accidentally lost, and the relevant regression tests pass.
