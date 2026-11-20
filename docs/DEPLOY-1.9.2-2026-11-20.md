# Deploy record: Corporate Tambola 1.9.2 (second mail route), 20 Nov 2026

## What went live
* PR #32 `boss/mail-fallback-cloudflare-1.9.2`, audited commit `c91c3e99338ef03d1a971428bb21d071915ebe35`: two independent `AUDIT: PASS` on that exact SHA, CI green (`typecheck`, `each-file`), no High.
* Merged to master as `9dba012fc7a3030a2351f692792d20da72aad0a2` (merge commit; same code tree as c91c3e9).
* Cloudflare Pages project `corporate-tambola`, branch `main`.

| Step (UTC) | Deploy id | Source | Note |
|---|---|---|---|
| 18:17 | `05829f7b-cbb7-4676-b5a1-623473aa3efa` | c91c3e9 | 1.9.2 with the fallback OFF (no secrets yet) |
| ~18:28 | `2708a49d-3cfa-4289-b64e-e0a2c168ad05` | 9dba012 (merged master) | 1.9.2 with the fallback ON: the two Pages secrets `CF_EMAIL_TOKEN` and `CF_ACCOUNT_ID` were set first, then redeployed so they take effect. **Current.** |

* Rollback ids: `05829f7b-cbb7-4676-b5a1-623473aa3efa` (1.9.2, fallback off by missing secrets) and `8706cf94-f0ab-4e90-9784-fa06da7e24c4` (1.9.1, Resend only). To switch only the fallback off, delete the two Pages secrets and redeploy.
* The secrets were set by command from the owner's env file; no value was printed or committed. Only the names are listed in `config/SECRETS_NAMES.md`.

## Live checks (20 Nov 2026)
* `/version.json`: version 1.9.2, commit 9dba012fc7a3, not dirty. The tick runs (`kv.tick_last_ms` keeps moving). Payments status: Razorpay LIVE, unchanged. Money flags untouched.
* The two secrets are present (names listed by `wrangler pages secret list`).
* One real test mail through Cloudflare Email Service (the same endpoint the code uses; API answer `success`, queued) to the owner's address, from `hello@corporatetambola.com`, subject "[Tambola] Mail route test via Cloudflare (v1.9.2)". It arrived in the **Inbox** (category Updates) within a minute. Authentication results were not readable through the mail tool, so SPF and DKIM pass is still inferred from DNS (see `RCA-MAIL-DELIVERABILITY-2026-11-20.md`), not read from headers.
* The fallback inside the game code was NOT exercised end to end: it only fires when Resend refuses or fails, and Resend is accepting some mails right now. Next time Resend answers 429 or 5xx, the mail log shows `resend_failed <why>; sent_by_cloudflare`.

## Follow-ups (Mediums from the two audits; not blockers)
1. A mail may be sent twice when Resend errors after accepting it (`pay.ts`, `resendSend`, 5xx or no answer).
2. No priority for invoice mail over bulk mail: all transactional mail shares one queue and Cloudflare's 200-a-day account limit with marketing.
3. `sendReportMail` (the report mail with a PDF) has no fallback.
4. The Cloudflare payload drops `reply_to` and `Auto-Submitted` (Resend gets both).
5. Outbox scan without an index (audit M3 of PR 30, needs a migration).
6. Owner decisions still open: a separate allowance for transactional mail (paid Resend plan or a second sending account), and the DMARC `rua=` address.
