const fs = require("fs");
const path = require("path");

const FIXTURE_DIR = path.join(__dirname, "fixtures", "gavin-v152-zar");
const EXPECTED_COUNT = 292;
const EXPECTED_COST = 1109470.20;
const EXPECTED_VALUE = 1724451.67;

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
        const [setNumber, name, condition, costZar, valueZar, theme, purchaseDate, year] = item;
        rows.push({ setNumber, name, condition, costZar, valueZar, theme, purchaseDate, year });
      } else {
        rows.push(item);
      }
    }
  }

  const costTotal = money(rows.reduce((sum, row) => sum + Number(row.costZar || 0), 0));
  const valueTotal = money(rows.reduce((sum, row) => sum + Number(row.valueZar || 0), 0));
  if (rows.length !== EXPECTED_COUNT || costTotal !== EXPECTED_COST || valueTotal !== EXPECTED_VALUE) {
    throw new Error(`Gavin V152 fixture mismatch: count=${rows.length}, cost=${costTotal}, value=${valueTotal}`);
  }
  return { rows, costTotal, valueTotal };
}

function normalisePurchaseDate(value, fallback) {
  const text = String(value || "").trim();
  if (!text) return fallback;
  const parts = text.split("/");
  if (parts.length === 3) {
    const [month, day, year] = parts;
    const iso = new Date(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T12:00:00.000Z`);
    if (Number.isFinite(iso.getTime())) return iso.toISOString();
  }
  const parsed = new Date(text);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : fallback;
}

function seedGavinBrickEconomyState(state, userId, nowIso) {
  const { rows, costTotal, valueTotal } = loadRows();
  const now = nowIso();

  state.trades = rows.map((row, index) => {
    const cost = money(row.costZar);
    const value = money(row.valueZar);
    const pnlAmount = money(value - cost);
    const setNumber = String(row.setNumber || "");
    const createdAt = normalisePurchaseDate(row.purchaseDate, now);

    return {
      id: index + 1,
      marketTicker: `COLLECTIBLE:v152-${setNumber || index + 1}-${index + 1}`,
      ticker: String(row.name || setNumber || `LEGO ${index + 1}`),
      assetClass: "collectible",
      side: "BUY",
      status: "open",
      entryPrice: cost,
      currentPrice: value,
      pnl: cost > 0 ? Number(((pnlAmount / cost) * 100).toFixed(2)) : 0,
      setup: "Gavin V152 portfolio",
      createdAt,
      updatedAt: now,
      owner: userId,
      collectibleId: `lego-${setNumber || index + 1}`,
      category: "LEGO Portfolio",
      market: "BrickEconomy",
      venue: "Coolsters V152 tracker",
      note: `Set ${setNumber}; Condition: ${row.condition || "Unknown"}`,
      unitLabel: "items",
      quantity: 1,
      orderNote: "Imported from Coolsters LEGO Portfolio Tracker V152.",
      executionMode: "paper",
      executionProvider: "v152-import",
      executionLabel: "Gavin V152 Import",
      pnlAmount,
      entryValue: cost,
      currentValue: value,
      brickEconomyValue: value,
      currentMarketValue: value,
      stopPrice: 0,
      targetPrice: 0,
      riskBudget: null,
      riskAmount: cost,
      rewardAmount: Math.max(0, pnlAmount),
      riskRewardRatio: null,
      sourceSetNumber: setNumber,
      sourceCondition: String(row.condition || ""),
      sourceTheme: String(row.theme || ""),
      sourceYear: String(row.year || ""),
      purchaseDate: row.purchaseDate || "",
      valuationCurrency: "ZAR",
      valuationSource: "BrickEconomy",
      valuationDate: "2026-09-29",
      ...(setNumber === "70840"
        ? {
            actualRetirementDate: "2019-11-23",
            retirementStatus: "Retired",
            monthsUntilRetirement: -1,
          }
        : {}),
    };
  });

  state.trades.push(
    {
      id: rows.length + 1,
      marketTicker: "COLLECTIBLE:realised-10305",
      ticker: "LEGO 10305 — Lion Knights' Castle",
      assetClass: "collectible",
      side: "BUY",
      status: "closed",
      entryPrice: 6999,
      currentPrice: 8540,
      exitPrice: 8540,
      pnl: 15.92,
      pnlAmount: 1114,
      entryValue: 6999,
      currentValue: 8540,
      quantity: 1,
      unitLabel: "items",
      owner: userId,
      collectibleId: "lego-10305",
      sourceSetNumber: "10305",
      sourceCondition: "Sealed",
      sourceTheme: "Icons",
      category: "LEGO Portfolio",
      market: "BrickEconomy",
      venue: "Local buyer groups",
      executionMode: "paper",
      executionProvider: "sales-ledger",
      executionLabel: "Recorded sale",
      createdAt: "2026-09-23T12:00:00.000Z",
      updatedAt: now,
      closedAt: "2026-09-23T12:00:00.000Z",
      exitReason: "Local buyer groups",
      orderNote: "Recorded sale: gross R8,540; fee R427; net R8,113; realised profit R1,114.",
    },
    {
      id: rows.length + 2,
      marketTicker: "COLLECTIBLE:realised-10316",
      ticker: "LEGO 10316 — The Lord of the Rings: Rivendell",
      assetClass: "collectible",
      side: "BUY",
      status: "closed",
      entryPrice: 14900,
      currentPrice: 18684,
      exitPrice: 18684,
      pnl: 19.13,
      pnlAmount: 2850,
      entryValue: 14900,
      currentValue: 18684,
      quantity: 1,
      unitLabel: "items",
      owner: userId,
      collectibleId: "lego-10316",
      sourceSetNumber: "10316",
      sourceCondition: "Sealed",
      sourceTheme: "Icons",
      category: "LEGO Portfolio",
      market: "BrickEconomy",
      venue: "Local buyer groups",
      executionMode: "paper",
      executionProvider: "sales-ledger",
      executionLabel: "Recorded sale",
      createdAt: "2026-09-23T12:00:00.000Z",
      updatedAt: now,
      closedAt: "2026-09-23T12:00:00.000Z",
      exitReason: "Local buyer groups",
      orderNote: "Recorded sale: gross R18,684; fee R934; net R17,750; realised profit R2,850.",
    },
  );

  state.gavinBrickEconomyImport = {
    version: "V152",
    loadedAt: now,
    positions: rows.length,
    costTotal,
    valueTotal,
  };

  state.notifications = [
    {
      id: "gavin-v152-loaded",
      ticker: "V152",
      label: "V152",
      desk: "collectibles",
      title: "Gavin V152 portfolio loaded",
      message: `${rows.length} positions loaded. Cost R${costTotal}; value R${valueTotal}.`,
      type: "portfolio",
      status: "unread",
      createdAt: now,
    },
    ...(state.notifications || []).filter((item) => item.id !== "gavin-v152-loaded"),
  ];

  return { positions: rows.length, costTotal, valueTotal };
}

module.exports = { seedGavinBrickEconomyState, loadRows };
