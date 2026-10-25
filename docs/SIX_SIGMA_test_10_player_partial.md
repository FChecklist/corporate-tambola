# Six sigma, step by step: test 10-player partial

Source runs: k10 (6 games). Counted from the real run files; nothing is rounded up.

An *opportunity* is each person, ticket, claim, prize position, number delivered or game that a check looked at. A *defect* is a failed one. Six sigma = at most 3.4 defects per million opportunities, and it is called *proven* only when the sample is large enough that the 95% upper bound is below 3.4 per million.

## Journey steps (counted in the games)

| Step | Opportunities | Defects | Defects per million | 95% upper bound per million | Sigma level (+1.5 shift) | Verdict |
|---|---:|---:|---:|---:|---:|---|
| O1 Organizer account made | 6 | 0 | 0.0 | 500,000.0 | 2.88 | no defect seen; the sample (6) is too small to prove 3.4 per million (needs about 880,000) |
| O2 Game created | 6 | 0 | 0.0 | 500,000.0 | 2.88 | no defect seen; the sample (6) is too small to prove 3.4 per million (needs about 880,000) |
| O3 Settings saved | 6 | 0 | 0.0 | 500,000.0 | 2.88 | no defect seen; the sample (6) is too small to prove 3.4 per million (needs about 880,000) |
| O4 People list added | 2 | 0 | 0.0 | 1,500,000.0 | 2.17 | no defect seen; the sample (2) is too small to prove 3.4 per million (needs about 880,000) |
| O5 Game published | 6 | 0 | 0.0 | 500,000.0 | 2.88 | no defect seen; the sample (6) is too small to prove 3.4 per million (needs about 880,000) |
| P1 Allowed people get a ticket | 58 | 0 | 0.0 | 51,724.1 | 3.88 | no defect seen; the sample (58) is too small to prove 3.4 per million (needs about 880,000) |
| P10 Every winner really completed the house | 22 | 0 | 0.0 | 136,363.6 | 3.50 | no defect seen; the sample (22) is too small to prove 3.4 per million (needs about 880,000) |
| P11 Every winner's claim was in time | 22 | 0 | 0.0 | 136,363.6 | 3.50 | no defect seen; the sample (22) is too small to prove 3.4 per million (needs about 880,000) |
| P12 Prize distribution follows the claims | 22 | 0 | 0.0 | 136,363.6 | 3.50 | no defect seen; the sample (22) is too small to prove 3.4 per million (needs about 880,000) |
| P13 Prize positions in order of completion | 22 | 0 | 0.0 | 136,363.6 | 3.50 | no defect seen; the sample (22) is too small to prove 3.4 per million (needs about 880,000) |
| P14 Server and phones agree on the winners | 6 | 0 | 0.0 | 500,000.0 | 2.88 | no defect seen; the sample (6) is too small to prove 3.4 per million (needs about 880,000) |
| P15 The game ends when it should | 12 | 0 | 0.0 | 250,000.0 | 3.23 | no defect seen; the sample (12) is too small to prove 3.4 per million (needs about 880,000) |
| P16 Numbers keep the chosen speed | 343 | 0 | 0.0 | 8,746.4 | 4.48 | no defect seen; the sample (343) is too small to prove 3.4 per million (needs about 880,000) |
| P17 No burst of numbers | 343 | 0 | 0.0 | 8,746.4 | 4.48 | no defect seen; the sample (343) is too small to prove 3.4 per million (needs about 880,000) |
| P18 No phone error | 58 | 0 | 0.0 | 51,724.1 | 3.88 | no defect seen; the sample (58) is too small to prove 3.4 per million (needs about 880,000) |
| P19 Every number reaches every phone within 6 s (measured on all phones) | 2,137 | 0 | 0.0 | 1,403.8 | 5.00 | no defect seen; the sample (2,137) is too small to prove 3.4 per million (needs about 880,000) |
| P19 Every number reaches every phone within 6 s (reference phone only) | 83 | 0 | 0.0 | 36,144.6 | 4.01 | no defect seen; the sample (83) is too small to prove 3.4 per million (needs about 880,000) |
| P2 People not allowed in are held back | 6 | 0 | 0.0 | 500,000.0 | 2.88 | no defect seen; the sample (6) is too small to prove 3.4 per million (needs about 880,000) |
| P3 People without an employee ID are asked for it | 6 | 0 | 0.0 | 500,000.0 | 2.88 | no defect seen; the sample (6) is too small to prove 3.4 per million (needs about 880,000) |
| P4 Tickets are well formed | 58 | 0 | 0.0 | 51,724.1 | 3.88 | no defect seen; the sample (58) is too small to prove 3.4 per million (needs about 880,000) |
| P5 No two tickets are the same | 87 | 0 | 0.0 | 34,482.8 | 4.03 | no defect seen; the sample (87) is too small to prove 3.4 per million (needs about 880,000) |
| P6 Every phone gets the same numbers in order | 116 | 0 | 0.0 | 25,862.1 | 4.13 | no defect seen; the sample (116) is too small to prove 3.4 per million (needs about 880,000) |
| P7 Every phone reaches the end | 58 | 0 | 0.0 | 51,724.1 | 3.88 | no defect seen; the sample (58) is too small to prove 3.4 per million (needs about 880,000) |
| P8 Every phone shows the same winners | 58 | 0 | 0.0 | 51,724.1 | 3.88 | no defect seen; the sample (58) is too small to prove 3.4 per million (needs about 880,000) |
| P9 Every claim is true on the claimer's ticket | 118 | 0 | 0.0 | 25,423.7 | 4.13 | no defect seen; the sample (118) is too small to prove 3.4 per million (needs about 880,000) |

