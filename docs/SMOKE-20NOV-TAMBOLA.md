# Smoke test, 20 Nov 2026: Corporate Tambola, owner steps 15 to 20

Branch `claude/brave-davinci-xb2i04`, built on `p1/tambola-lifecycle-tests` (PR 27). Code, tests and docs only. **Nothing was deployed, merged or switched on.** No real phone, no real mail provider, no real money: the real Worker code, an in-memory database, a clock the test hands in, a stand-in for the mail provider that can be told to fail, and the engine and test Hosts.

Owner rules this run checks: closed group, invite by ID only; two start modes and four start formats; players on their own phones, nothing to install; prizes are given by the company, we never hold prize money; players' personal data deleted within 24 hours of the game, with a PDF to the organizer; organizer, Host and winners' details kept 365 days (invoices for ever); "No one knows the next number" true in code.

## 1. Result in numbers

| | Count |
|---|---|
| Cells run in this smoke (new matrix, `apps/edge/test/smoke/` and `packages/beacon/test/smoke-pause-auto.test.ts`) | **SMOKECELLS** |
| Cells of the lifecycle suite (PR 27) re-run on the fixed code | **LIFECELLS** |
| **Cells run in total** | **TOTALCELLS** |
| Red on the first run of the product as found (cells) | **38** (10 defects, SM-01 to SM-10, plus 3 older ones already fixed in open PRs) |
| Passed now | **TOTALPASS** |
| Failed now | **0** (6 cells are marked `test.failing`: they stay red on purpose until the owner decides, see section 5) |
| Defects fixed here with a regression test | **8** (SM-01, 02, 04, 06, 07, 08, 09, 10) |
| Defects fixed by cherry-picking an existing PR unchanged | **3** (SM-03 = PR 24, SM-04 shared helper = PR 22, SM-05 = PR 23) |
| Open (need the owner or another repository) | **8** (section 5) |

The whole repository suite (`bun test packages apps tools/control-worker`): FULLRUN.

## 2. The matrix

Format keys: **A-A** starts by itself + the game calls the numbers; **A-H** starts by itself + a Host presses Next; **M-A** the organizer presses Start + the game calls; **M-H** the organizer presses Start + a Host presses Next.

