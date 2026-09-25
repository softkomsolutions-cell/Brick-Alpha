const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Parser = require("rss-parser");
const { getDatabaseHealth } = require("./config/database");
const { readFinancialConfig } = require("./config/financial");
const { createLegacyStoreRepository } = require("./repositories/legacyStoreRepository");
const { readAuthConfig, corsOptions } = require('./config/auth');
const { createLegacyAuthRepository } = require('./repositories/legacyAuthRepository');
const { createPostgresAuthRepository } = require('./repositories/postgresAuthRepository');
const { createDualAuthRepository } = require('./repositories/dualAuthRepository');
const { createAuthService, AuthError } = require('./services/auth-service');
const { createAuthRateLimiter } = require('./services/auth-rate-limit');
const { createPostgresFinancialRepository } = require('./repositories/postgresFinancialRepository');
const { createFinancialService, tradeViewFromTransaction } = require('./services/financial-service');
const { readValuationConfig } = require('./config/valuation');
const { createPostgresValuationRepository } = require('./repositories/postgresValuationRepository');
const { createValuationService } = require('./services/valuation-service');
const { createMemoryValuationRepository } = require('./test-support/valuation-memory');
const { createProviderRegistry } = require('./services/valuation/providers');
const { getPrismaClient } = require('./db/prisma-client');
const { readConnectorConfig } = require('./config/connector');
const { createConnectorService } = require('./services/connector-service');
const { createPostgresConnectorRepository } = require('./repositories/postgresConnectorRepository');
const { createConnectorProviderRegistry } = require('./services/connectors/providers');
const { connectorFreshness } = require('./services/connectors/freshness');
const { createJobRunner } = require('./services/job-runner');
const brickeconomyService = require('./services/brickeconomyService');
const authConfig = readAuthConfig();
const authRateLimiter = createAuthRateLimiter();
const financialConfig = readFinancialConfig();
const valuationConfig = readValuationConfig();

const app = express();
const parser = new Parser();

app.use(cors(corsOptions(authConfig)));
// Default: do not trust forwarding headers. Configure exact proxy CIDRs when deploying.
if (process.env.TRUSTED_PROXY_CIDRS) app.set('trust proxy', process.env.TRUSTED_PROXY_CIDRS.split(',').map(value => value.trim()));
app.use(express.json());

const PORT = Number(process.env.PORT || 5000);
const AUTH_SECRET = authConfig.secret;
const CONNECTOR_SECRET = process.env.CONNECTOR_SECRET || AUTH_SECRET;
const ENGINE_TICK_MS = 5000;
const MARKET_REFRESH_MS = 60 * 1000;
const NEWS_REFRESH_MS = 10 * 60 * 1000;
const HISTORY_LIMIT = 240;
const DATA_DIR = process.env.COLLECTTRADE_DATA_DIR || path.join(__dirname, "data");
const STORE_FILE =
  process.env.COLLECTTRADE_STORE_FILE || path.join(DATA_DIR, "app-store.json");
const PRODUCT_CATALOG_FILE = path.join(DATA_DIR, "product-catalog.json");
const SHARE_STATUS_FILE =
  process.env.COLLECTTRADE_SHARE_STATUS_FILE || path.join(DATA_DIR, "share-status.json");
const FRONTEND_DIST_DIR = path.join(__dirname, "..", "frontend", "dist");
const FRONTEND_INDEX_FILE = path.join(FRONTEND_DIST_DIR, "index.html");
const DISABLE_RUNTIME = process.env.COLLECTTRADE_DISABLE_RUNTIME === "1";
const TWELVE_DATA_API_KEY = process.env.TWELVE_DATA_API_KEY || "";
const TWELVE_DATA_BASE_URL = "https://api.twelvedata.com";
const TWELVE_DATA_INTERVAL = process.env.TWELVE_DATA_INTERVAL || "1h";
const VALR_BASE_URL = "https://api.valr.com";
const BTC_FIBONACCI_REPORT = {
  reportDate: "2026-04-27",
  sourceLabel: "Bitcoin Fibonacci Analysis 260429 110626",
  swingLow: 49000,
  swingHigh: 126199,
  immediateResistance: 78490,
  psychologicalBarrier: 80000,
  technicalPivot: 82700,
  correctionZoneLow: 72000,
  correctionZoneHigh: 74000,
  majorSupport: 67000,
};

const DEFAULT_SETTINGS = {
  preferredRegion: "south-africa",
  timezone: "Africa/Johannesburg",
  riskMode: "balanced",
  subscriptionTier: "starter",
  alertPreferences: {
    inAppEnabled: true,
    emailEnabled: false,
    digestWindow: "instant",
  },
  routinePreferences: {
    remindersEnabled: true,
    nudgeWindow: "active",
    celebrationEnabled: true,
  },
    executionProfiles: {
    forex: {
      mode: "paper",
      providerId: "saxo",
    },
    etfs: {
      mode: "paper",
      providerId: "ibkr",
    },
    crypto: {
      mode: "paper",
      providerId: "valr",
      pair: "BTCUSDT",
    },
    jse: {
      mode: "paper",
      providerId: "easyequities",
    },
  },
  usdZarRate: 18.5,
};

const ALERT_SUBSCRIPTION_TIERS = {
  starter: {
    id: "starter",
    label: "Starter",
    maxAlerts: 5,
    emailEnabled: false,
  },
  pro: {
    id: "pro",
    label: "Pro",
    maxAlerts: 20,
    emailEnabled: true,
  },
  elite: {
    id: "elite",
    label: "Elite",
    maxAlerts: 50,
    emailEnabled: true,
  },
};

const DEFAULT_TARGETS = [
  "USD/ZAR macro pressure",
  "JSE risk appetite",
  "Pokemon sealed demand",
  "Retired LEGO set spreads",
];

const PRINT_SERVICE_PRESETS = [
  {
    id: "business-cards",
    label: "Business Cards",
    size: "90 x 50 mm",
    finish: "Matt or gloss",
  },
  {
    id: "flyers",
    label: "Flyers",
    size: "A5 or A6",
    finish: "Full colour single or double sided",
  },
  {
    id: "brochures",
    label: "Brochures",
    size: "A4 folded",
    finish: "Multi-panel marketing handout",
  },
  {
    id: "catalogues",
    label: "Catalogues",
    size: "A4 saddle stitch",
    finish: "Multi-page product catalogue",
  },
  {
    id: "stickers",
    label: "Labels / Stickers",
    size: "Custom cut",
    finish: "Indoor or outdoor adhesive stock",
  },
];

const CONNECTOR_PROVIDERS = [
  {
    id: "valr",
    name: "VALR",
    desk: "crypto",
    authType: "apiKey",
    availability: "live",
    capabilities: ["balances", "spot orders"],
    docsUrl: "https://docs.valr.com/",
    notes:
      "Use a VALR API key with View access for sync and Trade access when you are ready to route live orders.",
  },
  {
    id: "ibkr",
    name: "Interactive Brokers",
    desk: "etfs",
    authType: "gateway",
    availability: "manual_setup",
    capabilities: ["accounts", "positions", "orders"],
    docsUrl: "https://ibkrcampus.com/campus/ibkr-api-page/webapi-doc/",
    notes:
      "Requires Client Portal / Web API gateway or OAuth setup before live account sync can run from this app.",
  },
  {
    id: "saxo",
    name: "Saxo Bank",
    desk: "forex",
    authType: "oauth2",
    availability: "manual_setup",
    capabilities: ["accounts", "positions", "orders"],
    docsUrl: "https://developer.saxobank.com/openapi/learn/",
    notes:
      "Requires OpenAPI app credentials plus an OAuth session flow before we can run live account sync here.",
  },
  {
    id: "easyequities",
    name: "EasyEquities",
    desk: "jse",
    authType: "manual",
    availability: "unsupported",
    capabilities: ["manual tracking"],
    docsUrl: "https://www.easyequities.co.za/",
    notes:
      "No public trading API is currently wired here, so this lane stays manual until a supported integration path exists.",
  },
];

const CONNECTOR_PROVIDER_MAP = Object.fromEntries(
  CONNECTOR_PROVIDERS.map((provider) => [provider.id, provider]),
);

function loadProductCatalog() {
  try {
    if (!fs.existsSync(PRODUCT_CATALOG_FILE)) {
      return {
        generatedAt: null,
        sourceFile: PRODUCT_CATALOG_FILE,
        sourceLabel: path.basename(PRODUCT_CATALOG_FILE),
        items: [],
      };
    }

    const payload = JSON.parse(fs.readFileSync(PRODUCT_CATALOG_FILE, "utf8"));
    const items = Array.isArray(payload?.items) ? payload.items : [];
    return {
      generatedAt: payload?.generatedAt ? toUtcIso(payload.generatedAt) : null,
      sourceFile: String(payload?.sourceFile || PRODUCT_CATALOG_FILE),
      sourceLabel: path.basename(String(payload?.sourceFile || PRODUCT_CATALOG_FILE)),
      items: items
      .map((item, index) => ({
        id: String(item?.id || `catalog-${index + 1}`).trim(),
        brand: String(item?.brand || "").trim() || "Unknown",
        family: String(item?.family || item?.brand || "").trim() || "General",
        sku: String(item?.sku || "").trim(),
        name: String(item?.name || item?.brand || "").trim() || "Product",
        description: String(item?.description || "").trim(),
        type: "catalog",
        sourceSheet: String(item?.sourceSheet || item?.brand || "").trim(),
        channelTags: Array.isArray(item?.channelTags) ? item.channelTags : ["catalog"],
      }))
      .filter((item) => item.id && item.sku),
    };
  } catch (error) {
    console.warn("Failed to load product catalog.", error.message);
    return {
      generatedAt: null,
      sourceFile: PRODUCT_CATALOG_FILE,
      sourceLabel: path.basename(PRODUCT_CATALOG_FILE),
      items: [],
    };
  }
}

const PRODUCT_CATALOG_DATA = loadProductCatalog();
const PRODUCT_CATALOG = PRODUCT_CATALOG_DATA.items;
const PRODUCT_CATALOG_BRANDS = uniqueStrings(PRODUCT_CATALOG.map((item) => item.brand)).sort();
const PRODUCT_CATALOG_FAMILIES = uniqueStrings(PRODUCT_CATALOG.map((item) => item.family)).sort();
const DEMO_MODE = String(process.env.DEMO_MODE || "").toLowerCase() === "true";

const TRADEABLE_COLLECTIBLES = [
  {
    id: "lego-star-wars-75252",
    brand: "LEGO",
    name: "Star Wars Imperial Star Destroyer",
    category: "LEGO Retired Set",
    market: "Global LEGO Investments",
    sku: "75252",
    description: "Large retired UCS set with steady sealed-box demand and collector liquidity.",
    thesis: "Retired LEGO flagships usually tighten in supply before the next repricing leg.",
    venue: "Private market / eBay",
    price: 26999,
    changePercent: 4.8,
    liquidity: "Medium",
  },
  {
    id: "lego-icons-10305",
    brand: "LEGO",
    name: "Lion Knights' Castle",
    category: "LEGO Icons",
    market: "South Africa / Global",
    sku: "10305",
    description: "Prestige castle set with broad AFOL demand and gift-market support.",
    thesis: "Premium display sets tend to hold price better when local stock gets patchy.",
    venue: "Retail / collector resale",
    price: 8299,
    changePercent: 2.9,
    liquidity: "High",
  },
  {
    id: "pokemon-151-booster-bundle",
    brand: "Pokemon",
    name: "Scarlet & Violet 151 Booster Bundle",
    category: "Sealed Pokemon",
    market: "TCG Secondary",
    sku: "PKM-151-BUNDLE",
    description: "Nostalgia-driven sealed product with strong rip-or-hold demand.",
    thesis: "151 sealed supply keeps thinning, which supports incremental repricing on clean stock.",
    venue: "Card stores / marketplaces",
    price: 1199,
    changePercent: 6.4,
    liquidity: "High",
  },
  {
    id: "pokemon-charizard-psa10",
    brand: "Pokemon",
    name: "Charizard ex PSA 10",
    category: "Graded Pokemon",
    market: "TCG Graded",
    sku: "PKM-CHAR-PSA10",
    description: "Flagship graded card with deep demand and fast discoverability.",
    thesis: "Top-slab Charizard inventory moves quickly whenever risk appetite returns to cards.",
    venue: "Auction / slab marketplace",
    price: 18450,
    changePercent: -1.7,
    liquidity: "Medium",
  },
  {
    id: "funko-freddy-lebron",
    brand: "Funko",
    name: "Freddy Funko as LeBron",
    category: "Limited Pop",
    market: "Convention Exclusives",
    sku: "FUNKO-FREDDY-LBJ",
    description: "Low-pop convention exclusive with thinner liquidity but higher squeeze risk.",
    thesis: "Thin float makes it volatile, but scarcity can create sharp repricing windows.",
    venue: "Collector marketplaces",
    price: 7350,
    changePercent: 9.1,
    liquidity: "Low",
  },
  {
    id: "mtg-lotr-collector-box",
    brand: "Magic",
    name: "LOTR Collector Booster Box",
    category: "Sealed TCG",
    market: "MTG Secondary",
    sku: "MTG-LOTR-CBB",
    description: "Premium sealed TCG product with crossover appeal and strong global demand.",
    thesis: "Premium sealed boxes often reprice faster than singles when supply tightens.",
    venue: "TCG stores / online resale",
    price: 9699,
    changePercent: 3.6,
    liquidity: "Medium",
  },
];

const DEMO_LEGO_SETS = [
  {
    id: "lego-star-wars-75367",
    brand: "LEGO",
    name: "UCS Venator-Class Republic Attack Cruiser",
    category: "LEGO Star Wars (UCS)",
    market: "South Africa / Global",
    sku: "75367",
    description: "Large UCS flagship with a deep collector moat and a strong sealed-box resale tape.",
    thesis: "UCS flagships tend to reprice in steps as clean stock dries up around retirement.",
    venue: "Private market / eBay",
    price: 26999,
    changePercent: 3.2,
    liquidity: "Medium",
    retailPrice: 27999,
    buyPrice: 23300,
    currentMarketValue: 26999,
    valuationDate: "2026-09-23",
    valuationHistory: [
      { date: "2025-09-23", value: 24000 },
      { date: "2026-06-25", value: 26100 },
      { date: "2026-09-23", value: 26999 },
    ],
    projectedFutureValue: 34500,
    minifigureQuality: 88,
    exclusiveMinifigures: 2,
    numberOfMinifigures: 5,
    themeStrength: 94,
    retirementTimeline: 92,
    demandForSet: 92,
    supplyScarcity: 84,
    displayAppeal: 92,
    partOutValue: 74,
    liquidityScore: 74,
    historicalPerformance: 84,
    portfolioFit: 80,
    riskScore: 42,
    expectedRetirementDate: "2027-06-30",
    sellByTargetDate: "2030-06-30",
  },
  {
    id: "lego-icons-10316",
    brand: "LEGO",
    name: "The Lord of the Rings: Rivendell",
    category: "LEGO Icons",
    market: "South Africa / Global",
    sku: "10316",
    description: "Display-heavy Icons set with strong AFOL and LOTR crossover demand.",
    thesis: "Premium display sets tend to hold price better when local stock gets patchy.",
    venue: "Retail / collector resale",
    price: 18300,
    changePercent: 2.1,
    liquidity: "Medium",
    retailPrice: 19999,
    buyPrice: 17500,
    currentMarketValue: 18300,
    projectedFutureValue: 23000,
    minifigureQuality: 86,
    exclusiveMinifigures: 4,
    numberOfMinifigures: 15,
    themeStrength: 90,
    retirementTimeline: 90,
    demandForSet: 86,
    supplyScarcity: 78,
    displayAppeal: 93,
    partOutValue: 76,
    liquidityScore: 80,
    historicalPerformance: 82,
    portfolioFit: 72,
    riskScore: 50,
    expectedRetirementDate: "2028-12-31",
    sellByTargetDate: "2030-12-31",
  },
  {
    id: "lego-harry-potter-71043",
    brand: "LEGO",
    name: "Harry Potter: Hogwarts Castle",
    category: "LEGO Harry Potter (Retired)",
    market: "South Africa / Global",
    sku: "71043",
    description: "Retired flagship with a massive piece count and steady sealed-box demand.",
    thesis: "Retired LEGO flagships usually tighten in supply before the next repricing leg.",
    venue: "Private market / eBay",
    price: 18000,
    changePercent: -1.4,
    liquidity: "Medium",
    retailPrice: 16999,
    buyPrice: 14900,
    currentMarketValue: 18000,
    projectedFutureValue: 22500,
    minifigureQuality: 80,
    exclusiveMinifigures: 4,
    numberOfMinifigures: 27,
    themeStrength: 92,
    retirementTimeline: 88,
    demandForSet: 74,
    supplyScarcity: 76,
    displayAppeal: 95,
    partOutValue: 70,
    liquidityScore: 72,
    historicalPerformance: 80,
    portfolioFit: 76,
    riskScore: 52,
    actualRetirementDate: "2022-12-31",
    expectedRetirementDate: "2022-12-31",
    sellByTargetDate: "2028-12-31",
  },
  {
    id: "lego-marvel-76218",
    brand: "LEGO",
    name: "Marvel Sanctum Sanctorum",
    category: "LEGO Marvel",
    market: "South Africa / Global",
    sku: "76218",
    description: "Shared franchise set with strong display appeal and a deep minifigure cast.",
    thesis: "Widely available sets track retail closely until clean stock starts to thin out.",
    venue: "Retail / collector resale",
    price: 8690,
    changePercent: 1.2,
    liquidity: "High",
    retailPrice: 8999,
    buyPrice: 8500,
    currentMarketValue: 8690,
    projectedFutureValue: 9800,
    minifigureQuality: 74,
    exclusiveMinifigures: 4,
    numberOfMinifigures: 8,
    themeStrength: 78,
    retirementTimeline: 80,
    demandForSet: 72,
    supplyScarcity: 62,
    displayAppeal: 84,
    partOutValue: 66,
    liquidityScore: 64,
    historicalPerformance: 70,
    portfolioFit: 68,
    riskScore: 58,
    expectedRetirementDate: "2026-12-31",
    sellByTargetDate: "2029-12-31",
  },
  {
    id: "lego-spider-man-76261",
    brand: "LEGO",
    name: "Spider-Man Final Battle",
    category: "LEGO Spider-Man",
    market: "South Africa / Global",
    sku: "76261",
    description: "Mainline playset with reliable retail availability and moderate collectibility.",
    thesis: "Current shelf sets rarely repriced yet; patience is the edge while retail holds supply.",
    venue: "Retail",
    price: 3799,
    changePercent: 0.4,
    liquidity: "High",
    retailPrice: 3799,
    buyPrice: 3799,
    currentMarketValue: 3799,
    projectedFutureValue: 4200,
    minifigureQuality: 66,
    exclusiveMinifigures: 0,
    numberOfMinifigures: 8,
    themeStrength: 60,
    retirementTimeline: 58,
    demandForSet: 60,
    supplyScarcity: 46,
    displayAppeal: 64,
    partOutValue: 58,
    liquidityScore: 56,
    historicalPerformance: 55,
    portfolioFit: 60,
    riskScore: 60,
    expectedRetirementDate: "2028-06-30",
    sellByTargetDate: "2029-12-31",
  },
  {
    id: "lego-city-76208",
    brand: "LEGO",
    name: "Pirate Ship Adventure",
    category: "LEGO City (4+)",
    market: "South Africa / Global",
    sku: "76208",
    description: "Small entry set trading above retail with thin collector scarcity.",
    thesis: "Entry sets above retail rarely compensate for the opportunity cost of a flagship.",
    venue: "Retail / supermarkets",
    price: 2499,
    changePercent: -2.8,
    liquidity: "High",
    retailPrice: 2249,
    buyPrice: 2399,
    currentMarketValue: 2499,
    projectedFutureValue: 2550,
    minifigureQuality: 54,
    exclusiveMinifigures: 0,
    numberOfMinifigures: 5,
    themeStrength: 55,
    retirementTimeline: 50,
    demandForSet: 52,
    supplyScarcity: 38,
    displayAppeal: 58,
    partOutValue: 62,
    liquidityScore: 45,
    historicalPerformance: 48,
    portfolioFit: 55,
    riskScore: 68,
    expectedRetirementDate: "2027-12-31",
    sellByTargetDate: "2028-12-31",
  },
];

const TRADEABLE_COLLECTIBLES_ACTIVE = (DEMO_MODE
  ? TRADEABLE_COLLECTIBLES.concat(DEMO_LEGO_SETS)
  : TRADEABLE_COLLECTIBLES
).map((item) => {
  if (item.brand !== "LEGO") {
    return item;
  }
  return {
    ...item,
    imageUrl:
      item.imageUrl ||
      (item.sku ? `https://images.brickset.com/sets/images/${item.sku}-1.jpg` : ""),
    valuationDate:
      item.valuationDate ||
      (DEMO_MODE && item.currentMarketValue != null ? "2026-09-23" : undefined),
  };
});

const OFFICIAL_COLLECTIBLE_REFERENCE_SHELVES = [
  {
    id: "lego-za-minifigures",
    brand: "LEGO",
    sourceName: "Official LEGO ZA",
    title: "LEGO Minifigures",
    url: "https://www.lego.com/en-za/themes/minifigures",
    aboutUrl: "https://www.lego.com/en-za/themes/minifigures/about",
    summary:
      "Official South African LEGO Minifigures hub with current series, themed releases, and collectible guidance.",
    notes: [
      "The current LEGO ZA minifigures theme page shows 16 products.",
      "The page frames minifigures as collectible, display-friendly, and giftable.",
      "Use this shelf as a retail anchor, not as a resale pricing source.",
    ],
    highlights: [
      {
        id: "lego-minifigures-series-29",
        name: "Series 29",
        category: "Mystery box minifigure",
        status: "New",
        age: "6+",
        pieces: 8,
        url: "https://www.lego.com/en-za/themes/minifigures",
        note:
          "Current featured series on the official LEGO ZA minifigures pages.",
      },
      {
        id: "lego-animals-series-28",
        name: "Animals Series 28",
        category: "Mystery box minifigure",
        status: "Current",
        age: "5+",
        pieces: 7,
        url: "https://www.lego.com/en-za/product/animals-series-28-71051",
        note:
          "Animal-themed collectible series referenced on the official ZA minifigures shelf.",
      },
      {
        id: "lego-marvel-series-2",
        name: "LEGO Minifigures Marvel Series 2",
        category: "Licensed minifigure",
        status: "Current",
        age: "5+",
        pieces: 10,
        url: "https://www.lego.com/en-za/product/lego-minifigures-marvel-series-2-71039",
        note:
          "Official LEGO ZA page highlights 12 Marvel characters including X-Men '97 and Moon Knight figures.",
      },
      {
        id: "lego-minifigures-series-24-6-pack",
        name: "LEGO Minifigures Series 24 6 Pack",
        category: "Multipack",
        status: "Last Chance",
        age: "5+",
        pieces: 51,
        url: "https://www.lego.com/en-za/product/lego-minifigures-series-24-6-pack-66733",
        note:
          "Official ZA listing positions this as a 6-pack random selection from the 12-character Series 24 lineup.",
      },
      {
        id: "lego-minifigures-series-25",
        name: "LEGO Minifigures Series 25",
        category: "Mystery box minifigure",
        status: "Current",
        age: "5+",
        pieces: 9,
        url: "https://www.lego.com/en-za/product/lego-minifigures-series-25-71045",
        note:
          "Official ZA product page spotlights 12 collectible characters and quick-build gift appeal.",
      },
      {
        id: "lego-dnd-minifigures",
        name: "Dungeons & Dragons",
        category: "Licensed minifigure",
        status: "Exclusive",
        age: "5+",
        pieces: 9,
        url: "https://www.lego.com/en-za/product/dungeons-dragons-71047",
        note:
          "Official ZA shelf flags this minifigure release as an exclusive collectible line.",
      },
    ],
  },
];
const TRADEABLE_COLLECTIBLE_CATEGORIES = uniqueStrings(
  TRADEABLE_COLLECTIBLES_ACTIVE.map((item) => item.category),
).sort();
const TRADEABLE_COLLECTIBLE_BRANDS = uniqueStrings(
  TRADEABLE_COLLECTIBLES_ACTIVE.map((item) => item.brand),
).sort();

const NEWS_SOURCES = [
  {
    id: "businesstech",
    name: "BusinessTech",
    region: "south-africa",
    url: "https://businesstech.co.za/news/feed/",
  },
  {
    id: "dailyinvestor",
    name: "Daily Investor",
    region: "south-africa",
    url: "https://dailyinvestor.com/feed/",
  },
  {
    id: "sabc-business",
    name: "SABC Business",
    region: "south-africa",
    url: "https://www.sabcnews.com/sabcnews/category/business/feed/",
  },
  {
    id: "coindesk",
    name: "CoinDesk",
    region: "global",
    url: "https://www.coindesk.com/arc/outboundfeeds/rss/",
  },
  {
    id: "fxstreet",
    name: "FXStreet",
    region: "global",
    url: "https://www.fxstreet.com/rss/news",
  },
];

