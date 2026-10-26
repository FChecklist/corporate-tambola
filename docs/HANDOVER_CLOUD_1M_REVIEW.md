# Cloud "1M join test + 250/500/1000 mix" session: full handover and review

Written 2026-10-26 (evening IST) by the local session "Cloud 1M session handover", which took over from the cloud session
(`session_01LYigAGEKnmcPbfk9BiKsJ3`, repo FChecklist/corporate-tambola, 4 cores / 15 GB Linux box, started about 14:00 UTC on 26 Oct).

What is verified (I read the file or result myself) is marked **[read]**. What I only know from the cloud session's own notes is marked **[told]**.
The cloud session's own chat transcript is on claude.ai/code and could not be read from this machine; I asked it to write
`tools/load-tests/KNOWLEDGE-CLOUD-1M.md` (owner instructions in order, reasons, mistakes). Read that file too when it appears on the branch.

## 1. Where everything is

| What | Where |
|---|---|
| Results + tools branch | `origin/cloud/load-results-2026-10-26` (draft PR 1), last commit seen `e7ef063` |
| Join-limit product fix | `origin/claude/sleepy-maxwell-0os4q6` (draft PR 2), commits `a6a1d94`, `87ae7ac` (only `apps/edge/src/worker.ts` + `apps/edge/test/param-life.test.ts`) |
| Its own progress log | `tools/load-tests/CLOUD-PROGRESS.md` |
| Its hand-over | `tools/load-tests/HANDOVER-CLOUD-1M.md` |
| Result files | `tools/load-tests/results/part1/` and `results/fault/` |
| Scripts it wrote | `tools/load-tests/fault/*.mjs`, `cloud-*.sh`, `fault/local-prod.ts`, `sigma-http-negcontrol.mjs` |
| Files only on its box (git-ignored, LOST when the box goes) | `data/campaign-*.json`, `data/m250.out m500.out m1000a/b/c.out`, `data/chaosA.out`, `data/approvals-race-run3.out`, `data/approvals-n800b.out` |
| Box-side live servers | ports 8821/8822 (Part 1, finished), 8823 smoke, 8831 (m250), 8832 (m500), 8833-8835 (m1000 a/b/c), 8883 (race), plus storm servers |

The laptop session "CORPORATE TAMBOLA" owns `C:\ct\test-sites\tambola` (branch `feat/owner-2026-10-23`, release 1.2.0 commit `274bde8`, uncommitted tree).
Nothing from the cloud session is in that branch yet.

## 2. What the owner asked, and what was done (in order)

1. **Part 1, S10 (who is let in), 1,000,000 join attempts** on local servers: 2 servers x 500,000, 24 concurrent, about 280-340 attempts/s each, finished 14:27Z. **[read]**
   Result: 0 wrong, 6 audience kinds about 83k each, upper 95% bound 6 per million (`results/part1/sigma-http-s10-8821.json`, `-8822.json`).
   **Why you can trust it**: a negative control (`sigma-http-negcontrol.mjs`, deliberately wrong expectations, 3,000 attempts) flagged 320 defects (`sigma-http-NEGCONTROL.json`), so the checker can fail.
   **Limits**: the 6 kinds hit the same code paths again and again, random private IPs, write budget 1e9. It proves the decision rules, not Cloudflare behaviour.
2. **Part 2, 45 whole games** (cases 1-45 of the 40/40/20 mix: 250 x 18, 500 x 18, 1000 x 9) as campaigns, each on its own fresh server + database, using `run-certify5.sh` flags. **[told + partly read]**
   Status when it stopped (**[told]**): m250 16 pass of 18, m500 10 pass of 14, m1000a 2 of 3 pass, m1000b (cases 40-42) and m1000c (43-45) running 16:02Z, about 20 min a case. All failures share one check (see 3).
   A smoke case (40 people, case 1) passed 0 of 32 checks failed **[read]** (`results/part1/smoke-campaign-smoke1.json`, `smoke-part2-case1.out`).
3. **Owner (mid-run) asked for a flash-crowd join test**, then **asked the test to mimic the real server** (real limits, real addresses), then to **deploy the fixes** (it could not). Extra tests are under `results/fault/`.

## 3. Method changes it made, and why (important for judging the evidence)

- **Local stand-in beacon** (`tools/load-tests/nodephone.mjs`, **[read]**): the sandbox proxy blocks drand (403) and the owner forbade contacting live services, so phones fetch rounds from an in-process chain with the same rules as drand quicknet (BLS12-381, signature on G1, round r due at genesis+(r-1)x3 s, randomness = sha256(signature)) signed with a **test key** made in the program (`TESTNET` = quicknet with the test public key).
  Every phone still runs the product's own `verifyRound` per round. A round not yet due answers 404, like the real one.
  **NOT tested**: drand's real reachability/latency and the server's `/api/beacon` relay (the relay arrived in release 1.2.0 after these tools were ported).
