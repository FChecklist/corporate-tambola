# What changed in V2, and why

The owner approved these on **13 Nov 2026**. Each line: the decision, then what was built.

1. **Language, per person.** Each person picks a language for their own view only; it is remembered on their device; English is the default. Built as string files (`apps/web/public/lang/`), English and Hindi. Hindi covers the core player phrases and the new panel; the rest stays English until translated. A new language is one new file.
2. **Receipts and payment history**, by e-mail and in the organizer's and the Host's game history. The payee on every receipt is IT SERVICES BY RAJAT AGARWAL via Razorpay. A Host (or an AI key) sees the history without payment secrets.
3. **Certificates** for winners: name or ID, game id, ticket number, prize or line, and a link anyone can use to check it. A signed, hash-chained record. Mobile and e-mail are never shown; the public check page keeps non-personal facts only. The organizer downloads them.
4. **Data export** by key and from the screen: results, winners, tickets, payments. The promise "all participant information is deleted within 24 hours after the game" is honoured: names exist in an export only until the nightly clean-up (about 20 hours after the game).
5. **The AI's name in the trail.** The game's own trail of AI calls says "AI" or "AI: ChatGPT".
6. **Master key scoped to one game.** A new key kind (`ctg_`) works for one game only and stops 24 hours after it ends; afterwards it can only delete, download, fetch the invoice, or make a new game from the old. The usual sign-in key (`ctk_`) is unchanged on purpose, because narrowing it would lock organizers out of their accounts.
7. **Host key without personal data** (`cth_`): no e-mail, mobile or confirming person; limited rights; ends with the game. **Decision 14 Nov 2026:** the owner keeps `override` (hand a prize to another claimant) on this key.
8. **Support ticket** by key and by screen, kept simple.
9. **"Host presses Next number": NOT BUILT.** The owner said it was not needed. Nothing of it exists.
10. **Claim review** (optional, off by default): the Host approves or rejects a claim with a short reason the players can read. With no Host action the game behaves as before.
11. **Host step-down and hand-over.** A Host can step down (their keys stop, the organizer is told); the organizer can give the seat to someone else; during a live game a hand-over needs the organizer's approval.
12. **Join by ID only.** Players join with an ID, no mobile asked, when the organizer chooses an ID game. The existing join already did this; V2 adds tests to prove it.

**Why the rules of play were left alone:** the number-calling, ticket-making, claim-detection, scoring and winner code (`packages/`, and the join, claim, result, settle, control, over and won routes) has no change at all. V2 only adds things beside it, plus small additive hooks in a few shared files.
