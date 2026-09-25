import { useMemo } from "react";
import { formatCollectiblePrice } from "../../appUtils";
import { buildHomeView } from "../home/homeModel";
import { buildCollectionView, formatSignedPercent } from "../collection/ownershipModel";

function Bar({ value = 0, max = 100 }) {
  const width = Math.max(2, Math.min(100, max ? (Math.abs(value) / max) * 100 : 0));
  return <span className="v3PortfolioBar"><i style={{ width: `${width}%` }} /></span>;
}

export function PortfolioScreen({ appSettings, openTrades = [], closedTrades = [], collectibles = [] }) {
  const home = useMemo(() => buildHomeView({ openTrades, closedTrades, collectibles, book: "curated", settings: appSettings }), [appSettings, closedTrades, collectibles, openTrades]);
  const collection = useMemo(() => buildCollectionView(openTrades, collectibles), [collectibles, openTrades]);
  const totalProfit = home.unrealisedProfit + home.realisedProfit;
  const maxTheme = Math.max(1, ...home.themes.map((item) => item.share));
  const maxHolding = Math.max(1, ...collection.sets.map((item) => item.marketValue || 0));

  return (
    <div className="v3Portfolio" data-page="portfolio">
      <header className="v3WorkflowHero v3PortfolioHero">
        <div>
          <span className="v3Eyebrow">Portfolio intelligence</span>
          <h1>{formatCollectiblePrice(home.ownedValue)}</h1>
          <p>Current LEGO portfolio value, performance and capital flow.</p>
        </div>
        <div className="v3PortfolioHeroReturn">
          <span>Blended ROI</span>
          <strong>{formatSignedPercent(home.blendedRoi)}</strong>
          <small>{home.source} · {home.exchangeLabel}</small>
        </div>
      </header>

      <section className="v3PortfolioKpis">
        <article><span>Capital deployed</span><strong>{formatCollectiblePrice(home.costBasis)}</strong></article>
        <article><span>Unrealised profit</span><strong>{formatCollectiblePrice(home.unrealisedProfit)}</strong></article>
        <article><span>Realised profit</span><strong>{formatCollectiblePrice(home.realisedProfit)}</strong></article>
        <article><span>Cash recycled</span><strong>{formatCollectiblePrice(home.realisedCash)}</strong></article>
        <article><span>Total profit</span><strong>{formatCollectiblePrice(totalProfit)}</strong></article>
      </section>

      <div className="v3PortfolioGrid">
        <section className="v3DecisionCard">
          <div className="v3PortfolioSectionHead"><div><span className="v3Eyebrow">Allocation</span><h2>Theme concentration</h2></div><small>{home.positions} open position{home.positions === 1 ? "" : "s"}</small></div>
          <div className="v3PortfolioBars">
            {home.themes.map((theme) => (
              <div key={theme.theme}>
                <div><strong>{theme.theme}</strong><span>{theme.share.toFixed(1)}%</span></div>
                <Bar value={theme.share} max={maxTheme} />
                <small>Target cap {theme.cap}% · {theme.overCap ? "Over cap" : "Inside cap"}</small>
              </div>
            ))}
          </div>
        </section>

        <section className="v3DecisionCard">
          <div className="v3PortfolioSectionHead"><div><span className="v3Eyebrow">Profit mix</span><h2>Where returns sit</h2></div></div>
          <div className="v3ProfitSplit">
            <div><span>Unrealised</span><strong>{formatCollectiblePrice(home.unrealisedProfit)}</strong><Bar value={home.unrealisedProfit} max={Math.max(1,totalProfit)} /></div>
            <div><span>Realised</span><strong>{formatCollectiblePrice(home.realisedProfit)}</strong><Bar value={home.realisedProfit} max={Math.max(1,totalProfit)} /></div>
          </div>
          <div className="v3CapitalFlow">
            <span>Capital flow</span>
            <strong>{formatCollectiblePrice(home.costBasis)}</strong><i>deployed</i>
            <b>→</b>
            <strong>{formatCollectiblePrice(home.realisedCash)}</strong><i>cash realised</i>
          </div>
        </section>
      </div>

      <section className="v3DecisionCard">
        <div className="v3PortfolioSectionHead"><div><span className="v3Eyebrow">Holdings</span><h2>Portfolio contribution</h2></div><small>Market value and return by set</small></div>
        <div className="v3HoldingChart">
          {collection.sets.map((set) => (
            <div key={set.id} className="v3HoldingChartRow">
              <div><strong>{set.name}</strong><small>#{set.setNumber} · {set.theme}</small></div>
              <Bar value={set.marketValue} max={maxHolding} />
              <span>{formatCollectiblePrice(set.marketValue)}</span>
              <strong>{formatSignedPercent(set.roi)}</strong>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