All journey steps together: 3,661 opportunities, 0 defects (0.0 per million).

## Rule steps (millions of trials against an independent check, no network)

Run: 2026-10-25T04:06:43.590Z, 20,000 trials per step.

| Step | Trials | Defects | Defects per million | 95% upper bound per million | Verdict |
|---|---:|---:|---:|---:|---|
| S1 ticket is well-formed | 20,000 | 0 | 0 | 150 | no defect seen; the sample (20,000) is too small to prove 3.4 per million (needs about 880,000) |
| S2 tickets of one game are all different | 60,000 | 0 | 0 | 50 | no defect seen; the sample (60,000) is too small to prove 3.4 per million (needs about 880,000) |
| S3 number draw is 90 different numbers, same on every phone | 20,070 | 0 | 0 | 149.48 | no defect seen; the sample (20,070) is too small to prove 3.4 per million (needs about 880,000) |
| S4 house completed at exactly the right call | 20,009 | 0 | 0 | 149.93 | no defect seen; the sample (20,009) is too small to prove 3.4 per million (needs about 880,000) |
| S5 best of two tickets; the two-ticket house | 20,000 | 0 | 0 | 150 | no defect seen; the sample (20,000) is too small to prove 3.4 per million (needs about 880,000) |
| S6 prize distribution (positions, order, tie-break) | 20,001 | 0 | 0 | 149.99 | no defect seen; the sample (20,001) is too small to prove 3.4 per million (needs about 880,000) |
| S7 a typed mobile number is read correctly | 20,000 | 0 | 0 | 150 | no defect seen; the sample (20,000) is too small to prove 3.4 per million (needs about 880,000) |
| S8 check-in codes never repeat inside a game | 20,000 | 0 | 0 | 150 | no defect seen; the sample (20,000) is too small to prove 3.4 per million (needs about 880,000) |
| S9 an employee ID is read correctly | 20,000 | 0 | 0 | 150 | no defect seen; the sample (20,000) is too small to prove 3.4 per million (needs about 880,000) |
| S11 game settings: valid accepted, invalid refused | 20,000 | 0 | 0 | 150 | no defect seen; the sample (20,000) is too small to prove 3.4 per million (needs about 880,000) |
| S12 who wins what (completion + claim + deadline + wrong claims + tie rule + positions) | 1,000 | 0 | 0 | 3000 | no defect seen; the sample (1,000) is too small to prove 3.4 per million (needs about 880,000) |
| S13 the permanent settings record holds no person | 20,000 | 0 | 0 | 150 | no defect seen; the sample (20,000) is too small to prove 3.4 per million (needs about 880,000) |

