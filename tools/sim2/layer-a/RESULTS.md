# Layer A results (demo-game campaign, 30 Oct 2026)

Local engine (the same Worker code as live, in-memory database per game, fake randomness beacon, test clock), one streamed process. 100 use cases x 10 seeded variants = 1000 free demo games of 10 players, run as 10 batches of 100.

| | |
|---|---|
| Games run | 1000 |
| Players joined | 10000 of 10000 slots (closed-list games keep some waiting by design) |
| Passed first time | 997 |
| Failed first time | 3 (all `checkin: offline`, see below) |
| Passed after the runner fix | 1000 of 1000 |
| Engine bugs found | 0 |
| Checking time | 35.2 minutes, peak memory 191 MB |

By group (first run): G1 120/120, G2 140/140, G3 100/100, G4 139/140, G5 180/180, G6 99/100, G7 119/120, G8 100/100

## The 3 first-run failures (all a runner bug, not an engine bug)
- G6-02 variant 0, seed `A-G6-02-0`: 9200015838: checkin: offline (x6)
- G7-11 variant 30, seed `A-G7-11-30`: 9200007949: checkin: offline (x6)
- G4-13 variant 40, seed `A-G4-13-40`: 9200007959: checkin: offline (x6)

Cause: the runner takes some phones offline for 25 steps on purpose; its fake network throws "offline" and the check-in step counted that as a failure. A real phone simply tries again. Fixed in `run.ts` (an intentional offline window is not a failure). Each seed was then re-run alone 3 times: 9 of 9 passed with identical results each time (not flaky).

## What each game checks
Consent refusal; the cap (an 11th phone is turned away once all 10 seats are taken); every phone's number log is 1 to 90 with no repeat and equals the reference sequence; all phones agree on the winners; at least one prize was won; approvals in list-only games (the organizer lets people in); the game log is readable; after the 24 h erase no participant or person rows remain and the log is still readable; no crash.

## Not covered yet (needs the real catalogue and more runner work)
Host-called and manual-start games; the individual claim paths (wrong, late, taken, two prizes on one number); family, Co-host and personal links; Super Bumper and Lucky Draw result detail (they are configured and the game must complete); rehearsals; rate limits. Layers B and C cover real browsers and the real site.

Raw results: `C:\ct\test-sites\data\campaign\layer-a-results.json` and the batch files `layer-a-batch-N.jsonl`.