const MARKETS = [
  {
    ticker: "USDZAR",
    label: "USD/ZAR",
    desk: "forex",
    region: "south-africa",
    providerSymbol: "USD/ZAR",
    basePrice: 18.42,
    drift: 0.00024,
    volatility: 0.0023,
    minPrice: 16.8,
    maxPrice: 21.2,
  },
  {
    ticker: "EURUSD",
    label: "EUR/USD",
    desk: "forex",
    region: "global",
    providerSymbol: "EUR/USD",
    basePrice: 1.086,
    drift: 0.00008,
    volatility: 0.0015,
    minPrice: 0.92,
    maxPrice: 1.22,
  },
  {
    ticker: "SPY",
    label: "SPDR S&P 500 ETF",
    desk: "etfs",
    region: "global",
    providerSymbol: "SPY",
    basePrice: 518.4,
    drift: 0.0002,
    volatility: 0.0032,
    minPrice: 380,
    maxPrice: 650,
  },
  {
    ticker: "QQQ",
    label: "Invesco QQQ",
    desk: "etfs",
    region: "global",
    providerSymbol: "QQQ",
    basePrice: 443.2,
    drift: 0.00024,
    volatility: 0.0042,
    minPrice: 280,
    maxPrice: 560,
  },
  {
    ticker: "GLD",
    label: "SPDR Gold Shares",
    desk: "etfs",
    region: "global",
    providerSymbol: "GLD",
    basePrice: 219.8,
    drift: 0.00012,
    volatility: 0.0028,
    minPrice: 150,
    maxPrice: 300,
  },
  {
    ticker: "BTCUSD",
    label: "BTC/USD",
    desk: "crypto",
    region: "global",
    providerSymbol: "BTC/USD",
    basePrice: 64800,
    drift: 0.00055,
    volatility: 0.0095,
    minPrice: 28000,
    maxPrice: 120000,
  },
  {
    ticker: "JSE40",
    label: "JSE Top 40",
    desk: "jse",
    region: "south-africa",
    providerSymbol: process.env.TWELVE_DATA_JSE_SYMBOL || "JTOPI",
    exchange: "JSE",
    basePrice: 78500,
    drift: 0.00016,
    volatility: 0.0031,
    minPrice: 65000,
    maxPrice: 91000,
  },
];

const VALR_SIGNAL_MARKET_MAP = {
  BTCUSD: {
    defaultPair: "BTCUSDT",
    supportedPairs: ["BTCUSDT", "BTCUSDC", "BTCZAR"],
    baseAsset: "BTC",
  },
};

const VALR_PAIR_CACHE_MS = 6 * 60 * 60 * 1000;

function nowIso() {
  return new Date().toISOString();
}

function southAfricaDateKey(value = Date.now()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date(value));
}

function southAfricaHour(value = Date.now()) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Johannesburg",
    hour: "2-digit",
    hourCycle: "h23",
  });
  return Number(formatter.format(new Date(value)));
}

function dateKeyToUtcMs(dateKey) {
  const normalized = String(dateKey || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return null;
  }

  return Date.parse(`${normalized}T00:00:00Z`);
}

function previousDateKey(dateKey) {
  const utcMs = dateKeyToUtcMs(dateKey);
  if (!utcMs) {
    return null;
  }

  return southAfricaDateKey(utcMs - 24 * 60 * 60 * 1000);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function roundPrice(ticker, value) {
  if (["BTCUSD", "JSE40", "SPY", "QQQ", "GLD"].includes(ticker)) {
    return Number(value.toFixed(2));
  }

  if (ticker === "USDZAR") {
    return Number(value.toFixed(4));
  }

  return Number(value.toFixed(5));
}

function uniqueStrings(values) {
  return [...new Set((values || []).map((value) => String(value).trim()).filter(Boolean))];
}

function sanitizeOptionalText(value, maxLength = 160) {
  const text = String(value || "").trim();
  return text ? text.slice(0, maxLength) : "";
}

function sanitizeRequestChannel(value) {
  return value === "email" ? "email" : "phone";
}

function sanitizeRequestType(value) {
  return value === "printing" ? "printing" : "catalog";
}

function sanitizeRequestStatus(value) {
  const allowed = new Set(["new", "quoted", "in-progress", "completed", "cancelled"]);
  return allowed.has(value) ? value : "new";
}

function sanitizeRequestPriority(value) {
  const allowed = new Set(["normal", "priority", "rush"]);
  return allowed.has(value) ? value : "normal";
}

function sanitizeRequestReference(value, requestNumericId) {
  const text = sanitizeOptionalText(value, 40).toUpperCase();
  if (text) {
    return text;
  }

  if (Number.isFinite(Number(requestNumericId))) {
    return `REQ-${String(Math.trunc(Number(requestNumericId))).padStart(5, "0")}`;
  }

  return "";
}

function sanitizeQuoteAmount(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    return null;
  }

  return Number(amount.toFixed(2));
}

function sanitizeFollowUpAt(value) {
  const text = String(value || "").trim();
  return text ? toUtcIso(text) : null;
}

function sanitizePrintDetails(input) {
  return {
    serviceType: sanitizeOptionalText(input?.serviceType, 80),
    size: sanitizeOptionalText(input?.size, 60),
    colorMode: sanitizeOptionalText(input?.colorMode, 60),
    stock: sanitizeOptionalText(input?.stock, 80),
    finish: sanitizeOptionalText(input?.finish, 80),
    dueDate: sanitizeOptionalText(input?.dueDate, 40),
  };
}

function sanitizeCatalogSelection(input) {
  if (!input || typeof input !== "object") {
    return null;
  }

  return {
    itemId: sanitizeOptionalText(input?.itemId, 120),
    sku: sanitizeOptionalText(input?.sku, 120),
    brand: sanitizeOptionalText(input?.brand, 80),
    family: sanitizeOptionalText(input?.family, 120),
    name: sanitizeOptionalText(input?.name, 120),
    sourceSheet: sanitizeOptionalText(input?.sourceSheet, 120),
    description: sanitizeOptionalText(input?.description, 220),
  };
}

function sanitizeIntakeRequest(input) {
  const requestType = sanitizeRequestType(input?.requestType);
  const requestNumericId = Number.isFinite(Number(input?.id)) ? Number(input.id) : null;
  return {
    id: requestNumericId,
    reference: sanitizeRequestReference(input?.reference, requestNumericId),
    channel: sanitizeRequestChannel(input?.channel),
    requestType,
    status: sanitizeRequestStatus(input?.status),
    priority: sanitizeRequestPriority(input?.priority),
    customerName: sanitizeOptionalText(input?.customerName, 120),
    company: sanitizeOptionalText(input?.company, 120),
    contactEmail: sanitizeOptionalText(input?.contactEmail, 120),
    contactPhone: sanitizeOptionalText(input?.contactPhone, 40),
    subject: sanitizeOptionalText(input?.subject, 140),
    quantity: Number.isFinite(Number(input?.quantity)) ? Math.max(1, Math.trunc(Number(input.quantity))) : 1,
    notes: sanitizeOptionalText(input?.notes, 400),
    quotedAmount: sanitizeQuoteAmount(input?.quotedAmount),
    followUpAt: sanitizeFollowUpAt(input?.followUpAt),
    createdAt: input?.createdAt ? toUtcIso(input.createdAt) : null,
    updatedAt: input?.updatedAt ? toUtcIso(input.updatedAt) : null,
    catalogSelection:
      requestType === "catalog" ? sanitizeCatalogSelection(input?.catalogSelection) : null,
    printDetails:
      requestType === "printing" ? sanitizePrintDetails(input?.printDetails) : sanitizePrintDetails({}),
  };
}

function sanitizeUserRole(value, fallbackOwner = false) {
  if (fallbackOwner) {
    return "owner";
  }

  if (value === "owner" || value === "partner") {
    return value;
  }

  return "partner";
}

function isSystemAccountEmail(email) {
  const normalized = normalizeEmail(email);
  return (
    normalized.endsWith("@collecttrade.local") ||
    normalized.endsWith("@example.com")
  );
}

function resolvePreferredOwnerId(records) {
  const nonSystemOwner = records.find(
    (user) => user?.role === "owner" && !isSystemAccountEmail(user?.email),
  );
  if (nonSystemOwner?.id) {
    return nonSystemOwner.id;
  }

  const firstRealAccount = records.find((user) => !isSystemAccountEmail(user?.email));
  if (firstRealAccount?.id) {
    return firstRealAccount.id;
  }

  return records[0]?.id || null;
}

function sanitizeUserRecord(input, index = 0, preferredOwnerId = null) {
  return {
    id: sanitizeOptionalText(input?.id, 80) || crypto.randomUUID(),
    name: sanitizeOptionalText(input?.name, 120) || `Brick Alpha User ${index + 1}`,
    email: normalizeEmail(input?.email),
    passwordSalt: String(input?.passwordSalt || ""),
    passwordHash: String(input?.passwordHash || ""),
    passwordResetSalt: String(input?.passwordResetSalt || ""),
    passwordResetHash: String(input?.passwordResetHash || ""),
    passwordResetRequestedAt: input?.passwordResetRequestedAt ? toUtcIso(input.passwordResetRequestedAt) : null,
    passwordResetExpiresAt: input?.passwordResetExpiresAt ? toUtcIso(input.passwordResetExpiresAt) : null,
    role: sanitizeUserRole(
      input?.role,
      Boolean(preferredOwnerId && preferredOwnerId === (sanitizeOptionalText(input?.id, 80) || "")),
    ),
    createdAt: input?.createdAt ? toUtcIso(input.createdAt) : nowIso(),
    lastLoginAt: input?.lastLoginAt
      ? toUtcIso(input.lastLoginAt)
      : input?.createdAt
        ? toUtcIso(input.createdAt)
        : nowIso(),
  };
}

function sanitizeFeedbackType(value) {
  return ["bug", "ux", "improvement", "content"].includes(value) ? value : "bug";
}

function sanitizeFeedbackSeverity(value) {
  return ["low", "medium", "high"].includes(value) ? value : "medium";
}

function sanitizeFeedbackStatus(value) {
  return ["new", "reviewing", "planned", "resolved"].includes(value) ? value : "new";
}

function sanitizeWatchlistDesk(value) {
  if (value === "collectible") {
    return "collectibles";
  }
  return ["forex", "etfs", "crypto", "jse", "collectibles"].includes(value) ? value : "forex";
}

function sanitizeWatchlistItem(input) {
  return {
    id: sanitizeOptionalText(input?.id, 80) || crypto.randomUUID(),
    ticker: sanitizeOptionalText(input?.ticker, 40).toUpperCase(),
    label: sanitizeOptionalText(input?.label, 80),
    desk: sanitizeWatchlistDesk(input?.desk),
    createdAt: input?.createdAt ? toUtcIso(input.createdAt) : null,
    updatedAt: input?.updatedAt ? toUtcIso(input.updatedAt) : null,
  };
}

function sortWatchlistItems(items) {
  return [...items].sort((left, right) => {
    const leftTime = Date.parse(left.updatedAt || left.createdAt || 0) || 0;
    const rightTime = Date.parse(right.updatedAt || right.createdAt || 0) || 0;
    return rightTime - leftTime;
  });
}

function sanitizeAlertKind(value) {
  return ["price_above", "price_below", "rsi_above", "rsi_below"].includes(value)
    ? value
    : "price_above";
}

function sanitizeAlertRule(input) {
  const kind = sanitizeAlertKind(input?.kind);
  const threshold = Number(input?.threshold);
  return {
    id: sanitizeOptionalText(input?.id, 80) || crypto.randomUUID(),
    ticker: sanitizeOptionalText(input?.ticker, 40).toUpperCase(),
    label: sanitizeOptionalText(input?.label, 120),
    desk: sanitizeWatchlistDesk(input?.desk),
    kind,
    threshold: Number.isFinite(threshold) ? Number(threshold.toFixed(8)) : null,
    enabled: input?.enabled !== false,
    createdAt: input?.createdAt ? toUtcIso(input.createdAt) : null,
    updatedAt: input?.updatedAt ? toUtcIso(input.updatedAt) : null,
    lastTriggeredAt: input?.lastTriggeredAt ? toUtcIso(input.lastTriggeredAt) : null,
    lastTriggerState: input?.lastTriggerState === true,
  };
}

function buildAlertSummary(items) {
  const total = items.length;
  const enabled = items.filter((item) => item.enabled).length;
  const triggered = items.filter((item) => item.triggered).length;
  const disabled = total - enabled;
  const priceAlerts = items.filter((item) => item.kind.startsWith("price_")).length;
  const rsiAlerts = items.filter((item) => item.kind.startsWith("rsi_")).length;

  return {
    total,
    enabled,
    disabled,
    triggered,
    priceAlerts,
    rsiAlerts,
  };
}

function sanitizeNotificationStatus(value) {
  return ["unread", "read"].includes(value) ? value : "unread";
}

function sanitizeNotificationItem(input) {
  return {
    id: sanitizeOptionalText(input?.id, 80) || crypto.randomUUID(),
    ticker: sanitizeOptionalText(input?.ticker, 40).toUpperCase(),
    label: sanitizeOptionalText(input?.label, 120),
    desk: sanitizeWatchlistDesk(input?.desk),
    title: sanitizeOptionalText(input?.title, 160),
    message: sanitizeOptionalText(input?.message, 320),
    type: sanitizeOptionalText(input?.type, 40) || "alert",
    status: sanitizeNotificationStatus(input?.status),
    createdAt: input?.createdAt ? toUtcIso(input.createdAt) : null,
  };
}

function sortNotificationItems(items) {
  return [...items].sort((left, right) => {
    const leftTime = Date.parse(left.createdAt || 0) || 0;
    const rightTime = Date.parse(right.createdAt || 0) || 0;
    return rightTime - leftTime;
  });
}

function buildNotificationSummary(items) {
  const total = items.length;
  const unread = items.filter((item) => item.status === "unread").length;
  const read = total - unread;
  return { total, unread, read };
}

function sanitizeAlertEmailQueueStatus(value) {
  return value === "sent" || value === "cancelled" ? value : "queued";
}

function sanitizeAlertEmailQueueItem(input) {
  return {
    id: sanitizeOptionalText(input?.id, 80) || crypto.randomUUID(),
    ticker: sanitizeOptionalText(input?.ticker, 40).toUpperCase(),
    label: sanitizeOptionalText(input?.label, 120),
    desk: sanitizeWatchlistDesk(input?.desk),
    title: sanitizeOptionalText(input?.title, 160),
    message: sanitizeOptionalText(input?.message, 320),
    recipientEmail: sanitizeOptionalText(input?.recipientEmail, 120),
    digestWindow:
      input?.digestWindow === "hourly" || input?.digestWindow === "daily"
        ? input.digestWindow
        : "instant",
    status: sanitizeAlertEmailQueueStatus(input?.status),
    createdAt: input?.createdAt ? toUtcIso(input.createdAt) : null,
  };
}

function sortAlertEmailQueueItems(items) {
  return [...items].sort((left, right) => {
    const leftTime = Date.parse(left.createdAt || 0) || 0;
    const rightTime = Date.parse(right.createdAt || 0) || 0;
    return rightTime - leftTime;
  });
}

function buildAlertEmailQueueSummary(items) {
  const total = items.length;
  const queued = items.filter((item) => item.status === "queued").length;
  const sent = items.filter((item) => item.status === "sent").length;
  const cancelled = items.filter((item) => item.status === "cancelled").length;
  return { total, queued, sent, cancelled };
}

function sanitizeFeedbackItem(input) {
  return {
    id: sanitizeOptionalText(input?.id, 80) || crypto.randomUUID(),
    title: sanitizeOptionalText(input?.title, 140),
    type: sanitizeFeedbackType(input?.type),
    severity: sanitizeFeedbackSeverity(input?.severity),
    area: sanitizeOptionalText(input?.area, 80) || "general",
    notes: sanitizeOptionalText(input?.notes, 800),
    status: sanitizeFeedbackStatus(input?.status),
    authorUserId: sanitizeOptionalText(input?.authorUserId, 80),
    authorName: sanitizeOptionalText(input?.authorName, 120),
    authorEmail: sanitizeOptionalText(input?.authorEmail, 120),
    createdAt: input?.createdAt ? toUtcIso(input.createdAt) : null,
    updatedAt: input?.updatedAt ? toUtcIso(input.updatedAt) : null,
    resolutionNote: sanitizeOptionalText(input?.resolutionNote, 400),
  };
}

function sortFeedbackItems(items) {
  return [...items].sort((left, right) => {
    const leftTime = Date.parse(left.updatedAt || left.createdAt || 0) || 0;
    const rightTime = Date.parse(right.updatedAt || right.createdAt || 0) || 0;
    return rightTime - leftTime;
  });
}

function buildFeedbackSummary(items) {
  const total = items.length;
  const open = items.filter((item) => item.status !== "resolved").length;
  const newItems = items.filter((item) => item.status === "new").length;
  const reviewing = items.filter((item) => item.status === "reviewing").length;
  const planned = items.filter((item) => item.status === "planned").length;
  const resolved = items.filter((item) => item.status === "resolved").length;
  const highSeverity = items.filter((item) => item.severity === "high").length;

  return {
    total,
    open,
    newItems,
    reviewing,
    planned,
    resolved,
    highSeverity,
  };
}

function connectorBaselineStatus(providerId) {
  const provider = CONNECTOR_PROVIDER_MAP[providerId];
  if (!provider) {
    return "not_configured";
  }

  if (provider.availability === "manual_setup") {
    return "manual_setup";
  }

  if (provider.availability === "unsupported") {
    return "unsupported";
  }

  return "not_configured";
}

function defaultConnectorRecord(providerId) {
  return {
    configured: false,
    status: connectorBaselineStatus(providerId),
    lastTestAt: null,
    lastSyncAt: null,
    lastError: null,
    config: {},
    authBlob: null,
    accountSnapshot: null,
  };
}

function defaultConnectorsState() {
  return Object.fromEntries(
    CONNECTOR_PROVIDERS.map((provider) => [provider.id, defaultConnectorRecord(provider.id)]),
  );
}

function sanitizeValrPair(value, fallback = VALR_SIGNAL_MARKET_MAP.BTCUSD.defaultPair) {
  const candidate = String(value || "").trim().toUpperCase();
  return VALR_SIGNAL_MARKET_MAP.BTCUSD.supportedPairs.includes(candidate)
    ? candidate
    : fallback;
}

function sanitizeConnectorConfig(providerId, input) {
  if (providerId === "valr") {
    return {
      subAccountId: String(input?.subAccountId || "").trim().slice(0, 120),
      preferredPair: sanitizeValrPair(input?.preferredPair),
    };
  }

  if (providerId === "ibkr") {
    return {
      gatewayUrl: String(input?.gatewayUrl || "").trim().slice(0, 180),
      accountId: String(input?.accountId || "").trim().slice(0, 80),
      environment: input?.environment === "live" ? "live" : "paper",
    };
  }

  if (providerId === "saxo") {
    return {
      environment: input?.environment === "live" ? "live" : "simulation",
    };
  }

  if (providerId === "easyequities") {
    const fundingBank = String(input?.fundingBank || "").trim().toLowerCase();
    return {
      accountLabel: String(input?.accountLabel || "").trim().slice(0, 120),
      fundingBank:
        ["absa", "capitec", "fnb", "nedbank", "standard-bank"].includes(fundingBank)
          ? fundingBank
          : "",
    };
  }

  return {};
}

function sanitizeExecutionProfile(desk, input) {
  const defaults = DEFAULT_SETTINGS.executionProfiles[desk];
  if (!defaults) {
    return null;
  }

  if (desk === "crypto") {
    return {
      mode: input?.mode === "live" ? "live" : "paper",
      providerId: "valr",
      pair: sanitizeValrPair(input?.pair, defaults.pair),
    };
  }

  return {
    mode: "paper",
    providerId: defaults.providerId,
  };
}

function sanitizeExecutionProfiles(input) {
  return Object.fromEntries(
    Object.keys(DEFAULT_SETTINGS.executionProfiles).map((desk) => [
      desk,
      sanitizeExecutionProfile(desk, input?.[desk]),
    ]),
  );
}

function sanitizeSubscriptionTier(value) {
  return value === "pro" || value === "elite" ? value : "starter";
}

function alertPlanForTier(tier) {
  return ALERT_SUBSCRIPTION_TIERS[sanitizeSubscriptionTier(tier)];
}

function sanitizeAlertPreferences(input, subscriptionTier) {
  const plan = alertPlanForTier(subscriptionTier);
  return {
    inAppEnabled: input?.inAppEnabled !== false,
    emailEnabled: plan.emailEnabled ? input?.emailEnabled === true : false,
    digestWindow:
      input?.digestWindow === "hourly" || input?.digestWindow === "daily"
        ? input.digestWindow
        : "instant",
  };
}

function sanitizeBalanceEntry(entry) {
  const currency = String(entry?.currency || entry?.asset || entry?.symbol || "").trim().toUpperCase();
  if (!currency) {
    return null;
  }

  const available = Number(entry?.available ?? entry?.availableBalance ?? 0);
  const reserved = Number(entry?.reserved ?? entry?.reservedBalance ?? entry?.locked ?? 0);
  const total = Number(entry?.total ?? available + reserved);

  if (![available, reserved, total].every(Number.isFinite)) {
    return null;
  }

  return {
    currency,
    available: Number(available.toFixed(8)),
    reserved: Number(reserved.toFixed(8)),
    total: Number(total.toFixed(8)),
  };
}

function sanitizeAccountSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    return null;
  }

  const balances = Array.isArray(snapshot.balances)
    ? snapshot.balances.map(sanitizeBalanceEntry).filter(Boolean).slice(0, 40)
    : [];
  const fundedAssets = balances.filter((entry) => Math.abs(entry.total) > 0).length;

  return {
    fetchedAt: snapshot.fetchedAt ? toUtcIso(snapshot.fetchedAt) : null,
    balances,
    totalAssets:
      Number.isFinite(Number(snapshot.totalAssets)) ? Number(snapshot.totalAssets) : balances.length,
    fundedAssets,
  };
}

function sanitizeConnectorRecord(providerId, input) {
  const provider = CONNECTOR_PROVIDER_MAP[providerId];
  const defaults = defaultConnectorRecord(providerId);
  if (!provider) {
    return defaults;
  }

  const authBlob = typeof input?.authBlob === "string" ? input.authBlob : null;
  const config = sanitizeConnectorConfig(providerId, input?.config);
  const configured =
    Boolean(authBlob) ||
    Object.values(config).some(
      (value) => !(value === null || value === undefined || value === "" || value === false),
    );
  const baselineStatus = connectorBaselineStatus(providerId);
  const requestedStatus =
    typeof input?.status === "string" && input.status.trim() ? input.status.trim() : baselineStatus;

  return {
    configured,
    status: configured ? requestedStatus : baselineStatus,
    lastTestAt: input?.lastTestAt ? toUtcIso(input.lastTestAt) : null,
    lastSyncAt: input?.lastSyncAt ? toUtcIso(input.lastSyncAt) : null,
    lastError: input?.lastError ? String(input.lastError).slice(0, 220) : null,
    config,
    authBlob,
    accountSnapshot: sanitizeAccountSnapshot(input?.accountSnapshot),
  };
}

function sanitizeSettings(input) {
  const preferredRegion =
    input?.preferredRegion === "global" || input?.preferredRegion === "all"
      ? input.preferredRegion
      : "south-africa";
  const riskMode =
    input?.riskMode === "defensive" || input?.riskMode === "aggressive"
      ? input.riskMode
      : "balanced";
  const subscriptionTier = sanitizeSubscriptionTier(input?.subscriptionTier);
  const routinePreferences = {
    remindersEnabled: input?.routinePreferences?.remindersEnabled !== false,
    nudgeWindow:
      input?.routinePreferences?.nudgeWindow === "quiet" ||
      input?.routinePreferences?.nudgeWindow === "focused"
        ? input.routinePreferences.nudgeWindow
        : "active",
    celebrationEnabled: input?.routinePreferences?.celebrationEnabled !== false,
  };

  return {
    preferredRegion,
    riskMode,
    timezone: "Africa/Johannesburg",
    subscriptionTier,
    alertPreferences: sanitizeAlertPreferences(input?.alertPreferences, subscriptionTier),
    routinePreferences,
    executionProfiles: sanitizeExecutionProfiles(input?.executionProfiles),
    usdZarRate: sanitizeUsdZarRate(input?.usdZarRate),
  };
}

function sanitizeUsdZarRate(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 18.5;
  }
  return Math.round(numeric * 100) / 100;
}

function sanitizeRoutineStepId(value) {
  const candidate = String(value || "").trim().toLowerCase();
  const allowed = new Set(["macro", "signal", "watchlist", "alerts", "reports", "subscriptions"]);
  return allowed.has(candidate) ? candidate : "";
}

const ROUTINE_STEP_IDS = ["macro", "signal", "watchlist", "alerts", "reports", "subscriptions"];

function sanitizeRoutineSessionMode(value) {
  const candidate = String(value || "").trim().toLowerCase();
  const allowed = new Set(["morning", "live", "review"]);
  return allowed.has(candidate) ? candidate : "";
}

function inferRoutineSessionMode(value = Date.now()) {
  const hour = southAfricaHour(value);
  if (hour < 11) {
    return "morning";
  }
  if (hour < 17) {
    return "live";
  }
  return "review";
}

function sortRoutineDates(values) {
  return uniqueStrings(values)
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
    .sort((left, right) => {
      const leftTime = dateKeyToUtcMs(left) || 0;
      const rightTime = dateKeyToUtcMs(right) || 0;
      return rightTime - leftTime;
    });
}

function defaultRoutineState() {
  return {
    currentDate: southAfricaDateKey(),
    completedStepIds: [],
    activeDates: [],
    sessionMode: inferRoutineSessionMode(),
    completedAt: null,
    reminderDismissedDate: null,
    completionAcknowledgedDate: null,
    updatedAt: null,
  };
}

