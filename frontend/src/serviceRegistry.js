export const ENTRY_ONBOARDING_SLIDES = [
  {
    id: "scan",
    glyph: "📷",
    eyebrow: "Start here",
    title: "Scan a set. Get a Brick Alpha score.",
    description:
      "Upload or capture a photo, confirm the set match, then generate an investment-grade score you can save into your portfolio.",
    accent: "collectibles",
    bars: [48, 82, 62, 92],
  },
  {
    id: "research",
    glyph: "RS",
    eyebrow: "Research",
    title: "Find sets worth owning.",
    description:
      "Keep valuation evidence, investment notes, and the Brick Alpha recommendation attached to each position you own.",
    accent: "collectibles",
    bars: [56, 74, 88, 68],
  },
  {
    id: "collection",
    glyph: "CL",
    eyebrow: "Collection",
    title: "Review holdings like an investor.",
    description:
      "Portfolio intelligence, retirement timelines, and activity history stay focused on a single LEGO investment workflow.",
    accent: "portfolio",
    bars: [42, 68, 54, 80],
  },
];

export const ENTRY_FLOW_STEPS = [
  {
    id: "access",
    label: "Step 1",
    title: "Account access",
    detail: "Create your account or sign in securely.",
  },
  {
    id: "summary",
    label: "Step 2",
    title: "Service summary",
    detail: "See the product clearly before you move into the workspace.",
  },
  {
    id: "home",
    label: "Step 3",
    title: "Dashboard workspace",
    detail: "Use the Dashboard as your portfolio command center and service launch point.",
  },
];

export const PRIMARY_SERVICE_BLUEPRINTS = [
  {
    id: "scan",
    ordinal: "01",
    glyph: "📷",
    title: "Scan",
    tag: "Start",
    tone: "collectibles",
    page: "scan",
    introId: "scan",
    sectionId: "scan-evaluate",
    deskMode: "launch",
    homeHint: "Start with a scan and get a Brick Alpha score.",
    summaryDetail: () => "Scan a set photo and generate an investment evaluation you can save.",
  },
  {
    id: "research",
    ordinal: "02",
    glyph: "RS",
    title: "Research",
    tag: "Analyze",
    tone: "collectibles",
    page: "research",
    introId: "research",
    sectionId: "investment-analysis",
    deskMode: "launch",
    homeHint: "Analyze and manage LEGO investment positions.",
    summaryDetail: () => "Investment analysis, retirement timelines, and catalog browsing.",
  },
  {
    id: "collection",
    ordinal: "03",
    glyph: "CL",
    title: "Collection",
    tag: "Review",
    tone: "portfolio",
    page: "collection",
    introId: "collection",
    sectionId: "open-positions",
    deskMode: "launch",
    homeHint: "Review holdings, activity, and intelligence.",
    summaryDetail: () => "Holdings list, position detail, and activity history.",
  },
];

export const SECONDARY_SERVICE_BLUEPRINTS = [
  {
    id: "reports",
    ordinal: "06",
    glyph: "RP",
    title: "Research Center",
    tag: "Review",
    tone: "support",
    page: "reports",
    introId: "reports",
    sectionId: "reports-performance",
    deskMode: "launch",
    homeHint: "Open performance graphs, desk exposure, and signal analytics.",
    summaryDetail: () => "Performance graphs",
  },
  {
    id: "subscriptions",
    ordinal: "07",
    glyph: "SB",
    title: "Subscriptions",
    tag: "Plans",
    tone: "support",
    page: "subscriptions",
    introId: "subscriptions",
    sectionId: "subscriptions-overview",
    deskMode: "launch",
    homeHint: "Open plan tiers, premium value, and the commercial upgrade path.",
    summaryDetail: () => "Plans and premium value",
  },
  {
    id: "tools",
    ordinal: "08",
    glyph: "TL",
    title: "Tools",
    tag: "Assist",
    tone: "support",
    page: "tools",
    introId: "tools",
    sectionId: "tools-workbench",
    deskMode: "launch",
    homeHint: "Mentor, analyzer, simulator, and research stack.",
    summaryDetail: () => "Analyzer and simulator",
  },
  {
    id: "connections",
    ordinal: "09",
    glyph: "CN",
    title: "Connections",
    tag: "Route",
    tone: "support",
    page: "connections",
    introId: "connections",
    sectionId: "connections-overview",
    deskMode: "launch",
    homeHint: "Feeds, brokers, and live-routing readiness.",
    summaryDetail: () => "Feeds and routing",
  },
  {
    id: "settings",
    ordinal: "10",
    glyph: "ST",
    title: "Settings",
    tag: "Setup",
    tone: "support",
    page: "settings",
    introId: "settings",
    sectionId: "news-region",
    deskMode: "launch",
    homeHint: "Workspace preferences, region, and setup.",
    summaryDetail: () => "Account and setup",
  },
];

