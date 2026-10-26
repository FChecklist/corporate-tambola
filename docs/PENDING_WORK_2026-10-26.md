# Corporate Tambola: what is pending, what is not covered, and who does what

Written 2026-10-26 about 23:30 IST by the session "Cloud 1M session handover" (call it **C**). Sources I read: the Tambola handover `docs/HANDOVER_2026-10-26_JOIN_REDESIGN.md` (sections 0-9c), the cloud load-test session's files on `origin/cloud/load-results-2026-10-26`, the project memory notes, and my own test runs. Nothing below is a claim that something passed unless it says so.

Sessions (the three that are alive):
- **A = "Corporate Tambola handover"** (`local_ce1ad2fd`): owns the Tambola tree `C:\ct\test-sites\tambola`, the join redesign, release 1.2.0/1.2.1 and every deploy.
- **B = "Cloud: 1M join test + 250/500/1000 mix"** (cloud box, 4 cores / 15 GB, Linux): measurement only, local servers, cannot reach the live site, cannot deploy.
- **C = me** (`Cloud 1M session handover`): fixes on my own branch/worktree `C:\ct\tw-fix`, independent review, coordination.
Messages from C to A are being held (A cannot approve incoming messages): until the owner approves them, this file and the git branches are the channel.

## 1. PENDING: started but not finished

| # | Item | State | Lane |
|---|---|---|---|
| P1 | **Release 1.2.0 (`274bde8`) not deployed.** Live is `fdf52e7` (1.1.8). Origin is behind the laptop. Tree is now `wip/join-redesign` at `bb9b32d` (three snapshot commits on top of 1.2.0). | open | A |
| P2 | **Join redesign unfinished**: `/who` route is dead code (not in the route regex, `worker.ts` ~1484); country list not in prize card, check-in card, My invites form; `needPhone` loop for ID-only people; waiting-card text for an unlisted ID; K4 wording per mode (needs the owner: new consent version); one "who can join" line; focus guard on `cc/ph/nm/emp`; "engagement" -> "game" wording (5 tests pin the old word); admitted-is-final fix in mode `both`. | open | A |
| P3 | **29 confirmed findings of the join review** (`docs/handover-2026-10-26/join-review-confirmed.md`). Split in section 3. | open | A + C |
| P4 | **Audit findings with no owner**: 16-19, 26 (z.js: Bogey POST timeout stores twice, "Type it again" dead end, wake lock during pause, check-in red message not cleared, wording); 23 (`loginpass/*` secrets never swept in `retentionSweep`); 20 (zc.js Next-number handler has no timeout); 22 (purge of the shared control copy on publish; `ctlWords` text). | open | A (z.js, zc.js), C (23, 22 server side) |
| P5 | **Tests**: `join-probe.test.ts` asserts nothing, must become `join-global.test.ts`; no DOM tests for the join form modes, busy auto-retry untested; four tests pin old behaviour (`phone-guest` x2, `idiotproof-player-pages`, `pages.test` prize confirm, `param-people`); `pages.test` has 2 failing ("winner sees Hurray with confetti", one flake); not run since the changes: `idiotproof-steps-7-10`, `helpdesk-pages`, `demo-pages`, `consent-pages`, `guide`, `stop-control`, `testmode-banner`; trust page test fails (`trust.html != trustHtml()`: re-run `tools/make-trust.ts`). | open | A |
| P6 | **Write guard charges 3 per join but a join writes about 9 rows** (`spend(env, now, 3)` in the join route, 2 in `wait()`): raise to ~9. | open | C (small, `worker.ts`) |
| P7 | **My two fixes** (invited places kept in open games; admit/decline race). Built, tested (174 pass on the rebased files; each new test fails without the fix), pushed: `origin/fix/invites-and-approval-race` (`52e7824`, off 1.2.0) and `fix/invites-race-on-join` (`8e6f2b7`, rebased on `bb9b32d`). Not deployed. | done, waiting for release | C -> A deploys |
| P8 | **PR 2 (per-address join limit)** `origin/claude/sleepy-maxwell-0os4q6` (`87ae7ac`). Partly superseded: live limit is already 600/min and 20,000/day and A's tree adds busy auto-retry (untested). Must be RE-MEASURED, then PR 2 closed or rebased. | open | B measures, C decides |
| P9 | **Cloud load-test harvest**: Part 2 unfinished (m250 one case, m500 two, m1000b/m1000c running), no report run, chaos run `chaosA` produced no result, `approvals-n800b.out` unread, `KNOWLEDGE-CLOUD-1M.md` not yet pushed, box results lost when the box ends. | open | B |
| P10 | **Live whole-game tests**: no clean 250 x 4 yet (three of four were contaminated by deploys/tests), no 1000-person game, WebKit manual employees-only stalls at 19 numbers (3 runs, cause unknown), live Host e-mail-code sign-in untested. | open | A (quiet window) |
| P11 | **Certificates**: `certify_report.py`, `coverage_matrix.py` not run for 10/100/mix; S10 should be recorded from the cloud run (2 x 500,000, 0 wrong, negative control 320 defects); the local 8821 run is invalid (connection failures, stopped at 245,000). | open | B (report), A (final) |
| P12 | **Owner decisions** D1-D6 (name-only join mode, name box after ID lookup, unknown ID in open game, guest link in list-only game, identity hash across countries), default game size 250 vs demo 10, K4 wording. | waiting for owner | A asks owner |

## 2. GAPS NOT FILLED: nothing has tested or decided these yet

