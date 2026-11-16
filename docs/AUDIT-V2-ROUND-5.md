# V2 audit, round 5 (independent Rule 7c auditor)

Audited commit: 519fb2f. Result: **FAIL**. Report as returned, trimmed. Fixed in 09c0652 and 0843076.

AUDIT: FAIL

Clean: play rules and `packages/` unchanged; item 9 not built; migration additive and equal to `V2_SCHEMA`; scope gate (path tricks, `/ai/` links, query keys, other games, owner routes, key minting) all refused; expiry exact at end + 24 h; AI game key refused on every people route; the audit.ts regex change does not break the hash chain.

## Must fix before deploy
**1. MAJOR: the "no payment secrets" receipt view handed out a key to those secrets.** `shape()` returned `paymentId` (`pay_<hex>`) to Hosts and AI keys (and in the export). The public route `GET /api/payments/{paymentId}/receipt` accepts that id alone and returns `invoiceUrl` and `razorpayPaymentId`; `/api/invoice/<token>` then opens the invoice with the buyer's name and mobile. Reproduced from a Host key. Fix: leave `paymentId` out of the non-full view; test that no `pay_` id appears for a Host or AI.
**2. MINOR: owner note not ready to deploy from.** Placeholders; `wrangler d1 execute` must run from `pages/` with `CLOUDFLARE_API_TOKEN` (the repo's convention); rollback leaves a gap (run the SQL again after the Pages rollback); "four shared files" omitted `audit.ts`; ticket visibility note incomplete.

## Owner should know
3. MINOR: the unscoped AI key read the organizer's support tickets (billing, GST).
4. MINOR: `/api/owner/v2/support/N` not covered by the audit regex (the owner's reply was copied).
5. NOTE: dropping the whole body loses accountability for decisions, mode switch and hand-over approve vs decline; keep a whitelist of plain fields.
6. MINOR: hand-over notes keep a typed mobile number for about a year.
7. MINOR: calls that declare an AI (`x-ai-model`) on the organizer's own key still got full org-wide receipts and could approve claims and make keys.
8. NOTE (disclosed): claim notes are readable by any ticket number; `prizegiven` returns the reason unauthenticated.
9. NOTE: retention (support survives account close; test-mode purge does not clean `v2_cert`/`v2_support`; failed-mail text 3 days; the AI label takes up to 40 characters).
10. NOTE: the `ctg_` reading is reasonable; an AI handed the account's `ctk_` key keeps account-wide non-expiring power.
11. NOTE: the payment-time e-mail says "Seller: IT Services by Rajat Agarwal" and "Paid via Razorpay", unchanged.
12. NOTE: the Host key without personal data keeps `announce`, `override`, `prizegiven` for 24 h after the game (disclosed).
