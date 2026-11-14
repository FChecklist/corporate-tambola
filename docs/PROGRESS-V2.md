# V2 progress notes (for BOSS)

Branch `tambola-v2`, worktree `C:\ct\test-sites\_wt\tambola-v2`, built off live **c6897f2**. Nothing is deployed, pushed, or changed in DNS or secrets. The main folder `C:\ct\test-sites\tambola` was not touched.

## Where things stand

| Step | State |
|---|---|
| A. `docs/V2_CHANGE_PLAN.md` (files, routes, play-path touch, migrations; "As built" at the end) | done |
| B/C. Build and tests for the 12 items (item 9 deliberately not built) | done, see the test list below |
| D. Independent Rule 7c audit, two consecutive PASS | **done: rounds 8 and 9 PASS in a row** (rounds 1 to 7: 1,2,4,5,6,7 FAIL with real key/permission findings, all fixed; 3 PASS); `docs/AUDIT-V2-ROUND-1.md` to `-9.md` |
| BOSS's key sweep (route table, one key resolver, route-walk test) | done: `docs/V2_ROUTE_TABLE.md`, `authOfKey(..., gated)`, `apps/edge/test/v2-route-walk.test.ts`; found and fixed the Google body-key hole and the game-key `rehearsal` hole |
| Full suite, one file at a time | live c6897f2: 248 files, 4,027 pass, 1 fail (pre-existing `ai-enablement`); V2: 264 files, 4,207 pass, same 1 fail |
| E. `docs/V2_OWNER_NOTE.md` | done, with 24 "decide or know" items, exact deploy and rollback steps (not run) |

## Tests

New files: `apps/edge/test/v2-keys`, `v2-host`, `v2-receipts`, `v2-certs`, `v2-export`, `v2-ai-label`, `v2-support`, `v2-claims`, `v2-join-id` (`.test.ts`, shared helper `v2-helpers.ts`) and `apps/web/test/v2-pages.test.ts`. Existing tests touched, only to add the new files to a list: `migrations.test.ts` (0001 to 0032), `guide.test.ts` (the V2 source files may carry plain "Not found" fallbacks), `ai-mail.test.ts` (`v2-host.ts` makes a limited Host key and mails nothing).

The whole suite was run **one file at a time** (one process, low-RAM laptop). Result against c6897f2 is in the owner note and above.

## What a reviewer should know

- Game keys are a NEW kind of key (`ctg_`). The account sign-in key (`ctk_`) is unchanged on purpose: narrowing it would lock organizers out of their own account.
- A master-key call is labelled "AI" in the trail only when it says it is an AI (header `x-ai-model: AI: <name>`, which the gateway sends). Calls with the AI key, an AI game key, or a Host's AI link are always labelled.
- Existing consent K4 keeps a winner's sealed name and mobile (`prize.pii`) for 365 days. **Owner ruling, 14 Nov 2026 (K4, CLOSED):** a winner's name, mobile, e-mail (if available), game id and ticket number are KEPT 365 days; this is already written in the Terms and Conditions. The 24-hour limit applies only to the game key's access after a game ends, not to winners' data. V2 does not use `prize.pii`.
- Hindi covers the core player phrases and the new panel; every other phrase stays English until more is translated. Adding a language is adding one file.

## Not done, on purpose

- Item 9 (Host presses "Next number"): owner said not needed.
- Nothing was run on live, on other machines, or in the cloud.
