# Corporate Tambola: compliance self-audit

Audit date: 2026-10-05. Scope: Corporate Tambola (repo `C:\ct\tambola`, live at https://corporate-tambola.pages.dev) and the owner's company site (`C:\ct\shobha-site`, live at https://shobhakamalsolutions.pages.dev). Measured against `CHECKLIST_100.md` (items marked T or TD, 134 items), using `REQUIREMENTS_REGISTER.md` and `SOURCES.md`.

**This is a self-audit by an AI assistant. It is not legal advice and not a certification.** It reads code and live pages and compares them with a research checklist. A lawyer must review it before anyone relies on it.

## (a) Executive summary

The product is built with real privacy care (names and numbers sealed, 22-hour deletion that is tested, no participant payments, no ad trackers). The weak spots are the words around it: notices, contracts, claims, children and gaming-law paperwork.

| Area | Verdict in plain words |
|---|---|
| India DPDP Act 2023 and Rules 2025 | **Partial.** Technical design is good and ahead of the 13 May 2027 start date. Gaps: notice content (no Board complaint route, no recipients, no languages), grievance process, children (s9, Rule 10), organizer contract (s8(2)), and the Rule 6 one-year log question against the 22-hour deletion. |
| EU and UK GDPR | **Gaps.** No Art 13 notice, no DPA, no transfer tools, no representative decision, no age rule, undisclosed device storage. The claim that the service 'follows' GDPR cannot be supported yet. |
| US (CCPA/CPRA, states, COPPA, CAN-SPAM) | **Partial, lower exposure.** No marketing mail, no ad trackers, no sale. Missing: service-provider terms, notice at collection wording, COPPA actual-knowledge procedure. |
| Gaming, prize and lottery law | **Largely aligned in design, undocumented.** Participants never pay and the platform never holds prizes, which is the main protection. No terms stop an organizer charging, no legal memo, no tax or state warnings, no country gating. |
| Marketing claims | **Gaps, fix first.** A false 'kept 365 days' line, an invented 50% discount, an unsupported ISO/IEC 27001 line, and a stale price in search data. |

**Results over 134 applicable items:** PASS 13, PARTIAL 40, FAIL 72, NOT APPLICABLE 1, CANNOT VERIFY 8.

What I could not check (owner must confirm): Cloudflare dashboard (plan, D1 region, cron last run, log settings, MFA), Resend dashboard (retention, bounce handling, API key scope), Razorpay agreement, vendor DPAs, whether the old Workers token was deleted, Cloudflare Web Analytics setting, the live behaviour of the cron job, and any lawyer opinion. I did not run the test suite, did not create games or send mail, and changed no source file.

### Step 0: primary legal text

The government sites (meity.gov.in, indiacode, egazette) still returned HTTP 403 and web.archive.org is blocked. A web reproduction of the official text (dpdpa.com, source S41) could be read for DPDP Act sections 5, 6, 7(a), 7(i), 8, 9, 16 and Rules 1(2), 3, 6, 7, 8, 10, 14, 15. These are now marked 'Verified 2026-10-05' in `REQUIREMENTS_REGISTER.md` (section 1.0a) and the confidence of 12 rows rose from medium to medium-high. Still unverified: the Gazette itself, Rule 8's Third Schedule table, Rules 4, 5, 9, 11-13, Act sections 10-14 and 17, and the Fourth and Seventh Schedules. What the verified text changes for this audit:

* Rule 3 notice must name data and purpose in plain language and give the means to withdraw, exercise rights and **complain to the Board**. The current page does none of the last part.
* s7(i) covers employment only, for employees. It does not reach families, dealers, customers or ex-employees, so a lawful basis for them is s7(a) or consent, not s7(i).
* Rule 6(1)(e) says to retain 'such logs and personal data' for one year for security purposes. This still sits uneasily with a 22-hour deletion; a lawyer must decide how far it reaches.
* Rule 14(3) requires a published grievance timeline of at most 90 days. None is published on the Tambola page.
* Rule 1(2): Rules 3, 5 to 16, 22 and 23 start 18 months after publication (13 May 2027 on a 13 Nov 2025 publication). No compression was found.

## (b) Gap register, ranked by severity

Owner column: product = the company's developer, organizer = the customer, lawyer, vendor, owner = Rajat Agarwal. Effort: S = under a day, M = a few days, L = weeks.

### G-01 [CRITICAL] Public wording says things the product does not do.

* **Checks:** A05, O01, O03, M03
* **What is wrong and evidence:** Home page: 'Names and numbers are kept 365 days so you can reuse your list in one tap' (index.html:93, 115) and 'contacts kept 365 days for reuse' (index.html:75). The code deletes them 22 hours after the game and 'reuse' fails with 'already deleted' (worker.ts:1003-1005). Join screen: 'Nobody else sees it' (z.js:36) but the organizer sees every number. PDF and delete-reply say the winners record holds no names (report-layout.ts:59, worker.ts:722), but the prize table holds a sealed name and mobile for 365 days (winners.ts:17). Console says 'We do not keep your participants' data' (zc.js:291).
* **Law:** FTC Act s5 and state UDAP; CPA 2019 ss2(28), 21; DPDP s5; GDPR Art 5(1)(a), 13
* **Suggested filler:** Fix the wording today (list d). Add one test that greps every customer-facing string for '365 days' and checks it sits only next to 'winners' or 'organizer details'. Keep a claims register (item O01).
* **Owner / effort:** product / S

### G-03 [CRITICAL] Minors can join and nothing deals with them.

* **Checks:** D01, D02, D03, D06, D07
* **What is wrong and evidence:** Invitation kind 'Family members' is on by default (config.ts:16); home page invites 'Their families'. Any person with a mobile number can join with name and number (worker.ts:778-821). No age text anywhere.
* **Law:** DPDP s9, Rule 10 (verifiable parental consent, no tracking); COPPA (actual knowledge, under 13); GDPR Art 8; UK Children's Code
* **Suggested filler:** Add to join screen and rules: 'You must be 18 or older. Children may play only on a parent's own ticket and phone.' Make the organizer tick that they will not register children's numbers. Add a rule that a child cannot hold a ticket in their own name. Write a short 'if we learn a child under 13 joined' procedure (delete, notify organizer). Ask the lawyer whether s9(1) is met when the parent joins and the child watches.
* **Owner / effort:** product / lawyer / M

### G-04 [CRITICAL] No organizer contract, processor terms, sub-processor list or guidance.

* **Checks:** B05, B06, H02, I01, I02, I04, I07, M01, M02
* **What is wrong and evidence:** POST /api/start needs only an e-mail (worker.ts:409-431); no terms are shown or accepted. No DPA, no CCPA service-provider wording, no sub-processor list, no guidance that participation must be voluntary, no employee-notice template.
* **Law:** DPDP s8(1), s8(2), Rule 6(1)(f); GDPR Arts 28, 13; CCPA 11 CCR 7051; Indian Contract Act (no acceptance)
* **Suggested filler:** Create Terms of Service plus a one-page DPA (list d), a public sub-processor page, and an organizer guide. Show 'I agree to the Terms and the DPA' (unticked box, link) on sign-in and at publish; store the version and time in a new organizer_terms row. Lawyer to review.
* **Owner / effort:** lawyer / product / M

### G-05 [CRITICAL] Gaming-law position is sound in design but undocumented and not enforced by terms.

* **Checks:** P02, P03, P04, P05, P07, P09, Q04, P06
* **What is wrong and evidence:** No participant payment path exists (good), but no terms forbid organizers charging, no written analysis of the PROG Act 2025 and Rules 2026, no state or country guidance, no TDS-on-winnings warning, no NY/FL registration warning, rules page lacks 'no purchase necessary'.
* **Law:** PROG Act 2025 ss2, 5-7; PROG Rules 2026; state gambling Acts (e.g. Maharashtra 1887); Income-tax Act 2025 s393(3); US state lottery law; UK Gambling Act 2005
* **Suggested filler:** Add to Terms: 'The organizer must not charge any fee, price, donation or purchase for taking part, directly or indirectly. If they do, the service stops and the organizer is solely responsible.' Add an organizer guide page: private closed group, no entry fee, prizes above INR 10,000 may carry 30% TDS, US promotions above USD 5,000 may need registration, check your state. Ask the lawyer for a short memo and whether to apply for a determination under the 2026 Rules. Block or warn when a country outside India is chosen until reviewed.
* **Owner / effort:** lawyer / product / organizer / M

### G-10 [CRITICAL] Invented discount, unproven security claim, and a stale price in search data.

* **Checks:** O02, O04, O09, O10, O11
* **What is wrong and evidence:** 'Was' price is 2x+1 of the real price, shown as '50% discount applied' (site.js:23, index.html:101). 'Most popular' and '2nd most popular' have no data (site.js:24). Footer claims 'ISO/IEC 27001 data-security standards' (index.html:135) with no certificate; own rule in NOTES.md:73 says 'Designed for', not 'compliant'. JSON-LD offer says INR 499 to 9,999; real packs are INR 1,999 to 24,999 before GST (common.js:90).
* **Law:** India CPA 2019 s2(28), CCPA misleading-ads and Dark Patterns Guidelines 2023; FTC Act s5; UK DMCC Act 2024 (reference pricing)
* **Suggested filler:** Remove the strikethrough price and the '50% discount' line (or show it only if the higher price was really charged first). Remove the ISO line or replace with 'Built around the security practices described in ISO/IEC 27001; not certified'. Correct JSON-LD to 1999 / 24999. Remove popularity badges unless backed by sales data.
* **Owner / effort:** product / S

### G-02 [HIGH] No proper privacy notice for participants, organizers or partners.

* **Checks:** A01-A04, A06, A07, A09, A10, B02, B04, I05
* **What is wrong and evidence:** legal.html is one combined page. Missing: who the controller is, lawful basis, recipients (Cloudflare, Resend, AI vendor), countries, how to complain to the Data Protection Board or an EU/UK authority, grievance time limit, withdrawal, other languages, version and date, device storage, prize record shown before joining. The join screen shows only a small link and an inaccurate sentence.
* **Law:** DPDP s5, s6, Rule 3(a)-(c), Rule 14(3); GDPR Arts 13, 7(3), 12; CCPA notice at collection
* **Suggested filler:** Publish a standalone Privacy Policy page (outline in list e), versioned and dated; link it clearly on the join screen with one plain sentence; show the organizer's name and contact on the join screen; record notice version in each join row; offer Hindi on request. Show the 365-day prize record on the join screen.
* **Owner / effort:** product / lawyer / M

### G-06 [HIGH] Secrets in git history and weak key management.

* **Checks:** G01, G02, G03
* **What is wrong and evidence:** ORGANIZER_SECRET (platform key) and PHONE_SALT were committed in 37a9181 and are still in history (removed in 7e3cd73). Repo has no remote today. Shared full-access Resend key copied from the DPDP product. Report-link key falls back to the constant 'ct' if secrets are unset (lifecycle.ts:203). No rotation or recovery plan; DATA_KEY was re-set once.
* **Law:** DPDP s8(5), Rule 6(1)(a)-(b), (g); GDPR Art 32
* **Suggested filler:** Rotate ORGANIZER_SECRET and PHONE_SALT now (hashes are short-lived so rotation is cheap), then rewrite history before any remote is added. Create a send-only Resend key for Tambola. Make the app refuse to start without DATA_KEY and PHONE_SALT (no fallbacks). Write a key runbook: owner, where stored, rotation steps, what happens to sealed rows.
* **Owner / effort:** product / vendor / owner / S

### G-07 [HIGH] Live pages miss security headers (some the build intends, some never written); report link cannot be revoked.

* **Checks:** G04
* **What is wrong and evidence:** curl on 2026-10-05: /z, /zc, /report, /signin, /ai-link, /big and /partner return only 'referrer-policy: strict-origin-when-cross-origin', with no CSP and no X-Frame-Options. pages/build.mjs writes rules for '/z.html' and '/zc.html' but Cloudflare serves '/z' (308 from '.html'), so those rules never apply; only /pay has them. The other pages have no rules at all. The report link (?k=) works until deletion and has no revoke.
* **Law:** DPDP s8(5), Rule 6(1)(b); GDPR Art 32
* **Suggested filler:** Add _headers rules for the clean paths (/z, /zc, /report, /signin, /ai-link, /big, /partner) with a CSP like the one for /z, 'Referrer-Policy: no-referrer', 'X-Frame-Options: DENY', then check with curl. Add a 'Replace report link' button that rotates a per-game salt. Consider a shorter life for the report link than 22 hours once opened.
* **Owner / effort:** product / S

### G-08 [HIGH] Device storage is wider than disclosed and the saved phone number is reused for a lookup.

* **Checks:** A07, B08, C01, C02, K01, K02, K03
* **What is wrong and evidence:** localStorage keeps a device id, the participant's own mobile number (z.js:388), last game, prizes, partner code; service worker and caches; notification prompt at first tap (pwa.js:25-30). z.js:181 sends the saved number in a URL to /api/partner/check on every load. Legal page says only 'We use no cookies'.
* **Law:** GDPR/ePrivacy Art 5(3), EDPB 2/2023; UK PECR reg 6; DPDP purpose limitation (s4, s6)
* **Suggested filler:** Stop saving the number (not needed for play); remove the partner lookup from the phone page (let the partner page do it with the partner's own key). Add to the notice: 'Your phone keeps a random id, your ticket and saved game files so the game works offline; no cookies.' Ask for notification permission only on a button, not on first tap.
* **Owner / effort:** product / S

### G-09 [HIGH] Retention is mostly built right but has holes and some unproven edges.

* **Checks:** A05, C04, C07, F01-F05, F08, F09, G05, Q06
* **What is wrong and evidence:** Never deleted and not disclosed: organizer_key, organizer_email, orgmail/, aikey/, payment, invoice, commission, partner, suggestion, and kv keys start/ and linkfail/ (unsalted IP hash), seen/ (IP /24 prefix, country, browser). Draft or unpaid games with a roster are purged by schedule, not the 30-day draft rule (worker.ts:1066-1070). Backup promise depends on the Free plan (S42). No alert if the cron stops. No written reason for 365 days. DPDP Rule 6(1)(e) and 8(3) one-year log rule not reconciled with 22 hours.
* **Law:** DPDP s8(7), Rules 6, 8; GDPR Art 5(1)(e), 17; CERT-In Directions 2022
* **Suggested filler:** Write a retention schedule (list e). Add a daily job that deletes kv start/, linkfail/ older than 2 days and seen/, alert/ keys with their key. Salt the IP hash. Disclose accounts, invoices and partner records and their periods. Confirm the Cloudflare plan and Resend retention in the consoles. Add a heartbeat check (UptimeRobot or a daily 'last tick' mail). Ask the lawyer to decide Rule 6(1)(e) vs 22 hours (suggest: keep security logs without names or numbers for one year).
* **Owner / effort:** product / lawyer / vendor / M

### G-11 [HIGH] No working rights and grievance process.

* **Checks:** B03, E01-E05, E08, N02
* **What is wrong and evidence:** Contact is a personal Gmail address with no clock, log, identity check or reply templates. Tambola page names no grievance officer; the company page does (48 h, 30 days).
* **Law:** DPDP s8(9), s8(10), s13, Rule 14; GDPR Arts 12, 15-22; CCPA 45 days
* **Suggested filler:** Create a role mailbox (privacy@ or grievance@ on the company domain), name the Grievance Officer on the Tambola page, state '48 hours to acknowledge, 30 days to resolve, never more than 90'. Keep a simple rights log (sheet is enough). Write the 'no data held after 24 hours' reply and the identity check (send a code to the number).
* **Owner / effort:** product / owner / S

### G-12 [HIGH] No breach readiness.

* **Checks:** G05, H01-H04, H06, H07, L01
* **What is wrong and evidence:** No incident plan, CERT-In contact, breach register, templates, or mail classification.
* **Law:** DPDP s8(6), Rule 7 (72 h); GDPR Arts 33-34; CERT-In 6 h; US state laws
* **Suggested filler:** Write the 2-page runbook (list e): who decides, 6-hour CERT-In report, 72-hour Board report, processor notice to organizers within 24 hours, templates, register.
* **Owner / effort:** product / lawyer / M

### G-13 [HIGH] Partner scheme exposes mobile numbers and has no terms.

* **Checks:** R01-R07
* **What is wrong and evidence:** The partner code is the person's mobile number and sits in every shared link (partners.ts:2-3) though the page says nobody sees your details. Anyone can enrol any number (no proof), and /api/partner/check reveals if a number is a partner. No terms, TDS or PAN process, anti-spam rule, retention or delete route. 'Terms' link points to a missing anchor. Income example on page.
* **Law:** DPDP s4, s8(5); IT Act SPDI Rules; Income-tax Act 2025 s393(1) (2% TDS, 20% without PAN); CAN-SPAM, TCCCPR; CPA 2019 (earnings claims)
* **Suggested filler:** Use a random code (not the number). Verify the number by a code sent to it before enrolling. Add Partner Terms (list e). Capture PAN at first payout. Add an anti-spam clause (no unsolicited bulk messages, suspension). Remove the income example or label it clearly. Fix the broken Terms link.
* **Owner / effort:** product / lawyer / tax adviser / M

### G-14 [HIGH] The AI assistant path sends personal data to outside vendors and is not disclosed.

* **Checks:** S01, S04, S05, S06, S09, S10, F08, I06
* **What is wrong and evidence:** Conversation step 9 tells the AI to load 'name, mobile number' lists through the chat (ai-link.ts:181), in URLs in browse-only mode; /prizes returns winner names and last two digits (winners.ts:120-121); AI-link page offers ChatGPT, Grok, Claude, Gemini, DeepSeek, z.ai (ai-link.js:17-18); full URLs with keys sit in vendor histories and Cloudflare logs; no injection test.
* **Law:** DPDP s8(1), s16, s5; GDPR Arts 28, 44-46, 32; EU AI Act Art 50 (from 2 Aug 2026)
* **Suggested filler:** Tell organizers in the console and the manual that data typed into an AI chat goes to that vendor under their own account. Offer 'paste list in the console instead' as the default; AI loads only counts or a file link. Return no names to the AI (use seat numbers). Add tests that plant a name and number and assert no AI-readable route returns them. Add the AI-call log to the notice, including IP and browser string.
* **Owner / effort:** product / organizer / M

### G-16 [HIGH] Cross-border and EU/UK posture is undefined.

* **Checks:** D07, I03, J01-J05, N04
* **What is wrong and evidence:** Site targets 'any country' and prices in USD, but there is no data map, SCCs, transfer assessment, Art 27 representative decision, or vendor DPAs on file. D1 location cannot be set to India (S43); Resend uses AWS.
* **Law:** GDPR Arts 3(2), 27, 44-49; UK GDPR; DPDP s16 and Rule 15
* **Suggested filler:** Decide in writing: either 'organizers in India only for now' (change the home page) or sign the vendor DPAs, add SCCs/UK addendum to the DPA, and appoint a representative. Write the data map (list e).
* **Owner / effort:** lawyer / owner / M

### G-17 [HIGH] No governance records and no lawyer review.

* **Checks:** B01, B02, M04, N01, N03, N05, N06, N07, T01-T05
* **What is wrong and evidence:** No lawful-basis table, records of processing, DPIA, DPO note, compliance calendar, change control or watch log. Lawyer review is an open owner step.
* **Law:** DPDP s8(4); GDPR Arts 5(2), 24, 30, 35; CCPA risk assessments
* **Suggested filler:** Fill the five records (list e) in one afternoon from this audit; book the lawyer; add a calendar with 13 Nov 2026, 1 Jan 2027, 13 May 2027.
* **Owner / effort:** lawyer / owner / M

### G-18 [HIGH] Payment, refund and terms pages do not exist for this product.

* **Checks:** I07, Q02, Q03, Q08
* **What is wrong and evidence:** Pay page links 'terms, privacy and refund policy' to /legal.html, which has none (pay.js:53). 'Unused places are not refunded' appears only in the AI manifest (worker.ts:363). Company refund policy is for custom work and says refunds apply. Razorpay is off today; e-invoice position open.
* **Law:** Consumer Protection (E-Commerce) Rules 2020; CPA 2019; Razorpay merchant terms; GST law
* **Suggested filler:** Write Corporate Tambola Terms with a clear refund rule (e.g. full refund before publish; none once started), pricing and GST wording, and link them from the pay page. Align the company refund page with it.
* **Owner / effort:** lawyer / product / S

### G-15 [MEDIUM] Anyone can join as any number, and one script can exhaust the day's write budget.

* **Checks:** G08
* **What is wrong and evidence:** No per-IP or per-number limit on join, partner enrol or partner check (worker.ts:778). Owner decided to leave OTP out (project notes). The global 80,000-write guard returns 'Busy day' to everyone.
* **Law:** DPDP s8(5) (security), s8(3) (accuracy); GDPR Art 32
* **Suggested filler:** Add a Cloudflare rate-limiting rule (free tier allows one) on /api/z/*/join and /api/partner/*. Record the 'no OTP' decision and the reasons in the risk register. State plainly in the notice that a number is not verified.
* **Owner / effort:** product / S

### G-19 [MEDIUM] Deletion by e-mail trusts the sender field.

* **Checks:** E07
* **What is wrong and evidence:** worker.ts:709-718 reads 'from' from the body with no SPF/DKIM result; needs engagement id and registered address. Route not yet connected.
* **Law:** GDPR Art 32; DPDP s8(5)
* **Suggested filler:** Before connecting the inbound route, require the mail provider's DKIM/SPF 'pass' flag and reply with a confirmation link to the registered address.
* **Owner / effort:** product / S

### G-20 [MEDIUM] Company site policy does not match the products it hosts.

* **Checks:** A09, I05
* **What is wrong and evidence:** shobhakamalsolutions.pages.dev/privacy omits Resend, Corporate Tambola, the partner programme and the telemetry store; terms/ cover custom jobs only; grievance officer uses a personal Gmail address. Company details (CIN, GSTIN, address, phone) are present on every page.
* **Law:** DPDP s5, s8(9); IT Act s79 intermediary rules; Razorpay site requirements
* **Suggested filler:** Add Resend and the partner programme to the 'Who receives it' table; add a product-specific section pointing to the Tambola policy; use a role mailbox.
* **Owner / effort:** product / lawyer / S

### G-21 [MEDIUM] Phones contact third parties that the notice does not name.

* **Checks:** K05
* **What is wrong and evidence:** drand beacons for every game; YouTube-nocookie when a break video is shown (build.mjs CSP).
* **Law:** GDPR Arts 13(1)(e), ePrivacy; DPDP s5
* **Suggested filler:** Name them in the notice ('public randomness from drand; videos from YouTube if your organizer adds one'). Consider mirroring drand through your own route to keep participants' addresses away from third parties.
* **Owner / effort:** product / S

### G-22 [MEDIUM] No security testing, restore test, CI or continuity plan.

* **Checks:** G03, G06, G09, G10, I08, T02
* **What is wrong and evidence:** Single local repo, no CI, no pen test, no restore drill; one-vendor stack.
* **Law:** DPDP Rule 6; GDPR Art 32(1)(d)
* **Suggested filler:** Run bun audit and a free scanner before launch; restore D1 from Time Travel once into a scratch DB; put the repo on a private remote with branch protection once G-06 is done; write a half-page continuity note.
* **Owner / effort:** product / vendor / M

### G-23 [MEDIUM] Fairness wording is looser than the mechanism.

* **Checks:** P08
* **What is wrong and evidence:** Rules say numbers are 'drawn at random by the software'; the mechanism is public drand randomness and phone-side quorum. Project notes admit it is not absolutely cheat-proof.
* **Law:** FTC s5; CPA 2019; MKT-04
* **Suggested filler:** Say 'numbers come from a public random beacon; winners are confirmed when several phones agree'. Never say 'cheat-proof' or 'certified fair'.
* **Owner / effort:** product / S

## (c) Per-item results

Status key: PASS, PARTIAL, FAIL, NOT APPLICABLE, CANNOT VERIFY. 'Sev' is the checklist severity (harm if it fails). Gap column points to section (b).

| ID | Requirement (short) | Sev | Status | Evidence | Gap |
|---|---|---|---|---|---|
| A01 | A privacy notice is shown **before** the participant types a name and mobile number (T join screen) or... | critical | **PARTIAL** | Join screen (z.js:30-37) shows a one-line note and a small 'Privacy Policy' link (new tab) next to the fields, before 'Get my ticket'. Note is inaccurate (see O03). People loaded by the organizer (worker.ts:1016-1033) are on the game before they ever see this screen. | G-02 |
| A02 | Notice lists: what data, each purpose, who receives it (processor, e-mail vendor, host), retention, how to... | high | **PARTIAL** | legal.html:68-76 lists data (name, number, inviter), purpose, retention, rights ask. Missing: controller identity and contact, lawful basis, recipients and sub-processors, countries, how to complain to the Data Protection Board or an EU/UK authority, grievance time limit (Rule 3(c), Rule 14(3), GDPR Art 13). | G-02 |
| A03 | Plain language; available in English plus the main local languages (Eighth Schedule languages on request). | medium | **FAIL** | English only. No offer of an Eighth-Schedule language on request (s5(3) DPDP). | G-02 |
| A04 | The organizer is named as the fiduciary/controller on the participant's notice **and** the platform as... | high | **FAIL** | legal.html:49 says 'the organizer named on your ticket', but the join screen and ticket show no organizer name or contact (z.js:30-37; public /info returns none). | G-02 |
| A05 | Notice states **each retention period exactly as built** (T: 22-hour deletion, 24-hour promise, 365-day... | critical | **FAIL** | legal.html matches the code (22 h delete, 24 h promise, 365 d winners and prize record, 7 d backups) but the home page says names and numbers are kept 365 days for reuse (index.html:75, 93, 115), the PDF says the winners record holds no names (report-layout.ts:59) while the prize table holds a sealed name and number for 365 d (winners.ts:17), and account, payment and IP-hash records are kept with no stated period. | G-01, G-09 |
| A06 | Notice discloses the **prize hand-over record** (name and mobile the winner confirms, 365 days) before the... | high | **PARTIAL** | legal.html:72 discloses the prize hand-over record. The join screen does not, and the winner's 'Confirm your prize details' card (z.js:156-157) says the organizer will use the details but not that we keep them 365 days. | G-02 |
| A07 | Notice discloses the **device identifier stored on the phone** and its purpose (one ticket per phone). | high | **FAIL** | legal.html:75 says 'no cookies' and is silent on device storage. The phone stores a device id, the participant's typed mobile number (z.js:388), last game, prizes, caches (see K01). | G-08 |
| A09 | The platform's own notice (for organizer, partner, billing and security-log data) exists separately from... | high | **PARTIAL** | One combined page 'Rules, privacy and disclaimer' aimed at participants. No notice for organizers (sign-in e-mail, invoices, security logs, AI-call IPs) or partners (mobile number, name). Shobha Kamal site policy (privacy/) covers the company site and generic client work, does not mention Corporate Tambola, Resend or the partner programme. | G-02, G-20 |
| A10 | Notices are versioned, dated, archived; changes are announced; a consent given under an old notice is... | medium | **FAIL** | No version or date on legal.html. Join records carry no notice version (participant table: eid, pid, phone_hash, name, pii, joined_ms). | G-02 |
| B01 | A written lawful-basis decision per processing purpose (join, play, report, prize hand-over, AI audit,... | critical | **FAIL** | No lawful-basis table in the repo or docs (docs/NOTES.md lists it as a lawyer item). | G-17 |
| B02 | Consent (where relied on) is free, specific, informed, unambiguous, unticked, with a clear affirmative... | critical | **PARTIAL** | No tick box, by decision (commit 1f5d1e5). Joining is by typing a number: an affirmative act but the notice is thin and inaccurate. Defensible under DPDP s7(a) only if the 'specified purpose' is told clearly; weaker for GDPR and for employees. | G-02, G-17 |
| B03 | **Withdrawal is as easy as consent**; one tap/link; effect on data is explained. | high | **PARTIAL** | Participant routes: ask organizer, or write to the Gmail address (legal.html:74). No in-app 'delete me' on the phone. Organizer can erase all (zc.js:450, worker.ts:990). | G-11 |
| B04 | Consent evidence is stored: who (pseudonym), when, which notice version, what was shown, channel; and can... | high | **FAIL** | No consent evidence is stored: no notice version, no wording shown, only joined_ms. | G-02 |
| B05 | Consent/lawful basis does **not** depend on an employee being penalised for declining (voluntary game; no... | high | **FAIL** | No organizer guidance anywhere that taking part must be voluntary and without penalty (grep of all customer text). | G-04 |
| B06 | The organizer's instruction to the platform (processor terms) is accepted at organizer sign-up before any... | critical | **FAIL** | No organizer terms at sign-up. POST /api/start needs only an e-mail (worker.ts:409-431); the sheets show only a small Privacy link (site.js:106, 153). No acceptance record. | G-04 |
| B08 | Refusing optional uses (referral, analytics, invitations) does not block the core service. | medium | **PARTIAL** | Core join does not depend on optional items (name optional, partner scheme separate, invitations optional). But the phone asks for notification permission on the first tap anywhere (pwa.js:25-30). | G-08 |
| C01 | Only name and mobile (and invitation relation if on) are collected from participants; no e-mail, location,... | high | **PARTIAL** | Join sends phone, optional name, hashed device id, optional inviter seat and kind (worker.ts:778-821). No e-mail, location or contacts. Caveat: the stored phone number is later sent to a partner lookup (C02). | G-08 |
| C02 | Data is used **only** for the stated purposes; no secondary use (analytics, marketing, model training)... | high | **FAIL** | z.js:181: if a number is saved in localStorage the page calls GET /api/partner/check?code=<10-digit mobile> on every load, to see if the participant is a partner. A participant's number leaves the game for an unrelated purpose, inside a URL that Cloudflare logs. | G-08 |
| C03 | The **hashed mobile number** (salted, one-way) is still personal data; it is deleted with the rest and not... | high | **PARTIAL** | Salted SHA-256 of the last 10 digits (worker.ts:757), the same salt for every game (PHONE_SALT, fallback ORGANIZER_SECRET then 'ct'). Only 10^10 possibilities, so reversible by anyone who has the salt; the salt was committed in git history (G-06). Deleted with the participant row; not per game. | G-06 |
| C04 | Every field in the prize record (name, mobile, change history) is needed for hand-over; justify 365 days. | high | **FAIL** | No written reason why name and mobile are needed for 365 days for hand-over (WINNERS_AND_AUDIT.md describes the feature, not the necessity). | G-09 |
| C07 | Telemetry/RUM contains no name, number or IP **in what the platform stores**; verify the claim for each... | high | **PARTIAL** | rum.js sends page path, referrer host, device class, vitals, error text, API failures. D1 table stores ts, kind, path, name, value, detail, device, country (telemetry.ts insert), 90-day purge run on 1% of posts. No IP stored by us. Cloudflare's own logs and the vendor settings were not checked. | G-09 |
| D01 | A rule on participant age: 18+ only, or a minor plays only on a parent's ticket; the invite and join flow... | critical | **FAIL** | No age rule or statement anywhere (grep of home, legal, join, organizer pages). Invitation kind 'Family members' is on by default (config.ts:16) and the home page invites 'Their families'. | G-03 |
| D02 | "Family members can win or take part for fun" does not silently collect a minor's own data (name + mobile)... | critical | **FAIL** | A family member of any age can join with their own mobile number and name (worker.ts:778-821). No parental consent or guardian route. DPDP s9(1) and Rule 10 need verifiable parental consent for under-18s; COPPA actual-knowledge risk if a child under 13 joins. | G-03 |
| D03 | No tracking, behavioural monitoring or targeted advertising directed at minors. | high | **PASS** | No advertising, no behavioural profiling. The device id serves one-ticket-per-phone, RUM is anonymous. |  |
| D06 | COPPA: actual-knowledge procedure (what happens if a child under 13 is found), written security programme... | medium | **FAIL** | No COPPA actual-knowledge procedure, security programme or retention policy documents. | G-03 |
| D07 | EU Art 8 age thresholds are mapped per country if EU organizers are accepted. | medium | **FAIL** | No EU age table or EU exclusion although the site says 'any country' and sells in USD. | G-03, G-16 |
| E01 | A **published channel** for access, correction, erasure, withdrawal, nominee and complaint requests, in... | critical | **PARTIAL** | Channel exists: 'ask your organizer, or write to us' (legal.html:74) at a personal Gmail address. No form, no role mailbox, no stated response time. | G-11 |
| E02 | **Response clocks** are tracked: DPDP grievance up to 90 days, GDPR 1 month, CCPA 45 days; clocks start at... | high | **FAIL** | No clock tracking. The company site promises 48 h acknowledgement and 30 days resolution (shobhakamalsolutions.pages.dev/privacy), not stated on the Tambola page. | G-11 |
| E03 | Because participant data is deleted in 24 hours, requests after deletion get a truthful answer ("no data... | medium | **FAIL** | No reply template for 'no data held' after deletion, and no routing note for requests during play. | G-11 |
| E04 | The platform can **locate** a person's data without the person's name (hash of the number) and **verify**... | high | **FAIL** | The data holds a phone hash (participant.phone_hash) that could locate a person, but no runbook or tool exists and no check that the requester controls the number. | G-11 |
| E05 | Identity verification for requests is proportionate (no more data than needed) and prevents impersonation... | high | **FAIL** | No identity-verification step for rights requests. | G-11 |
| E07 | An organizer's "delete all participant data now" and an e-mailed delete request from a **spoofed organizer... | high | **PARTIAL** | Inbound delete route needs the shared INBOUND_SECRET and a 'from' equal to the registered contact (worker.ts:709-718); test exists (privacy.test.ts:324). The 'from' is read from the JSON body with no SPF/DKIM verdict check, and per project notes the inbound route was not yet connected. Spoof test not run. | G-19 |
| E08 | Rights requests are logged with outcome, reason for refusal, and date; deletion proof is issued on request. | medium | **FAIL** | No log of rights requests, outcomes or refusal reasons. | G-11 |
| E09 | Opt-out of sale/share and GPC are honoured, or the site states it does not sell/share and runs no trackers. | medium | **PASS** | No third-party advertising or tracking script on any page (script list from live HTML). Site says it never sells data. GPC not needed. |  |
| F01 | **The scheduled deletion job actually runs** (per docs the cron worker was an owner-only open step on... | critical | **PARTIAL** | Project notes say the cron Worker (every minute, apps/cron) was deployed on 2026-10-04 and a manual tick returned 200; I could not see the Cloudflare dashboard. Nudges from organizer calls are a fallback (worker.ts:292). Per-engagement errors are swallowed (lifecycle.ts:297) and no alert exists if the job stops. | G-09 |
| F02 | Participant names, numbers, seats, device ids, join times, claims are deleted 22 hours after the end, and... | critical | **PARTIAL** | Unit test proves deletion in a test database (privacy.test.ts:232-250: participant, seat, claim, settled, overvote, report keys). rvote and rcand are deleted in code (lifecycle.ts:111) but not asserted. No staged run on the live site. Code-reading edge: a draft or unpaid game with a loaded roster is purged by the scheduled end, and purgeOld's 30-day draft rule does not apply once a life row exists (worker.ts:1066-1070). | G-09 |
| F03 | **Backups**: "roll off within 7 days" is true for the actual D1 backup/point-in-time setting; verify the... | high | **PARTIAL** | D1 Time Travel is always on: 7 days on Workers Free, 30 days on Paid (S42). The '7 days' promise holds only if the account is on the Free plan, as project notes say. Owner must confirm the plan. | G-09 |
| F04 | After the 365 days the engagement is erased at the stated time, including organizer details and AI audit rows. | high | **PARTIAL** | eraseEverything removes winner, prize, life, requests, contact, control and engagement rows (lifecycle.ts:118-125); ai_audit goes by age (worker.ts:1067); date test passes (privacy.test.ts:280). Not removed: organizer_key, organizer_email, orgmail/, aikey/, payment, invoice, commission, suggestion, and kv keys start/, linkfail/, seen/, alert/ (IP hash, /24 prefix, country, browser family). | G-09 |
| F05 | Retention for winners/prize/AI-audit records is justified in writing and disclosed. | high | **FAIL** | No written justification for 365 days (see C04). | G-09 |
| F08 | Deletion cascades to **processors** (e-mail vendor, AI vendor, storage) and is evidenced. | high | **PARTIAL** | Our outbox keeps no body for sent mail (pay.ts:56-58). Resend keeps its own logs (retention unverified, S45). AI chat vendors are the organizer's choice. No deletion cascade or evidence for vendors. | G-09, G-14 |
| F09 | A legal-retention register exists for records the law requires (invoices, TDS, partner payouts) and a rule... | medium | **FAIL** | No legal-retention register. Payment, invoice and commission tables are never deleted and the period is not stated. | G-09 |
| G01 | Encryption at rest and in transit for personal data; T uses AES-256-GCM sealing (per docs); D relies on... | critical | **PARTIAL** | Real: AES-256-GCM with HKDF (pii.ts); secrets not tracked now. But ORGANIZER_SECRET and PHONE_SALT were committed in 37a9181 and remain in history (removed in 7e3cd73); repo has no remote. Organizer e-mail and phone sit unsealed in kv contact/<id> (worker.ts:920) and payment.email is plain. | G-06 |
| G02 | Key management: the data key (HKDF of `DATA_KEY`) has an owner, a rotation procedure, and a recovery... | high | **FAIL** | No key owner, rotation or recovery runbook. Project notes record DATA_KEY being re-set, after which older sealed rows could not be opened. Report link key is an HMAC of the game id under DATA_KEY with fallback to 'ct' (lifecycle.ts:203). | G-06 |
| G03 | Access control: least privilege for staff and for each API key; MFA for admin and vendor consoles. | high | **CANNOT VERIFY** | Needs vendor consoles. Known from project notes: one shared full-access Resend key copied from the DPDP product, and a one-off Workers token pasted in chat that the owner was told to delete. Owner to confirm roles, MFA and that the token was deleted. | G-06, G-22 |
| G04 | **Bearer-secret URLs** (T report link `?k=`, D `/ai/<key>`, `/act/`, `/copy/` tokens, magic links) do not... | high | **PARTIAL** | Good: /ai/<key> answers carry no-referrer, no-store, noindex (worker.ts:237; live check). report.html has a no-referrer meta. Bad: live /z and /zc are served WITHOUT the CSP, X-Frame-Options and no-referrer headers that pages/build.mjs writes for them, because the rules are keyed to '.html' paths while Cloudflare serves the clean URL (curl, 2026-10-05; only /pay has them). /report, /signin, /ai-link, /big and /partner have no such rules at all. Keys sit in query strings or paths that Cloudflare logs; report link cannot be revoked. | G-07 |
| G05 | **Logs**: security and access logs exist, detect unauthorised access, are kept at least one year where... | high | **FAIL** | No security-log policy. Only ai_audit (365 d) is kept deliberately. Rule 6(1)(e) one-year retention and CERT-In 180-day logs are undecided against the 22-hour deletion. | G-09, G-12 |
| G06 | Backups and restore are tested; recovery objectives written. | medium | **FAIL** | No restore test recorded; recovery objectives not written. | G-22 |
| G07 | **Tenant isolation**: one organizer or customer cannot read another's data (T per engagement; D per... | critical | **PASS** | Ownership checks via can()/canAi() (worker.ts:316-318); tests: wrong-owner key refused (ai-link.test.ts:101, 167); reuse reaches only the caller's own earlier games (worker.ts:1002). Public routes (info, seats) expose only non-personal data by game id. |  |
| G08 | Rate limiting, bot protection and abuse controls on join, sign-in code, and request endpoints. | high | **PARTIAL** | Sign-in codes: 5 per hour, 5 tries (worker.ts:441-443, 480); link tries 20 per day per IP hash; /api/start 10 per day. Join, partner enrol and partner check have no per-IP or per-number limit; the only guard is the global write budget (80,000/day), so one script can make every game answer 'Busy day'. | G-15 |
| G09 | Dependency and vulnerability management; patching cadence; an independent penetration test before go-live... | high | **FAIL** | No penetration test, dependency-patching record or scan. | G-22 |
| G10 | Secure SDLC: code review, CI scans, environment separation; production data not used in tests. | medium | **PARTIAL** | Local git only, ~560 tests (project notes), production data not used in tests, TEST_MODE separate. No CI, no code-review step, no remote. | G-22 |
| H01 | A written incident-response plan with severity levels, owners, a 24x7 contact, and rehearsals. | critical | **FAIL** | No incident-response plan, owner or drill. | G-12 |
| H02 | **Processor-to-customer notice clock** is fixed in the customer contract (e.g. 24 to 48 hours), enabling... | critical | **FAIL** | No customer contract exists, so no processor-to-customer notice time. | G-04, G-12 |
| H03 | **CERT-In 6-hour** reporting route and contact exist. | high | **FAIL** | No CERT-In 6-hour route or point of contact documented. | G-12 |
| H04 | A breach register records facts, effects, actions, notifications, even for non-notifiable events. | medium | **FAIL** | No breach register or template. | G-12 |
| H06 | A communication template for participants and organizers exists in plain language. | medium | **FAIL** | No communication template for participants or organizers. | G-12 |
| H07 | US state breach laws are mapped for any US residents' data (partners, organizers). | low | **FAIL** | No US state breach matrix. Low: the data is names and phone numbers, plus organizer e-mails. | G-12 |
| I01 | A **customer DPA** with the processor terms: instructions, confidentiality, security, sub-processors with... | critical | **FAIL** | No DPA or processor terms for organizers; no CCPA service-provider wording. | G-04 |
| I02 | A **public sub-processor list** (Cloudflare, Resend, Supabase, Razorpay, any AI vendor, any analytics)... | high | **FAIL** | No public sub-processor list. Actual vendors seen: Cloudflare (Pages, Functions, D1), Resend (mail, runs on AWS), Razorpay (payments, off today), plus drand and YouTube contacted from phones. | G-04 |
| I03 | Signed vendor DPAs with each sub-processor; SCCs/DPF status recorded (Cloudflare: DPF + SCCs per its page;... | high | **CANNOT VERIFY** | Vendor DPAs and SCC/DPF status cannot be seen from the repo. Cloudflare publishes a DPA and DPF/SCC terms; Resend and Razorpay not checked. Owner to download and file each. | G-04, G-16 |
| I04 | The organizer is told they are the fiduciary/controller and must have their own lawful basis, notice to... | high | **PARTIAL** | legal.html:49, 69, 86 say the organizer runs the game and must check local law. No statement of fiduciary duties, employee notice, or works-council advice. | G-04 |
| I05 | The **platform's own** fiduciary/controller uses (organizer accounts, partners, billing, security logs)... | medium | **FAIL** | Platform's own data (accounts, invoices, partners, AI-call logs) is not separated or disclosed in any notice. | G-02, G-20 |
| I06 | Vendors cannot use customer data to train or improve their own models; zero-retention settings are on... | high | **CANNOT VERIFY** | Resend and Cloudflare no-training and retention settings not visible. AI chat vendors are the organizer's own accounts; platform sends them nothing itself. | G-14 |
| I07 | Liability and indemnity clauses match reality (see O row on guarantees). | medium | **FAIL** | No Corporate Tambola terms of service or liability clause. The Shobha Kamal terms (terms/) cover custom software jobs, quotations and milestones, not a self-serve pack. | G-04, G-18 |
| I08 | Vendor concentration: a fallback exists if Cloudflare, Supabase or Resend fails or is blocked in a region. | low | **FAIL** | Single-vendor stack, no continuity or fallback plan. Low. | G-22 |
| J01 | A **data-location map**: where each store physically sits (Cloudflare D1 region or location hint, Workers... | high | **PARTIAL** | D1 sits near where it was created and India cannot be picked (S43); Workers run at the edge; Resend sends through AWS (inbound MX points to AWS Tokyo); Razorpay is India; drand and YouTube are contacted by phones. No written map and the actual D1 region is unknown. | G-16 |
| J02 | India: no restricted destination under the s16 negative list; re-check when Government notifies. | medium | **FAIL** | No record of checking for a Government restriction under s16 (none found in my sources). | G-16 |
| J03 | EU/UK: SCCs (EU organizer to India-based platform; platform to US vendors) or DPF reliance, plus a... | high | **FAIL** | No SCCs, UK addendum or transfer impact assessment, while the site targets any country. | G-16 |
| J04 | DPF-dependence is not the sole safeguard while C-703/25 P is pending; SCC fallback documented. | medium | **FAIL** | No SCC fallback note for DPF. Appeal C-703/25 P pending (register EU-17). | G-16 |
| J05 | Sector rules (payment data localisation for Razorpay; any education/health rules for D customers) do not... | medium | **CANNOT VERIFY** | Razorpay is a payment aggregator, no card data stored by us; localisation position not confirmed with Razorpay. | G-16 |
| K01 | **Inventory of everything stored or read on the device**: cookies, localStorage, IndexedDB, service-worker... | high | **PARTIAL** | Inventory made in this audit. localStorage: ctz:device (random id), ctz:<game>:pid/jr/claimed, ctz-phone (mobile number), ct-last-eid, ctz-sound, saved prizes, ctz-ref (partner code, 30 days), ct-theme, ct-asked. sessionStorage: organizer token. Cache Storage: ct-game-v8, ct-seen. Service worker /zsw.js. No cookies (no document.cookie, no Set-Cookie). Not maintained by the product. | G-08 |
| K02 | Each item is classified "strictly necessary / functional / analytics / marketing"; the claim "we use no... | high | **FAIL** | 'We use no cookies' is literally true but not the whole truth: device id, phone number, caches and a notification prompt are not disclosed (legal.html:75). Not classified as necessary or optional. | G-08 |
| K03 | The device id for one-ticket-per-phone is justified as strictly necessary (security/fairness) or covered... | medium | **FAIL** | No justification that the device id is strictly necessary. | G-08 |
| K05 | No third-party trackers or ad pixels; GPC, DNT not required but no sale/share. | medium | **PARTIAL** | No ad or analytics trackers. Phones do contact api.drand.sh and drand.cloudflare.com for every game (CSP in build.mjs), and YouTube-nocookie when a break video is shown. CSP allows static.cloudflareinsights.com but no beacon is injected (live HTML). Not disclosed. | G-21 |
| L01 | Each message type is classified **transactional / relationship / marketing** (sign-in codes, invoices,... | high | **FAIL** | No classification table. From code every mail is transactional (sign-in code and link, AI work link, new-use alert, publish, pay reminder, 'could not begin', report, report reminder, deletion confirmation, invoice). | G-12 |
| L02 | Marketing or promotional content (upsell inside a digest, partner promotion) has opt-in or soft-opt-in... | high | **PASS** | No marketing or promotional mail exists; nothing is sent to participants. If any is added it needs opt-in and an unsubscribe link. |  |
| L03 | SPF, DKIM, DMARC set up for the sending domain; bounce and complaint handling; no purchased lists. | medium | **PASS** | DNS 2026-10-05: DKIM at resend._domainkey.veridian-aios.com, SPF on send.veridian-aios.com (amazonses), DMARC p=quarantine. Resend bounce handling not checked. |  |
| L04 | Report e-mails contain **links, not personal data**, and the link expiry matches deletion (per docs). | high | **PASS** | Report mail carries a link and the organizer's own address only (lifecycle.ts:184-199); link stops working at deletion (test privacy.test.ts:244). The link is a bearer secret (G-07). |  |
| L06 | No SMS or WhatsApp is sent; if added later, TRAI DLT / TCPA consent and revocation are built first. | medium | **PASS** | No SMS or WhatsApp provider in code or config; WhatsApp only through user-initiated wa.me share links. |  |
| L07 | The invitation feature (participant sends link to up to 4 people) does not make the platform the sender of... | medium | **PASS** | Invite text has no personal data and is shared by the participant from their own phone (z.js:281-293); the link holds only the inviter's seat number. |  |
| M01 | Organizer guidance states: participation voluntary; no penalty for not joining; use work-appropriate... | high | **FAIL** | No organizer guidance on voluntary participation, no penalty, works-council or HR advice. | G-04 |
| M02 | The organizer (not the platform) decides the lawful basis for employees; the platform provides a template... | medium | **FAIL** | No employee notice template for organizers. | G-04 |
| M03 | Individual participation data is **not exposed to the employer beyond need**: confirm what the organizer's... | high | **PARTIAL** | Organizer, co-host and the report see every name and number; the e-mail and PDF say so. But the join screen says 'Nobody else sees it' (z.js:36), which is wrong for the organizer. | G-01 |
| M04 | US: employee and B2B data are in CCPA scope (not in most other states); organizer's California employees... | low | **FAIL** | No state-law note for organizers with California employees. Low. | G-17 |
| N01 | A **records of processing** exists in controller and processor forms. | high | **FAIL** | No records of processing in controller or processor form. | G-17 |
| N02 | A named **grievance/contact officer** with a role mailbox (not a personal address) is published; response... | high | **PARTIAL** | Company site names a Grievance Officer (Rajat Agarwal) with e-mail, phone, 48 h and 30-day times. The Tambola page names nobody and gives a personal Gmail address, no times (legal.html:76, brand.ts:8). | G-11 |
| N03 | DPO assessment: not mandatory under GDPR unless core large-scale monitoring; decision recorded; under DPDP... | medium | **FAIL** | No DPO assessment note. | G-17 |
| N04 | Art 27 representative (EU/UK) decision recorded: either "we do not target the EU/UK" and marketing is... | high | **FAIL** | Site sells in USD and says 'any country', but no decision on an Art 27 representative. | G-16 |
| N05 | **DPIA** or similar risk assessment done for: T (participant mobile numbers, prize records, device ids), D... | high | **FAIL** | No DPIA or risk assessment (participant numbers, prize records, AI link). | G-17 |
| N06 | Data-mapping and a **data inventory** per product, owned and reviewed twice a year. | medium | **PARTIAL** | docs/PRIVACY_AND_LIFECYCLE.md has a retention table for game data only; no inventory of accounts, payments, partners, logs, vendors, no review date. | G-17 |
| N07 | **Training**: staff and AI-agents operators know the data rules and incident path. | low | **CANNOT VERIFY** | Single-owner company; training records not applicable or not seen. | G-17 |
| O01 | A **claims register**: every compliance, security, privacy and AI claim on the site, e-mail and sales... | critical | **FAIL** | No claims register. Sampling ten claims found five wrong or unsupported (see list d). | G-01, G-10 |
| O02 | No claim of being "certified", "approved", "audited", "fully compliant" or "guaranteed" without a named... | critical | **FAIL** | Footer says 'Built in line with ... ISO/IEC 27001 data-security standards' (index.html:135) with no certificate; project notes (NOTES.md:73) say wording must be 'Designed for', not 'compliant'. 'We follow' appears in four places. Legal page does say 'has not been certified by an outside body' (legal.html:76), which is good. | G-10 |
| O03 | Privacy-page promises are literally true, including edge cases: "never sell", "no cookies", "no IP... | critical | **FAIL** | Promises tested: 'names and numbers kept 365 days for reuse' (home) is false; 'Nobody else sees [your number]' (z.js:36) ignores the organizer; 'we do not keep your participants' data' (zc.js:291) and the PDF 'winners record has no names' (report-layout.ts:59) ignore the prize record; legal.html:72 'only' ignores account and billing data. True or reasonable: 22 h deletion (tested), 7 d backups (if Free plan), no cookies, never sell, no IP in RUM table. | G-01 |
| O04 | Marketing for India states what DPDP duties are in force and when (substantive duties from 13 May 2027 per... | medium | **PARTIAL** | Says 'We follow' DPDP though substantive duties start 13 May 2027 (Rule 1(2), S41). No false deadline is stated. | G-10 |
| O09 | Security claims (encryption, ISO, SOC, pen-test) name scope and date. | high | **FAIL** | ISO/IEC 27001 claim without scope, date or certificate. | G-10 |
| O10 | Testimonials, comparison and "AI" claims are substantiated; no AI-washing. | medium | **FAIL** | Struck-through 'was' price is simply 2x+1 of the real price (site.js:23) with '50% discount applied' (index.html:101); 'Most popular' and '2nd most popular' badges have no data (site.js:24); JSON-LD offer says INR 499 to 9,999 while the real packs are INR 1,999 to 24,999 before GST (common.js:90); partner page shows 'earned on one large engagement' income figure. | G-10 |
| O11 | Dark patterns avoided on sign-up, payments, cancellation and consent. | medium | **PARTIAL** | The invented discount is a dark-pattern risk (false reference price). Payment-before-start is explained plainly. Notification prompt on first tap has no context. | G-10 |
| P01 | **No money or stake from any participant**, ever: platform blocks or warns on features that collect entry... | critical | **PASS** | No participant payment path exists: join, claim, prize screens collect no money; only the organizer pays (pay.ts). Razorpay is currently off on the live site (/api/payments/status mode 'off'). An organizer could still charge people outside the product. |  |
| P02 | Terms state that organizers may not charge participants, and that violating this voids the service. | critical | **FAIL** | No terms say organizers must not charge entry fees, ticket prices or donations. Disclaimer says only that the software company collects no money (legal.html:82). | G-05 |
| P03 | Written legal analysis: free corporate tambola vs PROG Act 2025 (online money game / online social game);... | critical | **FAIL** | No legal memo on PROG Act 2025 and Rules 2026, and no decision on applying for a determination. My reading is in section (f). | G-05 |
| P04 | State-by-state (India) gambling check for organizers: guidance says private, closed-group, no entry fee;... | high | **FAIL** | One generic sentence (legal.html:86). No state-by-state guidance and no 'private, no entry fee' instruction. | G-05 |
| P05 | Country gating: UK, US, EU rules differ; either block unsupported jurisdictions or add per-country rules... | high | **FAIL** | Marketed to 'any country'; no country gating or per-country rules (UK Gambling Act question unresolved). | G-05, G-16 |
| P06 | Official rules for each game (eligibility, how winners are decided, no purchase necessary, prize... | medium | **PARTIAL** | Game rules exist (legal.html:52-64). Missing: eligibility, 'no purchase necessary', prize and sponsor statement, odds, 'void where prohibited'. | G-05 |
| P07 | Prize registration/bonding warnings (NY, FL over USD 5,000) in organizer guidance. | medium | **FAIL** | No warning about prize registration or bonding above USD 5,000 in New York or Florida. | G-05 |
| P08 | The **fairness mechanism** (public randomness, quorum of phones) is described accurately; no claim of... | high | **PARTIAL** | Rules say numbers are 'drawn at random by the software' (legal.html:54); in fact they come from the public drand beacon and every phone computes winners and a quorum of phones must agree (winners.ts:3-12). No 'certified' claim. Project notes admit it is not absolutely cheat-proof ('honest-client', number impersonation accepted). | G-23 |
| P09 | Prize hand-over and disputes: platform disclaims reward handover (per `legal.html`) and the organizer's... | medium | **PARTIAL** | Disclaimer says no responsibility for hand-over or disputes (legal.html:85) but the platform keeps the prize record and report. No dispute process in terms. | G-05 |
| P10 | The organizer-controlled "winners" cannot be changed by organizer, co-host or AI (per docs); the audit... | medium | **PASS** | /settle refuses everyone (worker.ts:975); results need a quorum of different phones (winners.ts:30-62); AI and co-host cannot erase, publish, pay or settle (tests ai-link.test.ts:237). The organizer can still unbind or mark seats. |  |
| Q01 | Razorpay (or other gateway) handles all card/UPI data; the platform never stores payment credentials; PCI... | high | **PASS** | No card fields in schema or code; Razorpay Checkout only on /pay with its own CSP (_headers). Live mode is off. |  |
| Q02 | Who is merchant of record is clear; refunds and failed payments flow is defined; the Razorpay account type... | high | **CANNOT VERIFY** | Razorpay account type and agreement not visible; project notes say the owner submitted a primary-site change. Merchant of record is the company (invoice supplier). | G-18 |
| Q03 | GST: registration, invoice format, e-invoicing if above threshold, rates and place of supply for foreign... | medium | **PARTIAL** | Invoice built with GSTIN, SAC 998314, place of supply and tax split (pay.ts:128-137, COMPANY_JSON); a missing detail makes it a DRAFT. E-invoicing (IRN) applicability still listed as a CA question in docs/RAZORPAY_COLLECT_AND_PAYOUT.md:49. | G-18 |
| Q04 | Organizer guidance warns about **TDS on winnings** (30% over INR 10,000 per transaction; s393(3) of the... | high | **FAIL** | No warning to organizers about TDS on winnings (INR 10,000 threshold, 30%) or in-kind prizes. | G-05 |
| Q05 | The platform itself does not hold or distribute prizes (so it does not become the payer of winnings). | high | **PASS** | The platform never holds, pays or ships prizes; it records 'prize given' only. |  |
| Q06 | Invoices and payment records are kept for the legal period and excluded from erasure with a documented reason. | medium | **FAIL** | Invoices and payments are kept indefinitely with no stated period and no register. | G-09 |
| Q08 | Currency, tax and consumer rules for B2C purchases (if individuals can buy) are covered: refund policy,... | medium | **FAIL** | pay.js:53 and pay.html link to 'terms, privacy and refund policy' at /legal.html, which has no terms or refund text. The only statement 'unused places are not refunded' is inside the AI manifest (worker.ts:363). The company refund policy (refund/) is for custom jobs and says something different. | G-18 |
| R01 | Partner terms: commission rules, clawbacks (cancelled on refund or reversal per D docs), eligibility,... | high | **FAIL** | No partner terms. Partner page links 'Terms' to /legal.html#terms, an anchor that does not exist. No independent-contractor, clawback or anti-spam wording beyond FAQ lines. | G-13 |
| R02 | Partner payout details (bank/UPI, PAN, GST) are minimal, protected as sensitive data, and **not visible**... | critical | **NOT APPLICABLE** | No payout details (bank, UPI, PAN) are collected yet; the FAQ says they will be asked later. The partner's own mobile number is the public code (partners.ts:2-3), which G-13 covers. | G-13 |
| R03 | **TDS** on commission (s194H / s393(1), 2% above INR 20,000; 20% without PAN), Form 16A and return filing... | high | **FAIL** | No payout runbook, no PAN capture, no TDS handling beyond the sentence 'TDS applies as per law' on the partner page. Commission is 50% of the pre-GST price. | G-13 |
| R04 | Referral tracking (link, code in local storage, coupon) is disclosed; the partner cannot access... | high | **PARTIAL** | Partner sees only date, pack and amount, never the buyer (partners.ts:97). The partner code is kept 30 days in the buyer's localStorage (site.js:86) and is not disclosed in the notice. | G-13 |
| R05 | Referrers do not send unsolicited messages in the platform's name; a spam policy and enforcement exist. | medium | **FAIL** | No anti-spam policy; the page urges 'post it, forward it to as many people as you like'. A partner can be set to 'blocked' by us (partners.ts:129) but no rule says when. | G-13 |
| R06 | Partner data retention and deletion rules reconcile with tax records. | medium | **FAIL** | No retention or deletion rule for partner rows; no partner delete route. | G-13 |
| R07 | Fraud and self-referral checks; disputes process; partner can see and correct their own data and request... | medium | **PARTIAL** | Self-referral blocked (partners.ts:46). No dispute process; partner can read own sales but cannot correct or delete data. Anyone can enrol any number without proof it is theirs (partners.ts:69-81) and /api/partner/check shows whether a number is a partner. | G-13 |
| S01 | The AI manual and every API response the AI can read **contain no personal data** (no names, numbers,... | critical | **PARTIAL** | Manual and participant list have no personal data (ai-link.ts, worker.ts:938). But /prizes gives the AI winner names and the last two digits (winners.ts:120-121), and the conversation tells the AI to load names and numbers through the chat, in URLs in browse-only mode (ai-link.ts:181). No test plants identifiers in AI-readable routes (ai-link.test.ts:208 checks only mobile masking). | G-14 |
| S03 | AI access keys: scoped, short-lived, revocable, rate-limited; destructive or irreversible actions (erase,... | critical | **PASS** | AI key cannot pay, publish, erase, pause or settle; erase is request-only with e-mail to the organizer (worker.ts:605-609); 24 h temporary keys; revoke and replace exist; tests ai-link.test.ts:237. It can still announce to all phones, tick prize given, mark seats and unbind without a confirmation. Rate limit is only the global budget. |  |
| S04 | The short work link (`/ai/<key>`) is treated as a secret: not indexed, no-store, not logged in clear,... | high | **PARTIAL** | Key is 24 random bytes in hex; answers are no-store, no-referrer, noindex; audit trail stores the /api path, never the key (test ai-link.test.ts:108). The full URL with the key is still in Cloudflare request logs and in the AI vendor's chat history; the AI-link page also puts the paste in the vendor's address (ai-link.js:17-18). | G-14 |
| S05 | **Prompt injection** from untrusted text (participant names, inbound e-mail, evidence files) cannot cause... | high | **PARTIAL** | Manual tells the AI to treat text inside answers as data (ai-link.ts:106). Names are stripped only of <>` (worker.ts:770). Winner names reach the AI. No injection test was written. | G-14 |
| S06 | AI audit trail records every call, includes IP, user agent, country; disclosed in notice; retention... | high | **PARTIAL** | Disclosed only as 'where it came from' (legal.html:72). Table keeps full IP, browser string and country for 365 days (winners.ts:138-143); organizer can read it (zc.js:282), platform can read all (listAiAudit). | G-14, G-02 |
| S09 | AI vendor terms: no training on data, retention limits, location, sub-processor list; AI vendor appears on... | high | **CANNOT VERIFY** | AI vendors are the organizer's own accounts. The AI-link page offers ChatGPT, Grok, Claude, Gemini, DeepSeek and z.ai (ai-link.js:17-18); the platform sends them nothing itself, but the organizer's names, numbers and the work key go there. Vendor terms not reviewed. | G-14 |
| S10 | Users are told an AI can act on their data, what it can and cannot do, and where calls are logged (EU AI... | medium | **FAIL** | No notice tells participants or organizers that an outside AI may handle their data, what it can do, or that vendors may be outside India. | G-14 |
| T01 | A **compliance calendar** of dates that matter: 13 Nov 2026 (consent managers), 13 May 2027 (DPDP duties),... | high | **FAIL** | No compliance calendar (13 Nov 2026, 13 May 2027, 1 Jan 2027, DPF appeal, UK DUAA, EU AI Act dates). | G-17 |
| T02 | Change control: any new data field, vendor, tracker, AI feature or message type triggers a privacy review... | high | **FAIL** | No privacy-review step before adding a field, vendor, tracker or message type; no CI. | G-17, G-22 |
| T03 | Regulatory watch: owner for Gazette notifications (MeitY), CJEU, FTC and state laws; record of each check. | medium | **FAIL** | No regulatory-watch log. | G-17 |
| T04 | **Lawyer review** of all legal text (privacy pages, terms, DPA, partner terms, templates) with dated... | critical | **FAIL** | Lawyer review is an open owner step (PRIVACY_AND_LIFECYCLE.md:36, NOTES.md:202). | G-17 |
| T05 | Insurance (cyber, tech E&O) matched to claims; no insurance-like promises to customers. | low | **CANNOT VERIFY** | Insurance not seen. | G-17 |

## (d) Claims to soften or fix today

Exact current wording, where it sits, and proposed wording. Short sentences on purpose. 'Self-assessed' is the honest label until a lawyer or a certifier says otherwise.

| # | Where | Current wording | Proposed wording |
|---|---|---|---|
| 1 | Home hero, index.html:75 | "Tickets deleted in 24 hrs · contacts kept 365 days for reuse" | "Participant names and numbers deleted within 24 hours of the game ending" |
| 2 | Home, index.html:93 | "Privacy you can stand behind ... Names and numbers are kept 365 days so you can reuse your list in one tap. Other participants never see them." | "Privacy by design. Names and mobile numbers are deleted within 24 hours of the game ending. We keep only the winners record, and the details winners confirm for prize hand-over, for 365 days. Other players never see them. Your organizer does." |
| 3 | Home, index.html:76 | "We follow India's DPDP Act, the EU GDPR and US privacy laws; your game's data is deleted within 24 hours" | "Designed around India's DPDP Act, GDPR and US privacy laws. Self-assessed, not certified. Game data deleted within 24 hours." |
| 4 | Home FAQ, index.html:115 | "We follow India's DPDP Act, the EU and UK GDPR and US privacy laws." | "Designed around India's DPDP Act, the EU and UK GDPR and US privacy laws. Not certified by an outside body." |
| 5 | Home footer, index.html:135 | "Built in line with India's DPDP Act, the EU GDPR, US privacy laws and ISO/IEC 27001 data-security standards." | "Designed around India's DPDP Act, the EU GDPR and US privacy laws. Self-assessed, not certified." (Remove ISO/IEC 27001 until a certificate exists.) |
| 6 | legal.html:76 | "We follow India's Digital Personal Data Protection Act 2023, the EU and UK GDPR and US privacy laws including the California CCPA / CPRA: ... never sell it, and honour your rights." | "We design the service around India's DPDP Act 2023, the EU and UK GDPR and US privacy laws. This is our own assessment; no outside body has certified it. We never sell your data. To exercise a right, write to privacy@<company domain>." |
| 7 | legal.html:72 | "We keep for 365 days only the details of the organizer, host and co-hosts and the winners record ..." | Add: "We also keep organizer account and billing records, and partner records, for the periods in our Privacy Policy." |
| 8 | legal.html:75 | "We use no cookies and no advertising trackers." | "We use no cookies and no advertising trackers. Your phone keeps a random id, your ticket and saved game files so the game works offline. Public random numbers come from the drand network; a break video may load from YouTube." |
| 9 | legal.html:54 | "Numbers from 1 to 90 are drawn at random by the software. Nobody, including the organizer, can choose a number." | "Numbers 1 to 90 come from a public random beacon in an order nobody can choose. Winners are confirmed when several phones agree." |
| 10 | Join screen, z.js:36 | "Your number is used only to give you the same ticket if you come back. Nobody else sees it." | "We use your number to give you your ticket and, if you win, so your organizer can hand over your prize. Your organizer can see your name and number. Other players cannot." |
| 11 | PDF, report-layout.ts:59; delete reply, worker.ts:722 | "The winners record does not contain names or mobile numbers." / "We keep only the winners record (no names or numbers) ..." | "The winners record holds seat, prize, round and time only. Separately, for the same 365 days, we keep the name and mobile number a winner confirmed for prize hand-over." |
| 12 | Console, zc.js:291 | "We do not keep your participants' data." | "We do not keep your participants' names and numbers beyond 24 hours, except the prize hand-over details of winners (365 days)." |
| 13 | Pricing, site.js:23 and index.html:101 | Struck-through price plus "50% discount applied on every pack" | Remove. Show the real price only: "INR 1,999 + GST". Bring the offer back only for a price that was really charged. |
| 14 | Pricing badges, site.js:24 | "Most popular", "2nd most popular" | Remove, or use "Good for a mid-size company" until sales data exists. |
| 15 | Search data (JSON-LD), index.html head | lowPrice 499, highPrice 9999 | lowPrice 1999, highPrice 24999 (INR, before GST). |
| 16 | Partner page | "Your mobile number is your code." and "Buyers stay private, and nobody can see yours." | "Your link carries a random code. Your number is never shown." (after code change in G-13) |
| 17 | Partner page | "₹4,999 earned on one large engagement" and "Your first sale could be this week." | Remove, or "Example only. Earnings depend on sales." |
| 18 | Pay page, pay.js:53 | "See the terms, privacy and refund policy" (links to /legal.html which has no terms or refund text) | Link to the new Terms page, or drop the words 'terms' and 'refund' until it exists. |
| 19 | AI manifest, worker.ts:363 | "The full terms are at /legal.html." | Same fix as 18. |
| 20 | Partner opt-in, partner.js:32 | "receive updates about it on this mobile number" | Say which channel, or delete 'updates' (no SMS or WhatsApp is sent). |
| 21 | Home hero | "Affordable Secure Engaging" | "Secure" is unproven; use "Simple. Private by design. Engaging." |
| 22 | Company site privacy, privacy/ | Recipient table lists Razorpay, Cloudflare, Google | Add Resend (e-mail sending) and mention the Corporate Tambola and partner data. |

Claims I checked and found fair: "We use no cookies" (literally true), "never sell" (no sale path exists), "participants never pay" (no payment path exists), "deleted within 24 hours" (22 h job, tested), "backups roll off within 7 days" (true only on the Workers Free plan, S42), "has not been certified by an outside body" (legal.html:76, good), "No SMS" (no provider in code).

## (e) Documents to create

Each is short. Draft them from this audit, then have a lawyer review.

1. **Privacy Policy (standalone page, versioned).** Who we are and role (processor for games, fiduciary for our own accounts) · what we collect, field by field, with purpose and basis · what is kept and for how long (the retention schedule) · who receives it (sub-processor list) · countries · device storage (list in K01) · AI assistant data flow · your rights and how to use them · grievance officer, 48 h / 30 days / 90 days maximum · how to complain to the Data Protection Board, an EU or UK authority, or a US state · children · changes and version date · offer of Hindi and other Eighth Schedule languages.
2. **Terms of Service (organizer).** Who may sign (18+, authorised by the company) · what we provide · price, GST, refund rule · acceptable use: no entry fee or purchase for taking part, no children's data, voluntary participation, lawful prizes, no unlawful or harassing content · organizer is the fiduciary and gives the notice to participants · AI assistant: your choice and your vendor · prize hand-over is yours, TDS is yours · suspension · liability limit · governing law · version.
3. **DPA / processor terms.** Subject and duration · instructions only · confidentiality · security (Rule 6 list: sealing, access control, logs, backups) · sub-processors with 15 days' notice and right to object · help with rights requests · breach notice to organizer within 24 hours · deletion rule (22 h / 365 d) and return · audit by questionnaire · transfers (SCCs and UK addendum as annex) · CCPA service-provider clauses (no sale or share, no use outside the service, flow-down).
4. **Sub-processor list (public page).** Cloudflare (hosting, D1; global edge; DPF and SCC), Resend (e-mail; uses AWS; US), Razorpay (payments; India; off until launch), drand (public randomness; no personal data sent but phone addresses seen), YouTube (only when an organizer adds a video) · purpose, country, safeguard, how to be told of a change.
5. **Breach-response runbook.** Roles · severity table · first hour checklist · CERT-In report within 6 hours · Board report within 72 hours (Rule 7) · organizer notice within 24 hours · participant message template · EU/UK authority within 72 hours if applicable · evidence and register template · post-incident review.
6. **Records of processing (controller and processor forms).** One row per purpose: data, subjects, recipients, transfers, retention, security. Start from `docs/PRIVACY_AND_LIFECYCLE.md` and add accounts, billing, partners, logs, telemetry.
7. **Grievance officer notice.** Name, role mailbox, phone, postal address, hours, acknowledgement and resolution times, escalation to the Board. Put it on legal page, join screen footer and every e-mail footer.
8. **Retention schedule.** Table: class, purpose, period, trigger, deletion method, legal basis. Rows: participant name and number (22 h) · phone hash · seats and claims · winners record (365 d) · prize hand-over record (365 d) · organizer details (365 d) · organizer account and sign-in hashes (account life + stated period) · invoices and payments (statutory period, state it) · partner rows · AI-call log (365 d) · key-use records (set a period) · telemetry (90 d) · IP-hash counters (2 d) · backups (7 d on Free plan).
9. **Partner Terms.** Independent contractor · commission rates and clawback on refund · no unsolicited bulk messages · TDS and PAN · payout timing · suspension · data handling for partner details · deletion on request.
10. **Official game rules page.** Who may play, no purchase or payment needed, how numbers and winners are decided, prize description and sponsor (the organizer), what happens in a tie, void where prohibited, dispute route.
11. **Organizer guide (one page).** Voluntary, no penalty, tell people in advance, children, TDS above INR 10,000, US registration above USD 5,000, state law, how to delete data early.

## (f) Prize, lottery and online-gaming risk against the actual flow

**Who pays whom (from code and live checks):** the organizer pays the company a per-game pack price (pay.ts, price list in common.js:90; Razorpay is off on the live site today). Participants pay nothing: the join, claim, vote, confirm and prize routes contain no payment step, and the checkout asks for an organisation name, e-mail and GSTIN, not a participant's details (pay.ts:159-195). Prizes are bought and handed over by the organizer; the company records 'prize given' only. Partners earn a commission on the organizer's purchase, not on any participant stake.

**Reading against the law (not a legal opinion):**

* **PROG Act 2025 online money game:** needs fees, deposits or other stakes paid by players in the hope of winning money or enrichment. No such stake exists in the flow, so the product looks outside it. The risk is an organizer who charges or ties access to a purchase; nothing in the terms forbids it (gap G-05).
* **Online social game:** the PIB explainer describes these as largely skill-based; a pure-chance game's status is not settled in my sources. A written determination under the 2026 Rules is worth asking a lawyer about.
* **Determination factors** include revenue model and monetisation outside the game. The company's revenue is a fixed pack price from the organizer, not linked to stakes or winnings. Brand-break videos are the organizer's own advertising to their guests; note this in the memo.
* **State gambling and lottery law (India):** prize and chance exist, consideration (a stake) does not. Private, closed-group, no-fee events are the low-risk end. Organizer-specific.
* **US:** prize plus chance without consideration is a lawful sweepstakes. Typing a phone number is not consideration. Large prize pools can trigger NY/FL registration; the product does not warn.
* **UK:** whether a free online prize bingo needs a licence is unresolved in my sources (UK-04). The site is sold to 'any country' without gating.
* **Tax:** 30% TDS on winnings above INR 10,000 per transaction (s393(3)) is the organizer's duty; no warning is given.

## (g) Verification log (what was actually done)

* Read in full: `apps/edge/src/worker.ts`, `lifecycle.ts`, `pay.ts`, `mails.ts`, `pii.ts`, `winners.ts`, `ai-link.ts`, `partners.ts`, `brand.ts`; parts of `report-layout.ts`, `z.js`, `zc.js`, `pwa.js`, `rum.js`, `site.js`, `partner.js`, `report.js`, `signin.js`, `ai-link.js`, `legal.html`, `index.html`, `pages/build.mjs`, `pages/functions/api/telemetry.ts`, the migrations list, wrangler files and the privacy tests' titles.
* Live checks 2026-10-05 (curl): home, legal, z, zc, pay, partner, signin, report, ai-link, big; response headers of /z, /report, /pay, /ai/<bad key>, /api/partner/check, /api/notices, /api/payments/status (mode 'off'), /api/telemetry GET (404 without key), /api/report bad key (403); robots.txt and sitemap; all seven company-site pages. No POST was sent, no account or game was created.
* DNS: DKIM present, SPF on send.veridian-aios.com, DMARC p=quarantine, MX points to AWS inbound (Resend).
* Secret scan: values from `config/live-secrets.txt`, `platform-key.txt`, `telemetry-report-key.txt` searched in all tracked files and git history. Tracked files: no hits. History: platform key and phone salt present in commit 37a9181 (values not printed here).
* Vendor documents: Cloudflare D1 Time Travel (7 days Free, 30 days Paid) and D1 data location (India cannot be chosen).
* Not run: test suite, load test, spoofed inbound mail, restore drill, cross-tenant attack attempts beyond reading the tests.

## (h) Owner confirmations needed

1. Cloudflare plan is Workers Free (7-day backups) and the cron worker's last run time; D1 region.
2. Resend: log retention, key scope, bounce handling; create a send-only key.
3. Delete the one-off Workers token (project notes say it was pasted in chat).
4. Rotate ORGANIZER_SECRET and PHONE_SALT (G-06).
5. Whether Cloudflare Web Analytics was switched on (CSP allows it; no beacon seen).
6. Lawyer: lawful basis, Rule 6/8 logs vs 22 hours, gaming memo, children, DPA, claims.
