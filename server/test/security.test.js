const test = require("node:test");
const assert = require("node:assert/strict");

const {
  app,
  authenticated,
  expiredToken,
  registerUser,
  resetStore,
  support,
} = require("../test-support/helpers");

test.beforeEach(() => {
  resetStore();
});

test("missing and invalid authentication preserve current 401 behavior", async () => {
  const missing = await require("supertest")(app).get("/api/auth/me");
  assert.equal(missing.status, 401);
  assert.deepEqual(missing.body, { ok: false, error: "unauthorized" });

  const invalid = await require("supertest")(app)
    .get("/api/auth/me")
    .set("Authorization", "Bearer invalid-token");
  assert.equal(invalid.status, 401);
  assert.deepEqual(invalid.body, { ok: false, error: "unauthorized" });
});

test("expired bearer tokens are rejected", async () => {
  const user = await registerUser({ email: "expired-token@example.test" });
  const token = expiredToken(user.user.id, user.user.email);
  const response = await require("supertest")(app)
    .get("/api/auth/me")
    .set("Authorization", `Bearer ${token}`);

  assert.equal(response.status, 401);
  assert.equal(response.body.error, "unauthorized");
});

test("owner-only feedback changes preserve current authorization behavior", async () => {
  const owner = await registerUser({ email: "owner@example.test" });
  const partner = await registerUser({ email: "partner@example.test" });
  assert.equal(owner.user.role, "owner");
  assert.equal(partner.user.role, "partner");

  const feedback = await authenticated(owner.token)
    .post("/api/feedback")
    .send({
      title: "Owner authorization baseline",
      notes: "This item freezes the current owner-only feedback behavior.",
    });
  assert.equal(feedback.status, 201);

  const partnerUpdate = await authenticated(partner.token)
    .patch(`/api/feedback/${feedback.body.item.id}`)
    .send({ status: "resolved" });
  assert.equal(partnerUpdate.status, 403);
  assert.deepEqual(partnerUpdate.body, { ok: false, error: "feedback_admin_required" });

  const ownerUpdate = await authenticated(owner.token)
    .patch(`/api/feedback/${feedback.body.item.id}`)
    .send({ status: "resolved" });
  assert.equal(ownerUpdate.status, 200);
  assert.equal(ownerUpdate.body.item.status, "resolved");
});

test("password hashes are persisted instead of plaintext passwords", async () => {
  const user = await registerUser({
    email: "hashing@example.test",
    password: "known-phase0-password",
  });
  const stored = support.getUsers().find((candidate) => candidate.id === user.user.id);

  assert.ok(stored.passwordSalt);
  assert.ok(stored.passwordHash);
  assert.notEqual(stored.passwordHash, "known-phase0-password");
  assert.notEqual(stored.passwordSalt, "known-phase0-password");
});

test("expired password reset codes preserve current expiry behavior", async () => {
  const user = await registerUser({ email: "reset-expiry@example.test" });
  const request = await require("supertest")(app)
    .post("/api/auth/forgot-password/request")
    .send({ email: user.email });
  assert.equal(request.status, 200);

  const stored = support.getUsers().find((candidate) => candidate.id === user.user.id);
  stored.passwordResetExpiresAt = new Date(Date.now() - 1000).toISOString();
  support.persistStore();

  const confirm = await require("supertest")(app)
    .post("/api/auth/forgot-password/confirm")
    .send({
      email: user.email,
      code: request.body.demoCode,
      password: "new-password-phase0",
    });
  assert.equal(confirm.status, 400);
  assert.deepEqual(confirm.body, { ok: false, error: "reset_code_expired" });
});
