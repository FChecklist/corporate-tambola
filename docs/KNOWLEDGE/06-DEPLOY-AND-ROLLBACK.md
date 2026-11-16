# Deploy plan and rollback steps, as written (NOT run)

Nothing here has been run. It waits for the owner's go, a recorded rollback id, and zero live games.

## The migration and the rollback

- **Migration:** `apps/edge/migrations/0032_v2_changes.sql`. Additive only: new tables and three new columns (`scope_eid`, `scope_src`, `scope_kind`) on `organizer_key`, plus an AI-label column on the trail. Nothing existing is changed or dropped.
- **Take a D1 backup (export) first.** The migration cannot be re-run after a partial failure; if it stops half way, restore the backup and start again.
- **It MUST be applied BEFORE the deploy.** The new code reads the new columns on every keyed call. The ALTERs cannot be run twice.
- **Rollback id:** the Cloudflare Pages deployment that is live just before the deploy (today it is the build of c6897f2; read its id from Pages > corporate-tambola > Deployments, or `node tools/list-deploys.mjs`). Write it down BEFORE deploying.
- **Rollback steps:** (1) run `deploy/ROLLBACK_V2.sql` (it switches off every key made by V2, because the old code would read them as full keys); (2) roll Pages back to that deployment. The new tables and columns can stay; the old code does not read them.

## Deploy steps (NOT run; they wait for your go, a rollback id, and zero live games)

```bash
# 0. Be sure no game is live, and note the current Pages deployment id (the rollback id).
# 1. The database change, first:
# (from the pages folder, with the D1 token in CLOUDFLARE_API_TOKEN, as deploy/UPDATE_LIVE_DATABASE.sql says)
cd pages
bun x wrangler@3 d1 execute corporate-tambola --remote --file ../apps/edge/migrations/0032_v2_changes.sql
cd ..
# 2. The site:
bun run pages:deploy
# 3. Check: open /version.json, it must show the V2 commit; open a game page, the "More tools" button appears.
```

If anything looks wrong: run `deploy/ROLLBACK_V2.sql` with wrangler as in its header, then roll Pages back to the rollback id, then run `deploy/ROLLBACK_V2.sql` AGAIN (a key made between the two steps would otherwise be read by the old code as a full key).

