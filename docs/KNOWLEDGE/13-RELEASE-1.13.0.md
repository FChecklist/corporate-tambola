# Release 1.13.0 (25 Nov 2026): the game-alert button, switched OFF - not deployed

Written for a person or AI session that has not seen this work. No secret, key or personal address is in this page. The money flag `PAY_VIA_MONEYPENNY` is off and no payment code is touched; payments go only through IT Services by Rajat Agarwal and Razorpay.

## Why this number
1.11.2 is the newest release on `master`. PR #39 holds 1.12.0 (the pricing update). This release was asked for as "the next free minor above 1.12.0", so it is 1.13.0 and it can be merged before or after PR #39: the only places both change are the version lines, `bun.lock`, the knowledge index and `zsw.js`'s cache name (this release takes `ct-game-v49` because 1.12.0 takes 48).

## What it is
A player who opens the game link sees "Yes, notify me when this game begins". One tap asks the browser for permission; the service (a separate private repository, `corporate-push`, spec pinned at commit `f1e93f59f45444711edbb66e632fe1333bf8f9cb`) keeps ONE browser address for that game, at most 24 hours, and sends ONE alert when the game begins. The Stop button is always visible. This repository adds the button, the service worker handlers, the single "send" call and the "purge" call. It never reads or stores a browser address itself.

## What is new
| What | Where | Setting |
|---|---|---|
| The three client files of the service, copied unchanged (each pinned by its git blob hash in a test) | `apps/web/public/push-optin.js`, `push-optin.css`, `sw-push-snippet.js` | none |
| The ONE setting and the start-up code: empty = dark (nothing drawn, loaded or asked for); a real https address = the block is drawn before the "own game" box, the two client files are loaded, `data-push-ended` is set when the game is over | `apps/web/public/push-boot.js` (line `var PUSH_API = ""`), loaded by `z.html`; `z.js` raises `ct:game-over` | `PUSH_API` (in the file) |
| Push and click handlers of the service in the real service worker (the news handler stays; a click is handled by exactly one of them) | `apps/web/public/zsw.js` (`importScripts("/sw-push-snippet.js")` in a try block, cache `ct-game-v49`) | none |
| The player page's `connect-src` names the service only when the address is set; `script-src 'self'` is never changed | `pages/push-config.mjs`, `pages/build.mjs` (reads the same one setting) | none |
| ONE alert per game, when the first number is called | `apps/edge/src/push.ts` (`pushTick`), called by `runTick` in `worker.ts` | `PUSH_URL`, `PUSH_ADMIN_KEY` |
| The flag that keeps it to one | column `engagement.push_sent_ms` (null = none yet, a time = sent, -1 = none will be sent), migration `apps/edge/migrations/0034_push_alert.sql`, `PUSH_SCHEMA` | none |
| The clean-up: the service is told to delete the game's saved browser addresses whenever the game's participant data is deleted | `purgeGameAlerts` called from `erasePersonal` in `apps/edge/src/lifecycle.ts` | `PUSH_URL`, `PUSH_ADMIN_KEY` |
| Privacy words: "a browser address, not your name, e-mail or phone", "deleted with the game, within 24 hours" | `apps/web/public/privacy.html`, `tools/legal/privacy.frag.html` | none |

## How the alert is sent (so a change keeps it true)
- Dark means dark: `pushService(env)` is null unless the address is a real https one AND the key is not empty. Then `pushTick` returns at once (no database read, no request) and `purgeGameAlerts` returns true without a request.
- The service has no guard against a second send for the same game, so the flag is ours. The game row is claimed with ONE conditional update (`push_sent_ms IS NULL`) BEFORE the first send; only the tick whose update changed a row sends. Two ticks at the same moment send once.
- The start time is the game's first number (`callTimeMs(env, e, 1, 0)`): for an automatic game that is two minutes after the scheduled start; for a Host-started game it is null until the Host really starts it (so nothing is announced early).
- A game whose first number was more than 30 minutes ago is marked -1 and never announced ("begins" would be untrue). A failed first page is released for the next tick for 10 minutes, then marked -1. The service sends to 40 browsers per call and says where to go on (`next_after_id`); at most 20 pages per game and 30 calls per tick. A page that fails after the first one is NOT sent again (some browsers already have the alert).
- The link in the alert is `PUBLIC_ORIGIN` + `/z.html?e=<id>`; with no https `PUBLIC_ORIGIN` nothing is sent (a host is never guessed).
- The admin key goes only into the `Authorization` header. It is not logged, not in an answer and not in the database (a test scans every table and the log).

