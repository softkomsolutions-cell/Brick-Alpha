import { useState } from "react";

export function SettingsScreen({
  appSettings,
  currentUser,
  updateSettings,
  onDemoReset,
  navigateToPage,
  settingsStatus,
}) {
  const [rate, setRate] = useState(String(appSettings.usdZarRate ?? 18.5));
  const saveRate = async (event) => {
    event.preventDefault();
    const numeric = Number(rate);
    if (!Number.isFinite(numeric) || numeric <= 0) return;
    await updateSettings({ usdZarRate: numeric });
  };

  return (
    <div className="v3WorkflowScreen v3Settings" data-page="settings">
      <header className="v3WorkflowHero">
        <div>
          <span className="v3Eyebrow">Account & valuation</span>
          <h1>Settings</h1>
          <p>Keep Brick Alpha focused on your LEGO investment book, valuation inputs and demo controls.</p>
        </div>
      </header>

      {settingsStatus ? <div className="v3SourceNotice" role="status">{settingsStatus}</div> : null}

      <div className="v3DataSourceGrid">
        <section className="v3DecisionCard">
          <span className="v3Eyebrow">Account</span>
          <h2>{currentUser?.name || "Brick Alpha user"}</h2>
          <div className="v3SourceMeta">
            <span>Email</span><strong>{currentUser?.email || "—"}</strong>
            <span>Role</span><strong>{currentUser?.role === "owner" ? "Owner" : "Partner tester"}</strong>
          </div>
          <button type="button" className="secondaryButton" onClick={() => navigateToPage("data-sources")}>
            Open Data Sources
          </button>
        </section>

        <section className="v3DecisionCard">
          <span className="v3Eyebrow">Valuation conversion</span>
          <h2>USD/ZAR exchange rate</h2>
          <p>One rate is used for every converted valuation. Gavin baseline: R18.50 / USD.</p>
          <form className="v3ExchangeForm" onSubmit={saveRate}>
            <label>
              Rand per US dollar
              <input
                name="usdZarRate"
                type="number"
                min="0.01"
                step="0.01"
                value={rate}
                onChange={(event) => setRate(event.target.value)}
              />
            </label>
            <button type="submit" className="primaryButton">Save rate</button>
          </form>
        </section>
      </div>

      {currentUser?.isDemo ? (
        <section className="v3DecisionCard v3DemoResetCard">
          <span className="v3Eyebrow">Demo controls</span>
          <h2>Reset Gavin demo</h2>
          <p>Starts a fresh demo account, clears temporary decision/watch state and restores the seeded Gavin baseline.</p>
          <button type="button" className="primaryButton" onClick={onDemoReset}>Reset Demo</button>
        </section>
      ) : null}
    </div>
  );
}
