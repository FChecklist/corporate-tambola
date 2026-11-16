# Private price for one game ID (Corporate Tambola; ported from the Corporate Luck by Chance build)

**This feature is a secret between the owner and the boss.** Organizers and players must never learn it exists. It serves the owner's own testing (including the Rs 1 live payment test) and a special price agreed by phone.

The owner can change the price of ONE unpaid game by its game ID. The list (pack) price never changes. The organizer's checkout shows one amount payable.

## How the secrecy is kept (tested in `apps/edge/test/price-adjust-secret.test.ts`)

1. No public wording: the code and routes use the neutral words "price" / "adjust". No page, script, text file, API answer or error names the feature.
2. No box and no extra line at checkout. The pay page gets one neutral field `payable: {currency, amount}` (game info); the pay link and the proforma just show the net.
3. Invoice, receipt and mails: one line `... up to N participants (one engagement), price as agreed`, beside the amount actually charged.
4. The owner's form is not in any public script. `owner-desk.js` has a generic "More" button that draws a panel sent as data by `GET /api/owner/panel`. Without the platform key, or through an AI work link (`x-cb-link: 1`), `/api/owner/panel` and `/api/owner/price` do not exist (the plain 404 of any unknown address; denied tries go to the access log).
5. Internal records stay complete (owner only): `price_adjust`, `price_adjust_audit`, the payment's `meta.priceAdjust`, the Razorpay order notes (`list_minor`, `adjust_minor`, `net_minor`, `adjust_code`, first in the notes) and the owner's "paid order" mail.

## Rules (all on the server)

* Owner key only. Only while the game is unpaid (`engagement.pack = 0`), not cancelled, not closed, no payment being confirmed. Once paid it is locked (409).
* Net = list + signed adjustment, never below 1 (Rs 1 / US$ 1) and never above 2 x list (`MIN_NET_MINOR`, `MAX_NET_FACTOR` in `price-adjust.ts`). No zero adjustment; a note of 3 to 200 characters is required (owner only, never sent out).
* One adjustment per game, in one currency (INR or USD). A bare pack purchase (no game ID) is never touched.
* Credit and a private price together: credit comes off the net; the invoice then uses the credit wording.

## Owner page

`owner-visits.html`, button **More**: find a Game ID, see the facts and history, set or remove the price, or fill "Make it Rs 1 / US$ 1 (payment test)". API (owner only): `GET /api/owner/panel[?q=ID]`, `GET /api/owner/price?eid=ID`, `POST /api/owner/price {eid, currency, direction, amount, reason}` or `{eid, remove: true}`.

## Deploy order

1. Apply `apps/edge/migrations/0030_price_adjust.sql` to D1 (the code also copes with a missing table).
2. Deploy the Worker and pages.

## Pay page (not changed by this port)

`pay.js` should show `S.info.payable.amount` (when `S.info.payable.currency` equals the chosen currency) in place of the list price, then subtract credit. Until then the charge is still the net, but the page would show the list price.
