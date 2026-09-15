const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const request = require("supertest");

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "collecttrade-phase0-"));

process.env.COLLECTTRADE_TEST = "1";
process.env.COLLECTTRADE_DISABLE_RUNTIME = "1";
process.env.COLLECTTRADE_DATA_DIR = dataDir;
process.env.COLLECTTRADE_SHARE_STATUS_FILE = path.join(dataDir, "share-status.json");
process.env.AUTH_SECRET = "phase0-test-auth-secret";
process.env.CONNECTOR_SECRET = "phase0-test-connector-secret";
process.env.TWELVE_DATA_API_KEY = "";

const app = require("../server");
const support = app.__testSupport;

if (!support) {
  throw new Error("Phase 0 test support was not enabled.");
}

let userSequence = 0;

function resetStore() {
  support.resetStore();
}

function authenticated(token) {
  const withAuth = (testRequest) =>
    testRequest.set("Authorization", `Bearer ${token}`);

  return {
    delete: (route) => withAuth(request(app).delete(route)),
    get: (route) => withAuth(request(app).get(route)),
    patch: (route) => withAuth(request(app).patch(route)),
    post: (route) => withAuth(request(app).post(route)),
    put: (route) => withAuth(request(app).put(route)),
  };
}

async function registerUser(overrides = {}) {
  userSequence += 1;
  const user = {
    name: overrides.name || `Phase 0 User ${userSequence}`,
    email: overrides.email || `phase0-${userSequence}@example.test`,
    password: overrides.password || "Phase0-password-123",
  };
  const response = await request(app).post("/api/auth/register").send(user);
  assert.equal(response.status, 201);
  return { ...user, ...response.body, token: response.body.token };
}

function expiredToken(userId, email) {
  const body = Buffer.from(
    JSON.stringify({
      sub: userId,
      email,
      exp: Date.now() - 1000,
    }),
  ).toString("base64url");
  const signature = crypto
    .createHmac("sha256", process.env.AUTH_SECRET)
    .update(body)
    .digest("base64url");
  return `${body}.${signature}`;
}

function snapshot() {
  return support.getStoreSnapshot();
}

function installFetchMock(handler) {
  const originalFetch = global.fetch;
  global.fetch = handler;
  return () => {
    global.fetch = originalFetch;
  };
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

process.on("exit", () => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

module.exports = {
  app,
  authenticated,
  dataDir,
  expiredToken,
  installFetchMock,
  jsonResponse,
  registerUser,
  resetStore,
  snapshot,
  support,
};
