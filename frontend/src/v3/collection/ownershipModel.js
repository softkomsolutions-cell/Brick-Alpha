import { enrichBrickAlphaTrade, investmentGradeFor, themeAllocationFor } from "../../brickAlphaModel";
import { canonicalMarketValue } from "../valuation/valuationAuthority";

export const EXIT_CHANNELS = [
  { id: "local", label: "Local buyer groups", feeRate: 0.05 },
  { id: "bricklink", label: "BrickLink", feeRate: 0.12 },
  { id: "ebay", label: "eBay", feeRate: 0.15 },
];

export const EXIT_FEE_ASSUMPTION =
  "Channel fees are planning assumptions, not live quotes: local buyer groups 5%, BrickLink 12%, eBay 15%.";

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
  const explicit = String(trade?.sourceCondition || trade?.condition || "").trim();
  const text = `${explicit} ${trade?.orderNote || ""} ${trade?.note || ""} ${trade?.exitReason || ""}`.toLowerCase();
  if (text.includes("open box") || text.includes("opened")) return "Open Box";
  if (text.includes("built in display case")) return "Built in display case";
  if (text.includes("built")) return "Built";
  if (text.includes("loose") || text.includes("incomplete")) return "Loose";
  if (text.includes("used")) return "Used";
  if (text.includes("sealed")) return "Sealed";
  return explicit || "Unknown";
}

function setNumberOf(trade) {
  if (trade?.sourceSetNumber) return String(trade.sourceSetNumber).trim();
  if (trade?.sku) return String(trade.sku).trim();
  const match = String(trade?.ticker || trade?.collectibleId || "").match(/(\d{4,7})/);
  return match ? match[1] : String(trade?.collectibleId || "—");
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
    const figures = realisedSaleFigures({ gross: value, cost: 0, channel });
    return {
      ...channel,
      gross: figures.gross,
      fees: figures.fees,
      net: figures.net,
    };
  });
}

export function realisedSaleFigures({ gross, cost, channel }) {
  const fees = Math.round(numberOrZero(gross) * numberOrZero(channel?.feeRate));
  const net = numberOrZero(gross) - fees;
  return {
    channel: channel?.label || "Local buyer groups",
    feeRate: numberOrZero(channel?.feeRate),
    gross: numberOrZero(gross),
    fees,
    net,
    cost: numberOrZero(cost),
    realisedProfit: net - numberOrZero(cost),
  };
}

export function previewRealisedSale({ gross, cost, channelId, quantity = 1 }) {
  const channel = EXIT_CHANNELS.find((item) => item.id === channelId) || EXIT_CHANNELS[0];
  const units = Math.max(1, Math.round(numberOrZero(quantity) || 1));
  return realisedSaleFigures({
    gross: numberOrZero(gross) * units,
    cost: numberOrZero(cost),
    channel,
  });
}

function quantityOf(trade) {
  const quantity = numberOrNull(trade?.quantity);
  if (quantity == null || quantity <= 0) {
    return 1;
  }
  return quantity;
}

function marketUnitValue(trade) {
  const explicit = trade?.brickEconomyValue ?? trade?.currentMarketValue;
  const mark = explicit != null && explicit !== "" ? explicit : trade?.currentPrice;
  return canonicalMarketValue({
    brickEconomyValue: trade?.brickEconomyValue,
    currentMarketValue: mark,
  }).value;
}

function unitCostOf(trade) {
  if (trade?.entryPrice != null && trade.entryPrice !== "") {
    return numberOrZero(trade.entryPrice);
  }
  return numberOrZero(trade?.buyPrice);
}

export function allInAcquisition({
  price,
  quantity,
  shipping,
  vatReclaim,
  rewards,
  cashback,
  vouchers,
} = {}) {
  const units = quantityOf({ quantity });
  const cashPaid = numberOrZero(price) * units;
  const shippingPaid = numberOrZero(shipping);
  const credits =
    numberOrZero(vatReclaim) + numberOrZero(rewards) + numberOrZero(cashback) + numberOrZero(vouchers);
  const allInTotal = Math.max(0, cashPaid + shippingPaid - credits);
  return {
    quantity: units,
    cashPaid,
    shipping: shippingPaid,
    credits,
    allInTotal,
    unitCost: units > 0 ? allInTotal / units : 0,
  };
}

