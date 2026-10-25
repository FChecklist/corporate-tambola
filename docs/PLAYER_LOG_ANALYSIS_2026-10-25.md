# What the logs of every player say (Corporate Tambola, test runs of 24-25 October 2026)

Source: `data/player-logs/*/*.jsonl`, one line per player per game, written by the per-ticket audit. Counted by `tools/analyse_players.py`.

## What was recorded
- **124 games, 14,824 player records.** Each record has the player's tickets (every number), how many numbers the phone received, the time of the first and last number, the median gap between numbers, every claim (house, call, time), every win, whether the phone was checked in, reloaded or joined late, and phone errors.
- Game sizes: 10, 20, 81 to 100 (most), 250, 500 and 1000 players. 9,782 players held 1 ticket, 5,042 held 2.

## What the numbers say
| Question | Answer from the logs |
|---|---|
| Did every player get a ticket and check in? | Yes for everyone who was allowed in: 14,824 of 14,824 were checked in. |
| Were any tickets repeated inside a game? | **None.** 0 of 124 games had a repeated ticket set. All 14,824 records are well formed (checked one by one). |
| Did phones report errors? | **0 phone errors** in 14,824 records. |
| Did every phone get the same numbers? | Yes, except 135 phones (all in one failed 1,000-player Host run, `s1000h`) that stopped 4 numbers early. That run was repeated (`s1000h2`) and passed that check. |
| Who won? | 488 players won a prize; 11,083 players pressed Claim at least once. |
| Is it fair to 1 vs 2 tickets? | 1 ticket: 2.6% of players won. 2 tickets: 4.6%. About 1.8 times as many wins for twice the tickets, as it should be. |
| Median gap between numbers | 8.8 to 13 s for 9 s and 12 s games, as set. |
| Late joiners | 205 late phones saw 42.9 numbers on average against 48.5 for the others. They cannot win early houses. |
| Join speed | Typical game: median join 61 ms. The slowest game median was 4.3 s (an older run under heavy test load). |

## The one thing that stands out: 97% of claims lose
16,664 claims were pressed and only 488 players won. Most pressed Claim for a house somebody else already won a moment earlier (the test phones claim every house they complete). A real person who is "one number too slow" will feel this. **This is the biggest improvement area from a human point of view.**

## Where the product can improve for a human player
1. **Say why a claim lost, kindly and exactly.** "Priya got this house 2 seconds before you. Your claim was correct." Show the winner's first name and the gap. (Check the screen shows this today; if it does not, add it.)
2. **Late joiners.** They see fewer numbers and cannot win early houses, which can feel unfair. Options for the owner to choose: (a) show a clear banner "You joined at number 12; houses completed before that are not open to you", or (b) allow late joiners to see and mark the numbers already called.
3. **Numbers that arrive late.** A small number of numbers reach a phone 4 to 8 seconds late (measured: 1 of 1,605 numbers over 6 s; 5 of 1,605 over 4 s). Show "Next number coming..." with a gentle pulse so players do not think the game froze, and add a soft sound or vibration when the number appears.
4. **After a break** (opening speech, interval) show a countdown "Game resumes in 12 s"; the first number after a break was the slowest to appear under load.
5. **People held in the waiting room** (8 of 100 in list-only games by design in the tests). The wording must say plainly: "You are not on the list yet. Your organizer has been told." and let the organizer approve in one tap.
6. **Rush of joins** (many people at once): join time rose to 4.3 s in one older heavy run. Show "You are in the queue, 3 seconds" so nobody taps Join twice.
7. **Two-ticket players** should see which ticket is closer to winning (highlight the one that needs the fewest numbers).
8. **Claim by mistake.** Keep the gentle "Not yet" message and the limit on wrong claims, and never shame the player.

## What else can be improved (organizer and owner side)
- **End-of-game report e-mail.** In the older scale runs 8 games did not send the report. It is sent in every final-code game, but the organizer console should show "Report: sent at 14:32 to name@company" or "not sent yet, send now" so nobody has to guess.
- **Test coverage that is still missing:** real phones (low-end Android, slow 3G, screen off), screen readers, right-to-left and Hindi text, two organizers editing at once, and a 10,000-player proof on the real Cloudflare setup.
- **10,000 players** failed on the single laptop test server; the real service has not been shown to hold 10,000.
- **Per-ticket log** now records every claim; add the claim-to-result time to the log so slow claims can be analysed (today only the call index and time are kept).
- **Laptop-specific test noise.** Several "timing" failures in the tests were the test laptop under load, not the game. The final proof therefore counts every number delivered to every phone (see the six-sigma report) instead of one yes/no per game.

## What the logs cannot show
They show no real phones, real networks or real people. They show that the rules, tickets, numbers, claims and prizes are right under test, not how a nervous first-time player feels. A small real-world pilot (20 to 30 people, one office) before the first paid game is the best next step.
