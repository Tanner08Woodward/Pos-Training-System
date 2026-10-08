// The register itself (Playground mode): totals and Delete Item.
const test = require("node:test");
const assert = require("node:assert");
const { closeAll, loadRegister, ui } = require("./helpers");

test.after(closeAll);

test("ringing items updates subtotal, tax and total", () => {
  const w = loadRegister("?mode=playground");
  const u = ui(w);
  u.tapItem("Medium Waffle Cone");
  u.tapItem("Dipped Waffle Cone");
  assert.deepStrictEqual(u.order(), ["Medium Waffle Cone", "Dipped Waffle Cone"]);
  assert.strictEqual(w.document.getElementById("subtotal").innerText, "7.95");
  assert.strictEqual(w.document.getElementById("tax").innerText, "0.66");
  assert.strictEqual(w.document.getElementById("total").innerText, "8.61");
});

test("Delete Item removes every highlighted line", () => {
  const w = loadRegister();
  const u = ui(w);
  ["Small Cone", "Medium Waffle Cone", "Dipped Waffle Cone", "Small Cup"].forEach(u.tapItem);
  u.tapLine(1);
  u.tapLine(2);
  assert.strictEqual(w.document.querySelectorAll("#order-list li.selected").length, 2);
  u.openManager();
  u.deleteItem();
  assert.deepStrictEqual(u.order(), ["Small Cone", "Small Cup"]);
});

test("Delete Item with nothing highlighted removes the last line", () => {
  const w = loadRegister();
  const u = ui(w);
  ["Small Cone", "Small Cup"].forEach(u.tapItem);
  u.openManager();
  u.deleteItem();
  assert.deepStrictEqual(u.order(), ["Small Cone"]);
});

test("tapping a highlighted line again un-highlights it", () => {
  const w = loadRegister();
  const u = ui(w);
  u.tapItem("Small Cone");
  u.tapLine(0);
  u.tapLine(0);
  assert.strictEqual(w.document.querySelectorAll("#order-list li.selected").length, 0);
});

test("Manager screen has only Delete Item and Delete All", () => {
  const w = loadRegister();
  const labels = [...w.document.querySelectorAll("#manager-screen .manager-grid button")].map(b => b.textContent);
  assert.deepStrictEqual(labels, ["Delete Item", "Delete All"]);
});

test("rapid cash taps complete the sale only once", async () => {
  const w = loadRegister();
  const u = ui(w);
  u.tapItem("Small Cone");
  u.pay();
  u.cash(20);
  u.cash(20);
  await new Promise(r => setTimeout(r, 400));
  const done = w.Tracker.getEvents().filter(e => e.type === "transaction_completed");
  assert.strictEqual(done.length, 1);
});

test("playground mode shows no customer card or dialog", () => {
  const w = loadRegister("?mode=playground");
  assert.strictEqual(w.document.getElementById("customer-card").hidden, true);
  assert.strictEqual(w.document.getElementById("ch-modal"), null);
});

// ---- Register accuracy fixes (Oct 2026) -------------------------------------
const totals = w => ["subtotal", "tax", "total"].map(id => w.document.getElementById(id).innerText);

test("$0 items ring $0.00 instead of the $3.00 default", () => {
  const w = loadRegister("?mode=playground");
  w.addItem("Gift Card Sold");
  assert.deepStrictEqual(totals(w), ["0.00", "0.00", "0.00"]);
});

test("buttons spelled differently from the price list still ring their price", () => {
  const w = loadRegister("?mode=playground");
  w.addItem("Dipped Kid's Cone");
  assert.strictEqual(w.document.getElementById("subtotal").innerText, "4.75");
});

test("a flat discount can't make the order negative", () => {
  const w = loadRegister("?mode=playground");
  w.addItem("Small Cone");
  w.__promptAnswer = "50";
  w.applyFlatDiscount();
  assert.deepStrictEqual(totals(w), ["0.00", "0.00", "0.00"]);
});

test("a % discount follows items added after it", () => {
  const w = loadRegister("?mode=playground");
  w.addItem("Small Cone");             // 4.60
  w.__promptAnswer = "10";
  w.applyPercentDiscount();
  w.addItem("Large Cone");             // +6.70 = 11.30, 10% off = 10.17
  assert.strictEqual(w.document.getElementById("subtotal").innerText, "10.17");
});

test("Delete All clears the discount for the next order", () => {
  const w = loadRegister("?mode=playground");
  w.addItem("Small Cone");
  w.__promptAnswer = "2";
  w.applyFlatDiscount();
  w.clearOrder();
  w.addItem("Small Cone");
  assert.strictEqual(w.document.getElementById("subtotal").innerText, "4.60");
});

test("deleting one item keeps a % discount on what's left", () => {
  const w = loadRegister("?mode=playground");
  w.addItem("Small Cone");
  w.addItem("Large Cone");
  w.__promptAnswer = "10";
  w.applyPercentDiscount();
  w.deleteSelectedItem();              // removes the last line (Large Cone)
  assert.strictEqual(w.document.getElementById("subtotal").innerText, "4.14");
});
