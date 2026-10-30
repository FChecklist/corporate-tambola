# Cloud campaign run 1 (2026-10-30)

Branch head under test: `campaign/usecases-100` @ b8ea5f1. Layer B, local engine on port 8821 (`TEST_MODE=1`), Chromium from Playwright 1.63, bun + node 22. Real site never touched. No code under `tools/` or `apps/` was edited in this branch; the two scratch patches used to run are in `results/cloud-run1/scratch-patches.diff` (applied to a throw-away copy only).

Files: `results/cloud-run1/run1/` (first run, every group), `results/cloud-run1/rerun/` (one repeat of every group that had a failure or error; G7 had none). Each has `results-<G>-B.json` (all checks with evidence), `.md` and the console log.

## Totals (run 1, 100 cases)

| Group | Cases | Pass | Fail | Error | Not implemented |
|---|---|---|---|---|---|
| G1 (compressed) | 12 | 5 | 2 | 0 | 5 |
| G2 | 14 | 8 | 2 | 3 | 1 |
| G3 | 10 | 5 | 2 | 0 | 3 |
| G4 (compressed) | 14 | 3 | 2 | 0 | 9 |
| G5 (compressed) | 18 | 0 | 0 | 6 | 12 |
| G6 | 10 | 4 | 1 | 0 | 5 |
| G7 | 12 | 4 | 0 | 0 | 8 |
| G8 | 10 | 6 | 1 | 1 | 2 |
| **All** | **100** | **35** | **10** | **10** | **45** |

Flakiness: the repeat gave identical results for G1, G3, G4, G5, G6, G8. G2 was repeated with the per-IP limit raised (see blocker 2): G2-11 and G2-12 then passed, and G2-13 moved from error to fail (rerun: 10 pass, 3 fail, 1 not implemented). No flaky case seen.

## Blockers that hit the whole run (driver / setup)

1. **Windows path in `lib.mjs:8`**: `createRequire("C:/ct/ct/dpdp-app/package.json")("playwright")` throws on Linux. `bun test` of the two guard/tool test files: 5 of 11 fail because of it (the meter, tags, refusals, driver and registry tests). With that one line pointed at the global Playwright, all 11 pass. Driver bug. Suggest resolving Playwright by normal `import("playwright")` or an env var.
2. **10 new games per IP per day** (`STARTS_PER_DAY = 10`, `apps/edge/src/worker.ts:123`, keyed by `cf-connecting-ip` or "local"). It is counted in the DB, TEST_MODE does not lift it. A group with more than 10 games stops: G2 UC-G2-11/12/13 error "Too many new engagements from this network today". Driver/setup issue: the driver should send a distinct `cf-connecting-ip` per case, or the local server should lift the limit in TEST_MODE. Not a product bug (the limit is intended).
3. **Stand-in beacon patch does not take effect** (`core.mjs` `PHONE_PATCH`, appended to `zgame.js` through a route). Probe (`results/cloud-run1/beacon-probe.mjs`): phone reaches phase "play", polls `/api/beacon/<chain>/public/latest` on the local server about 6 times a second, but `ZG.PhoneRuntime` in the page is still the original class (no wrapped `verify`), so the signature "aa" is rejected and the call log stays empty. This explains every "numbers seen 0" failure. Driver bug (patch not applied, or ZG export is read-only in the minified bundle). Note the high poll rate is partly the warped timers (x6), but worth a look in the product too.

## Per group: failures and classification

### G1 (compressed)
- UC-G1-01 Automatic start: 3 checks fail (no numbers seen; phones show empty logs; no beat). Cause: blocker 3. Driver bug.
- UC-G1-12 Payment demo: "rehearsal 1 starts" returns 402 `not-paid` "First publish your game and pay. This unlocks your 3 rehearsals." The driver starts the rehearsal before the demo payment. Driver bug (flow order; the publish/pay step is missing or did not complete). Product answer looks correct.
- G1-02, 03, 04, 05, 07 pass. G1-06, 08, 09, 10, 11 not implemented.
- Cleanup note: after G1, three games (UCG101-103) could not be cancelled, 409 `game-running` (started games). Expected.

