import { useMemo, useState } from "react";
import {
  ALERT_SUBSCRIPTION_OPTIONS,
  DEFAULT_EXECUTION_PROFILES,
  DESK_FILTERS,
  MARKET_DESKS,
  PARTNER_TEST_FLOW,
  RAILS,
} from "../appConfig";
import {
  actionTone,
  alertDigestWindowLabel,
  alertKindLabel,
  findDeskMeta,
  formatAlertThreshold,
  formatCollectiblePrice,
  formatDateTime,
  formatTickerPrice,
  formatTradePrice,
  handleInteractiveKey,
  humanizeStatus,
  labelDesk,
  labelRegion,
  marketModeLabel,
  openExternal,
  positiveTone,
  providerLabel,
  statusTone,
  subscriptionTierLabel,
  venueDetailLabel,
} from "../appUtils";
import { resolveExchangeRate } from "../v3/valuation/exchangeRate";
import {
  EmptyState,
  WorkspaceCommandBar,
  WorkspaceHero,
  WorkspaceSectionBar,
} from "./appShell";
import {
  buildPrimaryLaunchDefinitions,
  buildSecondaryLaunchDefinitions,
} from "../serviceRegistry";
import {
  ConnectorCard,
  PositionDetailCard,
  TradeCollectibleCard,
  AlphaSignalBadges,
} from "./workspaceCards";
import { summarizeBrickAlphaPortfolio } from "../brickAlphaModel";
import { summarizeOpenCollection } from "../v3/collection/ownershipModel";
import { HomeExecutiveDashboard } from "./homeExecutiveDashboard";
import { InvestmentAnalysisWorkspace } from "./investmentAnalysisWorkspace";
import { RetirementIntelligenceWorkspace } from "./retirementIntelligenceWorkspace";
import { PortfolioIntelligenceWorkspace } from "./portfolioIntelligenceWorkspace";
import { ScanEvaluateWorkspace } from "./scanEvaluateWorkspace";

function numberOrZero(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function average(values) {
  const safeValues = values.map(numberOrZero).filter((value) => Number.isFinite(value));
  if (!safeValues.length) {
    return 0;
  }
  return safeValues.reduce((sum, value) => sum + value, 0) / safeValues.length;
}

function previousUtcDateKey(dateKey) {
  const utcMs = Date.parse(`${dateKey}T00:00:00Z`);
  if (!Number.isFinite(utcMs)) {
    return null;
  }
  return new Date(utcMs - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function buildBestWeekActivityCount(activeDates) {
  const ordered = Array.from(new Set(activeDates || []))
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value)))
    .sort();

  if (!ordered.length) {
    return 0;
  }

  const activeSet = new Set(ordered);
  let best = 0;

  ordered.forEach((dateKey) => {
    let cursor = dateKey;
    let count = 0;

    for (let index = 0; index < 7 && cursor; index += 1) {
      if (activeSet.has(cursor)) {
        count += 1;
      }
      cursor = previousUtcDateKey(cursor);
    }

    best = Math.max(best, count);
  });

  return best;
}

function reportDeskKeyForTrade(trade) {
  if (trade?.assetClass === "collectible") {
    return "collectibles";
  }

  const source = String(trade?.desk || trade?.marketTicker || trade?.ticker || "").toUpperCase();
  if (source.includes("USDZAR") || source.includes("EURUSD")) {
    return "forex";
  }
  if (source.includes("SPY") || source.includes("QQQ") || source.includes("GLD")) {
    return "etfs";
  }
  if (source.includes("BTC")) {
    return "crypto";
  }
  if (source.includes("JSE")) {
    return "jse";
  }
  return "forex";
}

function reportDeskLabel(deskKey) {
  if (deskKey === "collectibles") {
    return "LEGO Investments";
  }

  return labelDesk(deskKey);
}

function formatSignedPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "--";
  }

  return `${numeric >= 0 ? "+" : ""}${numeric.toFixed(2)}%`;
}

