import {
  buildPriceForecast,
  enrichBrickAlphaCollectible,
  legoThemeFor,
} from "./brickAlphaModel";

function numberOrZero(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * DEMO DATA — Retirement Intelligence fallback catalog.
 * Used when BrickEconomy live retirement timelines are unavailable.
 * Replace RETIREMENT_DEMO_CATALOG with API payloads from BrickEconomy integration.
 */
export const RETIREMENT_DEMO_SOURCE = "demo";

export const RETIREMENT_HEATMAP_BUCKETS = [
  { id: "0-3", label: "0–3 mo", minMonths: 0, maxMonths: 3 },
  { id: "3-6", label: "3–6 mo", minMonths: 3, maxMonths: 6 },
  { id: "6-12", label: "6–12 mo", minMonths: 6, maxMonths: 12 },
  { id: "12+", label: "12+ mo", minMonths: 12, maxMonths: Infinity },
];

export const RETIREMENT_DEMO_CATALOG = [
  {
    id: "lego-icons-10305",
    brand: "LEGO",
    name: "Lion Knights' Castle",
    category: "LEGO Icons",
    sku: "10305",
    price: 8299,
    liquidity: "High",
    expectedRetirementDate: null,
    themeAccent: "icons",
  },
  {
    id: "lego-ideas-21348",
    brand: "LEGO",
    name: "Dungeons & Dragons: Red Dragon's Tale",
    category: "LEGO Ideas",
    sku: "21348",
    price: 5999,
    liquidity: "High",
    expectedRetirementDate: null,
    retailPrice: 5999,
    buyPrice: 5499,
    themeStrength: 88,
    retirementTimeline: 78,
    demandForSet: 86,
    supplyScarcity: 64,
    minifigureQuality: 84,
    exclusiveMinifigures: 8,
    numberOfMinifigures: 12,
    displayAppeal: 92,
    riskScore: 32,
    themeAccent: "ideas",
  },
  {
    id: "lego-star-wars-75355",
    brand: "LEGO",
    name: "X-Wing Starfighter",
    category: "LEGO Star Wars",
    sku: "75355",
    price: 1399,
    liquidity: "High",
    expectedRetirementDate: null,
    retailPrice: 1399,
    buyPrice: 1199,
    themeStrength: 91,
    retirementTimeline: 85,
    demandForSet: 90,
    supplyScarcity: 72,
    minifigureQuality: 78,
    exclusiveMinifigures: 2,
    numberOfMinifigures: 4,
    displayAppeal: 82,
    riskScore: 28,
    themeAccent: "star-wars",
  },
  {
    id: "lego-marvel-76269",
    brand: "LEGO",
    name: "Avengers Tower",
    category: "LEGO Marvel",
    sku: "76269",
    price: 8999,
    liquidity: "Medium",
    expectedRetirementDate: null,
    retailPrice: 8999,
    buyPrice: 7999,
    themeStrength: 86,
    retirementTimeline: 74,
    demandForSet: 84,
    supplyScarcity: 68,
    minifigureQuality: 88,
    exclusiveMinifigures: 14,
    numberOfMinifigures: 18,
    displayAppeal: 94,
    riskScore: 36,
    themeAccent: "marvel",
  },
  {
    id: "lego-icons-10333",
    brand: "LEGO",
    name: "Lord of the Rings: Barad-dûr",
    category: "LEGO Icons",
    sku: "10333",
    price: 14999,
    liquidity: "Medium",
    expectedRetirementDate: null,
    retailPrice: 14999,
    buyPrice: 13499,
    themeStrength: 93,
    retirementTimeline: 70,
    demandForSet: 91,
    supplyScarcity: 76,
    minifigureQuality: 90,
    exclusiveMinifigures: 10,
    numberOfMinifigures: 14,
    displayAppeal: 97,
    riskScore: 38,
    themeAccent: "icons",
  },
  {
    id: "lego-star-wars-75313",
    brand: "LEGO",
    name: "AT-AT",
    category: "LEGO Star Wars",
    sku: "75313",
    price: 2999,
    liquidity: "High",
    expectedRetirementDate: null,
    retailPrice: 2999,
    buyPrice: 2599,
    themeStrength: 92,
    retirementTimeline: 88,
    demandForSet: 89,
    supplyScarcity: 74,
    minifigureQuality: 80,
    exclusiveMinifigures: 4,
    numberOfMinifigures: 9,
    displayAppeal: 88,
    riskScore: 30,
    themeAccent: "star-wars",
  },
  {
    id: "lego-ideas-21345",
    brand: "LEGO",
    name: "Polaroid OneStep SX-70 Camera",
    category: "LEGO Ideas",
    sku: "21345",
    price: 1299,
    liquidity: "High",
    expectedRetirementDate: null,
    retailPrice: 1299,
    buyPrice: 1099,
    themeStrength: 72,
    retirementTimeline: 58,
    demandForSet: 76,
    supplyScarcity: 52,
    minifigureQuality: 42,
    exclusiveMinifigures: 0,
    numberOfMinifigures: 0,
    displayAppeal: 84,
    riskScore: 44,
    themeAccent: "ideas",
  },
  {
    id: "lego-icons-10294",
    brand: "LEGO",
    name: "Titanic",
    category: "LEGO Icons",
    sku: "10294",
    price: 18999,
    liquidity: "Medium",
    expectedRetirementDate: null,
    retailPrice: 18999,
    buyPrice: 16999,
    themeStrength: 90,
    retirementTimeline: 55,
    demandForSet: 87,
    supplyScarcity: 70,
    minifigureQuality: 48,
    exclusiveMinifigures: 0,
    numberOfMinifigures: 0,
    displayAppeal: 96,
    riskScore: 40,
    themeAccent: "icons",
  },
  {
    id: "lego-star-wars-75331",
    brand: "LEGO",
    name: "The Razor Crest",
    category: "LEGO Star Wars UCS",
    sku: "75331",
    price: 12999,
    liquidity: "Medium",
    expectedRetirementDate: null,
    retailPrice: 12999,
    buyPrice: 11499,
    themeStrength: 95,
    retirementTimeline: 62,
    demandForSet: 93,
    supplyScarcity: 80,
    minifigureQuality: 86,
    exclusiveMinifigures: 4,
    numberOfMinifigures: 5,
    displayAppeal: 95,
    riskScore: 34,
    themeAccent: "star-wars",
  },
  {
    id: "lego-marvel-76210",
    brand: "LEGO",
    name: "Hulkbuster",
    category: "LEGO Marvel",
    sku: "76210",
    price: 8499,
    liquidity: "Medium",
    expectedRetirementDate: null,
    retailPrice: 8499,
    buyPrice: 7299,
    themeStrength: 84,
    retirementTimeline: 80,
    demandForSet: 82,
    supplyScarcity: 66,
    minifigureQuality: 76,
    exclusiveMinifigures: 1,
    numberOfMinifigures: 1,
    displayAppeal: 90,
    riskScore: 35,
    themeAccent: "marvel",
  },
  {
    id: "lego-icons-10302",
    brand: "LEGO",
    name: "Optimus Prime",
    category: "LEGO Icons",
    sku: "10302",
    price: 8999,
    liquidity: "Medium",
    expectedRetirementDate: null,
    retailPrice: 8999,
    buyPrice: 7999,
    themeStrength: 82,
    retirementTimeline: 48,
    demandForSet: 80,
    supplyScarcity: 58,
    minifigureQuality: 52,
    exclusiveMinifigures: 0,
    numberOfMinifigures: 0,
    displayAppeal: 91,
    riskScore: 42,
    themeAccent: "icons",
  },
];

export function monthsUntilRetirement(item, today = new Date()) {
  if (item.actualRetirementDate || item.retirementStatus === "Retired") {
    return -1;
  }
  const expectedMs = Date.parse(item.expectedRetirementDate);
  if (!Number.isFinite(expectedMs)) {
    return null;
  }
  return (expectedMs - today.getTime()) / (MS_PER_DAY * 30);
}

export function retirementBucketFor(item, today = new Date()) {
  const months = monthsUntilRetirement(item, today);
  if (months === null) {
    return "12+";
  }
  if (months < 0) {
    return "0-3";
  }
  if (months < 3) {
    return "0-3";
  }
  if (months < 6) {
    return "3-6";
  }
  if (months < 12) {
    return "6-12";
  }
  return "12+";
}

export function expected12MonthRoi(item) {
  const forecast = buildPriceForecast(item, 1);
  const current = numberOrZero(item.currentMarketValue || item.price);
  if (!current) {
    return 0;
  }
  return ((forecast.expected - current) / current) * 100;
}

export function retirementOpportunityScore(item) {
  const months = monthsUntilRetirement(item);
  const proximityBoost =
    months === null
      ? 0
      : months < 0
        ? 18
        : months <= 3
          ? 16
          : months <= 6
            ? 12
            : months <= 12
              ? 8
              : 2;
  return (
    numberOrZero(item.brickAlphaScore) * 0.45 +
    numberOrZero(item.retirementProbability) * 0.35 +
    proximityBoost +
    (item.recommendation === "Strong Buy" ? 8 : item.recommendation === "Buy" ? 4 : 0)
  );
}

export function portfolioStatusFor(item, openTrades = []) {
  const owned = openTrades.find(
    (trade) =>
      trade.assetClass === "collectible" &&
      (trade.collectibleId === item.id || trade.catalogId === item.id),
  );
  if (!owned) {
    return "Not Owned";
  }
  if (item.recommendation === "Strong Buy" || item.recommendation === "Buy") {
    return "Buy More";
  }
  if (item.recommendation === "Sell" || item.recommendation === "Avoid") {
    return "Sell";
  }
  return "Hold";
}

export function ownedTradeFor(item, openTrades = []) {
  return (
    openTrades.find(
      (trade) =>
        trade.assetClass === "collectible" &&
        (trade.collectibleId === item.id || trade.catalogId === item.id),
    ) || null
  );
}

function mergeCatalogWithLive(collectibles = [], demoCatalog = RETIREMENT_DEMO_CATALOG) {
  const liveLego = (collectibles || []).filter(
    (item) => item.brand === "LEGO" && !item.actualRetirementDate && item.retirementStatus !== "Retired",
  );
  const liveIds = new Set(liveLego.map((item) => item.id));
  const demoOnly = demoCatalog.filter((item) => !liveIds.has(item.id));
  return [...liveLego, ...demoOnly];
}

export function buildRetirementWatchlist(collectibles = [], openTrades = [], today = new Date()) {
  const merged = mergeCatalogWithLive(collectibles);
  return merged
    .map((item) => {
      const enriched = enrichBrickAlphaCollectible(item, today);
      const roi12 = expected12MonthRoi(enriched);
      return {
        ...enriched,
        theme: legoThemeFor(enriched),
        themeAccent: item.themeAccent || enriched.legoTheme?.toLowerCase().replace(/\s+/g, "-") || "other",
        setNumber: enriched.sku || extractSetNumber(enriched),
        expected12MonthRoi: roi12,
        retirementBucket: retirementBucketFor(enriched, today),
        opportunityScore: retirementOpportunityScore(enriched),
        portfolioStatus: portfolioStatusFor(enriched, openTrades),
        ownedTrade: ownedTradeFor(enriched, openTrades),
        dataSource: liveLegoIncludes(collectibles, enriched.id) ? "live" : RETIREMENT_DEMO_SOURCE,
      };
    })
    .filter((item) => item.retirementStatus !== "Retired")
    .sort((left, right) => right.opportunityScore - left.opportunityScore);
}

function liveLegoIncludes(collectibles, id) {
  return (collectibles || []).some((item) => item.id === id && item.brand === "LEGO");
}

function extractSetNumber(item) {
  if (item.sku) {
    return item.sku;
  }
  const match = String(item.id || "").match(/(\d{4,6})/);
  return match ? match[1] : "--";
}

export function buildRetirementSummaryKpis(watchlist = [], portfolioNav = 0) {
  const retiringThisQuarter = watchlist.filter((item) => {
    const months = monthsUntilRetirement(item);
    return months !== null && months >= 0 && months <= 3;
  });
  const avgScore =
    watchlist.length > 0
      ? watchlist.reduce((sum, item) => sum + numberOrZero(item.brickAlphaScore), 0) / watchlist.length
      : 0;
  const avgRoi =
    watchlist.length > 0
      ? watchlist.reduce((sum, item) => sum + numberOrZero(item.expected12MonthRoi), 0) / watchlist.length
      : 0;
  const heldRetiringNav = watchlist.reduce((sum, item) => {
    if (!item.ownedTrade) {
      return sum;
    }
    return (
      sum +
      numberOrZero(item.ownedTrade.currentPrice || item.currentMarketValue) *
        numberOrZero(item.ownedTrade.quantity || 1)
    );
  }, 0);
  const exposurePercent = portfolioNav > 0 ? (heldRetiringNav / portfolioNav) * 100 : 0;

  return {
    setsRetiringThisQuarter: retiringThisQuarter.length,
    averageBrickAlphaScore: Math.round(avgScore),
    averageExpectedRoi: avgRoi,
    portfolioExposure: exposurePercent,
    heldRetiringNav,
  };
}

export function buildRetirementInsight(item) {
  if (!item) {
    return {
      headline: "No retirement opportunities ranked yet",
      body: "Add LEGO sets to your watchlist or portfolio to unlock AI retirement intelligence.",
      drivers: [],
    };
  }

  const months = monthsUntilRetirement(item);
  const horizonText =
    months === null
      ? "an uncertain retirement window"
      : months < 0
        ? "an overdue retirement signal"
        : months <= 3
          ? `retirement in roughly ${Math.max(1, Math.round(months))} month${Math.round(months) === 1 ? "" : "s"}`
          : months <= 12
            ? `retirement within ${Math.round(months)} months`
            : "a longer-dated retirement horizon";

  const drivers = [
    `${item.brickAlphaScore}/100 Brick Alpha Score with ${item.investmentGrade} grade`,
    `${Math.round(item.retirementProbability)}% retirement probability on ${horizonText}`,
    `${item.expected12MonthRoi >= 0 ? "+" : ""}${item.expected12MonthRoi.toFixed(1)}% expected 12-month ROI`,
    `${item.theme} theme strength at ${item.themeStrength}/100`,
  ];

  if (item.discountPercentage > 0) {
    drivers.push(`${item.discountPercentage.toFixed(1)}% discount to retail supports margin of safety`);
  }

  const body = `${item.name} (#${item.setNumber}) ranks highest because ${horizonText} aligns with ${item.demandForSet}/100 demand and ${item.supplyScarcity}/100 supply scarcity scores. ${item.investmentThesis?.attractive || `Brick Alpha flags this as a ${item.recommendation} opportunity ahead of sealed supply tightening.`}`;

  return {
    headline: `Top pick: ${item.name}`,
    body,
    drivers,
    recommendation: item.recommendation,
    setNumber: item.setNumber,
  };
}

export function groupWatchlistByBucket(watchlist = []) {
  return RETIREMENT_HEATMAP_BUCKETS.reduce((accumulator, bucket) => {
    accumulator[bucket.id] = watchlist.filter((item) => item.retirementBucket === bucket.id);
    return accumulator;
  }, {});
}

export function strongBuyBeforeRetirement(watchlist = [], limit = 5) {
  return watchlist
    .filter(
      (item) =>
        (item.recommendation === "Strong Buy" || item.recommendation === "Buy") &&
        (monthsUntilRetirement(item) === null || monthsUntilRetirement(item) <= 18),
    )
    .slice(0, limit);
}

export function portfolioActionFor(item) {
  if (!item?.ownedTrade) {
    return item?.recommendation === "Strong Buy" || item?.recommendation === "Buy" ? "Buy" : "Watch";
  }
  if (item.portfolioStatus === "Buy More") {
    return "Buy More";
  }
  if (item.portfolioStatus === "Sell") {
    return "Sell";
  }
  return "Hold";
}

export function scoreHeatTone(score) {
  const numeric = numberOrZero(score);
  if (numeric >= 85) {
    return "excellent";
  }
  if (numeric >= 72) {
    return "good";
  }
  if (numeric >= 58) {
    return "fair";
  }
  return "weak";
}
