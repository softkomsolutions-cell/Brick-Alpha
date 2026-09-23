const brickEconomy = require("./brickeconomyService");
const brickLink = require("./bricklinkService");
const rateLimits = require("./rateLimitManager");

const VALUATION_CACHE_TTL_MS = Number(process.env.LEGO_VALUATION_CACHE_TTL_MS || 6 * 60 * 60 * 1000);
const USD_ZAR_RATE = Number(process.env.USD_ZAR_RATE || 18.5);
const cache = new Map();

const BETA_BENCHMARKS = {
  "30725": {
    name: "Spider-Man vs. Anti-Venom Heist",
    currentValueUSD: 5.33,
    rarity: "Retail paperbag with exclusive Anti-Venom minifigure",
    theme: "Marvel",
    retirementStatus: "available",
    exclusivity: "Retail paperbag",
    supplyProfile: "Mass retail paperbag",
    displayProfile: "Small character-led impulse display",
    annualGrowthPercent: 8,
    investmentGrade: "Entry-level hold",
    investmentGradeDetail:
      "A sensible low-cost sealed hold with an exclusive minifigure, but retail availability and paperbag supply keep it below top-tier investment grade.",
    minifigures: [
      {
        id: "spider-man-printed-arms",
        name: "Spider-Man - Printed Arms",
        exclusive: false,
        estimatedValueUSD: 2.78,
      },
      {
        id: "anti-venom-small",
        name: "Anti-Venom - Small",
        exclusive: true,
        estimatedValueUSD: 2.67,
      },
    ],
    notes: [
      "Released in 2026 with 31 pieces and two minifigures: Spider-Man and Anti-Venom.",
      "Anti-Venom is currently exclusive to this paperbag set.",
      "BrickEconomy benchmark: current new-sealed market value is about $5.33 while the set remains available at retail.",
      "Store sealed and flat. Creases or packaging damage can reduce the future collector premium.",
      "Benchmark fallback only: connect BrickLink or BrickEconomy for a fresh market quote.",
    ],
  },
  "40766": {
    name: "Tribute to Jane Austen's Books",
    currentValueUSD: 59.44,
    rarity: "Gift With Purchase",
    theme: "Ideas / Literary",
    retirementStatus: "retired",
    exclusivity: "Gift With Purchase",
    supplyProfile: "Limited promotional run",
    displayProfile: "Bookshelf display with literary crossover demand",
    annualGrowthPercent: 8,
    investmentGrade: "Strong niche GWP",
    investmentGradeDetail:
      "An interesting retired literary GWP with constrained supply and cross-collector appeal. Stronger than an ordinary promotional set, but not the same tier as a major flagship or deeply minifigure-led exclusive.",
    minifigures: [
      {
        id: "gen194",
        name: "Jane Austen",
        exclusive: true,
        estimatedValueUSD: 11.65,
      },
    ],
    notes: [
      "Short-run LEGO Gift With Purchase release.",
      "Exclusive Jane Austen minifigure and literary display appeal.",
      "Benchmark fallback only: connect BrickLink or BrickEconomy for a fresh market quote.",
    ],
  },
};

function asPositiveNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function pickFirstNumber(values) {
  for (const value of values) {
    const numeric = asPositiveNumber(value);
    if (numeric) {
      return numeric;
    }
  }
  return null;
}

function priceFromBrickLink(payload) {
  return pickFirstNumber([
    payload?.sold?.avg_price,
    payload?.sold?.unit_quantity_average,
    payload?.stock?.avg_price,
  ]);
}

function priceFromBrickEconomy(payload) {
  const data = payload?.data || {};
  return pickFirstNumber([
    data?.currentValue,
    data?.current_value,
    data?.current_value_new,
    data?.value?.newSealed,
    data?.value?.new,
    data?.marketValue?.new,
    data?.market_value?.new,
    data?.prices?.new,
  ]);
}

function nameFromBrickEconomy(payload, setNum) {
  const data = payload?.data || {};
  return String(data?.name || data?.setName || data?.title || `LEGO Set ${setNum}`);
}

