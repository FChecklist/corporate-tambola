# The 20-game rehearsal (owner order 2026-10-10)

**What this is.** Twenty full games, played on this laptop only, with 1,000 made-up people each, a made-up Razorpay, a made-up clock and calendar. Nothing touches the real site, the real Razorpay, real e-mail or a real phone. Ten games give every person 1 ticket, ten give 2 tickets. Every game uses a different mix of options. When something breaks I fix it, play it again, and only when everything passes do I deploy.

## Safety (same rules as `docs/SIMULATION_PLAN.md`)
- The test server refuses any request that leaves the laptop (`blockedFetches` must stay empty).
- Fake Razorpay lives on the laptop (own port). Fake keys, fake secret, fake webhook secret. Real keys are never loaded.
- E-mails are caught in a box, never sent. Phone numbers are made up (9xxxxxxxxx).
- At most **3 games at once** (each has its own server, database and clock). Before each wave I check free memory; if it is low I run 2, then 1.

## The cast of every game
1 Organizer, 1 Host, 1 Co-host, 1,000 participants: about 100 "level 1" (on the organizer's list or joined directly, allowed to invite) who bring about 150 "level 2" (joined through a level-1 invite), the rest join directly or from the people list. Each has a made-up name and mobile number.

## What changes from game to game (a 20-row table, `tools/sim2/campaign/matrix.mjs`)
| Factor | Values (each used at least twice per ticket mode) |
|---|---|
| Tickets | 1 (G01-G10) or 2 (G11-G20) |
| Payment story | UPI ok, card ok, netbanking ok, wallet ok, authorised-then-captured, browser closed (webhook only), verify + webhook both (no double charge), tampered signature then correct, failed then retry, double-click, Host pays, Co-host pays, pay link by a third person, US$ card from abroad, paid late after the start, paid by credit after a cancel |
| Clock and calendar | ordinary day, just before midnight IST, month end, year end (31 Dec to 1 Jan), 29 Feb 2028, financial-year change (31 Mar to 1 Apr, invoice numbers), game across midnight, 30-day-ahead limit, game rescheduled, late-night start |
| Breaks | none; brand breaks (file / video / slides / speech); lucky draws (draw and scratch-card, 1 / 3 / 5 / 10 winners); opening and closing brand slots; the maximum number of breaks |
| Houses (prizes) | the classic seven, all 19 houses, Unlucky, Full Two-Ticket House (2-ticket games), many winners per house |
| Rounds and speed | 1 to 5 rounds, gaps of 6 / 9 / 12 seconds |
| Who can join | anyone with the link, only people on the list, waiting room (admit, decline, approve all), invites on or off, people removed mid-game |
| Mid-game actions | announcements by Organizer, Host, Co-host; pause and resume; a phone loses its network and returns; late joiners; a second phone trying to use the same ticket |

## What is checked in every game
1. Money: fake Razorpay order, signature check, webhook signature, nobody charged twice, the invoice (IST date and time, paid for, paid via, payer, organizer, Razorpay record, page-2 terms, keep-note), invoice numbers in order, `PAYTEST` page flows.
2. Roles: the full permission matrix (what Host and Co-host can and cannot do); one ticket per phone; the waiting room; invite limits (level 2 cannot invite).
3. Play: every phone shows the same numbers as the public reference; identical winners on all 1,000 phones; per-house maximum winners; lucky-draw winners are real participants, drawn once; Unlucky goes to the right ticket; breaks pause the numbers for the right seconds; late joiners see only their own numbers.
4. After the game: prizes confirmed and "prize given"; the report e-mail; guest data erased 20 hours after the end; all personal data gone; the 365-day records kept; e-mail only to the team.
5. Safety: free-plan write budget (80,000 per day), no outbound requests, no script errors.

## The loop
Play a game, collect every failure, fix the code, add a test for the fix, play the game again, then the next. After all 20 pass, a second full pass with different random seeds, the full unit test suite, a typecheck, and a written audit (`docs/CAMPAIGN_REPORT.md`: what was tested, what failed, what was fixed, what is still open).

## Deploy (only after a clean pass)
Corporate Tambola runs on **Cloudflare** (Pages + D1). It has no Supabase part and no GitHub remote (the repository is local on purpose, because old history holds a key that must be scrubbed before any push). So: apply any database change to D1 first, then deploy Pages, then check the live site read-only. The sister DPDP app (Supabase, GitHub `FChecklist/compliance-tracker`) is not touched by this campaign.

## Honest limits
- A phone browser is not used for 1,000 players (no laptop could); each is the real phone program (`PhoneRuntime`) run without a screen. Real Chrome is used for the Organizer, Host and a few players (screens, buttons, the Razorpay window stand-in).
- Fake Razorpay behaves as its public documentation says. It cannot prove Razorpay's real review, real UPI apps or real bank behaviour. That is the later, separate Razorpay step.
