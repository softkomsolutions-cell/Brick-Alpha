const MS_PER_DAY = 24 * 60 * 60 * 1000;

const FALLBACK_NOTES = {
  "lego-star-wars-75252": {
    retailPrice: 17999,
    buyPrice: 22999,
    purchaseDate: "2025-09-18",
    expectedRetirementDate: "2022-12-31",
    actualRetirementDate: "2022-12-31",
    sellByTargetDate: "2027-10-31",
    storeSource: "Private collector",
    quantityOwned: 1,
    projectedFutureValue: 33500,
    riskScore: 42,
    minifigureQuality: 76,
    exclusiveMinifigures: 2,
    numberOfMinifigures: 2,
    themeStrength: 94,
    retirementTimeline: 96,
    demandForSet: 88,
    supplyScarcity: 82,
    sizeTier: "Flagship",
    displayAppeal: 91,
    partOutValue: 72,
    liquidityScore: 70,
    historicalPerformance: 86,
    portfolioFit: 78,
  },
  "lego-icons-10305": {
    retailPrice: 8299,
    buyPrice: 6999,
    purchaseDate: "2026-02-06",
    expectedRetirementDate: "2027-12-31",
    actualRetirementDate: null,
    sellByTargetDate: "2029-06-30",
    storeSource: "LEGO retail promo",
    quantityOwned: 2,
    projectedFutureValue: 12100,
    riskScore: 34,
    minifigureQuality: 92,
    exclusiveMinifigures: 18,
    numberOfMinifigures: 22,
    themeStrength: 89,
    retirementTimeline: 61,
    demandForSet: 83,
    supplyScarcity: 58,
    sizeTier: "Large display",
    displayAppeal: 95,
    partOutValue: 79,
    liquidityScore: 82,
    historicalPerformance: 77,
    portfolioFit: 86,
  },
};

function numberOrZero(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function daysBetween(start, end) {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return 0;
  }
  return Math.max(0, Math.round((endMs - startMs) / MS_PER_DAY));
}

function retirementTimelineScore(item, today = new Date()) {
  if (item.actualRetirementDate) {
    return 95;
  }

  const expectedMs = Date.parse(item.expectedRetirementDate);
  if (!Number.isFinite(expectedMs)) {
    return 50;
  }

  const monthsAway = (expectedMs - today.getTime()) / (MS_PER_DAY * 30);
  if (monthsAway < 0) {
    return 90;
  }
  if (monthsAway <= 6) {
    return 82;
  }
  if (monthsAway <= 18) {
    return 64;
  }
  return 42;
}

export function retirementOutlookFor(item, today = new Date()) {
  if (item.actualRetirementDate) {
    return {
      retirementStatus: "Retired",
      retirementProbability: 100,
      retirementConfidence: 100,
    };
  }

  const expectedMs = Date.parse(item.expectedRetirementDate);
  if (!Number.isFinite(expectedMs)) {
    return {
      retirementStatus: "Unknown",
      retirementProbability: 50,
      retirementConfidence: 35,
    };
  }

  const monthsAway = (expectedMs - today.getTime()) / (MS_PER_DAY * 30);
  if (monthsAway < 0) {
    return {
      retirementStatus: "Overdue",
      retirementProbability: clamp(72 + Math.min(18, Math.abs(monthsAway) * 3), 0, 95),
      retirementConfidence: clamp(48 + Math.min(12, Math.abs(monthsAway)), 0, 72),
    };
  }
  if (monthsAway <= 6) {
    return {
      retirementStatus: "Imminent",
      retirementProbability: clamp(82 + (6 - monthsAway) * 2.5, 0, 96),
      retirementConfidence: clamp(68 + (6 - monthsAway) * 1.5, 0, 82),
    };
  }
  if (monthsAway <= 18) {
    return {
      retirementStatus: "Approaching",
      retirementProbability: clamp(58 + (18 - monthsAway) * 1.4, 0, 82),
      retirementConfidence: clamp(56 + (18 - monthsAway) * 0.8, 0, 72),
    };
  }

  return {
    retirementStatus: "Active",
    retirementProbability: clamp(48 - Math.min(18, monthsAway - 18) * 0.6, 18, 48),
    retirementConfidence: clamp(58 - Math.min(20, monthsAway - 18) * 0.5, 32, 58),
  };
}

export const THEME_ALLOCATION_TARGETS = {
  "Star Wars": 38,
  Icons: 24,
  Ideas: 15,
  Marvel: 12,
  Other: 11,
};

