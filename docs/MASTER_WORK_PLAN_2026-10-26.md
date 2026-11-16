# MASTER WORK PLAN - Corporate Tambola (boss: session "Corporate Tambola handover", local_ce1ad2fd)
Written 2026-10-26 ~23:30 IST. Branch `wip/join-redesign` (merged: 1.2.0 + join WIP + console fixes + peer fixes 87ae7ac/a6a1d94/52e7824). Live = `fdf52e7` (1.1.8). Nothing here is deployed.
Rules for all three sessions: no deploy / no push to `feat/owner-2026-10-23` except the boss; no heavy tests on the laptop while a live game may run (laptop ~1 GB free RAM); never spend money, never switch the live mode, never write the Game-day line's private reason, demo-pass tokens stay in `data/private/`; say only what was observed.

## A. PENDING (known, scoped, not done)
| # | Item | Source |
|---|---|---|
| A1 | Join redesign: wire `/who` into the join form (show given name once ID typed; Name box hidden); country list in the prize card, check-in card (hide "mobile correct" when no mobile on file), My-invites form; `needPhone` loop for ID-only people; waiting-card text for an unlisted ID; "who can join" line from /info; focus guard over cc/ph/nm/emp; "engagement"->"game" wording (5 tests pin the old word) | handover s.8-2 |
| A2 | Review findings 4-12 (29 confirmed): CSV formula guard on `+44..`; double plus in "Removed"; PDF report `mob()` width + rebuild `reportgen.js`; check-in mobile box maxlength 14 + country list; `CTPhone.parse` edge cases (`(0)`, `(+44)`, typographic dashes, non-ASCII digits, US "1"); busy-retry generation counter; kept-form leaks (roster/others use keptPhone; prize/report display; prize confirm refuses unchanged number); old-page guest-invite 403 `device` guide text; `cleanPhone` strictness in check-in/prize | handover s.9b |
| A3 | Tests that pin old behaviour: `param-people`, `phone-guest` (2), `idiotproof-player-pages` (1), `pages.test` prize confirm + Hurray/confetti test (+1 flake), `worker.test` commented assertion; replace `join-probe.test.ts` (asserts nothing) by real tests in `join-global.test.ts`; DOM tests for every join mode (mandatory/optional marks, country list, pasted +CC, busy auto-retry, error texts) | s.9b-11, s.8-4 |
| A4 | Unassigned audit findings: 23 (`loginpass/*` never swept, worker.ts retentionSweep); player page 16-19, 26 (Bogey POST timeout stores twice; "Type it again" dead end on personal link; wake lock during pause; check-in red message not cleared; "engagement"->"game") | s.5 |
| A5 | Admitted-is-final fix (mode `both`: admitted person re-sent to waiting room when ID differs) | s.8-3 |
| A6 | Leftovers from the beacon/console agents: `zc.js` Next-number handler has no timeout; purge of shared control copy on publish (worker.ts) + `ctlWords` "already used" text; share `isDown` from index.ts with game.ts backfill (~3 lines); `cancelled`/`didNotStart` in the two history SELECTs (worker.ts) for the exact unpaid-cancelled label; Fix buttons `disabled` (optional); dead AI-wording notes in `aiBlock`/`aiStrip`/`newLink`/`aifresh` | s.9a, 9c |
| A7 | Guard charges 3 per join but a join writes ~9 rows (`spend(env, now, 3)`, `2` in `wait()`): raise to ~9 | s.6 |
| A8 | Release 1.2.1: `releases.json` entry (plain words) + put the 1.2.0 commit hash `274bde8` in the 1.2.0 entry; full suite in groups; one clean 1,000-behind-one-address local run at real limits; deploy ONLY in a quiet window (no live game); push; verify `/version.json` | s.8-6 |
| A9 | Live checks after deploy: 10-player demo, demo-pass links incl. brand-new account, every join mode at phone size on the real site, relay | s.8-6 |
| A10 | Clean live 250x4 (`tools/run-live-250x4.sh`); 1,000-person live auto + manual from a bigger machine (`docs/PROMPT_CLOUD_LIVE_1000.md`); S10 at production-like limits (cloud result: 0 wrong of 1,000,000, 95% bound 6 per million - verify the file); six-sigma certificates (`tools/certify_report.py`, `coverage_matrix.py`) for 10-, 100-player games and the 250/500/1000 mix | s.8-7 |
| A11 | Cloud mix campaign: m250 16/18, m500 10/14, m1000 in progress; all failures share one check (peer to name it and classify product vs harness) | HANDOVER_CLOUD_1M_REVIEW |
| A12 | Commit/push hygiene: feat/owner-2026-10-23 is 3+ commits ahead of origin and the join WIP lives only on this laptop (wip/join-redesign) - back up by pushing the WIP branch (boss decision) | git |

