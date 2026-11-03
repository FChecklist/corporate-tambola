# TESTER REPORT: rc/tambola-1.8.5 (test author)

Branch `tests/tambola-rc185-2026-10-30`, cut from `rc/tambola-1.8.5` (2718114). Date 2026-10-30.
Only test files, `tools/matrix/` and this report were added. **No product file was changed.** All test addresses are `demoN@demo-test.invalid`. No personal data, no secrets.
The full suites were NOT run (the runner does that). Only the new files were run, to check they work.

## Product bugs found (not fixed, as ordered)
| # | Where | What | Test that shows it |
|---|---|---|---|
| B1 | `apps/web/public/z.js` (hint under the ID box, `empread`) | In a NEW employee-ID game, typing an email shows "The system will read this as DEMO1DEMOTESTINVALID". The 1.8.5 rule says an email is refused and never turned into letters. The refusal on Join is correct; only the live hint is wrong. | `join-page.test.ts` "PRODUCT BUG B1" (kept RED on purpose) |
| B2 | `apps/edge/src/worker.ts` settings PATCH reply | The handoff table says idKind is "shown in the settings reply". The reply has no `idKind`. `/info` has it, so nothing breaks for players. | not pinned (documented only) |
| B3 | `apps/edge/test/empid.test.ts` (coder's file, not edited) | Line 124 expects "looks like an email ID"; the product says "Email ID". 1 of 13 tests fails. Test is stale, product is right per the handoff. | run that file |

Notes (not bugs): NFKC turns ſ (long s) and the Kelvin sign into plain letters (`ſ1` gives `S1`), by the "NFKC first" rule. Old-game email refusal uses the old text, as specified. The handoff says the calm page shows at "30 or more" minutes; the code uses "more than 30"; the tests only require that 1 second past 30 minutes flips it.

## What is proven, and how to run it
Run each folder on its own, from the repo root.

| Command | Files | Expected |
|---|---|---|
| `bun test --isolate apps/edge/test/rc185` | cleaner, worker-rules, idkind | **80 pass, 0 fail** |
| `bun test --isolate apps/web/test/rc185` | game-completed, game-screen, join-page, host-header | **44 pass, 1 fail** (45 tests; the one fail is B1, left red on purpose) |
| `bun test --isolate tools/matrix` | matrix.test.ts | **6 pass** |

`helpers.ts` and `page.ts` are shared helpers, not tests.

### Engine, `apps/edge/test/rc185/`
- `cleaner.test.ts` (38): `cleanEmpId` (the 5 owner spellings, uppercase, symbols, accents, other alphabets, emoji, zero-width, ß never SS, NFKC full-width, idempotent); `normEmpFor` new game (empty = nothing typed, nothing left = refused, 30 ok / 31 refused, cap counts cleaned length, email refused); old game keeps the old rule; `EMP_CLEAN_FROM_MS` boundary (1 ms before = old, at = new); `normEmail` (trim, inner spaces, lower, NFKC, 16 case variants, never the ID cleaner); `normIdFor` per idKind; the refusal sentences.
- `worker-rules.test.ts` (22): real Worker. New game: listed `1B-678` found by any spelling, second phone 423 `id-used`, upload added 2 / "Same person after cleaning" / 1 duplicate, bad ID 400 `bad-id`, email refused and never mangled (also full-width `＠`), `idClean:true`. Old game: two people `1B-678` / `1B678`, `1B.678` waits, email refused with the old text, `idClean:false`. Boundary by creation time. Email: 16 variants same `cleanEmail` and same `emailHashOf`; open-game email key gives 409 `email-unusable`.
- `idkind.test.ts` (20): settings PATCH `email` / `emp` / bad value (400 plain sentence) / kept on later save; `/info` idKind; `validateCfg`; Email-ID game join (3 spellings same person, 423), bad addresses 400, upload flags, need-id sentences ("Enter your Email ID." etc.), email typed in an employee-ID game (new and old).

### Pages, `apps/web/test/rc185/` (real `z.js` / console scripts in a DOM, real Worker; the runtime view is steered)
- `game-completed.test.ts` (18): heading "Game completed", Game ID, 30-minute line, results kept under 30 min; calm page at 31 / 45 / 600 min (no ticket, no prizes, no results); the edge; a phone that watched keeps results; no end time = no calm page; no word "private"; Final results rows (1, 5, 7 prizes), `Ticket N`, "You" only on own wins, other-round win not "You", lucky draws, hidden in play / with no prizes.
- `game-screen.test.ts` (8): Rules row (collapsed `details#zrulesrow`, 3 rules in `#zrules`, hidden after the game); current prize rows ("To win", crossed-out "Won by Ticket N", "You", "all won"). The flat-row restyle is still open per the handoff, so these pin today's rows.
- `join-page.test.ts` (13): chips with / without a brand, none in the demo; "You are in! Game starts in ..." above "Check-in opens at", gone once check-in is open, ticket hidden before check-in; idKind label, keyboard, 254 limit, "read this as" hint, welcome line, phone refusals; B1.
- `host-header.test.ts` (6): Host ribbon text, sentence, Sign out clears keys; absent for organizer and Co-host.

### Scenario matrix, `tools/matrix/`
- `bun tools/matrix/run.ts` full: **6,422,528** scenarios (2 kind x 2 era x 4 role x 2 list/open x 2 family x 2 order x 4 relation x 16 IDs x 28 listed spellings x 28 typed spellings), about 90 s, plus 200 checks on the real Worker. Last full run: scenarios 6,422,528, distinct 6,422,528, failures 0.
- `bun tools/matrix/run.ts --small`: exactly 10,000 scenarios spread over the whole space, about 2 s.
- Streamed by a generator; nothing is stored. Distinct = the index rises strictly, and the spelling tables are checked for duplicates first. Each scenario is run through the product AND an independent oracle (`oracle.ts`, written from the handoff, no shared code); a third check is the rule by construction. Prints scenario count, distinct count, failures.

### Deliberate breaks, `tools/matrix/breaks/`
`bun tools/matrix/breaks/run-breaks.ts [--list] [--edge|--web] [--only ID]`, or one script per rule: `bun tools/matrix/breaks/B01-empid-keeps-dash.ts` (B01-B22 engine, W01-W15 pages). Each copies the product to a temp folder, checks the test is GREEN, changes one thing, checks the test goes RED (and the matrix, where marked), restores and compares byte for byte. The repo is never written; the script also checks `git status` is unchanged.
- Engine B01-B22 (22 breaks): all proven green, red, restored (last run).
- Pages W01-W15: all proven green, red, restored (the web ones take about 5 minutes together).

## Not covered / limits
- No browser screenshots (the 1.8.4 gap-report items still need a live capture).
- Prize-row restyle, ticket before check-in, and the pack-owned header items are open in the handoff, so they are not tested as built.
- The new console Step 2 "Which ID?" radio is not tested (suggest a follow-up).
- Old console `zc.js` has no idKind control (handoff: not done).
