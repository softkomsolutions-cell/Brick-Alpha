const defaultModel = require('./brick-alpha-model');
const { normalizeEvidence } = require('./valuation/evidence');
const { evidenceSignal, boundConfidence } = require('./valuation/confidence');
const { statusFor } = require('./valuation/freshness');

function modelInputFromAsset(asset = {}, value) {
  const symbol = String(asset.symbol || asset.sku || asset.id || '').trim();
  return {
    id: symbol || 'unknown-asset',
    name: asset.name || symbol || 'Asset',
    brand: asset.brand || 'LEGO',
    category: asset.category || 'LEGO Investment',
    ...(asset.theme ? { legoTheme: asset.theme } : {}),
    ...(asset.retailPrice !== undefined ? { retailPrice: asset.retailPrice } : {}),
    ...(asset.buyPrice !== undefined ? { buyPrice: asset.buyPrice } : {}),
    ...(asset.expectedRetirementDate ? { expectedRetirementDate: asset.expectedRetirementDate } : {}),
    ...(asset.actualRetirementDate ? { actualRetirementDate: asset.actualRetirementDate } : {}),
    ...(asset.metadata && typeof asset.metadata === 'object' ? asset.metadata : {}),
    currentMarketValue: value,
    price: value,
  };
}

function normalizeEvidenceBatch(results, currency, displayCurrency, rates) {
  const evidence = [];
  const providers = results.map(result => ({ name: result.provider, available: result.available, error: result.error || null }));
  for (const result of results) {
    if (!result.available) continue;
    for (const entry of Array.isArray(result.evidence) ? result.evidence : []) {
      const normalized = normalizeEvidence({ ...entry, provider: entry.provider || result.provider }, { displayCurrency, rates });
      evidence.push({ ...normalized, currency: entry.currency || currency });
    }
  }
  return { evidence, providers };
}

function aggregateEvidence(evidence, displayCurrency, rates) {
  const prices = evidence
    .map(item => item.normalized?.normalizedAmount ?? null)
    .filter(value => value !== null);
  const rawPrices = evidence
    .map(item => item.salePrice)
    .filter(value => value !== null && Number.isFinite(value));
  const conversionUnavailable = evidence.some(item => item.normalized && item.normalized.conversion === 'unavailable');
  const converted = evidence.some(item => item.normalized && item.normalized.conversion === 'converted');
  const primaryCurrency = evidence.find(item => item.currency)?.currency || displayCurrency;

  let currency = primaryCurrency;
  let value = null;
  let conversionNotice = null;
  if (prices.length) {
    value = prices.reduce((sum, price) => sum + price, 0) / prices.length;
    currency = displayCurrency;
  } else if (rawPrices.length) {
    value = rawPrices.reduce((sum, price) => sum + price, 0) / rawPrices.length;
    currency = primaryCurrency;
    if (conversionUnavailable) conversionNotice = `currency_conversion_unavailable_${displayCurrency}`;
  }
  return { value, currency, displayValue: prices.length ? value : null, conversionNotice, converted };
}

