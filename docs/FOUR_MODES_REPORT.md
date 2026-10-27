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

Full suite (every test file, one at a time, own copy of run-all-tests in the clone, 142 files): **2,850 pass, 3 fail** at the last run (12:25 IST), and one of the three (ai-go, an expectation I had written for a 5,000-person game) was fixed right after and passes (11/11). The two that remain fail the same way on the base commit c1f8c88 because of what the base contains, not this work:
* `apps/edge/test/secrets-list.test.ts`: `OWNER_STATS_KEY` (owner-stats.ts) and `OWNER_LINK_KEY` (prospect-links.ts), added in 1.3.x, are not in `config/SECRETS_NAMES.md` (that file is untouched by this branch). Needs one line each in the list.
* `apps/edge/test/ai-enablement.test.ts` (Trust page equals the facts): this clone has git `autocrlf=true`, so `trust.html` is checked out with CRLF; the files are identical to c1f8c88. Expected to pass in the real folder.

New and changed tests (all pass, each falsified, see below): `packages/beacon/test/modes.test.ts` (15), `modes-phone.test.ts` (7), `apps/edge/test/modes.test.ts` (16, incl. the 1000/1001 boundary for all four modes and the 2000/2001 Start limit), `apps/web/test/modes-pages.test.ts` (5: radio buttons exist with the right names/values, exactly one checked, label wraps input, summary follows the choice, hidden above 1,000 / 2,000, Start button states, phone page, big screen), `modes-guide.test.ts` (1), existing tests updated for the new wording (`hostcalls*`, `pages`, `idiotproof-steps-1-2`, `ai-go`, `worker` join keys), plus sim2 `modes` family: 110 scenarios, seeds 1 and 2, all pass (role x mode x window, Start by Organizer/Host/stranger, double Start, never pressed, time change then Start, switch after publish with players in, late joiner, size boundary 1000 / 1001 for each of the four modes).

Also merged as asked: ticket look 70ba88f + 6aa41ba (Retro/Modern picker) from `wip/ticket-look`, and the draft-limit change (cherry-picked as 17c5f07, from 6f92c7d on `wip/join-redesign`); both have release lines in 1.4.0. The only edit to their files: one comment in `z.css` reworded ("owner order" is a banned word in shipped files).

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
5. **Limits (owner ruling)**: manual PLAY (a Host or the Organizer calls every number) is for games of up to **1,000** people (`MANUAL_MAX_PARTICIPANTS`; the pause limit `PAUSE_MAX_PARTICIPANTS` 2,000 is unchanged). Above 1,000 the allowed modes are Auto Start + Auto Play and Manual Start + Auto Play; "I do" is hidden in the console and refused by the server (create, settings, mode switch, size increase) with: "Games above 1,000 people are called by the game itself: choose "The game does". You can still press Start yourself." Pressing Start itself needs the signed control file, which exists only up to 2,000 people, so "I press Start" is hidden/refused above **2,000** (plain sentence: "Pressing Start works for games of up to 2,000 people. For a larger game, choose "By itself at the time"."). Owner to confirm that 2,000 is acceptable for Start by hand, or whether Start by hand should work at any size (it cannot without a different design: the key registration is refused above 2,000).
6. 6. The two questions are radio buttons with one plain sentence under each option and a live "Your game: ..." summary line; labels are "By itself at the time" / "I press Start" and "The game does" / "I do".

## Open questions / not done

* The AI guided flow (`ai-go.ts`) now asks "How does it start?" (new `sm` choice, summary line, saved as `startMode`) beside "Who calls the numbers?"; the long AI-link instructions text (`ai-link.ts`) was not changed.
* A Host working through the narrow AI link cannot register a signing key, so cannot press Start (same as pressing Next number today).
* Phones that joined before a switch to Host/manual and where no control key exists yet only learn of it when a key is registered; the Worker refuses that switch until the console has been opened once (message in the guide).
* Whether 24 h is the right waiting window for a game nobody starts.
* In this clone git `autocrlf=true` made `trust.html` CRLF, so `ai-enablement.test.ts` ("Trust page equals the facts") fails here; the files are untouched by this work (identical to c1f8c88).
