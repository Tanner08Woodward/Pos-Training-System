# Pos-Training-System

Development repository for the POS training system. Handel's is the first register.

**Production (do not touch from here):** https://handelsregtrainer.netlify.app. It is a manual Netlify upload, not linked to any repository.
**Development site:** deploys automatically from this repository's `main` branch.

## Files
- `index.html`, `style.css`, `script.js`: the Handel's register (layout, prices, register behavior). Originally copied unchanged from production.
- `tracker.js`: training engine, part 1. Records every trainee action with a timestamp. It is not specific to Handel's.

## Milestones
- **M0:** original register copied unchanged (first commit).
- **M1:** action recording. The register looks and behaves exactly the same. Add `?debug=1` to the address to see the live action log.
