# Handover: "Cloud: 1M join test + 250/500/1000 mix" session (written 2026-10-26 about 16:20 UTC)

Session: session_01LYigAGEKnmcPbfk9BiKsJ3 (cloud box: 4 cores, 15 GB). Repo FChecklist/corporate-tambola. Results branch: `cloud/load-results-2026-10-26` (draft PR 1). Product fix branch: `claude/sleepy-maxwell-0os4q6` (draft PR 2).
The box is ephemeral: everything under `data/` is git-ignored and is lost when the box goes. Copy result files into `tools/load-tests/results/` and push.

## Rules the owner set (still in force unless the owner says otherwise)
- Local servers only. The live site, pages.dev, Cloudflare and drand were not contacted (one blocked probe to api.drand.sh by mistake, 403, nothing exchanged).
- Product code is not changed on the results branch. The only product change is the join-limit fix, kept in a separate worktree/branch.
- The owner later asked to deploy the fixes to the live site. This session CANNOT (no Cloudflare credentials, sandbox cannot reach it). It messaged the laptop session "CORPORATE TAMBOLA" (session_016VNpvdjN9usPfrqT7MhbhK) with the facts and 3 questions (live game running? deploy base? who deploys?). NO REPLY YET. Do not deploy anything during a live game.

## Part 1: DONE
1,000,000 join attempts on 2 servers (500,000 each): 0 wrong. Negative control (wrong expectations on purpose): 320 defects flagged, so the checker can fail. Files: `results/part1/`. Caveat: the 6 audience types use the same code paths over and over, random private IPs, write budget 1e9.

