/**
 * Demo data provider for Scan & Evaluate workflow.
 * Keeps demo content out of UI components — swap for API calls when backend is ready.
 */

import { formatCollectiblePrice } from "./appUtils";

export const PROCESSING_STEPS = [
  { id: "uploading", label: "Uploading..." },
  { id: "analysing", label: "AI analysing image..." },
  { id: "identifying", label: "Identifying LEGO set..." },
  { id: "market", label: "Fetching market data..." },
  { id: "scoring", label: "Calculating Brick Alpha score..." },
];

export const DEMO_SET_NUMBER_MAP = {
  "75252": "lego-star-wars-75252",
  "75313": "lego-star-wars-75313",
  "76269": "lego-marvel-76269",
  "76218": "lego-marvel-76218",
  "75367": "lego-star-wars-75367",
  "71043": "lego-harry-potter-71043",
  "10305": "lego-icons-10305",
  "10316": "lego-icons-10316",
  "76261": "lego-marvel-76261",
  "76178": "lego-marvel-76178",
  "75290": "lego-star-wars-75290",
  "75192": "lego-star-wars-75192",
};

export const DEMO_SET_PROFILES = {
  "75252": {
    name: "Imperial Star Destroyer",
    theme: "Star Wars",
    pieces: 4784,
    minifigures: 2,
    retailPrice: 32999,
    imageUrl:
      "https://images.brickset.com/sets/images/75252-1.jpg",
    brickEconomyStatus: "Tracked",
    investmentHorizon: "3–5 years",
    expectedRoi: 36,
  },
  "75313": {
    name: "AT-AT",
    theme: "Star Wars",
    pieces: 6785,
    minifigures: 9,
    retailPrice: 34999,
    imageUrl: "https://images.brickset.com/sets/images/75313-1.jpg",
    brickEconomyStatus: "Tracked",
    investmentHorizon: "3–5 years",
    expectedRoi: 32,
  },
  "76269": {
    name: "Avengers Tower",
    theme: "Marvel Super Heroes",
    pieces: 5201,
    minifigures: 14,
    retailPrice: 24999,
    imageUrl: "https://images.brickset.com/sets/images/76269-1.jpg",
    brickEconomyStatus: "Tracked",
    investmentHorizon: "2–4 years",
    expectedRoi: 28,
  },
  "76218": {
    name: "Sanctum Sanctorum",
    theme: "Marvel Super Heroes",
    pieces: 2708,
    minifigures: 9,
    retailPrice: 8999,
    imageUrl: "https://images.brickset.com/sets/images/76218-1.jpg",
    brickEconomyStatus: "Tracked",
    investmentHorizon: "2–3 years",
    expectedRoi: 24,
  },
  "75367": {
    name: "Venator-Class Republic Attack Cruiser",
    theme: "Star Wars",
    pieces: 5374,
    minifigures: 2,
    retailPrice: 27999,
    imageUrl: "https://images.brickset.com/sets/images/75367-1.jpg",
    brickEconomyStatus: "Tracked",
    investmentHorizon: "4–6 years",
    expectedRoi: 40,
  },
  "71043": {
    name: "Hogwarts Castle",
    theme: "Harry Potter",
    pieces: 6020,
    minifigures: 4,
    retailPrice: 19999,
    imageUrl: "https://images.brickset.com/sets/images/71043-1.jpg",
    brickEconomyStatus: "Retired · Premium",
    investmentHorizon: "Hold",
    expectedRoi: 18,
  },
  "10305": {
    name: "Lion Knights' Castle",
    theme: "Icons",
    pieces: 4514,
    minifigures: 22,
    retailPrice: 17999,
    imageUrl: "https://images.brickset.com/sets/images/10305-1.jpg",
    brickEconomyStatus: "Tracked",
    investmentHorizon: "3–5 years",
    expectedRoi: 34,
  },
  "10316": {
    name: "Rivendell",
    theme: "Icons",
    pieces: 6167,
    minifigures: 15,
    retailPrice: 19999,
    imageUrl: "https://images.brickset.com/sets/images/10316-1.jpg",
    brickEconomyStatus: "Tracked",
    investmentHorizon: "3–5 years",
    expectedRoi: 38,
  },
  "76261": {
    name: "Spider-Man Final Battle",
    theme: "Marvel Super Heroes",
    pieces: 395,
    minifigures: 4,
    retailPrice: 3499,
    imageUrl: "https://images.brickset.com/sets/images/76261-1.jpg",
    brickEconomyStatus: "Tracked",
    investmentHorizon: "1–2 years",
    expectedRoi: 15,
  },
};