function buildProjection(currentValueZAR, annualGrowthPercent, years) {
  return Math.round(currentValueZAR * (1 + annualGrowthPercent / 100) ** years);
}

const BRICK_ALPHA_SCORE_METRICS = [
  {
    id: "retirementTimeline",
    label: "Retirement Timeline",
    weight: 15,
    why: "Biggest driver of short-term appreciation.",
  },
  {
    id: "minifigureQuality",
    label: "Minifigure Quality",
    weight: 20,
    why: "Often the largest source of value creation.",
  },
  {
    id: "discountToRetail",
    label: "Discount to Retail",
    weight: 15,
    why: "Your margin of safety.",
  },
  {
    id: "themeStrength",
    label: "Theme Strength",
    weight: 10,
    why: "Collector demand differs materially by theme.",
  },
  {
    id: "exclusivity",
    label: "Exclusivity",
    weight: 10,
    why: "LEGO Store, D2C, and limited releases tend to outperform.",
  },
  {
    id: "supplyRisk",
    label: "Supply Risk",
    weight: 10,
    why: "Mass-produced sets can struggle after retirement.",
  },
  {
    id: "historicalPerformance",
    label: "Historical Performance",
    weight: 5,
    why: "Similar retired sets provide a useful demand signal.",
  },
  {
    id: "displayAppeal",
    label: "Display Appeal",
    weight: 5,
    why: "Collectors pay up for visually impressive sets.",
  },
  {
    id: "partOutValue",
    label: "Part-Out Value",
    weight: 5,
    why: "Underlying asset value provides a floor.",
  },
  {
    id: "liquidity",
    label: "Liquidity",
    weight: 5,
    why: "High buyer depth makes exits easier.",
  },
];

const THEME_STRENGTH = {
  "star wars": 96,
  icons: 88,
  ideas: 82,
  marvel: 78,
  "harry potter": 76,
  disney: 74,
  technic: 72,
  city: 58,
  friends: 54,
};