### G2
- UC-G2-03 Not on the list, Host approves: "the Host sees the request (API)" got `[]`, then the page never turns into a ticket. G2-04 and G2-05 (Co-host, Organizer) pass with the same flow, so only the Host path fails. Likely a driver issue (Host key or waiting-list call), but a **possible product bug** if the Host's pending list is really empty. Needs a manual check. Reproduced on repeat.
- UC-G2-09 Late join: no numbers ever start. Blocker 3. Driver bug.
- UC-G2-11, 12, 13: blocker 2 in run 1. In the repeat G2-11 and G2-12 pass. UC-G2-13 Family pass: both members wait with the right words and the other gets the polite message, but "exactly one family member got in" is `false,false`. The driver clicks `[data-fam="admit"]` with `.catch(() => {})`, so a missed click is silent. Probably driver (selector or timing); possible product bug if the admit button works and nobody gets a ticket. Check by hand.
- G2-01, 02, 04, 05, 06, 07, 08, 10 pass. G2-14 not implemented.

### G3
- UC-G3-01 Host link: the Host accept call returns 403, and the console shows the "Finish setup / Two quick things" screen. The driver expects an already accepted console. Probably driver payload (the accept step needs the e-mail and tick fields the new screen asks for). Reproduced. Low suspicion of a product bug.
- UC-G3-02 Co-host link: whoami, header and role checks pass, but the text check wants "Here is the game" and no "Payment/Prizes you chose". The page shows "Signed in as Co-host ... Your progress 1 of 3 done ... Jump to 1 2 3". Text expectation is out of date for the "new organizer screens". Driver bug. Worth one human look that no organizer section (payment) is visible to a Co-host: the page does show "Rs 0 · nothing to pay".
- G3 other 5 pass; 3 not implemented.

### G4 (compressed)
- UC-G4-01 Automatic timer 12 s: same as G1-01 (blocker 3). Driver bug.
- UC-G4-06 No repeated numbers across 90: game reached 0 numbers. Blocker 3. Driver bug.
- 3 pass, 9 not implemented.

### G5 (compressed): 6 errors, 12 not implemented, 0 pass
- UC-G5-01, 02: `st.anySaw is not a function`. Driver bug (helper missing from the state object).
- UC-G5-03 to 06: `page.goto: Timeout 30000ms exceeded` (every run, each 31 s). After the first two errored cases the pages stop loading. Cause not established: leaked browser contexts from the errored cases keep hitting the server, or the local server stalls. Driver bug most likely, but treat as a **possible server stall** until G5-01/02 are fixed and the group is re-run.

### G6
- UC-G6-05 Host link opens the Host console: same as G3-01. The page is the "Finish setup" screen, the driver expected a console. Driver bug (text/flow).
- 4 pass, 5 not implemented.

### G7
- 4 pass, 0 fail, 8 not implemented.

### G8
- UC-G8-02 Server refusals in plain words: the three API refusals pass. The page check "bad number shows a sentence, never raw data" fails: page text is the join page, no error sentence found. Driver (selector/text) most likely. Possible product bug if the page shows no message at all for a bad number. Check by hand.
- UC-G8-08 Game cancelled by the organizer: waits for `[data-cbc='K4'] input[data-box]` and times out. Driver bug (selector).
- 6 pass, 2 not implemented.

## Product-bug suspects (none confirmed)
1. G2-03: Host's waiting list empty after a not-on-list join (Co-host and Organizer paths work).
2. G2-13: family pass, admit leaves nobody with a ticket.
3. G8-02: no visible message for a bad mobile number on the join page.
4. G5-03..06: page loads time out after earlier errors (probably driver leaks).
5. Minor: phone polls the beacon `latest` about 6 times a second under x6 time.

## Driver bugs, in the order that unblocks most cases
1. `lib.mjs:8` Playwright path. 2. Per-case client IP or TEST_MODE lift of `STARTS_PER_DAY`. 3. `PHONE_PATCH` not applied (unblocks G1-01, G2-09, G4-01, G4-06 and likely much of G5). 4. `st.anySaw` missing (G5-01/02). 5. G1-12 pay before rehearsal. 6. Host/Co-host accept flow and updated page texts (G3-01/02, G6-05). 7. G8-08 selector, G8-02 text, G2-13 admit selector.

Environment notes: Chromium came from `/opt/pw-browsers` (the driver tries `channel: "chrome"`, then falls back); server logs were not committed because they print the organizer key.
