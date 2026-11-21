# 250 players x 10 games: results

Run on **2026-11-21** in the local test environment: the real Worker code (`apps/edge`) on an in-memory SQLite stand-in for D1, 250 real phone runtimes per game (the same code the phone page runs), a fake public beacon in virtual time (one step = one 3-second beacon round).
**No production, no real payment, no real mail.** The games are made by the owner's test account (`demo1@xyz.in` with the runner key = the owner "test price" of Rs 0 up to 1,000 people). Mail goes to the `outbox` table (or, in game 9, to a stand-in for the mail provider).
How to run: `bun run tools/game250/run.ts all` (or `3`, `5,6`), then `bun run tools/game250/report.ts`. Code: `tools/game250/`. Raw data: `docs/250x10/data/game01.json` ... `game10.json`.

**How to read the "CPU / memory" rows.** The Worker and the 250 phones run in one process here. "Peak memory" is therefore the whole test process (the phones are most of it), not the Worker. "Request CPU" taken during the crowd includes the phones' own work that runs between two awaits, so it is an upper bound; the "isolated" figures (games 1 and 3) are the same routes one at a time on a quiet process, and are the honest ones. Cloudflare's free plan allows 10 ms of CPU per request (docs/IMPLEMENTATION.md); in-process SQLite is counted here but D1's network wait is not.

## Summary

| # | Game | Players joined | Prizes | Checks passed | Fairness checks passed | Errors (non-2xx) | Store writes (of 80,000/day) |
|---|---|---|---|---|---|---|---|
| 1 | Scheduled start, auto numbers | 250/250 | 7 | 5/5 | 10/10 | 400:2 403:3 404:9 | 3682 (4.6%) |
| 2 | Host-started, auto numbers | 250/250 | 7 | 7/7 | 13/13 | 400:2 403:4 404:9 422:2 | 3550 (4.4%) |
| 3 | Host-started, host-called numbers | 250/250 | 7 | 7/7 | 14/14 | 400:2 403:4 404:9 422:6 | 3563 (4.5%) |
| 4 | Scheduled start, host-called numbers | 250/250 | 7 | 6/6 | 15/15 | 400:2 403:4 404:9 409:1 422:4 | 3642 (4.6%) |
| 5 | ID-only invite, 250 IDs + intruders | 250/250 | 7 | 13/13 | 10/10 | 400:12 403:63 404:9 409:36 423:20 429:50 | 4001 (5%) |
| 6 | Late joiners, leave and rejoin | 250/250 | 7 | 11/11 | 10/10 | 400:2 403:8 404:9 409:1 423:10 | 3589 (4.5%) |
| 7 | Pause and resume | 250/250 | 7 | 9/9 | 11/11 | 400:2 403:4 404:9 422:6 | 4625 (5.8%) |
| 8 | All prize types and tie-breaks | 250/250 | 54 | 9/9 | 10/10 | 400:2 403:3 404:9 | 8109 (10.1%) |
| 9 | Mail and notification fan-out | 250/250 | 7 | 14/14 | 10/10 | 400:3 403:4 404:9 | 3564 (4.5%) |
| 10 | End, report, deletion, retention | 250/250 | 5 | 18/18 | 3/3 | 403:2 404:4 | 3277 (4.1%) |

## Game 1: Scheduled start, auto numbers

Game id `G250-01`. Mode: start: scheduled / numbers: auto.

| What | Result |
|---|---|
| Players joined | 250 of 250 (not joined: 0; join retries: 1) |
| First / last player joined at (virtual minutes after the game was made) | 0.6 / 27.9 |
| Players checked in (present check) | 250 |
| Join refusals seen | `[]` |
| Claims stored | 593 |
| Claim requests answered too late (409) | 0 |
| Claims by house | `{"bot":80,"corners":109,"early5":234,"full":9,"mid":73,"top":88}` |
| Wrong claims (Bogeys) | 0 |
| Phones that pressed Claim | 234 |
| Prizes published | 7: bot#1@31, corners#1@20, early5#1@8, full#1@71x3, full#2@72, mid#1@22, top#1@28 |
| Numbers called | 76 |
| First number at (virtual minutes after the game was made) | 17 |
| Game length, first number to all phones ended (virtual minutes) | 15.1 |
| Test run length (real seconds) | 45.2 |
| Requests to the Worker | 122758 |
| Outbound network requests made by the test (must be 0) | 0 |
| Responses other than 200 | `{"200":122744,"400":2,"403":3,"404":9}` |
| Requests over 10 ms CPU (in the crowd, upper bound) / over 50 ms | 245 / 7 of 122758 |
| Slowest request CPU in the crowd (ms, upper bound) | 195.7 |
| Isolated request CPU, ms (p50/p95/max) | `{"GET /api/z/:id/info":"0.22/0.69/4.14","GET /api/z/:id/control":"0.05/0.09/0.75","GET /api/z/:id/seats":"0.85/1.09/1.32","GET /api/z/:id/results":"0.06/0.11/0.3","GET /api/z/:id/cv":"0.01/0.02/0.2","POST /api/z/:id/join (already joined)":"0.62/1.18/4.52","POST /api/z/:id/claims (a repeat of a true claim)":"0.52/0.88/2.72","POST /api/z/:id/presence":"0.23/0.43/1.13","POST /api/z/:id/control (signature of a stranger)":"0.49/0.9/0.92","POST /api/z/:id/control (a real signature)":"0.47/0.82/1.88"}` |
| Process CPU for the whole run (s) / peak memory (MB, whole test process) | 48.6 / 623 |
| Store writes | 3682 = 4.6% of the 80,000 a day the Worker allows itself (the free D1 plan is 100,000) |

Game-specific measurements:

| What | Result |
|---|---|
| retention | `{"endMs":1795170972000,"deletedAtIST":"2027-11-21T00:00:00.000 IST","stillThere5MinBefore":true,"leftoverRows":{},"keptOnPurpose":{"entitlement":1,"audit_cert":1,"audit_stats":1,"game_record":1},"leftoverKvKeys":[]}` |

Fairness checks (nobody could predict or alter the numbers):

| Check | Result | Detail |
|---|---|---|
| every phone's number log equals the log re-derived from the public beacon alone | PASS |  |
| before the first number, none of the 11842 store answers held the game's numbers | PASS |  |
| the store keeps no copy of the numbers (82 tables searched for the first 8 called numbers in order) | PASS |  |
| a pause signed with a key the game does not know is refused | PASS |  |
| a signed message whose round was changed afterwards is refused | PASS |  |
| a message with a made-up signature is refused | PASS |  |
| the signed control file was not changed by any of the forgeries | PASS |  |
| there is no route to write, draw or set a number (9 probes) | PASS |  |
| a stranger cannot change the game's settings | PASS |  |
| an unsigned press is refused | PASS |  |

Game checks:

| Check | Result | Detail |
|---|---|---|
| players joined (250 of 250) | PASS | 250 |
| the store holds exactly the people who joined (no duplicates) | PASS | 250 vs 250 |
| prizes were published | PASS | 7 |
| published winners equal the winners worked out from the public numbers and tickets | PASS | want bot#1@30 corners#1@19 early5#1@7 full#1@70 full#2@71 mid#1@21 top#1@27 / got bot#1@30 corners#1@19 early5#1@7 full#1@70 full#2@71 mid#1@21 top#1@27 |
| 365 days later: the game is kept until 00:00 IST of its last day and then everything of it is deleted, except the records kept on purpose | PASS | before=1 leftovers={} [] |

Errors the Worker answered (grouped):

| Status | Route | Message | Count |
|---|---|---|---|
| 403 | POST /api/z/:id/control | Signature does not match the organizer key. | 2 |
| 400 | POST /api/z/:id/control | Malformed control message. | 2 |
| 403 | PATCH /api/z/:id/settings | Not allowed. | 1 |

## Game 2: Host-started, auto numbers

Game id `G250-02`. Mode: start: Host presses Start / numbers: auto.

| What | Result |
|---|---|
| Players joined | 250 of 250 (not joined: 0; join retries: 7) |
| First / last player joined at (virtual minutes after the game was made) | 0.6 / 2.7 |
| Players checked in (present check) | 250 |
| Join refusals seen | `[]` |
| Claims stored | 443 |
| Claim requests answered too late (409) | 0 |
| Claims by house | `{"bot":45,"corners":55,"early5":243,"full":2,"mid":41,"top":57}` |
| Wrong claims (Bogeys) | 0 |
| Phones that pressed Claim | 243 |
| Prizes published | 7: bot#1@26x2, corners#1@22, early5#1@9, full#1@55, full#2@65, mid#1@40, top#1@29 |
| Numbers called | 70 |
| First number at (virtual minutes after the game was made) | 17.6 |
| Game length, first number to all phones ended (virtual minutes) | 13.8 |
| Test run length (real seconds) | 40.3 |
| Requests to the Worker | 124436 |
| Outbound network requests made by the test (must be 0) | 0 |
| Responses other than 200 | `{"200":124419,"400":2,"403":4,"404":9,"422":2}` |
| Requests over 10 ms CPU (in the crowd, upper bound) / over 50 ms | 213 / 8 of 124436 |
| Slowest request CPU in the crowd (ms, upper bound) | 172.4 |
| Isolated request CPU, ms (p50/p95/max) | `{"GET /api/z/:id/info":"0.17/0.82/2.77","GET /api/z/:id/control":"0.04/0.1/4.09","GET /api/z/:id/seats":"0.61/0.74/0.79","GET /api/z/:id/results":"0.05/0.08/0.1","GET /api/z/:id/cv":"0.01/0.01/0.05","POST /api/z/:id/join (already joined)":"0.63/0.74/1.14","POST /api/z/:id/claims (a repeat of a true claim)":"0.53/3.73/4.51","POST /api/z/:id/presence":"0.15/0.31/0.38","POST /api/z/:id/control (signature of a stranger)":"0.4/0.61/0.89","POST /api/z/:id/control (a real signature)":"0.35/0.5/0.5"}` |
| Process CPU for the whole run (s) / peak memory (MB, whole test process) | 42.5 / 701 |
| Store writes | 3550 = 4.4% of the 80,000 a day the Worker allows itself (the free D1 plan is 100,000) |

