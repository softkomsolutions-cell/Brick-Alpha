// Adjacent provider adapters. They return normalized evidence only and never
// compute Brick Alpha scores. Real network calls are guarded by configured();
// tests and staging validation always use the mock provider.

const PROVIDER_TIME_BUDGET = 8000;

function fetchWithTimeout(url, options = {}, timeoutMs = PROVIDER_TIME_BUDGET) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function buildBricklinkProvider(environment = process.env) {
  const name = 'bricklink';
  const consumerKey = String(environment.BRICKLINK_CONSUMER_KEY || '').trim();
  const consumerSecret = String(environment.BRICKLINK_CONSUMER_SECRET || '').trim();
  const tokenValue = String(environment.BRICKLINK_TOKEN_VALUE || '').trim();
  const tokenSecret = String(environment.BRICKLINK_TOKEN_SECRET || '').trim();
  const configured = Boolean(consumerKey && consumerSecret && tokenValue && tokenSecret);

  async function fetchPriceEvidence({ asset, currency = 'USD' }) {
    if (!configured) return { provider: name, available: false, evidence: [], price: null, error: 'bricklink_not_configured' };
    const symbol = String(asset?.symbol || '').replace(/[^A-Za-z0-9-]/g, '');
    const endpoint = `https://api.bricklink.com/api/store/v1/items/set/${encodeURIComponent(symbol)}/price`;
    try {
      const response = await fetchWithTimeout(endpoint, {
        headers: { Authorization: `OAuth oauth_consumer_key="${consumerKey}", ...` },
      });
      if (!response.ok) return { provider: name, available: false, evidence: [], price: null, error: `bricklink_http_${response.status}` };
      const payload = await response.json();
      return { provider: name, available: true, evidence: [], price: null, error: null, payload };
    } catch (error) {
      const reason = error?.name === 'AbortError' ? 'bricklink_timeout' : error?.message || 'bricklink_error';
      return { provider: name, available: false, evidence: [], price: null, error: reason };
    }
  }

  return { name, configured: () => configured, describe: () => name, fetchPriceEvidence };
}

function buildBrickeconomyProvider(environment = process.env) {
  const name = 'brickeconomy';
  const apiKey = String(environment.BRICKECONOMY_API_KEY || '').trim();
  const configured = Boolean(apiKey);

  async function fetchPriceEvidence({ asset }) {
    if (!configured) return { provider: name, available: false, evidence: [], price: null, error: 'brickeconomy_not_configured' };
    const symbol = String(asset?.symbol || '').replace(/[^A-Za-z0-9-]/g, '');
    try {
      const response = await fetchWithTimeout(`https://api.brickeconomy.com/v1/set/${encodeURIComponent(symbol)}/price`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!response.ok) return { provider: name, available: false, evidence: [], price: null, error: `brickeconomy_http_${response.status}` };
      const payload = await response.json();
      return { provider: name, available: true, evidence: [], price: null, error: null, payload };
    } catch (error) {
      const reason = error?.name === 'AbortError' ? 'brickeconomy_timeout' : error?.message || 'brickeconomy_error';
      return { provider: name, available: false, evidence: [], price: null, error: reason };
    }
  }

  return { name, configured: () => configured, describe: () => name, fetchPriceEvidence };
}

module.exports = { buildBricklinkProvider, buildBrickeconomyProvider };