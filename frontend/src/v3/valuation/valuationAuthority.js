function numberOrNull(value) {
  if (value == null || value === "") {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function canonicalMarketValue(item) {
  const brickEconomy = numberOrNull(item?.brickEconomyValue ?? item?.currentMarketValue);
  if (brickEconomy != null && brickEconomy > 0) {
    return {
      value: brickEconomy,
      source: "BrickEconomy",
      authoritative: true,
    };
  }
  const catalog = numberOrNull(item?.price);
  if (catalog != null && catalog > 0) {
    return {
      value: catalog,
      source: "Catalog mark",
      authoritative: false,
    };
  }
  return {
    value: null,
    source: "Unavailable",
    authoritative: false,
  };
}

export function recordedGrowth(item) {
  const annual = numberOrNull(item?.annualGrowth);
  const ninetyDay = numberOrNull(item?.growth90Day ?? item?.ninetyDayGrowth);
  return {
    annualPercent: annual,
    ninetyDayPercent: ninetyDay,
    annualSource: annual == null ? "Unavailable" : "Recorded annual growth",
    ninetyDaySource: ninetyDay == null ? "Unavailable" : "Recorded 90-day growth",
  };
}
