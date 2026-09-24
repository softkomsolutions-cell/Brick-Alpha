/** Brick Alpha v3 — canonical routes and navigation (Spec v3). */

export const V3_PAGE = {
  HOME: "home",
  RESEARCH: "research",
  SCAN: "scan",
  COLLECTION: "collection",
  EXITS: "exits",
  VERDICT: "verdict",
  SET_ANALYSIS: "set-analysis",
  LOG_PURCHASE: "log-purchase",
};

export const LEGACY_PAGE_ALIASES = {
  "scan-evaluate": V3_PAGE.SCAN,
  collectibles: V3_PAGE.RESEARCH,
  portfolio: V3_PAGE.COLLECTION,
};

export const V3_UTILITY_PAGES = [
  "settings",
  "subscriptions",
  "news",
  "signals",
  "tools",
  "reports",
  "connections",
];

export const V3_KNOWN_PAGES = [...Object.values(V3_PAGE), ...V3_UTILITY_PAGES];

export function canonicalPage(page) {
  const candidate = String(page || "")
    .trim()
    .toLowerCase();
  return LEGACY_PAGE_ALIASES[candidate] || candidate;
}

export const V3_PRIMARY_NAV = [
  {
    id: V3_PAGE.HOME,
    label: "Home",
    glyph: "HM",
    hint: "Collection value, signals, and your next move",
    section: "Primary",
  },
  {
    id: V3_PAGE.RESEARCH,
    label: "Research",
    glyph: "RS",
    hint: "Browse sets, retiring soon, and top performers",
    section: "Primary",
  },
  {
    id: V3_PAGE.SCAN,
    label: "Scan",
    glyph: "📷",
    icon: "camera",
    hint: "Identify a set and open the investment decision path",
    section: "Primary",
    centerAction: true,
  },
  {
    id: V3_PAGE.COLLECTION,
    label: "Collection",
    glyph: "CL",
    hint: "Cost basis and performance",
    section: "Primary",
  },
  {
    id: V3_PAGE.EXITS,
    label: "Exits",
    glyph: "EX",
    hint: "Sell windows, net proceeds, and exit recommendations",
    section: "Primary",
  },
];

export const V3_SECONDARY_NAV = [
  {
    id: V3_PAGE.VERDICT,
    label: "Verdict",
    glyph: "VD",
    hint: "Buy ×2 flywheel, Buy ×1, Only below a price, or Skip",
  },
  {
    id: V3_PAGE.SET_ANALYSIS,
    label: "Set Analysis",
    glyph: "SA",
    hint: "Nine-factor deep dive behind the verdict",
  },
  {
    id: V3_PAGE.LOG_PURCHASE,
    label: "Log Purchase",
    glyph: "LP",
    hint: "Record acquisition price, date, source, and condition",
  },
];

export const V3_ACCOUNT_NAV = [
  {
    id: "settings",
    label: "Settings",
    glyph: "ST",
    section: "Account",
    hint: "Account and preferences",
  },
];

export function v3WorkspaceLabel(page) {
  const id = canonicalPage(page);
  const primary = V3_PRIMARY_NAV.find((item) => item.id === id);
  if (primary) {
    return primary.label;
  }
  const secondary = V3_SECONDARY_NAV.find((item) => item.id === id);
  if (secondary) {
    return secondary.label;
  }
  const account = V3_ACCOUNT_NAV.find((item) => item.id === id);
  if (account) {
    return account.label;
  }
  if (id === "news") {
    return "Market News";
  }
  if (id === "signals") {
    return "Signals";
  }
  if (id === "tools") {
    return "Tools";
  }
  if (id === "reports") {
    return "Reports";
  }
  if (id === "connections") {
    return "Connections";
  }
  return "Brick Alpha";
}

const V3_HIDDEN_MOBILE_MENU_IDS = new Set([
  "menu-news",
  "menu-trading",
  "menu-crypto",
  "forex",
  "etfs",
  "crypto",
  "jse",
]);

export function v3MobileMenuItems(items, legoJourney) {
  if (!legoJourney) {
    return items;
  }
  return (items || []).filter((item) => !V3_HIDDEN_MOBILE_MENU_IDS.has(item.id));
}

export function isV3LegoJourneyPage(page) {
  const id = canonicalPage(page);
  return (
    V3_PRIMARY_NAV.some((item) => item.id === id) ||
    V3_SECONDARY_NAV.some((item) => item.id === id) ||
    V3_ACCOUNT_NAV.some((item) => item.id === id)
  );
}
