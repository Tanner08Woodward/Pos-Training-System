# Pos-Training-System

Development repository for the POS training system. Handel's is the first register.

**Production (do not touch from here):** https://handelsregtrainer.netlify.app. It is a manual Netlify upload, not linked to any repository.
**Development site:** deploys automatically from this repository's `main` branch.

## How to use it
- **Training Lab** (`index.html`): enter first name + last initial, then pick a mode.
- **Playground**: the register, no score.
- **Challenge**: a customer gives an order (and may change their mind). Ring it, take payment, get a score.
- **Manager** (`manager.html`): scores, readiness, most common mistakes, and a tap-by-tap replay of every attempt.

Results are saved on the device used for training (shared database is the next step).

## Tests
```
cd tests
npm install
npm test
```

See `CLAUDE.md` for files, rules, and milestones.
