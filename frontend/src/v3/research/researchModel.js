import { confidenceFor, legoThemeFor } from "../../brickAlphaModel";
import { mapVerdictVocabulary } from "../decision/decisionModel";
import { buildCanonicalValuation, formatRecordedGrowth } from "../valuation/valuationAuthority";
import { buildCanonicalRetirement } from "../retirement/retirementModel";
import { personaliseRecommendation } from "../personalisation/personalisationModel";

function setNumberOf(item) {
  if (item?.sku) {
    return String(item.sku);
  }
  const match = String(item?.id || "").match(/(\d{4,6})/);
  return match ? match[1] : "";
}

export function buildResearchCard(item, context = {}) {
  const valuation = buildCanonicalValuation(item);
  const retirement = buildCanonicalRetirement(item, context.asOf);
  const baseVerdict = mapVerdictVocabulary(item);
  const personalisation = personaliseRecommendation({
    baseVerdict,
    profile: context.profile || {},
    theme: item.legoTheme || legoThemeFor(item),
    setNumber: setNumberOf(item),
    currentValue: valuation.currentMarketValue,
    riskScore: item.riskScore,
    retirement,
    openTrades: context.openTrades || [],
    closedTrades: context.closedTrades || [],
  });
  const confidence = confidenceFor(item);
  return {
    id: item.id || setNumberOf(item),
    setNumber: setNumberOf(item),
    name: item.name || "LEGO set",
    theme: item.legoTheme || legoThemeFor(item),
    imageUrl: item.imageUrl || item.image || "",
    currentMarketValue: valuation.currentMarketValue,
    valuationDate: valuation.valuationDate,
    source: valuation.source,
    annualGrowth: valuation.annualGrowth,
    ninetyDayGrowth: valuation.ninetyDayGrowth,
    annualLabel: formatRecordedGrowth(valuation.annualGrowth),
    ninetyLabel: formatRecordedGrowth(valuation.ninetyDayGrowth),
    retirement,
    verdict: baseVerdict,
    personalisation,
    confidence: Number.isFinite(confidence) ? confidence : null,
    item,
  };
}

function matchesQuery(card, query) {
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) {
    return true;
  }
  return [card.name, card.setNumber, card.theme].join(" ").toLowerCase().includes(needle);
}

function above(value, minimum) {
  if (minimum == null || minimum === "") {
    return true;
  }
  const floor = Number(minimum);
  if (!Number.isFinite(floor)) {
    return true;
  }
  return value != null && Number.isFinite(value) && value >= floor;
}

export function filterResearchCards(cards, filters = {}) {
  return cards.filter((card) => {
    if (!matchesQuery(card, filters.query)) {
      return false;
    }
    if (filters.theme && card.theme !== filters.theme) {
      return false;
    }
    if (filters.retirement && card.retirement.retirementState !== filters.retirement) {
      return false;
    }
    if (filters.verdict && card.verdict.id !== filters.verdict) {
      return false;
    }
    if (filters.minPrice !== "" && filters.minPrice != null) {
      const min = Number(filters.minPrice);
      if (Number.isFinite(min) && (card.currentMarketValue == null || card.currentMarketValue < min)) {
        return false;
      }
    }
    if (filters.maxPrice !== "" && filters.maxPrice != null) {
      const max = Number(filters.maxPrice);
      if (Number.isFinite(max) && (card.currentMarketValue == null || card.currentMarketValue > max)) {
        return false;
      }
    }
    if (!above(card.annualGrowth, filters.minAnnual)) {
      return false;
    }
    if (!above(card.ninetyDayGrowth, filters.minNinety)) {
      return false;
    }
    return true;
  });
}

export function splitResearchSections(cards) {
  return {
    search: cards,
    newReleases: cards.filter((card) => card.retirement.retirementState === "Active"),
    retiringSoon: cards.filter(
      (card) =>
        card.retirement.retirementState === "Inside 6 months" ||
        card.retirement.retirementState === "Approaching" ||
        card.retirement.reminders.sixtyDay ||
        card.retirement.reminders.thirtyDay,
    ),
    topPerformers: [...cards]
      .filter((card) => card.annualGrowth != null)
      .sort((left, right) => right.annualGrowth - left.annualGrowth),
  };
}

const SECTION_KEY = "brick_alpha_v3_research_section";
let stagedSection = "";

export function stageResearchSection(section) {
  stagedSection = section || "";
  try {
    window.sessionStorage.setItem(SECTION_KEY, stagedSection);
  } catch {
    // The in-memory stage still opens the requested section on the next visit.
  }
}

export function readResearchSection() {
  if (stagedSection) {
    return stagedSection;
  }
  try {
    return window.sessionStorage.getItem(SECTION_KEY) || "search";
  } catch {
    return "search";
  }
}

export function consumeResearchSection() {
  stagedSection = "";
  try {
    window.sessionStorage.removeItem(SECTION_KEY);
  } catch {
    // The in-memory stage is already cleared.
  }
}

/** @deprecated Prefer readResearchSection. Kept so a single read does not drop the section. */
export function takeResearchSection() {
  return readResearchSection();
}
