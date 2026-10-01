# Razorpay for SHOBHA KAMAL SOLUTIONS PRIVATE LIMITED: collecting, invoicing, partner payouts

Written 2026-10-01 from Razorpay's official documentation and a READ-ONLY look at your live dashboard (signed in by you). **Nothing in your account was changed or deleted.**

## 1. What I found in your account
| Item | What it shows |
|---|---|
| Account | "Shobha Kamal Solutions", **live mode**, activated; owner login raajat.agarwal@gmail.com |
| API key | A **live key already exists** (key id `rzp_live_Td726wQamWw5I5`, generated 7 Dec 2022). The id is not a secret; the secret is hidden and I have not seen it. A key is "universal": the same key works for every approved website |
| Websites (Business website details) | **Primary: societyexpense.com: Approved, but a liveness check says it cannot be reached** (the domain is no longer yours). `twoler.in`: Approved. **`dewberry.in`: liveness check pending** |
| Activity | Rs 0 collected in the last 7 days; nothing in recent history to clean |
| Products visible in the sidebar | Payment Links, Payment Pages, Razorpay.me Link, Invoices, Payment Button, QR Codes, Subscriptions, Smart Collect, Affordability, Checkout Rewards and others. **Route is not shown.** Banking+ (RazorpayX payouts) appears **not activated** (the home page offers "Get a Current Account") |
| Checkout styling | Brand name and logo exist but are at defaults (purple background `#D142F5`) |

Your instruction is respected: the old website stays exactly as it is. See section 6 for the choice you will have to make about it; nothing needs to be decided today.

## 2. The rule that matters most: every website must be approved before it can collect money
From Razorpay's docs (Business website details, FAQs):
- One **main** website plus **up to five additional** websites per account. Additional websites go through a **manual review (24 to 48 hours)**.
- Each needs: About Us, Contact Us, Pricing, Terms & Conditions, Privacy Policy and Cancellation/Refund Policy pages, a **sample invoice**, a **50+ word explanation** of why it is added, and test credentials (or a statement that no login is needed). The business name on the site and policy pages must match what you gave Razorpay.
- Editing the primary site runs instant checks on the site, policy pages and business category.
- The docs do **not** say what happens if the primary domain is lost. That is a question for Razorpay support (see section 6).
Your four brands therefore need: `dewberry.in` (already submitted, pending), **dpdp.veridian-aios.com**, **projexa-ai.com** and **the Corporate Tambola domain (not chosen yet)**. That fits: main + five additional = `twoler.in`, `dewberry.in` and the three new ones, with no room left for more. Brand names on checkout must be "at least 80% similar" to the company name or the domain name (docs FAQ), so each brand's name should resemble its domain; "CORPORATE TAMBOLA" needs a domain like corporatetambola.* to pass cleanly. **I do not yet know whether the per-order checkout name my code sends is subject to the same 80% rule**; the test-mode run will show it.

## 3. Collecting payments WITHOUT the API (dashboard only, no code)
| Product | Use it for | Notes |
|---|---|---|
| **Payment Links** | A first corporate sale: you create a link (amount, description "Corporate Tambola: up to 250 participants"), send by email/SMS/WhatsApp, the HR head pays | Fastest way to start. Delivery of the engagement is then manual (you create it) unless a webhook is wired |
| **Payment Pages** | A hosted page per pack with a form (organization, email, GSTIN) | One page per brand/pack; also manual delivery without a webhook |
| **Payment Button** | A "Pay" button embedded in a site | No code, fixed amounts |
| **QR Codes** | UPI payment at events or on an invoice | Static or dynamic |
| **Smart Collect** | Large corporate payments by NEFT/RTGS/IMPS to a virtual account per customer | Best for Rs 10,000+ packs and for HR teams that pay by bank transfer; reconciles itself |
| **Razorpay Invoices** | Razorpay-generated invoice with a pay link, emailed to the customer | The invoice carries the account-level business name (one name per account), so it cannot be brand-wise |
| **Subscriptions** | Recurring plans | Not needed: we sell per engagement |
Each of these is a **separate product with its own activation and its own approved-website requirement**; they all depend on section 2.

