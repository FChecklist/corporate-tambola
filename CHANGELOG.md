# Changelog (Corporate Tambola)

Newest first. The owner-only release list the site reads is `apps/edge/src/releases.json`; this file adds the PR and audit lines the version standard asks for (marketing-ledger/plans/VERSION-AND-KNOWLEDGE-STANDARD-2026-11-20.md). Earlier releases (1.0.0 to 1.9.0) are in `releases.json`.

## 1.9.3 - 2026-11-21
### Added
- **Two mail lanes.** Where: `apps/edge/src/mail-lanes.ts`, `apps/edge/src/pay.ts` (`sendMail` option `lane`, `bulkSend`, `drainBulkMail`), `apps/edge/src/worker.ts` (`runTick`). Transactional mail (invoice, payment, receipt, game start, sign-in code, AI and Host links, data requests: everything not marked bulk) is never refused or delayed by anything in the bulk lane. Bulk mail (the draft reminder, the Help Desk invitation, and any marketing sent through `sendMail(..., { lane: "bulk" })`) has its own counter, its own ramp, makes ONE try at Resend (never the Cloudflare route), and waits in the table `mail_bulk_queue` (24 hours) when it may not go yet. The queue is sent by the tick AFTER the transactional retry and not at all while a transactional mail is waiting for its retry. Half of the daily limit and half of the monthly quota are kept for transactional mail.
- **Warm-up of the young domain.** Day 1 is transactional mail only. Bulk caps by day: 0, 20, 30, 40, 50, 75, 100, 125, 150, 175, 200, 250, 300, 400, then 500. Day 1 = `MAIL_WARMUP_START` or the day the code first handled a mail.
- **Send counter and quota alert.** `mail_count` counts the mails a provider ACCEPTED per day, lane and provider. At 80 % and at 100 % of the monthly quota (`MAIL_MONTHLY_QUOTA`, default 3000) ONE log line `[mail-alert] ...` (numbers only) is written per month. Public `GET /api/status/mail` shows the counters, the warm-up day, the alert and whether the provider said its quota is used up; no address, no key.
- **Per-mail delivery state.** The Resend mail id is kept in `mail_track`; the webhook (`POST /api/mail/events`, signed with `RESEND_WEBHOOK_SECRET`) sets delivered, delayed, failed, bounced or complained on that mail (a later state is never overwritten by an earlier one) and writes `provider <state>` to the mail log.
- **Do-not-mail list.** A Permanent bounce or a complaint (only for mail from our own domain: the Resend account is shared) puts the address (hash and masked form) on `mail_suppress`; `sendMail`, `sendReportMail` and both retry loops then skip it and log `suppressed_bounce`. `GET|POST /api/owner/mail-suppress` (owner only) lists it, adds an address or clears one.
- Settings `MAIL_MONTHLY_QUOTA`, `MAIL_DAILY_LIMIT`, `MAIL_WARMUP_START` (optional, in `config/SECRETS_NAMES.md`). Migration `0033_mail_lanes.sql` (four new tables, additive).
- `docs/MAIL-DELIVERABILITY-OWNER-STEPS.md`: what the owner sets in the dashboards (Resend webhook, DMARC `rua=`, Gmail Postmaster Tools, plan upgrade or the Cloudflare route) with click paths.
### Changed
- The webhook answer and the stored event rows are as before; the webhook now does its effects first and writes the event row last, so a provider retry of a half-finished call finishes the work.
### Security / privacy
- New tables and their retention are in `docs/RETENTION.md`: `mail_count` 100 days (numbers), `mail_track` 3 days, `mail_suppress` 365 days (hash and masked form), `mail_bulk_queue` 24 hours. No address, text or key reaches a log line or the status address.
- Tests: `apps/edge/test/mail-lanes.test.ts` (32) and `apps/edge/test/mail-webhook.test.ts` (18); 41 deliberate breaks of the code each went red, then restored (list in `docs/KNOWLEDGE/08-MAIL-DELIVERABILITY.md`).
- PR: see the pull request of branch `claude/intelligent-mendel-gacbp5` (stacked on PR 32, branch `boss/mail-fallback-cloudflare-1.9.2`). Audit: pending (two audits before deploy). Rollback: deploy the previous version (1.9.2, or 1.9.1 id `8706cf94-f0ab-4e90-9784-fa06da7e24c4`); the new tables stay and are ignored by the old code.

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
