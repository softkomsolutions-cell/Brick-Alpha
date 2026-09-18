const { createMockProvider } = require('./mockProvider');
const { buildBricklinkProvider, buildBrickeconomyProvider } = require('./providers');

function createProviderRegistry({ config, environment = process.env } = {}) {
  const available = {
    mock: createMockProvider(),
    bricklink: buildBricklinkProvider(environment),
    brickeconomy: buildBrickeconomyProvider(environment),
  };
  const enabledNames = Array.isArray(config?.providers) && config.providers.length ? config.providers : ['mock'];
  const enabled = Object.fromEntries(
    enabledNames
      .filter(name => available[name])
      .map(name => [name, available[name]]),
  );
  if (!enabled.mock) enabled.mock = available.mock;

  return {
    list: () => Object.keys(enabled),
    describe: () => Object.values(enabled).map(provider => ({ name: provider.name, configured: provider.configured(), describe: provider.describe() })),
    get(name) {
      const provider = enabled[name || 'mock'];
      if (!provider) throw new Error(`unknown_valuation_provider_${name}`);
      return provider;
    },
    async fetchAll(asset, context = {}) {
      const results = [];
      for (const name of Object.keys(enabled)) {
        try {
          results.push(await enabled[name].fetchPriceEvidence({ asset, ...context }));
        } catch (error) {
          results.push({ provider: name, available: false, evidence: [], price: null, error: error?.message || 'provider_error' });
        }
      }
      return results;
    },
  };
}

module.exports = { createProviderRegistry, buildBricklinkProvider, buildBrickeconomyProvider };