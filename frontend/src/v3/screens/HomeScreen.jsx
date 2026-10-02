import { useMemo } from "react";
import { formatCollectiblePrice } from "../../appUtils";
import { buildHomeView } from "../home/homeModel";
import { buildCollectionView } from "../collection/ownershipModel";
import { formatRecordedGrowth } from "../valuation/valuationAuthority";
import { stageResearchSection } from "../research/researchModel";

const DASHBOARD_PALETTE = [
  "#315efb",
  "#2d22b8",
  "#7c3aed",
  "#d97706",
  "#65a30d",
  "#0891b2",
  "#9333ea",
  "#64748b",
];

function money(value) {
  return formatCollectiblePrice(value);
}

function roiLabel(value) {
  if (value == null || !Number.isFinite(value)) {
    return "—";
  }
  return formatRecordedGrowth(value);
}

export function HomeScreen({
  appSettings,
  closedTrades = [],
  collectibles = [],
  currentUser,
  navigateToPage,
  openTrades = [],
}) {
  const home = buildHomeView({
    openTrades,
    closedTrades,
    collectibles,
    book: "curated",
    settings: appSettings,
  });
  const collection = useMemo(
    () => buildCollectionView(openTrades, collectibles),
    [collectibles, openTrades],
  );
  const allocation = useMemo(() => {
    const total = collection.sets.reduce((sum, set) => sum + Number(set.marketValue || 0), 0);
    const grouped = new Map();
    for (const set of collection.sets) {
      const key = set.theme || "Other";
      grouped.set(key, (grouped.get(key) || 0) + Number(set.marketValue || 0));
    }
    return [...grouped.entries()]
      .map(([theme, value]) => ({
        theme,
        value,
        share: total > 0 ? (value / total) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [collection.sets]);

  const donutGradient = useMemo(() => {
    const stops = allocation.reduce(
      (state, item, index) => {
        const start = state.total;
        const end = start + item.share;
        return {
          total: end,
          values: [
            ...state.values,
            `${DASHBOARD_PALETTE[index % DASHBOARD_PALETTE.length]} ${start.toFixed(2)}% ${end.toFixed(2)}%`,
          ],
        };
      },
      { total: 0, values: [] },
    ).values;
    return stops.length ? `conic-gradient(${stops.join(", ")})` : "#e9eef7";
  }, [allocation]);

  const chartMax = Math.max(
    1,
    home.ownedValue,
    home.costBasis,
    home.unrealisedProfit,
    home.realisedCash,
  );
  const chartRows = [
    { id: "value", label: "Current value", value: home.ownedValue },
    { id: "cost", label: "Cost basis", value: home.costBasis },
    { id: "profit", label: "Unrealised profit", value: home.unrealisedProfit },
    { id: "cash", label: "Realised cash", value: home.realisedCash },
  ];
  const displayName = String(currentUser?.name || "Gavin").split(" ")[0];

  return (
    <div className="v3Home" data-page="home" data-book="curated">
      <h1 className="v3CrmPageHeading">Portfolio Overview</h1>

      <section className="v3CrmHero" aria-label="Portfolio overview">
        <div className="v3CrmHeroHead">
          <div>
            <h2>Good afternoon, {displayName}</h2>
            <p>Brick Alpha · LEGO investment intelligence</p>
          </div>
          <div className="v3CrmHeroValue">
            <small>Current portfolio value</small>
            <strong>{money(home.ownedValue)}</strong>
          </div>
        </div>
        <div className="v3CrmHeroStats">
          <div className="v3CrmHeroStat"><strong>{home.positions}</strong><span>open positions</span></div>
          <div className="v3CrmHeroStat"><strong>{home.uniqueSets}</strong><span>unique sets</span></div>
          <div className="v3CrmHeroStat"><strong>{collection.summary.stacks}</strong><span>stacks</span></div>
          <div className="v3CrmHeroStat"><strong>{roiLabel(home.blendedRoi)}</strong><span>blended ROI</span></div>
        </div>
      </section>

      <section className="v3HomeGrid" aria-label="Collection summary">
        <article className="v3DecisionCard"><span>All-in cost</span><strong>{money(home.costBasis)}</strong></article>
        <article className="v3DecisionCard"><span>Unrealised profit</span><strong>{money(home.unrealisedProfit)}</strong></article>
        <article className="v3DecisionCard"><span>Realised profit</span><strong>{money(home.realisedProfit)}</strong><small>Cash {money(home.realisedCash)}</small></article>
        <article className="v3DecisionCard"><span>Blended ROI</span><strong>{roiLabel(home.blendedRoi)}</strong><small>Zero-cost gifts excluded</small></article>
        <article className="v3DecisionCard"><span>Positions</span><strong>{home.positions}</strong></article>
        <article className="v3DecisionCard"><span>Unique sets</span><strong>{home.uniqueSets}</strong></article>
      </section>

      <div className="v3CrmDashboardGrid">
        <section className="v3DecisionCard v3CrmDonutPanel">
          <div className="v3PortfolioSectionHead">
            <div>
              <span className="v3Eyebrow">Where the value sits</span>
              <h2>By theme</h2>
            </div>
            <small>Current market value</small>
          </div>
          <div className="v3CrmDonutWrap">
            <div className="v3CrmDonut" style={{ background: donutGradient }} role="img" aria-label="Portfolio allocation by theme" />
            <div className="v3CrmLegend">
              {allocation.map((item, index) => (
                <div className="v3CrmLegendRow" key={item.theme}>
                  <span className="v3CrmLegendSwatch" style={{ background: DASHBOARD_PALETTE[index % DASHBOARD_PALETTE.length] }} />
                  <span>{item.theme}</span>
                  <strong>{item.share.toFixed(1)}%</strong>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="v3DecisionCard v3CrmValuePanel">
          <div className="v3PortfolioSectionHead">
            <div>
              <span className="v3Eyebrow">Portfolio overview</span>
              <h2>Value bridge</h2>
            </div>
            <small>{home.source} · {home.exchangeLabel}</small>
          </div>
          <div className="v3MetricChart">
            {chartRows.map((row) => (
              <div className="v3MetricChartRow" key={row.id}>
                <div className="v3MetricChartLabel">
                  <span>{row.label}</span>
                  <strong>{money(row.value)}</strong>
                </div>
                <div className="v3MetricChartTrack" aria-hidden="true">
                  <span style={{ width: `${Math.max(1, Math.min(100, (row.value / chartMax) * 100))}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="v3DecisionCard">
        <div className="v3PortfolioSectionHead">
          <div><span className="v3Eyebrow">Next actions</span><h2>Investment actions</h2></div>
          <small>Tap a card to open it</small>
        </div>
        {home.attention.length ? (
          <ul className="v3AttentionList">
            {home.attention.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (item.section) stageResearchSection(item.section);
                    navigateToPage?.(item.page);
                  }}
                >
                  <span>{item.kind}</span>
                  <strong>{item.title}</strong>
                  <small>{item.detail}</small>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p>No investment actions need attention right now.</p>
        )}
      </section>
    </div>
  );
}