export const PREMIUM_COMPARABLES = [
  {
    setNumber: "76178",
    name: "Daily Bugle",
    score: 86,
    roi: 28,
    growth: "+22%",
    recommendation: "Strong Buy",
    theme: "Marvel",
  },
  {
    setNumber: "10316",
    name: "Rivendell",
    score: 91,
    roi: 38,
    growth: "+24%",
    recommendation: "Strong Buy",
    theme: "Icons",
  },
  {
    setNumber: "75290",
    name: "Mos Eisley Cantina",
    score: 84,
    roi: 20,
    growth: "+18%",
    recommendation: "Buy",
    theme: "Star Wars",
  },
  {
    setNumber: "75192",
    name: "UCS Millennium Falcon",
    score: 93,
    roi: 48,
    growth: "+35%",
    recommendation: "Hold",
    theme: "Star Wars",
  },
];

export const COPILOT_DEMO_RESPONSES = {
  "should i buy three of these?":
    "Three sealed copies would diversify your exit strategy — one for long-term hold, one for retirement pop, and one for liquidity. At current pricing with a Strong Buy rating, accumulating 2–3 units before retirement is aligned with Brick Alpha's model for high-conviction UCS sets.",
  default:
    "Based on the Brick Alpha score and retirement window, this set fits a core accumulation strategy. Monitor discount periods and consider staged entries rather than a single lump-sum purchase.",
};

const SEARCH_ALIASES = {
  destroyer: "75252",
  "star destroyer": "75252",
  atat: "75313",
  "at-at": "75313",
  avengers: "76269",
  tower: "76269",
  sanctum: "76218",
  venator: "75367",
  hogwarts: "71043",
  castle: "10305",
  rivendell: "10316",
  spiderman: "76261",
  "spider-man": "76261",
  bugle: "76178",
  falcon: "75192",
  cantina: "75290",
};

function normalizeSetNumber(value) {
  return String(value || "")
    .replace(/[^0-9]/g, "")
    .slice(0, 6);
}

function extractSetNumberFromText(text) {
  const match = String(text || "").match(/\b(\d{4,6})\b/);
  return match ? match[1] : "";
}

export function identifySetNumberFromFilename(filename) {
  const fromDigits = extractSetNumberFromText(filename);
  if (fromDigits && DEMO_SET_PROFILES[fromDigits]) {
    return fromDigits;
  }
  const lower = String(filename || "").toLowerCase();
  for (const [alias, setNumber] of Object.entries(SEARCH_ALIASES)) {
    if (lower.includes(alias)) {
      return setNumber;
    }
  }
  return fromDigits || "";
}

export function getDemoSetProfile(setNumber) {
  const normalized = normalizeSetNumber(setNumber);
  return DEMO_SET_PROFILES[normalized] || null;
}

export function findCatalogMatch(collectibles, setNumber, demoSeed = 0) {
  const legoItems = collectibles.filter((item) => item.brand === "LEGO");
  const pool = legoItems.length ? legoItems : collectibles;
  const normalized = normalizeSetNumber(setNumber);

  if (normalized) {
    const catalogId = DEMO_SET_NUMBER_MAP[normalized];
    if (catalogId) {
      const hinted = pool.find((item) => item.id === catalogId);
      if (hinted) {
        return hinted;
      }
    }
    const bySku = pool.find((item) => normalizeSetNumber(item.sku) === normalized);
    if (bySku) {
      return bySku;
    }
    const byId = pool.find((item) => String(item.id || "").includes(normalized));
    if (byId) {
      return byId;
    }
  }

  return pool[demoSeed % Math.max(pool.length, 1)] || null;
}

