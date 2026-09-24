const DAY_MS = 24 * 60 * 60 * 1000;

/** Frozen analysis clock. UI actions must not move retirement math onto Date.now(). */
export const CANONICAL_AS_OF = "2026-09-23T12:00:00.000Z";

function finiteOrNull(value) {
  if (value == null || value === "") {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function parseDate(value) {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Retirement is frozen from the recorded date and the analysis clock.
 * Unrelated fields on the set do not move months remaining.
 * Retirement pop is recorded only. It is not a forward forecast.
 */
export function buildCanonicalRetirement(item, asOf = CANONICAL_AS_OF) {
  const clock = parseDate(asOf) || new Date(CANONICAL_AS_OF);
  const actual = parseDate(item?.actualRetirementDate);
  const expected = parseDate(item?.expectedRetirementDate || item?.sellByTargetDate);
  const anchor = actual || expected;
  const daysRemaining = anchor == null ? null : Math.round((anchor.getTime() - clock.getTime()) / DAY_MS);
  const monthsRemaining = daysRemaining == null ? null : Math.round(daysRemaining / 30);

  let retirementState = "Active";
  if (actual || (daysRemaining != null && daysRemaining < 0)) {
    retirementState = "Retired";
  } else if (daysRemaining != null && daysRemaining <= 183) {
    retirementState = "Inside 6 months";
  } else if (daysRemaining != null && daysRemaining <= 548) {
    retirementState = "Approaching";
  }

  const recordedPop = finiteOrNull(item?.recordedRetirementPop);
  const probability = finiteOrNull(item?.retirementProbability);
  const confidence = finiteOrNull(item?.retirementConfidence);

  return {
    expectedRetirementDate: expected ? expected.toISOString().slice(0, 10) : null,
    monthsRemaining,
    daysRemaining,
    retirementState,
    status: retirementState,
    expectedRetirement: expected ? expected.toISOString().slice(0, 10) : "No recorded retirement date",
    retirementProbability: probability == null ? null : Math.round(probability),
    retirementConfidence: confidence == null ? null : Math.round(confidence),
    retirementPop: recordedPop != null && recordedPop > 0 ? recordedPop : null,
    source: anchor ? "Recorded retirement date" : "No recorded retirement date",
    provenance: anchor ? "Recorded retirement date" : "No recorded retirement date",
    insideSixMonths: retirementState === "Inside 6 months",
    reminders: {
      sixtyDay: daysRemaining != null && daysRemaining >= 31 && daysRemaining <= 60,
      thirtyDay: daysRemaining != null && daysRemaining >= 0 && daysRemaining <= 30,
    },
  };
}

export function retirementReminderLabel(retirement) {
  if (!retirement) {
    return null;
  }
  if (retirement.reminders?.thirtyDay) {
    return "30-day reminder";
  }
  if (retirement.reminders?.sixtyDay) {
    return "60-day reminder";
  }
  if (retirement.insideSixMonths) {
    return "Inside 6 months";
  }
  return null;
}
