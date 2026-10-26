# Real-site games: final per-game checklist (9 games)

For the boss, who runs the games. Supersedes the table in `LIVE_TEST_MATRIX_2026-10-27.md` where they differ (open audiences cannot produce a "waiting" stranger, so the approval column was corrected). Tool: `tools/browser-tests/ui-game.mjs` (flags: `--tag --login --cap --players --real --mode auto|host --speed 9|12 --aud N --lead --stop`). `--aud` values are the choices of console step 2 "Who is this game for?" (CONFIRMED by the boss from zc.js): 1 = only employees; 2 = employees + friends/family; 3 = a list I choose; 4 = a list + their invites; 5 = anyone with the link; 6 = anyone, employees confirm by employee ID.

Common to every game: account demo1@xyz.in code 123456 (Rs 0 pack up to 1000); `--real 6` real phone-size pages + protocol phones for the rest; fresh `--tag` each run; one game at a time, 5 minutes between games; nothing else running on the laptop; stop and report at once if more than 1% of requests answer 5xx or joins are refused as busy.
S = strangers (two per game, called S1 and S2): a person who is on no list.

| Game | Size | Mode | Audience (aud) | Strangers | Event | Command (ui-game) |
|---|---|---|---|---|---|---|
| L1 | 100 | auto 9 s | employees only, ID (1) | S1 unknown ID waits, Organizer approves; S2 waits, never decided | none | `--tag L1 --cap 100 --players 100 --real 6 --mode auto --speed 9 --aud 1 --lead 12` |
| L2 | 100 | manual | anyone, employees confirm by ID (6) | S1 unknown ID: waits, declined; S2 unknown ID waits, never decided | pause then resume | `--tag L2 --cap 100 --players 100 --real 6 --mode host --aud 6 --lead 12` |
| L3 | 100 | auto 12 s | a list + their invites (4) | none (listed people in at once; one level-1 guest invites 2, one invitee tries to invite and is refused) | end by Organizer | `--tag L3 --cap 100 --players 100 --real 6 --mode auto --speed 12 --aud 4 --lead 12 --stop organizer` |
| L4 | 250 | manual | employees only, ID (1) | none | late join after the first number | `--tag L4 --cap 250 --players 245 --real 6 --mode host --aud 1 --lead 15` (5 listed people join late) |
| L5 | 250 | auto 12 s | a list I choose, mobile (3) | S1 waits, the Host approves; S2 waits, never decided | pause then resume | `--tag L5 --cap 250 --players 250 --real 6 --mode auto --speed 12 --aud 3 --lead 15` |
| L6 | 250 | auto 9 s | anyone, employees confirm by ID (6) | S1 unknown ID waits, declined; S2 waits, never decided | none | `--tag L6 --cap 250 --players 250 --real 6 --mode auto --speed 9 --aud 6 --lead 15` |
| L7 | 500 | auto 12 s | anyone (5) | S1, S2 get a ticket at once (open game) | late join after the first number | `--tag L7 --cap 500 --players 495 --real 6 --mode auto --speed 12 --aud 5 --lead 20` |
| L8 | 500 | auto 9 s | a list + their invites (4) | S1 waits via a Co-host link, the Co-host approves; S2 waits via a Co-host link, declined | end by Organizer | `--tag L8 --cap 500 --players 500 --real 6 --mode auto --speed 9 --aud 4 --lead 20 --stop organizer` |
| L9 | 500 | manual | a list I choose, mobile (3) | none | none | `--tag L9 --cap 500 --players 500 --real 6 --mode host --aud 3 --lead 20` |

Note on counts: `--players` includes the two strangers where a stranger gets a ticket (open or approved). Where a stranger waits or is declined it uses no place.

## Expected counts (assert each; "joined" = tickets issued)

| Game | Tickets joined | Waiting at the start | Admitted later | Declined | Lapsed at the end | Winners / prizes | Timer / press |
|---|---|---|---|---|---|---|---|
| L1 | 100 (98 listed + S1 after approval + 1 filler) | 2 | 1 | 0 | 1 (S2) | classic 7 prizes all awarded, equal split where ties | gap 9.0 s |
| L2 | 100 | 2 | 0 | 1 (S1) | 1 (S2) | as above | Host press -> phone delay recorded |
| L3 | 100 (+ guest + invitee inside the 100) | 0 | 0 | 0 | 0 | prizes awarded before the end; after the end no new prizes | gap 12.0 s, game ends by Organizer press |
| L4 | 250 (245 + 5 late) | 0 | 0 | 0 | 0 | as above; late joiners see earlier numbers | Host press delay |
| L5 | 250 (248 listed + S1) | 2 | 1 | 0 | 1 (S2) | as above | gap 12.0 s |
| L6 | 250 | 2 | 0 | 1 | 1 | as above | gap 9.0 s |
| L7 | 500 (495 + 5 late) incl. S1, S2 | 0 | 0 | 0 | 0 | as above | gap 12.0 s |
| L8 | 500 | 2 | 0 (S1 admitted by Co-host counts: 1) | 1 (S2) | 0 | prizes awarded before the end | gap 9.0 s, ends by Organizer |
| L9 | 500 | 0 | 0 | 0 | 0 | as above | Host press delay |