export function searchDemoSets(query, collectibles = []) {
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) {
    return [];
  }

  const legoItems = collectibles.filter((item) => item.brand === "LEGO");
  const pool = legoItems.length ? legoItems : collectibles;

  const aliasSetNumber = SEARCH_ALIASES[needle];
  const results = new Map();

  const addResult = (item, setNumber) => {
    if (!item) {
      return;
    }
    const key = item.id || setNumber;
    if (!results.has(key)) {
      results.set(key, {
        id: item.id,
        setNumber: setNumber || normalizeSetNumber(item.sku),
        name: item.name,
        theme: item.legoTheme || item.category,
        item,
      });
    }
  };

  if (aliasSetNumber) {
    addResult(findCatalogMatch(pool, aliasSetNumber), aliasSetNumber);
  }

  const digitMatch = extractSetNumberFromText(needle);
  if (digitMatch) {
    addResult(findCatalogMatch(pool, digitMatch), digitMatch);
  }

  pool.forEach((item) => {
    const setNumber = normalizeSetNumber(item.sku) || extractSetNumberFromText(item.id);
    const haystack = [item.name, item.legoTheme, item.category, setNumber, item.id]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (haystack.includes(needle)) {
      addResult(item, setNumber);
    }
  });

  Object.entries(DEMO_SET_PROFILES).forEach(([setNumber, profile]) => {
    const haystack = [profile.name, profile.theme, setNumber].join(" ").toLowerCase();
    if (haystack.includes(needle) && !results.has(setNumber)) {
      const item = findCatalogMatch(pool, setNumber);
      if (item) {
        addResult(item, setNumber);
      }
    }
  });

  return Array.from(results.values()).slice(0, 8);
}

export function buildMarketPricing(evaluation, demoProfile) {
  const current = Number(evaluation?.currentMarketValue || evaluation?.price) || 0;
  const retail = Number(evaluation?.retailPrice || demoProfile?.retailPrice) || current;
  const discount = evaluation?.discountPercentage ?? ((retail - current) / retail) * 100;
  const spread = Math.max(retail * 0.08, 1200);

  return {
    retail,
    currentValue: current,
    lowestPrice: Math.round(current - spread * 0.6),
    highestPrice: Math.round(current + spread * 0.9),
    averageMarketPrice: Math.round((current + retail) / 2),
    discountPercent: discount,
    expectedRetirementPop: Math.round(current * (1 + (demoProfile?.expectedRoi || 30) / 100)),
  };
}

function holdingPeriodMonths(evaluation) {
  const direct = Number(evaluation?.holdingPeriodMonths);
  if (Number.isFinite(direct) && direct > 0) {
    return direct;
  }
  const parsed = Number(String(evaluation?.holdingPeriod || "").replace(/[^0-9]/g, ""));
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return 36;
}

export function buildForecastCards(evaluation) {
  const current = Number(evaluation?.currentMarketValue || evaluation?.price) || 0;
  const projected = Number(evaluation?.projectedFutureValue) || current * 1.32;
  const horizons = [1, 5, 10];
  const years = Math.max(holdingPeriodMonths(evaluation) / 12, 0.5);

  return horizons.map((mapYears) => {
    const growth =
      current > 0 && projected > current && Number.isFinite(projected / current)
        ? Math.pow(projected / current, 1 / years)
        : 1.08;
    const value = Math.round(current * Math.pow(growth, mapYears));
    const roi = current > 0 ? ((value - current) / current) * 100 : 0;
    return {
      years: mapYears,
      label: mapYears === 1 ? "1 Year Forecast" : `${mapYears} Year Forecast`,
      value,
      roi,
    };
  });
}

export function buildAiInvestmentSummary(evaluation, demoProfile) {
  const name = evaluation?.name || demoProfile?.name || "this set";
  const recommendation = evaluation?.recommendation || "Buy";
  const retirement =
    evaluation?.retirementStatus === "Retired"
      ? "already retired with tightening sealed supply"
      : evaluation?.retirementStatus === "Imminent" || evaluation?.retirementStatus === "Overdue"
        ? "approaching retirement with a favourable accumulation window"
        : "a developing retirement window";

  const minifigNote =
    Number(evaluation?.exclusiveMinifigures) >= 2 || Number(demoProfile?.minifigures) >= 4
      ? "Strong exclusive minifigures."
      : "Solid minifigure roster appeal.";

  const pricingNote =
    Number(evaluation?.discountPercentage) > 8
      ? "Current pricing remains attractive."
      : "Premium pricing is justified by scarcity and theme demand.";

  const action =
    recommendation === "Strong Buy" || recommendation === "Buy" ? "BUY" : recommendation.toUpperCase();

  return {
    lead: `Brick Alpha has identified ${name} as an excellent accumulation opportunity.`,
    bullets: [
      minifigNote,
      `Retirement window ${retirement}.`,
      pricingNote,
      "Historical comparable sets have appreciated significantly after retirement.",
    ],
    action: `Recommended action: ${action}.`,
    fullText: `Brick Alpha has identified ${name} as an excellent accumulation opportunity. ${minifigNote} Retirement window ${retirement}. ${pricingNote} Historical comparable sets have appreciated significantly after retirement. Recommended action: ${action}.`,
  };
}

