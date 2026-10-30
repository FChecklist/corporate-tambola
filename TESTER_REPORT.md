# TESTER_REPORT: Tambola 1.9.0 prizes (branch `tests/tambola-1.9.0-prizes-2026-10-30`)

Base: `origin/feat/tambola-1.9.0-prizes` (373a193) + merge of `origin/tests/tambola-rc185-fixes-2026-10-30` (31f7dd8). The merge had **no conflicts**. No product file was changed: only test files, test helpers, the break table and this report. The 1.8.5 report moved to `docs/TESTER_REPORT_rc185-fix-round1.md`.

## Short answer
- The planner, the engine, the lock, the 8-plan gate and the privacy of the public answers are **sound**: 1,000,000 streamed scenarios, 0 failures; 57 deliberate breaks, every one turned red and was restored.
- **The feature is NOT shippable as it is.** Four things a user will hit are broken (details below): **Manual mode can never be saved** (P-6), **the new console never lets players share a prize** (P-4, needs an owner decision), a **negative budget is accepted as a positive one** (P-5), and **small budgets are refused by the server** (P-8). Also the organizer cannot override a per-ticket winner (P-3).
- 5 tests are red on purpose (they prove P-3, P-5, P-6 x2, P-8). 5 more are `test.failing` (known cosmetic or unreachable defects: P-1, P-2, P-7, P-9, G-1). Nothing was fixed in the product.

## Counts (each folder run once with `bun test --isolate`, one at a time, this cloud sandbox; numbers copied from the last summary lines)
| Folder | Pass | Fail | Skip | Notes |
|---|---|---|---|---|
| packages/shared | 12 | 0 | | |
| packages/engine | 65 | 0 | | |
| packages/beacon | 388 | 0 | | 29 of them are new (`test/prizes-190.test.ts`) |
| packages/billing | 26 | 0 | | |
| tools/control-worker | 1 | 0 | | |
| apps/edge | 2190 | **2** | 1 | the 2 are my product-bug tests P-3 and P-8. 26 new tests in `test/prizes-190/` |
| apps/server | 9 | 0 | | |
| apps/web | 987 | **4** | | 3 are my product-bug tests (P-5, P-6 x2). The 4th is `zc-default-182.test.ts` "a published and paid game shows the dashboard", a flaky test that is **not** from 1.9.0 (see below). 97 of the 991 tests are new |
| repo typecheck (`tsc --noEmit -p tsconfig.json`) | | **181 errors** | | **not 0**. None is in a file I wrote or in the 1.9.0 planner files. All 181 are also in the 1.8.5 base (same files and lines; the worker.ts one only moved from line 539 to 542). They are in old tests and tools (`param-*.test.ts`, `tools/sim2`, `phone-cost.test.ts` ...) and 2 in `worker.ts` / `checkin.ts`. My first run had 185; I fixed my 4. "Typecheck 0" was never true on this base. |

Rerun note: the folders were run once in full before my last edits (two tests turned into `test.failing`, one test added, 4 type fixes). apps/edge, packages/beacon and apps/web were then run again in full; the table has those last runs (the first run of apps/web was 985 pass / 5 fail, of which the 5th was P-7, now `test.failing`).
The flaky test: `zc-default-182.test.ts` ("Start this rehearsal" not found on the dashboard) failed in both full apps/web runs. Alone it passes 17/17 (3 runs). It fails or passes depending on which other files run in the same command, and **it also fails on the 1.8.5 base** (`origin/tests/tambola-rc185-fixes-2026-10-30`, which has none of the 1.9.0 code or my files): `zc-default-182 + zc-flow-tambola` failed 2 of 3 runs there, and 0 of 3 on this branch. So it is a timing flake of the existing suite, not a 1.9.0 regression. I did not change it.