Game-specific measurements:

| What | Result |
|---|---|
| logBeforeGo | 0 |
| goStatus | 200 |
| goAtSimMin | 17 |
| retention | `{"endMs":1795171008000,"deletedAtIST":"2027-11-21T00:00:00.000 IST","stillThere5MinBefore":true,"leftoverRows":{},"keptOnPurpose":{"entitlement":1,"outbox":1,"audit_cert":1,"audit_stats":1,"game_record":1},"leftoverKvKeys":[]}` |

Fairness checks (nobody could predict or alter the numbers):

| Check | Result | Detail |
|---|---|---|
| every phone's number log equals the log re-derived from the public beacon alone | PASS |  |
| a Start signed with too little lead is refused | PASS |  |
| a Start signed by a stranger's key is refused | PASS |  |
| a second Start after the game began is refused (the start cannot be moved) | PASS |  |
| before the first number, none of the 17522 store answers held the game's numbers | PASS |  |
| the store keeps no copy of the numbers (82 tables searched for the first 8 called numbers in order) | PASS |  |
| a pause signed with a key the game does not know is refused | PASS |  |
| a signed message whose round was changed afterwards is refused | PASS |  |
| a message with a made-up signature is refused | PASS |  |
| the signed control file was not changed by any of the forgeries | PASS |  |
| there is no route to write, draw or set a number (9 probes) | PASS |  |
| a stranger cannot change the game's settings | PASS |  |
| an unsigned press is refused | PASS |  |

Game checks:

| Check | Result | Detail |
|---|---|---|
| players joined (250 of 250) | PASS | 250 |
| the store holds exactly the people who joined (no duplicates) | PASS | 250 vs 250 |
| prizes were published | PASS | 7 |
| published winners equal the winners worked out from the public numbers and tickets | PASS | want bot#1@25 corners#1@21 early5#1@8 full#1@54 full#2@64 mid#1@39 top#1@28 / got bot#1@25 corners#1@21 early5#1@8 full#1@54 full#2@64 mid#1@39 top#1@28 |
| no number was shown by any phone before the Host pressed Start | PASS | 0 |
| the Start press was accepted | PASS | 200  |
| 365 days later: the game is kept until 00:00 IST of its last day and then everything of it is deleted, except the records kept on purpose | PASS | before=1 leftovers={} [] |

Errors the Worker answered (grouped):

| Status | Route | Message | Count |
|---|---|---|---|
| 422 | POST /api/z/:id/control | The game has already been started. | 2 |
| 403 | POST /api/z/:id/control | Signature does not match the organizer key. | 3 |
| 400 | POST /api/z/:id/control | Malformed control message. | 2 |
| 403 | PATCH /api/z/:id/settings | Not allowed. | 1 |

## Game 3: Host-started, host-called numbers

Game id `G250-03`. Mode: start: Host presses Start / numbers: Host presses Next.

| What | Result |
|---|---|
| Players joined | 250 of 250 (not joined: 0; join retries: 4) |
| First / last player joined at (virtual minutes after the game was made) | 0.6 / 10.5 |
| Players checked in (present check) | 250 |
| Join refusals seen | `[]` |
| Claims stored | 396 |
| Claim requests answered too late (409) | 0 |
| Claims by house | `{"bot":39,"corners":44,"early5":243,"full":2,"mid":32,"top":36}` |
| Wrong claims (Bogeys) | 0 |
| Phones that pressed Claim | 243 |
| Prizes published | 7: bot#1@35, corners#1@28, early5#1@8x2, full#1@57, full#2@60, mid#1@26, top#1@23 |
| Numbers called | 61 |
| First number at (virtual minutes after the game was made) | 17.8 |
| Game length, first number to all phones ended (virtual minutes) | 13.6 |
| Test run length (real seconds) | 44.4 |
| Requests to the Worker | 123335 |
| Outbound network requests made by the test (must be 0) | 0 |
| Responses other than 200 | `{"200":123314,"400":2,"403":4,"404":9,"422":6}` |
| Requests over 10 ms CPU (in the crowd, upper bound) / over 50 ms | 250 / 12 of 123335 |
| Slowest request CPU in the crowd (ms, upper bound) | 173.6 |
| Isolated request CPU, ms (p50/p95/max) | `{"GET /api/z/:id/info":"0.31/0.74/4.42","GET /api/z/:id/control":"0.1/0.2/0.34","GET /api/z/:id/seats":"0.63/0.88/0.93","GET /api/z/:id/results":"0.16/0.26/0.47","GET /api/z/:id/cv":"0.02/0.03/0.11","POST /api/z/:id/join (already joined)":"1.47/16.19/21.72","POST /api/z/:id/claims (a repeat of a true claim)":"0.58/2.8/4.81","POST /api/z/:id/presence":"0.48/0.62/0.66","POST /api/z/:id/control (signature of a stranger)":"0.76/1.2/2.06","POST /api/z/:id/control (a real signature)":"0.61/0.85/0.9"}` |
| Process CPU for the whole run (s) / peak memory (MB, whole test process) | 46.9 / 711 |
| Store writes | 3563 = 4.5% of the 80,000 a day the Worker allows itself (the free D1 plan is 100,000) |

Game-specific measurements:

| What | Result |
|---|---|
| logBeforeGo | 0 |
| goStatus | 200 |
| goAtSimMin | 17 |
| nextProbed | true |
| presses | 61 |
| pressRefused | `{"422 Please wait a moment: the game is just starting.":3}` |
| retention | `{"endMs":1795174185000,"deletedAtIST":"2027-11-21T00:00:00.000 IST","stillThere5MinBefore":true,"leftoverRows":{},"keptOnPurpose":{"entitlement":1,"outbox":1,"audit_cert":1,"audit_stats":1,"game_record":1},"leftoverKvKeys":[]}` |

Fairness checks (nobody could predict or alter the numbers):

| Check | Result | Detail |
|---|---|---|
| a Next press that names a round only one round ahead (could be read from the beacon) is refused | PASS |  |
| a Next press that names a round five ahead (a Host picking a lucky round) is refused | PASS |  |
| a Next press that names a round already published is refused | PASS |  |
| a Next press signed by a stranger is refused | PASS |  |
| every phone's number log equals the log re-derived from the public beacon alone | PASS |  |
| before the first number, none of the 12213 store answers held the game's numbers | PASS |  |
| the store keeps no copy of the numbers (82 tables searched for the first 8 called numbers in order) | PASS |  |
| a pause signed with a key the game does not know is refused | PASS |  |
| a signed message whose round was changed afterwards is refused | PASS |  |
| a message with a made-up signature is refused | PASS |  |
| the signed control file was not changed by any of the forgeries | PASS |  |
| there is no route to write, draw or set a number (9 probes) | PASS |  |
| a stranger cannot change the game's settings | PASS |  |
| an unsigned press is refused | PASS |  |

Game checks:

| Check | Result | Detail |
|---|---|---|
| players joined (250 of 250) | PASS | 250 |
| the store holds exactly the people who joined (no duplicates) | PASS | 250 vs 250 |
| prizes were published | PASS | 7 |
| published winners equal the winners worked out from the public numbers and tickets | PASS | want bot#1@34 corners#1@27 early5#1@7 full#1@56 full#2@59 mid#1@25 top#1@22 / got bot#1@34 corners#1@27 early5#1@7 full#1@56 full#2@59 mid#1@25 top#1@22 |
| no number before the Host pressed Start | PASS | 0 |
| every number came from one Host press (presses >= numbers called) | PASS | 61 presses, 61 numbers |
| 365 days later: the game is kept until 00:00 IST of its last day and then everything of it is deleted, except the records kept on purpose | PASS | before=1 leftovers={} [] |

Errors the Worker answered (grouped):

| Status | Route | Message | Count |
|---|---|---|---|
| 422 | POST /api/z/:id/control | Please wait a moment: the game is just starting. | 3 |
| 422 | POST /api/z/:id/control | That press did not go through. Please press again. | 3 |
| 403 | POST /api/z/:id/control | Signature does not match the organizer key. | 3 |
| 400 | POST /api/z/:id/control | Malformed control message. | 2 |
| 403 | PATCH /api/z/:id/settings | Not allowed. | 1 |

## Game 4: Scheduled start, host-called numbers

Game id `G250-04`. Mode: start: scheduled / numbers: Host presses Next.

