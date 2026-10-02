const test = require("node:test");
const assert = require("node:assert/strict");

const {
  authenticated,
  registerUser,
  resetStore,
} = require("../test-support/helpers");

test.beforeEach(() => {
  resetStore();
});

test("collection import preview validates catalogue rows and returns a stable import id", async () => {
  const user = await registerUser();
  const response = await authenticated(user.token)
    .post("/api/collection/import/preview")
    .send({
      rows: [
        { setNumber: "75367", quantity: 2, purchasePrice: 1000, condition: "Sealed" },
        { setNumber: "999999", quantity: 1, purchasePrice: 500 },
      ],
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.summary.total, 2);
  assert.equal(response.body.summary.valid, 1);
  assert.equal(response.body.summary.invalid, 1);
  assert.match(response.body.importId, /^[a-f0-9]{24}$/);
  assert.equal(response.body.rows[0].valid, true);
  assert.equal(response.body.rows[1].valid, false);
  assert.match(response.body.rows[1].errors.join(" "), /catalogue/i);
});

test("collection import calculates all-in unit cost and accepts zero-cost gifts", async () => {
  const user = await registerUser();

  const preview = await authenticated(user.token)
    .post("/api/collection/import/preview")
    .send({
      rows: [
        {
          setNumber: "75367",
          quantity: 2,
          purchasePrice: 1000,
          shipping: 100,
          rewards: 50,
          retailer: "QA Retailer",
          purchaseDate: "2026-09-29",
        },
      ],
    });
  assert.equal(preview.status, 200);
  assert.equal(preview.body.summary.valid, 1);

  const commit = await authenticated(user.token)
    .post("/api/collection/import/commit")
    .send({ rows: preview.body.rows.filter((row) => row.valid), importId: preview.body.importId });

  assert.equal(commit.status, 201);
  assert.equal(commit.body.created, 1);
  assert.equal(commit.body.duplicate, false);
  const venator = commit.body.portfolio.find((trade) => String(trade.sku) === "75367");
  assert.ok(venator);
  assert.equal(venator.quantity, 2);
  assert.equal(venator.entryPrice, 1025);
  assert.match(venator.orderNote, /QA Retailer/);
  assert.match(venator.orderNote, /Imported collection data/);

  const giftPreview = await authenticated(user.token)
    .post("/api/collection/import/preview")
    .send({ rows: [{ setNumber: "10305", quantity: 1, purchasePrice: 0, retailer: "Gift" }] });
  assert.equal(giftPreview.body.rows[0].valid, true);

  const giftCommit = await authenticated(user.token)
    .post("/api/collection/import/commit")
    .send({ rows: giftPreview.body.rows.filter((row) => row.valid), importId: giftPreview.body.importId });
  assert.equal(giftCommit.status, 201);
  const gift = giftCommit.body.portfolio.find((trade) => String(trade.sku) === "10305" && trade.status === "open");
  assert.ok(gift);
  assert.equal(gift.entryPrice, 0);
});

test("collection import is idempotent and duplicate commit does not add positions", async () => {
  const user = await registerUser();
  const preview = await authenticated(user.token)
    .post("/api/collection/import/preview")
    .send({ rows: [{ setNumber: "75367", quantity: 1, purchasePrice: 20000 }] });

  const payload = { rows: preview.body.rows.filter((row) => row.valid), importId: preview.body.importId };
  const first = await authenticated(user.token).post("/api/collection/import/commit").send(payload);
  const second = await authenticated(user.token).post("/api/collection/import/commit").send(payload);

  assert.equal(first.status, 201);
  assert.equal(first.body.created, 1);
  assert.equal(second.status, 200);
  assert.equal(second.body.duplicate, true);
  assert.equal(second.body.created, 0);
  assert.equal(second.body.portfolio.filter((trade) => String(trade.sku) === "75367").length, 1);
});

test("collection import is atomic when any row is invalid", async () => {
  const user = await registerUser();
  const before = await authenticated(user.token).get("/api/portfolio");
  assert.equal(before.body.length, 0);

  const response = await authenticated(user.token)
    .post("/api/collection/import/commit")
    .send({
      importId: "qa-atomic-import",
      rows: [
        { setNumber: "75367", quantity: 1, purchasePrice: 20000 },
        { setNumber: "999999", quantity: 1, purchasePrice: 500 },
      ],
    });

  assert.equal(response.status, 422);
  assert.equal(response.body.created, 0);
  assert.equal(response.body.ok, false);

  const after = await authenticated(user.token).get("/api/portfolio");
  assert.equal(after.status, 200);
  assert.equal(after.body.length, 0);
});
