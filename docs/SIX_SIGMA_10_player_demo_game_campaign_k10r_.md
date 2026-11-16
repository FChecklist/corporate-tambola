# Six sigma, step by step: 10-player demo game (campaign k10r)

Source runs: k10r, k10, v3, v12 (123 games). Counted from the real run files; nothing is rounded up.

An *opportunity* is each person, ticket, claim, prize position, number delivered or game that a check looked at. A *defect* is a failed one. Six sigma = at most 3.4 defects per million opportunities, and it is called *proven* only when the sample is large enough that the 95% upper bound is below 3.4 per million.

## Journey steps (counted in the games)

| Step | Opportunities | Defects | Defects per million | 95% upper bound per million | Sigma level (+1.5 shift) | Verdict |
|---|---:|---:|---:|---:|---:|---|
| E1 End-of-game report is sent and right | 110 | 0 | 0.0 | 27,272.7 | 4.11 | no defect seen; the sample (110) is too small to prove 3.4 per million (needs about 880,000) |
| O1 Organizer account made | 123 | 0 | 0.0 | 24,390.2 | 4.15 | no defect seen; the sample (123) is too small to prove 3.4 per million (needs about 880,000) |
| O2 Game created | 123 | 0 | 0.0 | 24,390.2 | 4.15 | no defect seen; the sample (123) is too small to prove 3.4 per million (needs about 880,000) |
| O3 Settings saved | 123 | 0 | 0.0 | 24,390.2 | 4.15 | no defect seen; the sample (123) is too small to prove 3.4 per million (needs about 880,000) |
| O4 People list added | 99 | 0 | 0.0 | 30,303.0 | 4.07 | no defect seen; the sample (99) is too small to prove 3.4 per million (needs about 880,000) |
| O5 Game published | 123 | 0 | 0.0 | 24,390.2 | 4.15 | no defect seen; the sample (123) is too small to prove 3.4 per million (needs about 880,000) |
| O6 Payment, unlock and invoice | 4 | 0 | 0.0 | 750,000.0 | 2.65 | no defect seen; the sample (4) is too small to prove 3.4 per million (needs about 880,000) |
| P1 Allowed people get a ticket | 1,207 | 0 | 0.0 | 2,485.5 | 4.84 | no defect seen; the sample (1,207) is too small to prove 3.4 per million (needs about 880,000) |
| P10 Every winner really completed the house | 498 | 0 | 0.0 | 6,024.1 | 4.59 | no defect seen; the sample (498) is too small to prove 3.4 per million (needs about 880,000) |
| P11 Every winner's claim was in time | 501 | 0 | 0.0 | 5,988.0 | 4.59 | no defect seen; the sample (501) is too small to prove 3.4 per million (needs about 880,000) |
| P12 Prize distribution follows the claims | 501 | 6 | 11,976.0 | 23,554.9 | 3.76 | BELOW six sigma |
| P13 Prize positions in order of completion | 501 | 0 | 0.0 | 5,988.0 | 4.59 | no defect seen; the sample (501) is too small to prove 3.4 per million (needs about 880,000) |
| P14 Server and phones agree on the winners | 123 | 0 | 0.0 | 24,390.2 | 4.15 | no defect seen; the sample (123) is too small to prove 3.4 per million (needs about 880,000) |
| P15 The game ends when it should | 234 | 0 | 0.0 | 12,820.5 | 4.36 | no defect seen; the sample (234) is too small to prove 3.4 per million (needs about 880,000) |
| P16 Numbers keep the chosen speed | 5,655 | 0 | 0.0 | 530.5 | 5.25 | no defect seen; the sample (5,655) is too small to prove 3.4 per million (needs about 880,000) |
| P17 No burst of numbers | 5,655 | 1 | 176.8 | 700.3 | 5.07 | BELOW six sigma |
| P18 No phone error | 1,196 | 0 | 0.0 | 2,508.4 | 4.84 | no defect seen; the sample (1,196) is too small to prove 3.4 per million (needs about 880,000) |
| P19 Every number reaches every phone within 6 s (measured on all phones) | 31,030 | 0 | 0.0 | 96.7 | 5.66 | no defect seen; the sample (31,030) is too small to prove 3.4 per million (needs about 880,000) |
| P19 Every number reaches every phone within 6 s (reference phone only) | 600 | 0 | 0.0 | 5,000.0 | 4.64 | no defect seen; the sample (600) is too small to prove 3.4 per million (needs about 880,000) |
| P2 People not allowed in are held back | 130 | 0 | 0.0 | 23,076.9 | 4.17 | no defect seen; the sample (130) is too small to prove 3.4 per million (needs about 880,000) |
| P3 People without an employee ID are asked for it | 129 | 0 | 0.0 | 23,255.8 | 4.16 | no defect seen; the sample (129) is too small to prove 3.4 per million (needs about 880,000) |
| P4 Tickets are well formed | 1,153 | 0 | 0.0 | 2,601.9 | 4.83 | no defect seen; the sample (1,153) is too small to prove 3.4 per million (needs about 880,000) |
| P5 No two tickets are the same | 1,790 | 0 | 0.0 | 1,676.0 | 4.95 | no defect seen; the sample (1,790) is too small to prove 3.4 per million (needs about 880,000) |
| P6 Every phone gets the same numbers in order | 2,338 | 0 | 0.0 | 1,283.1 | 5.02 | no defect seen; the sample (2,338) is too small to prove 3.4 per million (needs about 880,000) |
| P7 Every phone reaches the end | 1,196 | 0 | 0.0 | 2,508.4 | 4.84 | no defect seen; the sample (1,196) is too small to prove 3.4 per million (needs about 880,000) |
| P8 Every phone shows the same winners | 1,196 | 1 | 836.1 | 3,311.0 | 4.64 | BELOW six sigma |
| P9 Every claim is true on the claimer's ticket | 2,418 | 0 | 0.0 | 1,240.7 | 5.03 | no defect seen; the sample (2,418) is too small to prove 3.4 per million (needs about 880,000) |

All journey steps together: 58,756 opportunities, 8 defects (136.2 per million).

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

