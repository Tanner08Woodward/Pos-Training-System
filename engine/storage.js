// engine/storage.js: Training Engine, saved results
//
// WHAT THIS DOES
// Saves the current trainee's name and every attempt (score, mistakes, and
// the full action log), and reads them back for the hub and manager page.
//
// WHERE THE DATA LIVES
// 1. This browser (localStorage), always, so it works offline and the hub
//    can show "your progress" instantly.
// 2. The shared database (Supabase, see config.js + supabase/schema.sql), so
//    a manager on any device sees every trainee. If the internet drops, the
//    attempt and its pending/sent/rejected state stay together. Pending
//    results retry on page load and when the browser comes back online.

var Storage = (() => {
  const KEYS = {
    trainee: "ptl.trainee.v1",
    attempts: "ptl.attempts.v1", // old tabs and quota-safe migration fallback
    pending: "ptl.pending.v1",
    records: "ptl.records.v2",  // attempt + delivery state, saved together
    delivery: "ptl.delivery.v2", // small status map when a full v2 copy won't fit
  };

  // Browsers can block storage (private mode, settings). The register and
  // challenges must still work, so every read/write is wrapped.
  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (err) {
      console.warn("Storage read failed:", key, err);
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.warn("Storage write failed:", key, err);
      return false;
    }
  }

  // ---- Shared database (Supabase) ------------------------------------------
  const cfg = typeof AppConfig !== "undefined" ? AppConfig : null;
  const apiKey = cfg && (cfg.supabasePublishableKey || cfg.supabaseAnonKey);
  const remoteEnabled = !!(cfg && cfg.supabaseUrl && apiKey);

  async function rpc(name, body) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let res, text;
    try {
      res = await fetch(`${cfg.supabaseUrl}/rest/v1/rpc/${name}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: apiKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      text = await res.text();
    } finally {
      clearTimeout(timeout);
    }
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (err) { /* proxy errors may be HTML */ }
    if (!res.ok) {
      const err = new Error((data && data.message) || `Database error ${res.status}`);
      err.status = res.status;
      throw err;
    }
    if (text && data === null) throw new Error("Invalid database response");
    return data;
  }

  // Read both formats: an older tab can still write v1 after v2 exists.
  // The fallback stores the original bodies once and a small delivery map.
  // Missing delivery metadata always means pending, so losing a status write
  // cannot strand a newly saved attempt outside the retry queue.
  function records() {
    const current = read(KEYS.records, []);
    const all = Array.isArray(current) ? current.slice() : [];
    const ids = new Set(all.map(r => r.attempt.id));
    const old = read(KEYS.attempts, []);
    const delivery = read(KEYS.delivery, {}) || {};
    (Array.isArray(old) ? old : []).forEach(attempt => {
      if (ids.has(attempt.id)) return;
      ids.add(attempt.id);
      const state = Object.prototype.hasOwnProperty.call(delivery, attempt.id) ? delivery[attempt.id] : null;
      all.push({ attempt, status: state ? state.status : "pending", error: state ? state.error : null });
    });
    return all;
  }

  function remove(key) {
    try { localStorage.removeItem(key); } catch (err) { console.warn("Storage cleanup failed:", key, err); }
  }

  let consolidationBlocked = false;
  function persist(all) {
    // Delete redundant copies only AFTER the complete merged v2 write succeeds.
    // If quota prevents the copy, keep using the existing data in place.
    if (!consolidationBlocked && write(KEYS.records, all)) {
      remove(KEYS.attempts);
      remove(KEYS.pending);
      remove(KEYS.delivery);
      return { attemptsSaved: true, statesSaved: true };
    }
    // Do not retry the expensive full-copy migration for every tap/status
    // on a full device. A new page load can try consolidation again.
    consolidationBlocked = true;
    const existing = read(KEYS.records, null);
    const ids = new Set(Array.isArray(existing) ? existing.map(r => r.attempt.id) : []);
    if (Array.isArray(existing) && !write(KEYS.records, all.filter(r => ids.has(r.attempt.id)))) {
      return { attemptsSaved: false, statesSaved: false };
    }
    const legacy = all.filter(r => !ids.has(r.attempt.id));
    if (!write(KEYS.attempts, legacy.map(r => r.attempt))) return { attemptsSaved: false, statesSaved: false };
    const delivery = Object.create(null);
    legacy.forEach(r => {
      if (r.status !== "pending" || r.error) delivery[r.attempt.id] = { status: r.status, error: r.error };
    });
    const statesSaved = write(KEYS.delivery, delivery);
    return { attemptsSaved: true, statesSaved };
  }

  const notices = new Set();
  const unsaved = new Set();
  function refreshNotices() {
    notices.forEach(notice => {
      if (!notice.element.isConnected) { notices.delete(notice); return; }
      const status = getSaveStatus(notice.id);
      notice.element.textContent = status.text;
      notice.element.dataset.state = status.state;
    });
  }

  function setDelivery(id, status, error = null) {
    const all = records();
    const record = all.find(r => r.attempt.id === id);
    if (!record) return false;
    record.status = status;
    record.error = error;
    const ok = persist(all).statesSaved;
    refreshNotices();
    return ok;
  }

  let syncing = null;
  // Send every attempt that hasn't reached the database yet.
  function syncPending() {
    if (!remoteEnabled) return Promise.resolve(0);
    if (syncing) return syncing;
    syncing = (async () => {
      let sent = 0;
      const visited = new Set();
      while (true) {
        const next = records().find(r => r.status === "pending" && !visited.has(r.attempt.id));
        if (!next) break;
        const { attempt } = next;
        visited.add(attempt.id);
        try {
          await rpc("save_attempt", { p: attempt });
          // If this write fails, keep it pending: retrying the same id is safe.
          setDelivery(attempt.id, "sent");
          sent += 1;
        } catch (err) {
          const rejected = [400, 413, 422].includes(err.status);
          setDelivery(attempt.id, rejected ? "rejected" : "pending", { status: err.status || 0 });
          console.warn("Result not sent:", attempt.id, err.message);
          // Invalid attempts must not block the next one. Authentication,
          // rate limits, server failures and offline errors should retry later.
          if (!rejected) break;
        }
      }
      return sent;
    })().finally(() => { syncing = null; });
    return syncing;
  }

  function pendingCount() {
    return records().filter(r => r.status === "pending").length;
  }

  function getSaveStatus(id) {
    const record = records().find(r => r.attempt.id === id);
    if (unsaved.has(id) || !record) return {
      state: "unsaved", text: "Couldn't save this result on this device. Tell your manager before leaving this page.",
    };
    if (record.status === "sent") return { state: "sent", text: "Sent to your manager." };
    if (record.status === "rejected" || (record.error && [401, 403, 404].includes(record.error.status))) return {
      state: record.status, text: "Saved on this device, but couldn't send. Tell your manager.",
    };
    return {
      state: "pending", text: remoteEnabled
        ? "Saved on this device. Will send when the connection is available."
        : "Saved on this device only. Shared saving isn't connected; tell your manager.",
    };
  }

  function showSaveStatus(element, id) {
    notices.add({ element, id });
    refreshNotices();
  }

  function rejectedCount() {
    return records().filter(r => r.status === "rejected").length;
  }

  // Explicit recovery after a server/configuration issue has been corrected.
  // Rejected attempts are not retried automatically on every page load.
  async function retryRejected() {
    const all = records();
    all.forEach(r => {
      if (r.status === "rejected") { r.status = "pending"; r.error = null; }
    });
    if (!persist(all).statesSaved) throw new Error("Couldn't save the retry state on this device. Download results before clearing browser data.");
    refreshNotices();
    return syncPending();
  }

  // Manager: all attempts from every device (needs the manager code).
  async function fetchAllAttempts(code) {
    return rpc("manager_attempts", { p_code: code });
  }

  async function clearAllAttempts(code) {
    return rpc("manager_clear", { p_code: code });
  }

  // ---- Trainee identity: first name + last initial only (may be minors) ----
  function getTrainee() {
    return read(KEYS.trainee, null);
  }

  function setTrainee(name) {
    const clean = String(name || "").trim().replace(/\s+/g, " ").slice(0, 40);
    if (!clean) return null;
    const trainee = { id: "t_" + clean.toLowerCase().replace(/[^a-z0-9]+/g, "-"), name: clean };
    write(KEYS.trainee, trainee);
    return trainee;
  }

  // ---- Attempts on this device ---------------------------------------------
  function listAttempts() {
    return records().map(r => r.attempt);
  }

  function saveAttempt(attempt) {
    const all = records();
    if (!all.some(r => r.attempt.id === attempt.id)) all.push({ attempt, status: "pending", error: null });
    const ok = persist(all).attemptsSaved;
    if (ok) unsaved.delete(attempt.id); else unsaved.add(attempt.id);
    refreshNotices();
    if (ok && remoteEnabled) syncPending();
    return ok;
  }

  function clearAttempts() {
    const all = records();
    // A shared-database clear must not discard this device's unsent work.
    const ok = persist(all.filter(r => r.status !== "sent")).statesSaved;
    if (ok) {
      unsaved.clear();
      refreshNotices();
    }
    return ok;
  }

  // Consolidate once on page load, using the old format in place if quota
  // blocks migration. Later reads still pick up results from older open tabs.
  persist(records());
  // Try to send anything left over from last time (e.g. offline).
  if (remoteEnabled) setTimeout(syncPending, 0);
  window.addEventListener("online", syncPending);

  return {
    getTrainee, setTrainee,
    listAttempts, saveAttempt, clearAttempts,
    remoteEnabled, syncPending, pendingCount, rejectedCount, retryRejected, getSaveStatus, showSaveStatus,
    fetchAllAttempts, clearAllAttempts,
  };
})();
