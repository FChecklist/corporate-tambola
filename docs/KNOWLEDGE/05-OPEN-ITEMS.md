# Open items

## Decided: winner data (K4), 14 Nov 2026
**Owner ruling, 14 Nov 2026 (K4, CLOSED):** a winner's name, mobile, e-mail (if available), game id and ticket number are KEPT 365 days; this is already written in the Terms and Conditions. The 24-hour limit applies only to the game key's access after a game ends, not to winners' data. V2 does not use that kept copy and does not change it.

## Wording to review against that ruling (nothing changed yet; a change needs the owner's go and a new audit round)
These V2 lines say a name is "deleted within 24 hours after the game". They describe the game's own people list (cleared about 20 hours after the game), which is true, but a reader may take them to cover winners' data:

| File | Line | Kind |
|---|---|---|
| `apps/edge/src/v2-certs.ts` | 78 | customer-visible note on the certificates list: "...it is deleted within 24 hours after the game" |
| `apps/edge/src/v2-export.ts` | 58 | customer-visible note in the download: "The names and numbers of this game's players were deleted (within 24 hours after the game, as promised)" |
| `apps/web/public/v2.js` | 72 | customer-visible panel text: "Players' names are included only while the game still holds them (they are deleted within 24 hours after the game)" |
| `apps/edge/src/v2-certs.ts` | 2 | code comment ("before the 24-hour deletion") |
| `apps/edge/src/v2-export.ts` | 2, 3 | code comment ("The 24-hour promise is kept ...") |
| `docs/V2_OWNER_NOTE.md`, `docs/V2_CHANGE_PLAN.md` | items 4, 42, 54 | documents (item 4 reworded 14 Nov) |

Older text on the live version that also says guests' data is deleted within 24 hours (for example the lines in `apps/edge/src/lifecycle.ts`, `apps/web/public/play.js`, `z.js`, `zc.js`, `consent.js`) is not V2 and was not touched.

## Two problems on the live version, found on the way (not V2, unchanged)
1. A Host's AI work link is given the report link, which opens names and mobiles.
2. `POST /api/helpdesk/approve/start` is public and, with an approval token, returns a 30-minute account key.

## Also decided
- 14 Nov 2026: the owner keeps `override` on the Host key without personal data.

## Small leftovers the last audit noted (disclosed, not blocking)
An expired Host key without personal data still opens the static Host manual page (no game data); a person's game key cannot list certificates after the end; the export blanks names beyond 3,000 without a flag; support limits are per account; the 5-key game limit counts expired but unswitched keys; two approvals of one hand-over at the same moment could make two keys; rejection reasons are readable by anyone holding a ticket number; Hindi covers the core phrases only. More in [OWNER-NOTE.md](OWNER-NOTE.md).

## Mail lanes (1.11.0, 21 Nov 2026): what is open
1. Owner steps in `docs/MAIL-DELIVERABILITY-OWNER-STEPS.md`: Resend webhook and its secret, DMARC `rua=`, Gmail Postmaster Tools, plan upgrade or the Cloudflare route. Until the webhook is set, no delivery state arrives and no address is ever put on the do-not-mail list by a bounce.
2. Migration `0033_mail_lanes.sql` must be applied before the deploy.
3. Marketing mail sent by OTHER products from the same Resend account or the Cloudflare account is not counted here; the lanes protect only mail sent through this site's `sendMail`.
4. The monthly count follows the calendar month (UTC); the provider's own month may start on another day.
5. Audit fixes, same release (see `09-RELEASE-1.11.0.md`, "After the first two audits"): still open by choice: a bot check (Turnstile, needs the owner's keys) on the Refer & earn code and the sign-in code; a `List-Unsubscribe` header on bulk mail; a game-level hostile-join test (audit 2, L9); an owner e-mail for the 80 % and 100 % alerts (today a log line only); the console's automatic one retry of a refused Host press (audit 2, L5, not checked in this pass).

## Open since 20 Nov 2026 (RCA of the Rs 1 live payment, `docs/RCA-NO-INVOICE-MAIL-2026-11-20.md`)
1. Mail refusals: after the 1.9.1 deploy, read `mail_event` rows `send_failed <status> <error name>` to learn why the mail service refused three of the four mails of that payment (shared Resend account: rate limit or quota is the leading, unproven, cause).
2. No Razorpay webhook has reached the game or IT Services since 21 Oct / 15 Oct 2026: check the webhook URL and secret in the Razorpay dashboard (owner step).
3. The invoice mail accepted for the owner's own mailbox at 13:28 UTC on 20 Nov was not found in Inbox or Trash: the owner checks Spam.

## Release 1.11.0 (21 Nov 2026): what is open
See `09-RELEASE-1.11.0.md`, section Open: migration 0033 before deploy, the Cloudflare route secrets, the Resend webhook and DMARC `rua=`, the real `MAIL_MONTHLY_QUOTA`, and two audits on the exact head commit.

## Release 1.11.1 (21 Nov 2026): what is open
See `10-RELEASE-1.11.1.md`, section Open: two audits on the exact head commit, then a deploy. Still open by choice: a bot check (Turnstile) on the Refer & earn code and the sign-in code; the sign-in code has no site-wide cap; owner e-mail for the 80 % and 100 % alerts; `List-Unsubscribe` on bulk mail; a game-level hostile-join test; (the test files and `tools/` that used the owner's address as a fixture were cleaned in 1.11.2).

## Release 1.11.2 (21 Nov 2026): what is open
See `11-RELEASE-1.11.2.md`, section Open: two audits on the exact head commit, then a deploy. The caps are a ceiling, not a lock: with many networks and many helper accounts the site-wide caps (30 data-request mails to the owner a day, 30 Help Desk invitations an hour) can still be filled, and then real helpers wait. The owner's old address is still in the history of git (a pull request cannot remove it). Still open by choice: Turnstile, `List-Unsubscribe`, owner e-mail for the 80 % and 100 % alerts, a site-wide cap on the sign-in code.

## Release 1.12.0 (24 Nov 2026): what is open
See `12-RELEASE-1.12.0.md`, section Decisions and open points: two audits on the exact head commit, then a deploy (which also ships 1.11.1 and 1.11.2, merged but not live). The owner decides about the word "erased" in the trust line (the 1 Nov order says never) and whether the dollar prices follow the rupee ones.
