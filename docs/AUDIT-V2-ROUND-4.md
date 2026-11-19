# V2 audit, round 4 (independent Rule 7c auditor)

Audited commit: 895cdfb. Result: **FAIL** (so round 3's PASS does not count; two new consecutive PASS are needed). Report as returned, lightly trimmed.

AUDIT: FAIL

All 12 V2 test files pass one at a time, plus migrations, ai-mail, guide, ai-privacy, ai-link, audit, host-setup, hostcalls, hostlink, erase-real-end. One finding blocks the deploy.

## Must fix before deploy
**1. MAJOR: the audit log keeps the Host's raw claim-review reason past the 24-hour erase.** `audit.ts` logs the request body of every write (`changes: fields`); the V2 paths are not matched by its route pattern, so the call is logged as `other_write`, sealed in the org chain, and kept for the audit retention (365 days). Reproduction: a Host rejects a claim with `Ramesh Kumar called 9876543210 line not full`; `v2_claim_review.reason` holds the digit-stripped text, but the decrypted audit row holds the raw reason. This undoes the digit-stripping, breaks "all participant information deleted within 24 hours", and the support text and hand-over notes are copied the same way. Fix: skip the body copy for V2 paths (or add reason|note|body|subject to SECRET_KEY) and add a test.

## Owner should know
- MINOR: owner note placeholders (`SUITE_RESULT_PLACEHOLDER`, `AUDIT_ROUNDS_PLACEHOLDER`) to be filled.
- MINOR: receipts ignored a declared AI (`x-ai-model`) unlike export and certs.
- MINOR: Hosts could read the organizer's support tickets for their game (billing, tax); consider Hosts reading Hosts' tickets only.
- NOTE: a game master key can pay with credit (`pay-with-credit`) although the scope message said "payments".
- NOTE: claim notes are readable by anyone with a ticket number from the public seat list, and an unauthenticated `prizegiven` reply carries the rejection reason in its 409.
- NOTE: the player note polls every 30 to 45 seconds while review is on; the route has no edge cache.
- NOTE: the "game is over" message tells an AI game key it may erase and clone; it is then refused with different text.
- NOTE: only organizers who make a `ctg_` key get the 24-hour expiry; the default `cta_` AI link stays lasting.
- NOTE: a Host key without personal data was not exercised in a real browser console; the AI label is visible only through `GET v2/aitrail`.
- NOTE: the migration cannot be re-run after a partial failure: take a D1 backup first. The deploy order is correct.

## Checked and clean
Scope gate (path tricks, `/ai/` links, `_method` fallbacks, other games, expiry at exactly end + 24 h); play rules and `packages/` unchanged; migration additive; no `innerHTML` use of server strings, certificate HTML escaped with a CSP, CSV formula-safe; language lives only in `localStorage`; AI manifest and public routes match.
