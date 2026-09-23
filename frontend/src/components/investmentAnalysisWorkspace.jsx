import { useMemo, useState } from "react";
import {
  availabilityStatusFor,
  buildAiCommentary,
  buildBrickAlphaScoreBreakdown,
  buildPriceForecast,
  confidenceFor,
  letterGradeFor,
  legoThemeFor,
  summarizeBrickAlphaPortfolio,
} from "../brickAlphaModel";
import { formatCollectiblePrice, openExternal, positiveTone } from "../appUtils";
import { EmptyState } from "./appShell";
import { AlphaSignalBadges } from "./workspaceCards";
import { InvestmentAnalysisChart } from "./investmentAnalysisChart";
import { ScoreBar, ScoreRing } from "./brickAlphaScoreDisplay";
import { ScoreExplanationPanel } from "./scoreExplanationPanel";

const HORIZON_OPTIONS = [1, 3, 5, 10];

const COMPARABLE_CATALOG = {
  "lego-star-wars-75252": [
    {
      name: "Daily Bugle",
      sku: "76178",
      retail: 14999,
      current: 19200,
      growth: 28,
      yearsSinceRetirement: 2.5,
    },
    {
      name: "Mos Eisley Cantina",
      sku: "75290",
      retail: 13999,
      current: 16800,
      growth: 20,
      yearsSinceRetirement: 3,
    },
    {
      name: "Rivendell",
      sku: "10316",
      retail: 19999,
      current: 24500,
      growth: 22,
      yearsSinceRetirement: 1.5,
    },
    {
      name: "UCS Millennium Falcon",
      sku: "75192",
      retail: 34999,
      current: 52000,
      growth: 48,
      yearsSinceRetirement: 5,
    },
  ],
  "lego-icons-10305": [
    {
      name: "Rivendell",
      sku: "10316",
      retail: 19999,
      current: 24500,
      growth: 22,
      yearsSinceRetirement: 1.5,
    },
    {
      name: "Colosseum",
      sku: "10276",
      retail: 22999,
      current: 28500,
      growth: 24,
      yearsSinceRetirement: 2,
    },
    {
      name: "Titanic",
      sku: "10294",
      retail: 26999,
      current: 31200,
      growth: 16,
      yearsSinceRetirement: 2.5,
    },
    {
      name: "Loop Coaster",
      sku: "10303",
      retail: 14999,
      current: 16200,
      growth: 8,
      yearsSinceRetirement: 1,
    },
  ],
};

const MINIFIGURE_ROSTERS = {
  "lego-star-wars-75252": [
    { name: "Darth Vader", role: "UCS centerpiece" },
    { name: "Imperial Officer", role: "Officer variant" },
  ],
  "lego-icons-10305": [
    { name: "Lion Knight King", role: "Castle monarch" },
    { name: "Forest Maiden", role: "Display exclusive" },
    { name: "Black Falcon Knight", role: "Faction leader" },
    { name: "Royal Jester", role: "Castle entertainer" },
  ],
};