## New tests (152) and what each file proves
| File | Tests | Proves |
|---|---|---|
| `apps/web/test/prizes-190/spec.ts` | helper | The frozen tables of R1 written out by me from the task text, plus an exact integer oracle for R2. Shares no code with the product. |
| `apps/web/test/prizes-190/planner.test.ts` | 38 | R1: counts 4/6/8/10 and 12/14/16/20; all 8 tables prize by prize; each sums to exactly 100; smallest is 2.5; no Unlucky; Early 5 only Ticket 1 in 2-ticket plans; labels and ids. R2: 11 fixed budgets (1, 7, 99, 100, 101, 999, 1000, 10001, 12345, 1e6, 1e7) and 20,000 random budgets from 0 to 10 million over all 8 plans against the exact floor + leftover-to-biggest oracle. `shareOut` (100,000 random draws). `validateManual` (at least 1, amount above 0 whole, optional gift up to 60, no duplicate, 30 ok / 31 refused). Hint under 100 per prize. |
| `apps/web/test/prizes-190/console-step3.test.ts` | 36 | R3 and the console: Auto default, chips per ticket count (default 6 and 14), blank/spaces/0/text/dot budgets block Next with the exact sentence, amounts update live and add up, currency is display only, the PATCH body (`tickets`, `rewards` with `ticket_1/ticket_2/two_ticket` and empty text, `prizePlan`) for all 8 plans is accepted by the engine's own `validateCfg`, gift goes only to the plan, Manual rules, Auto to Manual carries the table, Manual to Auto asks, no "Change the split" link, footer wording, fallback to the old Step 3 on `prizes-old-game`. |
| `apps/web/test/prizes-190/player.test.ts` | 11 | R5 on the real player page: the "About the prizes" paragraph (verbatim) in the Rules row, gone after the game; the popup says "You won X. Your organizer will give you your prize."; "is shared with 1 other player." / "N other players."; per-ticket names listed as separate rows; no amount, budget, currency or gift on the play, finished and join pages of a game that has a saved plan. |
| `apps/web/test/prizes-190/sheet.test.ts` | 9 | R6: the host's prize sheet: columns, one row per prize, winners, floored share with "each (shared by N)", gift in the notes column, "Not won (stays with you)", Ticket 1 / Ticket 2 / Super Bumper read their own keys, no sheet for an old game, once only, Print button. |
| `packages/beacon/test/prizes-190.test.ts` | 29 | Keys `top@1`/`top@2`/`full2`, labels, per-ticket lines only with 2 tickets (exact sentence), dropped when tickets become 1, `prizePlan` validation (bad shapes, 30/31, gift cleaning, kept on later saves, null removes). Engine: `top@2` won only by Ticket 2, Early 5 Ticket 1 only, Full House ordinals 1-4 per ticket, Super Bumper 1-4; `settleAll` and `PrizeEngine` agree number by number for all 8 plans (6 logs each). R4 on the real engine: same-call claimers share one position, dense ordinals, late claim (the same instant is late, 1 ms before is in time), wrong-call claim, 2 Bogeys block / 1 does not, 50 random claim mixes in share and next mode through both code paths. |
| `apps/edge/test/prizes-190/gate-lock.test.ts` | 16 | R8: games created -7 d, -1 d, -1 ms get 409 `prizes-old-game` with the exact sentence; exactly at the constant, +1 ms, +5 d are accepted; plain changes on an old game still work. R7: every real change before the start is logged "The prize plan was changed" (no amounts in the line, a repeat is not a change); after the start every change is 409 and the plan is unchanged; 1 s before start works, at start refused. Plan validation on the real route, gift cleaning, clone carries the plan, R5: public `/info`, join answer, results, my prizes and the anonymous summary carry nothing. |
| `apps/edge/test/prizes-190/wire.test.ts` | 9 | The claim check: `top@1 top@2 early5@1 full@1 full@2 corners@2 mid@1 bot@2` accepted; `top@3 top@0 nope@1 full2@1 lucky@1 top@1@1 @1 top@ TOP@1 ...` stored 0; same clock for per-ticket claims; the Not valid route; winner reports for `top@1`/`top@2` are two prizes; "given" tick; plan from the console planner accepted for budgets from 100. |
| `apps/edge/test/prizes-190/matrix-wire.test.ts` | 1 | 4,039 plans (8 plans x 2 modes x 7 currencies x 40 budgets) saved through the real settings route; after every save the public `/info` has no `amount/budget/gift/prizePlan/currency/gift text` and **no number anywhere equal to the budget or an amount**; 101 organizer read-backs are exact. |
| `apps/web/test/prizes-190/matrix.test.ts` + `matrix-lib.ts` | 3 | The 1,000,000-scenario matrix (below). |

