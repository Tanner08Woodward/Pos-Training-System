const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const windows = [];
test.after(() => windows.forEach(w => w.close()));

const attempt = id => ({ id, trainee: { id: "test", name: "Test" }, mode: "challenge" });
const response = (status, data = "ok") => ({ ok: status < 400, status, text: async () => JSON.stringify(data) });

function load({ fetch = async () => response(200), legacy, failWrites = false, seed = {}, quota = 5000000 } = {}) {
  const w = new JSDOM("<body><p id='status' role='status'></p></body>", { url: "https://test.local", runScripts: "outside-only", storageQuota: quota }).window;
  windows.push(w);
  w.console.warn = () => {};
  w.AppConfig = { supabaseUrl: "https://test.supabase.co", supabasePublishableKey: "sb_publishable_test" };
  w.fetch = fetch;
  Object.entries(seed).forEach(([key, value]) => w.localStorage.setItem(key, value));
  if (legacy) {
    w.localStorage.setItem("ptl.attempts.v1", JSON.stringify(legacy));
    w.localStorage.setItem("ptl.pending.v1", JSON.stringify([legacy[0].id]));
  }
  if (failWrites) w.Storage.prototype.setItem = () => { throw new Error("Storage full"); };
  w.eval(fs.readFileSync(path.join(ROOT, "engine/storage.js"), "utf8"));
  return w;
}

test("publishable key uses apikey without a Bearer header, and sent status survives reload", async () => {
  const calls = [];
  const w = load({ fetch: async (url, opts) => { calls.push(opts); return response(200); } });
  w.Storage.saveAttempt(attempt("a"));
  w.Storage.showSaveStatus(w.document.getElementById("status"), "a");
  await w.Storage.syncPending();
  assert.equal(calls[0].headers.apikey, "sb_publishable_test");
  assert.equal(calls[0].headers.Authorization, undefined);
  assert.equal(w.document.getElementById("status").textContent, "Sent to your manager.");
  const stored = JSON.parse(w.localStorage.getItem("ptl.records.v2"));
  assert.equal(stored[0].status, "sent");
  assert.equal(stored[0].attempt.id, "a");
});