function formatScore(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${Math.round(numeric)}/100` : "--";
}

function recommendationTone(recommendation) {
  if (recommendation === "Strong Buy" || recommendation === "Buy") {
    return "buy";
  }
  if (recommendation === "Sell" || recommendation === "Avoid") {
    return "sell";
  }
  if (recommendation === "Reduce") {
    return "reduce";
  }
  return "hold";
}

function displayRecommendation(recommendation) {
  if (recommendation === "Watch") {
    return "Hold";
  }
  if (recommendation === "Avoid") {
    return "Reduce";
  }
  return recommendation;
}

function extractSetNumber(item) {
  if (item.sku) {
    return item.sku;
  }
  const match = String(item.id || "").match(/(\d{4,6})/);
  return match ? match[1] : "--";
}

function productionStartDate(item) {
  const anchor = item.actualRetirementDate || item.expectedRetirementDate;
  const anchorMs = Date.parse(anchor);
  if (!Number.isFinite(anchorMs)) {
    return "2019-01-01";
  }
  const date = new Date(anchorMs);
  date.setFullYear(date.getFullYear() - 3);
  return date.toISOString().slice(0, 10);
}

function buildMinifigureCards(item) {
  const roster = MINIFIGURE_ROSTERS[item.id] || [];
  const exclusiveCount = Math.max(1, Number(item.exclusiveMinifigures) || 1);
  const cards = roster.length
    ? roster
    : Array.from({ length: Math.min(exclusiveCount, 4) }, (_, index) => ({
        name: `Exclusive Minifigure ${index + 1}`,
        role: "Set exclusive",
      }));

  return cards.map((figure, index) => {
    const rarityBoost = index === 0 ? 8 : index === 1 ? 4 : 0;
    const popularity = Math.min(98, Math.round(Number(item.minifigureQuality) + rarityBoost - index * 2));
    const investmentValue = Math.min(96, Math.round(popularity * 0.92 + Number(item.themeStrength) * 0.08));
    const rarity = Math.min(99, Math.round(58 + exclusiveCount * 2 + rarityBoost));
    const appreciation = Math.min(95, Math.round(Number(item.projectedRoi) * 0.35 + rarity * 0.25));
    const overall = Math.round((popularity + investmentValue + rarity + appreciation) / 4);

    return {
      ...figure,
      popularity,
      investmentValue,
      rarity,
      appreciation,
      overall,
    };
  });
}

function buildComparables(item, collectibles) {
  const catalog = COMPARABLE_CATALOG[item.id];
  if (catalog?.length) {
    return catalog;
  }

  return collectibles
    .filter((candidate) => candidate.id !== item.id && candidate.brand === "LEGO")
    .slice(0, 4)
    .map((candidate) => ({
      name: candidate.name,
      sku: extractSetNumber(candidate),
      retail: candidate.retailPrice,
      current: candidate.currentMarketValue,
      growth: candidate.estimatedRoi,
      yearsSinceRetirement: candidate.actualRetirementDate ? 2 : 0.5,
    }));
}

export function InvestmentAnalysisWorkspace({
  activeCollectible,
  brickAlphaPortfolio,
  collectibles,
  handleCollectibleSelect,
  jumpToPageSection,
  onAddToWatchlist,
  openCollectibleTicket,
  openTrades,
}) {
  const [chartHorizon, setChartHorizon] = useState(3);
  const [forecastHorizon, setForecastHorizon] = useState(3);
  const [watchlistAction, setWatchlistAction] = useState("");

  const legoSets = useMemo(
    () => collectibles.filter((item) => item.brand === "LEGO"),
    [collectibles],
  );

  const item = activeCollectible;
  const ownedTrade = useMemo(
    () =>
      openTrades.find(
        (trade) =>
          trade.assetClass === "collectible" &&
          (trade.collectibleId === item?.id || trade.ticker === item?.sku),
      ) || null,
    [item?.id, item?.sku, openTrades],
  );
  const isOwned = Boolean(ownedTrade);
  const portfolioPosition = isOwned ? "Owned" : "Not Owned";

  const breakdown = useMemo(
    () => (item ? buildBrickAlphaScoreBreakdown(item) : null),
    [item],
  );
  const forecast = useMemo(
    () => (item ? buildPriceForecast(item, forecastHorizon) : null),
    [forecastHorizon, item],
  );
  const minifigures = useMemo(() => (item ? buildMinifigureCards(item) : []), [item]);
  const comparables = useMemo(
    () => (item ? buildComparables(item, collectibles) : []),
    [collectibles, item],
  );
  const commentary = useMemo(() => (item ? buildAiCommentary(item) : ""), [item]);
  const confidence = item ? confidenceFor(item) : 0;
  const availability = item ? availabilityStatusFor(item) : "Available";
  const minifigureScore = minifigures.length
    ? Math.round(minifigures.reduce((sum, fig) => sum + fig.overall, 0) / minifigures.length)
    : Math.round(Number(item?.minifigureQuality) || 0);

  const portfolioSummary = brickAlphaPortfolio || summarizeBrickAlphaPortfolio(openTrades);
  const themeRow = portfolioSummary.themeAllocation?.breakdown?.find(
    (row) => row.theme === legoThemeFor(item || {}),
  );
  const allocationPercent =
    isOwned && portfolioSummary.netAssetValue
      ? ((Number(ownedTrade.currentValue) || 0) / portfolioSummary.netAssetValue) * 100
      : 0;

  if (!item) {
    return (
      <section className="iaWorkspace iaWorkspace-empty panel" id="investment-analysis">
        <EmptyState
          title="Select a LEGO set to analyse"
          body="Choose a set from your catalog to open the Brick Alpha Investment Analysis workspace."
        />
        {legoSets.length ? (
          <div className="iaSetPicker">
            {legoSets.map((set) => (
              <button
                key={set.id}
                type="button"
                className="iaSetPickerChip"
                onClick={() => handleCollectibleSelect(set)}
              >
                <span>{extractSetNumber(set)}</span>
                <strong>{set.name}</strong>
              </button>
            ))}
          </div>
        ) : null}
      </section>
    );
  }

  const thesis = item.investmentThesis;
  const brickEconomyUrl = `https://www.brickeconomy.com/set/${extractSetNumber(item)}`;
  const productionStart = productionStartDate(item);
  const todayLabel = new Date().toISOString().slice(0, 10);

  const handleAddToWatchlist = () => {
    if (onAddToWatchlist) {
      onAddToWatchlist({
        ticker: extractSetNumber(item),
        label: item.name,
        desk: "collectible",
      });
      setWatchlistAction(`${item.name} added to watchlist.`);
    } else {
      setWatchlistAction("Sign in to sync watchlist items.");
    }
  };

  return (
    <section className="iaWorkspace" id="investment-analysis">
      {legoSets.length > 1 ? (
        <div className="iaSetPicker iaSetPicker-compact">
          {legoSets.map((set) => (
            <button
              key={set.id}
              type="button"
              className={`iaSetPickerChip${set.id === item.id ? " iaSetPickerChip-active" : ""}`}
              onClick={() => handleCollectibleSelect(set)}
            >
              <span>{extractSetNumber(set)}</span>
              <strong>{set.name}</strong>
            </button>
          ))}
        </div>
      ) : null}

      <header className="iaHero">
        <div className="iaHeroVisual">
          <div className="iaHeroImage" aria-hidden="true">
            <span className="iaHeroImageBadge">{item.legoTheme}</span>
            <strong>{extractSetNumber(item)}</strong>
          </div>
        </div>

        <div className="iaHeroBody">
          <div className="iaHeroIntro">
            <span className="executiveDashboardEyebrow">Investment Analysis</span>
            <h1>{item.name}</h1>
            <div className="iaHeroMeta">
              <span>#{extractSetNumber(item)}</span>
              <span>{item.legoTheme}</span>
              <span className={`iaStatusBadge iaStatusBadge-${availability.toLowerCase().replace(/\s+/g, "-")}`}>
                {availability}
              </span>
            </div>
            <AlphaSignalBadges signals={item.alphaSignals} />
          </div>

          <div className="iaHeroMetrics">
            <div className="iaHeroMetric iaHeroMetric-score">
              <span>Brick Alpha Score</span>
              <ScoreRing score={item.brickAlphaScore} />
            </div>
            <div className="iaHeroMetric">
              <span>Investment Grade</span>
              <strong className={`iaGrade iaGrade-${letterGradeFor(item.brickAlphaScore).replace("+", "plus")}`}>
                {letterGradeFor(item.brickAlphaScore)}
              </strong>
              <small>{item.investmentGrade}</small>
            </div>
            <div className="iaHeroMetric">
              <span>Recommendation</span>
              <strong className={`iaRecommendation iaRecommendation-${recommendationTone(item.recommendation)}`}>
                {displayRecommendation(item.recommendation)}
              </strong>
            </div>
            <div className="iaHeroMetric">
              <span>Confidence</span>
              <strong>{confidence}%</strong>
            </div>
            <div className="iaHeroMetric">
              <span>Current Value</span>
              <strong>{formatCollectiblePrice(item.currentMarketValue)}</strong>
            </div>
            <div className="iaHeroMetric">
              <span>Retail Price</span>
              <strong>{formatCollectiblePrice(item.retailPrice)}</strong>
            </div>
            {isOwned ? (
              <div className="iaHeroMetric">
                <span>Paid Price</span>
                <strong>{formatCollectiblePrice(ownedTrade.entryPrice || item.buyPrice)}</strong>
              </div>
            ) : null}
            <div className="iaHeroMetric">
              <span>Portfolio Position</span>
              <strong>{portfolioPosition}</strong>
            </div>
          </div>

          <div className="iaHeroActions">
            <button
              type="button"
              className="primaryButton"
              onClick={() => openCollectibleTicket(item, "BUY")}
            >
              Add to Portfolio
            </button>
            <button
              type="button"
              className="ghostButton"
              onClick={handleAddToWatchlist}
            >
              Add to Watchlist
            </button>
            <button type="button" className="ghostButton" onClick={() => openExternal(brickEconomyUrl)}>
              View BrickEconomy
            </button>
          </div>
          {watchlistAction ? <p className="iaHeroActionNote">{watchlistAction}</p> : null}
        </div>
      </header>

      <article className="iaGlassCard iaThesisCard">
        <div className="iaSectionHeader">
          <span className="executiveDashboardEyebrow">Investment Thesis</span>
          <h2>Should you buy, hold, or sell?</h2>
        </div>
        <p className="iaThesisLead">
          {item.name} combines a strong {item.legoTheme} theme,{" "}
          {item.exclusiveMinifigures ? `${item.exclusiveMinifigures} exclusive minifigures, ` : ""}
          {item.retirementStatus === "Retired"
            ? "retired supply dynamics"
            : "a favourable retirement timeline"}
          . Current pricing remains{" "}
          {item.discountPercentage > 0 ? "below retail with margin of safety" : "at a premium to retail"}.
          Brick Alpha currently rates this set as a {displayRecommendation(item.recommendation)} with{" "}
          {confidence >= 80 ? "high" : confidence >= 60 ? "moderate" : "developing"} confidence.
        </p>
        <div className="iaThesisGrid">
          <div className="iaThesisBlock">
            <span>Upside Drivers</span>
            <ul>
              {thesis.upsideDrivers.map((driver) => (
                <li key={driver}>{driver}</li>
              ))}
            </ul>
          </div>
          <div className="iaThesisBlock">
            <span>Main Risks</span>
            <ul>
              {thesis.risks.map((risk) => (
                <li key={risk}>{risk}</li>
              ))}
            </ul>
          </div>
          <div className="iaThesisBlock">
            <span>Exit Strategy</span>
            <p>{thesis.exitStrategy}</p>
          </div>
          <div className="iaThesisBlock">
            <span>Ideal Holding Period</span>
            <p>
              {item.holdingPeriod} observed · target exit {item.sellByTargetDate} ·{" "}
              {item.retirementStatus === "Retired" ? "post-retirement hold" : "pre-retirement accumulation"}
            </p>
          </div>
        </div>
      </article>

      <div className="iaTwoColumn">
        <article className="iaGlassCard">
          <div className="iaSectionHeader iaSectionHeader-row">
            <div>
              <span className="executiveDashboardEyebrow">Price History</span>
              <h2>Retail · Market · Forecast</h2>
            </div>
            <div className="iaHorizonToggle" role="tablist" aria-label="Chart horizon">
              {HORIZON_OPTIONS.map((years) => (
                <button
                  key={years}
                  type="button"
                  className={chartHorizon === years ? "iaHorizonToggleActive" : ""}
                  onClick={() => setChartHorizon(years)}
                >
                  {years}Y
                </button>
              ))}
            </div>
          </div>
          <InvestmentAnalysisChart item={item} horizonYears={chartHorizon} />
        </article>

        <article className="iaGlassCard">
          <div className="iaSectionHeader">
            <span className="executiveDashboardEyebrow">Brick Alpha Score</span>
            <h2>Weighted breakdown</h2>
          </div>
          <div className="iaWeightLegend">
            {breakdown.displayGroups.map((group) => (
              <span key={group.key}>
                {group.label} {group.weight}%
              </span>
            ))}
          </div>
          <div className="iaScoreBars">
            {breakdown.factors.map((factor) => (
              <ScoreBar key={factor.key} factor={factor} />
            ))}
          </div>
        </article>
      </div>

      <ScoreExplanationPanel item={item} />

      <article className="iaGlassCard">
        <div className="iaSectionHeader">
          <span className="executiveDashboardEyebrow">Retirement Analysis</span>
          <h2>Production lifecycle</h2>
        </div>
        <div className="iaRetirementTimeline">
          <div className="iaRetirementNode">
            <span>Production Start</span>
            <strong>{productionStart}</strong>
          </div>
          <div className="iaRetirementTrack">
            <div className="iaRetirementTrackFill" />
            <div className="iaRetirementMarker iaRetirementMarker-today">
              <span>Today</span>
              <strong>{todayLabel}</strong>
            </div>
          </div>
          <div className="iaRetirementNode">
            <span>{item.actualRetirementDate ? "Actual Retirement" : "Expected Retirement"}</span>
            <strong>{item.actualRetirementDate || item.expectedRetirementDate}</strong>
          </div>
        </div>
        <div className="iaRetirementStats">
          <div>
            <span>Confidence</span>
            <strong>{Math.round(item.retirementConfidence)}%</strong>
          </div>
          <div>
            <span>Probability</span>
            <strong>{Math.round(item.retirementProbability)}%</strong>
          </div>
          <div>
            <span>Status</span>
            <strong>{item.retirementStatus}</strong>
          </div>
          <div>
            <span>Est. Retirement Pop</span>
            <strong>
              {formatCollectiblePrice(
                Math.round((Number(item.currentMarketValue) || 0) * (1 + (Number(item.projectedRoi) || 28) / 100)),
              )}
            </strong>
          </div>
        </div>
      </article>

      <article className="iaGlassCard">
        <div className="iaSectionHeader iaSectionHeader-row">
          <div>
            <span className="executiveDashboardEyebrow">Minifigure Analysis</span>
            <h2>Exclusive figure premium</h2>
          </div>
          <div className="iaMinifigureScore">
            <span>Overall Minifigure Score</span>
            <strong>{minifigureScore}/100</strong>
          </div>
        </div>
        <div className="iaMinifigureGrid">
          {minifigures.map((figure) => (
            <article className="iaMinifigureCard" key={figure.name}>
              <div className="iaMinifigureAvatar" aria-hidden="true">
                {figure.name
                  .split(" ")
                  .map((part) => part[0])
                  .join("")
                  .slice(0, 2)}
              </div>
              <h3>{figure.name}</h3>
              <small>{figure.role}</small>
              <div className="iaMinifigureMetrics">
                <div>
                  <span>Popularity</span>
                  <strong>{figure.popularity}</strong>
                </div>
                <div>
                  <span>Investment Value</span>
                  <strong>{figure.investmentValue}</strong>
                </div>
                <div>
                  <span>Rarity</span>
                  <strong>{figure.rarity}</strong>
                </div>
                <div>
                  <span>Expected Appreciation</span>
                  <strong className={positiveTone(figure.appreciation)}>{figure.appreciation}%</strong>
                </div>
              </div>
            </article>
          ))}
        </div>
      </article>

      <div className="iaTwoColumn">
        <article className="iaGlassCard">
          <div className="iaSectionHeader iaSectionHeader-row">
            <div>
              <span className="executiveDashboardEyebrow">Price Forecast</span>
              <h2>AI Forecast</h2>
            </div>
            <div className="iaHorizonToggle" role="tablist" aria-label="Forecast horizon">
              {HORIZON_OPTIONS.map((years) => (
                <button
                  key={years}
                  type="button"
                  className={forecastHorizon === years ? "iaHorizonToggleActive" : ""}
                  onClick={() => setForecastHorizon(years)}
                >
                  {years}Y
                </button>
              ))}
            </div>
          </div>
          {forecast ? (
            <div className="iaForecastGrid">
              <div>
                <span>Expected CAGR</span>
                <strong className={positiveTone(forecast.cagr)}>{forecast.cagr.toFixed(1)}%</strong>
              </div>
              <div>
                <span>Best Case</span>
                <strong>{formatCollectiblePrice(forecast.best)}</strong>
              </div>
              <div>
                <span>Expected Case</span>
                <strong>{formatCollectiblePrice(forecast.expected)}</strong>
              </div>
              <div>
                <span>Worst Case</span>
                <strong>{formatCollectiblePrice(forecast.worst)}</strong>
              </div>
              <div>
                <span>Confidence</span>
                <strong>{forecast.confidence}%</strong>
              </div>
            </div>
          ) : null}
        </article>

        {isOwned ? (
          <article className="iaGlassCard">
            <div className="iaSectionHeader">
              <span className="executiveDashboardEyebrow">Portfolio Impact</span>
              <h2>Your position</h2>
            </div>
            <div className="iaPortfolioGrid">
              <div>
                <span>Current Allocation</span>
                <strong>{allocationPercent.toFixed(1)}%</strong>
              </div>
              <div>
                <span>Theme Exposure</span>
                <strong>{item.legoTheme}</strong>
                <small>
                  Target {item.themeAllocationTarget}% · Actual {themeRow ? themeRow.actual.toFixed(1) : "0.0"}%
                </small>
              </div>
              <div>
                <span>Portfolio Diversification</span>
                <strong>{formatScore(portfolioSummary.diversificationScore)}</strong>
              </div>
              <div>
                <span>Flywheel Rating</span>
                <strong>{formatScore(item.portfolioFit)}</strong>
              </div>
              <div>
                <span>Contribution to Portfolio</span>
                <strong>{formatCollectiblePrice(ownedTrade.currentValue)}</strong>
                <small className={positiveTone(ownedTrade.pnl)}>
                  {Number(ownedTrade.pnl || 0).toFixed(1)}% return
                </small>
              </div>
            </div>
          </article>
        ) : (
          <article className="iaGlassCard iaGlassCard-muted">
            <div className="iaSectionHeader">
              <span className="executiveDashboardEyebrow">Portfolio Impact</span>
              <h2>Not in your portfolio</h2>
            </div>
            <p>
              Add this set to your portfolio to see allocation, theme exposure, flywheel rating, and
              contribution metrics.
            </p>
            <button type="button" className="primaryButton" onClick={() => openCollectibleTicket(item, "BUY")}>
              Add to Portfolio
            </button>
          </article>
        )}
      </div>

      <article className="iaGlassCard">
        <div className="iaSectionHeader">
          <span className="executiveDashboardEyebrow">Comparable Sets</span>
          <h2>Similar retired sets</h2>
        </div>
        <div className="iaComparableGrid">
          {comparables.map((comp) => (
            <article className="iaComparableCard" key={`${comp.sku}-${comp.name}`}>
              <div className="iaComparableTop">
                <strong>{comp.name}</strong>
                <span>#{comp.sku}</span>
              </div>
              <div className="iaComparableMetrics">
                <div>
                  <span>Retail</span>
                  <strong>{formatCollectiblePrice(comp.retail)}</strong>
                </div>
                <div>
                  <span>Current Value</span>
                  <strong>{formatCollectiblePrice(comp.current)}</strong>
                </div>
                <div>
                  <span>Growth</span>
                  <strong className={positiveTone(comp.growth)}>+{Number(comp.growth).toFixed(0)}%</strong>
                </div>
                <div>
                  <span>Years Since Retirement</span>
                  <strong>{comp.yearsSinceRetirement}</strong>
                </div>
              </div>
            </article>
          ))}
        </div>
      </article>

      <article className="iaGlassCard iaCommentaryCard">
        <div className="iaSectionHeader">
          <span className="executiveDashboardEyebrow">AI Commentary</span>
          <h2>Brick Alpha Copilot</h2>
        </div>
        <blockquote className="iaCommentary">"{commentary}"</blockquote>
      </article>

      <footer className="iaActions">
        <button type="button" className="primaryButton" onClick={() => openCollectibleTicket(item, "BUY")}>
          Buy More
        </button>
        <button type="button" className="ghostButton" onClick={() => jumpToPageSection("subscriptions", "subscriptions-overview")}>
          Add Alert
        </button>
        <button type="button" className="ghostButton" onClick={() => jumpToPageSection("collectibles", "retirement-intelligence")}>
          Track Retirement
        </button>
        <button type="button" className="ghostButton" onClick={() => jumpToPageSection("collectibles", "collectibles-grid")}>
          Compare Sets
        </button>
        <button type="button" className="ghostButton" onClick={() => jumpToPageSection("reports", "reports-overview")}>
          Export Report
        </button>
      </footer>
    </section>
  );
}
