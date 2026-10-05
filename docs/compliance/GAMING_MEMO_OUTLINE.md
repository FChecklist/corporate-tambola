# Gaming and prize-promotion memo: outline for the lawyer (G-05)

DRAFT FOR LAWYER REVIEW. This is an outline of the questions, not an opinion. It matches the product as built: a private tambola for a closed group, free for players, prizes provided and handed over by the organizer, the software decides winners from public random numbers, the company never holds money or prizes for players.

## 1. Facts to give the lawyer
* Players never pay anything, directly or indirectly (no entry fee, no purchase, no donation). Terms forbid organizers from charging.
* The organizer (a company or an individual 18+) invites people they know; invitations are limited.
* Prizes are provided and handed over by the organizer. We record "prize given" ticks only.
* Winners are decided by the software from public random numbers (drand); nobody can choose a number or a winner.
* Organizers pay us a software fee per engagement. We do not take a share of anything.
* Winners' details (name, mobile) are kept sealed for 365 days for the hand-over.
* The service works in any country; Indian rupees and US dollars prices.

## 2. Questions
1. **India.** Is a free, closed-group, prize game with no consideration from players outside the online-gaming rules (Promotion and Regulation of Online Gaming Act 2025 and the 2026 Rules)? Should we seek a determination or written confirmation? Is "online social game" or "e-sports" a closer fit, and does it matter?
2. **State laws in India** (for example the Maharashtra Prevention of Gambling Act 1887 and the Telangana and Tamil Nadu regimes): any state where a free closed-group game with prizes is a problem? Any state where the organizer's own conduct matters (prizes bought with company money)?
3. **Tax in India.** Prizes above INR 10,000: TDS on winnings (the organizer's duty as the payer?). Perquisite rules when an employer gives a prize to an employee. GST on prizes given by a company. What must the organizer guide say?
4. **United States.** Sweepstakes and promotion rules: no purchase necessary and free alternative method of entry; states with registration and bonding (New York, Florida, Rhode Island) above a prize value; skill versus chance; employee and family exclusions. Is a closed-group private game outside these rules?
5. **EU and UK.** Gambling Act 2005 (private and non-commercial gaming) and the EU member-state rules: is a free private game exempt? Any prize-draw rules for lucky draws?
6. **Lucky draws** inside the game: any difference from the tambola houses?
7. **Minors.** Is "18+ to play, a child may only watch on a parent's ticket and phone" enough in each region (DPDP s9, COPPA, GDPR Art 8)?
8. **Organizer duties.** Is the Terms wording ("allowed under local law", no fee, voluntary, prizes by organizer, stop the service if charged) enough to put legal responsibility on the organizer? Do we need country gating or a warning when an organizer chooses a country outside India?
9. **Our role.** Are we a "service provider" only, with no gaming licence needed, and what must we avoid saying in marketing?
10. **Record keeping.** Do we need to keep game records (results, who won, prize given) for longer than 365 days for tax or gaming reasons?

## 3. What already exists
* Terms, organizer guide, data processing terms, sub-processor list, partner terms: `apps/web/public/*.html` (drafts, see `DRAFTS_README.md`).
* Rules and disclaimer text: `apps/web/public/legal.html`.
* Audit with the legal references: `AUDIT_TAMBOLA.md` (G-05, section (c)).

## 4. What the owner decides after the memo
* Whether to apply for any determination or registration.
* Which countries to allow, warn about, or block.
* Whether the organizer guide needs state-by-state notes.
