export function VerdictScreen({ navigateToPage }) {
  return (
    <div className="v3WorkflowScreen" data-page="verdict">
      <header className="v3WorkflowHero">
        <h1>Verdict</h1>
        <p>
          Decision-first view: recommendation, Brick Alpha score, confidence, ROI, and risk in one
          screen. Wave 2 splits this from the long scan analysis while keeping the same
          intelligence underneath.
        </p>
        <div className="v3WorkflowActions">
          <button type="button" className="primaryButton" onClick={() => navigateToPage("scan")}>
            Scan or select a set
          </button>
          <button type="button" className="ghostButton" onClick={() => navigateToPage("set-analysis")}>
            Open Set Analysis
          </button>
        </div>
      </header>
    </div>
  );
}