## The matrix (R2, R3, R4, R5 together)
Streamed: scenario number in, scenario decoded, checked, forgotten. Nothing is kept. The space is 8 plans x 2 modes (Auto / Manual) x 7 currencies x 120 budgets (including 0, 1, 7, 999, 10001, 10 million) x 7^4 winners-per-call patterns (0 to 6 players at each of 4 consecutive completion calls) x 24 claim arrival orders x 4 late-claim styles = **3,097,866,240 possible scenarios**. A multiplicative scramble makes scenario number to scenario a bijection (a test decodes 200,000 numbers and finds 200,000 different scenarios).
Last run (`bun test --isolate apps/web/test/prizes-190/matrix.test.ts`, 66 s):
```
MATRIX scenarios run: 1000000 | checks: 15437501 | claims dealt: 11999319 | positions won: 2928540 | shared prizes: 1778016 (max 6 sharing) | scenarios with no winner: 5776 | per plan: 125000 x 8
```
**Scenarios actually run: 1,000,000. Failures: 0.** Per scenario: the plan (or the Manual list) is checked against the exact oracle; amounts are whole numbers; the sum equals the budget; each prize is the floor and the leftover sits on the biggest prize; Manual lists are accepted/refused as the rules say and accepted by the engine's validation; no money, gift or plan data in the reward lines or labels; then the claims of the 4 groups arrive in a permuted order, some late, and the REAL `claimsByHouse`, `claimCounts` and `winnersOfHouse` deal the positions: dense ordinals, same-call sharing, then the REAL `shareOut` (floor share, leftover stays with the organizer, share x winners + leftover = amount, leftover < winners) and the accounting identity paid + kept = the prizes of the house.
Plus the wire matrix above: 4,039 plans through the real Worker (not 1,000,000; the HTTP part is a sample).
Limits of the matrix, honestly: the engine part uses the pure functions with synthetic groups (a full `settleAll` with 300 tickets costs milliseconds, so 1M of them is not feasible); the real `settleAll` / `PrizeEngine` equivalence is covered by the beacon file (50 claim mixes, 8 plans x 6 logs). 422 of the 4,039 wire plans (budgets below 40 units) were refused by the server because a prize rounds to 0 (see P-8); the matrix counts them as refused, not as passed.

## Rule -> test -> deliberate break
Every break is applied in a TEMP copy by `bun tools/matrix/breaks/run-breaks.ts` (ONE change, the named tests must turn red, the change is undone and checked byte for byte; the repo is never written; `Repo status unchanged: yes`). Full log: `tools/matrix/breaks/evidence-1.9.0.txt`. **57 breaks, 57 proven (green, then red, then restored).** One example of the format: `P06-amount-rounds  baseline GREEN (38 pass) -> broken RED (4 fail) -> restored yes`.

| Rule | Tests | Breaks (id: what was changed) |
|---|---|---|
| R1 counts and tables | planner, console-step3, matrix | P01 6-prize lines 15 to 14; P02 2-ticket counts 12/14/16/18; P03 Early 5 on Ticket 2; P04 SB 4th 4 to 3; P05 FH3 2.5 to 2; K08 chips not by ticket count |
| R2 amounts | planner, matrix, console-step3 | P06 floor to round; P07 leftover to the first prize; P08 leftover dropped; MX01 floor (over the matrix) |
| R3 budget mandatory / Manual rules | console-step3, planner | K01 blank budget not blocked; K02 sentence changed; K05 Auto to Manual not carried; K06 Manual to Auto without a question; K07 "Change the split" link added; P12 31 prizes; P13 amount 0 ok; P14 duplicate ok; P15 hint threshold |
| R4 sharing, dense ranking, timing, Bogeys, per ticket | beacon, wire, matrix | EN01 ticket_1 keyed @2; EN02 per-ticket house counts both tickets; EN05 no sharing; EN06 a claim at the same instant is in time; EN07 3 Bogeys; EN11 incremental engine ignores the ticket; K03 Ticket 2 lines sent as ticket_1; P10 share ceil; P11 no-winner loses the amount; GT06 top@2 refused; GT07 top@3 accepted; GT08 full2@1 accepted; MX02 share; MX03 ordinals shifted; MX04 late claim accepted |
| R5 visibility and wording | player, gate-lock, matrix-wire, console-step3 | Z01 paragraph wording; Z02 popup sentence; Z03 "other player(s)"; Z04 popup shows an amount; K04 gift in the reward text; K09 footer wording; GT03 plan in public `/info`; MX05 budget number in `/info` under another key name; EN12 gift not cleaned |
| R6 prize sheet | sheet | S01 "Not won" text; S02 key ignores the ticket; S03 share label removed |
| R7 lock and change log | gate-lock | GT04 change not logged; GT05 no lock after start |
| R8 new games only | gate-lock | GT01 boundary `>` instead of `>=`; GT02 old game accepted |
| Plan validation and storage | beacon, gate-lock | EN03 per-ticket lines with 1 ticket; EN04 not dropped at 1 ticket; EN08 amount 0 ok; EN09 duplicate id; EN10 31 prizes; GT09 plan not stored; GT10 plan not in the summary |
Two breaks I dropped: P09 (tie goes to the last biggest prize) and the first S03: none of the 8 plans has two equal biggest prizes, so `>` and `>=` give the same output (an equivalent change, not a test gap); the first MX05 stayed green because it hid the budget under a new key name, so I strengthened the wire matrix (it now checks every number in the public answer) and the break turned red. EN02 had an ambiguous find string; fixed and re-run.

## PRODUCT problems (not fixed by me)
Ordered by what they cost a real organizer. Each has a test.

