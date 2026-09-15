const test = require("node:test");
const assert = require("node:assert/strict");

const {
  app,
  registerUser,
  resetStore,
  support,
} = require("../test-support/helpers");
const {
  getDatabaseHealth,
  readDatabaseConfig,
  validateDatabaseConfig,
} = require("../config/database");

test.beforeEach(() => {
  resetStore();
});

test("database configuration is optional while legacy persistence remains active", async () => {
  const config = readDatabaseConfig({ NODE_ENV: "test" });
  assert.equal(config.configured, false);
  assert.equal(config.environment, "test");

  const health = await getDatabaseHealth({ NODE_ENV: "test" });
  assert.deepEqual(health, {
    status: "not_configured",
    configured: false,
    environment: "test",
  });

  const response = await require("supertest")(app).get("/api/health");
  assert.equal(response.status, 200);
  assert.equal(response.body.services.database, "not_configured");
  assert.equal(response.body.metrics.databaseConfigured, false);
});

test("database configuration validates an explicit PostgreSQL test URL without connecting", () => {
  const config = readDatabaseConfig({
    DATABASE_URL: "postgresql://phase1:test@localhost:5432/brickalpha_test",
    NODE_ENV: "test",
  });
  const validated = validateDatabaseConfig(config);

  assert.equal(config.configured, true);
  assert.equal(config.environment, "test");
  assert.equal(validated.valid, true);
  assert.equal(validated.reason, null);
});

test("legacy application and repository abstraction remain usable without PostgreSQL", async () => {
  const user = await registerUser({ email: "repository-phase1@example.test" });
  const repository = support.legacyStoreRepository;

  assert.equal(repository.getUserById(user.user.id).email, user.user.email);
  assert.equal(repository.getSettings(user.user.id).preferredRegion, "south-africa");
  assert.deepEqual(repository.getTrades(user.user.id), []);
  assert.equal(repository.listUsers().length, 1);
  assert.ok(Array.isArray(repository.getFeedback()));
  assert.equal(typeof repository.getStoreSnapshot(), "object");
});