export function legoThemeFor(item) {
  if (item?.legoTheme) {
    return item.legoTheme;
  }

  const id = String(item?.id || "").toLowerCase();
  const name = String(item?.name || "").toLowerCase();
  const category = String(item?.category || "").toLowerCase();
  const combined = `${id} ${name} ${category}`;

  if (combined.includes("star wars") || id.includes("star-wars")) {
    return "Star Wars";
  }
  if (category.includes("icons") || id.includes("icons")) {
    return "Icons";
  }
  if (combined.includes("ideas")) {
    return "Ideas";
  }
  if (combined.includes("marvel")) {
    return "Marvel";
  }

  return "Other";
}

export function themeAllocationFor(trades = []) {
  const collectibleTrades = trades.filter((trade) => trade?.assetClass === "collectible");
  const totalNav = collectibleTrades.reduce(
    (sum, trade) =>
      sum + numberOrZero(trade.currentPrice || trade.currentMarketValue) * numberOrZero(trade.quantity || 1),
    0,
  );
  const actualValueByTheme = Object.keys(THEME_ALLOCATION_TARGETS).reduce((accumulator, theme) => {
    accumulator[theme] = 0;
    return accumulator;
  }, {});

  collectibleTrades.forEach((trade) => {
    const theme = legoThemeFor(trade);
    const nav = numberOrZero(trade.currentPrice || trade.currentMarketValue) * numberOrZero(trade.quantity || 1);
    actualValueByTheme[theme] = numberOrZero(actualValueByTheme[theme]) + nav;
  });

  const actual = Object.keys(THEME_ALLOCATION_TARGETS).reduce((accumulator, theme) => {
    accumulator[theme] = totalNav ? (numberOrZero(actualValueByTheme[theme]) / totalNav) * 100 : 0;
    return accumulator;
  }, {});

  const breakdown = Object.entries(THEME_ALLOCATION_TARGETS).map(([theme, target]) => {
    const actualPercent = numberOrZero(actual[theme]);
    return {
      theme,
      target,
      actual: actualPercent,
      drift: actualPercent - target,
      value: numberOrZero(actualValueByTheme[theme]),
    };
  });

  return {
    targets: THEME_ALLOCATION_TARGETS,
    actual,
    breakdown,
    totalNav,
  };
}

export function portfolioFitFor(item, trades = []) {
  const theme = legoThemeFor(item);
  const target = numberOrZero(THEME_ALLOCATION_TARGETS[theme] ?? THEME_ALLOCATION_TARGETS.Other);
  const allocation = themeAllocationFor(trades);
  const actual = numberOrZero(allocation.actual[theme]);
  const drift = target - actual;

  if (!trades.length) {
    return clamp(52 + target * 0.55, 0, 100);
  }
  if (drift >= 12) {
    return clamp(84 + Math.min(10, drift - 12), 0, 96);
  }
  if (drift >= 4) {
    return clamp(72 + drift, 0, 90);
  }
  if (drift >= -4) {
    return 74;
  }
  if (drift >= -12) {
    return clamp(64 + drift, 0, 78);
  }
  return clamp(48 + drift, 0, 62);
}

export function investmentGradeFor(score) {
  const numeric = numberOrZero(score);
  if (numeric >= 90) {
    return "Elite";
  }
  if (numeric >= 80) {
    return "Investment Grade";
  }
  if (numeric >= 70) {
    return "Speculative";
  }
  return "Avoid";
}

export const BRICK_ALPHA_SIGNALS = [
  "High Conviction",
  "Retiring Soon",
  "Deep Value",
  "Minifigure Alpha",
];

export function alphaSignalsFor(item) {
  const signals = [];
  const score = numberOrZero(item.brickAlphaScore);
  const risk = numberOrZero(item.riskScore);
  const discount = numberOrZero(item.discountPercentage);
  const minifigureQuality = numberOrZero(item.minifigureQuality);
  const exclusiveMinifigures = numberOrZero(item.exclusiveMinifigures);

  if (
    score >= 80 &&
    risk <= 50 &&
    (item.recommendation === "Strong Buy" || item.recommendation === "Buy")
  ) {
    signals.push("High Conviction");
  }

  if (
    !item.actualRetirementDate &&
    (item.retirementStatus === "Imminent" ||
      item.retirementStatus === "Overdue" ||
      numberOrZero(item.retirementProbability) >= 78)
  ) {
    signals.push("Retiring Soon");
  }

  if (discount >= 12) {
    signals.push("Deep Value");
  }

  if (
    minifigureQuality >= 82 ||
    (minifigureQuality >= 74 && exclusiveMinifigures >= 2)
  ) {
    signals.push("Minifigure Alpha");
  }

  return signals;
}