**P-6 (HIGH) Manual mode can never be saved.** `zc-flow-prizes.js` line 43: `P.validateManual(...).concat(orderProblem(rows))`. `orderProblem` returns the string `""` when all is well; `[].concat("")` is `[""]`, so the list of problems always has one (empty) entry and the step stops with an empty message. Evidence: `console-step3.test.ts`, "PRODUCT BUG P-6" (two red tests): a valid Manual list sends no PATCH and the message box stays empty; `[].concat("").length` is 1. Problems found first by `validateManual` show correctly, which is why it looks fine until the list is right. Fix: `orderProblem(rows) ? [orderProblem(rows)] : []`.

**P-4 (HIGH, owner decision) Games made in the new console never share a prize.** The new console (`zc-flow*.js`) never sends `ties`. A new game gets `defaultCfg().ties === "next"` (stored and returned by `/info` as `"next"`). In `next` mode people who complete a prize on the same number take the next positions one after the other. They do NOT share. So R4 (same call = equal shares), the popup sentence "shared with N other player(s)" and the sheet's "each (shared by N)" cannot happen in a console game. Evidence: `gate-lock.test.ts` "OBSERVATION ... P-4" (saves a plan exactly as the console does and reads `ties: "next"` from the public info); `config.test`-style check in `prizes-190.test.ts` last test. The engine, popup and sheet DO work when `ties` is `share` (all R4 tests use it). Decision needed: the console sends `ties: "share"` with the plan (or the default changes).

**P-5 (MEDIUM) A negative budget is accepted.** `num()` in `zc-flow-prizes.js` keeps only digits and dots, so `-500` becomes `500`: no block, a plan for 500 is saved. R3 says negative blocks. Evidence: red test "PRODUCT BUG P-5". (Same for a Manual amount `-5`: saved as 5.)

**P-8 (MEDIUM) Small budgets are refused by the server with a generic message.** The console shows only a hint ("never a block") but the server (`cleanPlan`) refuses any prize below 1, and a budget under about 40 units gives some prize 0 (budget 7, 1 ticket, 6 prizes: Line 1 = floor(7 x 15 / 100) = 1, Corners = 0). The organizer reads "The prize plan needs a budget, a prize count and, for each prize, a whole amount above 0 (at most 30 prizes)." Evidence: red test "PRODUCT BUG P-8" (budgets 1, 7, 39 on four plans), and the wire matrix (422 refused plans, all below 40). The planner and the server disagree about what a valid plan is.

**P-3 (MEDIUM) The organizer cannot override the winner of a per-ticket prize.** `overridePrize` in `winners.ts` accepts only `^[a-z0-9]{2,12}$` as the prize name; `top@1` has an `@`. The call answers 400 "Choose the prize and who gets it." The same call for a plain `top` works. Evidence: red test "PRODUCT BUG P-3" and the passing baseline test next to it. (Voting, listing and the "given" tick for `top@1` all work.)

Low / cosmetic (tests are `test.failing`, so they turn red the day the bug is fixed):
- **P-7** The prize sheet calls a single-position prize "1st Line 1", "1st Corners", "1st Super Bumper" (it passes `ofTotal = 2` to the label function). The console table says "Line 1", "Corners". Fix: use the same count rule.
- **P-9** A per-ticket prize with several positions reads "1st Ticket 1: Full house" in the winner popup; the planner's own wording is "Ticket 1: 1st Full House".
- **P-1** `validateManual` says "Prize 1 is listed twice." for an id such as `constructor` (it uses a plain object as a set). Not reachable from the console (ids come from a fixed list).
- **P-2** `validateManual` accepts `Infinity` as an amount. Not reachable from the console; the server refuses it.
- **G-1** The create route `POST /api/z` takes a `prizePlan` and per-ticket lines for a game created before `PRIZES_FROM_MS`; only the settings route is gated. After the real constant is set at deploy this window is closed, but the gate is not in one place.
- The winner popup shows the name twice ("Congratulations, you won X" and "You won X. Your organizer will give you ..."). Both lines are in the frozen wording as the coder wrote it; I only note it.
- In Manual the console can offer at most 10 prizes (1 ticket) or 22 (2 tickets), so the "30" limit is real in the planner and the server but cannot be reached from the screen.