- **Porting only**: the Windows paths in the copied tools became checkout-relative (`ROOT`, `DATA_DIR`, `DB_FILE`) in `audit.mjs`, `campaign.mjs`, `report-check.mjs`, `sigma-http.mjs`, `certify_report.py`, `coverage_matrix.py` **[read the diff: pure path changes]**.
- **No product code changed on the results branch.** The only product change is PR 2, kept in a separate worktree so campaigns kept testing the unmodified code.
- **Correction it disclosed (15:31Z)**: local servers had been running the code defaults (200 joins/min/address, 1500/day, write budget 1e9), but the deployed `pages/wrangler.toml` sets `JOIN_PER_IP_MINUTE=600`, `JOIN_PER_IP_DAY=20000`, `DAILY_WRITE_BUDGET=2000000`. Campaigns ran with the task's own settings and random IPs (about 3 phones per address) so they could **never** hit a per-address limit. `fault/local-prod.ts` + `cloud-start-prod-server.sh PORT DB [TREE]` now apply the wrangler vars of a checkout; later tests use it **[read]**.
- **Deviation it disclosed**: one `curl` probe to api.drand.sh before it had read the code; the proxy refused (403), nothing exchanged.
- **Contamination note**: storm tests ran next to campaigns on 4 cores; the lag counter rose (max 1,625 ms in m500). A timing failure in any case must be compared with the lag counter and rerun alone. No timing check in an auto-mode case had failed when it stopped **[told]**.

## 4. Findings, with evidence and my confidence

