# Mail deliverability: what the owner must set in the dashboards (release 1.11.0, 21 Nov 2026)

For: the owner. Nothing here is in the repository: each step is a setting in a dashboard. This file holds NAMES and places only, never a value. Do not paste a secret into a chat, a ticket or a file. Where a step needs a secret, you type it once into the Cloudflare dashboard (or use the one command shown).

Why this exists: Resend accepted the invoice mails but no delivery was seen (`docs/RCA-MAIL-DELIVERABILITY-2026-11-20.md`, PR 33), and other mails were refused with `429 monthly_quota_exceeded`. The code now keeps transactional mail (invoice, payment, game start, sign-in code) apart from bulk mail, ramps the young domain up slowly, and listens to what Resend says about each mail. Four things can only be done by you.

The labels below are what the dashboards showed in Nov 2026. Dashboards move their buttons; if a name differs, look for the words in quotes.

Order that works: 1, then 2 (same hour). 3 and 4 any day. 5 when you decide about the plan. Step 0 first, before the deploy.

---

## 0. Before the deploy: add the four new database tables (BOSS or you)

The release adds tables (`mail_count`, `mail_track`, `mail_suppress`, `mail_bulk_queue`). The file is `apps/edge/migrations/0033_mail_lanes.sql`. Apply it BEFORE the new code goes live (the code also works without it, it then counts nothing and stops nothing, but the new protection is off).

```bash
bunx wrangler@3 d1 execute corporate-tambola --remote --file apps/edge/migrations/0033_mail_lanes.sql
```

This is how the repository applies every migration (`docs/dev/10-OPERATIONS.md`). The file is safe to run twice.

---

## 1. Resend webhook: so we SEE delivered, bounced, complained, delayed

Today the webhook is not set, so the table `mail_bounce` is empty and nobody knows if a mail arrived. After this step each mail has a state and an address that bounced hard or complained is not mailed again.

Names to use:
* Webhook address: `https://housie.corporatetambola.com/api/mail/events`
* Secret name (a Cloudflare Pages secret): `RESEND_WEBHOOK_SECRET`

Click path, part A (Resend):
1. Open `https://resend.com` and sign in.
2. Left menu: **Webhooks**.
3. **Add Webhook** (or "Create Webhook").
4. **Endpoint URL**: `https://housie.corporatetambola.com/api/mail/events`
5. **Events**: tick `email.delivered`, `email.bounced`, `email.complained`, `email.delivery_delayed`, `email.failed`. (Do not tick the open and click events: we do not use them.)
6. Save. Open the webhook you made and find **Signing Secret**. It starts with `whsec_`. Keep that page open for part B.

Click path, part B (Cloudflare):
1. Open `https://dash.cloudflare.com`, then **Workers & Pages**, then the project **corporate-tambola**.
2. **Settings**, then **Variables and Secrets** (also called "Environment variables").
3. **Add**. Type: **Secret**. Name: `RESEND_WEBHOOK_SECRET`. Value: paste the Signing Secret from Resend. Choose **Production**. Save.
4. The new secret works only after the next deployment: ask BOSS to redeploy (a secret does not change a running deployment).

The same thing from a command line, if you prefer (it asks for the value, nothing is written in the shell history):

```bash
bunx wrangler@3 pages secret put RESEND_WEBHOOK_SECRET --project-name corporate-tambola
```

How to check it worked:
* Resend, **Webhooks**, your webhook, **Send test event** (or look at the "Attempts" list after the next real mail): the answer must be `200`. A `404` means the secret is not set on the live deployment yet (redeploy). A `400` means the secret in Cloudflare is not the same as the one in Resend (paste it again).
* After a few real mails, `GET https://housie.corporatetambola.com/api/owner/mail-events` (platform key) shows `delivered` rows. If a person's address bounces for good, `GET /api/owner/mail-suppress` lists it (masked).

If a real customer is stopped by mistake (for example a mailbox that was full and Resend called it permanent): `POST /api/owner/mail-suppress` with `{"action":"clear","email":"<the address>"}` lets mail flow again.

---

## 2. DMARC reports: give the record a mailbox that is read

Today the record is `v=DMARC1; p=none; adkim=r; aspf=r` (found in the RCA). It has no `rua=`, so no receiver can send you a report and nobody sees an authentication problem.

What to change: the TXT record at the name `_dmarc` of the domain `corporatetambola.com`.

Click path (Cloudflare DNS, the domain is on Cloudflare):
1. `https://dash.cloudflare.com`, pick the domain **corporatetambola.com**.
2. **DNS**, then **Records**.
3. Find the TXT record named `_dmarc`. Click **Edit**.
4. Change the content to (one line), replacing `<REPORT-ADDRESS>` with the address you choose below:
   `v=DMARC1; p=none; rua=mailto:<REPORT-ADDRESS>; adkim=r; aspf=r`
5. **Save**.

Which address (choose ONE):
* Option A, easiest: Cloudflare's own DMARC reports. In the same domain, **Email** (or "Email Security"), **DMARC Management**, **Enable**. Cloudflare shows the report address to put after `rua=mailto:`, and mails you a weekly summary. If you cannot find "DMARC Management", use option B.
* Option B: an address you read. Use `dmarc@corporatetambola.com` and make it reach you: domain, **Email**, **Email Routing**, **Routing rules**, **Create address**: custom address `dmarc`, action "Send to an email", destination your own mailbox. Create it as its own rule (do not rely on a catch-all rule: the catch-all of this domain is used for the deletion-request mails and would swallow the reports). Raw reports are XML files, hard to read; option A is easier.

