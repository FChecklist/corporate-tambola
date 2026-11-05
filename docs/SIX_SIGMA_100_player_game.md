# Six sigma, step by step: 100-player game

Source runs: k100, kz100auto, kz100host (102 games). Counted from the real run files; nothing is rounded up.

An *opportunity* is each person, ticket, claim, prize position, number delivered or game that a check looked at. A *defect* is a failed one. Six sigma = at most 3.4 defects per million opportunities, and it is called *proven* only when the sample is large enough that the 95% upper bound is below 3.4 per million.

## Journey steps (counted in the games)

| Step | Opportunities | Defects | Defects per million | 95% upper bound per million | Sigma level (+1.5 shift) | Verdict |
|---|---:|---:|---:|---:|---:|---|
| E1 End-of-game report is sent and right | 100 | 0 | 0.0 | 30,000.0 | 4.08 | no defect seen; the sample (100) is too small to prove 3.4 per million (needs about 880,000) |
| O1 Organizer account made | 102 | 0 | 0.0 | 29,411.8 | 4.08 | no defect seen; the sample (102) is too small to prove 3.4 per million (needs about 880,000) |
| O2 Game created | 102 | 0 | 0.0 | 29,411.8 | 4.08 | no defect seen; the sample (102) is too small to prove 3.4 per million (needs about 880,000) |
| O3 Settings saved | 100 | 0 | 0.0 | 30,000.0 | 4.08 | no defect seen; the sample (100) is too small to prove 3.4 per million (needs about 880,000) |
| O4 People list added | 81 | 0 | 0.0 | 37,037.0 | 4.00 | no defect seen; the sample (81) is too small to prove 3.4 per million (needs about 880,000) |
| O5 Game published | 102 | 0 | 0.0 | 29,411.8 | 4.08 | no defect seen; the sample (102) is too small to prove 3.4 per million (needs about 880,000) |
| O6 Payment, unlock and invoice | 443 | 0 | 0.0 | 6,772.0 | 4.55 | no defect seen; the sample (443) is too small to prove 3.4 per million (needs about 880,000) |
| P1 Allowed people get a ticket | 8,815 | 1 | 113.4 | 449.2 | 5.19 | BELOW six sigma |
| P10 Every winner really completed the house | 417 | 0 | 0.0 | 7,194.2 | 4.54 | no defect seen; the sample (417) is too small to prove 3.4 per million (needs about 880,000) |
| P11 Every winner's claim was in time | 411 | 0 | 0.0 | 7,299.3 | 4.53 | no defect seen; the sample (411) is too small to prove 3.4 per million (needs about 880,000) |
| P12 Prize distribution follows the claims | 411 | 16 | 38,929.4 | 60,438.0 | 3.26 | BELOW six sigma |
| P13 Prize positions in order of completion | 411 | 0 | 0.0 | 7,299.3 | 4.53 | no defect seen; the sample (411) is too small to prove 3.4 per million (needs about 880,000) |
| P14 Server and phones agree on the winners | 100 | 0 | 0.0 | 30,000.0 | 4.08 | no defect seen; the sample (100) is too small to prove 3.4 per million (needs about 880,000) |
| P15 The game ends when it should | 190 | 0 | 0.0 | 15,789.5 | 4.29 | no defect seen; the sample (190) is too small to prove 3.4 per million (needs about 880,000) |
| P16 Numbers keep the chosen speed | 4,023 | 1 | 248.6 | 984.3 | 4.98 | BELOW six sigma |
| P17 No burst of numbers | 4,023 | 30 | 7,457.1 | 10,374.2 | 3.93 | BELOW six sigma |
| P18 No phone error | 8,649 | 0 | 0.0 | 346.9 | 5.36 | no defect seen; the sample (8,649) is too small to prove 3.4 per million (needs about 880,000) |
| P19 Every number reaches every phone within 6 s (measured on all phones) | 177,989 | 1331 | 7,478.0 | 7,885.4 | 3.93 | BELOW six sigma |
| P19 Every number reaches every phone within 6 s (reference phone only) | 472 | 1 | 2,118.6 | 8,389.8 | 4.36 | BELOW six sigma |
| P2 People not allowed in are held back | 786 | 0 | 0.0 | 3,816.8 | 4.72 | no defect seen; the sample (786) is too small to prove 3.4 per million (needs about 880,000) |
| P3 People without an employee ID are asked for it | 304 | 0 | 0.0 | 9,868.4 | 4.44 | no defect seen; the sample (304) is too small to prove 3.4 per million (needs about 880,000) |
| P4 Tickets are well formed | 8,554 | 0 | 0.0 | 350.7 | 5.35 | no defect seen; the sample (8,554) is too small to prove 3.4 per million (needs about 880,000) |
| P5 No two tickets are the same | 12,879 | 0 | 0.0 | 232.9 | 5.45 | no defect seen; the sample (12,879) is too small to prove 3.4 per million (needs about 880,000) |
| P6 Every phone gets the same numbers in order | 17,046 | 1 | 58.7 | 232.3 | 5.35 | BELOW six sigma |
| P7 Every phone reaches the end | 8,649 | 0 | 0.0 | 346.9 | 5.36 | no defect seen; the sample (8,649) is too small to prove 3.4 per million (needs about 880,000) |
| P8 Every phone shows the same winners | 8,649 | 0 | 0.0 | 346.9 | 5.36 | no defect seen; the sample (8,649) is too small to prove 3.4 per million (needs about 880,000) |
| P9 Every claim is true on the claimer's ticket | 12,543 | 0 | 0.0 | 239.2 | 5.45 | no defect seen; the sample (12,543) is too small to prove 3.4 per million (needs about 880,000) |

