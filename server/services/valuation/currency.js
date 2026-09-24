const ISO_CURRENCY = /^[A-Z]{3}$/;

function currencyCode(value, fallback) {
  const code = String(value || fallback || '').trim().toUpperCase();
  if (!ISO_CURRENCY.test(code)) throw new Error('invalid_currency');
  return code;
}

function conversionKey(sourceCurrency, displayCurrency) {
  return `${sourceCurrency}_${displayCurrency}`;
}

function safeNormalizePrice({ amount, sourceCurrency, displayCurrency, rates = {} }) {
  if (amount === null || amount === undefined || !Number.isFinite(Number(amount))) {
    return { amount: null, sourceCurrency: currencyCode(sourceCurrency), displayCurrency: currencyCode(displayCurrency), normalizedAmount: null, normalizedCurrency: currencyCode(displayCurrency), conversion: 'missing_amount', reason: 'missing_amount' };
  }
  const source = currencyCode(sourceCurrency);
  const display = currencyCode(displayCurrency);
  const numeric = Number(amount);

  if (source === display) {
    return { amount: numeric, sourceCurrency: source, displayCurrency: display, normalizedAmount: numeric, normalizedCurrency: display, conversion: 'as-is', reason: null };
  }

  const key = conversionKey(source, display);
  const rate = Number(rates[key]);
  if (!Number.isFinite(rate) || rate <= 0) {
    return { amount: numeric, sourceCurrency: source, displayCurrency: display, normalizedAmount: null, normalizedCurrency: display, conversion: 'unavailable', reason: `missing_rate_${key}` };
  }

  return { amount: numeric, sourceCurrency: source, displayCurrency: display, normalizedAmount: numeric * rate, normalizedCurrency: display, conversion: 'converted', reason: null };
}

module.exports = { currencyCode, safeNormalizePrice };
