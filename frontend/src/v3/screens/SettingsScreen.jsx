import { useState } from "react";
import { readBuyingProfile, writeBuyingProfile } from "../onboarding/onboardingStorage";

const THEME_OPTIONS = ["Star Wars", "Icons", "Technic", "City", "Creator Expert", "Ideas", "Harry Potter", "Marvel", "DC", "Lord of the Rings"];

export function SettingsScreen({
  appSettings,
  currentUser,
  updateSettings,
  onDemoReset,
  onEditOnboarding,
  navigateToPage,
  settingsStatus,
}) {
  const [rate, setRate] = useState(String(appSettings.usdZarRate ?? 16.67));
  const [profile, setProfile] = useState(() => readBuyingProfile());
  const [profileStatus, setProfileStatus] = useState("");
  const saveRate = async (event) => {
    event.preventDefault();
    const numeric = Number(rate);
    if (!Number.isFinite(numeric) || numeric <= 0) return;
    const nextProfile = { ...profile, usdZarRate: numeric };
    setProfile(nextProfile);
    writeBuyingProfile(nextProfile);
    await updateSettings({ usdZarRate: numeric });
  };

  const toggleTheme = (theme) => {
    setProfile((current) => {
      const values = new Set(current.preferredThemes || []);
      if (values.has(theme)) values.delete(theme);
      else values.add(theme);
      return { ...current, preferredThemes: [...values] };
    });
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    const next = {
      ...profile,
      usdZarRate: Number(rate) || Number(profile.usdZarRate) || 16.67,
      rewardsProgrammes: Array.isArray(profile.rewardsProgrammes)
        ? profile.rewardsProgrammes
        : [],
      preferredThemes: Array.isArray(profile.preferredThemes)
        ? profile.preferredThemes
        : [],
    };
    writeBuyingProfile(next);
    setProfile(next);
    setRate(String(next.usdZarRate));
    await updateSettings({
      usdZarRate: next.usdZarRate,
      preferredRegion: next.country === "South Africa" ? "south-africa" : "global",
      riskMode:
        next.riskTolerance === "conservative"
          ? "defensive"
          : next.riskTolerance === "aggressive"
            ? "growth"
            : "balanced",
    });
    setProfileStatus("Investment profile saved.");
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

        <section className="v3DecisionCard v3ProfileSettings">
          <span className="v3Eyebrow">Investment profile</span>
          <h2>Edit your buying approach</h2>
          <p>These are the same choices from the intro. You can change them here at any time.</p>
          <form className="v3ProfileForm" onSubmit={saveProfile}>
            <label>
              Country
              <select
                value={profile.country}
                onChange={(event) => setProfile((current) => ({ ...current, country: event.target.value }))}
              >
                <option>South Africa</option>
                <option>United Kingdom</option>
                <option>United States</option>
                <option>Other</option>
              </select>
            </label>
            <label>
              Home currency
              <select
                value={profile.homeCurrency}
                onChange={(event) => setProfile((current) => ({ ...current, homeCurrency: event.target.value }))}
              >
                <option value="ZAR">ZAR</option>
                <option value="GBP">GBP</option>
                <option value="USD">USD</option>
              </select>
            </label>
            <label>
              Typical budget per set
              <input
                type="number"
                min="0"
                value={profile.budgetPerSet}
                onChange={(event) => setProfile((current) => ({ ...current, budgetPerSet: event.target.value }))}
              />
            </label>
            <label>
              Hold period
              <select
                value={profile.holdPeriod}
                onChange={(event) => setProfile((current) => ({ ...current, holdPeriod: event.target.value }))}
              >
                <option value="short">Under 2 years</option>
                <option value="medium">2–5 years</option>
                <option value="long">5+ years</option>
              </select>
            </label>
            <label>
              Risk tolerance
              <select
                value={profile.riskTolerance}
                onChange={(event) => setProfile((current) => ({ ...current, riskTolerance: event.target.value }))}
              >
                <option value="conservative">Conservative</option>
                <option value="balanced">Balanced</option>
                <option value="aggressive">Aggressive</option>
              </select>
            </label>
            <label>
              VAT-registered business buyer?
              <select
                value={profile.businessBuyer ? "yes" : "no"}
                onChange={(event) => setProfile((current) => ({ ...current, businessBuyer: event.target.value === "yes" }))}
              >
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </label>
            <div className="v3ProfileThemes">
              <span>Preferred themes</span>
              <div className="v3ThemeChipRow">
                {THEME_OPTIONS.map((theme) => (
                  <button
                    key={theme}
                    type="button"
                    className={profile.preferredThemes?.includes(theme) ? "v3ThemeChip active" : "v3ThemeChip"}
                    onClick={() => toggleTheme(theme)}
                  >
                    {theme}
                  </button>
                ))}
              </div>
            </div>
            <div className="v3ProfileActions">
              <button type="submit" className="primaryButton">Save investment profile</button>
              {onEditOnboarding ? (
                <button type="button" className="secondaryButton" onClick={onEditOnboarding}>
                  Reopen setup wizard
                </button>
              ) : null}
            </div>
            {profileStatus ? <small>{profileStatus}</small> : null}
          </form>
        </section>

        <section className="v3DecisionCard">
          <span className="v3Eyebrow">Valuation conversion</span>
          <h2>USD/ZAR exchange rate</h2>
          <p>One rate is used for every converted valuation. Gavin baseline: R16.670 / USD.</p>
          <form className="v3ExchangeForm" onSubmit={saveRate}>
            <label>
              Fallback rand per US dollar
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
