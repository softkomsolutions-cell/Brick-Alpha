const test = require("node:test");
const assert = require("node:assert/strict");

const {
  app,
  authenticated,
  registerUser,
  resetStore,
  support,
} = require("../test-support/helpers");

test.beforeEach(() => {
  resetStore();
});

const ASSET = {
  symbol: "PHASE4-API-1",
  name: "Phase Four API Set",
  brand: "LEGO",
  category: "LEGO Star Wars",
  retailPrice: 100,
  buyPrice: 75,
  expectedRetirementDate: "2028-12-31",
};

async function recalc(token, assetId = ASSET.symbol, body = {}) {
  const base = { asset: { ...ASSET, symbol: assetId } };
  return authenticated(token).post(`/api/assets/${assetId}/valuation/recalculate`).send({ ...base, ...body });
}

test("valuation endpoints require authentication", async () => {
  for (const route of [
    `/api/assets/${ASSET.symbol}/valuation`,
    `/api/assets/${ASSET.symbol}/valuations`,
    `/api/assets/${ASSET.symbol}/brick-alpha`,
    `/api/assets/${ASSET.symbol}/brick-alpha/history`,
    `/api/assets/${ASSET.symbol}/valuation/recalculate`,
  ]) {
    const method = route.endsWith("/recalculate") ? "post" : "get";
    const response = await require("supertest")(app)[method](route).send({});
    assert.equal(response.status, 401);
    assert.equal(response.body.error, "unauthorized");
  }
});

test("recalculate persists valuation, evidence, and versioned assessment through the API", async () => {
  assert.equal(support.valuationConfig.mode, "legacy");
  const user = await registerUser({ email: "valuation-api@example.test" });

  const created = await recalc(user.token);
  assert.equal(created.status, 201);
  assert.equal(created.body.ok, true);
  assert.equal(created.body.status, "FRESH");
  assert.equal(created.body.modelVersion, "brick-alpha-v1");
  assert.ok(created.body.valuation.id);
  assert.equal(created.body.valuation.status, "FRESH");
  assert.equal(created.body.valuation.source, "mock");
  assert.ok(created.body.valuation.evidence === undefined || Array.isArray(created.body.valuation.evidence));
  assert.equal(created.body.assessment.modelVersion, "brick-alpha-v1");
  assert.ok(created.body.assessment.score);
  assert.ok(created.body.assessment.recommendation);

  const latest = await authenticated(user.token).get(`/api/assets/${ASSET.symbol}/valuation`);
  assert.equal(latest.status, 200);
  assert.equal(latest.body.valuation.id, created.body.valuation.id);

  const history = await authenticated(user.token).get(`/api/assets/${ASSET.symbol}/valuations`);
  assert.equal(history.status, 200);
  assert.equal(history.body.valuations.length, 1);

  const assessment = await authenticated(user.token).get(`/api/assets/${ASSET.symbol}/brick-alpha`);
  assert.equal(assessment.status, 200);
  assert.equal(assessment.body.assessment.id, created.body.assessment.id);

  const assessmentHistory = await authenticated(user.token).get(`/api/assets/${ASSET.symbol}/brick-alpha/history`);
  assert.equal(assessmentHistory.body.assessments.length, 1);
});

test("recalculate is append-only and preserves history via the API", async () => {
  const user = await registerUser({ email: "valuation-api-history@example.test" });
  const first = await recalc(user.token);
  const second = await recalc(user.token);
  assert.equal(second.status, 201);
  assert.notEqual(second.body.valuation.id, first.body.valuation.id);
  assert.notEqual(second.body.assessment.id, first.body.assessment.id);

  const history = await authenticated(user.token).get(`/api/assets/${ASSET.symbol}/valuations`);
  assert.equal(history.body.valuations.length, 2);
  assert.equal(history.body.valuations[0].id, first.body.valuation.id);
  assert.deepEqual(history.body.valuations[1].id, second.body.valuation.id);

  const assessmentHistory = await authenticated(user.token).get(`/api/assets/${ASSET.symbol}/brick-alpha/history`);
  assert.equal(assessmentHistory.body.assessments.length, 2);
  assert.ok(assessmentHistory.body.assessments.every(item => item.modelVersion === "brick-alpha-v1"));

  const latest = await authenticated(user.token).get(`/api/assets/${ASSET.symbol}/valuation`);
  assert.equal(latest.body.valuation.id, second.body.valuation.id);
});

test("unknown asset and unavailable provider behave predictably", async () => {
  const user = await registerUser({ email: "valuation-api-missing@example.test" });
  const missing = await authenticated(user.token).get("/api/assets/does-not-exist/valuation");
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error, "valuation_not_found");

  const emptyEvidence = await recalc(user.token, "PHASE4-API-2", { evidence: [] });
  assert.equal(emptyEvidence.status, 409);
  assert.equal(emptyEvidence.body.error, "valuation_unavailable");
  assert.equal(emptyEvidence.body.reason, "no_evidence");

  const oversizeId = await recalc(user.token, "x".repeat(129));
  assert.equal(oversizeId.status, 400);
  assert.equal(oversizeId.body.error, "invalid_asset_id");
});

test("valuation records are asset-scoped reference data shared by authenticated users", async () => {
  const firstUser = await registerUser({ email: "valuation-user-a@example.test" });
  const secondUser = await registerUser({ email: "valuation-user-b@example.test" });
  await recalc(firstUser.token);

  const view = await authenticated(secondUser.token).get(`/api/assets/${ASSET.symbol}/valuation`);
  assert.equal(view.status, 200);
  assert.ok(view.body.valuation.id);
  assert.ok(!("userId" in view.body.valuation));
  assert.ok(!("user" in view.body.valuation));
  const assessment = await authenticated(secondUser.token).get(`/api/assets/${ASSET.symbol}/brick-alpha`);
  assert.equal(assessment.body.assessment.assetId, ASSET.symbol);
  assert.ok(!("userId" in assessment.body.assessment));
});