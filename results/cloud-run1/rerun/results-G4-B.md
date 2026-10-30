# G4 on layer B (run r2)

2026-10-30T02:46:15.662Z, 207 s, 12205 requests to localhost:8821.

pass 3, fail 2, error 0, not implemented 9, stopped by the meter 0.

| Case | Title | Result | Checks | Seconds |
|---|---|---|---|---|
| UC-G4-01 | Automatic timer 12 seconds | fail | 4/7 | 55 |
| UC-G4-02 | Manual start then automatic numbers | not-implemented | 0/0 driver kind "manual-start" is filled in S2 | 0 |
| UC-G4-03 | Host-called numbers with the 5-second lock | not-implemented | 0/0 driver kind "host-called" is filled in S2 | 0 |
| UC-G4-04 | Pause when a claim is checked | not-implemented | 0/0 driver kind "claim-notice" is filled in S2 | 0 |
| UC-G4-05 | Pause and resume by the organizer | not-implemented | 0/0 driver kind "pause" is filled in S2 | 0 |
| UC-G4-06 | No repeated numbers across 90 | fail | 3/4 | 137 |
| UC-G4-07 | Game ends at 90 numbers | not-implemented | 0/0 driver kind "end-90" is filled in S2 | 0 |
| UC-G4-08 | Game ends when all prizes are claimed | not-implemented | 0/0 driver kind "end-prizes" is filled in S2 | 0 |
| UC-G4-09 | Early end by the organizer | not-implemented | 0/0 driver kind "stop" is filled in S2 | 0 |
| UC-G4-10 | Last numbers and called count | not-implemented | 0/0 driver kind "strip" is filled in S2 | 0 |
| UC-G4-11 | Crossing a number twice un-crosses it | not-implemented | 0/0 driver kind "crossing" is filled in S2 | 0 |
| UC-G4-12 | Ticket A/B switch in a two-ticket game | pass | 3/3 | 3 |
| UC-G4-13 | Retro and Modern looks | pass | 4/4 | 3 |
| UC-G4-14 | Phone, tablet and laptop widths | pass | 6/6 | 9 |

## Failed checks
- UC-G4-01: the game started by itself and 5 numbers were called | numbers seen 0
- UC-G4-01: every phone shows the same numbers in the same order |  |  |  |  |  |  |  |  | 
- UC-G4-01: the numbers come on the 6-second beat (median gap NaN s) | 
- UC-G4-06: the game reached the numbers asked for (90, or it ended earlier when the last prize was won) | 0
