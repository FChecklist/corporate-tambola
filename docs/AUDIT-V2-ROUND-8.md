# V2 audit, round 8 (independent Rule 7c auditor)

Audited commit: a8df93c (HEAD only; the auditor worked on a `git archive` copy while the builder edited the tree). Result: **PASS** (the first PASS after round 7's FAIL). Report as returned, lightly trimmed.

AUDIT: PASS. No BLOCKER or MAJOR issue. All 14 V2 test files pass, run one at a time. Item 9 ("Host presses Next") is not built.

## Credential and key-row sweep (round 8 focus)
- The worker reads a key in only three places: the `x-organizer` or Bearer header, the `/ai/<key>` path, and the `_method`/`_body` carriers on `/ai/`. The round-7 body-key hole is closed.
- `scopeGate` runs first in `route0`. Probed with gm, ga and lh keys: every non-game and other-game path returned `key-scope` (5 methods, about 125 paths); path tricks (trailing slash, double slash, `..`, `%2F`, `%2e`, upper case) also. Only the intended `OPEN_OK` paths pass (`auth/config`, `notices`, `v2/support`, `whoami`, `z/ai-manifest`, `z/schedule`); their non-GET methods return 404 or 403.
- Minting and copying code cannot promote or extend a scoped key: `mintDeviceKey` copies the scope; `org/host`, `team/retire`, `createOrganizer` are unreachable; `/google` host creation matches only `scope_eid IS NULL`; `reuse` is limited to `scopeSrc`; expiry follows the game's end time plus 24 hours.
- NOTE: an expired lh key via `/ai/<key>` and `/ai/<key>/start` returns 200 with only the static "START HERE" briefing; every data route under it returns 401 `key-expired`.
- lh keys get no names, e-mails or mobiles and are denied `v2/export`; gm and ga are denied or limited correctly after the end; ga is refused the people-list actions.

## Must fix before deploy
None.

## Should fix soon (MINOR) and what was done
1. Step-down and approved hand-over used a plain revoke, which left the sealed e-mail and details on a revoked regular Host's rows (the organizer's own "retire" wipes them). **Fixed afterwards:** both now call the same `retireHost` wipe (`v2-host.ts`); test in `v2-round8.test.ts`.
2. `prizeHold` ran before sign-in, so an anonymous `POST /prizegiven` got 409 with the Host's free-text reason. **Fixed afterwards:** with no key the check steps aside and the normal route answers (401); test added.
3. `claimreview/note` does not check the pid hash: anyone with a ticket id can read the "claim held" note for it. The pid is not guessable; disclosed (owner note item 9), unchanged.

## Notes
- Known and disclosed items unchanged: the pre-existing `ai-enablement` third-route failure on c6897f2, the `x-ai-model` declaration rule, `prize.pii` kept 365 days, Hindi coverage, the floating "More tools" button.
- Reopening a cancelled game after a gm key expired could make the key work again: traced, not settled, not called a defect. (Builder's note: a game's end follows its own end time, so reopening after a cancel is an organizer action; recorded here for round 9 to look at.)
- `names?pids=` and `participants` work for a gm key in-game and after the end until erase: intended.
- Test gap noted: no test called every route with a scoped key (closed by `v2-route-walk.test.ts`, commit f233d52) and none for points 1 and 2 (closed by `v2-round8.test.ts`).
