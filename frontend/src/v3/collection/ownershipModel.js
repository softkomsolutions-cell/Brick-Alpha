import { enrichBrickAlphaTrade } from "../../brickAlphaModel";

export const EXIT_CHANNELS = [
  { id: "local", label: "Local buyer groups", feeRate: 0.05 },
  { id: "bricklink", label: "BrickLink", feeRate: 0.12 },
  { id: "ebay", label: "eBay", feeRate: 0.15 },
];

function numberOrNull(value) {
  if (value == null || value === "") {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function numberOrZero(value) {
  return numberOrNull(value) ?? 0;
}

export function formatSignedPercent(value) {
  const numeric = numberOrNull(value);
  if (numeric == null) {
    return "—";
  }
  const rounded = Math.round(numeric * 10) / 10;
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded.toFixed(1)}%`;
}

export function annualisedReturnPercent(cost, value, holdingDays) {
  const basis = numberOrNull(cost);
  const current = numberOrNull(value);
  const days = numberOrNull(holdingDays);
  if (basis == null || basis <= 0 || current == null || current <= 0 || days == null) {
    return null;
  }
  const span = Math.max(1, days);
  if (span < 30) {
    return null;
  }
  const annual = (current / basis) ** (365 / span) - 1;
  return Number.isFinite(annual) ? annual * 100 : null;
}

export function conditionOf(trade) {
  const note = `${trade?.orderNote || ""} ${trade?.note || ""} ${trade?.exitReason || ""}`;
  const match = note.match(/Condition:\s*(sealed|opened)/i);
  if (!match) {
    return "Sealed";
  }
  return match[1].toLowerCase() === "opened" ? "Opened" : "Sealed";
}

function setNumberOf(trade) {
  if (trade?.sku) {
    return String(trade.sku);
  }
  const match = String(trade?.ticker || trade?.collectibleId || "").match(/(\d{4,6})/);
  return match ? match[1] : "—";
}

function channelFromText(text) {
  const note = String(text || "").toLowerCase();
  if (note.includes("bricklink")) {
    return EXIT_CHANNELS[1];
  }
  if (note.includes("ebay")) {
    return EXIT_CHANNELS[2];
  }
  return EXIT_CHANNELS[0];
}

export function channelNets(gross) {
  const value = numberOrZero(gross);
  return EXIT_CHANNELS.map((channel) => {
    const fees = Math.round(value * channel.feeRate);
    return {
      ...channel,
      gross: value,
      fees,
      net: value - fees,
    };
  });
}

function unitRows(trade, stackCost) {
  const quantity = Math.max(1, Math.round(numberOrZero(trade.quantity || 1)));
  const unitCost = numberOrZero(trade.entryPrice ?? trade.buyPrice);
  const unitValue = numberOrZero(trade.currentPrice ?? trade.currentMarketValue);
  return Array.from({ length: quantity }, (_, index) => {
    const share = stackCost > 0 ? (unitCost / stackCost) * 100 : null;
    return {
      id: `${trade.id}-unit-${index + 1}`,
      tradeId: trade.id,
      label: `Unit ${index + 1}`,
      condition: conditionOf(trade),
      cost: unitCost,
      marketValue: unitValue,
      profit: unitValue - unitCost,
      shareOfStackCost: share,
    };
  });
}

export function buildCollectionView(openTrades = [], collectibles = []) {
  const legoTrades = (openTrades || []).filter(
    (trade) => trade?.assetClass === "collectible" && trade.status !== "closed",
  );
  const enriched = legoTrades.map((trade) => enrichBrickAlphaTrade(trade, collectibles, openTrades));
  const groups = new Map();

  for (const trade of enriched) {
    const key = trade.collectibleId || setNumberOf(trade);
    const current = groups.get(key) || {
      id: key,
      name: trade.label || trade.name || "LEGO set",
      setNumber: setNumberOf(trade),
      theme: trade.legoTheme || "Other",
      trades: [],
    };
    current.trades.push(trade);
    groups.set(key, current);
  }

  const sets = [...groups.values()].map((group) => {
    const cost = group.trades.reduce(
      (sum, trade) => sum + numberOrZero(trade.entryPrice ?? trade.buyPrice) * numberOrZero(trade.quantity || 1),
      0,
    );
    const marketValue = group.trades.reduce(
      (sum, trade) => sum + numberOrZero(trade.currentPrice ?? trade.currentMarketValue) * numberOrZero(trade.quantity || 1),
      0,
    );
    const units = group.trades.flatMap((trade) => unitRows(trade, cost));
    const conditions = [...new Set(units.map((unit) => unit.condition))];
    const holdingDays = Math.max(...group.trades.map((trade) => numberOrZero(trade.holdingPeriodDays)));
    const months = group.trades
      .map((trade) => numberOrNull(trade.monthsUntilRetirement))
      .filter((value) => value != null);
    const sellWindowMonths = months.length ? Math.min(...months) : null;
    const profit = marketValue - cost;
    const roi = cost > 0 ? (profit / cost) * 100 : null;
    return {
      ...group,
      units: units.length,
      unitRows: units,
      condition: conditions.length > 1 ? conditions.join(" + ") : conditions[0] || "Sealed",
      cost,
      marketValue,
      profit,
      roi,
      annualised: annualisedReturnPercent(cost, marketValue, holdingDays),
      sellWindowMonths,
      flywheelReady: units.length >= 2 && sellWindowMonths != null && sellWindowMonths <= 18,
      belowCost: marketValue < cost,
      isStack: units.length > 1,
    };
  });

  sets.sort((left, right) => right.marketValue - left.marketValue);

  const conditionCounts = sets.reduce(
    (counts, set) => {
      for (const unit of set.unitRows) {
        if (unit.condition === "Opened") {
          counts.opened += 1;
        } else {
          counts.sealed += 1;
        }
      }
      return counts;
    },
    { sealed: 0, opened: 0 },
  );

  return {
    sets,
    themes: [...new Set(sets.map((set) => set.theme))].sort(),
    summary: {
      positions: sets.reduce((sum, set) => sum + set.units, 0),
      uniqueSets: sets.length,
      stacks: sets.filter((set) => set.isStack).length,
      inProfit: sets.filter((set) => set.profit > 0).length,
      sealed: conditionCounts.sealed,
      opened: conditionCounts.opened,
    },
  };
}

export function filterCollectionSets(sets, filter, theme = "") {
  if (filter === "stacks") {
    return sets.filter((set) => set.isStack);
  }
  if (filter === "flywheel") {
    return sets.filter((set) => set.flywheelReady);
  }
  if (filter === "below") {
    return sets.filter((set) => set.belowCost);
  }
  if (filter === "theme") {
    return sets.filter((set) => set.theme === theme);
  }
  return sets;
}

export function exitRecommendation(set) {
  if (set.flywheelReady) {
    return "Sell one unit and recycle the cash";
  }
  if (set.belowCost) {
    return "Hold — below cost";
  }
  if (set.sellWindowMonths != null && set.sellWindowMonths <= 6) {
    return "Sell window is close";
  }
  return "Hold for the sell window";
}

export function buildExitCandidates(openTrades = [], collectibles = []) {
  return buildCollectionView(openTrades, collectibles).sets
    .map((set) => ({
      ...set,
      recommendation: exitRecommendation(set),
      channels: channelNets(set.unitRows[0]?.marketValue || 0),
      bestNet: channelNets(set.unitRows[0]?.marketValue || 0)[0]?.net || 0,
    }))
    .sort((left, right) => {
      if (left.flywheelReady !== right.flywheelReady) {
        return left.flywheelReady ? -1 : 1;
      }
      const leftMonths = left.sellWindowMonths ?? 999;
      const rightMonths = right.sellWindowMonths ?? 999;
      return leftMonths - rightMonths;
    });
}

export function buildRealisedLedger(closedTrades = []) {
  return (closedTrades || [])
    .filter((trade) => trade?.assetClass === "collectible")
    .map((trade) => {
      const quantity = Math.max(1, Math.round(numberOrZero(trade.quantity || 1)));
      const cost = numberOrZero(trade.entryPrice) * quantity;
      const gross = numberOrZero(trade.exitPrice ?? trade.currentPrice) * quantity;
      const channel = channelFromText(`${trade.exitReason || ""} ${trade.orderNote || ""}`);
      const fees = Math.round(gross * channel.feeRate);
      const net = gross - fees;
      const realisedProfit = numberOrNull(trade.pnlAmount) ?? gross - cost;
      return {
        id: trade.id,
        name: trade.label || trade.name || "LEGO set",
        setNumber: setNumberOf(trade),
        cost,
        gross,
        fees,
        net,
        realisedProfit,
        saleDate: trade.closedAt || trade.updatedAt || "",
        channel: channel.label,
        recovery: net >= cost ? "Recovered — ready to recycle" : "Partial recovery",
      };
    })
    .sort((left, right) => String(right.saleDate).localeCompare(String(left.saleDate)));
}
