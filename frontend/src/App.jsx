import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import "./App.css";
import "./saasTheme.css";
import "./specV3.css";
import "./v3/v3Layout.css";
import {
  API_BASE_URL,
  APP_NAME,
  APP_TAGLINE,
  APP_WORDMARK,
  DEFAULT_DESK,
  DEFAULT_EXECUTION_PROFILES,
  DEFAULT_PAGE,
  DEFAULT_SETTINGS,
  MARKET_DESKS,
  NAV_GROUPS,
  NAV_ITEMS,
  PAGE_SECTION_LINKS,
  RESEARCH_REPORTS,
  SCREEN_PREVIEWS,
  TOKEN_KEY,
} from "./appConfig";
import {
  buildHash,
  buildTicketPlanDefaults,
  defaultIntroIdForPage,
  executionPlanForSignal,
  formatDateTime,
  formatCollectiblePrice,
  formatTicketPlanInput,
  labelDesk,
  marketModeLabel,
  normalizeAppSettings,
  normalizeDesk,
  normalizePage,
  orderTicketPresetForDesk,
  parseHashState,
  providerLabel,
  readLaunchPreference,
  resolveTicketPlanMeta,
  statusTone,
  subscriptionTierLabel,
  writeLaunchPreference,
  workspaceLabel,
} from "./appUtils";
import {
  AuthShell,
  BootSplash,
  EmptyState,
  ExecutiveSummaryStrip,
  GlobalSearch,
  SaasTopNav,
  SplashScreen,
} from "./components/appShell";
import { BrandLogo } from "./components/brandLogo";
import {
  enrichBrickAlphaCollectible,
  enrichBrickAlphaTrade,
} from "./brickAlphaModel";
import { summarizeOpenCollection } from "./v3/collection/ownershipModel";
import { V3BottomNav } from "./v3/V3BottomNav";
import { V3Sidebar } from "./v3/V3Sidebar";
import { V3OnboardingFlow } from "./v3/onboarding/V3OnboardingFlow";
import { isV3OnboardingComplete } from "./v3/onboarding/onboardingStorage";
import { clearV3DemoDeviceState } from "./v3/demo/demoDeviceState";
import { isV3LegoJourneyPage, v3MobileMenuItems } from "./v3/v3Nav";

function lazyNamedExport(factory, exportName) {
  return lazy(() =>
    factory().then((module) => ({
      default: module[exportName],
    })),
  );
}

const TradeScreen = lazy(() => import("./components/tradeScreen"));
const HomeScreen = lazy(() =>
  import("./v3/screens/HomeScreen").then((module) => ({ default: module.HomeScreen })),
);
const NewsScreen = lazyNamedExport(() => import("./components/workspaceScreens"), "NewsScreen");
const ToolsScreen = lazyNamedExport(() => import("./components/workspaceScreens"), "ToolsScreen");
const ResearchScreen = lazy(() =>
  import("./v3/screens/ResearchScreen").then((module) => ({ default: module.ResearchScreen })),
);
const ScanEvaluateScreen = lazyNamedExport(
  () => import("./components/workspaceScreens"),
  "ScanEvaluateScreen",
);
const CollectionScreen = lazy(() =>
  import("./v3/screens/CollectionScreen").then((module) => ({ default: module.CollectionScreen })),
);
const ReportsScreen = lazyNamedExport(
  () => import("./components/workspaceScreens"),
  "ReportsScreen",
);
const SubscriptionsScreen = lazyNamedExport(
  () => import("./components/workspaceScreens"),
  "SubscriptionsScreen",
);
const ConnectionsScreen = lazyNamedExport(
  () => import("./components/workspaceScreens"),
  "ConnectionsScreen",
);
const SettingsScreen = lazyNamedExport(
  () => import("./components/workspaceScreens"),
  "SettingsScreen",
);
const OrderTicketModal = lazyNamedExport(
  () => import("./components/workspaceCards"),
  "OrderTicketModal",
);
const ExitsScreen = lazy(() => import("./v3/screens/ExitsScreen").then((m) => ({ default: m.ExitsScreen })));
const VerdictScreen = lazy(() =>
  import("./v3/screens/VerdictScreen").then((m) => ({ default: m.VerdictScreen })),
);
const SetAnalysisScreen = lazy(() =>
  import("./v3/screens/SetAnalysisScreen").then((m) => ({ default: m.SetAnalysisScreen })),
);
const LogPurchaseScreen = lazy(() =>
  import("./v3/screens/LogPurchaseScreen").then((m) => ({ default: m.LogPurchaseScreen })),
);

const EMPTY_SIGNALS_RESPONSE = {
  generatedAt: null,
  leadSignal: null,
  signals: [],
  marketData: {
    provider: "Simulator",
    mode: "simulated",
    interval: "1h",
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastError: null,
    sourceStatus: [],
  },
  strategyRules: [],
};

const EMPTY_NEWS_RESPONSE = {
  region: DEFAULT_SETTINGS.preferredRegion,
  refreshedAt: null,
  items: [],
  sources: [],
  sourceStatus: [],
};

const EMPTY_COLLECTIBLES_RESPONSE = {
  updatedAt: null,
  categories: [],
  brands: [],
  items: [],
  referenceShelves: [],
};

const EMPTY_FEEDBACK_RESPONSE = {
  items: [],
  summary: {},
  permissions: { canManage: false },
};

const EMPTY_WATCHLIST_RESPONSE = {
  items: [],
};

const EMPTY_ALERTS_RESPONSE = {
  items: [],
  summary: {
    total: 0,
    enabled: 0,
    disabled: 0,
    triggered: 0,
    priceAlerts: 0,
    rsiAlerts: 0,
    maxAllowed: 5,
    remaining: 5,
    overLimit: 0,
    subscriptionTier: "starter",
    emailEligible: false,
    emailQueued: 0,
  },
  plan: {
    id: "starter",
    label: "Starter",
    maxAlerts: 5,
    emailEnabled: false,
  },
  deliverySummary: {
    total: 0,
    queued: 0,
    sent: 0,
    cancelled: 0,
  },
  deliveryQueue: [],
};

const EMPTY_NOTIFICATIONS_RESPONSE = {
  items: [],
  summary: {
    total: 0,
    unread: 0,
    read: 0,
  },
};

const EMPTY_ROUTINE_RESPONSE = {
  currentDate: null,
  completedStepIds: [],
  activeDates: [],
  streakCount: 0,
  bestStreakCount: 0,
  weekActiveCount: 0,
  sessionMode: "morning",
  completedAt: null,
  isComplete: false,
  reminderDismissedDate: null,
  completionAcknowledgedDate: null,
  updatedAt: null,
};

function normalizeAlertsResponse(data = {}) {
  return {
    ...EMPTY_ALERTS_RESPONSE,
    items: data.items || [],
    summary: {
      ...EMPTY_ALERTS_RESPONSE.summary,
      ...(data.summary || {}),
    },
    plan: {
      ...EMPTY_ALERTS_RESPONSE.plan,
      ...(data.plan || {}),
    },
    deliverySummary: {
      ...EMPTY_ALERTS_RESPONSE.deliverySummary,
      ...(data.deliverySummary || {}),
    },
    deliveryQueue: data.deliveryQueue || [],
  };
}

const EMPTY_HEALTH = {
  ok: true,
  services: {},
  metrics: {},
  sources: [],
  marketSources: [],
  connectors: [],
};

const EMPTY_SHARE_STATUS = {
  status: "idle",
  provider: null,
  publicUrl: "",
  localUrl: "http://127.0.0.1:5000",
  startedAt: null,
  lastHeartbeatAt: null,
  notes: "No public share session yet.",
};

const INITIAL_AUTH_FORM = {
  name: "",
  email: "",
  password: "",
};

const INITIAL_RESET_FORM = {
  email: "",
  code: "",
  password: "",
  confirmPassword: "",
};

const INITIAL_CONNECTOR_FORMS = {
  valr: {
    apiKey: "",
    apiSecret: "",
    preferredPair: DEFAULT_EXECUTION_PROFILES.crypto.pair,
    subAccountId: "",
  },
  ibkr: {
    gatewayUrl: "",
    accountId: "",
    environment: "paper",
  },
  saxo: {
    appKey: "",
    appSecret: "",
    accountKey: "",
    environment: "simulation",
  },
  easyequities: {
    accountLabel: "",
    fundingBank: "",
  },
};

function mergeConnectorForms(providers) {
  const next = JSON.parse(JSON.stringify(INITIAL_CONNECTOR_FORMS));

  (providers || []).forEach((provider) => {
    if (!provider?.id || !next[provider.id]) {
      return;
    }

    next[provider.id] = {
      ...next[provider.id],
      ...(provider.config || {}),
    };
  });

  return next;
}

const INITIAL_FEEDBACK_FORM = {
  title: "",
  area: "landing",
  type: "ux",
  severity: "medium",
  notes: "",
};

function deskForTicker(ticker) {
  const normalized = String(ticker || "").toUpperCase();
  if (["USDZAR", "EURUSD"].includes(normalized)) {
    return "forex";
  }
  if (["SPY", "QQQ", "GLD"].includes(normalized)) {
    return "etfs";
  }
  if (["BTCUSD", "BTCZAR", "BTCUSDT", "BTCUSDC"].includes(normalized)) {
    return "crypto";
  }
  if (["JSE40", "JTOPI"].includes(normalized)) {
    return "jse";
  }
  return "forex";
}

function filterSignalsByDesk(signals, desk) {
  if (desk === "all") {
    return signals;
  }
  return signals.filter((signal) => signal.desk === desk);
}

function filterNewsItemsByDesk(items, desk) {
  if (desk === "all") {
    return items;
  }

  return items.filter((item) => {
    const itemDesk = item.marketTicker ? deskForTicker(item.marketTicker) : null;
    if (itemDesk === desk) {
      return true;
    }

    if (desk === "jse") {
      return item.region === "south-africa";
    }

    if (desk === "forex") {
      return item.region === "south-africa" || item.sourceId === "fxstreet";
    }

    if (desk === "crypto") {
      return item.sourceId === "coindesk";
    }

    if (desk === "etfs") {
      return item.region === "global";
    }

    return false;
  });
}

function buildSourceMap(sources) {
  return Object.fromEntries(
    (sources || []).map((source) => [source.id, source.url]),
  );
}

function toPlanNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function buildMarketPlanSet(signal, side) {
  const preset = orderTicketPresetForDesk(signal.desk, "market");
  const skeleton = {
    kind: "market",
    desk: signal.desk,
    marketTicker: signal.ticker,
    price: Number(signal.price || 0),
  };
  const presetDefaults = buildTicketPlanDefaults(skeleton, preset, side);
  const presetPlan = {
    stopPrice: presetDefaults.stopPrice,
    targetPrice: presetDefaults.targetPrice,
    riskBudget: presetDefaults.riskBudget || preset.defaultRiskBudget || "",
    source: "Desk preset",
    rationale: "Using desk-default risk and reward spacing.",
  };
  const structuredEntry = side === "SELL" ? signal.tradePlan?.sell : signal.tradePlan?.buy;
  const structuredPlan = structuredEntry
    ? {
        stopPrice: formatTicketPlanInput(skeleton, structuredEntry.stopPrice),
        targetPrice: formatTicketPlanInput(skeleton, structuredEntry.targetPrice),
        riskBudget: preset.defaultRiskBudget || "",
        source: structuredEntry.source || "Signal structure",
        rationale:
          structuredEntry.rationale ||
          "Recent swing structure and the 21 EMA are framing this plan.",
      }
    : null;

  return {
    presetPlan,
    structuredPlan,
    support: signal.tradePlan?.support ?? signal.tradePlan?.recentLow ?? null,
    resistance: signal.tradePlan?.resistance ?? signal.tradePlan?.recentHigh ?? null,
  };
}

function applyTicketPlan(ticket, mode, side = ticket.side) {
  const structuredPlan = ticket.structuredPlans?.[side] || null;
  const presetPlan = ticket.presetPlans?.[side] || null;
  const basePlan =
    mode === "structure" ? structuredPlan || presetPlan : presetPlan || structuredPlan;

  if (!basePlan) {
    return ticket;
  }

  const nextTicket = {
    ...ticket,
    side,
    planMode: mode,
    stopPrice: basePlan.stopPrice,
    targetPrice: basePlan.targetPrice,
    riskBudget: basePlan.riskBudget || ticket.riskBudget,
    baseStopPrice: basePlan.stopPrice,
    baseTargetPrice: basePlan.targetPrice,
    basePlanSource: basePlan.source,
    basePlanRationale: basePlan.rationale,
  };

  return {
    ...nextTicket,
    ...resolveTicketPlanMeta(nextTicket, nextTicket.stopPrice, nextTicket.targetPrice),
  };
}

