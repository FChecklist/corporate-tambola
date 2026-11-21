# Changelog (Corporate Tambola)

Newest first. The owner-only release list the site reads is `apps/edge/src/releases.json`; this file adds the PR and audit lines the version standard asks for (marketing-ledger/plans/VERSION-AND-KNOWLEDGE-STANDARD-2026-11-20.md). Earlier releases (1.0.0 to 1.9.0) are in `releases.json`.

## 1.11.0 - 2026-11-21
Stacked release on the 1.10.2 branch (PR #36, head `38521ef`): PR #34 (mail lanes, rebased) and PR #35 (Host number fix and the ten 250-player games, rebased) in ONE pull request. Not deployed. Needs two independent audits on the exact head commit before any deploy. The 1.9.2 Resend-then-Cloudflare fallback is already live; it is not changed here. Money flag `PAY_VIA_MONEYPENNY` stays off.
### Fact that shaped this release
- On 21 Nov 2026 Resend answered `429 monthly_quota_exceeded`. Mail must then go by Cloudflare Email (1.9.2), the organizer must be told honestly, and the owner must be warned BEFORE the month runs out (80 %).
### Added (from PR #34, branch `claude/intelligent-mendel-gacbp5`, heads `fe8e358` and `46519b1`; it was "1.9.3" there)
- **Two mail lanes.** Where: `apps/edge/src/mail-lanes.ts`, `apps/edge/src/pay.ts` (`sendMail` option `lane`, `bulkSend`, `drainBulkMail`), `apps/edge/src/worker.ts` (`runTick`). Transactional mail (invoice, payment, receipt, game start, sign-in code, AI and Host links, data requests: everything not marked bulk) is never refused or delayed by anything in the bulk lane. Bulk mail (the draft reminder, the Help Desk invitation, anything sent with `{ lane: "bulk" }`) has its own counter and ramp, makes ONE try at Resend (never the Cloudflare route), and waits in `mail_bulk_queue` (24 hours). Half of the daily limit and of the monthly quota is kept for transactional mail.
- **Warm-up of the young domain.** Day 1 is transactional mail only. Bulk caps by day: 0, 20, 30, 40, 50, 75, 100, 125, 150, 175, 200, 250, 300, 400, then 500. Day 1 = `MAIL_WARMUP_START` or the day the code first handled a mail.
- **Send counter and 80 % alert.** `mail_count` counts mails a provider ACCEPTED per day, lane and provider. At 80 % and at 100 % of `MAIL_MONTHLY_QUOTA` (default 3000, Resend only: Cloudflare mails are not counted against it) ONE log line `[mail-alert] ...` (numbers only) per month. Public `GET /api/status/mail`.
- **Per-mail delivery state.** The Resend mail id is kept in `mail_track`; the signed webhook `POST /api/mail/events` sets delivered, delayed, failed, bounced or complained (a later state is never overwritten by an earlier one).
- **Do-not-mail list.** A Permanent bounce or a complaint (from our own domain only) puts the address (hash and masked form) on `mail_suppress`; all send paths skip it. `GET|POST /api/owner/mail-suppress` (owner only).
- DMARC report intake: in PR #34 this is an owner step, not code (`docs/MAIL-DELIVERABILITY-OWNER-STEPS.md` section 2: add `rua=` to the `_dmarc` record, with Cloudflare DMARC Management or a read mailbox). No report parser was written; this release does not claim one.
- Settings `MAIL_MONTHLY_QUOTA`, `MAIL_DAILY_LIMIT`, `MAIL_WARMUP_START` (optional, `config/SECRETS_NAMES.md`). Migration `0033_mail_lanes.sql` (four new tables, additive). Owner steps (Resend webhook, DMARC `rua=` report intake, Gmail Postmaster Tools, plan upgrade or the Cloudflare route): `docs/MAIL-DELIVERABILITY-OWNER-STEPS.md`.
### Added (new in this release, because of the 21 Nov fact)
- **The provider's own word beats our counter.** Our counter only knows mails sent since this code ran, so on the day it is deployed it can be far below Resend's real number. When Resend answers 429 with a quota name, `noteProviderQuota` (`mail-lanes.ts`, called from `resendSend` in `pay.ts`) writes the CRITICAL alert line at once (once a month) and remembers it for 2 hours (`kv mail_quota_seen`). A plain rate-limit 429 does not.
- **The organizer is told honestly.** `GET /api/status/mail` has `organizer: { degraded: "none" | "backup" | "late", note }`. `backup`: the main service is used up and the Cloudflare route is set, so mail goes by it (a few minutes later, may land in Spam). `late`: used up and no backup route, so mail can be late and is retried every few minutes. The text never names a provider, never gives a number, and says the payment is not affected. The two screens that say "we e-mailed you your invoice" (`site.js` order-done sheet, `paykit.js` payment-done card) show it through `TB.mailNote` (`common.js`); if the status cannot be read they show nothing and are as before.
- Tests: `apps/edge/test/mail-quota-organizer.test.ts` (9; three of them go red when the `noteProviderQuota` call is removed), with `mail-lanes.test.ts` (32) and `mail-webhook.test.ts` (18) from PR #34.
### Fixed (from PR #35, branch `claude/youthful-pasteur-jpgax0`, found by the ten 250-player games)
- **A Host or Organizer could pick which beacon round decides a number (fairness).** Where: `packages/beacon/src/control.ts` (`publishControl`, `STALE_ROUND_REFUSAL`), `apps/edge/src/worker.ts` (control POST passes the store's own round). A signed Next / Resume / Pause was only checked against itself, so a Host who waited could look at the numbers the already-published beacon rounds would give, choose one and sign a press naming that old round (game 4: 32 candidate rounds, 27 different numbers, press accepted). The store now refuses any message whose round has already begun. Trade-off: a press must reach the store within about 3 to 6 seconds of being signed; a slow line may be told "Please press again". Residual risk: the store's clock is trusted for when a press arrived.
- **365 days after a game two small rows were left behind**: the claim-signal counter `cv/<game>` and the "phones listening" counters (`presence`). `apps/edge/src/lifecycle.ts` (`deleteEngagementRows`, hourly sweep). No name or number was in them.
- Ordinal names (21st, 22nd, 23rd): already in 1.10.2 (`packages/shared/src/ordinal.ts`); PR #35's own ordinal edits are NOT applied. Its test `apps/edge/test/ordinal-names.test.ts` is kept as an extra guard (it passes on the 1.10.2 code).
- Tests: `packages/beacon/test/control-freshness.test.ts`, `apps/edge/test/control-freshness.test.ts`, `apps/edge/test/retention-leftovers.test.ts` (each red without its fix).
### Added: ten 250-player games
- `tools/game250/` and `docs/250x10/`: ten complete 250-player games in the local test environment (no network, no payment, no production): scheduled start, Host starts, Host calls every number, Host stalls and the Organizer takes over, ID-only invite with intruders, late joiners who leave and return, pause and resume, every prize type up to the 25th winner, mail fan-out, end of game with report, 24-hour deletion and 365-day retention. `docs/250x10/RESULTS.md` is regenerated from the run on THIS code (`bun run tools/game250/run.ts all`, then `bun run tools/game250/report.ts`).
### Stacking notes
- PR #34 and #35 were cherry-picked (not merged) so no change of 1.9.x or master is dragged in twice. PR #34 applied with conflicts only in `CHANGELOG.md`, `releases.json` and `docs/KNOWLEDGE/README.md` (both sides kept). PR #35: its Host-fairness commit applied clean; its ordinal-and-retention commit conflicted in nine files over the ordinal, so only its retention part was re-applied by hand; its harness commit conflicted only in `CHANGELOG.md`; its generated results were not taken, they are regenerated. The PR #34 release number "1.9.3" is now 1.11.0 everywhere (code comments, docs, tests).
### Known limits (honest)
- The send counter starts at zero on deploy day and counts only mails sent through this site's `sendMail`; mail of other products on the same Resend account is not seen. The provider's quota answer is the safety net.
- A mail Resend takes but never delivers is only seen once the owner sets the Resend webhook (`RESEND_WEBHOOK_SECRET`).
- Rollback: deploy 1.10.1 (`4a18c29`). The four new tables stay and are ignored by the old code.

## 1.10.2 - 2026-11-21
Stacked release: PRs #22, #23 and #25 (each had two audit PASS, but on master `d5c9419` / 1.9.2) re-applied on top of 1.10.1 (`4a18c29`, PR #26). Needs its own two audits on the exact head commit before any deploy. Merge order: PR #26, then this branch.
### Fixed
- **Prize names (from PR #22, head `80e725b`)**: one shared ordinal helper (`packages/shared/src/ordinal.ts`): 21st, 22nd, 23rd; 11th, 12th, 13th stay "th". Used by `ticket.ts`, `gamelog.ts`, `lifecycle.ts`, `v2-certs.ts` and the screens `big.js`, `board.js`, `console.js`, `prize-planner.js`, `z.js`, `zc.js`. Tests: `packages/shared/test/ordinal.test.ts`, `apps/edge/test/ordinal-certs.test.ts`.
- **F28 scratch card in the finale (from PR #23, head `08cbfad`)**: the card is revealed before the game ends (auto-mark on); the finale waits for an open card or draw. `packages/engine/src/surprise.ts`, doc `docs/dev/06-BUSINESS-LOGIC.md` (G5a). Tests: `packages/engine/test/surprise.test.ts`.
### Changed
- **The organizer's limited AI key (`cta_`) may make the pay link (from PR #25, head `567ee8b`, owner ruling 20 Nov 2026)**: `POST /api/z/{id}/paylink`. It pays nothing; a person opens the link and pays. A game key (`ctg_`) and a Help Desk helper's key are still refused (403). Money settings are untouched; `PAY_VIA_MONEYPENNY` stays off. Tests: `apps/edge/test/ai-paylink.test.ts` and the updated paylink/helpdesk/param tests.
### Stacking notes (where PRs #22 and #25 overlapped PR #26)
- `apps/web/public/z.js`, `zc.js`, `zsw.js`: #22's ordinal change merged without a text conflict beside #26's ID-invite edits (different lines). `zsw.js` cache name: master v43, #26 and #22 both v44; this release is **`ct-game-v45`** because `z.js` and `zc.js` changed again after the v44 set that is live.
- `apps/edge/src/worker.ts`, `apps/web/public/guide.js`: #25's edits (AI manifest lines, the paylink gate, one guide entry) sit in other regions than #26's join/ID edits; both are kept.
- #23 touches only the engine and one doc: no overlap.

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