function flywheelFor(units, cost) {
  const oneUnitValue = units.length ? Math.max(...units.map((unit) => numberOrZero(unit.marketValue))) : 0;
  const channels = EXIT_CHANNELS.map((channel) => {
    const net = Math.max(0, oneUnitValue - Math.round(oneUnitValue * channel.feeRate));
    const triggerGross = cost > 0 && channel.feeRate < 1
      ? Math.ceil(cost / (1 - channel.feeRate))
      : null;
    return {
      ...channel,
      gross: oneUnitValue,
      net,
      triggerGross,
      recoveryGap: net - cost,
      ready: units.length > 1 && cost > 0 && net >= cost,
    };
  });
  const bestChannel = [...channels].sort((left, right) => right.net - left.net)[0] || null;
  const recoveryPercent = cost > 0 && bestChannel ? (bestChannel.net / cost) * 100 : null;
  return {
    oneUnitValue,
    oneUnitNet: bestChannel?.net || 0,
    recoveryGap: bestChannel ? bestChannel.recoveryGap : -cost,
    recoveryPercent: recoveryPercent != null && Number.isFinite(recoveryPercent) ? recoveryPercent : null,
    sellTriggerPrice: bestChannel?.triggerGross ?? null,
    flywheelChannel: bestChannel?.label || null,
    flywheelChannels: channels,
    flywheelReady: Boolean(bestChannel?.ready),
  };
}

