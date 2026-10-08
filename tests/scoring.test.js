// Scoring rules, using hand-made action logs.
const test = require("node:test");
const assert = require("node:assert");
const Scoring = require("../engine/scoring.js");
const Scenarios = require("../scenarios/handels.js");

// Build a fake action log: [type, data, seconds]
function log(rows) {
  return rows.map(([type, data, s], i) => ({ seq: i + 1, type, data: data || {}, t: Math.round(s * 1000) }));
}
const score = (id, rows) => Scoring.score(Scenarios.get(id), log(rows), { itemInfo: Scenarios.itemInfo });
const done = (items, total, paid, trigger = "auto_after_payment") =>
  ["transaction_completed", { items, total, paid, change: Math.max(0, paid - total), trigger }];

test("perfect change-of-mind attempt passes with 100", () => {
  const r = score("waffle-to-sugar", [
    ["challenge_started", {}, 0],
    ["item_added", { item: "Medium Waffle Cone" }, 3],
    ["item_removed", { item: "Medium Waffle Cone", method: "delete_selected" }, 7],
    ["item_added", { item: "Medium Cone" }, 9],
    ["tender_applied", { method: "pinpad", amount: 6.06 }, 12],
    [...done(["Medium Cone"], 6.06, 0, "auto_after_pinpad"), 13],
  ]);
  assert.strictEqual(r.score, 100);
  assert.strictEqual(r.passed, true);
  assert.strictEqual(r.mistakes.length, 0);
});

test("wrong size is named as a wrong size", () => {
  const r = score("cake-cone", [
    ["challenge_started", {}, 0],
    ["item_added", { item: "Medium Cone" }, 3],
    ["tender_applied", { method: "pinpad", amount: 6.06 }, 6],
    [...done(["Medium Cone"], 6.06, 0, "auto_after_pinpad"), 7],
  ]);
  assert.strictEqual(r.passed, false);
  assert.strictEqual(r.mistakes[0].code, "wrong_size");
  assert.strictEqual(r.points.accuracy, 35);
});

test("cup instead of cone is a wrong cone/cup type", () => {
  const r = score("cake-cone", [
    ["challenge_started", {}, 0],
    ["tender_applied", { method: "pinpad", amount: 4.98 }, 6],
    [...done(["Small Cup"], 4.98, 0, "auto_after_pinpad"), 7],
  ]);
  assert.strictEqual(r.mistakes[0].code, "wrong_type");
});

test("missing dipped add-on is a missed add-on", () => {
  const r = score("dipped-size-change", [
    ["challenge_started", {}, 0],
    ["tender_applied", { method: "pinpad", amount: 7.25 }, 10],
    [...done(["Medium Waffle Cone"], 7.25, 0, "auto_after_pinpad"), 11],
  ]);
  assert.deepStrictEqual(r.mistakes.map(m => m.code), ["missed_addon"]);
});

test("pressing Exact when the customer handed $10 is a wrong cash amount", () => {
  const r = score("two-flavor-waffle", [
    ["challenge_started", {}, 0],
    ["tender_applied", { method: "exact", amount: 7.25 }, 8],
    [...done(["Medium Waffle Cone"], 7.25, 7.25), 9],
  ]);
  assert.strictEqual(r.passed, false);
  assert.strictEqual(r.mistakes[0].code, "wrong_tender_amount");
  assert.strictEqual(r.points.payment, 0);
});

test("Complete Transaction without paying is caught", () => {
  const r = score("cake-cone", [
    ["challenge_started", {}, 0],
    [...done(["Small Cone"], 4.98, 0, "complete_button"), 5],
  ]);
  assert.strictEqual(r.mistakes[0].code, "no_payment");
  assert.strictEqual(r.passed, false);
});

test("Delete All and re-ring costs correction points but can still pass", () => {
  const r = score("dipped-size-change", [
    ["challenge_started", {}, 0],
    ["order_cleared", { itemsRemoved: ["Large Waffle Cone", "Dipped Waffle Cone With Sprinkles"] }, 8],
    ["tender_applied", { method: "pinpad", amount: 8.61 }, 15],
    [...done(["Medium Waffle Cone", "Dipped Waffle Cone With Sprinkles"], 8.61, 0, "auto_after_pinpad"), 16],
  ]);
  assert.strictEqual(r.points.corrections, 10);
  assert.strictEqual(r.mistakes[0].code, "extra_deletes");
  assert.match(r.mistakes[0].text, /Delete All/);
  assert.strictEqual(r.passed, true);
});

test("speed points drop past the goal and hit 0 at double the goal", () => {
  const rows = s => [
    ["challenge_started", {}, 0],
    ["tender_applied", { method: "pinpad", amount: 4.98 }, s],
    [...done(["Small Cone"], 4.98, 0, "auto_after_pinpad"), s + 5],
  ];
  assert.strictEqual(score("cake-cone", rows(15)).points.speed, 15);
  assert.strictEqual(score("cake-cone", rows(22.5)).points.speed, 8);
  assert.strictEqual(score("cake-cone", rows(30)).points.speed, 0);
});

test("only actions after the latest Start are scored", () => {
  const r = score("cake-cone", [
    ["challenge_started", {}, 0],
    ["item_removed", { item: "x" }, 1],
    ["challenge_started", {}, 10],
    ["tender_applied", { method: "pinpad", amount: 4.98 }, 15],
    [...done(["Small Cone"], 4.98, 0, "auto_after_pinpad"), 16],
  ]);
  assert.strictEqual(r.score, 100);
});

test("every scenario's cash is enough to pay its total", () => {
  const prices = { "Small Cone": 4.6, "Medium Cone": 5.6, "Small Cup": 4.6, "Medium Waffle Cone": 6.7, Shake: 6.25, Pint: 6.95, "Brownie Sundae": 7.25 };
  Scenarios.list.filter(s => s.pay.method === "cash").forEach(s => {
    const items = s.steps[s.steps.length - 1].order;
    items.forEach(i => assert.ok(prices[i], `price for ${i} known`));
    const total = items.reduce((t, i) => t + prices[i], 0) * 1.0825;
    assert.ok(s.pay.tendered >= total, `${s.id}: $${s.pay.tendered} covers $${total.toFixed(2)}`);
  });
});

test("ringing the ORIGINAL order after a change of mind is called out clearly", () => {
  const r = score("dipped-size-change", [
    ["challenge_started", {}, 0],
    ["tender_applied", { method: "pinpad", amount: 9.96 }, 10],
    [...done(["Large Waffle Cone", "Dipped Waffle Cone With Sprinkles"], 9.96, 0, "auto_after_pinpad"), 11],
  ]);
  assert.strictEqual(r.passed, false);
  assert.strictEqual(r.mistakes[0].code, "missed_change");
  assert.match(r.mistakes[0].text, /make it a medium/);
  assert.match(r.feedback.map(f => f.text).join(" "), /changed it/);
  assert.doesNotMatch(r.feedback.map(f => f.text).join(" "), /Fixed the customer's change/);
});
