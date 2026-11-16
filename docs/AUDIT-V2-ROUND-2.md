# V2 audit, round 2 (independent Rule 7c auditor)

Audited commit: f0563e5. Result: **FAIL**. Report as returned (probes lived in the builder's scratchpad, outside the repo). Fixes follow in later commits.

AUDIT: FAIL

Round 1's five fixes are in and hold. One new defect should be fixed before deploy: Host keys made without personal data (`lh`) keep using up the account's five Host places after their game ends.

Every V2 test file passes, run one at a time: `v2-ai-key` (8), `v2-keys` (16), `v2-ai-label` (10), `v2-certs` (15), `v2-claims` (12), `v2-export` (8), `v2-host` (14), `v2-join-id` (5), `v2-receipts` (10), `v2-support` (10), `apps/web/test/v2-pages` (12). `migrations`, `ai-mail`, `ai-link` and `ai-privacy` also pass.

## Must fix before deploy

**1. MAJOR: expired Host keys without personal data keep their place in the five-Host limit.**
- `v2-host.ts:20` counts every `kind='host'`, `revoked=0`, `expires_ms IS NULL` row. The existing `POST /api/org/host` check at `worker.ts:1296` counts the same rows.
- These keys expire only inside `scopeGate`, so the rows stay "active" until the game is purged, about a year later.
- Reproduced: with five of these keys made, the 6th gives 409. At game end plus 31 hours the old key answers 401, yet `POST /api/org/host` for a real Host still gives 409 "You can have up to 5 Hosts". The Team list still shows all five.
- A game key (`gm`) can also fill the quota, because `POST .../v2/host` accepts it. That is an account-wide effect from a key meant for one game (item 6).
- Smallest fix: add one statement to `v2Purge` that sets `revoked=1` on scoped keys whose game ended more than 24 hours ago (or was cancelled more than 24 hours ago). Alternatively, keep scoped keys out of both counts.

## Should fix (small)

**2. MINOR: `GET /api/whoami` calls an AI game key `kind:"master"`.** `v2-keys.ts:43` gives `kind: lh ? "host" : "master"` for `ga` keys too. Everywhere else the key is now an AI key, and the console picks its screen from this field. Fix: return `"ai"` when `scopeKind==='ga'`.

**3. MINOR (test weakness): the report-link test proves nothing.** `v2-ai-key.test.ts` GET reportlink asserts `url ?? null` is null while the report is not ready, so a master key passes too. With `rpt/<id>={"stage":"done"}` set, the master key gets the URL, the `ga` key gets `url:null` with the "goes only to the organizer" note, and `lh` gets 403: the code is right, the test should set the report ready. Also missing: path-variant tests and a `/ai/ctg_...` refusal test. Probe results: `/ai/<ctg_ key>` is 404 for both `gm` and `ga`; `//`, `%70`, `.json`, `\0`, `Roster`, `PRIZES` are 403 or 404; HEAD is 403; a `?key=` query is ignored.

## Round 1 findings checked

1. AI game key got master powers: **fixed**. `authOfKey` reads `ga` as `ai`. A crawl of about 70 action names, GET and POST, found no name, mobile, e-mail or report URL for `ga` or `lh`. `PUT control/key`, claim mode and decision, keys, clone and erase after the end, and `status` are all 403. `export` and `certs` give ticket numbers only; `prizes` is ticket numbers only.
2. Rollback failed open: **fixed**. `deploy/ROLLBACK_V2.sql` revokes every key with `scope_eid`; the owner note gives the steps. `docs/V2_CHANGE_PLAN.md` line 116 still says rollback is "a Pages rollback" only. The window between the SQL and the Pages rollback is open, so run the SQL again after the rollback.
3. `lh` report link and winner contacts: **fixed**.
4. Claim note: **not fully fixed**. Digit runs are stripped, but a reason with a name in it is still returned by the public note route for a made-up ticket id. Fix: hint in the Host reject prompt, or accept. A pid check would add nothing, because `GET seats` publishes every pid.
5. Step-down wording: **fixed**.

## Owner should know

- `lh` keeps `override`, `announce` and `prizegiven` for 24 hours after the game end. `override` can hand a prize to another claimant or to nobody. The existing Host AI link has the same right.
- An `lh` key (`cth_` + 48 hex) also works through `/ai/<key>` (`announce?_method=POST` returned 200). The Host AI manual it receives lists routes the gate refuses.
- Game keys show in `GET /api/org/keys` as kind `master`, including AI keys. "Replace my AI link" does not retire `ga` keys.
- After the end, `gm` keys cannot reach `v2/certs` (`game-over`), but the account key can. Support stays open to every scoped key after the end.
- `v2_cert` rows are never purged. Changing `DATA_KEY` (or `ORGANIZER_SECRET`) makes every certificate check fail.
- Support tickets and hand-over notes are free text kept for 365 days. A rejected claim's reason is readable by any player of that game.
- `docs/V2_OWNER_NOTE.md` had placeholders and omitted `POST /api/v2/support/{n}`.
- No browser test of the console with an `lh` key was done; all tests are API level.

## Item 6 reading (`ctg_` new, `ctk_` unchanged)

Reasonable and safely built. Path, case, encoding, `/ai/`, `_method`, query-string, other-game, `/api/org/*`, deleted-game and cancelled-game attempts all fail. Keys cannot make keys; `reuse` works only from the source game; expiry lands at end plus 24 hours.

## Rules of play, migration and payments

`packages/` has no diff. `winners.ts` gains an optional label, `lifecycle.ts` one erase-list table, `worker.ts` neutral hooks plus one `prizes` condition for `lh`. Migration 0032 equals `V2_SCHEMA` and is additive. No new payment path.

The AI manifest and `ai-link.ts` lines match the code; they omit `v2/export` and `v2/certs`, which a `ga` key can use.
