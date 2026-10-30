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
