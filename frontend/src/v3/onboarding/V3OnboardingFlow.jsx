import { useMemo, useState } from "react";
import { BrandLogo } from "../../components/brandLogo";
import {
  DEFAULT_BUYING_PROFILE,
  markV3OnboardingComplete,
  writeBuyingProfile,
} from "./onboardingStorage";
import "./v3Onboarding.css";

const THEME_OPTIONS = ["Star Wars", "Icons", "Technic", "City", "Creator Expert", "Ideas"];

const STEPS = ["welcome", "how-you-buy", "add-sets"];

export function V3OnboardingFlow({ onComplete, onNavigateToScan, onNavigateToDataSources, onApplySettings }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [profile, setProfile] = useState(() => ({ ...DEFAULT_BUYING_PROFILE }));

  const step = STEPS[stepIndex];

  const finish = async () => {
    writeBuyingProfile(profile);
    await onApplySettings?.({
      usdZarRate: Number(profile.usdZarRate) || 16.67,
      preferredRegion: profile.country === "South Africa" ? "south-africa" : "global",
    });
    markV3OnboardingComplete();
    onComplete();
  };

  const toggleTheme = (theme) => {
    setProfile((current) => {
      const set = new Set(current.preferredThemes || []);
      if (set.has(theme)) {
        set.delete(theme);
      } else {
        set.add(theme);
      }
      return { ...current, preferredThemes: [...set] };
    });
  };

  const stepTitle = useMemo(() => {
    if (step === "welcome") {
      return "Welcome to Brick Alpha";
    }
    if (step === "how-you-buy") {
      return "How you buy";
    }
    return "Add your sets";
  }, [step]);

  return (
    <div className="v3OnboardingShell">
      <div className="v3OnboardingPanel">
        <div className="v3OnboardingTop">
          <BrandLogo variant="full" size="sm" />
          <button type="button" className="ghostButton" onClick={finish}>
            Skip for now
          </button>
        </div>

        <div className="v3OnboardingStepLabel">
          Step {stepIndex + 1} of {STEPS.length}
        </div>
        <h1>{stepTitle}</h1>

        {step === "welcome" ? (
          <>
            <p>Set the valuation context Brick Alpha will use across the collection.</p>
            <div className="v3OnboardingForm">
              <label>
                <span>Country</span>
                <select value={profile.country} onChange={(event) => setProfile((current) => ({ ...current, country: event.target.value }))}>
                  <option>South Africa</option>
                  <option>United Kingdom</option>
                  <option>United States</option>
                  <option>Other</option>
                </select>
              </label>
              <label>
                <span>Home currency</span>
                <select value={profile.homeCurrency} onChange={(event) => setProfile((current) => ({ ...current, homeCurrency: event.target.value }))}>
                  <option value="ZAR">ZAR</option>
                  <option value="GBP">GBP</option>
                  <option value="USD">USD</option>
                </select>
              </label>
              <label>
                <span>USD exchange rate</span>
                <input type="number" min="0.01" step="0.01" value={profile.usdZarRate} onChange={(event) => setProfile((current) => ({ ...current, usdZarRate: event.target.value }))} />
              </label>
            </div>
          </>
        ) : null}

        {step === "how-you-buy" ? (
          <>
            <p>Configure the cost tools and buying profile used by Brick Alpha.</p>
            <div className="v3OnboardingForm">
              <label>
                <span>Buy through a VAT-registered business?</span>
                <select value={profile.businessBuyer ? "yes" : "no"} onChange={(event) => setProfile((current) => ({ ...current, businessBuyer: event.target.value === "yes" }))}>
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </label>
              {profile.businessBuyer ? (
                <label>
                  <span>VAT rate (%)</span>
                  <input type="number" min="0" step="0.1" value={profile.vatRate} onChange={(event) => setProfile((current) => ({ ...current, vatRate: event.target.value }))} />
                </label>
              ) : null}
              <label>
                <span>Rewards programmes</span>
                <input type="text" value={(profile.rewardsProgrammes || []).join(", ")} onChange={(event) => setProfile((current) => ({ ...current, rewardsProgrammes: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) }))} placeholder="eBucks, miles (optional)" />
              </label>
              <label>
                <span>Typical budget per set (ZAR)</span>
                <input
                  type="number"
                  min="0"
                  value={profile.budgetPerSet}
                  onChange={(event) =>
                    setProfile((current) => ({ ...current, budgetPerSet: event.target.value }))
                  }
                  placeholder="e.g. 2500"
                />
              </label>
              <label>
                <span>Hold period</span>
                <select
                  value={profile.holdPeriod}
                  onChange={(event) =>
                    setProfile((current) => ({ ...current, holdPeriod: event.target.value }))
                  }
                >
                  <option value="short">Under 2 years</option>
                  <option value="medium">2–5 years</option>
                  <option value="long">5+ years</option>
                </select>
              </label>
              <label>
                <span>Risk tolerance</span>
                <select
                  value={profile.riskTolerance}
                  onChange={(event) =>
                    setProfile((current) => ({ ...current, riskTolerance: event.target.value }))
                  }
                >
                  <option value="conservative">Conservative</option>
                  <option value="balanced">Balanced</option>
                  <option value="aggressive">Aggressive</option>
                </select>
              </label>
              <div>
                <span>Preferred themes</span>
                <div className="v3ThemeChipRow">
                  {THEME_OPTIONS.map((theme) => (
                    <button
                      key={theme}
                      type="button"
                      className={`v3ThemeChip ${profile.preferredThemes.includes(theme) ? "active" : ""}`}
                      onClick={() => toggleTheme(theme)}
                    >
                      {theme}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </>
        ) : null}

        {step === "add-sets" ? (
          <>
            <p>Load your existing collection. Spreadsheet import is the fastest path; you can also scan or enter a set number.</p>
            <div className="v3OnboardingImportRow">
              <button type="button" className="v3OnboardingImportCard" onClick={onNavigateToScan}>
                <strong>Scan a set</strong>
                <small>Photo or set number — fastest path to the first set in your collection.</small>
              </button>
              <button type="button" className="v3OnboardingImportCard" onClick={onNavigateToScan}>
                <strong>Enter set number</strong>
                <small>Identify the set, review the verdict, then log the purchase.</small>
              </button>
              <button type="button" className="v3OnboardingImportCard" onClick={onNavigateToDataSources}>
                <strong>Import spreadsheet · fastest</strong>
                <small>Import an existing tracker through Data Sources.</small>
              </button>
            </div>
          </>
        ) : null}

        <div className="v3OnboardingFooter">
          <div className="v3OnboardingDots" aria-hidden="true">
            {STEPS.map((id, index) => (
              <span key={id} className={`v3OnboardingDot ${index === stepIndex ? "active" : ""}`} />
            ))}
          </div>
          <button
            type="button"
            className="primaryButton"
            onClick={() => {
              if (stepIndex >= STEPS.length - 1) {
                finish();
                return;
              }
              setStepIndex((value) => value + 1);
            }}
          >
            {stepIndex >= STEPS.length - 1 ? "Go to Home" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
