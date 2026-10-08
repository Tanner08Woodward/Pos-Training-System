// Trainee codes: sign-in on the Training Lab, stores and codes on the manager page.
const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const windows = [];
test.after(() => windows.forEach(w => w.close()));

const ok = data => ({ ok: true, status: 200, text: async () => JSON.stringify(data) });
const fail = (status, message) => ({ ok: false, status, text: async () => JSON.stringify({ message }) });
const wait = ms => new Promise(r => setTimeout(r, ms));

// Loads a page with all its scripts and a fake database (`routes` maps an rpc name to a function).
function loadPage(file, routes, { trainee, records = [], managerCode } = {}) {
  const html = fs.readFileSync(path.join(ROOT, file), "utf8");
  const w = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ""), { url: `https://test.local/${file}`, runScripts: "outside-only" }).window;
  windows.push(w);
  w.scrollTo = () => {};
  w.alert = msg => { w.__alerts.push(msg); };
  w.__alerts = [];
  w.console.warn = () => {};
  w.__calls = [];
  w.AppConfig = { supabaseUrl: "https://test.supabase.co", supabasePublishableKey: "sb_publishable_test" };
  w.fetch = async (url, opts) => {
    const name = url.split("/rpc/")[1];
    const body = JSON.parse(opts.body);
    w.__calls.push({ name, body });
    return (routes[name] || (() => ok("ok")))(body);
  };
  if (trainee) w.localStorage.setItem("ptl.trainee.v1", JSON.stringify(trainee));
  w.localStorage.setItem("ptl.records.v2", JSON.stringify(records.map(attempt => ({ attempt, status: "sent", error: null }))));
  if (managerCode) w.sessionStorage.setItem("ptl.managerCode", managerCode);
  for (const [, src, inline] of html.matchAll(/<script(?: src="([^"]+)")?>([\s\S]*?)<\/script>/g)) {
    if (src === "config.js") continue;
    w.eval(src ? fs.readFileSync(path.join(ROOT, src), "utf8") : inline);
  }
  return w;
}

const ALEX = { id: "11111111-1111-4111-8111-111111111111", name: "Alex B.", storeId: "s1", storeName: "Main St" };
const signInRoute = ({ p_code }) => ok(p_code === "4821" ? ALEX : null);
const submitCode = async (w, code) => {
  w.document.getElementById("trainee-code").value = code;
  w.document.getElementById("code-form").dispatchEvent(new w.Event("submit", { cancelable: true }));
  await wait(20);
};

test("Training Lab asks for a trainee code, not a typed name", () => {
  const w = loadPage("index.html", { trainee_sign_in: signInRoute });
  assert.ok(w.document.getElementById("trainee-code"));
  assert.equal(w.document.getElementById("name"), null);
});