## Things I could not verify (read before you trust the green)
- **The frozen wording.** `docs/TEST_HANDOFF.md` says "frozen text" for the console footer note and the players' "About the prizes" paragraph but does not print them, and the handover (note 370) is not in the repo. I pinned the strings exactly as they are in `zc-flow-prizes.js` and `z.js`. They are tested for being verbatim and for staying that way, **not** for matching the frozen text. Someone with note 370 must compare the two sentences. They are quoted in `player.test.ts` (`ABOUT`) and `console-step3.test.ts` (`FOOT`, `BLANK`).
- R6 says "winner IDs". The sheet shows **ticket numbers** (that is what the handoff says and what the prizes list holds), not employee IDs or names.
- `PRIZES_FROM_MS` is the coder's placeholder (2 Nov 2026 00:00 UTC). The tests derive both sides from the exported constant except one test that pins its current value; when the release session sets the deploy instant, that one test (`PRIZES_FROM_MS is a fixed instant ...`) must be updated.
- Tests of the console and the player page run in a DOM (happy-dom), not in a real browser. The player page tests write the plan straight into the stored game (the settings route correctly refuses a plan on the 1 Oct game the shared page helpers use). I did not open a real browser and did not look at the screens.
- For the player pages I check text and HTML for amounts; I did not check images, PDF or emails (the report generator `reportgen.js` was not in scope of the handoff).
- No security test of the new `/prizes` / `override` routes beyond what is listed.

## How to run
```
cd apps/web && bun test --isolate test/prizes-190            # planner, console, player, sheet, matrix (1,000,000)
cd apps/edge && bun test --isolate test/prizes-190           # gate, lock, wire, leak matrix
cd packages/beacon && bun test --isolate test/prizes-190.test.ts
PRIZE_MATRIX_N=30000 bun tools/matrix/breaks/run-breaks.ts --only P,K,S,Z,EN,GT,MX --no-matrix   # the 57 breaks (about 6 minutes)
```
`PRIZE_MATRIX_N` shortens the matrix (the break runner uses 30,000); the default is 1,000,000.

---

# TESTER_REPORT: Tambola rc 1.8.5, final test branch `tests/tambola-rc185-final-2026-10-30`

- Base: `origin/tests/tambola-rc185-merged-2026-10-30` (cfc416a) + merge of `origin/rc/tambola-1.8.5` (e2234f5). The merge had no conflicts.
- Only test files, test helpers, declaration files for test tools, the break table, and this report were changed. **No product file differs from rc e2234f5** (checked with `git diff origin/rc/tambola-1.8.5` on `apps/*/src`, `apps/web/public`, `packages/*/src`: empty).
- All runs were made in this cloud sandbox, `bun test --isolate <folder>`, one folder at a time. Counts below are copied from the last summary lines of the final run (logs: `/tmp/claude-0/final/*.txt`, not committed).

## 1. Result in one view

| Check | Result |
|---|---|
| `bun run typecheck` | **exit 0, 0 errors** (was 179 on the merged tree) |
| Folders | 7 of 8 green. 2 red tests in apps/edge and 1 in apps/web, all three are product defects (section 5). They are red on purpose. |
| New break checks for fixes A to H | 29 of 29 proven red then green (section 4) |
| New cleaning matrix | **1,122,798 distinct inputs**, 20,216,310 checks, 0 failures |

## 2. Counts (final run)

| Folder | Pass | Fail | Skip |
|---|---|---|---|
| packages/shared | 12 | 0 | 0 |
| packages/engine | 65 | 0 | 0 |
| packages/beacon | 359 | 0 | 0 |
| packages/billing | 26 | 0 | 0 |
| tools/control-worker | 1 | 0 | 0 |
| apps/edge | 2183 | **2** | 1 |
| apps/server | 9 | 0 | 0 |
| apps/web | 924 | **1** | 0 |
| tools/matrix (extra, not in your list) | 7 | 0 | 0 |

The 3 failing tests, by name:
- apps/edge: `D: PATCH settings idKind is locked once people exist > PRODUCT BUG D1 ...` (product defect D1)
- apps/edge: `G: GET /api/z/<id>/info carries endedAtMs ... > PRODUCT BUG G1 ...` (product defect G1)
- apps/web: `guide.test.ts > every message the server can send has a guide` (product defect D2: the new 409 message has no guide entry)

Noise, not a failure: `pdf-assets.test.ts` prints `ECONNREFUSED 127.0.0.1:80` and a Bun banner three times. That test passes. It was there before my changes.

## 3. Typecheck: 179 to 0

The merged tree had 179 errors (you counted 181; the 2 product errors are fixed in rc). All fixed in test code, no `@ts-ignore`, no new `any`.

| Where | Errors | Cause and fix |
|---|---|---|
| apps/edge/test (143 of 149) | 143 | One root cause: `keyH` in `param-harness.ts` returned `{ "x-organizer": string } \| {}`. It now returns `Record<string, string>`. This one line cleared 143 errors in 11 files. |
| apps/edge/test (rest) | 6 | `checkin.test.ts`: `.get()` is `unknown`, now cast to `{ c: number }`. `rehearsal.test.ts`: the `pids` record is now held in local typed arrays. `report-email.test.ts`: array lookups got `!`. |
| packages/beacon/test | 13 | `beat.test.ts` (2): `MSG[...]!`. `control.test.ts` (1): the brand break is a typed variable (the real shape carries `kind` and `title`; `GameOpts` does not name them). `last-number-claim.test.ts` (2): `ticket!`. `phone-cost.test.ts` (4): removed the `as any` that hid the callback types. `phone-runtime.test.ts` (3): wrong callback signature. `real-housie.test.ts` (1): the result union is narrowed before `.error` and `.late` are read (was `as any`). |
| tools/sim2/scenarios/matrix | 17 | New declaration files `lib.d.mts`, `gen-modes.d.mts`, `gen-permissions.d.mts` (real types: `Scenario`, `T`, `Rng`, `Clock`, `Mailbox`, `A.sql`). The four runners now import `lib.mjs` and the generators with those types (the `: any` on those imports is gone). Plus `noUncheckedIndexedAccess` fixes. |

