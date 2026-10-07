// engine/scoring.js: Training Engine, Challenge scoring
//
// Deterministic and explainable: the same actions always get the same
// score, and every point lost comes with a plain-English reason.
// It reads only the action log (from tracker.js) and the scenario, so any
// past attempt can be re-scored later if the rules improve.
//
// SCORE (100 points)
//   Order accuracy   50  (-15 per wrong, missing or extra item)
//   Payment          20  (right method and right cash amount)
//   Clean correcting 15  (-5 per unnecessary delete)
//   Speed            15  (full marks at or under the target time,
//                         down to 0 at twice the target)
// PASS = correct order + correct payment + score of 80 or more.

var Scoring = (() => {
  const VERSION = 1;
  const PASS_SCORE = 80;
  const CASH_METHODS = ["cash_button", "exact", "nearest", "custom"];

  // Default item reader: "Medium Waffle Cone" -> size Medium, product
  // "Waffle Cone". Businesses can pass their own via options.itemInfo.
  function defaultItemInfo(name) {
    const m = /^(Small|Medium|Large)\s+(.*)$/.exec(name);
    return { size: m ? m[1] : null, product: m ? m[2] : name, addon: false };
  }

  // Items in a that are not matched in b (counts duplicates).
  function subtract(a, b) {
    const left = b.slice();
    return a.filter(item => {
      const i = left.indexOf(item);
      if (i === -1) return true;
      left.splice(i, 1);
      return false;
    });
  }

  const money = n => "$" + n.toFixed(2);
  const sum = arr => arr.reduce((s, n) => s + n, 0);
  const near = (a, b) => Math.abs(a - b) < 0.005;

  // Pair up missing vs extra items to name the mistake precisely.
  function classifyOrderErrors(missing, extra, itemInfo) {
    const errors = [];
    const extraLeft = extra.slice();
    const unmatched = [];

    // Same product, different size -> wrong size.
    missing.forEach(want => {
      const w = itemInfo(want);
      const i = extraLeft.findIndex(got => {
        const g = itemInfo(got);
        return w.size && g.size && w.product === g.product && w.size !== g.size;
      });
      if (i === -1) return unmatched.push(want);
      const got = extraLeft.splice(i, 1)[0];
      errors.push({ code: "wrong_size", text: `Rang ${got} instead of ${want} (wrong size).`, expected: want, rung: got });
    });

    // Same size, different product -> wrong cone/cup type.
    const stillMissing = [];
    unmatched.forEach(want => {
      const w = itemInfo(want);
      const i = extraLeft.findIndex(got => {
        const g = itemInfo(got);
        return w.size && g.size === w.size && !g.addon && !w.addon;
      });
      if (i === -1) return stillMissing.push(want);
      const got = extraLeft.splice(i, 1)[0];
      errors.push({ code: "wrong_type", text: `Rang ${got} instead of ${want} (wrong cone/cup type).`, expected: want, rung: got });
    });

    stillMissing.forEach(want => {
      const addon = itemInfo(want).addon;
      errors.push({
        code: addon ? "missed_addon" : "missing_item",
        text: addon ? `Missed the add-on: ${want}.` : `Missing item: ${want}.`,
        expected: want,
      });
    });
    extraLeft.forEach(got => {
      errors.push({ code: "extra_item", text: `Extra item that wasn't ordered: ${got}.`, rung: got });
    });
    return errors;
  }

  function checkPayment(pay, tenders, done) {
    const pinpad = tenders.some(t => t.data.method === "pinpad");
    const cash = sum(tenders.filter(t => CASH_METHODS.includes(t.data.method)).map(t => t.data.amount));
    const unpaid = done.data.trigger === "complete_button" && done.data.paid + 0.005 < done.data.total;

    if (unpaid && !pinpad) {
      return { ok: false, code: "no_payment", text: "Completed the sale without taking payment." };
    }
    if (pay.method === "card") {
      if (!pinpad) return { ok: false, code: "wrong_payment_method", text: "Customer paid by card. Use Pay with Pinpad." };
      if (cash > 0) return { ok: false, code: "wrong_payment_method", text: "Customer paid by card, but cash was also entered." };
      return { ok: true, text: "Took card payment with the pinpad." };
    }
    // Cash
    if (pinpad) return { ok: false, code: "wrong_payment_method", text: `Customer paid cash (${money(pay.tendered)}), but the pinpad was used.` };
    if (!near(cash, pay.tendered)) {
      return {
        ok: false,
        code: "wrong_tender_amount",
        text: `Customer handed you ${money(pay.tendered)}, but ${money(cash)} was entered, so the change shown was wrong.`,
      };
    }
    return { ok: true, text: `Entered the ${money(pay.tendered)} cash correctly. Change: ${money(done.data.change)}.` };
  }

  // scenario: from scenarios/*.js
  // events:   Tracker events (whole session is fine; only the part after
  //           the latest "challenge_started" is used)
  function score(scenario, events, options = {}) {
    const itemInfo = options.itemInfo || defaultItemInfo;

    let startIdx = -1;
    events.forEach((e, i) => { if (e.type === "challenge_started") startIdx = i; });
    if (startIdx === -1) return null;
    const run = events.slice(startIdx);
    const doneIdx = run.findIndex(e => e.type === "transaction_completed");
    if (doneIdx === -1) return null;
    const start = run[0];
    const done = run[doneIdx];
    const during = run.slice(0, doneIdx + 1);

    const expected = scenario.steps[scenario.steps.length - 1].order;
    const rung = done.data.items;
    const missing = subtract(expected, rung);
    const extra = subtract(rung, expected);
    const orderErrors = classifyOrderErrors(missing, extra, itemInfo);

    // Did they ring an EARLIER version of the order (missed a change of mind)?
    let missedChange = null;
    if (orderErrors.length) {
      for (let i = scenario.steps.length - 2; i >= 0; i--) {
        const old = scenario.steps[i].order;
        if (!subtract(old, rung).length && !subtract(rung, old).length) {
          missedChange = scenario.steps[i + 1].say;
          break;
        }
      }
    }

    const tenders = during.filter(e => e.type === "tender_applied");
    const payment = checkPayment(scenario.pay, tenders, done);

    // Deletes the customer's changes required vs deletes actually made.
    let needed = 0;
    for (let i = 1; i < scenario.steps.length; i++) {
      needed += subtract(scenario.steps[i - 1].order, scenario.steps[i].order).length;
    }
    let removed = 0;
    let usedDeleteAll = false;
    during.forEach(e => {
      if (e.type === "item_removed") removed += 1;
      if (e.type === "order_cleared" && e.data.itemsRemoved.length) {
        removed += e.data.itemsRemoved.length;
        usedDeleteAll = true;
      }
    });
    const extraDeletes = Math.max(0, removed - needed);

    // Time: from Start to the moment payment was entered (popups excluded).
    const lastTender = tenders.length ? tenders[tenders.length - 1] : null;
    const endT = lastTender ? lastTender.t : done.t;
    const seconds = Math.max(0, (endT - start.t) / 1000);
    const target = scenario.targetSeconds;

    const points = {
      accuracy: Math.max(0, 50 - 15 * orderErrors.length),
      payment: payment.ok ? 20 : 0,
      corrections: Math.max(0, 15 - 5 * extraDeletes),
      speed: seconds <= target ? 15 : Math.round(15 * Math.max(0, 1 - (seconds - target) / target)),
    };
    const total = points.accuracy + points.payment + points.corrections + points.speed;
    const orderCorrect = orderErrors.length === 0;
    const passed = orderCorrect && payment.ok && total >= PASS_SCORE;

    // Mistakes (for analytics) and feedback (for the trainee), same facts.
    const mistakes = orderErrors.map(e => ({ code: e.code, text: e.text }));
    if (missedChange) {
      mistakes.unshift({ code: "missed_change", text: `Rang the customer's first order, but they changed it: “${missedChange}”` });
    }
    if (!payment.ok) mistakes.push({ code: payment.code, text: payment.text });
    if (extraDeletes > 0) {
      mistakes.push({
        code: "extra_deletes",
        text: usedDeleteAll && needed > 0
          ? `Used Delete All and re-rang. Deleting only the changed line${needed > 1 ? "s" : ""} is faster.`
          : `${extraDeletes} unnecessary delete${extraDeletes > 1 ? "s" : ""} (rang something wrong, then fixed it).`,
      });
    }
    if (seconds > target) {
      mistakes.push({ code: "slow", text: `Took ${seconds.toFixed(1)}s; goal is ${target}s.` });
    }

    const feedback = [];
    if (orderCorrect) feedback.push({ ok: true, text: "Order rung correctly." });
    if (missedChange) feedback.push({ ok: false, text: mistakes[0].text });
    orderErrors.forEach(e => feedback.push({ ok: false, text: e.text }));
    feedback.push({ ok: payment.ok, text: payment.text });
    if (extraDeletes === 0) {
      feedback.push({ ok: true, text: needed && orderCorrect ? "Fixed the customer's change cleanly." : "No unnecessary deletes." });
    } else {
      feedback.push({ ok: false, text: mistakes.find(m => m.code === "extra_deletes").text });
    }
    feedback.push({
      ok: seconds <= target,
      text: seconds <= target ? `Fast: ${seconds.toFixed(1)}s (goal ${target}s).` : `Took ${seconds.toFixed(1)}s (goal ${target}s).`,
    });

    return {
      scoringVersion: VERSION,
      score: total,
      passed,
      points,
      seconds: Math.round(seconds * 10) / 10,
      expected,
      rung,
      orderCorrect,
      paymentOk: payment.ok,
      deletesNeeded: needed,
      deletesMade: removed,
      mistakes,
      feedback,
    };
  }

  return { score, VERSION, PASS_SCORE, defaultItemInfo };
})();

if (typeof module !== "undefined") module.exports = Scoring;
