# Corporate Tambola: the exhaustive checklist (2026-10-24)

How to read this. Every line has an ID, a pass rule and the check that proves it. Status is one of: GREEN (a named check passed 3 times in a row on the final code), RED (a check failed, defect logged), OPEN (not yet run).
No line is GREEN on someone's word. Six sigma means at most 3.4 failures in a million chances; sampling cannot prove that, so what is shown is the number of runs and the number of failures, never a rounded claim.

## 1. Parameters (what is measured)

| # | Parameter | Pass rule |
|---|---|---|
| P1 | Function | every button, field and rule does what its label says, in every role |
| P2 | Timing | number gap = chosen gap +-1 s on every phone; countdown 9..1 shown, silent; breaks exact length; check-in opens 5 minutes before start |
| P3 | Correct result | the same winners on every phone, the console and the report; game ends only for the stated reasons |
| P4 | Input | every field refuses bad input with a plain sentence and says what to do next |
| P5 | Output | every screen, e-mail and report is true to what happened |
| P6 | Readability | text 16 px or more for what a player must read, contrast 4.5:1, no word a non-technical person would not know |
| P7 | Idiot proof | each screen has one obvious next step; no dead end; nothing needs a manual |
| P8 | Fool proof | double tap, back button, reload, second tab, second phone, bad network: no wrong state |
| P9 | Privacy (DPDP) | consent before data; data minimised; deleted within 24 h; winners' evidence 365 days; rights (see, correct, delete) work |
| P10 | E-mail | the right mail goes to the right person once, on time, with the right content |
| P11 | Payment | pay by organizer / by someone else via link; UPI, card, net banking; details captured; invoice to payer + organizer + host; game unlocks by itself |
| P12 | Scale | 10, 100, 250, 500, 1000 people; server answers stay fast; no failed calls |
| P13 | Security | roles enforced on the server; no data of others reachable; tokens not guessable |
| P14 | Resilience | server restart, slow network, phone asleep, drand slow: the game recovers |
| P15 | Compatibility | Chrome (Chromium), Firefox, Safari engine, small and large phones, desktop |
| P16 | Accessibility | labels, focus order, keyboard use, contrast |

## 2. New organizer, start to end (N)

| ID | Step | Checks |
|---|---|---|
| N1 | Arrives on the site | home page loads, one clear button, video link, demo game link; P6 P16 |
| N2 | Asks for a game | e-mail only; Terms box; no password; wrong e-mail refused with a sentence |
| N3 | First sign-in | 6-digit code (option 1) and one-tap link (option 2) both work; code expires in 10 min; 5 wrong tries stop; resend works |
| N4 | Stays signed in | closes the browser, comes back: still in; Sign out works; other device works |
| N5 | Step 1 date and time | past time refused, time zone shown (India), quick form and steps agree |
| N6 | Step 2 players | Demo game 10 / Rs 0 first; sizes; own number; speed 9 / 12; rounds; who can join; Only my employees; what must a person give; guests bringing people; each choice has a one-line hint |
| N7 | Step 3 prizes | each prize on/off, count, text; ties rule; saved and read back |
| N8 | Step 4 brand | name, colour, logo (size), opening, breaks, closing, lucky draw; Test it |
| N9 | Step 5 team | add Host / Co-host; links; limits |
| N10 | Step 6 people | contacts, type, paste, CSV, PDF + Excel sheet, preview, wrong rows fixed, duplicates, limit; personal links, WhatsApp, common link |
| N11 | Step 7 publish | contact details, consent K1, link, free for 10 people |
| N12 | Step 8 pay | see section 7 |
| N13 | Step 9 game day | Pause, Resume, End, announce, hand over prizes, who is present |
| N14 | Step 10 after | report mail and page; erase data; data deleted within 24 h |

## 3. Existing organizer / host makes a new game (X)

