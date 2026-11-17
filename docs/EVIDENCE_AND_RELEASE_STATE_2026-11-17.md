# Evidence and release state (17 Nov 2026)

Notes for the next person or session. Facts only; numbers marked "refresh" must be read again from the ledgers before use.

## What is live
* Corporate Tambola: master `be7e4da` (V2, no Terms change), Pages deployment `b7cf346e-3bc7-44ec-a970-a310ea224ce3`, built 16 Nov 2026 17:28 UTC, version 1.9.0, `dirty: false`. Check `/version.json` on housie.corporatetambola.com.
* Rollback target: Pages deployment `272abe46-f4d7-407e-b351-dfa7dcd7f449` (commit 614f310). Run `deploy/ROLLBACK_V2.sql` (revokes every key with `scope_eid`) BEFORE and again AFTER any Pages rollback.
* Database: migration `apps/edge/migrations/0032_v2_changes.sql` was applied once (14 statements, 0 failed): 3 columns on `organizer_key` (`scope_eid`, `scope_src`, `scope_kind`), `ai_audit.label`, 7 `v2_*` tables, 3 indexes. Backup taken first: full D1 export, 526 MB, 73 tables, kept on the boss laptop (`C:\ct\rel\backup\`, not in git).
* The D1 database has no `d1_migrations` table; migrations are applied by hand, statement by statement (`apply_one_migration.py` skips "already exists").
* Order that matters for any future column change: apply the additive migration first, then deploy the code that reads it.

## How the release went (16 Nov)
1. Step 1: #17 plus CI fix, deployed code-only (c6897f2 to 614f310).
2. Step 3: PR #20 (V2 stack, Terms step dropped by the owner). Merged only after CI was green and the canary run (6 clean games, 0 failures) had finished. Master tree equals the CI-tested tree.
3. PRs #13 and #19 are superseded by #20 and still open: close them.

## Evidence ledger (99.99% programme)
* Rule: n >= ln(1-C)/ln(R). 99.99% at 99.99% = 92,099 failure-free trials per claim; one failure moves it to about 118,000, two to about 140,000. Whole-game claims stay capped at 99.9%.
* Counts are per live commit. Tambola counting restarted at 0 on `be7e4da` (V2). Other games keep their earlier counts (refresh from the ledgers): Snakes 7,170 sessions / 1 failure, Luck 7,610 / 2, Lucky Draw 8,510 / 0, Tic-Tac-Toe 7,420 / 0, Bingo 7,930 / 1. Phase 2 evidence on `c6897f2` (156 cloud + 42 partner clean, 2 failures, 8 ENV) no longer carries over to V2.
* Ledgers: `C:\ct\test-sites\handover\2026-11-02\suite\` (lc cloud, lp partner, lh phone, console*, home*). Rows are never deleted. ENV-ruled rows stay counted and are shown separately. No reclassification without a BOSS ruling. Reports show per lane: clean / ENV-ruled (rule + window) / real failures.
* The 17 Nov 18:00 IST goal is: release verified, frozen version named, harness widened and canaried, lanes counting, a live numbers file. The 92,099 numbers themselves need about 6 to 12 days of lane time.

## Lanes (harness: repo FChecklist/games-t99-cloud, `live/t99.mjs`)
* Cloud (GitHub free, no API credit): workflow `t99.yml`. The input `games` is the GAME NAME list (for example `tambola` or `bingo,snakes,luck,tictactoe`), not a count. A wrong value finishes in seconds with "all cells at target" and plays nothing. Started 17 Nov: Tambola 2 machines x 6 workers, 5 h; a canary for Bingo, Snakes, Luck, Tic-Tac-Toe, 1 machine, 2 h.
* Partner laptop (DESKTOP-F8214LF): reach it with `ssh -i <boss key> raaja@100.75.23.44` (Tailscale); the cable address 192.168.50.2 no longer answers. It has its own internet now. Launcher `C:\dev\smoke10m\live\t99-partner-p2.ps1` (Tambola, 100 and 250 players, 3 workers, BelowNormal). A file `C:\dev\smoke10m\live\t99\STOP` stops new games.
* Lock rule for any heavy run on the partner: create `C:\dev\HEAVY.lock` before, delete it after, wait 2 minutes and look again if it exists. A run that was already going when someone else took the lock was cut off (one game on 17 Nov, never counted). Run in blocks (about 90 min plus finish time), not for days, so other sessions can share the laptop.
* OnePlus phone (adb ONTK95DII7RCFEBY): its runner (`t99-phone.sh`, in Termux proot) was already running (5 workers, all games, Wi-Fi). The start-of-run network check (spec: `PHONE-RUN-SPEC-network-check-2026-11-16.md` in the boss notes) is NOT in the runner yet, because the Termux files cannot be reached over adb; offline rows must be classified by hand until it is.
* Do not start a heavy run on the boss laptop; it has about 0.5 GB free RAM and a limited-data hotspot.

## What remains
* Partner block script `pcycle.sh` (boss scratch) died with the session; restart it or run the launcher by hand under the lock rule.
* Cloud canary for 100- and 250-player games, Lucky Draw lane, HOME robots, CONSOLE defect hunt (202 real-phone failures of 271 before the ruling; a product fix needs its own release).
* Open check: Cloudflare analytics / D1 for 10 Nov 13:55 to 14:05 UTC (two console failure rows).
* Central ledger (Partner Circle D1 `partner-circle`) apply plan is written (`CENTRAL-LEDGER-APPLY-PLAN-2026-11-16.md`); nothing applied. Payments stay as they are until the Moneypenny gate is live. Payments only via IT Services by Rajat Agarwal (Razorpay).
* Optional clean-ups: "23 hours" wording in docs, Terms 3.2 wording, a date comment. R2 replay harness with negative controls and the Resend idempotency header are still unchecked.
