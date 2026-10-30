# G2 on layer B (run r2)

2026-10-30T03:02:45.038Z, 648 s, 2474 requests to localhost:8821.

pass 10, fail 3, error 0, not implemented 1, stopped by the meter 0.

| Case | Title | Result | Checks | Seconds |
|---|---|---|---|---|
| UC-G2-01 | Join by listed employee ID | pass | 3/3 | 27 |
| UC-G2-02 | Join by listed email ID | pass | 2/2 | 26 |
| UC-G2-03 | Not on the list, Host approves | fail | 1/3 | 70 |
| UC-G2-04 | Not on the list, Co-host approves own people only | pass | 4/4 | 56 |
| UC-G2-05 | Not on the list, Organizer approves | pass | 3/3 | 92 |
| UC-G2-06 | Open join with an optional email ID | pass | 4/4 | 52 |
| UC-G2-07 | Duplicate mobile on another device | pass | 4/4 | 26 |
| UC-G2-08 | Game full: cap reached | pass | 3/3 | 26 |
| UC-G2-09 | Late join after the first numbers | fail | 2/4 | 127 |
| UC-G2-10 | Cached page with the old consent version | pass | 3/3 | 26 |
| UC-G2-11 | Reconnect: close the page and reopen | pass | 2/2 | 4 |
| UC-G2-12 | Two devices: second phone for the same ticket | pass | 2/2 | 26 |
| UC-G2-13 | Family pass: request, approve, decline | fail | 4/5 | 91 |
| UC-G2-14 | Family pass: 30-minute lapse and 15-minute cutoff | not-implemented | 0/0 driver kind "family-time" is filled in S2 | 0 |

## Failed checks
- UC-G2-03: the Host sees the request (API) | []
- UC-G2-03: the player's page turns into the ticket by itself | 
- UC-G2-09: numbers started before the late joiner arrives | 0
- UC-G2-09: the page is in play for the late joiner (numbers shown, no refusal) | {"log":0,"late":false}
- UC-G2-13: exactly one family member got in | false,false