export function buildRetirementSnapshot(evaluation) {
  const rawMonths = Number(
    evaluation?.monthsUntilRetirement ?? evaluation?.retirementMonthsRemaining ?? 14,
  );
  const months = Number.isFinite(rawMonths) ? Math.round(rawMonths) : 14;
  return {
    expectedRetirement: evaluation?.expectedRetirementDate || evaluation?.sellByTargetDate || "Q4 2026",
    retirementProbability: Math.round(Number(evaluation?.retirementProbability) || 72),
    retirementConfidence: Math.round(Number(evaluation?.retirementConfidence) || 78),
    monthsRemaining: months,
    expectedRetirementPop: Math.round(
      (Number(evaluation?.currentMarketValue) || 0) *
        (1 + (Number(evaluation?.projectedRoi) || 28) / 100),
    ),
    status: evaluation?.retirementStatus || "Available",
  };
}

export function riskLabel(riskScore) {
  const score = Number(riskScore) || 50;
  if (score <= 38) {
    return "LOW";
  }
  if (score <= 58) {
    return "MODERATE";
  }
  return "HIGH";
}

function copilotContext(evaluation, demoProfile) {
  const current = Number(evaluation?.currentMarketValue || evaluation?.price) || 0;
  const retail = Number(evaluation?.retailPrice || demoProfile?.retailPrice) || 0;
  const basedOnCurrent = current > 0 ? current : retail;
  const expectedPop = Math.round(
    basedOnCurrent * (1 + (Number(demoProfile?.expectedRoi) || Number(evaluation?.projectedRoi) || 30) / 100),
  );

  return {
    name: evaluation?.name || demoProfile?.name || "this set",
    score: Math.round(Number(evaluation?.brickAlphaScore)),
    recommendation: evaluation?.recommendation || "Buy",
    current,
    retail,
    expectedPop,
    projectedRoi: Number(evaluation?.projectedRoi),
    estimatedRoi: Number(evaluation?.estimatedRoi),
    expectedRoi: Number(demoProfile?.expectedRoi) || Number(evaluation?.projectedRoi),
    retirementStatus: evaluation?.retirementStatus || "Available",
    expectedRetirementDate: evaluation?.expectedRetirementDate || demoProfile?.investmentHorizon || "the projected window",
    riskScore: Number(evaluation?.riskScore),
    riskLabel: riskLabel(evaluation?.riskScore),
    discount: Number(evaluation?.discountPercentage),
    horizon: evaluation?.holdingPeriod || demoProfile?.investmentHorizon || "3–5 years",
    theme: evaluation?.legoTheme || demoProfile?.theme,
  };
}

function copilotRecommendationLine(ctx) {
  const action = ctx.recommendation === "Strong Buy" ? "accumulate 2–3 units while it is still broadly available" : ctx.recommendation === "Buy" ? "start with a single unit and ladder in on dips" : `${ctx.recommendation.toLowerCase()} and avoid chasing premium retail`;
  return `The ${ctx.name} scores ${ctx.score}/100 with a ${ctx.recommendation} rating — a ${ctx.riskLabel.toLowerCase()} risk profile, so ${action}.`;
}