export function alphaSignalTone(signal) {
  if (signal === "High Conviction" || signal === "Deep Value") {
    return "buy";
  }
  return "hold";
}

function recommendationFor(item) {
  const score = numberOrZero(item.brickAlphaScore);
  const discount = numberOrZero(item.discountPercentage);
  const risk = numberOrZero(item.riskScore);
  const holdingDays = numberOrZero(item.holdingPeriodDays);
  const demand = numberOrZero(item.demandForSet);
  const scarcity = numberOrZero(item.supplyScarcity);
  const roi = numberOrZero(item.estimatedRoi);
  const sellByDays = daysBetween(new Date().toISOString(), item.sellByTargetDate);
  const retired = Boolean(item.actualRetirementDate);

  if (score >= 84 && discount >= 15 && risk <= 45 && demand >= 75) {
    return "Strong Buy";
  }
  if (score >= 72 && discount >= 8 && risk <= 58 && scarcity >= 55) {
    return "Buy";
  }
  if (retired && (roi >= 35 || (sellByDays <= 180 && holdingDays > 540))) {
    return "Sell";
  }
  if (score >= 64 && risk <= 65) {
    return "Hold";
  }
  if (score >= 55 || discount >= 10) {
    return "Watch";
  }
  return "Avoid";
}

function investmentThesisFor(item) {
  const retiredText =
    item.retirementStatus === "Retired"
      ? "retired supply is already constrained"
      : item.retirementStatus === "Imminent" || item.retirementStatus === "Overdue"
        ? "retirement is near-term, so supply pressure can build quickly"
        : "the retirement window can still create an entry opportunity";
  const discountText =
    item.discountPercentage > 0
      ? `${item.discountPercentage.toFixed(1)}% discount to retail`
      : "entry is above retail, so upside depends on scarcity";

  return {
    attractive: `${item.name} has a ${item.brickAlphaScore}/100 Brick Alpha Score, ${discountText}, and ${retiredText}.`,
    upsideDrivers: [
      `${item.themeStrength}/100 theme strength`,
      `${item.demandForSet}/100 demand score`,
      `${item.supplyScarcity}/100 supply and scarcity score`,
      `${item.displayAppeal}/100 display appeal`,
    ],
    risks: [
      `${item.riskScore}/100 risk score`,
      `${item.liquidity} liquidity`,
      "storage condition, fees, and exit timing can reduce realized ROI",
    ],
    suggestedAction: item.recommendation,
    exitStrategy: `Target exit by ${item.sellByTargetDate || "the next repricing window"} or sooner if realized ROI clears ${Math.max(25, Math.round(item.estimatedRoi * 0.8))}%.`,
  };
}

