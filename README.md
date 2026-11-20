# Corporate Tambola

Local-first project. Start with `docs/NOTES.md` (what the sources say, gaps, decisions) then `docs/IMPLEMENTATION.md` (build plan).
`reference/prototype/corporate-tambola-complete.html` is the clickable prototype (source of truth for screens and wording).
**The site is live** on Cloudflare Pages (project `corporate-tambola`, database `corporate-tambola`). What is live right now is in `/version.json` on the site (the commit and the build time); the last deploys are listed in `docs/DEPLOYS.md`. Whether payments are real follows the site's TEST / LIVE mode (`/api/mode`).


See [KNOWLEDGE-MAP.md](KNOWLEDGE-MAP.md) for what this repository is for and what the other repositories are for (updated 14 Nov 2026).

## Owner rules, 20 Nov 2026

The owner's decisions for every Corporate Games product. Full text: `plans/ID-INVITE-AND-ARCHITECTURE-RULES-2026-11-20.md` in the private `marketing-ledger` repository (FChecklist/marketing-ledger). If this README and that file disagree, that file wins.

- **One login.** home.corporatetambola.com is the only login gate. No game or page has its own login: if one exists it is hidden or redirects there. Players joining by game link are not "logged in".
- **One console for all games.** console.corporatetambola.com, for organizers and hosts only: set up, invite, pay, approve, monitor. Settings flow console to game by API; the game keeps no copy of the rules.
- **One credit and payment system, one chatbot.** Payment and credits through moneypenny.corporatetambola.com; chat through moneypennychat.corporatetambola.com. All systems are independent and joined by API. An AI helper uses only the limited AI key and never confirms an irreversible step itself.
- **Console and game are separate.** The console is for set-up and running; the game is for playing, each game with its own website and rules.
- **Invite by ID only.** The ID is ONE alphanumeric field (employee, associate, vendor or customer ID are the same thing, wording only), with no choice menu and no names or mobile numbers. The organizer pastes or uploads one ID per line; a person who opens the game link and enters a listed ID joins and plays; an unlisted ID waits for the organizer or host to approve or decline. "Anyone with the link" is not offered. Family invite is optional (each listed person may invite 1 to 10, default 4, with approval). Only the organizer and hosts see the list, the invite chain and the log of joins, approvals and declines.
- **ID normalisation and deletion.** Every character that is not a letter or digit is removed and the rest is upper case, so A-1101, A 1101 and A/1101 are all A1101, at upload, join, approval and matching. The list and all IDs are deleted within 24 hours after the game ends.
