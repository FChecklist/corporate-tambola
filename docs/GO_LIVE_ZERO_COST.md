# Corporate Tambola: running it (local now) and going live at zero extra cost (2026-10-01)

Nothing here is deployed. Everything runs locally first.

## 1. Run it locally
```
bun install
bun run build:zgame && bun run build:control      # the phone/organizer bundles (already built and committed)
TEST_MODE=1 PORT=8799 bun run zlocal               # prints the organizer key; TEST_MODE fulfils purchases without Razorpay
```
- Landing page: `http://localhost:8799/` · Organizer: `/zc.html` · Participant: `/z.html?e=<engagement id>`
- Tests: `bun test packages apps tools/control-worker` · Crowd test: `bun run tools/sim/crowd.ts 10000` · Real-time check against the live public beacon: `bun run tools/sim/live-local.ts 5 4`

## 2. E-mail: same system as DPDP, no extra cost
Only the **organizer who bought** is ever e-mailed (purchase confirmation with their key and invoice, and sign-in codes). Participants are reached by mobile number only; the store keeps no e-mail address for them.

We reuse the **Resend account and the already-verified sending domain `veridian-aios.com`** that DPDP uses. No new domain, no new DNS, no new vendor.

What you do (about 5 minutes, because I must not handle API keys):
1. In Resend (same account as DPDP) create a **second API key** named `corporate-tambola`, permission **Sending access**, limited to the domain `veridian-aios.com`. A separate key means Corporate Tambola can never read DPDP's inbound mail, and either key can be revoked alone.
2. When the Worker is created (section 3): `wrangler secret put RESEND_API_KEY` and paste that key.
3. In `apps/edge/wrangler.toml` set `MAIL_FROM = "Corporate Tambola <tambola@veridian-aios.com>"`. Any local part on the verified domain works; nothing needs adding in DNS.
4. Replies: DPDP's inbound webhook receives everything sent to the domain. Set `MAIL_REPLY_TO` to the address you want organizers to write to (for example the Contact page address) so replies never land in DPDP's classifier by accident. If you prefer "do not reply", leave it unset and the mail says to use the Contact page.
5. Check the plan limits on Resend's pricing page before launch. As I understand it the free plan allows about 3,000 mails a month and 100 a day, which is far above our use (one mail per purchase, plus sign-in codes). It also allows one sending domain, which is why we share `veridian-aios.com` rather than adding the future Corporate Tambola domain; confirm both numbers in your account.
6. When the Corporate Tambola domain is bought you may keep sending from `veridian-aios.com`, or add the new domain only if your Resend plan allows a second one without cost.

Mail handling in the Worker: a sent mail leaves no body behind; a mail that could not be sent is kept with any organizer key blanked out and retried once by the daily job; everything is dropped after 3 days.

