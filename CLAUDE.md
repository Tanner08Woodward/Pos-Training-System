# CLAUDE.md: project briefing for Claude Code

Read this before doing anything in this repository.

## What this is
A commercial **employee POS training system**. New hires practice on a realistic mock register before using the real one with customers.
Core loop: **realistic POS simulation → practice → action tracking → scoring → readiness.**

**Handel's Ice Cream is the first and only business right now.** The owner is a Handel's shift lead/trainer. The existing register simulator is already used for training at 4 Handel's stores owned by the same operator. All 4 stores use the same register layout.

## The owner
- New to software development. Explain every change in plain English and don't assume jargon is known.
- Work in small milestones. For each one: say what we're building and why, make the change, test it, explain what changed, and suggest the next step.
- Show the diff before committing. **Ask before any destructive change** (deleting files, restructuring, rewriting).
- If an earlier decision looks wrong, say so and explain why before changing it.

## Hard rules
1. **Production must never be touched:** https://handelsregtrainer.netlify.app is the live trainer used by real trainees. It is a manual Netlify upload and is NOT linked to any repository. Never deploy to it or change it.
2. **Only work in this repository (`Pos-Training-System`).** The `Handels-POS-Sim` repo is an old broken prototype (RTF files) and is not the live code. Don't touch it.
3. Dev site: **https://poslive.netlify.app** (Netlify site `poslive`) deploys automatically from `main` of this repo.
4. **Preserve the register:** keep the existing layout, button positions, colors, categories, and flow. Do not redesign the UI or replace it with a new framework (no React/Next.js rewrite). Plain HTML/CSS/JavaScript with no build step.
5. Scoring must be **deterministic and explainable**. AI never decides whether a transaction is correct.
6. **Do not build yet:** AI or voice customers, chatbots, marketing pages, a generic demo business, a configuration editor, multi-business SaaS architecture, Stripe or payments, or unnecessary APIs.
7. Never store real payment or card data. Payments are simulated only.
8. Trainees may be minors, so store as little personal info as possible (e.g., first name + last initial).

