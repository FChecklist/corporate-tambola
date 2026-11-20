# Lifecycle tests: every step of a Corporate Tambola game, in all four start formats

Owner Priority 1, point 7 and Part 2 testing (20 Nov 2026). Code and tests only. Nothing here deploys, touches a live service or secret, or uses real money.

## The four formats

| Key | How it starts | Who calls the numbers |
|---|---|---|
| `A-A` | by itself at the time | the game |
| `A-H` | by itself at the time | the organizer (presses Next) |
| `M-A` | the organizer presses Start | the game |
| `M-H` | the organizer presses Start | the organizer (presses Next) |

## How to run (nothing to install beyond `bun install`)

```bash
bun run test:lifecycle          # about 20 seconds, 150 tests, the real Worker code with an in-memory database
bun run lifecycle:browser       # about 30 seconds, one real Chromium run of one format (needs Chromium; present in the cloud sandbox)
bun test packages apps tools/control-worker   # the whole repository suite
```

## What is tested (each row is run once for EACH of the four formats)

| Step | File (apps/edge/test/lifecycle/) |
|---|---|
| Create; a draft takes nobody | `formats.test.ts` |
| ID list: paste and CSV read by the console's own reader; `A-1101`, `A 1101`, `A/1101`, `a.1101` are one ID; bad IDs refused with a reason | `formats.test.ts`, `edge-cases.test.ts` |
| Join by a listed ID: no approval, no waiting room, any written form | `formats.test.ts` |
| Unlisted ID: waiting room; Organizer APPROVES (person plays); separate case: Organizer DECLINES (no ticket, now or later, the log shows only the ID) | `formats.test.ts` |
| Open ID game (not "only people on the list"): an unlisted ID still waits | `formats.test.ts` |
| Family invite: a guest adds 4 (default); the 5th is refused; limit 1 to 10 (0 and 11 refused); guest's link: the family ID waits for the guest, the 5th is refused; a guest's guest cannot invite | `formats.test.ts` |
| Unique tickets: 200 players, 200 different valid tickets; the same player always the same ticket | `formats.test.ts` |
| Numbers: all 90, each once, random order, different in every game, derived the same way in all formats | `formats.test.ts`, `phones.test.ts` |
| Game starts only when paid: held and locked when unpaid; a wrong signature, wrong order or failed payment pays nothing; one payment confirmed twice = one entitlement; another account cannot pay; pay with credit | `pay.test.ts`, `formats.test.ts` |
| Start: automatic (first number 2 minutes after the time) / by hand (nothing before Start; Start before the time, forged or wrongly signed Start refused; second Start changes nothing) | `formats.test.ts` |
| Organizer calls numbers: no number until Next; 90 presses give 90 numbers; no 91st; a Next in an auto game is refused | `formats.test.ts` |
| Pause and resume: numbers already called never change, later ones move by the pause, a stranger cannot pause | `formats.test.ts`, `permissions-failures.test.ts` |
| Prizes: early five, top, middle, bottom line, corners, full house equal an independent oracle; quorum of phones; a lying minority and a lone phone settle nothing; claims on time, late, repeated; ties in both rules (`share`, `next`) | `prizes.test.ts` |
| Real phone code (`PhoneRuntime`) plays a whole game: 5 phones, the same 90 numbers, all 7 prizes settled | `phones.test.ts` |
| Host / Co-host / guest / stranger / AI key permissions: waiting room, ID lists, log, export, settings, signed buttons | `permissions-failures.test.ts` |
| Failures: late joiner, duplicate join (same phone, second phone, second ID, full game), refresh and reconnect, wrong game link, ticket of another game, 8 phones racing for one ID, double approve, approve then decline, removed person, 201-ID upload | `permissions-failures.test.ts`, `edge-cases.test.ts` |
| Game end, report (made in steps, carries IDs only, link closes at 19 h), erasure job: 20 h after the end everything is gone; a sweep of EVERY table, in the clear, sealed and hashed, finds no ID, name or ticket id | `erasure.test.ts` |
| A manual game nobody starts: never started by the system; its people and IDs are still erased (44 h after its time) | `edge-cases.test.ts` |
| Real browser (Chromium): listed ID joins, reload keeps the ticket, unlisted waits, approve, decline, wrong link, erase | `tools/sim/lifecycle-browser.ts` |

## How the tests are built (so they cannot pass for nothing)
- **Real Worker code** (`handle()`), an in-memory SQLite stand-in for D1, a handed-in clock (no sleeping), the Razorpay stand-in of `param-harness.ts`. The public random beacon is stood in by `sha256("beacon|round")`, the same for server, phones and tests.
- **An independent oracle** (`harness.ts` `oracleIdx`) works out who completes each house from tickets and numbers, without calling the settlement code under test.
- **A sanity check before every "gone" check**: the erasure test first proves the sweep can see the IDs while the game is on.
- **Falsification**: see `docs/STATE.md` (6 checks, each breaks the product code, a named test fails, the code is restored).

## Not covered here (needs the owner or another repo)
See `docs/STATE.md`, "Needs owner".
