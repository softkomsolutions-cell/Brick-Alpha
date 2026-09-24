# Brick Alpha — Partner Demo Script

A self-contained, offline, deterministic walkthrough of Brick Alpha. No live data
providers, tunnels, or real credentials are used: pricing and news are simulated locally
so the demo behaves identically every run.

## Before the meeting

- Node.js installed (LTS). Everything else is a local dependency.
- No `DATABASE_URL` / provider keys are needed — `npm run demo` forces legacy local mode.
- Optional: close other apps using `http://localhost:5000` (`npm run partner:staging`).

## Start the demo

```bash
npm run demo
```

- Builds the frontend, starts the server on `http://localhost:5000` with `DEMO_MODE=true`.
- Open `http://localhost:5000` in the browser (Chrome or Edge preferred).
- First load seeds a demo catalogue of 8 LEGO sets with varied recommendations
  (2 Strong Buy, 2 Buy, 2 Hold, 1 Watch, 1 Avoid) plus a local news feed.

## The 8–12 minute journey

### 1. Login screen (0:00)
- Call out the navigation, then press **Enter Demo**.
- A fresh demo partner account is created instantly (no form). Inside, its portfolio and
  watchlist are pre-seeded with realistic values.

### 2. Dashboard (0:30)
- Executive dashboard shows the seeded portfolio value, P/L, signal headline, and
  offline news feed — all populated with no internet access.
- Grab a headline to show the news read panel; note it is fed from the local demo feed.

### 3. Discovery (1:30)
- Open **Collectibles Discovery**. Note the catalogue (8 sets) and the recommendation
  mix: Strong Buy → Buy → Hold → Watch → Avoid.
- Explain one scoring driver (e.g. `retirementTimeline`) from a set card.

### 4. Investment Analysis (3:00)
- Select **75367 UCS Venator** (Strong Buy).
- Show the China/NEA/Concorde-style score breakdown, discount to retail, fundamentals,
  comparisons, and the thesis.

### 5. Watchlist (4:30)
- From the analysis screen, save the set to the **Watchlist**. It resolves instantly and
  appears with a current price, category, and WATCH action.
- Show the pre-seeded watchlist entries (75367, 71043, 76218). Click one to jump back
  to Investment Analysis.

### 6. Portfolio purchase with explicit acquisition price (5:30)
- Open **Portfolio Intelligence**: 3 seeded LEGO holdings with realistic P/L vs the
  current market mark.
- Buy **10316 Rivendell** (or any set) through the ticket: the order form shows an
  **Acquisition price (ZAR)** field — enter your own number to control entry.
- Submit; the position appears instantly and the P/L recalculates against the
  acquisition price.

### 7. P/L review (7:00)
- Confirm the new holding is in the portfolio with the entered acquisition price and an
  updated unrealized gain/loss. Seeded positions keep their mark-to-market values.

### 8. Reset Demo (8:00)
- Open **Settings → Demo reset → Reset Demo**.
- The app clears the session and re-enters a brand-new demo account with a freshly
  seeded portfolio — the whole journey can run again from a clean slate.

### 9. Close-out (9:00–10:00)
- Recap: fully offline, deterministic, no credentials; data comes from the simulated
  engine; the same capability upgrades to live providers in production.
- Answer: "Can I see it again?" Yes — `npm run demo`, Enter Demo, done.

## Intentional demo behaviors

- **Deterministic prices**: simulated engine marks collectibles; signals drift slowly so
  numbers look alive but stay legible.
- **Acquisition price is optional**: if omitted the entry equals the current mark, making
  P/L start at zero — enter a price in the demo to show a spread.
- **Reset is a fresh account**: a new uuid demo user is created each time, so state never
  accumulates between runs.

## Backup plan

- If the browser/port is already in use, stop the other task holding `localhost:5000`,
  or set `PORT=5001 npm run demo`.
- If the build fails, ensure `npm install` was run (`npm run install:all`).
- Never needed, but a plain start without demo data: `npm run partner:staging`.