| # | Gap | Why it matters |
|---|---|---|
| G1 | Cloudflare's own limits (CPU time, subrequests, D1 query limits) are not enforced locally; D1 delay is an assumption (`D1_READ_MS=3`, `D1_WRITE_MS=10`). | Local "passes" do not prove the live site holds. Report as "not tested". |
| G2 | drand reachability/latency and our `/api/beacon` relay under crowd load were never tested (cloud used a stand-in beacon; PEHU's network blocks 3 of 4 drand mirrors). | The relay is the answer to blocked mirrors but is unproven under 250-1000 phones. |
| G3 | Control delay grows with size: Pause/End/Next reach phones in ~9 s (<=250), 27-36 s (<=1000), 54-72 s (<=2000); End took 158 s on a 1,015-seat game; above 2000 people there is no Host mode and no Pause. | Product decision for the owner: shorter polling cost vs speed. |
| G4 | 10,000 players, Lighthouse/ZAP scans, PayPal, corporategames.co move: not done. | Stated goals, not started. |
| G5 | Security: account pre-hijack, ticket-id vote forging (checklist row 23), phones not re-reading changed settings. | Real, known, unfixed. |
| G6 | Typo in an employee ID (e.g. a space) goes to the organizer's waiting list instead of telling the person to check it (cloud F4). Brand media not pre-downloaded, only the app (cloud F7, unverified). | Poor experience, no data loss. |
| G7 | Server-kill during a game and beacon-fault game (chaos): never completed. | The most likely real-world failure is untested. |
| G8 | Six-sigma on number delivery to phones cannot be proven by sampling; only measured rates and bounds. Rule steps S1-S13 are done at 1,000,000. No overall certification claimed. | Must not be overclaimed. |
| G9 | Organizer console is India-time only; whether Sneha (prospect) actually played is unknown (needs the platform key or a D1 read token `CLOUDFLARE_D1_TOKEN`). | Owner visibility. |
| G10 | Repo hygiene: Tambola tsc has 135 errors (mostly tests), GitHub `origin` lags the laptop, WIP snapshot branches. | Risk of losing work. |
| G11 | The cloud Host-mode check "numbers <= presses stored + 1" has a wrong threshold (phones check results every 15/25/40/50 s by size). | Makes good games look failed; fix the test, not the product. |
| G12 | Invites: a guest's share link records no inviter silently; promised places for invited people (F2) fixed on my branch only. | Information / fixed in P7. |

## 3. THE WORK, SPLIT BY SESSION

### A: "Corporate Tambola handover" (product owner, deploys)
1. Finish P2 and the **important join-review findings 1, 2, 3, 6, 7, 8, 10, 11** (route `who`, guide entries, `ctz-cc` in storage registry and privacy list, check-in country list, `CTPhone.parse` cases, busy-retry generation counter, device 403 wording, tests that pin old behaviour) and P4 z.js/zc.js items.
2. Fix P5 (tests, trust page), run the whole suite in groups, release notes (`releases.json`), **deploy 1.2.0/1.2.1 once, in a quiet window**, verify `/version.json`, push to GitHub.
3. Merge my branch `fix/invites-race-on-join` (one commit, tested) into the release.
4. P10 live tests after the deploy, in order: 10-player demo, every join mode at phone size, 250 x 4 clean, then 1000 (auto, manual) from a bigger machine.
5. Ask the owner D1-D6, K4 wording, G3.
Do not edit: `C:\ct\tw-fix`, the cloud branch.

### B: "Cloud: 1M" (measurement; local servers only; no live site, no deploy)
1. Finish the harvest (P9): wait for the campaigns, push `results/part2`, run `certify_report.py "mix 250-500-1000" m250 m500 m1000a m1000b m1000c` (say the rule-steps table is omitted), push `KNOWLEDGE-CLOUD-1M.md`.
2. Fix the cloud test threshold (G11) and re-run the failed Host cases alone on a quiet box.
3. Run the **chaos games** (G7): server killed for 60 s, and server dead for the whole game; read and report.
4. When A gives a commit SHA of the new code: re-run (a) 1000 phones behind ONE address at the real limits (600/min, 20,000/day) with and without the new busy auto-retry (P8), (b) the 250/500/1000 mix on the new code, (c) a 2,000- and 10,000-seat feasibility run on its 15 GB box (G4).
5. Push everything to `cloud/load-results-2026-10-26`. Do not change product code.

### C: me (fixes, review, coordination)
1. Ship P7 (done) and keep it rebased on A's latest committed tree.
2. **Server-side join-review findings 4, 5, 9, 12** (CSV export of foreign numbers, PDF report and `reportgen.js`, kept-form leaks in `worker.ts`/`winners.ts`, `cleanPhone` strictness) and **P6** (write guard 3 -> 9) and **P4 item 23** (sweep `loginpass/*`), item 22 (purge control copy on publish): each on my branch with a test that fails without the fix, handed over as one commit.
3. **Independent audit** of A's release before it goes live (the person who did not write the code reviews it: Rule 7(c)): read the diff 274bde8..release, run the suite on a separate checkout, list defects.
4. Keep this file and the memory notes current; read B's results and tell A and the owner.
5. Do not edit `C:\ct\test-sites\tambola`.

## 4. How we avoid duplicating
- One owner per file area: A = `z.js`, `zc.js`, `z.css`, `guide.js`, `releases.json`, the tree; C = `people.ts` csv/export, `winners.ts`, `report-layout.ts`, `reportgen.js`, `retentionSweep`, `spend` constants, my fix branch; B = `tools/load-tests` only.
- Hand-over is by **branch + commit SHA on GitHub**, never by editing another session's tree.
- Deploys: only A, never during a live game.
