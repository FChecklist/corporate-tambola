# Real-site games, release 1.3.2: results so far (27 Oct 2026, written by P1 from `data/ui/ui-chrome-<tag>.json` with `tools/browser-tests/live-summary.py`)

Site: corporatetambola.com (live). Games run one at a time by the boss from its laptop with `tools/browser-tests/ui-game.mjs` (6 real Chrome phone-size pages + protocol phones running the real phone code). Account demo1@xyz.in.

## Verdicts (as printed by the analyser)

| Game | Eid | Size | Mode | Audience | Joined | Numbers (all pages equal) | Winners agree | Own 5xx | Busy | Page errors | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| L1b | Ev6gxwc | 100 | auto 9 s | 1 only employees | 100/100 | 61, yes | yes | 0 | 0 | 0 | 28 public-beacon (drand) 500s to browsers, phones fell back |
| L2 | E53f85e | 100 | manual | 6 anyone + employee ID | 100/100 | 63, yes | yes | 0 | 0 | 0 | 65 presses for 63 numbers (extra presses ignored); 18 drand errors |
| L3 | Ejt2grj | 100 | auto 12 s | 4 list + invites | 0/100 | - | - | 0 | 0 | 0 | HARNESS: script uploaded no list, all 100 correctly waited (closed game); not a product fault |
| L3b | Ewwems2 | 100 | auto 12 s | 4 list + invites | 100/100 | 65, yes | yes | 0 | 0 | 0 | 43 drand errors |
| L4 | Eydfdhr | 250 | manual | 1 only employees | 250/250 | 62, yes | yes | 0 | 0 | 0 | 66 presses for 62 numbers; 28 drand errors |
| L5 | Eea3ddp | 250 | auto 12 s | 3 list I choose | 250/250 | 71, yes | yes | 0 | 0 | 0 | 25 client-side ECONNRESET on GET /control (one burst, never grew), 65 drand errors |
| L6 | Eemchac | 250 | auto 9 s | 6 anyone + employee ID | 249 played of 250 (server: 250 joined, 0 waiting, verified by D1) | 64, yes (249/249) | yes | 0 | 0 | 0 | PASS WITH LATENCY NOTE: 1 phone's POST /join timed out client-side after 30 s under the 250-person burst (server had registered it), so the harness counted 249 pages; 1 beacon-relay 502, 56 drand errors, 1 UND_ERR on /control |
| L7 | Emjrteu | 500 (495 players) | auto 12 s | 5 anyone | 479 played of 495 (473/489 phones + 6 pages) | 61, yes (479/479) | yes | 0 | 0 | 0 | JOIN SHORTFALL: 16 protocol phones never got in (14 x POST /join, 9 check-in calls, 1 info, 1 control: all 30 s client timeouts, no HTTP status, no 429/503); 53 drand errors. D1 (boss): the server holds 481 joined of 495: 479 played + 2 whose request reached the DB but whose client timed out, and 14 first-attempt joins that NEVER reached the DB (edge or link, not client-only) |
| L8 | | 500 | auto 9 s | 4 list + invites | next (with protocol-phone join retry) | | | | | | |
| L9 | | 500 | manual | 3 list I choose | not run | | | | | | |

Result: L1b, L2, L3b, L4, L5 PASS; L6 PASS with a join tail-latency note (1 of 250 phones); L7 correctness PASS (numbers, winners, tickets) but JOIN SHORTFALL 16 of 495 (3.2%) under the 500-person burst; 0 failures that are product faults; 1 game (L3) invalid because of the test script.

## What these results prove, and what they do NOT

PROVEN on the real site (each completed game): everyone who should get a ticket got one, one ticket each, all well formed and different; every page shows the same called numbers in the same order and agrees on the winners; no server error and no "busy" refusal from our own site; the game ends correctly on 100 and 250 people in both auto (9 s and 12 s) and manual (organizer presses through the page buttons); the staff list upload by clicks works for 100 and 250; a closed game correctly keeps 100 unlisted people in the waiting room (L3).

NOT CHECKED by the tool (needs hand checks or other tests): strangers waiting / approve / decline / lapse on the real site (covered in the simulation: journeys 960 scenarios + people 99 + rules 5 on 1.3.1/1.3.2, all pass); prize caps (5/5/10/10), equal split and the organizer's final-call override; pause and resume; late join; the "end by Organizer" event; level-1 / level-2 guest invitations; number delay and timer gaps (not in the result file); the end-of-game report e-mail; 500-person capacity.

## Observations to keep
0000. L8 (500, on 1.3.3): no join or check-in call timed out; 3 "[call failed]" lines, all GET /control UND_ERR_CONNECT_TIMEOUT after ~10.4 s (polling, same instant: a TCP connect hiccup on the laptop link, not the server). CORRECTION of an earlier version of this note that said zero lines. The log lines come from the runtime's own call wrapper, which logs every timed-out attempt even when a retry follows, so zero lines = no attempt timed out at all: the retry was not needed and the L7 tail (2.8% never-arriving joins) did NOT reproduce with the same burst shape. Reproducibility of the L7 tail is unknown (one sample each); L9 is a second 500 sample. Do not claim the retry fixed it.
000. L7 JOIN SHORTFALL (500-person burst): of 495 first-attempt joins, 481 reached the database; about 14 (2.8%) never did and about 2 reached it but the phone gave up after 30 s. No 429/503 and no 5xx from our site, so the loss is in the path (Cloudflare edge, this laptop's link via MRS, or a connection limit of the single test process). Release 1.3.3 (live, a87dad59e695) adds an automatic retry of a join that got no answer (page and protocol phone); L8 is the first 500 game on it: compare first-attempt timeouts and the final joined count.
00. HARNESS CHECK NOTE (L6, L7): the check "all N pages show the same K numbers" passes only if the numbers are equal AND N == players. When phones fail to join, it FAILS although the numbers were identical on every page that played (detail 249/249, 479/479). The analyser now reads the numbers part from the detail (x/y) and prints "equal=yes (pages N)"; the join shortfall is reported by the "joined" check.
0. JOIN TAIL LATENCY (L6, 250 people in one burst): one POST /join took more than 30 s and the phone gave up although the server had registered the person. A real person would see a failed join; pressing again returns the same ticket ("again"). Open question for the boss: should the phone page retry a timed-out join by itself (it already retries on "busy")? Zero server errors were counted.
1. The public beacon (drand) answers 500/5xx to browsers in every game (18 to 65 per game); phones fall back to other mirrors and the games are unaffected. Our own relay answered 502 only in an earlier smoke game (decision: leave as 502).
2. Manual games: the organizer's presses after the last number grow with size (2 extra at 100, 4 at 250): phones check for the end every 15 s at this size; the server ignores the extra presses. Not a product fault; the test's stop rule can be tightened.
3. 25 ECONNRESET on GET /control in L5, one burst; cause unknown (laptop network or edge). Cloudflare analytics are not readable with the current token.
4. Result files do not hold number delay or timer gaps; only the console log and hand checks do.
5. A game that shows "0 joined" must be diagnosed from the waiting-room count first (L3).

## Still to do (owner order: test 100 / 250 / 500)
L7 (running), L8, L9 (500 people: needs about 1 GB of free memory for the protocol phones; record how many phones really played), then hand checks of strangers/approvals, prize split and override, pause, late join and End on at least one 100-person game; then this file is updated and the boss decides on any fix and deploy (only the boss deploys).