function buildMarketTicket(signal, side) {
  const preset = orderTicketPresetForDesk(signal.desk, "market");
  const buyPlanSet = buildMarketPlanSet(signal, "BUY");
  const sellPlanSet = buildMarketPlanSet(signal, "SELL");
  const structuredPlans = {
    BUY: buyPlanSet.structuredPlan,
    SELL: sellPlanSet.structuredPlan,
  };
  const presetPlans = {
    BUY: buyPlanSet.presetPlan,
    SELL: sellPlanSet.presetPlan,
  };
  const defaultMode = structuredPlans[side] ? "structure" : "preset";
  const basePlan = defaultMode === "structure" ? structuredPlans[side] : presetPlans[side];

  const ticket = {
    kind: "market",
    marketTicker: signal.ticker,
    label: signal.label,
    summary: signal.headline,
    meta: signal.exitRule,
    price: Number(signal.price || 0),
    desk: signal.desk,
    deskLabel: preset.deskLabel,
    side,
    signalAction: signal.action,
    setup: signal.setup,
    quantity: preset.defaultQuantity,
    unitLabel: preset.unitLabel,
    quantityStep: preset.quantityStep,
    minQuantity: preset.minQuantity,
    timingHint: preset.timingHint,
    notePlaceholder: preset.notePlaceholder,
    executionCue: preset.executionCue,
    warnings: preset.warnings,
    checklist: preset.checklist,
    orderNote: "",
    structuredPlans,
    presetPlans,
    support: signal.tradePlan?.support ?? null,
    resistance: signal.tradePlan?.resistance ?? null,
    planMode: defaultMode,
    stopPrice: basePlan?.stopPrice || "",
    targetPrice: basePlan?.targetPrice || "",
    riskBudget: basePlan?.riskBudget || preset.defaultRiskBudget || "",
    baseStopPrice: basePlan?.stopPrice || "",
    baseTargetPrice: basePlan?.targetPrice || "",
    basePlanSource: basePlan?.source || "Desk preset",
    basePlanRationale: basePlan?.rationale || "Using desk-default risk and reward spacing.",
  };

  return {
    ...ticket,
    ...resolveTicketPlanMeta(ticket, ticket.stopPrice, ticket.targetPrice),
  };
}

function buildCollectibleTicket(item, side) {
  const preset = orderTicketPresetForDesk("collectible", "collectible");
  const skeleton = {
    kind: "collectible",
    desk: "collectibles",
    marketTicker: item.id,
    price: Number(item.price || 0),
  };
  const buyPlan = buildTicketPlanDefaults(skeleton, preset, "BUY");
  const sellPlan = buildTicketPlanDefaults(skeleton, preset, "SELL");
  const presetPlans = {
    BUY: {
      ...buyPlan,
      source: "Holdings preset",
      rationale: "Using the slower LEGO holdings risk template.",
    },
    SELL: {
      ...sellPlan,
      source: "Holdings preset",
      rationale: "Using the slower LEGO holdings risk template.",
    },
  };
  const basePlan = presetPlans[side];
  const ticket = {
    kind: "collectible",
    collectibleId: item.id,
    label: item.name,
    summary: item.description,
    meta: item.category,
    price: Number(item.price || 0),
    desk: "collectibles",
    deskLabel: preset.deskLabel,
    side,
    signalAction: side,
    setup: item.category,
    quantity: preset.defaultQuantity,
    unitLabel: preset.unitLabel,
    quantityStep: preset.quantityStep,
    minQuantity: preset.minQuantity,
    timingHint: preset.timingHint,
    notePlaceholder: preset.notePlaceholder,
    executionCue: preset.executionCue,
    warnings: preset.warnings,
    checklist: preset.checklist,
    orderNote: "",
    structuredPlans: null,
    presetPlans,
    support: null,
    resistance: null,
    planMode: "preset",
    stopPrice: basePlan.stopPrice,
    targetPrice: basePlan.targetPrice,
    riskBudget: basePlan.riskBudget || preset.defaultRiskBudget || "",
    baseStopPrice: basePlan.stopPrice,
    baseTargetPrice: basePlan.targetPrice,
    basePlanSource: basePlan.source,
    basePlanRationale: basePlan.rationale,
  };

  return {
    ...ticket,
    ...resolveTicketPlanMeta(ticket, ticket.stopPrice, ticket.targetPrice),
  };
}

function buildMentorSummary(signal, leadNewsItem) {
  if (!signal) {
    return {
      action: "Stand by",
      setup: "No lead setup yet",
      rationale: "The desk is waiting for a cleaner signal before it promotes a trade idea.",
      invalidation: "No structure yet.",
    };
  }

  return {
    action: `${signal.action} ${signal.label}`,
    setup: signal.setup,
    rationale: leadNewsItem
      ? `${signal.thesis} Macro tape lead: ${leadNewsItem.sourceName}.`
      : signal.thesis,
    invalidation: signal.exitRule,
  };
}

function buildMentorChecklist(signal, leadNewsItem) {
  if (!signal) {
    return [
      "Wait for the desk to promote a clean lead setup.",
      "Check the macro tape before moving into the ticket.",
      "Keep the next trade small until the state is clearer.",
    ];
  }

  return [
    `Anchor trend is ${signal.anchorTrend}; avoid fighting the higher-level structure without a reason.`,
    signal.retest
      ? "A retest is active; confirm the hold before submitting the ticket."
      : "No retest yet; patience may improve the entry.",
    leadNewsItem
      ? `Macro tape lead: ${leadNewsItem.title}`
      : "Read the macro tape so the desk is not blind to the current story.",
    signal.exitRule,
  ];
}

function buildChartPlan(activeSignal, orderTicket) {
  if (!activeSignal) {
    return null;
  }

  const signalSupport = activeSignal.tradePlan?.support ?? null;
  const signalResistance = activeSignal.tradePlan?.resistance ?? null;

  if (
    orderTicket &&
    orderTicket.kind === "market" &&
    orderTicket.marketTicker === activeSignal.ticker
  ) {
    return {
      side: orderTicket.side,
      support: signalSupport,
      resistance: signalResistance,
      stopPrice: toPlanNumber(orderTicket.stopPrice),
      targetPrice: toPlanNumber(orderTicket.targetPrice),
      source: orderTicket.planSource,
      rationale: orderTicket.planRationale,
    };
  }

  const preferredSide =
    activeSignal.action === "SELL"
      ? "SELL"
      : activeSignal.action === "BUY"
        ? "BUY"
        : "BUY";
  const structuredEntry =
    preferredSide === "SELL" ? activeSignal.tradePlan?.sell : activeSignal.tradePlan?.buy;

  return {
    side: preferredSide,
    support: signalSupport,
    resistance: signalResistance,
    stopPrice: structuredEntry?.stopPrice ?? null,
    targetPrice: structuredEntry?.targetPrice ?? null,
    source: structuredEntry?.source || "Signal structure",
    rationale:
      structuredEntry?.rationale ||
      "The signal structure is framing the first stop and target idea.",
  };
}

function createRequestHeaders(token, hasBody) {
  const headers = {};
  if (hasBody) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function requestJson(path, options = {}) {
  const { method = "GET", body, token } = options;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: createRequestHeaders(token, body !== undefined),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const error = new Error(data?.error || data?.message || response.statusText);
    error.status = response.status;
    error.payload = data;
    throw error;
  }

  return data;
}

function LoadingShell({ message }) {
  return (
    <div className="authShell premiumAuthShell loadingShell">
      <div className="authShellInner loadingShellInner">
        <BrandLogo variant="full" size="xl" className="loadingShellLogo" />
        <div className="splashEyebrow">RESTORING SESSION</div>
        <h1 className="loadingShellTitle">Opening your investment dashboard</h1>
        <p className="authBlurb">{message}</p>
        <div className="bootSplashPulse" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  );
}

function WorkspaceLoadingState({ label }) {
  return (
    <section className="panel">
      <EmptyState
        title={`Opening ${label}`}
        body="Loading this workspace on demand so the app shell stays lighter for the session."
      />
    </section>
  );
}

