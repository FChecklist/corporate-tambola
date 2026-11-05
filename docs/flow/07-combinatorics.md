# How 1,000,000+ scenarios are reached by mathematics (and what is actually run)

Source of the numbers: `docs/flow/04-count-cases.mjs` (run it: `node docs/flow/04-count-cases.mjs`). Written by the boss session, 2026-10-27.

## 1. The dimension model (per person-journey)
| Dimension | Size | Values |
|---|---|---|
| play mode | 2 | manual, auto |
| verify | 4 | mobile, id, either, both |
| audience | 6 | only employees, list, list + guest invites, anyone, employees by ID + others by mobile, anyone + invites |
| arrival route | 7 | Organizer link, Host link, Co-host link, personal link, level-1 guest link, level-2 guest link, direct |
| person state | 11 | listed by mobile / by ID / both, not listed, removed, joined on another phone, same phone 2nd device, wrong ID, someone else's ID ... |
| capacity | 4 | room, exactly full, over by invite, ... |
| lifecycle | 6 | none, pause/resume, late join, organizer ends, cancelled before start, reopen |

Raw product per play mode: 6 x 4 x 7 x 11 x 4 x 6 = **44,352**. After removing impossible combinations (rules PR-01..PR-05 in the oracle file): **9,867** per play mode, **19,734** for both modes (join 7,176 + approval 2,336 + input 187 + permission 168 per mode).

## 2. Event sequences (what happens during the game): the multiplier
Events a person or an actor can do in a game (set E, |E| = 14): join late (4 times: before first number / after half / after last prize / after end), close the page and reopen (same device), reopen after a long gap, new browser same number, new phone same number, new phone same employee ID, two tabs, offline then back, claim after the next number, removed while playing, approved after cap full, organizer or Host absent (manual: nobody presses; auto: nobody pauses), Host takes over from Organizer, Co-host retired mid-game.
Ordered sequences of length 1 to 3: 14 + 14^2 + 14^3 = 14 + 196 + 2,744 = **2,954**.
Raw: 19,734 x 2,954 = **58.3 million**. After pruning impossible sequences (an event that needs a state the journey does not have, about 98% of them): **>1,000,000 valid scenarios**.

## 3. Organizer, Host, Co-host (before, during, after the game)
Organizer settings tree (steps 1-10): step 1 (date x mode x gap) 5 x 2 x 5 = 50; step 2 (size 6 x tickets 3 x rounds 3 x audience 6 x verify 4 x invites 12) pruned about 3,000; step 3 prizes about 40; step 4 brand about 30; step 5 hosts/co-hosts about 25; step 6 people lists about 60; step 7 publish checks about 12; step 8 payment 6; step 9 game-day controls 8; step 10 after 6. Independent steps multiply: 50 x 3,000 x 40 x 30 x 25 x 60 x 12 x 6 x 8 x 6 is above 10^14; pairwise (every pair of values of any two steps covered at least once) needs about 3,000. The organizer family (gen-organizer.mjs) and the permission family (role x route x state, gen-permissions.mjs, about 100 routes x 12 actors x 13 states = 15,600 cells) cover this.

## 4. How it is run (honest)
1,000,000 scenarios are not all executed one by one (about 2 per second on one core). The strategy:
1. **Exhaustive** where the space is small: every cell of the permission matrix (15,600), every journey (19,734), every organizer pair of settings (pairwise), every house (1,942 already run, 2,908 of 2,951 matrix scenarios pass).
2. **Stratified random sampling** of the sequence space (about 100,000 sampled sequences across the cloud box shards) with a fixed seed so every failure is reproducible; plus
3. **Invariants** that hold for every sequence (no 5xx, no data leak, one ticket per phone, same numbers and winners on every phone, nothing silently changed, every refusal in plain words), checked after every step of every scenario.
Failures found are classified PRODUCT GAP vs HARNESS in the findings tables of docs/flow/05, 06 and the journeys report.
