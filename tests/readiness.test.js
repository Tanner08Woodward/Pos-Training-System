// Manager status: "Practice complete" must reflect recent, current-version results.
const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const windows = [];
test.after(() => windows.forEach(w => w.close()));

function loadManager(attempts) {
  const html = fs.readFileSync(path.join(ROOT, "manager.html"), "utf8");
  const w = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ""), { url: "https://test.local/manager.html", runScripts: "outside-only" }).window;
  windows.push(w);
  w.scrollTo = () => {};
  w.console.warn = () => {};
  w.AppConfig = {}; // device-only: no database in tests
  w.localStorage.setItem("ptl.records.v2", JSON.stringify(attempts.map(attempt => ({ attempt, status: "sent", error: null }))));
  for (const [, src, inline] of html.matchAll(/<script(?: src="([^"]+)")?>([\s\S]*?)<\/script>/g)) {
    if (src === "config.js") continue;
    w.eval(src ? fs.readFileSync(path.join(ROOT, src), "utf8") : inline);
  }
  return w;
}

// Lists of real lessons and challenges, read the same way the site does.
const probe = new JSDOM("", { runScripts: "outside-only" }).window;
probe.eval(fs.readFileSync(path.join(ROOT, "lessons/handels.js"), "utf8"));
probe.eval(fs.readFileSync(path.join(ROOT, "scenarios/handels.js"), "utf8"));
const LESSONS = probe.eval("Lessons.list").map(l => ({ id: l.id, version: l.version }));
const SCENARIOS = probe.eval("Scenarios.list").map(s => ({ id: s.id, version: s.version }));
probe.close();

let clock = Date.parse("2026-10-01T10:00:00Z"), n = 0;
const next = () => new Date(clock += 60000).toISOString();
const person = { id: "t_alex", name: "Alex B." };
const lesson = (l, stars, version = l.version) => ({ id: "l" + n++, trainee: person, mode: "lesson", scenarioId: l.id, scenarioVersion: version,
  scenarioTitle: l.id, stars, passed: true, score: 100, seconds: 30, finishedAt: next(), events: [] });
const challenge = (s, passed, mistakes = [], version = s.version) => ({ id: "c" + n++, trainee: person, mode: "challenge", scenarioId: s.id,
  scenarioVersion: version, scenarioTitle: s.id, passed, score: passed ? 95 : 40, seconds: 20, finishedAt: next(),
  mistakes: mistakes.map(code => ({ code })), points: {}, feedback: [], expected: [], rung: [], events: [] });
const status = w => w.document.querySelector(".people .status").textContent.trim();

test("every lesson at 2+ stars and the latest try of every challenge passed = Practice complete", () => {
  const w = loadManager([...LESSONS.map(l => lesson(l, 2)), ...SCENARIOS.map(s => challenge(s, true))]);
  assert.match(status(w), /Practice complete/);
  assert.doesNotMatch(w.document.body.textContent, /Ready for (the )?register/);
});

test("an old pass does not count when the latest try of that challenge failed", () => {
  const w = loadManager([...LESSONS.map(l => lesson(l, 3)), ...SCENARIOS.map(s => challenge(s, true)), challenge(SCENARIOS[0], false)]);
  assert.match(status(w), /In training/);
});

test("repeated recent failures show Needs help even after passing everything once", () => {
  const w = loadManager([...LESSONS.map(l => lesson(l, 3)), ...SCENARIOS.map(s => challenge(s, true)),
    ...[0, 1, 2, 3, 4].map(i => challenge(SCENARIOS[i % SCENARIOS.length], false, ["wrong_size"]))]);
  assert.match(status(w), /Needs coaching/);
  assert.equal(w.document.querySelector(".kpi.k-help .v").textContent, "1", "counted under Need coaching");
});

test("1-star lessons (heavy coaching) don't complete practice", () => {
  const w = loadManager([...LESSONS.map(l => lesson(l, 1)), ...SCENARIOS.map(s => challenge(s, true))]);
  assert.match(status(w), /In training/);
});

test("passes on an older version of a challenge don't count", () => {
  const w = loadManager([...LESSONS.map(l => lesson(l, 3)), ...SCENARIOS.map((s, i) => challenge(s, true, [], i === 0 ? s.version - 1 : s.version))]);
  assert.match(status(w), /In training/);
});
