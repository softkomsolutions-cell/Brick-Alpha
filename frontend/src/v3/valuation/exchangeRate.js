/** Single USD/ZAR rate for every converted Brick Alpha valuation. */
export const DEFAULT_USD_ZAR_RATE = 18.5;

export function resolveExchangeRate(settings) {
  const numeric = Number(settings?.usdZarRate);
  const rate = Number.isFinite(numeric) && numeric > 0 ? numeric : DEFAULT_USD_ZAR_RATE;
  return {
    pair: "USD/ZAR",
    rate,
    label: `R${rate.toFixed(2)} / USD`,
    source: "Settings",
    valuationDate: settings?.exchangeRateDate || null,
  };
}

export function convertUsdToZar(usd, settings) {
  const exchange = resolveExchangeRate(settings);
  const amount = Number(usd);
  if (!Number.isFinite(amount)) {
    return { zar: null, ...exchange };
  }
  const zar = amount * exchange.rate;
  return {
    zar: Number.isFinite(zar) ? zar : null,
    ...exchange,
  };
}