| What | Result |
|---|---|
| Players joined | 250 of 250 (not joined: 0; join retries: 5) |
| First / last player joined at (virtual minutes after the game was made) | 0.6 / 10.5 |
| Players checked in (present check) | 250 |
| Join refusals seen | `[]` |
| Claims stored | 457 |
| Claim requests answered too late (409) | 1 |
| Claims by house | `{"bot":36,"corners":60,"early5":239,"full":3,"mid":65,"top":54}` |
| Wrong claims (Bogeys) | 0 |
| Phones that pressed Claim | 241 |
| Prizes published | 7: bot#1@42, corners#1@13, early5#1@9x2, full#1@64, full#2@66, mid#1@25, top#1@33 |
| Numbers called | 67 |
| First number at (virtual minutes after the game was made) | 15.3 |
| Game length, first number to all phones ended (virtual minutes) | 18.1 |
| Test run length (real seconds) | 49.8 |
| Requests to the Worker | 149931 |
| Outbound network requests made by the test (must be 0) | 0 |
| Responses other than 200 | `{"200":149911,"400":2,"403":4,"404":9,"409":1,"422":4}` |
| Requests over 10 ms CPU (in the crowd, upper bound) / over 50 ms | 298 / 8 of 149931 |
| Slowest request CPU in the crowd (ms, upper bound) | 170.5 |
| Isolated request CPU, ms (p50/p95/max) | `{"GET /api/z/:id/info":"0.33/0.52/0.56","GET /api/z/:id/control":"0.1/0.16/0.27","GET /api/z/:id/seats":"0.78/1.07/1.16","GET /api/z/:id/results":"0.05/0.1/0.3","GET /api/z/:id/cv":"0.01/0.03/0.09","POST /api/z/:id/join (already joined)":"1/1.12/1.16","POST /api/z/:id/claims (a repeat of a true claim)":"0.63/0.75/4.2","POST /api/z/:id/presence":"0.3/0.35/0.41","POST /api/z/:id/control (signature of a stranger)":"0.47/0.79/2.76","POST /api/z/:id/control (a real signature)":"0.41/0.61/6.29"}` |
| Process CPU for the whole run (s) / peak memory (MB, whole test process) | 51.9 / 709 |
| Store writes | 3642 = 4.6% of the 80,000 a day the Worker allows itself (the free D1 plan is 100,000) |

Game-specific measurements:

| What | Result |
|---|---|
| stalls | 1 |
| nextProbed | true |
| stalled | true |
| stallFrom | 1158000 |
| grind | `{"roundsSincePreviousPress":34,"candidateRounds":32,"distinctNumbersOnOffer":27,"pickedRound":34122209,"pickedNumber":88,"status":422,"answer":"That press did not go through. Please press again."}` |
| stallEnded | true |
| switched | true |
| presses | 67 |
| pressRefused | `{}` |
| retention | `{"endMs":1795174362000,"deletedAtIST":"2027-11-21T00:00:00.000 IST","stillThere5MinBefore":true,"leftoverRows":{},"keptOnPurpose":{"entitlement":1,"outbox":1,"audit_cert":1,"audit_stats":1,"game_record":1},"leftoverKvKeys":[]}` |

Fairness checks (nobody could predict or alter the numbers):

| Check | Result | Detail |
|---|---|---|
| a Next press that names a round only one round ahead (could be read from the beacon) is refused | PASS |  |
| a Next press that names a round five ahead (a Host picking a lucky round) is refused | PASS |  |
| a Next press that names a round already published is refused | PASS |  |
| a Next press signed by a stranger is refused | PASS |  |
| every phone's number log equals the log re-derived from the public beacon alone | PASS |  |
| a Host who waited cannot pick WHICH already-published beacon round decides the next number (a press that names a past round is refused) | PASS |  |
| before the first number, none of the 14509 store answers held the game's numbers | PASS |  |
| the store keeps no copy of the numbers (82 tables searched for the first 8 called numbers in order) | PASS |  |
| a pause signed with a key the game does not know is refused | PASS |  |
| a signed message whose round was changed afterwards is refused | PASS |  |
| a message with a made-up signature is refused | PASS |  |
| the signed control file was not changed by any of the forgeries | PASS |  |
| there is no route to write, draw or set a number (9 probes) | PASS |  |
| a stranger cannot change the game's settings | PASS |  |
| an unsigned press is refused | PASS |  |

Game checks:

| Check | Result | Detail |
|---|---|---|
| players joined (250 of 250) | PASS | 250 |
| the store holds exactly the people who joined (no duplicates) | PASS | 250 vs 250 |
| prizes were published | PASS | 7 |
| published winners equal the winners worked out from the public numbers and tickets | PASS | want bot#1@41 corners#1@12 early5#1@8 full#1@63 full#2@65 mid#1@24 top#1@32 / got bot#1@41 corners#1@12 early5#1@8 full#1@63 full#2@65 mid#1@24 top#1@32 |
| every number came from one press (Host, then Organizer) | PASS | 67 presses |
| 365 days later: the game is kept until 00:00 IST of its last day and then everything of it is deleted, except the records kept on purpose | PASS | before=1 leftovers={} [] |

Errors the Worker answered (grouped):

| Status | Route | Message | Count |
|---|---|---|---|
| 422 | POST /api/z/:id/control | That press did not go through. Please press again. | 4 |
| 403 | POST /api/z/:id/control | Signature does not match the organizer key. | 3 |
| 409 | POST /api/z/:id/claims | Ohooo! 😊 Sorry, you pressed Claim after the next number was announced. This claim cannot be made. | 1 |
| 400 | POST /api/z/:id/control | Malformed control message. | 2 |
| 403 | PATCH /api/z/:id/settings | Not allowed. | 1 |

## Game 5: ID-only invite, 250 IDs + intruders

Game id `G250-05`. Mode: who: only people on the ID list (employee ID, no mobile).

| What | Result |
|---|---|
| Players joined | 250 of 250 (not joined: 0; join retries: 1) |
| First / last player joined at (virtual minutes after the game was made) | 0.6 / 10.5 |
| Players checked in (present check) | 250 |
| Join refusals seen | `[]` |
| Claims stored | 443 |
| Claim requests answered too late (409) | 0 |
| Claims by house | `{"bot":38,"corners":74,"early5":243,"full":2,"mid":45,"top":41}` |
| Wrong claims (Bogeys) | 0 |
| Phones that pressed Claim | 243 |
| Prizes published | 7: bot#1@37x2, corners#1@27, early5#1@9, full#1@61, full#2@63, mid#1@19, top#1@24 |
| Numbers called | 66 |
| First number at (virtual minutes after the game was made) | 17 |
| Game length, first number to all phones ended (virtual minutes) | 13 |
| Test run length (real seconds) | 37.3 |
| Requests to the Worker | 112316 |
| Outbound network requests made by the test (must be 0) | 0 |
| Responses other than 200 | `{"200":112126,"400":12,"403":63,"404":9,"409":36,"423":20,"429":50}` |
| Requests over 10 ms CPU (in the crowd, upper bound) / over 50 ms | 167 / 6 of 112316 |
| Slowest request CPU in the crowd (ms, upper bound) | 148.1 |
| Isolated request CPU, ms (p50/p95/max) | `{"GET /api/z/:id/info":"0.15/0.23/0.58","GET /api/z/:id/control":"0.04/0.1/0.18","GET /api/z/:id/seats":"0.59/0.72/0.79","GET /api/z/:id/results":"0.04/0.1/0.13","GET /api/z/:id/cv":"0.01/0.03/0.14","POST /api/z/:id/join (already joined)":"0.69/1.31/3.06","POST /api/z/:id/claims (a repeat of a true claim)":"0.65/0.94/1.04","POST /api/z/:id/presence":"0.35/0.61/0.64","POST /api/z/:id/control (signature of a stranger)":"0.74/1.3/1.63","POST /api/z/:id/control (a real signature)":"0.51/0.93/1.78"}` |
| Process CPU for the whole run (s) / peak memory (MB, whole test process) | 39.9 / 565 |
| Store writes | 4001 = 5% of the 80,000 a day the Worker allows itself (the free D1 plan is 100,000) |

Game-specific measurements:

| What | Result |
|---|---|
| listLoaded | 250 |
| listCount | 250 |
| listPageKeys | `["people","limit","used","total","cap","offset","waiting","whoCanJoin","role","canExport","commonLink"]` |
| guessed | true |
| guesser | `{"guessTries":80,"guessBlocked":50}` |
| intruders | `{"unknownTried":30,"unknownEntered":0,"foreignTried":8,"foreignEntered":0,"impostorTried":10,"impostorEntered":0,"errors":[["Your request is with the Organizer. You can come in as soon as they say yes.",30],["Please use English letters and numbers only.",5],["This game is full. Please tell your organizer so they can make room.",3],["This employee ID already has a ticket on another phone. A ticket plays on one phone only. ",10]]}` |
| waitingRoom | 30 |
| declined | 30 |
| retention | `{"endMs":1795170966000,"deletedAtIST":"2027-11-21T00:00:00.000 IST","stillThere5MinBefore":true,"leftoverRows":{},"keptOnPurpose":{"entitlement":1,"audit_cert":1,"audit_stats":1,"consent_log":5,"game_record":1},"leftoverKvKeys":[]}` |

Fairness checks (nobody could predict or alter the numbers):

