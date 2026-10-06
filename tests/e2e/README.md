# E2E suite
Setup: junction node_modules/@playwright, playwright, playwright-core from C:\ct\ct\node_modules.
Local: `cd tests/e2e; E2E_TARGET=local node ../../node_modules/@playwright/test/cli.js test -c playwright.config.ts` (E2E_MATCH='04-.*' to pick specs).
Time travel: `bun test tests/e2e/timetravel`.
Live (TEST mode only for the run, restored in finally): `node tests/e2e/run-live.mjs`; emergency: `--restore-only`.
Register: `node tests/e2e/make-register.mjs` -> docs/E2E_TEST_CASES.md.
