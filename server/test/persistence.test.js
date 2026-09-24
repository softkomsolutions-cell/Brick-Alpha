const test = require("node:test");
const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const {
  dataDir,
  registerUser,
  resetStore,
  snapshot,
  support,
} = require("../test-support/helpers");

const storeFile = path.join(dataDir, "app-store.json");

test.beforeEach(() => {
  resetStore();
});

test("loadStore returns an empty initialized store when the file does not exist", () => {
  fs.rmSync(storeFile, { force: true });
  const loaded = support.loadStore();

  assert.deepEqual(loaded.users, []);
  assert.deepEqual(loaded.userStates, {});
  assert.deepEqual(loaded.trades, []);
  assert.deepEqual(loaded.newsTargets, [
    "USD/ZAR macro pressure",
    "JSE risk appetite",
    "Pokemon sealed demand",
    "Retired LEGO set spreads",
  ]);
  assert.deepEqual(loaded.feedbackItems, []);
  assert.equal(typeof loaded.settings, "object");
});

test("persistStore writes the current store and survives a fresh process load", async () => {
  const user = await registerUser({ email: "persistence@example.test" });
  const state = support.getUserState(user.user.id);
  state.newsTargets.push("Persistence target");
  support.persistStore();

  const raw = JSON.parse(fs.readFileSync(storeFile, "utf8"));
  assert.equal(raw.users.length, 1);
  assert.equal(raw.users[0].email, "persistence@example.test");
  assert.ok(raw.userStates[user.user.id]);
  assert.ok(raw.userStates[user.user.id].newsTargets.includes("Persistence target"));

  const script = `
    const app = require(${JSON.stringify(path.join(__dirname, "..", "server.js"))});
    process.stdout.write(JSON.stringify(app.__testSupport.loadStore()));
  `;
  const child = childProcess.spawnSync(process.execPath, ["-e", script], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      COLLECTTRADE_TEST: "1",
      COLLECTTRADE_DISABLE_RUNTIME: "1",
      COLLECTTRADE_DATA_DIR: dataDir,
      COLLECTTRADE_SHARE_STATUS_FILE: path.join(dataDir, "share-status.json"),
      AUTH_SECRET: "phase0-test-auth-secret",
      CONNECTOR_SECRET: "phase0-test-connector-secret",
    },
    encoding: "utf8",
  });

  assert.equal(child.status, 0, child.stderr);
  const restarted = JSON.parse(child.stdout);
  assert.equal(restarted.users[0].email, "persistence@example.test");
  assert.ok(restarted.userStates[user.user.id]);
  assert.ok(restarted.userStates[user.user.id].newsTargets.includes("Persistence target"));
});

test("malformed JSON preserves current empty-store recovery behavior", () => {
  fs.writeFileSync(storeFile, "{ malformed json", "utf8");
  const loaded = support.loadStore();

  assert.deepEqual(loaded.users, []);
  assert.deepEqual(loaded.userStates, {});
  assert.deepEqual(loaded.trades, []);
  assert.deepEqual(loaded.feedbackItems, []);
});

test("user-state creation persists a default state for the user key", async () => {
  const user = await registerUser({ email: "state-creation@example.test" });
  const createdState = support.getUserState(user.user.id);

  assert.ok(Array.isArray(createdState.trades));
  assert.ok(Array.isArray(createdState.intakeRequests));
  assert.ok(Array.isArray(createdState.watchlistItems));
  assert.ok(Array.isArray(createdState.alertRules));
  assert.ok(Array.isArray(createdState.notifications));
  assert.ok(Array.isArray(createdState.alertEmailQueue));
  assert.equal(typeof createdState.settings, "object");
  assert.equal(typeof createdState.connectors, "object");
  assert.ok(snapshot().userStates[user.user.id]);
});