## Part 2: RUNNING (45 whole games, local stand-in beacon with its own test key; phones still run the product's real signature check)
Campaigns (each on its own fresh server and database; the flags are those of run-certify5.sh):
- m250 cases 1-18 (conc 3), port 8831, log `data/m250.out`: 16 pass, 1 case failed (#3, test flaw), 1-2 cases still running.
- m500 cases 19-36 (conc 2), port 8832, `data/m500.out`: 10 pass, 2 cases failed (#21, #24, same test flaw).
- m1000a cases 37-39 DONE: 2 pass, #39 failed (same test flaw).
- m1000b cases 40-42 (port 8834) and m1000c cases 43-45 (port 8835): started 16:02, about 20 min per case, not finished.
After each campaign ends it waits for the end-of-game report e-mails (up to 14 min per case) and then writes `data/campaign-<tag>.json` with a SUMMARY line. Check with `tools/load-tests/cloud-status.sh`.
Every failed check so far is the same one: "manual: the numbers came only because the Host pressed Next (numbers <= presses stored + 1)" in Host-mode cases. Diagnosis: test-threshold flaw plus a by-design delay. The test host keeps pressing Next after the game's last number until its reference phone sees "game over"; phones check results every 15 s (cap <= 250), 25 s (<= 1000), 40 s (<= 2500), 50 s above (`seatEveryMs`, phone-runtime.ts:537), so the extra presses grow with crowd size (4, 6, 6, 8). The product ignored the extra presses; all phones agreed on numbers and winners.
Lag counters rose to 1625 ms in m500 while I ran extra tests next to it; no timing check has failed in an auto-mode case so far. If any later case fails a timing check, compare with the lag counter and rerun that case alone.
STILL TO DO for Part 2: wait for m250 / m500 / m1000b / m1000c to finish; copy `data/campaign-*.json` and `data/m*.out` into `results/part2/`; run `python3 tools/load-tests/certify_report.py "mix 250-500-1000" m250 m500 m1000a m1000b m1000c` (needs no sigma-steps.json; it will omit the "rule steps" table: say so, do not invent numbers; it writes docs/SIX_SIGMA_*.md); fill the table (size, cases run, clean, failed checks) in the final report.
If a campaign process dies, rerun only the missing cases with a NEW tag: `tools/load-tests/cloud-run-one.sh PORT TAG FROM TO CONC PEOPLE LEAD`.

## Extra work the owner asked for during the run (all local; results in `results/fault/`, scripts in `tools/load-tests/fault/`)
Server mimic: `cloud-start-prod-server.sh PORT DB [TREE]` runs the code with the deployed `pages/wrangler.toml` settings (JOIN_PER_IP_MINUTE 600, JOIN_PER_IP_DAY 20000, write budget 2,000,000). The plain local server uses the code defaults (200/min, 1500/day) and the task's budget 1e9: the campaigns above ran that way, with random private IPs (about 3 phones per address), so they could never hit a per-address limit.
Done and committed (commit 8a84c00 and earlier):
- join-storm (flash crowd): 1000 behind ONE address, deployed settings, unmodified code: 600 in on first try, 400 refused, 41 s to seat all only because the test retries; fixed code: 1000 first try in 4.7 s. 80% behind 2 office addresses: fine unmodified.
- roles-e2e: 57 of 57 as expected (Organizer, Host with setup, Co-host: rights, game day, retire, 5-Host limit, Co-host pays).
- invites-e2e (about 1000 people): 27 of 29. Real findings: in an open game the places promised to invited people are not kept (5 invitees got 409 "full"; the Organizer's list shows 1005 people on a cap of 1000).
- approvals-e2e (employees only, manual, 800 listed): see below.
Uncommitted / unfinished at hand-over:
- `fault/campaign.mjs` (chaos case 901 with injected beacon faults and a 60 s server kill; STAG_MS and IP_POOL options) and `cloud-restart-prod-server.sh`: edited, NOT committed. A first chaos run (`data/chaosA.out`, 80 people) was started and was probably still running; its output is not read yet. Planned second variant: server dead from the end of the 2-minute window for the whole game (CHAOS_SERVER_KILL_AT=0 CHAOS_SERVER_DOWN_SEC=900 CHAOS_BEACON=0). Planned: one 1000-person flash game (STAG_MS=3000 IP_POOL=1) once the box has spare CPU.
- `approvals-race.mjs` run 3 (`data/approvals-race-run3.out`) and `approvals-e2e` rerun (`data/approvals-n800b.out`) were running; read them, then copy to `results/fault/`. Race so far: Organizer admits and Host declines the same request at the same instant: 1 of 10, 1 of 60, 0 of 60, 3 of 80 end with the request "declined" but the person still gets in (admit inserts the person even if the decline won; people.ts decideWaiting). Not fixed.
- The audit document the owner asked for ("step by step, like the 79 gaps") is NOT written yet. Two read-only agents produced the code maps (entry paths, approvals, logging, mistakes); their findings are summarised in the list below. Write it as `results/AUDIT_INVITES_AND_APPROVALS.md`, tagging every item TEST / CODE-READ / SUSPECTED.

## Findings so far (evidence level in brackets)
1. [TEST] Per-address join limit: 1000 behind one office address -> 400 refused at the deployed 600/min. Fix in PR 2 (allowance = max(base, pack)). Must be ported by hand onto the real deploy base (the branch sits on unreleased code `cloud/test-tools`; do not deploy the branch).
2. [CODE] The phone shows every 429 as "Could not join. Check your connection and try again" and does not retry.
3. [TEST] Invited people lose their place in an open game when it fills from the open link (409 "full"), people count above cap.
4. [TEST] Race: two approvers deciding the same request at the same instant can leave "declined" + person inside (about 2-4%).
5. [TEST] A typo in an employee ID goes to the waiting room, not "check your ID"; 31st wrong ID from one address in 10 min is locked ("too-many-tries", correct IDs still pass). Waiting room holds 500, rest told "waiting full".
6. [TEST] First decision wins; the second approver gets 200 "already"; a decline is final (overrule only by re-adding the person by hand). A level-2 guest's share link silently records no inviter.
7. [CODE + measured] Organizer controls and results lag with crowd size: End on a 1015-seat game took 158 s to show on two phones; poll about 9 s (<= 250), 27-36 s (<= 1000), 54-72 s (<= 2000). ABOVE 2000 people: no Host mode, no Pause (control.ts:302-307, worker.ts:1281, 1381); the owner plans games of up to 10,000.
8. [CODE] Brand media (video/audio/YouTube) is NOT pre-downloaded: z.js startMedia sets the source at break start; only the app itself is saved on first open (service worker, verified in Chromium: 32 files, 1.1 MB, offline reload works). Not tested on real phones / in-app browsers.
9. [CODE, suspected] Guest identity is only the public ticket id; evidence (claims, waiting decisions, removals) is erased 20 h after the game; the report's "on your list" counts ignore My-people lists; late claims show "Claim sent" but silently do not count. Details were in the agents' reports; re-derive with `grep` before quoting.
10. [UNIT SUITE] Unmodified tree: `apps/web/test/guide.test.ts` "every message the server can send has a guide" already fails.

## Open decisions for the owner
- Deploy: who deploys (laptop session has the path) and when (no live game running). Port the join-limit fix by hand; do not deploy PR 2's branch whole.
- ID_MISS_PER_10MIN = 30 (left unchanged: security control).
- Whether to add automatic retry with a short random wait for refused joins, and a clearer message for 429 (changes the phone code).
- Whether big games (above 2000) need Pause / End / Host mode.

## Final report still owed to the owner (the original task)
Environment (4 cores, 15 GB), exact commands, Part 1 totals, the Part 2 table, and an honest list of what was not done: real beacon (stand-in used), live site never touched, chaos / server-kill test unfinished, audit document unwritten, laptop session's reply pending.
