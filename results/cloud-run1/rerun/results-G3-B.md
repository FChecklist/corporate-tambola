# G3 on layer B (run r2)

2026-10-30T03:03:57.733Z, 64 s, 410 requests to localhost:8821.

pass 5, fail 2, error 0, not implemented 3, stopped by the meter 0.

| Case | Title | Result | Checks | Seconds |
|---|---|---|---|---|
| UC-G3-01 | Host signs in with the Host link | fail | 2/4 | 3 |
| UC-G3-02 | Co-host opens the Co-host link | fail | 3/4 | 3 |
| UC-G3-03 | Co-host limit: invite up to N people | not-implemented | 0/0 driver kind "cohost-limit" is filled in S2 | 0 |
| UC-G3-04 | Who approves text per role | pass | 2/2 | 3 |
| UC-G3-05 | Organizer vs Host controls | pass | 2/2 | 0 |
| UC-G3-06 | Up to 5 Hosts | pass | 2/2 | 0 |
| UC-G3-07 | Co-host without accepting | pass | 3/3 | 0 |
| UC-G3-08 | Co-host with an old-version acceptance | not-implemented | 0/0 driver kind "cohost-old" is filled in S2 | 0 |
| UC-G3-09 | Co-host sees waiting list of own link only | pass | 4/4 | 56 |
| UC-G3-10 | Organizer removes a person and the email is released | not-implemented | 0/0 driver kind "remove" is filled in S2 | 0 |

## Failed checks
- UC-G3-01: the Host accepts the role (API, the box is ticked by the client) | 403
- UC-G3-01: the Host console opens with the game and no script error | Use the new organizer screens Corporate Tambola Host Finish setup Two quick things, then your game opens. This link works once. 1. Your e-mail Use the e-mail yo 
- UC-G3-02: the Co-host console shows the game header and no organizer sections | Use the new organizer screens Corporate Tambola Signed in as Co-host Rs 0 · nothing to pay TEST-RUN-TR-r2-UCG302 · 30 Oct 2026 8:47 am Sign out Your progress 1 of 3 done · 33% Jump to 1 2 3 Help The g
