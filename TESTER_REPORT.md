# TESTER_REPORT: Tambola 1.9.0 prizes, retest after fix round 1 (branch `tests/tambola-1.9.0-prizes-v2-2026-10-30`)

Base: `origin/feat/tambola-1.9.0-prizes` (0f5a9f7, includes rc/tambola-1.8.5 f9280c8) + merge of `origin/tests/tambola-1.9.0-prizes-2026-10-30` (4267648) + merge of `origin/tests/tambola-rc185-final3-2026-10-30` (cfe4912). Only conflict: this file (both reports are kept; the 1.8.5 one is below the line). **No product file was changed**: only test files, the break table and this report.

## Short answer
- **All 8 fixes work as the coder described** (P-6, P-4, P-5, P-8, P-3, P-7, P-9, G-1) and the new winner column (R6) works and does not leak. Every earlier red test is green; the 5 `test.failing` tests of P-3/P-7/P-9/G-1/P-8 are now normal tests. Two `test.failing` stay (P-1, P-2: unreachable from the console, not fixed).
- **Matrix: 1,000,000 scenarios run, 0 failures.** Typecheck: 0 errors.
- **No new blocking product bug.** Three small things to decide (below): P-10 (a currency sign typed in the budget box now blocks with a misleading sentence), the dash character in the winner column, and P-4 is fixed in the console only.
- Two failures in the full runs are **not from 1.9.0**: one flaky old test (apps/edge UC-32) and one old test that pinned the removed popup line (fixed by me, see below).

## Counts (each folder run once, one at a time, `bun test --isolate`; numbers copied from the last summary lines)
| Folder | Pass | Fail | Skip | Notes |
|---|---|---|---|---|
| packages/shared | 12 | 0 | | |
| packages/engine | 65 | 0 | | |
| packages/beacon | 396 | 0 | | 37 in `prizes-190.test.ts` (8 new for P-4 sharing) |
| packages/billing | 26 | 0 | | |
| tools/control-worker | 1 | 0 | | |
| apps/edge | 2226 | **1** | 1 | `usecases.test.ts` UC-32 "a crowd arriving at the same instant ...": **flaky, not 1.9.0**. It assumes phone 1 is among the 5 of 40 simultaneous joiners that get a place; which 5 win is random. Alone: 58/58, 58/58, then 57/58 (3 runs). File and code untouched by 1.9.0. |
| apps/server | 9 | 0 | | |
| apps/web | 1043 | **1** | | `pages.test.ts` "a winner sees Hurray ..." asserted the line "Congratulations, you won", which P-9 removed on purpose. I changed that one assertion (test only); `pages.test.ts` alone then ran 143 pass, 0 fail. The full apps/web folder was **not** re-run after that edit, so its final state is 1044 pass / 0 fail by that one file re-run, not by a second full run. |
| repo typecheck (`bun run typecheck`) | | **0 errors** | | exit 0 (the 181 old errors of the first report are gone with the rc185 merge; my new files compile) |

The 1,000,000-scenario matrix line (from the apps/web run): `MATRIX scenarios run: 1000000 | checks: 15437501 | claims dealt: 11999319 | positions won: 2928540 | shared prizes: 1778016 (max 6 sharing) | scenarios with no winner: 5776 | per plan: 125000 x 8`. **Exact count: 1,000,000. Failures: 0.** The 4,039-plan wire matrix (`matrix-wire.test.ts`) is part of apps/edge and passed. Its expectation was already "refused iff a prize rounds to 0", so the P-8 fix did not change it.

