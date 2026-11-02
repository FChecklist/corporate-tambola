# Game ID with the payment

A real payment for a game carries the game ID in all three records: Razorpay (order notes `game_id`), the central ledger (`game_id` on the order) and this game's own payment meta (`meta.gameId`, next to `meta.eid`). A bare pack purchase has none. The invoice (page and text) and the mails print `Game ID: <id>`, the owner's "paid order" mail too.

* `pay.ts` `placeOrder`: option `gameId`; sent to the central service as top-level `game_id` (central accepts `^[A-Za-z0-9_-]{1,40}$`, else 400) or, if central is not used, added to the direct Razorpay notes. The order notes are also sent to central as `extra_notes`.
* Payment test: an optional free-text `gameId` in the body is cleaned (letters, digits, space, `_ . -`, 40 characters), never looked up, goes to the order notes as `test_ref`, and is printed on the receipt as Game ID. Empty = as before. (The page box belongs to the payment-pages work.)
* Release order: central migration 0014 and central functions first, then the game. A game that sends no `game_id`, or an older central service, keeps working.
