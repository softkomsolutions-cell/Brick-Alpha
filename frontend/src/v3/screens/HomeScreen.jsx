import { useState } from "react";
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
  const [book, setBook] = useState("curated");
  const home = buildHomeView({
    openTrades,
    closedTrades,
    collectibles,
    book,
    settings: appSettings,
  });

  return (
    <div className="v3Home" data-page="home" data-book={home.book}>
      <header className="v3WorkflowHero">
        <div className="v3HomeHeader">
          <div>
            <span className="v3Eyebrow">Owned value</span>
            <h1>{money(home.ownedValue)}</h1>
            <p>Open collection market value. Realised cash stays outside this figure.</p>
          </div>
          <div className="v3BookToggle" role="group" aria-label="Collection book">
            <button type="button" className={book === "curated" ? "active" : ""} onClick={() => setBook("curated")}>
              Curated
            </button>
            <button type="button" className={book === "full" ? "active" : ""} onClick={() => setBook("full")}>
              Full collection
            </button>
          </div>
        </div>
        <p className="v3HomeMeta">
          {home.source} · valuation date {home.valuationDate || "—"} · {home.exchangeLabel}
        </p>
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
          <small>Zero-cost gifts excluded</small>
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

      <section className="v3DecisionCard">
        <h2>Needs attention</h2>
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
          <p>Nothing in this book needs attention.</p>
        )}
      </section>

      <section className="v3DecisionCard">
        <h2>Allocation by theme</h2>
        <div className="v3ThemeTable">
          {home.themes.map((theme) => (
            <div key={theme.theme} data-over-cap={theme.overCap ? "true" : "false"}>
              <strong>{theme.theme}</strong>
              <span>{theme.share.toFixed(1)}% owned</span>
              <span>Cap {theme.cap}%</span>
              <span>ROI {roiLabel(theme.roi)}</span>
              <span>{theme.overCap ? "Over cap" : "Inside cap"}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
