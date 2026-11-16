# Where things are

## Code (relative to the repository root)

- **New server files:** `apps/edge/src/v2.ts` (dispatcher, status, clean-up), `v2-keys.ts` (the scope gate and game keys), `v2-host.ts` (Host keys, step-down, hand-over), `v2-claims.ts` (claim review), `v2-receipts.ts`, `v2-certs.ts`, `v2-export.ts`, `v2-support.ts`, `v2-types.ts`, `v2-schema.ts`.
- **Small additive changes in shared files:** `apps/edge/src/worker.ts` (the single key resolver `authOfKey`, the gate called first in the router, the AI label, daily clean-up call, AI manual lines), `winners.ts` (optional trail label), `lifecycle.ts` (one more table in the erase list), `ai-link.ts` (manual lines), `audit.ts` (V2 calls keep only plain choices), `hostsetup.ts` (a device key keeps the scope), `pay.ts` (checkout and proforma ignore one-game keys), `pages/build.mjs`.
- **Web:** `apps/web/public/lang/ui.js`, `lang/hi.js`, `v2.js` (the "More tools" panel), `claimnote.js`, `verify.html`, `verify.js`, `guide.js` (kind messages), script tags in `z.html`, `zc.html`, `big.html`, `board.html`.
- **Database:** `apps/edge/migrations/0032_v2_changes.sql` (additive only). New tables: `v2_cert`, `v2_support`, `v2_support_msg`, `v2_claim_review`, `v2_flag`, `v2_handover`, `v2_notice`. New columns: `organizer_key.scope_eid`, `scope_src`, `scope_kind`; `ai_audit.label`.
- **Rollback:** `deploy/ROLLBACK_V2.sql`.
- **Tests:** `apps/edge/test/v2-*.test.ts` (15 files) and `apps/web/test/v2-pages.test.ts`.

## Routes

New and changed public routes, keyed routes, error codes and the key rules are in [OWNER-NOTE.md](OWNER-NOTE.md) ("New and changed public routes"). The full table of every route that accepts a key, token, payment id or claim data, with what each key kind may do, receive and become, is in [../V2_ROUTE_TABLE.md](../V2_ROUTE_TABLE.md).

## Keys, in one paragraph

`ctk_` account key (unchanged), `cta_` AI link, `cth_` Host key, `ctc_` Co-host key, new `ctg_` game key. A key made for one game (stored with `scope_eid`) is accepted only in the `x-organizer` header, `Authorization: Bearer`, or the `/ai/<key>` link, and only for its own game; a gate at the top of the router refuses everything else (default deny). Sent in a request body or query string it counts as no key.
