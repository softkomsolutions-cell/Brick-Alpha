import { formatCollectiblePrice } from "../../appUtils";
import { enrichBrickAlphaTrade } from "../../brickAlphaModel";

function exitCandidateRows(openTrades, collectibles, allTrades) {
  return (openTrades || [])
    .map((trade) => {
      const enriched = enrichBrickAlphaTrade(trade, collectibles, allTrades);
      const gain = numberOrZero(enriched.unrealizedPnl ?? enriched.pnl);
      const cost = numberOrZero(enriched.costBasis ?? enriched.entryPrice) * numberOrZero(enriched.quantity ?? 1);
      const currentValue = numberOrZero(enriched.currentPrice ?? enriched.currentMarketValue);
      const gainPct = cost ? (gain / cost) * 100 : null;
      return {
        id: trade.id,
        name: enriched.label || enriched.name || "LEGO holding",
        sku: enriched.sku || trade.ticker,
        currentValue,
        costBasis: cost,
        gain,
        gainPct,
        retirementStatus: enriched.retirementStatus,
        monthsUntilRetirement: enriched.monthsUntilRetirement,
        recommendation: enriched.recommendation,
      };
    })
    .sort((a, b) => (b.gainPct ?? -999) - (a.gainPct ?? -999));
}

function numberOrZero(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function ExitsScreen({
  openTrades = [],
  collectibles = [],
  jumpToPageSection,
  navigateToPage,
}) {
  const rows = exitCandidateRows(openTrades, collectibles, openTrades);

  return (
    <div className="v3WorkflowScreen" data-page="exits">
      <header className="v3WorkflowHero">
        <h1>Exits</h1>
        <p>
          Review sell-window proximity, estimated proceeds, and gain on holdings you may want to
          exit. Full exit rules and net proceeds land in Wave 4; your live collection data is here
          now.
        </p>
        <div className="v3WorkflowActions">
          <button type="button" className="primaryButton" onClick={() => navigateToPage("collection")}>
            Open Collection
          </button>
          <button
            type="button"
            className="ghostButton"
            onClick={() => jumpToPageSection("research", "retirement-intelligence")}
          >
            Retiring soon research
          </button>
        </div>
      </header>

      {rows.length ? (
        <section className="panel" aria-label="Exit candidates">
          <div className="panelHeader">
            <strong>Holdings to review</strong>
            <small>Sorted by unrealised gain %</small>
          </div>
          <div className="v3ExitList">
            {rows.map((row) => (
              <button
                key={row.id}
                type="button"
                className="v3ExitRow"
                onClick={() => jumpToPageSection("collection", "position-detail")}
              >
                <div className="v3ExitRowMain">
                  <strong>{row.name}</strong>
                  <small>{row.sku ? `#${row.sku}` : "LEGO set"}</small>
                </div>
                <div className="v3ExitRowStats">
                  <span>
                    Value <strong>{formatCollectiblePrice(row.currentValue)}</strong>
                  </span>
                  <span>
                    Gain{" "}
                    <strong>{row.gainPct != null ? `${row.gainPct.toFixed(1)}%` : "--"}</strong>
                  </span>
                  <span>
                    Retirement{" "}
                    <strong>
                      {row.monthsUntilRetirement != null
                        ? `${Math.round(row.monthsUntilRetirement)} mo`
                        : row.retirementStatus || "—"}
                    </strong>
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>
      ) : (
        <section className="panel">
          <p>No open holdings yet. Scan a set, log a purchase, or import sets during onboarding.</p>
          <button type="button" className="primaryButton" onClick={() => navigateToPage("scan")}>
            Scan a set
          </button>
        </section>
      )}
    </div>
  );
}
