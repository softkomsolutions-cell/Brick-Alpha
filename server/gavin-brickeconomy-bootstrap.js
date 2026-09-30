const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "data", "app-store.json");
const FIXTURE_DIR = path.join(__dirname, "fixtures", "gavin-brickeconomy");
const EXPECTED_COUNT = 351;
const EXPECTED_PAID = 67588.12;
const EXPECTED_VALUE = 101743.42;

function money(value) {
  return Number(Number(value || 0).toFixed(2));
}

function loadRows() {
  const files = fs.readdirSync(FIXTURE_DIR).filter((name) => name.endsWith(".json")).sort();
  const rows = [];
  for (const file of files) {
    const parsed = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, file), "utf8"));
    for (const item of parsed) {
      if (Array.isArray(item)) {
        const [setNumber, name, paid, value, condition] = item;
        rows.push({ setNumber, name, paid, value, condition });
      } else {
        rows.push(item);
      }
    }
  }
  return rows;
}

if (!fs.existsSync(DATA_FILE)) {
  console.log("Gavin BrickEconomy bootstrap skipped: no persisted store yet.");
  process.exit(0);
}

const rows = loadRows();
const paidTotal = money(rows.reduce((sum, row) => sum + Number(row.paid || 0), 0));
const valueTotal = money(rows.reduce((sum, row) => sum + Number(row.value || 0), 0));

if (rows.length !== EXPECTED_COUNT || paidTotal !== EXPECTED_PAID || valueTotal !== EXPECTED_VALUE) {
  throw new Error(`Gavin fixture mismatch: count=${rows.length}, paid=${paidTotal}, value=${valueTotal}`);
}

const store = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
const demoUsers = (store.users || []).filter((user) =>
  String(user.email || "").toLowerCase().endsWith("@collecttrade.local"),
);

if (!demoUsers.length) {
  console.log("Gavin BrickEconomy bootstrap skipped: no demo user exists.");
  process.exit(0);
}

const now = new Date().toISOString();
for (const user of demoUsers) {
  const state = store.userStates?.[user.id];
  if (!state) continue;

  state.trades = rows.map((row, index) => {
    const paid = money(row.paid);
    const value = money(row.value);
    const pnlAmount = money(value - paid);
    return {
      id: index + 1,
      marketTicker: `COLLECTIBLE:brickeconomy-${String(row.setNumber || index + 1)}-${index + 1}`,
      ticker: String(row.name || row.setNumber || `LEGO ${index + 1}`),
      assetClass: "collectible",
      side: "BUY",
      status: "open",
      entryPrice: paid,
      currentPrice: value,
      pnl: paid > 0 ? Number(((pnlAmount / paid) * 100).toFixed(2)) : 0,
      setup: "Gavin BrickEconomy portfolio",
      createdAt: now,
      updatedAt: now,
      owner: user.id,
      collectibleId: `brickeconomy-${String(row.setNumber || index + 1)}-${index + 1}`,
      category: "LEGO Portfolio",
      market: "BrickEconomy",
      venue: "BrickEconomy export",
      note: `Set ${row.setNumber || ""}; condition ${row.condition || "Unknown"}`,
      unitLabel: "items",
      quantity: 1,
      orderNote: "Imported from Gavin BrickEconomy portfolio export.",
      executionMode: "paper",
      executionProvider: "brickeconomy-import",
      executionLabel: "Gavin BrickEconomy Import",
      pnlAmount,
      entryValue: paid,
      currentValue: value,
      stopPrice: 0,
      targetPrice: 0,
      riskBudget: null,
      riskAmount: paid,
      rewardAmount: Math.max(0, pnlAmount),
      riskRewardRatio: null,
      sourceSetNumber: String(row.setNumber || ""),
      sourceCondition: String(row.condition || ""),
    };
  });

  state.gavinBrickEconomyImport = {
    version: "2026-09-30",
    loadedAt: now,
    positions: rows.length,
    paidTotal,
    valueTotal,
  };

  state.notifications = [
    {
      id: "gavin-brickeconomy-loaded",
      ticker: "BRICKECONOMY",
      label: "BrickEconomy",
      desk: "collectibles",
      title: "Gavin BrickEconomy portfolio loaded",
      message: `${rows.length} holdings loaded. Paid ${paidTotal}; value ${valueTotal}.`,
      type: "portfolio",
      status: "unread",
      createdAt: now,
    },
    ...(state.notifications || []).filter((item) => item.id !== "gavin-brickeconomy-loaded"),
  ];
}

fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
console.log(`Gavin BrickEconomy portfolio loaded: ${rows.length} positions; paid=${paidTotal}; value=${valueTotal}`);
