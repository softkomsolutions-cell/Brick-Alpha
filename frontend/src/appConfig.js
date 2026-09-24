export const API_BASE_URL = import.meta.env?.VITE_API_URL || "";

export const TOKEN_KEY = "collecttrade_token";
export const DESK_KEY = "collecttrade_active_desk";
export const LAUNCH_PREF_KEY = "collecttrade_launch_preference";

export const APP_NAME = "Brick Alpha";
export const APP_WORDMARK = "BRICK ALPHA";
export const APP_MARK = "BA";
export const APP_TAGLINE = "AI Investment Intelligence for LEGO Collectors";
export const APP_SUBTAGLINE = "Build Value. Grow Wealth.";
export const LOGO_ICON = "/brick-alpha-icon.svg";
export const LOGO_FULL = "/brick-alpha-logo.svg";
export const DEFAULT_EXECUTION_PROFILES = {
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
};

export const DEFAULT_SETTINGS = {
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
  executionProfiles: DEFAULT_EXECUTION_PROFILES,
  usdZarRate: 18.5,
};

export const ALERT_SUBSCRIPTION_OPTIONS = [
  {
    id: "starter",
    label: "Starter",
    maxAlerts: 5,
    emailEnabled: false,
    description: "Light alert tracking for partner testing and daily monitoring.",
  },
  {
    id: "pro",
    label: "Pro",
    maxAlerts: 20,
    emailEnabled: true,
    description: "The first paid tier with deeper alert coverage and queued email delivery.",
  },
  {
    id: "elite",
    label: "Elite",
    maxAlerts: 50,
    emailEnabled: true,
    description: "High-coverage alerting for heavier desks and premium subscriber workflows.",
  },
];

export const VALR_PAIR_OPTIONS = [
  { value: "BTCUSDT", label: "BTC/USDT" },
  { value: "BTCUSDC", label: "BTC/USDC" },
  { value: "BTCZAR", label: "BTC/ZAR" },
];

export const NAV_ITEMS = [
  {
    id: "home",
    label: "Home",
    glyph: "HM",
    section: "Primary",
    hint: "Collection value, signals, and your next move",
  },
  {
    id: "research",
    label: "Research",
    glyph: "RS",
    section: "Primary",
    hint: "Browse sets, retiring soon, and top performers",
  },
  {
    id: "scan",
    label: "Scan",
    glyph: "📷",
    icon: "camera",
    section: "Primary",
    hint: "Identify a set and open the investment decision path",
  },
  {
    id: "collection",
    label: "Collection",
    glyph: "CL",
    section: "Primary",
    hint: "Holdings, cost basis, and performance",
  },
  {
    id: "exits",
    label: "Exits",
    glyph: "EX",
    section: "Primary",
    hint: "Sell windows, net proceeds, and exit recommendations",
  },
  {
    id: "verdict",
    label: "Verdict",
    glyph: "VD",
    section: "Workflow",
    hint: "Fast buy/hold/skip decision",
  },
  {
    id: "set-analysis",
    label: "Set Analysis",
    glyph: "SA",
    section: "Workflow",
    hint: "Nine-factor deep dive",
  },
  {
    id: "log-purchase",
    label: "Log Purchase",
    glyph: "LP",
    section: "Workflow",
    hint: "Acquisition details and condition",
  },
  {
    id: "subscriptions",
    label: "Subscriptions",
    glyph: "SB",
    section: "Account",
    hint: "Plans, premium value, and upgrade path",
  },
  {
    id: "settings",
    label: "Settings",
    glyph: "ST",
    section: "Account",
    hint: "Account and preferences",
  },
];

export const NAV_GROUPS = [
  { id: "primary", label: "Invest" },
  { id: "workflow", label: "Decision path" },
  { id: "account", label: "Account" },
];

const RESEARCH_SECTIONS = [
  { id: "investment-analysis", label: "Analysis" },
  { id: "retirement-intelligence", label: "Retiring soon" },
  { id: "collectibles-trading", label: "Browse" },
  { id: "collectibles-reference", label: "Reference" },
  { id: "collectibles-grid", label: "Catalog" },
];

const COLLECTION_SECTIONS = [
  { id: "portfolio-intelligence", label: "Overview" },
  { id: "portfolio-growth", label: "Growth" },
  { id: "portfolio-allocation", label: "Themes" },
  { id: "portfolio-holdings", label: "Holdings" },
  { id: "portfolio-dashboard", label: "Dashboard" },
  { id: "position-detail", label: "Detail" },
  { id: "open-positions", label: "Open" },
  { id: "order-history", label: "History" },
];

