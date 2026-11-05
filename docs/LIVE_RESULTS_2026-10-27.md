# Real-site games 100 / 250 / 500: final results (27 Oct 2026)

Written by P1 from `data/ui/ui-chrome-<tag>.json` and `live-<tag>.log` with `tools/browser-tests/live-summary.py`, plus the boss's database (D1) checks. Site: corporatetambola.com (live), releases 1.3.0 to 1.3.3. Games were run one at a time by the boss from its laptop with `tools/browser-tests/ui-game.mjs` (6 real Chrome phone-size pages + protocol phones running the real phone code), account demo1@xyz.in. The plan is `LIVE_GAME_CHECKLIST_2026-10-27.md`.

## The nine games

| Plan | Run (tag, eid) | Size | Mode | Audience | Joined (server) | Numbers equal on all pages | Winners agree | Own 5xx | Busy | Page errors | Verdict and notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| L1 | L1b, Ev6gxwc | 100 | auto 9 s | 1 only employees | 100/100 | 61, yes | yes | 0 | 0 | 0 | PASS. 28 drand errors (fallback worked) |
| L2 | L2, E53f85e | 100 | manual | 6 anyone, employees by ID | 100/100 | 63, yes | yes | 0 | 0 | 0 | PASS. 65 presses for 63 numbers (extra presses ignored). 18 drand errors |
| L3 | L3b, Ewwems2 | 100 | auto 12 s | 4 list + invites | 100/100 | 65, yes | yes | 0 | 0 | 0 | PASS. First run L3 (Ejt2grj) was HARNESS: no list uploaded, all 100 correctly waited. 43 drand errors |
| L4 | L4, Eydfdhr | 250 | manual | 1 only employees | 250/250 | 62, yes | yes | 0 | 0 | 0 | PASS. 66 presses for 62 numbers. 28 drand errors |
| L5 | L5, Eea3ddp | 250 | auto 12 s | 3 list I choose | 250/250 | 71, yes | yes | 0 | 0 | 0 | PASS. 25 client-side ECONNRESET on GET /control (one burst). 65 drand errors |
| L6 | L6, Eemchac | 250 | auto 9 s | 6 anyone, employees by ID | 250/250 (D1); 249 played | 64, yes (249/249) | yes | 0 | 0 | 0 | PASS WITH NOTE: one phone's POST /join timed out at 30 s (server had registered it) |
| L7 | L7, Emjrteu | 495 of 500 | auto 12 s | 5 anyone | 481/495 (D1); 479 played | 61, yes (479/479) | yes | 0 | 0 | 0 | CORRECTNESS PASS, JOIN SHORTFALL: ~14 first-attempt joins never reached the DB (2.8%), ~2 timed out client-side. Run on 1.3.2, before the join retry |
| L8 | L8, Edvwsya | 500 | auto 9 s | 4 list + invites | 500/500 | 69, yes (500/500) | yes | 0 | 0 | 0 | PASS. 22 GET /control + 3 GET /results connect timeouts (client-side). 143 drand errors. On 1.3.3 |
| L9 | L9b, Ekcv4rx | 500 | manual | 3 list I choose | 500/500 (D1) | 72, yes (500/500) | yes | 0 | 0 | 0 | PASS. 5 first-attempt POST /join timeouts + 2 info + 2 check-in + 16 control, ALL recovered: final 500/500. 81 presses for 72 numbers. 19 drand errors. First run L9 (E4rvr8r) was invalid (client fetch failed before publishing, 0 joined, never ran) |

Totals: 9 of 9 planned games done. 8 PASS (L6 with a latency note), 1 correctness pass with a join shortfall (L7). No server error (5xx) and no "busy" refusal in any game. Two invalid first runs (L3, L9), both harness or network, none a product fault.

## What these runs PROVE (real site)
- For 100, 250 and 500 people, in auto (9 s and 12 s) and manual (organizer presses through the page buttons): everyone who got in has one different, well-formed ticket; every page shows the same numbers in the same order and agrees on the winners; the game ends on every page; no server error; no page error.
- Staff / participant list upload by clicks works for 100, 250 and 500; a closed game keeps 100 unlisted people in the waiting room (L3).
- The phone page's automatic retry of a join that gets no answer (release 1.3.3) recovered every first-attempt join timeout in L9b (5 of 5: final 500/500), where L7 on 1.3.2 lost ~14 of 495.

## What they do NOT prove (not checked by the tool; needs hand checks)
Strangers waiting / approve / decline / lapse on the real site (the simulation covers it: journeys 960 scenarios + 20 whole games + people 99 + rules 5, all pass on 1.3.1/1.3.2); prize caps 5/5/10/10, equal split and the organizer's final call; pause and resume; late join; the "end by Organizer" event itself (L3b, L8: pages ended by the natural end); level-1 / level-2 guest invitations; number delay and timer gaps (not in the result file); the end-of-game report e-mail; capacity above 500.

## Findings
1. J5, join tail latency (L6, L7): under a 250- to 500-person burst some first-attempt joins take more than 30 s or never arrive (L6: 1 of 250; L7: ~14 of 495 never reached the DB; L8: none; L9b: 5 timed out, all recovered). No 429/503, no 5xx: the loss is in the path (edge, this laptop's link, or the test process connection limit). FIXED for real people by the page retry in 1.3.3 (L9b evidence). Reproducibility of the L7 tail is unknown (L8 had no join timeouts with the same burst shape).
2. Client-side connection failures on the polling routes (GET /control, /results, /info): L5 25 ECONNRESET, L8 25 connect timeouts, L9b 16. All recovered; never affected the end result. Likely the laptop's connection with ~500 pollers; Cloudflare analytics are not readable with the current token, so the edge side is unconfirmed.
3. The public beacon (drand) answers 5xx to browsers in every game (18 to 143 per game); phones fall back to other mirrors. Our own relay answered 502 in earlier smoke games and once in L6 (decision: leave as 502).
4. Manual games: presses after the last number grow with size (2 extra at 100, 4 at 250, 9 at 500); the server ignores them; phones check for the end every 15 s at this size. Not a product fault.
5. Harness issues found and fixed: the check "all N pages show the same K numbers" also required pages == players, so a join shortfall failed it although the numbers were identical (split by the boss, commit a87dad5); list audiences needed an uploaded list (L3); a result file marked a game PASS while still running (analyser now says INCOMPLETE).
6. Simulation findings fixed earlier in the night: J1 (a 10-digit number starting with 5 was accepted), J2 (an unknown country code was accepted), the 0091 regression from the J2 fix (release 1.3.2); the sim crowd now checks in and presses Claim (the old "play" family had passed with zero winners).

## Still to do (owner order)
Hand-check one 100-person game for the unchecked items above (approve and decline a stranger, change one prize winner, pause and resume, late join, End by Organizer) and record it here; read the end-of-game report e-mail of one game; repeat one 500 burst from another network to see whether the L7 tail reproduces. Only the boss deploys.
