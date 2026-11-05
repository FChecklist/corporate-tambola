# 06 - Permission and state matrix (family "permissions")

Branch `wip/join-redesign`. Oracle: `docs/flow/02-roles-console-permissions.md` section 5.1 (rows M01..M118), `docs/dev/05-ROLES-AND-PERMISSIONS.md`, and the gates in `apps/edge/src/worker.ts`. Nothing outside the three allowed files was edited.

Files: `tools/sim2/scenarios/matrix/gen-permissions.mjs` (generator), `tools/sim2/scenarios/matrix/run-permissions.ts` (own runner: port `MATRIX_PORT` default 8804, database `sim/perm-seed<N>.sqlite`, result `sim/perm-result-seed<N>.json`).
Run: `MATRIX_PORT=8804 bun tools/sim2/scenarios/matrix/run-permissions.ts --seed 1` (`--only <regexp>`, `--list --names`, `--verbose --trace`). A full run took 698 s when the machine was quiet; later it ran 3x slower under load.

## 1. What is crossed

- Actors (up to 20): anonymous, ticket holder (personal link), ticket without device proof, level-1 guest, level-2 guest, Co-host accepted / K5 not accepted / of another game, Host ready / first-open unfinished / through the AI work link, Organizer, Organizer of another account, AI key, AI key of another account, platform key, made-up key; plus (late-keys group, clock +25 h) expired AI key, expired 24-hour Host key, revoked AI key, revoked Organizer key, retired Co-host, retired Host.
- States (14, one world each, built once): draft, published unpaid, paid before start, over cap, waiting room not empty, cancelled, reopened, erased, hold window, running auto, running manual (callMode host), paused (signed pause), ended, did-not-start. Time states run last; the clock is reset between groups.
- Routes: 146 route definitions (per-game, account, auth, payment, credit, people/waiting, control, owner, public) + wrong methods (773 cells) + OPTIONS (60) + `/ai/<key>` links (344) + `/j/<token>` (31) + odd game ids (220) + consent K1..K6 refusals (99) + IDOR/existence (71) + abuse (10) + cross-route rules (4) + wording (54).
- Checks per cell: status class from the oracle; plain-words refusal; no data leak (known phones, names, e-mails, keys); refused call changed nothing (SQL fingerprint of game, people, keys, money before/after); no 5xx (runner).
- Destructive calls by allowed callers run in private worlds (open states) or last on the shared world (time states, Organizer only). The platform key is never used for global owner actions (site off, mode, purge, tick, notices): only bodies that must be refused.

## 2. Result (seed 1, run of 00:40 IST)

**9,863 scenarios, 9,682 pass, 181 fail, 52,886 checks. No 5xx on any call** (one 503 "Webhook secret is not set." exists in this sim for `/api/payments/webhook`; that route was removed from the matrix as untestable here).

| Family | Scenarios | Fail |
|---|---|---|
| perm (actor x route x state) | 8,185 | 68 |
| method (wrong method) | 773 | 4 |
| ailink (`/ai/<key>/...`) | 344 | 5 |
| weird-id | 220 | 0 |
| consent K1..K6 | 99 | 0 |
| idor / existence | 71 | 58 |
| jlink `/j/` | 31 | 0 |
| options | 60 | 0 |
| msgq (wording) | 54 | 41 |
| abuse | 10 | 2 (+1 setup row) |
| rule (route agreement) | 4 | 3 |
| late-keys | 12 + cells inside perm | 0 |

Per state the `perm` failures: 3 (draft), 21 (pub), 134 incl. account/AI/method (paid), 1-2 in each time state. Almost all are the findings below repeated per actor/state. Two later oracle fixes (cancel in the hold state depends on cell order; Co-host of another game on `proforma`) were made after this run; a re-run was cut short by time, so those 2 failures (`cancel` Organizer hold, `proforma` Co-host of another game) are HARNESS, not product.

## 3. FINDINGS

Severity: H high, M medium, L low. Class: PRODUCT GAP or HARNESS. Scenarios = failing scenarios of this run.

