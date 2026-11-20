# Changelog (Corporate Tambola)

Newest first. The owner-only release list the site reads is `apps/edge/src/releases.json`; this file adds the PR and audit lines the version standard asks for (marketing-ledger/plans/VERSION-AND-KNOWLEDGE-STANDARD-2026-11-20.md). Earlier releases (1.0.0 to 1.9.0) are in `releases.json`.

## Unreleased (proposed 1.9.2) - 2026-11-20
Found by ten 250-player test games (`docs/250x10/RESULTS.md`, harness `tools/game250/`). Not merged, not deployed.
### Fixed
- **A Host or Organizer could pick which beacon round decides a number (fairness).** Where: `packages/beacon/src/control.ts` (`publishControl`), `apps/edge/src/worker.ts` (control POST). A signed Next / Resume / Pause was only checked against itself, so a Host who waited could look at the numbers the already-published beacon rounds would give, choose one and sign a press naming that old round (game 4: 32 candidate rounds, 27 different numbers, press accepted). The store now refuses any message whose round has already begun. Trade-off: a press must reach the store within about 3 to 6 seconds of being signed, else the Host sees "That press did not go through. Please press again." (the words the guide already has).
- **The 21st, 22nd and 23rd winner were named "21th", "22th", "23th".** Where: the Organizer's game log and report (`lifecycle.ts`, `gamelog.ts`), certificates (`v2-certs.ts`), phone and organizer pages (`z.js`, `zc.js`, `console.js`, `big.js`, `board.js`). One shared `ordinalName` (`packages/shared/src/ticket.ts`) now spells every place; no file may keep its own copy (a test scans for it).
- **365 days after a game two small rows were left behind.** Where: `lifecycle.ts` (`deleteEngagementRows`, hourly sweep). The claim-signal counter `cv/<game>` and the "phones listening" counters (`presence`) were never deleted (the counters were "deleted after a day" only when somebody opened the console). Neither holds a name or number.
- Tests: `packages/beacon/test/control-freshness.test.ts`, `apps/edge/test/control-freshness.test.ts`, `apps/edge/test/ordinal-names.test.ts`, `apps/edge/test/retention-leftovers.test.ts` (each red before its fix, green after).
### Added
- `tools/game250/`: ten complete 250-player games in the local test environment (no network, no payment, no production) and `docs/250x10/RESULTS.md`.

## 1.9.1 - 2026-11-20
### Fixed
- **Payment and invoice e-mails are tried again within minutes.** Where: `apps/edge/src/pay.ts` (`resendSend`, `retryRecentOutbox`), `apps/edge/src/worker.ts` (`runTick`). A busy or briefly-down mail service (429, 5xx, no answer) is tried again at once with one idempotency key; a mail that still fails is tried again by every scheduled tick (waits of 2, 4, 8, 16, 32 minutes, six tries, newest first, three a tick) instead of waiting for the once-a-day job.
### Added
- **A refused mail now says why.** Where: the mail log (`mail_event`, outcome `send_failed <status> <error name>`), read by the owner. Only the provider's error name is kept, never its free text or the address.
- Setting `MAIL_RETRY_MS` (optional, default 800): the wait before the first re-try. Listed in `config/SECRETS_NAMES.md`.
- Root cause analysis of the Rs 1 live payment (3 of its 4 mails refused, no reason kept): `docs/RCA-NO-INVOICE-MAIL-2026-11-20.md`.
- PR: see the pull request of branch `boss/rca-no-invoice-mail-2026-11-20`. Audit: pending (two audits before deploy). Rollback id: the previous deploy in `docs/DEPLOYS.md`.