function formatScore(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${Math.round(numeric)}/100` : "--";
}

function countPortfolioRecommendations(holdings) {
  const counts = { strongBuy: 0, buy: 0, hold: 0, sell: 0, other: 0 };

  holdings.forEach((item) => {
    const recommendation = item.recommendation || "Hold";
    if (recommendation === "Strong Buy") {
      counts.strongBuy += 1;
    } else if (recommendation === "Buy") {
      counts.buy += 1;
    } else if (recommendation === "Hold") {
      counts.hold += 1;
    } else if (recommendation === "Sell") {
      counts.sell += 1;
    } else {
      counts.other += 1;
    }
  });

  return counts;
}

function buildIntelligenceFeed({
  portfolioHoldings,
  alertItems,
  notificationItems,
  watchlistItems,
  jumpToPageSection,
  activeDesk,
}) {
  const items = [];
  const retirementStatuses = new Set(["Imminent", "Overdue", "Approaching"]);

  portfolioHoldings.forEach((holding) => {
    if (retirementStatuses.has(holding.retirementStatus)) {
      items.push({
        id: `retirement-${holding.id}`,
        type: "retirement",
        tone: holding.retirementStatus === "Overdue" ? "urgent" : "warning",
        label: "Retirement Alert",
        title: `${holding.label || holding.name}: ${holding.retirementStatus}`,
        detail:
          holding.sellByTargetDate || holding.expectedRetirementDate
            ? `Target ${holding.sellByTargetDate || holding.expectedRetirementDate}`
            : "Review retirement timeline and exit window.",
        onClick: () => jumpToPageSection("collectibles", "retirement-intelligence"),
      });
    }

    (holding.alphaSignals || []).forEach((signal) => {
      items.push({
        id: `alpha-${holding.id}-${signal}`,
        type: "alpha",
        tone: "accent",
        label: "Alpha Signal",
        title: signal,
        detail: `${holding.label || holding.name} · Score ${formatScore(holding.brickAlphaScore)}`,
        onClick: () => jumpToPageSection("collectibles", "investment-analysis"),
      });
    });

    if (holding.recommendation === "Strong Buy" || holding.recommendation === "Buy") {
      items.push({
        id: `recommendation-${holding.id}`,
        type: "recommendation",
        tone: holding.recommendation === "Strong Buy" ? "success" : "accent",
        label: holding.recommendation,
        title: holding.label || holding.name,
        detail: `Brick Alpha ${formatScore(holding.brickAlphaScore)} · ${holding.investmentGrade || "Portfolio holding"}`,
        onClick: () => jumpToPageSection("portfolio", "open-positions"),
      });
    }
  });

  alertItems
    .filter((item) => item.triggered)
    .slice(0, 4)
    .forEach((item) => {
      items.push({
        id: `alert-${item.id}`,
        type: "alert",
        tone: "warning",
        label: "Alert Triggered",
        title: item.label,
        detail: `${labelDesk(item.desk)} · ${alertKindLabel(item.kind)} threshold crossed`,
        onClick: () => jumpToPageSection("signals", "chart-panel", item.desk || activeDesk),
      });
    });

  watchlistItems.slice(0, 3).forEach((item) => {
    items.push({
      id: `watchlist-${item.id}`,
      type: "watchlist",
      tone: "neutral",
      label: "Watchlist",
      title: item.label,
      detail: `${labelDesk(item.desk)} · ${item.action || "Monitoring"} setup saved`,
      onClick: () => jumpToPageSection("signals", "chart-panel", item.desk || activeDesk),
    });
  });

  notificationItems
    .filter((item) => item.status === "unread")
    .slice(0, 3)
    .forEach((item) => {
      items.push({
        id: `notification-${item.id}`,
        type: "notification",
        tone: "neutral",
        label: "Inbox",
        title: item.title,
        detail: item.message,
        onClick: () => jumpToPageSection("home", "home-watchlist", activeDesk),
      });
    });

  if (!items.length) {
    items.push({
      id: "empty-feed",
      type: "empty",
      tone: "neutral",
      label: "Intelligence",
      title: "Portfolio intelligence is warming up",
      detail: "Add LEGO investment positions to unlock retirement alerts, alpha signals, and recommendation insights.",
      onClick: () => jumpToPageSection("collectibles", "collectibles-grid"),
    });
  }

  return items.slice(0, 12);
}

function buildPerformancePoints(trades) {
  let cumulative = 0;

  return trades
    .slice()
    .sort(
      (left, right) =>
        new Date(left.closedAt || left.updatedAt || left.createdAt || 0).getTime() -
        new Date(right.closedAt || right.updatedAt || right.createdAt || 0).getTime(),
    )
    .slice(-12)
    .map((trade, index) => {
      cumulative += numberOrZero(trade.pnl);

      return {
        id: trade.id || `${trade.ticker || "trade"}-${index}`,
        label: trade.ticker || trade.marketTicker || `Trade ${index + 1}`,
        shortLabel: String(trade.ticker || trade.marketTicker || `T${index + 1}`).slice(0, 8),
        value: Number(cumulative.toFixed(2)),
        raw: numberOrZero(trade.pnl),
      };
    });
}

function buildDeskExposureItems(trades) {
  const buckets = new Map();

  trades.forEach((trade) => {
    const deskKey = reportDeskKeyForTrade(trade);
    const existing = buckets.get(deskKey) || { label: reportDeskLabel(deskKey), value: 0, pnl: 0 };
    existing.value += 1;
    existing.pnl += numberOrZero(trade.pnl);
    buckets.set(deskKey, existing);
  });

  return Array.from(buckets.entries())
    .map(([deskKey, bucket]) => ({
      id: deskKey,
      label: bucket.label,
      value: bucket.value,
      meta: formatSignedPercent(bucket.pnl),
    }))
    .sort((left, right) => right.value - left.value);
}

function buildSignalDeskItems(signals) {
  const buckets = new Map();

  signals.forEach((signal) => {
    const existing = buckets.get(signal.desk) || {
      label: labelDesk(signal.desk),
      count: 0,
      confidenceTotal: 0,
      rsiTotal: 0,
    };
    existing.count += 1;
    existing.confidenceTotal += numberOrZero(signal.confidence);
    existing.rsiTotal += numberOrZero(signal.rsi);
    buckets.set(signal.desk, existing);
  });

  return Array.from(buckets.entries())
    .map(([deskKey, bucket]) => ({
      id: deskKey,
      label: bucket.label,
      value: Number((bucket.confidenceTotal / Math.max(bucket.count, 1)).toFixed(1)),
      meta: `${Number((bucket.rsiTotal / Math.max(bucket.count, 1)).toFixed(1))} RSI avg`,
    }))
    .sort((left, right) => right.value - left.value);
}

function buildActionMixItems(signals) {
  const counts = signals.reduce(
    (accumulator, signal) => {
      const action = String(signal.action || "HOLD").toUpperCase();
      if (action === "BUY") {
        accumulator.buy += 1;
      } else if (action === "SELL") {
        accumulator.sell += 1;
      } else {
        accumulator.hold += 1;
      }
      return accumulator;
    },
    { buy: 0, sell: 0, hold: 0 },
  );

  return [
    { id: "buy", label: "Buy", value: counts.buy, meta: "Signals backing upside" },
    { id: "sell", label: "Sell", value: counts.sell, meta: "Signals pressing downside" },
    { id: "hold", label: "Hold", value: counts.hold, meta: "Signals still waiting" },
  ];
}

function buildExecutionModeItems(trades) {
  const counts = trades.reduce(
    (accumulator, trade) => {
      if (trade.executionMode === "live") {
        accumulator.live += 1;
      } else {
        accumulator.paper += 1;
      }
      return accumulator;
    },
    { live: 0, paper: 0 },
  );

  return [
    { id: "paper", label: "Paper", value: counts.paper, meta: "Simulated routing" },
    { id: "live", label: "Live", value: counts.live, meta: "Venue-backed routing" },
  ];
}

function ReportLineChart({ points }) {
  if (!points.length) {
    return (
      <div className="reportChartEmpty">
        <strong>No performance curve yet</strong>
        <small>Closed and open trades will start drawing this line once the book has some history.</small>
      </div>
    );
  }

  const width = 320;
  const height = 164;
  const padding = 18;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1);

  const chartPoints = points.map((point, index) => {
    const x =
      padding +
      (index / Math.max(points.length - 1, 1)) * (width - padding * 2);
    const y = height - padding - ((point.value - min) / span) * (height - padding * 2);
    return { ...point, x, y };
  });

  const linePath = chartPoints.map((point) => `${point.x},${point.y}`).join(" ");
  const areaPath = [
    `${padding},${height - padding}`,
    ...chartPoints.map((point) => `${point.x},${point.y}`),
    `${chartPoints.at(-1)?.x || width - padding},${height - padding}`,
  ].join(" ");

  return (
    <div className="reportChartShell">
      <svg viewBox={`0 0 ${width} ${height}`} className="reportLineSvg" role="img" aria-label="Performance curve">
        <defs>
          <linearGradient id="reportLineGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(74,139,255,0.38)" />
            <stop offset="100%" stopColor="rgba(74,139,255,0)" />
          </linearGradient>
        </defs>
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} className="reportAxisLine" />
        <line
          x1={padding}
          y1={height - padding}
          x2={width - padding}
          y2={height - padding}
          className="reportAxisLine"
        />
        <polygon points={areaPath} fill="url(#reportLineGradient)" />
        <polyline points={linePath} className="reportLinePath" />
        {chartPoints.map((point) => (
          <circle key={point.id} cx={point.x} cy={point.y} r="3.5" className="reportLinePoint" />
        ))}
      </svg>

      <div className="reportAxisRow">
        {chartPoints.map((point) => (
          <span key={point.id}>{point.shortLabel}</span>
        ))}
      </div>
    </div>
  );
}

function ReportBarList({ items, valueFormatter = (value) => value }) {
  const max = Math.max(...items.map((item) => numberOrZero(item.value)), 1);

  return (
    <div className="reportBarList">
      {items.map((item) => (
        <div className="reportBarRow" key={item.id}>
          <div className="reportBarMeta">
            <div>
              <strong>{item.label}</strong>
              {item.meta ? <small>{item.meta}</small> : null}
            </div>
            <span>{valueFormatter(item.value)}</span>
          </div>
          <div className="reportBarTrack">
            <div
              className={`reportBarFill ${item.tone || ""}`.trim()}
              style={{ width: `${(numberOrZero(item.value) / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function HomeScreen({
  activeDesk,
  activePageSections,
  alertsResponse,
  appSettings,
  closedTrades,
  collectiblesResponse,
  connectedProviderCount,
  feedbackResponse,
  health,
  jumpToPageSection,
  liveReadyDeskCount,
  markAllNotificationsRead,
  markNotificationRead,
  navigateToPage,
  newsResponse,
  notificationsResponse,
  onOpenWatchlistSignal,
  onRemoveAlertRule,
  onRemoveWatchlistItem,
  onToggleAlertRule,
  openTrades,
  routineResponse,
  routineStatus,
  dismissRoutineReminder,
  acknowledgeRoutineCompletion,
  setRoutineMode,
  resetRoutine,
  setRoutineStep,
  shareStatus,
  signalsResponse,
  totalOpenPnl,
  watchlistBusyKey,
  watchlistResponse,
  watchlistStatus,
}) {
  const feedbackSummary = feedbackResponse.summary || {};
  const allSignals = signalsResponse.signals || [];
  const leadSignal = signalsResponse.leadSignal;
  const leadNewsItem = newsResponse.items?.[0] || null;
  const latestFeedbackItem = feedbackResponse.items?.[0] || null;
  const latestOpenTrade = openTrades?.[0] || null;
  const shareIsLive = shareStatus?.status === "live" && shareStatus?.publicUrl;
  const watchlistItems = watchlistResponse.items || [];
  const alertItems = alertsResponse.items || [];
  const alertSummary = alertsResponse.summary || {};
  const currentAlertPlan =
    ALERT_SUBSCRIPTION_OPTIONS.find(
      (option) => option.id === (alertSummary.subscriptionTier || appSettings.subscriptionTier || "starter"),
    ) || ALERT_SUBSCRIPTION_OPTIONS[0];
  const nextAlertPlan =
    currentAlertPlan.id === "starter"
      ? ALERT_SUBSCRIPTION_OPTIONS.find((option) => option.id === "pro")
      : currentAlertPlan.id === "pro"
        ? ALERT_SUBSCRIPTION_OPTIONS.find((option) => option.id === "elite")
        : null;
  const notificationItems = notificationsResponse.items || [];
  const notificationSummary = notificationsResponse.summary || {};
  const routineCompletedIds = routineResponse.completedStepIds || [];
  const routineStreakCount = Number(routineResponse.streakCount || 0);
  const routineBestStreakCount = Number(routineResponse.bestStreakCount || 0);
  const routineWeekActiveCount = Number(routineResponse.weekActiveCount || 0);
  const routineSessionMode = String(routineResponse.sessionMode || "morning");
  const routineCompletedAt = routineResponse.completedAt || null;
  const routineIsComplete = Boolean(routineResponse.isComplete);
  const routineCurrentDate = routineResponse.currentDate || null;
  const routineReminderDismissedDate = routineResponse.reminderDismissedDate || null;
  const routineCompletionAcknowledgedDate = routineResponse.completionAcknowledgedDate || null;
  const routinePreferences = appSettings.routinePreferences || {};
  const routineActivityDates = useMemo(
    () =>
      (routineResponse.activeDates || []).slice(0, 6).map((dateKey) => {
        const formatted = new Intl.DateTimeFormat("en-ZA", {
          month: "short",
          day: "numeric",
          timeZone: appSettings.timezone,
        }).format(new Date(`${dateKey}T12:00:00Z`));
        return {
          id: dateKey,
          dateKey,
          formatted,
          isToday: dateKey === routineCurrentDate,
        };
      }),
    [appSettings.timezone, routineCurrentDate, routineResponse.activeDates],
  );
  const routineBestWeekCount = useMemo(
    () => buildBestWeekActivityCount(routineResponse.activeDates || []),
    [routineResponse.activeDates],
  );
  const routineWeekEntries = useMemo(() => {
    if (!routineCurrentDate) {
      return [];
    }

    const activeSet = new Set(routineResponse.activeDates || []);
    const entries = [];
    let cursor = routineCurrentDate;

    for (let index = 0; index < 7 && cursor; index += 1) {
      const date = new Date(`${cursor}T12:00:00Z`);
      entries.push({
        id: cursor,
        dateKey: cursor,
        shortLabel: new Intl.DateTimeFormat("en-ZA", {
          weekday: "short",
          timeZone: appSettings.timezone,
        })
          .format(date)
          .slice(0, 3)
          .toUpperCase(),
        dayLabel: new Intl.DateTimeFormat("en-ZA", {
          day: "numeric",
          month: "short",
          timeZone: appSettings.timezone,
        }).format(date),
        active: activeSet.has(cursor),
        isToday: cursor === routineCurrentDate,
      });
      cursor = previousUtcDateKey(cursor);
    }

    return entries.reverse();
  }, [appSettings.timezone, routineCurrentDate, routineResponse.activeDates]);
  const routineCadenceReview = useMemo(() => {
    if (!routineActivityDates.length) {
      return {
        label: "Starting out",
        detail: "The routine layer is ready. A few completed sessions will start turning this into a real usage rhythm.",
      };
    }

    if (routineWeekActiveCount >= 5 || routineBestStreakCount >= 5) {
      return {
        label: "Strong rhythm",
        detail: "Usage is starting to look sticky. The user is returning often enough for the product to become part of a real workflow.",
      };
    }

    if (routineWeekActiveCount >= 3 || routineStreakCount >= 3) {
      return {
        label: "Building well",
        detail: "There is repeat behaviour here. The next job is to keep the daily brief, alerts, and research worth opening every session.",
      };
    }

    return {
      label: "Early pattern",
      detail: "The habit loop is forming, but it still needs a little more pull from alerts, review, and subscriber value.",
    };
  }, [routineActivityDates.length, routineBestStreakCount, routineStreakCount, routineWeekActiveCount]);
  const strongestSignal =
    allSignals
      .slice()
      .sort((left, right) => numberOrZero(right.confidence) - numberOrZero(left.confidence))[0] ||
    leadSignal ||
    null;
  const executionProfiles = appSettings.executionProfiles || DEFAULT_EXECUTION_PROFILES;
  const deskPulseCards = ["forex", "crypto", "etfs", "jse"].map((deskKey) => {
    const signal =
      allSignals.find((item) => item.desk === deskKey) ||
      (strongestSignal?.desk === deskKey ? strongestSignal : null);

    return {
      deskKey,
      label: labelDesk(deskKey),
      signal,
      routeMode: marketModeLabel(executionProfiles?.[deskKey]?.mode || "paper"),
    };
  });
  const sessionReadinessScore = Math.max(
    48,
    Math.min(
      99,
      Math.round(
        average([
          shareIsLive ? 100 : 72,
          liveReadyDeskCount ? (liveReadyDeskCount / 4) * 100 : 35,
          connectedProviderCount ? Math.min(connectedProviderCount * 22, 100) : 28,
          strongestSignal ? numberOrZero(strongestSignal.confidence) : 42,
          openTrades.length ? 88 : 58,
        ]),
      ),
    ),
  );
  const serviceLaunchDefinitions = buildPrimaryLaunchDefinitions(activeDesk);
  const supportLaunchDefinitions = buildSecondaryLaunchDefinitions(activeDesk);
  const launchMetaById = {
    news: {
      metaLabel: "Lead source",
      metaValue: leadNewsItem?.sourceName || "Waiting",
    },
    trading: {
      metaLabel: "Lead setup",
      metaValue: leadSignal ? `${leadSignal.action} ${leadSignal.label}` : "No setup yet",
    },
    crypto: {
      metaLabel: "Lead setup",
      metaValue: leadSignal?.desk === "crypto" ? `${leadSignal.action} ${leadSignal.label}` : "Crypto lane ready",
    },
    collectibles: {
      metaLabel: "Holdings",
      metaValue: `${collectiblesResponse.items?.length || 0} items`,
    },
    portfolio: {
      metaLabel: "Open positions",
      metaValue: `${openTrades.length}`,
    },
    reports: {
      metaLabel: "Report mode",
      metaValue: "Graphs ready",
    },
    subscriptions: {
      metaLabel: "Current plan",
      metaValue: subscriptionTierLabel(appSettings.subscriptionTier),
    },
    tools: {
      metaLabel: "Research notes",
      metaValue: "Desk-linked",
    },
    connections: {
      metaLabel: "Configured",
      metaValue: `${connectedProviderCount} providers`,
    },
    settings: {
      metaLabel: "Region",
      metaValue: appSettings.preferredRegion || "South Africa",
    },
  };
  const buildLaunchCard = (definition) => ({
    id: definition.id,
    label: definition.title,
    glyph: definition.glyph,
    hint: definition.homeHint,
    action: () =>
      jumpToPageSection(
        definition.selection.page,
        definition.selection.sectionId,
        definition.selection.desk || activeDesk,
      ),
    metaLabel: launchMetaById[definition.id]?.metaLabel || "Ready",
    metaValue: launchMetaById[definition.id]?.metaValue || "Open",
  });
  const launchCards = serviceLaunchDefinitions.map(buildLaunchCard);
  const supportLaunchCards = supportLaunchDefinitions.map(buildLaunchCard);
  const _homeActions = [
    {
      id: "holdings",
      label: "View Holdings",
      meta: `${openTrades.filter((trade) => trade.assetClass === "collectible").length} open`,
      detail: "Review live LEGO investment positions and current book exposure.",
      onClick: () => jumpToPageSection("portfolio", "open-positions"),
    },
    {
      id: "performance",
      label: "Portfolio Performance",
      meta: formatCollectiblePrice(
        summarizeBrickAlphaPortfolio([...openTrades, ...(closedTrades || [])]).netAssetValue,
      ),
      detail: "Open NAV, gains, theme allocation, and collection grade rollups.",
      onClick: () => jumpToPageSection("portfolio", "portfolio-dashboard"),
    },
    {
      id: "investments",
      label: "LEGO Investments",
      meta: `${collectiblesResponse.items?.length || 0} catalog`,
      detail: "Research holdings, scores, and the investment decision engine.",
      onClick: () => jumpToPageSection("collectibles", "investment-analysis"),
    },
    {
      id: "research",
      label: "Research Center",
      meta: `${sessionReadinessScore}%`,
      detail: "Open performance graphs, desk exposure, and visual portfolio review.",
      onClick: () => jumpToPageSection("reports", "reports-performance", activeDesk),
    },
    {
      id: "subscriptions",
      label: "Subscriptions",
      meta: subscriptionTierLabel(appSettings.subscriptionTier),
      detail: "Review tiers, premium value, and the alert plan story clients will pay for.",
      onClick: () => jumpToPageSection("subscriptions", "subscriptions-overview", activeDesk),
    },
  ];
    const routineModeMeta = {
      morning: {
        label: "Morning brief",
        shortLabel: "Morning",
        detail: "Start with macro context, the lead signal, and the first return path for the day.",
        primaryCta: "Open News",
        primaryAction: () => jumpToPageSection("news", "macro-feed", activeDesk),
      },
      live: {
        label: "Live desk",
        shortLabel: "Live",
        detail: "Stay close to alerts, structure, and the next clean execution window while the desk is active.",
        primaryCta: "Open Trade",
        primaryAction: () => jumpToPageSection("signals", "chart-panel", activeDesk),
      },
      review: {
        label: "Close review",
        shortLabel: "Review",
        detail: "Wrap the session with research, portfolio attention, and a calmer end-of-day check.",
        primaryCta: "Open Research Center",
        primaryAction: () => jumpToPageSection("reports", "reports-performance", activeDesk),
      },
    };
    const routineModeOrder = {
      morning: ["macro", "signal", "watchlist", "alerts", "reports", "subscriptions"],
      live: ["signal", "alerts", "watchlist", "macro", "reports", "subscriptions"],
      review: ["reports", "alerts", "signal", "macro", "watchlist", "subscriptions"],
    };
    const workflowSteps = [
      {
        id: "macro",
        ordinal: "01",
        title: "Read the macro tape",
        detail: leadNewsItem?.title || "Open the macro feed and anchor the next decision in current context.",
        complete: Boolean(leadNewsItem),
        cta: "Open News",
        onClick: () => jumpToPageSection("news", "macro-feed", activeDesk),
      },
      {
        id: "signal",
        ordinal: "02",
        title: "Review the lead signal",
        detail: strongestSignal
          ? `${strongestSignal.label} is leading at ${strongestSignal.confidence}% confidence.`
          : "Open the trade desk when the engine promotes the next clean setup.",
        complete: Boolean(strongestSignal),
        cta: "Open Trade",
        onClick: () => jumpToPageSection("signals", "chart-panel", strongestSignal?.desk || activeDesk),
      },
      {
        id: "watchlist",
        ordinal: "03",
        title: "Build the return path",
        detail: watchlistItems.length
          ? `${watchlistItems.length} watchlist items are already saving useful return points.`
          : "Save at least one instrument so the app starts behaving like a daily service, not just a screen you visit once.",
        complete: watchlistItems.length > 0,
        cta: "Review Watchlist",
        onClick: () => jumpToPageSection("home", "home-watchlist", activeDesk),
      },
      {
        id: "alerts",
        ordinal: "04",
        title: "Arm alert coverage",
        detail:
          alertSummary.enabled > 0
            ? `${alertSummary.enabled} live alerts are active across the desk.`
            : "Set breakout or RSI alerts so Brick Alpha can pull the user back in at the right moment.",
        complete: (alertSummary.enabled || 0) > 0,
        cta: "Open Alerts",
        onClick: () => jumpToPageSection("settings", "alerts-plan", activeDesk),
      },
      {
        id: "reports",
        ordinal: "05",
        title: "Review research and performance",
        detail:
          openTrades.length > 0
            ? `${openTrades.length} open positions are already feeding the research layer.`
            : "Open the research center and keep the analytics story visible even before the book gets deeper.",
        complete: openTrades.length > 0,
        cta: "Open Research Center",
        onClick: () => jumpToPageSection("reports", "reports-performance", activeDesk),
      },
      {
        id: "subscriptions",
        ordinal: "06",
        title: "Check premium value",
        detail:
          currentAlertPlan.id !== "starter"
            ? `${subscriptionTierLabel(currentAlertPlan.id)} is already active, so the premium path is visible in the app.`
            : "Open subscriptions and see how plans, alerts, research, and the daily brief connect into a paid product story.",
        complete: currentAlertPlan.id !== "starter",
        cta: "Open Plans",
        onClick: () => navigateToPage("subscriptions", false, activeDesk),
      },
    ].map((step) => ({
      ...step,
      completed: routineCompletedIds.includes(step.id),
    }));
    const workflowCompleted = workflowSteps.filter((step) => step.completed).length;
    const workflowProgress = Math.round((workflowCompleted / workflowSteps.length) * 100);
    const weeklyRoutineScore = useMemo(() => {
      const weeklyCoverage = (routineWeekActiveCount / 7) * 100;
      const bestWeekCoverage = (routineBestWeekCount / 7) * 100;
      const currentRunValue = Math.min(routineStreakCount * 18, 100);
      const bestRunValue = Math.min(routineBestStreakCount * 14, 100);
      const completionValue = routineIsComplete ? 100 : workflowProgress;

      return Math.max(
        18,
        Math.min(
          99,
          Math.round(
            average([weeklyCoverage, bestWeekCoverage, currentRunValue, bestRunValue, completionValue]),
          ),
        ),
      );
    }, [
      routineBestStreakCount,
      routineBestWeekCount,
      routineIsComplete,
      routineStreakCount,
      routineWeekActiveCount,
      workflowProgress,
    ]);
    const weeklyRoutineScoreLabel =
      weeklyRoutineScore >= 85
        ? "Elite rhythm"
        : weeklyRoutineScore >= 65
          ? "Consistent"
          : weeklyRoutineScore >= 45
            ? "Developing"
            : "Starting";
    const weeklyRoutineInsight =
      weeklyRoutineScore >= 85
        ? "This is the kind of repeat engagement that turns Brick Alpha into a daily service people rely on, not just a tool they remember occasionally."
        : weeklyRoutineScore >= 65
          ? "The habit loop is working. Alerts, the daily brief, and workflow memory are doing enough to keep the user coming back with purpose."
          : weeklyRoutineScore >= 45
            ? "There is a real usage pattern forming here. The next job is to keep the premium touchpoints strong enough that routine becomes expectation."
            : "The workflow is still early. The app needs a little more pull from alerts, research, and visible value to become part of the user's weekly rhythm.";
    const preferredWorkflowOrder = routineModeOrder[routineSessionMode] || routineModeOrder.morning;
    const nextWorkflowStep =
      preferredWorkflowOrder
        .map((stepId) => workflowSteps.find((step) => step.id === stepId))
        .find((step) => step && !step.completed) ||
      workflowSteps[workflowSteps.length - 1];
    const activeRoutineMode = routineModeMeta[routineSessionMode] || routineModeMeta.morning;
    const completedAtLabel = routineCompletedAt
      ? formatDateTime(routineCompletedAt, appSettings.timezone)
      : null;
    const nudgeWindow = routinePreferences.nudgeWindow || "active";
    const incompleteStepCount = workflowSteps.length - workflowCompleted;
    const reminderShouldSurface =
      nudgeWindow === "quiet"
        ? incompleteStepCount >= 3
        : nudgeWindow === "focused"
          ? incompleteStepCount >= 2
          : incompleteStepCount >= 1;
    const showRoutineReminder =
      routinePreferences.remindersEnabled !== false &&
      !routineIsComplete &&
      routineReminderDismissedDate !== routineCurrentDate &&
      reminderShouldSurface;
    const showRoutineCelebration =
      routinePreferences.celebrationEnabled !== false &&
      routineIsComplete &&
      routineCompletionAcknowledgedDate !== routineCurrentDate;
    const briefCards = [
      {
        id: "market-posture",
        label: "Market posture",
        value: strongestSignal ? `${strongestSignal.action} ${strongestSignal.label}` : "Stand by",
        detail: strongestSignal
          ? `${strongestSignal.confidence}% confidence | ${strongestSignal.setup}`
          : "The next clean setup will surface here once the desk settles.",
      },
      {
        id: "macro-watch",
        label: "Macro watch",
        value: leadNewsItem?.sourceName || "Tape warming up",
        detail:
          leadNewsItem?.title ||
          "The lead macro line will sit here once the news feed refreshes.",
      },
      {
        id: "alerts",
        label: "Alert pressure",
        value: `${alertSummary.triggered || 0} live | ${notificationSummary.unread || 0} unread`,
        detail:
          alertSummary.triggered || notificationSummary.unread
            ? "There is fresh alert activity worth checking before you route the next move."
            : "No urgent alert pressure right now. The book is calm.",
      },
      {
        id: "portfolio",
        label: "Portfolio attention",
        value: latestOpenTrade?.marketLabel || latestOpenTrade?.label || "No open positions",
        detail: latestOpenTrade
          ? `${latestOpenTrade.side} | ${latestOpenTrade.executionLabel || "Paper"} | ${formatDateTime(
              latestOpenTrade.updatedAt || latestOpenTrade.createdAt,
              appSettings.timezone,
            )}`
          : "No active position needs attention yet.",
      },
    ];
    const dailyBriefText = [
      `Brick Alpha daily brief | ${formatDateTime(new Date().toISOString(), appSettings.timezone)}`,
      "",
      `Desk focus: ${labelDesk(activeDesk)}`,
      `Routine mode: ${activeRoutineMode.label}`,
      `Market posture: ${strongestSignal ? `${strongestSignal.action} ${strongestSignal.label} at ${strongestSignal.confidence}% confidence` : "Waiting for the next clean setup"}`,
      `Macro watch: ${leadNewsItem?.sourceName || "Waiting"}${leadNewsItem?.title ? ` | ${leadNewsItem.title}` : ""}`,
      `Alerts: ${alertSummary.triggered || 0} triggered, ${notificationSummary.unread || 0} unread, ${alertSummary.enabled || 0} active`,
      `Portfolio: ${openTrades.length} open positions${Number.isFinite(totalOpenPnl) ? ` | ${totalOpenPnl >= 0 ? "+" : ""}${totalOpenPnl.toFixed(2)}% live PnL` : ""}`,
      `Readiness: ${sessionReadinessScore}%`,
    ].join("\n");
    const copyDailyBrief = async () => {
      if (!navigator.clipboard?.writeText) {
        return;
      }

      try {
        await navigator.clipboard.writeText(dailyBriefText);
      } catch {
        // Ignore clipboard errors; the brief is still visible on screen.
      }
    };

  const brickAlphaPortfolio = useMemo(
    () => summarizeOpenCollection([...openTrades, ...(closedTrades || [])]),
    [closedTrades, openTrades],
  );
  const portfolioHoldings = useMemo(
    () => openTrades.filter((trade) => trade.assetClass === "collectible"),
    [openTrades],
  );
  const recommendationCounts = useMemo(
    () => countPortfolioRecommendations(portfolioHoldings),
    [portfolioHoldings],
  );
  const retirementAlerts = useMemo(
    () =>
      portfolioHoldings.filter((holding) =>
        ["Imminent", "Overdue", "Approaching"].includes(holding.retirementStatus),
      ),
    [portfolioHoldings],
  );
  const intelligenceFeed = useMemo(
    () =>
      buildIntelligenceFeed({
        portfolioHoldings,
        alertItems,
        notificationItems,
        watchlistItems,
        jumpToPageSection,
        activeDesk,
      }),
    [activeDesk, alertItems, jumpToPageSection, notificationItems, portfolioHoldings, watchlistItems],
  );
  const unrealizedGainPercent = brickAlphaPortfolio.costBasis
    ? (brickAlphaPortfolio.unrealizedGain / brickAlphaPortfolio.costBasis) * 100
    : null;
  const themeAllocationRows = brickAlphaPortfolio.themeAllocation?.breakdown || [];
  const strongBuyOpportunities = useMemo(() => {
    const catalog = collectiblesResponse.items || [];
    const heldIds = new Set(
      portfolioHoldings.map((holding) => holding.collectibleId || holding.catalogId || holding.id),
    );
    const fromPortfolio = portfolioHoldings
      .filter((holding) => holding.recommendation === "Strong Buy")
      .map((holding) => ({
        id: `held-${holding.id}`,
        label: holding.label || holding.name,
        brickAlphaScore: holding.brickAlphaScore,
        theme: holding.theme,
        investmentGrade: holding.investmentGrade,
        source: "portfolio",
      }));
    const fromCatalog = catalog
      .filter((item) => item.recommendation === "Strong Buy" && !heldIds.has(item.id))
      .slice(0, 4)
      .map((item) => ({
        id: `catalog-${item.id}`,
        label: item.name || item.label,
        brickAlphaScore: item.brickAlphaScore,
        theme: item.theme,
        investmentGrade: item.investmentGrade,
        source: "catalog",
      }));
    return [...fromPortfolio, ...fromCatalog].slice(0, 5);
  }, [collectiblesResponse.items, portfolioHoldings]);
  const marketIntelligence = useMemo(
    () =>
      (newsResponse.items || []).slice(0, 3).map((item, index) => ({
        id: item.id || `news-${index}`,
        title: item.title,
        sourceName: item.sourceName,
      })),
    [newsResponse.items],
  );
  const aiSummary = useMemo(() => {
    const segments = [];
    if (brickAlphaPortfolio.netAssetValue) {
      segments.push(
        `Your LEGO portfolio is valued at ${formatCollectiblePrice(brickAlphaPortfolio.netAssetValue)}`,
      );
    }
    if (unrealizedGainPercent != null) {
      segments.push(
        `with ${unrealizedGainPercent >= 0 ? "+" : ""}${unrealizedGainPercent.toFixed(1)}% unrealised growth`,
      );
    }
    if (brickAlphaPortfolio.collectionGrade) {
      segments.push(`Collection grade ${brickAlphaPortfolio.collectionGrade}`);
    }
    if (brickAlphaPortfolio.averageBrickAlphaScore) {
      segments.push(`Brick Alpha score ${formatScore(brickAlphaPortfolio.averageBrickAlphaScore)}`);
    }
    if (retirementAlerts.length) {
      segments.push(
        `${retirementAlerts.length} set${retirementAlerts.length === 1 ? "" : "s"} need retirement attention`,
      );
    }
    if (strongBuyOpportunities.length) {
      segments.push(
        `${strongBuyOpportunities.length} strong buy opportunit${strongBuyOpportunities.length === 1 ? "y" : "ies"} identified`,
      );
    }
    if (leadNewsItem?.title) {
      segments.push(`Market watch: ${leadNewsItem.title}`);
    }
    return segments.length
      ? `${segments.join(". ")}.`
      : "Add LEGO investment positions to unlock personalised portfolio intelligence and buy recommendations.";
  }, [
    brickAlphaPortfolio,
    leadNewsItem,
    retirementAlerts.length,
    strongBuyOpportunities.length,
    unrealizedGainPercent,
  ]);

  return (
    <>
      <HomeExecutiveDashboard
        aiSummary={aiSummary}
        appSettings={appSettings}
        brickAlphaPortfolio={brickAlphaPortfolio}
        jumpToPageSection={jumpToPageSection}
        marketIntelligence={marketIntelligence}
        portfolioHoldings={portfolioHoldings}
        retirementAlerts={retirementAlerts}
        strongBuyOpportunities={strongBuyOpportunities}
        unrealizedGainPercent={unrealizedGainPercent}
      />

      <div className="dashboardRelocatedArchive" hidden aria-hidden="true">
      <section className="executiveDashboard" id="home-dashboard-archive">
        <div className="executiveDashboardGrid">
          <div className="executiveDashboardPrimary">
            {themeAllocationRows.length ? (
              <section className="executiveThemePanel" id="home-theme-allocation">
                <div className="executivePanelHeader">
                  <div>
                    <h3>Theme Allocation</h3>
                    <p>Relocated to Portfolio — preserved for Investment Analysis migration.</p>
                  </div>
                </div>
                <div className="executiveThemeBars">
                  {themeAllocationRows.map((row) => (
                    <div className="executiveThemeBar" key={row.theme}>
                      <div className="executiveThemeBarTop">
                        <span>{row.theme}</span>
                        <strong>{row.actual.toFixed(1)}%</strong>
                      </div>
                      <div className="executiveThemeTrack" aria-hidden="true">
                        <div
                          className="executiveThemeFill"
                          style={{ width: `${Math.min(row.actual, 100)}%` }}
                        />
                      </div>
                      <small>
                        Target {row.target}% · {formatCollectiblePrice(row.value)}
                      </small>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="executiveRecommendationPanel" id="home-holdings-recommendations">
              <div className="executivePanelHeader">
                <div>
                  <h3>Holdings Recommendations</h3>
                  <p>Relocated — detailed counts move to Portfolio and Investment Analysis.</p>
                </div>
              </div>
              <div className="executiveRecommendationGrid">
                <div className="executiveRecommendationCard executiveRecommendationCard-strong">
                  <span>Strong Buy</span>
                  <strong>{recommendationCounts.strongBuy}</strong>
                </div>
                <div className="executiveRecommendationCard executiveRecommendationCard-buy">
                  <span>Buy</span>
                  <strong>{recommendationCounts.buy}</strong>
                </div>
                <div className="executiveRecommendationCard executiveRecommendationCard-hold">
                  <span>Hold</span>
                  <strong>{recommendationCounts.hold}</strong>
                </div>
              </div>
            </section>
          </div>

          <aside className="executiveDashboardFeed" id="home-intelligence-feed">
            <div className="executiveFeedHeader">
              <div>
                <h3>Intelligence Feed</h3>
                <p>Relocated to Investment Analysis — full per-set feed preserved below.</p>
              </div>
            </div>
            <div className="executiveFeedList">
              {intelligenceFeed.map((item) => (
                <div key={item.id} className={`executiveFeedItem executiveFeedItem-${item.tone}`}>
                  <strong>{item.title}</strong>
                  <small>{item.detail}</small>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </section>

      <details className="tradingToolsCollapse" id="home-trading-tools">
        <summary className="tradingToolsSummary">
          <span className="tradingToolsSummaryLabel">Trading Tools</span>
          <small>Signals, macro tape, workflow, launchpad, and session tools</small>
        </summary>
        <div className="tradingToolsBody">
      <section className="homeTodayStack" id="home-overview">
        <div className="homeTodayHeader">
          <div>
            <span>Today</span>
            <strong>{activeRoutineMode.label}</strong>
          </div>
          <div className="homeTodayScore">
            <span>Ready</span>
            <strong>{sessionReadinessScore}%</strong>
          </div>
        </div>

        <div className="homeTodayPrimary">
          <span>{strongestSignal ? `${strongestSignal.action} setup` : "Market watch"}</span>
          <strong>{strongestSignal?.headline || strongestSignal?.label || "Waiting for a clean setup"}</strong>
          <small>
            {strongestSignal
              ? `${labelDesk(strongestSignal.desk)} | RSI ${strongestSignal.rsi || "--"} | ${strongestSignal.confidence}% confidence`
              : "The app is monitoring the desk and will surface the next clean signal here."}
          </small>
        </div>

        <div className="homeTodayActionGrid">
          <button
            type="button"
            className="homeTodayAction"
            onClick={() => jumpToPageSection("news", "macro-feed", activeDesk)}
          >
            <span>01</span>
            <strong>News</strong>
            <small>{leadNewsItem?.sourceName || "Macro tape"}</small>
          </button>
          <button
            type="button"
            className="homeTodayAction"
            onClick={() => jumpToPageSection("signals", "chart-panel", strongestSignal?.desk || activeDesk)}
          >
            <span>02</span>
            <strong>Trade</strong>
            <small>{strongestSignal?.label || "Signal desk"}</small>
          </button>
          <button
            type="button"
            className="homeTodayAction"
            onClick={() => jumpToPageSection("portfolio", "open-positions")}
          >
            <span>03</span>
            <strong>Book</strong>
            <small>{openTrades.length} open</small>
          </button>
        </div>
      </section>

      <section className="homeCommandDeck">
        <article className="homeLeadPanel">
          <div className="homeLeadTop">
            <div>
              <span className="homePanelEyebrow">Today's best signal</span>
              <h2>{strongestSignal?.headline || strongestSignal?.label || "Waiting for the next clean setup"}</h2>
            </div>
            <div className="homeLeadStatus">
              <span>Confidence</span>
              <strong>{strongestSignal ? `${strongestSignal.confidence}%` : "--"}</strong>
            </div>
          </div>

          <div className="homeLeadMetaRow">
            <span className={`signalBadge ${actionTone(strongestSignal?.action || "HOLD")}`}>
              {strongestSignal?.action || "WAIT"}
            </span>
            <span className="signalMiniTag">{strongestSignal?.setup || "Signal engine"}</span>
            <span className="signalMiniTag">{strongestSignal?.anchorTrend || "Trend watch"}</span>
          </div>

          <p className="homeLeadSummary">
            {strongestSignal?.thesis ||
              "The desk is monitoring for the next clean structure break, retest, and execution window."}
          </p>

          <div className="homeLeadStats">
            <div className="homeLeadStat">
              <span>Instrument</span>
              <strong>{strongestSignal?.label || "Waiting"}</strong>
            </div>
            <div className="homeLeadStat">
              <span>Price</span>
              <strong>{strongestSignal ? formatTickerPrice(strongestSignal.ticker, strongestSignal.price) : "--"}</strong>
            </div>
            <div className="homeLeadStat">
              <span>RSI</span>
              <strong>{strongestSignal?.rsi || "--"}</strong>
            </div>
            <div className="homeLeadStat">
              <span>Exit rule</span>
              <strong>{strongestSignal?.exitRule || "Desk discipline"}</strong>
            </div>
          </div>

          <div className="homeLeadActions">
            <button
              type="button"
              className="primaryButton"
              onClick={() => jumpToPageSection("signals", "chart-panel", strongestSignal?.desk || activeDesk)}
            >
              Open Signal
            </button>
            <button
              type="button"
              className="ghostButton"
              onClick={() => jumpToPageSection("news", "macro-feed", strongestSignal?.desk || activeDesk)}
            >
              Read Macro Context
            </button>
          </div>
          </article>

        <div className="homePulseGrid">
          <button
            type="button"
            className="homePulseCard"
            onClick={() => jumpToPageSection("news", "macro-feed", activeDesk)}
          >
            <span>Macro pulse</span>
            <strong>{leadNewsItem?.sourceName || "Waiting for tape"}</strong>
            <small>{leadNewsItem?.title || "The lead headline will anchor the next move here."}</small>
          </button>

          <button
            type="button"
            className="homePulseCard"
            onClick={() => jumpToPageSection("portfolio", "open-positions")}
          >
            <span>Portfolio pulse</span>
            <strong className={positiveTone(totalOpenPnl)}>
              {Number.isFinite(totalOpenPnl) ? `${totalOpenPnl >= 0 ? "+" : ""}${totalOpenPnl.toFixed(2)}%` : "--"}
            </strong>
            <small>{openTrades.length} open positions in the current book.</small>
          </button>

          <button
            type="button"
            className="homePulseCard"
            onClick={() => jumpToPageSection("reports", "reports-performance", activeDesk)}
          >
            <span>Research pulse</span>
            <strong>{openTrades.length ? "Live curve" : "Analytics ready"}</strong>
            <small>Performance graphs, desk exposure, and signal pressure are live.</small>
          </button>

          <button
            type="button"
            className="homePulseCard"
            onClick={() => jumpToPageSection("connections", "connections-overview", activeDesk)}
          >
            <span>Readiness</span>
            <strong>{liveReadyDeskCount} live-ready desks</strong>
            <small>{signalsResponse.marketData?.provider || "Simulator"} is currently backing the desk.</small>
          </button>
        </div>

        <div className="homeDeskPulseGrid">
          {deskPulseCards.map((card) => (
            <button
              key={card.deskKey}
              type="button"
              className="homeDeskPulseCard"
              onClick={() =>
                jumpToPageSection(
                  card.deskKey === "forex" || card.deskKey === "crypto" || card.deskKey === "etfs" || card.deskKey === "jse"
                    ? "signals"
                    : "news",
                  "signals-grid",
                  card.deskKey,
                )
              }
            >
              <div className="homeDeskPulseTop">
                <span>{card.label}</span>
                <strong>{card.routeMode}</strong>
              </div>
              <div className="homeDeskPulseBody">
                <strong>{card.signal?.label || "Monitoring"}</strong>
                <small>
                  {card.signal
                    ? `${card.signal.action} | ${formatTickerPrice(card.signal.ticker, card.signal.price)} | RSI ${card.signal.rsi}`
                    : "No lead setup in this lane yet."}
                </small>
              </div>
            </button>
          ))}
        </div>
      </section>

      <div className="splitGrid">
        <section className="panel" id="home-launchpad">
          <div className="panelHeader">
            <div>
              <h2>Services</h2>
              <p>Open the exact service screen you want from the Dashboard.</p>
            </div>
            <div className="headerStatus">
              <span>Current desk</span>
              <strong>{labelDesk(activeDesk)}</strong>
            </div>
          </div>

          <div className="homeLaunchGrid">
            {launchCards.map((card) => (
              <button
                key={card.id}
                type="button"
                className="homeLaunchCard"
                onClick={card.action}
              >
                <div className="homeLaunchTop">
                  <span className="navGlyph">{card.glyph}</span>
                  <div className="homeLaunchCopy">
                    <strong>{card.label}</strong>
                    <small>{card.hint}</small>
                  </div>
                </div>
                <div className="homeLaunchMeta">
                  <span>{card.metaLabel}</span>
                  <strong>{card.metaValue}</strong>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="panel" id="home-brief">
          <div className="panelHeader">
            <div>
              <h2>Daily Brief</h2>
              <p>A premium subscriber-style summary of what matters now, what changed, and where to act next.</p>
            </div>
            <div className="headerStatus">
              <span>Desk focus</span>
              <strong>{labelDesk(activeDesk)}</strong>
            </div>
          </div>

          <div className="summaryGrid compactSummaryGrid">
            {briefCards.map((card) => (
              <article className="summaryCard" key={card.id}>
                <span>{card.label}</span>
                <strong>{card.value}</strong>
                <small>{card.detail}</small>
              </article>
            ))}
          </div>

          <div className="splitGrid">
            <section className="subPanel">
              <div className="panelHeader">
                <div>
                  <h3>Subscriber morning note</h3>
                  <p>This is the kind of short briefing a premium client should be able to skim in under a minute.</p>
                </div>
              </div>

              <div className="briefNoteCard">
                <strong>{strongestSignal?.headline || strongestSignal?.label || "The desk is waiting for the next clean setup."}</strong>
                <p>
                  {strongestSignal?.thesis ||
                    "No clean lead setup has broken away from the pack yet, so the brief stays in monitoring mode."}
                </p>
                <ul className="briefBulletList">
                  <li>
                    <strong>Macro:</strong> {leadNewsItem?.sourceName || "Waiting"}{leadNewsItem?.summary ? ` - ${leadNewsItem.summary}` : " - The tape is still warming up."}
                  </li>
                  <li>
                    <strong>Signals:</strong> {allSignals.length} visible setups, with {alertSummary.triggered || 0} currently lighting up active rules.
                  </li>
                  <li>
                    <strong>Book:</strong> {openTrades.length} open positions{Number.isFinite(totalOpenPnl) ? ` and ${totalOpenPnl >= 0 ? "+" : ""}${totalOpenPnl.toFixed(2)}% live PnL.` : "."}
                  </li>
                </ul>
              </div>

              <div className="panelActions">
                <button type="button" className="primaryButton" onClick={copyDailyBrief}>
                  Copy Daily Brief
                </button>
                <button
                  type="button"
                  className="ghostButton"
                  onClick={() => jumpToPageSection("signals", "chart-panel", strongestSignal?.desk || activeDesk)}
                >
                  Open Lead Signal
                </button>
              </div>
            </section>

            <section className="subPanel">
              <div className="panelHeader">
                <div>
                  <h3>Immediate next actions</h3>
                  <p>Keep the service side crisp: what the user should do next should never be a mystery.</p>
                </div>
              </div>

              <div className="watchlistStack">
                <article className="watchItemCard">
                  <div className="watchItemMain">
                    <div className="watchItemTop">
                      <span className="signalMiniTag">01</span>
                      <span className={`signalBadge ${actionTone(strongestSignal?.action || "HOLD")}`}>{strongestSignal?.action || "WAIT"}</span>
                    </div>
                    <strong>Open the highest-conviction setup</strong>
                    <small>
                      {strongestSignal
                        ? `${strongestSignal.label} is leading the desk at ${strongestSignal.confidence}% confidence.`
                        : "Wait for the next promoted lead signal before routing a trade."}
                    </small>
                  </div>
                </article>
                <article className="watchItemCard">
                  <div className="watchItemMain">
                    <div className="watchItemTop">
                      <span className="signalMiniTag">02</span>
                      <span className="signalMiniTag">MACRO</span>
                    </div>
                    <strong>Check the tape before execution</strong>
                    <small>
                      {leadNewsItem?.title || "Read the lead story so the next decision stays anchored in real context."}
                    </small>
                  </div>
                </article>
                <article className="watchItemCard">
                  <div className="watchItemMain">
                    <div className="watchItemTop">
                      <span className="signalMiniTag">03</span>
                      <span className="signalMiniTag">ALERTS</span>
                    </div>
                    <strong>Clear triggered alerts and unread events</strong>
                    <small>
                      {notificationSummary.unread || alertSummary.triggered
                        ? `${notificationSummary.unread || 0} unread notifications and ${alertSummary.triggered || 0} triggered alerts are waiting.`
                        : "No fresh alert pressure is waiting on you right now."}
                    </small>
                  </div>
                </article>
              </div>
            </section>
          </div>
        </section>

        <section className="panel" id="home-workflow">
          <div className="panelHeader">
            <div>
              <h2>Guided workflow</h2>
              <p>Keep the product journey tight: context first, setup second, return loop third, premium value always visible.</p>
            </div>
            <div className="headerStatus">
              <span>Progress</span>
              <strong>{workflowProgress}%</strong>
            </div>
          </div>

          {routineStatus ? <div className="statusBanner subtleBanner">{routineStatus}</div> : null}

          <div className="splitGrid">
            <section className="subPanel">
              {showRoutineReminder ? (
                <div className="workflowReminderCard">
                  <div className="workflowReminderTop">
                    <span className="signalMiniTag">ROUTINE NUDGE</span>
                    <span className="signalBadge hold">{activeRoutineMode.shortLabel}</span>
                  </div>
                  <strong>{nextWorkflowStep.title} is still open.</strong>
                  <p>
                    {activeRoutineMode.detail} Next best move: {nextWorkflowStep.detail}
                  </p>
                  <div className="watchItemActions">
                    <button type="button" className="primaryButton slimButton" onClick={nextWorkflowStep.onClick}>
                      {nextWorkflowStep.cta}
                    </button>
                    <button
                      type="button"
                      className="ghostButton slimButton"
                      disabled={watchlistBusyKey === "routine:reminder"}
                      onClick={dismissRoutineReminder}
                    >
                      Dismiss today
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="workflowModeRow">
                {Object.entries(routineModeMeta).map(([modeId, mode]) => (
                  <button
                    key={modeId}
                    type="button"
                    className={`workflowModeButton ${routineSessionMode === modeId ? "active" : ""}`.trim()}
                    disabled={watchlistBusyKey === `routine-mode:${modeId}`}
                    onClick={() => setRoutineMode(modeId)}
                  >
                    <span>{mode.shortLabel}</span>
                    <strong>{mode.label}</strong>
                    <small>{mode.detail}</small>
                  </button>
                ))}
              </div>

              <div className="summaryGrid compactSummaryGrid">
                <div className="summaryCard summaryCardAccent">
                  <span>Completed steps</span>
                  <strong>
                    {workflowCompleted}/{workflowSteps.length}
                  </strong>
                  <small>The app is already coaching the next best move instead of leaving the user to guess.</small>
                </div>
                <div className="summaryCard">
                  <span>Next best move</span>
                  <strong>{nextWorkflowStep.title}</strong>
                  <small>{nextWorkflowStep.detail}</small>
                </div>
                <div className="summaryCard">
                  <span>Current streak</span>
                  <strong>{routineStreakCount} day{routineStreakCount === 1 ? "" : "s"}</strong>
                  <small>Days with at least one completed workflow step saved to this account.</small>
                </div>
                <div className="summaryCard">
                  <span>Best streak</span>
                  <strong>{routineBestStreakCount} day{routineBestStreakCount === 1 ? "" : "s"}</strong>
                  <small>Your strongest consistency run so far on this account.</small>
                </div>
                <div className="summaryCard">
                  <span>Reminder mode</span>
                  <strong>
                    {routinePreferences.remindersEnabled === false
                      ? "Off"
                      : routinePreferences.nudgeWindow === "focused"
                        ? "Focused"
                        : routinePreferences.nudgeWindow === "quiet"
                          ? "Quiet"
                          : "Active"}
                  </strong>
                  <small>Change this any time under Settings - Routine.</small>
                </div>
                <div className="summaryCard">
                  <span>7-day cadence</span>
                  <strong>{routineWeekActiveCount}/7 active</strong>
                  <small>A quick read on whether the product is becoming part of the user's routine.</small>
                </div>
              </div>

              {routineIsComplete ? (
                <div className="workflowCompleteCard">
                  <div className="workflowCompleteTop">
                    <span className="signalMiniTag">{showRoutineCelebration ? "NICE WORK" : "TODAY COMPLETE"}</span>
                    <span className="signalBadge buy">{showRoutineCelebration ? "DONE" : "READY"}</span>
                  </div>
                  <strong>Your core routine is done for today.</strong>
                  <p>
                    The app has your macro check, lead signal, watchlist return path, alerts,
                    research, and premium review saved. {completedAtLabel ? `Finished at ${completedAtLabel}.` : ""}
                  </p>
                  <div className="watchItemActions">
                    {showRoutineCelebration ? (
                      <button
                        type="button"
                        className="primaryButton slimButton"
                        disabled={watchlistBusyKey === "routine:ack"}
                        onClick={acknowledgeRoutineCompletion}
                      >
                        Keep going
                      </button>
                    ) : null}
                    <button type="button" className="primaryButton slimButton" onClick={activeRoutineMode.primaryAction}>
                      {activeRoutineMode.primaryCta}
                    </button>
                    <button
                      type="button"
                      className="ghostButton slimButton"
                      disabled={watchlistBusyKey === "routine:reset"}
                      onClick={resetRoutine}
                    >
                      Reset Today
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="workflowProgressTrack" aria-hidden="true">
                <div className="workflowProgressFill" style={{ width: `${workflowProgress}%` }} />
              </div>

              <div className="panelActions">
                <button
                  type="button"
                  className="primaryButton"
                  onClick={routineIsComplete ? activeRoutineMode.primaryAction : nextWorkflowStep.onClick}
                >
                  {routineIsComplete ? activeRoutineMode.primaryCta : nextWorkflowStep.cta}
                </button>
                <button
                  type="button"
                  className="ghostButton"
                  onClick={() => jumpToPageSection("home", "home-launchpad", activeDesk)}
                >
                  Open Launchpad
                </button>
              </div>

              <div className="workflowHistoryRow">
                {routineWeekEntries.length ? (
                  routineWeekEntries.map((entry) => (
                    <div
                      className={`workflowHistoryChip ${entry.active ? "active" : "idle"} ${entry.isToday ? "today" : ""}`.trim()}
                      key={entry.id}
                    >
                      <span>{entry.shortLabel}</span>
                      <strong>{entry.active ? "Done" : "--"}</strong>
                      <small>{entry.isToday ? "Today" : entry.dayLabel}</small>
                    </div>
                  ))
                ) : (
                  <div className="workflowHistoryEmpty">
                    <strong>No saved rhythm yet</strong>
                    <small>Complete a few workflow steps and the app will start showing your recent routine trail here.</small>
                  </div>
                )}
              </div>

              {routineActivityDates.length ? (
                <div className="workflowHistorySummary">
                  <strong>Recent completions</strong>
                  <small>
                    {routineActivityDates
                      .map((entry) => (entry.isToday ? "Today" : entry.formatted))
                      .join(" | ")}
                  </small>
                </div>
              ) : null}

              <div className="workflowReviewCard">
                <div className="workflowReviewTop">
                  <div>
                    <span className="signalMiniTag">WEEKLY REVIEW</span>
                    <strong>{routineCadenceReview.label}</strong>
                  </div>
                  <span className="signalBadge hold">{weeklyRoutineScore}%</span>
                </div>
                <p>{routineCadenceReview.detail}</p>

                <div className="workflowInsightCard">
                  <span>Why this matters</span>
                  <strong>{weeklyRoutineScoreLabel}</strong>
                  <small>{weeklyRoutineInsight}</small>
                </div>

                <div className="workflowReviewStats">
                  <div className="workflowReviewStat">
                    <span>This week</span>
                    <strong>{routineWeekActiveCount}/7</strong>
                  </div>
                  <div className="workflowReviewStat">
                    <span>Best week</span>
                    <strong>{routineBestWeekCount}/7</strong>
                  </div>
                  <div className="workflowReviewStat">
                    <span>Best streak</span>
                    <strong>{routineBestStreakCount}d</strong>
                  </div>
                  <div className="workflowReviewStat">
                    <span>Weekly score</span>
                    <strong>{weeklyRoutineScore}%</strong>
                  </div>
                </div>

                <div className="watchItemActions">
                  <button
                    type="button"
                    className="primaryButton slimButton"
                    onClick={() => jumpToPageSection("reports", "reports-performance", activeDesk)}
                  >
                    Open Weekly Research
                  </button>
                  <button
                    type="button"
                    className="ghostButton slimButton"
                    onClick={() => jumpToPageSection("home", "home-brief", activeDesk)}
                  >
                    Review Daily Brief
                  </button>
                </div>
              </div>
            </section>

            <section className="subPanel">
              <div className="workflowStepGrid">
                {workflowSteps.map((step) => (
                  <article
                    key={step.id}
                    className={`workflowStepCard ${step.completed ? "complete" : step.complete ? "ready" : "pending"}`.trim()}
                  >
                    <div className="workflowStepTop">
                      <span className="signalMiniTag">{step.ordinal}</span>
                      <span className={`signalBadge ${step.completed ? "buy" : step.complete ? "hold" : "sell"}`}>
                        {step.completed ? "DONE" : step.complete ? "READY" : "NEXT"}
                      </span>
                    </div>
                    <strong>{step.title}</strong>
                    <p>{step.detail}</p>
                    <div className="watchItemActions">
                      <button type="button" className="ghostButton slimButton" onClick={step.onClick}>
                        {step.cta}
                      </button>
                      <button
                        type="button"
                        className={step.completed ? "ghostButton slimButton" : "primaryButton slimButton"}
                        disabled={watchlistBusyKey === `routine:${step.id}`}
                        onClick={() => setRoutineStep(step.id, !step.completed)}
                      >
                        {step.completed ? "Mark undone" : "Mark done"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>
        </section>

        <section className="panel" id="home-partner">
          <div className="panelHeader">
            <div>
              <h2>Trust and readiness</h2>
              <p>Keep product trust visible: partner access, feed state, support load, and live environment health.</p>
            </div>
            <div className="headerStatus">
              <span>Partner access</span>
              <strong>{shareIsLive ? "Live" : "Private"}</strong>
            </div>
          </div>

          <div className="homeStatusStrip">
            <div className="homeStatusCard">
              <span>Public access</span>
              <strong>{shareIsLive ? "Live" : "Not shared"}</strong>
              <small>
                {shareIsLive ? shareStatus.publicUrl : "Open Settings and share the app when you want outside testers in."}
              </small>
            </div>
            <div className="homeStatusCard">
              <span>Market feeds</span>
              <strong>{marketModeLabel(signalsResponse.marketData?.mode)}</strong>
              <small>{signalsResponse.marketData?.provider || "Simulator"} is currently backing the live desk.</small>
            </div>
            <div className="homeStatusCard">
              <span>Partner board</span>
              <strong>{feedbackSummary.open || 0} open items</strong>
              <small>
                {latestFeedbackItem
                  ? `Latest note: ${latestFeedbackItem.title}`
                  : "No partner notes have landed yet."}
              </small>
            </div>
            <div className="homeStatusCard">
              <span>Frontend state</span>
              <strong>{health.metrics?.productionFrontendReady ? "Ready" : "Warming up"}</strong>
              <small>
                {health.metrics?.productionFrontendReady
                  ? "Built frontend, API health, and persisted state are all available."
                  : "The workspace is still warming up."}
              </small>
            </div>
          </div>

          <div className="panelActions">
            <button
              type="button"
              className="primaryButton"
              onClick={() => navigateToPage("settings", false, activeDesk)}
            >
              Open Partner Testing
            </button>
            <button
              type="button"
              className="ghostButton"
              onClick={() => navigateToPage("connections", false, activeDesk)}
            >
              Review Connections
            </button>
          </div>
        </section>
      </div>

      <section className="panel" id="home-support-menu">
        <div className="panelHeader">
          <div>
            <h2>Support &amp; Admin</h2>
            <p>Keep research, subscriptions, tools, connections, and settings in their own menu lane.</p>
          </div>
          <div className="headerStatus">
            <span>Separate lane</span>
            <strong>Non-service</strong>
          </div>
        </div>

        <div className="homeLaunchGrid">
          {supportLaunchCards.map((card) => (
            <button
              key={card.id}
              type="button"
              className="homeLaunchCard"
              onClick={card.action}
            >
              <div className="homeLaunchTop">
                <span className="navGlyph">{card.glyph}</span>
                <div className="homeLaunchCopy">
                  <strong>{card.label}</strong>
                  <small>{card.hint}</small>
                </div>
              </div>
              <div className="homeLaunchMeta">
                <span>{card.metaLabel}</span>
                <strong>{card.metaValue}</strong>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="panel" id="home-watchlist">
        <div className="panelHeader">
          <div>
            <h2>Watchlist and alerts</h2>
            <p>Give subscribers a reason to return daily: saved instruments, live trigger checks, and one-tap paths back into the desk.</p>
          </div>
          <div className="headerStatus">
            <span>Triggered now</span>
            <strong>{alertSummary.triggered || 0}</strong>
          </div>
        </div>

        {watchlistStatus ? <div className="statusBanner subtleBanner">{watchlistStatus}</div> : null}

        {currentAlertPlan.id !== "elite" || Number(alertSummary.remaining ?? currentAlertPlan.maxAlerts) <= 1 ? (
          <div className="subscriptionPromptCard subscriptionPromptInline">
            <div className="subscriptionPromptTop">
              <div>
                <span className="homePanelEyebrow">Upgrade path</span>
                <h3>Turn alerts into a stronger subscriber habit loop</h3>
                <p>
                  {subscriptionTierLabel(currentAlertPlan.id)} is live now with{" "}
                  {alertSummary.total || 0}/{alertSummary.maxAllowed || currentAlertPlan.maxAlerts} slots in use.
                  {nextAlertPlan
                    ? ` ${nextAlertPlan.label} unlocks more alert coverage${
                        nextAlertPlan.emailEnabled ? ", queued delivery," : ""
                      } and a more obviously premium daily workflow.`
                    : " You are already on the highest-capacity plan."}
                </p>
              </div>
              <div className="subscriptionPromptMeta">
                <span>Next step</span>
                <strong>{nextAlertPlan ? nextAlertPlan.label : "Elite active"}</strong>
                <small>{alertSummary.remaining ?? 0} slots left</small>
              </div>
            </div>

            <div className="panelActions">
              <button
                type="button"
                className="primaryButton"
                onClick={() => navigateToPage("subscriptions", false, activeDesk)}
              >
                Open Subscription Plans
              </button>
              <button
                type="button"
                className="ghostButton"
                onClick={() => jumpToPageSection("settings", "alerts-plan", activeDesk)}
              >
                Manage Alert Plan
              </button>
            </div>
          </div>
        ) : null}

          <div className="summaryGrid compactSummaryGrid">
            <div className="summaryCard">
              <span>Watchlist</span>
              <strong>{watchlistItems.length}</strong>
            </div>
          <div className="summaryCard">
            <span>Alerts live</span>
            <strong>{alertSummary.enabled || 0}</strong>
          </div>
          <div className="summaryCard">
            <span>Triggered</span>
            <strong>{alertSummary.triggered || 0}</strong>
          </div>
            <div className="summaryCard">
              <span>RSI rules</span>
              <strong>{alertSummary.rsiAlerts || 0}</strong>
            </div>
            <div className="summaryCard">
              <span>Plan</span>
              <strong>{subscriptionTierLabel(alertSummary.subscriptionTier)}</strong>
            </div>
            <div className="summaryCard">
              <span>Slots left</span>
              <strong>{alertSummary.remaining ?? 0}</strong>
            </div>
            <div className="summaryCard">
              <span>Email queue</span>
              <strong>{alertSummary.emailQueued || 0}</strong>
            </div>
          </div>

        <div className="splitGrid homeWatchGrid">
          <section className="subPanel">
            <div className="panelHeader">
              <div>
                <h3>Saved instruments</h3>
                <p>Fast jump points back into the desks that matter most.</p>
              </div>
            </div>

            <div className="watchlistStack">
              {watchlistItems.length ? (
                watchlistItems.slice(0, 8).map((item) => (
                  <article className="watchItemCard" key={item.id}>
                    <button type="button" className="watchItemMain" onClick={() => onOpenWatchlistSignal(item)}>
                      <div className="watchItemTop">
                        <span className="signalMiniTag">{labelDesk(item.desk)}</span>
                        <span className={`signalBadge ${actionTone(item.action || "HOLD")}`}>{item.action || "WAIT"}</span>
                      </div>
                      <strong>{item.label}</strong>
                      <small>
                        {item.currentPrice != null
                          ? `${formatTickerPrice(item.ticker, item.currentPrice)} | RSI ${item.currentRsi ?? "--"}`
                          : "Waiting for live desk data"}
                      </small>
                    </button>
                    <button
                      type="button"
                      className="ghostButton slimButton"
                      disabled={watchlistBusyKey === `watch:remove:${item.id}`}
                      onClick={() => onRemoveWatchlistItem(item.id)}
                    >
                      Remove
                    </button>
                  </article>
                ))
              ) : (
                <EmptyState
                  title="No watchlist yet"
                  body="Save signals from the trade desk and they will appear here as daily return points."
                />
              )}
            </div>
          </section>

          <section className="subPanel">
            <div className="panelHeader">
              <div>
                <h3>Active alerts</h3>
                <p>Simple, honest trigger tracking for price and RSI conditions.</p>
              </div>
            </div>

            <div className="watchlistStack">
              {alertItems.length ? (
                alertItems.slice(0, 8).map((item) => (
                  <article className={`watchItemCard alertItemCard ${item.triggered ? "triggered" : ""}`} key={item.id}>
                    <div className="watchItemMain">
                      <div className="watchItemTop">
                        <span className="signalMiniTag">{labelDesk(item.desk)}</span>
                        <span className={`signalBadge ${item.triggered ? "buy" : item.enabled ? "hold" : "sell"}`}>
                          {item.triggered ? "LIVE" : item.enabled ? "ON" : "OFF"}
                        </span>
                      </div>
                      <strong>{item.label}</strong>
                      <small>
                        {alertKindLabel(item.kind)} {formatAlertThreshold(item.ticker, item.kind, item.threshold)}
                        {item.metricValue != null ? ` | Now ${formatAlertThreshold(item.ticker, item.kind, item.metricValue)}` : ""}
                      </small>
                    </div>
                    <div className="watchItemActions">
                      <button
                        type="button"
                        className="ghostButton slimButton"
                        disabled={watchlistBusyKey === `alert:toggle:${item.id}`}
                        onClick={() => onToggleAlertRule(item.id, !item.enabled)}
                      >
                        {item.enabled ? "Pause" : "Resume"}
                      </button>
                      <button
                        type="button"
                        className="ghostButton slimButton"
                        disabled={watchlistBusyKey === `alert:remove:${item.id}`}
                        onClick={() => onRemoveAlertRule(item.id)}
                      >
                        Remove
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <EmptyState
                  title="No alerts yet"
                  body="Create breakout or RSI alerts from the trade desk and the live trigger state will show here."
                />
              )}
            </div>
          </section>

          <section className="subPanel">
            <div className="panelHeader">
              <div>
                <h3>Notification feed</h3>
                <p>Unread alert events and recent trigger activity, kept short and actionable.</p>
              </div>
              <div className="headerStatus">
                <span>Unread</span>
                <strong>{notificationSummary.unread || 0}</strong>
              </div>
            </div>

            <div className="panelActions">
              <button
                type="button"
                className="ghostButton"
                disabled={!notificationSummary.unread || watchlistBusyKey === "notification:all"}
                onClick={markAllNotificationsRead}
              >
                Mark all read
              </button>
            </div>

            <div className="watchlistStack">
              {notificationItems.length ? (
                notificationItems.slice(0, 8).map((item) => (
                  <article className={`watchItemCard notificationCard ${item.status === "unread" ? "unread" : ""}`} key={item.id}>
                    <div className="watchItemMain">
                      <div className="watchItemTop">
                        <span className="signalMiniTag">{labelDesk(item.desk)}</span>
                        <span className={`signalBadge ${item.status === "unread" ? "buy" : "hold"}`}>
                          {item.status === "unread" ? "NEW" : "READ"}
                        </span>
                      </div>
                      <strong>{item.title}</strong>
                      <small>{item.message}</small>
                      <small>{formatDateTime(item.createdAt, appSettings.timezone)}</small>
                    </div>
                    <div className="watchItemActions">
                      <button
                        type="button"
                        className="ghostButton slimButton"
                        disabled={item.status !== "unread" || watchlistBusyKey === `notification:${item.id}`}
                        onClick={() => markNotificationRead(item.id)}
                      >
                        Mark read
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <EmptyState
                  title="No alert activity yet"
                  body="As watchlist rules start triggering, the most recent events will show up here."
                />
              )}
            </div>
          </section>
        </div>
      </section>

      <section className="panel" id="home-activity">
        <div className="panelHeader">
          <div>
            <h2>Session Pulse</h2>
            <p>Show what's moving right now across signal, tape, book, and product state.</p>
          </div>
        </div>

        <div className="homeActivityGrid">
          <div className="homeActivityCard">
            <span>Best signal now</span>
            <strong>{strongestSignal?.label || "Waiting for setup"}</strong>
            <small>
              {strongestSignal
                ? `${strongestSignal.action} | ${strongestSignal.setup} | ${strongestSignal.anchorTrend}`
                : "The engine will surface the next clean desk setup here."}
            </small>
          </div>
          <div className="homeActivityCard">
            <span>Lead headline</span>
            <strong>{leadNewsItem?.sourceName || "Feed warming up"}</strong>
            <small>{leadNewsItem?.title || "The latest macro headline will appear here once the feed settles."}</small>
          </div>
          <div className="homeActivityCard">
            <span>Latest position</span>
            <strong>{latestOpenTrade?.marketLabel || latestOpenTrade?.label || "No open positions"}</strong>
            <small>
              {latestOpenTrade
                ? `${latestOpenTrade.side} | ${latestOpenTrade.executionLabel || "Paper"} | Updated ${formatDateTime(
                    latestOpenTrade.updatedAt || latestOpenTrade.createdAt,
                    appSettings.timezone,
                  )}`
                : "Open a ticket from the trade desk to see live position context here."}
            </small>
          </div>
          <div className="homeActivityCard">
            <span>Workspace state</span>
            <strong>{labelRegion(appSettings.preferredRegion)}</strong>
            <small>
              {shareIsLive
                ? "Shared partner route is live and ready for outside feedback."
                : "Private workspace mode is active until you expose a partner route."}
            </small>
          </div>
        </div>
      </section>
        </div>
      </details>
      </div>
    </>
  );
}

export function NewsScreen({
  activeDesk,
  activeDeskNewsLabel,
  activeDeskProfile,
  activePageSections,
  appSettings,
  deskLeadSignal,
  globalHeadlineCount,
  handleDeskRoute,
  jumpToPageSection,
  leadNewsItem,
  newsResponse,
  newsSourceMap,
  refreshContext,
  southAfricaHeadlineCount,
}) {
  const newsActions = [
    {
      id: "trade",
      label: "Trade Desk",
      meta: deskLeadSignal?.label || "Waiting",
      detail: "Carry the tape straight into the execution workspace.",
      onClick: () => jumpToPageSection("signals", "chart-panel", activeDesk),
    },
    {
      id: "refresh",
      label: "Refresh Feed",
      meta: formatDateTime(newsResponse.refreshedAt, appSettings.timezone) || "Now",
      detail: "Pull the latest headlines and source state again.",
      onClick: refreshContext,
    },
    {
      id: "south-africa",
      label: "South Africa",
      meta: `${southAfricaHeadlineCount}`,
      detail: "Focus the tape on South African headlines and local macro.",
      onClick: () => handleDeskRoute("news", "jse"),
      active: activeDesk === "jse",
    },
    {
      id: "all",
      label: "All Markets",
      meta: `${newsResponse.items.length}`,
      detail: "Step back and scan the full cross-market tape.",
      onClick: () => handleDeskRoute("news", "all"),
      active: activeDesk === "all",
    },
  ];

  return (
    <>
      <WorkspaceHero
        tone="news"
        eyebrow="Macro Tape"
        title={activeDesk === "all" ? "Market News" : `${labelDesk(activeDesk)} News`}
        description="Dedicated macro tape, South African context, and trade-adjacent headlines in a separate workspace from execution."
        statusLabel="Feed refresh"
        statusValue={formatDateTime(newsResponse.refreshedAt, appSettings.timezone)}
        metrics={[
          {
            label: "Lead source",
            value: leadNewsItem?.sourceName || "Waiting",
            detail: activeDeskNewsLabel,
          },
          {
            label: "South Africa",
            value: southAfricaHeadlineCount,
            detail: "Local macro tape",
          },
          {
            label: "Global",
            value: globalHeadlineCount,
            detail: "Cross-market flow",
          },
        ]}
        primaryAction={{
          label: "Open Trade Desk",
          onClick: () => jumpToPageSection("signals", "chart-panel", activeDesk),
        }}
        secondaryAction={{
          label: "Refresh Feed",
          onClick: refreshContext,
        }}
      />
      <WorkspaceSectionBar
        sections={activePageSections}
        onSelect={(sectionId) => jumpToPageSection("news", sectionId, activeDesk)}
      />
      <WorkspaceCommandBar
        tone="news"
        title="Tape Shortcuts"
        hint="Shift between the tape, the desk, and the source flow quickly."
        actions={newsActions}
      />

      <section className="panel deskPanel" id="news-desk-selector">
        <div className="panelHeader">
          <div>
            <h2>Choose a news lens</h2>
            <p>Keep the tape anchored to the market lane you care about before you jump into trade execution.</p>
          </div>
          <div className="headerStatus">
            <span>Headlines</span>
            <strong>{newsResponse.items.length}</strong>
          </div>
        </div>

        <div className="deskToolbar">
          <div className="segmentedControl deskFilters" role="tablist" aria-label="News desks">
            {DESK_FILTERS.map((desk) => (
              <button
                key={desk.id}
                type="button"
                className={activeDesk === desk.id ? "active" : ""}
                onClick={() => handleDeskRoute("news", desk.id)}
              >
                {desk.label}
              </button>
            ))}
          </div>

          <div className="deskStats">
            <div className="deskStat">
              <span>Focus</span>
              <strong>{activeDeskNewsLabel}</strong>
            </div>
            <div className="deskStat">
              <span>Market Intelligence</span>
              <strong>{newsResponse.sources.length}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="summaryGrid">
        <button
          type="button"
          className="summaryCard summaryCardButton"
          onClick={() => jumpToPageSection("news", "macro-feed", activeDesk)}
        >
          <span>Total headlines</span>
          <strong>{newsResponse.items.length}</strong>
        </button>
        <button
          type="button"
          className="summaryCard summaryCardButton"
          onClick={() => jumpToPageSection("news", "macro-feed", activeDesk)}
        >
          <span>South Africa</span>
          <strong>{southAfricaHeadlineCount}</strong>
        </button>
        <button
          type="button"
          className="summaryCard summaryCardButton"
          onClick={() => jumpToPageSection("news", "macro-feed", activeDesk)}
        >
          <span>Global</span>
          <strong>{globalHeadlineCount}</strong>
        </button>
        <button
          type="button"
          className="summaryCard summaryCardButton"
          onClick={() => jumpToPageSection("signals", "chart-panel", activeDesk)}
        >
          <span>Trade desk</span>
          <strong>{activeDesk === "all" ? "Open trade" : findDeskMeta(activeDesk).heading}</strong>
        </button>
      </section>

      <div className="splitGrid">
        <section className="panel" id="news-lead">
          <div className="panelHeader">
            <div>
              <h2>{leadNewsItem?.title || "Lead headline loading"}</h2>
              <p>
                {leadNewsItem?.summary || "The lead story will show here as the feed settles."}
              </p>
            </div>
            <div className="headerStatus">
              <span>Desk lens</span>
              <strong>{activeDeskNewsLabel}</strong>
            </div>
          </div>

          {leadNewsItem ? (
            <>
              <div className="signalCommandGrid">
                <div className="signalCommandMetric">
                  <span>Market Intelligence</span>
                  <strong>{leadNewsItem.sourceName}</strong>
                </div>
                <div className="signalCommandMetric">
                  <span>Region</span>
                  <strong>{leadNewsItem.region === "south-africa" ? "JSE / ZAR" : "Global"}</strong>
                </div>
                <div className="signalCommandMetric">
                  <span>Timestamp</span>
                  <strong>
                    {formatDateTime(
                      leadNewsItem.publishedAt || leadNewsItem.seenAt,
                      appSettings.timezone,
                    )}
                  </strong>
                </div>
                <div className="signalCommandMetric">
                  <span>Trade route</span>
                  <strong>{deskLeadSignal?.label || "Waiting"}</strong>
                </div>
              </div>

              <div className="panelActions">
                <button
                  type="button"
                  className="primaryButton"
                  onClick={() => jumpToPageSection("signals", "chart-panel", activeDesk)}
                >
                  Open Trade Desk
                </button>
                <button
                  type="button"
                  className="ghostButton"
                  onClick={() => openExternal(leadNewsItem.link || newsSourceMap[leadNewsItem.sourceId])}
                >
                  Read Market Intelligence
                </button>
              </div>
            </>
          ) : (
            <EmptyState
              title="News is refreshing"
              body="The feed is warming up and the lead headline will appear once the market intelligence responds."
            />
          )}
        </section>

        <section className="panel" id="chart-analyzer">
          <div className="panelHeader">
            <div>
              <h2>Desk context</h2>
              <p>Keep the macro tape and the actual trade lane stitched together.</p>
            </div>
          </div>

          <div className="deskBriefGrid">
            <div className="deskBriefCard">
              <span>Lens</span>
              <strong>{activeDeskNewsLabel}</strong>
              <small>
                {activeDesk === "all"
                  ? "Scan the full tape before narrowing to a desk."
                  : findDeskMeta(activeDesk).blurb}
              </small>
            </div>
            <div className="deskBriefCard">
              <span>Lead setup</span>
              <strong>{deskLeadSignal?.setup || "Waiting"}</strong>
              <small>
                {deskLeadSignal
                  ? `${deskLeadSignal.action} on ${deskLeadSignal.label} is currently leading this desk.`
                  : "The engine will promote the next clean setup here."}
              </small>
            </div>
            <div className="deskBriefCard">
              <span>Route</span>
              <strong>
                {activeDesk === "all"
                  ? "Desk-specific routing"
                  : `${providerLabel(activeDeskProfile?.providerId)} | ${marketModeLabel(
                      activeDeskProfile?.mode,
                    )}`}
              </strong>
              <small>
                {activeDesk === "crypto" && activeDeskProfile?.pair
                  ? `Preferred pair: ${activeDeskProfile.pair}.`
                  : "Switch into Trade when you want chart structure and execution tickets."}
              </small>
            </div>
            <div className="deskBriefCard">
              <span>Next action</span>
              <strong>{deskLeadSignal?.label || "Open trade desk"}</strong>
              <small>
                Read the tape here, then move into Trade when the setup and the story agree.
              </small>
            </div>
          </div>
        </section>
      </div>

      <section className="panel" id="macro-feed">
        <div className="panelHeader">
          <div>
            <h2>Macro Feed</h2>
            <p>{labelRegion(appSettings.preferredRegion)} headlines with honest timestamps.</p>
          </div>
        </div>

        <div className="newsList">
          {newsResponse.items.map((item) => {
            const targetUrl = item.link || newsSourceMap[item.sourceId];
            const interactiveProps = targetUrl
              ? {
                  role: "button",
                  tabIndex: 0,
                  onClick: () => openExternal(targetUrl),
                  onKeyDown: (event) => handleInteractiveKey(event, () => openExternal(targetUrl)),
                }
              : {};

            return (
              <article
                key={item.id}
                className={`newsItem interactiveCard ${targetUrl ? "clickable" : ""}`}
                {...interactiveProps}
              >
                <div className="newsItemTop">
                  <span>{item.sourceName}</span>
                  <span>{item.region === "south-africa" ? "JSE / ZAR" : "Global"}</span>
                </div>
                <h3>{item.title}</h3>
                <p>{item.summary || "No summary available yet."}</p>
                <small>
                  {item.publishedAt ? "Published " : "Seen "}
                  {formatDateTime(item.publishedAt || item.seenAt, appSettings.timezone)}
                </small>
              </article>
            );
          })}
          {!newsResponse.items.length ? (
            <EmptyState
              title="News is refreshing"
              body="The feed is warming up and will fill in as market intelligence responds."
            />
          ) : null}
        </div>
      </section>
    </>
  );
}

export function ToolsScreen({
  activeChartPlan,
  activeDeskProfile,
  activePageSections,
  activeResearchReports,
  activeSignal,
  appSettings,
  chartUploadName,
  handleChartUpload,
  jumpToPageSection,
  leadNewsItem,
  mentorChecklist,
  mentorSummary,
  navigateToPage,
  openResearchReport,
  openTrades,
  toolStatus,
  toolsDeskKey,
}) {
  const learningTracks = [
    {
      id: "ema",
      label: "EMA Framework",
      title: "8 / 21 EMA entries and exits",
      progress: activeSignal ? 100 : 68,
      detail: activeSignal
        ? "The live desk already has an active setup you can study against the framework."
        : "Review the cross, retest, and invalidation flow before you act.",
    },
    {
      id: "macro",
      label: "Macro Context",
      title: "Tape before trade",
      progress: leadNewsItem ? 100 : 62,
      detail: leadNewsItem
        ? `${leadNewsItem.sourceName} is anchoring the current desk context.`
        : "Use this track to understand the story behind the next move.",
    },
    {
      id: "risk",
      label: "Risk Management",
      title: "Stops, targets, and discipline",
      progress: activeChartPlan ? 100 : mentorChecklist.length ? 76 : 54,
      detail: activeChartPlan
        ? "A live structure plan is already available to review."
        : "Build cleaner stop, target, and invalidation habits before routing.",
    },
  ];
  const progressModules = [
    {
      id: "context",
      label: "Market context",
      value: leadNewsItem ? 100 : 40,
      meta: leadNewsItem ? "Lead tape loaded" : "Feed still warming up",
    },
    {
      id: "analysis",
      label: "Chart analysis",
      value: chartUploadName ? 100 : activeSignal ? 74 : 38,
      meta: chartUploadName ? "Screenshot ready" : activeSignal ? "Live chart available" : "No active chart yet",
    },
    {
      id: "simulation",
      label: "Simulator",
      value: activeDeskProfile?.mode === "paper" ? 100 : 82,
      meta: activeDeskProfile?.mode === "paper" ? "Paper first" : "Live-capable desk",
    },
    {
      id: "discipline",
      label: "Execution discipline",
      value: activeChartPlan ? 100 : mentorChecklist.length ? 72 : 44,
      meta: activeChartPlan ? "Plan structured" : "Plan still forming",
    },
  ];
  const progressScore = Math.round(average(progressModules.map((item) => item.value)));
  const toolActions = [
    {
      id: "mentor",
      label: "AI Mentor",
      meta: mentorSummary.action,
      detail: "Start with the plain-English read before touching the ticket.",
      onClick: () => jumpToPageSection("tools", "tools-workbench", toolsDeskKey),
    },
    {
      id: "analyzer",
      label: "Snap & Analyze",
      meta: chartUploadName || "No upload",
      detail: "Upload a stock or crypto chart and compare it against the live desk.",
      onClick: () => jumpToPageSection("tools", "chart-analyzer", toolsDeskKey),
    },
    {
      id: "simulator",
      label: "Simulator",
      meta: activeDeskProfile?.mode === "paper" ? "Paper" : "Live-capable",
      detail: "Pressure-test the idea with virtual money before you commit.",
      onClick: () => jumpToPageSection("tools", "scenario-simulator", toolsDeskKey),
    },
    {
      id: "learn",
      label: "Learn",
      meta: `${learningTracks.length} tracks`,
      detail: "Step-by-step learning cards for strategy, context, and risk.",
      onClick: () => jumpToPageSection("tools", "learn-dashboard", toolsDeskKey),
    },
    {
      id: "progress",
      label: "Progress",
      meta: `${progressScore}%`,
      detail: "Current readiness across context, analysis, simulation, and discipline.",
      onClick: () => jumpToPageSection("tools", "progress-dashboard", toolsDeskKey),
    },
    {
      id: "connections",
      label: "Connections",
      meta: marketModeLabel(activeDeskProfile?.mode || "paper"),
      detail: "Check route health before carrying a tool idea into execution.",
      onClick: () => navigateToPage("connections", false, toolsDeskKey),
    },
  ];

  return (
    <>
      <WorkspaceHero
        tone="tools"
        eyebrow="Decision Support"
        title="Tools"
        description="Decision support, practice, and research tools that sit beside the live desk without getting in its way."
        statusLabel="Active desk"
        statusValue={labelDesk(toolsDeskKey)}
        metrics={[
          {
            label: "AI mentor",
            value: mentorSummary.action,
            detail: mentorSummary.setup,
          },
          {
            label: "Chart intake",
            value: chartUploadName || "No upload yet",
            detail: activeSignal?.label || "Waiting for lead market",
          },
          {
            label: "Research",
            value: activeResearchReports.length,
            detail: "Desk-linked research",
          },
        ]}
        primaryAction={{
          label: "Open Trade Desk",
          onClick: () => jumpToPageSection("signals", "chart-panel", toolsDeskKey),
        }}
        secondaryAction={{
          label: "Open News",
          onClick: () => jumpToPageSection("news", "macro-feed", toolsDeskKey),
        }}
      />
      <WorkspaceSectionBar
        sections={activePageSections}
        onSelect={(sectionId) => jumpToPageSection("tools", sectionId, toolsDeskKey)}
      />
      <WorkspaceCommandBar
        tone="tools"
        title="Workbench Shortcuts"
        hint="Move between mentoring, analysis, simulation, and research without breaking context."
        actions={toolActions}
      />

      {toolStatus ? <div className="statusBanner subtleBanner">{toolStatus}</div> : null}

      <section className="summaryGrid">
        <div className="summaryCard">
          <span>AI mentor</span>
          <strong>{mentorSummary.action}</strong>
        </div>
        <div className="summaryCard">
          <span>Chart intake</span>
          <strong>{chartUploadName ? "Chart uploaded" : "Snap & Analyze"}</strong>
        </div>
        <div className="summaryCard">
          <span>Learning tracks</span>
          <strong>{learningTracks.length}</strong>
        </div>
        <div className="summaryCard">
          <span>Progress</span>
          <strong>{progressScore}%</strong>
        </div>
      </section>

      <div className="splitGrid">
        <section className="panel" id="tools-workbench">
          <div className="panelHeader">
            <div>
              <h2>AI Mentor</h2>
              <p>Translate the current desk into plain English before you move into execution.</p>
            </div>
            <div className="headerStatus">
              <span>Lead setup</span>
              <strong>{mentorSummary.setup}</strong>
            </div>
          </div>

          <div className="deskBriefGrid">
            <div className="deskBriefCard">
              <span>What the desk is saying</span>
              <strong>{mentorSummary.action}</strong>
              <small>{mentorSummary.rationale}</small>
            </div>
            <div className="deskBriefCard">
              <span>Invalidation</span>
              <strong>{mentorSummary.setup}</strong>
              <small>{mentorSummary.invalidation}</small>
            </div>
            <div className="deskBriefCard">
              <span>Macro link</span>
              <strong>{leadNewsItem?.sourceName || "Feed warming up"}</strong>
              <small>
                {leadNewsItem?.title ||
                  "Open the News screen to ground the next trade in the current tape."}
              </small>
            </div>
            <div className="deskBriefCard">
              <span>Checklist</span>
              <strong>{mentorChecklist.length} checks</strong>
              <small>{mentorChecklist[0] || "The desk checklist will appear here."}</small>
            </div>
          </div>

          <div className="toolBulletList">
            {mentorChecklist.map((item) => (
              <div className="toolBullet" key={item}>
                <strong>{item}</strong>
              </div>
            ))}
          </div>

          <div className="panelActions">
            <button
              type="button"
              className="primaryButton"
              onClick={() => jumpToPageSection("signals", "chart-panel", toolsDeskKey)}
            >
              Open Trade Desk
            </button>
            <button
              type="button"
              className="ghostButton"
              onClick={() => jumpToPageSection("news", "macro-feed", toolsDeskKey)}
            >
              Open News
            </button>
            <button
              type="button"
              className="ghostButton"
              onClick={() => navigateToPage("connections", false, toolsDeskKey)}
            >
              Check Connections
            </button>
          </div>
        </section>

        <section className="panel" id="scenario-simulator">
          <div className="panelHeader">
            <div>
              <h2>Chart Analyzer</h2>
              <p>Queue a chart image for comparison against the active live setup and structure plan.</p>
            </div>
          </div>

          <div className="toolCardList">
            <div className="toolCard">
              <span>Live chart context</span>
              <strong>{activeSignal?.label || "Waiting for a lead market"}</strong>
              <small>
                {activeSignal
                  ? `EMA8 ${formatTickerPrice(activeSignal.ticker, activeSignal.ema8)} · EMA21 ${formatTickerPrice(activeSignal.ticker, activeSignal.ema21)}`
                  : "The current chart context will appear here once the desk has a lead setup."}
              </small>
            </div>
            <div className="toolCard">
              <span>Structure plan</span>
              <strong>{activeChartPlan?.source || "Desk preset"}</strong>
              <small>
                {activeChartPlan
                  ? `${activeChartPlan.side} stop ${formatTickerPrice(activeSignal?.ticker, activeChartPlan.stopPrice)} · target ${formatTickerPrice(activeSignal?.ticker, activeChartPlan.targetPrice)}`
                  : "Open the Trade screen to generate a live structure plan."}
              </small>
            </div>
            <div className="toolCard">
              <span>Chart upload</span>
              <strong>{chartUploadName || "No chart uploaded"}</strong>
              <small>
                Use this for screenshots or external chart captures you want to compare with the live desk.
              </small>
            </div>
          </div>

          <div className="panelActions">
            <label className="ghostButton toolUploadButton">
              Upload Chart
              <input type="file" accept="image/*" onChange={handleChartUpload} />
            </label>
            <button
              type="button"
              className="primaryButton"
              onClick={() => jumpToPageSection("signals", "chart-panel", toolsDeskKey)}
            >
              Review Live Chart
            </button>
          </div>
        </section>
      </div>

      <div className="splitGrid">
        <section className="panel" id="research-library">
          <div className="panelHeader">
            <div>
              <h2>Scenario Simulator</h2>
              <p>Keep practice and planning separate from live routing so you can test the idea first.</p>
            </div>
          </div>

          <div className="deskBriefGrid">
            <div className="deskBriefCard">
              <span>Execution mode</span>
              <strong>{marketModeLabel(activeDeskProfile?.mode || "paper")}</strong>
              <small>
                {activeDeskProfile?.mode === "live"
                  ? "This desk can route live, so use the simulator to pressure-test the idea first."
                  : "Paper mode is active, which makes this the right place to test scenarios."}
              </small>
            </div>
            <div className="deskBriefCard">
              <span>Open positions</span>
              <strong>{openTrades.length}</strong>
              <small>Use current positions as references for sizing, notes, and close discipline.</small>
            </div>
            <div className="deskBriefCard">
              <span>Risk mode</span>
              <strong>{appSettings.riskMode}</strong>
              <small>Stay consistent between the simulator, the ticket, and the actual desk.</small>
            </div>
            <div className="deskBriefCard">
              <span>Next action</span>
              <strong>{activeSignal?.action || "Wait"}</strong>
              <small>When the scenario feels clean, carry it across into the Trade screen.</small>
            </div>
          </div>

          <div className="panelActions">
            <button
              type="button"
              className="primaryButton"
              onClick={() => jumpToPageSection("portfolio", "open-positions")}
            >
              Review Portfolio
            </button>
            <button
              type="button"
              className="ghostButton"
              onClick={() => jumpToPageSection("signals", "signals-grid", toolsDeskKey)}
            >
              Open Setups
            </button>
          </div>
        </section>

        <section className="panel">
          <div className="panelHeader">
            <div>
              <h2>Research Library</h2>
              <p>Keep the desk anchored to the research and playbooks already informing the workflow.</p>
            </div>
          </div>

          <div className="toolCardList">
            {activeResearchReports.map((report) => (
              <button
                key={report.id}
                type="button"
                className="toolCard toolCardButton"
                onClick={() => openResearchReport(report)}
              >
                <span>
                  {report.targetDesk === "crypto"
                    ? "Crypto"
                    : report.targetDesk === "forex"
                      ? "Forex"
                      : "Desk"}
                </span>
                <strong>{report.title}</strong>
                <small>{report.subtitle}</small>
              </button>
            ))}
            {!activeResearchReports.length ? (
              <EmptyState
                title="No research pinned to this desk"
                body="Switch desks or add more desk-linked research to expand the tool shelf."
              />
            ) : null}
          </div>
        </section>
      </div>
    </>
  );
}

export function CollectiblesScreen({
  activeCollectible,
  activePageSections,
  appSettings,
  brickAlphaPortfolio,
  collectibleBrand,
  collectibleCategory,
  collectibleQuery,
  collectibles,
  collectiblesResponse,
  filteredCollectibles,
  handleCollectibleSelect,
  jumpToPageSection,
  onAddToWatchlist,
  openCollectibleTicket,
  openTrades,
  setCollectibleBrand,
  setCollectibleCategory,
  setCollectibleQuery,
}) {
  const officialShelves = collectiblesResponse.referenceShelves || [];
  const legoReferenceShelf =
    officialShelves.find((shelf) => shelf.brand === "LEGO") || officialShelves[0] || null;
  const groupedCollectibles = [
    ...(collectiblesResponse.brands || [])
      .map((brand) => ({
        brand,
        items: filteredCollectibles.filter((item) => item.brand === brand),
      }))
      .filter((group) => group.items.length),
    ...Array.from(
      new Map(
        filteredCollectibles
          .filter(
            (item) =>
              !(collectiblesResponse.brands || []).some((brand) => brand === item.brand),
          )
          .map((item) => [item.brand, { brand: item.brand, items: [] }]),
      ).values(),
    ).map((group) => ({
      ...group,
      items: filteredCollectibles.filter((item) => item.brand === group.brand),
    })),
  ];
  const collectibleActions = [
    {
      id: "inventory",
      label: "Holdings",
      meta: `${filteredCollectibles.length}`,
      detail: "Stay inside Brick Alpha and scan the items you can actually act on.",
      onClick: () => jumpToPageSection("collectibles", "collectibles-grid"),
    },
    {
      id: "source",
      label: "Market Intelligence",
      meta: legoReferenceShelf?.sourceName || "Reference",
      detail: "Verify lineups and product context without leaving the core workflow too early.",
      onClick: () => jumpToPageSection("collectibles", "collectibles-reference"),
    },
    {
      id: "buy",
      label: "Buy Ticket",
      meta: activeCollectible?.brand || "Select item",
      detail: "Open the collectible ticket flow on the current focus item.",
      onClick: () => activeCollectible && openCollectibleTicket(activeCollectible, "BUY"),
      disabled: !activeCollectible,
    },
    {
      id: "portfolio",
      label: "Portfolio",
      meta: "Review book",
      detail: "Check how LEGO investment positions sit inside the wider portfolio.",
      onClick: () => jumpToPageSection("portfolio", "open-positions"),
    },
  ];

  return (
    <>
      <WorkspaceHero
        tone="collectibles"
        eyebrow="LEGO Investments"
        title="LEGO Investments"
        description="AI-powered investment analysis for every LEGO set — buy, hold, or sell with conviction."
        statusLabel="Desk refresh"
        statusValue={formatDateTime(collectiblesResponse.updatedAt, appSettings.timezone)}
        metrics={[
          {
            label: "Tradable items",
            value: collectibles.length,
            detail: "Live LEGO holdings",
          },
          {
            label: "Brands",
            value: (collectiblesResponse.brands || []).length,
            detail: "Across tracked categories",
          },
          {
            label: "Lead score",
            value: activeCollectible ? formatScore(activeCollectible.brickAlphaScore) : "Waiting",
            detail: activeCollectible?.investmentGrade || "Select an item",
          },
          {
            label: "Portfolio value",
            value: activeCollectible
              ? formatCollectiblePrice(
                  activeCollectible.currentMarketValue * activeCollectible.quantityOwned,
                )
              : "Waiting",
            detail: activeCollectible?.sellByTargetDate || "Exit target",
          },
        ]}
        primaryAction={{
          label: "Open Buy Ticket",
          onClick: () => {
            if (activeCollectible) {
              openCollectibleTicket(activeCollectible, "BUY");
            }
          },
        }}
        secondaryAction={{
          label: "Review Portfolio",
          onClick: () => jumpToPageSection("portfolio", "open-positions"),
        }}
      />
      <WorkspaceSectionBar
        sections={activePageSections}
        onSelect={(sectionId) => jumpToPageSection("collectibles", sectionId)}
      />
      <WorkspaceCommandBar
        tone="collectibles"
        title="LEGO Investment Shortcuts"
        hint="Keep trading, verification, and portfolio review in one tidy flow."
        actions={collectibleActions}
      />

      <InvestmentAnalysisWorkspace
        activeCollectible={activeCollectible}
        brickAlphaPortfolio={brickAlphaPortfolio}
        collectibles={collectibles}
        handleCollectibleSelect={handleCollectibleSelect}
        jumpToPageSection={jumpToPageSection}
        onAddToWatchlist={onAddToWatchlist}
        openCollectibleTicket={openCollectibleTicket}
        openTrades={openTrades}
      />

      <RetirementIntelligenceWorkspace
        brickAlphaPortfolio={brickAlphaPortfolio}
        collectibles={collectibles}
        handleCollectibleSelect={handleCollectibleSelect}
        jumpToPageSection={jumpToPageSection}
        openCollectibleTicket={openCollectibleTicket}
        openTrades={openTrades}
      />

      <section className="panel" id="collectibles-trading">
        <div className="panelHeader">
          <div>
            <h2>Browse Sets</h2>
            <p>Search and filter the LEGO investment catalog, then open full analysis above.</p>
          </div>
        </div>

        <div className="collectibleInventoryToolbar">
          <input
            type="text"
            value={collectibleQuery}
            onChange={(event) => setCollectibleQuery(event.target.value)}
            placeholder="Search brand, title, category, or market"
          />
          <select
            value={collectibleBrand}
            onChange={(event) => setCollectibleBrand(event.target.value)}
          >
            <option value="all">All brands</option>
            {(collectiblesResponse.brands || []).map((brand) => (
              <option key={brand} value={brand}>
                {brand}
              </option>
            ))}
          </select>
          <select
            value={collectibleCategory}
            onChange={(event) => setCollectibleCategory(event.target.value)}
          >
            <option value="all">All categories</option>
            {(collectiblesResponse.categories || []).map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>

      </section>

      {legoReferenceShelf ? (
        <section className="panel" id="collectibles-reference">
          <div className="panelHeader">
            <div>
              <h2>{legoReferenceShelf.title}</h2>
              <p>{legoReferenceShelf.summary}</p>
            </div>
            <div className="headerStatus">
              <span>Verification lane</span>
              <strong>{legoReferenceShelf.sourceName}</strong>
            </div>
          </div>

          <div className="deskBriefGrid">
            {(legoReferenceShelf.notes || []).map((note) => (
              <div className="deskBriefCard" key={note}>
                <span>Reference note</span>
                <strong>{legoReferenceShelf.sourceName}</strong>
                <small>{note}</small>
              </div>
            ))}
          </div>

          <div className="collectibleReferenceGrid">
            {(legoReferenceShelf.highlights || []).map((item) => (
              <article className="collectibleReferenceCard" key={item.id}>
                <div className="collectibleReferenceTop">
                  <span>{item.category}</span>
                  <strong>{item.status}</strong>
                </div>
                <h3>{item.name}</h3>
                <p>{item.note}</p>
                <div className="collectibleReferenceMeta">
                  <div>
                    <span>Age</span>
                    <strong>{item.age || "--"}</strong>
                  </div>
                  <div>
                    <span>Pieces</span>
                    <strong>{item.pieces || "--"}</strong>
                  </div>
                </div>
                <div className="panelActions">
                  <button
                    type="button"
                    className="ghostButton"
                    onClick={() => openExternal(item.url || legoReferenceShelf.url)}
                  >
                    Verify Market Intelligence
                  </button>
                </div>
              </article>
            ))}
          </div>

          <div className="panelActions">
            <div className="collectibleSourceHint">
              Brick Alpha stays the main workspace. Official LEGO ZA links are here for market verification, not as the primary route.
            </div>
            {legoReferenceShelf.aboutUrl ? (
              <button
                type="button"
                className="ghostButton"
                onClick={() => openExternal(legoReferenceShelf.aboutUrl)}
              >
                Learn How Minifigures Work
              </button>
            ) : null}
            {legoReferenceShelf.url ? (
              <button
                type="button"
                className="ghostButton"
                onClick={() => openExternal(legoReferenceShelf.url)}
              >
                Open Official LEGO ZA
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="collectibleShelfStack" id="collectibles-grid">
        {groupedCollectibles.map((group) => (
          <section className="panel collectibleShelfPanel" key={group.brand}>
            <div className="panelHeader">
              <div>
                <h2>{group.brand}</h2>
                <p>
                  {group.brand === "LEGO"
                    ? `BrickEconomy current value, recorded growth, and the verdict vocabulary. ${resolveExchangeRate(appSettings).label}.`
                    : group.brand === "Pokemon"
                      ? "Sealed and graded trading-card holdings with faster collector demand read-through."
                      : "collectibles tracked inside the same ticket and portfolio workflow."}
                </p>
              </div>
              <div className="headerStatus">
                <span>Items</span>
                <strong>{group.items.length}</strong>
              </div>
            </div>

            <div className="collectibleGrid">
              {group.items.map((item) => (
                <TradeCollectibleCard
                  key={item.id}
                  item={item}
                  isActive={activeCollectible?.id === item.id}
                  onSelect={handleCollectibleSelect}
                  onTrade={openCollectibleTicket}
                />
              ))}
            </div>
          </section>
        ))}
        {!filteredCollectibles.length ? (
          <EmptyState
            title="No LEGO investments match that filter"
            body="Try another brand, category, or a broader search term."
          />
        ) : null}
      </section>
    </>
  );
}

export function ScanEvaluateScreen({
  activePageSections: _activePageSections,
  appSettings: _appSettings,
  collectibles,
  collectiblesResponse: _collectiblesResponse,
  handleCollectibleSelect,
  jumpToPageSection,
  onAddToWatchlist,
  openCollectibleTicket,
  openTrades,
  closedTrades = [],
  navigateToPage,
}) {
  return (
    <ScanEvaluateWorkspace
      collectibles={collectibles}
      openTrades={openTrades}
      closedTrades={closedTrades}
      handleCollectibleSelect={handleCollectibleSelect}
      jumpToPageSection={jumpToPageSection}
      onAddToWatchlist={onAddToWatchlist}
      openCollectibleTicket={openCollectibleTicket}
      navigateToPage={navigateToPage}
    />
  );
}

export function PortfolioScreen({
  activeDesk,
  activePageSections,
  activePortfolioTrade,
  appSettings,
  closedTrades,
  collectibles = [],
  handleCloseTrade,
  handlePortfolioTradeNavigate,
  handlePortfolioTradeSelect,
  health,
  jumpToPageSection,
  onAddToWatchlist,
  openTrades,
  totalOpenPnl,
  watchlistItems = [],
}) {
  const brickAlphaPortfolio = useMemo(
    () => summarizeBrickAlphaPortfolio([...openTrades, ...closedTrades]),
    [closedTrades, openTrades],
  );
  const collectibleHoldings = openTrades.filter((trade) => trade.assetClass === "collectible");
  const portfolioActions = [
    {
      id: "intelligence",
      label: "Collection Intelligence",
      meta: `${collectibleHoldings.length || "Demo"}`,
      detail: "NAV, theme allocation, growth chart, and Brick Alpha scores.",
      onClick: () => jumpToPageSection("portfolio", "portfolio-intelligence"),
    },
    {
      id: "holdings",
      label: "My Sets",
      meta: `${collectibleHoldings.length || 6}`,
      detail: "Premium holdings cards with investment intelligence.",
      onClick: () => jumpToPageSection("portfolio", "portfolio-holdings"),
    },
    {
      id: "positions",
      label: "Open Positions",
      meta: `${openTrades.length}`,
      detail: "All live market and collectible positions.",
      onClick: () => jumpToPageSection("portfolio", "open-positions"),
    },
    {
      id: "history",
      label: "Order History",
      meta: `${closedTrades.length}`,
      detail: "Review closes, timestamps, and exit discipline.",
      onClick: () => jumpToPageSection("portfolio", "order-history"),
    },
    {
      id: "selected",
      label: "Selected Trade",
      meta: activePortfolioTrade?.ticker || "No selection",
      detail: "Jump to the current position detail pane.",
      onClick: () => jumpToPageSection("portfolio", "position-detail"),
    },
    {
      id: "trade",
      label: "Back to Trade",
      meta: labelDesk(activeDesk),
      detail: "Return to the live desk and open another ticket.",
      onClick: () => jumpToPageSection("signals", "chart-panel", activeDesk),
    },
  ];

  return (
    <>
      <WorkspaceHero
        tone="portfolio"
        eyebrow="Collection Intelligence"
        title="Portfolio Intelligence"
        description="Your LEGO collection as an investment portfolio — NAV, growth, theme allocation, and Brick Alpha recommendations."
        statusLabel="Last engine tick"
        statusValue={formatDateTime(health.metrics?.lastEngineTickAt, appSettings.timezone)}
        metrics={[
          {
            label: "Open positions",
            value: openTrades.length,
            detail: "Across market and collectible desks",
          },
          {
            label: "Closed trades",
            value: closedTrades.length,
            detail: "Archived with exit reason",
          },
          {
            label: "Live PnL",
            value: `${totalOpenPnl.toFixed(2)}%`,
            detail: "Open-book change",
          },
          {
            label: "Net Asset Value",
            value: formatCollectiblePrice(brickAlphaPortfolio.netAssetValue),
            detail: `${brickAlphaPortfolio.collectionGrade} collection grade`,
          },
        ]}
        primaryAction={{
          label: "View Holdings",
          onClick: () => jumpToPageSection("portfolio", "portfolio-holdings"),
        }}
        secondaryAction={{
          label: "Export Portfolio",
          onClick: () => jumpToPageSection("portfolio", "portfolio-holdings"),
        }}
      />
      <WorkspaceSectionBar
        sections={activePageSections}
        onSelect={(sectionId) => jumpToPageSection("portfolio", sectionId)}
      />
      <WorkspaceCommandBar
        tone="portfolio"
        title="Portfolio Shortcuts"
        hint="Collection intelligence, holdings, open book, and execution history."
        actions={portfolioActions}
      />

      <PortfolioIntelligenceWorkspace
        collectibles={collectibles}
        handlePortfolioTradeSelect={handlePortfolioTradeSelect}
        jumpToPageSection={jumpToPageSection}
        onAddToWatchlist={onAddToWatchlist}
        openTrades={openTrades}
        watchlistItems={watchlistItems}
      />

      <PositionDetailCard
        trade={activePortfolioTrade}
        timeZone={appSettings.timezone}
        onNavigate={handlePortfolioTradeNavigate}
        onCloseTrade={handleCloseTrade}
      />

      <section className="summaryGrid">
        <button
          type="button"
          className="summaryCard summaryCardButton"
          onClick={() => jumpToPageSection("portfolio", "open-positions")}
        >
          <span>Open positions</span>
          <strong>{openTrades.length}</strong>
        </button>
        <button
          type="button"
          className="summaryCard summaryCardButton"
          onClick={() => jumpToPageSection("portfolio", "order-history")}
        >
          <span>Closed trades</span>
          <strong>{closedTrades.length}</strong>
        </button>
        <button
          type="button"
          className="summaryCard summaryCardButton"
          onClick={() => jumpToPageSection("portfolio", "open-positions")}
        >
          <span>Live PnL</span>
          <strong className={positiveTone(totalOpenPnl)}>{totalOpenPnl.toFixed(2)}%</strong>
        </button>
        <button
          type="button"
          className="summaryCard summaryCardButton"
          onClick={() => jumpToPageSection("signals", "chart-panel")}
        >
          <span>Avg Brick Alpha Score</span>
          <strong>{formatScore(brickAlphaPortfolio.averageBrickAlphaScore)}</strong>
        </button>
      </section>

      <div className="splitGrid">
        <section className="panel" id="open-positions">
          <div className="panelHeader">
            <div>
              <h2>Open Positions</h2>
              <p>Open positions now carry quantity, notes, and a manual close workflow.</p>
            </div>
          </div>

          {openTrades.length ? (
            <div className="tableShell">
              <div className="tableHeaderRow positions">
                <span>Market</span>
                <span>Side</span>
                <span>Qty</span>
                <span>Entry</span>
                <span>Current</span>
                <span>PnL</span>
              </div>

              {openTrades.map((trade) => (
                <div
                  className="tableRow positions interactiveRow"
                  key={trade.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handlePortfolioTradeSelect(trade)}
                  onKeyDown={(event) => handleInteractiveKey(event, () => handlePortfolioTradeSelect(trade))}
                >
                  <div className="tableCellStack">
                    <strong>{trade.ticker}</strong>
                    <small>
                      {trade.assetClass === "collectible" ? trade.category : trade.setup} ·{" "}
                      {trade.executionMode === "live"
                        ? venueDetailLabel(providerLabel(trade.executionProvider), trade.executionPair)
                        : "Paper"}
                    </small>
                  </div>
                  <span>{trade.side}</span>
                  <span>{trade.quantity}</span>
                  <span>{formatTradePrice(trade, trade.entryPrice)}</span>
                  <span>{formatTradePrice(trade, trade.currentPrice)}</span>
                  <span className={positiveTone(trade.pnl)}>{trade.pnl.toFixed(2)}%</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No open positions yet"
              body="Use Fast Trade from the Trade page to seed your portfolio."
            />
          )}
        </section>

        <section className="panel">
          <div className="panelHeader">
            <div>
              <h2>Execution Rails</h2>
              <p>Operational lanes ready for local, offshore, crypto, and JSE flow.</p>
            </div>
          </div>

          <div className="railList">
            {RAILS.map((rail) => (
              <div className="railRow" key={rail}>
                <span className="railDot" />
                <strong>{rail}</strong>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="panel" id="order-history">
        <div className="panelHeader">
          <div>
            <h2>Order History</h2>
            <p>Full timestamps in South Africa local time.</p>
          </div>
        </div>

        {closedTrades.length ? (
          <div className="tableShell">
            <div className="tableHeaderRow historyDetailed">
              <span>Market</span>
              <span>Side</span>
              <span>Qty</span>
              <span>Status</span>
              <span>Handled</span>
              <span>Exit</span>
            </div>

            {closedTrades.map((trade) => (
              <div
                className="tableRow historyDetailed interactiveRow"
                key={trade.id}
                role="button"
                tabIndex={0}
                onClick={() => handlePortfolioTradeSelect(trade)}
                onKeyDown={(event) => handleInteractiveKey(event, () => handlePortfolioTradeSelect(trade))}
              >
                <div className="tableCellStack">
                  <strong>{trade.ticker}</strong>
                  <small>
                    {trade.exitReason || trade.setup} ·{" "}
                    {trade.executionMode === "live"
                      ? venueDetailLabel(providerLabel(trade.executionProvider), trade.executionPair)
                      : "Paper"}
                  </small>
                </div>
                <span>{trade.side}</span>
                <span>{trade.quantity}</span>
                <span>{trade.exitReason || "Closed"}</span>
                <span>{formatDateTime(trade.closedAt || trade.updatedAt, appSettings.timezone)}</span>
                <span>{formatTradePrice(trade, trade.exitPrice || trade.currentPrice)}</span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No history yet"
            body="Closed trades will land here with their exit reason and timestamp."
          />
        )}
      </section>
    </>
  );
}

export function ReportsScreen({
  activeDesk,
  activePageSections,
  appSettings,
  closedTrades,
  health,
  jumpToPageSection,
  navigateToPage,
  openTrades,
  signalsResponse,
  totalOpenPnl,
}) {
  const allTrades = useMemo(
    () =>
      [...openTrades, ...closedTrades].sort(
        (left, right) =>
          new Date(left.closedAt || left.updatedAt || left.createdAt || 0).getTime() -
          new Date(right.closedAt || right.updatedAt || right.createdAt || 0).getTime(),
      ),
    [closedTrades, openTrades],
  );
  const allSignals = useMemo(() => signalsResponse.signals || [], [signalsResponse.signals]);
  const performancePoints = useMemo(() => buildPerformancePoints(allTrades), [allTrades]);
  const exposureItems = useMemo(
    () => buildDeskExposureItems(openTrades.length ? openTrades : allTrades),
    [allTrades, openTrades],
  );
  const signalDeskItems = useMemo(() => buildSignalDeskItems(allSignals), [allSignals]);
  const actionMixItems = useMemo(() => buildActionMixItems(allSignals), [allSignals]);
  const executionModeItems = useMemo(() => buildExecutionModeItems(allTrades), [allTrades]);
  const closedTradePnls = closedTrades.map((trade) => numberOrZero(trade.pnl));
  const winCount = closedTrades.filter((trade) => numberOrZero(trade.pnl) > 0).length;
  const winRate = closedTrades.length ? (winCount / closedTrades.length) * 100 : 0;
  const avgSignalConfidence = average(allSignals.map((signal) => signal.confidence));
  const avgSignalRsi = average(allSignals.map((signal) => signal.rsi));
  const strongestSignal =
    allSignals.slice().sort((left, right) => numberOrZero(right.confidence) - numberOrZero(left.confidence))[0] ||
    null;
  const reportActions = [
    {
      id: "performance",
      label: "Performance",
      meta: `${performancePoints.length}`,
      detail: "Review the recent cumulative book curve.",
      onClick: () => jumpToPageSection("reports", "reports-performance"),
    },
    {
      id: "exposure",
      label: "Exposure",
      meta: `${exposureItems.length}`,
      detail: "See how the book is distributed across desks.",
      onClick: () => jumpToPageSection("reports", "reports-exposure"),
    },
    {
      id: "signals",
      label: "Signal Pulse",
      meta: `${allSignals.length}`,
      detail: "Check confidence, RSI, and action mix across the desk stack.",
      onClick: () => jumpToPageSection("reports", "reports-signals"),
    },
    {
      id: "portfolio",
      label: "Open Portfolio",
      meta: `${openTrades.length}`,
      detail: "Jump back into the live book for trade-by-trade review.",
      onClick: () => navigateToPage("portfolio", false, activeDesk),
    },
  ];

  return (
    <>
      <WorkspaceHero
        tone="reports"
        eyebrow="Research Center"
        title="Research Center"
        description="Performance curves, desk exposure, signal pressure, and execution analytics in one visual review workspace."
        statusLabel="Last engine tick"
        statusValue={formatDateTime(health.metrics?.lastEngineTickAt, appSettings.timezone)}
        metrics={[
          {
            label: "Tracked trades",
            value: allTrades.length,
            detail: "Open and closed positions",
          },
          {
            label: "Win rate",
            value: `${winRate.toFixed(0)}%`,
            detail: `${winCount} positive closes`,
          },
          {
            label: "Avg signal confidence",
            value: `${avgSignalConfidence.toFixed(1)}%`,
            detail: `${avgSignalRsi.toFixed(1)} RSI avg`,
          },
        ]}
        primaryAction={{
          label: "Open Portfolio",
          onClick: () => navigateToPage("portfolio", false, activeDesk),
        }}
        secondaryAction={{
          label: "Open Trade Desk",
          onClick: () => navigateToPage("signals", false, activeDesk),
        }}
      />
      <WorkspaceSectionBar
        sections={activePageSections}
        onSelect={(sectionId) => jumpToPageSection("reports", sectionId)}
      />
      <WorkspaceCommandBar
        tone="reports"
        title="Research Shortcuts"
        hint="Move between performance, exposure, signal analytics, and the live book without losing context."
        actions={reportActions}
      />

      <section className="summaryGrid" id="reports-overview">
        <div className="summaryCard">
          <span>Open book</span>
          <strong>{openTrades.length}</strong>
        </div>
        <div className="summaryCard">
          <span>Closed trades</span>
          <strong>{closedTrades.length}</strong>
        </div>
        <div className="summaryCard">
          <span>Live PnL</span>
          <strong className={positiveTone(totalOpenPnl)}>{formatSignedPercent(totalOpenPnl)}</strong>
        </div>
        <div className="summaryCard">
          <span>Strongest signal</span>
          <strong>{strongestSignal ? `${strongestSignal.action} ${strongestSignal.label}` : "Waiting"}</strong>
        </div>
      </section>

      <div className="splitGrid">
        <section className="panel" id="reports-performance">
          <div className="panelHeader">
            <div>
              <h2>Performance Curve</h2>
              <p>Cumulative trade movement from the latest book history, using the current saved portfolio state.</p>
            </div>
          </div>

          <ReportLineChart points={performancePoints} />

          <div className="reportMiniStats">
            <div className="reportMiniStat">
              <span>Best close</span>
              <strong className={positiveTone(Math.max(...closedTradePnls, 0))}>
                {closedTrades.length ? formatSignedPercent(Math.max(...closedTradePnls)) : "--"}
              </strong>
            </div>
            <div className="reportMiniStat">
              <span>Worst close</span>
              <strong className={positiveTone(Math.min(...closedTradePnls, 0))}>
                {closedTrades.length ? formatSignedPercent(Math.min(...closedTradePnls)) : "--"}
              </strong>
            </div>
            <div className="reportMiniStat">
              <span>Avg close</span>
              <strong className={positiveTone(average(closedTradePnls))}>
                {closedTrades.length ? formatSignedPercent(average(closedTradePnls)) : "--"}
              </strong>
            </div>
          </div>
        </section>

        <section className="panel" id="reports-exposure">
          <div className="panelHeader">
            <div>
              <h2>Desk Exposure</h2>
              <p>{openTrades.length ? "Open-book" : "Recent-book"} distribution across forex, ETFs, crypto, JSE, and LEGO investments.</p>
            </div>
          </div>

          {exposureItems.length ? (
            <ReportBarList items={exposureItems} valueFormatter={(value) => `${value} positions`} />
          ) : (
            <EmptyState
              title="No desk exposure yet"
              body="Once the book has a few positions, this panel will show how activity is distributed."
            />
          )}

          <div className="reportMiniStats">
            {executionModeItems.map((item) => (
              <div className="reportMiniStat" key={item.id}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <small>{item.meta}</small>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="splitGrid" id="reports-signals">
        <section className="panel">
          <div className="panelHeader">
            <div>
              <h2>Signal Pressure by Desk</h2>
              <p>Average confidence by desk, with RSI context carried in the annotation line.</p>
            </div>
          </div>

          {signalDeskItems.length ? (
            <ReportBarList items={signalDeskItems} valueFormatter={(value) => `${value.toFixed(1)}%`} />
          ) : (
            <EmptyState
              title="No signal analytics yet"
              body="When signals are flowing again, this panel will show confidence and RSI pressure by desk."
            />
          )}
        </section>

        <section className="panel">
          <div className="panelHeader">
            <div>
              <h2>Signal Mix</h2>
              <p>Quick read on whether the current stack is leaning buy, sell, or hold.</p>
            </div>
          </div>

          {actionMixItems.length ? (
            <ReportBarList items={actionMixItems} valueFormatter={(value) => `${value} setups`} />
          ) : (
            <EmptyState
              title="No signal mix yet"
              body="This panel will fill in as soon as the desk emits active setups."
            />
          )}

          <div className="reportMiniStats">
            <div className="reportMiniStat">
              <span>Feed mode</span>
              <strong>{marketModeLabel(signalsResponse.marketData?.mode)}</strong>
              <small>{signalsResponse.marketData?.provider || "Simulator"}</small>
            </div>
            <div className="reportMiniStat">
              <span>Lead signal</span>
              <strong>{signalsResponse.leadSignal?.label || "Waiting"}</strong>
              <small>{signalsResponse.leadSignal?.setup || "No setup selected yet."}</small>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

export function SubscriptionsScreen({
  activeDesk,
  activePageSections,
  alertsResponse,
  appSettings,
  jumpToPageSection,
  navigateToPage,
  notificationsResponse,
  openTrades,
  totalOpenPnl,
}) {
  const currentPlanId = appSettings.subscriptionTier || "starter";
  const currentPlan =
    ALERT_SUBSCRIPTION_OPTIONS.find((option) => option.id === currentPlanId) ||
    ALERT_SUBSCRIPTION_OPTIONS[0];
  const alertSummary = alertsResponse.summary || {};
  const alertPlan = alertsResponse.plan || currentPlan;
  const deliverySummary = alertsResponse.deliverySummary || {};
  const notificationSummary = notificationsResponse.summary || {};
  const upgradeActions = [
    {
      id: "manage-plan",
      label: "Manage Plan",
      meta: subscriptionTierLabel(currentPlanId),
      detail: "Open alert plan controls and shape what a paying client gets from delivery and alert coverage.",
      onClick: () => jumpToPageSection("settings", "alerts-plan", activeDesk),
    },
    {
      id: "daily-brief",
      label: "Daily Brief",
      meta: `${notificationSummary.unread || 0} unread`,
      detail: "Open the premium-style daily brief and see how the subscription story already lands on the Dashboard.",
      onClick: () => jumpToPageSection("home", "home-brief", activeDesk),
    },
    {
      id: "reports",
      label: "Premium Research",
      meta: `${openTrades.length} open`,
      detail: "Show partners the visual research layer that helps justify recurring value.",
      onClick: () => jumpToPageSection("reports", "reports-performance", activeDesk),
    },
    {
      id: "trade",
      label: "Open Trade Desk",
      meta: `${alertSummary.enabled || 0} active`,
      detail: "Jump back into the live signal desk where watchlists, alerts, and tickets turn into daily habit.",
      onClick: () => navigateToPage("signals", false, activeDesk),
    },
  ];
  const tierCards = ALERT_SUBSCRIPTION_OPTIONS.map((option) => {
    const isCurrent = option.id === currentPlanId;
    const features =
      option.id === "starter"
        ? [
            "Core market desks and onboarding flow",
            `${option.maxAlerts} active alert slots`,
            "In-app notifications and daily brief access",
          ]
        : option.id === "pro"
          ? [
              "Deeper alert coverage across desks",
              "Queued email delivery preview",
              "Better fit for committed daily users",
            ]
          : [
              "High-capacity alert coverage",
              "Priority workflow for heavy desk usage",
              "Strongest commercial offer for power users",
            ];

    return {
      ...option,
      isCurrent,
      features,
    };
  });
  const premiumSurfaces = [
    {
      id: "alerts",
      title: "Alerts and delivery",
      detail: "The clearest paid value layer today: more alert coverage, email-style delivery, and a stronger daily monitoring loop.",
      actionLabel: "Open alert controls",
      action: () => jumpToPageSection("settings", "alerts-plan", activeDesk),
    },
    {
      id: "brief",
      title: "Daily brief",
      detail: "A subscriber-style morning note that turns the app from a tool you visit into a service you rely on.",
      actionLabel: "Open daily brief",
      action: () => jumpToPageSection("home", "home-brief", activeDesk),
    },
    {
      id: "reports",
      title: "Research Center",
      detail: "Performance curves, desk exposure, and signal pressure are the kind of visuals clients expect from a serious product.",
      actionLabel: "Open Research Center",
      action: () => jumpToPageSection("reports", "reports-performance", activeDesk),
    },
    {
      id: "trade",
      title: "Execution desk",
      detail: "Signals, charts, RSI, structure plans, and ticket flow make the premium layers feel grounded in actual trading value.",
      actionLabel: "Open trade desk",
      action: () => navigateToPage("signals", false, activeDesk),
    },
  ];

  return (
    <>
      <WorkspaceHero
        tone="subscriptions"
        eyebrow="Commercial Layer"
        title="Subscriptions"
        description="Plan tiers, premium product value, and the upgrade path that turns Brick Alpha into a credible subscription business."
        statusLabel="Current plan"
        statusValue={subscriptionTierLabel(currentPlanId)}
        metrics={[
          {
            label: "Alert coverage",
            value: `${alertSummary.total || 0}/${alertSummary.maxAllowed || alertPlan.maxAlerts || currentPlan.maxAlerts}`,
            detail: `${alertSummary.remaining ?? Math.max((alertPlan.maxAlerts || currentPlan.maxAlerts) - (alertSummary.total || 0), 0)} slots left`,
          },
          {
            label: "Unread notifications",
            value: notificationSummary.unread || 0,
            detail: `${deliverySummary.queued || 0} email-style deliveries queued`,
          },
          {
            label: "Open book",
            value: openTrades.length,
            detail: Number.isFinite(totalOpenPnl)
              ? `${totalOpenPnl >= 0 ? "+" : ""}${totalOpenPnl.toFixed(2)}% live PnL`
              : "No live PnL yet",
          },
        ]}
        primaryAction={{
          label: "Manage Alert Plan",
          onClick: () => jumpToPageSection("settings", "alerts-plan", activeDesk),
        }}
        secondaryAction={{
          label: "Open Research Center",
          onClick: () => jumpToPageSection("reports", "reports-performance", activeDesk),
        }}
      />
      <WorkspaceSectionBar
        sections={activePageSections}
        onSelect={(sectionId) => jumpToPageSection("subscriptions", sectionId, activeDesk)}
      />
      <WorkspaceCommandBar
        tone="subscriptions"
        title="Commercial Shortcuts"
        hint="Move between the current plan, premium surfaces, and the app areas that sell the value best."
        actions={upgradeActions}
      />

      <section className="summaryGrid" id="subscriptions-overview">
        <div className="summaryCard summaryCardAccent">
          <span>Current tier</span>
          <strong>{subscriptionTierLabel(currentPlanId)}</strong>
          <small>{currentPlan.description}</small>
        </div>
        <div className="summaryCard">
          <span>Alert slots</span>
          <strong>{alertPlan.maxAlerts || currentPlan.maxAlerts}</strong>
          <small>{alertSummary.enabled || 0} enabled right now</small>
        </div>
        <div className="summaryCard">
          <span>Email eligibility</span>
          <strong>{alertPlan.emailEnabled ? "Enabled" : "Planned"}</strong>
          <small>{deliverySummary.queued || 0} queued deliveries</small>
        </div>
        <div className="summaryCard">
          <span>Premium habit loop</span>
          <strong>{notificationSummary.unread || 0} unread</strong>
          <small>Notifications, brief, and alerts are reinforcing daily return.</small>
        </div>
      </section>

      <div className="splitGrid">
        <section className="panel subscriptionNarrativePanel">
          <div className="panelHeader">
            <div>
              <h2>What clients should feel</h2>
              <p>This screen is where we make the commercial story legible: trust, habit, and a clearer reason to upgrade.</p>
            </div>
          </div>

          <div className="subscriptionPillRow">
            <span className="signalMiniTag">Signals with context</span>
            <span className="signalMiniTag">Daily brief</span>
            <span className="signalMiniTag">Watchlists and alerts</span>
            <span className="signalMiniTag">Research and analytics</span>
            <span className="signalMiniTag">Tools and execution</span>
          </div>

          <ul className="subscriptionFeatureList">
            <li>
              <strong>Starter</strong>
              <span>Enough to explore the platform, understand the signal engine, and build trust with light alerting.</span>
            </li>
            <li>
              <strong>Pro</strong>
              <span>The first serious paid plan, with meaningful alert capacity and delivery that supports daily use.</span>
            </li>
            <li>
              <strong>Elite</strong>
              <span>A higher-coverage lane for heavier desks, more notifications, and the most demanding subscribers.</span>
            </li>
          </ul>

          <div className="panelActions">
            <button
              type="button"
              className="primaryButton"
              onClick={() => jumpToPageSection("settings", "alerts-plan", activeDesk)}
            >
              Open Alert Plan Controls
            </button>
            <button
              type="button"
              className="ghostButton"
              onClick={() => jumpToPageSection("home", "home-brief", activeDesk)}
            >
              Review Daily Brief
            </button>
          </div>
        </section>

        <section className="panel">
          <div className="panelHeader">
            <div>
              <h2>Current subscriber posture</h2>
              <p>An honest read on where the product already feels monetization-ready and where the value is strongest today.</p>
            </div>
          </div>

          <div className="subscriptionValueGrid">
            <div className="briefNoteCard">
              <strong>Daily service value</strong>
              <p>The daily brief, live notifications, and signal desk together already feel closer to a service than a one-off dashboard.</p>
            </div>
            <div className="briefNoteCard">
              <strong>Best upsell surface</strong>
              <p>Alert capacity and delivery are the clearest premium lever because users immediately understand the difference in daily utility.</p>
            </div>
            <div className="briefNoteCard">
              <strong>Trust layer</strong>
              <p>Research, RSI visibility, and honest feed status keep the subscription story anchored in credibility instead of marketing copy.</p>
            </div>
          </div>
        </section>
      </div>

      <section className="panel" id="subscriptions-tiers">
        <div className="panelHeader">
          <div>
            <h2>Plan Tiers</h2>
            <p>Three simple steps from discovery to power-user coverage, without overcomplicating the commercial story.</p>
          </div>
        </div>

        <div className="subscriptionTierGrid">
          {tierCards.map((card) => (
            <article
              key={card.id}
              className={`subscriptionTierCard ${card.isCurrent ? "subscriptionTierCardActive" : ""}`.trim()}
            >
              <div className="subscriptionTierTop">
                <div>
                  <span className="collectibleCategory">{card.label}</span>
                  <h3>{card.maxAlerts} alert slots</h3>
                </div>
                {card.isCurrent ? <span className="subscriptionTierBadge">Current</span> : null}
              </div>

              <p>{card.description}</p>

              <ul className="subscriptionFeatureList">
                {card.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>

              <div className="panelActions">
                <button
                  type="button"
                  className={card.isCurrent ? "ghostButton" : "primaryButton"}
                  onClick={() => jumpToPageSection("settings", "alerts-plan", activeDesk)}
                >
                  {card.isCurrent ? "Manage in Settings" : `View ${card.label} Setup`}
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel" id="subscriptions-premium">
        <div className="panelHeader">
          <div>
            <h2>Premium Surfaces Inside the App</h2>
            <p>These are the places where the product already shows the difference between a nice tool and a paid daily service.</p>
          </div>
        </div>

        <div className="subscriptionRouteList">
          {premiumSurfaces.map((surface) => (
            <div className="subscriptionRouteItem" key={surface.id}>
              <div>
                <strong>{surface.title}</strong>
                <small>{surface.detail}</small>
              </div>
              <button type="button" className="ghostButton" onClick={surface.action}>
                {surface.actionLabel}
              </button>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

export function ConnectionsScreen({
  activeDesk,
  activePageSections,
  appSettings,
  connectedProviderCount,
  connectorBusyKey,
  connectorForms,
  connectors,
  cryptoConnector,
  degradedSourceCount,
  disconnectConnector,
  handleConnectorFieldChange,
  health,
  jumpToPageSection,
  liveReadyDeskCount,
  newsResponse,
  refreshContext,
  refreshCore,
  saveConnector,
  settingsStatus,
  signalsResponse,
  syncConnectorBalances,
  testConnectorConnection,
  updateExecutionProfile,
}) {
  const deskLeadSignal =
    signalsResponse.signals?.find((signal) => signal.desk === activeDesk) ||
    signalsResponse.leadSignal ||
    null;
  const indicativePrice = Number(deskLeadSignal?.price || 0);
  const depthStep =
    activeDesk === "crypto"
      ? Math.max(indicativePrice * 0.001, 5)
      : activeDesk === "forex"
        ? 0.01
        : Math.max(indicativePrice * 0.002, 0.1);
  const marketDepthRows = indicativePrice
    ? Array.from({ length: 5 }).map((_, index) => {
        const level = index + 1;
        const bid = Number((indicativePrice - depthStep * level).toFixed(4));
        const ask = Number((indicativePrice + depthStep * level).toFixed(4));
        return {
          level,
          bid,
          ask,
          bidSize: Math.max(1, 8 - index) * (activeDesk === "crypto" ? 0.25 : 1000),
          askSize: Math.max(1, 7 - index) * (activeDesk === "crypto" ? 0.22 : 900),
        };
      })
    : [];
  const upcomingCalendarItems = [
    {
      id: "cpi-za",
      time: "Wed 08:00",
      market: "South Africa",
      event: "CPI YoY",
      impact: "High",
      note: "Watch JSE risk tone and USD/ZAR volatility.",
    },
    {
      id: "fed-minutes",
      time: "Wed 20:00",
      market: "United States",
      event: "FOMC Minutes",
      impact: "High",
      note: "Can reset macro tone across forex, crypto, and ETFs.",
    },
    {
      id: "gdp-us",
      time: "Thu 14:30",
      market: "United States",
      event: "GDP Second Estimate",
      impact: "Medium",
      note: "Useful for ETF desk bias and broad risk sentiment.",
    },
    {
      id: "pce-us",
      time: "Fri 14:30",
      market: "United States",
      event: "Core PCE",
      impact: "High",
      note: "Key inflation release for rates, FX, and crypto reaction.",
    },
  ];
  const apiCoverageCards = [
    {
      id: "market-data",
      label: "Market Data API",
      value: signalsResponse.marketData?.provider || "Simulator",
      detail:
        signalsResponse.marketData?.mode === "simulated"
          ? "Live candle connection is staged, with simulator fallback active."
          : "Live candle connection is active for the current session.",
    },
    {
      id: "news-feeds",
      label: "News Feed APIs",
      value: `${(newsResponse.sourceStatus || []).length}`,
      detail: "RSS and feed ingestion power the macro tape and headline routing.",
    },
    {
      id: "execution",
      label: "Execution APIs",
      value: connectedProviderCount,
      detail: "VALR is the active live-route candidate; other brokers stay manual until OAuth or gateway setup is complete.",
    },
    {
      id: "banking",
      label: "Banking APIs",
      value: "Planned",
      detail:
        "South African bank funding and statement connectivity are mapped next for FNB, Absa, Nedbank, Standard Bank, and Capitec once provider selection is locked.",
    },
    {
      id: "calendar",
      label: "Economic Calendar API",
      value: "Staged",
      detail: "Calendar surface is ready in-app; provider integration is the next step.",
    },
    {
      id: "depth",
      label: "Level 2 / Depth",
      value: activeDesk === "crypto" ? "Best candidate" : "Planned",
      detail: "Market depth fits best where the broker or exchange exposes order book data cleanly.",
    },
  ];
  const connectionActions = [
    {
      id: "brokers",
      label: "Broker Connections",
      meta: `${connectedProviderCount}`,
      detail: "Open credentials, tests, and live account sync controls.",
      onClick: () => jumpToPageSection("connections", "broker-connections", activeDesk),
    },
    {
      id: "feed",
      label: "Market Feed",
      meta: signalsResponse.marketData?.provider || "Simulator",
      detail: "Check candle source health and live data status.",
      onClick: () => jumpToPageSection("connections", "market-feed-status", activeDesk),
    },
    {
      id: "apis",
      label: "API Coverage",
      meta: "Matrix",
      detail: "Review what is live, staged, manual, or still planned.",
      onClick: () => jumpToPageSection("connections", "api-coverage", activeDesk),
    },
    {
      id: "calendar",
      label: "Calendar",
      meta: `${upcomingCalendarItems.length}`,
      detail: "See the upcoming macro events that can move the desk.",
      onClick: () => jumpToPageSection("connections", "economic-calendar", activeDesk),
    },
  ];

  return (
    <>
      <WorkspaceHero
        tone="connections"
        eyebrow="Platform Routing"
        title="Connections"
        description="Broker routing, execution modes, market feed health, and live readiness in one operational screen."
        statusLabel="Market feed"
        statusValue={marketModeLabel(signalsResponse.marketData?.mode)}
        metrics={[
          {
            label: "Providers",
            value: connectedProviderCount,
            detail: "Configured connectors",
          },
          {
            label: "Live-ready desks",
            value: liveReadyDeskCount,
            detail: "Safe to route live",
          },
          {
            label: "Feed issues",
            value: degradedSourceCount,
            detail: "Market intelligence needing attention",
          },
        ]}
        primaryAction={{
          label: "Review Brokers",
          onClick: () => jumpToPageSection("connections", "broker-connections", activeDesk),
        }}
        secondaryAction={{
          label: "Refresh Health",
          onClick: () => {
            refreshCore();
            refreshContext();
          },
        }}
      />
      <WorkspaceSectionBar
        sections={activePageSections}
        onSelect={(sectionId) => jumpToPageSection("connections", sectionId, activeDesk)}
      />
      <WorkspaceCommandBar
        tone="connections"
        title="Routing Shortcuts"
        hint="Stay close to feeds, brokers, and the partner handoff from one operational screen."
        actions={connectionActions}
      />

      {settingsStatus ? <div className="statusBanner">{settingsStatus}</div> : null}

      <section className="summaryGrid">
        <div className="summaryCard">
          <span>Configured providers</span>
          <strong>{connectedProviderCount}</strong>
        </div>
        <div className="summaryCard">
          <span>Live-ready desks</span>
          <strong>{liveReadyDeskCount}</strong>
        </div>
        <div className="summaryCard">
          <span>Feed issues</span>
          <strong>{degradedSourceCount}</strong>
        </div>
        <div className="summaryCard">
          <span>Candle provider</span>
          <strong>{signalsResponse.marketData?.provider || "Simulator"}</strong>
        </div>
      </section>

      <section className="panel" id="api-coverage">
        <div className="panelHeader">
          <div>
            <h2>API Coverage</h2>
            <p>Keep the integration picture honest: what is live now, what is staged, and what still needs provider work.</p>
          </div>
        </div>

        <div className="deskBriefGrid">
          {apiCoverageCards.map((card) => (
            <div className="deskBriefCard" key={card.id}>
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              <small>{card.detail}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="panel" id="connections-overview">
        <div className="panelHeader">
          <div>
            <h2>Execution Modes</h2>
            <p>
              Keep every desk in paper mode by default. Crypto can route live through VALR once the
              connector is configured.
            </p>
          </div>
        </div>

        <div className="executionModeList">
          {MARKET_DESKS.map((desk) => {
            const profile =
              appSettings.executionProfiles?.[desk.id] ||
              DEFAULT_EXECUTION_PROFILES[desk.id];
            const liveCapable = desk.id === "crypto";
            const connectorStatus = liveCapable
              ? cryptoConnector?.status || "not_configured"
              : profile.providerId === "ibkr"
                ? "manual_setup"
                : profile.providerId === "saxo"
                  ? "manual_setup"
                  : "unsupported";

            return (
              <div className="executionModeRow" key={desk.id}>
                <div className="executionModeSummary">
                  <span className="connectorDesk">{desk.label}</span>
                  <strong>{providerLabel(profile.providerId)}</strong>
                  <small>
                    {liveCapable
                      ? profile.mode === "live"
                        ? `Live routing enabled through ${providerLabel(profile.providerId)} on ${
                            cryptoConnector?.config?.preferredPair || profile.pair
                          }.`
                        : "Paper mode keeps crypto orders inside Brick Alpha until you deliberately switch."
                      : "This desk is still paper-first until its provider OAuth or gateway flow is completed."}
                  </small>
                </div>

                <div className="executionModeControls">
                  <div className="segmentedControl">
                    <button
                      type="button"
                      className={profile.mode === "paper" ? "active" : ""}
                      onClick={() => updateExecutionProfile(desk.id, { mode: "paper" })}
                    >
                      Paper
                    </button>
                    <button
                      type="button"
                      className={profile.mode === "live" ? "active" : ""}
                      onClick={() => updateExecutionProfile(desk.id, { mode: "live" })}
                      disabled={!liveCapable}
                    >
                      {liveCapable ? "Live" : "Planned"}
                    </button>
                  </div>

                  <div className={`connectorStatus ${statusTone(connectorStatus)}`}>
                    {humanizeStatus(connectorStatus)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {appSettings.executionProfiles?.crypto?.mode === "live" && !cryptoConnector?.configured ? (
          <div className="statusBanner warningBanner">
            <strong>Crypto live mode is armed, but VALR is not ready yet.</strong>
            <span>Save and test your VALR credentials below before sending a live BTC order.</span>
          </div>
        ) : null}
      </section>

      <section className="panel" id="broker-connections">
        <div className="panelHeader">
          <div>
            <h2>Broker and Venue Connections</h2>
            <p>Save credentials, test access, and sync live account state where the provider supports it.</p>
          </div>
        </div>

        <div className="connectorList">
          {connectors.map((provider) => (
            <ConnectorCard
              key={provider.id}
              provider={provider}
              timeZone={appSettings.timezone}
              formValues={connectorForms?.[provider.id] || {}}
              busyKey={connectorBusyKey}
              onFieldChange={handleConnectorFieldChange}
              onSave={saveConnector}
              onTest={testConnectorConnection}
              onSync={syncConnectorBalances}
              onDisconnect={disconnectConnector}
            />
          ))}
        </div>
      </section>

      <div className="splitGrid">
        <section className="panel" id="market-depth">
          <div className="panelHeader">
            <div>
              <h2>Market Depth / Level 2</h2>
              <p>Indicative order-book style depth for the active desk until a provider-backed Level 2 feed is connected.</p>
            </div>
            <div className="headerStatus">
              <span>Desk</span>
              <strong>{labelDesk(activeDesk)}</strong>
            </div>
          </div>

          {marketDepthRows.length ? (
            <div className="tableShell">
              <div className="tableHeaderRow history">
                <span>Level</span>
                <span>Bid</span>
                <span>Bid Size</span>
                <span>Ask</span>
                <span>Ask Size</span>
              </div>

              {marketDepthRows.map((row) => (
                <div className="tableRow history" key={row.level}>
                  <span>L{row.level}</span>
                  <span>{formatTickerPrice(deskLeadSignal?.ticker, row.bid)}</span>
                  <span>{row.bidSize}</span>
                  <span>{formatTickerPrice(deskLeadSignal?.ticker, row.ask)}</span>
                  <span>{row.askSize}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Depth view is waiting for an active market"
              body="Once the desk has a live reference price, the app can show a staged Level 2 surface here."
            />
          )}
        </section>

        <section className="panel" id="economic-calendar">
          <div className="panelHeader">
            <div>
              <h2>Economic Calendar</h2>
              <p>Upcoming macro events and central-bank moments that can move the trading screens.</p>
            </div>
          </div>

          <div className="tableShell">
            <div className="tableHeaderRow history">
              <span>Time</span>
              <span>Market</span>
              <span>Event</span>
              <span>Impact</span>
              <span>Desk Note</span>
            </div>

            {upcomingCalendarItems.map((item) => (
              <div className="tableRow history" key={item.id}>
                <span>{item.time}</span>
                <span>{item.market}</span>
                <span>{item.event}</span>
                <span className={statusTone(item.impact === "High" ? "warning" : "watch")}>{item.impact}</span>
                <span>{item.note}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="splitGrid">
        <section className="panel">
          <div className="panelHeader">
            <div>
              <h2>System Health</h2>
              <p>Useful when you are checking if the desk is ready for a live session.</p>
            </div>
          </div>

          <div className="healthList">
            {Object.entries(health.services || {}).map(([service, status]) => (
              <div className="healthRow" key={service}>
                <span>{service}</span>
                <strong className={statusTone(status)}>{status}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="panel" id="market-feed-status">
          <div className="panelHeader">
            <div>
              <h2>Market Feed Status</h2>
              <p>
                Twelve Data powers live candles when a key is configured. The simulator stays available as a
                fallback.
              </p>
            </div>
          </div>

          {signalsResponse.marketData?.mode === "simulated" ? (
            <div className="statusBanner">
              Add `TWELVE_DATA_API_KEY` in the server environment and restart the API to switch these markets
              from simulator candles to live provider data.
            </div>
          ) : null}

          <div className="tableShell">
            <div className="tableHeaderRow history">
              <span>Market</span>
              <span>Provider</span>
              <span>Status</span>
              <span>Points</span>
              <span>Detail</span>
            </div>

            {(signalsResponse.marketData?.sourceStatus || health.marketSources || []).map((source) => (
              <div className="tableRow history" key={source.ticker}>
                <span>{source.label}</span>
                <span>{source.provider}</span>
                <span className={statusTone(source.status)}>{source.status}</span>
                <span>{source.points ?? 0}</span>
                <span>{source.detail || "Healthy"}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="panel" id="source-status">
        <div className="panelHeader">
          <div>
            <h2>Market Intelligence Status</h2>
            <p>Feed-level visibility so you can see what is loading and what is degraded.</p>
          </div>
        </div>

        <div className="tableShell">
          <div className="tableHeaderRow history">
            <span>Market Intelligence</span>
            <span>Region</span>
            <span>Status</span>
            <span>Items</span>
            <span>Detail</span>
          </div>

          {(newsResponse.sourceStatus || health.sources || []).map((source) => (
            <div className="tableRow history" key={source.id}>
              <span>{source.name}</span>
              <span>{labelRegion(source.region)}</span>
              <span className={statusTone(source.status)}>{source.status}</span>
              <span>{source.items ?? 0}</span>
              <span>{source.detail || "Healthy"}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

export function SettingsScreen({
  activeDesk,
  activePageSections,
  addTarget,
  alertsResponse,
  appSettings,
  connectedProviderCount,
  currentUser,
  feedbackBusyKey,
  feedbackForm,
  feedbackResponse,
  feedbackStatus,
  installActionLabel,
  installHint,
  installStatus,
  isAppInstalled,
  jumpToPageSection,
  liveReadyDeskCount,
  navigateToPage,
  onInstallApp,
  setFeedbackForm,
  settingsStatus,
  shareStatus,
  setTargetInput,
  submitFeedback,
  targetInput,
  targets,
  updateFeedbackStatus,
  updateSettings,
  onDemoReset,
  legoJourney = false,
}) {
  const feedbackItems = useMemo(() => feedbackResponse.items || [], [feedbackResponse.items]);
  const feedbackSummary = feedbackResponse.summary || {};
  const canManageFeedback = currentUser.role === "owner";
  const shareIsLive = shareStatus?.status === "live" && shareStatus?.publicUrl;
  const alertSummary = alertsResponse.summary || {};
  const alertPlan = alertsResponse.plan || {};
  const deliverySummary = alertsResponse.deliverySummary || {};
  const deliveryQueue = alertsResponse.deliveryQueue || [];
  const planAllowsEmail = Boolean(alertPlan.emailEnabled);
  const [feedbackStatusFilter, setFeedbackStatusFilter] = useState("open");
  const [feedbackAreaFilter, setFeedbackAreaFilter] = useState("all");
  const openPartnerStep = (step) => {
    jumpToPageSection(step.page, step.sectionId, step.desk || activeDesk);
  };
  const feedbackAreaOptions = useMemo(
    () => ["all", ...new Set(feedbackItems.map((item) => item.area).filter(Boolean))],
    [feedbackItems],
  );
  const filteredFeedbackItems = useMemo(() => {
    return feedbackItems.filter((item) => {
      const matchesStatus =
        feedbackStatusFilter === "all"
          ? true
          : feedbackStatusFilter === "open"
            ? item.status !== "resolved"
            : item.status === feedbackStatusFilter;
      const matchesArea = feedbackAreaFilter === "all" ? true : item.area === feedbackAreaFilter;
      return matchesStatus && matchesArea;
    });
  }, [feedbackAreaFilter, feedbackItems, feedbackStatusFilter]);
  const partnerInviteMessage = [
    "Brick Alpha partner test pass",
    "",
    `Access: ${shareIsLive ? shareStatus.publicUrl : shareStatus?.localUrl || "http://127.0.0.1:5000"}`,
    "",
    "Suggested pass:",
    ...PARTNER_TEST_FLOW.map((step) => `${step.ordinal}. ${step.title} - ${step.detail}`),
    "",
    "Please leave feedback inside the app under Settings -> Feedback Board.",
  ].join("\n");
  const copyPartnerInvite = async () => {
    if (!navigator.clipboard?.writeText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(partnerInviteMessage);
    } catch {
      // Ignore clipboard errors; the invite text still renders on screen.
    }
  };
  const settingsActions = [
    {
      id: "install",
      label: "Install App",
      meta: isAppInstalled ? "Installed" : "Mobile-ready",
      detail: "Pin Brick Alpha to a phone home screen for a cleaner partner demo.",
      onClick: () => jumpToPageSection("settings", "install-app"),
    },
    {
      id: "alerts",
      label: "Alert Plan",
      meta: `${alertSummary.total || 0}/${alertSummary.maxAllowed || alertPlan.maxAlerts || 5}`,
      detail: "Set the subscriber tier, delivery channels, and queue behavior.",
      onClick: () => jumpToPageSection("settings", "alerts-plan"),
    },
    {
      id: "routine",
      label: "Routine",
      meta: appSettings.routinePreferences?.remindersEnabled === false ? "Muted" : "Live",
      detail: "Tune daily nudges, workflow tone, and the completion moment on the Dashboard.",
      onClick: () => jumpToPageSection("settings", "routine-preferences"),
    },
    {
      id: "partner",
      label: "Partner Testing",
      meta: shareIsLive ? "Live" : "Private",
      detail: "Open the tester brief, share state, and partner checklist.",
      onClick: () => jumpToPageSection("settings", "partner-testing"),
    },
    {
      id: "feedback",
      label: "Feedback Board",
      meta: `${feedbackSummary.open || 0} open`,
      detail: "Review structured tester notes and triage them in the app.",
      onClick: () => jumpToPageSection("settings", "feedback-board"),
    },
    {
      id: "targets",
      label: "Saved Targets",
      meta: `${targets.length}`,
      detail: "Jump to the saved targets and monitoring preferences.",
      onClick: () => jumpToPageSection("settings", "web-targets"),
    },
    {
      id: "connections",
      label: "Connections",
      meta: `${connectedProviderCount} linked`,
      detail: "Move into feeds and brokers when account setup needs attention.",
      onClick: () => navigateToPage("connections", false, activeDesk),
    },
    {
      id: "subscriptions",
      label: "Subscriptions",
      meta: subscriptionTierLabel(appSettings.subscriptionTier),
      detail: "Open the commercial layer and review the plan story partners and clients will see.",
      onClick: () => navigateToPage("subscriptions", false, activeDesk),
    },
  ];

  return (
    <>
      <WorkspaceHero
        tone="settings"
        eyebrow="Workspace Setup"
        title="Settings"
        description={
          legoJourney
            ? "Account, exchange rate, and demo controls. Valuations use this one USD/ZAR rate."
            : "Account details, regional preferences, and saved desk targets for your daily workflow."
        }
        statusLabel="Signed in"
        statusValue={currentUser.email}
        metrics={[
          {
            label: "Region",
            value: labelRegion(appSettings.preferredRegion),
            detail: appSettings.timezone,
          },
          {
            label: "Alert plan",
            value: subscriptionTierLabel(appSettings.subscriptionTier),
            detail: `${alertSummary.total || 0}/${alertSummary.maxAllowed || alertPlan.maxAlerts || 5} slots used`,
          },
          {
            label: "Partner board",
            value: feedbackSummary.total || 0,
            detail: canManageFeedback ? "Owner triage enabled" : "Shared testing lane",
          },
        ]}
        primaryAction={
          legoJourney
            ? undefined
            : {
                label: "Open Connections",
                onClick: () => navigateToPage("connections", false, activeDesk),
              }
        }
        secondaryAction={
          legoJourney
            ? undefined
            : {
                label: "Open News",
                onClick: () => jumpToPageSection("news", "macro-feed", activeDesk),
              }
        }
      />
      <WorkspaceSectionBar
        sections={activePageSections}
        onSelect={(sectionId) => jumpToPageSection("settings", sectionId, activeDesk)}
      />
      <WorkspaceCommandBar
        tone="settings"
        title="Workspace Shortcuts"
        hint="Keep account setup, partner feedback, and targets close at hand."
        actions={legoJourney ? settingsActions.filter((action) => action.id !== "connections") : settingsActions}
      />

      {settingsStatus ? <div className="statusBanner">{settingsStatus}</div> : null}

      <div className="splitGrid">
        <section className="panel" id="account-settings">
          <div className="panelHeader">
            <div>
              <h2>Account</h2>
              <p>Signed in as {currentUser.email}</p>
            </div>
          </div>

          <div className="profileBlock">
            <div>
              <span>Name</span>
              <strong>{currentUser.name}</strong>
            </div>
            <div>
              <span>Last login</span>
              <strong>{formatDateTime(currentUser.lastLoginAt, appSettings.timezone)}</strong>
            </div>
            <div>
              <span>Timezone</span>
              <strong>{appSettings.timezone}</strong>
            </div>
            <div>
              <span>Role</span>
              <strong>{canManageFeedback ? "Owner" : "Partner tester"}</strong>
            </div>
          </div>

          {currentUser.isDemo ? (
            <div className="subPanel">
              <div className="panelHeader">
                <div>
                  <h3>Demo reset</h3>
                  <p>Restart with a fresh demo account, seeded portfolio, and watchlist.</p>
                </div>
              </div>
              <div className="panelActions">
                <button type="button" className="primaryButton" onClick={onDemoReset}>
                  Reset Demo
                </button>
              </div>
            </div>
          ) : null}
        </section>

        <section className="panel" id="install-app">
          <div className="panelHeader">
            <div>
              <h2>Install App</h2>
              <p>Use the live web system like an app on a phone home screen for the cleanest Tuesday demo.</p>
            </div>
          </div>

          <div className="summaryGrid compactSummaryGrid">
            <div className="summaryCard">
              <span>Status</span>
              <strong>{isAppInstalled ? "Installed" : "Ready to install"}</strong>
            </div>
            <div className="summaryCard">
              <span>Access</span>
              <strong>{shareIsLive ? "Public link live" : "Local or staging"}</strong>
            </div>
            <div className="summaryCard">
              <span>Best use</span>
              <strong>Phone demo</strong>
            </div>
          </div>

          <div className="subPanel">
            <div className="panelHeader">
              <div>
                <h3>Install path</h3>
                <p>{installHint}</p>
              </div>
            </div>

            <div className="toolCardList">
              <button type="button" className="toolCard toolCardButton" onClick={onInstallApp}>
                <span>Install Brick Alpha</span>
                <strong>{installActionLabel}</strong>
                <small>{shareIsLive ? `Best on the public demo link: ${shareStatus.publicUrl}` : "Works on a public demo or production-style staging link."}</small>
              </button>
            </div>

            {installStatus ? <div className="statusBanner subtleBanner">{installStatus}</div> : null}
          </div>
        </section>

        <section className="panel" id="news-region">
          <div className="panelHeader">
            <div>
              <h2>News Region</h2>
              <p>Keep your dashboard focused on South Africa, global flow, or both.</p>
            </div>
          </div>

          <div className="segmentedControl">
            {["south-africa", "global", "all"].map((region) => (
              <button
                type="button"
                key={region}
                className={appSettings.preferredRegion === region ? "active" : ""}
                onClick={() => updateSettings({ preferredRegion: region })}
              >
                {labelRegion(region)}
              </button>
            ))}
          </div>
        </section>

        <section className="panel" id="exchange-rate">
          <div className="panelHeader">
            <div>
              <h2>Exchange rate</h2>
              <p>One USD/ZAR rate for every converted valuation. Default R18.50 / USD.</p>
            </div>
          </div>
          <form
            className="v3ExchangeForm"
            onSubmit={(event) => {
              event.preventDefault();
              const formRate = Number(new FormData(event.currentTarget).get("usdZarRate"));
              updateSettings({ usdZarRate: formRate });
            }}
          >
            <label>
              Rand per US dollar
              <input
                name="usdZarRate"
                type="number"
                min="0.01"
                step="0.01"
                defaultValue={appSettings.usdZarRate}
                key={appSettings.usdZarRate}
              />
            </label>
            <button type="submit" className="primaryButton">Save rate</button>
          </form>
        </section>
      </div>

      <section className="panel" id="alerts-plan">
        <div className="panelHeader">
          <div>
            <h2>Alert Plan and Delivery</h2>
            <p>Shape the subscriber experience: plan tier, alert slot budget, and how triggered setups should reach you.</p>
          </div>
          <div className="headerStatus">
            <span>Slots used</span>
            <strong>
              {alertSummary.total || 0}/{alertSummary.maxAllowed || alertPlan.maxAlerts || 5}
            </strong>
          </div>
        </div>

        <div className="summaryGrid compactSummaryGrid">
          <div className="summaryCard">
            <span>Current plan</span>
            <strong>{subscriptionTierLabel(appSettings.subscriptionTier)}</strong>
          </div>
          <div className="summaryCard">
            <span>Remaining slots</span>
            <strong>{alertSummary.remaining ?? Math.max((alertPlan.maxAlerts || 5) - (alertSummary.total || 0), 0)}</strong>
          </div>
          <div className="summaryCard">
            <span>Delivery</span>
            <strong>{appSettings.alertPreferences?.inAppEnabled === false ? "Paused" : "In-app live"}</strong>
          </div>
          <div className="summaryCard">
            <span>Email queue</span>
            <strong>{deliverySummary.queued || 0}</strong>
          </div>
        </div>

        {alertSummary.overLimit ? (
          <div className="statusBanner subtleBanner">
            This plan is carrying {alertSummary.overLimit} more alert slots than it allows. Remove older rules or move back up a tier before adding new ones.
          </div>
        ) : null}

        <div className="subPanel">
          <div className="panelHeader">
            <div>
              <h3>Subscriber tier</h3>
              <p>Use these tiers to shape what a future paying client gets from alerting.</p>
            </div>
          </div>

          <div className="segmentedControl">
            {ALERT_SUBSCRIPTION_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={appSettings.subscriptionTier === option.id ? "active" : ""}
                onClick={() => updateSettings({ subscriptionTier: option.id })}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="summaryGrid compactSummaryGrid">
            {ALERT_SUBSCRIPTION_OPTIONS.map((option) => (
              <div
                key={option.id}
                className={`summaryCard ${appSettings.subscriptionTier === option.id ? "summaryCardAccent" : ""}`}
              >
                <span>{option.label}</span>
                <strong>{option.maxAlerts} alert slots</strong>
                <small>{option.description}</small>
              </div>
            ))}
          </div>
        </div>

        <div className="splitGrid">
          <section className="subPanel">
            <div className="panelHeader">
              <div>
                <h3>Delivery channels</h3>
                <p>In-app alerts are live now. Email stays honest as a launch-stage delivery queue until the sender is connected.</p>
              </div>
            </div>

            <div className="segmentedControl">
              <button
                type="button"
                className={appSettings.alertPreferences?.inAppEnabled !== false ? "active" : ""}
                onClick={() =>
                  updateSettings({
                    alertPreferences: {
                      ...appSettings.alertPreferences,
                      inAppEnabled: true,
                    },
                  })
                }
              >
                In-app On
              </button>
              <button
                type="button"
                className={appSettings.alertPreferences?.inAppEnabled === false ? "active" : ""}
                onClick={() =>
                  updateSettings({
                    alertPreferences: {
                      ...appSettings.alertPreferences,
                      inAppEnabled: false,
                    },
                  })
                }
              >
                In-app Off
              </button>
            </div>

            <div className="segmentedControl">
              <button
                type="button"
                className={appSettings.alertPreferences?.emailEnabled ? "active" : ""}
                disabled={!planAllowsEmail}
                onClick={() =>
                  updateSettings({
                    alertPreferences: {
                      ...appSettings.alertPreferences,
                      emailEnabled: true,
                    },
                  })
                }
              >
                Email Queue On
              </button>
              <button
                type="button"
                className={!appSettings.alertPreferences?.emailEnabled ? "active" : ""}
                onClick={() =>
                  updateSettings({
                    alertPreferences: {
                      ...appSettings.alertPreferences,
                      emailEnabled: false,
                    },
                  })
                }
              >
                Email Queue Off
              </button>
            </div>

            {!planAllowsEmail ? (
              <div className="statusBanner subtleBanner">
                Starter keeps alerting in-app only. Move to Pro or Elite to stage queued email delivery.
              </div>
            ) : null}
          </section>

          <section className="subPanel">
            <div className="panelHeader">
              <div>
                <h3>Digest timing</h3>
                <p>Choose how queued email alerts should be grouped once outbound delivery is connected.</p>
              </div>
            </div>

            <div className="segmentedControl">
              {["instant", "hourly", "daily"].map((windowKey) => (
                <button
                  key={windowKey}
                  type="button"
                  className={appSettings.alertPreferences?.digestWindow === windowKey ? "active" : ""}
                  onClick={() =>
                    updateSettings({
                      alertPreferences: {
                        ...appSettings.alertPreferences,
                        digestWindow: windowKey,
                      },
                    })
                  }
                >
                  {alertDigestWindowLabel(windowKey)}
                </button>
              ))}
            </div>

            <div className="summaryGrid compactSummaryGrid">
              <div className="summaryCard">
                <span>Current mode</span>
                <strong>{alertDigestWindowLabel(appSettings.alertPreferences?.digestWindow)}</strong>
              </div>
              <div className="summaryCard">
                <span>Email eligible</span>
                <strong>{planAllowsEmail ? "Yes" : "No"}</strong>
              </div>
              <div className="summaryCard">
                <span>Queue state</span>
                <strong>{deliverySummary.queued || 0} pending</strong>
              </div>
            </div>
          </section>
        </div>

        <div className="subPanel">
          <div className="panelHeader">
            <div>
              <h3>Queued delivery preview</h3>
              <p>This is the honest launch-stage view of what will be handed to outbound email once we wire the sender.</p>
            </div>
          </div>

          <div className="watchlistStack">
            {deliveryQueue.length ? (
              deliveryQueue.map((item) => (
                <article className="watchItemCard notificationCard" key={item.id}>
                  <div className="watchItemMain">
                    <div className="watchItemTop">
                      <span className="signalMiniTag">{labelDesk(item.desk)}</span>
                      <span className="signalMiniTag">{alertDigestWindowLabel(item.digestWindow)}</span>
                    </div>
                    <strong>{item.title}</strong>
                    <small>{item.message}</small>
                    <small>
                      {item.recipientEmail} | {formatDateTime(item.createdAt, appSettings.timezone)}
                    </small>
                  </div>
                </article>
              ))
            ) : (
              <EmptyState
                title="No queued delivery yet"
                body="Once alerts trigger with email queue enabled, the launch-stage delivery preview will show here."
              />
            )}
          </div>
        </div>
      </section>

      <section className="panel" id="routine-preferences">
        <div className="panelHeader">
          <div>
            <h2>Routine Preferences</h2>
            <p>Shape how the Dashboard nudges the user through the day so the product feels supportive instead of noisy.</p>
          </div>
          <div className="headerStatus">
            <span>Routine tone</span>
            <strong>
              {appSettings.routinePreferences?.remindersEnabled === false
                ? "Muted"
                : appSettings.routinePreferences?.nudgeWindow === "focused"
                  ? "Focused"
                  : appSettings.routinePreferences?.nudgeWindow === "quiet"
                    ? "Quiet"
                    : "Active"}
            </strong>
          </div>
        </div>

        <div className="summaryGrid compactSummaryGrid">
          <div className="summaryCard">
            <span>Daily nudges</span>
            <strong>{appSettings.routinePreferences?.remindersEnabled === false ? "Off" : "On"}</strong>
          </div>
          <div className="summaryCard">
            <span>Nudge style</span>
            <strong>
              {appSettings.routinePreferences?.nudgeWindow === "focused"
                ? "Focused"
                : appSettings.routinePreferences?.nudgeWindow === "quiet"
                  ? "Quiet"
                  : "Active"}
            </strong>
          </div>
          <div className="summaryCard">
            <span>Completion card</span>
            <strong>{appSettings.routinePreferences?.celebrationEnabled === false ? "Minimal" : "Visible"}</strong>
          </div>
        </div>

        <div className="splitGrid">
          <section className="subPanel">
            <div className="panelHeader">
              <div>
                <h3>Reminder behavior</h3>
                <p>Decide how readily the app should surface unfinished workflow steps on the Dashboard.</p>
              </div>
            </div>

            <div className="segmentedControl">
              <button
                type="button"
                className={appSettings.routinePreferences?.remindersEnabled !== false ? "active" : ""}
                onClick={() =>
                  updateSettings({
                    routinePreferences: {
                      ...appSettings.routinePreferences,
                      remindersEnabled: true,
                    },
                  })
                }
              >
                Nudges On
              </button>
              <button
                type="button"
                className={appSettings.routinePreferences?.remindersEnabled === false ? "active" : ""}
                onClick={() =>
                  updateSettings({
                    routinePreferences: {
                      ...appSettings.routinePreferences,
                      remindersEnabled: false,
                    },
                  })
                }
              >
                Nudges Off
              </button>
            </div>

            <div className="segmentedControl">
              {["active", "focused", "quiet"].map((modeKey) => (
                <button
                  key={modeKey}
                  type="button"
                  className={appSettings.routinePreferences?.nudgeWindow === modeKey ? "active" : ""}
                  onClick={() =>
                    updateSettings({
                      routinePreferences: {
                        ...appSettings.routinePreferences,
                        nudgeWindow: modeKey,
                      },
                    })
                  }
                >
                  {modeKey === "active" ? "Active" : modeKey === "focused" ? "Focused" : "Quiet"}
                </button>
              ))}
            </div>
          </section>

          <section className="subPanel">
            <div className="panelHeader">
              <div>
                <h3>Completion feel</h3>
                <p>Keep the end-of-routine moment visible, or switch to a more minimal finish.</p>
              </div>
            </div>

            <div className="segmentedControl">
              <button
                type="button"
                className={appSettings.routinePreferences?.celebrationEnabled !== false ? "active" : ""}
                onClick={() =>
                  updateSettings({
                    routinePreferences: {
                      ...appSettings.routinePreferences,
                      celebrationEnabled: true,
                    },
                  })
                }
              >
                Celebration On
              </button>
              <button
                type="button"
                className={appSettings.routinePreferences?.celebrationEnabled === false ? "active" : ""}
                onClick={() =>
                  updateSettings({
                    routinePreferences: {
                      ...appSettings.routinePreferences,
                      celebrationEnabled: false,
                    },
                  })
                }
              >
                Minimal
              </button>
            </div>

            <div className="summaryGrid compactSummaryGrid">
              <div className="summaryCard">
                <span>What changes</span>
                <strong>
                  {appSettings.routinePreferences?.nudgeWindow === "quiet"
                    ? "Lower prompt frequency"
                    : appSettings.routinePreferences?.nudgeWindow === "focused"
                      ? "Only stronger nudges"
                      : "Every open step stays visible"}
                </strong>
                <small>The Dashboard now adapts how quickly it shows the workflow reminder and completion state.</small>
              </div>
            </div>
          </section>
        </div>
      </section>

      <section className="panel" id="source-status">
        <div className="panelHeader">
          <div>
            <h2>Workspace Preferences</h2>
            <p>Keep your daily flow anchored to the right region, risk posture, and follow-up loop.</p>
          </div>
        </div>

        <div className="summaryGrid">
          <div className="summaryCard">
            <span>Preferred region</span>
            <strong>{labelRegion(appSettings.preferredRegion)}</strong>
          </div>
          <div className="summaryCard">
            <span>Risk mode</span>
            <strong>{appSettings.riskMode}</strong>
          </div>
          <div className="summaryCard">
            <span>Saved targets</span>
            <strong>{targets.length}</strong>
          </div>
          {legoJourney ? null : (
            <button
              type="button"
              className="summaryCard summaryCardButton"
              onClick={() => navigateToPage("connections", false, activeDesk)}
            >
              <span>Connections</span>
              <strong>{connectedProviderCount} configured</strong>
            </button>
          )}
        </div>
      </section>

      <section className="panel" id="partner-testing">
        <div className="panelHeader">
          <div>
            <h2>Partner Testing</h2>
            <p>When your partners get access, this becomes the shared place to log, review, and close feedback.</p>
          </div>
        </div>

        <div className="summaryGrid">
          <div className="summaryCard">
            <span>Board items</span>
            <strong>{feedbackSummary.total || 0}</strong>
          </div>
          <div className="summaryCard">
            <span>Open items</span>
            <strong>{feedbackSummary.open || 0}</strong>
          </div>
          <div className="summaryCard">
            <span>High priority</span>
            <strong>{feedbackSummary.highSeverity || 0}</strong>
          </div>
          {legoJourney ? null : (
            <button
              type="button"
              className="summaryCard summaryCardButton"
              onClick={() => navigateToPage("connections", false, activeDesk)}
            >
              <span>Live-ready desks</span>
              <strong>{liveReadyDeskCount}</strong>
            </button>
          )}
        </div>

        <div className="partnerTestingGrid">
          <div className="partnerTestingCard">
            <span>Partner access</span>
            <strong>{shareIsLive ? "Public share link is live" : "Local-only right now"}</strong>
            <small>
              {shareIsLive
                ? `Partners can use ${shareStatus.publicUrl} while the share helper stays open.`
                : "Run npm run partner:share after staging is live to open a temporary public link."}
            </small>
            <div className="panelActions">
              {shareIsLive ? (
                <>
                  <button
                    type="button"
                    className="primaryButton"
                    onClick={() => openExternal(shareStatus.publicUrl)}
                  >
                    Open Share Link
                  </button>
                  <button
                    type="button"
                    className="ghostButton"
                    onClick={() => {
                      if (navigator.clipboard?.writeText) {
                        navigator.clipboard.writeText(shareStatus.publicUrl);
                      }
                    }}
                  >
                    Copy Link
                  </button>
                </>
              ) : (
                <>
                  {legoJourney ? null : (
                    <button
                      type="button"
                      className="ghostButton"
                      onClick={() => navigateToPage("connections", false, activeDesk)}
                    >
                      Review Readiness
                    </button>
                  )}
                  <button type="button" className="ghostButton" onClick={copyPartnerInvite}>
                    Copy Test Brief
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="partnerTestingCard">
            <span>Suggested partner pass</span>
            <strong>
              {legoJourney
                ? "Welcome - Home - Research or Scan - Verdict - Collection - Exits"
                : "Landing - News - Trade - LEGO Investments - Feedback"}
            </strong>
            <small>
              {legoJourney
                ? "That route covers onboarding, the verdict, the collection, and the exit."
                : "That route covers the front door, tape, execution flow, alternative-assets lane, and the final feedback handoff."}
            </small>
          </div>
          <div className="partnerTestingCard">
            <span>Feedback path</span>
            <strong>Settings - Feedback Board</strong>
            <small>Ask partners to leave structured notes here instead of scattering feedback across WhatsApp.</small>
          </div>
          <div className="partnerTestingCard">
            <span>Shareable test brief</span>
            <strong>Copy a ready-to-send partner pass</strong>
            <small>
              Send one message with the current access link, suggested route, and the in-app feedback handoff.
            </small>
            <div className="panelActions">
              <button type="button" className="ghostButton" onClick={copyPartnerInvite}>
                Copy Test Brief
              </button>
            </div>
          </div>
          <div className="partnerTestingCard">
            <span>Owner controls</span>
            <strong>{canManageFeedback ? "Enabled on this account" : "Managed by owner account"}</strong>
            <small>
              {canManageFeedback
                ? "You can move items through New, Reviewing, Planned, and Resolved."
                : "Your notes land on the shared board. The owner account can then triage them."}
            </small>
          </div>
        </div>

        <div className="partnerChecklist">
          {PARTNER_TEST_FLOW.map((step) => (
            <div className="partnerChecklistItem" key={step.id}>
              <div className="partnerChecklistTop">
                <div className="partnerChecklistOrdinal">{step.ordinal}</div>
                <div className="partnerChecklistCopy">
                  <span>{step.title}</span>
                  <strong>{step.detail}</strong>
                </div>
              </div>
              <button
                type="button"
                className="ghostButton"
                onClick={() => openPartnerStep(step)}
              >
                Open {step.title}
              </button>
            </div>
          ))}
        </div>

        <div className="partnerInviteBlock">
          <span>Partner invite preview</span>
          <strong>Use this when you hand the app to partners</strong>
          <pre>{partnerInviteMessage}</pre>
        </div>

        <div className="summaryGrid partnerAccessMeta">
          <div className="summaryCard">
            <span>Local staging</span>
            <strong>{shareStatus?.localUrl || "http://127.0.0.1:5000"}</strong>
          </div>
          <div className="summaryCard">
            <span>Share provider</span>
            <strong>{shareStatus?.provider || "Not running"}</strong>
          </div>
          <div className="summaryCard">
            <span>Last heartbeat</span>
            <strong>{formatDateTime(shareStatus?.lastHeartbeatAt || shareStatus?.startedAt, appSettings.timezone)}</strong>
          </div>
          <div className="summaryCard">
            <span>Notes</span>
            <strong>{shareStatus?.notes || "No share session yet"}</strong>
          </div>
        </div>
      </section>

      <section className="panel" id="feedback-board">
        <div className="panelHeader">
          <div>
            <h2>Feedback Board</h2>
            <p>Structured partner notes with shared visibility, so we keep the test cycle tidy.</p>
          </div>
        </div>

        {feedbackStatus ? <div className="statusBanner subtleBanner">{feedbackStatus}</div> : null}

        <div className="feedbackToolbar">
          <div className="segmentedControl">
            <button
              type="button"
              className={feedbackStatusFilter === "open" ? "active" : ""}
              onClick={() => setFeedbackStatusFilter("open")}
            >
              Open
            </button>
            <button
              type="button"
              className={feedbackStatusFilter === "all" ? "active" : ""}
              onClick={() => setFeedbackStatusFilter("all")}
            >
              All
            </button>
            <button
              type="button"
              className={feedbackStatusFilter === "resolved" ? "active" : ""}
              onClick={() => setFeedbackStatusFilter("resolved")}
            >
              Resolved
            </button>
          </div>

          <div className="feedbackToolbarAside">
            <select
              value={feedbackAreaFilter}
              onChange={(event) => setFeedbackAreaFilter(event.target.value)}
            >
              {feedbackAreaOptions.map((area) => (
                <option key={area} value={area}>
                  {area === "all" ? "All areas" : humanizeStatus(area)}
                </option>
              ))}
            </select>
            <div className="feedbackToolbarCount">
              <span>Visible items</span>
              <strong>{filteredFeedbackItems.length}</strong>
            </div>
          </div>
        </div>

        <div className="feedbackLayout">
          <div className="feedbackComposerCard">
            <div className="feedbackFormGrid">
              <input
                type="text"
                value={feedbackForm.title}
                onChange={(event) =>
                  setFeedbackForm((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                placeholder="Short title for the issue or idea"
              />
              <select
                value={feedbackForm.area}
                onChange={(event) =>
                  setFeedbackForm((current) => ({
                    ...current,
                    area: event.target.value,
                  }))
                }
              >
                <option value="landing">Landing / Login</option>
                <option value="news">News</option>
                <option value="trade">Trade</option>
                <option value="collectibles">LEGO Investments</option>
                <option value="portfolio">Portfolio</option>
                <option value="tools">Tools</option>
                <option value="connections">Connections</option>
                <option value="settings">Settings</option>
              </select>
              <select
                value={feedbackForm.type}
                onChange={(event) =>
                  setFeedbackForm((current) => ({
                    ...current,
                    type: event.target.value,
                  }))
                }
              >
                <option value="bug">Bug</option>
                <option value="ux">UX</option>
                <option value="improvement">Improvement</option>
                <option value="content">Content</option>
              </select>
              <select
                value={feedbackForm.severity}
                onChange={(event) =>
                  setFeedbackForm((current) => ({
                    ...current,
                    severity: event.target.value,
                  }))
                }
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>

            <textarea
              value={feedbackForm.notes}
              onChange={(event) =>
                setFeedbackForm((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
              placeholder="What happened, what you expected, and any route or desk context that helps reproduce it."
            />

            <div className="panelActions">
              <button
                type="button"
                className="primaryButton"
                disabled={feedbackBusyKey === "submit"}
                onClick={submitFeedback}
              >
                {feedbackBusyKey === "submit" ? "Saving..." : "Send Feedback"}
              </button>
            </div>

            <small className="feedbackHint">
              This board is visible to signed-in partners. Keep titles short and the notes specific enough to reproduce.
            </small>
          </div>

          <div className="feedbackBoard">
            {filteredFeedbackItems.map((item) => (
              <article className="feedbackItemCard" key={item.id}>
                <div className="feedbackItemTop">
                  <div>
                    <span className="collectibleCategory">
                      {item.area} | {item.type}
                    </span>
                    <h3>{item.title}</h3>
                  </div>
                  <div className="feedbackBadgeStack">
                    <span className={`feedbackSeverityBadge feedbackSeverity-${item.severity}`}>
                      {humanizeStatus(item.severity)}
                    </span>
                    <span className={`signalBadge ${statusTone(item.status)}`}>
                      {humanizeStatus(item.status)}
                    </span>
                  </div>
                </div>

                <p>{item.notes}</p>

                <div className="feedbackMetaRow">
                  <span>{item.authorName || item.authorEmail || "Brick Alpha partner"}</span>
                  <span>{formatDateTime(item.updatedAt || item.createdAt, appSettings.timezone)}</span>
                </div>

                {canManageFeedback ? (
                  <div className="feedbackManageRow">
                    <span>Owner status</span>
                    <select
                      value={item.status}
                      disabled={feedbackBusyKey === `${item.id}:new` || feedbackBusyKey === `${item.id}:reviewing` || feedbackBusyKey === `${item.id}:planned` || feedbackBusyKey === `${item.id}:resolved`}
                      onChange={(event) => updateFeedbackStatus(item.id, event.target.value)}
                    >
                      <option value="new">New</option>
                      <option value="reviewing">Reviewing</option>
                      <option value="planned">Planned</option>
                      <option value="resolved">Resolved</option>
                    </select>
                  </div>
                ) : null}
              </article>
            ))}

            {!filteredFeedbackItems.length ? (
              <EmptyState
                title={feedbackItems.length ? "No feedback matches this view" : "No partner feedback yet"}
                body={
                  feedbackItems.length
                    ? "Try a broader filter to see the rest of the feedback board."
                    : "Once your partners start testing, their notes will land here in one shared board."
                }
              />
            ) : null}
          </div>
        </div>
      </section>

      <section className="panel" id="web-targets">
        <div className="panelHeader">
          <div>
            <h2>Web Targets</h2>
            <p>Saved topics for your research loop and scanning agent.</p>
          </div>
        </div>

        <div className="targetComposer">
          <input
            type="text"
            value={targetInput}
            onChange={(event) => setTargetInput(event.target.value)}
            placeholder="Add a desk target"
          />
          <button type="button" className="primaryButton" onClick={addTarget}>
            Add
          </button>
        </div>

        <div className="targetList">
          {targets.map((target) => (
            <div className="targetChip" key={target}>
              {target}
            </div>
          ))}
          {!targets.length ? (
            <EmptyState
              title="No saved targets yet"
              body="Add recurring research topics, macro themes, or desk-specific prompts here."
            />
          ) : null}
        </div>
      </section>
    </>
  );
}
