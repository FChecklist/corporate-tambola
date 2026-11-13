# V2 audit, round 7 (independent Rule 7c auditor)

Audited commit: 6527b79. Result: **FAIL**. Report as returned, trimmed. Fixed in the next commit.

AUDIT: FAIL

## Must fix before deploy
**1. BLOCKER: a Host key made without personal data (`lh`) could turn itself into a lasting, account-wide Host key.** `POST /api/auth/google` with `intent:"host"` reads the Host key from the request BODY (`hostKey`), so `scopeGate` (which looks at the `x-organizer` header or Bearer) never saw it, and `authOfKey` accepted it. The old safeguards (a spent first-open link; the 24-hour `cth_` key's `expires_ms`) did not apply: an `lh` key has `expires_ms` NULL and `host_state.spent=0`. `confirmHostEmail` then bound the caller's own Google e-mail and `mintDeviceKey` copied the row WITHOUT `scope_eid`/`scope_kind`, producing a normal Host key with no game scope and no expiry (reproduced: `GET /api/org/team` answered 200 with it; the old `lh` key stopped working; `v2Purge` and `keys/revoke` match only `scope_eid` rows, so it survived the 24 hours). This broke item 7. Fix: refuse when the key's row has `scope_eid` (add `AND scope_eid IS NULL` to the `ident` query), and make `mintDeviceKey` copy the scope columns. Missing test: no test called `/api/auth/*` with an `lh` key in the body; grep for any other route that reads a key from the body or query.

## Owner should know
Scope-gate paths held (ctg_ refused as `/ai/` link; gate fails closed on any path that is not `/api/z/{this game}/...`; `_method`/`_body` only on `/ai/` and passes the same gate; `reuse` fails closed). `prizeHold` uses the same parser, size limit and `/prizegiven` regex as the real route; `markGiven` is the only writer of `given_ms`. Play rules, migration, item 9, item 6 reading: as in earlier rounds. 13 V2 test files pass one at a time.
