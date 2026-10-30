# G6 on layer B (run r2)

2026-10-30T03:05:03.314Z, 57 s, 423 requests to localhost:8821.

pass 4, fail 1, error 0, not implemented 5, stopped by the meter 0.

| Case | Title | Result | Checks | Seconds |
|---|---|---|---|---|
| UC-G6-01 | Common link opens the join page | pass | 2/2 | 3 |
| UC-G6-02 | Personal link joins without a number | not-implemented | 0/0 driver kind "personal-link" is filled in S2 | 0 |
| UC-G6-03 | Family link shows the family wording | pass | 2/2 | 26 |
| UC-G6-04 | Co-host link never shows family words | pass | 2/2 | 25 |
| UC-G6-05 | Host link opens the Host console | fail | 1/2 | 3 |
| UC-G6-06 | Thank-you page after the game | not-implemented | 0/0 driver kind "thanks" is filled in S2 | 0 |
| UC-G6-07 | Game completed page 30 minutes later | not-implemented | 0/0 driver kind "completed" is filled in S2 | 0 |
| UC-G6-08 | 30-minute wait message | not-implemented | 0/0 driver kind "lapse-text" is filled in S2 | 0 |
| UC-G6-09 | Share and WhatsApp buttons | not-implemented | 0/0 driver kind "share" is filled in S2 | 0 |
| UC-G6-10 | Brochure, guide and manual links | pass | 4/4 | 0 |

## Failed checks
- UC-G6-05: a console, not the join page | Use the new organizer screens Corporate Tambola Host Finish setup Two quick things, then your game opens. This link works once. 1. Your e-mail Use the e-mail your Organizer gave us: t***@example.inval
