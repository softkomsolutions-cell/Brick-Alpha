const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { app, resetStore, registerUser, authenticated } = require("../test-support/helpers");

const support = app.__testSupport;

test.beforeEach(resetStore);

test("forced demo seed restores the Gavin open holding and realised sales", async () => {
  const user = await registerUser();
  const state = support.getUserState(user.user.id);
  support.seedDemoUserState(state, user.user.id, { force: true });
  assert.equal(state.trades.length, 3, "seed did not write three trades");
  const portfolio = await authenticated(user.token).get("/api/portfolio");
  assert.equal(portfolio.status, 200);
  const list = Array.isArray(portfolio.body) ? portfolio.body : [];
  assert.equal(list.length, 3, JSON.stringify(list.slice(0, 1)));
  const bySku = (sku) => list.find((trade) => JSON.stringify(trade).includes(sku));
  const isd = bySku("75252");
  const castle = bySku("10305");
  const rivendell = bySku("10316");
  assert.equal(isd.status, "open");
  assert.equal(Number(isd.entryPrice), 22999);
  assert.equal(Number(isd.currentPrice), 28295);
  assert.equal(castle.status, "closed");
  assert.equal(Number(castle.exitPrice), 8540);
  assert.equal(Number(castle.entryPrice), 6999);
  assert.equal(rivendell.status, "closed");
  assert.equal(Number(rivendell.exitPrice), 18684);
  assert.equal(Number(rivendell.entryPrice), 14900);
  assert.equal(list.filter((trade) => trade.status === "open").length, 1);
});

test("demo feedback stays off the next demo account and real feedback remains", async () => {
  const real = await registerUser({ email: "owner.real@example.test" });
  const created = await authenticated(real.token).post("/api/feedback").send({
    title: "Real partner note",
    notes: "This note belongs to a non-demo account and must stay.",
    type: "ux",
    severity: "low",
    area: "settings",
  });
  assert.equal(created.status, 201);
  const firstDemo = await request(app).post("/api/auth/demo").send({ name: "Demo A" });
  const demoNote = await authenticated(firstDemo.body.token).post("/api/feedback").send({
    title: "Demo QA note",
    notes: "Created during a demo session and should not follow the next demo.",
    type: "ux",
    severity: "low",
    area: "settings",
  });
  assert.equal(demoNote.status, 201);
  assert.equal(demoNote.body.items.some((item) => item.title === "Real partner note"), false);
  const secondDemo = await request(app).post("/api/auth/demo").send({ name: "Demo B" });
  const secondBoard = await authenticated(secondDemo.body.token).get("/api/feedback");
  assert.equal(secondBoard.status, 200);
  assert.equal(secondBoard.body.items.length, 0);
  const realBoard = await authenticated(real.token).get("/api/feedback");
  assert.equal(realBoard.body.items.some((item) => item.title === "Real partner note"), true);
});
