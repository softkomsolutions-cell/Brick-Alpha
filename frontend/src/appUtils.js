import {
  APP_NAME,
  DEFAULT_DESK,
  DEFAULT_EXECUTION_PROFILES,
  DEFAULT_PAGE,
  DESK_FILTERS,
  INTRO_ACTIONS,
  LAUNCH_PREF_KEY,
  MARKET_DESKS,
  NAV_ITEMS,
  ORDER_TICKET_PRESETS,
  VALR_PAIR_OPTIONS,
} from "./appConfig";
import { V3_KNOWN_PAGES, canonicalPage, v3WorkspaceLabel } from "./v3/v3Nav";

export function normalizePage(page) {
  const candidate = canonicalPage(page);
  if (V3_KNOWN_PAGES.includes(candidate)) {
    return candidate;
  }
  if (NAV_ITEMS.some((item) => item.id === candidate)) {
    return candidate;
  }
  return DEFAULT_PAGE;
}

export function normalizeDesk(desk) {
  const candidate = String(desk || "").trim().toLowerCase();
  return DESK_FILTERS.some((item) => item.id === candidate) ? candidate : DEFAULT_DESK;
}

export function parseHashState(hashValue) {
  const normalized = String(hashValue || "").replace(/^#\/?/, "");
  const [pathValue, queryString = ""] = normalized.split("?");
  const params = new URLSearchParams(queryString);
  return {
    page: normalizePage(pathValue.split("/")[0]),
    desk: normalizeDesk(params.get("desk")),
  };
}

export function buildHash(page, desk) {
  return `#/${normalizePage(page)}?desk=${encodeURIComponent(normalizeDesk(desk))}`;
}

export function findDeskMeta(desk) {
  return MARKET_DESKS.find((item) => item.id === normalizeDesk(desk)) || MARKET_DESKS[0];
}

export function labelDesk(desk) {
  return desk === "all" ? "All Markets" : findDeskMeta(desk).label;
}

export function workspaceLabel(page, _desk) {
  return v3WorkspaceLabel(page);
}

export function defaultIntroIdForPage(page) {
  const id = normalizePage(page);
  if (id === "home") {
    return "home";
  }
  if (id === "scan") {
    return "scan";
  }
  if (id === "research") {
    return "research";
  }
  if (id === "collection") {
    return "collection";
  }
  if (id === "exits") {
    return "exits";
  }
  if (id === "subscriptions") {
    return "subscriptions";
  }
  if (id === "settings") {
    return "settings";
  }
  return "research";
}

export function defaultSectionIdForIntro(page, _introId) {
  const id = normalizePage(page);
  if (id === "home") {
    return "home-dashboard";
  }
  if (id === "research") {
    return "investment-analysis";
  }
  if (id === "scan") {
    return "scan-evaluate";
  }
  if (id === "collection") {
    return "open-positions";
  }
  if (id === "exits") {
    return "exits-overview";
  }
  if (id === "subscriptions") {
    return "subscriptions-overview";
  }
  if (id === "settings") {
    return "news-region";
  }
  if (id === "tools") {
    return "tools-workbench";
  }
  if (id === "connections") {
    return "connections-overview";
  }
  return null;
}

export function readLaunchPreference() {
  try {
    const raw = window.localStorage.getItem(LAUNCH_PREF_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    const page = normalizePage(parsed?.page);
    const desk = normalizeDesk(parsed?.desk);
    const introId = INTRO_ACTIONS.some((action) => action.id === parsed?.introId)
      ? parsed.introId
      : defaultIntroIdForPage(page);
    const sectionId =
      typeof parsed?.sectionId === "string" && parsed.sectionId
        ? parsed.sectionId
        : defaultSectionIdForIntro(page, introId);

    return { page, desk, introId, sectionId };
  } catch {
    return null;
  }
}

export function writeLaunchPreference(preference) {
  try {
    window.localStorage.setItem(
      LAUNCH_PREF_KEY,
      JSON.stringify({
        page: normalizePage(preference?.page),
        desk: normalizeDesk(preference?.desk),
        introId:
          INTRO_ACTIONS.find((action) => action.id === preference?.introId)?.id ||
          defaultIntroIdForPage(preference?.page),
        sectionId:
          typeof preference?.sectionId === "string" && preference.sectionId
            ? preference.sectionId
            : defaultSectionIdForIntro(preference?.page, preference?.introId),
      }),
    );
  } catch {
    // Ignore local storage issues and keep the launch flow moving.
  }
}

export function normalizeExecutionProfiles(input) {
  return {
    forex: {
      ...DEFAULT_EXECUTION_PROFILES.forex,
      ...(input?.forex || {}),
      mode: "paper",
      providerId: "saxo",
    },
    etfs: {
      ...DEFAULT_EXECUTION_PROFILES.etfs,
      ...(input?.etfs || {}),
      mode: "paper",
      providerId: "ibkr",
    },
    crypto: {
      ...DEFAULT_EXECUTION_PROFILES.crypto,
      ...(input?.crypto || {}),
      mode: input?.crypto?.mode === "live" ? "live" : "paper",
      providerId: "valr",
      pair: VALR_PAIR_OPTIONS.some((option) => option.value === input?.crypto?.pair)
        ? input.crypto.pair
        : DEFAULT_EXECUTION_PROFILES.crypto.pair,
    },
    jse: {
      ...DEFAULT_EXECUTION_PROFILES.jse,
      ...(input?.jse || {}),
      mode: "paper",
      providerId: "easyequities",
    },
  };
}

export function normalizeAppSettings(input) {
  const subscriptionTier =
    input?.subscriptionTier === "pro" || input?.subscriptionTier === "elite"
      ? input.subscriptionTier
      : "starter";
  return {
      preferredRegion:
        input?.preferredRegion === "global" || input?.preferredRegion === "all"
          ? input.preferredRegion
          : "south-africa",
      timezone: input?.timezone || "Africa/Johannesburg",
      riskMode:
        input?.riskMode === "defensive" || input?.riskMode === "aggressive"
          ? input.riskMode
          : "balanced",
      subscriptionTier,
      alertPreferences: {
        inAppEnabled: input?.alertPreferences?.inAppEnabled !== false,
        emailEnabled:
          subscriptionTier !== "starter" && input?.alertPreferences?.emailEnabled === true,
        digestWindow:
          input?.alertPreferences?.digestWindow === "hourly" ||
          input?.alertPreferences?.digestWindow === "daily"
            ? input.alertPreferences.digestWindow
            : "instant",
      },
      routinePreferences: {
        remindersEnabled: input?.routinePreferences?.remindersEnabled !== false,
        nudgeWindow:
          input?.routinePreferences?.nudgeWindow === "quiet" ||
          input?.routinePreferences?.nudgeWindow === "focused"
            ? input.routinePreferences.nudgeWindow
            : "active",
        celebrationEnabled: input?.routinePreferences?.celebrationEnabled !== false,
      },
      executionProfiles: normalizeExecutionProfiles(input?.executionProfiles),
    };
}

export function formatDateTime(value, timeZone) {
  if (!value) {
    return "Waiting for data";
  }

  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}

export function formatTickerPrice(ticker, value) {
  if (typeof value !== "number") {
    return "--";
  }

  if (ticker === "BTCUSD") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(value);
  }

  if (["SPY", "QQQ", "GLD"].includes(ticker)) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(value);
  }

  if (ticker === "JSE40") {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: "ZAR",
      maximumFractionDigits: 0,
    }).format(value);
  }

  if (ticker === "USDZAR") {
    return `R${value.toFixed(4)}`;
  }

  return value.toFixed(5);
}