## 3. Cloudflare (all free plan), when you are ready
1. `cd apps/edge && wrangler d1 create corporate-tambola`, put the printed id in `wrangler.toml`, then `wrangler d1 migrations apply corporate-tambola`.
2. `wrangler secret put ORGANIZER_SECRET` (our platform key), `wrangler secret put PHONE_SALT` (32+ random characters), the Razorpay keys (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`) and `RESEND_API_KEY`. Put the company details in `COMPANY_JSON` (GSTIN, PAN, state code, SAC, address) or invoices stay marked DRAFT.
3. `wrangler deploy`. Pages: create a project from `apps/web/public` (the `_headers` file there sets the security headers).
4. After the domain is bought, route `YOUR-DOMAIN/api/*` to the Worker so phones call the same origin.
5. The Worker refuses politely at 80,000 of the 100,000 free daily D1 writes; one 10,000-person engagement uses about 10,000.

## 4. What the free plan can and cannot carry
- Phones fetch the public randomness directly from drand's mirrors (about 160 requests per phone for a whole engagement); that never touches our free request allowance.
- The control file (pause) is polled by every phone every ~9 s. 10,000 phones is about 4,000 requests a minute: **serve it from a cached static file (R2 or Pages) rather than through the Worker**, or it will use the 100,000 daily Worker requests in about 25 minutes. Not yet wired; design in `AI_LINK_AND_PAUSE_DESIGN.md`.
- Claims are stored only for engagements of up to 500 participants (they never decide winners); larger ones store none.

## 5. Still open
Owner: buy the domain; Razorpay Test keys and webhook URL; company tax details; lawyer review of the 365-day retention and consent wording; voice decision; the Resend key above.
Engineering: cached static control file; real-office/real-phone test; the legacy server-driven mode still exists beside the new one (kept until the new one is accepted).

## 6. Refer & earn (sales partners)
- A partner's code is their **mobile number**; their link is `/?ref=<number>` (30-day attribution, kept in the buyer's own browser). Anyone can join from `/partner.html`, and a participant can join from the small "Refer & earn" link under their ticket. A footer link is on every page.
- A commission row is written only when a referred purchase is **paid**, on the taxable value (not the GST). The **rate is not set**: rows wait as "counted" and show "to be announced" until we set it (`POST /api/partners/commission/rate {rate}`, or `PARTNER_COMMISSION_RATE`). Self-referral is blocked with a reason. We record payouts (`/api/partners/payout`) and can void a refunded sale; the actual payout (KYC, TDS, RazorpayX) happens outside this system.
- Partners see only their own sales (date, pack, status, amount), never who bought.
- **Limit to decide on:** enrolment needs no OTP, like participants joining, so someone could enrol a number that is not theirs. They would earn nothing without payout KYC, but the real owner of that number would find it taken. Fix before the first payout: verify the number (SMS/WhatsApp OTP costs money) or only pay after KYC proves who the person is.

## 7. Which features each mode has (2026-10-01, later)
Two modes exist side by side. **Phone-run mode** (new, no server per engagement) and the **server-driven mode** (older, one server process per engagement).

| Feature | Phone-run | Server-driven |
|---|---|---|
| Numbers called, tickets, marking, "still to win" | yes | yes |
| 1 or 2 tickets per participant | yes | yes |
| Reward lines with text, 1st/2nd/3rd order, Full Two-Ticket House | yes | yes |
| Brand breaks (up to 3: speech, slides, YouTube, video link) | yes | yes |
| Lucky draw (1, 3, 5 or 10 people, verifiable from public randomness) | yes | yes |
| Pause / resume / stop, AI asks and organizer approves | yes (signed, about 30-40 s to reach phones) | yes (instant) |
| Invite list, invite-only, reuse, erase, 365-day retention | yes | yes |
| External AI work link (scoped), suggestion board | yes | yes (link only) |
| Refer & earn, payments, invoices, e-mailed sign-in | yes | payments and sign-in yes |
| Rounds (1 to 5 games in one engagement; new numbers and new tickets each round, a 90 s wait between) | yes | yes |
| **Scratch cards, boosters (joker, extra ticket, pass)** | **no** | yes |
| Family passes, team leads/hosts roles, waiting room, second-phone alerts | **no** | yes |
| Host live voice, big-screen view | **no** | yes (big screen) |
| Cost per engagement | about zero (free plans) | a server process |

The phone-run mode is the one to sell at scale. Anything in the "no" rows is either optional or needs a design decision before building it for phone-run mode (scratch cards and boosters need their own fairness rules; roles and passes need a roster model the phone-run store does not have yet).

## 8. Launch on pages.dev, free, no domain (prepared 2026-10-01)
Everything is built and tested locally in Cloudflare's own runtime (`wrangler pages dev` with a local D1: the real-beacon run with a signed pause passed 6/6). One step is needed from the owner: a Cloudflare API token with **Account > D1 > Edit** (the existing token can edit Pages but not D1). Then:
```
setx CLOUDFLARE_D1_TOKEN "<the new token>"      # PowerShell, once; open a new terminal afterwards
python pages/launch.py                          # creates the D1 database and loads the schema, creates the Pages project,
                                                # sets secrets (platform key generated and kept in config/platform-key.txt, git-ignored),
                                                # deploys, and smoke-tests https://corporate-tambola.pages.dev
```
After launch: payments stay OFF (no Razorpay keys, TEST_MODE off). The organizer page `/zc.html` works with the platform key to create engagements. No cron exists on Pages, so the 365-day purge and the unsent-mail retry run by themselves the first time an organizer-side request arrives each UTC day (`housekeeping` in the Worker). Large participant lists are fetched in pages of 2,000 so no request exceeds the free ~10 ms CPU. R2 is not used (it needs a card on file); the pause file is served by the Function, which is fine up to a few thousand phones; beyond that, add R2 later.
