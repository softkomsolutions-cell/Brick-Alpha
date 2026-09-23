export function SetAnalysisScreen({ navigateToPage }) {
  return (
    <div className="v3WorkflowScreen" data-page="set-analysis">
      <header className="v3WorkflowHero">
        <h1>Set Analysis</h1>
        <p>
          Nine-factor deep dive (retirement, minifigures, demand, scarcity, liquidity, theme,
          portfolio fit, price trend, historical performance). Existing analysis modules move here
          behind Verdict in Wave 2.
        </p>
        <div className="v3WorkflowActions">
          <button type="button" className="ghostButton" onClick={() => navigateToPage("verdict")}>
            Back to Verdict
          </button>
          <button
            type="button"
            className="primaryButton"
            onClick={() => navigateToPage("research")}
          >
            Research catalogue
          </button>
        </div>
      </header>
    </div>
  );
}
