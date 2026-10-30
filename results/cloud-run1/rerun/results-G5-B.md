# G5 on layer B (run r2)

2026-10-30T02:51:48.712Z, 325 s, 16479 requests to localhost:8821.

pass 0, fail 0, error 6, not implemented 12, stopped by the meter 0.

| Case | Title | Result | Checks | Seconds |
|---|---|---|---|---|
| UC-G5-01 | Early Five claim, correct | error | 0/0 st.anySaw is not a function | 20 |
| UC-G5-02 | Top line claim, correct | error | 0/0 st.anySaw is not a function | 42 |
| UC-G5-03 | Middle line claim, correct | error | 0/0 page.goto: Timeout 30000ms exceeded.
Call log:
[2m  - navigating to "http://localhost:8821/z.html?e=TR-r2-UCG503", waiting until "load"[22m
 | 161 |
| UC-G5-04 | Bottom line claim, correct | error | 0/0 page.goto: Timeout 30000ms exceeded.
Call log:
[2m  - navigating to "http://localhost:8821/z.html?e=TR-r2-UCG504", waiting until "load"[22m
 | 31 |
| UC-G5-05 | Four corners and Star claims | error | 0/0 page.goto: Timeout 30000ms exceeded.
Call log:
[2m  - navigating to "http://localhost:8821/z.html?e=TR-r2-UCG505", waiting until "load"[22m
 | 34 |
| UC-G5-06 | Full House 1st to 5th | error | 0/0 page.goto: Timeout 30000ms exceeded.
Call log:
[2m  - navigating to "http://localhost:8821/z.html?e=TR-r2-UCG506", waiting until "load"[22m
 | 31 |
| UC-G5-07 | Bogey: claim with nothing to claim | not-implemented | 0/0 driver kind "bogey" is filled in S2 | 0 |
| UC-G5-08 | Wrong claim: a stale mark | not-implemented | 0/0 driver kind "wrong-claim" is filled in S2 | 0 |
| UC-G5-09 | Late claim after the next number | not-implemented | 0/0 driver kind "late-claim" is filled in S2 | 0 |
| UC-G5-10 | Prize already taken | not-implemented | 0/0 driver kind "taken" is filled in S2 | 0 |
| UC-G5-11 | Two winners on one number | not-implemented | 0/0 driver kind "tie" is filled in S2 | 0 |
| UC-G5-12 | Simultaneous claims by many players | not-implemented | 0/0 driver kind "burst" is filled in S2 | 0 |
| UC-G5-13 | Claim during a pause | not-implemented | 0/0 driver kind "claim-pause" is filled in S2 | 0 |
| UC-G5-14 | Bystander banner for other players' claims | not-implemented | 0/0 driver kind "bystander" is filled in S2 | 0 |
| UC-G5-15 | Claim screens in both looks | not-implemented | 0/0 driver kind "claim-ui" is filled in S2 | 0 |
| UC-G5-16 | Super Bumper 1-10 prizes in order | not-implemented | 0/0 driver kind "super-bumper" is filled in S2 | 0 |
| UC-G5-17 | Per-ticket A/B prize | not-implemented | 0/0 driver kind "ab-prize" is filled in S2 | 0 |
| UC-G5-18 | Lucky Draw is drawn and published | not-implemented | 0/0 driver kind "lucky" is filled in S2 | 0 |