## 4. Collecting payments WITH the API (what is built, plus the options)
| API | Use | Status |
|---|---|---|
| **Orders + Checkout** | The website checkout: server creates an order (paise, brand in notes), the browser opens Checkout, the server verifies the signature and asks Razorpay what really happened | **Built and tested (23/23 against a stand-in)** |
| **Webhooks** | Deliver a purchase when the buyer closed the tab (`payment.captured`, `order.paid`) | Built; you register the URL and secret in the dashboard |
| **Payment Links API** | Create a link per customer from our system (for example from the AI work link: "send HR a payment link") | Not built yet; small |
| **Smart Collect API** | A virtual bank account per organizer for NEFT/RTGS payments | Not built yet; worth it for large packs |
| **Invoices API** | Razorpay-issued invoices | Not needed: our own brand-wise GST invoice replaces it |
| **QR Codes API** | Per-order UPI QR | Optional |

## 5. Invoices
- Customer tax invoice: **ours** (built): title is the **brand**, supplier is **SHOBHA KAMAL SOLUTIONS PRIVATE LIMITED**, brand-wise numbering `CT/2026-27/000001`, GST split CGST+SGST or IGST by the buyer's GSTIN state, DRAFT until your GSTIN, address, state code and SAC are filled in `config/company.json`. Razorpay's own receipts/invoices show the single account name; that is why the tax invoice is ours.
- For your CA to confirm: e-invoicing (IRN) applicability by turnover, the SAC code, the treatment of dollar sales (export of services, LUT), and TDS that corporate customers may deduct from your invoice (you receive less than the invoice and claim it from your TDS credit).

## 6. About the old website (societyexpense.com), without deleting anything
- Keeping it as the primary site is allowed but its liveness check is **failing**; that can hold up approvals or later reviews. Razorpay's docs say a primary site can be **edited** ("Edit" then "Proceed to update website/app"), with instant checks, so we do **not** need a new account. If you get the domain back, nothing changes. If not, the clean path is: ask Razorpay support (cite the Merchant ID `HHm8KIyVhH7wvb`) whether the primary website can be changed to one of your live sites, and then use Edit. I will not touch it until you say.
- A new account would not help: one account carries one legal entity and one GSTIN, and you already have the right one.

## 7. Sales-partner commission payouts
Two Razorpay routes, and a clear recommendation:
1. **Razorpay Route** (split at payment time to a partner's linked account): the official docs say it needs **Rs 40 lakh domestic turnover (GST-3B) or Rs 5 lakh export turnover**, a linked account that **directly provides the goods or services to your customer**, and a compliance submission whose deadline (31 Dec 2025) has passed. Your account has Rs 0 activity and partners do not deliver the product, so **Route is not a fit**.
2. **RazorpayX Payouts** (pay out after the money has settled): create a Contact and Fund Account for each partner (bank or UPI), then pay by dashboard, **bulk upload or API**. Needs RazorpayX activated (a current account/balance and its own KYC). **This is the right tool.**
**Proposed design:** our system keeps a commission ledger (each paid order credits the partner their agreed share, planned 50%), holds it until the settlement and refund window pass, then creates a payout through RazorpayX and sends the partner a statement. **TDS:** commission is under section 194H, **2% from 1 Oct 2024; threshold Rs 20,000 per partner per year since 1 Apr 2025; 20% if the partner has no PAN** (secondary sources; your CA must confirm), so the payout is the commission minus TDS, with Form 16A and the quarterly return on your side. Partner GST invoice requirements also need your CA. Not built yet: it needs RazorpayX activated first.

## 8. What I propose to do in your dashboard (each needs your explicit yes; none is done)
1. Add the three new websites (dpdp.veridian-aios.com, projexa-ai.com, the Corporate Tambola domain), after their policy pages are live. **Blocker:** the sites must be live and functional; Vercel is paused and the Corporate Tambola domain does not exist yet.
2. Set the account's Checkout brand name and logo (default for payments that do not send a name).
3. Switch to **Test Mode**, generate a **test key** and the **webhook** (secret), for local testing.
4. Check **capture settings** (automatic) and **International payments** status.
5. Open RazorpayX activation (a current account is a banking decision: yours).
6. Ask support about the lost primary domain (a message I can draft).