function copilotAnswerFor(question, ctx) {
  const normalized = String(question || "").trim().toLowerCase();
  const priceLine =
    ctx.current && ctx.retail
      ? `Retail is ${formatCollectiblePrice(ctx.retail)} against a secondary market value of ${formatCollectiblePrice(ctx.current)}${ctx.discount > 0 ? ` (${ctx.discount.toFixed(0)}% below retail).` : "."}`
      : "Current secondary pricing is tracked daily by Brick Alpha.";

  if (normalized.includes("buy") || normalized.includes("three") || normalized.includes("stock")) {
    return `${copilotRecommendationLine(ctx)} ${priceLine} A projected retirement-pop value of ${formatCollectiblePrice(ctx.expectedPop)} supports staged entries across ${ctx.horizon}.`;
  }

  if (normalized.includes("roi") || normalized.includes("return") || normalized.includes("profit")) {
    const projected = Number.isFinite(ctx.projectedRoi)
      ? `forecast return of ${ctx.projectedRoi.toFixed(0)}%`
      : Number.isFinite(ctx.expectedRoi)
        ? `expected return of ${ctx.expectedRoi.toFixed(0)}%`
        : "a strong return profile";
    return `Brick Alpha projects ${projected} on the ${ctx.name} over ${ctx.horizon}. With a score of ${ctx.score}/100 and a ${ctx.recommendation} rating, the risk-adjusted profile is favourable for a patient holder.`;
  }

  if (normalized.includes("retir")) {
    const statusLine =
      ctx.retirementStatus === "Retired"
        ? "already retired, so sealed supply is fixed and scarcity is rising"
        : `tracking toward retirement with an expected window of ${ctx.expectedRetirementDate}`;
    return `The ${ctx.name} is ${statusLine}. A realistic retirement-pop value is ${formatCollectiblePrice(ctx.expectedPop)}, which is what a ${ctx.recommendation} rating is priced around.`;
  }

  if (normalized.includes("score") || normalized.includes("grade") || normalized.includes("good")) {
    return `The ${ctx.name} scores ${ctx.score}/100 on the Brick Alpha model — a ${ctx.recommendation}. ${ctx.theme ? `Theme exposure (${ctx.theme}) ` : ""}and retirement timing are the strongest contributors right now. ${priceLine}`;
  }

  if (normalized.includes("risk") || normalized.includes("safe")) {
    return `Risk for the ${ctx.name} is ${ctx.riskLabel} (${ctx.riskScore}/100). ${ctx.riskLabel === "LOW" ? "That supports a scaled entry now." : ctx.riskLabel === "HIGH" ? "Wait for a discount or a lower entry before sizing in." : "Pyramiding on dips keeps the profile balanced."} ${priceLine}`;
  }

  if (normalized.includes("price") || normalized.includes("cost") || normalized.includes("value") || normalized.includes("worth")) {
    return priceLine;
  }

  if (normalized.includes("sell") || normalized.includes("exit") || normalized.includes("when")) {
    return `Exit timing matters more than entry. For the ${ctx.name}, plan an exit once realised ROI clears the model threshold or supply tightens after retirement — typically within ${ctx.horizon}.`;
  }

  if (normalized.includes("hold") || normalized.includes("keep")) {
    return `Holding the ${ctx.name} through its retirement window is consistent with its ${ctx.recommendation} rating and a projected-pop value of ${formatCollectiblePrice(ctx.expectedPop)}. Review at each quarterly repricing.`;
  }

  return `${copilotRecommendationLine(ctx)} ${priceLine}`;
}

export function getCopilotResponse(question, context = {}) {
  const ctx = copilotContext(context.evaluation, context.demoProfile);
  const normalized = String(question || "").trim().toLowerCase();
  if (!normalized) {
    return COPILOT_DEMO_RESPONSES.default;
  }
  for (const key of Object.keys(COPILOT_DEMO_RESPONSES)) {
    if (key !== "default" && normalized.includes(key.replace(/\?/g, ""))) {
      return COPILOT_DEMO_RESPONSES[key];
    }
  }
  return copilotAnswerFor(normalized, ctx);
}

export function demoSeedFromFile(file) {
  if (!file?.name) {
    return 0;
  }
  return file.name.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

export async function runProcessingPipeline(onStepChange, totalMs = 4500) {
  const stepMs = totalMs / PROCESSING_STEPS.length;
  for (let index = 0; index < PROCESSING_STEPS.length; index += 1) {
    onStepChange(PROCESSING_STEPS[index].id, index);
    await new Promise((resolve) => window.setTimeout(resolve, stepMs));
  }
}
