# Open items

## Waiting for the owner
1. **Winner data, 365 days against 24 hours (consent K4).** The site already keeps a winner's sealed name and mobile for 365 days under an existing consent, while the site promises that all participant information is deleted within 24 hours. V2 does not use that copy and does not make it worse. **Not yet decided.**

## Two problems on the live version, found on the way (not V2, unchanged)
1. A Host's AI work link is given the report link, which opens names and mobiles.
2. `POST /api/helpdesk/approve/start` is public and, with an approval token, returns a 30-minute account key.

## Decided
- 14 Nov 2026: the owner keeps `override` on the Host key without personal data.

## Small leftovers the last audit noted (disclosed, not blocking)
An expired Host key without personal data still opens the static Host manual page (no game data); a person's game key cannot list certificates after the end; the export blanks names beyond 3,000 without a flag; support limits are per account; the 5-key game limit counts expired but unswitched keys; two approvals of one hand-over at the same moment could make two keys; rejection reasons are readable by anyone holding a ticket number; Hindi covers the core phrases only. More in [OWNER-NOTE.md](OWNER-NOTE.md).