## What changed in the tests (earlier red tests -> now)
| Finding | Before | Now |
|---|---|---|
| P-6 Manual could not be saved | 2 red | green, renamed "P-6 (fixed)": valid list saves (PATCH mode manual, step done); one message at a time; amounts/budget sum; engine-valid |
| P-5 negative budget | red | green; widened to 8 spellings (`-500`, `- 500`, `500-`, `5a00`, `-0.5`, `1e5`, `+500`, `50 000 rupees`) and to Manual amounts (`-5`, `5-`, `5x`, `1e3`) |
| P-4 sharing | observation (`ties: next`) | green: every console save (8 plans, Auto and Manual) sends `ties: "share"`; stored and public `ties` is `share`. **New** beacon tests (below). The old observation is kept for a body WITHOUT ties (server default is still `next`) |
| P-8 small budget | red | console: blocks with "Your budget is too small for N prizes. Choose fewer prizes or a bigger budget." (budgets 1 and 7 on 4 plans; live hint; chips/bigger budget unblock; blocks **exactly** when the planner has a 0 amount, 8 plans x 10 budgets). Server: still refuses a 0 prize; test now "server and planner agree" over 8 plans x 26 budgets |
| P-3 override of `top@1` | red | green; widened: `top@2`, `early5@1`, `full@1`, `full@2` work; `top@3 top@0 top@ @1 TOP@1 top@1@1 top@12 "top @1" t@1` still 400 |
| P-7 sheet labels | test.failing | normal test; plus "1st/2nd Full House" when the plan has 2 positions, none when 1 |
| P-9 popup | test.failing + wording | normal tests: "Ticket 1: 1st Full house", "Ticket 1: 2nd ...", never "1st Ticket 1"; one "You won" line, no "Congratulations, you won" |
| G-1 create route | test.failing | normal: `POST /api/z` gives 409 `prizes-old-game` with the same sentence for plan+lines, plan only, ticket_1 only, ticket_2 only; nothing stored; ordinary old create works; boundary FROM-1 refused, FROM accepted |
| PRIZES_FROM_MS pin | pinned value | pin kept with a note ("when the release session fills the real instant, change ONLY this value") + a value-independent test (integer, 2026 or later, `prizesOn` is `>=`, null-safe). The constant is still the placeholder 2026-11-02 00:00 UTC |

## New tests
- **P-4 sharing** (`packages/beacon/test/prizes-190.test.ts`, 8 tests, game configured exactly as the console saves it, REAL engine, money by my own integer arithmetic): two claims on one number = ONE position, both win, each gets floor(amount/2), leftover to the organizer (1001 between 2 = 500 each, 1 kept); share x winners + leftover = amount and leftover < winners for every real group size (2, 3, ...); dense ranking (next group takes the next ordinal, no gap, nobody twice); a lone winner then a sharing group; the same claims WITHOUT ties do not share (1st and 2nd one after the other); a late claim does not join the share.
- **Winner column, sheet** (`apps/web/test/prizes-190/sheet.test.ts`, +9): all parts, Email ID in the ID place, only the parts that exist (6 combinations), several winners ("Ticket 7 - E7, Ravi, 111; Ticket 9 - Meena; Ticket 11 - E11"), the right person on the right prize (1st/2nd, per ticket), a seat listed twice, text not HTML, unwon row, only the organizer routes are read.
- **Winner column, wire and privacy** (`apps/edge/test/prizes-190/winner-column.test.ts`, 8 tests, real Worker): `/prizes` carries empId/name/phone/seat for Employee ID and Email ID games, no `empId` key when none, empty phone when none, corrected name wins and ID stays; **no ID, name or mobile in** public `/info` (also with a wrong key), anonymous summary, results, game log, another phone's my-prizes, the next player's join answer, claims answers, people list; `/prizes` without the organizer key is 401/403 and empty; the winner's own phone sees name and mobile but not the ID, another phone gets 403; the outside-AI branch lists no name/phone/ID (source pin).
- **P-8 small budget**: console-step3 (+5) and wire (+2).
- Per file after this round: console-step3 46, sheet 19, player 13, wire 12, winner-column 8 (counts from the runs of the single files).

