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

export function V3OnboardingFlow({ onComplete, onNavigateToScan, onNavigateToCollection }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [profile, setProfile] = useState(() => ({ ...DEFAULT_BUYING_PROFILE }));

  const step = STEPS[stepIndex];

  const finish = () => {
    writeBuyingProfile(profile);
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
          <p>
            Brick Alpha combines investment intelligence with a simple loop: scan a set, get a
            verdict, log purchases, track your collection, and plan exits. This takes about a
            minute.
          </p>
        ) : null}

        {step === "how-you-buy" ? (
          <>
            <p>Tell us how you invest so portfolio fit and recommendations can personalise later.</p>
            <div className="v3OnboardingForm">
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
            <p>Seed your collection now or start scanning. You can always add more later.</p>
            <div className="v3OnboardingImportRow">
              <button type="button" className="v3OnboardingImportCard" onClick={onNavigateToScan}>
                <strong>Scan a set</strong>
                <small>Photo or set number — fastest path to your first holding.</small>
              </button>
              <button
                type="button"
                className="v3OnboardingImportCard"
                onClick={onNavigateToCollection}
              >
                <strong>Add manually</strong>
                <small>Open Collection and log purchases with price, date, and source.</small>
              </button>
              <button type="button" className="v3OnboardingImportCard" disabled>
                <strong>Import CSV</strong>
                <small>Coming in Wave 3 — bulk import for existing spreadsheets.</small>
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
