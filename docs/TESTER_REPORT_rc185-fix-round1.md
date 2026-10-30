# TESTER_REPORT: Tambola rc 1.8.5 fix round 1 (test branch `tests/tambola-rc185-fixes-2026-10-30`)
Base: `origin/tests/tambola-rc185-2026-10-30` + merge of `origin/rc/tambola-1.8.5` (d049192). No conflicts. Only test files, test helpers and the break table were changed. No product code touched.

## Counts (each folder run once, `bun test --isolate <folder>`, last summary lines; this cloud sandbox)
| Folder | Pass | Fail | Notes |
|---|---|---|---|
| packages/shared | 12 | 0 | |
| packages/engine | 65 | 0 | |
| packages/beacon | 359 | 0 | |
| packages/billing | 26 | 0 | |
| tools/control-worker | 1 | 0 | |
| apps/edge | 2166 | 0 | 1 skipped. The first run (before fix a below) was 2165 pass / 1 fail; this row is a second full run after the fix. |
| apps/server | 9 | 0 | |
| apps/web | 893 | **1** | the one failure is product bug B1 (below), kept red on purpose |

## What I changed, per failure
- a) `apps/edge/test/worker.test.ts` join key list: added `idKind`. It also needed `idClean` (the join reply carries it too; the run after adding only `idKind` showed it). Both are in the product reply.
- b) `apps/edge/test/empid.test.ts`: the wording check lower-cases the message and looks for "looks like an email id".
- c) `apps/web/test/zc-flow-scenarios.test.ts`: the participant Email ID oracle is now NFKC, remove all spaces, lower case, then the shape check. `a b@acme.com`, `a b＠acme.com` and `a@b c.com` are valid. Account emails are tested separately (below) and still refuse spaces.
- d) `apps/web/test/zc-flow-live.test.ts`: no earlier commit had fixed it. All DOM null checks are now boolean assertions. Behind the huge message was a real assertion: `#zf-bottomrow` is always drawn by the pack (Big screen and Play the game links, unchanged since 1.7.0). The test now checks that no-flag games have no `#zf-reh/#zf-feed/#zf-online` and no next-number control inside the bottom row.
- e) `apps/web/test/player-look.test.ts`: the welcome-text test already passes (the coder put the literal "your employee ID or your mobile number" back in z.js), so it was not changed. The two broken checks were the `indexOf` comparison (the text is now "Game completed" and the strip is `id="zshare">Thank you for playing`) and the Rules row (now a `<details class="zrulesrow">`). Both updated.
- f) `apps/web/test/pages.test.ts`: 'Create a new game like this one' now waits for `[data-hist="1"]` to exist before clicking (no fixed sleep). Before the change it did not fail for me. After: **3 runs of the whole file: 143 pass / 0 fail, 143 / 0, 143 / 0.** I could not reproduce either failure here, so the wait is a precaution, not a proven cure. 'Copy payment link' was not changed and also passed 3 of 3.

## New tests (each proven green -> red -> restored with `bun tools/matrix/breaks/run-breaks.ts --only C --no-matrix`)
- C01 `apps/edge/test/rc185/account-email.test.ts`: `/api/start`, `/api/auth/email`, `/api/auth/verify` and adding a Host refuse an inner space; the same address without it, with end spaces, capitals or a full-width at-sign is accepted. Break: `normAccountEmail` removes inner spaces -> RED (2 fail).
- C02 `apps/web/test/rc185/fix-round1.test.ts`: guide.js lists `Enter your mobile number or your ${idWord(vf.idKind)}` and `Enter your ${idWord(vf.idKind)}`, and worker.ts still sends the first. Break: remove the entry -> RED (1 fail).
- C03 same file: every `localStorage` call in zc-mode.js uses the literal `"ctz-zcflow"`, the scanner sees it, and storage-registry.json lists it. Break: use the variable `KEY` -> RED (1 fail).
- Break table `tools/matrix/breaks/table.ts` got C01-C03.

## Product problems (not fixed by me)
- **B1 (still open, 1 red test):** in an employee-ID game, typing `demo1@demo-test.invalid` in the ID box shows the hint "The system will read this as DEMO1DEMOTESTINVALID". The 1.8.5 rule says an email is refused, never turned into letters. Evidence: `apps/web/test/rc185/join-page.test.ts` test "PRODUCT BUG B1" (and `docs/TESTER_REPORT.md`). Cause: z.js line 1115 shows the hint for any text when `INFO.idClean`, with no email check. The coder needs to fix z.js; I left the test red on purpose.
- **G1 (weakness, not a failing test):** the guide entries `Enter your ${idWord(vf.idKind)}` become the text "enter your" after the guide normalises them, which matches almost any "Enter your ..." message. Removing the new entry changes no lookup. The coder's fix is therefore tested only as source text (C02). Suggest writing the fragments in a form that survives normalising, or deleting the dead entries.
- **P1 (pages.test flake):** not reproduced, see f).

## Done?
Not fully: apps/web has 1 fail (B1, product).