## Deliberate breaks (red then green)
Full run: `PRIZE_MATRIX_N=30000 bun tools/matrix/breaks/run-breaks.ts --only P,K,S,Z,EN,GT,MX --no-matrix`: last line: `79 breaks, 79 proven (green -> red -> restored), 0 problem(s). Repo status unchanged: NO !!`. All 79 turned red and were restored byte for byte. **The "NO" is my doing, not a product change**: I edited the report and made two commits while the 25-minute run was going, so the runner saw a different `git status` at the end. `git diff` against the feat branch shows no product file changed (only tests, the break table and docs). The earlier round had 57; the 22 new ones in the selected prefixes make 79.
New breaks of this round (29, all proven): K10 P-6 empty problem, K11 ties not sent, K12 minus ignored, K13 small budget not blocked, K14 small-budget sentence, K15 live hint, S04 no ID in sheet, S05 no mobile, S06 no "Ticket" word, S07 label count fixed 2, S08 header, S09 blank parts shown, Z05 duplicate popup line back, Z06 ordinal before ticket, GT11 create route ungated, GT12 gate ignores ticket lines, GT13 override refuses `@1`, GT14 override takes `@3`, GT15 server accepts a 0 prize, GT16 stored tie rule forced to next, EN13 no sharing in the engine, EN14 gap in dense ranking, WC01 `/prizes` without ID, WC02 my-prizes leaks ID, WC03 `/prizes` open to everybody, WC04 public info leaks a winner detail. GT02 (old game accepted) was re-pointed to the new one-place gate `prizesRefusal`. The WC breaks start with `WC`, which the requested `--only` list does not select: I ran them separately (`--only WC`): 4/4 proven. Evidence file of the first round: `tools/matrix/breaks/evidence-1.9.0.txt` (unchanged).

## Things that still look like product issues (not fixed by me)
1. **P-10 (LOW, new by the P-5 fix).** A currency sign typed INSIDE the budget box, for example `₹ 25000`, now blocks Next with "Enter your budget, or choose Manual to set your prizes yourself." Before the fix the sign was dropped and 25000 was saved. The sentence does not say why (the box does not look blank). A comma or space is fine (`1,00,000`). Test: "OBSERVATION P-10". Decision: accept signs, or say "Type numbers only".
2. **Winner column dash.** The task text writes "Ticket N - ID, name, mobile" with a hyphen; the product joins with an EN DASH (`Ticket 3 – E1001, Asha Rao, 9876543210`, `zc-flow-prizes.js`). The tests pin the en dash. If the hyphen is wanted it is a one-character product change.
3. **P-4 is fixed in the console only.** The server default is still `ties: "next"` (`defaultCfg`), so a client that does not send `ties` (anything but the new console, or an API user) gets a game where same-call winners do NOT share. Pinned by two tests (observation).
4. **P-1 and P-2 (cosmetic, not fixed)**: `validateManual` says "Prize 1 is listed twice" for an id like `constructor`, and accepts `Infinity`. Still `test.failing`; not reachable from the console.
5. Names differ in style between screens ("Top line" in the popup, "Top Line" in the prize panel, "Early Five" for players and "Early 5" in the console). Old naming, not touched by the fix round; noted only.

## Still not verified (unchanged from round 1)
- The frozen wording (footer note, "About the prizes") is pinned as the coder wrote it, not compared with handover note 370 (not in the repo).
- Console, player and sheet tests run in a DOM (happy-dom), not a real browser; no screens were looked at; emails/PDF/report generator out of scope.
- The real `PRIZES_FROM_MS` is not set yet; only the placeholder is tested (the one pin test must change then).

## How to run
```
cd apps/web && bun test --isolate test/prizes-190            # planner, console, player, sheet, matrix (1,000,000)
cd apps/edge && bun test --isolate test/prizes-190           # gate, lock, wire, winner column, leak matrix
cd packages/beacon && bun test --isolate test/prizes-190.test.ts
PRIZE_MATRIX_N=30000 bun tools/matrix/breaks/run-breaks.ts --only P,K,S,Z,EN,GT,MX --no-matrix   # the breaks (WC: --only WC)
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