## Architecture
Keep two ideas separate (without over-engineering):
- **Training engine** (works for any register): action recording (`tracker.js`), and later scenarios, scoring, results, and progress.
- **Business configuration** (Handel's-specific): register layout (`menuItems`), `prices`, and register rules. It currently lives in `script.js` and may move to its own data file later.

Files:
- `index.html`: **Training Lab** (hub). Trainee enters first name + last initial; links to Training lessons, Playground, Challenges, Study Guide, Manager.
- `guide.html`: register Study Guide (from the Handel's study guide + onboarding packet), each section links to its lesson.
- `config.js`: public Supabase URL + publishable key (sent in the `apikey` header). `supabase/schema.sql`: one-time database setup (run in Supabase SQL Editor; RLS on, website can only call save_attempt / manager_attempts / manager_clear).
- `engine/coach.js` + `lessons/handels.js`: Training mode (`?mode=lesson&lesson=<id>`). Steps with targets; the next button glows after 5s idle or a wrong tap, tip bubble after 10s / 2 wrong / "Show me". Wrong item → inserted "fix it" steps; order knocked off track → restart at checkpoint.
- `register.html`: the Handel's register (moved from the old `index.html`; layout unchanged). `?mode=playground` or `?mode=challenge&scenario=<id>`. Logout returns to the hub.
- `style.css`: register look. Always 6 columns; row height scales with screen height so iPhone/iPad/computer match the real layout.
- `script.js`: the Handel's register. `menuItems` holds each category's buttons in grid order; `" "`/`""` entries are intentional spacers that hold real-register positions and must be preserved. `currentOrder` is an array of item-name strings (read it from other files with `getOrder()`).
- `tracker.js`: records every trainee action with timestamps; `Tracker.onRecord(fn)` lets the engine react. Debug panel only with `?debug=1`.
- `training.css`: Challenge customer card + start/results dialogs (kept out of `style.css`).
- `engine/challenge.js`: runs a Challenge: Start screen, customer lines, reveals changes only after the current order is rung correctly (or PAY is opened), scores and saves on completion.
- `engine/scoring.js`: deterministic scoring from the action log (order 50, payment 20, corrections 15, speed 15; pass = right order + right payment + 80+).
- `engine/storage.js`: saves trainee + attempts on the device AND sends them to Supabase (retries unsent ones on next page load). Manager reads all devices with the manager code.
- `scenarios/handels.js`: Challenge orders as data + `itemInfo` (size / product / add-on) for Handel's.
- `manager.html` + `hub.css`: manager dashboard (code sign-in): KPIs, needs-attention list with suggested lesson, trainee progress (lessons + challenges), team problem areas, per-trainee score trend, step-by-step replay. Ready = all lessons done + all challenges passed.
- `tests/`: automated tests (`cd tests && npm install && npm test`). Not part of the site.

## Milestones
- **M0 (done):** original register copied unchanged from production.
- **M1 (done):** action recording. Every register action calls `track(type, data)`, which records `{seq, type, t (ms since session start), at, data, context}`; `context` is the register state just before the action. Event types: session_started, category_opened, item_added (with priceFallback flag), empty_slot_tapped, item_removed, order_cleared, delete_on_empty_order, discount_applied, discount_cancelled, screen_opened, screen_closed, tender_applied (method: cash_button/exact/nearest/custom/pinpad), custom_amount_invalid, transaction_completed (trigger), order_started (reason). Verified that register behavior is identical to the original.
- **M2 (done):** Delete Item (tap to highlight one or more lines; with none highlighted it deletes the last line; Delete Last Item removed). Same 6-column layout on all devices. Training Lab hub, Playground, Challenge Mode with 6 Handel's scenarios (incl. change-of-mind), scoring, trainee name, saved results, manager page with replay.
- **M3 (done):** Supabase shared database (tested against local PostgreSQL), Training mode with glowing hints (7 lessons), Study Guide, redesigned manager dashboard.
- **M4 (implementation, pending preview review):** publishable-key connection, single-record delivery queue with migration backups, visible save status, rejected-record isolation, and safe manager result rendering. Database schema unchanged.
- **Next:** stable trainee identity and store attribution, manager accounts, hub design previews, then readiness wording and calibrated baseline times. Voice remains deferred until the core training loop is dependable.

## Known bugs (verified, not yet fixed; behavior matters more than prices right now)
- `prices[item] || 3.0` charges $3.00 for any item priced 0 (Gift Card Sold, Gift Card Reload, Holiday Card Sold, Catering, DoorDash, Misc. Item, Dipped Waffle Bowl) and for ~19 unpriced items (Kid's Cone, Dipped Kid's Cone, Kid's Dipped Cone, Turtle Sundae, Boston Cooler, Freeze, Bottle Water, Soft Drink, Extra Waffle Cone/Bowl, Mixed Nuts, Pecans, Apple Dumpling w/o IC, Check Gift Card Ballence, Handel's Coin Sold, Pint Card Sold, Gift Certificate Sold, Hat, T Shirt).
- Name mismatches: price key "Check Gift Card Balance" vs button "Ballence"; key "Dipped Kids Cone" vs button "Dipped Kid's Cone".
- Complete Transaction and Pay with Pinpad finish the sale with no payment, even on an empty order (Challenge scoring catches it as a payment mistake).
- Flat discount larger than the order makes subtotal/tax negative. Percent discount doesn't update when items are added later. Delete Item/Delete All don't clear the discount.
- No employee login for voids/discounts.
- `alert()`/`prompt()` popups instead of on-screen register dialogs. Money stored as floats (should be integer cents).

## Handel's register knowledge
- Flavors are NOT rung on the register; only size and vessel are. Flavor is called out to the scoopers.
- Small = 1 flavor, medium = up to 2, large = up to 2 (bigger). If a customer asks for 2 flavors without a size, it's a medium; 1 flavor, a small (unless they specify).
- Sugar and cake cones use the "Cone" buttons (Small/Medium/Large Cone). Waffle cone and waffle bowl have their own buttons.
- Dipped waffle cones are rung as the waffle cone plus a separate dipped add-on (brown buttons).
- Real register: tap one or more order lines to highlight them, then Delete Item; with nothing highlighted, Delete Item removes the last line. Manager screen has only Delete Item and Delete All. Discounts: press the discount button, type the percentage, confirm with the employee login. No employee meals on the register.
- Callout examples (register person to scooper): "Can I get a cake cone strawberry?" (1 flavor, so small). "Can I get a waffle of coffee and graham?" (2 flavors, so medium). Nicknames: "coffee" = Coffee Chocolate Chip, "graham" = Graham Central Station.
- About 48 flavors; about 2 seasonal flavors rotate each season.
- Training today: shifts 1–4 scooping, shifts 5–7 register training.

## Testing expectations
- Before committing, verify the register still behaves identically unless the milestone intends a change. Simulate clicks (e.g., with jsdom) and compare order list, totals, and change against the previous version.
- Add automated tests for anything involving totals, scoring, or event recording.
- After pushing, confirm the poslive deploy succeeded.
