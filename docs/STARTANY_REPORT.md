# Press Start at any size (release 1.4.2, branch `wip/startany`)

Branched from main (1.4.1 live). **CODE ONLY: no test has been run** (the laptop is busy with the live test). Tests are written; each file passes a syntax check only. Nothing deployed or pushed.

## Rule
Up to 1,000 people all four modes. Above 1,000 only "The game does" for calling numbers (manual PLAY refused). **"I press Start" works at every size.** Pause and End stay limited to games of up to 2,000 people.

## Design
* **Why it was limited:** the signing key (what Start is signed with) was registered through `safetyForCap`, which has no profile above 2,000 people (phones in a huge game must not ask for a pause every few seconds).
* **New profiles** (`packages/beacon/src/control.ts`, same `deriveSafety` maths as the pause profiles): `SAFETY_BIG10K` (2,001 to 10,000 people; phones ask every 67 to 90 s; Start lead 65 rounds = 3.3 min) and `SAFETY_BIG` (above 10,000; every 90 to 120 s; lead 85 rounds = 4.3 min). `startSafetyForCap(cap)` = the pause profile up to 2,000, else a BIG profile with `startOnly`.
* **Start-only file:** `PublishedFile.startOnly` -> `ControlConfig.startOnly`: pause, resume, extend and end are refused ("Pause and End are available for games of up to 2,000 people. This game runs without them."), by the Worker's store and by every phone replaying the log. Start, the server clock check, "not before the time", "only once" and "never started by the system" are unchanged.
* **Proof, no phone shows number 1 before it has learned of Start:** a manual-start game has no call rounds until a verified `go` is in the phone's log (Infinity), so a phone that has not heard shows nothing; a stale phone stays in "hold". All begin together because the lead exceeds the slowest asking cadence + cache + latency (+ one missed answer); the named round's randomness is at least a lead in the future when signed. Details in `docs/flow/08-four-modes.md` and the comment above `SAFETY_BIG10K`.
* **Worker:** `PUT /control/key` registers the BIG profile for a manual-start game above 2,000 (an auto-start game above 2,000 still gets the old 409); the settings route re-evaluates the profile when the size crosses 2,000 before anything was sent (the unused key is forgotten, the console registers again). `modeTooBig` now refuses only manual play above 1,000 (the old Start limit message is gone). AI guided flow offers "I press Start" at every size.
* **Phone:** reads `startOnly` from the file; a manual-start game no longer asks for the file every 5 s (only Host calling does): it uses its own profile's cadence, which is what makes huge games affordable. Countdown shows `hh:mm:ss` for the long lead.
* **Console:** "How does it start?" always shown, "Who calls the numbers?" only up to 1,000; for a start-only game the Controls card says Pause and End are not available and the Start card says how long the countdown is ("about 3 minutes"); host text says 1,000.
* Guide: new entry for the refusal; the old Start-limit entry removed. Release 1.4.2.

## Tests written (not run yet)
* `packages/beacon/test/modes.test.ts`: profile tiers at 250 / 1000 / 2000 / 2001 / 5000 / 10000 / 10001 / 100000, lead longer than cadence + cache + latency, profiles told apart by lead, number 1 does not exist before Start, start-only refusals, store refusal.
* `packages/beacon/test/modes-phone.test.ts`: 5,000-person game: phones learn within their cadence, count down the long lead, show nothing before the named round, then identical numbers; pause refused.
* `apps/edge/test/modes.test.ts`: key registers at 2000 / 2001 / 10000 / 10001 / 100000 with the right profile and flag; Start refused early, accepted, named a full lead ahead, a small-game lead refused; pause / extend / end / resume refused in plain words; size crossing 2,000 re-registers; Start allowed at every size; manual play 1000 vs 1001.
* `apps/web/test/modes-pages.test.ts` (2,001 keeps the Start question, hides "who calls"), `modes-guide.test.ts`, `ai-go.test.ts` updated.
* `tools/sim2/.../gen-modes.mjs`: `modes/start-any-size/{1000,1001,2000,2001,5000,10000}` and size-limit at 1000 / 1001 / 2001 / 100000 for all four modes.

## Please check / risks
* **Serving the control file to huge games.** At 100,000 phones asking every ~90 s the file is read about 1,100 times a second. That is fine from the R2/CDN copy (`controlUrl`, kept fresh by `mirrorControl`) but would not be fine from the Worker route. The live deployment must have `CONTROL_BASE` + `CONTROL_R2` set (it does for 1.4.x, per the existing mirror code); worth a look before a 10,000+ game.
* No pack larger than 10,000 can be bought; sizes above that exist only for the platform key, so the sim2 scenarios stop at 10,000 and the edge tests cover 10,001 and 100,000 with a set pack.
* Falsification still to do when tests may run: disable `startOnly` refusal, the BIG profile registration, the lead, and the Worker key branch, and watch the tests above fail.
