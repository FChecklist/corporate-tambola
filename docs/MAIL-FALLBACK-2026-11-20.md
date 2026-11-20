# Second mail route (Cloudflare Email), release 1.9.2, 20 Nov 2026

## Why
The live Resend account answered `429 monthly_quota_exceeded` (mail log, 20 Nov 2026, after deploy 1.9.1). That account is the FREE plan and is shared by the products (games, DPDP, marketing mail from tia@/rina@, the 18 Nov smoke tests), so one product can use up everyone's monthly allowance. Retrying Resend cannot help until its plan resets. The Rs 1 payment's invoice mails were refused for this reason (`docs/RCA-NO-INVOICE-MAIL-2026-11-20.md`).

## What the code does (`apps/edge/src/pay.ts`, `resendSend`)
1. Resend first, with ONE idempotency key per mail (`outbox-<id>` for a retried mail).
2. Resend answers a quota (429 + a name containing "quota"): not asked again for this mail; Resend is skipped for 30 minutes for every mail. 429 rate limit / 5xx / no answer: asked up to 3 times (the scheduled retry: once, the tick is the loop).
3. If Resend did not take the mail and BOTH Pages secrets `CF_EMAIL_TOKEN` and `CF_ACCOUNT_ID` are set: the same mail goes once through Cloudflare Email Service (`POST https://api.cloudflare.com/client/v4/accounts/<id>/email/sending/send`, sender `hello@corporatetambola.com`, domain already enabled for sending, daily quota 200) with the same key header.
4. A plain refusal from Resend (4xx other than 429, for example a bad address) is never repeated and never sent a second way.
5. Mail log (`mail_event`, kept 3 days): `resend_failed <why>; sent_by_cloudflare`, or `send_failed <why>; cloudflare <status> [code<n>]`. Provider status and error NAME only.
6. Without the two secrets, behaviour is exactly 1.9.1.

## Owner / BOSS actions (live settings, not in the repo)
* Set the Pages secrets `CF_EMAIL_TOKEN` (the value of `CLOUDFLARE_EMAIL_TOKEN`, the dashboard key `dpdp-email-sending`) and `CF_ACCOUNT_ID` on the Pages project `corporate-tambola`, then redeploy. Until then the fallback is off.
* Cloudflare Email Service: 3,000 mails a month are inside the Workers Paid plan, then US$ 0.35 per 1,000; the daily limit is 200 mails for the whole account.

## Limits (honest)
* Not covered: the engagement REPORT mail with PDF attachments (`sendReportMail`) still uses Resend only.
* Duplicate risk: when Resend answers a 5xx or nothing at all, it may have taken the mail anyway; the Cloudflare copy would then be a second mail. The same key is sent to both, but Cloudflare's handling of that header is not documented. The case is rare (a quota answer, the real cause, is definite).
* "Never starved by marketing": the code cannot reserve capacity in accounts it does not control. It gives the transactional mail TWO independent allowances (Resend monthly, Cloudflare daily). Marketing mail from tia@ also goes through Cloudflare's 200-a-day account quota, so if marketing uses it up the second route is closed too. The lasting fix is a separate allowance for transactional mail (a paid Resend plan or a second sending account), or capping marketing volume; both are owner decisions.
