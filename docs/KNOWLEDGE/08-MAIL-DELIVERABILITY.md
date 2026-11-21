# Mail deliverability: lanes, warm-up, delivery reports (release 1.11.0, 21 Nov 2026)

Written for a future person or AI session that has not seen this work. It describes the code as built in PR 34 (branch `claude/intelligent-mendel-gacbp5`) and landed in release 1.11.0 on top of the 1.10.2 branch. Nothing here is deployed. No secret or address is in this page.

## 1. What and why
- 20 Nov 2026: the owner's Rs 1 payments made invoices, but mails Resend accepted were not seen in his inbox and others were refused with `429 monthly_quota_exceeded` (the free plan, shared by the products). The domain `corporatetambola.com` is young (registered 15 Oct 2026), has no sending history, and nobody received delivery feedback (RCA: `docs/RCA-NO-INVOICE-MAIL-2026-11-20.md`, PR 33 `docs/RCA-MAIL-DELIVERABILITY-2026-11-20.md`).
- Owner rule behind this release: invoice, payment, game-start and sign-in mail must never be blocked or delayed by marketing or bulk mail; the young domain warms up slowly; the owner must see bounces and complaints and stop mailing bad addresses.

## 2. Where (files)
| File | What |
|---|---|
| `apps/edge/src/mail-lanes.ts` | The lane rule (`bulkDecision`, pure), the send counter (`countSend`, `readUsage`), the warm-up clock (`warmupDay`), the 80 % alert (`checkQuotaAlert`), the per-mail state (`recordSent`, `recordState`), the do-not-mail list (`isSuppressed`, `suppress`), the bulk queue (`queueBulk`, `drainBulkQueue`), the status read (`mailStatus`). Imports only types: no cycle. |
| `apps/edge/src/pay.ts` | `sendMail` (option `lane`; do-not-mail check), `bulkSend`, `drainBulkMail`, `tookMail` (count + track + alert), `resendSend` (lane, no Cloudflare for bulk), `bulkSend` never queues a `secret` mail (drops it, log `bulk_secret_dropped`); only the BULK lane reads the do-not-mail list (audit fix); `sendReportMail` and both retry loops ignore it and count. `QUOTA` answers: only a `monthly` name raises the critical alert. |
| `apps/edge/src/admin.ts` | The webhook `POST /api/mail/events` (per mail state, do-not-mail), `GET /api/status/mail` (public, short: `ok`, `level`, `at`, `organizer`; cached 30 s), `GET /api/owner/mail-status` (owner: the full numbers), `GET|POST /api/owner/mail-suppress` (owner), the hourly clean-up. |
| `apps/edge/src/worker.ts` | `runTick` runs `drainBulkMail` after the transactional retry; the draft reminder is sent as bulk. `apps/edge/src/helpdesk.ts`: the Help Desk invitation is transactional (audit fix: it carries a live link). `apps/edge/src/partners.ts`: the Refer & earn code is capped site-wide per hour (`anonMailAllowed`). |
| `apps/edge/migrations/0033_mail_lanes.sql` | `mail_count`, `mail_track`, `mail_suppress`, `mail_bulk_queue` (additive). |
| `docs/MAIL-DELIVERABILITY-OWNER-STEPS.md` | What the owner sets in dashboards. |

## 3. How it works
**Lanes.** `sendMail(..., { lane })`: `"tx"` (the default, so every existing mail stays transactional) or `"bulk"`. Marked bulk today: the draft reminder (`remindDrafts`) ONLY. The Help Desk invitation carries a live accept link, so it is transactional (a `secret` mail is never kept in the bulk queue: if one is sent to the bulk lane anyway it is dropped and logged). Anything else, including the payment-pending reminder, sign-in codes, invoices, receipts, game steps, is transactional. A test pins this list.
- Transactional: unchanged path (Resend with retries, Cloudflare fallback, outbox retry). It never reads the bulk counters and is never refused by them. It only adds one to its own counter.
- Bulk: `bulkAllowed` (warm-up cap, the shared day, the shared month, the provider pause) then ONE try at Resend (`resendSend(..., tries 1, lane bulk)`; no Cloudflare). Not allowed, or not taken: the mail waits in `mail_bulk_queue` (never in `outbox`, so the transactional retry cannot touch it). The tick sends waiting bulk mail, oldest first, at most 2 a tick, only when the rule allows, only when no transactional mail is waiting for its retry; a mail over 24 hours old is dropped; an address that went on the do-not-mail list meanwhile is dropped.
- Shared limits: half of the daily limit (default 100) and half of the monthly quota (default 3,000) are kept for transactional mail. Bulk may take the rest, minus whatever transactional mail has already used beyond its half.

