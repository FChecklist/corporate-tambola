# One plain story for everybody (release 1.4.3)

Every screen (the player's phone, the big screen, the Organizer's and the Host's console, the Co-host's page) works out the state of the game and reads its words from ONE place, `packages/beacon/src/story.ts` (`ZG.story`). So the sentence for what is happening is the same on every screen; only what each person should do differs. A test (`packages/beacon/test/story.test.ts`) keeps the table complete and in plain words, and page tests (`apps/web/test/story-pages.test.ts`) check the same sentence on the console, the phone and the big screen.

Where it shows: a boxed line at the top of the console game screen (`#storyline`), at the top of the player's page, under the title on the big screen, and at the top of the Co-host's page.

Examples use: time `Sat 6:30 pm`, countdown `2:05`, 30 numbers called, paused by `the Organizer`.

## What is happening (same for everyone)

| State | Sentence |
|---|---|
| Before publishing (`draft`) | This game is not published yet. |
| Published, waiting for payment (`unpaid`) | The game is waiting for payment. (Players and the big screen read "The game has not started yet.": they never see money words.) |
| Published and paid, waiting for the start time (`waiting`) | The game starts at Sat 6:30 pm. |
| Countdown to the first number (`countdown`) | The game is starting in 2:05. |
| Start time reached, nobody has pressed Start (`waitStart`) | Waiting for the host to begin the game. |
| The game is on (`running`) | The game is on. Numbers called: 30 of 90. |
| Paused (`paused`) | The game is paused by the Organizer. |
| Finished early: every prize was won (`endedPrizes`) | The game is over. All prizes were awarded after 30 numbers. |
| Finished: all 90 numbers were called (`endedAll`) | The game is over. All 90 numbers were called. |
| Ended by the Organizer (`endedByOrganizer`) | The game was ended by the organizer after 30 numbers. |
| Never started (`neverStarted`) | The game was never started. |
| Cancelled (`cancelled`) | This game was cancelled by the organizer. |

## What to do (state x role)

| State | Organizer | Host | Co-host | Player | Big screen |
|---|---|---|---|---|---|
| Before publishing | Finish the steps and press Publish. | Finish the steps and press Publish. | Wait for the Organizer to publish. | This game is not open yet. | This game is not open yet. |
| Published, waiting for payment | Pay in step 8 so the game can start. | Pay in step 8 so the game can start. | Anyone can pay for the game: see the Payment step. | Please wait. The organizer has not started the game yet. | Please wait. The organizer has not started the game yet. |
| Published and paid, waiting for the start time | Nothing to do yet. Share the link and keep this page open. | Nothing to do yet. Share the link and keep this page open. | Invite your people and keep your link ready. | Keep this page open. The numbers start by themselves. | Players: open the link below on your phone to get your ticket. |
| Countdown to the first number | Get ready. The first number is coming. | Get ready. The first number is coming. | The game is about to begin. | Get ready. Keep your screen on. | Get ready. Keep your screen on. |
| Start time reached, nobody has pressed Start | Press Start, or change the start time. | Press Start, or change the start time. | The Organizer or a Host will press Start. | Keep this page open. The game begins the moment the host presses Start. | Keep this page open. The game begins the moment the host presses Start. |
| The game is on | Watch the board. Pause only if you really must. | Watch the board. Pause only if you really must. | The Organizer and the Hosts run the game. You can follow it on the Number board. | Tap each number on your ticket. Press Claim when a prize is complete. | Watch the numbers. Players tap them on their tickets. |
| Paused | Press Resume when you are ready. | Press Resume when you are ready. | The game will go on when the Organizer or a Host resumes it. | Please wait. The numbers start again when the game is resumed. | Please wait. The numbers start again when the game is resumed. |
| Finished early: every prize was won | Download the game log and hand over the prizes. | Download the game log and hand over the prizes. | Thank you for helping. | Thank you for playing. | Thank you for playing. |
| Finished: all 90 numbers were called | Download the game log and hand over the prizes. | Download the game log and hand over the prizes. | Thank you for helping. | Thank you for playing. | Thank you for playing. |
| Ended by the Organizer | Download the game log and hand over the prizes. | Download the game log and hand over the prizes. | Thank you for helping. | Thank you for playing. | Thank you for playing. |
| Never started | Make a new game like this one. | Make a new game like this one. | Thank you for coming. | Thank you for coming. | Thank you for coming. |
| Cancelled | Nothing more to do. | Nothing more to do. | Nothing more to do. | Thank you for coming. | Thank you for coming. |

