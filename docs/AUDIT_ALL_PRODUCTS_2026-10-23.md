# All products - test and go-live audit (2026-10-23, night)

Owner's asks tonight: port the Corporate Tambola changes to the other game sites; test every product (games, Startup Coach, Veridian DPDP, IT Services); sign-in must be plain (e-mail only, six code boxes, Submit, no example domain anywhere); the free demo link https://corporatetambola.com/zc.html?demo=1 must work and never change; re-test manual and auto mode in a real game; audit, go live, go to market.

## 1. Live status (final, after the last deploys)

| Product | Live build | Check |
|---|---|---|
| Corporate Tambola (corporatetambola.com) | 661c3ee | demo link 4 real-Chrome runs (new + existing person with real e-mailed code): all pass; sign-in six boxes + Submit; Razorpay LIVE, free switch off; manual + auto real games 13/13 |
| Corporate Bingo | 5a7b2b5 (LIVE payments) | protection headers, robots, terms 2.4, console Done/To-do marks, sign-in six boxes, no example domain, own name on the legal-position page |
| Corporate Snakes & Ladders | 274c350 (TEST mode) | same checklist, green |
| Corporate Luck by Chance | 752ff60 (TEST mode) | same checklist, green |
| Corporate Tic Tac Toe | c7b2006 (TEST mode) | same checklist, green |
| Corporate Games index | ca33e4f | noai header + AI-crawler rules; 12 pages 200; the repo's own check: no problems |
| Rajat Agarwal, Startup Coach | 13b6fa9 | 5 pages 200, no overflow/errors; e-mail box says "your e-mail"; its 94 tests pass |
| IT Services by Rajat Agarwal | unchanged | 8 pages 200, 15 links 200, clean |
| Veridian DPDP (app.veridian-aios.com) | PR #2182 merged (placeholders + guided-error catalog); deploy workflow ran | 15 pages 200 earlier tonight; CI 23/23 green on the PR |

## 2. What was ported to the four other games
1. Protection of the product (minified JS with notice, noai headers, AI-training crawler rules, terms clause 2.4, cache bump).
2. Organizer console: ✓ Done / ○ To do on every step card, finished-game state, "The game is over" hint, "Draft · not published yet" instead of "Payment pending".
3. Sign-in redesign: e-mail first; a known address gets a 6-digit code (six boxes, Submit, "Send a new code"); a new address sees the Terms box and gets an account at once; "work e-mail" removed; no example e-mail domain anywhere a person can see.
Tests per game before deploy (page tests / edge tests / real-Chrome sign-in S01): Bingo 285 / 63 targeted / 11-12; Snakes & Ladders 101 / 911 / 12; Luck by Chance 251 / 860 / 11; Tic Tac Toe 217 / 862 / 11.

## 3. Real problems found tonight and fixed
- **New people had no way in on the old login**: an unknown e-mail got no code at all. Fixed (one door).
- **The free demo link led a new person to a "sign-in key" box meant for Hosts**: replaced by an e-mail card.
- **Legal-position page of Bingo, Snakes & Ladders, Luck by Chance and Tic Tac Toe said "Corporate Tambola is software supplied as a service"**: each now names its own game (a repo test had been failing on exactly this).
- **A Host's e-mail would have been offered a new Organizer account** by the one-door sign-in: now answered "exists" and sent a code (Tambola, Bingo, Luck, Tic Tac Toe; Snakes already did).
- Console: the finished game read 2 of 10 done; a draft said "Payment pending"; the "Next:" hint after the end said step 1; the phone home page hid the demo link. All fixed.
- Test tooling traps recorded (a check for the words "DEMO GAME" is satisfied by the home text; phones read the last prize a few seconds apart).

## 4. Live manual / auto mode on the real corporatetambola.com (price switch open for the test only; removed and verified)
- Auto, 30 people (24 API + 6 real Chrome phones tapping and claiming): 13/13. Host (manual, organizer presses Next number in the console), 30 people: 13/13, 31 presses for 31 numbers, all 8 prizes claimed. Earlier tonight: demo (10) and 100-person auto and host games also passed. All test participants erased.

## 5. Known, not fixed (honest list)
- Cloudflare's bot-challenge snippet is blocked by our strict Content-Security-Policy (a console warning only; no user effect).
- Tic Tac Toe, Snakes & Ladders, Luck by Chance are in TEST payment mode and shown "Coming soon": going LIVE needs a Rs 1 real payment by the owner on each.
- DPDP app behind sign-in: not tested by Claude tonight (no throw-away account); Startup Coach real paid purchase: owner.
- Test accounts raajat.agarwal+demonew1..4 / +livetest2 are empty shells (close with `node tools/livetest/live.mjs cleanup --close` after their games' 1-hour window).
- Owner-only: trademark application; hello@ forwarding check; uptime alarm; lawyer/CA sign-off; Razorpay webhook secret; Cloudflare "Agent" bot policy left on Allow by the owner.
