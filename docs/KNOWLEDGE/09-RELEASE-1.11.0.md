# Release 1.11.0 (21 Nov 2026): mail lanes, the 21 Nov quota fact, the Host number fix, ten 250-player games - deployed 21 Nov 2026

**Update:** this release is live (commit `8a4a0be`, deployment `1366bf89`). Later changes are in `10-RELEASE-1.11.1.md`. The text below was written before the deploy and is kept as it was.

Written for a person or AI session that has not seen this work. One pull request on top of the 1.10.2 branch (PR #36, `fix/small-prs-on-1-10-1-2026-11-21`, head `38521ef`). It stacks two older pull requests that were never merged: PR #34 (mail lanes) and PR #35 (250x10). No secret, key or address is in this page. The money flag `PAY_VIA_MONEYPENNY` is off and is not touched.

## The fact (21 Nov 2026)
Resend answered `429 monthly_quota_exceeded`. The free plan (3,000 mails a month) is shared by several products. What must then be true:
1. Invoice and sign-in mail still goes out: Resend is not asked again for the same mail, and the same mail goes once by Cloudflare Email (this is the 1.9.2 fallback, live; it needs the Pages secrets `CF_EMAIL_TOKEN` and `CF_ACCOUNT_ID`).
2. The organizer is told the truth where the screen says "we e-mailed your invoice".
3. The owner is warned before the month runs out (80 %), and at once when the provider itself says it is used up.

## Where things are
| What | Where |
|---|---|
| Lanes, warm-up, counter, alert, per-mail state, do-not-mail list, status | `apps/edge/src/mail-lanes.ts`, `pay.ts`, `admin.ts`, `worker.ts` (full page: `08-MAIL-DELIVERABILITY.md`) |
| Provider's own quota answer raises the critical alert; the organizer note | `noteProviderQuota`, `ORGANIZER_NOTE_BACKUP`, `ORGANIZER_NOTE_LATE`, `mailStatus().organizer` in `mail-lanes.ts`; the call is in `resendSend` (`pay.ts`) |
| The two screens that show the note | `TB.mailNote` in `apps/web/public/common.js`; called from `site.js` (order done) and `paykit.js` (payment done) |
| Host number-picking fix | `publishControl(..., nowRound)` and `STALE_ROUND_REFUSAL` in `packages/beacon/src/control.ts`; the worker passes the store's round |
| 365-day leftovers (`cv/<game>`, `presence`) | `deleteEngagementRows` and the hourly sweep in `apps/edge/src/lifecycle.ts` |
| Ten 250-player games | `tools/game250/` (run: `bun run tools/game250/run.ts all`, then `bun run tools/game250/report.ts`); results `docs/250x10/RESULTS.md`, findings `docs/250x10/FINDINGS.md` |

## What the organizer sees (and does not)
- `GET /api/status/mail` (public, short: `ok`, `level`, `at`, `organizer`; the full counters are `GET /api/owner/mail-status`, owner only) has `organizer.degraded`: `none`, `backup` or `late`.
- `backup` = used up and the Cloudflare route is set. `late` = used up and it is not. In both cases the text says mail can come later, may land in Spam (backup only), and that the payment is not affected. It never names a provider and never gives a number.
- A rate-limit 429 (not a quota) is not "used up". The provider's word counts for 2 hours (`QUOTA_SEEN_MS`); after that, with no new answer, the note goes. Our own counter at 100 % also counts.
- The 80 % warning is for the owner only (a log line `[mail-alert] WARN`, and `level: "warn"` in the status). The organizer is told only when mail is really affected.

## Tests
- `apps/edge/test/mail-quota-organizer.test.ts` (9): Cloudflare route set and not set, once-a-month alert, the note's wording, the 2-hour window, plain 429, counter at 100 %, 80 % warning with Cloudflare mails not counted, and that the two screens call `TB.mailNote`. After the audits: the note's truthful wording, a daily quota answer is not a used-up month. Removing the `noteProviderQuota` call turns three of them red.
- `apps/edge/test/mail-lanes.test.ts`, `mail-webhook.test.ts` (PR #34; its 41 deliberate breaks are listed in `08-MAIL-DELIVERABILITY.md`).
- `packages/beacon/test/control-freshness.test.ts`, `apps/edge/test/control-freshness.test.ts`, `retention-leftovers.test.ts`, `ordinal-names.test.ts` (PR #35).

## After the first two audits (same version, still not deployed)
Audit 1: FAIL (High: returning visitors with an old saved `common.js`). Audit 2: PASS with four Medium. All fixed on the same branch; list, files and tests in `CHANGELOG.md` (1.11.0, "After the first two audits"). In short:
- `site.js` and `paykit.js` call `TB.mailNote` only if it exists; the service-worker cache is `ct-game-v46` (rule: any new helper added to a cached script must be guarded where an uncached script calls it, and the cache name moves).
- The Help Desk invitation is transactional; a `secret` mail is never queued in bulk.
- `ORGANIZER_NOTE_LATE` promises only the invoice and says to keep the key shown on the screen.
- The do-not-mail list holds back the BULK lane only and uses the exact address (`+tag` kept).
- Public `GET /api/status/mail` is short and cached 30 s; the owner reads `GET /api/owner/mail-status`.
- Refer & earn code: site-wide hourly cap (`ANON_MAIL_PER_HOUR`, default 60). No CAPTCHA yet.
- `apps/web/test/zc-default-182.test.ts` waited for too little (a race in the test, not a product bug).

## Open (owner / BOSS)
1. Apply migration `0033_mail_lanes.sql` before the deploy (additive).
2. Set the Pages secrets `CF_EMAIL_TOKEN` and `CF_ACCOUNT_ID` if not set: without them the note says `late`, and invoice mail waits for the next Resend month or a plan upgrade.
3. Resend webhook and `RESEND_WEBHOOK_SECRET`, DMARC `rua=`, Gmail Postmaster Tools, plan upgrade: `docs/MAIL-DELIVERABILITY-OWNER-STEPS.md`. DMARC report intake is a dashboard step; no code reads the reports.
4. The send counter starts at zero on the deploy day and sees only this site's mail. Set `MAIL_MONTHLY_QUOTA` to the real plan size; the provider's quota answer is the safety net.
5. Two audits on the exact head commit before any deploy (BOSS gate).
6. Residual risk of the Host fix: the store's clock is trusted for when a press arrived; and a press must arrive within about 3 to 6 seconds of being signed (see `docs/250x10/FINDINGS.md`).

## Roll back
Deploy the 1.10.2 head `38521ef` (the version live before this one; 1.10.1 `4a18c29` would lose the 1.10.2 fixes). The four new mail tables stay and are ignored by the old code; all new settings are optional.