Not changed: older explicit `any` annotations in the sim2 runners (`scenarios: any[]`, `catch (e: any)`). They give no error and I did not widen the job. `apps/web/test` is not in `tsconfig.json`'s `include`, so the typecheck does not look at it.

No error was in product code.

## 4. Fixes A to H: tests and break checks (red then green)

Every break runs in a temp copy of the repo, with the repo untouched. Tool: `bun tools/matrix/breaks/run-breaks.ts --only <ids>`. Table: `tools/matrix/breaks/table.ts` (new entries A1 to H3 and M01 to M11). Final run result: **edge 12 of 12 proven, web 17 of 17 proven, matrix 11 of 11 proven**, every restore byte for byte.

Test files: `apps/edge/test/rc185/audit-fixes.test.ts` (A, D, G server side), `apps/web/test/rc185/audit-fixes.test.ts` (B, C, E, F, G page, H), changed `apps/web/test/rc185/fix-round1.test.ts` (old C02).

| Fix | What the tests check | Break (one change in the product copy) | Baseline | Broken | 
|---|---|---|---|---|
| A | `/api/host/setup/email`: `john doe@acme.com`, full-width `＠` with a space, tab, NBSP, `john@acme .com` all 400 "Please enter a valid e-mail address.", no code made, no mail. `johndoe@acme.com` accepted, one mail. End spaces, capitals, full-width `＠` accepted. Address on file (kept in another form) is compared in the same form. The code is stored under the account hash. Participant Email IDs still remove inner spaces. | A1 glue the space in the route | green | RED (2 fail) |
| | | A2 no NFKC and no tidy in the route | green | RED (1) |
| | | A3 `emailHashOf` glues the space | green | RED (1) |
| | | A4 on-file address compared raw | green | RED (1) |
| | | A5 participant Email ID keeps inner space | green | RED (1) |
| B | `guide.js` has no `${` and no `idWord(`. The six sentences the **real Worker** sends (id / either / both, employee ID and Email ID) go to the guide finder: all matched, each with title and steps. Email sentences get the Email ID card, employee sentences the employee card. An unrelated "Enter your ..." is not swallowed. Old C02 in `fix-round1.test.ts` now does the same with the real strings. `guide.test.ts` expands `${idWord(vf.idKind)}` into both real words before it looks them up. | B1 put `${idWord(...)}` back | green | RED (1) |
| | | B2 remove the two Email ID fragments | green | RED (1) |
| | | B3 remove the employee "mobile number or" fragment | green | RED (1) |
| | | C02 (old table entry, now plain text) remove one fragment | green | RED (3) |
| C | Own card, title "This game asks for an employee ID, not an email", steps say type your employee ID, letters and numbers, "Do not type your email", no step starts "Type your email", points at `#emp`. The Email ID card no longer claims that sentence. The sentence is the one the real Worker sends. | C1 card tells the person to type an email | green | RED (1) |
| | | C2 card removed | green | RED (2) |
| D | Nobody listed or joined: both ways allowed. A person joined: 409 `idkind-locked` with the plain sentence, kind unchanged, both ways. Same kind again and other settings: allowed. Old game (before `EMP_CLEAN_FROM_MS`): refused to email once people exist, allowed before. Open game, joined by mobile: locked. | D1 lock removed | green | RED (1) |
| | | D2 lock even with nobody | green | RED (1) |
| | | D3 lock even for the same kind | green | RED (1) |
| | | D4 other message text | green | RED (1) |
| E | In id, either and both modes, for employee and Email ID games (6 cases): `#empread` is the element right after `#emp`, one element with that id, `aria-live="polite"`, `aria-describedby`, same node updated while typing, none under the phone box. Mobile game: none. An email typed in an employee-ID box: empty hint. | E1 no aria-live | green | RED (6) |
| | | E2 another element between box and hint | green | RED (6) |
| | | E3 second `#empread` in the phone box | green | RED (7) |
| F | Calm page (30+ minutes after the game, link opened fresh): open game says "played in groups, with a link from the organizer: company teams and their families"; invitation game says "in close groups, by invitation only: ...". Not mixed. | F1 always "invitation" | green | RED (1) |
| | | F2 always "open" | green | RED (1) |
| G server | No `endedAtMs` on a fresh game. Ended by the phones' vote: the vote time. Ended by the schedule: the scheduled end. Ended by the organizer (erase): that moment. Never changes after (more votes, ticks, a second erase). Cancelled: absent. Payload adds only `endedAtMs` (plus the existing `erasureMs`), no name, mobile, e-mail, money. | G1 field removed from `/info` | green | RED (3) |
| | | G2 cancelled games carry it | green | RED (1) |
| | | G3 extra fields in the payload | green | RED (1) |
| G page | `endMsOf` uses `endedAtMs` when present (later and earlier than the estimate; the 30-minute edge follows it) and falls back to the old estimate without it. Source pins for the "kept once" line. | G4 ignore `endedAtMs` | green | RED (4) |
| | | G5 never read it from `/info` | green | RED (4) |
| | | G6 no fallback | green | RED (1) |
| H | Step 2 of the new console, run against a fake `/summary`: group shown for verify `id`, `either`, `both` with the true copy (and not the old "one plain form" text); not shown for `mobile`, for an old game without `verify`, when the call fails, or with no saved game; the summary is read once (also while the first call is still open); choosing Email ID sends one `PATCH {idKind:"email"}`. | H1 group always shown | green | RED (5) |
| | | H2 old copy | green | RED (3) |
| | | H3 read again at every draw | green | RED (1) |

