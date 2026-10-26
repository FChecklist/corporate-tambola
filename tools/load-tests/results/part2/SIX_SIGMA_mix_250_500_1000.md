# Six sigma, step by step: mix 250-500-1000

Source runs: m250, m500, m1000a, m1000b, m1000c (45 games). Counted from the real run files; nothing is rounded up.

An *opportunity* is each person, ticket, claim, prize position, number delivered or game that a check looked at. A *defect* is a failed one. Six sigma = at most 3.4 defects per million opportunities, and it is called *proven* only when the sample is large enough that the 95% upper bound is below 3.4 per million.

## Journey steps (counted in the games)

| Step | Opportunities | Defects | Defects per million | 95% upper bound per million | Sigma level (+1.5 shift) | Verdict |
|---|---:|---:|---:|---:|---:|---|
| E1 End-of-game report is sent and right | 45 | 0 | 0.0 | 66,666.7 | 3.79 | no defect seen; the sample (45) is too small to prove 3.4 per million (needs about 880,000) |
| O1 Organizer account made | 45 | 0 | 0.0 | 66,666.7 | 3.79 | no defect seen; the sample (45) is too small to prove 3.4 per million (needs about 880,000) |
| O2 Game created | 45 | 0 | 0.0 | 66,666.7 | 3.79 | no defect seen; the sample (45) is too small to prove 3.4 per million (needs about 880,000) |
| O3 Settings saved | 45 | 0 | 0.0 | 66,666.7 | 3.79 | no defect seen; the sample (45) is too small to prove 3.4 per million (needs about 880,000) |
| O4 People list added | 35 | 0 | 0.0 | 85,714.3 | 3.69 | no defect seen; the sample (35) is too small to prove 3.4 per million (needs about 880,000) |
| O5 Game published | 45 | 0 | 0.0 | 66,666.7 | 3.79 | no defect seen; the sample (45) is too small to prove 3.4 per million (needs about 880,000) |
| O6 Payment, unlock and invoice | 197 | 0 | 0.0 | 15,228.4 | 4.30 | no defect seen; the sample (197) is too small to prove 3.4 per million (needs about 880,000) |
| P1 Allowed people get a ticket | 20,047 | 0 | 0.0 | 149.6 | 5.56 | no defect seen; the sample (20,047) is too small to prove 3.4 per million (needs about 880,000) |
| P10 Every winner really completed the house | 182 | 0 | 0.0 | 16,483.5 | 4.28 | no defect seen; the sample (182) is too small to prove 3.4 per million (needs about 880,000) |
| P11 Every winner's claim was in time | 183 | 0 | 0.0 | 16,393.4 | 4.28 | no defect seen; the sample (183) is too small to prove 3.4 per million (needs about 880,000) |
| P12 Prize distribution follows the claims | 183 | 0 | 0.0 | 16,393.4 | 4.28 | no defect seen; the sample (183) is too small to prove 3.4 per million (needs about 880,000) |
| P13 Prize positions in order of completion | 183 | 0 | 0.0 | 16,393.4 | 4.28 | no defect seen; the sample (183) is too small to prove 3.4 per million (needs about 880,000) |
| P14 Server and phones agree on the winners | 45 | 0 | 0.0 | 66,666.7 | 3.79 | no defect seen; the sample (45) is too small to prove 3.4 per million (needs about 880,000) |
| P15 The game ends when it should | 86 | 0 | 0.0 | 34,883.7 | 4.02 | no defect seen; the sample (86) is too small to prove 3.4 per million (needs about 880,000) |
| P16 Numbers keep the chosen speed | 1,628 | 0 | 0.0 | 1,842.8 | 4.93 | no defect seen; the sample (1,628) is too small to prove 3.4 per million (needs about 880,000) |
| P17 No burst of numbers | 1,628 | 0 | 0.0 | 1,842.8 | 4.93 | no defect seen; the sample (1,628) is too small to prove 3.4 per million (needs about 880,000) |
| P18 No phone error | 19,638 | 0 | 0.0 | 152.8 | 5.55 | no defect seen; the sample (19,638) is too small to prove 3.4 per million (needs about 880,000) |
| P19 Every number reaches every phone within 6 s (measured on all phones) | 507,218 | 36 | 71.0 | 96.1 | 5.30 | BELOW six sigma |
| P19 Every number reaches every phone within 6 s (reference phone only) | 132 | 0 | 0.0 | 22,727.3 | 4.17 | no defect seen; the sample (132) is too small to prove 3.4 per million (needs about 880,000) |
| P2 People not allowed in are held back | 1,668 | 0 | 0.0 | 1,798.6 | 4.93 | no defect seen; the sample (1,668) is too small to prove 3.4 per million (needs about 880,000) |
| P3 People without an employee ID are asked for it | 585 | 0 | 0.0 | 5,128.2 | 4.64 | no defect seen; the sample (585) is too small to prove 3.4 per million (needs about 880,000) |
| P4 Tickets are well formed | 19,354 | 0 | 0.0 | 155.0 | 5.55 | no defect seen; the sample (19,354) is too small to prove 3.4 per million (needs about 880,000) |
| P5 No two tickets are the same | 28,795 | 0 | 0.0 | 104.2 | 5.64 | no defect seen; the sample (28,795) is too small to prove 3.4 per million (needs about 880,000) |
| P6 Every phone gets the same numbers in order | 38,583 | 0 | 0.0 | 77.8 | 5.71 | no defect seen; the sample (38,583) is too small to prove 3.4 per million (needs about 880,000) |
| P7 Every phone reaches the end | 19,638 | 0 | 0.0 | 152.8 | 5.55 | no defect seen; the sample (19,638) is too small to prove 3.4 per million (needs about 880,000) |
| P8 Every phone shows the same winners | 19,638 | 0 | 0.0 | 152.8 | 5.55 | no defect seen; the sample (19,638) is too small to prove 3.4 per million (needs about 880,000) |
| P9 Every claim is true on the claimer's ticket | 20,524 | 0 | 0.0 | 146.2 | 5.56 | no defect seen; the sample (20,524) is too small to prove 3.4 per million (needs about 880,000) |

All journey steps together: 700,395 opportunities, 36 defects (51.4 per million).

