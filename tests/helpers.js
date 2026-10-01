// Loads register.html in a simulated browser (jsdom) with all its scripts.
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");

// Every simulated browser is closed after the tests so timers stop.
const open = [];
function closeAll() { open.splice(0).forEach(w => w.close()); }

function loadRegister(query = "", { trainee } = {}) {
  const html = fs.readFileSync(path.join(ROOT, "register.html"), "utf8");
  const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
  const dom = new JSDOM(html.replace(/<script src="[^"]+"><\/script>/g, ""), {
    runScripts: "dangerously", // needed so onclick="..." buttons work
    url: "http://localhost/register.html" + query,
    pretendToBeVisual: true,
  });
  const w = dom.window;
  open.push(w);
  w.alert = () => {};
  w.prompt = () => w.__promptAnswer;
  if (trainee) w.localStorage.setItem("ptl.trainee.v1", JSON.stringify(trainee));
  scripts.forEach(src => w.eval(fs.readFileSync(path.join(ROOT, src), "utf8")));
  return w;
}

// Helpers that act like a trainee tapping the screen.
function ui(w) {
  const $ = sel => w.document.querySelector(sel);
  const button = (text, scope = w.document) =>
    [...scope.querySelectorAll("button")].find(b => b.innerText === text || b.textContent === text);
  return {
    tapItem: name => button(name, $("#menu-buttons")).click(),
    tapCategory: name => button(name, $(".category-panel")).click(),
    tapLine: i => w.document.querySelectorAll("#order-list li")[i].click(),
    openManager: () => button("Manager", $(".top-bar")).click(),
    deleteItem: () => button("Delete Item", $("#manager-screen")).click(),
    back: id => $(`#${id} .back`).click(),
    pay: () => button("PAY / CLOSE ORDER").click(),
    cash: amount => button("$" + amount, $("#payment")).click(),
    exact: () => $("#exact-btn").click(),
    pinpad: () => $("#pinpad-btn").click(),
    complete: () => $("#complete-btn").click(),
    order: () => [...w.document.querySelectorAll("#order-list li")].map(li => li.innerText.split(" - ")[0]),
    card: () => ($("#customer-card").textContent || ""),
    start: () => $("#ch-start").click(),
    modalText: () => ($("#ch-modal") ? $("#ch-modal").textContent : ""),
  };
}

const wait = ms => new Promise(r => setTimeout(r, ms));
const attempts = w => JSON.parse(w.localStorage.getItem("ptl.attempts.v1") || "[]");

module.exports = { closeAll, loadRegister, ui, wait, attempts, ROOT };