Fix proofs for the 3 red tests: `bun tools/matrix/breaks/fix-proofs.ts` puts the smallest possible fix into a temp copy and the red test must turn green. Result: **D1 red then green (1 pass), G1 red then green (1 pass), D2 red then green (13 pass in guide.test)**. This shows the tests are right. It does not say the fixes I tried are the final fixes.

## 5. Matrices

### Existing matrices, exact counts (from the logs of this run)
| Matrix | Count |
|---|---|
| `bun tools/matrix/run.ts` (full, run today) | **6,422,528** scenarios, 6,422,528 distinct, 0 failures, 200 real-Worker checks, 112.8 s |
| `apps/web/test/zc-flow-scenarios.test.ts` | **3,686,400** scenarios run, 0 failed, 245,760 email checks (the "3.69M") |
| `apps/web/test/player-matrix.test.ts` | 460,800 permutations, 0 failed |
| `apps/edge/test/empid.test.ts` matrix | 200 IDs x 28 formats = 5,600 inputs, 16,800 checks, 0 failed |
| `tools/sim2/scenarios/matrix` (`--seed 1 --list`, counted only, not run: they need the sim server) | run.ts 4,659; run-modes 124; run-organizer 3,933; run-permissions 9,841 |

### New: streamed ID / e-mail cleaning matrix
`bun tools/matrix/id-clean.ts` (small mode as a test: `tools/matrix/id-clean.test.ts`, 20,000 inputs).

```
dimensions: 62 cores (42 employee IDs + 20 e-mail addresses) x 65 spellings x 19 prefixes x 19 suffixes = 1,454,830 combinations
inputs generated:    1,454,830
distinct inputs run: 1,122,798   (332,032 repeats were skipped and never counted)
checks made:         20,216,310
real-Worker inputs:  1,581 (1,203 list-upload + join games, 378 sign-ups through /api/start)
real join-page inputs: 2,406 (the same 1,203 texts typed into two games, employee ID and Email ID)
failures:            0
time: 115.6 s
```
Exact number run: **1,122,798 distinct inputs**. Distinct is proven with a set of every text seen, not assumed.

Coverage among the distinct inputs: plain ASCII 251,835; full-width 170,912; sharp s 38,627; dashes of every kind 371,961; Devanagari or Arabic digits 51,984; compatibility letters (bold, circled, ligature, roman numeral, kg sign) 148,732; inner space (space, tab, newline, NBSP, ideographic, thin) 218,485; zero-width and invisible 311,686; emoji 135,595; contains an at-sign (plain, full-width, small) 353,741; very long (60+ characters) 75,380; more than 30 after cleaning 82,649; empty after cleaning 15,896; blank 727.

Rules checked on every input, against an oracle written separately from the product (`tools/matrix/oracle.ts` plus new account-email rule):
- R1 employee-ID game (new): result equals the oracle; cleaning twice changes nothing.
- R2 **an employee-ID game never turns an email into letters**: every text with an at-sign after NFKC is refused, and every answer is null, empty or 1 to 30 of A-Z 0-9. Also checked on the real Worker (list upload and join) and on the real join page (hint stays empty).
- R3 old games: equal to the oracle **and equal to the 1.8.3 function copied word for word** (so stored hashes still match).
- R4 participant Email ID: equal to the oracle, lower case, no space or zero-width character, cleaning twice changes nothing.
- R5 account e-mail: accepted exactly when the oracle accepts (the work-e-mail regex is read from `worker.ts` itself); an inner space is always refused; ends, capitals and full-width tidied. 378 sample inputs (the ones with an at-sign) went through the real `/api/start`.
- R6 an Email ID is not cleaned like an employee ID and the reverse.

