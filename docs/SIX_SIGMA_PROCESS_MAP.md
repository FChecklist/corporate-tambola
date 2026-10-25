# Corporate Tambola: the process map for six sigma (25 October 2026)

Six sigma means at most **3.4 defects per million opportunities**. A defect is one wrong result of one step. This page splits the whole product into small steps, says what one *opportunity* and one *defect* is for each, and names the test that counts them. The measured numbers are in `SIX_SIGMA_<size>.md` (made by `tools/certify_report.py`) and in `data/sigma-steps.json`.

## How a step is proven
- **Rule steps** are decided by software rules with no network: they can be run millions of times against an independent re-statement of the rule. A step is *proven* when it ran at least 880,000 times with no defect (95% upper bound below 3.4 per million). Steps S1 to S13 below ran 1,000,000 times each (S12: 4.45 million player-house decisions).
- **Journey steps** happen in a real game (a person joins, a number reaches a phone, a prize is given). Each game gives only hundreds or thousands of opportunities, so a journey step is *measured* (defects per million with its 95% upper bound), and called *proven* only when enough games have been played. Where the sample is too small the report says so; it never rounds up.
- **Live steps** are run on the live site with human-style organizer, host and players, free demo game only (no payment is made by the test program).

## The steps

| # | Step | Opportunity | Defect | How it is tested |
|---|---|---|---|---|
| O1 | Organizer signs in | each sign-in | refused, or signed in as the wrong role | campaign, human game, live demo |
| O2 | Game created with the chosen size | each game | wrong size, or "Up to 10 people" not made as the free demo (bug found 25 Oct, fixed) | campaign, live demo, page test |
| O3 | Settings saved (speed, tickets, prizes, who can join, verify rule) | each game | saved value differs from chosen value | campaign, human game, S11 |
| O4 | People list added (PDF, CSV, name+mobile, name+ID) | each game with a list | list not stored as sent | campaign, page tests |
| O5 | Payment, unlock and invoice (paid sizes) | each paid game | not unlocked, or an invoice not sent to payer/organizer | campaign (test payment on the local copy only) |
| O6 | Game published and link opens | each game | not published | campaign, live demo |
| P1 | Allowed people get a ticket | each allowed person | refused | campaign, S10 (1,000,000 attempts, 6 kinds of game) |
| P2 | People not allowed in are held back | each person not allowed | let in | campaign, S10 |
| P3 | People without the needed employee ID are asked for it | each such person | let in or blank error | campaign, S10 |
| P4 | Ticket is well formed (3 x 9, 15 numbers, 5 per row, column ranges) | each ticket | any rule broken | audit, S1 (1,000,000 tickets) |
| P5 | No two tickets of a game are the same | each ticket | a repeat | audit, S2 (1,000,000 tickets, games up to 10,000 players) |
| P6 | Number draw: 90 different numbers, same on every phone | each number drawn | not 1..90, repeated, or different on two phones | audit, S3 (1,000,080) |
| P7 | Every phone shows the same numbers in the same order | each phone | a different list | audit |
| P8 | Number reaches every phone within 6 s of its moment | each number on each phone | later than 6 s (public beacon delay shown separately) | campaign (all phones counted), human game (in-page timing), live demo |
| P9 | Check-in code is different for every ticket | each code | a repeat | S8 (1,000,000) |
| P10 | A house is completed at exactly the right call | each ticket and house | wrong call | S4 (1,000,010), S5 (two tickets, 1,000,000) |
| P11 | Claim is true on the claimer's ticket | each claim | a false claim accepted | audit |
| P12 | Claim is in time (before the next number, Host mode: before the next press) | each winner | a late claim wins or an in-time claim is passed over | audit (Host mode uses the Host's signed press rounds) |
| P13 | Who wins what (completion, deadline, wrong claims, tie rule, positions) | each player-house decision | wrong winner or position | S12 (4,452,186 decisions), S6, audit |
| P14 | Every phone shows the same winners | each phone | a different list | audit |
| P15 | The game ends when it should | each game | ends early or never | campaign, human game |
| P16 | Mobile numbers and employee IDs are read correctly | each typed value | wrong reading | S7, S9 (1,000,000 each) |
| P17 | Game settings validated (accepted when valid, refused when not) | each settings set | wrong answer | S11 (1,000,000) |
| E1 | End-of-game report e-mail is sent | each game | not sent | campaign (server record + mail event) |
| E2 | Settings record kept with the game ID, no personal data | each game | missing, or any person in it | S13 (1,000,000), lifecycle tests |
| E3 | Players' data deleted at 20 hours | each game | not deleted | lifecycle tests (1,793 edge tests) |
| X1 | Page quality: accessibility, security headers | each page | serious axe issue, missing header | axe scan of 10 live pages, header check |

## Test families
1. **Rule steps** `tools/sigma-steps.mjs` (13 steps, no network).
2. **Join decisions** `tools/sigma-http.mjs` (HTTP against a local test copy of the real server).
3. **Campaign** `tools/campaign.mjs`: 100 different real-life games per run (auto 9 s, auto 12 s, Host; six audiences; prizes; brand breaks; late joiners; reloads; offline phones; wrong claims; two rounds). Run at 10, 100, 250, 500 and 1000 players. Every player has an individual log (`data/player-logs/<tag>/<game>.jsonl`).
4. **Human-style games** `tools/human-game.mjs`: a human Organizer console, a human Host page (e-mail code, mobile, "Next number" at irregular gaps), real Chrome pages as players (tap numbers after a human delay, press Claim), the rest as the real phone code.
5. **Live demo** `tools/live-human-demo.mjs`, `tools/live-human-host.mjs`: the same on the live site, free 10-person demo game, test login for the Organizer.
6. **Log review** `tools/review_logs.py`: reads every player's log and says what failed and why.

## What cannot be tested without the owner
- Paid sizes on the live site (100 and above): the live site is in LIVE mode, the test-payment route is refused, and the test program must not pay. These sizes are tested on the local copy of the same code.
- A Host signing in with an e-mail code on the live site: the code goes to a mailbox the test program cannot read. The Host sign-in is tested on the local copy; on the live site the Organizer presses the numbers herself.
- More than a few thousand requests a day on the live site: Cloudflare's free plan allows 100,000 requests a day.