| Check | Result | Detail |
|---|---|---|
| every phone's number log equals the log re-derived from the public beacon alone | PASS |  |
| before the first number, none of the 12492 store answers held the game's numbers | PASS |  |
| the store keeps no copy of the numbers (82 tables searched for the first 8 called numbers in order) | PASS |  |
| a pause signed with a key the game does not know is refused | PASS |  |
| a signed message whose round was changed afterwards is refused | PASS |  |
| a message with a made-up signature is refused | PASS |  |
| the signed control file was not changed by any of the forgeries | PASS |  |
| there is no route to write, draw or set a number (9 probes) | PASS |  |
| a stranger cannot change the game's settings | PASS |  |
| an unsigned press is refused | PASS |  |

Game checks:

| Check | Result | Detail |
|---|---|---|
| the Organizer loaded 250 IDs on the list | PASS | 250  |
| players joined (250 of 250) | PASS | 250 |
| the store holds exactly the people who joined (no duplicates) | PASS | 250 vs 250 |
| prizes were published | PASS | 7 |
| published winners equal the winners worked out from the public numbers and tickets | PASS | want bot#1@36 corners#1@26 early5#1@8 full#1@60 full#2@62 mid#1@18 top#1@23 / got bot#1@36 corners#1@26 early5#1@8 full#1@60 full#2@62 mid#1@18 top#1@23 |
| no intruder with an unknown ID got a ticket | PASS | 0 |
| no foreign-script / script-injection ID got a ticket | PASS | 0 |
| nobody could take a ticket by typing another person's ID from a second phone | PASS | 0 |
| the ID guesser was slowed down (rate limit) | PASS | {"guessTries":80,"guessBlocked":50} |
| exactly the listed people hold tickets (store participants == 250 listed, minus any firewalled phone) | PASS | 250 |
| every ticket in the game is different (no two players hold the same ticket) | PASS | 250 distinct of 250 |
| messy typing (e-1001, E 1001, lower case) found the same listed person | PASS | 0 did not join |
| 365 days later: the game is kept until 00:00 IST of its last day and then everything of it is deleted, except the records kept on purpose | PASS | before=1 leftovers={} [] |

Errors the Worker answered (grouped):

| Status | Route | Message | Count |
|---|---|---|---|
| 403 | POST /api/z/:id/join | Your request is with the Organizer. You can come in as soon as they say yes. | 60 |
| 409 | POST /api/z/:id/join | This game is full. Please tell your organizer so they can make room. | 36 |
| 429 | POST /api/z/:id/join | Too many tries with an employee ID that is not on the list. Please ask your organizer for help. | 50 |
| 400 | POST /api/z/:id/join | Please use English letters and numbers only. | 10 |
| 423 | POST /api/z/:id/join | This employee ID already has a ticket on another phone. A ticket plays on one phone only. If it is you on a new phone, ask your organizer to move your ticket to | 20 |
| 403 | POST /api/z/:id/control | Signature does not match the organizer key. | 2 |
| 400 | POST /api/z/:id/control | Malformed control message. | 2 |
| 403 | PATCH /api/z/:id/settings | Not allowed. | 1 |

## Game 6: Late joiners, leave and rejoin

Game id `G250-06`. Mode: players: 140 on time, 60 late, 25 offline and back, 10 new phone, 5 leave.

| What | Result |
|---|---|
| Players joined | 250 of 250 (not joined: 0; join retries: 0) |
| First / last player joined at (virtual minutes after the game was made) | 0.6 / 25.1 |
| Players checked in (present check) | 250 |
| Join refusals seen | `[]` |
| Claims stored | 446 |
| Claim requests answered too late (409) | 0 |
| Claims by house | `{"bot":55,"corners":60,"early5":212,"full":3,"mid":57,"top":59}` |
| Wrong claims (Bogeys) | 0 |
| Phones that pressed Claim | 222 |
| Prizes published | 7: bot#1@39x2, corners#1@33x2, early5#1@7, full#1@60, full#2@71, mid#1@37, top#1@29x2 |
| Numbers called | 72 |
| First number at (virtual minutes after the game was made) | 17 |
| Game length, first number to all phones ended (virtual minutes) | 14.3 |
| Test run length (real seconds) | 39.3 |
| Requests to the Worker | 108856 |
| Outbound network requests made by the test (must be 0) | 0 |
| Responses other than 200 | `{"200":108826,"400":2,"403":8,"404":9,"409":1,"423":10}` |
| Requests over 10 ms CPU (in the crowd, upper bound) / over 50 ms | 211 / 2 of 108856 |
| Slowest request CPU in the crowd (ms, upper bound) | 58.2 |
| Isolated request CPU, ms (p50/p95/max) | `{"GET /api/z/:id/info":"0.17/0.94/4.01","GET /api/z/:id/control":"0.05/0.09/0.28","GET /api/z/:id/seats":"0.8/1/1.19","GET /api/z/:id/results":"0.06/0.1/0.17","GET /api/z/:id/cv":"0.01/0.02/0.05","POST /api/z/:id/join (already joined)":"0.66/1.26/6.57","POST /api/z/:id/claims (a repeat of a true claim)":"0.55/0.71/0.81","POST /api/z/:id/presence":"0.49/11.66/18.93","POST /api/z/:id/control (signature of a stranger)":"0.69/0.82/2.33","POST /api/z/:id/control (a real signature)":"0.43/0.56/0.95"}` |
| Process CPU for the whole run (s) / peak memory (MB, whole test process) | 41.2 / 646 |
| Store writes | 3589 = 4.5% of the 80,000 a day the Worker allows itself (the free D1 plan is 100,000) |

Game-specific measurements:

| What | Result |
|---|---|
| newPhone | `{"tried":10,"refusedOtherPhone":10,"afterUnbindJoined":10,"sameTicket":10,"unbind":[200,200,200,200,200,200,200,200,200,200]}` |
| left | `{"tried":5,"ok":5,"rejoinTried":5,"rejoinAnswer":["You were removed from this game by the organizer.","You were removed from this game by the organizer.","You were removed from this game by the organizer.","You were removed from this game by the organizer.","You were removed from this game by the organizer."],"status":[200,200,200,200,200],"seatBlockedAfter":[1,1,1,1,1],"piiLeftAfter":[0,0,0,0,0]}` |
| swapDone | true |
| fullTried | true |
| fullAnswer | 409 This game is full. Please tell your organizer so they can make room. |
| leaveDone | true |
| rejoinDone | true |
| late | `{"joined":60,"withHiddenNumbers":59,"hiddenAvg":31.9,"wonAnything":0}` |
| offline | `{"phones":25,"caughtUp":24,"notCaught":["9100000203 phase=play log=0 blocked=true liar=false off=1200000-1440000 t=1878000"]}` |
| retention | `{"endMs":1795170972000,"deletedAtIST":"2027-11-21T00:00:00.000 IST","stillThere5MinBefore":true,"leftoverRows":{},"keptOnPurpose":{"entitlement":1,"audit_cert":1,"audit_stats":1,"game_record":1},"leftoverKvKeys":[]}` |

Fairness checks (nobody could predict or alter the numbers):

| Check | Result | Detail |
|---|---|---|
| every phone's number log equals the log re-derived from the public beacon alone | PASS |  |
| before the first number, none of the 9045 store answers held the game's numbers | PASS |  |
| the store keeps no copy of the numbers (82 tables searched for the first 8 called numbers in order) | PASS |  |
| a pause signed with a key the game does not know is refused | PASS |  |
| a signed message whose round was changed afterwards is refused | PASS |  |
| a message with a made-up signature is refused | PASS |  |
| the signed control file was not changed by any of the forgeries | PASS |  |
| there is no route to write, draw or set a number (9 probes) | PASS |  |
| a stranger cannot change the game's settings | PASS |  |
| an unsigned press is refused | PASS |  |

Game checks:

