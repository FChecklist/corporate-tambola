# Corporate Tambola: go-to-market readiness (2026-10-19)

Written at the end of the go-to-market pass. Rule used throughout: **a row says PASS or FIXED only when a test or a file named in the row proves it.** Where nothing here can prove it (a real bank, a real inbox, a lawyer's opinion) the row says OWNER-ONLY and the exact steps are in section 3.

Nothing in this pass was pushed or deployed. The fixes below are local commits; they reach the live site only when the owner says so (`docs/DEPLOYS.md`).

How to run the new proof (about one minute, no browser, no network):

```
cd C:\ct\tambola
bun test apps/edge/test/param-*.test.ts apps/web/test/gtm-site.test.ts --timeout 120000
```

The suite: **942 new named tests, all passing** (`param-config` 202, `param-matrix` 275, `param-people` 85, `param-money` 92, `param-life` 96, `param-extra` 49, `param-journey` 2, `gtm-site` 141), about 45 seconds in one process. The whole repository run (`bun test apps packages`, 88 files) passed 2,291 of 2,291 with 0 failures before the last handful of tests were added. Each repair below was checked the other way round too: putting the old 23-hour clock back fails 7 timing tests, switching the lazy tick off fails 7 lazy-tick tests, and removing the zone check fails the 8 zone-less rows.

## 1. Readiness table

Status words: **PASS** = was already right, now proved by a named test. **FIXED** = a real fault found in this pass and repaired, with a test that fails without the repair. **OWNER-ONLY** = only the owner can do or confirm it (section 3).

### Product

| Item | Status | Evidence |
|---|---|---|
| Pack sizes 1 to 10,000 players map to the right pack and the right amount in paise; a game over 10,000 cannot be bought | PASS | `apps/edge/test/param-config.test.ts` "packs x price" (16 sizes, 8 packs, bad packs) |
| Free publish (up to 100 players, switch on) versus paid | PASS | `param-config.test.ts` "free publish" |
| Start times: past, now, 5 and 10 minutes ahead, the 45-second lock, exactly 30 days, 30 days and a second, IST midnight, leap and month ends | PASS | `param-config.test.ts` "start-time edge cases" |
| A start time written **without a time zone** was read as UTC, so "4 pm" meant 9:30 pm India time (known finding F-06) | **FIXED** | `apps/edge/src/worker.ts` (`/api/z/schedule`); `param-extra.test.ts` "regression: a start time without a zone"; the 8 zone-less forms are refused with a sentence that shows the right form |
| Call speeds (6, 9, 12, 15 only), rounds (1 to 5), tickets (1 or 2), limits, game ids | PASS | `param-config.test.ts` "speeds, rounds, tickets" |
| Prize houses: every house alone at its maximum and one more, all together, two-ticket house rules, text cleaned | PASS | `param-config.test.ts` "prize house combinations" |
| Brand moments: every kind, link rules (https only, YouTube only for YouTube, no spaces, 300 characters), counts per ticket, openings fit in 2 minutes, brand name / colour / logo | PASS | `param-config.test.ts` "brand moments", "brand name, colour, logo" |
| Lucky draw sizes 1, 3, 5, 10; the Organizer, Hosts and Co-hosts are out of the draw; the list cannot change after the start | PASS | `param-config.test.ts` "lucky draws" |
| Every role against every route (Organizer, AI link, Host, Co-host, another organizer, another game's Co-host, owner, partner key, nobody, a wrong key) | PASS | `apps/edge/test/param-matrix.test.ts` (27 routes x 10 actors, 270 rows); refusals never carry a key |
| Phone formats (14 valid shapes, 13 invalid), duplicates across shapes and routes, hidden characters, look-alike digits | PASS | `param-people.test.ts`, `param-extra.test.ts` |
| Guest list sizes 0, 1, 100, 200 per request, 1,000 in five requests, over-limit, roster limit | PASS | `param-people.test.ts` "guest list sizes" |
| Invitation policies: anyone, invite-only, two-level chain, Co-host lists, AI refused | PASS | `param-people.test.ts` "invitation policies" |
| Names and text in every field: script tags, event handlers, SQL-looking text, emoji, Hindi, Arabic, 500 characters, control characters, right-to-left override; markup is removed on the way in and escaped when printed (invoice, join page, mails) | PASS | `param-people.test.ts` "unicode, long names and hostile strings", `param-extra.test.ts` "hostile text is printed back safely" |
| The first game of a new Organizer end to end (sign-up code, build, publish, pay, join, play and win, report, 20-hour deletion, 365-day deletion), with the clock driven only by ordinary requests | PASS | `apps/edge/test/param-journey.test.ts`. The real-Chrome version is `tools/sim2` S02 / S06 (not re-run in this pass: it needs the live-data copy and Chrome) |
| A game nobody pays for never begins and nobody is charged | PASS | `param-journey.test.ts` second test |

### Payments

| Item | Status | Evidence |
|---|---|---|
| Who may pay: Organizer, Host, Co-host; an AI key and a stranger may not; anonymous pack purchase then publish | PASS | `apps/edge/test/param-money.test.ts` "who can pay" |
| Pay link: made by Organizer / Host / Co-host, public view shows only the game name and price, new link cancels the old, 7-day expiry, bound to its own game whatever the payer sends | PASS | `param-money.test.ts` "pay link" |
| Gateway answers: captured, authorized, still created, failed, refunded, one paisa off, ten times less, other order, unknown payment, unreachable gateway; wrong, empty and foreign signatures; replay; double click | PASS | `param-money.test.ts` "payment verification" |
| Webhook: signed, wrong signature, other secret, no secret, amount mismatch, twice, unknown order, not JSON | PASS | `param-money.test.ts` "webhook" |
| Late payment: a minute before the start, at the start, 10 minutes and 3 hours after; a closed game cannot be paid | PASS | `param-money.test.ts` "late payment" |
| No refunds: cancelling a paid game gives credit equal to the amount paid for 365 days; no refund call reaches the gateway; credit full / partial / remainder / used once / expired / own account only | PASS | `param-money.test.ts` "cancel" and "credit" |
| Reschedule (30 days unpaid, 365 days paid), clone, size changes (402 above the pack, 409 below the people joined) | PASS | `param-money.test.ts` "reschedule and clone" |
| **The partner page promised 20% on repeat purchases; the code pays 50%** (owner decision 2026-10-06) | **FIXED** | `apps/web/public/partner.html`; `apps/web/test/gtm-site.test.ts` "the partner page's repeat-purchase promise matches the code" |
| **The brochure (page and PDF) showed an old GST-inclusive price table** (Rs 1,999 to 24,999 for 6 packs) | **FIXED** (page); PDF: see section 2 | `apps/web/public/brochure.html`; `gtm-site.test.ts` "prices are the price table" (every rupee amount on every page is a pack price) |
| **The owner's Razorpay steps gave the wrong webhook address** (`/api/webhooks/razorpay`, which belongs to the old stand-alone server) | **FIXED** | `docs/RAZORPAY_OWNER_STEPS.md`; `param-extra.test.ts` "owner documents name the routes the Worker really answers" |
| Razorpay webhook secret set in Cloudflare | OWNER-ONLY | section 3, step 1 |
| A first real paid purchase, and the window shows the right amount on the registered host (gate Y3) | OWNER-ONLY | section 3, step 2 |
| International (dollar) cards | OWNER-ONLY | section 3, step 3 |

### Legal pages

| Item | Status | Evidence |
|---|---|---|
| Rules, privacy and disclaimer lines word for word; timings in the pages match the code | PASS | `apps/edge/test/branding.test.ts`, `apps/web/test/gtm-site.test.ts` "the deletion times written for people match the clock in the code" |
| Seller is only IT Services by Rajat Agarwal; no older company name anywhere in the pages or scripts | PASS | `gtm-site.test.ts` "contact details and the seller" |
| Terms version, consent boxes, accessibility statement, storage notice | PASS | `apps/edge/test/consent.test.ts`, `terms.test.ts`, `apps/web/test/storage-notice.test.ts`; `docs/GATES.md` (R9, R10, K13, P6) |
| Lawyer / CA sign-off on the Terms, Privacy, DPA, refund and credit wording; the one-year log rule in DPDP Rule 6(1)(e) | OWNER-ONLY | section 3, step 6 |

### Privacy and retention

| Item | Status | Evidence |
|---|---|---|
| **The promise is "deleted within 24 hours" but the free scheduler may run 2 or more hours late, and the old clock deleted at 23 hours: a tick 1 hour late broke the promise** | **FIXED** | Clock now deletes at **20 hours** (report link closes at **19**), so a tick up to 3 hours late stays inside 24. `apps/edge/src/lifecycle.ts` (`PURGE_AFTER_MS`, `REPORT_LINK_MS`); every page, mail, consent text, AI text and doc that said 23 / 22 hours now says 20 / 19; `docs/RETENTION.md` records the decision. Proof: `param-life.test.ts` "the deletion promise" (a tick at 1, 19:59, 20, 21, 22, 23 and 23:59 hours) |
| **A lazy tick**: any `/api` request also runs the same housekeeping when the last tick is older than 5 minutes (waitUntil, single flight, never blocks, never throws) | **FIXED** (new) | `apps/edge/src/worker.ts` (`lazyTick`, `runTick`); `param-life.test.ts` "the lazy tick" (13 tests incl. 10 simultaneous requests start one tick, a failing database does not break the request, no tick without waitUntil); `param-journey.test.ts` deletes a game's guests using nothing but ordinary requests |
| The health read raises the alarm at 23 hours (an hour before the promise would break) instead of 20.5 | FIXED | `apps/edge/src/admin.ts` (`OVERDUE_GRACE_MS`), `param-life.test.ts`, `admin.test.ts` |
| Report link: closes at 19 hours, wrong keys never open it, one reminder, one "data deleted" mail | PASS | `param-life.test.ts` "report mail and the report link" |
| Players' own rights: access, correction, erasure, nomination, leave; card id AND device id required; same request twice answered once; rows deleted with the game | PASS | `param-life.test.ts` "a player's own requests"; `apps/edge/test/rights.test.ts` |
| Retention timestamps readable by the Organizer; owner legal hold suspends deletion; 365-day window ends at 00:00 IST (six boundary cases); billing records stay | PASS | `param-life.test.ts`, `param-money.test.ts` "the 365-day window" |
| Lifecycle tick is safe to repeat (ten times, two at once, cron key required, purge twice) | PASS | `param-life.test.ts` "the lifecycle tick can be repeated safely" |

### Scheduler and monitoring

| Item | Status | Evidence |
|---|---|---|
| Scheduler cannot be relied on for the promise | FIXED | lazy tick above; deletion clock 20 hours |
| A second scheduler (the Cloudflare cron worker, every minute) | OWNER-ONLY | `apps/cron` is written; it needs a Cloudflare Workers token to deploy: section 3, step 4 |
| Health read `/api/status/health` (errors, overdue deletions, site switch) | PASS | `apps/edge/test/admin.test.ts` A7 / A8 |
| Uptime check (GitHub workflow in `FChecklist/scheduler`, every 15 minutes) | OWNER-ONLY | confirm once that its failure mail arrives: section 3, step 7 |
| Visitor reports, error and timing reports, SEO | PASS / OWNER-ONLY | `apps/web/test/seo.test.ts`, `visits-dom.test.ts`; Cloudflare Web Analytics and Search Console clicks are owner-only (section 3, step 8) |

### Support and grievance

| Item | Status | Evidence |
|---|---|---|
| Contact page: one support address (`hello@corporatetambola.com`) and one phone (+91 96503 97480) on every page, with mailto and tel links | PASS | `gtm-site.test.ts` "contact details and the seller" |
| Data-request flow for players (`POST /api/z/{id}/datareq`), the owner's queue (`/api/owner/data-requests`), the owner desk | PASS | `rights.test.ts`, `admin.test.ts` A6, `param-life.test.ts`, `docs/OWNER_DESK.md` |
| `hello@corporatetambola.com` really reaches the owner: the domain's mail records exist (Cloudflare Email Routing, three MX records, read on 2026-10-19) but a forwarding rule to a verified inbox has not been proved | OWNER-ONLY | section 3, step 5. Note: the paid-order and data-request notes to the owner also go to this address (`apps/edge/src/owner-mail.ts`, override with the secret `OWNER_NOTIFY_EMAIL`) |
| Receipts print the seller's own address `rajatsiroffice@gmail.com` (`config/company.json`) while the site and mails use `hello@`: two addresses by design | OWNER-ONLY decision | section 3, step 5 |

### Pricing, pages, onboarding

| Item | Status | Evidence |
|---|---|---|
| Every rupee amount on every page is one of the eight pack prices; no GST line; US$ amounts are the dollar prices | PASS | `gtm-site.test.ts` "prices are the price table" |
| Every page has a title, language, viewport, alt text on every picture; every local link, script and picture points at a file we ship; no link to a test address | PASS | `gtm-site.test.ts` "every page has the basics", "links and files" |
| robots.txt hides the private pages and names the sitemap; the sitemap lists only real pages on the real domain, none hidden | PASS | `gtm-site.test.ts` "robots, sitemap, ..." |
| Descriptions under 175 characters, canonical link, share card with image on six main pages | PASS (partner page FIXED: its description was 196 characters) | `gtm-site.test.ts` |
| Offline page, 404 page, manifest with maskable icons, service worker names only real files | PASS | `gtm-site.test.ts`; `apps/web/test/pwa.test.ts` |
| Organizer guide, AI work prompt, brochure, demo | PASS | `organizer-guide.html`, `docs/AI_WORK_PROMPT_ORGANIZER.md`, `brochure.html` covered by the link, price and wording tests |

## 2. Findings that were looked at and left as they are (decisions)

1. **Game id existence is observable** to any signed-in organizer: a stranger's key gets 403 for a game that exists and 404 for one that does not. Ids hold no personal data and the public `info` of a published game is open anyway. Left; proved by `param-matrix.test.ts` that neither answer carries game data.
2. **Footer link "Test a payment (Rs 1)"** is on every page. It is the owner's own check for gate Y3 (a real Rs 1 payment). Left in place; remove it from the footer after the first real purchase is confirmed (it is in `tools/make-legal-pages.mjs`'s footer and checked by sim S13).
3. **Sister-product links** in the footer go to `rajat-agarwal-startup-coach.pages.dev` and the seller's own site `itservices-rajat-agarwal.pages.dev` (named on the contact page). These are the only addresses on a `pages.dev` name; the tests allow exactly these two.
4. **The brochure PDF** (`apps/web/public/brochure.pdf`) is generated from `brochure.html` with headless Chrome (`node tools/make-brochure.mjs`). If it was not regenerated in this pass (see the commit list), run that command once before sharing the PDF; the web page is already correct.
5. **tools/sim2 scenarios** that hard-coded 22 / 23 hours were edited to 19 / 20 so they follow the new clock. They were not re-run here (they need the live-data copy and a browser, and the laptop had about 1 GB free). Run `node tools/sim2/smoke.mjs` and the life scenarios when RAM allows.
6. **Two e-mail addresses** (support `hello@`, seller on receipts `rajatsiroffice@gmail.com`): kept as they are; see section 3, step 5.

## 3. OWNER-ONLY list, in plain words

Nothing here can be done by the software or by me. Do them in this order. None of them spends money except where it says so.

**Step 1. Tell the shop where to send payment news (Razorpay webhook).** About 5 minutes.
1. Open dashboard.razorpay.com and make sure the switch at the top says **Live** (not Test).
2. Left menu: **Account & Settings** > under "Website and app settings" click **Webhooks** > **Add New Webhook**.
3. Webhook URL: `https://corporatetambola.com/api/payments/webhook` (exactly this).
4. Secret: type a long random line of letters and numbers (at least 20 characters). Keep it; you need it in step 5. Do not send it to anyone in a message.
5. Tick **payment.captured** and **order.paid**. Click **Create Webhook**.
6. Open dash.cloudflare.com > **Workers & Pages** > **corporate-tambola** > **Settings** > **Variables and Secrets** > **Add** > type `RAZORPAY_WEBHOOK_SECRET`, paste the secret, choose **Encrypt**, **Save**.
7. **Deployments** tab > the top line > three dots > **Retry deployment** (a new secret is read only by a new deployment).

**Step 2. One real payment, to prove the whole chain (this spends Rs 1 first, then, if you choose, Rs 2,399).**
1. Open `https://corporatetambola.com/paytest.html`. Pay Rs 1 with your own card or UPI.
2. Check: Razorpay dashboard > **Transactions** shows it captured; an invoice mail arrives; a note "Paid order" arrives at hello@ (this also proves step 5).
3. For the full chain: sign in, make a game for 100 people, publish, pay Rs 2,399, confirm the invoice mail and that the game shows "paid". Cancel it (more than a minute before its start) to see the credit appear; credit is not a refund (Terms).

**Step 3. Dollar cards (optional, only if you want overseas customers).**
1. Razorpay dashboard > **Account & Settings** > **Payment Methods** (or **International Payments**) > **Request** / write to Razorpay support asking to enable international cards. Razorpay decides; it can take days.
2. When they confirm: Cloudflare > Workers & Pages > corporate-tambola > Settings > Variables > add `RAZORPAY_INTERNATIONAL` = `1` > Save > Retry deployment.
3. Ask your CA how dollar sales are treated (export of services).

**Step 4. A second clock for the deletion promise (optional, recommended).** The site already runs its own lazy tick, so this is a belt on top of braces.
1. dash.cloudflare.com > top right profile > **My Profile** > **API Tokens** > **Create Token** > template **Edit Cloudflare Workers** > Account Resources: your account > **Continue to summary** > **Create Token**.
2. Copy the token once. Put it in the file `C:\ct\ct\.env.local` as `CLOUDFLARE_API_TOKEN=...` (never in a chat). Then tell the project manager "token is in place"; they deploy `apps/cron` (`wrangler deploy` in that folder, then `wrangler secret put CRON_KEY` with the same key the site has).

**Step 5. Make sure mail to hello@ reaches you.**
1. dash.cloudflare.com > **corporatetambola.com** > **Email** > **Email Routing** > **Routes**. There must be a line `hello@corporatetambola.com` > a destination marked **Verified**. If the destination says **Unverified**, open the mailbox it names and click the link in Cloudflare's mail.
2. From a different mail account, write to hello@corporatetambola.com and confirm it arrives. Do the same with a reply to one of our mails.
3. Decide whether receipts should keep `rajatsiroffice@gmail.com` as the seller's address (now) or also use hello@. To change it, edit `config/company.json` and the Pages secret `COMPANY_JSON`.

**Step 6. Lawyer and CA.**
1. Send your lawyer these pages (open them on the site): Terms, Rules and Privacy (legal), Privacy, Data Processing Agreement, Subprocessors, Refund policy, and the sentence "no refunds, credit for 365 days". Ask: is "within 24 hours" for guest data acceptable; does the one-year log rule in DPDP Rule 6(1)(e) reach the 365-day winners record; is the closed-group, no-stake wording safe for each Indian state you will sell in.
2. Send your CA: the price list (no GST while you are not registered), the plain INVOICE (not a tax invoice), the 50% partner commission, and whether you must register for GST once sales pass the limit.

**Step 7. Alarms reach you.** In GitHub, open the `FChecklist/scheduler` repository > **Actions** > **uptime** > **Run workflow** once and confirm GitHub's failure/success mail reaches you (Settings > Notifications). Also in Resend: **Webhooks** > Add `https://corporatetambola.com/api/mail/events` (events bounced, complained, delivered) and put its signing secret in Cloudflare as `RESEND_WEBHOOK_SECRET`. Check Resend's monthly sending limit is above what you expect.

**Step 8. Search and visitor numbers (optional).** Cloudflare > **Analytics & Logs** > **Web Analytics** > Add site (one click). Google Search Console > Add property `corporatetambola.com` > verify with the DNS record Cloudflare offers > submit `https://corporatetambola.com/sitemap.xml`.

**Step 9. Say go.** Ask the project manager to deploy the local commits of this pass (`docs/DEPLOYS.md`). After the deploy, open `https://corporatetambola.com/version.json` and check the commit is the new one, then `https://corporatetambola.com/api/status/health` shows `"ok": true`.

## 4. What would change this table

Any failing test in `param-*.test.ts` or `gtm-site.test.ts` turns its row back to not proven. New page text with a price, an address or an hour count is checked by `gtm-site.test.ts` automatically.
