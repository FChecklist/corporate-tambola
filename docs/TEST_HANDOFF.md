# Test handoff: Tambola engine 1.8.5 (uniform employee ID, case-insensitive Email ID)

Branch `feat/tambola-1.8.5-empid` (from `wip/join-redesign`). Coder: product code only. Tester: write and run all tests from this note; failures go back through the boss.

## What changed (product code)
| File | Change |
|---|---|
| `apps/edge/src/empid.ts` (new) | `cleanEmpId`, `normEmpFor`, `empCleanOn`, `EMP_CLEAN_FROM_MS`, `EMP_MAX`, `normEmail`, `looksLikeEmail`, `empBadMessage`, messages |
| `apps/edge/src/people.ts` | list add/upload uses `normEmpFor(raw, game)`; rows that repeat an earlier row only after cleaning are returned in `invalid` as "Same person after cleaning: it reads as X, like an earlier row."; exact repeats still count in `duplicates` |
| `apps/edge/src/worker.ts` | join and "who" routes use `normEmpFor(raw, game)`; refusal message by game rule; every email trim/lowercase now `normEmail(...)` |
| `apps/edge/src/hostsetup.ts` | `emailHashOf` and Host/Co-host email compare use `normEmail` |
| `apps/edge/src/approvals.ts` | `cleanEmail` uses `normEmail` |

## The rules (expected behaviour)
1. **ID cleaner** (`cleanEmpId`): NFKC first (full-width letters/digits become ASCII), then keep only A-Z, a-z, 0-9, then upper case. So `1B-678`, `1b-678`, `1B/678`, `1B 678`, `1b.678` all give `1B678`. Accents, other alphabets, emoji, zero-width characters, symbols and spaces are removed. A non-ASCII letter never becomes A-Z (`ß` is removed, never `SS`).
2. **Which games**: only games with `created_ms >= EMP_CLEAN_FROM_MS` (`apps/edge/src/empid.ts`, currently 2026-10-31 00:00 UTC; the release session sets the real deploy instant in ms right before deploy). Older games keep the OLD rule exactly (spaces dropped, upper case, `A-Z 0-9 . _ - /` allowed, max 30), so stored hashes still match.
3. **Refusals (new games)**: an ID with nothing left after cleaning, or more than 30 characters left, is refused: join answer 400 code `bad-id`, list row in `invalid` with `why`. Message: "An employee ID has letters and numbers only. The system ignores spaces, dashes and symbols, and the ID may be up to 30 characters once cleaned." If the text contains `@` (or full-width `＠`): "This looks like an email ID. This game asks for an employee ID: letters and numbers only." and it is NEVER turned into letters (`demo1@demo-test.invalid` must not become `DEMO1DEMOTESTINVALID`). Old games refuse an `@` too (old rule), with the old message.
4. **List duplicates after cleaning (new games)**: an uploaded list with `1B-678` and `1B/678` keeps the first and returns the second in `invalid` ("Same person after cleaning ..."). The same raw text twice is a plain duplicate (`duplicates` +1).
5. **Email ID** (`normEmail`): NFKC, remove ALL whitespace, lower case. Upper/lower case variants (all 16 of `demo1@demo-test.invalid`), spaces around or inside, tabs, full-width `＠ ． －` and full-width letters are the same address with the same hash. The ID cleaner is never applied to an email. Applies to ALL games (safe).
6. **Email paths**: Host/Co-host sign-in and setup (`worker.ts` team email routes, `hostsetup.ts` `emailHashOf` and the "This link is for ..." compare), the open-game join email key (1.8.1+, `EMAIL_ENABLED` in `approvals.ts`), `cleanEmail`. There is NO Email-ID *criterion* in the engine yet (list matching by email): nothing to test there.

## Behaviours to test, with expected results
- `cleanEmpId` owner examples -> `1B678`; `1B_678`, `#1B*678!`, `1B\t678\n` -> `1B678`; `é1B678` -> `1B678`; `1Бя678` -> `1678`; `१B६७८` -> `B`; `1B🙂678` -> `1B678`; zero-width inside -> `1B678`; `ß1` -> `1`; `１Ｂ－６７８` -> `1B678`; `ｅｍｐ００１` -> `EMP001`.
- `normEmpFor(x, newGame)`: `""`/spaces -> `""` (nothing typed); `---`, `\u200b`, `🙂🙂` -> null; 30 chars ok, 31 chars null, `ab-` x16 null. `normEmpFor(x, oldGame)`: `1B-678` stays `1B-678`; `1b 678` -> `1B678`; `1B🙂678` null.
- Real Worker, NEW employee-ID game (`verify: id`, list-only): list `1B-678`; a person types `1b.678` -> ticket (200); a second phone types `1B/678` -> 423 `id-used`.
- Real Worker, OLD game: list `1B-678` and `1B678` (two people); `1b-678` -> ticket; `1b 678` -> ticket (the other person); `1B.678` -> 403 waiting.
- Upload: `[1B-678, 1B/678, 1B-678, ---, 2c 9]` in a new game -> added 2, `invalid` has "Same person after cleaning" (reads as 1B678) and the letters-and-numbers message, `duplicates` 1.
- Email: all 16 case variants -> same `normEmail`, `cleanEmail`, `emailHashOf`; `demo1@` and empty -> `cleanEmail` null; `de mo3@demo-test.invalid` -> valid `demo3@demo-test.invalid`.
- Email typed in an ID box: new game -> 400 `bad-id` with "looks like an email ID"; old game -> 400 `bad-id` with the old text; neither answer contains `DEMO1DEMOTESTINVALID`.
- Regression: people, verify, emp-space, rights, worker, approvals-1-8, guide (web) all unchanged.
- Test emails everywhere: `demoN@demo-test.invalid` only (the engine shape check accepts it).

## Test files the coder wrote (handed to the test author)
- `apps/edge/test/empid.test.ts` (cleaning function, old/new games, real Worker, 200 IDs x 28 formats matrix, email case tests)
- `apps/edge/test/approvals-1-8.test.ts` (1.8.0 to 1.8.1 approvals, open flag, email tests; emails changed to `demoN`)
- `apps/edge/test/zc-flow-*.test.ts`, `apps/web/test/zc-flow-scenarios.test.ts` (new organizer console and the 3.69M-scenario matrix)
- `apps/edge/test/ticket-prize.test.ts` is in `packages/beacon/test/` (A/B per-ticket prizes)
- Layer A runner (not a test): `tools/sim2/layer-a/run.ts` on branch `campaign/layer-a`

## How to start the app
- Engine tests: `cd apps/edge && bun test test/<file>.test.ts` (one file at a time; take `C:\ct\heavy.lock`, at least 600 MB free).
- Local site with the real Worker: `bun tools/sim2/server.ts` (sim server, port 8801, `SIM_BUILD=0` skips the page build), clock under `/__sim/clock`.
- Layer A: `bun tools/sim2/layer-a/run.ts '{"games":20}'`.

## Not done in 1.8.5 (product work still open)
- Browser hint "The system will read this as 1B678" in `z.js` and the new console pack.
- Email-ID criterion and list matching by email (engine has none).
- Per-game `EMP_CLEAN_FROM_MS` must be set to the real deploy instant before deploy.