function unitRows(trade, stackCost) {
  const quantity = Math.max(1, Math.round(numberOrZero(trade.quantity || 1)));
  const unitCost = numberOrZero(trade.entryPrice ?? trade.buyPrice);
  const unitValue = marketUnitValue(trade) ?? 0;
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
    const setNumber = setNumberOf(trade);
    const key = setNumber !== "—" ? setNumber : (trade.collectibleId || trade.id);
    const current = groups.get(key) || {
      id: key,
      name: trade.label || trade.name || trade.ticker || "LEGO set",
      setNumber,
      theme: trade.sourceTheme || trade.legoTheme || "Other",
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
      (sum, trade) => sum + (marketUnitValue(trade) ?? 0) * numberOrZero(trade.quantity || 1),
      0,
    );
    const units = group.trades.flatMap((trade) => unitRows(trade, cost));
    const conditions = [...new Set(units.map((unit) => unit.condition))];
    const hasCompletePurchaseHistory = group.trades.every((trade) => Boolean(String(trade.purchaseDate || "").trim()));
    const holdingDays = hasCompletePurchaseHistory
      ? Math.max(...group.trades.map((trade) => numberOrZero(trade.holdingPeriodDays)))
      : null;
    const months = group.trades
      .map((trade) => numberOrNull(trade.monthsUntilRetirement))
      .filter((value) => value != null);
    const sellWindowMonths = months.length ? Math.min(...months) : null;
    const profit = marketValue - cost;
    const roi = cost > 0 && Number.isFinite(profit / cost) ? (profit / cost) * 100 : null;
    const flywheel = flywheelFor(units, cost);
    return {
      ...group,
      units: units.length,
      unitRows: units,
      condition: conditions.length > 1 ? conditions.join(" + ") : conditions[0] || "Sealed",
      cost,
      marketValue,
      profit,
      roi,
      annualised: hasCompletePurchaseHistory
        ? annualisedReturnPercent(cost, marketValue, holdingDays)
        : null,
      sellWindowMonths,
      expectedRetirementDate:
        group.trades.map((trade) => trade.expectedRetirementDate).find(Boolean) || null,
      ...flywheel,
      belowCost: marketValue < cost,
      isStack: units.length > 1,
    };
  });

  sets.sort((left, right) => right.marketValue - left.marketValue);

  const conditionCounts = sets.reduce(
    (counts, set) => {
      for (const unit of set.unitRows) {
        if (unit.condition === "Sealed") {
          counts.sealed += 1;
        } else {
          counts.opened += 1;
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
      openValue: sets.reduce((sum, set) => sum + set.marketValue, 0),
      uniqueSets: sets.length,
      stacks: sets.filter((set) => set.isStack).length,
      inProfit: sets.reduce(
        (count, set) => count + set.unitRows.filter((unit) => unit.profit > 0).length,
        0,
      ),
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
    return `Sell 1 now — estimated net R${Math.round(set.oneUnitNet).toLocaleString("en-ZA")} covers the R${Math.round(set.cost).toLocaleString("en-ZA")} stack cost`;
  }
  if (set.isStack && set.sellTriggerPrice != null) {
    return `Watch — 1-unit sell trigger is R${Math.round(set.sellTriggerPrice).toLocaleString("en-ZA")} before fees`;
  }
  if (set.sellWindowMonths != null && set.sellWindowMonths < 0) {
    return "Retired — review the exit now";
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
    .filter((trade) => trade?.assetClass === "collectible" && !["sales-ledger", "demo-sales-ledger"].includes(String(trade?.executionProvider || "")))
    .map((trade) => {
      const quantity = Math.max(1, Math.round(numberOrZero(trade.quantity || 1)));
      const cost = numberOrZero(trade.entryPrice) * quantity;
      const gross = numberOrZero(trade.exitPrice ?? trade.currentPrice) * quantity;
      const channel = channelFromText(`${trade.exitReason || ""} ${trade.orderNote || ""}`);
      const figures = realisedSaleFigures({ gross, cost, channel });
      return {
        id: trade.id,
        name: trade.label || trade.name || trade.ticker || "LEGO set",
        setNumber: setNumberOf(trade),
        cost: figures.cost,
        gross: figures.gross,
        fees: figures.fees,
        net: figures.net,
        realisedProfit: figures.realisedProfit,
        saleDate: trade.closedAt || trade.updatedAt || "",
        channel: channel.label,
        recovery: figures.net >= figures.cost ? "Recovered — ready to recycle" : "Partial recovery",
      };
    })
    .sort((left, right) => String(right.saleDate).localeCompare(String(left.saleDate)));
}

export function summarizeOpenCollection(trades = []) {
  const collectibleTrades = (trades || []).filter((trade) => trade?.assetClass === "collectible");
  const openTrades = collectibleTrades.filter((trade) => trade.status !== "closed");
  const closedTrades = collectibleTrades.filter((trade) => trade.status === "closed");
  const costBasis = openTrades.reduce((sum, trade) => sum + unitCostOf(trade) * quantityOf(trade), 0);
  const netAssetValue = openTrades.reduce(
    (sum, trade) => sum + (marketUnitValue(trade) ?? 0) * quantityOf(trade),
    0,
  );
  const ledger = buildRealisedLedger(closedTrades);
  const realizedGain = ledger.reduce((sum, sale) => sum + numberOrZero(sale.realisedProfit), 0);
  const realizedProceeds = ledger.reduce((sum, sale) => sum + numberOrZero(sale.net), 0);
  const averageScore = openTrades.length
    ? openTrades.reduce((sum, trade) => sum + numberOrZero(trade.brickAlphaScore), 0) / openTrades.length
    : 0;
  const averageRisk = openTrades.length
    ? openTrades.reduce((sum, trade) => sum + numberOrZero(trade.riskScore), 0) / openTrades.length
    : 0;
  const categoryCount = new Set(openTrades.map((trade) => trade.category).filter(Boolean)).size;
  const diversificationScore = Math.min(100, Math.max(0, categoryCount * 22 + openTrades.length * 4));

  return {
    netAssetValue,
    costBasis,
    unrealizedGain: netAssetValue - costBasis,
    realizedGain,
    realizedProceeds,
    openPositions: openTrades.reduce((sum, trade) => sum + quantityOf(trade), 0),
    averageBrickAlphaScore: averageScore,
    collectionGrade: investmentGradeFor(averageScore),
    riskLevel: averageRisk <= 40 ? "Low" : averageRisk <= 62 ? "Balanced" : "High",
    diversificationScore,
    themeAllocation: themeAllocationFor(openTrades),
  };
}
