# G2 on layer B (run r1)

2026-10-30T02:25:37.809Z, 528 s, 1911 requests to localhost:8821.

pass 8, fail 2, error 3, not implemented 1, stopped by the meter 0.

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
| UC-G2-11 | Reconnect: close the page and reopen | error | 0/0 start refused: {"error":"Too many new engagements from this network today. Please try again tomorrow."} | 0 |
| UC-G2-12 | Two devices: second phone for the same ticket | error | 0/0 start refused: {"error":"Too many new engagements from this network today. Please try again tomorrow."} | 0 |
| UC-G2-13 | Family pass: request, approve, decline | error | 0/0 start refused: {"error":"Too many new engagements from this network today. Please try again tomorrow."} | 0 |
| UC-G2-14 | Family pass: 30-minute lapse and 15-minute cutoff | not-implemented | 0/0 driver kind "family-time" is filled in S2 | 0 |

## Failed checks
- UC-G2-03: the Host sees the request (API) | []
- UC-G2-03: the player's page turns into the ticket by itself | 
- UC-G2-09: numbers started before the late joiner arrives | 0
- UC-G2-09: the page is in play for the late joiner (numbers shown, no refusal) | {"log":0,"late":false}
