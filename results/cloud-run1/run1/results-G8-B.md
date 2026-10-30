# G8 on layer B (run r1)

2026-10-30T02:29:53.685Z, 99 s, 505 requests to localhost:8821.

pass 6, fail 1, error 1, not implemented 2, stopped by the meter 0.

| Case | Title | Result | Checks | Seconds |
|---|---|---|---|---|
| UC-G8-01 | Offline then reload mid-game | pass | 4/4 | 20 |
| UC-G8-02 | Server refusals read as plain words | fail | 3/4 | 25 |
| UC-G8-03 | Rate limit (429) for an email or ID guess | pass | 2/2 | 0 |
| UC-G8-04 | Wrong organizer key | pass | 4/4 | 0 |
| UC-G8-05 | Expired or removed link | not-implemented | 0/0 driver kind "expired-link" is filled in S2 | 0 |
| UC-G8-06 | Stale page after a release | pass | 3/3 | 26 |
| UC-G8-07 | Double submit of Join and Claim | pass | 2/2 | 2 |
| UC-G8-08 | Game cancelled by the organizer | error | 0/0 page.waitForSelector: Timeout 25000ms exceeded.
Call log:
[2m  - waiting for locator('[data-cbc=\'K4\'] input[data-box]') to be visible[22m
 | 26 |
| UC-G8-09 | Payment pending locks the game | not-implemented | 0/0 driver kind "payment-pending" is filled in S2 | 0 |
| UC-G8-10 | Free launch limit | pass | 1/1 | 0 |

## Failed checks
- UC-G8-02: on the page the bad number shows a sentence, never raw data | CORPORATE TAMBOLA Corporate Tambola JOIN THE GAME Welcome! You are invited to join the Corporate Tambola (Housie) organized by your company on 30 Oct 2026, 2:43 am UTC. To join, type your mobile numbe