**Warm-up.** Bulk cap by day since day 1: 0, 20, 30, 40, 50, 75, 100, 125, 150, 175, 200, 250, 300, 400; then 500. Day 1 is `MAIL_WARMUP_START` (a date), else the day this code first handled a mail (kept in `kv mail/warmup_start`). Transactional mail has no warm-up cap (an invoice must go).

**Counter and alert.** Only mails a provider ACCEPTED are counted, per day, lane and provider (`resend`, `cloudflare`). The Resend total of the calendar month (UTC) is compared with `MAIL_MONTHLY_QUOTA`. At 80 % and at 100 %: one log line `[mail-alert] WARN|CRITICAL ...` (numbers only), claimed once a month in `kv mailalert/<level>/<month>`; `GET /api/status/mail` shows `alert`, `level`, `ok`.

**Delivery reports.** After Resend takes a mail, its id is saved in `mail_track` with the lane. The webhook sets `delayed`, `delivered`, `failed`, `bounced` or `complained` on that row; a state of lower rank never overwrites a higher one (webhook calls arrive in any order); a report that arrives before our own row creates the row with lane `unknown` and the send fills the lane in. A changed state also writes `provider <state>` to `mail_event`. Every effect is idempotent and the event row (`mail_bounce`, key = the svix id) is written last, so the provider's retry of a half-done call finishes the work.

**Do-not-mail.** A `bounced` event with `bounce.type = Permanent`, or any `complained`, from OUR domain (the sender domain of `MAIL_FROM`, default `corporatetambola.com`, or a sub-domain; the Resend account is shared with other products) puts the address on `mail_suppress`. A transient or undetermined bounce, a delay and a failure do not. The list is read by the BULK lane only (invoices, sign-in codes, organizer-key mail, reports, owner notes and the retry loops are never held back by it). The list key is the EXACT address: lower case and trimmed, the `+tag` kept (`suppressKey`), so a bounce of `john+typo@co.com` does not stop `john@co.com`; the send log and the provider tracking still use `hashMail` (tag removed). A lookup that fails means "not on the list" (an invoice is never stopped by a database hiccup). The owner can clear a wrongly stopped address.

## 4. Tests (`apps/edge/test/mail-lanes.test.ts`, `mail-webhook.test.ts`) and the deliberate breaks
Each break below was applied to the code alone, the test file run, the failures counted, and the code restored (`git diff` of the source shows only the intended change afterwards). All 41 went RED.

