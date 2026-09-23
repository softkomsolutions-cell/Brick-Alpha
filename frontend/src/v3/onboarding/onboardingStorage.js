const ONBOARDING_COMPLETE_KEY = "brick_alpha_v3_onboarding_complete";
const BUYING_PROFILE_KEY = "brick_alpha_v3_buying_profile";

export const DEFAULT_BUYING_PROFILE = {
  budgetPerSet: "",
  holdPeriod: "medium",
  riskTolerance: "balanced",
  preferredThemes: [],
};

export function isV3OnboardingComplete() {
  try {
    return window.localStorage.getItem(ONBOARDING_COMPLETE_KEY) === "1";
  } catch {
    return false;
  }
}

export function markV3OnboardingComplete() {
  try {
    window.localStorage.setItem(ONBOARDING_COMPLETE_KEY, "1");
  } catch {
    // ignore
  }
}

export function resetV3OnboardingForDemo() {
  try {
    window.localStorage.removeItem(ONBOARDING_COMPLETE_KEY);
  } catch {
    // ignore
  }
}

export function readBuyingProfile() {
  try {
    const raw = window.localStorage.getItem(BUYING_PROFILE_KEY);
    if (!raw) {
      return { ...DEFAULT_BUYING_PROFILE };
    }
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_BUYING_PROFILE,
      ...parsed,
      preferredThemes: Array.isArray(parsed?.preferredThemes) ? parsed.preferredThemes : [],
    };
  } catch {
    return { ...DEFAULT_BUYING_PROFILE };
  }
}

export function writeBuyingProfile(profile) {
  try {
    window.localStorage.setItem(
      BUYING_PROFILE_KEY,
      JSON.stringify({
        ...DEFAULT_BUYING_PROFILE,
        ...profile,
        preferredThemes: Array.isArray(profile?.preferredThemes)
          ? profile.preferredThemes
          : [],
      }),
    );
  } catch {
    // ignore
  }
}