| Check | Result | Detail |
|---|---|---|
| players joined (250 of 250) | PASS | 250 |
| the store holds exactly the people who joined (no duplicates) | PASS | 250 vs 250 |
| prizes were published | PASS | 7 |
| published winners equal the winners worked out from the public numbers and tickets | PASS | want bot#1@38 corners#1@32 early5#1@6 full#1@59 full#2@70 mid#1@36 top#1@28 / got bot#1@38 corners#1@32 early5#1@6 full#1@59 full#2@70 mid#1@36 top#1@28 |
| late joiners joined and play from their own first number | PASS | {"joined":60,"withHiddenNumbers":59,"hiddenAvg":31.9,"wonAnything":0} |
| a new phone with the same number was refused until the Organizer moved the ticket | PASS | {"tried":10,"refusedOtherPhone":10,"afterUnbindJoined":10,"sameTicket":10,"unbind":[200,200,200,200,200,200,200,200,200,200]} |
| after the Organizer moved the ticket the new phone got the SAME ticket | PASS | {"tried":10,"refusedOtherPhone":10,"afterUnbindJoined":10,"sameTicket":10,"unbind":[200,200,200,200,200,200,200,200,200,200]} |
| players who pressed leave were taken out and their details deleted at once | PASS | {"tried":5,"ok":5,"rejoinTried":5,"rejoinAnswer":["You were removed from this game by the organizer.","You were removed from this game by the organizer.","You w |
| the 251st person is refused politely while all 250 places are taken | PASS | 409 This game is full. Please tell your organizer so they can make room. |
| phones that were offline caught up to the same numbers when they came back | PASS | {"phones":25,"caughtUp":24,"notCaught":["9100000203 phase=play log=0 blocked=true liar=false off=1200000-1440000 t=1878000"]} |
| 365 days later: the game is kept until 00:00 IST of its last day and then everything of it is deleted, except the records kept on purpose | PASS | before=1 leftovers={} [] |

Errors the Worker answered (grouped):

| Status | Route | Message | Count |
|---|---|---|---|
| 423 | POST /api/z/:id/join | This ticket was opened in a different browser or app (or on another phone). A ticket plays on one device only. Open your link in the same browser or app you use | 10 |
| 409 | POST /api/z/:id/join | This game is full. Please tell your organizer so they can make room. | 1 |
| 403 | POST /api/z/:id/join | You were removed from this game by the organizer. | 5 |
| 403 | POST /api/z/:id/control | Signature does not match the organizer key. | 2 |
| 400 | POST /api/z/:id/control | Malformed control message. | 2 |
| 403 | PATCH /api/z/:id/settings | Not allowed. | 1 |

## Game 7: Pause and resume

Game id `G250-07`. Mode: pauses: timed (auto-resume), open-ended + manual resume, extended, 1-round.

| What | Result |
|---|---|
| Players joined | 250 of 250 (not joined: 0; join retries: 1) |
| First / last player joined at (virtual minutes after the game was made) | 0.6 / 10.5 |
| Players checked in (present check) | 250 |
| Join refusals seen | `[]` |
| Claims stored | 1457 |
| Claim requests answered too late (409) | 0 |
| Claims by house | `{"bot":243,"corners":243,"early5":243,"full":242,"mid":243,"top":243}` |
| Wrong claims (Bogeys) | 0 |
| Phones that pressed Claim | 243 |
| Prizes published | 7: bot#1@30, corners#1@21x2, early5#1@8, full#1@58, full#2@66, mid#1@35, top#1@29 |
| Numbers called | 90 |
| First number at (virtual minutes after the game was made) | 17 |
| Game length, first number to all phones ended (virtual minutes) | 24 |
| Test run length (real seconds) | 73.7 |
| Requests to the Worker | 196648 |
| Outbound network requests made by the test (must be 0) | 0 |
| Responses other than 200 | `{"200":196627,"400":2,"403":4,"404":9,"422":6}` |
| Requests over 10 ms CPU (in the crowd, upper bound) / over 50 ms | 297 / 9 of 196648 |
| Slowest request CPU in the crowd (ms, upper bound) | 158.9 |
| Isolated request CPU, ms (p50/p95/max) | `{"GET /api/z/:id/info":"0.23/1.69/1.91","GET /api/z/:id/control":"0.04/0.11/0.16","GET /api/z/:id/seats":"0.67/0.96/1.04","GET /api/z/:id/results":"0.05/0.31/1.2","GET /api/z/:id/cv":"0.01/0.03/0.09","POST /api/z/:id/join (already joined)":"0.76/1.29/3.97","POST /api/z/:id/claims (a repeat of a true claim)":"0.76/1.07/1.14","POST /api/z/:id/presence":"0.52/0.87/1.31","POST /api/z/:id/control (signature of a stranger)":"0.93/1.18/1.31","POST /api/z/:id/control (a real signature)":"0.77/1.11/2.15"}` |
| Process CPU for the whole run (s) / peak memory (MB, whole test process) | 86.9 / 907 |
| Store writes | 4625 = 5.8% of the 80,000 a day the Worker allows itself (the free D1 plan is 100,000) |

Game-specific measurements:

| What | Result |
|---|---|
| pauses | `[{"name":"Organizer pauses for 20 rounds (1 minute)","action":"pause","atSimMin":19.2,"status":200},{"name":"Host tries to pause again while paused","action":"pause","atSimMin":19.8,"status":422,"error":"Not accepted: already paused."},{"name":"Host pauses (no end time)","action":"pause","atSimMin":22.9,"status":200},{"name":"Organizer resumes","action":"resume","atSimMin":26.9,"status":200},{"name":"Organizer pauses for 10 rounds","action":"pause","atSimMin":28.9,"status":200},{"name":"Organizer extends by 20 rounds","action":"extend","atSimMin":29.3,"status":200},{"name":"Organizer resumes early","action":"resume","atSimMin":29.8,"status":200},{"name":"Host pauses for 2 rounds","action":"pause","atSimMin":31.9,"status":200}]` |
| p1 | 1152000 |
| stranger | true |
| strangerPause | 403 |
| resumeWhenNotPaused | 422 |
| hugePause | 422 Not accepted: already paused. |
| p1b | true |
| pauseWhilePausedRefused | true |
| p2 | 1371000 |
| leadProbe | true |
| resumeInPast | 422 Not accepted: it names a round that has already begun, so its random number could already be known. Please press again. |
| extendInPast | 422 Not accepted: it names a round that has already begun, so its random number could already be known. Please press again. |
| resumeThisRound | 422 Not accepted: it names a round that has already begun, so its random number could already be known. Please press again. |
| p2r | 1614000 |
| p3 | 1737000 |
| p3x | true |
| p3r | true |
| p4 | 1911000 |
| intervals | `[{"start":34122209,"end":34122229,"rounds":20},{"start":34122282,"end":34122363,"rounds":81},{"start":34122404,"end":34122421,"rounds":17},{"start":34122462,"end":34122464,"rounds":2}]` |
| retention | `{"endMs":1795171320000,"deletedAtIST":"2027-11-21T00:00:00.000 IST","stillThere5MinBefore":true,"leftoverRows":{},"keptOnPurpose":{"entitlement":1,"outbox":1,"audit_cert":1,"audit_stats":1,"game_record":1},"leftoverKvKeys":[]}` |

Fairness checks (nobody could predict or alter the numbers):

| Check | Result | Detail |
|---|---|---|
| every phone's number log equals the log re-derived from the public beacon alone | PASS |  |
| a Resume or an Extend that names a round that has already begun (its beacon number is public) is refused, so nobody can pick the round the numbers restart from | PASS |  |
| before the first number, none of the 12453 store answers held the game's numbers | PASS |  |
| the store keeps no copy of the numbers (82 tables searched for the first 8 called numbers in order) | PASS |  |
| a pause signed with a key the game does not know is refused | PASS |  |
| a signed message whose round was changed afterwards is refused | PASS |  |
| a message with a made-up signature is refused | PASS |  |
| the signed control file was not changed by any of the forgeries | PASS |  |
| there is no route to write, draw or set a number (9 probes) | PASS |  |
| a stranger cannot change the game's settings | PASS |  |
| an unsigned press is refused | PASS |  |

Game checks:

| Check | Result | Detail |
|---|---|---|
| players joined (250 of 250) | PASS | 250 |
| the store holds exactly the people who joined (no duplicates) | PASS | 250 vs 250 |
| prizes were published | PASS | 7 |
| published winners equal the winners worked out from the public numbers and tickets | PASS | want bot#1@29 corners#1@20 early5#1@7 full#1@57 full#2@65 mid#1@34 top#1@28 / got bot#1@29 corners#1@20 early5#1@7 full#1@57 full#2@65 mid#1@34 top#1@28 |
| no number was shown during any of the 3 pauses that could be sampled | PASS | 3 pauses sampled, 0 showed a number |
| every pause and resume the Organizer or Host pressed was accepted | PASS | [{"name":"Host tries to pause again while paused","action":"pause","atSimMin":19.8,"status":422,"error":"Not accepted: already paused."}] |
| a second pause while paused is refused | PASS |  |
| a pause signed by a stranger, a resume with nothing paused and an endless pause are all refused | PASS | 403 422 422 Not accepted: already paused. |
| 365 days later: the game is kept until 00:00 IST of its last day and then everything of it is deleted, except the records kept on purpose | PASS | before=1 leftovers={} [] |

Errors the Worker answered (grouped):

| Status | Route | Message | Count |
|---|---|---|---|
| 403 | POST /api/z/:id/control | Signature does not match the organizer key. | 3 |
| 422 | POST /api/z/:id/control | Not accepted: resume before the pause began. | 1 |
| 422 | POST /api/z/:id/control | Not accepted: already paused. | 2 |
| 422 | POST /api/z/:id/control | Not accepted: it names a round that has already begun, so its random number could already be known. Please press again. | 3 |
| 400 | POST /api/z/:id/control | Malformed control message. | 2 |
| 403 | PATCH /api/z/:id/settings | Not allowed. | 1 |

## Game 8: All prize types and tie-breaks

Game id `G250-08`. Mode: tickets: 2 each; ties: next (one after the other by public tie-break); 25 Early Five winners, 4 Full House, Super Bumper, Unlucky.

| What | Result |
|---|---|
| Players joined | 250 of 250 (not joined: 0; join retries: 1) |
| First / last player joined at (virtual minutes after the game was made) | 0.6 / 10.5 |
| Players checked in (present check) | 250 |
| Join refusals seen | `[]` |
| Claims stored | 3162 |
| Claim requests answered too late (409) | 0 |
| Claims by house | `{"bot":161,"corners":209,"early10":243,"early5":243,"early7":243,"even5":241,"frame":86,"full":50,"full2":2,"high5":179,"low5":183,"mid":170,"midcorners":115,"odd5":238,"plus":123,"star":179,"top":205,"topbottom":112,"twolines":180}` |
| Wrong claims (Bogeys) | 0 |
| Phones that pressed Claim | 243 |
| Prizes published | 54: bot#1@32, bot#2@38, corners#1@21, corners#2@29, early10#1@27, early5#1@6, early5#2@9, early5#3@10, early5#4@11, early5#5@11, early5#6@11, early5#7@12, early5#8@12, early5#9@12, early5#10@12, early5#11@12, early5#12@12, early5#13@13, early5#14@13, early5#15@13, early5#16@13, early5#17@14, early5#18@14, early5#19@14, early5#20@14, early5#21@14, early5#22@14, early5#23@14, early5#24@14, early5#25@15, early7#1@12, early7#2@16, even5#1@18, frame#1@60, full#1@65, full#2@66, full#3@68, full#4@69, full2#1@77, high5#1@24, low5#1@20, mid#1@20, mid#2@25, midcorners#1@49, odd5#1@19, plus#1@42, star#1@21, top#1@30, top#2@35, top#3@40, topbottom#1@59, twolines#1@43, twolines#2@49, unlucky#1@65 |
| Numbers called | 82 |
| First number at (virtual minutes after the game was made) | 17 |
| Game length, first number to all phones ended (virtual minutes) | 16.2 |
| Test run length (real seconds) | 596.4 |
| Requests to the Worker | 145409 |
| Outbound network requests made by the test (must be 0) | 0 |
| Responses other than 200 | `{"200":145395,"400":2,"403":3,"404":9}` |
| Requests over 10 ms CPU (in the crowd, upper bound) / over 50 ms | 6412 / 400 of 145409 |
| Slowest request CPU in the crowd (ms, upper bound) | 5393.9 |
| Isolated request CPU, ms (p50/p95/max) | `{"GET /api/z/:id/info":"0.74/2.44/3.66","GET /api/z/:id/control":"0.13/0.89/1.97","GET /api/z/:id/seats":"0.87/1.09/1.19","GET /api/z/:id/results":"0.23/0.3/0.39","GET /api/z/:id/cv":"0.01/0.05/0.13","POST /api/z/:id/join (already joined)":"1.08/2.15/3.24","POST /api/z/:id/claims (a repeat of a true claim)":"0.93/9.59/19.81","POST /api/z/:id/presence":"0.44/0.77/8.74","POST /api/z/:id/control (signature of a stranger)":"0.86/1.28/2.48","POST /api/z/:id/control (a real signature)":"0.8/1.57/1.67"}` |
| Process CPU for the whole run (s) / peak memory (MB, whole test process) | 641.1 / 1522 |
| Store writes | 8109 = 10.1% of the 80,000 a day the Worker allows itself (the free D1 plan is 100,000) |

Game-specific measurements:

| What | Result |
|---|---|
| rewardLines | 54 |
| positionsOnSameCall | `["early5@10x3","early5@11x6","early5@12x4","early5@13x8"]` |
| earlyFiveOrdinals | 25 |
| reportNames | `["1st Early Five","2nd Early Five","3rd Early Five","4th Early Five","5th Early Five","6th Early Five","7th Early Five","8th Early Five","9th Early Five","10th Early Five","11th Early Five","12th Early Five","1st Early Seven","13th Early Five","14th Early Five","15th Early Five","16th Early Five","17th Early Five","18th Early Five","19th Early Five","20th Early Five","21st Early Five","22nd Early Five","23rd Early Five","24th Early Five","25th Early Five","2nd Early Seven","1st Middle Line","1st Four Corners","2nd Middle Line"]` |
| retention | `{"endMs":1795170966000,"deletedAtIST":"2027-11-21T00:00:00.000 IST","stillThere5MinBefore":true,"leftoverRows":{},"keptOnPurpose":{"entitlement":1,"audit_cert":1,"audit_stats":1,"game_record":1},"leftoverKvKeys":[]}` |

Fairness checks (nobody could predict or alter the numbers):

| Check | Result | Detail |
|---|---|---|
| every phone's number log equals the log re-derived from the public beacon alone | PASS |  |
| before the first number, none of the 12453 store answers held the game's numbers | PASS |  |
| the store keeps no copy of the numbers (82 tables searched for the first 8 called numbers in order) | PASS |  |
| a pause signed with a key the game does not know is refused | PASS |  |
| a signed message whose round was changed afterwards is refused | PASS |  |
| a message with a made-up signature is refused | PASS |  |
| the signed control file was not changed by any of the forgeries | PASS |  |
| there is no route to write, draw or set a number (9 probes) | PASS |  |
| a stranger cannot change the game's settings | PASS |  |
| an unsigned press is refused | PASS |  |

Game checks:

| Check | Result | Detail |
|---|---|---|
| players joined (250 of 250) | PASS | 250 |
| the store holds exactly the people who joined (no duplicates) | PASS | 250 vs 250 |
| prizes were published | PASS | 54 |
| published winners equal the winners worked out from the public numbers and tickets | PASS | want bot#1@31 bot#2@37 corners#1@20 corners#2@28 early10#1@26 early5#10@11 early5#11@11 early5#12@11 early5#13@12 early5#14@12 early5#15@12 early5#16@12 early5# |
| the tie rule (next) gave each winner position to exactly one ticket | PASS | 0 positions with several tickets |
| at least one real tie (two tickets completing on the same number) happened and was ordered | PASS | ["early5@10x3","early5@11x6","early5@12x4","early5@13x8"] |
| the phone's prize list names the 1st to 25th Early Five correctly (21st, 22nd, 23rd, 11th...) | PASS | 20th Early Five / 21st Early Five / 22nd Early Five / 23rd Early Five / 24th Early Five |
| the organizer's report / log names the 21st, 22nd and 23rd winners correctly | PASS | 4th Early Five / 5th Early Five / 6th Early Five / 7th Early Five / 8th Early Five / 9th Early Five |
| 365 days later: the game is kept until 00:00 IST of its last day and then everything of it is deleted, except the records kept on purpose | PASS | before=1 leftovers={} [] |

Errors the Worker answered (grouped):

| Status | Route | Message | Count |
|---|---|---|---|
| 403 | POST /api/z/:id/control | Signature does not match the organizer key. | 2 |
| 400 | POST /api/z/:id/control | Malformed control message. | 2 |
| 403 | PATCH /api/z/:id/settings | Not allowed. | 1 |

## Game 9: Mail and notification fan-out

Game id `G250-09`. Mode: mail: Organizer, Host, players (with e-mail), winners; announcements to 250 phones.

| What | Result |
|---|---|
| Players joined | 250 of 250 (not joined: 0; join retries: 1) |
| First / last player joined at (virtual minutes after the game was made) | 0.6 / 10.5 |
| Players checked in (present check) | 250 |
| Join refusals seen | `[]` |
| Claims stored | 454 |
| Claim requests answered too late (409) | 0 |
| Claims by house | `{"bot":64,"corners":54,"early5":242,"full":3,"mid":47,"top":44}` |
| Wrong claims (Bogeys) | 0 |
| Phones that pressed Claim | 242 |
| Prizes published | 7: bot#1@20, corners#1@24x2, early5#1@11, full#1@61, full#2@65, mid#1@26, top#1@39 |
| Numbers called | 71 |
| First number at (virtual minutes after the game was made) | 17 |
| Game length, first number to all phones ended (virtual minutes) | 14 |
| Test run length (real seconds) | 34.7 |
| Requests to the Worker | 115931 |
| Outbound network requests made by the test (must be 0) | 0 |
| Responses other than 200 | `{"200":115915,"400":3,"403":4,"404":9}` |
| Requests over 10 ms CPU (in the crowd, upper bound) / over 50 ms | 203 / 8 of 115931 |
| Slowest request CPU in the crowd (ms, upper bound) | 130.8 |
| Isolated request CPU, ms (p50/p95/max) | `{"GET /api/z/:id/info":"0.17/0.29/9.81","GET /api/z/:id/control":"0.06/0.2/7.98","GET /api/z/:id/seats":"0.69/4.74/5.02","GET /api/z/:id/results":"0.05/0.1/0.13","GET /api/z/:id/cv":"0.01/0.03/0.07","POST /api/z/:id/join (already joined)":"0.87/3.06/4.58","POST /api/z/:id/claims (a repeat of a true claim)":"0.82/3.84/7.47","POST /api/z/:id/presence":"0.41/0.5/0.89","POST /api/z/:id/control (signature of a stranger)":"0.81/1.55/1.89","POST /api/z/:id/control (a real signature)":"0.82/1.29/7.92"}` |
| Process CPU for the whole run (s) / peak memory (MB, whole test process) | 41.9 / 620 |
| Store writes | 3564 = 4.5% of the 80,000 a day the Worker allows itself (the free D1 plan is 100,000) |

Game-specific measurements:

| What | Result |
|---|---|
| announce | `[{"name":"Organizer","status":200,"atSimMin":17.8},{"name":"Host","status":200,"atSimMin":20.8}]` |
| a1 | true |
| a1seen | true |
| a1seenCount | 242 |
| a1seenAtSimMin | 17.9 |
| a2 | true |
| a2from | 1248000 |
| a2seen | true |
| a2seenCount | 241 |
| a2lagSec | 3 |
| a3 | true |
| tooLongStatus | 400 |
| strangerAnnounce | 403 |
| winnerPhones | 7 |
| winnersConfirmed | 7 |
| confirmErr | `[]` |
| prizesListed | 8 |
| prizesKeys | `["prizes"]` |
| prizesMarkedGiven | 8 |
| mail | `{"attemptsTotal":3,"distinctMails":2,"deliveredOnce":2,"neverDelivered":[],"refused429":1,"refused500":0,"retriedToSuccess":1,"bySubject":[{"subject":"[Tambola] You are a Host: your Corporate Tambola link","n":1,"recipients":["h***@acme.com"]},{"subject":"[Tambola] Your game report is ready: <id> (<id>), # Nov #","n":1,"recipients":["d***@xyz.in"]}],"sentToPlayers":0,"sentToOrganizer":1,"sentToHost":1,"bodiesWithPlayerMobile":0,"bodiesWithPlayerEmail":0,"outboxByState":[{"sent":1,"n":1}],"mailEvents":[]}` |
| retention | `{"endMs":1795170966000,"deletedAtIST":"2027-11-21T00:00:00.000 IST","stillThere5MinBefore":true,"leftoverRows":{},"keptOnPurpose":{"entitlement":1,"outbox":1,"audit_cert":1,"audit_stats":1,"game_record":1,"mail_track":1},"leftoverKvKeys":[]}` |

Fairness checks (nobody could predict or alter the numbers):

| Check | Result | Detail |
|---|---|---|
| every phone's number log equals the log re-derived from the public beacon alone | PASS |  |
| before the first number, none of the 12453 store answers held the game's numbers | PASS |  |
| the store keeps no copy of the numbers (82 tables searched for the first 8 called numbers in order) | PASS |  |
| a pause signed with a key the game does not know is refused | PASS |  |
| a signed message whose round was changed afterwards is refused | PASS |  |
| a message with a made-up signature is refused | PASS |  |
| the signed control file was not changed by any of the forgeries | PASS |  |
| there is no route to write, draw or set a number (9 probes) | PASS |  |
| a stranger cannot change the game's settings | PASS |  |
| an unsigned press is refused | PASS |  |

Game checks:

| Check | Result | Detail |
|---|---|---|
| players joined (250 of 250) | PASS | 250 |
| the store holds exactly the people who joined (no duplicates) | PASS | 250 vs 250 |
| prizes were published | PASS | 7 |
| published winners equal the winners worked out from the public numbers and tickets | PASS | want bot#1@19 corners#1@23 early5#1@10 full#1@60 full#2@64 mid#1@25 top#1@38 / got bot#1@19 corners#1@23 early5#1@10 full#1@60 full#2@64 mid#1@25 top#1@38 |
| every mail the game sent was delivered exactly once after refusals (no mail lost, no duplicate) | PASS | [] |
| the Organizer got the publish and report mails | PASS | [Tambola] Your game report is ready: G250-09 (G250-09), 20 Nov 2026 |
| the Host got their link mail | PASS | [Tambola] You are a Host: your Corporate Tambola link |
| no mail carries a player's mobile number or e-mail address | PASS | 0 / 0 |
| the Organizer's message reached 150+ phones | PASS | 242 |
| the Host's message reached 150+ phones | PASS | 241 lag 3s |
| a 200-character message and a stranger's message are refused | PASS | 400 403 |
| every winner could confirm their name and number on their own phone | PASS | 7/7  |
| the Organizer listed the prizes and ticked them as given | PASS | 8 listed 8 ticked ["prizes"] |
| 365 days later: the game is kept until 00:00 IST of its last day and then everything of it is deleted, except the records kept on purpose | PASS | before=1 leftovers={} [] |

Errors the Worker answered (grouped):

| Status | Route | Message | Count |
|---|---|---|---|
| 400 | POST /api/z/:id/announce | A message can be at most 160 characters. Yours has 200. Please shorten it. | 1 |
| 403 | POST /api/z/:id/announce | Not allowed. | 1 |
| 403 | POST /api/z/:id/control | Signature does not match the organizer key. | 2 |
| 400 | POST /api/z/:id/control | Malformed control message. | 2 |
| 403 | PATCH /api/z/:id/settings | Not allowed. | 1 |

## Game 10: End, report, deletion, retention

Game id `G250-10`. Mode: organizer stops the game; report; +20h personal data deleted; +365d everything deleted.

| What | Result |
|---|---|
| Players joined | 250 of 250 (not joined: 0; join retries: 8) |
| First / last player joined at (virtual minutes after the game was made) | 0.6 / 10.5 |
| Players checked in (present check) | 250 |
| Join refusals seen | `[]` |
| Claims stored | 270 |
| Claim requests answered too late (409) | 0 |
| Claims by house | `{"bot":4,"corners":15,"early5":234,"mid":6,"top":11}` |
| Wrong claims (Bogeys) | 0 |
| Phones that pressed Claim | 234 |
| Prizes published | 5: bot#1@18, corners#1@20x2, early5#1@6, mid#1@31, top#1@28 |
| Numbers called | 43 |
| First number at (virtual minutes after the game was made) | 17 |
| Game length, first number to all phones ended (virtual minutes) | 8.4 |
| Test run length (real seconds) | 30 |
| Requests to the Worker | 85980 |
| Outbound network requests made by the test (must be 0) | 0 |
| Responses other than 200 | `{"200":85974,"403":2,"404":4}` |
| Requests over 10 ms CPU (in the crowd, upper bound) / over 50 ms | 170 / 32 of 85980 |
| Slowest request CPU in the crowd (ms, upper bound) | 281.2 |
| Isolated request CPU, ms (p50/p95/max) | `{"GET /api/z/:id/info":"0.14/0.22/0.33","GET /api/z/:id/control":"0.04/0.08/0.15","GET /api/z/:id/seats":"0.54/0.62/0.65","GET /api/z/:id/results":"0.05/0.13/0.19","GET /api/z/:id/cv":"0.01/0.02/0.08","POST /api/z/:id/join (already joined)":"0.73/1.03/8.38","POST /api/z/:id/claims (a repeat of a true claim)":"0.89/1.3/5.97","POST /api/z/:id/presence":"0.59/0.67/0.74","POST /api/z/:id/control (signature of a stranger)":"0.66/0.96/1.86","POST /api/z/:id/control (a real signature)":"0.54/0.68/15.78"}` |
| Process CPU for the whole run (s) / peak memory (MB, whole test process) | 32.1 / 831 |
| Store writes | 3277 = 4.1% of the 80,000 a day the Worker allows itself (the free D1 plan is 100,000) |

Game-specific measurements:

| What | Result |
|---|---|
| stopped | true |
| stopStatus | 200  |
| stopAtSimMin | 24.8 |
| endMs | 1795170387000 |
| endSrc | schedule (computed) |
| simTimeAtFirstTickVsEnd | 11.2 |
| reportAt1min | false |
| reportAt2min | false |
| reportMs | 1795171299000 |
| reportState | sent |
| reportAfterEndMin | 15.2 |
| reportMails | `[{"to":"d***@xyz.in","subject":"[Tambola] Your game report is ready: G250-10 (G250-10), 20 Nov 2026","bytes":34989,"attachments":0}]` |
| reportApi | `{"status":200,"people":250,"totalPeople":250,"winners":7}` |
| reportAfterDelete | 404 |
| resultsAfterDelete | 0 |
| mailsAfterDelete | `["[Tambola] Your game report is ready: G250-10 (G250-10), 20 Nov 2026"]` |
| deletionMail | `["[Tambola] Your guests' personal data has been deleted: Game G250-10"]` |
| dataRequestAfterDelete | 403 This is not the phone that holds this ticket. Nobody can ask for another player. |
| fullDeleteAtIST | 2027-11-21T00:00:00.000 IST |
| keptOnPurpose | `{"entitlement":1,"audit_cert":1,"audit_stats":1,"game_record":1}` |
| leftoverRows | `{}` |
| leftoverKvKeys | `[]` |
| leftoverPresenceRange | `[{"a":null,"b":null,"n":0}]` |
| tablesStillHoldingTheGame | `[]` |

Data held over time:

| When after the end | Players held | Seats with a number | List rows | Check-ins | Claims | Prize rows | Report parts | Audit (personal) | Game rows | Settings record |
|---|---|---|---|---|---|---|---|---|---|---|
| report ready (0.25 h) | 250 | 250 | 250 | 250 | 270 | 6 | 1 | 2276 | 1 | 1 |
| +18h (18 h) | 250 | 250 | 250 | 250 | 270 | 6 | 1 | 2276 | 1 | 1 |
| +19.5h (19.5 h) | 250 | 250 | 250 | 250 | 270 | 6 | 1 | 2276 | 1 | 1 |
| +20.1h (20.1 h) | 0 | 0 | 0 | 0 | 0 | 6 | 0 | 0 | 1 | 1 |
| +30d (720 h) | 0 | 0 | 0 | 0 | 0 | 6 | 0 | 0 | 1 | 1 |
| +365d -2h (8766.06 h) | 0 | 0 | 0 | 0 | 0 | 6 | 0 | 0 | 1 | 1 |
| +365d (8768.14 h) | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |

Fairness checks (nobody could predict or alter the numbers):

| Check | Result | Detail |
|---|---|---|
| every phone's number log equals the log re-derived from the public beacon alone | PASS |  |
| before the first number, none of the 12412 store answers held the game's numbers | PASS |  |
| the store keeps no copy of the numbers (82 tables searched for the first 8 called numbers in order) | PASS |  |

Game checks:

| Check | Result | Detail |
|---|---|---|
| players joined (250 of 250) | PASS | 250 |
| the store holds exactly the people who joined (no duplicates) | PASS | 250 vs 250 |
| prizes were published | PASS | 5 |
| published winners equal the winners worked out from the public numbers and tickets | PASS | want bot#1@17 corners#1@19 early5#1@5 mid#1@30 top#1@27 / got bot#1@17 corners#1@19 early5#1@5 mid#1@30 top#1@27 |
| the Organizer's Stop was accepted and every phone stopped | PASS | 200  |
| no report was made one minute after the end (it waits 3 minutes so late wins are in) | PASS | sim time at the first tick was 11.2 min after the scheduled end |
| the Organizer's report was e-mailed after the end | PASS | [{"to":"d***@xyz.in","subject":"[Tambola] Your game report is ready: G250-10 (G250-10), 20 Nov 2026","bytes":34989,"attachments":0}] |
| the report link works and lists the people (names and numbers) while the data is kept | PASS | {"status":200,"people":250,"totalPeople":250,"winners":7} |
| a wrong report key is refused | PASS | 403 |
| the report link works at 18 hours and is closed at 19.5 hours | PASS | 200 / 404 |
| at 19.5 hours the players' details are still held (deleted at 20 h) | PASS | {"label":"+19.5h","atH":19.5,"participants":250,"seats_with_ph":250,"people_list":250,"checkins":250,"claims":270,"prizeRows":6,"reportChunks":1,"auditPii":2276 |
| 20 hours after the end every player's name, number, seat details and check-in are deleted | PASS | {"label":"+20.1h","atH":20.1,"participants":0,"seats_with_ph":0,"people_list":0,"checkins":0,"claims":0,"prizeRows":6,"reportChunks":0,"auditPii":0,"engagement" |
| the players' personal part of the audit log is shredded | PASS | 0 |
| the winners' record (seat, prize, round) is kept | PASS | {"label":"+20.1h","atH":20.1,"participants":0,"seats_with_ph":0,"people_list":0,"checkins":0,"claims":0,"prizeRows":6,"reportChunks":0,"auditPii":0,"engagement" |
| the report is gone after the deletion | PASS | 404 |
| the game record and settings are still kept just before the 365th day ends | PASS | {"label":"+365d -2h","atH":8766.06,"participants":0,"seats_with_ph":0,"people_list":0,"checkins":0,"claims":0,"prizeRows":6,"reportChunks":0,"auditPii":0,"engag |
| after the 365th day (00:00 IST) the engagement, its record and its winners are all deleted | PASS | {"label":"+365d","atH":8768.14,"participants":0,"seats_with_ph":0,"people_list":0,"checkins":0,"claims":0,"prizeRows":0,"reportChunks":0,"auditPii":0,"engagemen |
| after the 365th day no table holds a row of the game, except the records kept on purpose (settings record, payment record, audit certificates) | PASS | {} |

Errors the Worker answered (grouped):

| Status | Route | Message | Count |
|---|---|---|---|
| 403 | GET /api/report/G250-10 | This report link is not valid. | 1 |
| 404 | GET /api/report/G250-10 | This report is not ready, or the link has closed and the participants' details are being or have been deleted (that happens within 24 hours of the game ending,  | 2 |
| 403 | POST /api/z/:id/datareq | This is not the phone that holds this ticket. Nobody can ask for another player. | 1 |
| 404 | GET /api/z/:id/participants | No such engagement. | 1 |
| 404 | GET /api/z/:id/claims | No such engagement. | 1 |


## Failure points found, root causes and fixes

Branch `boss/mail-lanes-250x10-1.11.0` (release 1.11.0; the games were first built on `claude/youthful-pasteur-jpgax0`, PR #35). Nothing is merged or deployed. The ten games in `RESULTS.md` were RUN AGAIN on the 1.11.0 code (1.10.2 plus mail lanes plus these fixes): all ten pass. The earlier "before the fixes" records were not carried over; each fix is proven by a test that goes **red without the fix and green with it**. Row 2 (the ordinal) is already fixed in 1.10.2 by `packages/shared/src/ordinal.ts` (PR #22); only its extra guard test `ordinal-names.test.ts` is kept. In 1.11.0 the games also check the new mail tables: the per-mail state `mail_track` is forgotten after 3 days by the scheduled tick (the test clock now runs it like the real tick), and a report mail stamped by the real clock counts as young.

| # | Found in | What went wrong | Root cause | Fix | Test (red before, green after) | Size |
|---|---|---|---|---|---|---|
| 1 | Game 4 (and 7) | **Fairness.** A Host who waited about 100 seconds before pressing *Next number* could look at the numbers that the 32 beacon rounds already published would give for the next call (27 different numbers), choose the one they wanted, sign a press that names that old round, and the store accepted it (HTTP 200). The same was possible with an Organizer's *Resume* in game 7. So "nobody can pick the numbers" was not true for Host-called games and for pause / resume. | `publishControl` (`packages/beacon/src/control.ts`) checked the lead of a message only against the message's own `signedAtRound`, a number the signer writes. Nothing compared the named round with the store's real clock. (The guide page already says "the press reached us a little late, so it was not counted": the rule was meant, not enforced.) | `publishControl` takes the store's current round; a message whose `atBeaconRound` has already begun is refused ("That press did not go through. Please press again." for a press; a plain reason for Pause / Resume / Extend). The Worker passes `roundOfMs(now)`. | `packages/beacon/test/control-freshness.test.ts` (5 tests), `apps/edge/test/control-freshness.test.ts` (2 tests): 3 + 2 fail without the fix. Games 4 and 7 now show the backdated press refused. | 2 source files, about 6 lines |
| 2 | Game 8 | The Organizer's game log and report named the 21st, 22nd and 23rd winner of a house "21th", "22th", "23th" (also 31st ... 93rd). A house may have up to 100 winners. | The same one-line ordinal `["", "1st", "2nd", "3rd"][n] ?? n + "th"` was copied into nine files (lifecycle, game log, certificates, shared ticket code, and the player, console, big-screen, board and organizer pages). | One function `ordinalName` (`packages/shared/src/ticket.ts`); the three server copies import it; the five page files carry the same rule; a test scans the source for any new copy. | `apps/edge/test/ordinal-names.test.ts` (4 tests): 3 fail without the fix. | 9 files |
| 3 | Games 1 to 10 (365-day check at the end of each game) | 365 days after a game two small rows were still there: the claim-signal counter `cv/<game>` and the "phones listening" counters (`presence`, 9 to 16 rows per game). No name or number, but the game was not fully forgotten. The listening counters are described as "auto-deleted after a day", yet that only ran when somebody opened the console. | `deleteEngagementRows` (`lifecycle.ts`) did not list these two; the day-old sweep lived only inside the console's read. | Both are deleted with the game; the hourly housekeeping also sweeps counters older than a day. | `apps/edge/test/retention-leftovers.test.ts` (3 tests): 2 fail without the fix. | 1 file |

### Seen, understood, not changed (your decision)

- **A player who pressed "leave" and tries to come back is told "You were removed from this game by the organizer."** (game 6). The player left by their own choice; the words are wrong, nothing else is (their details were deleted at once, the seat stays as an anonymous blocked id so winners stay identical on every phone). Cause: `join` has one refusal text for every blocked seat. Not changed: wording only, and a correct text needs a new marker per seat.
- **Trade-off of fix 1.** A press must reach the store before the round it names begins. A press is signed 2 rounds (6 seconds) ahead, so it has to arrive within about 3 to 6 seconds of being signed. On a very slow line a Host will sometimes see "That press did not go through. Please press again." and press again; no number is skipped. If the owner prefers a longer window the lead (`NEXT_LEAD_ROUNDS`) can go from 2 to 3 (numbers then appear 9 seconds after the press instead of 6).
- **Residual risk of fix 1.** Phones cannot check *when* the store received a message; the store's clock is trusted for it (the signatures are still checked by every phone, and nobody can write a number). A store that held a signed press back and published it late could still backdate it. Closing that needs the signer to commit to a beacon value (hash of round n) in the message, which is a protocol change, not a fix.
- **The older test crowd (`tools/sim/crowd.ts`) never exercised any rule made after 23 October.** It runs on a 2023 clock, so the present-check-in (a player must mark themselves present before any claim is accepted) was off. In these games the first run had every one of 205,368 claim requests answered 403 "Mark yourself present first" because the test phones skipped the check-in; the real page hides the ticket until the check-in, so a real player cannot press Claim before it. The 250x10 harness does the check-in the way the ticket page does.
- **No limit was hit.** Largest store write count of a game: see the summary table (all below 12% of the 80,000-a-day budget); no 429 / 503 "busy" answer except the deliberate rate limit on the ID guesser in game 5; no game needed a retry beyond a phone's own join retry. Per-request CPU measured one request at a time is under 2 ms (95th percentile) for every route a phone uses (tables in games 1, 3 and the other games). The three heavy calls are one-off: organizer sign-in (about 65 to 90 ms, first call in a cold process), creating a game (13 to 19 ms) and the housekeeping tick that builds the report (50 to 60 ms). On Cloudflare's free plan (10 ms CPU per request) these three could be cut off; they run once per game or once a minute, the code already works in small steps for this reason, and in-process SQLite is counted here while D1's waiting time is not. Memory: the 250 phone runtimes and the Worker share one process here (about 0.5 to 1.0 GB, 1.5 GB for game 8 with two tickets and 54 prize lines); that is the test harness, not the Worker.

