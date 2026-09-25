import { THEME_ALLOCATION_TARGETS } from "../../brickAlphaModel";
import { tradesForBook } from "../collection/collectionBooks";
import { buildCollectionView, buildRealisedLedger } from "../collection/ownershipModel";
import { resolveExchangeRate } from "../valuation/exchangeRate";
import { buildCanonicalRetirement } from "../retirement/retirementModel";
import { canonicalMarketValue } from "../valuation/valuationAuthority";

function retiringSoonDetail(set) {
  if (set.expectedRetirementDate) {
    const retirement = buildCanonicalRetirement({
      expectedRetirementDate: set.expectedRetirementDate,
    });
    if (
      retirement.retirementState === "Retired" ||
      (retirement.monthsRemaining != null && retirement.monthsRemaining <= 0)
    ) {
      return "Already retired";
    }
    if (retirement.monthsRemaining != null && retirement.monthsRemaining <= 6) {
      return `${retirement.monthsRemaining} months`;
    }
    return null;
  }
  if (set.sellWindowMonths != null && set.sellWindowMonths <= 6) {
    const months = Math.round(set.sellWindowMonths);
    return months <= 0 ? "Already retired" : `${months} months`;
  }
  return null;
}

function latestDate(values) {
  const dates = values.filter(Boolean).map(String).sort();
  return dates.length ? dates[dates.length - 1] : null;
}

/**
 * Blended ROI uses costed positions only.
 * An R0 free gift adds its market value to owned value and is left out of
 * both the ROI numerator and the denominator.
 */
function blendedRoi(sets, realisedProfit) {
  const costed = sets.filter((set) => set.cost > 0 && Number.isFinite(set.marketValue));
  const cost = costed.reduce((sum, set) => sum + set.cost, 0);
  if (!(cost > 0)) {
    return null;
  }
  const unrealised = costed.reduce((sum, set) => sum + (set.marketValue - set.cost), 0);
  const roi = ((unrealised + realisedProfit) / cost) * 100;
  return Number.isFinite(roi) ? roi : null;
}

function themeRows(sets) {
  const openValue = sets.reduce((sum, set) => sum + set.marketValue, 0);
  return Object.entries(THEME_ALLOCATION_TARGETS).map(([theme, cap]) => {
    const themed = sets.filter((set) => set.theme === theme);
    const value = themed.reduce((sum, set) => sum + set.marketValue, 0);
    const costed = themed.filter((set) => set.cost > 0);
    const cost = costed.reduce((sum, set) => sum + set.cost, 0);
    const profit = costed.reduce((sum, set) => sum + (set.marketValue - set.cost), 0);
    const share = openValue > 0 ? (value / openValue) * 100 : 0;
    const roi = cost > 0 ? (profit / cost) * 100 : null;
    return {
      theme,
      cap,
      share,
      value,
      roi: roi != null && Number.isFinite(roi) ? roi : null,
      overCap: share > cap,
    };
  });
}

export function buildHomeView({
  openTrades = [],
  closedTrades = [],
  collectibles = [],
  book = "curated",
  settings = {},
} = {}) {
  const selectedBook = book === "full" ? "full" : "curated";
  const openBook = tradesForBook(openTrades, selectedBook).filter(
    (trade) => trade?.assetClass === "collectible" && trade.status !== "closed",
  );
  const closedBook = tradesForBook(closedTrades, selectedBook).filter(
    (trade) => trade?.assetClass === "collectible" && trade.status === "closed",
  );
  const view = buildCollectionView(openBook, collectibles);
  const ledger = buildRealisedLedger(closedBook);
  const ownedValue = view.sets.reduce((sum, set) => sum + set.marketValue, 0);
  const costBasis = view.sets.reduce((sum, set) => sum + set.cost, 0);
  const realisedProfit = ledger.reduce((sum, sale) => sum + sale.realisedProfit, 0);
  const realisedCash = ledger.reduce((sum, sale) => sum + sale.net, 0);
  const costedRealised = ledger
    .filter((sale) => sale.cost > 0)
    .reduce((sum, sale) => sum + sale.realisedProfit, 0);
  const exchange = resolveExchangeRate(settings);
  const authoritative = openBook.some((trade) => {
    const item = collectibles.find((candidate) => candidate.id === trade.collectibleId);
    return canonicalMarketValue({
      brickEconomyValue: trade.brickEconomyValue ?? item?.brickEconomyValue,
      currentMarketValue: trade.currentMarketValue ?? trade.currentPrice ?? item?.currentMarketValue,
    }).authoritative;
  });

  const attention = [];
  for (const set of view.sets.filter((item) => item.flywheelReady)) {
    attention.push({
      id: `flywheel-${set.id}`,
      kind: "Flywheel ready",
      title: set.name,
      detail: "One unit covers the stack cost",
      page: "exits",
    });
  }
  for (const theme of themeRows(view.sets).filter((row) => row.overCap)) {
    attention.push({
      id: `cap-${theme.theme}`,
      kind: "Theme over cap",
      title: theme.theme,
      detail: `${theme.share.toFixed(1)}% of owned value · cap ${theme.cap}%`,
      page: "collection",
    });
  }
  for (const set of view.sets) {
    const retirementDetail = retiringSoonDetail(set);
    if (retirementDetail) {
      attention.push({
        id: `retire-${set.id}`,
        kind: "Retiring soon",
        title: set.name,
        detail: retirementDetail,
        page: "research",
        section: "retiring",
      });
    }
    if (set.belowCost) {
      attention.push({
        id: `below-${set.id}`,
        kind: "Below cost",
        title: set.name,
        detail: "Market value is under all-in cost",
        page: "collection",
      });
    }
  }

  return {
    book: selectedBook,
    ownedValue,
    costBasis,
    unrealisedProfit: ownedValue - costBasis,
    realisedProfit,
    realisedCash,
    blendedRoi: blendedRoi(view.sets, costedRealised),
    positions: view.summary.positions,
    uniqueSets: view.summary.uniqueSets,
    themes: themeRows(view.sets),
    attention,
    source: authoritative ? "BrickEconomy" : "Unavailable",
    valuationDate: latestDate(
      openBook.map((trade) => {
        const item = collectibles.find((candidate) => candidate.id === trade.collectibleId);
        const history = Array.isArray(item?.valuationHistory) ? item.valuationHistory : [];
        const historyDate = latestDate(history.map((entry) => entry?.date));
        return (
          trade.valuationDate ||
          item?.valuationDate ||
          historyDate ||
          (authoritative ? "2026-09-23" : null)
        );
      }),
    ),
    exchangeRate: exchange.rate,
    exchangeLabel: exchange.label,
    sets: view.sets,
  };
}
