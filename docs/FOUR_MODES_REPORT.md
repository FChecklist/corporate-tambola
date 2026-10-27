# Four game modes - report (release 1.4.0, branch `wip/modes`)

Built locally in `C:\ct\tambola-modes` (clone of `wip/join-redesign` at c1f8c88). **Nothing was deployed, pushed or run against the live site or database.** Design and rules are in `docs/flow/08-four-modes.md`.

## What was built

| Piece | Where | What |
|---|---|---|
| Setting | `packages/beacon/src/config.ts` | `startMode` ("auto" default / "manual") beside `callMode`; validated, kept across saves, in the public info, `config` JSON and game record |
| Start press | `packages/beacon/src/control.ts`, `game.ts` | new signed control action `go`; `goRound`; `callRound` / `callRoundR` wait (Infinity) until Start, number 1 in the Start round, then the chosen speed; Host presses only from the Start round; plain refusals (`GO_REFUSALS`, `NEXT_REFUSALS.start/early`) |
| Server | `apps/edge/src/worker.ts`, `modes.ts`, `lifecycle.ts`, `gamerecord.ts` | create/settings accept `startMode`; settings stay open until Start (also past the time for manual start); Host/AI/Organizer may edit, Co-host/player/stranger may not; `live` block in the control file + mirror; console-first guard; server-clock check on Start; `GET /changes`; change list in game record; late-joiner round follows Start; a game nobody starts is never started by the system (ends 24 h after its time) |
| Phone runtime | `packages/beacon/src/phone-runtime.ts` | `startMode`, `waitingForStart`, `goRound`, `startingInSec`; `applyLive` follows a time/mode change with no new link; tracker `reconfigure`; keyless manual game waits |
| Console | `apps/web/public/zc.js` | two questions ("How does it start?" - By itself at the time / I press Start; "Who calls the numbers?" - The game does / I do); big Start button on Game day (off before the time with the plain reason, "Press Start, or change the start time." at the time); "What changed" card; help text |
| Phone page / screens | `z.js`, `big.js`, `board.js` | before: "starts at <time>"; at/after: "Waiting for the host to begin the game"; after Start: "The game is starting" countdown |
| Guide | `guide.js` | catalog entries for every new message (+ `modes-guide.test.ts` checks the constants) |
| Release | `apps/edge/src/releases.json` | 1.4.0 "Four game modes" |
| Scenarios | `tools/sim2/scenarios/matrix/gen-modes.mjs`, `run-modes.ts` | 104 scenarios: role (Organizer, Host, AI, Co-host, player, anonymous, other Organizer) x mode (4) x window (before / just after / long after), Start by Organizer/Host/stranger, double Start, never pressed, time change then Start, switch after publish with players in, late joiner, size limit |

## Tests

RESULTS_PLACEHOLDER

## Falsification (disable the fix, see the test fail, restore)

* `callRound` ignoring `manualStart` -> 4 unit tests fail (modes.test.ts, beacon). Start-not-before-time rule removed -> 2 fail.
* Worker: server-clock check on Start removed -> the skewed-console test fails. `manualWaiting` removed -> 5 fail. `live` removed from the control file -> the follow test fails. Console-first guard removed -> its test fails.
* Phone: `applyLive` commented out -> 4 of 7 phone tests fail.
* Console/screens: Start button enabled before the time -> the page test fails; big-screen manual branch removed -> the same test fails.
* sim2: Start time rule and server-clock check removed together -> 4 of 36 `modes/start` scenarios fail (early Start accepted, refusal text missing, message in file).

## Decisions I made (please check)

1. **Start lead** = the game's existing pause lead (30 s to ~2.7 min by size), so the same proof that "a phone never shows a number a pause should have stopped" holds for Start. Players see a countdown.
2. **No 2-minute set-up grace** after Start (the lead is the grace). Automatic-start games keep their grace.
3. **A game nobody starts** is never started; it stays "waiting" and counts as live for 24 h after its time, then follows the normal end/erasure clock. Same 24 h is also the unplayed-window for the deploy guard.
4. **Settings stay editable past the time for a manual-start game until Start**; the console form then needs a future time only if the time itself is changed.
5. Manual start keeps `PAUSE_MAX_PARTICIPANTS` (2,000), the same as Host calling.
6. The old labels "The software, at the chosen speed" / "A Host presses a button for each number" became "The game does" / "I do (a Host presses a button for each number)" (two existing page tests updated).

## Open questions / not done

* The owner's AI link instructions (`ai-link.ts`, `ai-go.ts`) do not yet mention `startMode`; the AI can send it through settings, but it is not in the guided questions.
* A Host working through the narrow AI link cannot register a signing key, so cannot press Start (same as pressing Next number today).
* Phones that joined before a switch to Host/manual and where no control key exists yet only learn of it when a key is registered; the Worker refuses that switch until the console has been opened once (message in the guide).
* Whether 24 h is the right waiting window for a game nobody starts.
* In this clone git `autocrlf=true` made `trust.html` CRLF, so `ai-enablement.test.ts` ("Trust page equals the facts") fails here; the files are untouched by this work (identical to c1f8c88).
