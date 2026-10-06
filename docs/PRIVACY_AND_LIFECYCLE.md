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
| **Internal audit log** (security and audit only; see "The internal audit log" below): what was done, by which kind of user, when (server UTC), full network address, country, network number, full browser string, device id, and for an AI key the program that fetched it and what the AI declared about itself | 365 days, deleted with the engagement | `audit_log` table (`apps/edge/src/audit.ts`), sealed with `DATA_KEY`, hash-chained, insert-only |
| Anonymous statistics of that log, and a deletion certificate (engagement id, date, number of rows, final hash) | kept | `audit_stats`, `audit_cert`: no names, numbers, network addresses or device ids |
| Owner access log: when the owner read, downloaded, verified or had an engagement's log analysed | kept | `audit_access`: no personal data |
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

## The internal audit log (added 2026-10-06)

Corporate Tambola is a one-time game. We keep an internal log of what happened in each engagement, for **security, dispute and legal purposes only** (DPDP Rules 6 and 8(3): reasonable security safeguards, and logs kept for a year).

* **Who can read it.** Nobody who plays or runs the game: not participants, hosts, co-hosts, organizers or their AI assistants. There is no download for them. Only the owner of the platform (the platform key holder) can read or download it, and only the owner can have it analysed. Every such use is itself written to an access log. An AI vendor never receives network addresses or device ids: analysis runs on counts only.
* **What is recorded** for each action (create, edit, delete, publish, pay, start, pause, resume, stop, announce, join, claim, vote, prize, erase request, change of phone, invite, sign-in, failed attempts, and refused attempts by an AI key to publish, pay or erase): who did it (organizer, host, co-host, participant, AI key, system, owner), what, the server's time (UTC; this is the authority) next to the time and zone the device reports, the full network address, country and network number, the full browser string, browser and system, the device id (the phone's own random id; a hash of it is also kept), a short summary of the fields changed, and a request reference. For an AI key: the program that fetched the page, the key id and what the AI declared about itself (model, version, session, machine), marked as declared, observed or inferred, and flagged when they disagree.
* **Never recorded:** passwords, one-time codes, card or bank details, keys.
* **How it is protected.** Every identifying value is sealed (AES-256-GCM, same `DATA_KEY` as names and numbers). Rows can only be added; each row carries the hash of the one before, so a removed or edited row is detected (`GET /api/owner/audit/<id>/verify`).
* **Deletion.** The log is deleted with its engagement at 365 days (sign-in and refused-attempt rows that belong to no engagement, 365 days after they were written). Before that we write an anonymous count by kind of event, country and AI vendor, and a deletion certificate (engagement id, date, number of rows, final hash). Those two hold no personal data and are kept. A legal hold set by the owner stops the deletion until it is lifted.

### Text for the privacy page (`tools/make-legal-pages.mjs`, not edited here)

> **Security log.** To keep the game fair and to protect you and us, we keep a security and audit log of what is done in each engagement: the action, who did it (organizer, co-host, participant or an AI assistant's key), the time, your network address, country, browser and device identifier. For an AI assistant's key we also keep which program fetched the page and what the assistant says it is. We never log passwords, one-time codes or card or bank details. The log is encrypted, can be read only by us, and is used only for security, disputes and legal duties (DPDP Rules 6 and 8(3)). It is deleted automatically with the engagement, 365 days after the game ends; before that we keep only anonymous totals and a deletion record that contain no personal data.