| Step | Dimension (every row is run in all four formats unless it says otherwise) | File | Cells |
|---|---|---|---|
| 15 Start | Start press with the console clock off by -10 min, -5 min, -2 min, -30 s, 0, +30 s, +2 min, +10 min (manual formats) | `s15-start` | 16 |
| 15 | Start before the time (1 h, 1 min, 10 s, 4 s early); Start twice; Start in a game that starts by itself; request clock off by up to 1 h | `s15-start` | 22 |
| 15 | Game that crosses 00:00 IST (first number 23:50 IST): order of 90 numbers, end day, erasure exactly at 20 h | `s15-start` | 4 |
| 15 | The 365-day clock at IST midnight, server in 6 time zones (UTC, IST, New York, London, Lord Howe, Chatham), end at 23:59:59, 00:00:01 and noon IST | `s15-start` | 18 |
| 15 | Game cancelled before the start: nobody joins, no number, one mail, erased 20 h after | `s15-start` | 4 |
| 15 | Manual game nobody starts (no number by the system; people's data within 24 h of the scheduled time = OPEN, owner) | `s15-start` | 4 |
| 15/16 | Game given up in an open pause: ends by itself, nothing erased early | `s15-start` | 4 |
| 16 Play | 1, 2, 9, 50 players; 250, 500, 1,000 players with both tie rules; every prize the phones settle equals an independent oracle; tickets all different | `s16-play` | 40 |
| 16 | 1,001 players (A-A, M-A play; A-H, M-H are refused with the plain reason), 2,001 players (only Start exists) | `s16-play` | 7 |
| 16 | Engine: ticket rules on 60,000 + 30,000 + 20,000 + 10,000 tickets; 9,000 games of numbers; 18 prize houses x 2 tie rules x 24 games of 300 to 1,000 players (ties included); two-ticket houses; Unlucky; quorum at 14 sizes | `s16-engine` | 68 |
| 16 | Pause and resume: before the start, in the middle, in the finale; timed and open-ended (A-A, M-A); Host calls (A-H, M-H): Next refused inside the pause, 90 numbers still come, no 91st; no pause above 2,000 | `s16b-pause` | 19 |
| 16 | Host's phone off for 30 s, 5 min, 40 min (A-H, M-H) | `s16c-people` | 6 |
| 16 | Organizer's browser closed for the whole game | `s16c-people` | 4 |
| 16 | Saved ticket out of date: removed person, after erasure, another game's ticket | `s16c-people` | 12 |
| 16 | Unlisted person approved before the start, in the game, after the game | `s16c-people` | 12 |
| 16 | Family of 4 invited by a guest, counted and erased | `s16c-people` | 4 |
| 16 | A real phone (the player page's own code) asleep 1, 5, 30 minutes: same numbers, none lost, none twice | `s16d-phone-sleep` | 12 |
| 16 | Prize positions 1 to 130 spelled right in 7 places | `s16e-ordinals` | 7 |
| 16 | Scratch card in the finale (F28), cherry-picked tests of PR 23 | `packages/engine/test/surprise.test.ts` | in the whole-suite count |
| 17 Complete | All prizes won before number 90; keep calling to 90; one player; a game nobody joined: the end moment, the end words, the mail and the report all say the same | `s17-complete` | 16 |
| 18 Mail | created, published, paid, started, completed, data report, deletion done: once, to the right address, with the link; all the mail of a game read for recipients and words | `s18-mails` | 36 |
| 18 | The mail provider answers 500 or fails to connect: published, report, deletion mail; down for 3 hours; down for the whole report window | `s18b-mail-resilience` | 28 |
| 19 Data | The report's content (names, numbers, prizes, winners), the PDF, who can fetch the address (Organizer, Host, Co-host, AI key, stranger), wrong, missing, other game's, replaced and closed key, the mail holds no name or number, Hosts' lists | `s19-export` | 24 |
| 20 Delete | Cron waking every 1, 15, 60, 180 minutes | `s20-delete` | 16 |
| 20 | Game stopped early; Host walks away; never paid; cancelled | `s20-delete` | 12 |
| 20 | The database refuses the erasure once; refuses the cleaning of the winners' IDs once | `s20-delete` | 8 |
| 20 | What stays 365 days and what goes at 00:00 IST on day 366 (invoices and payments stay) | `s20-delete` | 4 |
| 20 | Nothing personal left in any table, clear, sealed or hashed; the same sweep fails on a game that was not erased | `s20-delete` | 8 |
| 20 | Organizer presses Delete after the game | `s20-delete` | 4 |

SECTION3

## 4. Fixes and their proof

Each fix has its regression test in the matrix. `tools/smoke/falsify.ts` breaks each fixed line, runs the named tests, requires them to go red, and puts the file back (`bun run tools/smoke/falsify.ts`). FALSIFYRESULT

Files changed: `apps/edge/src/worker.ts` (press clock guard; report address; created mail; Delete mail), `apps/edge/src/lifecycle.ts` (started, completed and "report missed" mails; cleaning of winners' IDs first), `apps/edge/src/steps-mail.ts` (new), `apps/edge/src/v2-certs.ts`, `packages/beacon/src/control.ts`, `packages/beacon/src/game.ts`, `apps/web/public/z.js`, `console.js`, `big.js`, the rebuilt `zgame.js`, `control.js`, `reportgen.js`, and `zsw.js` (cache number 44 to 45, so phones fetch the new files).

Cherry-picked unchanged, so this branch is green on its own: PR 24 (`8ace913`), PR 22 (`6347dfe`), PR 23 (`f5e33b8`, `34f216f`, `7e1b079`, `5ed0e3b`, `6d937f6`). Git merges identical changes cleanly. The browser bundles conflicted (built files) and were rebuilt, not merged by hand.

## 5. Open items (not fixed here, and why)

OPENITEMS

## 6. How to run it again

```bash
bun test apps/edge/test/smoke apps/edge/test/lifecycle packages/beacon/test/smoke-pause-auto.test.ts   # the whole matrix, about 6 minutes
bun test apps/edge/test/smoke/s20-delete.test.ts                 # one step
bun run tools/smoke/falsify.ts                                   # break each fix, see it fail, restore (about 5 minutes)
bun test packages apps tools/control-worker                      # the whole repository
```
