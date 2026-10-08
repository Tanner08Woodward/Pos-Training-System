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

function load({ fetch = async () => response(200), legacy, failWrites = false } = {}) {
  const w = new JSDOM("<body><p id='status' role='status'></p></body>", { url: "https://test.local", runScripts: "outside-only" }).window;
  windows.push(w);
  w.console.warn = () => {};
  w.AppConfig = { supabaseUrl: "https://test.supabase.co", supabasePublishableKey: "sb_publishable_test" };
  w.fetch = fetch;
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

test("migration retains legacy backups and retries attempts whose old queue marker was lost", async () => {
  const calls = [];
  const legacy = [attempt("a"), attempt("b")];
  const w = load({ legacy, fetch: async (url, opts) => { calls.push(JSON.parse(opts.body).p.id); return response(200); } });
  await w.Storage.syncPending();
  assert.deepEqual(calls, ["a", "b"]);
  assert.equal(w.Storage.listAttempts().length, 2);
  assert.equal(JSON.parse(w.localStorage.getItem("ptl.attempts.v1")).length, 2);
  await w.Storage.syncPending();
  assert.equal(calls.length, 2);
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
