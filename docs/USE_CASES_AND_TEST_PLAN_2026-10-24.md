# Corporate Tambola: use cases, test design and checklist (2026-10-24)

Rule for every item: it is GREEN only when a real Chrome (Playwright) session, a human-speed actor and the real clock passed it, 3 times in a row, on the final frozen code.
Anything else is OPEN. Nothing here is marked GREEN until the run exists in `C:\ct\test-sites\data\`.

## A. Who organizes (each is one scenario family)

| ID | Organizer case | Settings used |
|---|---|---|
| O1 | Employees only, ID only | Only my employees, verify = ID, list uploaded (PDF), no invites |
| O2 | Employees only, mobile + ID | Only my employees, verify = both |
| O3 | Employees and their families | list of employees (ID), guests may invite (family, 1 to 4) |
| O4 | Employees, vendors, customers | Everyone; employees by ID, others by mobile only |
| O5 | Vendors and customers only | list of mobiles, or anyone with the link; mobile |
| O6 | Everybody and their families | Everyone, invites on |
| O7 | Vendors and customers and their families | list or link, invites on |
| O8 | Demo game (10 people, Rs 0) | cap 10, nothing to pay, same console as any game |
| O9 | Open public game | anyone with the link, mobile |
| O10 | Many departments | one Co-host link per department, a cap on each |
| O11 | Host runs the numbers (manual) | Host presses Next number; any gap |
| O12 | Organizer is also the host | Organizer starts a game as Host/Organizer, switches role |
| O13 | Someone else pays | payment link forwarded, paid by a person who is not the organizer |
| O14 | Organizer pays | paid by the organizer in the console |

## B. How a game can be played (each is one scenario family)

| ID | Way of playing | What must hold |
|---|---|---|
| G1 | Auto, 9 s gap | each number every 9 s (+-1), countdown 9..1 silent, 90 numbers if nobody finishes the prizes |
| G2 | Auto, 12 s gap | same at 12 s |
| G3 | Manual (Host presses) | no fixed gap, phone shows the number within a few seconds of the press |
| G4 | Prizes all claimed | game stops when the last prize is confirmed, phones and big screen agree on the count |
| G5 | Nobody claims | all 90 numbers are called, gaps equal the setting, game ends with "all numbers called" |
| G6 | Wrong claim (bogey) | refused with a plain message, game goes on |
| G7 | Two tickets per person | claims on either ticket |
| G8 | Brand breaks | opening, mid-game breaks of the exact length, lucky draw, closing |
| G9 | Pause and resume | countdown resumes correctly on every phone |
| G10 | Late joiner | sees only numbers called after joining, can still claim later wins correctly |
| G11 | Phone in the background / offline | catches up without a burst that looks like 5-second numbers |
| G12 | Check-in (new rule) | ticket opens only after name, mobile confirm, 4-digit code, Submit |
| G13 | Resume by the same link | same person returns to the same screen |
| G14 | Organizer ends the game early | clear message on every phone, report accurate |
| G15 | Report | numbers called, winners, who was present; e-mailed and readable |

## C. Participant joining (each is one scenario)

P1 mobile only, P2 employee ID only, P3 mobile + ID, P4 wrong ID (waits for the organizer), P5 outsider in a mixed game (mobile only, comes in at once), P6 personal link, P7 common link, P8 invited by a guest (family), P9 removed by the organizer, P10 second phone for the same ticket (refused), P11 game full (waiting room), P12 consent boxes unticked (button stays off).

## D. Sizes

S10 (demo), S100, S250, S500, S1000 participants. Real Chrome sessions are limited by this laptop (8 GB): see section F.

## E. Tools (the Gemini list, checked against what is used)

| Tool | Use | Status |
|---|---|---|
| Playwright + real Chrome | all end-to-end scenarios above | in use (tools\scenarios.mjs, teams500.mjs, organizer-ui.mjs, pdf-probe.mjs) |
| Bun test (API and unit) | server rules, routes, wording locks | in use: about 2,600 checks |
| Postman / Bruno | API contracts | not used; the same job is done by the Bun route tests, which run on every change |
| k6 | load on the server | to run for the 500 and 1000 sizes (many phones asking the server at once) |
| OWASP ZAP | security scan | to run once against the local copy |
| Lighthouse | speed, accessibility, SEO of the pages | to run on the public pages and the ticket page |
| axe (accessibility) | colour contrast, labels | in the e2e job |

## F. The honest limit of this laptop

8 GB of memory, about 0.5 GB free with the editor open. One Chrome page needs 50 to 100 MB, so 100 real Chrome pages at once need 5 to 10 GB.
Plan: close everything else, measure how many real Chrome sessions fit, run that many as REAL human-speed Chrome sessions, and run the rest of the crowd as the same phone code (the real game logic, real network calls, real clock) without a screen.
The report will say exactly how many were real Chrome pages and how many were not. No number will be rounded up.

## G. Checklist (status updated as runs finish)

Code and rules
- [x] Server rules for ID / mobile / both / employees only: Bun tests (verify.test.ts)
- [x] Participant list: ID column, PDF upload, Excel sheet, preview before adding (pdf-probe: a real PDF read correctly, empty cell kept, a scan refused)
- [x] Demo game is a real game at 10 people and Rs 0, no DEMO mark on any screen
- [x] Three test sign-ins (demo1/2/3@xyz.in, code 123456), nothing e-mailed
- [ ] All Bun tests green (running)
- [ ] Type check clean for source files

Scenarios (3 green runs each, final code)
- [ ] G1 G2 G3 G4 G5 G6 G7 G8 G9 G10 G11 G12 G13 G14 G15
- [ ] O1 to O14
- [ ] P1 to P12
- [ ] S10 S100 S250 S500 S1000

Quality
- [ ] Colours and contrast (axe), readability on small phones, countdown visible and silent, every error has a plain next step
- [ ] Payment path (section H)
- [ ] Sister games: port, then the same scenarios

## H. Payment path to verify

1. The payment link can be forwarded and paid by someone else.
2. The organizer or host can pay in the console.
3. Methods offered at checkout: UPI, card, net banking (Razorpay), PayPal for international.
4. The details needed for the invoice are captured (name, e-mail, GST number if any, address).
5. The invoice goes to the payer, the organizer and the host.
6. After payment the game unlocks by itself.