export const SCREEN_PREVIEWS = {
  home: "Collection value, cost basis, gain, return, and portfolio signals at a glance.",
  research: "Search and browse LEGO investment opportunities, retiring sets, and performance leaders.",
  scan: "Photograph or enter a set number for identification and Brick Alpha evaluation.",
  collection: "Your LEGO collection — cost basis, current value, gain, and per-set performance.",
  exits: "Sell-window proximity, estimated net proceeds, and exit recommendations.",
  verdict: "Decision-first recommendation, score, confidence, ROI, and risk.",
  "set-analysis": "Nine-factor set analysis with progressive evidence.",
  "log-purchase": "Log acquisition price, date, retailer, quantity, condition, and notes.",
  subscriptions: "Plan tiers, premium feature value, and the commercial upgrade path.",
  settings: "Account preferences, alerts, install, and partner testing.",
};

export const PAGE_SECTION_LINKS = {
  home: [{ id: "home-dashboard", label: "Overview" }],
  research: RESEARCH_SECTIONS,
  scan: [{ id: "scan-evaluate", label: "Scan" }],
  collection: COLLECTION_SECTIONS,
  exits: [
    { id: "exits-overview", label: "Overview" },
    { id: "exits-candidates", label: "Candidates" },
  ],
  verdict: [{ id: "verdict-summary", label: "Decision" }],
  "set-analysis": [{ id: "set-analysis-factors", label: "Factors" }],
  "log-purchase": [{ id: "log-purchase-form", label: "Purchase" }],
  subscriptions: [
    { id: "subscriptions-overview", label: "Overview" },
    { id: "subscriptions-tiers", label: "Tiers" },
    { id: "subscriptions-premium", label: "Premium" },
  ],
  settings: [
    { id: "account-settings", label: "Account" },
    { id: "install-app", label: "Install" },
    { id: "news-region", label: "Region" },
    { id: "alerts-plan", label: "Alerts" },
    { id: "routine-preferences", label: "Routine" },
    { id: "partner-testing", label: "Testing" },
    { id: "feedback-board", label: "Feedback" },
    { id: "web-targets", label: "Targets" },
  ],
};

export const DEFAULT_PAGE = "home";

export const MARKET_DESKS = [
  {
    id: "forex",
    label: "Forex",
    shortLabel: "FX",
    heading: "Forex Desk",
    blurb: "USD/ZAR and EUR/USD setups built around the 8/21 EMA cross, retest, and clean trend continuation.",
  },
  {
    id: "etfs",
    label: "ETFs",
    shortLabel: "ETF",
    heading: "ETF Desk",
    blurb: "SPY, QQQ, and GLD give you index, tech, and macro expression without leaving the same workflow.",
  },
  {
    id: "crypto",
    label: "Crypto",
    shortLabel: "CRYPTO",
    heading: "Crypto Desk",
    blurb: "BTC/USD sits in its own lane with faster volatility and the same disciplined EMA framework.",
  },
  {
    id: "jse",
    label: "JSE",
    shortLabel: "LOCAL",
    heading: "JSE Desk",
    blurb: "South African index exposure stays close to the macro feed and local market rhythm.",
  },
];

export const DESK_PLAYBOOKS = {
  all: {
    watchlist: "Cross-market scan",
    venue: "Desk-specific routing",
    cadence: "Start broad, then narrow to the cleanest setup.",
    risk: "Only act where structure, news, and momentum line up cleanly.",
  },
  forex: {
    watchlist: "USD/ZAR and EUR/USD",
    venue: "Macro-led currency execution",
    cadence: "Best around London and New York participation windows.",
    risk: "Respect the 21 EMA retest and widen risk around hard macro events.",
  },
  etfs: {
    watchlist: "SPY, QQQ, and GLD",
    venue: "US session ETF flow",
    cadence: "Favor clean continuation after the cash open settles.",
    risk: "Avoid forcing entries into midday drift or weak follow-through volume.",
  },
  crypto: {
    watchlist: "BTC/USD and BTC/ZAR routing",
    venue: "Always-on crypto execution",
    cadence: "Use multi-timeframe alignment before chasing momentum.",
    risk: "Size down into weekend volatility and overextended RSI heat.",
  },
  jse: {
    watchlist: "Top40-linked local exposure",
    venue: "South African market rhythm",
    cadence: "Stay close to local macro headlines and opening direction.",
    risk: "Be selective when liquidity thins or USD/ZAR is whipping around.",
  },
};

