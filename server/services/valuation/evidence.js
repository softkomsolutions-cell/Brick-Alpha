const { currencyCode, safeNormalizePrice } = require('./currency');
const { evidenceObservedAt } = require('./freshness');

const EVIDENCE_KINDS = ['CURRENT_PRICE', 'SALE_PRICE', 'LISTING', 'PART_OUT', 'OTHER'];

function validateEvidenceInput(input) {
  if (!input || typeof input !== 'object') throw new Error('invalid_evidence');
  const kind = String(input.kind || 'OTHER').trim().toUpperCase();
  const sourceUrl = input.sourceUrl ? String(input.sourceUrl) : null;
  const sourceLabel = input.sourceLabel ? String(input.sourceLabel) : null;
  const provider = input.provider ? String(input.provider) : null;
  const observedAt = evidenceObservedAt(input.observedAt);
  const salePrice = input.salePrice === null || input.salePrice === undefined ? null : Number(input.salePrice);
  const currency = input.currency ? String(input.currency).toUpperCase() : null;
  const condition = input.condition ? String(input.condition) : null;
  const notes = input.notes ? String(input.notes) : null;
  const rawPayload = input.rawPayload ?? null;

  if (salePrice !== null && !Number.isFinite(salePrice)) throw new Error('invalid_evidence_price');
  if (currency !== null && !/^[A-Z]{3}$/.test(currency)) throw new Error('invalid_evidence_currency');
  return { kind, sourceUrl, sourceLabel, provider, observedAt, salePrice, currency, condition, notes, rawPayload };
}

function normalizeEvidence(input, { displayCurrency, rates } = {}) {
  const clean = validateEvidenceInput(input);
  const sourceCurrency = clean.currency ? currencyCode(clean.currency) : null;
  const normalized = clean.salePrice === null || clean.salePrice === undefined
    ? null
    : safeNormalizePrice({
        amount: clean.salePrice,
        sourceCurrency: sourceCurrency || displayCurrency,
        displayCurrency: displayCurrency || 'ZAR',
        rates: rates || {},
      });

  return { ...clean, currency: sourceCurrency, normalized };
}

module.exports = { EVIDENCE_KINDS, validateEvidenceInput, normalizeEvidence };