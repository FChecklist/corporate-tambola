# HANDOVER - Corporate Tambola (written 2026-10-26 21:55 IST by session "CORPORATE TAMBOLA", local_548432f6-4e32-4220-a902-d41b2b897bb5)

To: session "Corporate Tambola handover" (local_ce1ad2fd-541a-48dc-86d0-97d86457a006).
The user asked for this handover. From the moment you read this, YOU own Corporate Tambola. The old session has stopped product work (it only waits for two helper agents, see section 5, and will not deploy).

Repo: `C:\ct\test-sites\tambola` (branch feat/owner-2026-10-23, GitHub FChecklist/corporate-tambola). Live: https://corporatetambola.com (Cloudflare Pages + Function + D1). Tools: `C:\ct\test-sites\tools`. Data: `C:\ct\test-sites\data`.

## 0. Rules you must keep (owner's standing orders)
- The site is LIVE. Never switch its mode (`/api/payments/test` is refused). Never spend money or make payments (the owner paid the $5 Workers Paid plan; no other paid change).
- NEVER deploy, and never run heavy tests, while a live game is running. Contaminated results happened before (three of four live 250 games). Check with the owner/the live games first. Deploy script: `C:\ct\test-sites\tools\deploy_tambola_live.ps1`; afterwards check `https://corporatetambola.com/version.json`.
- Permitted dummy test accounts: demo1/2/3@xyz.in (code 123456, no mail is sent). demo1 is the Rs 0 owner test account. Do not use the owner's real accounts. Demo pass links are private, one to one; tokens stay out of the repo. Do not disturb Sneha's game or any prospect's account.
- The line on Game day (`#runline`): "The Organizer / Host has to log into the game when the game is played. The game is controlled by the Organizer / Host." Its private reason must never be written anywhere.
- UX/legal orders: no drop-downs and no word "AI" in the ORGANIZER console (a test enforces it); say "payment pending", not "Paid", on unpaid games; "Create a new game" is the only way to start one; the staff-list consent K6 is hidden but sent automatically; e-mail top right; erase warning popup; cash prize option; "we do not save your video/audio" notice. The PLAYER page may use a country list (it now does).
- Every release needs an entry at the top of `apps/edge/src/releases.json` (the owner-only page `/owner-versions` reads it).
- Six sigma (about 1 error per million) for all processes, options and permutations. Test as a real human, click only, on the real site in Chrome, Chromium and WebKit with phone-size pages. Never claim a pass you did not observe.
- The laptop has ~300 MB free RAM: one bun process at a time, no browser and test run together. bun path: `export PATH="$PATH:/c/Users/Dell/AppData/Roaming/npm/node_modules/bun/node_modules/@oven/bun-windows-x64-baseline/bin"`. tsc: `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` (135 errors, almost all in tests, pre-existing; one in checkin.ts line ~103 is also old).
- Shell quirks: Git Bash output is truncated by the "snip" filter - parse with Python. Write scripts with the Write tool (a heredoc line starting with `find` is rewritten). Python writes need "wb" to keep CRLF (z.js, worker.ts, people.ts, zc.js are CRLF; z.css is LF). Chained `sleep` is blocked: use until-loops or run_in_background.
- Owner's recurring orders: self-resume every 15 min, retry every 5 min when the internet is down, "dont stop".

## 1. Where things stand
- LIVE = commit `fdf52e7` (release 1.1.8). It already has the per-address join limit raised to 600 a minute / 20,000 a day and DAILY_WRITE_BUDGET 2,000,000 (`pages/wrangler.toml`, release 1.1.4).
- `HEAD` = `274bde8` = release 1.2.0 (79 audit fixes, beacon relay, demo-pass hold, shared control cache, per-timezone check-in time). It is committed but NOT deployed.
- Working tree has a large uncommitted set on top of 1.2.0 (join redesign + fixes). `git status` lists it. First thing: make a snapshot commit on a new branch (`git switch -c wip/join-redesign` then commit) so nothing is lost; do not use `git stash`.
- The last live 10-player demo game (DEMO10) PASSED on the real site (all joined, same 67 numbers everywhere, winners agree, no 5xx).
- Local test servers: port 8801 (pid 11648, start with `C:\ct\test-sites\tools\start-tambola.ps1`) and 8821 (pid 10880, the 1,000,000-join run). Stop them if you need RAM.