function sanitizeRoutineState(input) {
  const today = southAfricaDateKey();
  const currentDate =
    /^\d{4}-\d{2}-\d{2}$/.test(String(input?.currentDate || "").trim())
      ? String(input.currentDate).trim()
      : today;

  return {
    currentDate,
    completedStepIds: uniqueStrings(input?.completedStepIds || [])
      .map(sanitizeRoutineStepId)
      .filter(Boolean),
    activeDates: sortRoutineDates(input?.activeDates || []),
    sessionMode: sanitizeRoutineSessionMode(input?.sessionMode) || inferRoutineSessionMode(),
    completedAt: input?.completedAt ? toUtcIso(input.completedAt) : null,
    reminderDismissedDate:
      /^\d{4}-\d{2}-\d{2}$/.test(String(input?.reminderDismissedDate || "").trim())
        ? String(input.reminderDismissedDate).trim()
        : null,
    completionAcknowledgedDate:
      /^\d{4}-\d{2}-\d{2}$/.test(String(input?.completionAcknowledgedDate || "").trim())
        ? String(input.completionAcknowledgedDate).trim()
        : null,
    updatedAt: input?.updatedAt ? toUtcIso(input.updatedAt) : null,
  };
}

function advanceRoutineState(state) {
  const routine = sanitizeRoutineState(state);
  const today = southAfricaDateKey();

  if (routine.currentDate !== today) {
    return {
      ...routine,
      currentDate: today,
      completedStepIds: [],
      sessionMode: inferRoutineSessionMode(),
      completedAt: null,
      reminderDismissedDate: null,
      completionAcknowledgedDate: null,
      updatedAt: routine.updatedAt,
    };
  }

  return routine;
}

function buildRoutineStreak(activeDates) {
  const ordered = sortRoutineDates(activeDates);
  if (!ordered.length) {
    return 0;
  }

  let streak = 1;
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index] !== previousDateKey(ordered[index - 1])) {
      break;
    }
    streak += 1;
  }

  return streak;
}

function buildRoutineBestStreak(activeDates) {
  const ordered = sortRoutineDates(activeDates);
  if (!ordered.length) {
    return 0;
  }

  let best = 1;
  let current = 1;

  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index] === previousDateKey(ordered[index - 1])) {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 1;
    }
  }

  return best;
}

function buildRoutineWeekCount(activeDates, currentDate) {
  const activeSet = new Set(sortRoutineDates(activeDates));
  let cursor = currentDate;
  let count = 0;

  for (let index = 0; index < 7 && cursor; index += 1) {
    if (activeSet.has(cursor)) {
      count += 1;
    }
    cursor = previousDateKey(cursor);
  }

  return count;
}

function buildRoutineView(state) {
  const routine = advanceRoutineState(state);
  return {
    currentDate: routine.currentDate,
    completedStepIds: routine.completedStepIds,
    activeDates: routine.activeDates,
    streakCount: buildRoutineStreak(routine.activeDates),
    bestStreakCount: buildRoutineBestStreak(routine.activeDates),
    weekActiveCount: buildRoutineWeekCount(routine.activeDates, routine.currentDate),
    sessionMode: routine.sessionMode,
    completedAt: routine.completedAt,
    isComplete: routine.completedStepIds.length >= ROUTINE_STEP_IDS.length,
    reminderDismissedDate: routine.reminderDismissedDate,
    completionAcknowledgedDate: routine.completionAcknowledgedDate,
    updatedAt: routine.updatedAt,
  };
}

function updateRoutineStep(state, stepId, completed) {
  const routine = advanceRoutineState(state);
  const safeStepId = sanitizeRoutineStepId(stepId);
  if (!safeStepId) {
    return routine;
  }

  const completedSteps = new Set(routine.completedStepIds);
  const activeDates = new Set(routine.activeDates);
  const today = routine.currentDate;

  if (completed) {
    completedSteps.add(safeStepId);
  } else {
    completedSteps.delete(safeStepId);
  }

  const nextCompletedStepIds = Array.from(completedSteps);
  if (nextCompletedStepIds.length) {
    activeDates.add(today);
  } else {
    activeDates.delete(today);
  }

  const routineIsComplete = ROUTINE_STEP_IDS.every((candidate) => completedSteps.has(candidate));

  return {
    ...routine,
    completedStepIds: nextCompletedStepIds,
    activeDates: sortRoutineDates(Array.from(activeDates)).slice(0, 60),
    completedAt: routineIsComplete ? nowIso() : null,
    reminderDismissedDate: completed ? routine.reminderDismissedDate : null,
    completionAcknowledgedDate:
      routineIsComplete && completed ? routine.completionAcknowledgedDate : null,
    updatedAt: nowIso(),
  };
}

function updateRoutineSessionMode(state, sessionMode) {
  const routine = advanceRoutineState(state);
  const safeSessionMode = sanitizeRoutineSessionMode(sessionMode);
  if (!safeSessionMode) {
    return routine;
  }

  return {
    ...routine,
    sessionMode: safeSessionMode,
    updatedAt: nowIso(),
  };
}

function resetRoutineForToday(state) {
  const routine = advanceRoutineState(state);
  return {
    ...routine,
    completedStepIds: [],
    completedAt: null,
    reminderDismissedDate: null,
    completionAcknowledgedDate: null,
    updatedAt: nowIso(),
  };
}

function dismissRoutineReminderForToday(state) {
  const routine = advanceRoutineState(state);
  return {
    ...routine,
    reminderDismissedDate: routine.currentDate,
    updatedAt: nowIso(),
  };
}

function acknowledgeRoutineCompletionForToday(state) {
  const routine = advanceRoutineState(state);
  return {
    ...routine,
    completionAcknowledgedDate: routine.currentDate,
    updatedAt: nowIso(),
  };
}

function defaultUserState() {
  return {
    trades: [],
    intakeRequests: [],
    watchlistItems: [],
    alertRules: [],
    notifications: [],
    alertEmailQueue: [],
    routine: defaultRoutineState(),
    settings: sanitizeSettings(DEFAULT_SETTINGS),
    newsTargets: [...DEFAULT_TARGETS],
    connectors: defaultConnectorsState(),
    dataSources: { brickeconomyAuthBlob: null, lastBrickeconomySyncAt: null },
  };
}

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadStore() {
  ensureDataDir();

  if (!fs.existsSync(STORE_FILE)) {
    return {
      users: [],
      userStates: {},
      settings: sanitizeSettings(DEFAULT_SETTINGS),
      trades: [],
      newsTargets: [...DEFAULT_TARGETS],
      feedbackItems: [],
    };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
    const rawUsers = Array.isArray(parsed.users) ? parsed.users : [];
    const preferredOwnerId = resolvePreferredOwnerId(rawUsers);
    const userStates = Object.fromEntries(
      Object.entries(parsed.userStates || {}).map(([userId, state]) => [
        userId,
        {
          ...defaultUserState(),
          ...state,
          settings: sanitizeSettings(state?.settings),
          routine: advanceRoutineState(state?.routine),
          newsTargets: uniqueStrings(state?.newsTargets || DEFAULT_TARGETS),
          trades: Array.isArray(state?.trades) ? state.trades : [],
          watchlistItems: sortWatchlistItems(
            Array.isArray(state?.watchlistItems)
              ? state.watchlistItems
                  .map(sanitizeWatchlistItem)
                  .filter((item) => item.ticker && item.label)
              : [],
          ),
          alertRules: Array.isArray(state?.alertRules)
            ? state.alertRules
                .map(sanitizeAlertRule)
                .filter((item) => item.ticker && item.label && item.threshold != null)
            : [],
            notifications: sortNotificationItems(
              Array.isArray(state?.notifications)
                ? state.notifications
                    .map(sanitizeNotificationItem)
                    .filter((item) => item.title && item.message)
                : [],
            ).slice(0, 40),
            alertEmailQueue: sortAlertEmailQueueItems(
              Array.isArray(state?.alertEmailQueue)
                ? state.alertEmailQueue
                    .map(sanitizeAlertEmailQueueItem)
                    .filter((item) => item.title && item.message && item.recipientEmail)
                : [],
            ).slice(0, 40),
            intakeRequests: Array.isArray(state?.intakeRequests)
              ? state.intakeRequests.map(sanitizeIntakeRequest)
              : [],
          connectors: Object.fromEntries(
            CONNECTOR_PROVIDERS.map((provider) => [
              provider.id,
              sanitizeConnectorRecord(provider.id, state?.connectors?.[provider.id]),
            ]),
          ),
          dataSources: {
            brickeconomyAuthBlob: state?.dataSources?.brickeconomyAuthBlob || null,
            lastBrickeconomySyncAt: state?.dataSources?.lastBrickeconomySyncAt || null,
          },
        },
      ]),
    );

    return {
      users: rawUsers.map((user, index) => sanitizeUserRecord(user, index, preferredOwnerId)),
      auth: parsed.auth,
      userStates,
      settings: sanitizeSettings(parsed.settings),
      trades: Array.isArray(parsed.trades) ? parsed.trades : [],
      newsTargets: uniqueStrings(parsed.newsTargets || DEFAULT_TARGETS),
      feedbackItems: sortFeedbackItems(
        Array.isArray(parsed.feedbackItems)
          ? parsed.feedbackItems.map(sanitizeFeedbackItem).filter((item) => item.title && item.notes)
          : [],
      ),
    };
  } catch (error) {
    console.warn("Failed to parse store, starting fresh.", error.message);
    return {
      users: [],
      userStates: {},
      settings: sanitizeSettings(DEFAULT_SETTINGS),
      trades: [],
      newsTargets: [...DEFAULT_TARGETS],
      feedbackItems: [],
    };
  }
}

let store = loadStore();
let users = store.users;
let authState = store.auth || { sessions: [], events: [], legacyTokenCutoffs: {} };
let userStates = store.userStates;
let guestTrades = store.trades;
let guestTargets = store.newsTargets;
let appSettings = store.settings;
let feedbackItems = store.feedbackItems || [];

function maxTradeId() {
  const stateTrades = Object.values(userStates).flatMap((state) => state.trades || []);
  return [...guestTrades, ...stateTrades].reduce(
    (max, trade) => Math.max(max, Number(trade.id || 0)),
    0,
  );
}

let tradeId = maxTradeId() + 1;

function maxRequestId() {
  const stateRequests = Object.values(userStates).flatMap((state) => state.intakeRequests || []);
  return stateRequests.reduce((max, request) => Math.max(max, Number(request.id || 0)), 0);
}

let requestId = maxRequestId() + 1;

function persistStore() {
  ensureDataDir();
  fs.writeFileSync(
    STORE_FILE,
    JSON.stringify(
      {
        users,
        auth: authState,
        userStates,
        settings: appSettings,
        trades: guestTrades,
        newsTargets: guestTargets,
        feedbackItems,
      },
      null,
      2,
    ),
  );
}

function resetStoreForTests() {
  authState = { sessions: [], events: [], legacyTokenCutoffs: {} };
  authRateLimiter.clear();
  store = {
    users: [],
    userStates: {},
    settings: sanitizeSettings(DEFAULT_SETTINGS),
    trades: [],
    newsTargets: [...DEFAULT_TARGETS],
    feedbackItems: [],
  };
  users = store.users;
  userStates = store.userStates;
  guestTrades = store.trades;
  guestTargets = store.newsTargets;
  appSettings = store.settings;
  feedbackItems = store.feedbackItems;
  tradeId = 1;
  requestId = 1;
  persistStore();
  if (legacyValuationRepository) legacyValuationRepository.reset();
  return store;
}

function getStoreSnapshot() {
  return JSON.parse(
    JSON.stringify({
      users,
      userStates,
      settings: appSettings,
      trades: guestTrades,
      newsTargets: guestTargets,
      feedbackItems,
    }),
  );
}

function getUserState(userId) {
  if (!userStates[userId]) {
    userStates[userId] = defaultUserState();
    persistStore();
  }

  if (!userStates[userId].connectors) {
    userStates[userId].connectors = defaultConnectorsState();
  }

  if (!Array.isArray(userStates[userId].intakeRequests)) {
    userStates[userId].intakeRequests = [];
  }

  if (!Array.isArray(userStates[userId].watchlistItems)) {
    userStates[userId].watchlistItems = [];
  }

  if (!Array.isArray(userStates[userId].alertRules)) {
    userStates[userId].alertRules = [];
  }

  if (!Array.isArray(userStates[userId].notifications)) {
    userStates[userId].notifications = [];
  }

  if (!Array.isArray(userStates[userId].alertEmailQueue)) {
    userStates[userId].alertEmailQueue = [];
  }

  userStates[userId].routine = advanceRoutineState(userStates[userId].routine);

  return userStates[userId];
}

const GAVIN_V3_BASELINE_AS_OF = "2026-09-23T12:00:00.000Z";

function seedDemoUserState(state, userId, options = {}) {
  if (!state || (!DEMO_MODE && !options.force) || state.trades.length || state.watchlistItems.length) {
    return;
  }

  const catalog = TRADEABLE_COLLECTIBLES.concat(DEMO_LEGO_SETS);
  const findBySku = (sku) => catalog.find((item) => item.sku === sku);

  const holdings = [
    {
      sku: "10305",
      quantity: 1,
      acquisitionPrice: 6999,
      salePrice: 8540,
      note: "Demo realised sale: Lion Knights' Castle. Channel: Local buyer groups.",
    },
    {
      sku: "10316",
      quantity: 1,
      acquisitionPrice: 14900,
      salePrice: 18684,
      note: "Demo realised sale: Rivendell. Channel: Local buyer groups.",
    },
    {
      sku: "75252",
      quantity: 1,
      acquisitionPrice: 22999,
      currentPrice: 28295,
      note: "Demo open holding: Imperial Star Destroyer at the BrickEconomy mark.",
    },
  ];

  const seededTrades = [];
  for (const holding of holdings) {
    const item = findBySku(holding.sku);
    if (!item) {
      continue;
    }
    const trade = createCollectibleTrade(item, "BUY", userId, {
      quantity: holding.quantity,
      entryPrice: holding.acquisitionPrice,
      currentPrice: holding.currentPrice || holding.acquisitionPrice,
      orderNote: holding.note,
      executionMode: "paper",
      executionProvider: "collecttrade",
      executionLabel: "Brick Alpha Paper",
    });
    if (holding.salePrice != null) {
      closeTrade(trade, "Local buyer groups", { price: holding.salePrice });
      trade.closedAt = GAVIN_V3_BASELINE_AS_OF;
      trade.updatedAt = GAVIN_V3_BASELINE_AS_OF;
    }
    seededTrades.push(trade);
  }

  if (seededTrades.length) {
    state.trades = seededTrades.concat(state.trades);
  }

  const watchlistSkus = ["75367", "71043", "76218"];
  for (const sku of watchlistSkus) {
    const item = findBySku(sku);
    if (!item) {
      continue;
    }
    state.watchlistItems.push(
      sanitizeWatchlistItem({
        id: crypto.randomUUID(),
        ticker: item.sku,
        label: item.name,
        desk: "collectibles",
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }),
    );
  }
  state.watchlistItems = sortWatchlistItems(state.watchlistItems).slice(0, 24);

  appendNotification(state, {
    ticker: "DEMO",
    label: "Demo",
    desk: "collectibles",
    title: "Demo portfolio seeded",
    message:
      "Imperial Star Destroyer is the open holding. Castle and Rivendell are already on the realised ledger.",
    type: "portfolio",
  });

  appendNotification(state, {
    ticker: "DEMO",
    label: "Demo",
    desk: "collectibles",
    title: "Watchlist preloaded",
    message: "Save more sets from Scan & Evaluate or Investment Analysis to grow the watchlist.",
    type: "portfolio",
  });
}

const legacyStoreRepository = createLegacyStoreRepository({
  getFeedback: () => feedbackItems,
  getStoreSnapshot,
  getUserState,
  getUsers: () => users,
  persist: persistStore,
});

const legacyAuthRepository = createLegacyAuthRepository({ getUsers: () => users, getUserState, getAuthState: () => authState, persist: persistStore, removeUserState: id => { delete userStates[id]; } });
const postgresAuthRepository = createPostgresAuthRepository(() => require('./db/prisma-client').getPrismaClient());
const authRepository = authConfig.mode === 'legacy' ? legacyAuthRepository
  : authConfig.mode === 'postgres' ? postgresAuthRepository
    : createDualAuthRepository(legacyAuthRepository, postgresAuthRepository);
const authService = createAuthService({ repository: authRepository, config: authConfig, defaultSettings: sanitizeSettings(DEFAULT_SETTINGS) });

let postgresFinancialService = null;

function getPostgresFinancialService() {
  if (!postgresFinancialService) {
    postgresFinancialService = createFinancialService({
      repository: createPostgresFinancialRepository(() => getPrismaClient()),
      defaultCurrency: financialConfig.defaultCurrency,
    });
  }
  return postgresFinancialService;
}

function isFinancialPostgresMode() {
  return financialConfig.mode === "postgres";
}

function isFinancialDualMode() {
  return financialConfig.mode === "dual";
}

let valuationProviderRegistry = null;
let legacyValuationService = null;
let legacyValuationRepository = null;
let postgresValuationService = null;

function getValuationProviderRegistry() {
  if (!valuationProviderRegistry) valuationProviderRegistry = createProviderRegistry({ config: valuationConfig });
  return valuationProviderRegistry;
}
function getLegacyValuationService() {
  if (!legacyValuationService) {
    legacyValuationRepository = createMemoryValuationRepository();
    legacyValuationService = createValuationService({
      repository: legacyValuationRepository,
      config: valuationConfig,
      providers: getValuationProviderRegistry(),
    });
  }
  return legacyValuationService;
}
function getPostgresValuationService() {
  if (!postgresValuationService) {
    postgresValuationService = createValuationService({
      repository: createPostgresValuationRepository(() => getPrismaClient()),
      config: valuationConfig,
      providers: getValuationProviderRegistry(),
    });
  }
  return postgresValuationService;
}
function getValuationService() {
  return valuationConfig.mode === "postgres" ? getPostgresValuationService() : getLegacyValuationService();
}

let connectorConfigInstance = null;
let connectorServiceInstance = null;
let connectorJobRunnerInstance = null;
let connectorProviderRegistryInstance = null;

function getConnectorConfig() {
  if (!connectorConfigInstance) connectorConfigInstance = readConnectorConfig(process.env);
  return connectorConfigInstance;
}

function getConnectorProviderRegistry() {
  if (!connectorProviderRegistryInstance) {
    connectorProviderRegistryInstance = createConnectorProviderRegistry({ config: getConnectorConfig() });
  }
  return connectorProviderRegistryInstance;
}

function getConnectorService() {
  const config = getConnectorConfig();
  if (config.mode === "legacy") return null;
  if (!connectorServiceInstance) {
    connectorServiceInstance = createConnectorService({
      repository: createPostgresConnectorRepository(() => getPrismaClient()),
      providers: getConnectorProviderRegistry(),
      config,
      valuation: getValuationService(),
    });
  }
  return connectorServiceInstance;
}

function getConnectorJobRunner() {
  const config = getConnectorConfig();
  if (config.mode === "legacy") return null;
  if (!connectorJobRunnerInstance) {
    connectorJobRunnerInstance = createJobRunner({
      repository: createPostgresConnectorRepository(() => getPrismaClient()),
      config,
      handlers: {},
    });
  }
  return connectorJobRunnerInstance;
}

function legacyConnectorHealthView() {
  return connectorFleetSummary().providers.map((stat) => ({
    ...stat,
    availability: CONNECTOR_PROVIDER_MAP[stat.id]?.availability || "manual_setup",
    supportsOrders: false,
    health:
      stat.online > 0
        ? "healthy"
        : stat.errors > 0
          ? "degraded"
          : stat.configured > 0
            ? "unknown"
            : "not_configured",
  }));
}

function connectorFreshnessForRecord(record) {
  return connectorFreshness({
    observedAt: record.lastSyncAt,
    now: Date.now(),
    refreshAfterMs: getConnectorConfig().refreshAfterMs,
    reviewMs: getConnectorConfig().reviewMs,
    sourceAvailable: true,
  });
}

function financialErrorStatus(error) {
  const code = error?.code || "";
  const message = String(error?.message || "");
  if (code === "unknown_trade") return 404;
  if (message.includes("financial_user_not_found")) return 404;
  return 400;
}

function publicUser(user) {
  const isDemo = /@collecttrade\.local$/.test(String(user.email || ""));
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: sanitizeUserRole(user.role),
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    ...(isDemo ? { isDemo: true } : {}),
  };
}

const connectorCipher = require('./services/connectors/cipher');

function encryptConnectorPayload(payload) {
  return connectorCipher.encryptConnectorPayload(payload, CONNECTOR_SECRET);
}

function decryptConnectorPayload(blob) {
  return connectorCipher.decryptConnectorPayload(blob, CONNECTOR_SECRET);
}

function maskValue(value, head = 6, tail = 4) {
  return connectorCipher.maskValue(value, head, tail);
}

function connectorCredentials(record) {
  return decryptConnectorPayload(record?.authBlob) || {};
}

function connectorStateForUser(userState, providerId) {
  if (!userState.connectors) {
    userState.connectors = defaultConnectorsState();
  }

  if (!userState.connectors[providerId]) {
    userState.connectors[providerId] = defaultConnectorRecord(providerId);
  }

  userState.connectors[providerId] = sanitizeConnectorRecord(
    providerId,
    userState.connectors[providerId],
  );
  return userState.connectors[providerId];
}

function buildConnectorView(providerId, rawState) {
  const provider = CONNECTOR_PROVIDER_MAP[providerId];
  const state = sanitizeConnectorRecord(providerId, rawState);
  const credentials = connectorCredentials(state);
  const maskedConfig =
    providerId === "valr"
      ? {
          subAccountId: state.config.subAccountId || "",
          preferredPair: state.config.preferredPair || VALR_SIGNAL_MARKET_MAP.BTCUSD.defaultPair,
          apiKeyMasked: credentials.apiKey ? maskValue(credentials.apiKey) : "",
          hasSecret: Boolean(credentials.apiSecret),
        }
      : providerId === "saxo"
        ? {
            environment: state.config.environment || "simulation",
            appKeyMasked: credentials.appKey ? maskValue(credentials.appKey) : "",
            accountKeyMasked: credentials.accountKey ? maskValue(credentials.accountKey) : "",
            hasSecret: Boolean(credentials.appSecret),
          }
      : state.config;

  return {
    id: provider.id,
    name: provider.name,
    desk: provider.desk,
    authType: provider.authType,
    availability: provider.availability,
    capabilities: provider.capabilities,
    docsUrl: provider.docsUrl,
    notes: provider.notes,
    configured: state.configured,
    status: state.status,
    lastTestAt: state.lastTestAt,
    lastSyncAt: state.lastSyncAt,
    lastError: state.lastError,
    config: maskedConfig,
    accountSnapshot: state.accountSnapshot,
    supportsSync: providerId === "valr",
  };
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function readBearerToken(req) {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return null;
  }

  return authHeader.slice(7).trim();
}

async function optionalAuth(req, res, next) {
  try {
    req.user = await authService.authenticate(readBearerToken(req));
    req.userState = req.user ? getUserState(req.user.id) : null;
    if (req.user) req.userState.settings = await authService.getSettings(req.user.id);
    next();
  } catch { res.status(503).json({ ok: false, error: 'auth_unavailable' }); }
}

function requireAuth(req, res, next) {
  return optionalAuth(req, res, () => {
    if (!req.user) return res.status(401).json({ ok: false, error: 'unauthorized' });
    next();
  });
}
function ema(values, period) {
  if (!values.length) {
    return [];
  }

  const multiplier = 2 / (period + 1);
  const result = [values[0]];

  for (let index = 1; index < values.length; index += 1) {
    result.push(values[index] * multiplier + result[index - 1] * (1 - multiplier));
  }

  return result;
}

function sma(values, period) {
  if (values.length < period) {
    return values.map((_, index) => {
      if (index < period - 1) {
        return null;
      }

      const window = values.slice(index - period + 1, index + 1);
      return window.reduce((sum, value) => sum + value, 0) / period;
    });
  }

  const result = new Array(values.length).fill(null);

  for (let index = period - 1; index < values.length; index += 1) {
    const window = values.slice(index - period + 1, index + 1);
    result[index] = window.reduce((sum, value) => sum + value, 0) / period;
  }

  return result;
}

function average(values) {
  const numeric = values.filter((value) => Number.isFinite(Number(value))).map(Number);
  if (!numeric.length) {
    return null;
  }

  return numeric.reduce((sum, value) => sum + value, 0) / numeric.length;
}

function rsi(values, period = 14) {
  if (values.length < period + 1) {
    return values.map(() => 50);
  }

  const output = new Array(period).fill(50);
  let gains = 0;
  let losses = 0;

  for (let index = 1; index <= period; index += 1) {
    const delta = values[index] - values[index - 1];
    if (delta >= 0) {
      gains += delta;
    } else {
      losses -= delta;
    }
  }

  let averageGain = gains / period;
  let averageLoss = losses / period;
  output.push(averageLoss === 0 ? 100 : 100 - 100 / (1 + averageGain / averageLoss));

  for (let index = period + 1; index < values.length; index += 1) {
    const delta = values[index] - values[index - 1];
    const gain = Math.max(delta, 0);
    const loss = Math.max(-delta, 0);

    averageGain = (averageGain * (period - 1) + gain) / period;
    averageLoss = (averageLoss * (period - 1) + loss) / period;

    if (averageLoss === 0) {
      output.push(100);
      continue;
    }

    const relativeStrength = averageGain / averageLoss;
    output.push(100 - 100 / (1 + relativeStrength));
  }

  return output;
}

