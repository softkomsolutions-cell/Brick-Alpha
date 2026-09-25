---
applyTo: "frontend/src/v3/**,frontend/src/App.jsx,frontend/src/specV3.css,frontend/src/v3/v3Layout.css"
---

# Brick Alpha v3 frontend instructions

Treat this code as a LEGO investment product, not a generic financial trading interface.

Before editing a screen, inspect adjacent v3 screens and reuse the same spacing, typography, card, button, and responsive patterns.

For every visual change:
- Check desktop and 390px mobile.
- Check text wrapping at realistic values and long LEGO set names.
- Keep cards compact; avoid large empty panels.
- Avoid oversized full-width CTAs unless the action truly needs emphasis.
- Keep action labels short and specific.
- Keep investment values visually dominant and explanatory copy secondary.
- Preserve canonical BrickEconomy/current-value data and accounting logic.
- Do not create local copies of valuation/accounting calculations inside components.
- Prefer deriving display models from existing v3 model helpers.
- Keep Collection as holdings and Portfolio as analytics.
- Charting must be derived from real current app data and must remain readable with 1, 2, or many holdings.
- Do not hide errors with CSS.
- Do not append broad !important overrides unless there is no safer component-level fix.
- Any visible control must have a working handler and a valid route/action.