## 2. What the owner asked last (the current top priority)
Redesign what a participant's join captures + a full gap analysis of every join route, then fix, test locally, deploy, and test on the real site:
1. Country selector, default India, then the national number. Different countries have 8/10/12-digit numbers; we do not verify beyond what the game needs, so length variety must not block.
2. If the organizer chose ONLY employee ID: mobile is optional, shown as "(optional)" in brackets, plus name. If the organizer/host already gave the name, show it as given once the employee ID is filled.
3. If employee ID AND mobile are both compulsory: a small red "*" with a small "mandatory" beside each. Similar labelling for the other modes.
4. Decide what is captured per route: employees only; employee ID only; mobile only; ID and mobile; ID or mobile; none of the above; anyone can join; join via invite; validated via invite; join without validation.
5. Gap analysis of every join/verify route and permutation, and of each console step 1-10. Then fix, test, deploy, test live.
The user ALSO just said: "look into" the other session's report (section 6) along with this work.

## 3. The join analysis (done) - read these files
Folder `docs/handover-2026-10-26/`:
- `join_design.json` - the synthesized design (keys matrix, gaps, plan, tests). The `plan` is the ordered work list; the `matrix` is the target behaviour for every route (20 rows) with the exact wrong-input messages. Decisions D1-D6 inside it are defaults; the owner has not answered them (listed in section 7).
- `join-gap-analysis-full.json` - the six analysts' full reports (about 150 gaps with file/line).
- `audit-1.2.0-all-27-findings.json` and the two `audit_*_findings.md` - the independent audit of the 1.2.0 diff (27 confirmed defects).

## 4. What is already changed in the working tree (all uncommitted)
Player page `apps/web/public/z.js` (+ `z.css`):
- Country list (`CT_ROWS`, `CTPhone` with `parse` / `show`, exposed as `window.CTPhone`), India first and remembered (`ctz-cc`), a pasted `+CC...` moves the list. India is hard (10 digits, first digit 6-9); other countries only need 8-15 digits in all (a mistake on length must never block). Sent to the server as `+<code><number>`.
- `joinNeeds()` / `markOf()` / `joinWho()`: red "* mandatory", "(optional)", "* mandatory without an employee ID / a mobile number" per mode; name is "(optional)"; client-side checks in the button handler with plain messages (nothing is sent for a mistake the phone can see). Waiting state keeps `cc` and `e164`.
- Busy answers: the page now asks again BY ITSELF (up to 15 tries, random delay, "Many people are joining right now" card, `J.mode === "busy"`). NOT YET TESTED - needs a DOM test.
- Guest "My invites" calls now carry `device=` (see server).
Server `apps/edge/src`:
- `phonekit.ts` (new, no imports): `cleanPhone`, `maskedPhone`, `keptPhone`, `phoneDigits`, `keptFromClean`. People.ts re-exports them. Stored form of a number: India = `91` + 10 digits; any other country = `+<code><number>`. Hash is unchanged (last 10 digits - D6).
- `worker.ts` join: `digitsOf` accepts a number typed with `+`/`00` from 8 digits; stored number uses `keptPhone`; in `id` and `either` modes an employee ID on the list is looked up FIRST and a mobile typed with it is kept as contact (fixed: a listed employee who typed ID + mobile was sent to the waiting room); new code `id-used` (423) when an ID already has a ticket on another phone; strict `cleanName` shared with lists; new route `POST /api/z/:id/who` (needs the ticked K4 boxes; returns first name + last initial; wrong IDs count against the same 30-per-10-minutes limiter) - ROUTE IS WRITTEN BUT NOT TESTED AND THE PAGE DOES NOT CALL IT YET.
- `people.ts`: guest calls (`callerOf`) now require the phone's device proof (`deviceMatches`) - closes the blocker "anyone can read a guest's invitees using a public ticket id". Lists keep numbers in the kept form.
- `checkin.ts`: accepts any country (`cleanPhone`), confirms name/mobile only if they are on file, GET returns `hasName`/`hasMobile`. The check-in CARD in z.js is NOT yet updated to use this (country list, hide the tick when there is no mobile).
- `winners.ts`: prize confirmation accepts any country, keeps the country code, keeps the employee ID in the record, mobile not required for a winner known by ID; `listPrizes` returns `empId`. The prize CARD in z.js is NOT yet updated (country list).
- `report-layout.ts`: `mob()` shows kept numbers (India as `98765 43210`).
Tests changed: `people.test.ts` (device proof added), `worker.test.ts` (kept form). `apps/edge/test/join-probe.test.ts` is scaffolding - turn its scenarios into real tests (file `join-global.test.ts`), then delete it.