export function enrichBrickAlphaCollectible(item, today = new Date()) {
  const notes = FALLBACK_NOTES[item.id] || {};
  const retailPrice = numberOrZero(item.retailPrice ?? notes.retailPrice ?? item.price);
  const buyPrice = numberOrZero(item.buyPrice ?? notes.buyPrice ?? item.price);
  const currentMarketValue = numberOrZero(item.currentMarketValue ?? item.price);
  const projectedFutureValue = numberOrZero(
    item.projectedFutureValue ?? notes.projectedFutureValue ?? currentMarketValue * 1.22,
  );
  const quantityOwned = Math.max(1, numberOrZero(item.quantityOwned ?? notes.quantityOwned ?? 1));
  const discountPercentage = retailPrice
    ? clamp(((retailPrice - buyPrice) / retailPrice) * 100, -100, 100)
    : 0;
  const marginOfSafety = Math.max(0, discountPercentage);
  const estimatedRoi = buyPrice ? ((currentMarketValue - buyPrice) / buyPrice) * 100 : 0;
  const projectedRoi = buyPrice ? ((projectedFutureValue - buyPrice) / buyPrice) * 100 : 0;
  const purchaseDate = item.purchaseDate || notes.purchaseDate || "2026-01-15";
  const holdingPeriodDays = daysBetween(purchaseDate, today.toISOString());
  const holdingPeriodMonths = Math.round(holdingPeriodDays / 30);
  const retirementTimeline = numberOrZero(
    item.retirementTimeline ?? notes.retirementTimeline ?? retirementTimelineScore({ ...notes, ...item }, today),
  );
  const expectedRetirementDate = item.expectedRetirementDate || notes.expectedRetirementDate || "2027-12-31";
  const actualRetirementDate = item.actualRetirementDate || notes.actualRetirementDate || null;
  const retirementOutlook = retirementOutlookFor(
    {
      ...notes,
      ...item,
      expectedRetirementDate,
      actualRetirementDate,
    },
    today,
  );
  const expectedRetirementMs = Date.parse(expectedRetirementDate);
  const monthsUntilRetirement = actualRetirementDate
    ? -1
    : Number.isFinite(expectedRetirementMs)
      ? (expectedRetirementMs - today.getTime()) / (MS_PER_DAY * 30)
      : null;
  const demandForSet = numberOrZero(item.demandForSet ?? notes.demandForSet ?? 62);
  const supplyScarcity = numberOrZero(item.supplyScarcity ?? notes.supplyScarcity ?? 55);
  const liquidityScore = numberOrZero(
    item.liquidityScore ??
      notes.liquidityScore ??
      (item.liquidity === "High" ? 82 : item.liquidity === "Medium" ? 62 : 38),
  );
  const riskScore = numberOrZero(item.riskScore ?? notes.riskScore ?? 50);
  const legoTheme = legoThemeFor({ ...notes, ...item });
  const portfolioFit = numberOrZero(
    item.portfolioFit ?? notes.portfolioFit ?? clamp(52 + numberOrZero(THEME_ALLOCATION_TARGETS[legoTheme]) * 0.55, 0, 100),
  );
  const brickAlphaScore = Math.round(
    0.1 * numberOrZero(item.minifigureQuality ?? notes.minifigureQuality ?? 58) +
      0.08 * clamp(numberOrZero(item.exclusiveMinifigures ?? notes.exclusiveMinifigures ?? 0) * 8, 0, 100) +
      0.06 * clamp(numberOrZero(item.numberOfMinifigures ?? notes.numberOfMinifigures ?? 0) * 4, 0, 100) +
      0.12 * numberOrZero(item.themeStrength ?? notes.themeStrength ?? 65) +
      0.12 * retirementTimeline +
      0.1 * clamp(50 + discountPercentage, 0, 100) +
      0.12 * demandForSet +
      0.1 * supplyScarcity +
      0.08 * numberOrZero(item.displayAppeal ?? notes.displayAppeal ?? 62) +
      0.06 * numberOrZero(item.partOutValue ?? notes.partOutValue ?? 55) +
      0.08 * liquidityScore +
      0.05 * numberOrZero(item.historicalPerformance ?? notes.historicalPerformance ?? 58) +
      0.03 * portfolioFit,
  );

  const enriched = {
    ...item,
    retailPrice,
    buyPrice,
    discountPercentage,
    marginOfSafety,
    purchaseDate,
    expectedRetirementDate,
    actualRetirementDate,
    ...retirementOutlook,
    monthsUntilRetirement,
    holdingPeriodDays,
    holdingPeriodMonths,
    holdingPeriod: `${holdingPeriodMonths} months`,
    sellByTargetDate: item.sellByTargetDate || notes.sellByTargetDate || "2028-12-31",
    storeSource: item.storeSource || notes.storeSource || item.venue || "Tracked source",
    quantityOwned,
    currentMarketValue,
    projectedFutureValue,
    estimatedRoi,
    projectedRoi,
    realizedRoi: numberOrZero(item.realizedRoi ?? 0),
    riskScore,
    legoTheme,
    themeAllocationTarget: numberOrZero(THEME_ALLOCATION_TARGETS[legoTheme] ?? THEME_ALLOCATION_TARGETS.Other),
    minifigureQuality: numberOrZero(item.minifigureQuality ?? notes.minifigureQuality ?? 58),
    exclusiveMinifigures: numberOrZero(item.exclusiveMinifigures ?? notes.exclusiveMinifigures ?? 0),
    numberOfMinifigures: numberOrZero(item.numberOfMinifigures ?? notes.numberOfMinifigures ?? 0),
    themeStrength: numberOrZero(item.themeStrength ?? notes.themeStrength ?? 65),
    retirementTimeline,
    demandForSet,
    supplyScarcity,
    sizeTier: item.sizeTier || notes.sizeTier || "Standard",
    displayAppeal: numberOrZero(item.displayAppeal ?? notes.displayAppeal ?? 62),
    partOutValue: numberOrZero(item.partOutValue ?? notes.partOutValue ?? 55),
    liquidityScore,
    historicalPerformance: numberOrZero(item.historicalPerformance ?? notes.historicalPerformance ?? 58),
    portfolioFit,
    brickAlphaScore,
    investmentGrade: investmentGradeFor(brickAlphaScore),
  };
  const withRecommendation = {
    ...enriched,
    recommendation: recommendationFor(enriched),
  };

  return {
    ...withRecommendation,
    alphaSignals: alphaSignalsFor(withRecommendation),
    investmentThesis: investmentThesisFor(withRecommendation),
  };
}

