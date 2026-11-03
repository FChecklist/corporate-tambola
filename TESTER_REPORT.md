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
