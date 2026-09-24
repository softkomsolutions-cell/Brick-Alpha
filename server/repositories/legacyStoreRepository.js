function createLegacyStoreRepository({
  getFeedback,
  getStoreSnapshot,
  getUserState,
  getUsers,
  persist,
}) {
  return Object.freeze({
    getFeedback,
    getSettings(userId) {
      return getUserState(userId).settings;
    },
    getStoreSnapshot,
    getTrades(userId) {
      return getUserState(userId).trades;
    },
    getUserById(userId) {
      return getUsers().find((user) => user.id === userId) || null;
    },
    getUserState,
    listUsers() {
      return getUsers();
    },
    persist,
  });
}

module.exports = {
  createLegacyStoreRepository,
};
