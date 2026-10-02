import { formatCollectiblePrice } from "../../appUtils";
import { buildHomeView } from "../home/homeModel";
import { formatRecordedGrowth } from "../valuation/valuationAuthority";
import { stageResearchSection } from "../research/researchModel";

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

  return (
    <div className="v3Home" data-page="home" data-book="curated">
      <header className="v3WorkflowHero v3HomeHeroPremium">
        <div className="v3HomeHeroPrimary">
          <span className="v3Eyebrow">Brick Alpha portfolio intelligence</span>
          <h1 className="v3HomeHeroValue">{money(home.ownedValue)}</h1>
          <p className="v3HomeHeroLabel">Current open-collection market value, with realised cash kept separate for a clean investment view.</p>
          <p className="v3HomeMeta">
            {home.source} · valuation date {home.valuationDate || "—"} · {home.exchangeLabel}
          </p>
        </div>
        <div className="v3HomeHeroKpis" aria-label="Portfolio highlights">
          <div className="v3HeroKpi isGold">
            <span>Blended ROI</span>
            <strong>{roiLabel(home.blendedRoi)}</strong>
          </div>
          <div className="v3HeroKpi">
            <span>Unrealised profit</span>
            <strong>{money(home.unrealisedProfit)}</strong>
          </div>
          <div className="v3HeroKpi">
            <span>Positions</span>
            <strong>{home.positions}</strong>
          </div>
          <div className="v3HeroKpi">
            <span>Unique sets</span>
            <strong>{home.uniqueSets}</strong>
          </div>
        </div>
      </header>

      <section className="v3HomeGrid" aria-label="Collection summary">
        <article className="v3DecisionCard">
          <span>All-in cost</span>
          <strong>{money(home.costBasis)}</strong>
        </article>
        <article className="v3DecisionCard">
          <span>Unrealised profit</span>
          <strong>{money(home.unrealisedProfit)}</strong>
        </article>
        <article className="v3DecisionCard">
          <span>Realised profit</span>
          <strong>{money(home.realisedProfit)}</strong>
          <small>Cash {money(home.realisedCash)}</small>
        </article>
        <article className="v3DecisionCard">
          <span>Blended ROI</span>
          <strong>{roiLabel(home.blendedRoi)}</strong>
          <small>Zero-cost gifts excluded from cost denominator</small>
        </article>
        <article className="v3DecisionCard">
          <span>Positions</span>
          <strong>{home.positions}</strong>
        </article>
        <article className="v3DecisionCard">
          <span>Unique sets</span>
          <strong>{home.uniqueSets}</strong>
        </article>
      </section>

      <section className="v3DecisionCard v3PortfolioOverviewCard">
        <div className="v3PortfolioSectionHead">
          <div>
            <span className="v3Eyebrow">Portfolio overview</span>
            <h2>Value bridge</h2>
          </div>
          <small>Live figures from the current investment book</small>
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

      <section className="v3DecisionCard">
        <h2>Investment actions</h2>
        {home.attention.length ? (
          <ul className="v3AttentionList">
            {home.attention.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (item.section) {
                      stageResearchSection(item.section);
                    }
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
