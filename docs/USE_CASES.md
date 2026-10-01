# Corporate Tambola: use cases, exceptions and what can go wrong

Every row has an ID. The tests carry the same ID in their names (`UC-12 ...`), so `grep "UC-12"` finds the test.
Automated tests live in `apps/edge/test/usecases.test.ts` (server and money), `apps/edge/test/free-launch.test.ts` (the organizer journey),
`packages/beacon/test/phone-runtime.test.ts` (phones, timing, pauses) and `tools/sim/*` (crowds and real-time runs against the real public beacon).
"Live" rows were run against https://corporate-tambola.pages.dev.

## The business rule
Building and publishing are free. The organizer pays before the start time. If it is not paid by the start, the engagement does not begin.

- **Case 1.** Published, organizer did not pay, engagement did not start: no loss to us, nothing was delivered, the organizer can create a new engagement next time. (UC-10, UC-11)
- **Case 2.** Published, organizer paid: we are paid, the engagement runs, the organizer can create a new engagement next time. (UC-9, UC-14)

## A. Organizer: getting in
| ID | Scenario | Expected |
|---|---|---|
| UC-1 | New email, "Create Engagement" | Console opens at once, no email sent, AI work link ready |
| UC-2 | Email that already has an account | NOT let in by typing it; must use the e-mailed 6-digit code |
| UC-3 | Wrong code, expired code, 6th attempt, code reuse | Refused with a human message; code dies after 5 wrong tries or 10 minutes |
| UC-4 | Many accounts from one network in a day | 6th is refused (free-plan guard) |
| UC-5 | Invalid email text | Refused |
| UC-6 | Organizer key revoked or made up | Every call refused |

## B. Organizer: building
| ID | Scenario | Expected |
|---|---|---|
| UC-7 | Build by hand, or with the AI link | Saved as a draft; participants cannot see or join it |
| UC-8 | More than 10 drafts | Refused with a clear message |
| UC-8b | Bad input: bad id, cap 0 or 100001, speed not a multiple of 3, rewards/breaks invalid | 400 with a message, nothing saved |

## C. Publish and pay (the money flow)
| ID | Scenario | Expected |
|---|---|---|
| UC-9 | Publish (free) with confirmed email and mobile, then pay before the start | Entitlement created, engagement paid, begins on time, organizer e-mailed the link and what is due |
| UC-10 | Published, never paid, start time reached | Phones hold and show nothing; control says locked; organizer e-mailed once ("could not begin") |
| UC-11 | After UC-10 the organizer comes back later | Can create a new engagement; the unpaid one is forgotten after 30 days |
| UC-12 | Pay AFTER the start time passed | Starts in about 3 minutes for everyone already waiting; phones unlock and read the new start |
| UC-13 | Publish twice, or publish two tabs at once | One publish, no error, no double e-mail |
| UC-14 | Payment confirmed by the gateway webhook only (browser closed) | Same result as paying in the browser |
| UC-15 | Two payments for the same engagement | Second one is not wasted: kept as a credit for the next engagement |
| UC-16 | Pay for someone else's engagement, or with a made-up key | Refused (404 / 403), nothing charged |
| UC-17 | Pay for an engagement that is already paid | Refused (409) |
| UC-18 | Tampered amount, wrong signature, payment not captured | Refused; nothing fulfilled |
| UC-19 | Draft was forgotten (30 days) before the payment arrived | No crash; the money becomes a credit |
| UC-20 | Engagement bigger than any pack (over 10,000) | "Custom arrangement" message, no checkout |
| UC-21 | Cap raised after payment above the pack | Refused until a bigger pack is bought; lowering below people already joined refused |
| UC-22 | India: GSTIN missing or wrong shape | Refused by the server, not only the page |
| UC-23 | Payments not switched on | Clear "opens soon" message; engagement stays published and holds at the start |
| UC-24 | Publish after the start time has passed, or start time in the past | Refused: "choose a new start time" |
| UC-25 | Unpaid engagement moved to a new start time, including after the old one passed | Allowed; paid one cannot be moved after it started |
| UC-26 | Daily reminder | One e-mail, only for unpaid published engagements starting within 36 hours; none for paid, far-future or already started |
| UC-27 | A pack was already bought (credit) | Publishing is paid at once |

## D. Participants (phones)
| ID | Scenario | Expected |
|---|---|---|
| UC-28 | Join a draft | Refused ("not open yet"); its info is hidden too |
| UC-29 | Join a published engagement before payment | Allowed; they get a ticket and wait |
| UC-30 | Same number twice, different formats of the same number | One participant, same ticket |
| UC-31 | Invalid or too short number | Refused with a human message |
| UC-32 | Engagement full, even with many joins at the same instant | Never more than the limit |
| UC-33 | Invite-only engagement, number not on the list | Refused |
| UC-34 | Name with markup or too long | Cleaned and cut |
| UC-35 | Phones never learn who else joined, or why it is held | Only counts and ids; the hold message never mentions payment |

## E. Timing and the game itself
| ID | Scenario | Expected |
|---|---|---|
| UC-36 | Numbers appear exactly at their round, never early | Phone test |
| UC-37 | Every phone shows the same numbers as the public reference | Phone test and crowd simulation |
| UC-38 | Locked, then unlocked | Nothing shown while locked; carries on after |
| UC-39 | Start boundary: one second before and exactly at the start | Not locked before; locked from the start |
| UC-40 | Signed pause, resume, stop | Nobody sees a number during a pause |
| UC-41 | Lock and a pause together | Still held, nothing revealed |
| UC-42 | Beacon unreachable, a lying mirror, a phone offline | Nothing invented; exact catch-up |
| UC-43 | Phones that open late | Same log as everyone |
| UC-44 | Real clock, real public beacon, a signed pause (live) | All phones agree |

## F. Exceptions: what can go wrong
| ID | Scenario | Expected |
|---|---|---|
| UC-45 | Mail service down | The request still succeeds; the mail is kept and retried; never blocks a sign-in or publish |
| UC-46 | Daily write budget reached | A polite "busy" answer, no half-saved state |
| UC-47 | Housekeeping fails | Never breaks a user request |
| UC-48 | Oversized body, malformed JSON | Refused cleanly |
| UC-49 | Organizer A reads or changes organizer B's engagement | Refused |
| UC-50 | The AI key tries to publish, pay, erase, settle, manage keys | Refused (it can only hand over the link) |
| UC-51 | Erase all participant data | Done on request; 365-day purge also removes flags and contact details |
| UC-52 | Claim for something not completed | Not accepted |

## G. Pages (browser)
| ID | Scenario | Expected |
|---|---|---|
| UC-53 | Landing page, all five steps, Create Engagement buttons | Live check |
| UC-54 | Console: two options at the top, draft card, payment-due card, locked card, big-screen link | Live check |
| UC-55 | Payment page: order summary, billing form, validation, test/off/razorpay modes | Live check |
| UC-56 | Big screen: countdown, big number, board, paused | Live check |
| UC-57 | Phone page shows "waiting for the organizer" when locked | Live check |
| UC-58 | Mobile width and tablet | Live check |