export function formatCollectiblePrice(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "Unavailable";
  }
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(numeric);
}

export function labelRegion(region) {
  if (region === "south-africa") {
    return "South Africa";
  }

  if (region === "global") {
    return "Global";
  }

  return "All Regions";
}

export function subscriptionTierLabel(tier) {
  if (tier === "elite") {
    return "Elite";
  }

  if (tier === "pro") {
    return "Pro";
  }

  return "Starter";
}

export function alertDigestWindowLabel(value) {
  if (value === "hourly") {
    return "Hourly digest";
  }

  if (value === "daily") {
    return "Daily digest";
  }

  return "Instant";
}

export function alertKindLabel(kind) {
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

export function formatAlertThreshold(ticker, kind, threshold) {
  const numeric = Number(threshold);
  if (!Number.isFinite(numeric)) {
    return "--";
  }

  if (String(kind || "").startsWith("rsi_")) {
    return numeric.toFixed(1);
  }

  return formatTickerPrice(ticker, numeric);
}

export function actionTone(action) {
  if (action === "BUY") {
    return "buy";
  }

  if (action === "SELL") {
    return "sell";
  }

  return "hold";
}

export function positiveTone(value) {
  if (value > 0) {
    return "positive";
  }

  if (value < 0) {
    return "negative";
  }

  return "muted";
}

export function statusTone(status) {
  if (["online", "ok", "live"].includes(status)) {
    return "positive";
  }

  if (["simulated", "pending", "configured", "manual_setup", "not_configured", "unsupported"].includes(status)) {
    return "muted";
  }

  return "negative";
}

export function humanizeStatus(status) {
  return String(status || "unknown")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function providerLabel(providerId) {
  const normalized = String(providerId || "").trim().toLowerCase();
  if (!normalized) {
    return "Paper";
  }

  const labels = {
    valr: "VALR",
    ibkr: "Interactive Brokers",
    saxo: "Saxo",
    easyequities: "EasyEquities",
    collecttrade: APP_NAME,
  };

  return labels[normalized] || humanizeStatus(normalized);
}

export function venueDetailLabel(label, detail) {
  return detail ? `${label} · ${detail}` : label;
}

export function signalRegionLabel(region) {
  return region === "south-africa" ? "SA macro intelligence" : "Global market intelligence";
}

export function signalTrendTone(anchorTrend) {
  if (anchorTrend === "bullish") {
    return "positive";
  }

  if (anchorTrend === "bearish") {
    return "negative";
  }

  return "muted";
}

export function signalActionToneClass(action) {
  if (action === "BUY") {
    return "positive";
  }

  if (action === "SELL") {
    return "negative";
  }

  return "muted";
}

export function marketFeedLabel(source) {
  if (!source) {
    return "Feed warming";
  }

  if (String(source.provider || "").toLowerCase() === "simulator") {
    return "Simulator feed";
  }

  return venueDetailLabel(source.provider, marketModeLabel(source.status));
}

export function executionPlanForSignal(signal, settings, connectors) {
  const profile =
    settings?.executionProfiles?.[signal?.desk] ||
    DEFAULT_EXECUTION_PROFILES[signal?.desk] ||
    { mode: "paper", providerId: null };

  if (profile.mode !== "live") {
    return {
      mode: "paper",
      providerId: profile.providerId,
      providerLabel: `${APP_NAME} Paper`,
      pair: null,
      ready: true,
      detail: "This ticket stays inside the app and will not send a broker order.",
    };
  }

  if (signal?.desk === "crypto") {
    const connector = (connectors || []).find((provider) => provider.id === "valr");
    const pair = connector?.config?.preferredPair || profile.pair || DEFAULT_EXECUTION_PROFILES.crypto.pair;
    return {
      mode: "live",
      providerId: "valr",
      providerLabel: "VALR Live",
      pair,
      ready: Boolean(connector?.configured),
      detail: connector?.configured
        ? `This order will route to ${pair} on VALR.`
        : "Save VALR credentials first before switching crypto into live routing.",
    };
  }

  return {
    mode: "paper",
    providerId: profile.providerId,
    providerLabel: `${APP_NAME} Paper`,
    pair: null,
    ready: true,
    detail: "Live routing is not wired for this desk yet, so it stays in paper mode.",
  };
}

export function orderTicketPresetForDesk(desk, kind = "market") {
  if (kind === "collectible") {
    return ORDER_TICKET_PRESETS.collectible;
  }

  return ORDER_TICKET_PRESETS[normalizeDesk(desk)] || ORDER_TICKET_PRESETS.forex;
}

export function formatTicketPlanInput(ticket, value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "";
  }

  if (ticket?.kind === "collectible") {
    return numeric.toFixed(2);
  }

  if (ticket?.desk === "crypto") {
    return numeric.toFixed(2);
  }

  if (ticket?.desk === "forex") {
    return numeric.toFixed(4);
  }

  return numeric.toFixed(2);
}

export function buildTicketPlanDefaults(ticket, preset, side = "BUY") {
  const price = Number(ticket?.price);
  if (!Number.isFinite(price) || price <= 0) {
    return {
      stopPrice: "",
      targetPrice: "",
      riskBudget: preset?.defaultRiskBudget || "",
    };
  }

  const stopPercent = Number(preset?.stopDistancePercent || 0);
  const targetPercent = Number(preset?.targetDistancePercent || 0);
  const stopMultiplier = side === "SELL" ? 1 + stopPercent / 100 : 1 - stopPercent / 100;
  const targetMultiplier = side === "SELL" ? 1 - targetPercent / 100 : 1 + targetPercent / 100;

  return {
    stopPrice: formatTicketPlanInput(ticket, price * stopMultiplier),
    targetPrice: formatTicketPlanInput(ticket, price * targetMultiplier),
    riskBudget: preset?.defaultRiskBudget || "",
  };
}

export function sameTicketPlanValue(left, right) {
  const leftValue = Number(left);
  const rightValue = Number(right);

  if (Number.isFinite(leftValue) && Number.isFinite(rightValue)) {
    return Math.abs(leftValue - rightValue) < 0.0001;
  }

  return String(left || "") === String(right || "");
}

export function resolveTicketPlanMeta(ticket, stopPrice = ticket?.stopPrice, targetPrice = ticket?.targetPrice) {
  const baseStopPrice = ticket?.baseStopPrice ?? "";
  const baseTargetPrice = ticket?.baseTargetPrice ?? "";
  const isOverride =
    !sameTicketPlanValue(stopPrice, baseStopPrice) || !sameTicketPlanValue(targetPrice, baseTargetPrice);

  if (isOverride) {
    return {
      planSource: "Ticket override",
      planRationale: "Live chart preview is following the stop and target you are editing right now.",
    };
  }

  return {
    planSource: ticket?.basePlanSource || ticket?.planSource || "Desk preset",
    planRationale:
      ticket?.basePlanRationale ||
      ticket?.planRationale ||
      "Using desk-default risk and reward spacing.",
  };
}

export function marketModeLabel(mode) {
  if (mode === "live") {
    return "Live";
  }

  if (mode === "hybrid") {
    return "Live + Fallback";
  }

  return "Simulated";
}

export function technicalTone(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("buy") || normalized === "bullish" || normalized === "oversold") {
    return "positive";
  }

  if (
    normalized.includes("watch") ||
    normalized.includes("caution") ||
    normalized.includes("elevated") ||
    normalized.includes("mixed")
  ) {
    return "warning";
  }

  if (normalized.includes("sell") || normalized === "bearish" || normalized === "overbought") {
    return "negative";
  }

  return "muted";
}

