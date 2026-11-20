# Changelog (Corporate Tambola)

Newest first. The owner-only release list the site reads is `apps/edge/src/releases.json`; this file adds the PR and audit lines the version standard asks for (marketing-ledger/plans/VERSION-AND-KNOWLEDGE-STANDARD-2026-11-20.md). Earlier releases (1.0.0 to 1.9.0) are in `releases.json`.

## 1.10.1 - 2026-11-21
### Fixed (audit of PR #26 head 7bad139: audit 1 FAIL, audit 2 PASS)
- **"Paste a list" in the default console was refused by the real Worker** (audit 1, High 1). The paste call carried no Terms consent (K6), so the server answered 400 `consent-required` ("Please tick the box to continue") and no ID was added; the screen has no box to tick. `apps/web/public/pack/zc-flow.js` now sends the same consent as `zc.js` (`CBConsent.payload(null, "K6")`).
- **A pasted list of more than 200 IDs is sent in parts of 200** (audit 1, Medium 2), like `zc.js`. Before, one call over 200 got 413.
- **Found while testing the above: choosing the size did not reach the server until Save and continue.** A new game holds 10 people, so a paste of more than 10 IDs before Save was refused ("This game is for 10 people"). The paste now saves the chosen size first (`audienceSettings`).
- A paste of IDs that are already on the list now says "N were already on your list" instead of only "0 IDs were added".
- `apps/web/public/pack/MANIFEST.json` sha updated for `zc-flow.js`.
### Merged
- master `d5c9419` (1.9.2 mail fallback, PR 32; F38/F39 pause fix, PR 24) merged into the branch (audit 1, Medium 3). `CHANGELOG.md` and `apps/edge/src/releases.json` hold 1.10.1, 1.10.0 (never deployed) and 1.9.2. `zgame.js` is master's bundle with only the invite maximum changed 4 to 10 (hand-patched: bundles do not rebuild byte for byte under this Bun); `zsw.js` cache `ct-game-v44` (master v43).
### Tests (each goes red when its fix is removed)
- `apps/web/test/zc-flow-id-default.test.ts` now calls the REAL `handle` (`apps/edge/src/worker`) for every call the pack makes, not the `with-terms` helper that adds the consent by itself. Without the consent fix 4 of 5 tests fail; with one call instead of parts of 200 the 450-ID test fails; without the size save the 450-ID test fails.
### Known and not changed (unchanged from 1.10.0, owner's choice)
- Audit 2 (second audit of 7bad139) Medium 1 and 2: the wrong-ID guess cap is per network address only, and counts every unlisted ID, so one office on one WiFi can reach 30.
- Audit 2 Low: after a paste the console shows only the first refused row's reason, and the server's `raw` is empty for an ID row (`people.ts:273`), so a refused row is not named. The invite log shows at most 300 waiting and 300 listed rows without a "truncated" note (`people.ts:504-520`).
- `/who` still returns first name and initial for a listed ID in older games.

