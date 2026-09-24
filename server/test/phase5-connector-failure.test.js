const test = require("node:test");
const assert = require("node:assert/strict");

const {
  FAILURE_CLASSES,
  classifyFailure,
  extractRetryAfterSeconds,
  healthStateFor,
  safeSummary,
} = require("../services/connectors/failure");
const {
  FRESH_STATUS,
  STALE_STATUS,
  REFRESH_REQUIRED_STATUS,
  UNAVAILABLE_STATUS,
  connectorFreshness,
  shouldRefresh,
} = require("../services/connectors/freshness");

const HOUR = 60 * 60 * 1000;

test("failure classification covers every documented class", () => {
  assert.deepEqual([...FAILURE_CLASSES].sort(), [
    "AUTH_FAILED",
    "NON_RETRYABLE",
    "PROVIDER_UNAVAILABLE",
    "RATE_LIMITED",
    "RETRYABLE",
    "TIMEOUT",
  ]);
  assert.equal(classifyFailure({ error: Object.assign(new Error("rate"), { status: 429 }) }).failureClass, "RATE_LIMITED");
  assert.equal(classifyFailure({ error: Object.assign(new Error("auth"), { status: 401 }) }).failureClass, "AUTH_FAILED");
  assert.equal(classifyFailure({ error: Object.assign(new Error("auth"), { status: 403 }) }).failureClass, "AUTH_FAILED");
  assert.equal(classifyFailure({ error: Object.assign(new Error("down"), { status: 503 }) }).failureClass, "PROVIDER_UNAVAILABLE");
  assert.equal(classifyFailure({ error: Object.assign(new Error("server"), { status: 500 }) }).failureClass, "RETRYABLE");
  assert.equal(classifyFailure({ error: Object.assign(new Error("bad"), { status: 404 }) }).failureClass, "NON_RETRYABLE");
  assert.equal(classifyFailure({ error: Object.assign(new Error("timeout"), { name: "AbortError" }) }).failureClass, "TIMEOUT");
  assert.equal(classifyFailure({ error: Object.assign(new Error("timeout"), { code: "JOB_TIMEOUT" }) }).failureClass, "TIMEOUT");
  assert.equal(classifyFailure({ error: Object.assign(new Error("dns"), { code: "ENOTFOUND" }) }).failureClass, "PROVIDER_UNAVAILABLE");
  assert.equal(classifyFailure({ error: Object.assign(new Error("reset"), { code: "ECONNRESET" }) }).failureClass, "PROVIDER_UNAVAILABLE");
});

test("retryability is explicit per failure class and auth/non-retryable never repeat", () => {
  const byClass = {
    RETRYABLE: Object.assign(new Error("500"), { status: 500 }),
    NON_RETRYABLE: Object.assign(new Error("400"), { status: 400 }),
    RATE_LIMITED: Object.assign(new Error("429"), { status: 429 }),
    AUTH_FAILED: Object.assign(new Error("401"), { status: 401 }),
    TIMEOUT: Object.assign(new Error("abort"), { name: "AbortError" }),
    PROVIDER_UNAVAILABLE: Object.assign(new Error("dns"), { code: "ENOTFOUND" }),
  };
  const retryable = new Set(["RETRYABLE", "RATE_LIMITED", "TIMEOUT", "PROVIDER_UNAVAILABLE"]);
  for (const type of FAILURE_CLASSES) {
    const failure = classifyFailure(byClass[type]);
    assert.equal(failure.retryable, retryable.has(type), `${type} retryable=${failure.retryable}`);
  }
});

test("429 Retry-After headers are honoured and bounded", () => {
  const error = Object.assign(new Error("rate"), {
    status: 429,
    headers: { "retry-after": "120", "Retry-After": "60" },
  });
  assert.equal(extractRetryAfterSeconds(error), 120);
  const rfcDate = new Date(Date.now() + 45 * 1000).toUTCString();
  assert.ok((extractRetryAfterSeconds(Object.assign(new Error("x"), { status: 429, headers: { "Retry-After": rfcDate } })) ?? 0) >= 40);
});

test("safeSummary redacts secrets and never leaks them into error strings", () => {
  assert.equal(safeSummary("boom"), "boom");
  const leaky = "X-VALR-API-KEY=abc123 and apiSecret=hunter2 and postgresql://u:p@db/x";
  assert.equal(safeSummary(leaky), "error_detail_redacted");
  const truncated = safeSummary(`x${"y".repeat(500)}`);
  assert.ok(truncated.length < 500);
  assert.ok(!/apiSecret/i.test(safeSummary("failed with X-VALR-SIGNATURE=deadbeef")));
  assert.ok(!/hunter2/.test(safeSummary(leaky)));
});

test("healthStateFor maps failure classes to documented circuit states without permanent disable", () => {
  assert.equal(healthStateFor("RATE_LIMITED"), "RATE_LIMITED");
  assert.equal(healthStateFor("AUTH_FAILED"), "AUTH_FAILED");
  assert.equal(healthStateFor("PROVIDER_UNAVAILABLE"), "UNAVAILABLE");
  assert.equal(healthStateFor("TIMEOUT"), "DEGRADED");
  assert.equal(healthStateFor("TIMEOUT", "UNAVAILABLE"), "UNAVAILABLE");
  assert.equal(healthStateFor("RETRYABLE"), "DEGRADED");
  assert.equal(healthStateFor("NON_RETRYABLE"), "DEGRADED");
  assert.notEqual(healthStateFor("UNAVAILABLE"), "AUTH_FAILED");
});

test("connector freshness maps FRESH/STALE/REFRESH_REQUIRED/UNAVAILABLE like Phase 4 thresholds", () => {
  const now = Date.now();
  assert.equal(connectorFreshness({ observedAt: now - 5 * HOUR, now, refreshAfterMs: 24 * HOUR, reviewMs: 72 * HOUR }), FRESH_STATUS);
  assert.equal(connectorFreshness({ observedAt: now - 25 * HOUR, now, refreshAfterMs: 24 * HOUR, reviewMs: 72 * HOUR }), STALE_STATUS);
  assert.equal(connectorFreshness({ observedAt: now - 80 * HOUR, now, refreshAfterMs: 24 * HOUR, reviewMs: 72 * HOUR }), REFRESH_REQUIRED_STATUS);
  assert.equal(connectorFreshness({ observedAt: null, now, refreshAfterMs: 24 * HOUR, reviewMs: 72 * HOUR }), UNAVAILABLE_STATUS);
  assert.equal(connectorFreshness({ observedAt: now - 5 * HOUR, now, refreshAfterMs: 24 * HOUR, reviewMs: 72 * HOUR, sourceAvailable: false }), UNAVAILABLE_STATUS);
});

test("shouldRefresh never refreshes fresh data and always honours force", () => {
  assert.equal(shouldRefresh(FRESH_STATUS), false);
  assert.equal(shouldRefresh(FRESH_STATUS, true), true);
  assert.equal(shouldRefresh(STALE_STATUS), true);
  assert.equal(shouldRefresh(REFRESH_REQUIRED_STATUS), true);
  assert.equal(shouldRefresh(UNAVAILABLE_STATUS), true);
});