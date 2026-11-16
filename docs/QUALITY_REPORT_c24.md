# Corporate Tambola: measured quality report (c24)

Everything below is counted from the real run logs. Nothing is rounded up.

- Cases run: **100**, cases with every check passing: **78**
- Checks made: **2962**, failed: **46** (that is **15,530 failures per million checks**)
- Players played individually: **8349**, tickets audited one by one: **12672**, claims verified one by one: **11508**
- Sigma level from this sample (convention: +1.5 shift, at least 0.5 failure assumed): **3.66**
- Six sigma means at most 3.4 failures per million. This sample is far too small to prove that: with 2,962 checks, even zero failures can only show a rate below about 338 per million.

- Checks not judged (explained): 45 x claim audit of the early version of the audit (last call after a prize-ended game); 6 x 'passed over' audit in a game where claim timing cannot be recomputed from numbers alone (Host presses, offline phones, wrong claims, brand breaks)

## By way of playing

- auto12: 33 cases, 11 with a failed check
- auto9: 34 cases, 9 with a failed check
- host: 33 cases, 2 with a failed check

## Failed checks by kind

- 17 x auto: no burst of numbers: no two numbers came less than half the set 
- 13 x auto: every number reached the phone within 4 s of its time 
- 5 x every phone shows the same numbers in the same order
- 2 x all 92 allowed people got a ticket
- 1 x audit: every one of 100 players received the same 64 numbers in the sa
- 1 x manual: the numbers came only because the Host pressed Next 
- 1 x late joiners see only the numbers called after they joined, and they m
- 1 x audit: every one of 84 players received the same 40 numbers in the sam
- 1 x audit: every one of 92 players received the same 31 numbers in the sam
- 1 x audit: every one of 85 players received the same 65 numbers in the sam
- 1 x audit: every one of 92 players received the same 71 numbers in the sam
- 1 x all 85 allowed people got a ticket
- 1 x people not on the list or with a wrong ID are held in the waiting room

## Every failed check

