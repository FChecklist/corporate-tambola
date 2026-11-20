# Changelog (Corporate Tambola)

Newest first. The owner-only release list the site reads is `apps/edge/src/releases.json`; this file adds the PR and audit lines the version standard asks for (marketing-ledger/plans/VERSION-AND-KNOWLEDGE-STANDARD-2026-11-20.md). Earlier releases (1.0.0 to 1.9.0) are in `releases.json`.

## 1.9.1 - 2026-11-20
### Fixed
- **Payment and invoice e-mails are tried again within minutes.** Where: `apps/edge/src/pay.ts` (`resendSend`, `retryRecentOutbox`), `apps/edge/src/worker.ts` (`runTick`). A busy or briefly-down mail service (429, 5xx, no answer) is tried again at once with one idempotency key; a mail that still fails is tried again by every scheduled tick (waits of 2, 4, 8, 16, 32 minutes, six tries, newest first, three a tick) instead of waiting for the once-a-day job.
### Added
- **A refused mail now says why.** Where: the mail log (`mail_event`, outcome `send_failed <status> <error name>`), read by the owner. Only the provider's error name is kept, never its free text or the address.
- Setting `MAIL_RETRY_MS` (optional, default 800): the wait before the first re-try. Listed in `config/SECRETS_NAMES.md`.
- Root cause analysis of the Rs 1 live payment (3 of its 4 mails refused, no reason kept): `docs/RCA-NO-INVOICE-MAIL-2026-11-20.md`.
- PR: https://github.com/FChecklist/corporate-tambola/pull/30 (merge commit `4bda4fe`, head `7fd7911`). Audit: two independent AUDIT: PASS on `7fd7911`; their Medium findings are open follow-ups (`docs/KNOWLEDGE/05-OPEN-ITEMS.md`).
- Deployed 2026-11-20 16:05 UTC (Cloudflare Pages `corporate-tambola`, production, from `4bda4fe`): deploy id `8706cf94-f0ab-4e90-9784-fa06da7e24c4`. Rollback id: `b7cf346e-3bc7-44ec-a970-a310ea224ce3` (be7e4da, 1.9.0).
- Live check after deploy: `/version.json` shows 1.9.1 / `4bda4fe4e2c8`; `kv.tick_last_ms` moving; the first tick sent the Rs 1 payment's organizer invoice copy (outbox 6121); the two other stuck mails (6118, 6119) were refused again with `send_failed 429 monthly_quota_exceeded` (the mail service's monthly quota is used up: a Resend plan matter, not code).