test("a wrong code shows an error and doesn't sign in", async () => {
  const w = loadPage("index.html", { trainee_sign_in: signInRoute });
  await submitCode(w, "1111");
  assert.match(w.document.getElementById("who-panel").textContent, /didn't work/);
  assert.equal(w.Storage.getTrainee(), null);
});

test("the right code signs in as that person at their store", async () => {
  const w = loadPage("index.html", { trainee_sign_in: signInRoute });
  await submitCode(w, "4821");
  assert.deepEqual(JSON.parse(JSON.stringify(w.Storage.getTrainee())), ALEX);
  assert.match(w.document.getElementById("who-panel").textContent, /Training as Alex B\.\s*· Main St/);
  w.document.getElementById("switch").click();
  assert.equal(w.Storage.getTrainee(), null, "Not you? signs out");
  assert.ok(w.document.getElementById("trainee-code"));
});

test("a name-only trainee from before codes is asked for a code", () => {
  const w = loadPage("index.html", { trainee_sign_in: signInRoute }, { trainee: { id: "t_alex-b-", name: "Alex B." } });
  assert.ok(w.document.getElementById("trainee-code"));
});

test("if the database has no trainee codes yet, typing a name still works", async () => {
  const w = loadPage("index.html", { trainee_sign_in: () => fail(404, "Could not find the function") });
  await submitCode(w, "4821");
  assert.ok(w.document.getElementById("name"), "falls back to the name form");
});

test("too many wrong codes shows a wait message", async () => {
  const w = loadPage("index.html", { trainee_sign_in: () => fail(400, "too many tries, wait a few minutes") });
  await submitCode(w, "4821");
  assert.match(w.document.getElementById("who-panel").textContent, /Wait a few minutes/);
});

// ---- Manager page ----------------------------------------------------------
const STORES = [{ id: "s1", name: "Main St" }, { id: "s2", name: "Elm Rd" }];
const XSS = '<img id="pwn" src=x onerror="alert(1)">';
const ROSTER = [
  { id: ALEX.id, name: "Alex B.", code: "4821", active: true, storeId: "s1", storeName: "Main St" },
  { id: "22222222-2222-4222-8222-222222222222", name: XSS, code: "0907", active: true, storeId: "s2", storeName: "Elm Rd" },
  { id: "33333333-3333-4333-8333-333333333333", name: "Gone G.", code: "5555", active: false, storeId: "s2", storeName: "Elm Rd" },
];
const managerRoutes = (extra = {}) => ({
  manager_attempts: () => ok([]),
  manager_stores: () => ok(STORES),
  manager_trainees: () => ok(ROSTER),
  ...extra,
});

test("manager sees each store's trainees and codes, safely escaped", async () => {
  const w = loadPage("manager.html", managerRoutes(), { managerCode: "test-only" });
  await wait(30);
  const codes = w.document.getElementById("codes").textContent;
  assert.match(codes, /Main St[\s\S]*Alex B\.[\s\S]*4821/);
  assert.match(codes, /Elm Rd[\s\S]*0907/);
  assert.match(codes, /Gone G\. \(off\)/);
  assert.equal(w.document.getElementById("pwn"), null);
  // People with codes but no tries yet still appear, as Not started.
  const people = [...w.document.querySelectorAll(".people .person")].map(li => li.textContent);
  assert.ok(people.some(t => /Alex B\.[\s\S]*Not started/.test(t)));
  assert.ok(!people.some(t => /Gone G\./.test(t)), "turned-off trainees with no results are hidden");
});

test("store filter shows only that store's trainees", async () => {
  const w = loadPage("manager.html", managerRoutes(), { managerCode: "test-only" });
  await wait(30);
  const select = w.document.getElementById("store-filter");
  select.value = "s1";
  select.dispatchEvent(new w.Event("change"));
  const names = [...w.document.querySelectorAll(".people .name")].map(n => n.textContent);
  assert.deepEqual(names, ["Alex B."]);
});

test("adding a trainee sends the name and store, then shows their code", async () => {
  const added = { id: "44444444-4444-4444-8444-444444444444", name: "Sam R.", code: "3141", active: true, storeId: "s2", storeName: "Elm Rd" };
  const w = loadPage("manager.html", managerRoutes({ manager_add_trainee: () => ok(added) }), { managerCode: "test-only" });
  await wait(30);
  w.document.getElementById("new-name").value = "Sam R.";
  w.document.getElementById("new-store").value = "s2";
  w.document.getElementById("add-trainee").dispatchEvent(new w.Event("submit", { cancelable: true }));
  await wait(30);
  const call = w.__calls.find(c => c.name === "manager_add_trainee");
  assert.deepEqual(call.body, { p_code: "test-only", p_store: "s2", p_name: "Sam R." });
  assert.match(w.__alerts.join(" "), /Sam R\.'s trainee code is 3141/);
});

test("results show which store they came from", async () => {
  const attempt = { id: "a1", trainee: { id: ALEX.id, name: "Alex B." }, mode: "challenge", scenarioId: "cake-cone", scenarioTitle: "x",
    passed: true, score: 95, seconds: 10, finishedAt: "2026-10-08T12:00:00Z", storeId: "s1", storeName: "Main St",
    mistakes: [], points: {}, feedback: [], expected: [], rung: [], events: [] };
  const w = loadPage("manager.html", managerRoutes({ manager_trainees: () => ok([]), manager_attempts: () => ok([attempt]) }), { managerCode: "test-only" });
  await wait(30);
  assert.match(w.document.querySelector(".people .person").textContent, /Main St/);
});

test("before 003_trainee_codes.sql is run, the manager page explains the setup step", async () => {
  const w = loadPage("manager.html", managerRoutes({ manager_stores: () => fail(404, "not found"), manager_trainees: () => fail(404, "not found") }), { managerCode: "test-only" });
  await wait(30);
  assert.match(w.document.getElementById("app").textContent, /003_trainee_codes\.sql/);
});
