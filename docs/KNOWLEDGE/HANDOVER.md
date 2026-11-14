# Tambola V2: hand-over (14 Nov 2026)

Branch `tambola-v2`, worktree a separate worktree, built off live **c6897f2**. Last commit before the knowledge pages: **925ada8**. Nothing deployed or pushed; the live folder untouched; no DNS or secret change.

## Read in this order (all in the worktree's `docs/`)
1. `V2_OWNER_NOTE.md`: plain words for the owner, 24 "decide or know" items, migration and rollback, exact deploy steps (NOT run), public routes for the AI gateway, diff summary by path.
2. `V2_ROUTE_TABLE.md`: every route that takes a key, with the rules per key kind. Test: `apps/edge/test/v2-route-walk.test.ts`.
3. `AUDIT-V2-ROUND-1.md` to `-9.md` (rounds 8 and 9 passed in a row; round 9 was on 9153cc2, after which only documents and one manual-line word changed).
4. `V2_CHANGE_PLAN.md`, `PROGRESS-V2.md`.

## Facts a deployer needs
- Migration first: `apps/edge/migrations/0032_v2_changes.sql`, from `pages/`, with the D1 token. Back up D1 first (the ALTERs cannot be re-run). Then `bun run pages:deploy`. Code before migration breaks the nightly erase for all games.
- Rollback: `deploy/ROLLBACK_V2.sql`, roll Pages back to the deployment id noted before deploy, run the SQL again.
- Suite, each file on its own: live 248 files / 4,027 pass / 1 fail (pre-existing `ai-enablement`); V2 264 files / 4,207 pass / same 1 fail.
- The AI gateway (the AI gateway) needs regenerating against V2: new routes are listed in the owner note ("New and changed public routes").
- Not V2 but found on the way: a Host's AI work link gets the report link (names and mobiles); `POST /api/helpdesk/approve/start` is public and returns a 30-minute account key with an approval token.
- Owner decisions made: K4 closed on 14 Nov 2026 (winners' name, mobile, e-mail if available, game id and ticket number kept 365 days, as the Terms and Conditions say); the Host key without personal data keeps `override`. Still to do: review the V2 wording lines listed in `05-OPEN-ITEMS.md` (a new audit round is needed if they change). Hindi coverage and item 9 (unbuilt) are unchanged.
