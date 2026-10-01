// Full Challenge runs in a simulated browser, tapping like a trainee.
const test = require("node:test");
const assert = require("node:assert");
const { closeAll, loadRegister, ui, wait, attempts } = require("./helpers");

const TRAINEE = { id: "t_alex-b", name: "Alex B." };

test.after(closeAll);

test("change of mind is only revealed after the first order is rung", async () => {
  const w = loadRegister("?mode=challenge&scenario=waffle-to-sugar", { trainee: TRAINEE });
  const u = ui(w);
  assert.match(u.modalText(), /Customer changes the cone/);
  u.start();
  assert.match(u.card(), /medium chocolate in a waffle cone/);
  assert.doesNotMatch(u.card(), /sugar cone/);

  u.tapItem("Medium Waffle Cone");
  assert.doesNotMatch(u.card(), /sugar cone/, "not revealed instantly");
  await wait(1000);
  assert.match(u.card(), /sugar cone/, "revealed after the order is rung");

  u.tapLine(0);
  u.openManager();
  u.deleteItem();
  u.tapCategory("Main Menu");
  u.tapItem("Medium Cone");
  u.pay();
  assert.match(u.card(), /Card, please/);
  u.pinpad();
  await wait(700);

  const saved = attempts(w);
  assert.strictEqual(saved.length, 1);
  assert.strictEqual(saved[0].passed, true, JSON.stringify(saved[0].mistakes));
  assert.strictEqual(saved[0].trainee.name, "Alex B.");
  assert.ok(saved[0].events.some(e => e.type === "customer_said"));
  assert.match(u.modalText(), /Passed/);
});

test("opening PAY early makes the customer speak up before paying", async () => {
  const w = loadRegister("?mode=challenge&scenario=sundae-remove", { trainee: TRAINEE });
  const u = ui(w);
  u.start();
  u.tapCategory("Sundaes");
  u.tapItem("Brownie Sundae");
  u.pay();
  assert.match(u.card(), /forget the cup/);
});

test("wrong cash amount fails with a clear reason", async () => {
  const w = loadRegister("?mode=challenge&scenario=two-flavor-waffle", { trainee: TRAINEE });
  const u = ui(w);
  u.start();
  u.tapItem("Medium Waffle Cone");
  u.pay();
  assert.match(u.card(), /Here's a ten/);
  u.exact();
  await wait(500);
  const [a] = attempts(w);
  assert.strictEqual(a.passed, false);
  assert.strictEqual(a.mistakes[0].code, "wrong_tender_amount");
  assert.match(u.modalText(), /Not yet/);
  assert.match(u.modalText(), /Tip:/);
});

test("challenge without a trainee name goes back to the Training Lab", () => {
  const w = loadRegister("?mode=challenge&scenario=cake-cone");
  assert.strictEqual(w.document.getElementById("ch-modal"), null);
});

test("a finished challenge is sent to the shared database", async () => {
  const w = loadRegister("?mode=challenge&scenario=cake-cone", { trainee: TRAINEE });
  const u = ui(w);
  u.start();
  u.tapItem("Small Cone");
  u.pay();
  u.pinpad();
  await wait(700);
  const call = w.__dbCalls.find(c => c.url.endsWith("/rest/v1/rpc/save_attempt"));
  assert.ok(call, "save_attempt was called");
  assert.strictEqual(call.body.p.trainee.name, "Alex B.");
  assert.strictEqual(call.body.p.mode, "challenge");
  assert.ok(call.headers.apikey);
  assert.strictEqual(w.Storage.pendingCount(), 0);
});
