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

test("collection CSV preview validates rows and commit is idempotent", async () => {
  const user = await registerUser();
  const rows = [
    {
      setNumber: "75367",
      quantity: 2,
      purchasePrice: 26000,
      purchaseDate: "2026-09-29",
      condition: "Sealed",
      retailer: "QA Test",
      shipping: 500,
      vatReclaim: 100,
      rewards: 100,
    },
    {
      setNumber: "abc",
      quantity: 0,
      purchasePrice: -1,
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

  const validRows = preview.body.rows.filter((row) => row.valid);

  const firstCommit = await authenticated(user.token)
    .post("/api/collection/import/commit")
    .send({ rows: validRows, importId: preview.body.importId });

  assert.equal(firstCommit.status, 201);
  assert.equal(firstCommit.body.ok, true);
  assert.equal(firstCommit.body.duplicate, false);
  assert.equal(firstCommit.body.created, 1);

  const secondCommit = await authenticated(user.token)
    .post("/api/collection/import/commit")
    .send({ rows: validRows, importId: preview.body.importId });

  assert.equal(secondCommit.status, 200);
  assert.equal(secondCommit.body.ok, true);
  assert.equal(secondCommit.body.duplicate, true);
  assert.equal(secondCommit.body.created, 0);

  const portfolio = await authenticated(user.token).get("/api/portfolio");
  const venator = portfolio.body.find((trade) => trade.collectibleId === "lego-star-wars-75367");
  assert.ok(venator);
  assert.equal(venator.quantity, 2);
  assert.equal(venator.entryPrice, 26200);
});

test("collection import accepts a zero-cost gift", async () => {
  const user = await registerUser();

  const preview = await authenticated(user.token)
    .post("/api/collection/import/preview")
    .send({ rows: [{ setNumber: "75367", quantity: 1, purchasePrice: 0, retailer: "Gift" }] });

  assert.equal(preview.status, 200);
  assert.equal(preview.body.summary.valid, 1);

  const committed = await authenticated(user.token)
    .post("/api/collection/import/commit")
    .send({
      rows: preview.body.rows.filter((row) => row.valid),
      importId: preview.body.importId,
    });

  assert.equal(committed.status, 201);
  assert.equal(committed.body.created, 1);

  const portfolio = await authenticated(user.token).get("/api/portfolio");
  const venator = portfolio.body.find((trade) => trade.collectibleId === "lego-star-wars-75367");
  assert.ok(venator);
  assert.equal(venator.entryPrice, 0);
});