## 1.10.0 - 2026-11-21
### Added
- **ID-only invite (owner-approved 20 Nov 2026).** Where: `apps/web/public/pack/zc-flow.js` (default console, step 2), `apps/web/public/zc.js` (previous screens), `apps/web/public/z.js` (join page), `apps/edge/src/empid.ts` (one ID rule), `apps/edge/src/people.ts` (list, waiting room, invite log), `apps/edge/src/worker.ts` (join). People are invited with an ID alone; an ID not on the list waits for the Organizer's yes or no. A-1101, A 1101 and A/1101 are one ID. Family number 1 to 10 (default 4).
- **Invite and approval log**: `GET /api/z/{id}/people/log`, ID only (no name, no number). The Organizer and Hosts see every row; a Co-host sees only their own; a guest is refused.
- Console voice: "you", never "I" (`docs/CONSOLE_VOICE.md`, `console-voice.test.ts`).
### Fixed (audit round 1 of PR #26, 21 Nov 2026)
- **The default console now makes an ID game by itself** (audit High 1). It sends `verify: "id"` when it creates the game and again when step 2 is saved (`zc-flow.js`, `audienceSettings`). Before, a game made by the default console was a mobile-number game: "Paste a list" added 0 IDs and a join with an ID was refused. The vendored copy is changed here; the same change must be made in the console repo (`feat/id-invite-pack-2026-11-20`) so the next `vendor-pack` run keeps it.
- **A pasted list that cannot be added says why** instead of "0 IDs were added" (`zc-flow.js`).
- **A person listed before the uniform rule, in ID-and-mobile mode, with a dash in the stored ID (A-1101) still gets in** instead of the waiting room (audit 2, M1): the stored ID is compared in its cleaned form (`worker.ts`, join).
### Tests added (audit Medium 3)
- `apps/web/test/zc-flow-id-default.test.ts`: the default console against the real Worker, no manual PATCH.
- `apps/edge/test/id-invite-audit2.test.ts`: the old-form ID with a dash (audit 2, M1), phone-only join in a list-only game, unlisted ID in an open game, a real guest ticket on the log, Co-host scope, an ID from another game, a declined ID in five spellings and a late yes, forged inputs, another organizer's key and no key.
### Known and not changed
- Audit 1, Medium 2 (an open game in ID mode lets a person who gives only a mobile number in): not changed. It is the older, tested design for outsiders (`verify.test.ts`, `join-matrix`, `join-global` would fail), the new screens never make such a game (they make list-only games, where a phone number alone waits), and the unlisted-ID-waits line now has a test that goes red. Closing the old door is the owner's choice.
- Audit 1, Low (`POST /api/z/{id}/who` still returns first name and last initial for a listed ID): not changed; an older tested feature (`who.test`), the join page no longer calls it, and a new ID game holds no names.
- Audit 2, M2 (IDs can be guessed: only wrong IDs are counted, 30 per network per 10 minutes): not changed. A cap that counts right IDs too would lock out a whole office or hall that sits behind one address; it needs the owner's choice. Recommended before game day.
- Audit 2, M3 (the waiting room holds 500, `WAITING_MAX`): not changed; the same on master; a number the owner must choose.
- Late joiners after the 24-hour erase get a new waiting row with an ID (the same on master).
- A game made before the uniform rule that stored an ID with punctuation is found only if the invitee types the same punctuation (`empid.ts`). Whether any live game holds old-form IDs cannot be read from the cloud: check before deploy.
- `zc-flow.js` no longer bans the word "invit" in its text (the owner's own sentences use it).
- `zc.js` still has 89 first-person strings (allowed by the owner rule: older screens may only improve).
- PR: https://github.com/FChecklist/corporate-tambola/pull/26. Audit: round 1 FAIL (audit 1), fixed here; two PASS audits on the exact commit are needed before deploy. Rollback id: the previous deploy in `docs/DEPLOYS.md`.

## 1.9.2 - 2026-11-20
### Fixed
- **Invoice, receipt and organizer mails fall back to Cloudflare Email when Resend cannot take them.** Where: `apps/edge/src/pay.ts` (`resendSend`, `cloudflareSend`). The live Resend account's MONTHLY quota ran out (mail log: `send_failed 429 monthly_quota_exceeded`), so retrying Resend could not help. Now: Resend first; a quota answer, a busy answer (429) after two more tries, a 5xx or no answer sends the SAME mail once through Cloudflare Email Service (`POST /accounts/<id>/email/sending/send`) with the SAME idempotency key; a plain refusal (4xx) is never repeated or sent a second way; after a quota answer Resend is skipped for 30 minutes. Each provider call has a 4 s time limit. The scheduled retry tries Resend once per tick (the tick is the loop).
### Added
- Mail log outcomes `resend_failed <why>; sent_by_cloudflare` and `send_failed <why>; cloudflare <status> [code<n>]` (provider names and codes only, never text or addresses).
- Settings `CF_EMAIL_TOKEN` and `CF_ACCOUNT_ID` (Pages secrets, both in `config/SECRETS_NAMES.md`). WITHOUT BOTH the behaviour is exactly 1.9.1: the second route is off until the owner sets them.
### Security / privacy
- `mail_event` (hash of the address, subject, outcome) is now deleted after 3 days by the hourly tick and listed in `docs/RETENTION.md` (audit of PR 30, M1).
- Tests: `apps/edge/test/mail-fallback.test.ts` (15 tests; 14 breaks of the code each went red, then restored).
- PR: see the pull request of branch `boss/mail-fallback-cloudflare-1.9.2`. Audit: pending (two audits before deploy). Rollback id: the 1.9.1 deploy `8706cf94-f0ab-4e90-9784-fa06da7e24c4`.

## 1.9.1 - 2026-11-20
### Fixed
- **Payment and invoice e-mails are tried again within minutes.** Where: `apps/edge/src/pay.ts` (`resendSend`, `retryRecentOutbox`), `apps/edge/src/worker.ts` (`runTick`). A busy or briefly-down mail service (429, 5xx, no answer) is tried again at once with one idempotency key; a mail that still fails is tried again by every scheduled tick (waits of 2, 4, 8, 16, 32 minutes, six tries, newest first, three a tick) instead of waiting for the once-a-day job.
### Added
- **A refused mail now says why.** Where: the mail log (`mail_event`, outcome `send_failed <status> <error name>`), read by the owner. Only the provider's error name is kept, never its free text or the address.
- Setting `MAIL_RETRY_MS` (optional, default 800): the wait before the first re-try. Listed in `config/SECRETS_NAMES.md`.
- Root cause analysis of the Rs 1 live payment (3 of its 4 mails refused, no reason kept): `docs/RCA-NO-INVOICE-MAIL-2026-11-20.md`.
- PR: see the pull request of branch `boss/rca-no-invoice-mail-2026-11-20`. Audit: pending (two audits before deploy). Rollback id: the previous deploy in `docs/DEPLOYS.md`.
