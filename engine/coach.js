// engine/coach.js: Training Engine, guided lessons (Training mode)
//
// register.html?mode=lesson&lesson=register-tour
//
// Walks the trainee through a lesson one step at a time on the REAL
// register layout. If they hesitate or tap the wrong thing:
//   level 1: the correct button glows (5s idle or 1 wrong tap)
//   level 2: a short tip explains why (10s idle, 2 wrong taps, or "Show me")
// Ringing a wrong item adds a mini-lesson on fixing it (Manager > Delete
// Item). If the order gets knocked off track, the lesson restarts from the
// last checkpoint with a fresh order.
//
// Works for any register that provides getOrder/getMenu/getCategory and
// records actions through tracker.js. Lesson content lives in lessons/*.js.

var Coach = (() => {
  const params = new URLSearchParams(window.location.search);
  const active = params.get("mode") === "lesson";

  const GLOW_AFTER_MS = 5000;
  const TIP_AFTER_MS = 10000;
  const CASH_METHODS = ["cash_button", "exact", "nearest", "custom"];

  let lesson = null;
  let trainee = null;
  let steps = [];          // lesson steps, plus any inserted "fix it" steps
  let index = 0;
  let stepStartedAt = 0;
  let wrongThisStep = 0;
  let forcedLevel = 0;
  let maxLevel = 0;
  let feedback = "";
  let expectCompletion = false;
  let ignoreRemovalsUntil = 0;
  let started = false;
  let finished = false;
  let startedAt = 0;
  let tick = null;
  const stats = { wrong: 0, glowSteps: 0, tipSteps: 0, restarts: 0 };

  const $ = sel => document.querySelector(sel);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const step = () => steps[index];
  const visible = el => !!el && el.offsetParent !== null && getComputedStyle(el).display !== "none";

  // ---- Does this action complete the step? --------------------------------
  function matches(t, e) {
    const d = e.data || {};
    if (t.category) return e.type === "category_opened" && d.category === t.category;
    if (t.item) return e.type === "item_added" && d.item === t.item;
    if (t.line) return e.type === "line_selected" && d.line === t.line && d.selected;
    if (t.screen) return e.type === "screen_opened" && d.screen === t.screen;
    switch (t.action) {
      case "delete_item": return e.type === "item_removed" && (!t.removes || d.item === t.removes);
      case "delete_all": return e.type === "order_cleared";
      case "pinpad": return e.type === "tender_applied" && d.method === "pinpad";
      case "cash": return e.type === "tender_applied" && d.method === "cash_button" && Math.abs(d.amount - t.amount) < 0.005;
      case "exact": return e.type === "tender_applied" && d.method === "exact";
      case "percent_discount": return e.type === "discount_applied" && d.kind === "percent" && d.percent === t.percent;
    }
    return false;
  }

  // ---- Which button should glow right now? ---------------------------------
  // Walks back from the goal: if the goal button isn't on screen, point at
  // the button that gets you there (a tab, Manager, PAY...).
  function buttonByText(scope, text) {
    if (!scope) return null;
    return [...scope.querySelectorAll("button")].find(b => (b.innerText || b.textContent).trim() === text) || null;
  }
  const categoryButton = cat => $(`.category-panel button[onclick*="'${cat}'"]`);
  const topButton = text => buttonByText($(".top-bar"), text);
  const screenOpen = id => visible(document.getElementById(id));

  function targetElement(t) {
    if (t.category) return categoryButton(t.category);
    if (t.item) {
      const grid = $("#menu-buttons");
      const btn = visible(grid) ? buttonByText(grid, t.item) : null;
      if (btn) return btn;
      const menu = getMenu();
      const cats = Object.keys(menu).filter(c => menu[c].includes(t.item));
      const cat = cats.includes(getCategory()) ? getCategory() : cats.includes("main") ? "main" : cats[0];
      return categoryButton(cat);
    }
    if (t.line) return document.querySelectorAll("#order-list li")[t.line - 1] || null;
    if (t.screen === "payment") return $(".category-panel .pay");
    if (t.screen === "manager-screen") return topButton("Manager");
    if (t.screen === "discount") return topButton("Discount");
    switch (t.action) {
      case "delete_item":
      case "delete_all": {
        if (!screenOpen("manager-screen")) return topButton("Manager");
        return buttonByText($("#manager-screen"), t.action === "delete_item" ? "Delete Item" : "Delete All");
      }
      case "pinpad": return screenOpen("payment") ? $("#pinpad-btn") : $(".category-panel .pay");
      case "exact": return screenOpen("payment") ? $("#exact-btn") : $(".category-panel .pay");
      case "cash": return screenOpen("payment") ? buttonByText($("#payment"), "$" + t.amount) : $(".category-panel .pay");
      case "percent_discount": return screenOpen("discount") ? buttonByText($("#discount"), "% Discount") : topButton("Discount");
    }
    return null;
  }

  // ---- Glow + tip -----------------------------------------------------------
  function level() {
    if (!step() || step().info) return 0;
    const idle = Date.now() - stepStartedAt;
    let lvl = forcedLevel;
    if (wrongThisStep >= 1 || idle >= GLOW_AFTER_MS) lvl = Math.max(lvl, 1);
    if (wrongThisStep >= 2 || idle >= TIP_AFTER_MS) lvl = Math.max(lvl, 2);
    return lvl;
  }

  function updateHints() {
    if (!started || finished) return;
    const lvl = level();
    if (lvl > maxLevel) {
      maxLevel = lvl;
      track("coach_hint", { lesson: lesson.id, step: index + 1, level: lvl });
      renderCard();
    }
    const el = lvl >= 1 ? targetElement(step().target) : null;
    document.querySelectorAll(".coach-glow").forEach(g => { if (g !== el) g.classList.remove("coach-glow"); });
    if (el) el.classList.add("coach-glow");
    placeTip(lvl >= 2 && el ? el : null);
  }

  function placeTip(el) {
    let tip = document.getElementById("coach-tip");
    if (!el || !step().why) {
      if (tip) tip.hidden = true;
      return;
    }
    if (!tip) {
      tip = document.createElement("div");
      tip.id = "coach-tip";
      document.body.appendChild(tip);
    }
    tip.hidden = false;
    tip.textContent = step().why;
    const r = el.getBoundingClientRect();
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    let left = Math.min(Math.max(8, r.left + r.width / 2 - tw / 2), window.innerWidth - tw - 8);
    let top = r.bottom + 10;
    if (top + th > window.innerHeight - 8) top = Math.max(8, r.top - th - 10);
    tip.style.left = left + "px";
    tip.style.top = top + "px";
  }

  // ---- Coach card (order panel) --------------------------------------------
  function renderCard() {
    const card = document.getElementById("customer-card");
    card.hidden = false;
    card.classList.add("coach");
    const s = step();
    const total = lesson.steps.length;
    const done = Math.min(lessonStepNumber(), total);
    card.innerHTML = `
      <div class="cc-head"><span>${esc(lesson.title)}</span><span>${done}/${total}</span></div>
      <div class="coach-progress"><span style="width:${Math.round(100 * (done - 1) / total)}%"></span></div>
      ${feedback ? `<p class="coach-feedback">${esc(feedback)}</p>` : ""}
      <p class="cc-new">${esc(s.do)}</p>
      ${maxLevel >= 2 && s.why ? `<p class="coach-why">💡 ${esc(s.why)}</p>` : ""}
      <div class="coach-actions">
        ${s.info ? `<button id="coach-next">Next</button>` : maxLevel < 2 ? `<button id="coach-show" class="ghost">Show me</button>` : ""}
      </div>`;
    const next = document.getElementById("coach-next");
    if (next) next.onclick = () => advance();
    const show = document.getElementById("coach-show");
    if (show) show.onclick = () => { forcedLevel = 2; updateHints(); };
  }

  // Inserted "fix it" steps don't count toward the lesson's step number.
  function lessonStepNumber() {
    return steps.slice(0, index + 1).filter(s => !s.inserted).length || 1;
  }

  // ---- Moving through the lesson -------------------------------------------
  function enterStep() {
    stepStartedAt = Date.now();
    wrongThisStep = 0;
    forcedLevel = 0;
    maxLevel = 0;
    if (step().checkpoint) startNewOrder("lesson_checkpoint");
    renderCard();
    updateHints();
  }

  function leaveStep() {
    if (maxLevel >= 1) stats.glowSteps += 1;
    if (maxLevel >= 2) stats.tipSteps += 1;
  }

  function advance() {
    leaveStep();
    track("coach_step_done", { lesson: lesson.id, step: index + 1, ms: Date.now() - stepStartedAt, hintLevel: maxLevel, wrong: wrongThisStep });
    index += 1;
    feedback = "";
    if (index >= steps.length) return finish();
    enterStep();
  }

  function restartFromCheckpoint(message) {
    leaveStep();
    stats.restarts += 1;
    let i = index;
    while (i > 0 && !steps[i].checkpoint) i -= 1;
    steps = steps.filter((s, j) => !s.inserted || j < i);
    index = Math.min(i, steps.length - 1);
    feedback = message;
    track("coach_restart", { lesson: lesson.id, step: index + 1 });
    enterStep();
  }

  function insertFixSteps(item) {
    steps.splice(index, 0,
      { inserted: true, target: { screen: "manager-screen" }, do: `Oops, that rang ${item}. Let's fix it: open Manager.`, why: "Mistakes are fixed from the Manager screen." },
      { inserted: true, target: { action: "delete_item", removes: item }, do: `Tap Delete Item to remove ${item} (it's the last line).`, why: "With nothing highlighted, Delete Item removes the last line." });
  }

  function wrong(message) {
    stats.wrong += 1;
    wrongThisStep += 1;
    feedback = message;
    track("coach_wrong", { lesson: lesson.id, step: index + 1 });
    renderCard();
    updateHints();
  }

  // ---- Reacting to every register action -------------------------------------
  function onEvent(e) {
    if (!started || finished) return;
    const s = step();
    const d = e.data || {};

    if (e.type === "transaction_completed") {
      if (expectCompletion) { expectCompletion = false; return; }
      return restartFromCheckpoint("The sale finished before the lesson was done. Let's ring it again.");
    }
    if (s.info) return; // reading: actions don't count

    if (matches(s.target, e)) {
      if (e.type === "tender_applied") expectCompletion = true;
      if (e.type === "item_removed") ignoreRemovalsUntil = Date.now() + 100; // several lines deleted at once
      return advance();
    }

    switch (e.type) {
      case "item_added":
        insertFixSteps(d.item);
        return wrong(`That rang ${d.item}.`);
      case "empty_slot_tapped":
        return wrong("That's an empty spot.");
      case "item_removed":
      case "order_cleared":
        if (Date.now() < ignoreRemovalsUntil) return;
        return restartFromCheckpoint("That deleted something we needed. Let's set the order up again.");
      case "tender_applied":
        if (CASH_METHODS.includes(d.method) || d.method === "pinpad") return wrong("That's not the payment the customer gave you.");
        return;
      case "discount_applied":
        return wrong(`That applied ${d.kind === "percent" ? d.percent + "%" : "$" + d.amount}. Try again.`);
      case "line_selected":
        if (d.selected) return wrong(`That highlighted ${d.item}. Tap it again to un-highlight.`);
        return;
    }
  }

  // ---- Start / finish --------------------------------------------------------
  function modal(html) {
    closeModal();
    const wrap = document.createElement("div");
    wrap.id = "ch-modal";
    wrap.innerHTML = `<div class="ch-box">${html}</div>`;
    document.body.appendChild(wrap);
    return wrap;
  }
  function closeModal() {
    const m = document.getElementById("ch-modal");
    if (m) m.remove();
  }

  function showIntro() {
    const box = modal(`
      <p class="ch-kicker">Training</p>
      <h2>${esc(lesson.title)}</h2>
      <p>${esc(lesson.summary)}</p>
      <p class="ch-muted">Follow the steps in the yellow box. Stuck? The right button will glow, and a tip explains why. No score, just practice.</p>
      <div class="ch-actions">
        <button class="ch-primary" id="coach-start">Start lesson</button>
        <a class="ch-link" href="index.html">Back to Training Lab</a>
      </div>`);
    box.querySelector("#coach-start").onclick = start;
  }

  function start() {
    closeModal();
    started = true;
    startedAt = Date.now();
    track("lesson_started", { lesson: lesson.id, lessonVersion: lesson.version, trainee: trainee.name });
    enterStep();
    tick = setInterval(updateHints, 250);
  }

  function finish() {
    finished = true;
    clearInterval(tick);
    document.querySelectorAll(".coach-glow").forEach(g => g.classList.remove("coach-glow"));
    placeTip(null);
    const seconds = Math.round((Date.now() - startedAt) / 100) / 10;
    const helps = stats.glowSteps + stats.wrong;
    const stars = helps === 0 ? 3 : helps <= 3 ? 2 : 1;
    track("lesson_completed", { lesson: lesson.id, seconds, ...stats });

    const events = Tracker.getEvents();
    let startIdx = 0;
    events.forEach((e, i) => { if (e.type === "lesson_started") startIdx = i; });
    const result = {
      id: "l_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6),
      mode: "lesson",
      trainee,
      scenarioId: lesson.id,
      scenarioVersion: lesson.version,
      scenarioTitle: lesson.title,
      scoringVersion: 1,
      score: Math.max(0, 100 - 10 * stats.glowSteps - 5 * stats.wrong),
      passed: true,
      stars,
      seconds,
      hintsNeeded: stats.glowSteps,
      tipsNeeded: stats.tipSteps,
      wrongTaps: stats.wrong,
      restarts: stats.restarts,
      startedAt: events[startIdx].at,
      finishedAt: new Date().toISOString(),
      sessionId: Tracker.getSession().id,
      events: events.slice(startIdx),
    };
    Storage.saveAttempt(result);

    const idx = Lessons.list.findIndex(l => l.id === lesson.id);
    const next = Lessons.list[idx + 1];
    const box = modal(`
      <p class="ch-kicker">Lesson complete</p>
      <h2 class="ch-pass">${esc(lesson.title)}</h2>
      <div class="ch-stars">${"★".repeat(stars)}<span>${"★".repeat(3 - stars)}</span></div>
      <ul class="ch-feedback">
        <li class="${stats.glowSteps ? "bad" : "ok"}">${stats.glowSteps ? `Needed a hint on ${stats.glowSteps} step${stats.glowSteps > 1 ? "s" : ""}` : "✓ No hints needed"}</li>
        <li class="${stats.wrong ? "bad" : "ok"}">${stats.wrong ? `${stats.wrong} wrong tap${stats.wrong > 1 ? "s" : ""}` : "✓ No wrong taps"}</li>
        <li class="ok">Time: ${seconds.toFixed(0)}s</li>
      </ul>
      <p class="ch-muted">${stars < 3 ? "Run it again until you get 3 stars, then try the Challenges." : "Nice. You're ready for the Challenges on this skill."}</p>
      <div class="ch-actions">
        ${next ? `<button class="ch-primary" id="coach-nextlesson">Next lesson</button>` : `<button class="ch-primary" id="coach-challenges">Try a Challenge</button>`}
        <button id="coach-again">Do it again</button>
        <a class="ch-link" href="index.html">Training Lab</a>
      </div>`);
    box.querySelector("#coach-again").onclick = () => window.location.reload();
    const toChallenges = box.querySelector("#coach-challenges");
    if (toChallenges) toChallenges.onclick = () => { window.location.href = "index.html#challenges"; };
    if (next) {
      box.querySelector("#coach-nextlesson").onclick = () => {
        window.location.href = `register.html?mode=lesson&lesson=${encodeURIComponent(next.id)}`;
      };
    }
  }

  // ---- Boot -------------------------------------------------------------------
  if (active) {
    lesson = Lessons.get(params.get("lesson"));
    trainee = Storage.getTrainee();
    if (!lesson || !trainee) {
      window.location.replace("index.html");
    } else {
      steps = lesson.steps.slice();
      document.title = "Training: " + lesson.title;
      Tracker.onRecord(onEvent);
      window.addEventListener("resize", updateHints);
      showIntro();
    }
  }

  return { active, getState: () => ({ index, step: step(), level: level(), finished, stats: { ...stats } }) };
})();