export function enrichBrickAlphaTrade(trade, collectibleItems = [], allTrades = []) {
  if (trade?.assetClass !== "collectible") {
    return trade;
  }

  const collectible = collectibleItems.find((item) => item.id === trade.collectibleId);
  const base = collectible || {};
  const buyPrice = numberOrZero(trade.entryPrice ?? base.buyPrice);
  const currentMarketValue = numberOrZero(trade.currentPrice ?? base.currentMarketValue);
  const quantityOwned = Math.max(1, numberOrZero(trade.quantity ?? base.quantityOwned ?? 1));
  const estimatedRoi = buyPrice ? ((currentMarketValue - buyPrice) / buyPrice) * 100 : numberOrZero(trade.pnl);
  const holdingPeriodDays = daysBetween(trade.createdAt || base.purchaseDate, new Date().toISOString());
  const enrichedLikeItem = enrichBrickAlphaCollectible({
    ...base,
    id: base.id || trade.collectibleId || trade.id,
    name: trade.label || base.name || trade.ticker,
    brand: base.brand || "LEGO",
    category: trade.category || base.category || "LEGO Investment",
    price: currentMarketValue,
    buyPrice,
    quantityOwned,
    purchaseDate: trade.createdAt || base.purchaseDate,
    currentMarketValue,
    estimatedRoi,
    realizedRoi: trade.status === "closed" ? numberOrZero(trade.pnl) : 0,
    liquidity: base.liquidity || "Medium",
    venue: trade.venue || base.venue || "Brick Alpha Paper",
    thesis: trade.note || base.thesis,
  });
  const decisionTrades = (allTrades || []).filter(
    (candidate) => candidate?.collectionBook !== "full" && candidate?.curated !== false,
  );
  const portfolioFit = portfolioFitFor(enrichedLikeItem, decisionTrades);
  const brickAlphaScore = Math.round(
    enrichedLikeItem.brickAlphaScore -
      0.03 * numberOrZero(enrichedLikeItem.portfolioFit) +
      0.03 * portfolioFit,
  );

  return {
    ...trade,
    ...enrichedLikeItem,
    portfolioFit,
    brickAlphaScore,
    investmentGrade: investmentGradeFor(brickAlphaScore),
    id: trade.id,
    assetClass: trade.assetClass,
    status: trade.status,
    side: trade.side,
    ticker: trade.ticker,
    label: trade.label,
    quantity: trade.quantity,
    currentValue: currentMarketValue * quantityOwned,
    pnl: numberOrZero(trade.pnl ?? estimatedRoi),
    holdingPeriodDays,
    holdingPeriod: `${Math.round(holdingPeriodDays / 30)} months`,
  };
}

export function letterGradeFor(score) {
  const numeric = numberOrZero(score);
  if (numeric >= 90) {
    return "A+";
  }
  if (numeric >= 80) {
    return "A";
  }
  if (numeric >= 70) {
    return "B";
  }
  return "C";
}

export function availabilityStatusFor(item) {
  if (item.actualRetirementDate || item.retirementStatus === "Retired") {
    return "Retired";
  }
  if (
    item.retirementStatus === "Imminent" ||
    item.retirementStatus === "Approaching" ||
    item.retirementStatus === "Overdue"
  ) {
    return "Retiring Soon";
  }
  return "Available";
}

export function confidenceFor(item) {
  return Math.round(
    numberOrZero(item.retirementConfidence) * 0.35 +
      numberOrZero(item.brickAlphaScore) * 0.45 +
      numberOrZero(item.liquidityScore) * 0.2,
  );
}

