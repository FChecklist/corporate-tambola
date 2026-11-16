# Tambola V2: the knowledge in one place

Branch `tambola-v2`, built from the live version **c6897f2**. Written 14 Nov 2026. **Nothing here is deployed.** The pull request is for reading and keeping the knowledge safe; it is not to be merged until the owner decides, and merging is not a deploy.

## In plain English

Tambola V2 adds twelve things the owner asked for on 13 Nov 2026, and leaves the rules of play exactly as they were. Organizers can make a key that works for ONE game and stops a day after it ends, and can download their game's data. They get receipts, certificates for winners, and a support ticket. Hosts can be given a key without any personal details, can approve or reject a claim with a short reason, and can step down or hand over. Players choose a language for their own screen, and can join with just an ID. Calls made by an AI are named in the game's trail. Every change was tested, and nine rounds of independent checking by people who had not built it found and closed a series of key-and-permission problems. The last two rounds, in a row, found nothing that should stop a deploy.

One question was the owner's and is now decided (14 Nov 2026): a winner's name, mobile, e-mail (if available), game id and ticket number are kept 365 days, as the Terms and Conditions already say; the 24-hour limit applies only to the game key's access after a game ends. V2 does not use that kept copy and does not change it. A few V2 wording lines still need review against this ruling (see 05-OPEN-ITEMS.md).

## The pages

| Page | What it answers |
|---|---|
| [01-WHAT-AND-WHY.md](01-WHAT-AND-WHY.md) | The twelve owner decisions (with dates), what each became, and the item not built |
| [02-WHERE.md](02-WHERE.md) | Files, routes, tables, and the key-and-route table |
| [03-HOW.md](03-HOW.md) | How it was built and tested, how the nine audit rounds worked, how to run the full suite one file at a time, how to roll back |
| [04-RESULTS.md](04-RESULTS.md) | Test counts, and the comparison with the live version |
| [05-OPEN-ITEMS.md](05-OPEN-ITEMS.md) | What is still open: the winner-data question, two older problems on the live version, and small leftovers |
| [06-DEPLOY-AND-ROLLBACK.md](06-DEPLOY-AND-ROLLBACK.md) | The deploy plan and rollback steps as written (not run) |
| [OWNER-NOTE.md](OWNER-NOTE.md) | The note written for the owner, in plain words |
| [HANDOVER.md](HANDOVER.md) | The builder's hand-over note |

Other documents in `docs/`: `V2_CHANGE_PLAN.md` (the plan and "As built"), `V2_ROUTE_TABLE.md` (every route that takes a key), `PROGRESS-V2.md`, `AUDIT-V2-ROUND-1.md` to `AUDIT-V2-ROUND-9.md`.

This is a public repository: no keys, tokens, personal addresses, phone numbers or prices are in these pages. Test data in the tests are made-up values.
