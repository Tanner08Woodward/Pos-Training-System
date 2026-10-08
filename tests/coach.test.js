// Training mode: every lesson can be completed, and hints work.
const test = require("node:test");
const assert = require("node:assert");
const { closeAll, loadRegister, ui, wait, attempts } = require("./helpers");
const Lessons = require("../lessons/handels.js");

test.after(closeAll);
const TRAINEE = { id: "t_sam-r", name: "Sam R." };

// Do exactly what the current step asks, like a perfect trainee.
async function doStep(w, u, s) {
  const $ = sel => w.document.querySelector(sel);
  const click = (scope, text) => [...$(scope).querySelectorAll("button")].find(b => (b.innerText || b.textContent) === text).click();
  const t = s.target || {};
  if (s.info) return $("#coach-next").click();
  if (t.category) return $(`.category-panel button[onclick*="'${t.category}'"]`).click();
  if (t.item) {
    const has = [...$("#menu-buttons").querySelectorAll("button")].some(b => b.innerText === t.item);
    if (!has) {
      const menu = w.eval("getMenu()");
      const cat = menu.main.includes(t.item) ? "main" : Object.keys(menu).find(c => menu[c].includes(t.item));
      $(`.category-panel button[onclick*="'${cat}'"]`).click();
    }
    return u.tapItem(t.item);
  }
  if (t.line) return u.tapLine(t.line - 1);
  if (t.screen === "payment") return u.pay();
  if (t.screen === "manager-screen") return u.openManager();
  if (t.screen === "discount") return click(".top-bar", "Discount");
  if (t.action === "delete_item") return u.deleteItem();
  if (t.action === "delete_all") return click("#manager-screen", "Delete All");
  if (t.action === "pinpad") { u.pinpad(); return wait(650); }
  if (t.action === "exact") { u.exact(); return wait(400); }
  if (t.action === "cash") { u.cash(t.amount); return wait(400); }
  if (t.action === "percent_discount") { w.__promptAnswer = String(t.percent); return click("#discount", "% Discount"); }
  throw new Error("test doesn't know how to do " + JSON.stringify(s));
}

for (const lesson of Lessons.list) {
  test(`lesson "${lesson.title}" can be completed with 3 stars`, async () => {
    const w = loadRegister(`?mode=lesson&lesson=${lesson.id}`, { trainee: TRAINEE });
    const u = ui(w);
    w.document.getElementById("coach-start").click();
    for (let i = 0; i < 40 && !w.Coach.getState().finished; i++) {
      await doStep(w, u, w.Coach.getState().step);
    }
    const st = w.Coach.getState();
    assert.ok(st.finished, `stuck on: ${st.step && st.step.do}`);
    const saved = attempts(w).find(a => a.mode === "lesson");
    assert.strictEqual(saved.scenarioId, lesson.id);
    assert.strictEqual(saved.stars, 3);
    assert.strictEqual(saved.wrongTaps, 0);
    assert.strictEqual(saved.restarts, 0);
    await w.Storage.syncPending();
    assert.match(w.document.getElementById("coach-save-status").textContent, /Sent to your manager/);
  });
}

test("a wrong tap makes the right button glow; a second wrong tap shows the tip", () => {
  const w = loadRegister("?mode=lesson&lesson=sizes", { trainee: TRAINEE });
  const u = ui(w);
  w.document.getElementById("coach-start").click();
  w.document.getElementById("coach-next").click();       // past the info step
  assert.strictEqual(w.Coach.getState().level, 0);
  u.tapItem("Medium Cone");                               // wrong (should be Small Cone)
  assert.strictEqual(w.Coach.getState().level, 1);
  assert.ok(w.document.querySelector(".coach-glow"), "something glows");
  assert.match(u.card(), /That rang Medium Cone/);
  // A wrong item adds two "fix it" steps before continuing.
  assert.match(u.card(), /open Manager/);
  u.openManager();
  u.deleteItem();
  assert.deepStrictEqual(u.order(), []);
  assert.match(u.card(), /cake cone of strawberry/, "back to the original step");
});

test("Show me jumps straight to the glow and the tip", () => {
  const w = loadRegister("?mode=lesson&lesson=dipped", { trainee: TRAINEE });
  w.document.getElementById("coach-start").click();
  w.document.getElementById("coach-show").click();
  assert.strictEqual(w.Coach.getState().level, 2);
  const tip = w.document.getElementById("coach-tip");
  assert.ok(tip && !tip.hidden);
  assert.match(tip.textContent, /TWO lines/);
});

test("deleting the wrong line sends the lesson back to its checkpoint", () => {
  const w = loadRegister("?mode=lesson&lesson=fixing-mistakes", { trainee: TRAINEE });
  const u = ui(w);
  w.document.getElementById("coach-start").click();
  ["Small Cone", "Small Cup", "Large Cone"].forEach(u.tapItem);
  u.tapLine(0);                // wrong line (Small Cone instead of Small Cup)
  u.tapLine(0);                // un-highlight
  u.openManager();
  u.deleteItem();              // nothing highlighted -> deletes Large Cone: not what the step wants
  assert.deepStrictEqual(u.order(), [], "order reset at checkpoint");
  assert.match(u.card(), /set the order up again/);
  assert.strictEqual(w.Coach.getState().stats.restarts, 1);
});

test("every lesson item and tab exists on the register", () => {
  const w = loadRegister();
  const menu = w.eval("getMenu()");
  const all = Object.values(menu).flat();
  for (const l of Lessons.list) for (const s of l.steps) {
    const t = s.target || {};
    if (t.item) assert.ok(all.includes(t.item), `${l.id}: ${t.item}`);
    if (t.category) assert.ok(menu[t.category], `${l.id}: tab ${t.category}`);
    if (!s.info) assert.ok(s.why, `${l.id}: step "${s.do}" needs a tip`);
  }
});
