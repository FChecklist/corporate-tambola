# TEST HANDOFF for 1.8.4 (coder to test author)

Branch feat/1.8.4-ui (base tag tambola-v1.8.3 = 751df6c). Product code only; no tests were run or edited by the coder, except the one guard test no-null-text-184.test.ts added with the Paymentnull fix (b6ee745).
Mock source: http://127.0.0.1:8765/ (folder C:\ct\test-sites\data\ui\ux-mock-5step). Gap report: C:\ct\test-sites\data\ui\compare-2026-10-30\gap-report.md and index.html.

## Group 1: Game completed + 30-minute message (z.js)
What changed
- The end card heading is now "Game completed" (was "Game complete") and shows "Game ID <id>" and a line: "Your results stay on this page for 30 minutes after the game. After that this page only says the game is completed."
- A phone that opens the page 30 or more minutes after the game ended (and did not see the game live in that visit) shows only the calm page: shared line, "Game completed", Game ID, "This game is now over. Thank you for being part of it.", the 30-minute line and the Share button. Client-side only: end time = scheduled start + numbers called x gap (no engine change, so 1.8.5 does not collide).
Tests that will need updating (exact source or text pins)
- apps/web/test/player-look.test.ts line 41 pins the source string `Game complete${demoTag()}`; lines 44-45 say the page is "hidden because the engine cannot do it" (the page now exists, computed on the phone).
- pages.test.ts /Game complete/ regexes still match "Game completed".
New tests to write
- ended less than 30 minutes ago: results + "Game completed" + Game ID + 30-minute line; ended 31 minutes ago opened fresh: only the calm page, no ticket, no prizes; a phone that watched the end keeps the results even after 30 minutes pass in the same visit.
- no word "private" in the new text; Hindi/other-language not involved.

## Group 2: join page chips + before the game (z.js, z.css, zsw.js)
- Join page: under the title, small chips: company name (when a brand is set), day and time in India time, "Game ID <id>" (id zjchips / joinchips). Not shown in the free demo.
- Before the game (check-in games): a line "You are in! Game starts in <h m>." above "Check-in opens at ...". The ticket itself still opens only after check-in (owner rule since 1.8.0), so the mock's pre-start ticket is NOT shown: the gap stays for that one point.
- zsw.js cache name ct-game-v40 -> ct-game-v41 (files changed shape). Any test that pins v40 must follow.
- Tests to write: chips present with and without a brand; absent in demo; "You are in!" present in the check-in-closed state and absent once check-in is open.

## Group 3: final results + Rules row (z.js, z.css)
- Game over: a "Final results" card (id finalresults) after the Game completed card: one row per prize, "Ticket N" for the winner, "You" on the rows this phone won (class me), lucky draws that were published. Not shown in the demo.
- In the game: the three rules sit under one collapsed "Rules" row (details id zrulesrow, the list keeps id zrules). Hidden after the game (as before).
- NOT DONE in this group: the prize list during the game is still cards ("To win" tag with CLAIM), the mock has flat rows with a grey CLAIM at the right. Same for the compact Last 5 + ball row. These are pure restyles; they stay open in the gap report (rows 23, 50).
- Tests to write: final results rows for 1, 5 prizes; "You" only on own wins; Rules row present in play and absent when ended; id zrules still exists.