function mfi(points, period = 14) {
  if (!Array.isArray(points) || points.length < period + 1) {
    return Array.isArray(points) ? points.map(() => 50) : [];
  }

  const output = new Array(period).fill(50);

  for (let index = period; index < points.length; index += 1) {
    let positiveFlow = 0;
    let negativeFlow = 0;

    for (let lookback = index - period + 1; lookback <= index; lookback += 1) {
      const previousPrice = Number(points[lookback - 1]?.value);
      const currentPrice = Number(points[lookback]?.value);
      const volume = Number(points[lookback]?.volume);

      if (!Number.isFinite(previousPrice) || !Number.isFinite(currentPrice) || !Number.isFinite(volume) || volume <= 0) {
        continue;
      }

      const rawFlow = currentPrice * volume;
      if (currentPrice > previousPrice) {
        positiveFlow += rawFlow;
      } else if (currentPrice < previousPrice) {
        negativeFlow += rawFlow;
      }
    }

    if (positiveFlow === 0 && negativeFlow === 0) {
      output.push(50);
      continue;
    }

    if (negativeFlow === 0) {
      output.push(100);
      continue;
    }

    const moneyRatio = positiveFlow / negativeFlow;
    output.push(100 - 100 / (1 + moneyRatio));
  }

  return output;
}

function signFromDiff(value) {
  if (value > 0) {
    return 1;
  }

  if (value < 0) {
    return -1;
  }

  return 0;
}

function countRecentBraids(diffSeries) {
  let changes = 0;

  for (let index = 1; index < diffSeries.length; index += 1) {
    const previous = signFromDiff(diffSeries[index - 1]);
    const current = signFromDiff(diffSeries[index]);
    if (previous !== 0 && current !== 0 && previous !== current) {
      changes += 1;
    }
  }

  return changes;
}

function summarizeRsiSignal(value) {
  if (value >= 70) {
    return "Overbought";
  }

  if (value >= 60) {
    return "Bullish";
  }

  if (value <= 30) {
    return "Oversold";
  }

  if (value <= 40) {
    return "Bearish";
  }

  return "Neutral";
}

function summarizeMfiSignal(value) {
  if (value >= 80) {
    return "Overbought";
  }

  if (value >= 65) {
    return "Elevated";
  }

  if (value <= 20) {
    return "Oversold";
  }

  if (value <= 35) {
    return "Soft";
  }

  return "Neutral";
}

function summarizeTechnicalBias(score) {
  if (score >= 5) {
    return "Strong Buy";
  }

  if (score >= 2) {
    return "Buy";
  }

  if (score <= -5) {
    return "Strong Sell";
  }

  if (score <= -2) {
    return "Sell";
  }

  return "Neutral";
}

function formatIntervalLabel(interval) {
  return String(interval || "")
    .replace(/^(\d+)([a-z]+)$/i, (_match, amount, unit) => `${amount}${unit.toUpperCase()}`);
}

function aggregateSeries(series, bucketSize) {
  if (!Array.isArray(series) || bucketSize <= 1) {
    return series;
  }

  const aggregated = [];
  for (let index = 0; index < series.length; index += bucketSize) {
    const bucket = series.slice(index, index + bucketSize);
    const finalPoint = bucket[bucket.length - 1];
    if (finalPoint) {
      aggregated.push(finalPoint);
    }
  }

  return aggregated;
}

function buildBtcFibonacciProfile(currentPrice, volumeProfile) {
  const range = BTC_FIBONACCI_REPORT.swingHigh - BTC_FIBONACCI_REPORT.swingLow;
  const extension1272 = BTC_FIBONACCI_REPORT.swingLow + range * 1.272;
  const extension1618 = BTC_FIBONACCI_REPORT.swingLow + range * 1.618;
  const distanceToImmediate =
    ((BTC_FIBONACCI_REPORT.immediateResistance - currentPrice) / currentPrice) * 100;
  const distanceToPivot =
    ((BTC_FIBONACCI_REPORT.technicalPivot - currentPrice) / currentPrice) * 100;

  return {
    reportDate: BTC_FIBONACCI_REPORT.reportDate,
    sourceLabel: BTC_FIBONACCI_REPORT.sourceLabel,
    anchorSwing: {
      low: BTC_FIBONACCI_REPORT.swingLow,
      high: BTC_FIBONACCI_REPORT.swingHigh,
    },
    retracement618: {
      label: "61.8% Retracement",
      price: BTC_FIBONACCI_REPORT.immediateResistance,
      note: "Most critical near-term level from the report.",
    },
    psychologicalBarrier: {
      label: "Psychological Barrier",
      price: BTC_FIBONACCI_REPORT.psychologicalBarrier,
      note: "Expect heavy volatility and resting sell orders around this round number.",
    },
    technicalPivot: {
      label: "Technical Pivot",
      price: BTC_FIBONACCI_REPORT.technicalPivot,
      note: "Primary short-term take-profit area for laddered exits.",
    },
    correctionZone: {
      low: BTC_FIBONACCI_REPORT.correctionZoneLow,
      high: BTC_FIBONACCI_REPORT.correctionZoneHigh,
      note: "Likely retracement zone if BTC loses the 61.8% level cleanly.",
    },
    majorSupport: {
      price: BTC_FIBONACCI_REPORT.majorSupport,
      note: "Bullish structure is at real risk if this floor breaks.",
    },
    extensions: [
      {
        label: "127.2% Extension",
        price: Number(extension1272.toFixed(2)),
        note: "Often marks the first pause after a major breakout.",
      },
      {
        label: "161.8% Extension",
        price: Number(extension1618.toFixed(2)),
        note: "Classic institutional target for the broader cycle extension.",
      },
    ],
    ladderedExit: [
      {
        label: "Trim 10%",
        price: BTC_FIBONACCI_REPORT.psychologicalBarrier,
      },
      {
        label: "Trim 20-30%",
        price: BTC_FIBONACCI_REPORT.technicalPivot,
      },
    ],
    currentContext:
      volumeProfile?.stance === "Take Profit Watch"
        ? "Fib resistance and the volume warning are lining up, which supports taking something off into strength."
        : distanceToImmediate <= 0
          ? "BTC is already through the 61.8% level, so the next Fib decision point is whether it can hold above it cleanly."
          : distanceToImmediate <= 2
            ? "BTC is close enough to the 61.8% retracement that the next reaction matters more than fresh chasing."
            : "BTC is still working toward the next Fib resistance cluster rather than trading directly into it.",
    distanceToImmediateResistancePct: Number(distanceToImmediate.toFixed(2)),
    distanceToTechnicalPivotPct: Number(distanceToPivot.toFixed(2)),
  };
}

function buildVolumeProfile(market, points, closes, ema8Series, ema21Series, mfiSeries) {
  const recentClose = closes.at(-1) ?? market.basePrice;
  const lookbackClose = closes.at(-7) ?? recentClose;
  const recentHigh = Math.max(...closes.slice(-30));
  const supportWindow = closes.slice(-24);
  const recentSupport = supportWindow.length ? Math.min(...supportWindow) : recentClose;
  const recentVolumeAvg = average(points.slice(-6).map((point) => point?.volume));
  const priorVolumeAvg = average(points.slice(-12, -6).map((point) => point?.volume));
  const volumeAvailable = Number.isFinite(recentVolumeAvg) && Number.isFinite(priorVolumeAvg) && priorVolumeAvg > 0;
  const priceChange = lookbackClose ? (recentClose - lookbackClose) / lookbackClose : 0;
  const volumeChange = volumeAvailable ? (recentVolumeAvg - priorVolumeAvg) / priorVolumeAvg : null;
  const resistanceDistance = recentHigh ? (recentHigh - recentClose) / recentClose : null;
  const nearResistance =
    Number.isFinite(resistanceDistance) &&
    resistanceDistance >= 0 &&
    resistanceDistance <= Math.max(market.volatility * 6, 0.018);
  const emaTrendUp = ema8Series.at(-1) > ema21Series.at(-1);
  const emaTrendDown = ema8Series.at(-1) < ema21Series.at(-1);
  const mfiValue = Number((mfiSeries.at(-1) ?? 50).toFixed(1));
  const fadingRallyVolume =
    volumeAvailable &&
    priceChange > market.volatility * 2 &&
    volumeChange < -0.08;
  const confirmingRallyVolume =
    volumeAvailable &&
    priceChange > market.volatility * 2 &&
    volumeChange > 0.08;
  const heavySellPressure =
    volumeAvailable &&
    priceChange < -market.volatility * 2 &&
    volumeChange > 0.05;
  const followThrough =
    fadingRallyVolume && nearResistance
      ? "Weak"
      : heavySellPressure
        ? "Selling pressure"
        : confirmingRallyVolume
          ? "Healthy"
          : volumeAvailable
            ? "Mixed"
            : "Price-only estimate";

  let stance = "Wait";
  let tone = "muted";
  let narrative = "Participation is mixed, so the safer move is to wait for cleaner confirmation.";
  let recommendation = "Let price either pull back into support or prove it can break resistance with better participation.";

  if (!volumeAvailable) {
    if (nearResistance && mfiValue >= 65) {
      stance = "Take Profit Watch";
      tone = "warning";
      narrative = "Price is pressing into recent highs, but the feed is missing clean candle-volume data, so this is a structure-based caution rather than a full conviction breakout.";
      recommendation = "Protect some profit or tighten risk rather than adding fresh size into resistance.";
    } else if (emaTrendDown) {
      stance = "Short Watch";
      tone = "negative";
      narrative = "Price structure is leaning weaker, but this still needs better confirmation before it becomes a confident short.";
      recommendation = "Wait for price to stay below the fast EMA before pressing the short side.";
    }
  } else if (fadingRallyVolume && (nearResistance || mfiValue >= 65)) {
    stance = "Take Profit Watch";
    tone = "warning";
    narrative = "Price is still elevated, but participation is fading into nearby resistance, which raises the risk of an exhaustion move rather than a clean continuation.";
    recommendation = "Scale some profit or tighten stops instead of adding fresh size here.";
  } else if (emaTrendDown && (heavySellPressure || mfiValue <= 40)) {
    stance = "Short Watch";
    tone = "negative";
    narrative = "Momentum is slipping and sellers are starting to show better follow-through, which raises the odds of a deeper washout if support gives way.";
    recommendation = "Wait for a confirmed loss of the fast EMA before pressing shorts or looking for a lower re-entry.";
  } else if (emaTrendUp && confirmingRallyVolume && mfiValue < 75) {
    stance = "Trend Confirmed";
    tone = "positive";
    narrative = "Price and participation are moving together, which lowers the risk of a hollow breakout and keeps the trend healthier.";
    recommendation = "Momentum is being confirmed, so pullbacks are cleaner than outright profit taking.";
  }

  return {
    stance,
    tone,
    narrative,
    recommendation,
    rallyParticipation: !volumeAvailable
      ? "Unavailable"
      : fadingRallyVolume
        ? "Fading"
        : confirmingRallyVolume
          ? "Confirming"
          : "Mixed",
    followThrough,
    priceChangePercent: Number((priceChange * 100).toFixed(2)),
    volumeChangePercent:
      Number.isFinite(volumeChange) ? Number((volumeChange * 100).toFixed(1)) : null,
    recentVolumeAvg: Number.isFinite(recentVolumeAvg) ? Number(recentVolumeAvg.toFixed(0)) : null,
    priorVolumeAvg: Number.isFinite(priorVolumeAvg) ? Number(priorVolumeAvg.toFixed(0)) : null,
    resistanceLevel: Number.isFinite(recentHigh) ? roundPrice(market.ticker, recentHigh) : null,
    supportLevel: Number.isFinite(recentSupport) ? roundPrice(market.ticker, recentSupport) : null,
    mfi: {
      period: 14,
      value: mfiValue,
      signal: summarizeMfiSignal(mfiValue),
    },
    dataQuality: volumeAvailable ? "price-and-volume" : "price-only",
    derivativeContext:
      "Derivatives pressure still needs an exchange-level funding/open-interest feed; this panel is based on price and candle volume only.",
  };
}

function buildTechnicalSummary(
  market,
  points,
  closes,
  ema8Series,
  ema21Series,
  rsiSeries,
  mfiSeries,
  lastClose,
  intervalLabel = TWELVE_DATA_INTERVAL,
) {
  const movingAveragePeriods = [5, 10, 20, 50, 100, 200];
  const threshold = lastClose * Math.max(market.volatility * 0.12, 0.0003);
  const rsiValue = Number((rsiSeries.at(-1) ?? 50).toFixed(1));
  const volumeProfile = buildVolumeProfile(
    market,
    points,
    closes,
    ema8Series,
    ema21Series,
    mfiSeries,
  );

  const movingAverages = movingAveragePeriods.map((period) => {
    const series = sma(closes, period);
    const rawValue = series.at(-1);

    if (typeof rawValue !== "number" || !Number.isFinite(rawValue)) {
      return {
        period,
        label: `MA${period}`,
        value: null,
        signal: "Unavailable",
      };
    }

    const roundedValue = roundPrice(market.ticker, rawValue);
    const delta = lastClose - rawValue;
    const signal =
      Math.abs(delta) <= threshold ? "Neutral" : delta > 0 ? "Buy" : "Sell";

    return {
      period,
      label: `MA${period}`,
      value: roundedValue,
      signal,
    };
  });

  const buyCount = movingAverages.filter((entry) => entry.signal === "Buy").length;
  const sellCount = movingAverages.filter((entry) => entry.signal === "Sell").length;
  const neutralCount = movingAverages.filter((entry) => entry.signal === "Neutral").length;
  const score =
    buyCount -
    sellCount +
    (rsiValue >= 60 ? 1 : 0) -
    (rsiValue <= 40 ? 1 : 0);
  const summary = summarizeTechnicalBias(score);

  return {
    interval: intervalLabel,
    summary,
    narrative: `Based on moving averages, RSI, and money flow, the ${intervalLabel} buy/sell signal for ${market.label} is ${summary}.`,
    buyCount,
    sellCount,
    neutralCount,
    rsi: {
      period: 14,
      value: rsiValue,
      signal: summarizeRsiSignal(rsiValue),
    },
    mfi: volumeProfile.mfi,
    volumeProfile,
    movingAverages,
  };
}

function buildTechnicalTimeframes(market, series) {
  const timeframes = [
    {
      id: "1h",
      label: formatIntervalLabel(TWELVE_DATA_INTERVAL),
      bucketSize: 1,
    },
    {
      id: "4h",
      label: "4H",
      bucketSize: 4,
    },
    {
      id: "1d",
      label: "1D",
      bucketSize: 24,
    },
  ];

  return timeframes.map((timeframe) => {
    const timeframeSeries = aggregateSeries(series, timeframe.bucketSize);
    const closes = timeframeSeries.map((point) => point.value);
    const ema8Series = ema(closes, 8);
    const ema21Series = ema(closes, 21);
    const rsiSeries = rsi(closes, 14);
    const mfiSeries = mfi(timeframeSeries, 14);
    const lastClose = closes.at(-1) ?? series.at(-1)?.value ?? market.basePrice;
    return {
      id: timeframe.id,
      label: timeframe.label,
      ...buildTechnicalSummary(
        market,
        timeframeSeries,
        closes,
        ema8Series,
        ema21Series,
        rsiSeries,
        mfiSeries,
        lastClose,
        timeframe.label,
      ),
    };
  });
}

function marketBaseVolume(market) {
  if (market.desk === "crypto") {
    return 72000;
  }

  if (market.desk === "etfs") {
    return 8500000;
  }

  if (market.desk === "jse") {
    return 540000;
  }

  return 180000;
}

function buildSeedSeries(market) {
  const series = [];
  let price = market.basePrice;
  const start = Date.now() - HISTORY_LIMIT * 60 * 60 * 1000;
  const baseVolume = marketBaseVolume(market);

  for (let index = 0; index < HISTORY_LIMIT; index += 1) {
    const cycle = Math.sin(index / 5 + market.basePrice) * market.volatility * 0.42;
    const wobble = Math.cos(index / 7 + market.basePrice) * market.volatility * 0.21;
    const volumeCycle =
      1 +
      Math.abs(cycle + wobble) * 38 +
      Math.sin(index / 8 + market.basePrice) * 0.18 +
      (Math.random() - 0.5) * 0.12;
    price = price * (1 + market.drift + cycle + wobble);
    price = clamp(price, market.minPrice, market.maxPrice);
    series.push({
      time: new Date(start + index * 60 * 60 * 1000).toISOString(),
      value: roundPrice(market.ticker, price),
      volume: Math.max(1, Math.round(baseVolume * Math.max(0.35, volumeCycle))),
    });
  }

  return series;
}

function toLineSeries(ticker, values, timestamps) {
  return values.map((value, index) => ({
    time: timestamps[index],
    value: roundPrice(ticker, value),
  }));
}

function toUtcIso(datetimeValue) {
  const value = String(datetimeValue || "").trim();
  if (!value) {
    return nowIso();
  }

  if (value.endsWith("Z") || value.includes("T")) {
    return new Date(value).toISOString();
  }

  return new Date(value.replace(" ", "T") + "Z").toISOString();
}

let marketSeries = Object.fromEntries(MARKETS.map((market) => [market.ticker, buildSeedSeries(market)]));
let latestSignals = [];
let leadSignal = null;
let lastEngineTickAt = nowIso();
let liveMarketTickers = new Set();
let marketDataMeta = {
  provider: TWELVE_DATA_API_KEY ? "Twelve Data" : "Simulator",
  mode: TWELVE_DATA_API_KEY ? "hybrid" : "simulated",
  interval: TWELVE_DATA_INTERVAL,
  lastAttemptAt: null,
  lastSuccessAt: null,
  lastError: TWELVE_DATA_API_KEY ? "Waiting for first live market sync." : null,
  sourceStatus: MARKETS.map((market) => ({
    ticker: market.ticker,
    label: market.label,
    desk: market.desk,
    provider: TWELVE_DATA_API_KEY ? "Twelve Data" : "Simulator",
    status: TWELVE_DATA_API_KEY ? "pending" : "simulated",
    points: marketSeries[market.ticker].length,
    detail: TWELVE_DATA_API_KEY ? "API key detected; awaiting first refresh." : "Using local simulator.",
  })),
};

function chooseLeadSignal(signals) {
  const scored = [...signals].sort((left, right) => {
    const actionRank = (signal) =>
      signal.action === "BUY" || signal.action === "SELL" ? 2 : signal.action === "HOLD" ? 1 : 0;

    return (
      actionRank(right) - actionRank(left) ||
      right.confidence - left.confidence ||
      Number(right.region === "south-africa") - Number(left.region === "south-africa")
    );
  });

  return scored[0] || null;
}

function sanitizeOrderNote(value) {
  return String(value || "").trim().slice(0, 240);
}

function truncateDecimals(value, decimals = 8) {
  const factor = 10 ** decimals;
  return Math.trunc(Number(value) * factor) / factor;
}

function parseTradeQuantity(value, options = {}) {
  const allowFractional = Boolean(options.allowFractional);
  const max = Number.isFinite(Number(options.max)) ? Number(options.max) : 1000000;
  const quantity = Number(value);
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > max) {
    return null;
  }

  if (!allowFractional && !Number.isInteger(quantity)) {
    return null;
  }

  const normalized = allowFractional
    ? truncateDecimals(quantity, 8)
    : Math.trunc(quantity);

  if (!Number.isFinite(normalized) || normalized <= 0) {
    return null;
  }

  return Number(normalized.toFixed(8));
}

function normalizeStoredQuantity(value) {
  const quantity = Number(value);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return 1;
  }

  return Number(truncateDecimals(quantity, 8).toFixed(8));
}

function quantityPolicyForTrade(input = {}) {
  if (input.assetClass === "collectible") {
    return {
      allowFractional: false,
      max: 1000,
    };
  }

  if (input.executionProvider === "valr" || input.desk === "crypto" || input.marketTicker === "BTCUSD") {
    return {
      allowFractional: true,
      max: 100,
    };
  }

  return {
    allowFractional: false,
    max: 1000,
  };
}

function normalizeTradePrice(trade, value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  if (trade.assetClass === "collectible") {
    return Number(numeric.toFixed(2));
  }

  return roundPrice(trade.marketTicker, numeric);
}

function sanitizeTradePlanValue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }

  return numeric;
}

function sanitizeAcquisitionPrice(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return null;
  }

  return Number(numeric.toFixed(2));
}

function applyTradePlan(trade) {
  const stopPrice = normalizeTradePrice(trade, sanitizeTradePlanValue(trade.stopPrice));
  const targetPrice = normalizeTradePrice(trade, sanitizeTradePlanValue(trade.targetPrice));
  const riskBudgetRaw = sanitizeTradePlanValue(trade.riskBudget);
  const quantity = normalizeStoredQuantity(trade.quantity);
  const riskPerUnit = stopPrice != null ? Math.abs(trade.entryPrice - stopPrice) : null;
  const rewardPerUnit = targetPrice != null ? Math.abs(targetPrice - trade.entryPrice) : null;

  trade.stopPrice = stopPrice;
  trade.targetPrice = targetPrice;
  trade.riskBudget = riskBudgetRaw != null ? Number(riskBudgetRaw.toFixed(2)) : null;
  trade.riskAmount =
    riskPerUnit != null ? Number((riskPerUnit * quantity).toFixed(2)) : null;
  trade.rewardAmount =
    rewardPerUnit != null ? Number((rewardPerUnit * quantity).toFixed(2)) : null;
  trade.riskRewardRatio =
    riskPerUnit && rewardPerUnit
      ? Number((rewardPerUnit / riskPerUnit).toFixed(2))
      : null;
}

function updateTradeValuation(trade, price) {
  const normalizedPrice = normalizeTradePrice(trade, price);
  if (normalizedPrice == null) {
    return false;
  }

  const quantity = normalizeStoredQuantity(trade.quantity);
  const direction = trade.side === "SELL" ? -1 : 1;
  const pnlPercent =
    trade.entryPrice > 0
      ? ((normalizedPrice - trade.entryPrice) / trade.entryPrice) * 100 * direction
      : 0;
  const pnlAmount =
    (normalizedPrice - trade.entryPrice) * quantity * direction;
  const entryValue = trade.entryPrice * quantity;
  const currentValue = normalizedPrice * quantity;
  let changed = false;

  const nextValues = {
    currentPrice: normalizedPrice,
    quantity,
    pnl: Number(pnlPercent.toFixed(2)),
    pnlAmount: Number(pnlAmount.toFixed(2)),
    entryValue: Number(entryValue.toFixed(2)),
    currentValue: Number(currentValue.toFixed(2)),
  };

  for (const [key, nextValue] of Object.entries(nextValues)) {
    if (trade[key] !== nextValue) {
      trade[key] = nextValue;
      changed = true;
    }
  }

  return changed;
}

function buildSignalTradePlan(market, lastClose, ema8Now, ema21Now, closes) {
  const lookback = Math.min(12, closes.length);
  const recentWindow = closes.slice(-lookback);
  const recentLow = Math.min(...recentWindow);
  const recentHigh = Math.max(...recentWindow);
  const structureBuffer = Math.max(
    lastClose * market.volatility * 0.8,
    Math.abs(ema8Now - ema21Now) * 0.75,
    lastClose * 0.001,
  );
  const support = Math.min(recentLow, ema21Now);
  const resistance = Math.max(recentHigh, ema21Now);
  const buyStopRaw = Math.max(0.00001, support - structureBuffer);
  const sellStopRaw = resistance + structureBuffer;
  const buyStop = roundPrice(market.ticker, buyStopRaw);
  const sellStop = roundPrice(market.ticker, sellStopRaw);
  const buyRisk = Math.max(lastClose - buyStop, structureBuffer);
  const sellRisk = Math.max(sellStop - lastClose, structureBuffer);
  const buyTarget = roundPrice(
    market.ticker,
    Math.max(resistance + structureBuffer, lastClose + buyRisk * 2),
  );
  const sellTarget = roundPrice(
    market.ticker,
    Math.max(0.00001, Math.min(support - structureBuffer, lastClose - sellRisk * 2)),
  );

  return {
    lookback,
    recentLow: roundPrice(market.ticker, recentLow),
    recentHigh: roundPrice(market.ticker, recentHigh),
    support: roundPrice(market.ticker, support),
    resistance: roundPrice(market.ticker, resistance),
    buy: {
      stopPrice: buyStop,
      targetPrice: buyTarget,
      rationale: "Stop below recent support and the 21 EMA buffer. Target recent highs or a 2R push.",
      source: "Recent swing low + EMA21",
    },
    sell: {
      stopPrice: sellStop,
      targetPrice: sellTarget,
      rationale: "Stop above recent resistance and the 21 EMA buffer. Target recent lows or a 2R flush.",
      source: "Recent swing high + EMA21",
    },
  };
}

