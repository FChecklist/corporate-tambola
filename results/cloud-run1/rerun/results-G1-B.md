# G1 on layer B (run r2)

2026-10-30T02:42:40.206Z, 112 s, 6792 requests to localhost:8821.

pass 5, fail 2, error 0, not implemented 5, stopped by the meter 0.

| Case | Title | Result | Checks | Seconds |
|---|---|---|---|---|
| UC-G1-01 | Step 1: automatic start, game calls the numbers | fail | 4/7 | 55 |
| UC-G1-02 | Step 1: manual start, organizer presses Start | pass | 3/3 | 12 |
| UC-G1-03 | Step 1: host-called numbers (organizer rolls each number) | pass | 3/3 | 12 |
| UC-G1-04 | Step 2: who is the game for, open join | pass | 3/3 | 5 |
| UC-G1-05 | Step 2: who is the game for, list game with 9 listed people | pass | 2/2 | 28 |
| UC-G1-06 | Step 3: one ticket each, early prizes only | not-implemented | 0/0 driver kind "prizes" is filled in S2 | 0 |
| UC-G1-07 | Step 3: two tickets each (Ticket A and B) | pass | 3/3 | 1 |
| UC-G1-08 | Step 3: Lucky Draw 1 prize | not-implemented | 0/0 driver kind "lucky" is filled in S2 | 0 |
| UC-G1-09 | Step 3: Lucky Draw 3 prizes | not-implemented | 0/0 driver kind "lucky" is filled in S2 | 0 |
| UC-G1-10 | Step 3: Super Bumper with 1, 2, 5 and 10 prizes (four runs) | not-implemented | 0/0 driver kind "super-bumper" is filled in S2 | 0 |
| UC-G1-11 | Step 4: breaks, brand and time zone | not-implemented | 0/0 driver kind "breaks-brand" is filled in S2 | 0 |
| UC-G1-12 | Step 5: payment demo, publish and rehearsal 1-3 | fail | 2/4 | 0 |

## Failed checks
- UC-G1-01: the game started by itself and 5 numbers were called | numbers seen 0
- UC-G1-01: every phone shows the same numbers in the same order |  |  |  |  |  |  |  |  | 
- UC-G1-01: the numbers come on the 6-second beat (median gap NaN s) | 
- UC-G1-12: rehearsal 1 starts (API) | 402 {"error":"First publish your game and pay. This unlocks your 3 rehearsals.","code":"not-paid"}
- UC-G1-12: the rehearsal game id came back | {"error":"First publish your game and pay. This unlocks your 3 rehearsals.","code":"not-paid"}
