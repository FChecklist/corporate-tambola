# Game-day clarity (release 1.4.1, branch `wip/gameday`)

Built locally from main (1.4.0 live, c4c0ac4). Nothing deployed or pushed. Triggered by a real customer's two complaints: "closed the game without calling out all 90 numbers" and "as an organizer I couldn't see the number board anywhere".

## What was built
1. **Number board and live strip, always at the top.** Organizer and Host: a big "Number board" button, the numbers called so far (latest big and dark), and "N of 90 numbers called, the latest is X", above every step (`liveBar()` in `zc.js`). Before the start only the button shows. Co-host: the board button (the Co-host console loads no numbers, so no strip there).
2. **How the game ended, in plain words, everywhere.** "All 90 numbers were called." or "All prizes were awarded after N numbers." on the phone page, the big screen (Game over), the console (green "The game is over." bar) and the report e-mail (`endReason`; the old "Every prize was awarded, so the game ended early..." is gone).
3. **PAUSED banner.** Console, every player's phone and the big screen show a big PAUSED banner: who paused (the Organizer / a Host), the time it began, when it restarts by itself and in about how many minutes; the console has a Resume button. Who: the Worker records the role of the signer of every Start / Pause / Resume / Extend / End (`kv ctlby/<eid>`, words only) and sends it in the control file (`by`); phones and screens read it from the file they already poll. Pause now asks "Are you sure? Numbers stop for everybody." (Yes, pause / No, keep playing).
4. **"When every prize is won" radio buttons** in How will it play: (o) Keep calling until all 90 numbers, (o) End the game, one plain sentence each. Setting `keepCalling` (API: `afterPrizes` "keep"/"end"), editable until the start by the Organizer and Hosts like the rest, carried to phones through the control file `live` block, honoured by the phone runtime (`byPrizes` skipped), the big screen, the console, the game record (`whenPrizesWon`) and the "What changed" list. Pause/resume/extend/end/start are also written in that list with who.

## Decisions to check
* **Default.** New games made in the console / Quick setup start with **Keep calling until all 90 numbers** (the safest: no player is ever told the game stopped early). Games made before this release, and games made through a path that does not send the answer (the AI link, old callers), keep the OLD rule (end when the prizes are won) until the Organizer chooses; the console shows the true saved value for them.
* Switching it on a published game with people already in and no signing key registered is refused kindly ("Open your console once first"), because phones only hear of it through the control file.
* The Co-host gets the board button but not the live strip.
* Board page (`board.html`) itself was not changed.

## Tests (single files, one at a time, per the RAM rule; no full suite, no sim2)
New: `apps/edge/test/gameday.test.ts` (5), `apps/web/test/gameday-pages.test.ts` (5: top bar and strip, Pause confirm + PAUSED banner + Resume, phone and big screen PAUSED banner, "All 90 numbers were called." on console + phone + big screen, the radio question), a phone-runtime test for keep-calling (numbers go on past the last prize to the 90th, only then ended, not "by prizes"), a `modes-phone` test for `pausedInfo`, `modes-guide` (+1 message).
Updated for the new wording/behaviour: `idiotproof-steps-7-10` (Pause confirm), `modes-pages` (6 sentences), `worker.test` (join keys include `afterPrizes`).
Touched-file results after the last edit: pages 143/0, idiotproof-steps-3-4 12/0, 5-6 13/0, 7-10 8/0, console-frame 18/0, realhousie-pages 4/0, houses-pages 4/0, no-internal-notes 3/0, stop-control 2/0, player-pages 8/0, simpler-console 6/0, ticket-look 4/0, hostcalls-pages 6/0, modes-pages 5/0, gameday-pages 5/0, edge: gameday 5/0, modes 16/0, hostcalls 7/0, ai-go 11/0, ai-link 25/0, unplayed 22/0, retention 6/0, param-config 206/0, real-housie 3/0, gamerecord 3/0, releases 2/0, worker "joining" 10/0; beacon: config 31/0, control 32/0, game 34/0, modes-phone 8/0, phone-runtime keep-calling 1/0, guide 13/0, modes-guide 1/0.

Falsified (fix disabled, test fails, restored): `recordBy` removed (who paused), `keepCalling` not saved, phone `byPrizes` ignoring keep-calling, Pause confirm removed, board button / number strip removed, "All 90 numbers were called." removed from the big screen, phone PAUSED banner removed.

## Not run yet
The full suite and the sim2 matrix (waiting for the live test to end).
