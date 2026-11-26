# Release 1.12.0 (27 Nov 2026): payments through the console only

- Flag `PAY_VIA_CONSOLE=1` (wrangler var, off by default). On: the game's own checkout, proforma, pay link, credit and test-payment routes answer 410 with the console's address; no payment order is opened from the game; the old credit and ledger C jobs stop. Razorpay's webhook is not shut.
- New routes (bridge): `POST /api/console/payable`, `POST /api/console/paid` (signed assertion, one use, repeatable by order id). They exist whether or not the flag is on, and answer 404 while `CONSOLE_PUBKEYS` is empty.
- The game records only a pack record with amount 0 for such a payment. Money, invoices and commission are the console, Moneypenny and IT Services books.
- Rollback = unset the flag. Nothing was deleted.