function NotificationCenter({
  activeDesk,
  alertSummary,
  appSettings,
  busyKey,
  notificationsResponse,
  onClose,
  onMarkAllRead,
  onMarkRead,
  onOpenHomeFeed,
  onOpenNotification,
}) {
  const notificationItems = notificationsResponse.items || [];
  const notificationSummary = notificationsResponse.summary || EMPTY_NOTIFICATIONS_RESPONSE.summary;
  const latestNotificationAt = notificationItems[0]?.createdAt
    ? formatDateTime(notificationItems[0].createdAt, appSettings.timezone)
    : "Quiet now";

  return (
    <div className="mobileMenuBackdrop mobileOverlayBackdrop" onClick={onClose}>
      <div
        className="mobileMenuScreen mobileNotificationCenter"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mobileNotificationHeader">
          <div>
            <span>Alerts inbox</span>
            <strong>What needs your attention</strong>
            <small>
              {labelDesk(activeDesk)} session | {notificationSummary.unread || 0} unread | Latest{" "}
              {latestNotificationAt}
            </small>
          </div>
          <button type="button" className="ghostButton mobileMenuClose" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="mobileNotificationSummaryGrid">
          <div className="mobileNotificationSummaryCard">
            <span>Unread now</span>
            <strong>{notificationSummary.unread || 0}</strong>
            <small>Fresh notifications waiting in this session.</small>
          </div>
          <div className="mobileNotificationSummaryCard">
            <span>Triggered alerts</span>
            <strong>{alertSummary.triggered || 0}</strong>
            <small>Live rules currently firing across your desks.</small>
          </div>
          <div className="mobileNotificationSummaryCard">
            <span>Recent events</span>
            <strong>{notificationSummary.total || 0}</strong>
            <small>Short inbox history kept tight and actionable.</small>
          </div>
        </div>

        <div className="mobileNotificationActions">
          <button
            type="button"
            className="ghostButton"
            disabled={!notificationSummary.unread || busyKey === "notification:all"}
            onClick={onMarkAllRead}
          >
            Mark all read
          </button>
          <button type="button" className="ghostButton" onClick={onOpenHomeFeed}>
            Open Dashboard feed
          </button>
        </div>

        <div className="mobileNotificationList">
          {notificationItems.length ? (
            notificationItems.slice(0, 12).map((item) => (
              <article
                key={item.id}
                className={`mobileNotificationItem ${item.status === "unread" ? "unread" : ""}`}
              >
                <button
                  type="button"
                  className="mobileNotificationOpen"
                  onClick={() => onOpenNotification(item)}
                >
                  <div className="mobileNotificationItemTop">
                    <span className="mobileNotificationTag">{labelDesk(item.desk || activeDesk)}</span>
                    <span className={`mobileNotificationStatus ${item.status}`}>
                      {item.status === "unread" ? "New" : "Read"}
                    </span>
                  </div>
                  <strong>{item.title || `${item.label || "Alert"} update`}</strong>
                  <p>{item.message || "A new event is ready for review."}</p>
                  <div className="mobileNotificationItemFooter">
                    <small>{formatDateTime(item.createdAt, appSettings.timezone) || "Just now"}</small>
                    <span>Open desk</span>
                  </div>
                </button>

                {item.status === "unread" ? (
                  <div className="mobileNotificationActionRow">
                    <button
                      type="button"
                      className="ghostButton slimButton"
                      disabled={busyKey === `notification:${item.id}`}
                      onClick={() => onMarkRead(item.id)}
                    >
                      Mark read
                    </button>
                  </div>
                ) : null}
              </article>
            ))
          ) : (
            <div className="panel mobileNotificationEmpty">
              <EmptyState
                title="No alert activity yet"
                body="As your watchlist and signal rules start firing, the inbox will keep the latest events ready here."
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const initialHashState = useMemo(() => parseHashState(window.location.hash), []);
  const initialLaunchPreference = useMemo(() => readLaunchPreference(), []);
  const initialPage = window.location.hash
    ? initialHashState.page
    : initialLaunchPreference?.page || initialHashState.page || DEFAULT_PAGE;
  const initialDesk = window.location.hash
    ? initialHashState.desk
    : initialLaunchPreference?.desk || initialHashState.desk || DEFAULT_DESK;

  const [page, setPage] = useState(normalizePage(initialPage));
  const [activeDesk, setActiveDesk] = useState(normalizeDesk(initialDesk));
  const [authChecked, setAuthChecked] = useState(() => !window.localStorage.getItem(TOKEN_KEY));
  const [bootSplashVisible, setBootSplashVisible] = useState(true);
  const [authToken, setAuthToken] = useState(() => window.localStorage.getItem(TOKEN_KEY) || "");
  const [currentUser, setCurrentUser] = useState(null);
  const [authStage, setAuthStage] = useState("auth");
  const [authMode, setAuthMode] = useState("login");
  const [authView, setAuthView] = useState("auth");
  const [authStatus, setAuthStatus] = useState("");
  const [demoLaunchBusy, setDemoLaunchBusy] = useState(false);
  const [authForm, setAuthForm] = useState(INITIAL_AUTH_FORM);
  const [resetForm, setResetForm] = useState(INITIAL_RESET_FORM);
  const [resetStatus, setResetStatus] = useState("");
  const [resetHintCode, setResetHintCode] = useState("");
  const [splashVisible, setSplashVisible] = useState(false);
  const [v3OnboardingVisible, setV3OnboardingVisible] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [notificationCenterVisible, setNotificationCenterVisible] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [navigationStack, setNavigationStack] = useState([]);
  const [preAuthLaunch, setPreAuthLaunch] = useState({
    page: "home",
    desk: normalizeDesk(initialDesk),
    introId: "home",
    sectionId: "home-overview",
    landingId: "home",
  });
  const [pendingSectionTarget, setPendingSectionTarget] = useState(null);

  const [signalsResponse, setSignalsResponse] = useState(EMPTY_SIGNALS_RESPONSE);
  const [newsResponse, setNewsResponse] = useState(EMPTY_NEWS_RESPONSE);
  const [collectiblesResponse, setCollectiblesResponse] = useState(EMPTY_COLLECTIBLES_RESPONSE);
  const [health, setHealth] = useState(EMPTY_HEALTH);
  const [portfolio, setPortfolio] = useState([]);
  const [targets, setTargets] = useState([]);
  const [targetInput, setTargetInput] = useState("");
  const [connectors, setConnectors] = useState([]);
  const [feedbackResponse, setFeedbackResponse] = useState(EMPTY_FEEDBACK_RESPONSE);
  const [_watchlistResponse, setWatchlistResponse] = useState(EMPTY_WATCHLIST_RESPONSE);
  const [alertsResponse, setAlertsResponse] = useState(EMPTY_ALERTS_RESPONSE);
  const [notificationsResponse, setNotificationsResponse] = useState(EMPTY_NOTIFICATIONS_RESPONSE);
  const [_routineResponse, setRoutineResponse] = useState(EMPTY_ROUTINE_RESPONSE);
  const [shareStatus, setShareStatus] = useState(EMPTY_SHARE_STATUS);
  const [appSettings, setAppSettings] = useState(DEFAULT_SETTINGS);
  const [settingsStatus, setSettingsStatus] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState("");
  const [watchlistStatus, setWatchlistStatus] = useState("");
  const [_routineStatus, setRoutineStatus] = useState("");
  const [feedbackForm, setFeedbackForm] = useState(INITIAL_FEEDBACK_FORM);
  const [feedbackBusyKey, setFeedbackBusyKey] = useState("");
  const [watchlistBusyKey, setWatchlistBusyKey] = useState("");
  const [connectorBusyKey, setConnectorBusyKey] = useState("");
  const [tradeActionBusy, setTradeActionBusy] = useState(false);
  const [tradeStatus, setTradeStatus] = useState("");
  const [toolStatus, setToolStatus] = useState("");
  const [chartUploadName, setChartUploadName] = useState("");
  const [connectorForms, setConnectorForms] = useState(INITIAL_CONNECTOR_FORMS);
  const [installPromptEvent, setInstallPromptEvent] = useState(null);
  const [installStatus, setInstallStatus] = useState("");
  const [isAppInstalled, setIsAppInstalled] = useState(() =>
    Boolean(
      window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true,
    ),
  );

  const [selectedSignalTicker, setSelectedSignalTicker] = useState(null);
  const [_selectedCollectibleId, setSelectedCollectibleId] = useState(null);
  const [orderTicket, setOrderTicket] = useState(null);
  const [_collectibleQuery, _setCollectibleQuery] = useState("");
  const [_collectibleBrand, _setCollectibleBrand] = useState("all");
  const [_collectibleCategory, _setCollectibleCategory] = useState("all");

  const clearSession = useCallback(() => {
    window.localStorage.removeItem(TOKEN_KEY);
    setAuthToken("");
    setCurrentUser(null);
    setNavigationStack([]);
    setAuthStage("auth");
    setAuthMode("login");
    setAuthView("auth");
    setAuthStatus("");
    setResetStatus("");
    setResetHintCode("");
    setResetForm(INITIAL_RESET_FORM);
    setSplashVisible(false);
    setMenuVisible(false);
    setNotificationCenterVisible(false);
    setPortfolio([]);
    setTargets([]);
    setConnectors([]);
    setConnectorForms(INITIAL_CONNECTOR_FORMS);
    setFeedbackResponse(EMPTY_FEEDBACK_RESPONSE);
    setWatchlistResponse(EMPTY_WATCHLIST_RESPONSE);
    setAlertsResponse(EMPTY_ALERTS_RESPONSE);
    setNotificationsResponse(EMPTY_NOTIFICATIONS_RESPONSE);
    setRoutineResponse(EMPTY_ROUTINE_RESPONSE);
    setShareStatus(EMPTY_SHARE_STATUS);
    setAppSettings(DEFAULT_SETTINGS);
  }, []);

  const syncHashRoute = useCallback(
    (nextPage, nextDesk) => {
      const nextHash = buildHash(nextPage, nextDesk);
      if (window.location.hash !== nextHash) {
        window.location.hash = nextHash;
      }
    },
    [],
  );

  const rememberLaunch = useCallback((preference) => {
    writeLaunchPreference(preference);
  }, []);

  const applyWorkspaceRoute = useCallback(
    (nextPage, nextDesk, options = {}) => {
      const {
        pushHistory = true,
        sectionId = null,
        persistLaunch = true,
      } = options;
      const normalizedPage = normalizePage(nextPage);
      const normalizedDesk = normalizeDesk(nextDesk);

      if (pushHistory && (page !== normalizedPage || activeDesk !== normalizedDesk)) {
        setNavigationStack((current) =>
          [...current, { page, desk: activeDesk }].slice(-24),
        );
      }

      if (sectionId) {
        setPendingSectionTarget({
          page: normalizedPage,
          desk: normalizedDesk,
          sectionId,
        });
      }

      setPage(normalizedPage);
      setActiveDesk(normalizedDesk);
      syncHashRoute(normalizedPage, normalizedDesk);

      if (currentUser && persistLaunch) {
        rememberLaunch({
          page: normalizedPage,
          desk: normalizedDesk,
          introId: defaultIntroIdForPage(normalizedPage),
          sectionId: sectionId || PAGE_SECTION_LINKS[normalizedPage]?.[0]?.id || null,
        });
      }
    },
    [activeDesk, currentUser, page, rememberLaunch, syncHashRoute],
  );

  const navigateToPage = useCallback(
    (nextPage, reopenIntro = false, nextDesk = activeDesk) => {
      if (reopenIntro) {
        setSplashVisible(true);
        return;
      }

      applyWorkspaceRoute(nextPage, nextDesk, {
        pushHistory: true,
        sectionId: null,
        persistLaunch: true,
      });
    },
    [activeDesk, applyWorkspaceRoute],
  );

  const jumpToPageSection = useCallback(
    (nextPage, sectionId, nextDesk = activeDesk) => {
      applyWorkspaceRoute(nextPage, nextDesk, {
        pushHistory: true,
        sectionId,
        persistLaunch: true,
      });
    },
    [activeDesk, applyWorkspaceRoute],
  );

  const installHint = useMemo(() => {
    if (isAppInstalled) {
      return `${APP_NAME} is already installed on this device.`;
    }

    const userAgent = window.navigator.userAgent || "";
    const isIOS = /iphone|ipad|ipod/i.test(userAgent);
    if (isIOS) {
      return "Open the share menu in Safari, then tap Add to Home Screen.";
    }

    if (installPromptEvent) {
      return `This device can install ${APP_NAME} directly from the browser.`;
    }

    return "Use the browser menu and choose Install App or Add to Home Screen.";
  }, [installPromptEvent, isAppInstalled]);

  const installActionLabel = useMemo(() => {
    if (isAppInstalled) {
      return "Installed";
    }

    const userAgent = window.navigator.userAgent || "";
    const isIOS = /iphone|ipad|ipod/i.test(userAgent);
    if (isIOS) {
      return "Add to Home Screen";
    }

    return installPromptEvent ? "Install App" : "Install Guide";
  }, [installPromptEvent, isAppInstalled]);

  const installApp = useCallback(async () => {
    if (isAppInstalled) {
      setInstallStatus(`${APP_NAME} is already installed on this device.`);
      return;
    }

    if (installPromptEvent) {
      try {
        installPromptEvent.prompt();
        const choice = await installPromptEvent.userChoice;
        if (choice?.outcome === "accepted") {
          setInstallStatus(`Install prompt accepted. Finish the device install to pin ${APP_NAME}.`);
          setInstallPromptEvent(null);
          return;
        }
        setInstallStatus("Install prompt opened. If you dismissed it, you can reopen it from the browser menu later.");
        return;
      } catch {
        setInstallStatus("The install prompt could not complete. Use the browser menu to install the app manually.");
        return;
      }
    }

    const userAgent = window.navigator.userAgent || "";
    const isIOS = /iphone|ipad|ipod/i.test(userAgent);
    if (isIOS) {
      setInstallStatus(`On iPhone or iPad, tap Share and then Add to Home Screen to install ${APP_NAME}.`);
      return;
    }

    setInstallStatus(`Use the browser menu and choose Install App or Add to Home Screen to pin ${APP_NAME}.`);
  }, [installPromptEvent, isAppInstalled]);

  const refreshCore = useCallback(async () => {
    const region = appSettings.preferredRegion || DEFAULT_SETTINGS.preferredRegion;
    const [signalsData, newsData, collectiblesData, healthData] = await Promise.all([
      requestJson("/api/signals"),
      requestJson(`/api/news?region=${encodeURIComponent(region)}`),
      requestJson("/api/collectibles"),
      requestJson("/api/health"),
    ]);

    setSignalsResponse({
      ...EMPTY_SIGNALS_RESPONSE,
      ...signalsData,
      signals: signalsData.signals || [],
      marketData: {
        ...EMPTY_SIGNALS_RESPONSE.marketData,
        ...(signalsData.marketData || {}),
        sourceStatus: signalsData.marketData?.sourceStatus || [],
      },
      strategyRules: signalsData.strategyRules || [],
    });
    setNewsResponse({
      ...EMPTY_NEWS_RESPONSE,
      ...newsData,
      items: newsData.items || [],
      sources: newsData.sources || [],
      sourceStatus: newsData.sourceStatus || [],
    });
    setCollectiblesResponse({
      ...EMPTY_COLLECTIBLES_RESPONSE,
      ...collectiblesData,
      items: collectiblesData.items || [],
      categories: collectiblesData.categories || [],
      brands: collectiblesData.brands || [],
      referenceShelves: collectiblesData.referenceShelves || [],
    });
    setHealth({
      ...EMPTY_HEALTH,
      ...healthData,
      services: healthData.services || {},
      metrics: healthData.metrics || {},
      sources: healthData.sources || [],
      marketSources: healthData.marketSources || [],
      connectors: healthData.connectors || [],
    });
  }, [appSettings.preferredRegion]);

  const refreshContext = useCallback(
    async (tokenOverride = authToken) => {
      if (!tokenOverride) {
        return;
      }

      try {
        const [
          portfolioData,
          settingsData,
          targetsData,
          connectorsData,
          feedbackData,
          watchlistData,
          alertsData,
          notificationsData,
          routineData,
          shareData,
        ] = await Promise.all([
          requestJson("/api/portfolio", { token: tokenOverride }),
          requestJson("/api/settings", { token: tokenOverride }),
          requestJson("/api/news/targets", { token: tokenOverride }),
          requestJson("/api/connectors", { token: tokenOverride }),
          requestJson("/api/feedback", { token: tokenOverride }),
          requestJson("/api/watchlist", { token: tokenOverride }),
          requestJson("/api/alerts", { token: tokenOverride }),
          requestJson("/api/notifications", { token: tokenOverride }),
          requestJson("/api/session-routine", { token: tokenOverride }),
          requestJson("/api/share-status", { token: tokenOverride }),
        ]);

        setPortfolio(Array.isArray(portfolioData) ? portfolioData : []);
        setAppSettings(normalizeAppSettings(settingsData.settings));
        setTargets(targetsData.items || []);
        setConnectors(connectorsData.providers || []);
        setConnectorForms(mergeConnectorForms(connectorsData.providers || []));
        setFeedbackResponse({
          ...EMPTY_FEEDBACK_RESPONSE,
          ...feedbackData,
          items: feedbackData.items || [],
          summary: feedbackData.summary || {},
          permissions: feedbackData.permissions || { canManage: false },
        });
        setWatchlistResponse({
          ...EMPTY_WATCHLIST_RESPONSE,
          ...watchlistData,
          items: watchlistData.items || [],
        });
        setAlertsResponse(normalizeAlertsResponse(alertsData));
        setNotificationsResponse({
          ...EMPTY_NOTIFICATIONS_RESPONSE,
          ...notificationsData,
          items: notificationsData.items || [],
          summary: notificationsData.summary || EMPTY_NOTIFICATIONS_RESPONSE.summary,
        });
        setRoutineResponse({
          ...EMPTY_ROUTINE_RESPONSE,
          ...(routineData.routine || {}),
          completedStepIds: routineData.routine?.completedStepIds || [],
          activeDates: routineData.routine?.activeDates || [],
        });
        setShareStatus({
          ...EMPTY_SHARE_STATUS,
          ...(shareData.share || {}),
        });
      } catch (error) {
        if (error.status === 401) {
          clearSession();
          return;
        }
        throw error;
      }
    },
    [authToken, clearSession],
  );

  useEffect(() => {
    if (!window.location.hash) {
      syncHashRoute(page, activeDesk);
    }
  }, [activeDesk, page, syncHashRoute]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setBootSplashVisible(false);
    }, 1300);

    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    document.title = APP_NAME;
  }, []);

  useEffect(() => {
    const syncInstalledState = () => {
      setIsAppInstalled(
        Boolean(
          window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true,
        ),
      );
    };

    syncInstalledState();

    const onBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPromptEvent(event);
      setInstallStatus("");
    };

    const onAppInstalled = () => {
      setInstallPromptEvent(null);
      setInstallStatus(`${APP_NAME} is now installed on this device.`);
      syncInstalledState();
    };

    const displayModeMedia = window.matchMedia?.("(display-mode: standalone)");
    const onDisplayModeChange = () => syncInstalledState();

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    displayModeMedia?.addEventListener?.("change", onDisplayModeChange);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
      displayModeMedia?.removeEventListener?.("change", onDisplayModeChange);
    };
  }, []);

  useEffect(() => {
    const token = window.localStorage.getItem(TOKEN_KEY);

    if (!token) {
      return;
    }

    requestJson("/api/auth/me", { token })
      .then((data) => {
        setCurrentUser(data.user);
        setAppSettings(normalizeAppSettings(data.settings));
        setSplashVisible(false);
        setV3OnboardingVisible(!isV3OnboardingComplete());
      })
      .catch(() => {
        clearSession();
      })
      .finally(() => {
        setAuthChecked(true);
      });
  }, [clearSession]);

  useEffect(() => {
    const handleHashChange = () => {
      const next = parseHashState(window.location.hash);
      setPage(next.page);
      setActiveDesk(next.desk);
      if (!currentUser) {
        setPreAuthLaunch((previous) => ({
          ...previous,
          page: next.page,
          desk: next.desk,
          introId: defaultIntroIdForPage(next.page),
          sectionId: PAGE_SECTION_LINKS[next.page]?.[0]?.id || null,
        }));
      }
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [currentUser]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      refreshCore().catch(() => {});
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [refreshCore]);

  useEffect(() => {
    if (!currentUser || !authToken) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      refreshContext().catch(() => {});
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [authToken, currentUser, refreshContext]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      refreshCore().catch(() => {});
      if (currentUser && authToken) {
        refreshContext().catch(() => {});
      }
    }, 20000);

    return () => window.clearInterval(interval);
  }, [authToken, currentUser, refreshContext, refreshCore]);

  useEffect(() => {
    if (!pendingSectionTarget) {
      return;
    }

    if (pendingSectionTarget.page !== page) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const element = document.getElementById(pendingSectionTarget.sectionId);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      setPendingSectionTarget(null);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [page, pendingSectionTarget]);

  const filteredSignals = useMemo(
    () => filterSignalsByDesk(signalsResponse.signals || [], activeDesk),
    [activeDesk, signalsResponse.signals],
  );
  const resolvedSelectedSignalTicker =
    filteredSignals.some((signal) => signal.ticker === selectedSignalTicker)
      ? selectedSignalTicker
      : filteredSignals[0]?.ticker || null;

  const activeSignal =
    filteredSignals.find((signal) => signal.ticker === resolvedSelectedSignalTicker) ||
    filteredSignals[0] ||
    signalsResponse.leadSignal ||
    null;
  const effectiveDeskKey =
    activeDesk === "all" ? activeSignal?.desk || DEFAULT_DESK : activeDesk;
  const activeDeskProfile =
    appSettings.executionProfiles?.[effectiveDeskKey] ||
    DEFAULT_EXECUTION_PROFILES[effectiveDeskKey] ||
    DEFAULT_EXECUTION_PROFILES.forex;

  const marketSourceMap = useMemo(
    () =>
      Object.fromEntries(
        (signalsResponse.marketData?.sourceStatus || []).map((source) => [source.ticker, source]),
      ),
    [signalsResponse.marketData?.sourceStatus],
  );

  const newsItemsForDesk = useMemo(
    () => filterNewsItemsByDesk(newsResponse.items || [], activeDesk),
    [activeDesk, newsResponse.items],
  );
  const leadNewsItem = newsItemsForDesk[0] || newsResponse.items?.[0] || null;
  const activeDeskNewsLabel =
    activeDesk === "all" ? "All desk headlines" : `${labelDesk(activeDesk)} lens`;
  const southAfricaHeadlineCount = newsItemsForDesk.filter(
    (item) => item.region === "south-africa",
  ).length;
  const globalHeadlineCount = newsItemsForDesk.filter((item) => item.region === "global").length;
  const newsSourceMap = useMemo(() => buildSourceMap(newsResponse.sources), [newsResponse.sources]);

  const enrichedCollectiblesResponse = useMemo(
    () => ({
      ...collectiblesResponse,
      items: (collectiblesResponse.items || []).map((item) => enrichBrickAlphaCollectible(item)),
    }),
    [collectiblesResponse],
  );

  const collectibles = enrichedCollectiblesResponse.items || [];

  const enrichedPortfolio = useMemo(
    () => portfolio.map((trade) => enrichBrickAlphaTrade(trade, collectibles, portfolio)),
    [collectibles, portfolio],
  );
  const openTrades = useMemo(
    () => enrichedPortfolio.filter((trade) => trade.status === "open"),
    [enrichedPortfolio],
  );
  const closedTrades = useMemo(
    () => enrichedPortfolio.filter((trade) => trade.status !== "open"),
    [enrichedPortfolio],
  );

  const totalOpenPnl = useMemo(
    () => openTrades.reduce((sum, trade) => sum + Number(trade.pnl || 0), 0),
    [openTrades],
  );

  const activeChartPlan = useMemo(
    () => buildChartPlan(activeSignal, orderTicket),
    [activeSignal, orderTicket],
  );

  const mentorSummary = useMemo(
    () => buildMentorSummary(activeSignal, leadNewsItem),
    [activeSignal, leadNewsItem],
  );
  const mentorChecklist = useMemo(
    () => buildMentorChecklist(activeSignal, leadNewsItem),
    [activeSignal, leadNewsItem],
  );

  const toolsDeskKey = page === "tools" ? effectiveDeskKey : effectiveDeskKey;
  const activeResearchReports = useMemo(
    () =>
      RESEARCH_REPORTS.filter(
        (report) =>
          report.targetDesk === toolsDeskKey ||
          (toolsDeskKey === "forex" && report.targetDesk === "forex"),
      ),
    [toolsDeskKey],
  );

  const connectedProviderCount = connectors.filter((provider) => provider.configured).length;
  const cryptoConnector = connectors.find((provider) => provider.id === "valr") || null;
  const liveReadyDeskCount = MARKET_DESKS.filter((desk) => {
    const profile = appSettings.executionProfiles?.[desk.id];
    if (!profile || profile.mode !== "live") {
      return false;
    }
    const fauxSignal = { desk: desk.id };
    return executionPlanForSignal(fauxSignal, appSettings, connectors).ready;
  }).length;
  const degradedSourceCount = [
    ...(health.sources || []),
    ...(signalsResponse.marketData?.sourceStatus || []),
  ].filter((source) => !["ok", "online", "simulated", "configured", "manual_setup", "unsupported"].includes(source.status)).length;

  const handleAppBack = useCallback(() => {
    setMenuVisible(false);
    setNotificationCenterVisible(false);

    const previous = navigationStack[navigationStack.length - 1];
    if (!previous) {
      if (page !== "home") {
        applyWorkspaceRoute("home", activeDesk, {
          pushHistory: false,
          sectionId: null,
          persistLaunch: true,
        });
      }
      return;
    }

    setNavigationStack((current) => current.slice(0, -1));
    applyWorkspaceRoute(previous.page, previous.desk, {
      pushHistory: false,
      sectionId: null,
      persistLaunch: true,
    });
  }, [activeDesk, applyWorkspaceRoute, navigationStack, page]);

  const handleAuthenticatedRoute = useCallback(
    async (token, user, settings, launchSelection) => {
      window.localStorage.setItem(TOKEN_KEY, token);
      setAuthToken(token);
      setCurrentUser(user);
      setAppSettings(normalizeAppSettings(settings));
      setAuthStatus("");
      setResetStatus("");
      setResetHintCode("");
      setResetForm(INITIAL_RESET_FORM);
      setAuthForm(INITIAL_AUTH_FORM);
      setAuthMode("login");
      setAuthView("auth");
      setAuthStage("auth");
      setSplashVisible(false);
      setV3OnboardingVisible(!isV3OnboardingComplete());
      setNavigationStack([]);
      const launch = launchSelection || preAuthLaunch;
      const nextPage = "home";
      const nextDesk = normalizeDesk(launch?.desk || activeDesk);
      rememberLaunch({
        page: nextPage,
        desk: nextDesk,
        introId: "home",
        sectionId: "home-dashboard",
        landingId: "home",
      });
      setPage(nextPage);
      setActiveDesk(nextDesk);
      syncHashRoute(nextPage, nextDesk);
      setPendingSectionTarget(null);
      await Promise.all([refreshCore(), refreshContext(token)]);
    },
    [
      activeDesk,
      preAuthLaunch,
      refreshContext,
      refreshCore,
      rememberLaunch,
      syncHashRoute,
    ],
  );

  const handleAuthSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      setAuthStatus("");

      const endpoint = authMode === "login" ? "/api/auth/login" : "/api/auth/register";
      const body =
        authMode === "login"
          ? {
              email: authForm.email,
              password: authForm.password,
            }
          : {
              name: authForm.name,
              email: authForm.email,
              password: authForm.password,
            };

      try {
        const data = await requestJson(endpoint, {
          method: "POST",
          body,
        });
        await handleAuthenticatedRoute(data.token, data.user, data.settings, preAuthLaunch);
      } catch (error) {
        setAuthStatus(String(error.message || "Authentication failed."));
      }
    },
    [authForm, authMode, handleAuthenticatedRoute, preAuthLaunch],
  );

  const handleAuthFieldChange = useCallback((field, value) => {
    setAuthForm((current) => ({
      ...current,
      [field]: value,
    }));
  }, []);

  const handleResetFieldChange = useCallback((field, value) => {
    setResetForm((current) => ({
      ...current,
      [field]: value,
    }));
  }, []);

  const openForgotPassword = useCallback(() => {
    setAuthStatus("");
    setResetStatus("");
    setResetHintCode("");
    setResetForm({
      email: authForm.email || "",
      code: "",
      password: "",
      confirmPassword: "",
    });
    setAuthView("forgot-request");
  }, [authForm.email]);

  const returnToLogin = useCallback(() => {
    setAuthView("auth");
    setResetStatus("");
    setResetHintCode("");
    setAuthMode("login");
  }, []);

  const handleResetRequest = useCallback(
    async (event) => {
      event.preventDefault();
      setResetStatus("");

      try {
        const data = await requestJson("/api/auth/forgot-password/request", {
          method: "POST",
          body: {
            email: resetForm.email,
          },
        });
        setResetHintCode(data.demoCode || "");
        setResetStatus(
          data.message || "If that account exists, a reset code has been prepared for this build.",
        );
        setAuthView("forgot-reset");
      } catch (error) {
        setResetStatus(String(error.message || "Could not prepare a reset code."));
      }
    },
    [resetForm.email],
  );

  const handleResetConfirm = useCallback(
    async (event) => {
      event.preventDefault();
      setResetStatus("");

      if (resetForm.password !== resetForm.confirmPassword) {
        setResetStatus("Passwords do not match.");
        return;
      }

      try {
        const data = await requestJson("/api/auth/forgot-password/confirm", {
          method: "POST",
          body: {
            email: resetForm.email,
            code: resetForm.code,
            password: resetForm.password,
          },
        });
        setAuthForm((current) => ({
          ...current,
          email: resetForm.email,
          password: "",
        }));
        setAuthStatus(data.message || "Password updated. Sign in with your new password.");
        setResetForm(INITIAL_RESET_FORM);
        setResetHintCode("");
        setResetStatus("");
        setAuthMode("login");
        setAuthView("auth");
      } catch (error) {
        setResetStatus(String(error.message || "Could not reset the password."));
      }
    },
    [resetForm],
  );

  const handleDemoLaunch = useCallback(
    async (selection) => {
      setDemoLaunchBusy(true);
      setAuthStatus("");
      setPreAuthLaunch(selection);

      try {
        const data = await requestJson("/api/auth/demo", {
          method: "POST",
          body: {
            name: "Partner Demo",
          },
        });
        await handleAuthenticatedRoute(data.token, data.user, data.settings, selection);
      } catch (error) {
        setAuthStatus(String(error.message || "Could not open demo mode."));
      } finally {
        setDemoLaunchBusy(false);
      }
    },
    [handleAuthenticatedRoute],
  );

  const handleDemoReset = useCallback(async () => {
    clearV3DemoDeviceState();
    setV3OnboardingVisible(true);
    clearSession();
    setDemoLaunchBusy(true);
    try {
      const data = await requestJson("/api/auth/demo", {
        method: "POST",
        body: {
          name: "Partner Demo",
        },
      });
      await handleAuthenticatedRoute(data.token, data.user, data.settings, {
        page: "home",
        desk: "collectibles",
        introId: null,
        sectionId: null,
        landingId: null,
      });
    } catch (error) {
      setAuthStatus(String(error.message || "Could not reset demo mode."));
    } finally {
      setDemoLaunchBusy(false);
    }
  }, [clearSession, handleAuthenticatedRoute]);

  const handleSplashLaunch = useCallback(
    (selection) => {
      rememberLaunch(selection);
      setSplashVisible(false);
      jumpToPageSection(selection.page, selection.sectionId, selection.desk);
    },
    [jumpToPageSection, rememberLaunch],
  );

  const completeV3Onboarding = useCallback(() => {
    setV3OnboardingVisible(false);
    applyWorkspaceRoute("home", activeDesk, {
      pushHistory: false,
      sectionId: "home-dashboard",
      persistLaunch: true,
    });
  }, [activeDesk, applyWorkspaceRoute]);

  const handleNavigateHome = useCallback(() => {
    navigateToPage("home", false, activeDesk);
  }, [activeDesk, navigateToPage]);

  const handleDeskRoute = useCallback(
    (targetPage, desk) => {
      navigateToPage(targetPage, false, desk);
    },
    [navigateToPage],
  );

  const closeMenu = useCallback(() => {
    setMenuVisible(false);
  }, []);

  const openMenu = useCallback(() => {
    setNotificationCenterVisible(false);
    setMenuVisible(true);
  }, []);

  const closeNotificationCenter = useCallback(() => {
    setNotificationCenterVisible(false);
  }, []);

  const openNotificationCenter = useCallback(() => {
    setMenuVisible(false);
    setNotificationCenterVisible(true);
  }, []);

  const handleMenuNavigate = useCallback(
    (targetPage, targetDesk = activeDesk) => {
      setMenuVisible(false);
      navigateToPage(targetPage, false, targetDesk);
    },
    [activeDesk, navigateToPage],
  );

  const handleMenuSection = useCallback(
    (targetPage, sectionId, targetDesk = activeDesk) => {
      setMenuVisible(false);
      jumpToPageSection(targetPage, sectionId, targetDesk);
    },
    [activeDesk, jumpToPageSection],
  );

  const handleMenuSplash = useCallback(() => {
    setMenuVisible(false);
    setNotificationCenterVisible(false);
    setV3OnboardingVisible(true);
  }, []);

  const handleMenuLogout = useCallback(() => {
    setMenuVisible(false);
    setNotificationCenterVisible(false);
    clearSession();
  }, [clearSession]);

  const handleSelectSignal = useCallback((signal) => {
    setSelectedSignalTicker(signal.ticker);
  }, []);

  const openMarketTicket = useCallback((signal, preferredSide) => {
    const nextSide =
      preferredSide ||
      (signal.action === "SELL" ? "SELL" : signal.action === "BUY" ? "BUY" : "BUY");
    setOrderTicket(buildMarketTicket(signal, nextSide));
    setTradeStatus("");
  }, []);

  const handleCollectibleSelect = useCallback((item) => {
    setSelectedCollectibleId(item.id);
  }, []);

  const openCollectibleTicket = useCallback((item, preferredSide = "BUY") => {
    setOrderTicket(buildCollectibleTicket(item, preferredSide));
    setTradeStatus("");
  }, []);

  const handleOrderFieldChange = useCallback((field, value) => {
    setOrderTicket((current) => {
      if (!current) {
        return current;
      }

      if (field === "side") {
        const nextSide = String(value || "").toUpperCase() === "SELL" ? "SELL" : "BUY";
        const nextMode = current.structuredPlans?.[nextSide] ? "structure" : "preset";
        return applyTicketPlan(current, nextMode, nextSide);
      }

      const nextTicket = {
        ...current,
        [field]: value,
      };

      if (field === "stopPrice" || field === "targetPrice") {
        return {
          ...nextTicket,
          ...resolveTicketPlanMeta(
            nextTicket,
            field === "stopPrice" ? value : nextTicket.stopPrice,
            field === "targetPrice" ? value : nextTicket.targetPrice,
          ),
        };
      }

      return nextTicket;
    });
  }, []);

  const handleOrderPlanAction = useCallback((mode) => {
    setOrderTicket((current) => {
      if (!current) {
        return current;
      }

      if (mode === "base") {
        return {
          ...current,
          stopPrice: current.baseStopPrice,
          targetPrice: current.baseTargetPrice,
          ...resolveTicketPlanMeta(current, current.baseStopPrice, current.baseTargetPrice),
        };
      }

      if (mode === "structure" || mode === "preset") {
        return applyTicketPlan(current, mode, current.side);
      }

      return current;
    });
  }, []);

  const submitLoggedPurchase = useCallback(
    async (form) => {
      if (!authToken) {
        throw new Error("Sign in to save a purchase.");
      }
      setTradeActionBusy(true);
      try {
        const note = [
          form.date ? `Date: ${form.date}` : "",
          form.retailer ? `Source: ${form.retailer}` : "",
          form.condition ? `Condition: ${form.condition}` : "",
          form.shipping ? `Shipping: ${form.shipping}` : "",
          form.vatReclaim ? `VAT reclaim: ${form.vatReclaim}` : "",
          form.rewards ? `Rewards: ${form.rewards}` : "",
          form.cashback ? `Cashback: ${form.cashback}` : "",
          form.vouchers ? `Vouchers: ${form.vouchers}` : "",
          form.notes || "",
        ]
          .filter(Boolean)
          .join(". ");
        const data = await requestJson("/api/collectibles/trades", {
          method: "POST",
          token: authToken,
          body: {
            collectibleId: form.collectibleId,
            side: "BUY",
            quantity: form.quantity,
            acquisitionPrice: form.unitCost,
            orderNote: note,
          },
        });
        setPortfolio(data.portfolio || []);
        await refreshContext();
      } finally {
        setTradeActionBusy(false);
      }
    },
    [authToken, refreshContext],
  );

  const submitOrderTicket = useCallback(async () => {
    if (!orderTicket || !authToken) {
      return;
    }

    setTradeActionBusy(true);
    setTradeStatus("");

    try {
      const endpoint =
        orderTicket.kind === "collectible" ? "/api/collectibles/trades" : "/api/trades";
      const body =
        orderTicket.kind === "collectible"
          ? {
              collectibleId: orderTicket.collectibleId,
              side: orderTicket.side,
              quantity: orderTicket.quantity,
              acquisitionPrice: orderTicket.side === "BUY" ? orderTicket.price : undefined,
              orderNote: orderTicket.orderNote,
              stopPrice: orderTicket.stopPrice,
              targetPrice: orderTicket.targetPrice,
              riskBudget: orderTicket.riskBudget,
            }
          : {
              marketTicker: orderTicket.marketTicker,
              side: orderTicket.side,
              quantity: orderTicket.quantity,
              orderNote: orderTicket.orderNote,
              stopPrice: orderTicket.stopPrice,
              targetPrice: orderTicket.targetPrice,
              riskBudget: orderTicket.riskBudget,
            };

      const data = await requestJson(endpoint, {
        method: "POST",
        token: authToken,
        body,
      });
      setPortfolio(data.portfolio || []);
      setTradeStatus(
        orderTicket.kind === "collectible"
          ? `${orderTicket.side} collectible ticket saved.`
          : `${orderTicket.side} ${orderTicket.label} ticket submitted.`,
      );
      setOrderTicket(null);
      await refreshContext();
    } catch (error) {
      setTradeStatus(String(error.message || "Ticket submission failed."));
    } finally {
      setTradeActionBusy(false);
    }
  }, [authToken, orderTicket, refreshContext]);

  const submitExitSale = useCallback(
    async (form) => {
      if (!authToken) {
        throw new Error("Sign in to record a sale.");
      }
      setTradeActionBusy(true);
      try {
        const data = await requestJson(`/api/trades/${form.tradeId}/close`, {
          method: "POST",
          token: authToken,
          body: {
            orderNote: form.orderNote,
            salePrice: form.salePrice,
          },
        });
        setPortfolio(data.portfolio || []);
        await refreshContext();
      } finally {
        setTradeActionBusy(false);
      }
    },
    [authToken, refreshContext],
  );

  const handleChartUpload = useCallback((event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setChartUploadName(file.name);
    setToolStatus(`Chart queued: ${file.name}`);
  }, []);

  const openResearchReport = useCallback(
    (report) => {
      jumpToPageSection(report.desk, report.targetSection, report.targetDesk || activeDesk);
    },
    [activeDesk, jumpToPageSection],
  );

  const updateSettings = useCallback(
    async (partial) => {
      if (!authToken) {
        return;
      }

        try {
          const data = await requestJson("/api/settings", {
            method: "PUT",
            token: authToken,
            body: partial,
          });
          setAppSettings(normalizeAppSettings(data.settings));
          const alertsData = await requestJson("/api/alerts", { token: authToken });
          setAlertsResponse(normalizeAlertsResponse(alertsData));
          setSettingsStatus("Workspace settings saved.");
        } catch (error) {
          setSettingsStatus(String(error.message || "Settings update failed."));
      }
    },
    [authToken],
  );

  const updateExecutionProfile = useCallback(
    async (deskId, patch) => {
      const currentProfile =
        appSettings.executionProfiles?.[deskId] || DEFAULT_EXECUTION_PROFILES[deskId];
      const nextProfiles = {
        ...appSettings.executionProfiles,
        [deskId]: {
          ...currentProfile,
          ...patch,
        },
      };
      await updateSettings({ executionProfiles: nextProfiles });
    },
    [appSettings.executionProfiles, updateSettings],
  );

  const addTarget = useCallback(async () => {
    const target = targetInput.trim();
    if (!target || !authToken) {
      return;
    }

    try {
      const data = await requestJson("/api/news/targets", {
        method: "POST",
        token: authToken,
        body: { target },
      });
      setTargets(data.items || []);
      setTargetInput("");
      setSettingsStatus("Research target saved.");
    } catch (error) {
      setSettingsStatus(String(error.message || "Target save failed."));
    }
  }, [authToken, targetInput]);

  const handleConnectorFieldChange = useCallback((providerId, field, value) => {
    setConnectorForms((current) => ({
      ...current,
      [providerId]: {
        ...(current[providerId] || {}),
        [field]: value,
      },
    }));
  }, []);

  const saveConnector = useCallback(async (providerId) => {
    if (!authToken) {
      return;
    }

    const formValues = connectorForms[providerId];
    if (!formValues) {
      return;
    }

    setConnectorBusyKey(`${providerId}:save`);
    try {
      const data = await requestJson(`/api/connectors/${providerId}`, {
        method: "PUT",
        token: authToken,
        body: formValues,
      });
      setConnectors((current) =>
        current.map((provider) => (provider.id === providerId ? data.provider : provider)),
      );
      setConnectorForms((current) => ({
        ...current,
        [providerId]: {
          ...(current[providerId] || {}),
          ...(data.provider?.config || {}),
          ...(providerId === "valr"
            ? {
                apiKey: "",
                apiSecret: "",
              }
            : providerId === "saxo"
              ? {
                  appKey: "",
                  appSecret: "",
                }
              : {}),
        },
      }));
      setSettingsStatus(
        data.detail ||
          `${providerLabel(providerId)} ${providerId === "valr" ? "credentials" : "setup"} saved.`,
      );
    } catch (error) {
      setSettingsStatus(String(error.message || "Connector save failed."));
    } finally {
      setConnectorBusyKey("");
    }
  }, [authToken, connectorForms]);

  const testConnectorConnection = useCallback(
    async (providerId) => {
      if (!authToken) {
        return;
      }

      setConnectorBusyKey(`${providerId}:test`);
      try {
        const data = await requestJson(`/api/connectors/${providerId}/test`, {
          method: "POST",
          token: authToken,
        });
        setConnectors((current) =>
          current.map((provider) => (provider.id === providerId ? data.provider : provider)),
        );
        setSettingsStatus(data.detail || `${providerLabel(providerId)} connection test passed.`);
      } catch (error) {
        setSettingsStatus(String(error.message || "Connection test failed."));
      } finally {
        setConnectorBusyKey("");
      }
    },
    [authToken],
  );

  const syncConnectorBalances = useCallback(
    async (providerId) => {
      if (!authToken) {
        return;
      }

      setConnectorBusyKey(`${providerId}:sync`);
      try {
        const data = await requestJson(`/api/connectors/${providerId}/sync`, {
          method: "POST",
          token: authToken,
        });
        setConnectors((current) =>
          current.map((provider) => (provider.id === providerId ? data.provider : provider)),
        );
        setSettingsStatus(data.detail || `${providerLabel(providerId)} account synced.`);
      } catch (error) {
        setSettingsStatus(String(error.message || "Account sync failed."));
      } finally {
        setConnectorBusyKey("");
      }
    },
    [authToken],
  );

  const disconnectConnector = useCallback(
    async (providerId) => {
      if (!authToken) {
        return;
      }

      setConnectorBusyKey(`${providerId}:disconnect`);
      try {
        const data = await requestJson(`/api/connectors/${providerId}`, {
          method: "DELETE",
          token: authToken,
        });
        setConnectors((current) =>
          current.map((provider) => (provider.id === providerId ? data.provider : provider)),
        );
        setSettingsStatus(`${providerLabel(providerId)} disconnected.`);
        setConnectorForms((current) => ({
          ...current,
          [providerId]: {
            ...INITIAL_CONNECTOR_FORMS[providerId],
          },
        }));
      } catch (error) {
        setSettingsStatus(String(error.message || "Disconnect failed."));
      } finally {
        setConnectorBusyKey("");
      }
    },
    [authToken],
  );

  const submitFeedback = useCallback(async () => {
    if (!authToken) {
      return;
    }

    setFeedbackBusyKey("submit");
    try {
      const data = await requestJson("/api/feedback", {
        method: "POST",
        token: authToken,
        body: feedbackForm,
      });
      setFeedbackResponse({
        ...EMPTY_FEEDBACK_RESPONSE,
        ...data,
        items: data.items || [],
        summary: data.summary || {},
        permissions: data.permissions || { canManage: false },
      });
      setFeedbackForm(INITIAL_FEEDBACK_FORM);
      setFeedbackStatus("Feedback saved to the board.");
    } catch (error) {
      setFeedbackStatus(String(error.message || "Feedback save failed."));
    } finally {
      setFeedbackBusyKey("");
    }
  }, [authToken, feedbackForm]);

  const updateFeedbackStatus = useCallback(
    async (feedbackId, status) => {
      if (!authToken) {
        return;
      }

      setFeedbackBusyKey(`${feedbackId}:${status}`);
      try {
        const data = await requestJson(`/api/feedback/${feedbackId}`, {
          method: "PATCH",
          token: authToken,
          body: { status },
        });
        setFeedbackResponse({
          ...EMPTY_FEEDBACK_RESPONSE,
          ...data,
          items: data.items || [],
          summary: data.summary || {},
          permissions: data.permissions || { canManage: false },
        });
        setFeedbackStatus("Feedback board updated.");
      } catch (error) {
        setFeedbackStatus(String(error.message || "Feedback update failed."));
      } finally {
        setFeedbackBusyKey("");
      }
    },
    [authToken],
  );

    const _openWatchlistSignal = useCallback(
    (item) => {
      if (!item?.ticker) {
        return;
      }
      if (item.kind === "collectible" || item.collectibleId || item.assetClass === "collectible") {
        const collectible = (collectiblesResponse.items || []).find(
          (candidate) =>
            candidate.id === item.collectibleId ||
            candidate.sku === item.ticker ||
            candidate.id === item.ticker,
        );
        if (collectible) {
          handleCollectibleSelect(collectible);
          jumpToPageSection("research", "investment-analysis");
          return;
        }
      }
      setSelectedSignalTicker(item.ticker);
      jumpToPageSection("signals", "chart-panel", item.desk || activeDesk);
    },
    [activeDesk, collectiblesResponse.items, handleCollectibleSelect, jumpToPageSection],
  );

  const addSignalToWatchlist = useCallback(
    async (signal) => {
      if (!authToken || !signal) {
        return;
      }

      setWatchlistBusyKey(`watch:${signal.ticker}`);
      try {
        const data = await requestJson("/api/watchlist", {
          method: "POST",
          token: authToken,
          body: {
            ticker: signal.ticker,
            label: signal.label,
            desk: signal.desk,
          },
        });
        setWatchlistResponse({
          ...EMPTY_WATCHLIST_RESPONSE,
          items: data.items || [],
        });
        setWatchlistStatus(`${signal.label} added to your watchlist.`);
      } catch (error) {
        setWatchlistStatus(String(error.message || "Watchlist update failed."));
      } finally {
        setWatchlistBusyKey("");
      }
    },
    [authToken],
  );

    const _removeWatchlistItem = useCallback(
    async (watchId) => {
      if (!authToken || !watchId) {
        return;
      }

      setWatchlistBusyKey(`watch:remove:${watchId}`);
      try {
        const data = await requestJson(`/api/watchlist/${watchId}`, {
          method: "DELETE",
          token: authToken,
        });
        setWatchlistResponse({
          ...EMPTY_WATCHLIST_RESPONSE,
          items: data.items || [],
        });
        setWatchlistStatus("Watchlist updated.");
      } catch (error) {
        setWatchlistStatus(String(error.message || "Watchlist removal failed."));
      } finally {
        setWatchlistBusyKey("");
      }
    },
    [authToken],
  );

  const _updateRoutineStep = useCallback(
    async (stepId, completed) => {
      if (!authToken || !stepId) {
        return;
      }

      setWatchlistBusyKey(`routine:${stepId}`);
      try {
        const data = await requestJson("/api/session-routine", {
          method: "PUT",
          token: authToken,
          body: { stepId, completed },
        });
        setRoutineResponse({
          ...EMPTY_ROUTINE_RESPONSE,
          ...(data.routine || {}),
          completedStepIds: data.routine?.completedStepIds || [],
          activeDates: data.routine?.activeDates || [],
        });
        setRoutineStatus(completed ? "Workflow step marked complete." : "Workflow step unchecked.");
      } catch (error) {
        setRoutineStatus(String(error.message || "Routine update failed."));
      } finally {
        setWatchlistBusyKey("");
      }
    },
    [authToken],
  );

  const _updateRoutineSessionMode = useCallback(
    async (sessionMode) => {
      if (!authToken || !sessionMode) {
        return;
      }

      setWatchlistBusyKey(`routine-mode:${sessionMode}`);
      try {
        const data = await requestJson("/api/session-routine", {
          method: "PUT",
          token: authToken,
          body: { sessionMode },
        });
        setRoutineResponse({
          ...EMPTY_ROUTINE_RESPONSE,
          ...(data.routine || {}),
          completedStepIds: data.routine?.completedStepIds || [],
          activeDates: data.routine?.activeDates || [],
        });
        setRoutineStatus("Workflow session updated.");
      } catch (error) {
        setRoutineStatus(String(error.message || "Session update failed."));
      } finally {
        setWatchlistBusyKey("");
      }
    },
    [authToken],
  );

  const _resetRoutineForToday = useCallback(async () => {
    if (!authToken) {
      return;
    }

    setWatchlistBusyKey("routine:reset");
    try {
      const data = await requestJson("/api/session-routine", {
        method: "PUT",
        token: authToken,
        body: { reset: true },
      });
      setRoutineResponse({
        ...EMPTY_ROUTINE_RESPONSE,
        ...(data.routine || {}),
        completedStepIds: data.routine?.completedStepIds || [],
        activeDates: data.routine?.activeDates || [],
      });
      setRoutineStatus("Today's workflow has been reset.");
    } catch (error) {
      setRoutineStatus(String(error.message || "Routine reset failed."));
    } finally {
      setWatchlistBusyKey("");
    }
  }, [authToken]);

  const _dismissRoutineReminder = useCallback(async () => {
    if (!authToken) {
      return;
    }

    setWatchlistBusyKey("routine:reminder");
    try {
      const data = await requestJson("/api/session-routine", {
        method: "PUT",
        token: authToken,
        body: { dismissReminder: true },
      });
      setRoutineResponse({
        ...EMPTY_ROUTINE_RESPONSE,
        ...(data.routine || {}),
        completedStepIds: data.routine?.completedStepIds || [],
        activeDates: data.routine?.activeDates || [],
      });
      setRoutineStatus("Today's reminder dismissed.");
    } catch (error) {
      setRoutineStatus(String(error.message || "Reminder dismissal failed."));
    } finally {
      setWatchlistBusyKey("");
    }
  }, [authToken]);

  const _acknowledgeRoutineCompletion = useCallback(async () => {
    if (!authToken) {
      return;
    }

    setWatchlistBusyKey("routine:ack");
    try {
      const data = await requestJson("/api/session-routine", {
        method: "PUT",
        token: authToken,
        body: { acknowledgeCompletion: true },
      });
      setRoutineResponse({
        ...EMPTY_ROUTINE_RESPONSE,
        ...(data.routine || {}),
        completedStepIds: data.routine?.completedStepIds || [],
        activeDates: data.routine?.activeDates || [],
      });
      setRoutineStatus("Routine completion saved.");
    } catch (error) {
      setRoutineStatus(String(error.message || "Completion acknowledgement failed."));
    } finally {
      setWatchlistBusyKey("");
    }
  }, [authToken]);

  const createSignalAlert = useCallback(
    async (signal, kind, threshold, labelOverride) => {
      if (!authToken || !signal) {
        return;
      }

        setWatchlistBusyKey(`alert:${signal.ticker}:${kind}`);
        try {
          const data = await requestJson("/api/alerts", {
            method: "POST",
            token: authToken,
            body: {
            ticker: signal.ticker,
            label: labelOverride || signal.label,
            desk: signal.desk,
            kind,
              threshold,
            },
          });
          setAlertsResponse(normalizeAlertsResponse(data));
          setWatchlistStatus(`${signal.label} alert saved.`);
        } catch (error) {
          if (String(error.message || "") === "alert_limit_reached") {
            const limit = alertsResponse.plan?.maxAlerts || 5;
            setWatchlistStatus(
              `Your ${subscriptionTierLabel(appSettings.subscriptionTier)} plan allows ${limit} alert slots. Remove one or upgrade in Settings.`,
            );
          } else {
            setWatchlistStatus(String(error.message || "Alert save failed."));
          }
        } finally {
          setWatchlistBusyKey("");
        }
      },
      [alertsResponse.plan?.maxAlerts, appSettings.subscriptionTier, authToken],
    );

  const _toggleAlertRule = useCallback(
    async (alertId, enabled) => {
      if (!authToken || !alertId) {
        return;
      }

      setWatchlistBusyKey(`alert:toggle:${alertId}`);
      try {
        const data = await requestJson(`/api/alerts/${alertId}`, {
          method: "PATCH",
          token: authToken,
          body: { enabled },
        });
          setAlertsResponse(normalizeAlertsResponse(data));
          setWatchlistStatus(`Alert ${enabled ? "enabled" : "paused"}.`);
      } catch (error) {
        setWatchlistStatus(String(error.message || "Alert update failed."));
      } finally {
        setWatchlistBusyKey("");
      }
    },
    [authToken],
  );

  const _removeAlertRule = useCallback(
    async (alertId) => {
      if (!authToken || !alertId) {
        return;
      }

      setWatchlistBusyKey(`alert:remove:${alertId}`);
      try {
        const data = await requestJson(`/api/alerts/${alertId}`, {
          method: "DELETE",
          token: authToken,
        });
          setAlertsResponse(normalizeAlertsResponse(data));
          setWatchlistStatus("Alert removed.");
      } catch (error) {
        setWatchlistStatus(String(error.message || "Alert removal failed."));
      } finally {
        setWatchlistBusyKey("");
      }
    },
    [authToken],
  );

  const markNotificationRead = useCallback(
    async (notificationId) => {
      if (!authToken || !notificationId) {
        return;
      }

      setWatchlistBusyKey(`notification:${notificationId}`);
      try {
        const data = await requestJson(`/api/notifications/${notificationId}`, {
          method: "PATCH",
          token: authToken,
          body: { status: "read" },
        });
        setNotificationsResponse({
          ...EMPTY_NOTIFICATIONS_RESPONSE,
          items: data.items || [],
          summary: data.summary || EMPTY_NOTIFICATIONS_RESPONSE.summary,
        });
      } catch (error) {
        setWatchlistStatus(String(error.message || "Notification update failed."));
      } finally {
        setWatchlistBusyKey("");
      }
    },
    [authToken],
  );

  const markAllNotificationsRead = useCallback(async () => {
    if (!authToken) {
      return;
    }

    setWatchlistBusyKey("notification:all");
    try {
      const data = await requestJson("/api/notifications/mark-all-read", {
        method: "POST",
        token: authToken,
      });
      setNotificationsResponse({
        ...EMPTY_NOTIFICATIONS_RESPONSE,
        items: data.items || [],
        summary: data.summary || EMPTY_NOTIFICATIONS_RESPONSE.summary,
      });
      setWatchlistStatus("Notifications marked as read.");
    } catch (error) {
      setWatchlistStatus(String(error.message || "Notification update failed."));
    } finally {
      setWatchlistBusyKey("");
    }
  }, [authToken]);

  const openNotificationHomeFeed = useCallback(() => {
    setNotificationCenterVisible(false);
    jumpToPageSection("home", "home-watchlist", activeDesk);
  }, [activeDesk, jumpToPageSection]);

  const openNotificationDestination = useCallback(
    async (item) => {
      setNotificationCenterVisible(false);
      if (item?.status === "unread" && item?.id) {
        await markNotificationRead(item.id);
      }

      if (item?.ticker) {
        setSelectedSignalTicker(item.ticker);
        jumpToPageSection("signals", "chart-panel", item.desk || activeDesk);
        return;
      }

      jumpToPageSection("home", "home-watchlist", activeDesk);
    },
    [activeDesk, jumpToPageSection, markNotificationRead],
  );

  const applyChartLevelToTicket = useCallback((levelKind) => {
    if (!activeSignal) {
      return;
    }

    if (!orderTicket || orderTicket.kind !== "market" || orderTicket.marketTicker !== activeSignal.ticker) {
      setTradeStatus("Open the active ticket first if you want to use chart levels.");
      return;
    }

    const support = activeSignal.tradePlan?.support ?? null;
    const resistance = activeSignal.tradePlan?.resistance ?? null;
    const levelMap =
      orderTicket.side === "SELL"
        ? {
            support: ["targetPrice", support],
            resistance: ["stopPrice", resistance],
            stop: ["stopPrice", activeChartPlan?.stopPrice ?? null],
            target: ["targetPrice", activeChartPlan?.targetPrice ?? null],
          }
        : {
            support: ["stopPrice", support],
            resistance: ["targetPrice", resistance],
            stop: ["stopPrice", activeChartPlan?.stopPrice ?? null],
            target: ["targetPrice", activeChartPlan?.targetPrice ?? null],
          };

    const mapping = levelMap[levelKind];
    if (!mapping || !Number.isFinite(Number(mapping[1]))) {
      return;
    }

    const [field, numericValue] = mapping;
    const stringValue = formatTicketPlanInput(orderTicket, numericValue);

    setOrderTicket((current) => {
      if (!current) {
        return current;
      }
      const nextTicket = {
        ...current,
        [field]: stringValue,
      };
      return {
        ...nextTicket,
        ...resolveTicketPlanMeta(
          nextTicket,
          field === "stopPrice" ? stringValue : nextTicket.stopPrice,
          field === "targetPrice" ? stringValue : nextTicket.targetPrice,
        ),
      };
    });
  }, [activeChartPlan, activeSignal, orderTicket]);

  const activePageSections = PAGE_SECTION_LINKS[page] || [];
  const leadSignal = activeSignal || signalsResponse.leadSignal || null;
  const activeSignalExecutionPlan = leadSignal
    ? executionPlanForSignal(leadSignal, appSettings, connectors)
    : executionPlanForSignal({ desk: effectiveDeskKey }, appSettings, connectors);

  const currentWorkspaceCard = {
    label: workspaceLabel(page, activeDesk),
    hint: SCREEN_PREVIEWS[page] || "Current workspace",
  };
  const canGoBack =
    navigationStack.length > 0 ||
    !["home", "research", "scan", "collection", "exits"].includes(page);
  const notificationSummary = notificationsResponse.summary || EMPTY_NOTIFICATIONS_RESPONSE.summary;
  const notificationUnreadCount = notificationSummary.unread || 0;
  const alertSummary = alertsResponse.summary || EMPTY_ALERTS_RESPONSE.summary;
  const mobileClockLabel = useMemo(
    () =>
      new Intl.DateTimeFormat("en-ZA", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: appSettings.timezone || "Africa/Johannesburg",
      }).format(new Date()),
    [appSettings.timezone],
  );
  const executionPlanForCard = useCallback(
    (signal) => executionPlanForSignal(signal, appSettings, connectors),
    [appSettings, connectors],
  );

  const brickAlphaSummary = useMemo(
    () => summarizeOpenCollection(enrichedPortfolio),
    [enrichedPortfolio],
  );
  const topMetrics = [
    {
      id: "nav",
      label: "Open collection value",
      value: formatCollectiblePrice(brickAlphaSummary.netAssetValue),
      detail: `${brickAlphaSummary.collectionGrade || "No positions yet"} · owned sets only`,
      action: () => jumpToPageSection("home", "home-dashboard", activeDesk),
    },
    {
      id: "unrealized",
      label: "Unrealised Gain",
      value: formatCollectiblePrice(brickAlphaSummary.unrealizedGain),
      detail: brickAlphaSummary.costBasis
        ? `${((brickAlphaSummary.unrealizedGain / brickAlphaSummary.costBasis) * 100).toFixed(1)}% vs cost · realised ${formatCollectiblePrice(brickAlphaSummary.realizedGain)} net of fees`
        : `Realised ${formatCollectiblePrice(brickAlphaSummary.realizedGain)} net of fees`,
      action: () => jumpToPageSection("collection", "portfolio-dashboard"),
    },
    {
      id: "score",
      label: "Portfolio Score",
      value: brickAlphaSummary.averageBrickAlphaScore
        ? `${Math.round(brickAlphaSummary.averageBrickAlphaScore)}/100`
        : "--",
      detail: "Brick Alpha average",
      action: () => jumpToPageSection("home", "home-dashboard", activeDesk),
    },
    {
      id: "grade",
      label: "Collection Grade",
      value: brickAlphaSummary.collectionGrade || "--",
      detail: "Investment quality tier",
      action: () => jumpToPageSection("collection", "portfolio-dashboard"),
    },
    {
      id: "diversification",
      label: "Diversification",
      value: brickAlphaSummary.diversificationScore
        ? `${Math.round(brickAlphaSummary.diversificationScore)}/100`
        : "--",
      detail: "Theme and category spread",
      action: () => jumpToPageSection("collection", "portfolio-dashboard"),
    },
  ];
  const globalSearchIndex = useMemo(
    () =>
      NAV_ITEMS.flatMap((item) => {
        const workspaceEntry = {
          id: `workspace-${item.id}`,
          label: item.label,
          hint: item.hint,
          glyph: item.glyph,
          page: item.id,
          sectionId: null,
        };
        const sectionEntries = (PAGE_SECTION_LINKS[item.id] || []).map((section) => ({
          id: `section-${item.id}-${section.id}`,
          label: section.label,
          hint: `${item.label} · ${section.label}`,
          glyph: item.glyph,
          page: item.id,
          sectionId: section.id,
        }));
        return [workspaceEntry, ...sectionEntries];
      }),
    [],
  );
  const globalSearchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return globalSearchIndex.slice(0, 12);
    }
    return globalSearchIndex
      .filter(
        (item) =>
          item.label.toLowerCase().includes(query) ||
          item.hint.toLowerCase().includes(query) ||
          item.page.toLowerCase().includes(query),
      )
      .slice(0, 16);
  }, [globalSearchIndex, searchQuery]);
  const openGlobalSearch = useCallback(() => {
    setSearchQuery("");
    setSearchVisible(true);
  }, []);
  const closeGlobalSearch = useCallback(() => {
    setSearchVisible(false);
    setSearchQuery("");
  }, []);
  const handleGlobalSearchSelect = useCallback(
    (item) => {
      closeGlobalSearch();
      if (item.sectionId) {
        jumpToPageSection(item.page, item.sectionId, activeDesk);
        return;
      }
      navigateToPage(item.page, false, activeDesk);
    },
    [activeDesk, closeGlobalSearch, jumpToPageSection, navigateToPage],
  );

  useEffect(() => {
    const handleKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (searchVisible) {
          closeGlobalSearch();
        } else if (currentUser && !splashVisible) {
          openGlobalSearch();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeGlobalSearch, currentUser, openGlobalSearch, searchVisible, splashVisible]);

  const utilityNavItems = NAV_ITEMS.filter((item) =>
    ["subscriptions", "tools", "reports", "connections", "settings"].includes(item.id),
  );
  const legoJourneyActive = isV3LegoJourneyPage(page);
  const defaultTradingDesk = ["forex", "etfs", "jse"].includes(activeDesk) ? activeDesk : "forex";
  const menuPrimaryItems = [
    {
      id: "menu-news",
      glyph: "NW",
      label: "News",
      detail: `${labelDesk(activeDesk)} macro tape`,
      action: () => handleMenuNavigate("news", activeDesk),
    },
    {
      id: "menu-trading",
      glyph: "TR",
      label: "Trading",
      detail: `${labelDesk(defaultTradingDesk)} signal desk`,
      action: () => handleMenuNavigate("signals", defaultTradingDesk),
    },
    {
      id: "menu-crypto",
      glyph: "CR",
      label: "Crypto",
      detail: "BTC and crypto desk",
      action: () => handleMenuNavigate("signals", "crypto"),
    },
    {
      id: "menu-research",
      glyph: "RS",
      label: "Research",
      detail: "Browse and analyze sets",
      action: () => handleMenuNavigate("research", activeDesk),
    },
    {
      id: "menu-collection",
      glyph: "CL",
      label: "Collection",
      detail: "Holdings and performance",
      action: () => handleMenuNavigate("collection", activeDesk),
    },
  ];
  const menuDeskItems = MARKET_DESKS.map((desk) => ({
    id: desk.id,
    label: desk.label,
    detail: desk.shortLabel,
    active: activeDesk === desk.id,
    action: () => handleMenuNavigate(page === "news" ? "news" : "signals", desk.id),
  }));
  const menuSupportItems = [
    {
      id: "menu-home",
      label: "Dashboard",
      detail: "Executive dashboard",
      action: () => handleMenuNavigate("home", activeDesk),
    },
    {
      id: "menu-reports",
      label: "Research Center",
      detail: "Performance graphs",
      action: () => handleMenuNavigate("reports", activeDesk),
    },
    {
      id: "menu-subscriptions",
      label: "Subscriptions",
      detail: "Plans and premium value",
      action: () => handleMenuNavigate("subscriptions", activeDesk),
    },
    {
      id: "menu-tools",
      label: "Tools",
      detail: "Mentor and simulator",
      action: () => handleMenuNavigate("tools", activeDesk),
    },
    {
      id: "menu-connections",
      label: "Connections",
      detail: "Feeds and routing",
      action: () => handleMenuNavigate("connections", activeDesk),
    },
    {
      id: "menu-settings",
      label: "Settings",
      detail: "Account and setup",
      action: () => handleMenuNavigate("settings", activeDesk),
    },
  ];
  const menuActionItems = [
    {
      id: "menu-inbox",
      label: "Alerts Inbox",
      detail: `${notificationUnreadCount} unread in this session`,
      action: openNotificationCenter,
    },
    {
      id: "menu-feedback",
      label: "Feedback Board",
      detail: "Partner notes and status",
      action: () => handleMenuSection("settings", "feedback-board"),
    },
    {
      id: "menu-testing",
      label: "Partner Testing",
      detail: "Guided review route",
      action: () => handleMenuSection("settings", "partner-testing"),
    },
    {
      id: "menu-intro",
      label: "Intro Screen",
      detail: "Open the launch chooser",
      action: handleMenuSplash,
    },
    {
      id: "menu-logout",
      label: "Log Out",
      detail: "End this session",
      action: handleMenuLogout,
    },
  ];
  const workspaceContent = (
    <>
      {page === "home" ? (
        <HomeScreen
          appSettings={appSettings}
          closedTrades={closedTrades}
          collectibles={collectibles}
          navigateToPage={navigateToPage}
          openTrades={openTrades}
        />
      ) : null}

      {page === "news" ? (
        <NewsScreen
          activeDesk={activeDesk}
          activeDeskNewsLabel={activeDeskNewsLabel}
          activeDeskProfile={activeDeskProfile}
          activePageSections={activePageSections}
          appSettings={appSettings}
          deskLeadSignal={leadSignal}
          globalHeadlineCount={globalHeadlineCount}
          handleDeskRoute={handleDeskRoute}
          jumpToPageSection={jumpToPageSection}
          leadNewsItem={leadNewsItem}
          newsResponse={{ ...newsResponse, items: newsItemsForDesk }}
          newsSourceMap={newsSourceMap}
          refreshContext={refreshCore}
          southAfricaHeadlineCount={southAfricaHeadlineCount}
        />
      ) : null}

      {page === "signals" ? (
        <TradeScreen
          activeChartPlan={activeChartPlan}
          activeDesk={activeDesk}
          activePageSections={activePageSections}
          activeSignalExecutionPlan={activeSignalExecutionPlan}
          addSignalToWatchlist={addSignalToWatchlist}
          alertsResponse={alertsResponse}
          appSettings={appSettings}
          applyChartLevelToTicket={applyChartLevelToTicket}
          createSignalAlert={createSignalAlert}
          effectiveDeskKey={effectiveDeskKey}
          executionPlanForCard={executionPlanForCard}
          filteredSignals={filteredSignals}
          handleDeskRoute={handleDeskRoute}
          handleSelectSignal={handleSelectSignal}
          jumpToPageSection={jumpToPageSection}
          leadSignal={leadSignal}
          marketSourceMap={marketSourceMap}
          newsItemsForDesk={newsItemsForDesk}
          newsSourceMap={newsSourceMap}
          navigateToPage={navigateToPage}
          openMarketTicket={openMarketTicket}
          openTrades={openTrades}
          orderTicket={orderTicket}
          signalsResponse={signalsResponse}
          tradeStatus={tradeStatus}
          watchlistBusyKey={watchlistBusyKey}
          watchlistStatus={watchlistStatus}
        />
      ) : null}

      {page === "tools" ? (
        <ToolsScreen
          activeChartPlan={activeChartPlan}
          activeDeskProfile={activeDeskProfile}
          activePageSections={activePageSections}
          activeResearchReports={activeResearchReports}
          activeSignal={leadSignal}
          appSettings={appSettings}
          chartUploadName={chartUploadName}
          handleChartUpload={handleChartUpload}
          jumpToPageSection={jumpToPageSection}
          leadNewsItem={leadNewsItem}
          mentorChecklist={mentorChecklist}
          mentorSummary={mentorSummary}
          navigateToPage={navigateToPage}
          openResearchReport={openResearchReport}
          openTrades={openTrades}
          toolStatus={toolStatus}
          toolsDeskKey={toolsDeskKey}
        />
      ) : null}

      {page === "research" ? (
        <ResearchScreen
          collectibles={collectibles}
          openTrades={openTrades}
          closedTrades={closedTrades}
          navigateToPage={navigateToPage}
          onWatch={addSignalToWatchlist}
        />
      ) : null}

      {page === "scan" ? (
        <ScanEvaluateScreen
          activePageSections={activePageSections}
          appSettings={appSettings}
          collectibles={collectibles}
          collectiblesResponse={enrichedCollectiblesResponse}
          handleCollectibleSelect={handleCollectibleSelect}
          jumpToPageSection={jumpToPageSection}
          onAddToWatchlist={addSignalToWatchlist}
          openCollectibleTicket={openCollectibleTicket}
          openTrades={openTrades}
          closedTrades={closedTrades}
          navigateToPage={navigateToPage}
        />
      ) : null}

      {page === "collection" ? (
        <CollectionScreen
          openTrades={openTrades}
          collectibles={collectibles}
          navigateToPage={navigateToPage}
        />
      ) : null}

      {page === "exits" ? (
        <ExitsScreen
          openTrades={openTrades}
          closedTrades={closedTrades}
          collectibles={collectibles}
          navigateToPage={navigateToPage}
          onRecordSale={submitExitSale}
          busy={tradeActionBusy}
        />
      ) : null}

      {page === "verdict" ? (
        <VerdictScreen
          appSettings={appSettings}
          navigateToPage={navigateToPage}
          onWatch={addSignalToWatchlist}
          onAddToCollection={() => navigateToPage("log-purchase")}
        />
      ) : null}

      {page === "set-analysis" ? <SetAnalysisScreen appSettings={appSettings} navigateToPage={navigateToPage} /> : null}

      {page === "log-purchase" ? (
        <LogPurchaseScreen
          navigateToPage={navigateToPage}
          busy={tradeActionBusy}
          onSubmitPurchase={submitLoggedPurchase}
        />
      ) : null}

      {page === "reports" ? (
        <ReportsScreen
          activeDesk={activeDesk}
          activePageSections={activePageSections}
          appSettings={appSettings}
          closedTrades={closedTrades}
          health={health}
          jumpToPageSection={jumpToPageSection}
          navigateToPage={navigateToPage}
          openTrades={openTrades}
          signalsResponse={signalsResponse}
          totalOpenPnl={totalOpenPnl}
        />
      ) : null}

      {page === "subscriptions" ? (
        <SubscriptionsScreen
          activeDesk={activeDesk}
          activePageSections={activePageSections}
          alertsResponse={alertsResponse}
          appSettings={appSettings}
          jumpToPageSection={jumpToPageSection}
          navigateToPage={navigateToPage}
          notificationsResponse={notificationsResponse}
          openTrades={openTrades}
          totalOpenPnl={totalOpenPnl}
        />
      ) : null}

      {page === "connections" ? (
        <ConnectionsScreen
          activeDesk={activeDesk}
          activePageSections={activePageSections}
          appSettings={appSettings}
          connectedProviderCount={connectedProviderCount}
          connectorBusyKey={connectorBusyKey}
          connectors={connectors}
          cryptoConnector={cryptoConnector}
          degradedSourceCount={degradedSourceCount}
          disconnectConnector={disconnectConnector}
          handleConnectorFieldChange={handleConnectorFieldChange}
          health={health}
          jumpToPageSection={jumpToPageSection}
          liveReadyDeskCount={liveReadyDeskCount}
          newsResponse={newsResponse}
          refreshContext={refreshContext}
          refreshCore={refreshCore}
          saveConnector={saveConnector}
          settingsStatus={settingsStatus}
          signalsResponse={signalsResponse}
          syncConnectorBalances={syncConnectorBalances}
          testConnectorConnection={testConnectorConnection}
          updateExecutionProfile={updateExecutionProfile}
          connectorForms={connectorForms}
        />
      ) : null}

      {page === "settings" ? (
        <SettingsScreen
          activeDesk={activeDesk}
          activePageSections={activePageSections}
          addTarget={addTarget}
          alertsResponse={alertsResponse}
          appSettings={appSettings}
          connectedProviderCount={connectedProviderCount}
          currentUser={currentUser}
          feedbackBusyKey={feedbackBusyKey}
          feedbackForm={feedbackForm}
          feedbackResponse={feedbackResponse}
          feedbackStatus={feedbackStatus}
          installActionLabel={installActionLabel}
          installHint={installHint}
          installStatus={installStatus}
          isAppInstalled={isAppInstalled}
          jumpToPageSection={jumpToPageSection}
          liveReadyDeskCount={liveReadyDeskCount}
          navigateToPage={navigateToPage}
          onInstallApp={installApp}
          setFeedbackForm={setFeedbackForm}
          settingsStatus={settingsStatus}
          shareStatus={shareStatus}
          setTargetInput={setTargetInput}
          submitFeedback={submitFeedback}
          targetInput={targetInput}
          targets={targets}
          updateFeedbackStatus={updateFeedbackStatus}
          updateSettings={updateSettings}
          onDemoReset={handleDemoReset}
          legoJourney
        />
      ) : null}
    </>
  );

  if (!authChecked) {
    if (bootSplashVisible) {
      return <BootSplash />;
    }
    return <LoadingShell message="Restoring account state, desk preference, and the last working route." />;
  }

  if (bootSplashVisible) {
    return <BootSplash />;
  }

  if (!currentUser) {
    return (
      <AuthShell
        authMode={authMode}
        authView={authView}
        authForm={authForm}
        resetForm={resetForm}
        authStatus={authStatus}
        resetStatus={resetStatus}
        resetHintCode={resetHintCode}
        launchSelection={preAuthLaunch}
        onBack={authStage === "landing" ? () => setAuthStage("auth") : null}
        onModeChange={setAuthMode}
        onSubmit={handleAuthSubmit}
        onFieldChange={handleAuthFieldChange}
        onResetFieldChange={handleResetFieldChange}
        onForgotPassword={openForgotPassword}
        onPasswordResetRequest={handleResetRequest}
        onPasswordResetConfirm={handleResetConfirm}
        onReturnToLogin={returnToLogin}
        onDemo={() => handleDemoLaunch(preAuthLaunch)}
        demoBusy={demoLaunchBusy}
      />
    );
  }

  if (splashVisible) {
    return (
      <SplashScreen
        ready
        activePage={page}
        activeDesk={activeDesk}
        onLaunch={handleSplashLaunch}
      />
    );
  }

  if (v3OnboardingVisible) {
    return (
      <V3OnboardingFlow
        onComplete={completeV3Onboarding}
        onNavigateToScan={() => {
          setV3OnboardingVisible(false);
          jumpToPageSection("scan", "scan-evaluate", activeDesk);
        }}
        onNavigateToCollection={() => {
          setV3OnboardingVisible(false);
          jumpToPageSection("log-purchase", "log-purchase", activeDesk);
        }}
      />
    );
  }

  return (
    <div className="appShell saasAppShell v3AppShell">
      <V3Sidebar
        activePage={page}
        workspaceHint={SCREEN_PREVIEWS[page]}
        userLabel={currentUser.name || currentUser.email}
        userInitial={(currentUser.name || currentUser.email || "U").slice(0, 1).toUpperCase()}
        onNavigate={(nextPage) => navigateToPage(nextPage, false, activeDesk)}
        onBrandClick={handleNavigateHome}
      />

      <div className="workspaceShell">
        <div className="mobileStatusBar">
          <span>{mobileClockLabel}</span>
          <div className="mobileStatusIcons" aria-hidden="true">
            <span className="mobileStatusDot" />
            <span className="mobileStatusPill">5G</span>
            <span className="mobileStatusBattery">92%</span>
          </div>
        </div>

        <div className="mobileTitleBar">
          <div className="mobileTitleLead">
            {canGoBack ? (
              <button
                type="button"
                className="mobileBackButton"
                aria-label="Go back"
                onClick={handleAppBack}
              >
                <span>&lt;</span>
              </button>
            ) : null}
            <button type="button" className="mobileBrandButton" onClick={handleNavigateHome}>
              <BrandLogo size="sm" />
              <div className="mobileBrandCopy">
                <strong>{APP_NAME}</strong>
                <small>{currentWorkspaceCard.label}</small>
              </div>
            </button>
          </div>

          <div className="mobileTitleActions">
            {!legoJourneyActive ? (
              <div className="mobileTitleMeta">
                <span>{labelDesk(activeDesk)}</span>
                <strong>{marketModeLabel(signalsResponse.marketData?.mode)}</strong>
              </div>
            ) : null}
            {!isAppInstalled ? (
              <button
                type="button"
                className="mobileInboxButton"
                aria-label={installActionLabel}
                onClick={installApp}
              >
                <span>Install</span>
              </button>
            ) : null}
            <button
              type="button"
              className={`mobileInboxButton ${notificationUnreadCount ? "hasUnread" : ""}`}
              aria-label="Open alerts inbox"
              onClick={openNotificationCenter}
            >
              <span>Inbox</span>
              {notificationUnreadCount ? <em>{notificationUnreadCount}</em> : null}
            </button>
            <button
              type="button"
              className="mobileMenuButton"
              aria-label="Open menu"
              onClick={openMenu}
            >
              <span />
              <span />
              <span />
            </button>
          </div>
        </div>

        <SaasTopNav
          workspaceLabel={currentWorkspaceCard.label}
          feedMode={marketModeLabel(signalsResponse.marketData?.mode)}
          feedModeTone={statusTone(signalsResponse.marketData?.mode)}
          notificationCount={notificationUnreadCount}
          onOpenSearch={openGlobalSearch}
          onOpenNotifications={openNotificationCenter}
          onOpenFeedback={() => jumpToPageSection("settings", "feedback-board")}
          onLogout={clearSession}
          hideMarketStatus={legoJourneyActive}
          searchLabel={legoJourneyActive ? "Search sets and pages" : "Search workspaces..."}
          userInitial={(currentUser.name || currentUser.email || "U").slice(0, 1).toUpperCase()}
        />

        {!legoJourneyActive && page !== "home" ? <ExecutiveSummaryStrip metrics={topMetrics} /> : null}

        {!legoJourneyActive ? (
        <header className={`topbar ${page === "home" ? "topbar-compactHome" : ""}`}>
          {page !== "home" ? (
          <div className="metricStrip">
            {topMetrics.map((metric) => (
              <button
                key={metric.id}
                type="button"
                className="metricBlock metricButton"
                onClick={metric.action}
              >
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
                <small>{metric.detail}</small>
              </button>
            ))}
          </div>
          ) : null}

          <div className="topbarTools">
            <div className={`livePill ${statusTone(signalsResponse.marketData?.mode)}`}>
              {marketModeLabel(signalsResponse.marketData?.mode)}
            </div>
            {!isAppInstalled ? (
              <button
                type="button"
                className="ghostButton"
                onClick={installApp}
              >
                {installActionLabel}
              </button>
            ) : null}
            <button
              type="button"
              className={`ghostButton topbarInboxButton ${notificationUnreadCount ? "hasUnread" : ""}`}
              onClick={openNotificationCenter}
            >
              <span>Alerts inbox</span>
              <strong>{notificationUnreadCount}</strong>
            </button>
            <button
              type="button"
              className="ghostButton"
              onClick={() => jumpToPageSection("settings", "feedback-board")}
            >
              Feedback Board
            </button>
            <button type="button" className="ghostButton" onClick={clearSession}>
              Log Out
            </button>
            <div className="avatarCircle">
              {(currentUser.name || currentUser.email || "U").slice(0, 1).toUpperCase()}
            </div>
          </div>
        </header>
        ) : null}

        <div className="mobileUtilityRail">
          {utilityNavItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`mobileUtilityChip ${page === item.id ? "active" : ""}`}
              onClick={() => navigateToPage(item.id, false, activeDesk)}
            >
              <span>{item.glyph}</span>
              <strong>{item.label}</strong>
            </button>
          ))}
        </div>

        <main className="workspace">
          <Suspense fallback={<WorkspaceLoadingState label={currentWorkspaceCard.label} />}>
            <div key={`${page}:${activeDesk}`} className="workspaceViewport">
              {workspaceContent}
            </div>
          </Suspense>
        </main>

        <V3BottomNav activePage={page} onNavigate={(nextPage) => navigateToPage(nextPage, false, activeDesk)} />

        {notificationCenterVisible ? (
          <NotificationCenter
            activeDesk={activeDesk}
            alertSummary={alertSummary}
            appSettings={appSettings}
            busyKey={watchlistBusyKey}
            notificationsResponse={notificationsResponse}
            onClose={closeNotificationCenter}
            onMarkAllRead={markAllNotificationsRead}
            onMarkRead={markNotificationRead}
            onOpenHomeFeed={openNotificationHomeFeed}
            onOpenNotification={openNotificationDestination}
          />
        ) : null}

        {menuVisible ? (
          <div className="mobileMenuBackdrop" onClick={closeMenu}>
            <div className="mobileMenuScreen" onClick={(event) => event.stopPropagation()}>
              <div className="mobileMenuScreenHeader">
                <div>
                  <span>Navigation</span>
                  <strong>Choose where to go</strong>
                  <small>
                    {currentUser?.name || currentUser?.email || "Current session"} |{" "}
                    {labelDesk(activeDesk)} | {currentWorkspaceCard.label}
                  </small>
                </div>
                <button type="button" className="ghostButton mobileMenuClose" onClick={closeMenu}>
                  Close
                </button>
              </div>

              <div className="mobileMenuScreenList">
                {v3MobileMenuItems(menuPrimaryItems, legoJourneyActive).map((item) => (
                  <button key={item.id} type="button" className="mobileMenuRow" onClick={item.action}>
                    <div className="mobileMenuRowGlyph">{item.glyph}</div>
                    <div className="mobileMenuRowCopy">
                      <strong>{item.label}</strong>
                      <small>{item.detail}</small>
                    </div>
                    <div className="mobileMenuRowArrow">-&gt;</div>
                  </button>
                ))}
              </div>

              {legoJourneyActive ? null : (
              <div className="mobileMenuScreenSection">
                <span>Desk shortcuts</span>
                <div className="mobileMenuPillRow">
                  {menuDeskItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`mobileMenuPill ${item.active ? "active" : ""}`}
                      onClick={item.action}
                    >
                      <strong>{item.label}</strong>
                      <small>{item.detail}</small>
                    </button>
                  ))}
                </div>
              </div>
              )}

              <div className="mobileMenuScreenSection">
                <span>Workspace &amp; Support</span>
                <div className="mobileMenuSupportList">
                  {menuSupportItems.map((item) => (
                    <button key={item.id} type="button" className="mobileMenuSupportCard" onClick={item.action}>
                      <strong>{item.label}</strong>
                      <small>{item.detail}</small>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mobileMenuScreenSection">
                <span>Actions</span>
                <div className="mobileMenuActionList">
                  {menuActionItems.map((item) => (
                    <button key={item.id} type="button" className="mobileMenuActionRow" onClick={item.action}>
                      <div>
                        <strong>{item.label}</strong>
                        <small>{item.detail}</small>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <GlobalSearch
          open={searchVisible}
          query={searchQuery}
          onQueryChange={setSearchQuery}
          results={globalSearchResults}
          onSelect={handleGlobalSearchSelect}
          onClose={closeGlobalSearch}
        />
      </div>

      <Suspense fallback={null}>
        <OrderTicketModal
          ticket={orderTicket}
          executionPlan={
            orderTicket?.kind === "market" && leadSignal
              ? executionPlanForSignal(
                  { desk: orderTicket?.desk, ticker: orderTicket?.marketTicker },
                  appSettings,
                  connectors,
                )
              : orderTicket?.kind === "collectible"
                ? {
                    mode: "paper",
                    providerLabel: "Brick Alpha Paper",
                    pair: null,
                    ready: true,
                    detail: "LEGO investment positions stay inside the app as paper holdings.",
                  }
                : null
          }
          busy={tradeActionBusy}
          onClose={() => setOrderTicket(null)}
          onFieldChange={handleOrderFieldChange}
          onPlanAction={handleOrderPlanAction}
          onSubmit={submitOrderTicket}
        />
      </Suspense>
    </div>
  );
}
