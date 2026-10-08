const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const windows = [];
test.after(() => windows.forEach(w => w.close()));
const payload = '<img src=x onerror="alert(sessionStorage.getItem(\'ptl.managerCode\'))">';

function record(mode) {
  return { id: "test", trainee: { id: "test-person", name: "Test Person" }, mode,
    scenarioId: mode === "lesson" ? "register-tour" : "cake-cone", scenarioTitle: payload,
    finishedAt: "2026-10-08T12:00:00Z", score: payload, passed: false, seconds: 10,
    stars: 2, hintsNeeded: payload, wrongTaps: payload,
    points: { accuracy: payload, payment: payload, corrections: payload, speed: payload },
    mistakes: [{ code: "wrong_size", text: payload }], feedback: [{ ok: false, text: payload }],
    expected: [payload], rung: [payload], events: [{ type: "item_added", t: 0, data: { item: payload } }],
  };
}

function load(attempt, { remote = false, deliveryStatus = "sent", fetch } = {}) {
  const html = fs.readFileSync(path.join(ROOT, "manager.html"), "utf8");
  const w = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ""), { url: "https://test.local/manager.html", runScripts: "outside-only" }).window;
  windows.push(w);
  w.scrollTo = () => {};
  w.console.warn = () => {};
  w.AppConfig = remote ? { supabaseUrl: "https://test.supabase.co", supabasePublishableKey: "sb_publishable_test" } : {};
  w.fetch = fetch || (async () => ({ ok: false, status: 401, text: async () => JSON.stringify({ message: "Invalid API key " + payload }) }));
  w.localStorage.setItem("ptl.records.v2", JSON.stringify([{ attempt, status: deliveryStatus, error: null }]));
  if (remote) w.sessionStorage.setItem("ptl.managerCode", "test-only-code");
  const scripts = [...html.matchAll(/<script(?: src="([^"]+)")?>([\s\S]*?)<\/script>/g)];
  for (const [, src, inline] of scripts) {
    if (src === "config.js") continue;
    w.eval(src ? fs.readFileSync(path.join(ROOT, src), "utf8") : inline);
  }
  return w;
}

function assertSafe(w) {
  assert.equal(w.document.querySelectorAll("#app img, #app script, #app [onerror]").length, 0);
  assert.ok(w.document.getElementById("app").textContent.includes(payload), "submitted text remains text");
}

for (const mode of ["lesson", "challenge"]) {
  test(`manager ${mode} trainee and attempt views never interpret submitted markup`, () => {
    const w = load(record(mode));
    w.document.querySelector(".person[data-id]").click();
    assertSafe(w);
    w.document.querySelector("[data-attempt]").click();
    assertSafe(w);
    assert.ok(w.document.querySelector('[role="alert"]'), "device-only warning persists in detail views");
  });
}

test("malformed numbers, arrays and replay data do not break the manager views", () => {
  const a = record("challenge");
  Object.assign(a, { seconds: "bad", stars: 999999, feedback: {}, expected: null, rung: false });
  a.events = [{ type: "transaction_completed", t: payload, data: { total: payload, paid: {}, change: null } }, { type: "order_cleared", t: 1, data: {} }];
  const w = load(a);
  w.document.querySelector(".person[data-id]").click();
  w.document.querySelector("[data-attempt]").click();
  assertSafe(w);
  assert.match(w.document.getElementById("app").textContent, /Sale completed: total \$0.00/);
});

test("database failure shows a prominent escaped device-only warning", async () => {
  const w = load(record("lesson"), { remote: true });
  await new Promise(resolve => setTimeout(resolve, 0));
  const warning = w.document.querySelector('[role="alert"]');
  assert.ok(warning);
  assert.match(warning.textContent, /Device-only results.*other devices are missing/);
  assert.equal(w.document.querySelectorAll("#app img, #app [onerror]").length, 0);
});

test("manager resend button recovers rejected results and refreshes the dashboard", async () => {
  const calls = [];
  const fetch = async (url, opts) => {
    calls.push(url);
    return { ok: true, status: 200, text: async () => JSON.stringify(url.endsWith("save_attempt") ? "test" : []) };
  };
  const w = load(record("lesson"), { remote: true, deliveryStatus: "rejected", fetch });
  await new Promise(resolve => setTimeout(resolve, 0));
  const retry = w.document.getElementById("retry");
  assert.ok(retry);
  retry.click();
  assert.equal(retry.disabled, true);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(w.Storage.rejectedCount(), 0);
  assert.equal(w.Storage.getSaveStatus("test").state, "sent");
  assert.equal(w.document.getElementById("retry"), null);
  assert.ok(calls.some(url => url.endsWith("save_attempt")));
});

test("manager detail rendering works without Object.hasOwn", () => {
  const w = load(record("challenge"));
  w.Object.hasOwn = undefined;
  w.document.querySelector(".person[data-id]").click();
  w.document.querySelector("[data-attempt]").click();
  assertSafe(w);
});

test("shared delete confirmation explains unsent results and later uploads", async () => {
  const fetch = async () => ({ ok: true, status: 200, text: async () => "[]" });
  const w = load(record("challenge"), { remote: true, fetch });
  await new Promise(resolve => setTimeout(resolve, 0));
  let confirmation;
  w.confirm = message => { confirmation = message; return false; };
  w.document.getElementById("clear").click();
  assert.match(confirmation, /Pending and rejected results stay/);
  assert.match(confirmation, /other devices may upload later and reappear/);
  assert.equal(w.Storage.listAttempts().length, 1, "cancelling deletes nothing");
});