export function buildBrickAlphaScoreBreakdown(item) {
  const discountScore = clamp(50 + numberOrZero(item.discountPercentage), 0, 100);
  const exclusivityScore = clamp(numberOrZero(item.exclusiveMinifigures) * 8, 0, 100);
  const minifigureComposite = Math.round(
    numberOrZero(item.minifigureQuality) * 0.62 +
      exclusivityScore * 0.28 +
      clamp(numberOrZero(item.numberOfMinifigures) * 4, 0, 100) * 0.1,
  );
  const everythingElseScore = Math.round(
    (numberOrZero(item.demandForSet) +
      numberOrZero(item.supplyScarcity) +
      numberOrZero(item.displayAppeal) +
      numberOrZero(item.partOutValue) +
      numberOrZero(item.liquidityScore) +
      numberOrZero(item.historicalPerformance) +
      numberOrZero(item.portfolioFit)) /
      7,
  );

  const displayGroups = [
    {
      key: "minifigure",
      label: "Minifigure Quality",
      weight: 30,
      score: minifigureComposite,
      explanation:
        "Combines minifigure quality, exclusivity count, and total minifigure roster depth.",
    },
    {
      key: "retirement",
      label: "Retirement Timeline",
      weight: 20,
      score: numberOrZero(item.retirementTimeline),
      explanation: "How close the set is to retirement and post-retirement scarcity dynamics.",
    },
    {
      key: "discount",
      label: "Discount",
      weight: 20,
      score: discountScore,
      explanation: "Entry discount to retail — deeper discounts improve margin of safety.",
    },
    {
      key: "theme",
      label: "Theme Strength",
      weight: 10,
      score: numberOrZero(item.themeStrength),
      explanation: "Long-term collector demand for the underlying LEGO theme.",
    },
    {
      key: "exclusivity",
      label: "Exclusivity",
      weight: 10,
      score: exclusivityScore,
      explanation: "Exclusive minifigures and limited elements that cannot be replaced easily.",
    },
    {
      key: "other",
      label: "Everything Else",
      weight: 10,
      score: everythingElseScore,
      explanation:
        "Demand, supply risk, display appeal, part-out value, liquidity, history, and portfolio fit.",
    },
  ].map((group) => ({
    ...group,
    contribution: Math.round((group.weight / 100) * group.score),
  }));

  const factors = [
    {
      key: "retirementTimeline",
      label: "Retirement Timeline",
      weight: 12,
      score: numberOrZero(item.retirementTimeline),
      explanation: "Proximity to retirement and post-retirement supply tightening.",
    },
    {
      key: "minifigureQuality",
      label: "Minifigure Quality",
      weight: 10,
      score: numberOrZero(item.minifigureQuality),
      explanation: "Collector demand for the included minifigure roster.",
    },
    {
      key: "discount",
      label: "Discount",
      weight: 10,
      score: discountScore,
      explanation: "Discount to MSRP improves entry and margin of safety.",
    },
    {
      key: "themeStrength",
      label: "Theme Strength",
      weight: 12,
      score: numberOrZero(item.themeStrength),
      explanation: "Theme-level collector loyalty and resale depth.",
    },
    {
      key: "exclusivity",
      label: "Exclusivity",
      weight: 8,
      score: exclusivityScore,
      explanation: "Exclusive minifigures that drive aftermarket premiums.",
    },
    {
      key: "supplyRisk",
      label: "Supply Risk",
      weight: 10,
      score: numberOrZero(item.supplyScarcity),
      explanation: "Scarcity and sealed supply — higher is better for investors.",
    },
    {
      key: "historicalPerformance",
      label: "Historical Performance",
      weight: 5,
      score: numberOrZero(item.historicalPerformance),
      explanation: "How similar sets in this theme have performed after retirement.",
    },
    {
      key: "displayAppeal",
      label: "Display Appeal",
      weight: 8,
      score: numberOrZero(item.displayAppeal),
      explanation: "Shelf presence and display-driven collector demand.",
    },
    {
      key: "partOutValue",
      label: "Part Out Value",
      weight: 6,
      score: numberOrZero(item.partOutValue),
      explanation: "Floor value if the set is parted out for bricks and figures.",
    },
    {
      key: "liquidity",
      label: "Liquidity",
      weight: 8,
      score: numberOrZero(item.liquidityScore),
      explanation: "Ease of buying and selling on secondary markets.",
    },
  ].map((factor) => ({
    ...factor,
    contribution: Math.round((factor.weight / 100) * factor.score),
  }));

  return { displayGroups, factors };
}