## How the purge works
Every deletion of a game's participant data goes through `erasePersonal`, so the purge is called there, once. A purge the service did not take is written as a `kv` row `pushpurge/<game id>` (the time) and the tick tries again for 3 days. The service's own 24-hour limit ends any address the purge could not reach.

## Switching it on (owner / BOSS; nothing in this release does it)
1. Two independent audits on the exact head commit, then a deploy by BOSS as for every release.
2. Apply `0034_push_alert.sql` to the database BEFORE setting the two settings (it is additive; the dark code never reads the column).
3. The notification service must be live, with its admin key. Set `PUSH_URL` (a setting) and `PUSH_ADMIN_KEY` (a secret) on the edge Worker (`config/SECRETS_NAMES.md`).
4. Put the same address in `apps/web/public/push-boot.js` (`var PUSH_API = "..."`) and deploy the site. The build reads that line and adds the address to the player page's `connect-src` by itself.
5. Decide the privacy words in the one terms document first (see Open, item 2).

## Rules a future change must keep
- The button must not ask the browser for permission or call the service on page load: only after a tap.
- Stop is always visible. The three client files are not edited in this repository (change them in `corporate-push` and copy again; the test names the new blob hashes).
- `script-src` stays `'self'` (plus the one analytics host it already has). `connect-src` gets the service address only when it is configured.
- One alert per game; never a late "begins"; never a send without both settings.
- Whatever deletes a game's data purges its alerts. A new deletion path must call `erasePersonal`.
- Any change after a deploy is a new version: `releases.json`, every `package.json`, `bun.lock`, `CHANGELOG.md`, this folder, and the cache name in `zsw.js` when a file it saves changes.

## Tests
- `apps/web/test/push-button.test.ts`: the client files by blob hash; dark with every empty or wrong setting; lit page (attributes, place, game id rules, demo, over); the real client in a fake browser against a fake service (nothing on load, Stop visible, the exact subscribe body, the keep-button and Stop paths); the game-over signal in `z.js`; the service worker (push shows, one window per click, news click unchanged, still starts if the import fails); the build (files ship, the header equals the game header while dark); the privacy words.
- `apps/edge/test/push-alert.test.ts`: dark in six ways (no request, no write); nothing before the first number; the exact message and header; one alert over many ticks, over parallel ticks and through the scheduled job route; 30-minute boundary; retries and the 10-minute limit; paging and the 20-page cap; purge on every deletion path; purge retry and the 3-day limit; the key never in the database, the answers or the log.
- `apps/edge/test/release-1-13-0.test.ts`: the version places and the plain notes. `migrations.test.ts` lists `0034`.

## Open (owner / BOSS)
1. Two independent audits on the exact head commit.
2. **Where the privacy words live.** `privacy.html` is a pointer: it sends the visitor on to the one document `terms.html` (section Privacy and Data, version 2026-11-01). The two required sentences are on `privacy.html` and in its source fragment (as asked), but a player who follows the pointer reads `terms.html`. Adding them there is a change to a versioned legal text and is the owner's decision (with or without a new version date), as is a line for the push service on the sub-processors page. Do this before the button is lit.
3. The alert goes at the first number, two minutes after the scheduled start for an automatic game. If it should go at the scheduled start instead, that is one line in `pushTick` (for automatic games) and one test.
4. Which browser vendors carry the alert (each browser's own push service) is not a choice made here; the sub-processors wording should say so.

## Roll back
Deploy the previous release. The new column is ignored by the old code; the `kv` rows `pushpurge/...` are ignored too. With the two settings unset nothing in this release does anything.

## Checks
- Run here one file at a time (little free memory, so not the whole suite): `push-button.test.ts` 39, `push-alert.test.ts` 37, `release-1-13-0.test.ts` 6, and 31 related files (releases, migrations, retention and deletion, storage notice, build and cache, page checks) all pass. The full run is the CI of the pull request.
- Red without the fix: 10 throwaway changes (an address set while dark, a changed client byte, the click guard, the game-over signal, the dark header, the purge, the one-update claim, the stale check, the key check, the tick call); each turned a new test red; every file was restored.
- Not deployed, not merged, no migration applied, no setting or secret changed anywhere.