| # | Finding | Evidence | Confidence |
|---|---|---|---|
| F1 | **Per-address join limit**: with deployed limits, 1000 people behind ONE address: 600 seated first try, 400 refused (429). A real phone shows "Could not join" and does NOT retry; the test retried so all were in after ~41 s. 80% behind 2 office addresses + 20% unique: all 1000 first try in 5.4 s. | `results/fault/join-storm-prodcfg-before-n1000-office1.json` (seatedFirstTry 600, refusedFirstTry 400, 429 x1161), `...-mix.json` (1000 first try) **[read]** | High (measured, repeatable) |
| F1fix | Fix in PR 2: allowance becomes max(base, pack) a minute and max(base, 3 x pack) a day (base = environment figure). After the fix 1000 of 1000 first try in 4.7-5 s. | `join-storm-prodcfg-after-n1000-office1.json` **[read]**; PR 2 unit suite 2570 pass / 6 fail / 3 errors (3 errors = modules missing in its extra worktree; the guide test fails on the unmodified tree too; two others pass alone) | Medium-high; not run against release 1.2.0 |
| F2 | **Invited places are not kept in an open game**: a game filled from the open link, 5 invitees then got 409 "full", and the Organizer's list shows 1005 on a cap of 1000. | `results/fault/invites-e2e.out` (27 of 29, the two FAILs) **[read]** | High |
| F3 | **Approve/decline race**: two approvers decide the same request at the same instant: 1/10, 1/60, 0/60, 3/80 end with the request "declined" but the person still inside (admit inserts the person even if decline won). `people.ts decideWaiting`. | `data/approvals-race-*.out` (run 2 in `results/fault/` is marked INVALID, cap too small, and also shows a different effect: admit+admit past the cap gives 22 "admitted but out" because the cap is hit) **[read run 2, told runs 3]** | High for the mechanism (I read the code) |
| F4 | An employee ID typed with a space ("EMP 10001") goes to the organizer's waiting list instead of telling the person to check the ID. | `approvals-e2e-n800-run1.out` **[read]** | High, UX |
| F5 | **Control delay grows with game size**: Pause/End/Next reach phones after about 9 s (up to 250 people), 27-36 s (up to 1000), 54-72 s (up to 2000). Above 2000 people there is no Host mode and no Pause (`control.ts:302-307`, `worker.ts:1281, 1381`). Measured End on a 1015-seat game: 158 s until two phones showed it. | race run 2, section C: `secondsUntilPhoneShowsEnd` 158.3 / 157.3 **[read]** | High |
| F6 | The Host-mode check "numbers <= presses stored + 1" fails in many cases (m250 #3, m500 #21 #24, m1000a #39, ...). Cause: after the last number the test Host keeps pressing Next until its reference phone sees "game over"; phones poll results every 15 s (<=250), 25 s (<=1000), 40 s (<=2500), 50 s above (`seatEveryMs`, `phone-runtime.ts:537`), so extra presses grow (4, 6, 6, 8). The product ignored the extra presses; all phones agreed on numbers and winners. | m250 #3 diagnosis: game ended by prizes at number 33, presses 34-37 ignored **[told, consistent with F5]** | Medium-high: a test-threshold flaw plus a by-design delay, NOT a wrong result. The check should use the same 15/25/40/50 s grace. |
| F7 | Brand media is not pre-downloaded, only the app. | **[told]**, no evidence file seen | Low until checked |
| F8 | `roles-e2e`: Organizer, Host (with setup), Co-host: 57 of 57 as expected, after fixing two flaws in its own script. | `results/fault/roles-e2e.out`, `roles-e2e-run2.json` **[read, first 30 lines]** | High |
| F9 | Employees-only manual game with 800 listed: list adding, ID join, approvals mostly as expected; findings F4 and the race. | `approvals-e2e-n800-run1.out` **[read]**; a rerun `approvals-n800b.out` was running **[told]** | Medium |

Open observation on my side: my own local S10 run (port 8821, laptop) showed 17 "wrong" of 230k, all "got 0/null" i.e. no HTTP answer (connection failure), not a wrong decision. I have not confirmed this. The cloud's 1,000,000 with 0 wrong is the stronger evidence.

## 5. What was started but NOT finished or NOT read

- **Chaos case 901** (`fault/campaign.mjs` edited, uncommitted at hand-over; beacon faults + 60 s server kill; `data/chaosA.out`, 80 people): output not read. Planned variant B: server dead for the whole game (`CHAOS_SERVER_KILL_AT=0 CHAOS_SERVER_DOWN_SEC=900 CHAOS_BEACON=0`). Planned: one 1000-person flash game (`STAG_MS=3000 IP_POOL=1`).
- **Part 2 report**: `python3 tools/load-tests/certify_report.py "mix 250-500-1000" m250 m500 m1000a m1000b m1000c` (needs no sigma-steps.json; it omits the rule-steps table, say so). Not run.
- **Audit document** of the fault tests: not written.
- **Deploy**: the cloud session has no Cloudflare credentials and cannot reach the live site. It messaged the laptop session; no reply. Deploys belong to the laptop session ("CORPORATE TAMBOLA"). **Do not deploy during a live game.**
- The live 250 x 4 and 1000 x 2 whole-game tests on corporatetambola.com are described in `docs/PROMPT_CLOUD_LIVE_1000.md` (laptop tree, untracked). The cloud session did NOT run them (it only used local servers).

## 6. What the local side decided and did (owner said "you decide")

- PR 2 (join limit) waits until release 1.2.0 is deployed, then is rebased on `feat/owner-2026-10-23` and deployed by the laptop session in a quiet window. Told "CORPORATE TAMBOLA" by message.
- Local worktree `C:\ct\tw-fix`, branch `fix/invites-and-approval-race` (off `274bde8`), started fixes for F2 and F3:
  - F2 (`apps/edge/src/worker.ts`, `addSeat` insert): a person who is NOT on a list needs `participants + not-yet-seated invited persons < cap`; a listed (invited) person may use their reserved place (`participants < cap` only).
  - F3 (`apps/edge/src/people.ts`): `admitInsert` / `admitRevive` helpers; the person is inserted/revived only `WHERE EXISTS (waiting still 'waiting')`, before the request is marked admitted, in the same batch; if the final update changed 0 rows the answer is `already`. Same in "Approve all".
  - Status: edited, not yet tested; tests to write in `apps/edge/test/people.test.ts` (race + reserved place).

## 7. Next steps (recommended order)

1. When GitHub is reachable: fetch `cloud/load-results-2026-10-26`, confirm the cloud session pushed its harvest and `KNOWLEDGE-CLOUD-1M.md`; copy `data/` results if the box is still alive (the cloud session was asked to do this).
2. Run `certify_report.py` for the mix; report "clean / failed" honestly with F6 explained.
3. Finish and test F2/F3 fixes; run `bun test apps/edge` in `C:\ct\tw-fix`; falsify each new test by removing its fix.
4. Ask the laptop session when release 1.2.0 is deployed, then rebase PR 2 and the F2/F3 branch, hand a commit to deploy.
5. Fix the Host-press grace in the test (F6), re-run the failed Host cases alone on a quiet machine.
6. F4 (space in employee ID) and F5 (control delay, >2000 people) are product decisions: raise with the owner in plain words.

## 8. Update after GitHub came back (commit `37a2a2e` "Partial Part 2 and fault results", read by me)

- Part 2 files now on the branch (`results/part2/`), counted by CASE (each failed case prints its FAIL line twice): **m250 16 clean of 17 finished (only #3 failed), m500 10 clean, 2 failed (#21, #24), m1000a 2 clean, 1 failed (#39), m1000c 1 clean**, m1000b none finished yet. The failing check is the same in all four cases: "numbers <= presses stored + 1" (33 numbers/37 presses, 63/69, 65/71, 62/70). Server errors 0, beacon failures 0 in m1000a. Campaigns were still running when pushed; later cases are NOT in git.
- `results/fault/approvals-race-run3.out` **[read]** confirms F3 before the game starts: admit+decline at the same instant, 80 requests: **3 ended "declined" but the person is inside** (`declined/in`). During the game: 0 disagreements in 80 of each kind. admit+admit and decline+decline were always consistent. My fix in `people.ts` removes the cause (the person is inserted only while the request is still "waiting").
- `results/fault/chaosA.out` has only 4 progress lines (t+30..t+120 s, 0 numbers yet): the chaos run was NOT completed; there is no result. `approvals-n800b.out` (rerun) is in the branch, not yet read by me.