All journey steps together: 276,351 opportunities, 1381 defects (4,997.3 per million).

## Rule steps (millions of trials against an independent check, no network)

Run: 2026-10-25T08:28:28.113Z, 1,000,000 trials per step.

| Step | Trials | Defects | Defects per million | 95% upper bound per million | Verdict |
|---|---:|---:|---:|---:|---|
| S1 ticket is well-formed | 1,000,000 | 0 | 0 | 3 | SIX SIGMA (proven by the sample) |
| S2 tickets of one game are all different | 1,000,000 | 0 | 0 | 3 | SIX SIGMA (proven by the sample) |
| S3 number draw is 90 different numbers, same on every phone | 1,000,080 | 0 | 0 | 3 | SIX SIGMA (proven by the sample) |
| S4 house completed at exactly the right call | 1,000,010 | 0 | 0 | 3 | SIX SIGMA (proven by the sample) |
| S5 best of two tickets; the two-ticket house | 1,000,000 | 0 | 0 | 3 | SIX SIGMA (proven by the sample) |
| S6 prize distribution (positions, order, tie-break) | 1,000,002 | 0 | 0 | 3 | SIX SIGMA (proven by the sample) |
| S7 a typed mobile number is read correctly | 1,000,000 | 0 | 0 | 3 | SIX SIGMA (proven by the sample) |
| S8 check-in codes never repeat inside a game | 1,000,000 | 0 | 0 | 3 | SIX SIGMA (proven by the sample) |
| S9 an employee ID is read correctly | 1,000,000 | 0 | 0 | 3 | SIX SIGMA (proven by the sample) |
| S11 game settings: valid accepted, invalid refused | 1,000,000 | 0 | 0 | 3 | SIX SIGMA (proven by the sample) |
| S12 who wins what (completion + claim + deadline + wrong claims + tie rule + positions) | 4,452,186 | 0 | 0 | 0.67 | SIX SIGMA (proven by the sample) |
| S13 the permanent settings record holds no person | 1,000,000 | 0 | 0 | 3 | SIX SIGMA (proven by the sample) |

