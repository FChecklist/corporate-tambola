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
