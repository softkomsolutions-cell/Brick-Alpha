import { THEME_ALLOCATION_TARGETS } from "../../brickAlphaModel";
import { tradesForBook } from "../collection/collectionBooks";
import { formatCollectiblePrice } from "../../appUtils";

function finiteOrNull(value) {
  if (value == null || value === "") {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

const ORDER = ["skip", "below", "buy-1", "buy-2"];

function stepDown(verdict) {
  const index = ORDER.indexOf(verdict.id);
  const next = ORDER[Math.max(0, index - 1)] || "skip";
  if (next === "skip") {
    return { ...verdict, id: "skip", label: "Skip", quantity: 0 };
  }
  if (next === "below") {
    return {
      ...verdict,
      id: "below",
      label: verdict.label.startsWith("Only below") ? verdict.label : `Only below ${formatCollectiblePrice(verdict.targetPrice)}`,
      quantity: 1,
    };
  }
  if (next === "buy-1") {
    return { ...verdict, id: "buy-1", label: "Buy ×1", quantity: 1 };
  }
  return { ...verdict, id: "buy-2", label: "Buy ×2 flywheel", quantity: 2 };
}

function themeShare(openTrades, theme) {
  const curated = tradesForBook(openTrades, "curated").filter(
    (trade) => trade?.assetClass === "collectible" && trade.status !== "closed",
  );
  const valueOf = (trade) => {
    const price = finiteOrNull(trade.currentPrice ?? trade.currentMarketValue) ?? 0;
    const quantity = finiteOrNull(trade.quantity) ?? 1;
    return price * (quantity > 0 ? quantity : 1);
  };
  const total = curated.reduce((sum, trade) => sum + valueOf(trade), 0);
  const themed = curated
    .filter((trade) => (trade.legoTheme || trade.theme) === theme)
    .reduce((sum, trade) => sum + valueOf(trade), 0);
  return total > 0 ? (themed / total) * 100 : 0;
}

function stackUnits(openTrades, setNumber) {
  return tradesForBook(openTrades, "curated")
    .filter((trade) => trade?.status !== "closed" && String(trade.sku || trade.setNumber || trade.ticker || "") === String(setNumber))
    .reduce((sum, trade) => sum + (finiteOrNull(trade.quantity) ?? 1), 0);
}

function realisedThemeProfit(closedTrades, theme) {
  return tradesForBook(closedTrades, "curated")
    .filter((trade) => trade?.status === "closed" && (trade.legoTheme || trade.theme) === theme)
    .reduce((sum, trade) => {
      const cost = (finiteOrNull(trade.entryPrice) ?? 0) * (finiteOrNull(trade.quantity) ?? 1);
      const net = finiteOrNull(trade.realisedProfit);
      if (net != null) {
        return sum + net;
      }
      const proceeds = (finiteOrNull(trade.exitPrice ?? trade.currentPrice) ?? 0) * (finiteOrNull(trade.quantity) ?? 1);
      return sum + (proceeds - cost);
    }, 0);
}

/**
 * Explicit book rules. They adjust the recommendation shown for this buyer.
 * They do not change BrickEconomy value, recorded growth, or the base verdict object.
 */
export function personaliseRecommendation({
  baseVerdict,
  profile = {},
  theme = "",
  setNumber = "",
  currentValue = null,
  riskScore = null,
  retirement = null,
  openTrades = [],
  closedTrades = [],
} = {}) {
  let verdict = { ...baseVerdict };
  const reasons = [];
  const budget = finiteOrNull(profile.budgetPerSet);
  const cap = THEME_ALLOCATION_TARGETS[theme] ?? THEME_ALLOCATION_TARGETS.Other ?? 11;
  const share = themeShare(openTrades, theme);
  const preferred = Array.isArray(profile.preferredThemes) && profile.preferredThemes.includes(theme);
  const units = stackUnits(openTrades, setNumber);
  const risk = finiteOrNull(riskScore);

  if (preferred && share <= cap) {
    reasons.push("Preferred theme is inside its cap");
  }

  if (share > cap && verdict.id !== "skip") {
    verdict = stepDown(verdict);
    reasons.push("Theme is over its cap, so the buy quantity steps down");
  }

  if (budget != null && budget > 0 && currentValue != null && Number.isFinite(currentValue)) {
    if (verdict.id === "buy-2" && currentValue * 2 > budget && currentValue <= budget) {
      verdict = { ...verdict, id: "buy-1", label: "Buy ×1", quantity: 1 };
      reasons.push("Budget covers one unit");
    } else if (currentValue > budget && verdict.id !== "skip") {
      verdict = {
        id: "below",
        label: `Only below ${formatCollectiblePrice(budget)}`,
        quantity: 1,
        targetPrice: budget,
      };
      reasons.push("Current value is above the budget per set");
    }
  }

  if (profile.holdPeriod === "short" && (retirement?.monthsRemaining ?? 0) > 24 && verdict.id !== "skip") {
    verdict = stepDown(verdict);
    reasons.push("Short hold preference steps down a long retirement");
  }

  if (profile.riskTolerance === "conservative" && risk != null && risk > 62 && verdict.id !== "skip") {
    verdict = stepDown(verdict);
    reasons.push("Risk is above a conservative tolerance");
  }

  if (units >= 2 && verdict.quantity > 0) {
    verdict = { ...verdict, id: "skip", label: "Skip", quantity: 0 };
    reasons.push("The curated stack already has two units");
  } else if (units === 1 && verdict.id === "buy-2") {
    verdict = { ...verdict, id: "buy-1", label: "Buy ×1", quantity: 1 };
    reasons.push("One unit is already in the curated book");
  }

  const themeResult = realisedThemeProfit(closedTrades, theme);
  if (themeResult < 0 && verdict.id !== "skip") {
    verdict = stepDown(verdict);
    reasons.push("Earlier exits in this theme were below cost");
  }

  return {
    baseVerdict,
    verdict,
    reasons,
    themeShare: Number.isFinite(share) ? share : 0,
    themeCap: cap,
    stackUnits: units,
  };
}