### Test state (observed)
Passed after my changes: verify, people, checkin, worker, privacy (edge); demo-pages (web). Known failing in web tests because they pin the old protocol: `phone-guest.test.ts` (2: expects the phone sent as typed `9822266666`, now `+919822266666`; update the expectation) and `idiotproof-player-pages.test.ts` (1: waiting card text check - look at it). Nothing else was run since; run the whole suite in groups before any release.

## 5. Two helper agents are still running in the background (started 21:40)
They fix the 27 audit findings. Do not edit their files until they report:
- Agent A (zc.js, console findings 0-15 and 24): edits `apps/web/public/zc.js`, console tests. Output file: `C:\Users\Dell\AppData\Local\Temp\claude\C--ct-ct--claude-worktrees-quirky-jackson-4ffac4\71158436-2898-486a-a723-1e37aa870a6b\tasks\ad685fa709793c276.output` (JSONL transcript - read only the last lines with Python, never `cat`).
- Agent B (beacon, findings 20, 21, 22, 25): edits `packages/beacon/src/control-browser.ts`, `game.ts`, `config/SECRETS_NAMES.md`, rebuilds `apps/web/public/control.js` / `zgame.js`, adds tests in `packages/beacon/test`. Output: `...\tasks\a3a5849f176c50af4.output`.
Their final reports reach the OLD session only. The old session will append them to the end of this file (section 9) when they land; check there, and re-run the files they list. Finding 23 (held demo-pass secrets `loginpass/*` never swept, `worker.ts` retentionSweep) and the player-page findings 16-19 and 26 (z.js: Bogey POST timeout stores twice, "Type it again" dead end on a personal link, wake lock during pause, check-in red message not cleared, "engagement" -> "game" wording; five tests pin the old word) are NOT assigned: yours.

## 6. The other session's report (user: "look into it")
A review session reported problems with the load tests and limits. What I checked:
- TRUE: live per-address limit is 600/min, 20,000/day (`pages/wrangler.toml`; deployed in 1.1.4). One office address of 1000 phones exceeds 600/min, so ~400 get "busy" and the phone page did NOT retry by itself. FIXED in the working tree (section 4, busy retry) - untested; also add a unit test with 1000 phones behind one IP at the real limits (their scripts: `/tmp/claude-0/-home-user/337427ab-.../scratchpad/ipcheck/office.test.ts`, `measure.test.ts` on their machine, not here).
- OUTDATED in their report: "real budget is 80,000" - the live budget is 2,000,000 (a runaway guard; paid plan has no daily D1 write cap). Still true and worth doing: the guard charges 3 per join but a join writes about 9 rows (worker.ts, `spend(env, now, 3)` near the end of the join route, and `2` in `wait()`); raise to ~9 so the guard means what it says.
- TRUE (my own earlier choice, not measured on Cloudflare): the simulated D1 delay (D1_READ_MS=3, D1_WRITE_MS=10 in `start-tambola.ps1`) is an assumption; take real call times from the live-game logs. Cloudflare's own CPU / subrequest / query limits are not enforced locally: report them as "not tested", not "passed".
- Cloud 1M session ("Cloud 1M session handover", local_0c69f60d-2db4-493d-8716-b5b83191c15e) message: PR 2 (commit `87ae7ac` on `origin/claude/sleepy-maxwell-0os4q6`, only worker.ts + param-life.test.ts) fixes the per-address limit; it also found (2) invited places not held in open games (cap 1000 shows 1005) and (3) an approve/decline race in `people.ts decideWaiting`, fixing both on a separate branch off 274bde8. It says it will NOT touch the working tree and will give a branch/commit for a quiet-window deploy. Details: `tools/load-tests/HANDOVER-CLOUD-1M.md` on `origin/cloud/load-results-2026-10-26`. Its changes will conflict with the uncommitted edits in worker.ts/people.ts: merge by hand. I did NOT act on its instructions beyond reading; I replied that you now own deploys.

