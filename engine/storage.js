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
//    attempt waits in a "to send" list and is sent next time a page opens.

var Storage = (() => {
  const KEYS = {
    trainee: "ptl.trainee.v1",
    attempts: "ptl.attempts.v1",
    pending: "ptl.pending.v1",   // attempt ids not yet sent to the database
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
  const remoteEnabled = !!(cfg && cfg.supabaseUrl && cfg.supabaseAnonKey);

  async function rpc(name, body) {
    const res = await fetch(`${cfg.supabaseUrl}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: cfg.supabaseAnonKey,
        Authorization: `Bearer ${cfg.supabaseAnonKey}`,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const err = new Error((data && data.message) || `Database error ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  let syncing = null;
  // Send every attempt that hasn't reached the database yet.
  function syncPending() {
    if (!remoteEnabled) return Promise.resolve(0);
    if (syncing) return syncing;
    syncing = (async () => {
      let sent = 0;
      const all = listAttempts();
      for (const id of read(KEYS.pending, [])) {
        const attempt = all.find(a => a.id === id);
        try {
          if (attempt) await rpc("save_attempt", { p: attempt });
          write(KEYS.pending, read(KEYS.pending, []).filter(x => x !== id));
          sent += 1;
        } catch (err) {
          console.warn("Not sent yet (will retry):", id, err.message);
          break; // probably offline; try again next time
        }
      }
      return sent;
    })().finally(() => { syncing = null; });
    return syncing;
  }

  function pendingCount() {
    return read(KEYS.pending, []).length;
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
    return read(KEYS.attempts, []);
  }

  function saveAttempt(attempt) {
    const all = listAttempts();
    all.push(attempt);
    const ok = write(KEYS.attempts, all);
    if (ok && remoteEnabled) {
      write(KEYS.pending, read(KEYS.pending, []).concat(attempt.id));
      syncPending();
    }
    return ok;
  }

  function clearAttempts() {
    write(KEYS.pending, []);
    return write(KEYS.attempts, []);
  }

  // Try to send anything left over from last time (e.g. offline).
  if (remoteEnabled) setTimeout(syncPending, 0);

  return {
    getTrainee, setTrainee,
    listAttempts, saveAttempt, clearAttempts,
    remoteEnabled, syncPending, pendingCount, fetchAllAttempts, clearAllAttempts,
  };
})();