| Id | Scenario (names start `perm\|<state>\|` unless noted) | Expected (oracle) | Actual | Suspected file:line | Sev | Class | Minimal repro |
|---|---|---|---|---|---|---|---|
| F1 | `abuse\|three strangers post 'the game is over'...` ; `perm\|pub/paid\|<any actor> x POST over` | a ticket id (public in `GET /seats`) alone must not count: 4xx, game not ended | HTTP 200 `{"ok":true,"counted":true}`; `life.endSrc` goes `schedule -> phones`, `endMs` pulled forward. Three strangers end a running game early (report, 20-hour data erasure clock start) | worker.ts:1961 (`over` has no device proof); lifecycle.ts:122-137 `acceptOver` | H | PRODUCT GAP | game running >5 min; `GET /api/z/ID/seats`; POST `/api/z/ID/over {"pid":"<pid>"}` for 3 pids, no headers |
| F2 | `abuse\|three strangers post identical 'winner' reports...` ; `perm\|pub/paid\|<9 actors> x POST vote` | winners only from phones that prove the device | HTTP 200 `counted:1`; after 3 reports `GET /results` shows an invented winner and `GET /prizes` holds a prize row with that seat's real name and number | worker.ts:1978; winners.ts:31-65 `acceptVotes` (checks only `participant` row, no device, no blocked check) | H | PRODUCT GAP | POST `/api/z/ID/vote {"pid":P,"results":[{"pattern":"early5","ordinal":1,"round":1,"idx":3,"pids":[V]}]}` for 3 different public P |
| F3 | `perm\|<10 states>\|Co-host (K5 not accepted) x POST pay-with-credit`; `...x POST checkout`, `x POST pay-test` (private worlds) | 400 consent-required K5 (matrix: a Co-host can do nothing before ticking) | HTTP 200 (`{"ok":true,"paid":false,"toPayInr":2399}`; checkout/pay-test pay and publish the game) | worker.ts:852-854 run before the gate at 861; pay.ts:357 | M | PRODUCT GAP (doc 02 G3 confirmed by test) | `t.cohost(..., {accept:false})`, POST `/api/z/ID/pay-with-credit {}` with its key |
| F4 | `perm\|draft/paid/pub\|Host via AI work link x POST control-request`, `x GET control-request-read`; `ailink\|Host key x GET .../control-request, /history, /suggestions`; `perm\|paid\|Host via AI work link x GET history`, `x GET/POST suggestions-*` | a Host work link keeps only the nine HOST_ACTIONS | HTTP 200 on all (a request is filed; account game list and suggestion board readable/writable) | worker.ts:1305-1322, 1332, 1419 (only `/api/payments/`, `org/team`, `org/cohost` are blocked at 793) | M | PRODUCT GAP (G6) | `GET /ai/<cth_>/history` |
| F5 | `ailink\|Host key x GET /ai/<key>/checkout`; `perm\|private\|Host via AI work link x POST checkout` | refused like `/api/payments/*` | reaches the payment logic (400 consent / 409 already published); in an unpaid game it would pay | pay.ts:355-357; worker.ts:793 | M | PRODUCT GAP (G5) | `GET /ai/<cth_>/checkout?_method=POST&_body={...eid...}` |
| F6 | `perm\|runA/runM/paused\|Organizer x POST erase`; `rule\|erase all data and forget one person...` | refused while the game runs, like `forget` (409) | HTTP 200 `{"erased":3}`: tickets, seats, claims and the game's Co-host keys are gone mid-game | worker.ts:1983-1990 (compare 1763) | M | PRODUCT GAP (G15) | POST `/api/z/ID/erase` as Organizer during play |
| F7 | `idor\|<28 routes>` (Organizer of another account / AI key of another account x every per-game route), `idor\|anonymous x summary/participants/settings/cancel-preview` | the same answer for a game that is not yours and a game that does not exist | real game: 403 "Not allowed."; missing game: 404 "No such engagement." - anyone can test which ids exist (drafts included). No data leaks otherwise (no leak check failed) | worker.ts:1496 (404 before permission) vs :713 `deny` | L | PRODUCT GAP (game ids are also public share links) | `GET /api/z/<id>/summary` with no key, real id vs made-up id |
| F8 | `msgq\|<6 actors> x ...` (41 scenarios) | a refusal says what to do or who may | bare "Not allowed." for anonymous, ticket holders, other accounts, made-up keys, on 9 routes | worker.ts:713 | L | PRODUCT GAP (wording) | `GET /api/z/ID/summary` with no key |
| F9 | `method\|platform owner key x PUT/DELETE/PATCH/POST /api/owner/audit/access` | plain 404 | HTTP 200 and the access log (owner only) | worker.ts:1221 (`what === "access"` has no method check) | L | PRODUCT GAP | `DELETE /api/owner/audit/access` with the platform key |
| F10 | `perm\|dns\|Organizer/Host x POST paylink` | 409 like `/api/checkout` for a game that did not start | HTTP 200 and a pay-link URL for a closed game | worker.ts:1098-1111 (checks `cancelled_ms`, not `unplayed_ms`; compare pay.ts:366) | L | PRODUCT GAP | `POST /api/z/ID/paylink` on a game with `unplayed_ms` |
| F11 | `rule\|a Co-host is told 'credit is for Organizers...'` | no route shows the account credit to a Co-host | `GET /api/z/ID/cohost` returns a `credit` field while `/api/org/credit` answers 403 "Credit is shown to the Organizer and Hosts." (value 0 in this run; the setup row with real credit also failed, see harness note) | worker.ts:706-712 `mayPay`/`creditFields` (includes Co-host) vs credit.ts:222 | L | PRODUCT GAP (two routes disagree) - confirm with credit > 0 | cancel a paid game, then GET `/cohost` with a Co-host key |
| F12 | `idor\|...audit trail`, `jlink`, `weird-id`, `consent`, `options`, `late-keys` | - | all pass: expired/revoked/retired keys are nobody, odd ids are plain 4xx, every consent point refuses without ticks and stores nothing | - | - | no finding | - |

### Harness notes (not product)
- `lib.mjs` `t.cohost()` now auto-accepts K5 (another session's change); the generator passes `{accept:false}` for the unaccepted Co-host. Early runs that showed "Co-host not accepted can read people" were this.
- `unbind` with a real seat clears a ticket's device binding, `leave`/`erase`/`org-host-link` change the shared world: these now run in private worlds or last. Early failures of ticket holders on people routes were this.
- Account-level routes treat another account's Organizer/AI key as a normal Organizer/AI of its own account (oracle corrected).
- Not run for safety: platform key on `/api/lifecycle/tick`, `/api/purge`, owner site/mode/purge switches, notices (global effect); `/api/payments/webhook` (sim has no secret, answers 503).
- Cells with the Co-host/ticket actors in the cancelled, reopened, erased and did-not-start states expect a dead key/ticket (cancel erases Co-host keys, cancel.ts:137), per the code.

## 4. Summary
Top gaps: F1 forged "game over" (H), F2 forged winners and prize rows (H), F3 Co-host before K5 can pay/publish (M), F4 Host work link reaches history/suggestions/control requests (M), F5 Host work link reaches checkout (M), F6 erase mid-game (M), F7 game ids discoverable (L), F8 bare "Not allowed." (L), F9 owner access log on any method (L), F10 pay link for a closed game (L), F11 credit shown to Co-host (L).
