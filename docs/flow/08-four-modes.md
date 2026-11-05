# 08 - The four game modes (release 1.4.0)

Mode = **how it starts** x **who calls the numbers**. Two plain questions in the console (step 2, and Quick setup):

| | The game calls the numbers ("The game does") | A Host calls ("I do") |
|---|---|---|
| **Starts by itself at the time** | 1. Auto start, auto play (as before) | 2. Auto start, manual play (callMode "host", as before) |
| **I press Start** | 3. Manual start, auto play | 4. Manual start, manual play |

Settings: `startMode` ("auto" default, "manual") beside `callMode` ("auto" default, "host"). Both live in the game's `config` JSON, the public `/info`, the game record, and the control file's `live` block.

## The Start press (a signed control message)

* Action `go` in the same signed log as pause / resume / stop / next (`packages/beacon/src/control.ts`). Signed by the Organizer's key or any registered Host key, `leadRounds` (10 to 53 rounds, 30 s to 2.7 min, depending on the game size) before the round it names. The named round (`goRound`) is the moment the game begins.
* Software calls (mode 3): number 1 is called in exactly `goRound`; the rest follow at the chosen speed (breaks, pauses and stops apply as always). The usual 2-minute set-up grace is NOT added: the lead is the grace.
* Host calls (mode 4): nothing is called before Start; the Host's first press may come from `goRound` on (a press earlier is refused: "Press Start first" / "Please wait a moment: the game is just starting").
* Before Start every call is a round that never arrives (`Infinity`), so a phone, the big screen and the settlement simply wait. A stop before Start ends the game (`null`).
* **Refusals, all in plain words (`GO_REFUSALS`)**: before the scheduled time ("...To start earlier, change the start time first."), a second Start ("already been started"), Start in an auto-start game ("no Start button"), too little lead. Checked three times: by the signer's own beacon time (every phone applies the same rule when it replays the log), by the Worker's clock (`now < start - 3 s` is refused), and by the single-use rule.
* **Fairness**: unchanged. A Start only chooses WHEN; the randomness of every round at and after `goRound` is still unpublished when Start is signed (lead >= 10 rounds = 30 s), so nobody, the Host included, can choose or predict a number. The game id and the beacon decide the numbers as before.
* **Size (1.4.2)**: manual PLAY (a Host calls every number) works up to **1,000** people. Pressing Start works at **every** size. Up to 2,000 people the control file uses the pause profile of that size. Above 2,000 it uses its own slow, Start-only profile (`startSafetyForCap`): 2,001 to 10,000 people ask about every 67 to 90 s and the Start lead is 65 rounds (3.3 minutes); above 10,000 about every 90 to 120 s and 85 rounds (4.3 minutes). The file is marked `startOnly`: pause, resume, extend and end are refused ("Pause and End are available for games of up to 2,000 people. This game runs without them.").
* **Why no phone can show number 1 before Start, at any size**: in a manual-start game there are no call rounds at all until a verified `go` message is in the phone's log (`callRound` is Infinity), so a phone that has not heard shows nothing. All phones begin together because the lead (`holdAfter + cache + 2` rounds) is longer than the slowest asking cadence plus the cache and the latency, so every online phone has the message before the named round; a slow or offline phone stays in "hold" (it reveals nothing without a fresh answer) and then shows the same numbers like a late joiner. The randomness of the named round is at least `leadRounds` in the future when Start is signed, so nobody can know a number in advance.

## Changes after publishing (same links, no republish)

* `PATCH /api/z/:id/settings` is open to the Organizer, any Host (not a Co-host, not a player) and the Organizer's AI key, until the game starts: for an auto-start game until its time (as before); for a manual-start game until Start is pressed, even past the scheduled time. After the time with no Start the console says "Press Start, or change the start time"; a new future time can be given and Start is then possible only from the NEW time.
* A switch to a mode that needs signed buttons, with people already in and no control key registered yet, is refused kindly ("Open your console once first") because phones can only learn of it through the control file.
* The Worker adds a `live` block (`startRound`, `callSeconds`, `callMode`, `startMode`) to the control file every phone, the big screen and the board already poll (and to the R2 mirror, refreshed on every save). Phones apply it before anything else in the file (`applyLive`) and re-resolve the log (`ControlTracker.reconfigure`); the big screen and board override their info the same way. No stale state: the key, the log and the numbers are untouched.

## What changed, who, when

* Every save is diffed (`apps/edge/src/modes.ts describeChanges`) into plain sentences ("Start time changed from ... to ...", "How it starts: now you press Start (was: by itself)", ...), stored with the role of the changer ("The Organizer", "A Host", "A Host's AI assistant", "The Organizer's AI assistant", "The platform owner") and the time, in `kv chg/<eid>` (last 200). Pressing Start adds "Start was pressed" with who (the signing key says Organizer or Host).
* `GET /api/z/:id/changes` (Organizer, Host, AI; not Co-host, player or stranger) and the "What changed" card on Game day. The last 100 lines are copied into the permanent game record (`settings.changeLog`). No player name, number, ticket, seat or key ever enters it. The internal sealed `audit_log` still records every request as before.

## What players see

Before the time: "You are in. The game starts at <time>" with a countdown and "At that time the host presses Start". At/after the time, no Start: **"Waiting for the host to begin the game"** (phone), "Waiting for the host / The host or organizer presses Start to begin the game" (big screen and board). After Start: "The game is starting" with a countdown (phone chip "Starting in Ns"), then the numbers. A player who joins after the Start round is a normal late joiner; one who joins while it waits is not.

## A game nobody starts (the safe rule)

The system never starts a manual-start game. It stays "waiting" for 24 hours after its scheduled time (`NEVER_STARTED_MS`, `endBoundMs`), counts as a live game for that long (so the deploy guard keeps waiting), and is then treated as ended: the usual 20-hour erasure of guest data follows on the existing clock. The Organizer can at any moment press Start or give a new time. (Open question for the owner: a different window than 24 h.)