test("401 keeps the attempt pending and shows an actionable failure", async () => {
  const w = load({ fetch: async () => response(401, { message: "Invalid API key" }) });
  w.Storage.saveAttempt(attempt("a"));
  w.Storage.showSaveStatus(w.document.getElementById("status"), "a");
  await w.Storage.syncPending();
  assert.equal(w.Storage.pendingCount(), 1);
  assert.match(w.document.getElementById("status").textContent, /couldn't send.*Tell your manager/);
});

test("offline attempts retry on the browser online event", async () => {
  let offline = true;
  const w = load({ fetch: async () => { if (offline) throw new TypeError("Offline"); return response(200); } });
  w.Storage.saveAttempt(attempt("a"));
  await w.Storage.syncPending();
  assert.equal(w.Storage.pendingCount(), 1);
  assert.match(w.Storage.getSaveStatus("a").text, /Will send/);
  offline = false;
  w.dispatchEvent(new w.Event("online"));
  await w.Storage.syncPending();
  assert.equal(w.Storage.getSaveStatus("a").state, "sent");
});

test("permanently rejected attempt does not block subsequent results", async () => {
  const calls = [];
  const w = load({ fetch: async (url, opts) => {
    const id = JSON.parse(opts.body).p.id;
    calls.push(id);
    return id === "bad" ? response(400, { message: "invalid payload" }) : response(200);
  } });
  ["bad", "good1", "good2"].forEach(id => w.Storage.saveAttempt(attempt(id)));
  await w.Storage.syncPending();
  assert.deepEqual(calls, ["bad", "good1", "good2"]);
  assert.equal(w.Storage.rejectedCount(), 1);
  assert.equal(w.Storage.pendingCount(), 0);
  assert.equal(w.Storage.getSaveStatus("bad").state, "rejected");
  assert.equal(w.Storage.getSaveStatus("good2").state, "sent");
  await w.Storage.syncPending();
  assert.equal(calls.length, 3, "rejected records are retained, not endlessly retried");
});

test("storage quota failure reports unsaved instead of success and does not send", async () => {
  let calls = 0;
  const w = load({ failWrites: true, fetch: async () => { calls++; return response(200); } });
  assert.equal(w.Storage.saveAttempt(attempt("a")), false);
  w.Storage.showSaveStatus(w.document.getElementById("status"), "a");
  await w.Storage.syncPending();
  assert.match(w.document.getElementById("status").textContent, /Couldn't save/);
  assert.equal(calls, 0);
});

test("migration removes redundant legacy copies only after persisting all attempts", async () => {
  const calls = [];
  const legacy = [attempt("a"), attempt("b")];
  const w = load({ legacy, fetch: async (url, opts) => { calls.push(JSON.parse(opts.body).p.id); return response(200); } });
  await w.Storage.syncPending();
  assert.deepEqual(calls, ["a", "b"]);
  assert.equal(w.Storage.listAttempts().length, 2);
  assert.equal(w.localStorage.getItem("ptl.attempts.v1"), null);
  assert.equal(JSON.parse(w.localStorage.getItem("ptl.records.v2")).length, 2);
  await w.Storage.syncPending();
  assert.equal(calls.length, 2);
});

function snapshot(w) {
  return Object.fromEntries(Array.from({ length: w.localStorage.length }, (_, i) => {
    const key = w.localStorage.key(i);
    return [key, w.localStorage.getItem(key)];
  }));
}

test("over-half-full legacy storage still saves and sends without repeated uploads after reload", async () => {
  const calls = [];
  const legacy = Array.from({ length: 110 }, (_, i) => ({ ...attempt("old" + i), padding: "x".repeat(24000) }));
  const fetch = async (url, opts) => { calls.push(JSON.parse(opts.body).p.id); return response(200); };
  const w = load({ legacy, fetch });
  assert.ok(w.localStorage.getItem("ptl.attempts.v1").length > 2500000);
  assert.equal(w.localStorage.getItem("ptl.records.v2"), null, "full duplicate won't fit");
  assert.equal(w.Storage.saveAttempt(attempt("new")), true, "new attempt still fits in place");
  await w.Storage.syncPending();
  assert.equal(calls.length, 111);
  assert.equal(w.Storage.pendingCount(), 0);
  assert.equal(w.Storage.getSaveStatus("new").state, "sent");
  const saved = snapshot(w);
  w.close();
  const reloaded = load({ seed: saved, fetch });
  await reloaded.Storage.syncPending();
  assert.equal(calls.length, 111, "sent states survive failed migration on reload");
  assert.equal(reloaded.Storage.listAttempts().length, 111);
  assert.equal(reloaded.Storage.pendingCount(), 0);
});

test("results written by an older tab after migration are recovered and deduplicated", async () => {
  const calls = [];
  const fetch = async (url, opts) => { calls.push(JSON.parse(opts.body).p.id); return response(200); };
  const w = load({ legacy: [attempt("old")], fetch });
  await w.Storage.syncPending();
  // Simulate an old page persisting its stale list plus one new attempt.
  w.localStorage.setItem("ptl.attempts.v1", JSON.stringify([attempt("old"), attempt("late")]));
  assert.equal(w.Storage.listAttempts().length, 2);
  const saved = snapshot(w);
  w.close();
  const reloaded = load({ seed: saved, fetch });
  await reloaded.Storage.syncPending();
  assert.deepEqual(calls, ["old", "late"]);
  assert.equal(reloaded.Storage.listAttempts().length, 2);
  assert.equal(reloaded.localStorage.getItem("ptl.attempts.v1"), null);
});

test("older-tab results still save when both existing v2 and late v1 data fill the device", async () => {
  const calls = [];
  const primary = Array.from({ length: 8 }, (_, i) => ({ attempt: { ...attempt("primary" + i), padding: "x".repeat(300000) }, status: "sent", error: null }));
  const legacy = Array.from({ length: 8 }, (_, i) => ({ ...attempt("late" + i), padding: "x".repeat(300000) }));
  const seed = { "ptl.records.v2": JSON.stringify(primary), "ptl.attempts.v1": JSON.stringify(legacy) };
  const w = load({ seed, fetch: async (url, opts) => { calls.push(JSON.parse(opts.body).p.id); return response(200); } });
  assert.equal(w.Storage.saveAttempt(attempt("new")), true);
  await w.Storage.syncPending();
  assert.deepEqual(calls, [...legacy.map(a => a.id), "new"]);
  assert.equal(w.Storage.listAttempts().length, 17);
  assert.equal(w.Storage.pendingCount(), 0);
  const saved = snapshot(w);
  w.close();
  const reloaded = load({ seed: saved, fetch: async () => { throw new Error("Must not resend"); } });
  await reloaded.Storage.syncPending();
  assert.equal(reloaded.Storage.pendingCount(), 0);
  assert.equal(reloaded.Storage.listAttempts().length, 17);
});

test("a manager can explicitly resend rejected results after the server is fixed", async () => {
  let accepting = false;
  const w = load({ fetch: async () => accepting ? response(200) : response(400, { message: "bad configuration" }) });
  w.Storage.saveAttempt(attempt("a"));
  await w.Storage.syncPending();
  assert.equal(w.Storage.rejectedCount(), 1);
  accepting = true;
  await w.Storage.retryRejected();
  assert.equal(w.Storage.rejectedCount(), 0);
  assert.equal(w.Storage.pendingCount(), 0);
  assert.equal(w.Storage.getSaveStatus("a").state, "sent");
});

test("clear removes sent copies but preserves pending and rejected attempts", () => {
  const initial = ["sent", "pending", "rejected"].map(status => ({ attempt: attempt(status), status, error: null }));
  const w = load({ seed: { "ptl.records.v2": JSON.stringify(initial) } });
  assert.equal(w.Storage.clearAttempts(), true);
  assert.deepEqual(Array.from(w.Storage.listAttempts(), a => a.id), ["pending", "rejected"]);
  assert.equal(w.Storage.pendingCount(), 1);
  assert.equal(w.Storage.rejectedCount(), 1);
});

test("a quota-safe fallback keeps a new result queued even if delivery metadata cannot be saved", async () => {
  const legacy = Array.from({ length: 110 }, (_, i) => ({ ...attempt("old" + i), padding: "x".repeat(24000) }));
  const w = load({ legacy });
  const prototype = Object.getPrototypeOf(w.localStorage);
  const original = prototype.setItem;
  prototype.setItem = function(key, value) {
    if (key === "ptl.delivery.v2") throw new Error("Metadata write failed");
    return original.call(this, key, value);
  };
  assert.equal(w.Storage.saveAttempt(attempt("new")), true);
  await w.Storage.syncPending();
  assert.equal(w.Storage.getSaveStatus("new").state, "pending", "body remains durable with conservative pending status");
  assert.equal(w.Storage.listAttempts().length, 111);
  prototype.setItem = original;
  await w.Storage.syncPending();
  assert.equal(w.Storage.pendingCount(), 0);
});

test("429 and server failures remain pending for later retry", async () => {
  for (const status of [429, 500, 503]) {
    const w = load({ fetch: async () => response(status, { message: "retry later" }) });
    w.Storage.saveAttempt(attempt("a"));
    await w.Storage.syncPending();
    assert.equal(w.Storage.pendingCount(), 1);
    assert.equal(w.Storage.rejectedCount(), 0);
  }
});

test("delivery write failure preserves the pending record and idempotent retry", async () => {
  const w = load();
  w.Storage.saveAttempt(attempt("a"));
  // The first request is awaiting its response; fail the delivery-state write.
  const prototype = Object.getPrototypeOf(w.localStorage);
  const original = prototype.setItem;
  prototype.setItem = () => { throw new Error("Storage full"); };
  await w.Storage.syncPending();
  assert.equal(w.Storage.pendingCount(), 1);
  prototype.setItem = original;
  await w.Storage.syncPending();
  assert.equal(w.Storage.pendingCount(), 0);
});
