# Release B audit (2026-10-22)

Plain words for the owner. Every change in this release, the test that proves it, and how it was checked live after the deploy. "Live" lines are filled in after the deploy.

| # | Change | Where | Proof (test) | Live check |
|---|---|---|---|---|
| 1 | The organizer decides how many winners each prize has (any house, up to 100; the Bumper = Full Two-Ticket House too) | config, console step 3 | houses.test.ts, multiwin.test.ts, S18-01, S18-05 | live 12f09e2 |
| 2 | Tie rule per game: people finishing on the same number take the next prizes one after the other (public tie-break) or share that prize; set before the game, locked after | config, game/prize engine, store, console | multiwin.test.ts, worker.test.ts, S18-02, S18-03 | live 12f09e2 |
| 3 | Live prizes list for everyone: open prizes on top, claimed ones crossed out with a small "claimed" | phone page, number screen, organizer board | prize-status.test.ts, S18-02, S18-04 | live 12f09e2 |
| 4 | Players see only the number just called: no earlier numbers, no board | phone page | S18-02, pages.test.ts | live 12f09e2 |
| 5 | The organizer alone has the board (/board.html, opened from the console; a key is checked) | board page, console step 6 | S18-04, S24-01 | live 12f09e2 |
| 6 | Number screen for a room or a meeting app (Google Meet, Zoom, Teams): the number just called and the prizes | big.html | S18-04, S07-03, S24-01 | live 12f09e2 |
| 7 | DEMO GAME: free, up to 10 people, "DEMO GAME" on every screen and a watermark on the ticket; convert to a real game at any time by choosing the number of people and paying; "Make a real game like this one" after the end | server, console, pay page, phone page | demo.test.ts (14), demo-pages.test.ts (9), S19-01..08, S24-02 | live 12f09e2 |
| 8 | Who calls the numbers: the software at the chosen speed, or a Host pressing "Next number" (order still from the public random beacon; press-to-phone 6 to 9 s); chosen before the start, locked after | control, phones, console, number screen, board | control.test.ts, hostcalls.test.ts, hostcalls-pages.test.ts, S20-01..06 | live 12f09e2 |
| 9 | Pause / End the game work even when the console is opened only during the game: phones keep checking once a minute after the start, so a late key reaches them | phones | phone-runtime.test.ts (late key), S23-05 | live 12f09e2 |
| 10 | After a confirmed payment the organizer lands on the engagement page by themselves; "Stay on this page" | pay page | S17-01..04 | live since 2026-10-21 |
| 11 | Guided errors on every screen, every role | all pages | guide.test.ts, S16-01..15 | live since 2026-10-21 |
| 12 | "Demo video" naming for the scripted demo page | site | pages.test.ts, trust page regenerated | live 12f09e2 |
| 13 | Exceptions: public clock unreachable, store busy, two consoles editing, same number from a fresh browser, stop while offline | phones, console | S23-01..05 | n/a (behaviour) |
| 14 | Many people at once: real game and demo game with 5 to 6 phones, console, board and number screen together | all | S24-01, S24-02 | live 12f09e2 |

## Test totals (filled in from the release run)

- Unit (game rules, store, payments, deletion, AI link): 2,082 pass, 0 fail (after the late-key change)
- Page tests (every page in a page harness): 442 pass, 0 fail
- Real Chrome scenarios: 191 scenarios in the release run (187 green; the 4 red were fixed and re-run green: S02-06 test script, S11-03 ticket-first fix, S16-11 test script, S16-12 flake), plus 10 fix-check re-runs green. Live version after deploy: 12f09e2, checked with C:\ct\games-ops\live_check_tambola.ps1 (every change found live).

## Known items left open (not blocking the release)

- The real-housie play mode (players tap their own numbers and press Claim; organizer's choice per game) is not built yet.

- A phone offline for more than about three minutes across an "End the game" carries on from the public numbers on its own until it reconnects (by design; see FINDINGS item 2).
- A demo game cannot be converted with credit or through a pay link; the Organizer, a Host or a Co-host converts it on the pay page.
- The Host-calls estimate of "when the game will have ended" is an estimate; the phones' agreement decides the real end.
- Owner-only: the Rs 1 payment's invoice e-mail and the "Paid order" note at hello@, hello@ forwarding, the uptime alarm, lawyer/CA sign-off, and a real paid game with real people.
