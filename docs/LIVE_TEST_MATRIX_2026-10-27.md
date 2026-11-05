# Live test matrix: 9 games on the real site (100 / 250 / 500 people)

Proposed by P1 for the boss (who runs it, one game at a time, after the 1.3.0 deploy). Account demo1@xyz.in (Rs 0 test pack, code 123456). Never two games at once, never a deploy or a heavy process on the laptop during a game.

## The 9 games (covering array)

| # | People | Play | Audience | Approval outcome | Event |
|---|---|---|---|---|---|
| L1 | 100 | auto 9 s | employees only (ID) | stranger waits, Organizer approves | none |
| L2 | 100 | manual | anyone | stranger declined, another left undecided | pause and resume |
| L3 | 100 | auto 12 s | list + invitations (level 1 and 2 guests) | listed people in at once | end by Organizer |
| L4 | 250 | manual | employees only (ID) | listed in at once | late join (after the first number) |
| L5 | 250 | auto 12 s | list only (mobile) | stranger waits, Host approves | pause and resume |
| L6 | 250 | auto 9 s | anyone | stranger declined, another undecided | none |
| L7 | 500 | auto 12 s | anyone | stranger waits, Co-host approves | late join |
| L8 | 500 | auto 9 s | list + invitations | stranger declined, another undecided | end by Organizer |
| L9 | 500 | manual | list only (mobile) | listed in at once | none |

Coverage: each size has all three play modes; every audience, approval outcome and event appears at least twice (none x3, pause/resume x2, late join x2, end x2); every size meets three different audiences and three different events. It is NOT a full pairwise cover of all dimensions (that needs 12+ games for audience x play alone): the remaining pairs are covered by the 1,680-scenario sim.

Per game, the people: 6 real phone-size pages (click-only, Chrome; one game each in Chromium and WebKit: L2 Chromium, L5 WebKit), the rest protocol phones using the real phone code (tools/load-tests/ui-game.mjs `--real 6`). Roles in every game: Organizer, Host and Co-host (each adds a few people and uses its own rights), one level-1 guest and one level-2 guest where invitations exist.

## Pass criteria (every game; any miss = a gap to report with the game id)

1. JOINING: all people who should get a ticket got one; count of joined == expected; waiting/declined/undecided strangers have no ticket and use no place; no 429/503 "busy" for a normal join; no request answered 5xx (count from the site's error log if readable, else from the test's own calls).
2. SAME GAME EVERYWHERE: every sampled page and protocol phone shows the same numbers in the same order and the same winners.
3. PRIZES (owner rules): caps respected (line <= 5, other <= 5, house <= 10, bumper <= 10); where several correct claimants share a category, prizes are split equally and the leftover prize stays open; the Organizer can still change the final call.
4. AUTO TIMER (auto games): gap between numbers = 9.0 / 12.0 s, report average / min / max and the number outside +/-0.7 s (a few, from laptop jitter, are noted not failed if the server's own call times are right).
5. MANUAL (manual games): time from the Host/Organizer press to the number on the phones: median, 95th percentile, worst (control delay grows with size; record it).
6. EVENT: pause: numbers stop and resume on press with nothing lost or repeated; late join: late person gets a ticket and sees the earlier numbers; end by Organizer: all pages show the end within 60 s + the poll time and waiting requests show "lapsed"; no new ticket after the end (thank-you page, by design).
7. ROLES: Co-host sees only own link's requests, cannot read the summary/export; Host reads everything; guests cannot invite beyond their limit; level-2 cannot invite.
8. AFTER THE GAME: report e-mail arrives and matches (winners, counts); personal data erased on schedule (spot check).
9. NO CONTAMINATION: nothing else deployed or run during the game; Cloudflare daily limit not exhausted (record requests used if visible).

## Order and timing
L1 -> L9 as listed (small first). Pause 5 minutes between games. Stop at once and report if more than 1% of requests fail with 5xx, or joins are refused as busy.
