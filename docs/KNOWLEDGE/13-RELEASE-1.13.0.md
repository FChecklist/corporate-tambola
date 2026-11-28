# Release 1.13.0 (28 Nov 2026): claim time option

- New game setting `claimWindow` (1..10, absent = 1 = the old rule: claim before the next number). Chosen by the organizer in step 2 ("How much time does a guest have to press Claim?"), or sent as `claimWindow` on `POST /api/z` and the console save.
- One helper decides everywhere: `claimWindowOf(cfg)` in `packages/beacon/src/config.ts`. The server (`worker.ts` claims route), the phone (`phone-runtime.ts`), `settleAll` and `PrizeEngine` all use it, so all of them agree on who won.
- The words follow the setting: `claimLateText(window)`, `claimRuleText(ties, window)`. Default words are unchanged.
- Not built: 3 tickets, strip of 6 (see CHANGELOG 1.13.0). The checklist's "late/tie message missing" gap was checked in code and is not real (`CLAIM_LATE_TEXT`, `lostClaimLines`).
- Rollback: leave the setting alone (default 1) or redeploy 1.12.0.
