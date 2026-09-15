const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { inspectLegacyStore } = require("../scripts/inspect-legacy-store");

test("legacy inspector validates and summarizes a store without exposing secrets", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "brickalpha-inspector-"));
  const filePath = path.join(directory, "app-store.json");
  const store = {
    users: [
      {
        id: "user-1",
        email: "hidden@example.test",
        passwordHash: "must-not-be-printed",
      },
    ],
    userStates: {
      "user-1": {
        trades: [{ id: 1 }],
      },
    },
    trades: [{ id: 2 }],
    feedbackItems: [{ id: "feedback-1" }],
  };
  fs.writeFileSync(filePath, JSON.stringify(store, null, 2), "utf8");
  const original = fs.readFileSync(filePath, "utf8");

  const first = inspectLegacyStore(filePath);
  const second = inspectLegacyStore(filePath);
  const expectedChecksum = crypto.createHash("sha256").update(original).digest("hex");

  assert.equal(first.validation, "PASSED");
  assert.equal(first.readyForMigration, true);
  assert.equal(first.userCount, 1);
  assert.equal(first.userStateCount, 1);
  assert.equal(first.tradeCount, 2);
  assert.equal(first.feedbackCount, 1);
  assert.equal(first.checksum, expectedChecksum);
  assert.equal(first.checksum, second.checksum);
  assert.equal(JSON.stringify(first).includes("must-not-be-printed"), false);
  assert.equal(fs.readFileSync(filePath, "utf8"), original);

  fs.rmSync(directory, { recursive: true, force: true });
});

test("legacy inspector rejects malformed JSON without modifying the source", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "brickalpha-inspector-malformed-"));
  const filePath = path.join(directory, "app-store.json");
  const original = "{ invalid";
  fs.writeFileSync(filePath, original, "utf8");

  const summary = inspectLegacyStore(filePath);

  assert.equal(summary.validation, "FAILED");
  assert.equal(summary.readyForMigration, false);
  assert.equal(summary.userCount, 0);
  assert.equal(fs.readFileSync(filePath, "utf8"), original);

  fs.rmSync(directory, { recursive: true, force: true });
});
