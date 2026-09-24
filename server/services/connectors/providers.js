const VALR_BASE_URL = process.env.VALR_BASE_URL || 'https://api.valr.com';
const DEFAULT_PAIRS = ['BTCUSDT', 'BTCUSDC', 'BTCZAR'];

function createConnectorProviderRegistry({ config, fetchFn = globalThis.fetch } = {}) {
  const timeoutMs = (providerTimeoutMs = 8000) => providerTimeoutMs;

  function httpError(status, message, headers) {
    return Object.assign(new Error(String(message) || `valr_http_${status}`), {
      status,
      headers: headers || {},
    });
  }

  async function valrRequest(credentials, method, endpointPath, body = null, { signal, subAccountId } = {}) {
    const { apiKey, apiSecret } = credentials || {};
    if (!apiKey || !apiSecret) {
      throw Object.assign(new Error('connector_not_configured'), { code: 'connector_not_configured' });
    }

    const payloadBody = body ? JSON.stringify(body) : '';
    const timestamp = Date.now().toString();
    let signature = require('node:crypto')
      .createHmac('sha512', apiSecret)
      .update(timestamp)
      .update(method.toUpperCase())
      .update(endpointPath)
      .update(payloadBody);
    if (subAccountId) signature = signature.update(subAccountId);

    const headers = {
      'Content-Type': 'application/json',
      'X-VALR-API-KEY': apiKey,
      'X-VALR-SIGNATURE': signature.digest('hex'),
      'X-VALR-TIMESTAMP': timestamp,
    };
    if (subAccountId) headers['X-VALR-SUB-ACCOUNT-ID'] = subAccountId;

    const response = await fetchFn(`${VALR_BASE_URL}${endpointPath}`, {
      method,
      headers,
      body: body ? payloadBody : undefined,
      signal: signal || undefined,
    });

    const responseText = await response.text();
    let data = null;
    if (responseText) {
      try {
        data = JSON.parse(responseText);
      } catch {
        data = { message: responseText };
      }
    }

    if (!response.ok) {
      throw httpError(response.status, data?.message || `valr_http_${response.status}`, response.headers);
    }
    return data;
  }

  function sanitizeBalance(entry) {
    const currency = String(entry?.currency || entry?.asset || entry?.symbol || '').trim().toUpperCase();
    if (!currency) return null;
    const available = Number(entry?.available ?? entry?.availableBalance ?? 0);
    const reserved = Number(entry?.reserved ?? entry?.reservedBalance ?? entry?.locked ?? 0);
    const total = Number(entry?.total ?? available + reserved);
    if (![available, reserved, total].every(Number.isFinite)) return null;
    return {
      currency,
      available: Number(available.toFixed(8)),
      reserved: Number(reserved.toFixed(8)),
      total: Number(total.toFixed(8)),
    };
  }

  function normalizeBalances(payload) {
    const entries = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload?.balances)
          ? payload.balances
          : [];
    return entries
      .map(sanitizeBalance)
      .filter(Boolean)
      .sort((left, right) => Math.abs(right.total) - Math.abs(left.total));
  }

  const valr = {
    id: 'valr',
    name: 'VALR',
    desk: 'crypto',
    authType: 'apiKey',
    availability: 'live',
    capabilities: ['balances'],
    supportsOrders: false,
    docsUrl: 'https://docs.valr.com/',
    configured(credentials) {
      return Boolean(credentials?.apiKey && credentials?.apiSecret);
    },
    async fetchPortfolioSnapshot(credentials, context = {}) {
      const { config = {}, signal } = context;
      const ms = Number(config.timeoutMs) || timeoutMs(config.providerTimeoutMs || 8000);
      const payload = await valrRequest(
        credentials,
        'GET',
        '/v1/account/balances',
        null,
        { signal, subAccountId: config.subAccountId || null },
      );
      const balances = normalizeBalances(payload);
      const fundedAssets = balances.filter(entry => Math.abs(entry.total) > 0).length;
      return {
        fetchedAt: new Date().toISOString(),
        balances,
        totalAssets: balances.length,
        fundedAssets,
        durationMs: ms,
      };
    },
    async fetchBalance(credentials, context = {}) {
      const snapshot = await valr.fetchPortfolioSnapshot(credentials, context);
      return snapshot.balances;
    },
    async health(credentials, context = {}) {
      const { config = {}, signal } = context;
      const ms = Number(config.timeoutMs) || timeoutMs(config.providerTimeoutMs || 8000);
      try {
        const balances = await valr.fetchBalance(credentials, { config, signal });
        return {
          available: true,
          state: 'healthy',
          detail: `fetch ${balances.length} balance rows`,
          durationMs: ms,
        };
      } catch (error) {
        const status = Number(error?.status || 0);
        return {
          available: false,
          state: status >= 500 || status === 429 ? 'unavailable' : 'degraded',
          detail: 'provider_unavailable',
          status: status || null,
          durationMs: ms,
        };
      }
    },
    async fetchMarketSnapshot(context = {}) {
      const { config = {} } = context;
      const pairs = Array.isArray(config?.pairs) && config.pairs.length
        ? config.pairs
        : DEFAULT_PAIRS;
      const results = [];
      for (const pair of pairs.slice(0, 5)) {
        try {
          const summary = await valrRequest(credentialsForPublic(), 'GET', `/v1/markets/${encodeURIComponent(pair)}/summary`);
          results.push({ pair, ok: true, summary });
        } catch (error) {
          results.push({ pair, ok: false, status: Number(error?.status || 0) });
        }
      }
      return { ok: results.some(item => item.ok), markets: results };
    },
  };

  function credentialsForPublic() {
    return { apiKey: 'brickalpha-internal-readonly', apiSecret: 'brickalpha-internal-readonly' };
  }

  function manualProvider(meta) {
    return {
      ...meta,
      supportsOrders: false,
      configured(record) {
        if (meta.id === 'ibkr') return Boolean(record?.config?.gatewayUrl && record?.config?.accountId);
        if (meta.id === 'saxo') return Boolean(record?.authBlob);
        if (meta.id === 'easyequities') return Boolean(record?.config?.accountLabel);
        return Boolean(Object.keys(record?.config || {}).length);
      },
      async fetchPortfolioSnapshot() {
        throw Object.assign(new Error('sync_not_supported'), { code: 'sync_not_supported' });
      },
      async fetchBalance() {
        throw Object.assign(new Error('sync_not_supported'), { code: 'sync_not_supported' });
      },
      async health(record) {
        return { available: false, state: 'manual', detail: 'manual_setup' };
      },
      async fetchMarketSnapshot(context = {}) {
        return { ok: false, markets: [], detail: 'manual_setup' };
      },
    };
  }

  const providers = {
    valr,
    ibkr: manualProvider({
      id: 'ibkr',
      name: 'Interactive Brokers',
      desk: 'etfs',
      authType: 'gateway',
      availability: 'manual_setup',
      capabilities: ['accounts', 'positions', 'orders'],
      docsUrl: 'https://ibkrcampus.com/campus/ibkr-api-page/webapi-doc/',
    }),
    saxo: manualProvider({
      id: 'saxo',
      name: 'Saxo Bank',
      desk: 'forex',
      authType: 'oauth2',
      availability: 'manual_setup',
      capabilities: ['accounts', 'positions', 'orders'],
      docsUrl: 'https://developer.saxobank.com/openapi/learn/',
    }),
    easyequities: manualProvider({
      id: 'easyequities',
      name: 'EasyEquities',
      desk: 'jse',
      authType: 'manual',
      availability: 'unsupported',
      capabilities: ['manual tracking'],
      docsUrl: 'https://www.easyequities.co.za/',
    }),
  };

  const enabledIds = Array.isArray(config?.providers) && config.providers.length
    ? config.providers.map(id => String(id).trim().toLowerCase()).filter(id => providers[id])
    : Object.keys(providers);

  const enabled = Object.fromEntries(enabledIds.map(id => [id, providers[id]]));

  return {
    list: () => Object.keys(enabled),
    describe: () => Object.values(enabled).map(provider => ({
      id: provider.id,
      name: provider.name,
      desk: provider.desk,
      authType: provider.authType,
      availability: provider.availability,
      capabilities: provider.capabilities,
      supportsOrders: provider.supportsOrders,
      docsUrl: provider.docsUrl,
    })),
    get(providerId) {
      const provider = enabled[String(providerId || '').trim().toLowerCase()];
      if (!provider) throw new Error(`unknown_connector_provider_${providerId}`);
      return provider;
    },
  };
}

module.exports = { createConnectorProviderRegistry };