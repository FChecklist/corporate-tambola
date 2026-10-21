# Guided errors: what a person sees when something does not work

Written 2026-10-21 for the owner. No technical knowledge is needed.

## The rule

A person is never left with a bare error. Every mistake or failure gets:

1. **A polite title** that says what happened in plain words (never a code, an address or a technical word).
2. **A short explanation** and **numbered steps** that say exactly what to do.
3. **A button that takes them to the exact place** (the right box, outlined and ready to type in, or the right step of the console).
4. **A way back:** when the fix is on another step, a "Done? Back to ..." button returns them to where they were working, and what they typed is still there.
5. The error is **recorded for you** (see `docs/ERROR_LOG.md`) with a reference the person can quote. No names, numbers or typed text are recorded.

The rules of the game are never changed by any of this. The server still decides; the guide only explains.

## Where it appears (the answer to "pop-up or what?")

| Kind of situation | How it is shown | Example |
|---|---|---|
| **A slip in something typed or chosen** | **In place**, right where the person is working, with the box outlined. No pop-up. | an e-mail without an @, a mobile number with a digit missing, 0 players |
| **The person cannot go on from here** | **In place** with the way forward (or a pop-up when the person must go elsewhere) | game full, ticket on another phone, game cancelled, sign-in needed |
| **Nothing is wrong, it needs a little time** | **A pop-up** that says nothing is lost, with Try again | too many tries, service busy, internet dropped, payment being confirmed |
| **Something failed on our side** | **A pop-up** that says it is not the person's doing, offers Try again and a WhatsApp message with a reference | a server failure |
| **A greyed-out button** | A line under it says exactly what is still needed | "Still needed before this button works: fill in Your e-mail; tick the agreement." |

A guest on the game page never gets a button into the Organizer's console, and the wording is for a guest ("This game is full. Please tell the Organizer...").

## What was tested, in real Chrome with Playwright

Real mistakes made by each role, with the screen checked for the guide, the steps, no technical word, the exact box landed on, and the fix then working:

- **Organizer:** sign-in (empty or bad e-mail, wrong or short code), players 0 / empty / over 10,000, Host and Co-host details (six different slips, each pointing at its own box), publish (greyed-out button, bad e-mail), pay page, take-me-there-and-back across steps, adding people (a wrong number corrected on the spot, a repeat, too many), logo that is not a picture or over 5 MB, an empty message to everyone, a failed save (server failure, too many tries, internet down) and Try again.
- **Host:** first sign-in (bad e-mail, wrong code, short code).
- **Participant:** join form (short number), a list-only game, a full game, the same number on a second phone, a cancelled game, a game not open yet, a mistyped link, a wrong personal link.
- **Payer:** a stranger on a pay link, the Organizer's pay page.
- **Partner:** the Refer and earn sign-up.
- **Every screen:** no two elements share an id, and tapping a text box, a label or a tick box never runs a button's action.

Every message the server can send has a guide: a test fails if a new server message is added without one (`apps/web/test/guide.test.ts`), and another fails if any wording contains a technical word or blames the person.

## Real faults this found and fixed

1. **The partner sign-up page had two elements with the same id.** Tapping any text box, label or the tick box ran "Get my link", so a person who only tapped the phone box saw "Please tick the box to join".
2. **After a mistake, the partner form wiped everything the person had typed and the tick.** It now keeps them.
3. **On the pay link page the agreement tick was lost after every mistake** (the place that remembers ticks was never created there).
4. **A smooth-scrolling message could slide a button under the person's finger.** Scrolling is now instant and only happens when the message is out of view.
5. **A closed pop-up came back by itself** when the screen redrew. It now appears once per failure.
6. **An unpublished game's link said "Could not reach the engagement. Check your connection."** It now says the real reason.
7. **The console replaced real messages with blunt ones** ("You are not allowed to do that"). Fixed.
8. **A catalog fragment ("You have") was so generic that a removed guest was shown the guide about "unpublished drafts".** Fragments are now tested for being specific.
9. **A greyed-out Publish or Pay button gave no reason.** It now says what is still needed, including an e-mail with a typing slip.

## Not covered yet, said plainly

- The tests cover the most common real mistakes of every role (about 130 checks in 15 scenarios), not every single combination of every screen. The next mistakes found in real use are recorded automatically by the error log and can be added as tests by your AI.
- One scenario (S02-01) depends on the time of day (the "7 pm" chip on the same day) and can fail in the evening; it passes otherwise.
- A first page opened in a fresh browser can send a form's request more than once in the test setup. This was seen in tests only and could not be traced to the product; the error log would show it if real people hit it.
- The other games, the DPDP product and the Startup Coach site are separate. See below for their status.

## For your AI: how to add a new message

1. Add an entry to the catalog in `apps/web/public/guide.js` (what happened, what to do, where to go). Use a fragment of the message that is specific (at least 14 characters).
2. Run `bun test apps/web/test/guide.test.ts`: it fails if a server message has no guide, if wording is technical or blaming, or if a fragment is too generic.
3. Add the mistake to `tools/sim2/scenarios/ui/s16-faults.mjs` and run `node tools/sim2/scenarios/ui/run.mjs --only S16-`.
