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
