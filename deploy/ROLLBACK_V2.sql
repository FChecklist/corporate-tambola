-- V2 rollback step (run ONLY if you roll the site back to the version before V2, c6897f2).
-- Why: V2 stores a game key (ctg_), an AI game key and a Host key made without personal data as ordinary rows in organizer_key, marked by scope_eid.
-- The old code does not know that mark and would read them as full keys. This switches every one of them off first, so nothing reaches wider than it did.
-- Run it BEFORE (or right as) the Cloudflare Pages rollback:
--   (from the pages folder, with the D1 token in CLOUDFLARE_API_TOKEN)  bun x wrangler@3 d1 execute corporate-tambola --remote --file ../deploy/ROLLBACK_V2.sql
-- Run it again after the Pages rollback: a key made between the two steps would otherwise stay live.
-- Nothing else needs undoing: the V2 tables and columns stay, and the old code never reads them.
UPDATE organizer_key SET revoked=1 WHERE scope_eid IS NOT NULL;
