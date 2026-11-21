# Release 1.11.1 (21 Nov 2026): the leftovers of the 1.11.0 audits - not deployed

Written for a person or AI session that has not seen this work. Read `09-RELEASE-1.11.0.md` first: this release changes little on top of it. No secret, key or personal address is in this page. The money flag `PAY_VIA_MONEYPENNY` is off and is not touched.

## Why a new version
1.11.0 is live (commit `8a4a0be`, Cloudflare Pages deployment `1366bf89`; rollback `edd21023` = 1.10.2). After the deploy one more commit, `9101a27`, went onto the same pull request and said "version stays 1.11.0". That is wrong under the owner's rule: **any change after a deploy is a new version**. So that commit and the audit leftovers below are 1.11.1. Master holds none of 1.11.x (PR #37 is open and unmerged), so this branch starts from the PR #37 head.

## What is new
| What | Where | Setting |
|---|---|---|
| A game's data-request mail is capped per day: the organizer and the owner get the first 10, then ONE digest each, then nothing that day. The request is always stored and listed for the owner; an erasure still happens at once | `dataRequestMailTurn` in `apps/edge/src/mail-lanes.ts`; called by `mailBoth` in `apps/edge/src/rights.ts` | `DATAREQ_MAIL_PER_GAME_DAY` (default 10, 0 = no cap) |
| Help Desk invitation mail has a site-wide cap per hour (on top of 5 an hour per helper and 3 a day per recipient) | `hourlyMailAllowed` in `mail-lanes.ts`; called in `apps/edge/src/helpdesk.ts` (`/api/helpdesk/invite`) | `HD_INVITE_MAIL_PER_HOUR` (default 30, 0 = no cap) |
| The organizer note says "sending limit", never "monthly" or "daily" | `ORGANIZER_NOTE_BACKUP`, `ORGANIZER_NOTE_LATE` in `mail-lanes.ts` | none |
| Release lines and docs say what the code does (only the draft reminder is bulk; only bulk is held back by the do-not-mail list; the sign-up cap covers one path) | `apps/edge/src/releases.json`, `docs/RETENTION.md`, comments | none |
| Personal mailbox addresses in older docs are masked | `docs/` | none |

The counters are `kv` rows `mailcap/<hour or day>/...`, deleted by the hourly tick after 48 hours (`lanesTick`).

## Rules a future change must keep
- A cap on mail must never stop the thing it is mailing about: the data request and the erasure are stored and carried out before the mail question is asked.
- A digest carries no player name, ticket number, note or request id.
- A database that cannot count never blocks a mail (the caps answer "send").
- Which mails are bulk: ONLY the draft reminder. The Help Desk invitation, sign-in code, invoice and the rest are transactional.
- The organizer note must stay true for a daily and a monthly limit; the CRITICAL alert still needs a monthly answer.
- Any change after a deploy is a new version: `releases.json`, `CHANGELOG.md`, this folder, then the page footer (the build writes it from `releases.json`).

## Tests
- `apps/edge/test/rights.test.ts`: "1.11.1 (audit 2, M-A)", four tests (cap at 3, per game and per day, default 10 and 0, an erasure held back for mail is still done).
- `apps/edge/test/helpdesk.test.ts`: the site-wide invitation cap and its default.
- `apps/edge/test/mail-quota-organizer.test.ts`: "1.11.1" (the notes name no period; a daily answer does not say monthly).
- `apps/edge/test/release-1-11-1-docs.test.ts`: the version is in every place, the release lines, the "reminders and invitations" wording, masked addresses.

## Open (owner / BOSS)
1. Two independent audits on the exact head commit, then a deploy by BOSS. No migration, no secret needed: both settings are optional.
2. Everything open in `09-RELEASE-1.11.0.md` and `05-OPEN-ITEMS.md` stays open: `MAIL_WARMUP_START`, the Resend webhook secret, DMARC `rua=`, an uptime check on `/api/status/mail`, Turnstile, `List-Unsubscribe`.
3. Test files and `tools/` still use the owner's address as a fixture; they are not docs. Replace them when those tests are next touched.

## Roll back
Deploy 1.11.0 (`8a4a0be`, deployment `1366bf89`). Nothing in the database changes in this release (the new counters are `kv` rows that the old code ignores).
