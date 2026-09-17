const { Prisma } = require('@prisma/client');
const Decimal = Prisma.Decimal;

function decimal(value = 0) {
  if (value instanceof Decimal) return value;
  const normalized = value === null || value === undefined || value === '' ? 0 : value;
  return new Decimal(String(normalized));
}

function money(value) {
  return decimal(value).toDecimalPlaces(8, Decimal.ROUND_HALF_UP);
}

function positive(value, code) {
  const parsed = decimal(value);
  if (!parsed.isFinite() || parsed.lte(0)) throw new Error(code);
  return parsed;
}

function nonNegative(value, code) {
  const parsed = decimal(value);
  if (!parsed.isFinite() || parsed.lt(0)) throw new Error(code);
  return parsed;
}

module.exports = { decimal, money, nonNegative, positive };