- c24 #8: auto: every number reached the phone within 4 s of its time (p50 1, p95 1.7, max 6.7 s) | max 6.7
- c24 #57: every phone shows the same numbers in the same order | 9 differ
- c24 #57: audit: every one of 100 players received the same 64 numbers in the same order | 9 differ: 17x0936121ee153, 18xc8848c0b6b99, 22xaf20c625d8cd
- c24 #64: auto: every number reached the phone within 4 s of its time (p50 0.9, p95 8, max 31.9 s) | max 31.9
- c24 #62: auto: no burst of numbers: no two numbers came less than half the set gap apart | 2 bursts, fastest 2.499, 5th percentile 9.298, 95th 15.627
- c24 #66: manual: the numbers came only because the Host pressed Next (numbers <= presses stored on  | numbers 74 presses stored 0 (seen by the test 0)
- c24 #67: all 92 allowed people got a ticket | 90 of 92
- c24 #67: auto: every number reached the phone within 4 s of its time (p50 0.7, p95 4.1, max 7.2 s) | max 7.2
- c24 #67: auto: no burst of numbers: no two numbers came less than half the set gap apart | 1 bursts, fastest 2.616, 5th percentile 6.405, 95th 12.164
- c24 #65: auto: no burst of numbers: no two numbers came less than half the set gap apart | 1 bursts, fastest 2.716, 5th percentile 9.219, 95th 16.772
- c24 #70: every phone shows the same numbers in the same order | 3 differ
- c24 #70: late joiners see only the numbers called after they joined, and they match | 
- c24 #70: audit: every one of 84 players received the same 40 numbers in the same order | 3 differ: 36x025930068c63, 39xd0bf09ce47e9, 42x33828531826f
- c24 #70: auto: every number reached the phone within 4 s of its time (p50 1.9, p95 13.5, max 18.8 s | max 18.8
- c24 #70: auto: no burst of numbers: no two numbers came less than half the set gap apart | 4 bursts, fastest 2.237, 5th percentile 3.5, 95th 11.437
- c24 #71: every phone shows the same numbers in the same order | 8 differ
- c24 #71: audit: every one of 92 players received the same 31 numbers in the same order | 8 differ: 14x15330293fd79, 15xc4be58a0f403, 50x94ab70b95064
- c24 #71: auto: no burst of numbers: no two numbers came less than half the set gap apart | 1 bursts, fastest 5.801, 5th percentile 9.143, 95th 24.392
- c24 #73: auto: no burst of numbers: no two numbers came less than half the set gap apart | 2 bursts, fastest 0.794, 5th percentile 3.857, 95th 17.819
- c24 #74: auto: every number reached the phone within 4 s of its time (p50 0.7, p95 2.7, max 6.7 s) | max 6.7
- c24 #74: auto: no burst of numbers: no two numbers came less than half the set gap apart | 1 bursts, fastest 5.735, 5th percentile 10.465, 95th 14.213
- c24 #76: every phone shows the same numbers in the same order | 4 differ
- c24 #76: audit: every one of 85 players received the same 65 numbers in the same order | 4 differ: 35xca26d9f0a15d, 37x542edcd05489, 70x054394375fd6
- c24 #68: all 92 allowed people got a ticket | 91 of 92
- c24 #68: auto: no burst of numbers: no two numbers came less than half the set gap apart | 4 bursts, fastest 1.828, 5th percentile 9.022, 95th 13.673
- c24 #77: auto: every number reached the phone within 4 s of its time (p50 0.5, p95 3.9, max 15.2 s) | max 15.2
- c24 #77: auto: no burst of numbers: no two numbers came less than half the set gap apart | 1 bursts, fastest 0.735, 5th percentile 10.302, 95th 13.684
- c24 #85: auto: no burst of numbers: no two numbers came less than half the set gap apart | 3 bursts, fastest 1.209, 5th percentile 6.753, 95th 10.82
- c24 #89: every phone shows the same numbers in the same order | 1 differ
- c24 #89: audit: every one of 92 players received the same 71 numbers in the same order | 1 differ: 69xb5417e68250c
- c24 #89: auto: every number reached the phone within 4 s of its time (p50 1.1, p95 6.4, max 7.5 s) | max 7.5
- c24 #89: auto: no burst of numbers: no two numbers came less than half the set gap apart | 2 bursts, fastest 5.633, 5th percentile 6.757, 95th 17.374
- c24 #91: auto: every number reached the phone within 4 s of its time (p50 2.1, p95 9.3, max 15.2 s) | max 15.2
- c24 #91: auto: no burst of numbers: no two numbers came less than half the set gap apart | 6 bursts, fastest 0.123, 5th percentile 1.336, 95th 15.787
- c24 #92: auto: every number reached the phone within 4 s of its time (p50 1.1, p95 7.6, max 19.9 s) | max 19.9
- c24 #92: auto: no burst of numbers: no two numbers came less than half the set gap apart | 4 bursts, fastest 1.803, 5th percentile 5.435, 95th 16.065
- c24 #94: all 85 allowed people got a ticket | 81 of 85
- c24 #94: people not on the list or with a wrong ID are held in the waiting room (403 waiting) | [{"p":{"kind":"waiting","phone":"9940000086","name":"Priya Patel"},"s":0,"code":"net"}]
- c24 #94: auto: every number reached the phone within 4 s of its time (p50 1.4, p95 3.2, max 8 s) | max 8
- c24 #94: auto: no burst of numbers: no two numbers came less than half the set gap apart | 1 bursts, fastest 2.356, 5th percentile 7.672, 95th 10.199
- c24 #97: auto: every number reached the phone within 4 s of its time (p50 0.7, p95 2.4, max 7.9 s) | max 7.9
- c24 #97: auto: no burst of numbers: no two numbers came less than half the set gap apart | 1 bursts, fastest 2.432, 5th percentile 8.164, 95th 9.918
- c24 #95: auto: every number reached the phone within 4 s of its time (p50 1, p95 2.8, max 22.4 s) | max 22.4
- c24 #95: auto: no burst of numbers: no two numbers came less than half the set gap apart | 3 bursts, fastest 0.122, 5th percentile 10.843, 95th 13.018
- c24 #98: auto: every number reached the phone within 4 s of its time (p50 0.9, p95 2.5, max 22.3 s) | max 22.3
- c24 #98: auto: no burst of numbers: no two numbers came less than half the set gap apart | 2 bursts, fastest 0.12, 5th percentile 10.191, 95th 13.198