function clampScore(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function scoreBand(score) {
  if (score >= 85) return "Excellent";
  if (score >= 72) return "Strong";
  if (score >= 60) return "Watch";
  if (score >= 45) return "Weak";
  return "Risk";
}

function includesAny(value, terms) {
  const normalized = String(value || "").toLowerCase();
  return terms.some((term) => normalized.includes(term));
}

function themeStrengthScore(benchmark) {
  const theme = String(benchmark?.theme || benchmark?.rarity || benchmark?.name || "").toLowerCase();
  const match = Object.entries(THEME_STRENGTH).find(([key]) => theme.includes(key));
  if (match) {
    return match[1];
  }
  if (includesAny(theme, ["gift", "gwp", "promotional"])) return 78;
  return 62;
}

function buildPortfolioContext(setNum, portfolioHoldings = []) {
  const holdings = Array.isArray(portfolioHoldings) ? portfolioHoldings : [];
  const matchingHoldings = holdings.filter(
    (holding) => String(holding?.identifier || holding?.setNum || "").split("-")[0] === setNum,
  );
  const legoHoldings = holdings.filter(
    (holding) => holding?.category === "lego" || holding?.categoryLabel === "LEGO",
  );
  const currentHoldingCount = matchingHoldings.reduce(
    (sum, holding) => sum + Math.max(1, Number(holding?.quantity || 1)),
    0,
  );
  const totalLegoQuantity = legoHoldings.reduce(
    (sum, holding) => sum + Math.max(1, Number(holding?.quantity || 1)),
    0,
  );
  const duplicateExposurePercent = totalLegoQuantity
    ? Number(((currentHoldingCount / totalLegoQuantity) * 100).toFixed(1))
    : 0;

  return {
    currentHoldingCount,
    legoHoldingCount: totalLegoQuantity,
    duplicateExposurePercent,
    status: currentHoldingCount
      ? `${currentHoldingCount} already held`
      : legoHoldings.length
        ? "New set for portfolio"
        : "No LEGO holdings yet",
    note: currentHoldingCount
      ? "Existing exposure reduces the marginal buy score unless the entry price is exceptional."
      : "No duplicate exposure detected in the current LEGO holdings.",
  };
}

function metricDetail(id, score, context) {
  const { benchmark, discountPercent, dataConfidence, minifigures, annualGrowthPercent, portfolioContext } = context;
  const exclusiveCount = minifigures.filter((item) => item.exclusive).length;
  const details = {
    retirementTimeline: benchmark?.retirementStatus
      ? `${benchmark.retirementStatus}; retirement timing is treated as a primary appreciation driver.`
      : "Retirement date is not confirmed, so this metric stays conservative.",
    minifigureQuality: minifigures.length
      ? `${minifigures.length} minifigure(s), ${exclusiveCount} exclusive.`
      : "No minifigure value evidence supplied.",
    discountToRetail: `${Number(discountPercent || 0).toFixed(1)}% margin versus current market estimate.`,
    themeStrength: benchmark?.theme
      ? `${benchmark.theme} demand profile.`
      : "Theme demand inferred from available benchmark context.",
    exclusivity: benchmark?.exclusivity || benchmark?.rarity || "No exclusivity signal supplied.",
    supplyRisk: benchmark?.supplyProfile || "Supply depth is not confirmed; score remains conservative.",
    historicalPerformance: `${annualGrowthPercent}% annual scenario from benchmark or category default.`,
    displayAppeal: benchmark?.displayProfile || "Display appeal inferred from set type and collector context.",
    partOutValue: minifigures.length
      ? "Minifigure and component value provides a partial floor."
      : "Part-out floor is estimated from current market value only.",
    liquidity:
      dataConfidence === "live"
        ? "Live source data improves resale liquidity confidence."
        : "Benchmark-only pricing reduces liquidity confidence until sources are connected.",
  };

  if (id === "supplyRisk" && portfolioContext.currentHoldingCount) {
    return `${details[id]} Portfolio already holds this set, adding concentration risk.`;
  }

  return `${scoreBand(score)}: ${details[id]}`;
}

function buildBrickAlphaScore({
  benchmark,
  currentValueZAR,
  purchasePriceZAR,
  discountPercent,
  dataConfidence,
  minifigures,
  annualGrowthPercent,
  portfolioContext,
}) {
  const isGwp = benchmark?.rarity === "Gift With Purchase" || includesAny(benchmark?.exclusivity, ["gift", "gwp"]);
  const hasRetiredSignal = includesAny(benchmark?.retirementStatus, ["retired", "retiring", "ended"]);
  const hasAvailableSignal = includesAny(benchmark?.retirementStatus, ["available", "current"]);
  const exclusiveMinifigCount = minifigures.filter((item) => item.exclusive).length;
  const minifigureValueZAR = minifigures.reduce(
    (sum, item) => sum + Number(item.estimatedValueUSD || 0) * USD_ZAR_RATE,
    0,
  );
  const minifigureValueRatio = currentValueZAR ? minifigureValueZAR / currentValueZAR : 0;
  const duplicatePenalty = Math.min(18, portfolioContext.currentHoldingCount * 6);

  const rawScores = {
    retirementTimeline: hasRetiredSignal ? 92 : isGwp ? 84 : hasAvailableSignal ? 54 : 62,
    minifigureQuality: minifigures.length
      ? 48 + minifigures.length * 8 + exclusiveMinifigCount * 18 + minifigureValueRatio * 35
      : 32,
    discountToRetail: 50 + Number(discountPercent || 0) * 1.15,
    themeStrength: themeStrengthScore(benchmark),
    exclusivity: isGwp ? 95 : exclusiveMinifigCount ? 82 : includesAny(benchmark?.exclusivity, ["exclusive", "d2c"]) ? 84 : 48,
    supplyRisk: (isGwp ? 88 : includesAny(benchmark?.supplyProfile, ["limited", "short"]) ? 78 : 52) - duplicatePenalty,
    historicalPerformance: 35 + Math.max(0, Number(annualGrowthPercent || 0)) * 6,
    displayAppeal: includesAny(benchmark?.displayProfile, ["display", "bookshelf", "icons", "flagship"])
      ? 84
      : currentValueZAR > 3000
        ? 78
        : 56,
    partOutValue: 42 + Math.min(38, minifigureValueRatio * 100) + (exclusiveMinifigCount ? 10 : 0),
    liquidity: (dataConfidence === "live" ? 78 : 58) + (themeStrengthScore(benchmark) - 60) * 0.25 - duplicatePenalty * 0.4,
  };

  const metrics = BRICK_ALPHA_SCORE_METRICS.map((metric) => {
    const score = clampScore(rawScores[metric.id]);
    const contribution = Number(((score * metric.weight) / 100).toFixed(1));
    return {
      ...metric,
      score,
      contribution,
      detail: metricDetail(metric.id, score, {
        benchmark,
        discountPercent,
        dataConfidence,
        minifigures,
        annualGrowthPercent,
        portfolioContext,
      }),
    };
  });
  const total = Number(metrics.reduce((sum, metric) => sum + metric.contribution, 0).toFixed(1));

  return {
    total,
    max: 100,
    label: scoreBand(total),
    methodology: "BrickAlpha weighted LEGO investment score",
    metrics,
    portfolioContext,
  };
}

function recommendationForScore(score) {
  if (score >= 9) return "Exceptional Buy";
  if (score >= 7.5) return "Strong Buy";
  if (score >= 6) return "Watchlist";
  return "Pass for now";
}

function riskRatingForScore(score, dataConfidence) {
  if (score >= 8.5 && dataConfidence === "live") return "Low";
  if (score >= 7.5) return "Moderate";
  if (score >= 6) return "Speculative";
  return "High";
}

function confidenceLabelFor(dataConfidence) {
  if (dataConfidence === "live") return "High";
  if (dataConfidence === "benchmark") return "Medium";
  return "Early";
}

function cleanInputText(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function sourceView(id, label, response) {
  return {
    id,
    label,
    status: response?.ok ? (response.cache === "stale" ? "stale" : "live") : "unavailable",
    detail: response?.ok
      ? response.cache === "stale"
        ? "Using the last cached response while the source is unavailable."
        : "Fresh source response included in this valuation."
      : response?.reason || response?.error || "No source response available.",
  };
}

async function getLegoValuation(input) {
  const setNum = String(input?.setNum || "").trim().split("-")[0];
  const purchasePriceZAR = asPositiveNumber(input?.purchasePriceZAR);
  const purchaseDate = cleanInputText(input?.purchaseDate, 40);
  const certificationNotes = cleanInputText(input?.certificationNotes, 700);
  const portfolioContext = buildPortfolioContext(setNum, input?.portfolioHoldings);

  if (!/^\d{3,8}$/.test(setNum)) {
    throw new Error("lego_set_number_required");
  }
  if (!purchasePriceZAR) {
    throw new Error("purchase_price_required");
  }

  const cacheKey = `${setNum}:${purchasePriceZAR}:${purchaseDate}:${certificationNotes}:${portfolioContext.currentHoldingCount}:${portfolioContext.legoHoldingCount}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { ...cached.value, cache: "fresh" };
  }

  const [brickLinkResponse, brickEconomyResponse] = await Promise.all([
    brickLink.getPriceGuide(setNum),
    brickEconomy.getSet(setNum),
  ]);
  const benchmark = BETA_BENCHMARKS[setNum] || null;
  const brickLinkPrice = priceFromBrickLink(brickLinkResponse);
  const brickEconomyPrice = priceFromBrickEconomy(brickEconomyResponse);
  const prices = [brickLinkPrice, brickEconomyPrice].filter(Boolean);
  const livePriceUSD = prices.length
    ? prices.reduce((sum, price) => sum + price, 0) / prices.length
    : null;
  const currentValueUSD = livePriceUSD || benchmark?.currentValueUSD || null;

  if (!currentValueUSD) {
    throw new Error("lego_market_data_unavailable");
  }

  const dataConfidence = livePriceUSD ? "live" : "benchmark";
  const currentValueZAR = Math.round(currentValueUSD * USD_ZAR_RATE);
  const profitZAR = currentValueZAR - purchasePriceZAR;
  const discountPercent = (profitZAR / currentValueZAR) * 100;
  const multiplier = currentValueZAR / purchasePriceZAR;
  const roiPercent = (profitZAR / purchasePriceZAR) * 100;
  const isGwp = benchmark?.rarity === "Gift With Purchase";
  const annualGrowthPercent = benchmark?.annualGrowthPercent || (isGwp ? 8 : 6);
  const minifigures = (benchmark?.minifigures || []).map((minifigure) => ({
    ...minifigure,
    estimatedValueZAR: Math.round(minifigure.estimatedValueUSD * USD_ZAR_RATE),
  }));
  const brickAlphaScore = buildBrickAlphaScore({
    benchmark,
    currentValueZAR,
    purchasePriceZAR,
    discountPercent,
    dataConfidence,
    minifigures,
    annualGrowthPercent,
    portfolioContext,
  });
  const score = Number((brickAlphaScore.total / 10).toFixed(1));
  const valuation = {
    ok: true,
    setNum,
    name: benchmark?.name || nameFromBrickEconomy(brickEconomyResponse, setNum),
    purchasePriceZAR,
    purchaseDate,
    currentValueZAR,
    currentValueUSD: Number(currentValueUSD.toFixed(2)),
    usdZarRate: USD_ZAR_RATE,
    profitZAR: Math.round(profitZAR),
    multiplier: Number(multiplier.toFixed(1)),
    roiPercent: Number(roiPercent.toFixed(1)),
    discountPercent: Number(discountPercent.toFixed(1)),
    score,
    brickAlphaScore: brickAlphaScore.total,
    brickAlphaScoreMax: brickAlphaScore.max,
    scoreBreakdown: brickAlphaScore,
    recommendation: recommendationForScore(score),
    investmentGrade: benchmark?.investmentGrade || recommendationForScore(score),
    investmentGradeDetail:
      benchmark?.investmentGradeDetail ||
      "Use the source evidence, retirement status, scarcity, and collector demand together before treating this as an investment-grade purchase.",
    confidence: dataConfidence,
    confidenceLabel: confidenceLabelFor(dataConfidence),
    riskRating: riskRatingForScore(score, dataConfidence),
    certificationNotes,
    rarity: benchmark?.rarity || "Standard Set",
    minifigures,
    projections: {
      oneYear: buildProjection(currentValueZAR, annualGrowthPercent, 1),
      fiveYears: buildProjection(currentValueZAR, annualGrowthPercent, 5),
      tenYears: buildProjection(currentValueZAR, annualGrowthPercent, 10),
      annualGrowthPercent,
    },
    notes: benchmark?.notes || [
      "Live pricing is available for this set.",
      "Projection is a scenario estimate, not a guaranteed return.",
    ],
    sources: [
      sourceView("bricklink", "BrickLink", brickLinkResponse),
      sourceView("brickeconomy", "BrickEconomy", brickEconomyResponse),
      {
        id: "benchmark",
        label: "BrickAlpha benchmark",
        status: benchmark ? "available" : "unavailable",
        detail: benchmark
          ? "Used only when configured external sources cannot return a fresh quote."
          : "No internal benchmark is stored for this set.",
      },
    ],
    lastUpdated: new Date().toISOString(),
  };

  cache.set(cacheKey, {
    value: valuation,
    expiresAt: Date.now() + VALUATION_CACHE_TTL_MS,
  });
  return valuation;
}

function getLegoStatus() {
  return {
    ok: true,
    sources: [brickLink.status(), brickEconomy.status()],
    rateLimits: rateLimits.getStats(),
  };
}

module.exports = {
  getLegoStatus,
  getLegoValuation,
};
