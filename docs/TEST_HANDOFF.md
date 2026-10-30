# RC 1.8.5 AUDIT FIXES A to H (coder to test author)
Exact behaviour and place of each fix. NOTE: test C02 in the test branch asserts the OLD literal `${idWord(vf.idKind)}` text of guide.js and must change (item B).
- **A** `apps/edge/src/hostsetup.ts` (lines 1, 28, 55, 118, 123): every account / host e-mail uses `normAccountEmail` (NFKC, trim, lower case; inner spaces KEPT). `POST /api/host/setup/email` with `john doe@acme.com` (or full-width `＠`) answers 400 "Please enter a valid e-mail address." and sends no code. `emailHashOf` uses the same form, so it matches the login routes (worker.ts 975, 988). Participant Email IDs still remove inner spaces.
- **B** `apps/web/public/guide.js` line 87: matchers are literal sentences the server sends: "Enter your Email ID", "Enter your mobile number or your Email ID" (employee forms are on line 51). No template syntax in the file.
- **C** `apps/web/public/guide.js` line 51: new card for "This looks like an Email ID. This game asks for an employee ID...": title "This game asks for an employee ID, not an email"; tells the person to type their employee ID (letters and numbers), not an email; guides to `#emp`. That sentence is no longer in the Email-ID card.
- **D** `apps/edge/src/worker.ts` line 2263 (settings PATCH): changing idKind (email vs employee) when the game has any participant row answers 409, code `idkind-locked`, "You already have people listed. Start a new game to use a different kind of ID." Same for an older game switched to email. No people: allowed. Same kind sent again: allowed.
- **E** `apps/web/public/z.js` line 179 (`emp()`): `<p id="empread" aria-live="polite">` sits directly under the ID box, the input has `aria-describedby="empread"`; `phone()` no longer renders it. Hint logic at line 1116 (no hint when an employee-ID game gets a value with "@").
- **F** `apps/web/public/z.js` line 494 (`completedView`): INFO.open true: "played in groups, with a link from the organizer: company teams and their families"; otherwise "in close groups, by invitation only".
- **G** `apps/edge/src/worker.ts` lines 142 and 1995: GET /api/z/<id>/info carries `endedAtMs` (number, from the `life` row, set once when the game ends by the phones' vote or the schedule bound; absent when no end is recorded or the game was cancelled; one number, no names or amounts). `apps/web/public/z.js` lines 53 and 491: `INFO.endedAtMs` is kept once; `endMsOf` returns it when present, otherwise the old estimate (start + calls x seconds).
- **H** `apps/web/public/zc-flow-tambola.js` lines 117 to 125: the "Which ID?" radio group is added only when the saved game's `verify` (read once from GET /api/z/<id>/summary) is not "mobile". Copy: "The ID your people type to join. An Email ID is read in lower case. Older games keep the way they always read an employee ID."

# RELEASE CANDIDATE rc/tambola-1.8.5 (coder to test author)
Branch `rc/tambola-1.8.5` = `feat/tambola-1.8.5-empid` (275fda6: uniform employee ID, case-insensitive Email ID, idKind) + `origin/feat/1.8.4-ui` (e2b214e: Game completed page, join page, game screen prize rows, Host header). Version 1.8.5: the newest entry of `apps/edge/src/releases.json` (the build stamps `version.json` and the footer from it). No tests were run or edited by the coder.

## Merge notes
- One conflict only: `docs/TEST_HANDOFF.md` (both branches added it). Both documents are kept below (1.8.4 first, then 1.8.5). No product-code conflicts: git merged `z.js` and `zc-flow-tambola.js` (both branches edit them) without conflict. The tester should look at the join page (the 1.8.5 idKind label and "The system will read this as ..." hint beside the 1.8.4 join-page changes) and at the new console Step 2 ("Which ID?").
- `EMP_CLEAN_FROM_MS` (`apps/edge/src/empid.ts`) is the deploy-time constant of the employee-ID rule: NOT filled. The release session sets it to the exact deploy instant (ms) right before deploy. Until then it is 2026-10-31 00:00 UTC. `APPROVAL_RULES_FROM_MS` (`approvals.ts`) already holds the 1.8.0 deploy instant.

## How to start (the coder started no servers)
- Engine tests, one file at a time: `cd apps/edge && bun test test/<file>.test.ts` (take `C:\ct\heavy.lock`, at least 600 MB free).
- Local site with the real Worker: `bun tools/sim2/server.ts` (port 8801).
- Browser flows: join page `/z.html?e=<id>`, organizer console `/zc.html?flow=new&e=<id>`.

## Files changed by this release candidate
Everything listed in the two sections below (1.8.4 and 1.8.5/idKind), plus `apps/edge/src/releases.json` (new 1.8.5 entry, release time 30 Oct 2026, 07:38 IST).

---

# TEST HANDOFF for 1.8.4 (coder to test author)

Branch feat/1.8.4-ui (base tag tambola-v1.8.3 = 751df6c). Product code only; no tests were run or edited by the coder, except the one guard test no-null-text-184.test.ts added with the Paymentnull fix (b6ee745).
Mock source: http://127.0.0.1:8765/ (folder C:\ct\test-sites\data\ui\ux-mock-5step). Gap report: C:\ct\test-sites\data\ui\compare-2026-10-30\gap-report.md and index.html.

## Group 1: Game completed + 30-minute message (z.js)
What changed
- The end card heading is now "Game completed" (was "Game complete") and shows "Game ID <id>" and a line: "Your results stay on this page for 30 minutes after the game. After that this page only says the game is completed."
- A phone that opens the page 30 or more minutes after the game ended (and did not see the game live in that visit) shows only the calm page: shared line, "Game completed", Game ID, "This game is now over. Thank you for being part of it.", the 30-minute line and the Share button. Client-side only: end time = scheduled start + numbers called x gap (no engine change, so 1.8.5 does not collide).
Tests that will need updating (exact source or text pins)
- apps/web/test/player-look.test.ts line 41 pins the source string `Game complete${demoTag()}`; lines 44-45 say the page is "hidden because the engine cannot do it" (the page now exists, computed on the phone).
- pages.test.ts /Game complete/ regexes still match "Game completed".
New tests to write
- ended less than 30 minutes ago: results + "Game completed" + Game ID + 30-minute line; ended 31 minutes ago opened fresh: only the calm page, no ticket, no prizes; a phone that watched the end keeps the results even after 30 minutes pass in the same visit.
- no word "private" in the new text; Hindi/other-language not involved.

## Group 2: join page chips + before the game (z.js, z.css, zsw.js)
- Join page: under the title, small chips: company name (when a brand is set), day and time in India time, "Game ID <id>" (id zjchips / joinchips). Not shown in the free demo.
- Before the game (check-in games): a line "You are in! Game starts in <h m>." above "Check-in opens at ...". The ticket itself still opens only after check-in (owner rule since 1.8.0), so the mock's pre-start ticket is NOT shown: the gap stays for that one point.
- zsw.js cache name ct-game-v40 -> ct-game-v41 (files changed shape). Any test that pins v40 must follow.
- Tests to write: chips present with and without a brand; absent in demo; "You are in!" present in the check-in-closed state and absent once check-in is open.

## Group 3: final results + Rules row (z.js, z.css)
- Game over: a "Final results" card (id finalresults) after the Game completed card: one row per prize, "Ticket N" for the winner, "You" on the rows this phone won (class me), lucky draws that were published. Not shown in the demo.
- In the game: the three rules sit under one collapsed "Rules" row (details id zrulesrow, the list keeps id zrules). Hidden after the game (as before).
- NOT DONE in this group: the prize list during the game is still cards ("To win" tag with CLAIM), the mock has flat rows with a grey CLAIM at the right. Same for the compact Last 5 + ball row. These are pure restyles; they stay open in the gap report (rows 23, 50).
- Tests to write: final results rows for 1, 5 prizes; "You" only on own wins; Rules row present in play and absent when ended; id zrules still exists.

## Group 4: Host ribbon (zc-flow-tambola.js, zc-flow-tambola.css; the vendored pack is untouched)
- A signed-in Host sees, under "Host: email / Organizer: email", the ribbon "You are a Host of this game <email> Sign out" (ids zt-hostribbon, zt-signout) and the sentence "As a Host you can make any change in the game, just like the organizer, and you help run the game and let people in. The organizer and Hosts can also play the game." (id zt-hostnote). Sign out clears the stored key and goes to /zc.html.
- Honest note for the compare evidence: my live Host and organizer step screenshots (data/ui/compare-2026-10-30/live/host-*.png, org-step2..5) were taken WITHOUT a working sign-in (the page showed the draft view), so the gap-report rows for Host sign-in, Host dashboard, organizer steps 1-5 and the pill stepper are NOT valid evidence. The test author must re-capture them with the key set the way zc.html reads it. The Paymentnull finding came from an authenticated shot and is real.
- Still open from the Host list: the organizer "5-bar step progress" and the white header strip with Host/Organizer emails on the right are pack-owned (pack/zc-flow.js, console repo) and are not changed here.

## Open after 1.8.4 (not done, for the owner's list)
- Game-screen prize rows (flat rows with grey CLAIM) and the compact Last 5 + ball row (restyle only).
- Ticket shown before the game start for check-in games (blocked by the check-in rule, owner decision needed).
- Pack-owned items above; port of the Paymentnull one-liner to the console pack source (sent to the master-console session).
- UC-G2-13 finding (family Approve): the case starts the game 900 s ahead, which is exactly FAMILY_CUTOFF (15 min), so Approve is refused by design. Use startInSec >= 1500 in that case. Not a product bug.


---

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

---
# Addition: idKind (Employee ID or Email ID as the game's one ID criterion)
Same names as Bingo (`8d1609a` on `release/bingo-1.4.0`): config/setting `idKind` = `"emp"` (default, every older game) | `"email"`.

## What changed (product code)
| File | Change |
|---|---|
| `packages/beacon/src/config.ts` | `EngagementCfg.idKind?: "email"`; `validateCfg` input `idKind` ("emp" or "email", else error "What the ID is: an employee ID or an Email ID."); kept from `base` on later saves |
| `apps/edge/src/empid.ts` | `normIdFor(raw, kind, game)`, `badIdMessageFor`, `idWord`, `IdKind`; `normEmail` also removes zero-width characters; message "This looks like an Email ID. This game asks for an employee ID: letters and numbers only." |
| `apps/edge/src/people.ts` | `verifyOf` returns `idKind`; list add/upload cleans per kind; "Same person after cleaning" flagged for both kinds |
| `apps/edge/src/worker.ts` | `idKind` stored (`cfgJson`), read (`cfgOf`), saved by settings PATCH, shown in `/info` (`idKind`) and in the settings reply; join and "who" clean per kind; need-id messages use "Email ID" when the game asks for one; `/info` also has `idClean` (true for games using the uniform rule) |
| `apps/edge/src/lifecycle.ts`, `modes.ts`, `gamerecord.ts` | idKind carried through stored cfg, change detection ("how people are checked" changes also when idKind changes), game record |
| `apps/web/public/z.js` | join page: label/placeholder follow the kind ("Your Email ID" / "Your employee ID"), maxlength 254 for Email ID, hint under the box "The system will read this as 1B678" (or the lower-case email), client refusal sentences by kind |
| `apps/web/public/zc-flow-tambola.js` | new console Step 2: "Which ID?" (Employee ID / Email ID) saved with `PATCH settings {idKind}` (resent after Step 2 saves, only once the organizer touched it) |
| `apps/web/public/guide.js` | guide entries for "Please check your Email ID", "This looks like an Email ID", "Enter your Email ID ..." |

## Behaviours to test (expected)
- Settings: `PATCH /api/z/<id>/settings {"idKind":"email"}` -> 200, `GET /info` has `idKind:"email"`; `{"idKind":"emp"}` removes it (`idKind:"emp"` in info); `{"idKind":"x"}` -> 400 "What the ID is: an employee ID or an Email ID."; a later save that does not mention idKind keeps it.
- Email-ID game (`verify:"id"`, `idKind:"email"`, list-only): list rows `Demo1@Demo-Test.invalid` and `demo2@demo-test.invalid`; a person types `DEMO1@demo-test.invalid`, ` demo1 @ demo-test.invalid `, `demo1＠demo-test.invalid` -> all the same person (ticket 200; a second phone with another case variant -> 423 `id-used`). The stored/hashed form is the lower-case address.
- Email-ID game: an ID that is not an address (`demo1`, `demo1@`, `@demo-test.invalid`, `demo1@demo`) -> 400 `bad-id`, "Please check your Email ID. It looks incomplete."; upload: same rows -> in `invalid` with that text; two rows differing only by case/spaces -> second in `invalid` "Same person after cleaning: it reads as demo1@demo-test.invalid, like an earlier row."
- Employee-ID game (`idKind` absent): a typed email -> 400 `bad-id` "This looks like an Email ID ..." (new game) or the old text (old game); an employee ID keeps the uniform rule (1.8.5 note above). Old games stay `"emp"`.
- need-id messages: Email-ID game says "Enter your Email ID." / "Enter your Email ID and your mobile number." / "Enter your mobile number or your Email ID."
- `/info` for a new game has `idClean:true`, old game `idClean:false`.
- Join page (browser): in an Email-ID game the box is labelled "Your Email ID", types are not upper-cased by the keyboard, and under it appears "The system will read this as demo1@demo-test.invalid" while typing; in an employee-ID game of a new game it shows "The system will read this as 1B678" for `1b-678`.
- New console Step 2: a "Which ID?" radio group (Employee ID default, Email ID); choosing Email ID sends one PATCH `{idKind:"email"}`; after "Save and continue" on Step 2 the choice is still `email` (resent).
- Regression: everything in the 1.8.5 note above; `guide` test (new messages are in the catalogue); `modes` change detection (changing idKind is reported as "How people are checked at the door was changed").

## Files and how to start
Test files for idKind are to be written by the test author (suggested `apps/edge/test/idkind.test.ts`; the Bingo reference test is `apps/edge/test/email-id.test.ts` in the Bingo commit). Start as in the 1.8.5 section above.

## Not done (product)
- Old console (`zc.js`) has no "Which ID?" control (only the new console Step 2 has it).
- List viewer labels still say "Employee ID" in tables for an Email-ID game (the stored value is the email).


---
# RC fix round 1 (after the cloud run of 2718114)
Product changes: (1) account and team emails (`/api/start`, `/api/auth/email`, `/api/auth/verify`, adding a Host or Co-host) use `normAccountEmail` (NFKC, trim, lower case; a space INSIDE is refused, not glued): `a b@c.com` -> 400 "Please enter a valid work email." again. A participant's Email ID in a game still uses `normEmail` (inner spaces removed). (2) guide entry now also matches the template messages `Enter your ${idWord(vf.idKind)}` and `Enter your mobile number or your ${idWord(vf.idKind)}`. (3) `zc-mode.js` names its key `ctz-zcflow` in the calls and `storage-registry.json` lists it (item `organizer-screens`); the Privacy page sentence was regenerated with `node tools/make-storage-notice.mjs`. (4) `z.js`: the landing text keeps the literal `your employee ID or your mobile number` in the source and no longer depends on `idWord` defined outside its block.
Test-side (tester to update): worker.test join key list (+idKind); empid.test "looks like an Email ID" (product says "Email ID"); player-look "Game complete${demoTag()}" is now "Game completed${demoTag()}" (1.8.4 product change); scenario matrix email oracle (`a b@acme.com` is valid for a participant Email ID: inner spaces are removed by the owner rule); zc-flow-live line 191 (no-flags pack test): print the failing id to see which element is drawn.