function createValuationService({ repository, model = defaultModel, config, providers }) {
  if (!repository) throw new Error('valuation_repository_required');
  const displayCurrency = config.displayCurrency;
  const rates = config.rates || {};

  async function recalculate({ assetId, asset = {}, observedAt, asOf, evidenceInputs = null }) {
    const observedIso = observedAt ? new Date(observedAt).toISOString() : new Date().toISOString();
    const asOfDate = asOf ? new Date(asOf) : new Date(observedIso);

    let results;
    if (Array.isArray(evidenceInputs)) {
      results = evidenceInputs.map(entry => ({ provider: entry?.provider || 'external', available: true, error: null, evidence: [entry] }));
    } else {
      try {
        results = await providers.fetchAll(asset, { currency: displayCurrency, observedAt: observedIso });
      } catch (error) {
        results = [{ provider: 'error', available: false, evidence: [], price: null, error: error?.message || 'provider_fetch_failed' }];
      }
    }

    const { evidence, providers: providerMeta } = normalizeEvidenceBatch(results, displayCurrency, displayCurrency, rates);
    if (!evidence.length) {
      return { status: 'UNAVAILABLE', created: false, modelVersion: config.modelVersion, providers: providerMeta, reason: 'no_evidence' };
    }

    const aggregate = aggregateEvidence(evidence, displayCurrency, rates);
    if (aggregate.value === null) {
      return { status: 'UNAVAILABLE', created: false, modelVersion: config.modelVersion, providers: providerMeta, reason: 'no_usable_price' };
    }

    const latestObservedAt = new Date(Math.max(...evidence.map(item => new Date(item.observedAt || observedIso).getTime()))).toISOString();
    let status = statusFor({ observedAt: latestObservedAt, now: Date.now(), freshMs: config.freshnessMs, reviewMs: config.reviewMs, evidenceCount: evidence.length });
    if (aggregate.conversionNotice) status = 'REVIEW_REQUIRED';

    const modelInput = modelInputFromAsset(asset, aggregate.value);
    const enriched = model.enrichBrickAlphaCollectible(modelInput, asOfDate);
    const confidence = model.confidenceFor(enriched);
    const breakdown = model.buildBrickAlphaScoreBreakdown(enriched);

    const signal = evidenceSignal({ evidence, freshMs: config.freshnessMs, now: Date.now() });
    const bounded = boundConfidence(confidence, signal);

    const outcome = await repository.transaction(async tx => {
      const valuation = await tx.createValuation({
        assetId,
        source: providerMeta.filter(item => item.available)[0]?.name || 'manual',
        providerRecordId: null,
        status,
        value: aggregate.value,
        currency: aggregate.currency,
        confidence,
        asOf: asOfDate.toISOString(),
        rawPayload: { evidenceCount: evidence.length, providers: providerMeta },
        metadata: {
          displayCurrency,
          displayValue: aggregate.displayValue,
          conversion: aggregate.conversionNotice ? 'unavailable' : (aggregate.converted ? 'converted' : 'as-is'),
          notices: aggregate.conversionNotice ? [aggregate.conversionNotice] : [],
          modelVersion: config.modelVersion,
          evidenceSignal: signal,
          boundedConfidence: bounded.boundedConfidence,
        },
      });
      const persistedEvidence = [];
      for (const item of evidence) {
        persistedEvidence.push(await tx.createValuationEvidence({
          valuationId: valuation.id,
          kind: item.kind || 'CURRENT_PRICE',
          sourceUrl: item.sourceUrl ?? null,
          sourceLabel: item.sourceLabel ?? null,
          provider: item.provider ?? null,
          observedAt: item.observedAt ?? null,
          salePrice: item.salePrice ?? null,
          currency: item.currency ?? null,
          condition: item.condition ?? null,
          notes: item.notes ?? null,
          rawPayload: item.rawPayload ?? null,
        }));
      }
      const assessment = await tx.createAssessment({
        valuationId: valuation.id,
        assetId,
        modelVersion: config.modelVersion,
        score: enriched.brickAlphaScore,
        grade: model.investmentGradeFor(enriched.brickAlphaScore),
        recommendation: enriched.recommendation,
        confidence,
        estimatedRoi: Number.isFinite(enriched.estimatedRoi) ? enriched.estimatedRoi : null,
        projectedRoi: Number.isFinite(enriched.projectedRoi) ? enriched.projectedRoi : null,
        retirementStatus: enriched.retirementStatus || null,
        retirementProbability: Number.isFinite(enriched.retirementProbability) ? enriched.retirementProbability : null,
        factorScores: breakdown.factors,
        breakdown: { ...breakdown, evidenceSignal: signal, boundedConfidence: bounded.boundedConfidence },
      });
      return { valuation, evidence: persistedEvidence, assessment };
    });

    return { status, created: true, modelVersion: config.modelVersion, providers: providerMeta, ...outcome };
  }

  async function getValuation(assetId) {
    return repository.getLatestValuation(assetId);
  }
  async function getValuationHistory(assetId) {
    return repository.listValuationsByAsset(assetId);
  }
  async function getAssessment(assetId) {
    return repository.getLatestAssessment(assetId);
  }
  async function getAssessmentHistory(assetId) {
    return repository.listAssessmentsByAsset(assetId);
  }

  return {
    recalculate,
    getValuation,
    getValuationHistory,
    getAssessment,
    getAssessmentHistory,
    aggregateEvidence,
  };
}

module.exports = { createValuationService, modelInputFromAsset, aggregateEvidence };