Deliberate-break proof for the matrix: 11 product changes (M01 to M11) each turn the small matrix red: account e-mail glued, no NFKC, no trim; email turned into letters; old game on the new rule; Email ID not lower case; Email ID keeps spaces; sharp s becomes SS; Devanagari digit kept; cap 31; dash kept. All 11 proven red then green.

## 6. Product problems (evidence, not fixed)

1. **G1: `endedAtMs` is present before the game has ended, and it moves.** `lifecycleTick` writes a `life` row with `end_src='schedule'` from its first pass (`lifecycle.ts:425-427`, re-read every tick), and `endedAtOf` (`worker.ts:142`) returns every row that is not `cancel`. Real Worker, paid game, one person listed and joined: before any tick `/info` has no `endedAtMs`; after one `lifecycleTick` a second after the game was made it says `1793877114000` (the scheduled end, about 12 minutes after the start, an hour in the future); after adding a speech break it says `1793877174000`. The page keeps the first value for ever (`!INFO.endedAtMs`), so a break or pause added later leaves the phone with a wrong end time and the 30-minute "Game completed" switch can come too early. The spec says set once at the end, not by pauses or breaks, never changes. Test: `PRODUCT BUG G1`. A smallest fix in a temp copy (do not return rows with `end_src='schedule'`) makes it green.
2. **D1: a person who is only listed does not lock `idKind`.** The check counts `participant` rows only (`worker.ts:2263`); listed people are in `person`. Real Worker: one person listed, nobody joined: `PATCH {idKind:"email"}` answers 200, so the listed employee IDs are now read as Email IDs. The refusal sentence itself says "You already have people listed". Spec D says "listed or joined". Test: `PRODUCT BUG D1`. Smallest fix in a temp copy: count `person` rows too, green.
3. **D2: the new refusal has no guide entry.** `You already have people listed. Start a new game to use a different kind of ID.` (409) is in `worker.ts:2263`; the existing guide test (every server message has a guide) names it. Red until `guide.js` gets an entry. Smallest fix in a temp copy: green.
4. **Minor, hint and refusal disagree for a too-long ID.** In a new employee-ID game, typing 31 letters shows "The system will read this as AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" (31), and the join then answers 400 "...may be up to 30 characters once cleaned." Checked with the real page and Worker. No test is red for it (the matrix encodes the current behaviour). Owner decision: hide the hint, or say it is too long.
5. **Not verified, a question for the coder.** `z.js:1051` shows the check-in screen to any phone with a ticket that never marked itself present, before the "Game completed" calm page is considered (`completedLate` is only reached in `playView`). A person who joined and never checked in, opening the page after the game, may not see the calm page. I could not confirm what the check-in call answers after the game ends, so I report it as a question, not a defect.

Fixed in rc and now green (was red before): the old "PRODUCT BUG B1" test (hint turning an email into letters in an employee-ID box). The product now shows no hint for an address.

## 7. Other test changes (and why)

- `apps/edge/test/empid.test.ts` and `rc185/worker-rules.test.ts`: both expected an e-mail with an inner space to hash the same as the clean one. After fix A the hash is the account form, where an inner space is never glued. The tests now say: participant forms (`normEmail`, `cleanEmail`) are equal for every spelling; the hash is equal for ends, tab, newline and full-width spellings and **different** for inner-space spellings.
- `apps/web/test/zc-default-182.test.ts` "published and paid game shows the dashboard": failed 1 of 3 runs on the unchanged code (the rehearsal cards come from their own call and the test read the page first). Now it waits for `Start this rehearsal` too. 5 of 5 runs green after.
- `apps/web/test/guide.test.ts`: the scan expands `${idWord(vf.idKind)}` into both real sentences. Before, the template text normalised to "enter your" and matched almost anything.
- `apps/edge/test/rc185/helpers.ts`: `World` has `raw` (the database) and an optional strict-Hosts mode (the real first-open rule).
- Tests that compare page elements now compare ids or booleans. A failed `toBe` on a DOM node printed the whole page and ran the break runner out of memory.

## 8. What I did not do

- I did not rerun the whole old break table (79 entries, many are slow web ones). I ran all new entries (A to H, M01 to M11, C02) in the final state of the tests. Older entries (B01 to B22, W01 to W15, C01, C03) were not rerun here.
- The four sim2 matrices were counted, not run.
- I changed no product file.
