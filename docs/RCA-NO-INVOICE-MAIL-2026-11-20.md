# RCA: no invoice e-mail seen after the owner's Rs 1 live payment (20 Nov 2026)

Branch `boss/rca-no-invoice-mail-2026-11-20`, cut from origin/master `be7e4da`. Evidence below was read from the LIVE databases (read-only SELECTs; addresses masked, no secret read or printed).

## What happened (times UTC, 20 Nov 2026)
| Time | Event | Evidence |
|---|---|---|
| 13:02:25 | Game `OWNER-RS1-O3HS` published (organizer = a plus-address, `raajat.agarwal+tamb-rs1@gmail.com`). Mail "published: payment pending" to the plus-address | outbox row 6118, `sent=0`, body kept (648 chars) |
| 13:12:49 | Owner paid Rs 1 through the pay link (`paid_by=link`, order `order_U2RNaJR42lKbqi`, payment `pay_U2RS2zeenzrv4Q`, UPI). Game became paid. The payment was confirmed by the payer's browser, not by a webhook | `payment.pay_5fd96179fd58c500` paid, `meta.priceAdjust.netMinor=100`, `confirming_ms = paid_ms` |
| 13:12:49 | Owner's "Paid order" note to `hello@corporatetambola.com` | outbox row 6119, `sent=0`, body kept |
| 13:12:51 | IT Services central record written | `itservices-payments.payment`: `TAM-pay_5fd96179fd58c500`, paid, 100 minor, `game_id=OWNER-RS1-O3HS`, `is_test=0` (its `receipt_ms` is empty) |
| 13:28:42 | Invoice **issued**: `CT/2026-27/000001` (15 min 53 s after capture, by the scheduled/lazy tick, as designed: `INVOICE_AFTER_MS` = 15 min). Two mails made: "payment received, invoice" to the payer's Razorpay address `raajat.agarwal@gmail.com` (row 6120) and "invoice ... for your game" to the organizer plus-address (row 6121) | `invoice` table: 1 row, `draft=0`; `payment.result.invoicePending=0` |
| 13:28:42 | Row 6120 **sent=1** (the mail service accepted it). Row 6121 **sent=0**, body kept (1,184 chars) | outbox |
| 13:28 to 13:50 | The owner's mailbox shows Razorpay's "Payment successful for IT SERVICES BY RAJAT AGARWAL" and **no** mail from `hello@corporatetambola.com` for this game (inbox and trash searched; the connector does not search Spam) | Gmail search |

So the invoice was NOT missed: it exists and is correctly numbered. What failed is the delivery of three of the four mails of this payment, and nothing on the system said why.

## Who sends what, and when
* The game (this repo, `apps/edge`) sends every mail itself through Resend (`sendMail` in `src/pay.ts`). IT Services only holds the money record (a ledger push, `ledgerc.ts`); it sends no invoice mail for a game.
* Paid order note to the owner: at capture (`paidFirst`). Tax invoice and its mails: 15 minutes after capture, or earlier if the payer opens the receipt page and fills details (`issueInvoice`); the scheduled tick (`runTick`, every minute from the cron worker, and a lazy tick on any request after 5 minutes) calls `issueDueInvoices`.
* A mail that fails is kept (body only) and retried by the **once-a-day** sweep only: `lifecycle.ts` runs `retryOutbox` on the first tick of each UTC day (kv `outbox_retry_day`), and `worker.ts housekeeping` once per day on the first organizer request. A mail that failed at 13:28 UTC therefore waited until after 00:00 UTC.

## Hypotheses
| # | Hypothesis | Verdict | Evidence |
|---|---|---|---|
| 1 | The plus-address is refused or normalized by the sender, provider or an allow-list | **Refuted as the cause** | 15 earlier mails to a plus-address were accepted (`sent=1`, one distinct plus-address). The code never touches the address except lower-casing. But the two plus-address mails of today did fail: see 7 |
| 2 | Invoice only sent for non-owner-adjusted prices or above a floor | **Refuted** | The invoice was issued with the owner price; its mail to the payer was accepted. No such condition exists in `issueInvoice` |
| 3 | Invoice queued for a cron that has not run / is not wired | **Refuted** | Invoice issued at 13:28:42, due 13:27:49; `kv.tick_last_ms` moves every few minutes (1795181562643 at the time of the check) |
| 4 | The webhook path that marks paid skips the mail step | **Not the cause, but a second finding** | The payment was confirmed through the browser path; the mail step ran (rows 6119, 6120, 6121 exist). **No Razorpay webhook has reached either database since 21 Oct 2026** (`webhook_log` last row 2026-10-21 in Tambola; 15 Oct in IT Services, 76 rows in all, only 3 with a good signature in Tambola). The pay link flow works without it, but any payer who closes the page before confirmation relies on it. Needs the owner's attention in Razorpay (webhook URL and secret) |
| 5 | Mail suppressed for free-launch / test / demo account | **Refuted** | `is_test=0`, site mode LIVE (`/api/payments/status`: `razorpay`, `LIVE`), `freeLaunch=false`; the organizer address is not one of the 3 test logins; outbox rows exist |
| 6 | Mail went to spam or a different mailbox | **Unproven for row 6120** | Row 6120 was accepted by the mail service for `raajat.agarwal@gmail.com` (same Gmail inbox as `raajatagarwal@gmail.com`; Gmail ignores dots) but is not in the inbox or trash. The search tool cannot look in Spam. BOSS or the owner must open Spam / All Mail and look for "payment received, invoice CT/2026-27/000001" |
| 7 | The mail service refused the send and the system swallowed it | **PROVEN** (cause of the refusal unproven) | Rows 6118, 6119, 6121: `sent=0`. The old code did `return r.ok` and threw away the status and the error, so no reason exists anywhere. `mail_bounce` and `mail_event` are empty (the Resend webhook has never delivered a row) |
| 8 | A provider limit or a passing hiccup is behind the refusals | **Most likely, unproven** | The same recipients succeed and fail at different times (yahoo: 8 accepted, 165 refused; plus-address: 15 accepted, 160 refused), so it is not a property of the address. Refusals cluster in the 18 Nov smoke-test burst (hundreds of mails in a few hours) and four isolated refusals today. Resend's account is shared by the other products (`docs/GO_LIVE_ZERO_COST.md`): a rate limit or daily quota consumed elsewhere would look exactly like this. Only the provider's reply can settle it, and it was not kept |
| 9 | The retry is too slow or starved | **PROVEN** | See below |

