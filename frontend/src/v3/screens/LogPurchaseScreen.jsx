export function LogPurchaseScreen({ navigateToPage, jumpToPageSection }) {
  return (
    <div className="v3WorkflowScreen" data-page="log-purchase">
      <header className="v3WorkflowHero">
        <h1>Log Purchase</h1>
        <p>
          Record actual acquisition price, purchase date, retailer, quantity, sealed/opened
          condition, and notes. Wave 3 replaces the generic order ticket with this workflow.
        </p>
        <div className="v3WorkflowActions">
          <button
            type="button"
            className="primaryButton"
            onClick={() => jumpToPageSection("collection", "open-positions")}
          >
            Log from Collection
          </button>
          <button type="button" className="ghostButton" onClick={() => navigateToPage("scan")}>
            Start from Scan
          </button>
        </div>
      </header>
    </div>
  );
}
