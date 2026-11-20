# Mail deliverability: accepted by Resend, not seen in the inbox (20 Nov 2026)

Branch `boss/rca-mail-deliverability-2026-11-20`, cut from origin/master `4bda4fe`. Read-only: public DNS (resolvers 1.1.1.1 and 8.8.8.8), public RDAP, the repo, the live `outbox` / `mail_event` tables and the owner's Gmail search. No secret was read or printed, no mail was sent, nothing was changed.

## Question
After the owner's second Rs 1 payment (game `OWNER-RS1-0BZL`) Resend accepted two mails (`outbox` 6122 "published", 6124 "payment received, invoice CT/2026-27/000002") but no mail from the game was found in the inbox of `raajat.agarwal@gmail.com`. The same happened to row 6120 on the first payment. Is the sending domain set up so that Gmail should accept it?

## What the code sends
| Item | Value | Where |
|---|---|---|
| From | `Corporate Tambola <hello@corporatetambola.com>` unless the Pages secret `MAIL_FROM` overrides it (its value is not readable from the repo, only that it exists) | `apps/edge/src/pay.ts` (`resendAttempt`, `cloudflareSend`) |
| Reply-To | `hello@corporatetambola.com` (or `MAIL_REPLY_TO`) | same |
| Extra header | `Auto-Submitted: auto-generated` | same |
| Body | plain text; HTML only for some mails | same |
| Links in the body | `https://housie.corporatetambola.com/...` (a subdomain of the From domain) | PUBLIC_ORIGIN |
| Provider | Resend (REST API); from 1.9.2 (PR #32) Cloudflare Email Service as the second route | |

So the From domain is `corporatetambola.com` for both providers, and links point at the same domain family.

## DNS found (public, 20 Nov 2026)
| Name | Record | Reading |
|---|---|---|
| `corporatetambola.com` TXT | `v=spf1 include:_spf.mx.cloudflare.net ~all` | The apex SPF only lists Cloudflare Email Routing. It does NOT list Resend or Amazon SES. This is fine for Resend because Resend uses its own envelope sender (below), so SPF is checked there, not at the apex. |
| `resend._domainkey.corporatetambola.com` TXT | an RSA public key (1024 bit) | Resend DKIM present. Mail is signed `d=corporatetambola.com`, which is aligned with the From domain. |
| `send.corporatetambola.com` TXT | `v=spf1 include:amazonses.com ~all` | Resend's return-path (bounce) domain. SPF passes for Resend's sending servers (Amazon SES). It is a subdomain of the From domain, so SPF is aligned under the relaxed rule. |
| `send.corporatetambola.com` MX | `feedback-smtp.ap-northeast-1.amazonses.com` | Resend region Tokyo (ap-northeast-1). Bounces return there. |
| `_dmarc.corporatetambola.com` TXT | `v=DMARC1; p=none; adkim=r; aspf=r` | DMARC exists, monitor only, relaxed alignment. No `rua=` address, so nobody receives the reports. |
| `cf2024-1._domainkey.corporatetambola.com` TXT | an RSA public key (2048 bit) | Cloudflare Email Service DKIM present. |
| `cf-bounce.corporatetambola.com` TXT / MX | `v=spf1 include:_spf.mx.cloudflare.net ~all` / Cloudflare MX | Cloudflare's return-path domain, with SPF. Aligned (subdomain). |
| `corporatetambola.com` MX | three `route*.mx.cloudflare.net` | Inbound mail for hello@ is Cloudflare Email Routing. |
| NS | `dina.ns.cloudflare.com`, `toby.ns.cloudflare.com` | DNS is on Cloudflare. |
| `_mta-sts`, `default._bimi` | none | Not required. |

## Verdict per route
* **Resend:** SPF pass (return-path `send.`, aligned), DKIM pass (aligned), DMARC pass with `p=none`. Nothing in DNS explains a refusal or a junk placement by itself.
* **Cloudflare Email (PR #32):** DKIM `cf2024-1` present, return-path `cf-bounce.` with SPF, DMARC aligned. It should authenticate the same way. Only two caveats: it has not been used for a game mail yet, and its daily limit (200) is shared with the other products.

I could not run a header test (no mail was sent to a test inbox), so "should pass" is read from DNS, not from a real message's `Authentication-Results`.

## Why Gmail could still junk or drop it (ranked)
1. **A very young domain.** `corporatetambola.com` was registered on 15 Oct 2026 (RDAP), 36 days ago. Gmail gives a new domain with no sending history little trust, whatever the DNS says. This is the most likely cause.
2. **A burst of automated test mail.** On 16 to 18 Nov the smoke tests sent hundreds of near-identical mails from this domain to a few addresses. A burst of repetitive mail from a new domain damages reputation, and the owner's mailbox may have learned to treat it as junk. (The Resend monthly quota ran out in the same burst.)
3. **Shared Resend IPs.** Resend's free plan sends from shared Amazon SES addresses. Their reputation is outside our control.
4. **No feedback at all.** `mail_bounce` and `mail_event` are empty for accepted mails: Resend's webhook (`delivered`, `bounced`, `complained`) is not configured. "Accepted" only means Resend took the mail. We cannot tell delivered from bounced from junked.
5. **DMARC with no reports.** `p=none` and no `rua=`: if a receiver had a problem with authentication, nobody would see it.

Not a cause (checked): wrong or missing DKIM, a second SPF record, a From domain different from the links, an attachment, a missing `Reply-To`. A plus tag in the address is not shown to be a cause: 15 earlier mails to a plus-address were accepted by Resend (accepted, not proven delivered).

## Evidence from the mailbox
* The Gmail search (inbox and trash; the search tool cannot look in Spam) finds mails from `hello@corporatetambola.com` to the owner's address from 16 to 17 Nov (the "personal data deleted" notices), so Gmail did accept this sender into the inbox before.
* It finds NO mail from `hello@corporatetambola.com` in the last 3 hours, although the mail log says 6122 and 6124 were accepted at 17:23 and 17:41 UTC. That fits "placed in Spam" or "not delivered", and cannot tell which.

## What to do (in order)
1. **Look in the Resend dashboard, Emails list**, for the two mails (subjects "published: payment pending" and "payment received, invoice CT/2026-27/000002"). Each row shows `Delivered`, `Bounced`, `Complained` or `Suppressed`. This answers the question in one minute. (Not possible from the repo: no Resend key is stored locally.)
2. Check **Spam** and **All Mail** in the owner's Gmail for the same subjects. If found in Spam, mark "Not spam" for `hello@corporatetambola.com` once, and add it to contacts.
3. Add the Resend webhook (`email.delivered`, `email.bounced`, `email.complained`) so the next problem is visible in `mail_event`. This is a code and settings change, not in this PR.
4. Add `rua=mailto:<a mailbox the owner reads>` to the DMARC record, keep `p=none` for now. After a few weeks of clean reports move to `p=quarantine`. (Owner decision: it is a DNS change.)
5. Keep volume low and steady. No more bursts of near-identical test mail from this domain until it has some sending history. Use the second route (Cloudflare, PR #32) for the transactional mail, but do not send marketing mail through the same domain in bulk.
6. Optional: sign up the domain at Google Postmaster Tools to see its reputation (needs a DNS TXT record).

## What I did not check
* A real message's headers (no mail was sent).
* The Resend dashboard and API (no key stored locally).
* Spam or All Mail in Gmail (the connected search does not cover them).
* Blocklists: the Spamhaus domain list answered `127.255.255.254`, which means "query refused from a public resolver", not "listed". The result is therefore unknown, not clean.