## Assertions (the 9 pass criteria in `ui-game.mjs` terms; record PASS/FAIL per game with the game id)

1. JOIN: `joined == expected` (the harness's own `joined` count and the console's participants total agree); `refused busy (429/503) == 0`; `5xx == 0`; waiting/declined/undecided strangers have no pid and the total does not include them.
2. SAME GAME: every protocol phone and every real page log the same number sequence (the harness `logsEqual` = all/all) and the same winner set (`groups.length == 1`).
3. PRIZES: per category awarded <= cap (line 5, other 5, house 10, bumper 10); where several claimants share a category the prizes are split equally and the leftover stays open (check the console "Prizes" list: `claimants` vs awarded); organizer Change winner (override) works for one prize in L1 and L5 (claimant ok; a non-claimant is refused 409).
4. TIMER (auto): measure the gap between each new number on the public big screen `/big.html?e=<id>`: average, min, max, count outside +/-0.7 s of 9.0 or 12.0.
5. MANUAL: time from the press (organizer/Host) to the number appearing on 6 real pages: median, p95, worst.
6. EVENT: pause: no number appears while paused and the next press/resume continues with no repeat or skip; late join: the late person has a ticket, sees all earlier numbers, can claim; end by Organizer: every page shows the end within 150 s, undecided requests show "lapsed"; no new ticket after the end (a latecomer gets the thank-you page, by design).
7. ROLES (once per size): Co-host cannot read summary/export (403); Host can; guests: level-1 invite budget 2, level-2 cannot invite; AI key cannot override.
8. AFTER: report e-mail received and its winners/counts equal the console; participants' data erased only after the end (erase during the game is refused: 409).
9. CLEAN: no deploy or other heavy process during the game; record the Cloudflare requests used if the dashboard is readable.

## Order and rules
L1 -> L9; the 500-person games need ~1 GB for protocol phones: run L7-L9 only when free RAM is >= 1.5 GB, else use `--real 6` with fewer protocol phones and record how many phones played (never claim 500 if fewer). Only the boss deploys; every defect found goes to the boss with the game id, the assertion that failed and the console/game-page evidence.

## Reading the results after each game (no CPU)
`python tools/browser-tests/live-summary.py --expect-joined <N> <TAG> [<TAG> ...]` prints one line per game from `data/ui/ui-chrome-<TAG>.json`: PASS/FAIL, game id, mode, cap, joined X/Y, numbers N equal, winners agree, own 5xx / beacon-relay 502 / third-party errors / busy (429/503), page errors, the names of failed checks, and notes. Exit code 0 only if every game passed. PASS rule: every harness check ok, own 5xx = 0, busy = 0, page errors = 0, joined == expected. Beacon-relay 502 and third-party (drand) errors are reported as NOTES (public beacon outage; the phones fall back to other mirrors), not failures, but a relay 502 should be reported to the boss for a decision (answer 503/empty instead of 502?). Number delay / timer gaps are NOT in the result file: measure from `/big.html?e=<eid>` (assertions 4 and 5).

Harness check names printed on failure map to the assertions: "all N people joined" = 1; "same N numbers in the same order" and "same winners" = 2; prizes (3), event (6), roles (7), report e-mail (8) are checked by hand from the console (Prizes list with claimants, Waiting panel, People list) and recorded in the game's notes.

## Lessons from the first live runs
- L3 (eid Ejt2grj) showed "0 of 100 joined": NOT an outage and NOT a product fault. The run script had not uploaded a participant list for the list-based audiences (aud 3 and 4), so all 100 phones correctly went to the waiting room of the list-only game (D1: closed=1, listed=0, waiting=100, joined=0, no 5xx). Fixed in ui-game.mjs (it now uploads a 100-mobile CSV for aud 3/4). L3b is the real run. Rule: a game whose first failing check is "all N people joined" with 0 joined must be diagnosed from the database/console (waiting room count) before it is called a network or product problem.
- The result file does not record number delay or timer gaps, strangers/approvals, prize split or events: those are hand checks (assertions 3, 4, 5, 6, 7).
