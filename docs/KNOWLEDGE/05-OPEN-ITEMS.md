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