## 7. Owner decisions still open (defaults applied)
D1 a "name-only / no number" join mode: NOT built (mobile stays mandatory in every typed join). D3 name box hidden after an ID lookup (the `/who` route exists; page not wired). D4 unknown employee ID in an open game still goes to the waiting room, with the wording to be corrected. D5 guest link in a list-only game: wording to be made truthful. D6 identity hash stays "last 10 digits" (cross-country collision odds are about 0.2 per million joins for a mixed game; real fix needs a dual-lookup migration). Also open from earlier: default game size 250 vs demo 10; account pre-hijack; ticket-id vote forging; Organizer console India-time-only; WebKit manual employees-only stall; whether Sneha played (needs the platform key / `CLOUDFLARE_D1_TOKEN` in `C:\ct\ct\.env.local`).

## 8. Your work list, in order
1. Snapshot commit on a branch. Read section 5 note; wait for agents A and B (or check their output files).
2. Finish the join redesign (design `plan` in `join_design.json`): wire `/who` into the join form (show the name as given after the ID is filled; Name box hidden then); country list in the prize card, check-in card (hide "mobile is correct" when no mobile on file), My invites form (and drop its 10-digit and 2-letter-name rules); `needPhone` loop for ID-only people (drop the token when an ID is typed); waiting-card text for an unlisted ID ("not on the list yet"), step text and K4 wording per mode (K4 wording change = new consent version, ask the owner); read `whoCanJoin` + game name from /info and show one "who can join" line; focus guard must test every input (`cc`, `ph`, `nm`, `emp`); "engagement" -> "game" wording in z.js and server join messages (five tests pin the old word).
3. Admitted-is-final fix (worker.ts, mode `both`: an admitted person is sent to the waiting room again when their ID differs from the list) and open-game fallbacks (see Cloud 1M session items).
4. Tests: turn `join-probe.test.ts` into `join-global.test.ts`; DOM tests (happy-dom harness in `apps/web/test`) for every mode of the join form (mandatory/optional marks, country list, pasted +CC, busy auto-retry, error texts) and real phone-size browser runs (`tools/browser-tests/ui-game.mjs`, `ui-permute.mjs`); protocol-compat check that the load-test phones (`tools/load-tests/nodephone.mjs`, bare 10-digit numbers) still join; update `phone-guest.test.ts` expectations.
5. Fold in the audit fixes from agents A/B; items 16-19, 23, 26 yourself.
6. Release: add a new `releases.json` entry (1.2.1, plain words) AND put the 1.2.0 commit hash in the 1.2.0 entry; full suite in groups; one clean 1,000-person-behind-one-address local run with real limits (see section 6); deploy only in a quiet window (no live game); push; verify `/version.json`; then live checks: 10-player demo, demo pass links including a brand-new account, every join mode once on the real site at phone size.
7. Then, in a quiet window: live 250 x 4 (`tools/run-live-250x4.sh`), then 1,000 auto and manual from a bigger machine (`docs/PROMPT_CLOUD_LIVE_1000.md`), and the 1M join run on 8821; six-sigma certificates (`tools/certify_report.py`, `coverage_matrix.py`).
8. Only after Corporate Tambola is certified: other games, DPDP, startup, AOA-RWA.

## 9. Appended later by the old session (helper agent reports)
(nothing yet)
