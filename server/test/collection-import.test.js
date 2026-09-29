const test = require("node:test");
const assert = require("node:assert/strict");

const {
  app,
  authenticated,
  registerUser,
  resetStore,
} = require("../test-support/helpers");

test.beforeEach(() => {
  resetStore();
});

test("collection import previews validation, computes all-in cost, and prevents duplicate commits", async () => {
  const user = await registerUser();

  const rows = [
    {
      setNumber: "75367",
      quantity: 2,
      purchasePrice: 1000,
      purchaseDate: "2026-09-29",
      condition: "Sealed",
      retailer: "QA Test",
      shipping: 100,
      rewards: 50,
    },
    {
      setNumber: "999999",
      quantity: 1,
      purchasePrice: 500,
    },
  ];

  const preview = await authenticated(user.token)
    .post("/api/collection/import/preview")
    .send({ rows });

  assert.equal(preview.status, 200);
  assert.equal(preview.body.ok, true);
  assert.equal(typeof preview.body.importId, "string");
  assert.equal(preview.body.summary.total, 2);
  assert.equal(preview.body.summary.valid, 1);
  assert.equal(preview.body.summary.invalid, 1);
  assert.equal(preview.body.rows[0].valid, true);
  assert.equal(preview.body.rows[1].valid, false);

  const validRows = preview.body.rows.filter((row) => row.valid);

  const committed = await authenticated(user.token)
    .post("/api/collection/import/commit")
    .send({ rows: validRows, importId: preview.body.importId });

  assert.equal(committed.status, 201);
  assert.equal(committed.body.ok, true);
  assert.equal(committed.body.duplicate, false);
  assert.equal(committed.body.created, 1);

  const portfolio = await authenticated(user.token).get("/api/portfolio");
  assert.equal(portfolio.status, 200);
  assert.equal(portfolio.body.length, 1);
  assert.equal(portfolio.body[0].sku, "75367");
  assert.equal(portfolio.body[0].quantity, 2);
  assert.equal(portfolio.body[0].entryPrice, 1025);

  const duplicate = await authenticated(user.token)
    .post("/api/collection/import/commit")
    .send({ rows: validRows, importId: preview.body.importId });

  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.body.ok, true);
  assert.equal(duplicate.body.duplicate, true);
  assert.equal(duplicate.body.created, 0);

  const portfolioAfterDuplicate = await authenticated(user.token).get("/api/portfolio");
  assert.equal(portfolioAfterDuplicate.body.length, 1);
});

test("collection import accepts a zero-cost LEGO gift without creating a negative cost basis", async () => {
  const user = await registerUser();

  const preview = await authenticated(user.token)
    .post("/api/collection/import/preview")
    .send({
      rows: [{
        setNumber: "75367",
        quantity: 1,
        purchasePrice: 0,
        retailer: "Gift",
        condition: "Sealed",
      }],
    });

  assert.equal(preview.status, 200);
  assert.equal(preview.body.summary.valid, 1);

  const committed = await authenticated(user.token)
    .post("/api/collection/import/commit")
    .send({ rows: preview.body.rows, importId: preview.body.importId });

  assert.equal(committed.status, 201);
  assert.equal(committed.body.created, 1);

  const portfolio = await authenticated(user.token).get("/api/portfolio");
  assert.equal(portfolio.body[0].entryPrice, 0);
});