## B. GAPS UNFILLED (known defects / unknowns with no fix yet)
| # | Gap | Notes |
|---|---|---|
| B1 | WebKit manual employees-only game stalls at 19 numbers (3 live runs: LW1b, LW1c, ...) | cause unknown; not explained by the quota outage |
| B2 | WebKit-only pageerror "Fetch API cannot load .../version.json due to access control checks" (LW3) | not diagnosed |
| B3 | Ticket-id forging: winner votes, game-over signal and guest invitations trust the public ticket id (a script could forge winners); needs a careful roll-out so old phones keep working (checklist row 23) | worker.ts |
| B4 | Account pre-hijack: anyone can open an account with someone else's e-mail and keep its key after the real owner signs in | auth |
| B5 | Phones that already have the game open do not re-read changed settings | phone-runtime |
| B6 | Employees-only check-in: mobile row blank/disabled when no mobile on file (UX); adding people ~1 s apart dropped 2 of 10; Remove did nothing after publish; CSP inline-script error on the guest page (PEHU findings, not investigated) | PEHU |
| B7 | Late numbers in bursts (1-5% in 250-player local runs): cause external/laptop vs product NOT proven; real drand 5xx to browsers | needs paired run |
| B8 | Organizer console is India time only | decision |
| B9 | Global (other-region) testing never done; Cloudflare-side limits (CPU, subrequests, query limits) NOT tested; simulated D1 delay (3/10 ms) is an assumption - take real call times from live logs | cloud/live |
| B10 | 10,000-player not shown to work (laptop limit); 1,000-person live game never run | cloud |
| B11 | Lighthouse / accessibility / ZAP scans never run (one contrast issue fixed earlier); PayPal not built | scans |
| B12 | Sister games (Bingo, Snakes&Ladders, Luck by Chance, Tic Tac Toe) have unmerged ports `port/tambola-2026-10-24`, untested/undeployed; Who Knows untested; corporategames.co move (owner buys) | after Tambola certified |
| B13 | Six-sigma for number delivery and per-game steps cannot be proven by sampling: state measured rates and bounds, never "certified" without evidence | honesty rule |
| B14 | Whether prospect Sneha played: needs `/owner-visits` with the platform key or a D1 read token (`CLOUDFLARE_D1_TOKEN`, not present) | owner |
| B15 | Owner decisions D1-D6 (name-only join mode not built; name box after ID lookup; unknown ID in open game; guest link in list-only game; identity hash = last 10 digits (cross-country collision ~0.2 per million joins); default size 250 vs demo 10) - defaults applied | owner |
| B16 | S10 on the laptop (port 8821) was invalid (connection errors, stalled at 245k) and is stopped; superseded by the cloud S10 | done/closed |

## C. SPLIT (file ownership prevents duplicate / colliding work)
**BOSS (me, local_ce1ad2fd)** - owns: `apps/edge/src/worker.ts`, `people.ts`, `phonekit.ts`, `apps/web/public/z.js`, `zc.js`, `guide.js`, `packages/beacon/src/phone-runtime.ts`, `index.ts`, `releases.json`, all deploys/pushes, owner contact. Tasks: A1, A2 (z.js/people.ts/worker.ts parts), A4, A5, A6 (worker.ts/zc.js/index.ts parts), A7, A8, A9, B3, B4, B5, B6, B1/B2 diagnosis decisions, A12.
**PEER P1 = "Cloud 1M session handover" (local_0c69f60d, worktree C:\ct\tw-fix)** - owns (branch `p1/*` cut from `wip/join-redesign` HEAD; hand me a branch, I merge): `apps/edge/src/winners.ts`, `checkin.ts`, `report-layout.ts` + `apps/web/public/reportgen.js` rebuild, `apps/edge/test/*` and `apps/web/test/*` files for A3 (not z.js itself). Tasks: A2 findings 5, 9 (winners/report parts), 12; A3 entire (update pinned tests, replace `join-probe`, DOM tests for join modes once I push z.js changes - coordinate by commit hash); A11/B7 analysis of campaign data; local verification: after each of my merged commits re-run join-storm (1000 behind one address, real limits), approvals race, invites-in-open-game.
**PEER P2 = cloud session "Cloud: 1M join test + 250/500/1000 mix" (e76a79; reports via P1)** - read/run only, no product code. Tasks: finish A11 campaigns; A10 S10 + mix on the final merged commit I name; B1/B2 WebKit reproduction on the cloud box with Playwright WebKit against the local replica (report stack + hypothesis, no fix); B9 real-limits tests where possible; B7 paired run; B11 Lighthouse/accessibility scan of the local replica pages.
**OWNER (Rajat)** - D1-D6, default size, B8, B14, Sister-game order, PayPal, corporategames.co.

## D. ORDER OF EXECUTION
1. (now, parallel) Boss: A1+A2 z.js/people.ts parts, A4/A5/A7. P1: A3 + A2 winners/report/checkin parts. P2: finish campaigns, B1/B2.
2. Boss merges P1 branch -> full suite in groups (one bun process at a time) -> A8 release 1.2.1 prepared (not deployed).
3. P1/P2 verification on the merged commit (storm, race, invites, S10 on production-like settings).
4. Quiet window (confirm no live game) -> deploy, A9 live checks, A10 live 250x4, 1000-person from cloud.
5. Only then: B3, B4, B5 hardening release 1.2.2, certificates, scans, sister games.
