# Rehearsal report — 20 full games, extras, audit (2026-10-10)

Everything ran on one laptop. Fake Razorpay, fake clock and calendar, made-up people and mobile numbers. Nothing left the machine. Plan: `CAMPAIGN_20_GAMES.md`.

## What was played
| Part | What | Result |
|---|---|---|
| 20 games (G01–G10 one ticket, G11–G20 two tickets) | 1,000 people each (about 220 on the full phone program, the rest light stand-ins), organizer + Host + Co-host, level-1 and level-2 guests, waiting room, lists, invites, breaks, lucky draws, 1–5 rounds, all prize houses, 15 payment stories, 10 calendar cases | **20/20 clean, 1,513 checks, 0 failed** |
| Extras (`tools/sim2/campaign/extras.mjs`) | Reschedule before start (earlier, later, past refused, 31 days refused, 29 days accepted, paid game movable, locked after start); paid after the financial year changed (31 Mar 23:40 → 2026-27, 1 Apr 00:15 → 2027-28, series restarts at 000001, IST dates); Host and Co-host invitation links (counted per person, made-up code and retired Co-host not credited) | **34/34** |
| Pause / resume / extend / stop (`tools/sim/pause.ts`, 300 phones, outages, lying and stale edges) | | **61/61** |
| Browser scenarios (real Chrome, `tools/sim2/scenarios/ui`) | 102 scenarios across sign-in, console, team, guests, pay, lifecycle, play, responsive, brand | **102/102** (S02-06 timed out once on a starved laptop, passed alone in 29 s) |
| Earlier browser end-to-end (3 phones, late joiner, winners) | | passed |
| Unit tests | 1,282 tests; web package 210/210 | all pass when run alone; under load 1–5 timed out or hit a chance match (see limits) |

## Real bugs found and fixed
1. Invoice financial year was counted in UTC, not Indian time.
2. Prize results could come out in the wrong order when computed late.
3. Tickets were skewed (70 and 80 on every ticket) — fixed with an even spread, tests added.
4. Local server crashed on start with a repeated column.
5. Phone in sideways position showed the ticket below the fold — new landscape layout (number left, ticket right).
6. The row under the called number showed six old numbers — now three.

## Deployed
Cloudflare Pages `corporate-tambola`; D1 not changed. No real game was in progress at the time (only old test games). Not pushed to GitHub (local-only repo).

## Honest limits
- 1,000 people = about 220 full phones plus about 780 light stand-ins; 1,000 full phones overload an 8 GB laptop.
- Some tests are timing-sensitive on a starved laptop (5-second timeouts; one privacy test matches a 4-digit number by chance). They pass alone.
- Fake Razorpay follows the documented API; the real one is only proven when the domain is approved and a real Re 1 payment is made.
- A vote naming more than 500 tied seats is refused (not reachable in practice).
- USD, International Payments and the DPDP payment flow are not part of this rehearsal.

## Next (owner step)
Razorpay domain approval for Corporate Tambola, then one real Re 1 test.