export function rsiZoneLabel(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "Waiting";
  }

  if (numeric >= 70) {
    return "Overbought";
  }

  if (numeric <= 30) {
    return "Oversold";
  }

  if (numeric >= 60) {
    return "Bullish";
  }

  if (numeric <= 40) {
    return "Bearish";
  }

  return "Neutral";
}

export function rsiToneFromValue(value) {
  return technicalTone(rsiZoneLabel(value));
}

export function formatConnectorAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return "--";
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: Math.abs(amount) >= 1000 ? 2 : 8,
  }).format(amount);
}

export function handleInteractiveKey(event, action) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    action();
  }
}

export function openExternal(url) {
  if (!url) {
    return;
  }

  window.open(url, "_blank", "noopener,noreferrer");
}

export function formatTradePrice(trade, value) {
  if (typeof value !== "number") {
    return "--";
  }

  if (trade?.assetClass === "collectible" || trade?.kind === "collectible") {
    return formatCollectiblePrice(value);
  }

  return formatTickerPrice(trade?.marketTicker, value);
}

export function formatQuantity(value, unitLabel = "units") {
  const quantity = Number(value);
  if (!Number.isFinite(quantity)) {
    return `1 ${unitLabel}`;
  }

  const displayValue = Number(quantity.toFixed(quantity % 1 === 0 ? 0 : 8));
  const singular =
    unitLabel === "items" ? "item" : unitLabel === "units" ? "unit" : unitLabel;
  return `${displayValue} ${displayValue === 1 ? singular : unitLabel}`;
}

