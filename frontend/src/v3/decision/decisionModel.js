import { confidenceFor, buildBrickAlphaScoreBreakdown, letterGradeFor } from "../../brickAlphaModel";
import {
  PREMIUM_COMPARABLES,
  buildAiInvestmentSummary,
  buildForecastCards,
  buildMarketPricing,
  buildRetirementSnapshot,
  riskLabel,
} from "../../scanEvaluationData";
import { formatCollectiblePrice } from "../../appUtils";

const CHANNELS = [
  { id: "private", label: "Private sale", feeRate: 0.05 },
  { id: "marketplace", label: "Marketplace", feeRate: 0.12 },
  { id: "auction", label: "Auction", feeRate: 0.15 },
];

function numberOrZero(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function setNumberOf(evaluation) {
  if (evaluation?.sku) {
    return String(evaluation.sku);
  }
  const match = String(evaluation?.id || "").match(/(\d{4,6})/);
  return match ? match[1] : "";
}

export function mapVerdictVocabulary(evaluation) {
  const recommendation = String(evaluation?.recommendation || "");
  const score = numberOrZero(evaluation?.brickAlphaScore);
  const current = numberOrZero(evaluation?.currentMarketValue || evaluation?.price);
  const retail = numberOrZero(evaluation?.retailPrice);
  const discount = numberOrZero(evaluation?.discountPercentage);
  const ceiling = retail > 0 ? retail : current;
  const target = Math.round(ceiling * (discount > 5 ? 1 : 0.9));

  if (recommendation === "Avoid" || recommendation === "Sell" || score < 55) {
    return { id: "skip", label: "Skip", quantity: 0, targetPrice: target };
  }

  if (recommendation === "Strong Buy" || score >= 88) {
    return { id: "buy-2", label: "Buy ×2 flywheel", quantity: 2, targetPrice: target };
  }

  if (recommendation === "Buy" || score >= 72) {
    return { id: "buy-1", label: "Buy ×1", quantity: 1, targetPrice: target };
  }

  return {
    id: "below",
    label: `Only below ${formatCollectiblePrice(target)}`,
    quantity: 1,
    targetPrice: target,
  };
}

export function buildNetExitChannels(currentValue) {
  const value = numberOrZero(currentValue);
  return CHANNELS.map((channel) => ({
    ...channel,
    net: Math.round(value * (1 - channel.feeRate)),
    feePercent: Math.round(channel.feeRate * 100),
  }));
}

function factor(id, title, score, summary, detail) {
  return {
    id,
    title,
    score: Math.round(numberOrZero(score)),
    summary,
    detail,
  };
}

export function buildNineFactors(evaluation, extras = {}) {
  const verdict = extras.verdict || mapVerdictVocabulary(evaluation);
  const retirement = extras.retirement || buildRetirementSnapshot(evaluation);
  const minifigCount = evaluation?.numberOfMinifigures || extras.profile?.minifigures || "—";
  const reprintRisk = Math.max(
    0,
    100 - numberOrZero(evaluation?.supplyScarcity || numberOrZero(evaluation?.exclusiveMinifigures) * 12),
  );
  const months = retirement.monthsRemaining;

  return [
    factor(
      "time-on-market",
      "Time on market",
      evaluation?.historicalPerformance,
      extras.profile?.brickEconomyStatus || "Tracked on the secondary market",
      "How long sealed supply has been trading, and whether comps are still liquid.",
    ),
    factor(
      "theme-strength",
      "Theme strength",
      evaluation?.themeStrength,
      evaluation?.legoTheme || extras.profile?.theme || "Theme",
      "Collector demand for the theme behind this set.",
    ),
    factor(
      "time-to-retirement",
      "Time to retirement",
      evaluation?.retirementTimeline,
      months != null ? `${months} months · ${retirement.status}` : retirement.status,
      `Expected retirement ${retirement.expectedRetirement}. Probability ${retirement.retirementProbability}%.`,
    ),
    factor(
      "minifig-value",
      "Minifig value to set price",
      evaluation?.minifigureQuality,
      `${minifigCount} minifigures`,
      "Share of set value explained by minifigures and exclusive figures.",
    ),
    factor(
      "reprint-risk",
      "Reprint risk",
      reprintRisk,
      numberOrZero(evaluation?.exclusiveMinifigures) >= 2 ? "Low reprint pressure" : "Watch for a reprint",
      "Higher exclusivity and scarcity lower the chance a reprint resets the thesis.",
    ),
    factor(
      "retirement-pop",
      "Retirement pop",
      evaluation?.projectedRoi,
      formatCollectiblePrice(retirement.expectedRetirementPop),
      "Estimated sealed value after retirement, derived from the frozen current value and projected return.",
    ),
    factor(
      "how-many",
      "How many to buy",
      verdict.quantity ? 70 + verdict.quantity * 10 : 30,
      verdict.quantity ? `${verdict.quantity} unit${verdict.quantity === 1 ? "" : "s"}` : "None",
      verdict.label,
    ),
    factor(
      "when-to-sell",
      "When to sell one unit",
      evaluation?.liquidityScore,
      months != null && months > 0 ? `After retirement, about ${months} months out` : "Supply is already tight",
      "Sell one unit into the retirement window and keep a second only when the flywheel verdict applies.",
    ),
    factor(
      "recycle-cash",
      "Recycle the cash",
      evaluation?.portfolioFit,
      "Redeploy proceeds into the next Buy ×1 or Buy ×2 set",
      "Exit proceeds should fund the next high-conviction set rather than sit idle.",
    ),
  ];
}

export function buildThesisChecklist(evaluation, verdict) {
  const signals = Array.isArray(evaluation?.alphaSignals) ? evaluation.alphaSignals : [];
  const fromSignals = signals.slice(0, 4).map((signal) => signal.label || signal.title || String(signal));
  const checklist = [
    verdict.label,
    evaluation?.retirementStatus ? `Retirement: ${evaluation.retirementStatus}` : null,
    numberOrZero(evaluation?.discountPercentage) > 0
      ? `${numberOrZero(evaluation.discountPercentage).toFixed(0)}% below retail`
      : "Pricing is at or above retail",
    ...fromSignals,
  ].filter(Boolean);
  return checklist.slice(0, 5);
}

export function buildDecisionSnapshot({
  evaluation,
  imageUrl = "",
  profile = null,
  analyzedAt = new Date().toISOString(),
}) {
  const frozen = JSON.parse(JSON.stringify(evaluation || {}));
  const retirement = buildRetirementSnapshot(frozen);
  const verdict = mapVerdictVocabulary(frozen);
  const currentValue = numberOrZero(frozen.currentMarketValue || frozen.price);
  const confidence = confidenceFor(frozen);
  const breakdown = buildBrickAlphaScoreBreakdown(frozen);
  const marketPricing = buildMarketPricing(frozen, profile);
  const forecasts = buildForecastCards(frozen);
  const aiSummary = buildAiInvestmentSummary(frozen, profile);

  return {
    analyzedAt,
    setNumber: setNumberOf(frozen),
    imageUrl: imageUrl || profile?.imageUrl || "",
    name: frozen.name || profile?.name || "LEGO set",
    theme: frozen.legoTheme || profile?.theme || "",
    collectibleId: frozen.id,
    currentValue,
    retailPrice: numberOrZero(frozen.retailPrice),
    score: Math.round(numberOrZero(frozen.brickAlphaScore)),
    grade: letterGradeFor(frozen.brickAlphaScore),
    investmentGrade: frozen.investmentGrade || "",
    verdict,
    confidence,
    roi: Math.round(numberOrZero(profile?.expectedRoi || frozen.projectedRoi || frozen.estimatedRoi)),
    risk: riskLabel(frozen.riskScore),
    riskScore: Math.round(numberOrZero(frozen.riskScore)),
    thesis: buildThesisChecklist(frozen, verdict),
    retirement,
    netExits: buildNetExitChannels(currentValue),
    factors: buildNineFactors(frozen, { verdict, retirement, profile }),
    breakdown,
    marketPricing,
    forecasts,
    aiSummary,
    comparables: PREMIUM_COMPARABLES,
    drivers: Array.isArray(breakdown?.displayGroups) ? breakdown.displayGroups : [],
    evaluation: frozen,
  };
}
