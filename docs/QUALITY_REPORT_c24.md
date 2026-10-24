# Corporate Tambola: measured quality report (c24)

Everything below is counted from the real run logs. Nothing is rounded up.

- Cases run: **37**, cases with every check passing: **36**
- Checks made: **1097**, failed: **1** (that is **912 failures per million checks**)
- Players played individually: **3175**, tickets audited one by one: **4817**, claims verified one by one: **4556**
- Sigma level from this sample (convention: +1.5 shift, at least 0.5 failure assumed): **4.62**
- Six sigma means at most 3.4 failures per million. This sample is far too small to prove that: with 1,097 checks, even zero failures can only show a rate below about 912 per million.

- Checks not judged (explained): 17 x claim audit of the early version of the audit (last call after a prize-ended game); 1 x 'passed over' audit in a game where claim timing cannot be recomputed from numbers alone (Host presses, offline phones, wrong claims, brand breaks)

## By way of playing

- auto12: 13 cases, 1 with a failed check
- auto9: 12 cases, 0 with a failed check
- host: 12 cases, 0 with a failed check

## Failed checks by kind

- 1 x auto: every number reached the phone within 4 s of its time 

## Every failed check

- c24 #8: auto: every number reached the phone within 4 s of its time (p50 1, p95 1.7, max 6.7 s) | max 6.7
