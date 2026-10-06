# End-to-end findings (2026-10-06) - PARTIAL RUN

Method: Playwright (system Chrome) + bun time-travel tests against the real Worker code. **The real site was never switched to TEST mode and no live write was made** (the session was closed before the live run); site verified LIVE, purge-test-data deleted 0 records. All defects below were reproduced on the local stand-in or in-process (same code that is deployed). No product code was changed.

Runs: API security/isolation 21 cases (20 pass, 1 fail: SEC-11b); inputs 24 cases (19 pass, 5 fail: INP-02b, INP-05b, INP-06, INP-08b, INP-14); public pages 13 cases (11 pass; PUB-11 fail, PUB-09 fixed after run); game with 6 phones (GM-01..10 pass, GM-11..13 failed/not diagnosed); time travel 36 cases (23 pass, 13 fail, see tests/e2e/results/timetravel.jsonl). Local-run logs were lost when results moved; re-run to regenerate docs/E2E_TEST_CASES.md.

| ID | Sev | Defect | Repro case | Root cause |
|---|---|---|---|---|
| F-01 | **High** | Anyone in a game can forge the winners. Votes are authorised by ticket id only, ticket ids are public (`/seats`), so one phone posts 3 votes (quorum) as other tickets and a fake "full house" is settled; honest later votes are ignored. | TT-01, TT-02 | apps/edge/src/winners.ts acceptVotes (~l.31-61): no device proof, first settled result wins |
| F-03 | **High** | One address can burn the shared daily 80,000-write allowance with duplicate votes/claims/over posts (3-4 writes each, no per-address limit); then every customer's joins and votes get 503. | TT-03,04,05 | winners.ts l.48 spend() before INSERT OR IGNORE; worker.ts claims l.1002; acceptOver |
| F-04 | Med | Double charge risk: two simultaneous payments for one draft both succeed; verify+webhook racing sends two receipts and returns an invoice link that does not exist. | TT-09, 14, 15 | pay.ts fulfil() not atomic; checkout checks pack=0 only at order time |
| F-10 | Med | 250 colleagues on one office address: only 200 can join per minute (1,500/day) then 429. | TT-06 | worker.ts joinOverLimit |
| F-08 | Med | No upper limit on start time: a game dated 2100 keeps participants' names and numbers forever (23 h / 365 d clocks never start). | INP-02b, TT-22 | POST /api/z accepts any integer startRound |
| F-02 | Low | Co-host key can file pause/stop/erase requests. | SEC-11b | control routes run before HOST_ACTIONS gate |
| F-05 | Low | /api/start reveals whether an e-mail has an account (`exists:true`). | INP-06 | worker.ts /api/start |
| F-06 | Med | Schedule helper reads a time with no zone in server zone (UTC on Cloudflare = 5.5 h shift) and silently turns 30 Feb into 2 Mar. | INP-14 | Date.parse leniency in /api/z/schedule |
| F-07 | Low | Sign-up accepts `a@x..com` and `<script>@x.com`. | INP-05b | weak e-mail regex |
| F-09 | Low | Body over 4 KB gives misleading errors ("Enter a valid mobile number"). | INP-08b | body() returns null |
| F-11 | Low | lifecycleTick looks at 25 engagements; 25+ legal holds starve other deletions. | TT-21 | lifecycle.ts LIMIT 25 |
| F-12 | Low | Organizer e-mail/account kept after last engagement deleted although site says organizer details go after 365 days. | TT-24 | purgeOld |
| F-13 | Low | Theme dots are 11 px tall (tap target). | PUB-11 | site.css |
| G4 | Med | Announce/pause reach phones only after the organizer's console registered its key. | TT-34 (GM-07 passes with console open) | known gap |

Not diagnosed: GM-11 (brand break + lucky draw seen on phone) failed after 4.9 min, GM-12/13 failed instantly (likely follow-on); needs re-run with output (log /tmp/game1.log lost).

## Deploy advice
Nothing deployed. Fix F-01 first (require device proof in vote, or server verifies against beacon numbers), then F-03 (check "already voted/claimed" before spend, per-address cap), F-04, F-08.

## NOT RUN (resume here)
Live run (`node tests/e2e/run-live.mjs`), live game with real beacon, PUB-* on live (incl. real CSP for break media), VIS-*, PTR-*, CRD-* (specs 05, 06 written, never executed), crowd sim CRD-10/11 (timetravel/12), TT-12/13/16-20/23/25-33/35/36 partly run (pass), console UI beyond GM-01, report PDF (GM-14), shred in browser, final audit-chain check on live.