### Proven: why a refused mail stayed unsent
1. `resendSend` returned only `r.ok`: no status, no error name, no log (nothing to read today).
2. No quick retry: one try per mail. A 429 or 5xx cost the mail.
3. The only retries were the daily sweeps, and `retryOutbox` has no limit and no pause: on 18 Nov it faced about 330 unsent test mails at once and fired them back to back, which a rate-limited provider refuses again. The three unsent mails of this payment sit in that same queue (they are within the 3-day window; the next daily sweep will try them together with the old backlog).
4. The ordering problem: a fresh invoice mail has no priority over old test mail.

## The fix (in this repo; branch `boss/rca-no-invoice-mail-2026-11-20`)
1. `src/pay.ts` `resendSend`: a 429, a 5xx or a dropped connection is tried again twice (0.8 s, 1.6 s; setting `MAIL_RETRY_MS`) with ONE idempotency key per mail, so a retry can never deliver twice. A 4xx refusal is not repeated.
2. A mail that still fails writes `send_failed <status> <provider error name>` to the existing `mail_event` table (no migration). Only the error NAME, never the provider's free text (it can quote the address) and never the address (only the existing hash).
3. `src/pay.ts` `retryRecentOutbox`, called from every tick (`worker.ts runTick`): the 3 newest unsent mails of the last 24 hours, with a growing wait (2, 4, 8, 16, 32 minutes), six tries, a stable key `outbox-<id>`. Fresh invoices go first and an old backlog cannot starve them or burst the rate limit. The daily sweep and the 3-day purge are unchanged.
4. Tests: `apps/edge/test/mail-retry.test.ts` (10 tests). Broken one at a time to prove they bite: no inline retry (3 red), no reason logged (3 red), tick not wired (1 red), oldest-first order (1 red); all green restored. The existing `pay.test.ts` and `usecases.test.ts` set `MAIL_RETRY_MS=0` so their failed-mail cases do not wait.

Not changed (and why): the 15-minute invoice delay (a design decision, payer details first); the webhook; Resend account settings (not in the repo).

## What BOSS / the owner must do (outside the repo)
1. **Deploy** this branch (Pages deploy of `corporate-tambola`; the cron worker needs no change). After the deploy, the next tick sends the three stuck mails of this payment by the real path (rows 6118, 6119, 6121 are inside the 24-hour window until 13:02 UTC on 21 Nov; row 6118 is the stale "payment pending" note and will arrive after the paid one: harmless). If the deploy is later than that, the daily sweep still sends them until 23 Nov.
2. **Read the reason** after the deploy: `SELECT outcome, COUNT(*) FROM mail_event WHERE outcome LIKE 'send_failed%' GROUP BY outcome`. That names the provider's error (for example `429 rate_limit_exceeded`, `429 daily_quota_exceeded`, `403 validation_error`) and settles hypothesis 8. If it is a quota, that is a Resend plan matter (shared account with the other seven products).
3. **Spam check** for hypothesis 6: search the owner's Spam and All Mail for "payment received, invoice CT/2026-27/000001" (accepted by the mail service at 13:28:42 UTC).
4. **Razorpay webhook**: no webhook has arrived since 21 Oct (Tambola) / 15 Oct (IT Services). Check the webhook URL (the game's own address is `housie.corporatetambola.com`) and the secret in the Razorpay dashboard. Owner action; not a code change.
5. Optional: `MAIL_RETRY_MS` needs no setting (default 800).

## Re-sending the invoice for THIS payment
Not done by hand and not with a fake mail. The real organizer copy (row 6121, the invoice text) is waiting in the outbox and goes out by the real path at the first tick after the deploy. Nothing was sent or changed on the live site during this analysis (read-only SELECTs only).

## Limits of this analysis
* The mail service's reply for the three refused sends was never recorded, so the exact refusal cause cannot be proven from the past. The fix records it from now on.
* IT Services' own repository was not read; only its database (read-only) was used to confirm the payment record.
* The Resend dashboard (delivery log) was not available to this session.

## Addendum: after deploy (2026-11-20 16:05 UTC, deploy `8706cf94`, rollback `b7cf346e`)
* The mail log now names the refusal: `send_failed 429 monthly_quota_exceeded` (2 rows). Hypothesis 8 is confirmed in kind: the mail service's **monthly quota** is exhausted (shared account), which also explains why the old code lost the mails without a reason.
* The first tick after the deploy sent the organizer copy of invoice `CT/2026-27/000001` (outbox 6121, `sent=1`). The "published" note (6118) and the "paid order" note (6119) were refused again with the quota error and remain queued for the tick retries.
* Owner action: raise or reset the Resend plan/quota. Follow-ups M1 to M3 of the audits are in `docs/KNOWLEDGE/05-OPEN-ITEMS.md`.