function classifySignal(market, series) {
  const closes = series.map((point) => point.value);
  const timestamps = series.map((point) => point.time);
  const ema8Series = ema(closes, 8);
  const ema21Series = ema(closes, 21);
  const rsiSeries = rsi(closes, 14);
  const mfiSeries = mfi(series, 14);

  const lastIndex = closes.length - 1;
  const lastClose = closes[lastIndex];
  const previousClose = closes[lastIndex - 1];
  const ema8Now = ema8Series[lastIndex];
  const ema8Previous = ema8Series[lastIndex - 1];
  const ema21Now = ema21Series[lastIndex];
  const ema21Previous = ema21Series[lastIndex - 1];
  const diffSeries = ema8Series.slice(-8).map((value, index) => value - ema21Series[ema21Series.length - 8 + index]);
  const spread = Math.abs(ema8Now - ema21Now) / lastClose;
  const previousSpread = Math.abs(ema8Previous - ema21Previous) / previousClose;
  const gapState =
    spread > previousSpread + 0.0001 ? "widening" : spread + 0.0001 < previousSpread ? "narrowing" : "steady";
  const bullishCross = ema8Previous <= ema21Previous && ema8Now > ema21Now;
  const bearishCross = ema8Previous >= ema21Previous && ema8Now < ema21Now;
  const anchorCloses = closes.filter((_, index) => index % 4 === 0);
  const anchorEma8 = ema(anchorCloses, 8);
  const anchorEma21 = ema(anchorCloses, 21);
  const anchorTrend =
    anchorEma8.at(-1) > anchorEma21.at(-1)
      ? "bullish"
      : anchorEma8.at(-1) < anchorEma21.at(-1)
        ? "bearish"
        : "neutral";
  const braids = countRecentBraids(diffSeries);
  const chop = braids >= 2 || spread < market.volatility * 0.45;
  const retestWindow = market.volatility * 2.1;
  const bullishRetest =
    ema8Now > ema21Now &&
    anchorTrend === "bullish" &&
    Math.abs(lastClose - ema21Now) / lastClose < retestWindow &&
    lastClose > ema21Now;
  const bearishRejection =
    ema8Now < ema21Now &&
    anchorTrend === "bearish" &&
    Math.abs(lastClose - ema21Now) / lastClose < retestWindow &&
    lastClose < ema21Now;

  let action = "HOLD";
  let setup = "Trend continuation";
  let thesis = "Price is holding its current structure; patience matters more than forcing the next entry.";

  if (chop) {
    action = "HOLD";
    setup = "Neutral chop";
    thesis = "The 8 and 21 are braiding. Stand aside until the averages separate cleanly.";
  } else if (bullishCross && lastClose > ema8Now) {
    action = "BUY";
    setup = "Bullish 8/21 cross";
    thesis = "Momentum flipped up and price is already respecting the fast EMA.";
  } else if (bearishCross && lastClose < ema8Now) {
    action = "SELL";
    setup = "Bearish 8/21 cross";
    thesis = "Momentum rolled over and price is staying beneath the fast EMA.";
  } else if (bullishRetest) {
    action = "BUY";
    setup = "21 EMA retest";
    thesis = "Trend remains up, the pullback is shallow, and the 21 EMA is acting as support.";
  } else if (bearishRejection) {
    action = "SELL";
    setup = "21 EMA rejection";
    thesis = "The rally into the 21 EMA failed, keeping bears in control.";
  } else if (ema8Now > ema21Now && lastClose > ema8Now) {
    action = "HOLD";
    setup = "Long bias continuation";
    thesis = "The trend is constructive, but the cleaner entry is the next retest instead of chasing.";
  } else if (ema8Now < ema21Now && lastClose < ema8Now) {
    action = "HOLD";
    setup = "Short bias continuation";
    thesis = "The downtrend remains intact, but the higher-quality setup is a rally back toward the 21 EMA.";
  }

  const confidence = clamp(
    56 +
      Number(bullishCross || bearishCross) * 14 +
      Number(bullishRetest || bearishRejection) * 11 +
      Number(anchorTrend !== "neutral") * 6 +
      Number(gapState === "widening") * 6 -
      braids * 6,
    42,
    95,
  );
  const technicalTimeframes = buildTechnicalTimeframes(market, series);
  const primaryTechnicalSummary =
    technicalTimeframes[0] ||
    buildTechnicalSummary(
      market,
      series,
      closes,
      ema8Series,
      ema21Series,
      rsiSeries,
      mfiSeries,
      lastClose,
      formatIntervalLabel(TWELVE_DATA_INTERVAL),
    );
  const technicalSummary = {
    ...primaryTechnicalSummary,
    timeframes: technicalTimeframes,
  };
  if (market.ticker === "BTCUSD") {
    technicalSummary.fibonacci = buildBtcFibonacciProfile(
      lastClose,
      technicalSummary.volumeProfile,
    );
  }

  if (market.ticker === "BTCUSD" && technicalSummary.volumeProfile?.stance === "Take Profit Watch") {
    thesis = `${thesis} Volume participation is fading into nearby resistance, so protect profit instead of adding fresh size.`;
  } else if (market.ticker === "BTCUSD" && technicalSummary.volumeProfile?.stance === "Short Watch") {
    thesis = `${thesis} If price loses the fast EMA with better selling pressure, it becomes a short-watch setup rather than a fresh long.`;
  }

  const tradePlan = buildSignalTradePlan(market, lastClose, ema8Now, ema21Now, closes);

  return {
    ticker: market.ticker,
    label: market.label,
    desk: market.desk,
    headline: `${market.label}: ${setup}`,
    region: market.region,
    action,
    setup,
    thesis,
    confidence,
    rsi: Number(rsiSeries.at(-1).toFixed(1)),
    technicalSummary,
    tradePlan,
    price: roundPrice(market.ticker, lastClose),
    ema8: roundPrice(market.ticker, ema8Now),
    ema21: roundPrice(market.ticker, ema21Now),
    anchorTrend,
    gapState,
    retest: bullishRetest || bearishRejection,
    chop,
    exitRule:
      action === "SELL" || anchorTrend === "bearish"
        ? "Exit short if price closes above the 8 EMA."
        : "Exit long if price closes below the 8 EMA.",
    generatedAt: nowIso(),
    chart: {
      price: series,
      ema8: toLineSeries(market.ticker, ema8Series, timestamps),
      ema21: toLineSeries(market.ticker, ema21Series, timestamps),
    },
  };
}

function updateTradeMetrics(trade, signal) {
  if (trade.status !== "open") {
    const frozenPrice = trade.exitPrice || trade.currentPrice || trade.entryPrice;
    return updateTradeValuation(trade, frozenPrice);
  }

  if (!signal) {
    return false;
  }

  const currentPrice = signal.price;
  let changed = updateTradeValuation(trade, currentPrice);

  const shouldClose =
    (trade.side === "BUY" && currentPrice < signal.ema8) ||
    (trade.side === "SELL" && currentPrice > signal.ema8);

  if (shouldClose && trade.executionMode !== "live") {
    trade.status = "closed";
    trade.exitPrice = currentPrice;
    trade.closedAt = nowIso();
    trade.exitReason = "Price closed through the 8 EMA";
    changed = true;
  } else if (shouldClose && trade.executionMode === "live") {
    const exitAlert = signal.exitRule || "EMA exit condition reached.";
    if (trade.exitAlert !== exitAlert) {
      trade.exitAlert = exitAlert;
      trade.exitAlertAt = nowIso();
      changed = true;
    }
  }

  if (changed) {
    trade.updatedAt = nowIso();
  }

  return changed;
}

function tickMarket(market, previousPrice, signal) {
  const bias =
    signal?.action === "BUY"
      ? market.drift + market.volatility * 0.08
      : signal?.action === "SELL"
        ? market.drift - market.volatility * 0.08
        : market.drift;
  const cycle = Math.sin(Date.now() / 180000 + market.basePrice) * market.volatility * 0.35;
  const noise = (Math.random() - 0.5) * market.volatility;
  const nextPrice = clamp(
    previousPrice * (1 + bias + cycle + noise),
    market.minPrice,
    market.maxPrice,
  );

  return roundPrice(market.ticker, nextPrice);
}

function tickMarketVolume(market, previousVolume, signal) {
  const baseline = Number(previousVolume) || marketBaseVolume(market);
  const directionalBias =
    signal?.action === "BUY" || signal?.action === "SELL" ? 1.04 : 0.99;
  const cycle = 1 + Math.sin(Date.now() / 240000 + market.basePrice) * 0.16;
  const noise = 1 + (Math.random() - 0.5) * 0.18;
  return Math.max(1, Math.round(baseline * directionalBias * cycle * noise));
}

function rebuildSignalsFromSeries() {
  latestSignals = MARKETS.map((market) => classifySignal(market, marketSeries[market.ticker]));
  leadSignal = chooseLeadSignal(latestSignals);
  lastEngineTickAt = nowIso();
  syncAlertNotificationsForAllUsers();
}

function syncTradeBookToLatestSignals() {
  let storeChanged = false;

  for (const trade of guestTrades) {
    storeChanged = updateTradeMetrics(
      trade,
      latestSignals.find((signal) => signal.ticker === trade.marketTicker),
    ) || storeChanged;
  }

  for (const state of Object.values(userStates)) {
    for (const trade of state.trades) {
      storeChanged = updateTradeMetrics(
        trade,
        latestSignals.find((signal) => signal.ticker === trade.marketTicker),
      ) || storeChanged;
    }
  }

  if (storeChanged) {
    persistStore();
  }
}

function engineTick() {
  for (const market of MARKETS) {
    if (TWELVE_DATA_API_KEY && liveMarketTickers.has(market.ticker)) {
      continue;
    }

    const series = marketSeries[market.ticker];
    const previousPoint = series[series.length - 1];
    const previousSignal = latestSignals.find((signal) => signal.ticker === market.ticker);
    const nextPoint = {
      time: nowIso(),
      value: tickMarket(market, previousPoint.value, previousSignal),
      volume: tickMarketVolume(market, previousPoint.volume, previousSignal),
    };

    marketSeries[market.ticker] = [...series.slice(-(HISTORY_LIMIT - 1)), nextPoint];
  }

  rebuildSignalsFromSeries();
  syncTradeBookToLatestSignals();
}

async function fetchTwelveDataSeries(market) {
  const params = new URLSearchParams({
    symbol: market.providerSymbol,
    interval: TWELVE_DATA_INTERVAL,
    outputsize: String(HISTORY_LIMIT),
    order: "asc",
    timezone: "UTC",
    apikey: TWELVE_DATA_API_KEY,
  });

  if (market.exchange) {
    params.set("exchange", market.exchange);
  }

  const response = await fetch(`${TWELVE_DATA_BASE_URL}/time_series?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Market API request failed with ${response.status}`);
  }

  const payload = await response.json();
  if (payload.status === "error" || !Array.isArray(payload.values)) {
    throw new Error(payload.message || "Market API returned no series data.");
  }

  const points = payload.values
    .map((entry) => ({
      time: toUtcIso(entry.datetime),
      value: roundPrice(market.ticker, Number(entry.close)),
      volume: Number.isFinite(Number(entry.volume)) ? Number(entry.volume) : null,
    }))
    .filter((entry) => Number.isFinite(entry.value));

  if (points.length < 24) {
    throw new Error("Market API returned too few candles for the EMA workflow.");
  }

  return points.slice(-HISTORY_LIMIT);
}

async function refreshMarketDataOnce() {
  if (!TWELVE_DATA_API_KEY) {
    marketDataMeta = {
      ...marketDataMeta,
      provider: "Simulator",
      mode: "simulated",
      lastAttemptAt: nowIso(),
      sourceStatus: MARKETS.map((market) => ({
        ticker: market.ticker,
        label: market.label,
        desk: market.desk,
        provider: "Simulator",
        status: "simulated",
        points: marketSeries[market.ticker].length,
        detail: "Using local simulator.",
      })),
    };
    return;
  }

  marketDataMeta.lastAttemptAt = nowIso();

  const results = await Promise.allSettled(
    MARKETS.map(async (market) => ({
      market,
      points: await fetchTwelveDataSeries(market),
    })),
  );

  const nextLiveTickers = new Set();
  const statuses = [];
  let liveMarkets = 0;
  let fallbackMarkets = 0;

  results.forEach((result, index) => {
    const market = MARKETS[index];

    if (result.status === "fulfilled") {
      marketSeries[market.ticker] = result.value.points;
      nextLiveTickers.add(market.ticker);
      liveMarkets += 1;
      statuses.push({
        ticker: market.ticker,
        label: market.label,
        desk: market.desk,
        provider: "Twelve Data",
        status: "live",
        points: result.value.points.length,
        detail: `${market.providerSymbol} via ${TWELVE_DATA_INTERVAL} candles.`,
      });
      return;
    }

    fallbackMarkets += 1;
    statuses.push({
      ticker: market.ticker,
      label: market.label,
      desk: market.desk,
      provider: "Simulator fallback",
      status: "fallback",
      points: marketSeries[market.ticker].length,
      detail: result.reason?.message || "Live candles unavailable; using local fallback.",
    });
  });

  liveMarketTickers = nextLiveTickers;
  marketDataMeta.provider = "Twelve Data";
  marketDataMeta.mode =
    liveMarkets === MARKETS.length ? "live" : liveMarkets > 0 ? "hybrid" : "simulated";
  marketDataMeta.sourceStatus = statuses;
  marketDataMeta.lastSuccessAt = liveMarkets > 0 ? nowIso() : marketDataMeta.lastSuccessAt;
  marketDataMeta.lastError =
    fallbackMarkets > 0
      ? "Some markets are using the simulator fallback."
      : null;

  rebuildSignalsFromSeries();
  syncTradeBookToLatestSignals();
}

function buildFallbackNews() {
  const seenAt = nowIso();
  return [
    {
      id: "fallback-za-rand",
      title: "South African macro desk waiting for a cleaner USD/ZAR pullback into the 21 EMA",
      link: "",
      sourceId: "fallback",
      sourceName: "Brick Alpha Desk",
      region: "south-africa",
      marketTicker: "USDZAR",
      publishedAt: null,
      seenAt,
      summary: "Fallback intelligence while live feeds refresh.",
    },
    {
      id: "fallback-global-btc",
      title: "Crypto risk appetite remains sensitive to momentum acceleration above the fast EMA",
      link: "",
      sourceId: "fallback",
      sourceName: "Brick Alpha Desk",
      region: "global",
      marketTicker: "BTCUSD",
      publishedAt: null,
      seenAt,
      summary: "Fallback intelligence while live feeds refresh.",
    },
  ];
}

function buildDemoNews() {
  const seenAt = nowIso();
  return [
    {
      id: "demo-lego-venue",
      title: "SEALED-BOX TAPE: Venator UCS keeps repricing as clean stock dries up ahead of retirement",
      link: "",
      sourceId: "demo",
      sourceName: "Brick Alpha Demo Feed",
      region: "global",
      marketTicker: "COLLECTIBLE:lego-star-wars-75367",
      publishedAt: null,
      seenAt,
      summary: "Demonstration headlines run locally under DEMO_MODE so the dashboard stays populated offline.",
    },
    {
      id: "demo-za-retail",
      title: "Local ZA retail shelves still turning for Icons and Marvel sets while resale holds a premium",
      link: "",
      sourceId: "demo",
      sourceName: "Brick Alpha Demo Feed",
      region: "south-africa",
      marketTicker: "COLLECTIBLE:lego-icons-10316",
      publishedAt: null,
      seenAt,
      summary: "Demonstration headlines run locally under DEMO_MODE so the dashboard stays populated offline.",
    },
    {
      id: "demo-forex",
      title: "USD/ZAR consolidates near the 21 EMA while the macro desk keeps its selective stance",
      link: "",
      sourceId: "demo",
      sourceName: "Brick Alpha Demo Feed",
      region: "south-africa",
      marketTicker: "USDZAR",
      publishedAt: null,
      seenAt,
      summary: "Demonstration headlines run locally under DEMO_MODE so the dashboard stays populated offline.",
    },
  ];
}

function seedDemoNews() {
  const fresh = buildDemoNews().concat(buildFallbackNews());
  newsItems = [...new Map(fresh.map((item) => [item.id, item])).values()].sort(
    (left, right) => Date.parse(right.createdAt || right.publishedAt || right.seenAt || 0) -
      Date.parse(left.createdAt || left.publishedAt || left.seenAt || 0),
  );
}

function detectMarketTicker(title) {
  const headline = String(title || "").toLowerCase();
  if (/rand|zar|jse|south africa|sa\b/.test(headline)) {
    return "USDZAR";
  }

  if (/spy|s&p 500|s&p500|spdr/.test(headline)) {
    return "SPY";
  }

  if (/qqq|nasdaq 100|nasdaq-100/.test(headline)) {
    return "QQQ";
  }

  if (/gold|bullion|gld/.test(headline)) {
    return "GLD";
  }

  if (/bitcoin|crypto|ethereum|coin/.test(headline)) {
    return "BTCUSD";
  }

  if (/euro|ecb|eur\/usd|eurozone/.test(headline)) {
    return "EURUSD";
  }

  return "USDZAR";
}

let newsItems = buildFallbackNews();
let newsMeta = {
  lastAttemptAt: null,
  lastSuccessAt: null,
  lastError: null,
  sourceStatus: [],
};

function normalizeNewsItem(source, item) {
  const publishedAt = item.isoDate
    ? new Date(item.isoDate).toISOString()
    : item.pubDate
      ? new Date(item.pubDate).toISOString()
      : null;
  const seenAt = nowIso();
  const link = item.link || "";

  return {
    id: crypto
      .createHash("sha1")
      .update(`${source.id}:${link || item.title || seenAt}`)
      .digest("hex")
      .slice(0, 16),
    title: String(item.title || "Untitled headline").trim(),
    link,
    sourceId: source.id,
    sourceName: source.name,
    region: source.region,
    marketTicker: detectMarketTicker(item.title),
    publishedAt,
    seenAt,
    summary: String(item.contentSnippet || item.content || "").replace(/<[^>]+>/g, " ").trim().slice(0, 220),
  };
}

async function refreshNewsOnce() {
  newsMeta.lastAttemptAt = nowIso();

  const results = await Promise.allSettled(
    NEWS_SOURCES.map(async (source) => {
      const feed = await parser.parseURL(source.url);
      return {
        source,
        items: (feed.items || []).slice(0, 8).map((item) => normalizeNewsItem(source, item)),
      };
    }),
  );

  const nextItems = [];
  const sourceStatus = [];

  results.forEach((result, index) => {
    const source = NEWS_SOURCES[index];
    if (result.status === "fulfilled") {
      sourceStatus.push({
        id: source.id,
        name: source.name,
        region: source.region,
        status: "ok",
        items: result.value.items.length,
      });
      nextItems.push(...result.value.items);
      return;
    }

    sourceStatus.push({
      id: source.id,
      name: source.name,
      region: source.region,
      status: "error",
      items: 0,
      detail: result.reason?.message || "Feed failed",
    });
  });

  newsMeta.sourceStatus = sourceStatus;

  if (nextItems.length) {
    newsItems = [...new Map(nextItems.map((item) => [item.link || item.id, item])).values()].sort((left, right) => {
      const leftDate = new Date(left.publishedAt || left.seenAt).getTime();
      const rightDate = new Date(right.publishedAt || right.seenAt).getTime();
      return rightDate - leftDate;
    });
    newsMeta.lastSuccessAt = nowIso();
    newsMeta.lastError = null;
    return;
  }

  if (!newsItems.length) {
    newsItems = buildFallbackNews();
  }

  newsMeta.lastError = "Live feeds unavailable; serving fallback items.";
}

function filterNewsByRegion(region) {
  if (region === "all") {
    return newsItems;
  }

  return newsItems.filter((item) => item.region === region);
}

function findCatalogItemById(collectibleId) {
  return PRODUCT_CATALOG.find((item) => item.id === collectibleId);
}

function findTradeableCollectibleById(collectibleId) {
  return TRADEABLE_COLLECTIBLES_ACTIVE.find((item) => item.id === collectibleId);
}

function findTradeableCollectibleBySkuOrId(value) {
  const key = String(value || "").toUpperCase();
  return TRADEABLE_COLLECTIBLES_ACTIVE.find(
    (item) =>
      String(item.id).toUpperCase() === key || String(item.sku).toUpperCase() === key,
  );
}

function collectionForRequest(req) {
  return req.userState ? req.userState.trades : guestTrades;
}

function targetsForRequest(req) {
  return req.userState ? req.userState.newsTargets : guestTargets;
}

function settingsForRequest(req) {
  return req.userState ? req.userState.settings : appSettings;
}

function latestSignalMap() {
  return new Map(latestSignals.map((signal) => [signal.ticker, signal]));
}

function alertLabelForKind(kind) {
  switch (kind) {
    case "price_below":
      return "Price below";
    case "rsi_above":
      return "RSI above";
    case "rsi_below":
      return "RSI below";
    case "price_above":
    default:
      return "Price above";
  }
}

function evaluateAlertRule(rule, signal) {
  if (!signal || !rule.enabled) {
    return {
      ...rule,
      metricValue: null,
      triggered: false,
      kindLabel: alertLabelForKind(rule.kind),
    };
  }

  const price = Number(signal.price);
  const rsi = Number(signal.rsi);
  let metricValue = null;
  let triggered = false;

  if (rule.kind === "price_above" || rule.kind === "price_below") {
    metricValue = Number.isFinite(price) ? Number(price.toFixed(8)) : null;
    triggered =
      metricValue != null &&
      (rule.kind === "price_above" ? metricValue >= rule.threshold : metricValue <= rule.threshold);
  } else if (rule.kind === "rsi_above" || rule.kind === "rsi_below") {
    metricValue = Number.isFinite(rsi) ? Number(rsi.toFixed(2)) : null;
    triggered =
      metricValue != null &&
      (rule.kind === "rsi_above" ? metricValue >= rule.threshold : metricValue <= rule.threshold);
  }

  return {
    ...rule,
    currentPrice: Number.isFinite(price) ? Number(price.toFixed(8)) : null,
    currentRsi: Number.isFinite(rsi) ? Number(rsi.toFixed(2)) : null,
    action: signal.action,
    confidence: signal.confidence,
    kindLabel: alertLabelForKind(rule.kind),
    metricValue,
    triggered,
  };
}

function buildWatchlistView(items) {
  const signalMap = latestSignalMap();
  return items.map((item) => {
    const signal = signalMap.get(item.ticker);
    const collectible = findTradeableCollectibleBySkuOrId(item.ticker);
    if (!signal && collectible) {
      return {
        ...item,
        kind: "collectible",
        assetClass: "collectible",
        collectibleId: collectible.id,
        category: collectible.category || collectible.brand,
        brand: collectible.brand,
        currentPrice: Number(collectible.price || 0),
        currentRsi: null,
        changePercent: Number(collectible.changePercent || 0),
        action: "WATCH",
        confidence: 72,
        headline: collectible.thesis || collectible.description || null,
        thesis: collectible.description || null,
        feedMode: "catalogue",
      };
    }
    return {
      ...item,
      currentPrice: signal ? signal.price : null,
      currentRsi: signal ? signal.rsi : null,
      action: signal ? signal.action : null,
      confidence: signal ? signal.confidence : null,
      headline: signal ? signal.headline : null,
      thesis: signal ? signal.thesis : null,
      feedMode: signal?.marketData?.mode || null,
    };
  });
}

function buildAlertsView(items) {
  const signalMap = latestSignalMap();
  return items.map((item) => evaluateAlertRule(item, signalMap.get(item.ticker)));
}

function buildAlertResponsePayload(userState) {
  const items = buildAlertsView(userState.alertRules || []);
  const plan = alertPlanForTier(userState.settings?.subscriptionTier);
  const deliveryQueue = sortAlertEmailQueueItems(userState.alertEmailQueue || []).slice(0, 8);
  return {
    items,
    summary: {
      ...buildAlertSummary(items),
      maxAllowed: plan.maxAlerts,
      remaining: Math.max(plan.maxAlerts - items.length, 0),
      overLimit: Math.max(items.length - plan.maxAlerts, 0),
      subscriptionTier: plan.id,
      emailEligible: Boolean(plan.emailEnabled),
      emailQueued: buildAlertEmailQueueSummary(userState.alertEmailQueue || []).queued,
    },
    plan: {
      id: plan.id,
      label: plan.label,
      maxAlerts: plan.maxAlerts,
      emailEnabled: plan.emailEnabled,
    },
    deliverySummary: buildAlertEmailQueueSummary(userState.alertEmailQueue || []),
    deliveryQueue,
  };
}

function appendNotification(userState, input) {
  const notification = sanitizeNotificationItem({
    id: crypto.randomUUID(),
    status: "unread",
    createdAt: nowIso(),
    ...input,
  });
  userState.notifications = sortNotificationItems([notification, ...(userState.notifications || [])]).slice(0, 40);
  return notification;
}

function appendAlertEmailQueueItem(userState, input) {
  const item = sanitizeAlertEmailQueueItem({
    id: crypto.randomUUID(),
    status: "queued",
    createdAt: nowIso(),
    ...input,
  });
  userState.alertEmailQueue = sortAlertEmailQueueItems([
    item,
    ...(userState.alertEmailQueue || []),
  ]).slice(0, 40);
  return item;
}

function syncAlertNotificationsForUser(userId, userState) {
  let changed = false;
  const signalMap = latestSignalMap();
  const settings = sanitizeSettings(userState.settings);
  const plan = alertPlanForTier(settings.subscriptionTier);
  const user = users.find((candidate) => candidate.id === userId);

  userState.alertRules.forEach((rule) => {
    const evaluated = evaluateAlertRule(rule, signalMap.get(rule.ticker));
    const nextTriggered = Boolean(evaluated.triggered);

    if (nextTriggered && !rule.lastTriggerState) {
      rule.lastTriggeredAt = nowIso();
      const message = `${evaluated.kindLabel} ${rule.threshold} is live${evaluated.metricValue != null ? ` (now ${evaluated.metricValue})` : ""}.`;
      if (settings.alertPreferences?.inAppEnabled !== false) {
        appendNotification(userState, {
          ticker: rule.ticker,
          label: rule.label,
          desk: rule.desk,
          type: "alert",
          title: `${rule.label} alert triggered`,
          message,
        });
      }
      if (
        plan.emailEnabled &&
        settings.alertPreferences?.emailEnabled &&
        user?.email
      ) {
        appendAlertEmailQueueItem(userState, {
          ticker: rule.ticker,
          label: rule.label,
          desk: rule.desk,
          title: `${rule.label} email alert queued`,
          message,
          recipientEmail: user.email,
          digestWindow: settings.alertPreferences?.digestWindow,
        });
      }
      changed = true;
    }

    if (rule.lastTriggerState !== nextTriggered) {
      rule.lastTriggerState = nextTriggered;
      rule.updatedAt = nowIso();
      changed = true;
    }
  });

  return changed;
}

