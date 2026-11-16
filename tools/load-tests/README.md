# Load and permutation tests (written on Windows; the Linux cloud runs must port the paths)

These scripts were written on a Windows laptop. They contain Windows paths that a Linux run must change:
- `C:/ct/test-sites/data/...` is where results and the local SQLite database go: use `./data/...`.
- `C:/ct/test-sites/tambola/...` is the repository root: use the checkout.
- `nodephone.mjs` imports `undici` from `file:///C:/ct/ct/node_modules/undici/index.js` and the repo's built phone code `apps/web/public/zgame.js`; install undici (`npm i undici`) and import it normally.
- `ui-lib.mjs` finds Playwright through `createRequire("C:/ct/ct/dpdp-app/package.json")`: install Playwright (`npm i playwright` then `npx playwright install chromium`) and import it normally.
- The local test server is `bun run apps/edge/src/local.ts` with env `PORT=8801 CT_MODE=TEST TEST_MODE=1 PUBLIC_ORIGIN=http://localhost:8801 DAILY_WRITE_BUDGET=1000000000 DB_FILE=./data/tambola-test.sqlite` (needs bun; run `bun install` first). It serves `apps/web/public` itself.
- Needs Node 22+ (`node:sqlite`).

What each does:
- `sigma-http.mjs [attempts] [concurrency]`: join decisions against the local server for six audience types (BASE=http://localhost:PORT OUT=name). One million attempts is the target; every attempt has an expected answer worked out in the script.
- `campaign.mjs --from N --to M --conc K --people P --heavy H --lead SECONDS --tag TAG`: whole games with P fake people per case on the real phone code (zgame.js) over the real network to the local server; the case list is in the file. `run-certify5.sh` shows the 250/500/1000 mix (cases 1-18 at 250, 19-36 at 500, 37-45 at 1000). Always use a FRESH --tag (accounts persist in the database).
- `ui-permute.mjs --view phone|desk [--steps 1,2,...]`: drives the organizer console in a real browser through many choices and mistakes and decides what a person would see after each press (moved on / refused with a visible reason / nothing happened / reason out of sight).
- `certify_report.py`, `coverage_matrix.py`: turn the run files into the six-sigma statements.
