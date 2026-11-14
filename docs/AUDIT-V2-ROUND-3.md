# V2 audit, round 3 (independent Rule 7c auditor)

Audited commit: fe6bc62. Result: **PASS** (first of the two consecutive PASS needed). Report as returned, lightly trimmed.

AUDIT: PASS

No defect that should block the owner's deploy decision. Round 2's Host-limit defect is fixed; nothing new was broken.

## Verified
- All 11 V2 test files pass, run one at a time: v2-ai-key 11, v2-keys 16, v2-ai-label 10, v2-certs 15, v2-claims 12, v2-export 8, v2-host 14, v2-join-id 5, v2-receipts 10, v2-support 10, apps/web v2-pages 12. `migrations`, `ai-link`, `ai-privacy`, `account` also pass.
- Migration 0032 equals `V2_SCHEMA` and is additive only. `packages/` has no diff. The edits to `winners.ts`, `lifecycle.ts`, `worker.ts` are neutral hooks. Item 9 is not built. No new payment path; payee text is `IT SERVICES BY RAJAT AGARWAL via Razorpay`.
- Round 2 defect fixed: with 5 game-only Host keys made, a real Host could still be created via `POST /api/org/host` (200); the account limit of 5 still holds for real Hosts. The `worker.ts` count adds `AND scope_eid IS NULL`; every pre-V2 account has NULL there, so no existing behaviour changes. Game-only Host keys are capped at 5 per game. `v2Purge` switches scoped keys off 24 hours after the end or cancellation (test: 0 active rows after).
- Expiry is exact: at end + 24 h minus 1 ms the keys answer 200; at exactly end + 24 h and later, 401, for `gm`, `ga` and `lh`.
- `whoami` says `ai` for an AI game key. The report-link test now proves the AI key gets no address while a master key does.
- Privacy crawl of about 45 actions, GET and POST, with an AI game key and a Host key, live and after the end: no guest name, mobile or e-mail came back. Names and mobiles reach only the person's own game key.
- Path variants and `/ai/ctg_...` links are refused, and the tests cover them.

## Must fix before deploy
None.

## Owner should know (small, none blocking)
1. MINOR `worker.ts` AI_MANIFEST said an AI game key can use `v2/certs` after the end; the gate allows only export, receipts, status, keys after the end. (Fixed afterwards: the words were removed.)
2. MINOR `docs/V2_CHANGE_PLAN.md` item 7 still said game-only Host keys count toward the 5-Host limit. (Fixed afterwards.)
3. MINOR (test weakness) the Host-limit assertion only checked the response was not a "5 Hosts" error. (Fixed afterwards: it asserts 200.)
4. NOTE `GET /api/org/team` lists game-only Host keys as Hosts, so the Team screen can show more than 5 until the daily purge revokes them.
5. NOTE after the end a game master key cannot reach `v2/certs` (the account key can); it gets the report link via `reportlink`.
6. NOTE the claim-rejection note is public for any ticket number; a name typed in words is readable.
7. NOTE support tickets are free text kept 365 days; an organizer-level AI key sees every ticket on the account.
8. NOTE step-down is immediate, also in a live game.
9. NOTE the migration must be applied before the code.

Item 6 reading (`ctg_` new, `ctk_` unchanged): reasonable and safe. No way round the scope gate was found.