Keep `p=none`. Do not tighten the policy until the reports of at least two weeks show only our two senders (Resend and Cloudflare Email) and every mail passing.

---

## 3. Google Postmaster Tools: see Gmail's opinion of the domain

This shows the domain's reputation in Gmail. It shows nothing until the domain sends a few hundred mails a day to Gmail users, so for a young domain it is empty for weeks. It is still worth proving ownership now, because the data starts to be kept from the day you add it.

Click path:
1. Open `https://postmaster.google.com` (it needs a Google account; use the owner's).
2. **Add domain**, type `corporatetambola.com`, **Next**.
3. Google shows a TXT record that starts with `google-site-verification=`. Copy it.
4. Cloudflare: `https://dash.cloudflare.com`, domain **corporatetambola.com**, **DNS**, **Records**, **Add record**. Type: **TXT**. Name: `@` (the domain itself). Content: the whole string Google gave. TTL: Auto. **Save**.
5. Back in Postmaster Tools press **Verify**. (If it says not found, wait ten minutes and press again.)
6. Leave the TXT record in place; removing it un-verifies the domain.

---

## 4. A bigger sending allowance for transactional mail (decide between A and B, or do both)

Why: the Resend free plan allows 3,000 mails a month and 100 a day, and the account is shared with other products (the RCA of the Rs 1 payment). Marketing mail in the same account can use up what invoices need. The code now keeps half of every limit for transactional mail, but it cannot create allowance that the plan does not have.

### A. Upgrade the Resend plan

1. `https://resend.com`, sign in, lower left your team name, **Settings**, then **Billing** (or **Usage**).
2. Choose a paid plan. Check the price and the limits on that page before you confirm; they are Resend's to change.
3. Tell the site the new limits so the 80 % alert and the lane reserve use the right numbers. Cloudflare, **Workers & Pages**, **corporate-tambola**, **Settings**, **Variables and Secrets**, **Add**, type **Text** (these are not secret):
   * Name `MAIL_MONTHLY_QUOTA`, value: the monthly number of the new plan (for example `50000`).
   * Name `MAIL_DAILY_LIMIT`, value: the daily number of the plan, or `0` when the plan has no daily limit.
4. Redeploy (ask BOSS). Check `GET https://housie.corporatetambola.com/api/status/mail`: `quota.monthly` must show the new number.

### B. Switch on (or keep) the Cloudflare Email route as the second path

Already coded in 1.9.2 (PR 32, `docs/MAIL-FALLBACK-2026-11-20.md`). It is off until two Pages secrets exist. Names: `CF_EMAIL_TOKEN` and `CF_ACCOUNT_ID`.

1. Cloudflare dashboard, **Workers & Pages**, **corporate-tambola**, **Settings**, **Variables and Secrets**.
2. **Add**, type **Secret**, name `CF_EMAIL_TOKEN`, value: the Cloudflare API token that is allowed to send e-mail (your own copy of it is the git-ignored file `config/live-secrets.txt`, the key called `CLOUDFLARE_EMAIL_TOKEN`; the dashboard name of the token is `dpdp-email-sending`). Save.
3. **Add**, type **Secret**, name `CF_ACCOUNT_ID`, value: the 32-character account id of the Cloudflare account (Cloudflare dashboard, the account's **Overview** page, right side "Account ID"; it is an identifier, not a password, but keep it with the other secrets). Save.
4. Redeploy (ask BOSS).
5. Limits to know: 3,000 mails a month are inside the Workers Paid plan, then a price per thousand; 200 mails a day for the whole account. Only transactional mail uses this route; the bulk lane never does (code rule), so marketing sent by this site cannot use up the 200.

Check: after redeploy `GET https://housie.corporatetambola.com/api/status/mail` shows `"cloudflare": { "configured": true ... }`.

---

## 5. What BOSS should watch (no dashboard needed)

Public address, numbers only (no address, no key): `GET https://housie.corporatetambola.com/api/status/mail`.

| Field | Meaning |
|---|---|
| `ok` | `false` when 80 % of the month's quota is used, or Resend said its quota is used up |
| `level`, `alert` | `ok`, `warn` (80 %), `critical` (100 %); `alert` names the level that has been raised this month |
| `quota` | monthly allowance, mails sent this month, percent, daily limit |
| `lanes.tx` / `lanes.bulk` | mails sent today and this month in each lane; bulk: today's cap, whether bulk may go now and why not, how many wait |
| `warmup` | day number (day 1 = transactional mail only), the day it started, today's bulk cap |
| `doNotMail.addresses` | how many addresses are stopped (hard bounce or complaint) |

The same alert is written ONCE a month, as a log line starting `[mail-alert]` (Cloudflare dashboard, **Workers & Pages**, **corporate-tambola**, **Logs** / real-time logs), at 80 % and at 100 %. The line has numbers only.

Warm-up in short: day 1 only transactional mail; bulk mail (draft reminders, Help Desk invitations, any marketing sent through this site) is allowed 20 a day on day 2, then 30, 40, 50, 75, 100, 125, 150, 175, 200, 250, 300, 400, and 500 from day 15. Day 1 is the day the new code first handled a mail. To pick another start day, set the Pages variable `MAIL_WARMUP_START` to a date like `2026-11-21`.

## What no step here can do

* It cannot make Gmail trust a domain that is 36 days old; only weeks of steady, wanted mail does that. Do not send bursts of near-identical mail from this domain.
* It cannot show why the two Rs 1 mails were not seen in your inbox: look at them in the Resend dashboard, **Emails**, first (the RCA, step 1), and in Gmail's Spam folder.
