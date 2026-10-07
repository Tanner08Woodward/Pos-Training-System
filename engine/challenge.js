// engine/challenge.js: Training Engine, Challenge Mode runner
//
// register.html?mode=challenge&scenario=waffle-to-sugar
//
// 1. Shows a Start screen. The timer starts when the trainee taps Start.
// 2. Shows what the customer says in the order panel.
// 3. Reveals the next line (a change of mind) only after the trainee has
//    rung the current order correctly, or opens PAY.
// 4. When PAY is opened on the final order, the customer says how they pay.
// 5. When the sale completes, scores it (engine/scoring.js), saves the
//    attempt (engine/storage.js) and shows the results.
//
// In Playground mode (no ?mode=challenge) this file does nothing.

var Challenge = (() => {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mode") === "challenge" ? "challenge" : "playground";
  const ADVANCE_DELAY_MS = 900; // pause before the customer speaks again

  let scenario = null;
  let trainee = null;
  let stepIndex = -1;
  let started = false;
  let finished = false;
  let paySaid = false;
  let advanceTimer = null;
  let clockTimer = null;
  let startedAt = 0;
  let lines = [];

  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function lastStep() { return scenario.steps.length - 1; }

  function orderMatches(expected) {
    const a = getOrder().sort();
    const b = expected.slice().sort();
    return a.length === b.length && a.every((x, i) => x === b[i]);
  }

  // ---- Customer card (in the order panel) -------------------------------
  function renderCard() {
    const card = $("customer-card");
    card.hidden = false;
    const secs = started && !finished ? Math.floor((Date.now() - startedAt) / 1000) : null;
    card.innerHTML =
      `<div class="cc-head"><span>Customer</span>${secs !== null ? `<span class="cc-clock">${secs}s</span>` : ""}</div>` +
      lines.map((l, i) => `<p class="${i === lines.length - 1 ? "cc-new" : ""}">“${esc(l)}”</p>`).join("");
  }

  function say(text, data) {
    lines.push(text);
    track("customer_said", Object.assign({ text }, data));
    renderCard();
    const card = $("customer-card");
    card.classList.remove("cc-flash");
    void card.offsetWidth; // restart the flash animation
    card.classList.add("cc-flash");
  }

  function advance() {
    advanceTimer = null;
    if (finished || stepIndex >= lastStep()) return;
    stepIndex += 1;
    say(scenario.steps[stepIndex].say, { step: stepIndex + 1 });
    interrupt(scenario.steps[stepIndex].say, "The customer changes their order");
  }

  // Big speech bubble in the middle of the screen, so a change of mind or
  // how they're paying can't be missed (like hearing it at the counter).
  // The timer keeps running; tap anywhere on it to keep going.
  function interrupt(text, heading) {
    closeInterrupt();
    const wrap = document.createElement("div");
    wrap.id = "ch-interrupt";
    wrap.innerHTML = `
      <div class="ci-bubble" role="alert">
        <div class="ci-head">🗣 ${esc(heading)}</div>
        <div class="ci-text">“${esc(text)}”</div>
        <button class="ci-ok">Got it</button>
      </div>`;
    wrap.onclick = closeInterrupt;
    document.body.appendChild(wrap);
  }
  function closeInterrupt() {
    const el = $("ch-interrupt");
    if (el) el.remove();
  }

  function scheduleAdvance() {
    if (!advanceTimer) advanceTimer = setTimeout(advance, ADVANCE_DELAY_MS);
  }

  // ---- Reacting to the trainee's actions --------------------------------
  function onEvent(e) {
    if (!started || finished) return;

    if (e.type === "transaction_completed") return finish();

    if (e.type === "screen_opened" && e.data.screen === "payment") {
      if (stepIndex < lastStep()) {
        // Customer jumps in before paying.
        clearTimeout(advanceTimer);
        advance();
      } else if (!paySaid) {
        paySaid = true;
        say(scenario.pay.say, { step: "pay" });
        interrupt(scenario.pay.say, "The customer pays");
      }
      return;
    }

    if (["item_added", "item_removed", "order_cleared", "order_started"].includes(e.type)) {
      // Actions are recorded just BEFORE the register changes the order,
      // so check the order right after this action has finished.
      setTimeout(() => {
        if (!finished && stepIndex < lastStep() && orderMatches(scenario.steps[stepIndex].order)) scheduleAdvance();
      }, 0);
    }
  }

  // ---- Start / finish ----------------------------------------------------
  function showIntro() {
    const box = modal(`
      <p class="ch-kicker">Challenge</p>
      <h2>${esc(scenario.title)}</h2>
      <p>A customer is walking up. Ring their order exactly as they say it, then take payment.</p>
      <p class="ch-muted">The customer may change their mind. The timer starts when you tap Start.</p>
      <div class="ch-actions">
        <button class="ch-primary" id="ch-start">Start</button>
        <a class="ch-link" href="index.html">Back to Training Lab</a>
      </div>`);
    box.querySelector("#ch-start").onclick = start;
  }

  function start() {
    closeModal();
    startNewOrder("challenge_start");
    started = true;
    startedAt = Date.now();
    track("challenge_started", { scenario: scenario.id, scenarioVersion: scenario.version, trainee: trainee.name });
    stepIndex = 0;
    say(scenario.steps[0].say, { step: 1 });
    clockTimer = setInterval(renderCard, 500);
  }

  function finish() {
    finished = true;
    closeInterrupt();
    clearTimeout(advanceTimer);
    clearInterval(clockTimer);
    renderCard();

    const events = Tracker.getEvents();
    const result = Scoring.score(scenario, events, { itemInfo: Scenarios.itemInfo });
    if (!result) return;

    let startIdx = 0;
    events.forEach((e, i) => { if (e.type === "challenge_started") startIdx = i; });
    const attempt = {
      id: "a_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6),
      mode: "challenge",
      trainee: trainee,
      scenarioId: scenario.id,
      scenarioVersion: scenario.version,
      scenarioTitle: scenario.title,
      skills: scenario.skills,
      register: "handels",
      startedAt: events[startIdx].at,
      finishedAt: new Date().toISOString(),
      sessionId: Tracker.getSession().id,
      ...result,
      events: events.slice(startIdx),
    };
    const saved = Storage.saveAttempt(attempt);
    // Let the register's own "Thank you!" popup close first.
    setTimeout(() => showResults(result, saved), 50);
  }

  function showResults(r, saved) {
    const idx = Scenarios.list.findIndex(s => s.id === scenario.id);
    const next = Scenarios.list[idx + 1];
    const box = modal(`
      <p class="ch-kicker">${esc(scenario.title)}</p>
      <h2 class="${r.passed ? "ch-pass" : "ch-fail"}">${r.passed ? "Passed" : "Not yet"}</h2>
      <div class="ch-score">${r.score}<span>/100</span></div>
      <div class="ch-points">
        <span>Order ${r.points.accuracy}/50</span>
        <span>Payment ${r.points.payment}/20</span>
        <span>Corrections ${r.points.corrections}/15</span>
        <span>Speed ${r.points.speed}/15</span>
      </div>
      <ul class="ch-feedback">
        ${r.feedback.map(f => `<li class="${f.ok ? "ok" : "bad"}">${f.ok ? "✓" : "✗"} ${esc(f.text)}</li>`).join("")}
      </ul>
      ${r.orderCorrect ? "" : `
        <div class="ch-compare">
          <div><strong>${scenario.steps.length > 1 ? "Final order (after changes)" : "Customer wanted"}</strong>${r.expected.map(i => `<div>${esc(i)}</div>`).join("")}</div>
          <div><strong>You rang</strong>${r.rung.map(i => `<div>${esc(i)}</div>`).join("") || "<div>(nothing)</div>"}</div>
        </div>`}
      <details class="ch-convo" ${r.orderCorrect ? "" : "open"}>
        <summary>What the customer said</summary>
        ${lines.map(l => `<p>“${esc(l)}”</p>`).join("")}
      </details>
      ${!r.passed && scenario.tip ? `<p class="ch-tip"><strong>Tip:</strong> ${esc(scenario.tip)}</p>` : ""}
      ${saved ? "" : `<p class="ch-muted">This result could not be saved on this device.</p>`}
      <div class="ch-actions">
        <button class="ch-primary" id="ch-again">Try again</button>
        ${next ? `<button id="ch-next">Next challenge</button>` : ""}
        <a class="ch-link" href="index.html">Training Lab</a>
      </div>`);
    box.querySelector("#ch-again").onclick = () => window.location.reload();
    if (next) {
      box.querySelector("#ch-next").onclick = () => {
        window.location.href = `register.html?mode=challenge&scenario=${encodeURIComponent(next.id)}`;
      };
    }
  }

  // ---- Simple on-screen dialog -------------------------------------------
  function modal(html) {
    closeModal();
    const wrap = document.createElement("div");
    wrap.id = "ch-modal";
    wrap.innerHTML = `<div class="ch-box">${html}</div>`;
    document.body.appendChild(wrap);
    return wrap;
  }
  function closeModal() {
    const m = $("ch-modal");
    if (m) m.remove();
  }

  // ---- Boot ---------------------------------------------------------------
  if (mode === "challenge") {
    scenario = Scenarios.get(params.get("scenario"));
    trainee = Storage.getTrainee();
    if (!scenario || !trainee) {
      window.location.replace("index.html");
    } else {
      document.title = "Challenge: " + scenario.title;
      Tracker.onRecord(onEvent);
      showIntro();
    }
  }

  return { mode, getState: () => ({ stepIndex, started, finished, lines: lines.slice() }) };
})();
