# Organizer game creation, steps 1 to 10: the "organizer" scenario family

Files: `tools/sim2/scenarios/matrix/gen-organizer.mjs` (the scenarios), `tools/sim2/scenarios/matrix/run-organizer.ts` (own runner; `run.ts` and `lib.mjs` untouched).
Run: `MATRIX_PORT=8803 bun tools/sim2/scenarios/matrix/run-organizer.ts --seed 1` (about 25 minutes on this laptop; `--only <regexp>`, `--skip-time`, `--only-time`, `--list --names`).
Output: `sim/organizer-result-seed1.json` (every scenario), `sim/organizer-findings-seed1.json` (failed checks grouped).
Final run: commit `09d6696` (release 1.2.1) plus other sessions' uncommitted edits to lifecycle.ts, winners.ts. Every call goes to the in-process Worker; nothing leaves the machine (blockedFetches 0).

Each scenario builds a game the way the console does (create the draft, then save steps with PATCH /settings) and asserts an oracle derived from the code (worker.ts create/settings/publish, config.ts validateCfg, people.ts, cancel.ts, pay.ts) AND from the plain-language documents (ORGANIZER_FLOW_DESIGN, ROLES_AND_CONSOLE_SPEC_2..6, CONSOLE_STEP_REVIEW, the console's own texts). Where code and document disagree the scenario asserts the document and fails: label `[DOC]`. Other labels: `[MSG]` vague/unhelpful sentence, `[DROP]` a setting silently lost or changed, `[LIMIT]` a limit missing, unexplained or a stuck state.

## Counts (final run, seed 1)

| Step | Scenarios | Failed | Passed |
|---|---|---|---|
| 1 Date and time (offsets, IST grid, time zones, hold window, gaps) | 465 | 13 | 452 |
| 2 How it plays (sizes, tickets, rounds, who calls, 6 audiences x re-saves, invites, Co-host limit, packs) | 912 | 20 | 892 |
| 3 Prizes (20 houses x winners, all 190 house pairs, order, text, cash, ties, lucky draw) | 766 | 4 | 762 |
| 4 Brand and moments (colour, name, logo rules, counts, links per kind and place, titles, lengths) | 707 | 4 | 703 |
| 5 Hosts and Co-hosts | 109 | 13 | 96 |
| 6 People lists (batches, formats, duplicates, invalid, employee ID matrix, removal) | 292 | 3 | 289 |
| 7 Publish checks and draft limit (196 e-mail x mobile pairs, roles, discard) | 250 | 16 | 234 |
| 8 Pay, free demo, demo pass, owner test pack | 112 | 1 | 111 |
| 9 Game day (20 fields x 4 live states, after start, cancelled, who may, cancel, reopen, clone, races) | 268 | 25 | 243 |
| 10 After (erase, retention, report address, AI view) | 52 | 1 | 51 |
| **Total** | **3,933** (98 move the simulated clock) | **100** | **3,833** |

30,673 checks. The 100 failing scenarios collapse into the 35 findings below plus 5 harness items.
Against the code before release 1.2.1 (earlier runs, same day) three more groups failed and are now FIXED (re-run clean): see "Fixed".

## Findings (PRODUCT GAPS)

Repro notation: `K` = organizer key header `x-organizer: <token>` from `POST /api/start {email, consent}`; `R(t)` = beacon round of time t (`floor((t/1000-1692803367)/3)+1`).

| Id | Severity | Scenario(s) | Expected | Actual | Suspected place | Minimal repro |
|---|---|---|---|---|---|---|
| O-01 | Medium | `org\|s1\|create ... starting 30 days ago / 1 day ago / 1 hour ago / 5 minutes ago / 1 minute ago` (10), `create with a start time that is zero / negative` | A start in the past is refused when the draft is made, like settings ("Pick a start time in the future.") and the date helper | 200 `{"ok":true,"draft":true}`; the problem shows only at publish (400 code `start-pending`). Round 0 and -5 are accepted too | worker.ts:1393-1395 (create checks only `> createCap`) | `POST /api/z {id:"T1",startRound:R(now-1h),callSeconds:9,cap:50}` -> 200 |
| O-02 | Medium | `org\|s2\|size 10001/20000/50000/100000 ...` (8), `... on a draft game` (2), `a 10001-person game: publish, then pay` (3) | Over 10,000 refused with the console's "write to us" sentence | Create, settings AND publish accept it; status "published, payment due before the start", pack null; pay -> 400 "That many participants needs a custom arrangement". A published game that can never be paid | worker.ts create/settings (cap max 100000); pay.ts:349,371; zc.js:1579 only guards in the page | `POST /api/z {cap:20000,...}` then `POST /api/z/ID/publish` -> 200, then `POST /api/payments/test {eid,...}` -> 400 |
| O-03 | Medium | `org\|s7\|the draft limit with one of the ten being a published, unpaid game / a cancelled draft / a cancelled published unpaid game`, `ten published but unpaid games ...`, `org\|s10\|a published unpaid game keeps its place...` (time) | The message says "10 unpublished drafts. Publish one, or delete one"; only unpublished, uncancelled drafts count | The count is `pack=0`: published-unpaid and cancelled games take places. 10 published unpaid games: new draft 409 with the same sentence; "publish" cannot help, delete answers 409 `not-a-draft` (or "This game was cancelled by the organizer." for a cancelled one). Way out: pay, or wait about 30 days after the unpaid game closed. Same in clone | worker.ts:1409, clone.ts:55, pay.ts:82 | make 10 drafts, publish them (no pay); `POST /api/z` -> 409 "You have 10 unpublished drafts..."; `POST /api/z/ID/discard` -> 409 |
| O-04 | Medium | `org\|s9\|a save at the same moment as the payment...` | A game paid for pack 100 never holds 600 people | 4 to 5 of 6 games ended paid with pack 100 and size 600. Live equivalent: size raised in a second tab while the Razorpay window is open | pay.ts:239 (`SET pack=? WHERE pack=0`, no check against current cap); worker.ts settings 2054 reads pack 0 | fire `POST /api/payments/test {eid}` and `PATCH /settings {cap:600}` together on a published cap-100 game |
| O-05 | Medium | `org\|s2\|doc row 2 literally`, `employees only with 'anyone with the link'`, `create ignores guestInvites`, `create ignores coHostLimit` | Design doc choice 2 ("list + employees only + guests may invite") saves as written; nothing is dropped silently | 200 and `guestInvites.on=false` (employees only forces invitations off); `whoCanJoin:"anyone"` + employeesOnly silently becomes "list"; guestInvites / coHostLimit in the create body are ignored with 200. The console avoids all of this (choice 2 is saved WITHOUT employeesOnly), so the document and the code differ | config.ts:332; worker.ts:1410 and create validateCfg call (no invites/coHostLimit) | `PATCH /settings {whoCanJoin:"list",employeesOnly:true,verify:"id",guestInvites:{on:true,per:4,cats:["family"]}}` -> 200, summary guestInvites.on=false |
| O-06 | Medium | `org\|s9\|change <any field> on an unpaid game after its start time passed` (19) | Plain sentence that the game's time has passed and a new time must be chosen first | 400 "Pick a start time in the future." for a name or prize edit | worker.ts:2055 | publish unpaid; advance clock past start; `PATCH /settings {name:"x"}` |
| O-07 | Low-Med | `org\|s8\|pay by Co-host of the game for a cancelled game` | 409 "This game was cancelled..." like the Organizer gets | 403 "Please sign in again." (the Co-host key is retired by the cancel) | cancel.ts eraseCohostsSql / pay.ts:359 | cancel unpaid game with a Co-host; Co-host `POST /api/payments/test` |
| O-08 | Low-Med | `org\|s5\|Co-host mobile: starts with 5 / 1234567890 / letters mixed in` | Same mobile rules as Host and people list (6-9 start; letters refused) | 200: only the digit count 10-15 is checked, letters are stripped | worker.ts:1184-1186 | `POST /api/org/cohost {label:"Ravi",phone:"5555555555",e:ID}` -> 200 |
| O-09 | Low-Med | `org\|s5\|Host name: no name / empty / number / spaces` (4) | spec 4: "A Host needs a name" | 200, Host with empty name | worker.ts:1127 (`cleanLabel`, no minimum) | `POST /api/org/host {email}` -> 200 |
| O-10 | Low | `org\|s5\|the same e-mail / the same mobile added as a Host twice` | One person takes one of the 5 places | both accepted, two places used | worker.ts:1124-1125 | add same e-mail twice |
| O-11 | Low | `org\|s7\|publish with ... mobile (0000000000)` (6), `org\|s6\|a row with a number that is 0000000000`, `org\|s5\|Host e-mail: two dots in a row` | junk number / `a@example..com` refused | accepted: a leading 00 is read as an international prefix, so 0000000000 passes; EMAIL_RE allows `..` | phonekit.ts cleanPhone `international`; worker.ts:719 | publish with phone "0000000000" -> 200 |
| O-12 | Low-Med | `org\|s7\|publishing twice: the first confirmed e-mail ... kept for the report` | A typing slip in the report address can be corrected | second publish answers `already:true` and ignores the new address; no other route changes `contact/<id>` | worker.ts:1878-1882 | publish with a wrong address, publish again with the right one, read kv contact |
| O-13 | Low | `org\|s6\|a person's name: a tab and a new line` | "Ravi\t\nKumar" -> "Ravi Kumar" | "RaviKumar" (control characters removed before spaces are collapsed) | people.ts:62 cleanName | add person name "Ravi\nKumar" |
| O-14 | Low | `org\|s4\|a typed position and an automatic one never collide` | automatic moments avoid a typed position | 400 "Two breaks cannot start at the same number." though the person typed no clash | config.ts:259-261 | breaks: one `after:30`, two with no `after` (2-break spread gives 30) |
| O-15 | Low | `org\|s4\|company name with an ampersand` | console text: "we write & as and" | API drops it: "Mehta & Sons" -> "Mehta Sons" (only the console converts) | config.ts:271 | `PATCH {brand:{name:"Mehta & Sons",color:"#0B3D91"}}` |
| O-16 | Low | `prize text (81/200 characters)`, `moment title (81/200 letters)`, `Host name of 41 letters` (6) | refused or kept | silently cut to 80/80/40 | config.ts:185 cleanText; worker.ts:720 | send an 81-character prize text |
| O-17 | Low | `org\|s3\|going back from 2 tickets to 1` | the answer says a prize was removed | two-ticket prize removed, answer says nothing (the console shows a note) | config.ts:230 | `PATCH {tickets:2,rewards:[...full2]}` then `{tickets:1}` |
| O-18 | Low | `org\|s6\|switching to employees-only after a list of mobiles exists` | Organizer told how many listed people have no employee ID | no warning | worker.ts settings / people.ts | add 5 mobiles, `PATCH {employeesOnly:true,verify:"id"}` |
| O-19 | Low | `org\|s9\|settings with a body that is text / empty / null / 200 KB` (4), body a list | plain sentence | "Check the details."; a JSON list is accepted as a no-op | worker.ts:2038 | `PATCH /settings` with body `hello` |
| O-20 | Low (docs) | `org\|s2\|the summary and the public info name the default...` | same word | summary "mobile", public info "number" (z.js maps it, so harmless) | worker.ts:104 | GET info vs summary |
| O-21 | Low (docs) | four `org\|s2/s3\|the AI manual ...` | manual matches the server | manual says winners per house "10 / 2 / 1" (server 100), invites "per: 1-4" (server 1-10), never names employeesOnly, verify, whoCanJoin | worker.ts:734-760 AI_MANIFEST | GET /api/z/ai-manifest |

Document-only differences found while deriving oracles: the design doc offers a gap of "9 or 12 seconds" while the server accepts 6, 9, 12, 15 (console shows 9 and 12; 6 and 15 are kept for older games); spec 4's old "money back minus charges" sentence is superseded by spec 6 and the console already says no refund; `proposeBreakPositions` (pricing.ts: 22/45/67) and `autoAfter` (config.ts: 23/45/68) disagree on even spread.

## Fixed (failed on the code before 1.2.1, pass now)

| Id | What | Evidence before |
|---|---|---|
| F-1 | Start time, gap, size, game code refused with "Check the engagement details." (about 50 scenarios) | HTTP 400 vague sentence; now specific sentences |
| F-2 | Create accepted any `whoCanJoin` ("LIST", "friends"...) and silently made the game open to anyone (10 scenarios) | HTTP 200 on create |
| F-3 | Size could drop below the people already listed but not yet joined (20 listed, size 10) | HTTP 200 |

## Not findings (harness, fixed in the generator)

Time-of-day clamp of `startAt` near midnight (grid now uses day 2 and 10); oracle for the opening window (it is 120 s, not 180); the owner test pack's pack is 1000, not the size asked; string pack "250" is converted by the server; the CSV BOM is removed by `fetch().text()`; arrays coerced to a number string; Co-host cannot be invited to a cancelled game (create before cancel). Two false failures remain in the final run: `reschedule to a start time that is huge` (message regex too narrow: the sentence is the correct 30-day one) and `making a demo game real by paying for pack "250"` is fixed in the generator after the last full run.

Simulator limits: the in-process database answers instantly, so lost updates between two quick saves (28 pair scenarios) could not be provoked and passed; only the slow pay-vs-save race (O-04) reproduced. The sim cannot show the live Razorpay checkout window.
