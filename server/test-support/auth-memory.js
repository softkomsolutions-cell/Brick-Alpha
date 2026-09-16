const { createLegacyAuthRepository } = require('../repositories/legacyAuthRepository');
function memoryAuth() {
  const users = [], states = {}, auth = { sessions: [], events: [], legacyTokenCutoffs: {} };
  const repo = createLegacyAuthRepository({ getUsers: () => users, getUserState: id => states[id] ||= { settings: {} }, getAuthState: () => auth, persist() {}, removeUserState: id => { delete states[id]; } });
  return { repo, users, states, auth };
}
const settings = { preferredRegion: 'south-africa', timezone: 'Africa/Johannesburg', riskMode: 'balanced', subscriptionTier: 'starter', alertPreferences: { inAppEnabled: true }, routinePreferences: {}, executionProfiles: {} };
module.exports = { memoryAuth, settings };
