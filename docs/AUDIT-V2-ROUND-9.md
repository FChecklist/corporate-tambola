# V2 audit, round 9 (independent Rule 7c auditor)

Audited commit: 9153cc2. Result: **PASS** (the second PASS in a row after round 8; the two consecutive PASSes the owner's rule needs). Report as returned, lightly trimmed. No code was changed after this audit; only documents.

AUDIT: PASS. No defect that should block the owner's deploy decision.

## Verified
- All 15 `apps/edge/test/v2-*.test.ts` files and `apps/web/test/v2-pages.test.ts` pass, run one at a time; `migrations` and `ai-link` also pass. Migration 0032 equals `V2_SCHEMA` and is additive. `packages/` untouched. Play-adjacent edits are neutral: `winners.ts` optional audit label; `lifecycle.ts` one table in the erase list; `hostsetup.ts` copies scope columns; `pay.ts` adds `scope_eid IS NULL` to two key lookups; `prizegiven` is held only while claim review is on. Item 9 is not built.
- `authOfKey` is the only place a key becomes an identity; a one-game key counts only by header, Bearer or the `/ai/<key>` path. Every other direct read of a key row by hash is unscoped-only or reviewed. The Google `hostKey` body flow is closed twice (resolver ignores it; SQL adds `scope_eid IS NULL`); `mintDeviceKey` copies the scope.
- Rehearsal, the only game route that made full-strength Co-host keys, is refused for game keys. Path tricks (double slash, trailing slash, case, `..`, `%2e%2e`, `%2F`, Bearer-only) give 403 `key-scope` or 404.
- The AI game key never reaches the people lists; exports, certificates and receipts carry no names or payment ids for an AI or declared-AI call. Expiry is exact at end + 24 h; after the end the AI game key's erase is refused. Support, hand-over, certificate and key ids are scoped by organization and game in the SQL.
- The route-walk test reads routes from the source and walks every key kind, padded bodies and keys in body or query. Part 1 of `V2_ROUTE_TABLE.md` matches the code.

## Must fix before deploy
None.

## Minor findings and notes (not fixed: the audited code is frozen; the owner note lists each)
1. `/ai/<expired Host key without personal data>` still returns the static Host manual (200) and writes a trail row; every data route under it is 401. No game data is shown.
2. A Host key without personal data keeps `override` and `announce` for the game's life (and 24 h after): `override` can give a prize to another claimant or remove it. Disclosed (owner note item 8). Dropping `override` from the allowed list is a one-line change if the owner prefers it.
3. After the end a person's game key cannot list or download certificates (only export, receipts, status, keys); names are gone about 20 hours after the end anyway. The organizer's account key can.
4. The export blanks names beyond 3,000 with no flag in the file.
5. Support limits (10 per day, 20 open) are per account, so a Host key without personal data could use them up.
6. If the code is deployed before migration 0032 the daily erase batch fails for every game (it names the new claim-review table): keep the order migration, then deploy.
7. Disclosed limits unchanged: claim-review reasons readable with a ticket number; a certificate stays valid after a later rejection; support, hand-over and notice text kept 365 days; master-key calls labelled AI only when declared; `prize.pii` kept 365 days.
8. Two approvals of one hand-over at the same moment could make two Host keys; the 5-key game limit counts expired, not yet switched-off rows.
9. `AI_MANIFEST` and `ai-link.ts` do not list `v2/certs` for the AI game key nor the claim-review read by a Host AI link; the owner note's public-route list is accurate.
10. The stale rehearsal row in `V2_ROUTE_TABLE.md` part 2 is corrected (document only).
11. Not verified by the auditor: payee wording in `pay.ts` invoices and the payment-time e-mail (not edited by V2). Missing tests: expired Host key on `/ai/`; names cut at 3,000; concurrent hand-over; support quota abuse.
