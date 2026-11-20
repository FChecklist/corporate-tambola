# Changelog (Corporate Tambola)

Newest first. The owner-only release list the site reads is `apps/edge/src/releases.json`; this file adds the PR and audit lines the version standard asks for (marketing-ledger/plans/VERSION-AND-KNOWLEDGE-STANDARD-2026-11-20.md). Earlier releases (1.0.0 to 1.9.0) are in `releases.json`.

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

## 1.9.1 - 2026-11-20
### Fixed
- **Payment and invoice e-mails are tried again within minutes.** Where: `apps/edge/src/pay.ts` (`resendSend`, `retryRecentOutbox`), `apps/edge/src/worker.ts` (`runTick`). A busy or briefly-down mail service (429, 5xx, no answer) is tried again at once with one idempotency key; a mail that still fails is tried again by every scheduled tick (waits of 2, 4, 8, 16, 32 minutes, six tries, newest first, three a tick) instead of waiting for the once-a-day job.
### Added
- **A refused mail now says why.** Where: the mail log (`mail_event`, outcome `send_failed <status> <error name>`), read by the owner. Only the provider's error name is kept, never its free text or the address.
- Setting `MAIL_RETRY_MS` (optional, default 800): the wait before the first re-try. Listed in `config/SECRETS_NAMES.md`.
- Root cause analysis of the Rs 1 live payment (3 of its 4 mails refused, no reason kept): `docs/RCA-NO-INVOICE-MAIL-2026-11-20.md`.
- PR: see the pull request of branch `boss/rca-no-invoice-mail-2026-11-20`. Audit: pending (two audits before deploy). Rollback id: the previous deploy in `docs/DEPLOYS.md`.
