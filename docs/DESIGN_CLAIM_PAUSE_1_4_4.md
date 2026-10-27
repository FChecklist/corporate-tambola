# Design note for 1.4.4: "a claim pauses the game for everybody, then it carries on"

For the owner and the boss. Plain words. Written 27 Oct 2026. Nothing here is built; 1.4.3 does not change the schedule.

## What the owner wants
A player presses Claim in time. The numbers stop for everybody. The game checks the claim. When the answer is final, the numbers carry on, and the next number comes a full 12 seconds after that moment. Everybody sees plain pop-ups. A game never stays stopped for ever.

## The facts that decide the design
1. **The numbers come from a public random feed, one round every 3 seconds.** Number k is made from the feed's round that the schedule names for k. So the schedule decides WHICH number it is. If the schedule of a number is changed after some phones have already shown it, those phones and the others no longer agree. A pause can therefore only change numbers that nobody has been shown yet.
2. **Phones are not told things instantly. They ask.** A phone asks the game "any pause?" every 5 to 9 seconds in a small game, about every minute in a game of 2,000 people, and every 1.5 to 2 minutes in a very large game. So a pause can reach everybody only after that time. That is why every pause today takes effect a few seconds to a few minutes after it is signed (about 40 seconds for a small game).
3. **Only the Organizer's or a Host's key can sign a pause.** The game's server holds no signing key on purpose: nobody, not even us, can change the numbers or stop a game from the server side.
4. **The claim rule is already exact (1.4.3).** A claim made before the next number is announced (the server's clock) counts; at the very instant or after, it does not. Checking a claim needs no waiting: it is worked out from the public numbers and is the same on every phone.

## What this means for "pause at once"
A pause started by a claim cannot stop number N+1, which comes only 12 seconds later, because most phones will not have heard of the pause by then (fact 2). It could only stop numbers a minute or more later. So "everybody freezes the moment someone claims" cannot be made true for every phone without a way for the server to push to phones, which does not exist and would cost a lot at 1,000 or more phones.

## The three options

**A. The server signs a short "hold" (needs a new key).**
The game's server gets its own signing key. Phones are told to trust it for ONE thing only: a short hold of at most 20 seconds, at most once per prize, never "end". When a valid claim arrives, the server signs a hold that starts a safe lead later (about 40 seconds in a small game, longer in a big one) and ends by itself.
- Good: no person has to press anything; the same signed message on every phone, so everybody stays in step.
- Risks, in plain words: (1) if that key were stolen, someone could slow any game (not change a number, not end it, not see a player): that is why it may only sign holds, short and rare, and phones refuse anything else. (2) It does not stop the next number at once: the hold begins 40 seconds later, so the "pause" is not felt at the moment of the claim. (3) A player could try to cause holds with claims: only claims that arrive in time AND are correct would count, and a wrong claim already costs a Bogey. (4) It adds a secret to guard and to rotate.

**B. A rule worked out by every phone from the public claims (no new key).**
Every phone sees the public claims and shifts the schedule by a fixed hold after a correct claim.
- Good: no new key.
- Risks: phones learn about claims only when they ask (10 to 60 seconds), so they would shift the schedule at different moments and would show DIFFERENT numbers for the same call (fact 1). This breaks the fairness of the game. **Not recommended.**

**C. No pause. Keep the exact claim window and add the pop-ups (what 1.4.3 does).**
The claim window is 12 seconds, exact, decided by the server's clock. Anyone who completes a prize can claim before the next number. Everybody gets calm pop-ups: "Ticket 214 has claimed Top Line. Checking now", then "correct, congratulations" and "Top Line has been won", or "was not correct". Checking is instant.
- Good: no new key, no change to the numbers, works at every size, nothing can drift. Tied claims on the same number are already shared correctly.
- Risks: nobody gets extra time: a player who is slow still loses to the 12 second window. The owner has accepted the strict window.

## Recommendation
Ship **C** now (done in 1.4.3). If the owner still wants a visible stop after a claim, build **A** in 1.4.4 with these limits: hold at most 20 seconds, once per prize, only for correct claims, signed by a key that can sign nothing else, a hold that starts after the normal lead (so it never needs an instant push), and a record of every hold in the game log. After a hold, the next number comes a full 12 seconds after it ends (a small change to the schedule, written and tested for all four modes). Do **not** build B.

A decision is needed from the owner before 1.4.4: is a short hold that starts about 40 seconds after a claim (not at the moment of the claim) what they have in mind? If they need the numbers to stop at the very moment of the claim, no design here can do it for every phone.
