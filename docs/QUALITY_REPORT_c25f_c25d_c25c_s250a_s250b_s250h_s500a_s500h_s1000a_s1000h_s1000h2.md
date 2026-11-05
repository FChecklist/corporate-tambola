# Corporate Tambola: measured quality report (c25f, c25d, c25c, s250a, s250b, s250h, s500a, s500h, s1000a, s1000h, s1000h2)

Everything below is counted from the real run logs. Nothing is rounded up.

- Cases run: **24**, cases with every check passing: **15**
- Checks made: **725**, failed: **14** (that is **19,310 failures per million checks**)
- Players played individually: **6108**, tickets audited one by one: **6742**, claims verified one by one: **4708**
- Sigma level from this sample (convention: +1.5 shift, at least 0.5 failure assumed): **3.57**
- Six sigma means at most 3.4 failures per million. This sample is far too small to prove that: with 725 checks, even zero failures can only show a rate below about 1,379 per million.

- Checks not judged (explained): 1 x 'passed over' audit in a game where claim timing cannot be recomputed from numbers alone (Host presses, offline phones, wrong claims, brand breaks)

## By way of playing

- auto12: 5 cases, 1 with a failed check
- auto9: 10 cases, 4 with a failed check
- host: 9 cases, 4 with a failed check

## Failed checks by kind

- 8 x the end-of-game report e-mail was sent
- 1 x auto: no burst of numbers: no two numbers came less than half the set 
- 1 x auto: every number reached the phone within 4 s of its time 
- 1 x every phone that joined reached the end of the game
- 1 x every phone shows the same numbers in the same order
- 1 x every phone shows the same winners
- 1 x audit: every one of 1000 players received the same 27 numbers in the s

## Every failed check

- c25d #5: auto: no burst of numbers: no two numbers came less than half the set gap apart | 1 bursts, fastest 5.864, 5th percentile 11.041, 95th 12.652
- c25c #15: the end-of-game report e-mail was sent | none in 14 min
- s250a #1: the end-of-game report e-mail was sent | none in 14 min
- s250b #1: the end-of-game report e-mail was sent | none in 14 min
- s250h #3: the end-of-game report e-mail was sent | none in 14 min
- s500a #1: the end-of-game report e-mail was sent | none in 14 min
- s500h #3: the end-of-game report e-mail was sent | none in 14 min
- s1000a #1: auto: every number reached the phone within 4 s of its time (p50 0.9, p95 3.3, max 4.1 s) | max 4.1
- s1000a #1: the end-of-game report e-mail was sent | none in 14 min
- s1000h #3: every phone that joined reached the end of the game | 887 still not ended of 1000
- s1000h #3: every phone shows the same numbers in the same order | 887 differ
- s1000h #3: every phone shows the same winners | 887 differ
- s1000h #3: audit: every one of 1000 players received the same 27 numbers in the same order | 865 differ: 2x2c07496190b3, 4x28e6aff0f5cd, 5xb90730cad7be
- s1000h #3: the end-of-game report e-mail was sent | none in 14 min