export const ORDER_TICKET_PRESETS = {
  forex: {
    deskLabel: "Forex desk",
    unitLabel: "units",
    defaultQuantity: "1",
    quantityStep: "1",
    minQuantity: "1",
    timingHint: "Best when London or New York participation confirms the move.",
    notePlaceholder: "Macro trigger, retest level, and invalidation if the 21 EMA fails.",
    executionCue: "Stay alert to scheduled macro data and sharp rand volatility.",
    stopDistancePercent: 0.6,
    targetDistancePercent: 1.2,
    defaultRiskBudget: "500",
    warnings: [
      "Avoid forcing entries into high-impact macro releases.",
      "Respect the 21 EMA retest before sizing up.",
    ],
    checklist: [
      "Anchor trend agrees with the side you are taking.",
      "Gap state and retest are still supportive.",
      "Macro headline risk is understood before entry.",
    ],
  },
  etfs: {
    deskLabel: "ETF desk",
    unitLabel: "shares",
    defaultQuantity: "1",
    quantityStep: "1",
    minQuantity: "1",
    timingHint: "Prefer clean continuation after the US cash session settles.",
    notePlaceholder: "Session flow, level, and why this ETF should keep following through.",
    executionCue: "Use cash-session participation as your quality filter.",
    stopDistancePercent: 1.5,
    targetDistancePercent: 3,
    defaultRiskBudget: "750",
    warnings: [
      "Midday ETF drift can fake momentum without real follow-through.",
      "Do not chase a stretched candle into obvious resistance.",
    ],
    checklist: [
      "Broad index tone supports the trade.",
      "Volume is not fading on the push.",
      "The setup still looks clean after the open.",
    ],
  },
  crypto: {
    deskLabel: "Crypto desk",
    unitLabel: "BTC",
    defaultQuantity: "0.001",
    quantityStep: "0.00000001",
    minQuantity: "0.00000001",
    timingHint: "Wait for 1H, 4H, and daily context to stop fighting each other.",
    notePlaceholder: "Timeframe alignment, liquidity pocket, and invalidation if momentum fades.",
    executionCue: "Crypto trades around the clock, so poor timing gets punished fast.",
    stopDistancePercent: 3,
    targetDistancePercent: 6,
    defaultRiskBudget: "600",
    warnings: [
      "Weekend liquidity and funding squeezes can reverse a clean-looking entry fast.",
      "If live routing is on, this can become a real venue order immediately.",
    ],
    checklist: [
      "Multi-timeframe technical pulse is aligned enough to act.",
      "The move is not purely derivative-driven exhaustion.",
      "You know where the trade is wrong before you submit it.",
    ],
  },
  jse: {
    deskLabel: "JSE desk",
    unitLabel: "shares",
    defaultQuantity: "1",
    quantityStep: "1",
    minQuantity: "1",
    timingHint: "Stay close to local market rhythm and USD/ZAR tone.",
    notePlaceholder: "Local catalyst, opening tone, and what would invalidate the trade.",
    executionCue: "Local liquidity can thin quickly, so patience matters.",
    stopDistancePercent: 1.2,
    targetDistancePercent: 2.4,
    defaultRiskBudget: "500",
    warnings: [
      "Thin local liquidity can exaggerate slippage and false breaks.",
      "Respect USD/ZAR swings when local direction feels unstable.",
    ],
    checklist: [
      "Local macro context still supports the setup.",
      "The trade is not fighting the broader rand move.",
      "There is enough liquidity to justify the entry.",
    ],
  },
  collectible: {
    deskLabel: "LEGO investment desk",
    unitLabel: "items",
    defaultQuantity: "1",
    quantityStep: "1",
    minQuantity: "1",
    timingHint: "Think in holding horizon, buyer depth, and resale friction.",
    notePlaceholder: "Why this item should appreciate, how long you expect to hold it, and what would change your mind.",
    executionCue: "These positions are paper-tracked investment ideas, not live venue orders.",
    stopDistancePercent: 8,
    targetDistancePercent: 18,
    defaultRiskBudget: "1500",
    warnings: [
      "Liquidity is slower and depends on buyer demand, not instant order books.",
      "Condition, edition, and patience matter more than chart speed here.",
    ],
    checklist: [
      "The collectible has a clear demand thesis.",
      "You are comfortable with a slower exit path.",
      "The entry fits the longer hold profile.",
    ],
  },
};

export const DESK_FILTERS = [{ id: "all", label: "All Markets" }, ...MARKET_DESKS];
export const DEFAULT_DESK = MARKET_DESKS[0].id;