(For a game where somebody presses Start, the waiting line for the Organizer and the Host adds: "At that time, press Start.", and for players: "The host will press Start.")

## The counter (everyone)
"Numbers called: N of 90" on the player's phone (with the latest number big and "Before it:" the last five beside it), on the big screen (the same, large), on the organizer's board and at the top of the console (the latest number in a big dark circle, the last five beside it, and the whole row of numbers called so far below). No "idx" or "round" is shown to anybody; "Game 2" appears only in a game of several games.

## Vital details on the console (Organizer and Host), during the game
"Game details" under the counter: Status (the story sentence), Numbers called, People (joined, waiting for your OK, checked in as present), Pauses so far (who, from when, until when), Prizes won so far (prize, **ticket number**, time) and Warnings in plain words (paused, Start not pressed, waiting for payment). Source: `GET /api/z/:id/gamelog`, tickets by number only.

## The game log (after the game)
* Console, "Game log": **Open the game log (print or save as PDF)** and **Download as a text file** (`/gamelog.html?e=ID#k=KEY`, `&txt=1`).
* Contents: start time, first number, end time and length, how it ended, numbers called, how the game ran (Start by hand / by itself, who called, what happens when every prize is won), people joined / most at once / joined late / checked in, every prize with ticket number, call number and time, every pause with who and when, every change to the settings with who and when, the report e-mail status, and every number called with its time (worked out in the page from the public random numbers, as every phone does it).
* **Saved when the game ends** (`kv glog/<id>`, written by the report pass in `lifecycle.ts`, marked "sent" when the e-mail goes out): it survives the 20-hour deletion of the players' details and is deleted with the game at 365 days (`deleteEngagementRows`). While the game runs the same document is built live.
* **No names, mobile numbers, e-mail addresses or keys**, anywhere (tested). The Organizer, the Organizer's AI and the platform can read it; a Host too; a **Co-host sees their own part only** (how the game ended, in one line, and how many people they brought, on their own page); players and strangers get a refusal.

## Pause is harder to hit and clearer when on
* The button reads "Pause the game…". A box asks "Are you sure? Numbers stop for everybody." and the "Yes, pause the game" button stays off until the person ticks "I understand: the numbers stop for every player until I press Resume."; the focus starts on "No, keep playing".
* When on: a big PAUSED banner on the console (with who, since when, until about when, and a Resume button), on every phone, and on the big screen; the story sentence says "The game is paused by the Organizer." everywhere, and the vital details list the pause.

## The claim rule (all four modes, every prize)
A prize completed on number N can be claimed only until number N+1 is announced. The Worker's clock decides (`callTimeMs` of the next number): a claim before it is stored; a claim at the very instant of the next number, or after it, is refused with **"Ohooo! 😊 Sorry, you pressed Claim after the next number was announced. This claim cannot be made."** and nothing is recorded (`code: "claim-late"`, the same words on the phone). On the player's phone the gold alert ("You have completed Top Line!" / "Press Claim now, before the next number is called."), the big fixed "Press to claim your prize" button and the gold Claim buttons exist only while the completing number is the latest one, and the alert and the big button also go while the game is paused or finished (the Claim button in the card stays, because a paused game's next number has not been announced). After the press the bar says "Claim sent. Checking…". A short vibration marks the moment a prize becomes claimable.

## The player's page: two designs
* **Phone** (one column, installable app): the story line, the compact counter (medium ball 84 px with "Number just called", "30 of 90 called" and "60 remaining", a thin bar, "Last 5 numbers called"), the ticket as the most prominent card (large numbers, thin cross, Retro / Modern choice on the title line, Sneha's three rules under it), the claim buttons with their hint, the prizes panel (still to win in gold with how many numbers are still needed; already won in grey, struck through, "Won by Ticket 188"), and a fixed Claim button at the bottom.
* **Laptop** (from 861 px): no phone frame, two columns: the ticket on the left; the counter, the claim and the prizes on the right.
* **Players never see more than the number just called and the last 5.** The phone keeps the whole list internally to check taps and claims. The big screen shows the number just called, the counter and the last 5 (it never showed a board; the organizer's Number board is for the Organizer, Hosts and Co-hosts only). Recommendation: keep it so, because the big screen faces a room of players.