function syncAlertNotificationsForAllUsers() {
  let changed = false;
  Object.entries(userStates).forEach(([userId, userState]) => {
    if (syncAlertNotificationsForUser(userId, userState)) {
      changed = true;
    }
  });
  if (changed) {
    persistStore();
  }
}

function normalizeValrBalances(payload) {
  const entries = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.balances)
        ? payload.balances
        : [];

  return entries
    .map((entry) => ({
      currency: entry?.currency || entry?.asset || entry?.symbol,
      available: entry?.available ?? entry?.availableBalance,
      reserved: entry?.reserved ?? entry?.reservedBalance ?? entry?.locked,
      total: entry?.total,
    }))
    .map(sanitizeBalanceEntry)
    .filter(Boolean)
    .sort((left, right) => Math.abs(right.total) - Math.abs(left.total));
}

async function valrRequest(record, method, endpointPath, body = null) {
  const credentials = connectorCredentials(record);
  if (!credentials.apiKey || !credentials.apiSecret) {
    throw new Error("connector_not_configured");
  }

  const payloadBody = body ? JSON.stringify(body) : "";
  const timestamp = Date.now().toString();
  const signature = crypto
    .createHmac("sha512", credentials.apiSecret)
    .update(timestamp)
    .update(method.toUpperCase())
    .update(endpointPath)
    .update(payloadBody);

  if (record.config.subAccountId) {
    signature.update(record.config.subAccountId);
  }

  const headers = {
    "Content-Type": "application/json",
    "X-VALR-API-KEY": credentials.apiKey,
    "X-VALR-SIGNATURE": signature.digest("hex"),
    "X-VALR-TIMESTAMP": timestamp,
  };

  if (record.config.subAccountId) {
    headers["X-VALR-SUB-ACCOUNT-ID"] = record.config.subAccountId;
  }

  const response = await fetch(`${VALR_BASE_URL}${endpointPath}`, {
    method,
    headers,
    body: payloadBody || undefined,
  });
  const responseText = await response.text();
  let data = null;
  if (responseText) {
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { message: responseText };
    }
  }

  if (!response.ok) {
    throw new Error(
      data?.errorCode ||
        data?.message ||
        data?.error ||
        `VALR responded with ${response.status}`,
    );
  }

  return data;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function formatDecimalString(value, decimals = 8) {
  const normalized = truncateDecimals(value, decimals);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return "";
  }

  return normalized.toFixed(decimals).replace(/\.?0+$/, "");
}

function buildCustomerOrderId(prefix = "CT") {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`
    .toUpperCase()
    .slice(0, 50);
}

let valrPairsCache = {
  fetchedAt: 0,
  pairs: {},
};

async function getValrPairsMap(force = false) {
  const isFresh = Date.now() - valrPairsCache.fetchedAt < VALR_PAIR_CACHE_MS;
  if (!force && isFresh && Object.keys(valrPairsCache.pairs).length) {
    return valrPairsCache.pairs;
  }

  const response = await fetch(`${VALR_BASE_URL}/v1/public/pairs`);
  if (!response.ok) {
    throw new Error(`VALR pair catalog unavailable (${response.status})`);
  }

  const payload = await response.json();
  const pairs = Object.fromEntries(
    (Array.isArray(payload) ? payload : [])
      .filter((entry) => entry?.symbol)
      .map((entry) => [
        String(entry.symbol).toUpperCase(),
        {
          symbol: String(entry.symbol).toUpperCase(),
          active: Boolean(entry.active),
          currencyPairType: String(entry.currencyPairType || "SPOT").toUpperCase(),
          baseCurrency: String(entry.baseCurrency || "").toUpperCase(),
          quoteCurrency: String(entry.quoteCurrency || "").toUpperCase(),
          minBaseAmount: Number(entry.minBaseAmount),
          maxBaseAmount: Number(entry.maxBaseAmount),
          minQuoteAmount: Number(entry.minQuoteAmount),
          maxQuoteAmount: Number(entry.maxQuoteAmount),
          baseDecimalPlaces: Number(entry.baseDecimalPlaces || 8),
        },
      ]),
  );

  valrPairsCache = {
    fetchedAt: Date.now(),
    pairs,
  };

  return pairs;
}

function executionProfileForDesk(userState, desk) {
  return sanitizeExecutionProfiles(userState?.settings?.executionProfiles)?.[desk] ||
    DEFAULT_SETTINGS.executionProfiles[desk] ||
    { mode: "paper", providerId: null };
}

function selectValrExecutionPair(signal, requestedPair, pairMap) {
  const signalMapping = VALR_SIGNAL_MARKET_MAP[signal?.ticker];
  if (!signalMapping) {
    throw new Error("live_execution_not_supported");
  }

  const pair = sanitizeValrPair(requestedPair, signalMapping.defaultPair);
  if (!signalMapping.supportedPairs.includes(pair)) {
    throw new Error("live_pair_unsupported");
  }

  const pairMeta = pairMap[pair];
  if (!pairMeta || !pairMeta.active || pairMeta.currencyPairType !== "SPOT") {
    throw new Error("live_pair_unavailable");
  }

  return {
    pair,
    pairMeta,
    signalMapping,
  };
}

function normalizeValrOrderStatus(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const toNumberOrNull = (value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  };

  return {
    orderId: payload.orderId || payload.id || null,
    orderStatusType: String(payload.orderStatusType || payload.status || "").trim() || null,
    currencyPair: String(payload.currencyPair || payload.pair || "").trim().toUpperCase() || null,
    originalQuantity: toNumberOrNull(payload.originalQuantity),
    remainingQuantity: toNumberOrNull(payload.remainingQuantity),
    orderSide: String(payload.orderSide || payload.side || "").trim().toUpperCase() || null,
    orderType: String(payload.orderType || "market").trim(),
    failedReason: String(payload.failedReason || "").trim(),
    orderUpdatedAt: payload.orderUpdatedAt ? toUtcIso(payload.orderUpdatedAt) : null,
    orderCreatedAt: payload.orderCreatedAt ? toUtcIso(payload.orderCreatedAt) : null,
    customerOrderId: String(payload.customerOrderId || "").trim() || null,
    timeInForce: String(payload.timeInForce || "").trim() || null,
  };
}

async function fetchValrOrderStatus(record, pair, customerOrderId) {
  const endpointPath =
    `/v1/orders/${encodeURIComponent(pair)}/customerorderid/${encodeURIComponent(customerOrderId)}`;
  return normalizeValrOrderStatus(await valrRequest(record, "GET", endpointPath));
}

async function pollValrOrderStatus(record, pair, customerOrderId, attempts = 4, delayMs = 350) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const status = await fetchValrOrderStatus(record, pair, customerOrderId);
      if (status) {
        return status;
      }
    } catch (error) {
      if (!String(error.message || "").startsWith("Invalid Order")) {
        throw error;
      }
    }

    if (attempt < attempts - 1) {
      await sleep(delayMs);
    }
  }

  return null;
}

async function placeValrMarketOrder(record, signal, side, quantity, preferredPair) {
  const pairMap = await getValrPairsMap();
  const { pair, pairMeta } = selectValrExecutionPair(signal, preferredPair, pairMap);
  const baseDecimalPlaces = Number.isFinite(pairMeta.baseDecimalPlaces)
    ? pairMeta.baseDecimalPlaces
    : 8;
  const normalizedQuantity = truncateDecimals(quantity, baseDecimalPlaces);

  if (!Number.isFinite(normalizedQuantity) || normalizedQuantity <= 0) {
    throw new Error("invalid_quantity");
  }

  if (Number.isFinite(pairMeta.minBaseAmount) && normalizedQuantity < pairMeta.minBaseAmount) {
    throw new Error("live_quantity_below_minimum");
  }

  if (Number.isFinite(pairMeta.maxBaseAmount) && normalizedQuantity > pairMeta.maxBaseAmount) {
    throw new Error("live_quantity_above_maximum");
  }

  const baseAmount = formatDecimalString(normalizedQuantity, baseDecimalPlaces);
  const customerOrderId = buildCustomerOrderId("CT");
  const acceptance = await valrRequest(record, "POST", "/v1/orders/market", {
    side,
    baseAmount,
    pair,
    customerOrderId,
    allowMargin: false,
  });
  const status = await pollValrOrderStatus(record, pair, customerOrderId);

  if (status?.orderStatusType === "Failed") {
    throw new Error(status.failedReason || "live_order_failed");
  }

  return {
    pair,
    baseAmount,
    acceptance,
    status,
    pairMeta,
  };
}

async function syncValrAccount(record) {
  const balances = normalizeValrBalances(
    await valrRequest(record, "GET", "/v1/account/balances"),
  );
  const fundedAssets = balances.filter((entry) => Math.abs(entry.total) > 0);
  const snapshot = {
    fetchedAt: nowIso(),
    balances,
    totalAssets: balances.length,
    fundedAssets: fundedAssets.length,
  };

  return {
    snapshot,
    detail:
      fundedAssets.length > 0
        ? `Retrieved ${fundedAssets.length} funded assets from VALR.`
        : "Retrieved balances from VALR.",
  };
}

async function testConnector(providerId, record) {
  if (providerId === "valr") {
    const { detail } = await syncValrAccount(record);
    return {
      status: "online",
      detail,
    };
  }

  if (providerId === "ibkr") {
    return {
      status: "manual_setup",
      detail: record.configured
        ? "IBKR gateway profile is saved. The dedicated Client Portal / Web API handshake is still required before live testing can run here."
        : "Save an IBKR gateway URL and account ID first, then complete the provider handshake.",
    };
  }

  if (providerId === "saxo") {
    return {
      status: "manual_setup",
      detail: record.configured
        ? "Saxo app credentials are saved. The OAuth session flow still needs to be completed before live testing can run here."
        : "Save your Saxo app credentials first, then complete the OAuth flow.",
    };
  }

  if (providerId === "easyequities") {
    return {
      status: "unsupported",
      detail: record.configured
        ? "EasyEquities is saved as a manual profile. No public trading API is wired into Brick Alpha yet."
        : "No public EasyEquities trading API is wired into Brick Alpha yet.",
    };
  }

  return {
    status: "manual_setup",
    detail: "This provider needs its dedicated OAuth or gateway flow before live testing can run here.",
  };
}

async function syncConnectorAccount(providerId, record) {
  if (providerId === "valr") {
    const { snapshot, detail } = await syncValrAccount(record);
    return {
      status: "online",
      snapshot,
      detail,
    };
  }

  throw new Error("sync_not_supported");
}

function connectorFleetSummary() {
  const providerStats = CONNECTOR_PROVIDERS.map((provider) => {
    const records = Object.values(userStates)
      .map((state) => sanitizeConnectorRecord(provider.id, state.connectors?.[provider.id]))
      .filter((record) => record.configured || provider.availability !== "live");

    return {
      id: provider.id,
      name: provider.name,
      configured: records.filter((record) => record.configured).length,
      online: records.filter((record) => record.status === "online").length,
      errors: records.filter((record) => record.lastError).length,
    };
  });

  const configured = providerStats.reduce((sum, provider) => sum + provider.configured, 0);
  const online = providerStats.reduce((sum, provider) => sum + provider.online, 0);
  const errors = providerStats.reduce((sum, provider) => sum + provider.errors, 0);

  return {
    configured,
    online,
    errors,
    providers: providerStats,
  };
}

function createTrade(signal, side, userId, overrides = {}) {
  const trade = {
    id: tradeId++,
    marketTicker: signal.ticker,
    ticker: signal.label,
    assetClass: "market",
    side,
    status: "open",
    entryPrice: signal.price,
    currentPrice: signal.price,
    pnl: 0,
    setup: signal.setup,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    owner: userId || "guest",
    ...overrides,
  };

  trade.quantity = parseTradeQuantity(
    trade.quantity,
    quantityPolicyForTrade({
      assetClass: trade.assetClass,
      desk: signal.desk,
      executionProvider: trade.executionProvider,
      marketTicker: trade.marketTicker,
    }),
  ) || 1;
  trade.orderNote = sanitizeOrderNote(trade.orderNote);
  trade.unitLabel =
    trade.unitLabel || (trade.assetClass === "collectible" ? "items" : "units");
  updateTradeValuation(trade, trade.currentPrice ?? trade.entryPrice);
  applyTradePlan(trade);
  return trade;
}

function createCollectibleTrade(item, side, userId, overrides = {}) {
  const entryPrice = Number(item.price || 0);
  const markedPrice = Number((entryPrice * (1 + Number(item.changePercent || 0) / 100)).toFixed(2));

  return createTrade(
    {
      ticker: `COLLECTIBLE:${item.id}`,
      label: item.name || `${item.brand} ${item.sku}`,
      price: entryPrice,
      setup: `${item.category || item.family || item.brand} collectible setup`,
    },
    side,
    userId,
    {
      assetClass: "collectible",
      collectibleId: item.id,
      category: item.category || item.brand || "Collectible",
      marketTicker: `COLLECTIBLE:${item.id}`,
      currentPrice: markedPrice,
      market: item.market || item.family || item.brand,
      venue: item.venue || item.sourceSheet || "LEGO Investments",
      note: item.note || item.thesis || item.description || "",
      unitLabel: "items",
      ...overrides,
    },
  );
}

function createIntakeRequest(userId, input) {
  const request = sanitizeIntakeRequest({
    ...input,
    id: requestId++,
    status: "new",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });

  return {
    ...request,
    owner: userId,
  };
}

function findTradeById(trades, tradeIdToFind) {
  return trades.find((trade) => String(trade.id) === String(tradeIdToFind));
}

function findIntakeRequestById(requests, requestIdToFind) {
  return requests.find((request) => String(request.id) === String(requestIdToFind));
}

function closeTrade(trade, exitReason, signal) {
  if (trade.status !== "open") {
    return false;
  }

  const closingPrice = signal?.price || trade.currentPrice || trade.entryPrice;
  trade.status = "closed";
  trade.exitPrice = normalizeTradePrice(trade, closingPrice);
  trade.closedAt = nowIso();
  trade.exitReason = exitReason || "Manual close";
  trade.updatedAt = nowIso();
  updateTradeValuation(trade, trade.exitPrice);
  return true;
}

async function buildHealth() {
  const databaseHealth = await getDatabaseHealth();
  const openTrades = Object.values(userStates)
    .flatMap((state) => state.trades)
    .filter((trade) => trade.status === "open").length;
  const openRequests = Object.values(userStates)
    .flatMap((state) => state.intakeRequests || [])
    .filter((request) => request.status !== "completed" && request.status !== "cancelled").length;
  const connectorSummary = connectorFleetSummary();
  const marketServiceStatus =
    marketDataMeta.mode === "live"
      ? "online"
      : marketDataMeta.mode === "hybrid"
        ? "degraded"
        : "simulated";
  const connectorServiceStatus =
    connectorSummary.online > 0
      ? "online"
      : connectorSummary.configured > 0
        ? connectorSummary.errors > 0
          ? "degraded"
          : "pending"
        : "pending";
  const productionFrontendReady = fs.existsSync(FRONTEND_INDEX_FILE);

  return {
    ok: true,
    services: {
      api: "online",
      engine: "online",
      marketData: marketServiceStatus,
      news: newsMeta.lastError ? "degraded" : "online",
      connectors: connectorServiceStatus,
      persistence: "online",
      database: databaseHealth.status,
    },
    metrics: {
      userCount: users.length,
      openTrades,
      openRequests,
      newsItems: newsItems.length,
      catalogItems: PRODUCT_CATALOG.length,
      catalogImportedAt: PRODUCT_CATALOG_DATA.generatedAt,
      catalogSourceLabel: PRODUCT_CATALOG_DATA.sourceLabel,
      feedbackItems: feedbackItems.length,
      unresolvedFeedbackItems: feedbackItems.filter((item) => item.status !== "resolved").length,
      productionFrontendReady,
      preferredRegion: appSettings.preferredRegion,
      configuredConnectors: connectorSummary.configured,
      onlineConnectors: connectorSummary.online,
      marketDataProvider: marketDataMeta.provider,
      marketDataMode: marketDataMeta.mode,
      marketDataInterval: marketDataMeta.interval,
      databaseConfigured: databaseHealth.configured,
      databaseEnvironment: databaseHealth.environment,
      lastEngineTickAt,
      lastMarketRefreshAt: marketDataMeta.lastSuccessAt || marketDataMeta.lastAttemptAt,
      lastNewsAttemptAt: newsMeta.lastAttemptAt,
      lastNewsSuccessAt: newsMeta.lastSuccessAt,
    },
    sources: newsMeta.sourceStatus,
    marketSources: marketDataMeta.sourceStatus,
    connectors: connectorSummary.providers,
  };
}

function defaultShareStatus() {
  return {
    status: "local_only",
    provider: null,
    publicUrl: null,
    localUrl: `http://127.0.0.1:${PORT}`,
    startedAt: null,
    lastHeartbeatAt: null,
    notes:
      "Run npm run partner:share to generate a temporary public partner-testing link.",
  };
}

function readShareStatus() {
  const fallback = defaultShareStatus();

  try {
    if (!fs.existsSync(SHARE_STATUS_FILE)) {
      return fallback;
    }

    const parsed = JSON.parse(fs.readFileSync(SHARE_STATUS_FILE, "utf8"));
    return {
      ...fallback,
      ...parsed,
      status: sanitizeOptionalText(parsed?.status, 40) || fallback.status,
      provider: sanitizeOptionalText(parsed?.provider, 80),
      publicUrl: sanitizeOptionalText(parsed?.publicUrl, 240),
      localUrl: sanitizeOptionalText(parsed?.localUrl, 240) || fallback.localUrl,
      startedAt: parsed?.startedAt ? toUtcIso(parsed.startedAt) : null,
      lastHeartbeatAt: parsed?.lastHeartbeatAt ? toUtcIso(parsed.lastHeartbeatAt) : null,
      notes: sanitizeOptionalText(parsed?.notes, 240) || fallback.notes,
    };
  } catch {
    return fallback;
  }
}

