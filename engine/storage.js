// engine/storage.js: Training Engine, saved results
//
// WHAT THIS DOES
// Saves the current trainee's name and every Challenge attempt (score,
// mistakes, and the full action log), and reads them back for the hub and
// the manager page.
//
// WHERE THE DATA LIVES (for now)
// In this browser only (localStorage). A manager on a different device
// won't see these results yet. The next step is a shared database
// (Supabase); only this file will need to change when we switch.

var Storage = (() => {
  const KEYS = {
    trainee: "ptl.trainee.v1",
    attempts: "ptl.attempts.v1",
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

  // Trainee identity: first name + last initial only (trainees may be minors).
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

  function listAttempts() {
    return read(KEYS.attempts, []);
  }

  function saveAttempt(attempt) {
    const all = listAttempts();
    all.push(attempt);
    return write(KEYS.attempts, all);
  }

  function clearAttempts() {
    return write(KEYS.attempts, []);
  }

  return { getTrainee, setTrainee, listAttempts, saveAttempt, clearAttempts };
})();
