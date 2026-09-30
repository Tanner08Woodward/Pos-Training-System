// tracker.js — Training Engine: action recorder (Milestone 1)
//
// WHAT THIS DOES
// Every time the trainee does something on the register (opens a category,
// rings an item, applies a discount, pays...), script.js calls
// Tracker.record(...). This file keeps an ordered, timestamped list of those
// actions for the current session.
//
// WHY IT IS A SEPARATE FILE
// script.js is the REGISTER (Handel's-specific). This file is part of the
// TRAINING ENGINE (works for any register). Keeping them apart is what will
// later let the same engine power other businesses' registers.
//
// WHAT TRAINEES SEE
// Nothing. The register looks and behaves exactly as before.
// Add ?debug=1 to the address to open a log panel for testing.

var Tracker = (() => {
  const session = {
    id: makeId(),
    startedAt: new Date().toISOString(),
    events: [],
  };
  const startMs = Date.now();

  function makeId() {
    return "s_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  // Record one action.
  //   type:    short name, e.g. "item_added"
  //   data:    details, e.g. { item: "Small Cone", price: 4.6 }
  //   context: register state just BEFORE this action (category, order size, total)
  function record(type, data = {}, context = {}) {
    const event = {
      seq: session.events.length + 1,        // 1, 2, 3... order of actions
      type,
      t: Date.now() - startMs,               // milliseconds since session start
      at: new Date().toISOString(),          // real clock time
      data,
      context,
    };
    session.events.push(event);
    if (typeof Debug !== "undefined") Debug.refresh();
    return event;
  }

  return {
    record,
    getSession: () => session,
    getEvents: () => session.events.slice(),
    toJSON: () => JSON.stringify(session, null, 2),
  };
})();

// ---------------------------------------------------------------------------
// Debug panel — only appears when the address ends with ?debug=1
// Used by us to check that recording works. Trainees never see it.
// ---------------------------------------------------------------------------
var Debug = (() => {
  const enabled = new URLSearchParams(window.location.search).get("debug") === "1";
  let panel, list, toggle, open = false;

  function fmtTime(ms) {
    return (ms / 1000).toFixed(1) + "s";
  }

  function build() {
    toggle = document.createElement("button");
    toggle.id = "trk-toggle";
    toggle.style.cssText =
      "position:fixed;left:8px;bottom:8px;z-index:10000;padding:6px 10px;" +
      "background:#f0c040;color:#000;border:none;border-radius:4px;" +
      "font:bold 12px Arial,sans-serif;cursor:pointer;";
    toggle.onclick = () => { open = !open; panel.style.display = open ? "flex" : "none"; };

    panel = document.createElement("div");
    panel.id = "trk-panel";
    panel.style.cssText =
      "position:fixed;left:8px;bottom:44px;z-index:10000;width:min(460px,92vw);" +
      "height:60vh;display:none;flex-direction:column;background:#1b1b1b;color:#eee;" +
      "border:2px solid #f0c040;border-radius:6px;font:12px Arial,sans-serif;";

    const bar = document.createElement("div");
    bar.style.cssText = "display:flex;gap:6px;padding:6px;border-bottom:1px solid #444;align-items:center;";
    bar.innerHTML = '<strong style="flex:1">Action log (newest first)</strong>';

    const copyBtn = document.createElement("button");
    copyBtn.textContent = "Copy log";
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(Tracker.toJSON())
        .then(() => (copyBtn.textContent = "Copied"))
        .catch(() => (copyBtn.textContent = "Copy failed"));
      setTimeout(() => (copyBtn.textContent = "Copy log"), 1500);
    };
    bar.appendChild(copyBtn);

    list = document.createElement("ol");
    list.style.cssText = "margin:0;padding:6px 6px 6px 34px;overflow-y:auto;flex:1;";

    panel.appendChild(bar);
    panel.appendChild(list);
    document.body.appendChild(panel);
    document.body.appendChild(toggle);
  }

  function refresh() {
    if (!enabled || !list) return;
    const events = Tracker.getEvents();
    toggle.textContent = "Log (" + events.length + ")";
    list.innerHTML = "";
    events.slice().reverse().forEach(e => {
      const li = document.createElement("li");
      li.value = e.seq;
      li.style.cssText = "margin-bottom:4px;";
      li.textContent = fmtTime(e.t) + "  " + e.type + "  " + JSON.stringify(e.data);
      list.appendChild(li);
    });
  }

  if (enabled) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => { build(); refresh(); });
    } else {
      build();
    }
  }

  return { refresh, enabled };
})();