export const INTRO_ACTIONS = [
  {
    id: "home",
    ordinal: "00",
    glyph: "HM",
    eyebrow: "Hub",
    title: "Home",
    page: "home",
    sectionId: "home-dashboard",
    destination: "Home",
    blurb: "Land on Home first — collection value, growth, and AI summary in one view.",
  },
  {
    id: "scan",
    ordinal: "01",
    glyph: "📷",
    eyebrow: "Start",
    title: "Scan",
    page: "scan",
    sectionId: "scan-evaluate",
    destination: "Identify & evaluate",
    blurb: "Start with a photo scan to identify the set and generate a Brick Alpha investment evaluation.",
  },
  {
    id: "collection",
    ordinal: "02",
    glyph: "CL",
    eyebrow: "Own",
    title: "Collection",
    page: "collection",
    sectionId: "portfolio-intelligence",
    destination: "Collection intelligence",
    blurb: "Review LEGO collection value, growth, theme allocation, and Brick Alpha holdings.",
  },
  {
    id: "research",
    ordinal: "03",
    glyph: "RS",
    eyebrow: "Research",
    title: "Research",
    page: "research",
    sectionId: "investment-analysis",
    destination: "Set research",
    blurb: "Analyze a set, attach evidence, and compare retirement and performance signals.",
  },
  {
    id: "settings",
    ordinal: "04",
    glyph: "ST",
    eyebrow: "Setup",
    title: "Settings",
    page: "settings",
    sectionId: "news-region",
    destination: "Account Controls",
    blurb: "Adjust account preferences, region, alerts, routine reminders, and partner-testing tools.",
  },
  {
    id: "subscriptions",
    ordinal: "05",
    glyph: "SB",
    eyebrow: "Plans",
    title: "Subscriptions",
    page: "subscriptions",
    sectionId: "subscriptions-overview",
    destination: "Subscription plans",
    blurb: "Show what is included today, what becomes premium, and how the product monetizes cleanly.",
  },
];

export const TRADE_PATHS = [
  {
    id: "collectibles",
    page: "collectibles",
    desk: null,
    glyph: "AL",
    eyebrow: "ALT",
    title: "Analyze LEGO Investments",
    destination: "LEGO Investments",
    blurb: "Analyze LEGO sets and investment-grade collectibles with the same ticket workflow.",
  },
  {
    id: "scan",
    page: "scan",
    desk: null,
    glyph: "📷",
    eyebrow: "START",
    title: "Scan",
    destination: "Identify & evaluate",
    blurb: "Start by scanning a set to generate an evaluation and save it into your collection.",
  },
];

export const RESEARCH_REPORTS = [
  {
    id: "ema-framework",
    title: "8 and 21 EMA Trading Strategy",
    subtitle: "Trend continuation, retest logic, and disciplined exits.",
    desk: "signals",
    targetDesk: "forex",
    targetSection: "chart-panel",
  },
  {
    id: "forex-report",
    title: "Forex Market Trends Comprehensive Report",
    subtitle: "South Africa-aware macro context for FX positioning and trend bias.",
    desk: "news",
    targetDesk: "forex",
    targetSection: "macro-feed",
  },
  {
    id: "bitcoin-fibonacci",
    title: "Bitcoin Fibonacci Analysis",
    subtitle: "Fib pivots, correction zones, and BTC structure for the crypto desk.",
    desk: "signals",
    targetDesk: "crypto",
    targetSection: "chart-panel",
  },
];

export const RAILS = [
  "IBKR (Global)",
  "Saxo (Wealth)",
  "VALR (Crypto)",
  "EasyEquities (JSE)",
];

export const PARTNER_TEST_FLOW = [
  {
    id: "briefing",
    ordinal: "01",
    title: "Test briefing",
    detail: "Start from the public link in a fresh session, then check that the intro screen, desk selection, and auth flow feel clear and deliberate.",
    page: "settings",
    desk: null,
    sectionId: "partner-testing",
  },
  {
    id: "scan",
    ordinal: "02",
    title: "Scan",
    detail: "Upload a set photo, confirm the identification result, and validate the Brick Alpha score + recommendation output.",
    page: "scan",
    desk: null,
    sectionId: "scan-evaluate",
  },
  {
    id: "research",
    ordinal: "03",
    title: "Research",
    detail: "Review LEGO research, retirement intelligence, and catalogue browsing inside Brick Alpha.",
    page: "research",
    desk: null,
    sectionId: "collectibles-grid",
  },
  {
    id: "collection",
    ordinal: "04",
    title: "Collection",
    detail: "Confirm the collection list, set detail, and activity history stay coherent.",
    page: "collection",
    desk: null,
    sectionId: "open-positions",
  },
  {
    id: "feedback",
    ordinal: "05",
    title: "Feedback board",
    detail: "Leave one structured note with area, severity, and reproduction context so the board stays actionable.",
    page: "settings",
    desk: null,
    sectionId: "feedback-board",
  },
];