| Break | What was broken | Failing tests |
|---|---|---|
| B01 | day 1 allows bulk (first cap 0 -> 20) | 4 |
| B02 | ramp cap ignored | 2 |
| B03 | no daily reserve for transactional mail | 4 |
| B04 | no monthly reserve for transactional mail | 1 |
| B05 | reserve share 0.5 -> 0 (bulk may take the whole day) | 5 |
| B06 | bulk may use the Cloudflare route | 1 |
| B07 | bulk mail not queued when waiting | 7 |
| B08 | queue ignores a waiting transactional mail | 1 |
| B09 | queue never expires | 1 |
| B10 | counter counts refusals too | 1 |
| B11 | alert line every time (no once-a-month claim) | 1 |
| B12 | alert at 90 % not 80 % | 2 |
| B13 | Cloudflare mails count against the Resend quota | 1 |
| B14 | status read starts the warm-up clock | 1 |
| B15 | unmarked mail goes to the bulk lane (default lane bulk) | 9 |
| B16 | provider pause ignored by the bulk lane | 1 |
| B17 | warm-up start never stored | 1 |
| B18 | old counters never forgotten | 1 |
| B19 | per-mail rows never forgotten | 1 |
| B20 | do-not-mail rows never forgotten | 1 |
| B21 | report mail counted nowhere | 1 |
| B22 | sendMail ignores the do-not-mail list | 5 |
| B23 | report mail ignores the do-not-mail list | 1 |
| B24 | tick retry ignores the do-not-mail list | 1 |
| B25 | daily retry ignores the do-not-mail list | 1 |
| B26 | any bounce counts as hard | 2 |
| B27 | a complaint does not stop mailing | 1 |
| B28 | bounces of other domains stop our mail | 1 |
| B29 | a later state can be overwritten by an earlier one | 2 |
| B30 | webhook does not check the signature | 1 |
| B31 | effects skipped when the event row exists (not idempotent) | 1 |
| B32 | +tag and capitals are different addresses | 1 |
| B33 | a failed lookup blocks the mail (fails closed) | 1 |
| B34 | provider mail id not kept (no per-mail tracking) | 3 |
| B35 | webhook does not update the mail state | 6 |
| B36 | lane of a mail reported early is never filled in | 1 |
| B37 | owner cannot clear the list | 1 |
| B38 | status address closed while the site is off | 2 |
| B39 | draft reminder is sent as transactional mail | 2 |
| B40 | Help Desk invitation is sent as transactional mail | 1 |
| B41 | payment-pending reminder wrongly bulk | 1 |

Related suites run one file at a time after the change: admin, mail-fallback, mail-retry, migrations, secrets-list, retention, releases, owner-mail, mode, pay, usecases, helpdesk, draft-remind.

## 5. Limits (honest)
- Only mail sent through this site's `sendMail` is counted and lane-controlled. Marketing mail that other products send through the same Resend or Cloudflare account is not seen here (it can still use up the provider's limits).
- The monthly count follows the UTC calendar month; the provider's month may start on another day. The count is of mails accepted, not of provider-side deliveries.
- Without the webhook secret no state ever arrives and no address is ever stopped by a bounce.
- A hard bounce from a receiver's reputation block (Resend calls it Permanent) would stop BULK mail to the address (never invoices or sign-in codes); the owner can clear it (`POST /api/owner/mail-suppress`).
- The report mail with PDF attachments (`sendReportMail`) stays Resend-only (as in 1.9.2) and is counted and stopped like other transactional mail.
- `sendMail` returns false for a bulk mail that waits (not sent now). The one bulk caller (the draft reminder) ignores the value.
- Mail lanes protect invoices from BULK mail. They do not stop anonymous visitors from using the transactional side: the Refer & earn code has a site-wide hourly cap (`ANON_MAIL_PER_HOUR`, default 60) and the sign-in code only goes to existing accounts (5 an hour per address); a bot check (Turnstile) is not built. Two more paths have their own caps since 1.11.1: player data-request mail per game and day (`DATAREQ_MAIL_PER_GAME_DAY`, default 10, then one digest) and the Help Desk invitation per hour for the whole site (`HD_INVITE_MAIL_PER_HOUR`, default 30). Do not read "protected" as "cannot be exhausted".

## 5a. Audit fixes (same release, after the first two audits)
Rules changed after the two audits on `ade4f6b` (details and tests: `CHANGELOG.md`, 1.11.0, "After the first two audits"). The mutation table in section 4 was run on the first head: rows B22 to B25 (do-not-mail on every send path) and B32 (`+tag` is the same address) describe rules that are now different (bulk lane only; `+tag` is a different address) and are replaced by `mail-webhook.test.ts` tests that pin the new rules; B07 (bulk mail not queued) now has an exception: a `secret` bulk mail is never queued.

## 6. Roll back
Deploy the previous version. The four new tables stay and are ignored. The new settings are optional.
