import { useState } from "react";

export function V3SettingsScreen({
  appSettings,
  currentUser,
  navigateToPage,
  onDemoReset,
  updateSettings,
}) {
  const [rate, setRate] = useState(String(appSettings?.usdZarRate ?? 18.5));
  const [status, setStatus] = useState("");

  const saveRate = async (event) => {
    event.preventDefault();
    const value = Number(rate);
    if (!Number.isFinite(value) || value <= 0) {
      setStatus("Enter a valid USD/ZAR rate.");
      return;
    }
    await updateSettings({ usdZarRate: value });
    setStatus(`Exchange rate saved at R${value.toFixed(2)} / USD.`);
  };

  const setRiskMode = async (riskMode) => {
    await updateSettings({ riskMode });
    setStatus(`Investment profile updated to ${riskMode}.`);
  };

  return (
    <div className="v3WorkflowScreen v3Settings" data-page="settings">
      <header className="v3WorkflowHero">
        <div>
          <span className="v3Eyebrow">Account & investment preferences</span>
          <h1>Settings</h1>
          <p>Keep Brick Alpha focused on LEGO investing: your account, investment profile, exchange rate and data sources.</p>
        </div>
      </header>

      {status ? <div className="v3SourceNotice" role="status">{status}</div> : null}

      <div className="v3DataSourceGrid">
        <section className="v3DecisionCard">
          <span className="v3Eyebrow">Account</span>
          <h2>{currentUser?.name || "Brick Alpha user"}</h2>
          <div className="v3SourceMeta">
            <span>Email</span><strong>{currentUser?.email || "—"}</strong>
            <span>Role</span><strong>{currentUser?.role === "owner" ? "Owner" : "Partner tester"}</strong>
            <span>Timezone</span><strong>{appSettings?.timezone || "Africa/Johannesburg"}</strong>
          </div>
        </section>

        <section className="v3DecisionCard">
          <span className="v3Eyebrow">Investment profile</span>
          <h2>Risk approach</h2>
          <p>This shapes personalised “For your book” guidance. It does not alter the canonical set facts or BrickEconomy value.</p>
          <div className="v3SettingsChoices">
            {["defensive", "balanced", "growth"].map((mode) => (
              <button
                key={mode}
                type="button"
                className={appSettings?.riskMode === mode ? "secondaryButton active" : "secondaryButton"}
                onClick={() => setRiskMode(mode)}
              >
                {mode[0].toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
        </section>

        <section className="v3DecisionCard">
          <span className="v3Eyebrow">Currency conversion</span>
          <h2>USD/ZAR exchange rate</h2>
          <p>One rate is used for every converted valuation. Gavin’s demo baseline is R18.50 / USD.</p>
          <form className="v3ExchangeForm" onSubmit={saveRate}>
            <label>
              Rand per US dollar
              <input
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

        <section className="v3DecisionCard">
          <span className="v3Eyebrow">Collection & valuation</span>
          <h2>Data Sources</h2>
          <p>Import owned sets and cost basis, or connect BrickEconomy for canonical current market values.</p>
          <button type="button" className="primaryButton" onClick={() => navigateToPage("data-sources")}>
            Open Data Sources
          </button>
        </section>
      </div>

      {currentUser?.isDemo ? (
        <section className="v3DecisionCard v3ResetCard">
          <span className="v3Eyebrow">Demo baseline</span>
          <h2>Reset Gavin demo</h2>
          <p>Starts a fresh demo account and restores the seeded Gavin baseline. Use this only after QA is complete.</p>
          <button type="button" className="secondaryButton" onClick={onDemoReset}>Reset Demo</button>
        </section>
      ) : null}
    </div>
  );
}
