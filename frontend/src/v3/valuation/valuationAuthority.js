function numberOrNull(value) {
  if (value == null || value === "") {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function positiveOrNull(value) {
  const numeric = numberOrNull(value);
  return numeric != null && numeric > 0 ? numeric : null;
}

/**
 * BrickEconomy is the only current market value.
 * Catalogue price, retail, purchase price, and forecasts are never substitutes.
 */
export function canonicalMarketValue(item) {
  const brickEconomy = positiveOrNull(item?.brickEconomyValue ?? item?.currentMarketValue);
  if (brickEconomy != null) {
    return {
      value: brickEconomy,
      source: "BrickEconomy",
      authoritative: true,
    };
  }
  return {
    value: null,
    source: "Unavailable",
    authoritative: false,
  };
}

function dayKey(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString().slice(0, 10);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Growth is the change between recorded valuations.
 * Same-day points collapse to the last finite positive value.
 * A window is available only when a baseline exists at or before the window start.
 */
export function growthFromHistory(history = [], asOf) {
  const byDay = new Map();
  for (const point of history || []) {
    const key = dayKey(point?.date ?? point?.valuationDate);
    const value = positiveOrNull(point?.value ?? point?.currentMarketValue);
    if (!key || value == null) {
      continue;
    }
    byDay.set(key, value);
  }

  const points = [...byDay.entries()]
    .map(([date, value]) => ({
      date,
      time: Date.parse(`${date}T00:00:00.000Z`),
      value,
    }))
    .filter((point) => Number.isFinite(point.time))
    .sort((left, right) => left.time - right.time);

  const anchor = asOf ? Date.parse(asOf) : points[points.length - 1]?.time;
  const current = Number.isFinite(anchor)
    ? [...points].reverse().find((point) => point.time <= anchor) || null
    : null;

  function windowGrowth(days, slackDays, label) {
    if (!current) {
      return { percent: null, label: "Insufficient history" };
    }
    const cutoff = current.time - days * DAY_MS;
    const earliest = cutoff - slackDays * DAY_MS;
    const baseline = [...points].reverse().find(
      (point) => point.time <= cutoff && point.time >= earliest && point.time < current.time,
    );
    if (!baseline) {
      return { percent: null, label: "Insufficient history" };
    }
    const percent = ((current.value - baseline.value) / baseline.value) * 100;
    if (!Number.isFinite(percent)) {
      return { percent: null, label: "Insufficient history" };
    }
    return { percent, label };
  }

  const annual = windowGrowth(365, 45, "Recorded annual growth");
  const ninetyDay = windowGrowth(90, 45, "Recorded 90-day growth");
  return {
    annualPercent: annual.percent,
    ninetyDayPercent: ninetyDay.percent,
    annualSource: annual.label,
    ninetyDaySource: ninetyDay.label,
    valuationDate: current?.date || null,
  };
}

export function recordedGrowth(item) {
  if (Array.isArray(item?.valuationHistory) && item.valuationHistory.length) {
    return growthFromHistory(item.valuationHistory, item?.asOf);
  }
  const annual = numberOrNull(item?.annualGrowth);
  const ninetyDay = numberOrNull(item?.growth90Day ?? item?.ninetyDayGrowth);
  return {
    annualPercent: annual,
    ninetyDayPercent: ninetyDay,
    annualSource: annual == null ? "Insufficient history" : "Recorded annual growth",
    ninetyDaySource: ninetyDay == null ? "Insufficient history" : "Recorded 90-day growth",
    valuationDate: item?.valuationDate || null,
  };
}

export function buildCanonicalValuation(item) {
  const market = canonicalMarketValue(item);
  const growth = recordedGrowth(item);
  return {
    currentMarketValue: market.value,
    valuationDate: item?.valuationDate || growth.valuationDate || null,
    source: market.authoritative ? "BrickEconomy" : "Unavailable",
    annualGrowth: growth.annualPercent,
    ninetyDayGrowth: growth.ninetyDayPercent,
    annualGrowthLabel: growth.annualSource,
    ninetyDayGrowthLabel: growth.ninetyDaySource,
    confidence: numberOrNull(item?.dataConfidence ?? item?.confidence ?? item?.valuationConfidence),
    provenance: market.authoritative
      ? item?.valuationProvenance || "BrickEconomy recorded value"
      : "No recorded value",
    authoritative: market.authoritative,
  };
}

export function formatRecordedGrowth(percent) {
  if (percent == null || !Number.isFinite(Number(percent))) {
    return "—";
  }
  const numeric = Number(percent);
  const sign = numeric > 0 ? "+" : "";
  return `${sign}${numeric.toFixed(1)}%`;
}

export function formatCanonicalValue(value) {
  if (value == null || !Number.isFinite(Number(value)) || Number(value) <= 0) {
    return "No recorded value";
  }
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(Number(value));
}
