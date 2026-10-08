# Pos-Training-System

Development repository for the POS training system. Handel's is the first register.

**Production (do not touch from here):** https://handelsregtrainer.netlify.app. It is a manual Netlify upload, not linked to any repository.
**Development site:** deploys automatically from this repository's `main` branch.

## How to use it
- **Training Lab** (`index.html`): enter first name + last initial, then pick a mode.
- **Playground**: the register, no score.
- **Challenge**: a customer gives an order (and may change their mind). Ring it, take payment, get a score.
- **Manager** (`manager.html`): scores, readiness, most common mistakes, and a tap-by-tap replay of every attempt.

Results are saved on the training device and sent to Supabase. Each completed lesson or challenge shows whether the result was sent, is waiting for a connection, or needs manager help. The manager dashboard warns prominently when shared results are unavailable.

Pending delivery state is saved with each attempt in `ptl.records.v2`. Existing attempts migrate automatically; older storage keys remain as a recovery backup. Rejected records stay on the device and do not block later attempts. Authentication and temporary connection failures remain pending for retry. Keep browser data until any unsent results have been recovered.

## Tests
```
cd tests
npm install
npm test
```

See `CLAUDE.md` for files, rules, and milestones.
