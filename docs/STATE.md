# STATE: Corporate Tambola lifecycle tests (P1, point 7 and Part 2 testing) - 20 Nov 2026

Branch `p1/tambola-lifecycle-tests`, draft PR into `feat/id-invite-2026-11-20` (PR 26). Code and tests only: nothing deployed, no live service or secret touched, no real money.

**Exact commit: see "Commit" at the bottom.**

## Built
- A re-runnable suite in `apps/edge/test/lifecycle/`: 7 files, **174 tests + 1 todo**, run once for EACH of the four start formats (auto-start + auto-numbers, auto-start + organizer-calls, organizer-start + auto-numbers, organizer-start + organizer-calls). About 20 seconds. `bun run test:lifecycle`.
- A thin real-browser run (Chromium) of one format: `bun run lifecycle:browser` (`tools/sim/lifecycle-browser.ts`). Playwright works in this sandbox. 16 checks, all pass.
- `docs/LIFECYCLE_TESTS.md`: what is covered, where, and how it is built.
- One product fix (LC-1 below).

## Tested (what the suite proves, per format)
- Create; draft takes nobody. ID list by paste and CSV (the console's own reader); A-1101, A 1101, A/1101, a.1101 are one person at upload, at join and at approval.
- Listed ID joins with no approval. Unlisted ID waits; Organizer approves (person plays) and, in a separate test, declines (no ticket now or later; log shows only the ID). Same in a game that is not "list only".
- Family invite: guest adds 4 (default), 5th refused, limit 1 to 10 allowed, 0 and 11 refused; a guest's guest cannot invite.
- 200 players get 200 different valid tickets; same player, same ticket. 90 numbers, each once, random order, different every game.
- Paid-only start (locked and held when unpaid; bad signature, wrong order, failed payment pay nothing; one payment twice = one entitlement; another account cannot pay; pay with credit).
- Start (by clock, or by hand: early, forged, wrongly signed, and second Start all handled), Next presses (90 give 90, no 91st), pause and resume.
- Prizes (early five, three lines, corners, full house) equal an independent oracle; quorum of phones; lying minority and lone phone settle nothing; claims on time, late, repeated; ties in both rules.
- Real phone code (`PhoneRuntime`): 5 phones play a whole game, same 90 numbers, all 7 prizes settled.
- Host / Co-host / guest / stranger / AI key permissions. Late joiner, duplicate join, refresh and reconnect, wrong game link, ticket of another game, 8 phones racing for one ID, double approve, removed person, 201-ID upload.
- Game end, report (IDs only, link closes at 19 h), erasure job: 20 h after the end every table is swept (in the clear, sealed and hashed) and no ID, name or ticket id is left.
- Whole repository suite on this branch: **4408 pass, 1 fail, 1 todo** (baseline on PR 26 before my work: 4237 pass, 2 fail). The 1 fail was not mine (LC-2, since fixed). `tsc` has 400+ older errors in tools; none in my files.
- Flake check: the lifecycle suite was run 10 times in a row after the last change: 0 failures. (One earlier flake was a bug in my own sweep: it matched a short ID by chance inside random encrypted text. Fixed.)

### Falsification checks (break the product code, see named tests fail, restore)
| # | Break | Named tests that went red | Restored |
|---|---|---|---|
| F1 | ID cleaner keeps "/" | "ID list: ... A-1101 / A 1101 / A/1101 are the same person", "a listed ID joins at once, typed in any written form", "an ID typed with spaces, dashes... is the same ID" (all 4 formats) | yes |
| F2 | Unlisted ID in an open ID game joins straight in | At first NOTHING failed: a test gap. Added "an ID game that is not set to 'only people on the list' still holds an unlisted ID". Now 4 fail. | yes |
| F3 | Numbers may repeat (`pickNumber` ignores called numbers) | "numbers: all 90 ... each exactly once", "pause and resume", "five real phones play a whole game" | yes |
| F4 | Early five counted at the 6th number | "every house is won by the earliest completer", "ties" (all 4 formats) | yes |
| F5 | Erasure clock 30 h instead of 20 h | "the report, then the erasure within 24 hours", "every one of the 24 hours counts" (all 4) | yes |
| F6 | Unpaid game is never locked | "not paid at its start time: phones are told to hold", "a game starts only when paid" (all 4) | yes |
| F7 | Remove the LC-1 fix | "the prize hand-over record ... holds no ID", the erasure sweep | yes |

## Defects found in the product (ranked)
| Id | Rank | Where | What | Test | Status |
|---|---|---|---|---|---|
| LC-1 | **High** | `apps/edge/src/winners.ts:73-83` (copies the player's sealed details, which include the ID, into `prize.pii` and `prize.orig`); `apps/edge/src/lifecycle.ts` `erasePersonal` (never cleaned them) | After the 20 h erasure job, every winner's ID stayed in the prize hand-over record until day 365. Suite rule v1.1 says IDs are deleted within 24 hours. | `erasure.test.ts` "the report, then the erasure ..." and "the prize hand-over record ... holds no ID" (failed before the fix, 4 formats) | **FIXED** (`stripIdsFromPrizes`, `lifecycle.ts:236`, called at `:232`). The record itself and the winners record stay. |
| LC-2 | Low | `apps/edge/src/people.ts:502` | The new message "Only the Organizer, Hosts and Co-hosts can see this log." (PR 26, audit round 1) has no guide entry, so `apps/web/test/guide.test.ts` "every message the server can send has a guide" fails **on the PR 26 branch itself** (checked in a clean copy of it). | that existing test | **FIXED after CI showed it red on every commit of this PR**: one entry in `apps/web/public/guide.js` `API_ONLY` (the message is only ever seen by someone calling the API as a guest; the console never asks a guest for this log). CI then has 0 failing files. |
| LC-3 | Medium (owner decision) | `apps/edge/src/winners.ts` `prize.pii` | A winner who confirms a name and mobile number to collect a prize has them kept 365 days (the data map says so). That is a design choice, but it does not match the plain words "players' data deleted within 24 hours". In an ID-only game nobody is asked for a name or number before winning; the winner is. | none (design) | **CLOSED by the owner on 14 Nov 2026 (K4, `docs/KNOWLEDGE/05-OPEN-ITEMS.md`): a winner's name and mobile number are kept 365 days.** Not open (corrected in the 20 Nov smoke test) |
| LC-4 | Low (owner decision) | `apps/edge/src/lifecycle.ts:32,86` | A manual-start game nobody starts keeps its people and IDs 44 h after its scheduled time (24 h "waiting for Start" + 20 h). Within the code's own definition of "end", but longer than 24 h from the time the people joined for. | `edge-cases.test.ts` "a game nobody starts" (locks 44 h, never more than 48 h) | Needs owner |
| LC-5 | Low | `apps/edge/src/people.ts:529` `decideWaiting` | Three simultaneous answers (yes, no, yes) on one request were all answered "ok"; the final state was "declined". Only a double-click race; one console, so unlikely. | observed in a scratch probe; `edge-cases.test.ts` covers the safe sequential cases | Not fixed |
| LC-6 | Low (flaky test, not product) | `apps/web/test/pages.test.ts` "Copy payment link" | Failed once in a full run under load (baseline), passes alone and in my full run. | n/a | Note |

No Blocker found.

## Needs owner
1. **Console "paid" notice is not built in this repo.** `corporate-console` docs/PAY_STEP.md (branch `claude/console-game-pay-step-91b60a`, cloned read-only) says each game must add `POST /api/console/paid` (signed, 60 s, one use, `markPaid` repeatable, organizer's own game and size only), a `payInfo` adapter, and the old-pay-page redirect. None exists here (`grep` finds no `markPaid` / `console/paid`). I tested the existing contract it must match (paid only through verified payment or credit; repeating is safe; strangers cannot pay) and left `test.todo` in `pay.test.ts`. Decision: build it in a separate task.
2. LC-4 above (the 44 h for a game nobody starts). LC-3 (winners' name and number kept 365 days) was decided by the owner on 14 Nov (K4).
3. LC-2: one line changed in the shipped file `apps/web/public/guide.js` (commit after `c7aee88`): please confirm you accept it (it can be dropped without affecting the tests in `lifecycle/`).
4. Family invite through a guest's link in an ID game: an unlisted family ID **waits for the guest's yes** (and the 5th is told the guest has no places left). If you expected family to walk straight in, that is a product change. Today the guest can also add up to 4 family IDs to their own list and those join with no approval (tested).
5. Two independent PASS audits are requested (below). The real-money path (live Razorpay, live Moneypenny) is not tested here by design: cloud session, no live services.

## Audits requested
Please have **two independent auditors** read branch `p1/tambola-lifecycle-tests` and each reply PASS or FAIL with reasons. Suggested checks for each: (a) run `bun run test:lifecycle` and `bun run lifecycle:browser`; (b) pick any 3 tests, break the product line they guard, and confirm the named test goes red; (c) read the LC-1 fix for anything that loses data it should keep (prize rows, winners record); (d) confirm nothing outside `apps/edge/test/lifecycle/`, `tools/sim/lifecycle-browser.ts`, `docs/`, `package.json` scripts and `apps/edge/src/lifecycle.ts` changed.

## Commit
- Product code last changed in `cf483ec` (the LC-1 fix is in `apps/edge/src/lifecycle.ts`; nothing else in `src` changed). The whole-repository run (4408 pass, 1 known fail, 1 todo) was made on that product code.
- After it only test files, `package.json` scripts and docs changed (a sweep that cannot match by chance, type fixes, this file). The lifecycle suite was then run 10 times in a row: 174 pass, 1 todo, 0 fail each time.
- Final head of the branch when this file was written: `9ca066e` plus this correction commit. The exact final sha is in the PR and in the report that came with it.