function resolveDeskForBlueprint(blueprint, launchDesk, defaultTradingDesk) {
  if (blueprint.deskMode === "trade") {
    return defaultTradingDesk;
  }

  if (blueprint.deskMode === "crypto") {
    return "crypto";
  }

  return launchDesk;
}

function buildSelection(blueprint, launchDesk, defaultTradingDesk) {
  return {
    page: blueprint.page,
    desk: resolveDeskForBlueprint(blueprint, launchDesk, defaultTradingDesk),
    introId: blueprint.introId,
    sectionId: blueprint.sectionId,
  };
}

export function buildHomeEntrySelection(launchDesk) {
  return {
    page: "home",
    desk: launchDesk,
    introId: "home",
    sectionId: "home-overview",
    landingId: "home",
  };
}

export function buildPrimaryServiceRows({
  launchDesk,
  launchDeskLabel,
  defaultTradingDesk,
  defaultTradingDeskLabel,
}) {
  return PRIMARY_SERVICE_BLUEPRINTS.map((blueprint) => ({
    ...blueprint,
    detail: blueprint.summaryDetail({
      launchDesk,
      launchDeskLabel,
      defaultTradingDesk,
      defaultTradingDeskLabel,
    }),
    selection: buildSelection(blueprint, launchDesk, defaultTradingDesk),
  }));
}

export function buildSecondaryServiceRows({
  launchDesk,
  launchDeskLabel,
  defaultTradingDesk,
  defaultTradingDeskLabel,
}) {
  return SECONDARY_SERVICE_BLUEPRINTS.map((blueprint) => ({
    ...blueprint,
    detail: blueprint.summaryDetail({
      launchDesk,
      launchDeskLabel,
      defaultTradingDesk,
      defaultTradingDeskLabel,
    }),
    selection: buildSelection(blueprint, launchDesk, defaultTradingDesk),
  }));
}

export function buildPrimaryLaunchDefinitions(activeDesk) {
  const launchDesk = activeDesk;
  const defaultTradingDesk = activeDesk === "crypto" ? "forex" : activeDesk;

  return PRIMARY_SERVICE_BLUEPRINTS.map((blueprint) => ({
    ...blueprint,
    selection: buildSelection(blueprint, launchDesk, defaultTradingDesk),
  }));
}

export function buildSecondaryLaunchDefinitions(activeDesk) {
  const launchDesk = activeDesk;
  const defaultTradingDesk = activeDesk === "crypto" ? "forex" : activeDesk;

  return SECONDARY_SERVICE_BLUEPRINTS.map((blueprint) => ({
    ...blueprint,
    selection: buildSelection(blueprint, launchDesk, defaultTradingDesk),
  }));
}

export function buildWorkspaceLaunchDefinitions(activeDesk) {
  return [
    ...buildPrimaryLaunchDefinitions(activeDesk),
    ...buildSecondaryLaunchDefinitions(activeDesk),
  ];
}
