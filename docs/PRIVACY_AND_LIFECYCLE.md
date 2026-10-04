# Privacy and the life of a game's data (as built, 2026-10-03)

The promise we make, and what the software does to keep it. Nothing here is kept secret from organizers or participants: the same statements are in the e-mail and the PDF the organizer receives.

## What we hold, for how long

| Data | Held until | How it is held |
|---|---|---|
| Participants' names and mobile numbers | **within 24 hours of the game ending** (the job deletes them 22 hours after the end) | AES-256-GCM sealed (`apps/edge/src/pii.ts`), key = HKDF of the Worker secret `DATA_KEY`, never in the database; fresh nonce per record. The database also holds a salted one-way hash of the number (to find a person who comes back), deleted with the rest |
| Seats, device ids (hashed), invite links, join times, claims, over-votes | same 24 hours | plain rows, deleted together |
| Organizer / host / co-host details (name, e-mail, mobile) | 365 days | `contact/<id>` |
| Winners record: seat, prize, round, time | 365 days | `winner` table: no names, no numbers |
| Prize hand-over record: the name and mobile number each winner confirmed on their own phone (sealed), what they joined with if they changed it, the audit trail of changes, and the date the organizer ticked "prize given" | 365 days | `prize` table (`winners.ts`), sealed like the participants' records |
| Log of every call the organizer's AI assistant made: time, key id, what was asked, status, network address, program, country | 365 days | `ai_audit` table |
| Everything else about the engagement | 00:00 IST at the end of the 365th day after the game ended | `eraseEverything` |
| Backups of the database | roll off within **7 days** of any deletion | Cloudflare D1 |

## The clock

* The game's end is read from the public schedule (organizer's pauses and stop included), or sooner when at least `min(3, half the people)` different phones say the game is over, and never before 20 numbers.
* **Report:** starts 3 minutes after the end. The server prepares the people in chunks of 250 (a free Worker has ~10 ms CPU per call) and e-mails ONE link. The organizer's own browser (`/report.html`) fetches the pieces and lays the PDF out on their device, in parts of up to 1,500 people. The link works until the personal data is deleted; a reminder goes 6 hours before if it was never opened. The organizer and co-host can also open it from the console.
* **Deletion:** 22 hours after the end, whether or not the report could be sent (the promise does not wait for an e-mail).
* **365 days:** `fullDeleteAt(end)` = 00:00 IST at the end of the 365th day.
* The caller is the scheduled job (`apps/cron`, every minute, key `CRON_KEY`) hitting `POST /api/lifecycle/tick`. While it is not deployed, organizer requests and phones' end-of-game reports nudge the same function (at most once a minute per Worker instance): a safety net, not a clock.

## Ways to delete earlier

1. Console: "Delete all participant data now" (`POST /api/z/{id}/erase`, organizer only).
2. AI assistant: it can only **ask** (`POST /api/z/{id}/control/request {action:"erase"}`); nothing is deleted until the organizer confirms in the console, and the organizer is e-mailed.
3. E-mail to us from the organizer's registered address with "delete" and the engagement id (`POST /api/inbound-email`, authenticated by `INBOUND_SECRET`; needs the mail domain's inbound route, see below).

## Owner-only steps still open

* Deploy the scheduled job: a Cloudflare API token with *Workers Scripts: Edit* is needed (the current tokens cannot): `cd apps/cron && bun x wrangler@3 deploy`, then `wrangler secret put CRON_KEY` with the value in `config/live-secrets.txt`.
* Inbound e-mail: an MX route for the address organizers write to, and the mail service's inbound webhook pointed at `/api/inbound-email` with header `x-inbound-secret`.
* Lawyer review of the wording in the PDF and the e-mail.

## Limits we state honestly

* Names in non-Latin scripts print as `?` in the PDF (the PDF uses the standard fonts to stay small and fast).
* The winners recorded by phones (not checked by the organizer's console) are marked "by phone" in the report.
* Deletion is from our live systems within 24 hours; backups roll off within 7 days.
