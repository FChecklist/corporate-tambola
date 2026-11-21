# Release 1.11.2 (21 Nov 2026): the two audits of 1.11.1 - not deployed

Written for a person or AI session that has not seen this work. Read `09-RELEASE-1.11.0.md` and `10-RELEASE-1.11.1.md` first: this release changes little on top of them. No secret, key or personal address is in this page. The money flag `PAY_VIA_MONEYPENNY` is off and no payment code is touched; payments go only through IT Services by Rajat Agarwal and Razorpay.

## Why a new version
1.11.0 is live (commit `8a4a0be`, deployment `1366bf89`; rollback `edd21023` = 1.10.2). 1.11.1 (head `0b2155e`) was audited twice and both audits said FAIL (one Medium and three Medium). The head changes, so the number changes: 1.11.2. Everything not live ships in it.

## What is new
| What | Where | Setting |
|---|---|---|
| Player data-request mail is capped four ways a day: per game, per requester network, per organizer mailbox (all games) and for the whole site (the owner's side). Over the widest cap passed: ONE digest, then nothing. Requests are always stored | `dataRequestMailTurns` in `apps/edge/src/mail-lanes.ts`; called by `mailBoth` in `apps/edge/src/rights.ts` | `DATAREQ_MAIL_PER_GAME_DAY` 10, `DATAREQ_MAIL_PER_IP_DAY` 10, `DATAREQ_MAIL_PER_RECIPIENT_DAY` 10, `DATAREQ_MAIL_PER_DAY` 30 (0 = no cap) |
| The Help Desk limit of 3 invitations a day to one address counts the mailbox (`+tag` dropped; Gmail dots and `googlemail` folded) | `canonMailbox` in `mail-lanes.ts`; `helpdesk.ts` | none |
| The player's answer after "delete me" says the organizer got a note only when it did | `rights.ts` (`mailBoth` returns it, the answer has `organizerTold`) | none |
| Counters are one statement, so parallel requests are counted exactly | `countCap`, `anonMailAllowed` in `mail-lanes.ts` | none |
| A busy answer in the Help Desk keeps the hourly place; the guide text says a paused invitation was not sent | `helpdesk.ts`, `apps/web/public/guide.js`, `zsw.js` cache v47 | none |
| The owner's personal address is not in any test or tool file; masked role mailboxes in the hand-over transcripts | tests, `tools/`, `tests/e2e`, `docs/handover-2026-10-26` | none |

The counters are `kv` rows `mailcap/<hour or day>/...` (keys: `datareq/<game>`, `datareq-ip/<hash>`, `datareq-rcpt/<hash>`, `datareq-all`, `hdinvite`), deleted by the hourly tick after 48 hours (`lanesTick`). No address and no network address is in a key: only short hashes.

## How the caps work (so a change keeps them true)
- The organizer's side walks mailbox, then network, then game; the owner's side walks site, then network, then game. A count of 0 (cap off, or a database that could not count) is skipped.
- The first count over a cap is `cap + 1`: that request sends the ONE digest; later ones are held. A narrower cap only decides while every wider one is still under its cap, so one mailbox gets at most `cap + 1` mails a day and the owner at most `30 + 1`.
- `canonMailbox` is for counting only. Never use it for sending, and never for the Organizer's sign-in match (that uses the exact-address hash).

## Rules a future change must keep
- A cap on mail must never stop the thing it is mailing about: the request and the deletion are stored and carried out before the mail question is asked.
- A digest carries no player name, ticket number, note or request id.
- A database that cannot count never blocks a mail.
- Text that says someone was told must be true for the case where the mail was held back.
- Which mails are bulk: ONLY the draft reminder.
- Any change after a deploy is a new version: `releases.json` (feeds the footer, `/version.json` and the owner's release page), `package.json`, `CHANGELOG.md`, this folder.

## Tests
- `apps/edge/test/rights.test.ts`: "1.11.2 (audit M1)" (site, mailbox, alias spellings, network, hashed keys, the answer to a deleting player).
- `apps/edge/test/helpdesk.test.ts`: alias spellings, no dot folding outside Gmail, a busy answer keeps the place.
- `apps/edge/test/release-1-11-2.test.ts`: the version places, the whole-repository address scan, parallel counters, the caps' order, the 48-hour clean-up, guide text and cache name, settings lists.
- Each was shown red by removing its fix (a throwaway mutation, then restored): site scope, mailbox scope, network scope, `canonMailbox`, the Help Desk key, the answer text, both counters, the busy order, a fixture put back, the guide text, the cache name, the version.

## Open (owner / BOSS)
1. Two independent audits on the exact head commit, then a deploy by BOSS (`cd pages && wrangler pages deploy public`). No migration, no secret needed: all settings are optional.
2. Everything open in `09-RELEASE-1.11.0.md`, `10-RELEASE-1.11.1.md` and `05-OPEN-ITEMS.md` stays open.
3. The old address text stays in the history of git; removing it needs a decision to rewrite history.
4. The caps are a ceiling, not a lock: many networks and many helper accounts can still fill the site-wide caps.

## Roll back
Deploy 1.11.0 (`8a4a0be`, deployment `1366bf89`). Nothing in the database changes (the counters are `kv` rows the old code ignores).

## Checks
- `bun test packages apps tools/control-worker` on the tree this commit was made from: **4438 pass, 1 skip, 0 fail** (4439 tests, 285 files). 1.11.1 had 4414 pass in 284 files: this release adds 24 tests and one test file (`release-1-11-2.test.ts`).
- `bun run typecheck` (`tsc --noEmit`): 430 error lines, the same number the audits found on 1.11.1 and 1.11.0; none is in `apps/*/src`, in `apps/web/public` or in a test file this release adds. They are old and were not fixed here.
- Red without the fix: 13 throwaway mutations, each removing ONE fix (site scope, mailbox scope, network scope, `canonMailbox`, the Help Desk key, the answer text, `countCap`, `anonMailAllowed`, the busy order, an owner fixture put back, the guide text, the cache name, the version). Every one turned at least one new test red; every file was restored afterwards.
- Not run: the ten 250-player games (nothing they cover was changed). Not deployed, not merged.