export function buildPriceForecast(item, years) {
  const current = numberOrZero(item.currentMarketValue);
  const projected = numberOrZero(item.projectedFutureValue);
  const horizonMonths = years * 12;
  const annualGrowth =
    current > 0 && projected > current
      ? Math.pow(projected / current, 12 / Math.max(horizonMonths, 12)) - 1
      : numberOrZero(item.projectedRoi) / 100 / years;
  const cagr = annualGrowth * 100;
  const volatility = numberOrZero(item.riskScore) / 100;
  const expected = current * Math.pow(1 + annualGrowth, years);
  const best = expected * (1 + 0.18 * volatility + 0.08);
  const worst = expected * (1 - 0.22 * volatility - 0.06);

  return {
    years,
    cagr,
    expected,
    best,
    worst,
    confidence: confidenceFor(item),
  };
}

export function buildAiCommentary(item) {
  const discount = numberOrZero(item.discountPercentage);
  const supplyNote =
    discount >= 12
      ? "supply remains elevated due to heavy discounting"
      : item.supplyScarcity >= 70
        ? "supply is tightening as sealed inventory clears"
        : "supply is balanced but not yet scarce";
  const minifigNote =
    item.minifigureQuality >= 80
      ? "excellent minifigure quality"
      : item.minifigureQuality >= 65
        ? "solid minifigure appeal"
        : "modest minifigure contribution";
  const retirementNote =
    item.retirementStatus === "Retired"
      ? "the set is already retired, so repricing depends on liquidity events"
      : item.retirementStatus === "Imminent" || item.retirementStatus === "Overdue"
        ? "retirement timing is favourable with supply pressure building"
        : "retirement is still ahead, allowing staged accumulation";

  const action =
    item.recommendation === "Strong Buy" || item.recommendation === "Buy"
      ? discount >= 10
        ? "accumulating gradually during discount periods"
        : "building a position while conviction remains high"
      : item.recommendation === "Sell"
        ? "trimming exposure as exit targets approach"
        : item.recommendation === "Hold"
          ? "holding current exposure while monitoring retirement signals"
          : "waiting for a better entry or clearer retirement catalyst";

  return `Although this set has ${minifigNote} and ${retirementNote}, ${supplyNote}. Brick Alpha recommends ${action}.`;
}

export function summarizeBrickAlphaPortfolio(trades) {
  const collectibleTrades = trades.filter((trade) => trade.assetClass === "collectible");
  const costBasis = collectibleTrades.reduce(
    (sum, trade) => sum + numberOrZero(trade.entryPrice || trade.buyPrice) * numberOrZero(trade.quantity || 1),
    0,
  );
  const netAssetValue = collectibleTrades.reduce(
    (sum, trade) => sum + numberOrZero(trade.currentPrice || trade.currentMarketValue) * numberOrZero(trade.quantity || 1),
    0,
  );
  const realizedGain = collectibleTrades
    .filter((trade) => trade.status !== "open")
    .reduce((sum, trade) => sum + numberOrZero(trade.pnlAmount), 0);
  const averageScore = collectibleTrades.length
    ? collectibleTrades.reduce((sum, trade) => sum + numberOrZero(trade.brickAlphaScore), 0) /
      collectibleTrades.length
    : 0;
  const averageRisk = collectibleTrades.length
    ? collectibleTrades.reduce((sum, trade) => sum + numberOrZero(trade.riskScore), 0) / collectibleTrades.length
    : 0;
  const categoryCount = new Set(collectibleTrades.map((trade) => trade.category).filter(Boolean)).size;
  const diversificationScore = clamp(categoryCount * 22 + collectibleTrades.length * 4, 0, 100);
  const confidenceScore = clamp(averageScore * 0.65 + diversificationScore * 0.2 + (100 - averageRisk) * 0.15);
  const themeAllocation = themeAllocationFor(collectibleTrades);

  return {
    netAssetValue,
    costBasis,
    unrealizedGain: netAssetValue - costBasis,
    realizedGain,
    averageBrickAlphaScore: averageScore,
    collectionGrade: investmentGradeFor(averageScore),
    riskLevel: averageRisk <= 40 ? "Low" : averageRisk <= 62 ? "Balanced" : "High",
    diversificationScore,
    confidenceScore,
    themeAllocation,
  };
}