X1 sign in by code; X2 sign in by link; X3 Games list shows every game; X4 New game from scratch; X5 Create like this one (copies settings, not people); X6 Host makes a game as Organizer; X7 switch role; X8 last place remembered (same link returns to the same screen); X9 forgot code = same e-mail process; X10 old game data already erased: clear message.

## 4. Participant, start to end (T)

| ID | Step | Checks |
|---|---|---|
| T1 | Opens link | page loads on a 360 px phone; one clear sentence; consent boxes unticked |
| T2 | Joins: mobile / ID / both | each mode; wrong ID waits; outsider by mobile; personal link; common link; invited by a guest |
| T3 | Waiting screen | countdown to start, what to do, rules readable |
| T4 | Check-in (5 min before) | name + mobile confirm/edit, invite chain fixed, own 4-digit code, Submit hidden until all done, 5 wrong tries lock 10 min |
| T5 | Ticket | readable numbers, tap marks, undo, 1 or 2 tickets, brand strip |
| T6 | Numbers arrive | gap correct, countdown 9..1, voice on/off, big number readable |
| T7 | Claim | button only when possible; right claim wins; wrong claim = Bogey, 2 Bogeys out; claim before the next number |
| T8 | Result | same winners everywhere, prize list, confirm name/number after win |
| T9 | Game ends | when last prize is confirmed OR all 90 numbers are called OR organizer ends; message true |
| T10 | Reload / asleep / offline | resumes, no burst of numbers, nothing lost |
| T11 | Second phone same ticket | refused with a plain sentence; organizer can move it |
| T12 | Late join | sees only numbers after joining; wins computed right |
| T13 | Data rights | see, correct, delete; leave the game |
| T14 | After | report not needed; data gone within 24 h |

## 5. Host, start to end (H)

H1 opens personal link; H2 Finish setup (e-mail code, mobile); H3 stays signed in; H4 runs numbers by button (any gap); H5 Pause / Resume; H6 sees who is present; H7 cannot see the Pay or erase steps that are the organizer's; H8 own common link and list; H9 all my games, new game as Organizer.

## 6. Game ways (W)

W1 auto 9 s; W2 auto 12 s; W3 manual; W4 all prizes claimed; W5 nobody claims (90 numbers); W6 wrong claim; W7 two tickets; W8 brand breaks; W9 pause/resume; W10 late joiners; W11 background phones; W12 check-in on; W13 organizer ends early; W14 two rounds; W15 tie rules (share / next).

## 7. Payment and invoice (Y)

Y1 organizer pays in console; Y2 payment link forwarded and paid by another person (no login); Y3 UPI, card, net banking offered; Y4 PayPal (not built: needs a PayPal business account, owner decision); Y5 payer name, e-mail, GST number, address captured; Y6 invoice e-mailed to payer, organizer and host; Y7 game unlocks by itself after payment; Y8 failed or cancelled payment leaves the game unpaid with a clear message; Y9 double payment does not double charge; Y10 credit after a cancelled paid game; Y11 refund policy shown.

## 8. E-mails (M)

Sign-in (code + link), game published, payment receipt/invoice, payment link, Host invitation, end-of-game report, data erased notice, rights request answers, uptime alarm. For each: goes to the right person, once, within a minute (report within about 5 minutes after the end), subject and body true, link works.

## 9. Sizes and load (S)

S10, S100, S250, S500, S1000. Real Chrome pages: as many as the laptop holds (measured, stated). Remaining phones: the real phone code over the real network. Server answers p50/p95/p99, failures = 0, writes within the daily budget.

## 10. Tools

Playwright + real Chrome (all scenarios); Bun test (about 2,600 checks: routes, rules, wording); k6 (load, sections 9); Lighthouse (speed, accessibility, SEO of pages); axe (contrast and labels); OWASP ZAP (security scan); manual read-through of every shipped sentence.

## 11. Status

Filled in as runs finish: see `docs/RUN_LOG_2026-10-24.md`.