app.get("/", (_req, res) => {
  if (fs.existsSync(FRONTEND_INDEX_FILE)) {
    res.sendFile(FRONTEND_INDEX_FILE);
    return;
  }

  res
    .status(200)
    .type("html")
    .send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Brick Alpha API</title>
    <style>
      body {
        margin: 0;
        font-family: Inter, Segoe UI, Arial, sans-serif;
        background: #05070c;
        color: #f5f7fb;
        display: grid;
        place-items: center;
        min-height: 100vh;
        padding: 24px;
      }
      main {
        width: min(720px, 100%);
        border: 1px solid rgba(116, 132, 171, 0.18);
        border-radius: 24px;
        padding: 28px;
        background: rgba(255, 255, 255, 0.03);
      }
      h1 {
        margin: 0 0 12px;
        color: #fff6ea;
      }
      p {
        color: #8da2c8;
        line-height: 1.6;
      }
      a {
        color: #4a8bff;
        text-decoration: none;
      }
      ul {
        margin: 18px 0 0;
        padding-left: 18px;
      }
      li {
        margin: 10px 0;
      }
      code {
        color: #dbe7ff;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Brick Alpha API is running</h1>
      <p>This is the backend service. The app UI lives on the frontend dev server.</p>
      <ul>
        <li>Frontend: <a href="http://127.0.0.1:5173/">http://127.0.0.1:5173/</a></li>
        <li>Health: <a href="/api/health">/api/health</a></li>
        <li>Signals: <a href="/api/signals">/api/signals</a></li>
      </ul>
      <p>If you want live market candles, add <code>TWELVE_DATA_API_KEY</code> to the server environment and restart the API.</p>
    </main>
  </body>
</html>`);
});

app.get("/api/health", async (_req, res) => {
  res.json(await buildHealth());
});

function authHandler(work, status = 200) {
  return async (req, res) => {
    try { res.status(status).json(await work(req)); }
    catch (error) {
      if (error instanceof AuthError) return res.status(error.status).json({ ok: false, error: error.message });
      res.status(503).json({ ok: false, error: 'auth_unavailable' });
    }
  };
}
app.post('/api/auth/register', authRateLimiter.middleware('register'), authHandler(req => authService.register(req.body), 201));
app.post('/api/auth/login', authRateLimiter.middleware('login'), authHandler(req => authService.login(req.body)));
app.post('/api/auth/forgot-password/request', authRateLimiter.middleware('forgot-password/request'), authHandler(req => authService.requestReset(req.body)));
app.post('/api/auth/forgot-password/confirm', authRateLimiter.middleware('forgot-password/confirm'), authHandler(req => authService.confirmReset(req.body)));
app.post('/api/auth/demo', authRateLimiter.middleware('demo'), authHandler(async req => {
  const result = await authService.register(req.body, true);
  if (DEMO_MODE && result?.user && !isFinancialPostgresMode()) {
    const state = getUserState(result.user.id);
    seedDemoUserState(state, result.user.id);
    persistStore();
    if (state.settings) {
      result.settings = state.settings;
    }
  }
  return result;
}, 201));
app.post('/api/auth/logout', requireAuth, authHandler(req => authService.revoke(readBearerToken(req))));
app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ ok: true, user: publicUser(req.user), settings: req.userState.settings });
});
app.get("/api/signals", (_req, res) => {
  res.json({
    generatedAt: lastEngineTickAt,
    leadSignal,
    signals: latestSignals,
    marketData: {
      provider: marketDataMeta.provider,
      mode: marketDataMeta.mode,
      interval: marketDataMeta.interval,
      lastAttemptAt: marketDataMeta.lastAttemptAt,
      lastSuccessAt: marketDataMeta.lastSuccessAt,
      lastError: marketDataMeta.lastError,
      sourceStatus: marketDataMeta.sourceStatus,
    },
    strategyRules: [
      "Buy when the 8 EMA crosses above the 21 EMA and price keeps holding above the fast EMA.",
      "Sell when the 8 EMA crosses below the 21 EMA and price stays under the fast EMA.",
      "Higher-probability entries come on pullbacks into the 21 EMA that hold in-trend.",
      "If the 8 and 21 braid back and forth, treat it as chop and stand aside.",
      "Use the anchor trend for alignment before taking lower-timeframe continuation entries.",
      "Exit when price closes on the opposite side of the 8 EMA.",
    ],
  });
});

app.get("/api/news", optionalAuth, (req, res) => {
  const requestedRegion = String(
    req.query.region || settingsForRequest(req).preferredRegion || "south-africa",
  );
  const region = requestedRegion === "global" || requestedRegion === "all" ? requestedRegion : "south-africa";

  res.json({
    region,
    refreshedAt: newsMeta.lastSuccessAt || newsMeta.lastAttemptAt,
    items: filterNewsByRegion(region),
    sources: NEWS_SOURCES,
    sourceStatus: newsMeta.sourceStatus,
  });
});

app.get("/api/catalog", (_req, res) => {
  const query = sanitizeOptionalText(_req.query.q, 120).toLowerCase();
  const brand = sanitizeOptionalText(_req.query.brand, 80);
  const family = sanitizeOptionalText(_req.query.family, 120);
  const filtered = PRODUCT_CATALOG.filter((item) => {
    const brandMatch = !brand || item.brand.toLowerCase() === brand.toLowerCase();
    const familyMatch = !family || item.family.toLowerCase() === family.toLowerCase();
    const queryMatch =
      !query ||
      [item.sku, item.brand, item.family, item.description, item.sourceSheet]
        .join(" ")
        .toLowerCase()
        .includes(query);
    return brandMatch && familyMatch && queryMatch;
  });

  res.json({
    updatedAt: PRODUCT_CATALOG_DATA.generatedAt || nowIso(),
    generatedAt: PRODUCT_CATALOG_DATA.generatedAt,
    items: filtered,
    count: PRODUCT_CATALOG.length,
    brands: PRODUCT_CATALOG_BRANDS,
    families: PRODUCT_CATALOG_FAMILIES,
    brandCount: PRODUCT_CATALOG_BRANDS.length,
    familyCount: PRODUCT_CATALOG_FAMILIES.length,
    printPresets: PRINT_SERVICE_PRESETS,
    sourceFile: PRODUCT_CATALOG_DATA.sourceFile,
    sourceLabel: PRODUCT_CATALOG_DATA.sourceLabel,
  });
});

app.get("/api/collectibles", (_req, res) => {
  res.json({
    updatedAt: nowIso(),
    categories: TRADEABLE_COLLECTIBLE_CATEGORIES,
    brands: TRADEABLE_COLLECTIBLE_BRANDS,
    items: TRADEABLE_COLLECTIBLES_ACTIVE,
    referenceShelves: OFFICIAL_COLLECTIBLE_REFERENCE_SHELVES,
    demoMode: DEMO_MODE,
  });
});

function isDemoAccount(user) {
  return /@collecttrade\.local$/.test(String(user?.email || ""));
}

// Demo accounts see only notes they authored, so Reset Demo starts from an empty board.
// Feedback from non-demo accounts stays in the store and is still returned to those accounts.
function feedbackForRequester(user) {
  if (!user || !isDemoAccount(user)) {
    return feedbackItems;
  }
  return feedbackItems.filter((item) => item.authorUserId === user.id);
}

app.get("/api/feedback", requireAuth, (req, res) => {
  const items = feedbackForRequester(req.user);
  res.json({
    ok: true,
    items,
    summary: buildFeedbackSummary(items),
    permissions: {
      canManage: req.user.role === "owner",
    },
  });
});

app.get("/api/watchlist", requireAuth, (req, res) => {
  const items = buildWatchlistView(req.userState.watchlistItems);
  res.json({
    ok: true,
    items,
  });
});

app.post("/api/watchlist", requireAuth, (req, res) => {
  const ticker = sanitizeOptionalText(req.body?.ticker, 40).toUpperCase();
  const signal = latestSignals.find((candidate) => candidate.ticker === ticker);
  const collectible = findTradeableCollectibleBySkuOrId(ticker);

  if (!signal && !collectible) {
    res.status(400).json({ ok: false, error: "unknown_market" });
    return;
  }

  const existing = req.userState.watchlistItems.find((item) => item.ticker === ticker);
  if (existing) {
    existing.updatedAt = nowIso();
    req.userState.watchlistItems = sortWatchlistItems(req.userState.watchlistItems);
    persistStore();
    res.json({
      ok: true,
      item: buildWatchlistView([existing])[0],
      items: buildWatchlistView(req.userState.watchlistItems),
    });
    return;
  }

  const item = sanitizeWatchlistItem({
    id: crypto.randomUUID(),
    ticker,
    label: req.body?.label || signal?.label || collectible?.name || ticker,
    desk: req.body?.desk || signal?.desk || "collectibles",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });

  req.userState.watchlistItems = sortWatchlistItems([item, ...req.userState.watchlistItems]).slice(0, 24);
  persistStore();

  res.status(201).json({
    ok: true,
    item: buildWatchlistView([item])[0],
    items: buildWatchlistView(req.userState.watchlistItems),
  });
});

app.delete("/api/watchlist/:watchId", requireAuth, (req, res) => {
  const initialLength = req.userState.watchlistItems.length;
  req.userState.watchlistItems = req.userState.watchlistItems.filter(
    (item) => item.id !== req.params.watchId,
  );

  if (req.userState.watchlistItems.length === initialLength) {
    res.status(404).json({ ok: false, error: "unknown_watchlist_item" });
    return;
  }

  persistStore();

  res.json({
    ok: true,
    items: buildWatchlistView(req.userState.watchlistItems),
  });
});

app.get("/api/alerts", requireAuth, (req, res) => {
  res.json({
    ok: true,
    ...buildAlertResponsePayload(req.userState),
  });
});

app.get("/api/notifications", requireAuth, (req, res) => {
  const items = sortNotificationItems(req.userState.notifications || []);
  res.json({
    ok: true,
    items,
    summary: buildNotificationSummary(items),
  });
});

app.get("/api/session-routine", requireAuth, (req, res) => {
  req.userState.routine = advanceRoutineState(req.userState.routine);
  persistStore();

  res.json({
    ok: true,
    routine: buildRoutineView(req.userState.routine),
  });
});

app.put("/api/session-routine", requireAuth, (req, res) => {
  const stepId = sanitizeRoutineStepId(req.body?.stepId);
  const sessionMode = sanitizeRoutineSessionMode(req.body?.sessionMode);
  const reset = req.body?.reset === true;
  const dismissReminder = req.body?.dismissReminder === true;
  const acknowledgeCompletion = req.body?.acknowledgeCompletion === true;

  if (reset) {
    req.userState.routine = resetRoutineForToday(req.userState.routine);
  } else if (dismissReminder) {
    req.userState.routine = dismissRoutineReminderForToday(req.userState.routine);
  } else if (acknowledgeCompletion) {
    req.userState.routine = acknowledgeRoutineCompletionForToday(req.userState.routine);
  } else if (sessionMode) {
    req.userState.routine = updateRoutineSessionMode(req.userState.routine, sessionMode);
  } else if (stepId) {
    req.userState.routine = updateRoutineStep(
      req.userState.routine,
      stepId,
      req.body?.completed !== false,
    );
  } else {
    res.status(400).json({ ok: false, error: "invalid_routine_update" });
    return;
  }

  persistStore();

  res.json({
    ok: true,
    routine: buildRoutineView(req.userState.routine),
  });
});

app.post("/api/alerts", requireAuth, (req, res) => {
  const ticker = sanitizeOptionalText(req.body?.ticker, 40).toUpperCase();
  const signal = latestSignals.find((candidate) => candidate.ticker === ticker);

  if (!signal) {
    res.status(400).json({ ok: false, error: "unknown_market" });
    return;
  }

  const rule = sanitizeAlertRule({
    id: crypto.randomUUID(),
    ticker,
    label: req.body?.label || signal.label,
    desk: req.body?.desk || signal.desk,
    kind: req.body?.kind,
    threshold: req.body?.threshold,
    enabled: req.body?.enabled !== false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });

  if (rule.threshold == null) {
    res.status(400).json({ ok: false, error: "alert_threshold_required" });
    return;
  }

  const duplicate = req.userState.alertRules.find(
    (item) =>
      item.ticker === rule.ticker &&
      item.kind === rule.kind &&
      Number(item.threshold) === Number(rule.threshold),
  );

  if (duplicate) {
    duplicate.updatedAt = nowIso();
    duplicate.enabled = true;
    persistStore();
    res.json({
      ok: true,
      item: evaluateAlertRule(duplicate, signal),
      ...buildAlertResponsePayload(req.userState),
    });
    return;
  }

  const alertPlan = alertPlanForTier(req.userState.settings?.subscriptionTier);
  if ((req.userState.alertRules || []).length >= alertPlan.maxAlerts) {
    res.status(403).json({
      ok: false,
      error: "alert_limit_reached",
      plan: {
        id: alertPlan.id,
        label: alertPlan.label,
        maxAlerts: alertPlan.maxAlerts,
      },
    });
    return;
  }

  req.userState.alertRules = [rule, ...req.userState.alertRules].slice(0, 64);
  persistStore();

  res.status(201).json({
    ok: true,
    item: evaluateAlertRule(rule, signal),
    ...buildAlertResponsePayload(req.userState),
  });
});

app.patch("/api/alerts/:alertId", requireAuth, (req, res) => {
  const rule = req.userState.alertRules.find((item) => item.id === req.params.alertId);
  if (!rule) {
    res.status(404).json({ ok: false, error: "unknown_alert" });
    return;
  }

    if (typeof req.body?.enabled === "boolean") {
      rule.enabled = req.body.enabled;
    }
    rule.updatedAt = nowIso();
    persistStore();
    const signal = latestSignals.find((candidate) => candidate.ticker === rule.ticker);
  
    res.json({
      ok: true,
      item: evaluateAlertRule(rule, signal),
      ...buildAlertResponsePayload(req.userState),
    });
  });

app.delete("/api/alerts/:alertId", requireAuth, (req, res) => {
  const initialLength = req.userState.alertRules.length;
  req.userState.alertRules = req.userState.alertRules.filter((item) => item.id !== req.params.alertId);

  if (req.userState.alertRules.length === initialLength) {
    res.status(404).json({ ok: false, error: "unknown_alert" });
    return;
    }
  
    persistStore();
  
    res.json({
      ok: true,
      ...buildAlertResponsePayload(req.userState),
    });
  });

app.patch("/api/notifications/:notificationId", requireAuth, (req, res) => {
  const notification = req.userState.notifications.find((item) => item.id === req.params.notificationId);
  if (!notification) {
    res.status(404).json({ ok: false, error: "unknown_notification" });
    return;
  }

  notification.status = sanitizeNotificationStatus(req.body?.status || notification.status);
  persistStore();
  const items = sortNotificationItems(req.userState.notifications);

  res.json({
    ok: true,
    item: notification,
    items,
    summary: buildNotificationSummary(items),
  });
});

app.post("/api/notifications/mark-all-read", requireAuth, (req, res) => {
  req.userState.notifications = (req.userState.notifications || []).map((item) => ({
    ...item,
    status: "read",
  }));
  persistStore();
  const items = sortNotificationItems(req.userState.notifications);

  res.json({
    ok: true,
    items,
    summary: buildNotificationSummary(items),
  });
});

app.get("/api/share-status", requireAuth, (_req, res) => {
  res.json({
    ok: true,
    share: readShareStatus(),
  });
});

app.post("/api/feedback", requireAuth, (req, res) => {
  const title = sanitizeOptionalText(req.body?.title, 140);
  const notes = sanitizeOptionalText(req.body?.notes, 800);

  if (title.length < 6) {
    res.status(400).json({ ok: false, error: "feedback_title_too_short" });
    return;
  }

  if (notes.length < 12) {
    res.status(400).json({ ok: false, error: "feedback_notes_too_short" });
    return;
  }

  const item = sanitizeFeedbackItem({
    id: crypto.randomUUID(),
    title,
    type: req.body?.type,
    severity: req.body?.severity,
    area: req.body?.area,
    notes,
    status: "new",
    authorUserId: req.user.id,
    authorName: req.user.name,
    authorEmail: req.user.email,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });

  feedbackItems = sortFeedbackItems([item, ...feedbackItems]);
  persistStore();

  const visibleItems = feedbackForRequester(req.user);
  res.status(201).json({
    ok: true,
    item,
    items: visibleItems,
    summary: buildFeedbackSummary(visibleItems),
    permissions: {
      canManage: req.user.role === "owner",
    },
  });
});

app.patch("/api/feedback/:feedbackId", requireAuth, (req, res) => {
  if (req.user.role !== "owner") {
    res.status(403).json({ ok: false, error: "feedback_admin_required" });
    return;
  }

  const item = feedbackItems.find((entry) => entry.id === req.params.feedbackId);
  if (!item) {
    res.status(404).json({ ok: false, error: "unknown_feedback" });
    return;
  }

  item.status = sanitizeFeedbackStatus(req.body?.status || item.status);
  item.resolutionNote = sanitizeOptionalText(req.body?.resolutionNote, 400);
  item.updatedAt = nowIso();
  feedbackItems = sortFeedbackItems(feedbackItems);
  persistStore();

  res.json({
    ok: true,
    item,
    items: feedbackItems,
    summary: buildFeedbackSummary(feedbackItems),
    permissions: {
      canManage: true,
    },
  });
});

app.get("/api/intake", requireAuth, (req, res) => {
  res.json({
    ok: true,
    items: req.userState.intakeRequests,
    printPresets: PRINT_SERVICE_PRESETS,
  });
});

app.post("/api/intake", requireAuth, (req, res) => {
  const request = createIntakeRequest(req.user.id, req.body);

  if (!request.customerName) {
    res.status(400).json({ ok: false, error: "customer_name_required" });
    return;
  }

  if (request.channel === "email" && !request.contactEmail) {
    res.status(400).json({ ok: false, error: "contact_email_required" });
    return;
  }

  if (request.channel === "phone" && !request.contactPhone) {
    res.status(400).json({ ok: false, error: "contact_phone_required" });
    return;
  }

  if (request.requestType === "catalog") {
    const selection = request.catalogSelection;
    const selectedItem = selection?.itemId ? findCatalogItemById(selection.itemId) : null;
    if (!selectedItem) {
      res.status(400).json({ ok: false, error: "catalog_item_required" });
      return;
    }

    request.catalogSelection = {
      itemId: selectedItem.id,
      sku: selectedItem.sku,
      brand: selectedItem.brand,
      family: selectedItem.family,
      name: selectedItem.name,
      sourceSheet: selectedItem.sourceSheet,
      description: selectedItem.description,
    };
  } else if (!request.printDetails.serviceType) {
    res.status(400).json({ ok: false, error: "print_service_required" });
    return;
  }

  req.userState.intakeRequests.unshift(request);
  persistStore();

  res.status(201).json({
    ok: true,
    request,
    items: req.userState.intakeRequests,
  });
});

app.patch("/api/intake/:requestId", requireAuth, (req, res) => {
  const request = findIntakeRequestById(req.userState.intakeRequests, req.params.requestId);
  if (!request) {
    res.status(404).json({ ok: false, error: "unknown_request" });
    return;
  }

  request.status = sanitizeRequestStatus(req.body?.status ?? request.status);
  request.priority = sanitizeRequestPriority(req.body?.priority ?? request.priority);
  request.notes = sanitizeOptionalText(req.body?.notes ?? request.notes, 400);
  request.quotedAmount =
    req.body?.quotedAmount === null || req.body?.quotedAmount === ""
      ? null
      : sanitizeQuoteAmount(req.body?.quotedAmount ?? request.quotedAmount);
  request.followUpAt =
    req.body?.followUpAt === null || req.body?.followUpAt === ""
      ? null
      : sanitizeFollowUpAt(req.body?.followUpAt ?? request.followUpAt);
  request.updatedAt = nowIso();
  persistStore();

  res.json({
    ok: true,
    request,
    items: req.userState.intakeRequests,
  });
});

app.get("/api/portfolio", requireAuth, async (req, res) => {
  if (isFinancialPostgresMode()) {
    try {
      res.json(await getPostgresFinancialService().getPortfolioView(req.user.id));
    } catch (error) {
      res.status(financialErrorStatus(error)).json({ ok: false, error: error.code || error.message || "portfolio_failed" });
    }
    return;
  }
  res.json(req.userState.trades);
});

app.post("/api/trades", requireAuth, async (req, res) => {
  const marketTicker = String(req.body?.marketTicker || "").toUpperCase();
  const side = String(req.body?.side || "").toUpperCase();
  const orderNote = sanitizeOrderNote(req.body?.orderNote);
  const stopPrice = sanitizeTradePlanValue(req.body?.stopPrice);
  const targetPrice = sanitizeTradePlanValue(req.body?.targetPrice);
  const riskBudget = sanitizeTradePlanValue(req.body?.riskBudget);
  const signal = latestSignals.find((candidate) => candidate.ticker === marketTicker);

  if (!signal) {
    res.status(400).json({ ok: false, error: "unknown_market" });
    return;
  }

  if (side !== "BUY" && side !== "SELL") {
    res.status(400).json({ ok: false, error: "invalid_side" });
    return;
  }

  const executionProfile = executionProfileForDesk(req.userState, signal.desk);
  const quantity = parseTradeQuantity(
    req.body?.quantity,
    quantityPolicyForTrade({
      assetClass: "market",
      desk: signal.desk,
      executionProvider: executionProfile.providerId,
    }),
  );

  if (!quantity) {
    res.status(400).json({ ok: false, error: "invalid_quantity" });
    return;
  }

  if (isFinancialPostgresMode()) {
    try {
      const result = await getPostgresFinancialService().createMarketTrade(req.user.id, signal, {
        side,
        quantity,
        acquisitionPrice: req.body?.acquisitionPrice,
        salePrice: req.body?.salePrice ?? req.body?.unitPrice ?? req.body?.price,
        unitPrice: req.body?.unitPrice,
        price: req.body?.price,
        currentPrice: req.body?.currentPrice,
        currency: req.body?.currency,
        fees: req.body?.fees,
        feeAmount: req.body?.feeAmount,
        feeType: req.body?.feeType,
        orderNote,
        idempotencyKey: req.body?.idempotencyKey || null,
        executionMode: executionProfile.mode || "paper",
        executionProvider: executionProfile.providerId || null,
      });

      res.status(201).json({
        ok: true,
        trade: tradeViewFromTransaction(result.trade),
        portfolio: await getPostgresFinancialService().getPortfolioView(req.user.id),
        execution: {
          mode: result.trade?.execution?.mode ? String(result.trade.execution.mode).toLowerCase() : executionProfile.mode || "paper",
          providerId: result.trade?.execution?.providerId || null,
          pair: result.trade?.asset?.marketInstrument?.ticker || signal.ticker || null,
          remoteStatus: result.trade?.execution?.status ? String(result.trade.execution.status).toLowerCase() : null,
        },
      });
    } catch (error) {
      res.status(financialErrorStatus(error)).json({ ok: false, error: error.code || error.message || "trade_execution_failed" });
    }
    return;
  }

  try {
    let trade = null;

    if (executionProfile.mode === "live") {
      if (signal.desk !== "crypto" || executionProfile.providerId !== "valr") {
        res.status(400).json({ ok: false, error: "live_execution_not_supported" });
        return;
      }

      const connector = connectorStateForUser(req.userState, "valr");
      if (!connector.configured) {
        res.status(400).json({ ok: false, error: "connector_not_configured" });
        return;
      }

      const liveOrder = await placeValrMarketOrder(
        connector,
        signal,
        side,
        quantity,
        connector.config.preferredPair || executionProfile.pair,
      );
      const remoteStatus = liveOrder.status;
      connector.status = "online";
      connector.lastTestAt = nowIso();
      connector.lastError = null;

      trade = createTrade(signal, side, req.user.id, {
        quantity: Number(liveOrder.baseAmount),
        orderNote,
        stopPrice,
        targetPrice,
        riskBudget,
        executionMode: "live",
        executionProvider: "valr",
        executionLabel: "VALR",
        executionPair: liveOrder.pair,
        remoteOrderId: remoteStatus?.orderId || liveOrder.acceptance?.id || null,
        remoteCustomerOrderId:
          remoteStatus?.customerOrderId || liveOrder.acceptance?.customerOrderId || null,
        remoteStatus: remoteStatus?.orderStatusType || "Accepted",
        remoteStatusAt: remoteStatus?.orderUpdatedAt || nowIso(),
        remoteFailedReason: remoteStatus?.failedReason || "",
        unitLabel: liveOrder.pairMeta.baseCurrency || "units",
      });
    } else {
      trade = createTrade(signal, side, req.user.id, {
        quantity,
        orderNote,
        stopPrice,
        targetPrice,
        riskBudget,
        executionMode: "paper",
        executionProvider: executionProfile.providerId,
        executionLabel: "Brick Alpha Paper",
      });
    }

    req.userState.trades.unshift(trade);

    if (isFinancialDualMode()) {
      await getPostgresFinancialService().createMarketTrade(req.user.id, signal, {
        side,
        quantity,
        acquisitionPrice: trade.entryPrice,
        salePrice: trade.entryPrice,
        currentPrice: trade.currentPrice,
        currency: req.body?.currency,
        fees: req.body?.fees,
        feeAmount: req.body?.feeAmount,
        feeType: req.body?.feeType,
        orderNote,
        idempotencyKey: `legacy-trade:${trade.id}`,
        executionMode: trade.executionMode || "paper",
        executionProvider: trade.executionProvider || null,
      });
    }

    persistStore();

    res.status(201).json({
      ok: true,
      trade,
      portfolio: req.userState.trades,
      execution: {
        mode: trade.executionMode || "paper",
        providerId: trade.executionProvider || null,
        pair: trade.executionPair || null,
        remoteStatus: trade.remoteStatus || null,
      },
    });
  } catch (error) {
    const connector = connectorStateForUser(req.userState, "valr");
    if (executionProfile.mode === "live" && connector.configured) {
      connector.status = "error";
      connector.lastError = error.message;
      connector.lastTestAt = nowIso();
      persistStore();
    }

    res.status(400).json({
      ok: false,
      error: error.message || "trade_execution_failed",
    });
  }
});

app.post("/api/collectibles/trades", requireAuth, async (req, res) => {
  const collectibleId = String(req.body?.collectibleId || "").trim();
  const side = String(req.body?.side || "").toUpperCase();
  const orderNote = sanitizeOrderNote(req.body?.orderNote);
  const stopPrice = sanitizeTradePlanValue(req.body?.stopPrice);
  const targetPrice = sanitizeTradePlanValue(req.body?.targetPrice);
  const riskBudget = sanitizeTradePlanValue(req.body?.riskBudget);
  const acquisitionProvided = req.body?.acquisitionPrice != null && req.body?.acquisitionPrice !== "";
  const acquisitionPrice = acquisitionProvided ? sanitizeAcquisitionPrice(req.body?.acquisitionPrice) : null;
  const item = findTradeableCollectibleById(collectibleId);

  if (!item) {
    res.status(400).json({ ok: false, error: "unknown_collectible" });
    return;
  }

  if (side !== "BUY" && side !== "SELL") {
    res.status(400).json({ ok: false, error: "invalid_side" });
    return;
  }

  const quantity = parseTradeQuantity(
    req.body?.quantity,
    quantityPolicyForTrade({ assetClass: "collectible" }),
  );

  if (!quantity) {
    res.status(400).json({ ok: false, error: "invalid_quantity" });
    return;
  }

  if (side === "BUY" && acquisitionProvided && acquisitionPrice == null) {
    res.status(400).json({ ok: false, error: "invalid_acquisition_price" });
    return;
  }

  if (isFinancialPostgresMode()) {
    try {
      const result = await getPostgresFinancialService().createCollectibleTrade(req.user.id, item, {
        side,
        quantity,
        acquisitionPrice: req.body?.acquisitionPrice,
        salePrice: req.body?.salePrice ?? req.body?.unitPrice,
        unitPrice: req.body?.unitPrice,
        price: req.body?.price,
        currentPrice: req.body?.currentPrice,
        currency: req.body?.currency,
        fees: req.body?.fees,
        feeAmount: req.body?.feeAmount,
        feeType: req.body?.feeType,
        orderNote,
        idempotencyKey: req.body?.idempotencyKey || null,
        executionMode: "paper",
        executionProvider: "collecttrade",
      });

      res.status(201).json({
        ok: true,
        trade: tradeViewFromTransaction(result.trade),
        portfolio: await getPostgresFinancialService().getPortfolioView(req.user.id),
        execution: {
          mode: result.trade?.execution?.mode ? String(result.trade.execution.mode).toLowerCase() : "paper",
          providerId: result.trade?.execution?.providerId || "collecttrade",
          pair: null,
          remoteStatus: result.trade?.execution?.status ? String(result.trade.execution.status).toLowerCase() : null,
        },
      });
    } catch (error) {
      res.status(financialErrorStatus(error)).json({ ok: false, error: error.code || error.message || "trade_execution_failed" });
    }
    return;
  }

  const trade = createCollectibleTrade(item, side, req.user.id, {
    quantity,
    orderNote,
    stopPrice,
    targetPrice,
    riskBudget,
    ...(side === "BUY" && acquisitionProvided && acquisitionPrice != null
      ? {
          entryPrice: acquisitionPrice,
        }
      : {}),
    executionMode: "paper",
    executionProvider: "collecttrade",
    executionLabel: "Brick Alpha Paper",
  });

  if (isFinancialDualMode()) {
    try {
      await getPostgresFinancialService().createCollectibleTrade(req.user.id, item, {
        side,
        quantity,
        acquisitionPrice: side === "BUY" ? req.body?.acquisitionPrice : undefined,
        salePrice: side === "SELL" ? req.body?.salePrice ?? req.body?.unitPrice ?? trade.entryPrice : undefined,
        currentPrice: trade.currentPrice,
        currency: req.body?.currency,
        fees: req.body?.fees,
        feeAmount: req.body?.feeAmount,
        feeType: req.body?.feeType,
        orderNote,
        idempotencyKey: `legacy-trade:${trade.id}`,
        executionMode: "paper",
        executionProvider: "collecttrade",
      });
    } catch (error) {
      res.status(financialErrorStatus(error)).json({ ok: false, error: error.code || error.message || "trade_execution_failed" });
      return;
    }
  }

  req.userState.trades.unshift(trade);
  persistStore();

  res.status(201).json({
    ok: true,
    trade,
    portfolio: req.userState.trades,
    execution: {
      mode: trade.executionMode || "paper",
      providerId: trade.executionProvider || "collecttrade",
      pair: null,
      remoteStatus: null,
    },
  });
});

app.post("/api/trades/:tradeId/close", requireAuth, async (req, res) => {
  const orderNote = sanitizeOrderNote(req.body?.orderNote);

  if (isFinancialPostgresMode()) {
    try {
      const result = await getPostgresFinancialService().closeTransaction(req.user.id, req.params.tradeId, {
        quantity: req.body?.quantity,
        salePrice: req.body?.salePrice,
        unitPrice: req.body?.unitPrice,
        currentPrice: req.body?.currentPrice,
        fees: req.body?.fees,
        feeAmount: req.body?.feeAmount,
        feeType: req.body?.feeType,
        orderNote,
        idempotencyKey: req.body?.idempotencyKey || null,
      });

      res.json({
        ok: true,
        trade: tradeViewFromTransaction(result.trade),
        portfolio: await getPostgresFinancialService().getPortfolioView(req.user.id),
        execution: {
          mode: result.trade?.execution?.mode ? String(result.trade.execution.mode).toLowerCase() : "paper",
          providerId: result.trade?.execution?.providerId || null,
          pair: result.trade?.asset?.marketInstrument?.ticker || null,
          remoteStatus: result.trade?.execution?.status ? String(result.trade.execution.status).toLowerCase() : null,
        },
      });
    } catch (error) {
      res.status(financialErrorStatus(error)).json({ ok: false, error: error.code || error.message || "trade_close_failed" });
    }
    return;
  }

  const trade = findTradeById(req.userState.trades, req.params.tradeId);

  if (!trade) {
    res.status(404).json({ ok: false, error: "unknown_trade" });
    return;
  }

  if (trade.status !== "open") {
    res.status(400).json({ ok: false, error: "trade_already_closed" });
    return;
  }

  const requestedSale = Number(req.body?.salePrice);
  if (trade.assetClass === "collectible" && Number.isFinite(requestedSale) && requestedSale > 0) {
    trade.currentPrice = Number(requestedSale.toFixed(2));
  }

  const signal =
    trade.assetClass === "market"
      ? latestSignals.find((candidate) => candidate.ticker === trade.marketTicker)
      : null;

  try {
    if (trade.executionMode === "live" && trade.executionProvider === "valr") {
      const connector = connectorStateForUser(req.userState, "valr");
      if (!connector.configured) {
        res.status(400).json({ ok: false, error: "connector_not_configured" });
        return;
      }

      const closeSide = trade.side === "BUY" ? "SELL" : "BUY";
      const liveSignal = signal || { ticker: trade.marketTicker, desk: "crypto" };
      const liveOrder = await placeValrMarketOrder(
        connector,
        liveSignal,
        closeSide,
        normalizeStoredQuantity(trade.quantity),
        trade.executionPair ||
          connector.config.preferredPair ||
          executionProfileForDesk(req.userState, "crypto").pair,
      );
      const remoteStatus = liveOrder.status;
      connector.status = "online";
      connector.lastTestAt = nowIso();
      connector.lastError = null;
      closeTrade(
        trade,
        orderNote ? `Manual live close: ${orderNote}` : "Manual live close",
        signal,
      );
      trade.closeExecutionMode = "live";
      trade.closeExecutionProvider = "valr";
      trade.closeExecutionPair = liveOrder.pair;
      trade.closeRemoteOrderId = remoteStatus?.orderId || liveOrder.acceptance?.id || null;
      trade.closeRemoteCustomerOrderId =
        remoteStatus?.customerOrderId || liveOrder.acceptance?.customerOrderId || null;
      trade.closeRemoteStatus = remoteStatus?.orderStatusType || "Accepted";
      trade.closeRemoteStatusAt = remoteStatus?.orderUpdatedAt || nowIso();
      trade.closeRemoteFailedReason = remoteStatus?.failedReason || "";
    } else {
      const exitReason = orderNote ? `Manual close: ${orderNote}` : "Manual close";
      closeTrade(trade, exitReason, signal);
    }

    persistStore();

    if (isFinancialDualMode()) {
      if (trade.assetClass === "collectible") {
        const item = findTradeableCollectibleById(trade.collectibleId);
        if (!item) {
          res.status(400).json({ ok: false, error: "unknown_collectible" });
          return;
        }
        await getPostgresFinancialService().createCollectibleTrade(req.user.id, item, {
          side: "SELL",
          quantity: trade.quantity,
          salePrice: trade.exitPrice || trade.currentPrice || trade.entryPrice,
          currentPrice: trade.exitPrice || trade.currentPrice || trade.entryPrice,
          orderNote,
          idempotencyKey: `legacy-close:${trade.id}`,
          executionMode: trade.closeExecutionMode || trade.executionMode || "paper",
          executionProvider: trade.closeExecutionProvider || trade.executionProvider || "collecttrade",
        });
      } else {
        const closeSignal = signal || {
          ticker: trade.marketTicker,
          label: trade.ticker,
          price: trade.exitPrice || trade.currentPrice || trade.entryPrice,
          desk: "market",
        };
        await getPostgresFinancialService().createMarketTrade(req.user.id, closeSignal, {
          side: trade.side === "BUY" ? "SELL" : "BUY",
          quantity: trade.quantity,
          salePrice: trade.exitPrice || trade.currentPrice || trade.entryPrice,
          currentPrice: trade.exitPrice || trade.currentPrice || trade.entryPrice,
          orderNote,
          idempotencyKey: `legacy-close:${trade.id}`,
          executionMode: trade.closeExecutionMode || trade.executionMode || "paper",
          executionProvider: trade.closeExecutionProvider || trade.executionProvider || null,
        });
      }
    }

    res.json({
      ok: true,
      trade,
      portfolio: req.userState.trades,
      execution: {
        mode: trade.closeExecutionMode || trade.executionMode || "paper",
        providerId: trade.closeExecutionProvider || trade.executionProvider || null,
        pair: trade.closeExecutionPair || trade.executionPair || null,
        remoteStatus: trade.closeRemoteStatus || null,
      },
    });
  } catch (error) {
    if (trade.executionMode === "live" && trade.executionProvider === "valr") {
      const connector = connectorStateForUser(req.userState, "valr");
      connector.status = connector.configured ? "error" : connectorBaselineStatus("valr");
      connector.lastError = error.message;
      connector.lastTestAt = nowIso();
      persistStore();
    }

    res.status(400).json({
      ok: false,
      error: error.message || "trade_close_failed",
    });
  }
});

app.get("/api/assets/:assetId/valuation", requireAuth, async (req, res) => {
  try {
    const valuation = await getValuationService().getValuation(req.params.assetId);
    if (!valuation) {
      res.status(404).json({ ok: false, error: "valuation_not_found" });
      return;
    }
    res.json({ ok: true, valuation });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.code || error.message || "valuation_read_failed" });
  }
});

app.get("/api/assets/:assetId/valuations", requireAuth, async (req, res) => {
  try {
    const valuations = await getValuationService().getValuationHistory(req.params.assetId);
    res.json({ ok: true, valuations });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.code || error.message || "valuation_history_failed" });
  }
});

app.get("/api/assets/:assetId/brick-alpha", requireAuth, async (req, res) => {
  try {
    const assessment = await getValuationService().getAssessment(req.params.assetId);
    if (!assessment) {
      res.status(404).json({ ok: false, error: "brick_alpha_assessment_not_found" });
      return;
    }
    res.json({ ok: true, assessment });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.code || error.message || "brick_alpha_read_failed" });
  }
});

app.get("/api/assets/:assetId/brick-alpha/history", requireAuth, async (req, res) => {
  try {
    const assessments = await getValuationService().getAssessmentHistory(req.params.assetId);
    res.json({ ok: true, assessments });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.code || error.message || "brick_alpha_history_failed" });
  }
});

app.post("/api/assets/:assetId/valuation/recalculate", requireAuth, async (req, res) => {
  const assetId = String(req.params.assetId || "").trim();
  if (!assetId || assetId.length > 128) {
    res.status(400).json({ ok: false, error: "invalid_asset_id" });
    return;
  }
  try {
    const outcome = await getValuationService().recalculate({
      assetId,
      asset: (req.body && typeof req.body === "object" && req.body.asset) || {},
      observedAt: req.body?.observedAt || null,
      asOf: req.body?.asOf || null,
      evidenceInputs: Array.isArray(req.body?.evidence) ? req.body.evidence : null,
    });
    if (!outcome.created) {
      res.status(409).json({ ok: false, error: "valuation_unavailable", modelVersion: outcome.modelVersion, providers: outcome.providers, reason: outcome.reason });
      return;
    }
    res.status(201).json({ ok: true, status: outcome.status, modelVersion: outcome.modelVersion, providers: outcome.providers, valuation: outcome.valuation, assessment: outcome.assessment });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.code || error.message || "valuation_recalculate_failed" });
  }
});

app.get("/api/settings", requireAuth, (req, res) => {
  res.json({
    ok: true,
    settings: req.userState.settings,
  });
});

app.put("/api/settings", requireAuth, authHandler(async req => {
  const settings = sanitizeSettings({
    ...req.userState.settings,
    ...req.body,
  });
  await authService.setSettings(req.user.id, settings);
  req.userState.settings = settings;
  return {
    ok: true,
    settings: req.userState.settings,
  };
}));

app.get("/api/data-sources", requireAuth, (req, res) => {
  const source = req.userState.dataSources || {};
  const credentials = decryptConnectorPayload(source.brickeconomyAuthBlob) || {};
  res.json({
    ok: true,
    brickeconomy: {
      configured: Boolean(credentials.apiKey),
      apiKeyMasked: credentials.apiKey ? maskValue(credentials.apiKey) : "",
      lastSyncAt: source.lastBrickeconomySyncAt || null,
      role: "Canonical current LEGO valuation",
    },
    import: {
      accepted: ["csv"],
      columns: ["setNumber", "quantity", "purchasePrice", "purchaseDate", "condition", "retailer", "shipping", "vatReclaim", "rewards", "cashback", "vouchers"],
    },
  });
});

app.put("/api/data-sources/brickeconomy", requireAuth, async (req, res) => {
  const apiKey = String(req.body?.apiKey || "").trim();
  if (!apiKey) {
    res.status(400).json({ ok: false, error: "brickeconomy_api_key_required" });
    return;
  }
  const probe = await brickeconomyService.getSet("75367-1", apiKey, "ZAR");
  if (!probe.ok) {
    res.status(400).json({ ok: false, error: "brickeconomy_connection_failed", reason: probe.reason });
    return;
  }
  req.userState.dataSources = {
    ...(req.userState.dataSources || {}),
    brickeconomyAuthBlob: encryptConnectorPayload({ apiKey }),
  };
  persistStore();
  res.json({ ok: true, configured: true, apiKeyMasked: maskValue(apiKey), detail: "BrickEconomy connected." });
});

app.delete("/api/data-sources/brickeconomy", requireAuth, (req, res) => {
  req.userState.dataSources = {
    ...(req.userState.dataSources || {}),
    brickeconomyAuthBlob: null,
    lastBrickeconomySyncAt: null,
  };
  persistStore();
  res.json({ ok: true, configured: false });
});

app.post("/api/data-sources/brickeconomy/sync", requireAuth, async (req, res) => {
  const source = req.userState.dataSources || {};
  const credentials = decryptConnectorPayload(source.brickeconomyAuthBlob) || {};
  if (!credentials.apiKey) {
    res.status(400).json({ ok: false, error: "brickeconomy_not_connected" });
    return;
  }
  const result = await brickeconomyService.getCollectionSets(credentials.apiKey, "ZAR");
  if (!result.ok) {
    res.status(400).json({ ok: false, error: "brickeconomy_sync_failed", reason: result.reason });
    return;
  }
  req.userState.dataSources.lastBrickeconomySyncAt = nowIso();
  persistStore();
  res.json({ ok: true, syncedAt: req.userState.dataSources.lastBrickeconomySyncAt, collection: result.data });
});

app.post("/api/collection/import/preview", requireAuth, (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows.slice(0, 1000) : [];
  const normalized = rows.map((raw, index) => {
    const setNumber = String(raw?.setNumber || raw?.set || raw?.sku || "").trim().replace(/-1$/, "");
    const quantity = Number(raw?.quantity || raw?.qty || 1);
    const purchasePrice = Number(raw?.purchasePrice ?? raw?.price ?? raw?.cost ?? NaN);
    const condition = String(raw?.condition || "Sealed").trim();
    const errors = [];
    if (!/^\\d{4,6}$/.test(setNumber)) errors.push("Set number must be 4-6 digits.");
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000) errors.push("Quantity must be a whole number from 1 to 1000.");
    if (!Number.isFinite(purchasePrice) || purchasePrice < 0) errors.push("Purchase price must be zero or greater.");
    return {
      row: index + 1,
      setNumber,
      quantity,
      purchasePrice: Number.isFinite(purchasePrice) ? Number(purchasePrice.toFixed(2)) : null,
      purchaseDate: String(raw?.purchaseDate || raw?.date || "").trim(),
      condition: /^opened$/i.test(condition) ? "Opened" : "Sealed",
      retailer: String(raw?.retailer || raw?.source || "").trim().slice(0, 120),
      shipping: Number(raw?.shipping || 0) || 0,
      vatReclaim: Number(raw?.vatReclaim || 0) || 0,
      rewards: Number(raw?.rewards || 0) || 0,
      cashback: Number(raw?.cashback || 0) || 0,
      vouchers: Number(raw?.vouchers || 0) || 0,
      errors,
      valid: errors.length === 0,
    };
  });
  res.json({
    ok: true,
    rows: normalized,
    summary: {
      total: normalized.length,
      valid: normalized.filter(row => row.valid).length,
      invalid: normalized.filter(row => !row.valid).length,
    },
  });
});

app.post("/api/collection/import/commit", requireAuth, async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows.slice(0, 1000) : [];
  const created = [];
  const errors = [];
  for (let index = 0; index < rows.length; index += 1) {
    const raw = rows[index] || {};
    const setNumber = String(raw.setNumber || "").trim().replace(/-1$/, "");
    const quantity = Number(raw.quantity || 1);
    const purchasePrice = Number(raw.purchasePrice);
    if (!/^\\d{4,6}$/.test(setNumber) || !Number.isInteger(quantity) || quantity < 1 || !Number.isFinite(purchasePrice) || purchasePrice < 0) {
      errors.push({ row: index + 1, error: "invalid_row" });
      continue;
    }
    const item = findTradeableCollectibleBySkuOrId(setNumber);
    if (!item) {
      errors.push({ row: index + 1, setNumber, error: "set_not_in_brick_alpha_catalogue" });
      continue;
    }
    const credits = ["vatReclaim", "rewards", "cashback", "vouchers"].reduce((sum, key) => sum + (Number(raw[key]) || 0), 0);
    const allInTotal = Math.max(0, purchasePrice * quantity + (Number(raw.shipping) || 0) - credits);
    const unitCost = quantity > 0 ? allInTotal / quantity : purchasePrice;
    const note = [
      raw.purchaseDate ? `Date: ${String(raw.purchaseDate).slice(0, 40)}` : "",
      raw.retailer ? `Source: ${String(raw.retailer).slice(0, 120)}` : "",
      `Condition: ${/^opened$/i.test(String(raw.condition || "")) ? "Opened" : "Sealed"}`,
      "Imported collection data",
    ].filter(Boolean).join(". ");
    const trade = createCollectibleTrade(item, "BUY", req.user.id, {
      quantity,
      entryPrice: Number(unitCost.toFixed(2)),
      orderNote: note,
      executionMode: "paper",
      executionProvider: "collection-import",
      executionLabel: "Imported collection",
    });
    req.userState.trades.unshift(trade);
    created.push(trade);
  }
  persistStore();
  res.status(errors.length ? 207 : 201).json({ ok: errors.length === 0, created: created.length, errors, portfolio: req.userState.trades });
});

app.get("/api/connectors", requireAuth, (req, res) => {
  res.json({
    ok: true,
    providers: CONNECTOR_PROVIDERS.map((provider) =>
      buildConnectorView(provider.id, connectorStateForUser(req.userState, provider.id)),
    ),
  });
});

app.put("/api/connectors/:providerId", requireAuth, (req, res) => {
  const providerId = String(req.params.providerId || "").trim().toLowerCase();
  const provider = CONNECTOR_PROVIDER_MAP[providerId];
  if (!provider) {
    res.status(404).json({ ok: false, error: "unknown_connector" });
    return;
  }

  const connector = connectorStateForUser(req.userState, providerId);
  connector.config = sanitizeConnectorConfig(providerId, {
    ...connector.config,
    ...req.body,
  });

  if (providerId === "valr") {
    const existingCredentials = connectorCredentials(connector);
    const nextCredentials = {
      apiKey: String(req.body?.apiKey || existingCredentials.apiKey || "").trim(),
      apiSecret: String(req.body?.apiSecret || existingCredentials.apiSecret || "").trim(),
    };

    if (!nextCredentials.apiKey || !nextCredentials.apiSecret) {
      res.status(400).json({ ok: false, error: "connector_credentials_required" });
      return;
    }

    connector.authBlob = encryptConnectorPayload(nextCredentials);
    connector.status = "configured";
  } else if (providerId === "saxo") {
    const existingCredentials = connectorCredentials(connector);
    const nextCredentials = {
      appKey: String(req.body?.appKey || existingCredentials.appKey || "").trim(),
      appSecret: String(req.body?.appSecret || existingCredentials.appSecret || "").trim(),
      accountKey: String(req.body?.accountKey || existingCredentials.accountKey || "").trim(),
    };

    if (!nextCredentials.appKey || !nextCredentials.appSecret) {
      res.status(400).json({ ok: false, error: "connector_credentials_required" });
      return;
    }

    connector.authBlob = encryptConnectorPayload(nextCredentials);
    connector.status = "manual_setup";
  } else if (providerId === "ibkr") {
    if (!connector.config.gatewayUrl || !connector.config.accountId) {
      res.status(400).json({ ok: false, error: "connector_profile_required" });
      return;
    }

    connector.authBlob = null;
    connector.status = "manual_setup";
  } else if (providerId === "easyequities") {
    if (!connector.config.accountLabel) {
      res.status(400).json({ ok: false, error: "connector_profile_required" });
      return;
    }

    connector.authBlob = null;
    connector.status = "unsupported";
  } else {
    connector.authBlob = null;
    connector.status = connectorBaselineStatus(providerId);
  }

  connector.configured = true;
  connector.lastTestAt = null;
  connector.lastSyncAt = null;
  connector.lastError = null;
  connector.accountSnapshot = null;
  persistStore();

  res.json({
    ok: true,
    detail:
      providerId === "valr"
        ? "VALR credentials saved."
        : providerId === "saxo"
          ? "Saxo setup saved. OAuth and live sync still need the dedicated provider flow."
          : providerId === "ibkr"
            ? "IBKR gateway profile saved. Client Portal / Web API setup remains the next step."
            : providerId === "easyequities"
              ? "EasyEquities profile saved for manual tracking."
              : "Connector setup saved.",
    provider: buildConnectorView(providerId, connector),
  });
});

app.post("/api/connectors/:providerId/test", requireAuth, async (req, res) => {
  const providerId = String(req.params.providerId || "").trim().toLowerCase();
  const provider = CONNECTOR_PROVIDER_MAP[providerId];
  if (!provider) {
    res.status(404).json({ ok: false, error: "unknown_connector" });
    return;
  }

  const connector = connectorStateForUser(req.userState, providerId);

  try {
    const result = await testConnector(providerId, connector);
    connector.status = result.status;
    connector.lastTestAt = nowIso();
    connector.lastError = null;
    persistStore();

    res.json({
      ok: true,
      detail: result.detail,
      provider: buildConnectorView(providerId, connector),
    });
  } catch (error) {
    connector.status = connector.configured ? "error" : connectorBaselineStatus(providerId);
    connector.lastTestAt = nowIso();
    connector.lastError = error.message;
    persistStore();

    res.status(400).json({
      ok: false,
      error: error.message || "connector_test_failed",
      provider: buildConnectorView(providerId, connector),
    });
  }
});

app.post("/api/connectors/:providerId/sync", requireAuth, async (req, res) => {
  const providerId = String(req.params.providerId || "").trim().toLowerCase();
  const provider = CONNECTOR_PROVIDER_MAP[providerId];
  if (!provider) {
    res.status(404).json({ ok: false, error: "unknown_connector" });
    return;
  }

  const connector = connectorStateForUser(req.userState, providerId);

  try {
    const result = await syncConnectorAccount(providerId, connector);
    connector.status = result.status;
    connector.lastTestAt = nowIso();
    connector.lastSyncAt = nowIso();
    connector.lastError = null;
    connector.accountSnapshot = sanitizeAccountSnapshot(result.snapshot);
    persistStore();

    res.json({
      ok: true,
      detail: result.detail,
      provider: buildConnectorView(providerId, connector),
    });
  } catch (error) {
    connector.status = connector.configured ? "error" : connectorBaselineStatus(providerId);
    connector.lastSyncAt = nowIso();
    connector.lastError = error.message;
    persistStore();

    res.status(400).json({
      ok: false,
      error: error.message || "connector_sync_failed",
      provider: buildConnectorView(providerId, connector),
    });
  }
});

app.delete("/api/connectors/:providerId", requireAuth, (req, res) => {
  const providerId = String(req.params.providerId || "").trim().toLowerCase();
  const provider = CONNECTOR_PROVIDER_MAP[providerId];
  if (!provider) {
    res.status(404).json({ ok: false, error: "unknown_connector" });
    return;
  }

  req.userState.connectors[providerId] = defaultConnectorRecord(providerId);
  persistStore();

  res.json({
    ok: true,
    provider: buildConnectorView(providerId, req.userState.connectors[providerId]),
  });
});

app.get("/api/connectors/:providerId/status", requireAuth, async (req, res) => {
  const providerId = String(req.params.providerId || "").trim().toLowerCase();
  const provider = CONNECTOR_PROVIDER_MAP[providerId];
  if (!provider) {
    res.status(404).json({ ok: false, error: "unknown_connector" });
    return;
  }

  const connector = connectorStateForUser(req.userState, providerId);
  const service = getConnectorService();

  try {
    if (service) {
      const status = await service.status({
        userId: req.userState.id,
        providerId,
        now: Date.now(),
      });
      res.json({ ok: true, status });
      return;
    }

    res.json({
      ok: true,
      status: {
        provider: providerId,
        name: provider.name,
        desk: provider.desk,
        availability: provider.availability,
        supportsOrders: false,
        configured: Boolean(connector.authBlob),
        status: connector.status,
        healthState:
          connector.status === "online" ? "HEALTHY" : connector.lastError ? "DEGRADED" : "UNKNOWN",
        freshness: connectorFreshnessForRecord(connector),
        lastSyncAt: connector.lastSyncAt,
        lastHealthCheckAt: null,
        unavailableUntil: null,
        lastError: connector.lastError,
        snapshotCount: connector.accountSnapshot ? 1 : 0,
        latestSnapshot: connector.accountSnapshot,
      },
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error?.message || "connector_status_failed" });
  }
});

app.post("/api/connectors/:providerId/refresh", requireAuth, async (req, res) => {
  const providerId = String(req.params.providerId || "").trim().toLowerCase();
  const provider = CONNECTOR_PROVIDER_MAP[providerId];
  if (!provider) {
    res.status(404).json({ ok: false, error: "unknown_connector" });
    return;
  }
  if (providerId !== "valr") {
    res.status(400).json({ ok: false, error: "sync_not_supported" });
    return;
  }

  const connector = connectorStateForUser(req.userState, providerId);
  if (!Boolean(connector.authBlob)) {
    res.status(400).json({ ok: false, error: "connector_not_configured" });
    return;
  }

  const service = getConnectorService();
  const jobRunner = getConnectorJobRunner();
  const config = getConnectorConfig();

  if (service && jobRunner && config.jobsEnabled) {
    const idempotencyKey =
      String(req.body?.idempotencyKey || "").trim() || crypto.randomUUID();
    const job = await jobRunner.enqueue({
      type: "connector_refresh",
      provider: providerId,
      idempotencyKey,
      correlationId: req.userState.id,
      payload: { userId: req.userState.id, providerId },
    });
    res.status(202).json({
      ok: true,
      queued: true,
      duplicate: Boolean(job.duplicate),
      job: {
        id: job.id,
        type: job.type,
        status: job.status,
        idempotencyKey: job.idempotencyKey,
        runAt: job.runAt,
      },
      provider: buildConnectorView(providerId, connector),
    });
    return;
  }

  try {
    if (service) {
      const credentials = connectorCredentials(connector);
      const result = await service.refreshSnapshot({
        userId: req.userState.id,
        providerId,
        credentials,
        record: connector,
        force: Boolean(req.body?.force),
      });
      res.json({
        ok: true,
        status: result.skipped === "fresh" ? "fresh" : "refreshed",
        freshness: result.freshness,
        provider: buildConnectorView(providerId, connector),
      });
      return;
    }

    const result = await syncConnectorAccount(providerId, connector);
    connector.status = result.status;
    connector.lastTestAt = nowIso();
    connector.lastSyncAt = nowIso();
    connector.lastError = null;
    connector.accountSnapshot = sanitizeAccountSnapshot(result.snapshot);
    persistStore();

    res.json({
      ok: true,
      status: "refreshed",
      freshness: connectorFreshnessForRecord(connector),
      provider: buildConnectorView(providerId, connector),
    });
  } catch (error) {
    connector.status = connector.configured ? "error" : connectorBaselineStatus(providerId);
    connector.lastSyncAt = nowIso();
    connector.lastError = error.message;
    persistStore();

    res.status(400).json({
      ok: false,
      error: error.message || "connector_refresh_failed",
      provider: buildConnectorView(providerId, connector),
    });
  }
});

app.get("/api/health/providers", requireAuth, async (req, res) => {
  const service = getConnectorService();
  try {
    if (service) {
      const providers = await service.fleetHealth({ now: Date.now() });
      res.json({ ok: true, providers });
      return;
    }
    res.json({ ok: true, providers: legacyConnectorHealthView() });
  } catch (error) {
    res.status(400).json({ ok: false, error: error?.message || "provider_health_failed" });
  }
});

app.get("/api/news/targets", requireAuth, (req, res) => {
  res.json({
    ok: true,
    items: req.userState.newsTargets,
  });
});

app.post("/api/news/targets", requireAuth, (req, res) => {
  const target = String(req.body?.target || "").trim();

  if (!target) {
    res.status(400).json({ ok: false, error: "target_required" });
    return;
  }

  req.userState.newsTargets = uniqueStrings([target, ...req.userState.newsTargets]).slice(0, 12);
  persistStore();

  res.status(201).json({
    ok: true,
    items: req.userState.newsTargets,
  });
});

if (fs.existsSync(FRONTEND_INDEX_FILE)) {
  app.use(express.static(FRONTEND_DIST_DIR));
  app.get(/^\/(?!api(?:\/|$)).*/, (_req, res) => {
    res.sendFile(FRONTEND_INDEX_FILE);
  });
}

if (DISABLE_RUNTIME) {
  engineTick();
} else {
  engineTick();
  if (DEMO_MODE) {
    seedDemoNews();
  } else {
    refreshMarketDataOnce().catch((error) => {
      marketDataMeta.lastError = error.message;
    });
    refreshNewsOnce().catch((error) => {
      newsMeta.lastError = error.message;
    });
  }

  setInterval(engineTick, ENGINE_TICK_MS);
  if (!DEMO_MODE) {
    setInterval(() => {
      refreshMarketDataOnce().catch((error) => {
        marketDataMeta.lastError = error.message;
      });
    }, MARKET_REFRESH_MS);
    setInterval(() => {
      refreshNewsOnce().catch((error) => {
        newsMeta.lastError = error.message;
      });
    }, NEWS_REFRESH_MS);
  }

  app.listen(PORT, () => {
    console.log(`Brick Alpha API listening on ${PORT}`);
  });
}

module.exports = app;
module.exports.app = app;

if (process.env.COLLECTTRADE_TEST === "1") {
  module.exports.__testSupport = {
    getStoreSnapshot,
    getUsers: () => users,
    getUserState,
    legacyStoreRepository,
    authService,
    authRepository,
    financialConfig,
    getPostgresFinancialService,
    valuationConfig,
    getValuationService,
    getLegacyValuationService,
    getPostgresValuationService,
    getValuationProviderRegistry,
    connectorConfig: getConnectorConfig,
    getConnectorService,
    getConnectorJobRunner,
    loadStore,
    persistStore,
    resetStore: resetStoreForTests,
    seedDemoUserState,
    runEngineTick: engineTick,
  };
}
