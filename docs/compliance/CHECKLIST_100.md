# Compliance checklist (168 checks: 134 apply to Tambola, 128 to the DPDP product)

Research document, not legal advice. Prepared 2026-10-05. To be used later to audit two products against one list:

* **T** = Corporate Tambola (`C:\ct\tambola`; facts in `docs/PRIVACY_AND_LIFECYCLE.md`, `docs/WINNERS_AND_AUDIT.md`, `apps/web/public/legal.html`).
* **D** = VERIDIAN AIOS DPDP (`C:\ct\ct-shortlink`, `dpdp-app/`, `supabase/functions/dpdp-*`, `src/app/dpdp`, `drizzle/`; facts in `dpdp-app/OPERATIONS.md`, `dpdp-app/USE-CASES.md`).
* **TD** = applies to both. Count at time of writing: 168 rows = 40 T-only + 34 D-only + 94 TD; so 134 apply to T and 128 to D. Within each product, the Critical and High rows are the ~100 that matter first; Medium and Low are second pass.

Columns: **ID** (stable, never renumber) | **Prod** | **Requirement** | **Src** (ids in `REQUIREMENTS_REGISTER.md`) | **How to verify** (where to look; nothing here was audited yet) | **Evidence needed** | **Sev** (critical / high / medium / low = harm if it fails) | **Owner** (product, organizer = the customer/fiduciary, lawyer, vendor).

Phrases like "verify X" are instructions for the later audit. They are not findings. Facts drawn from product docs are labelled "per docs".

Dates: DPDP substantive duties are reported to start 13 May 2027 (not yet in force on 5 Oct 2026); build and audit to them now. See register section 1.0.

---

## A. Notice and transparency

| ID | Prod | Requirement | Src | How to verify | Evidence | Sev | Owner |
|---|---|---|---|---|---|---|---|
| A01 | TD | A privacy notice is shown **before** the participant types a name and mobile number (T join screen) or answers a consent request (D `/act/`, `/copy/`, `/p/`). | IN-04, EU-07, US-CA-03 | Walk the join and consent flows on a phone; the notice or a clear link appears before the fields. | Screenshots with dates; flow recording | critical | product |
| A02 | TD | Notice lists: what data, each purpose, who receives it (processor, e-mail vendor, host), retention, how to exercise rights and withdraw, how to complain (Board, supervisory authority), contact. | IN-04, EU-07, US-CA-03 | Compare notice text against a field-by-field data inventory. | Data inventory; notice with mapping table | high | product / lawyer |
| A03 | TD | Plain language; available in English plus the main local languages (Eighth Schedule languages on request). | IN-04, EU-06 | Read at Grade 8-ish; check Hindi or other language version exists or an offer to provide one. | Readability note; translation files | medium | product |
| A04 | T | The organizer is named as the fiduciary/controller on the participant's notice **and** the platform as processor, with the organizer's contact reachable from the notice. | IN-02, EU-07 | Join screen and `legal.html` ("The organizer named on your ticket runs your engagement"): confirm organizer name and contact actually render. | Screenshot per game type | high | product / organizer |
| A05 | TD | Notice states **each retention period exactly as built** (T: 22-hour deletion, 24-hour promise, 365-day winners/prize/AI-audit records, 7-day backups; D: per-table retention). | IN-10, MKT-04 | Cross-check notice against the lifecycle doc and the actual scheduled-job code and database settings. | Lifecycle table = notice text = code | critical | product |
| A06 | T | Notice discloses the **prize hand-over record** (name and mobile the winner confirms, 365 days) before the person joins, not only after winning. | IN-04, EU-07 | Check the join notice and the winner "Confirm your prize details" screen. | Screenshots | high | product |
| A07 | T | Notice discloses the **device identifier stored on the phone** and its purpose (one ticket per phone). | EU-18, EU-07 | Read `legal.html` and join screen for a statement about on-device storage. | Notice text | high | product |
| A08 | D | The D product shows principals a notice **in the customer organisation's name**, not only the vendor's, with the customer's grievance contact. | IN-04, IN-11, VEN-07 | Open `/act/`, `/copy/`, `/p/` and the public page as a principal. | Screenshots; template config | critical | product / organizer |
| A09 | TD | The platform's own notice (for organizer, partner, billing and security-log data) exists separately from participant notices. | IN-04, EU-07, US-CA-03 | Look for Terms/Privacy pages for organizers and partners. | URLs; version history | high | product / lawyer |
| A10 | TD | Notices are versioned, dated, archived; changes are announced; a consent given under an old notice is traceable to that notice. | IN-05, EU-04 | Check whether each consent/join record stores a notice version id. | Schema; sample rows | medium | product |

## B. Consent and lawful basis

| ID | Prod | Requirement | Src | How to verify | Evidence | Sev | Owner |
|---|---|---|---|---|---|---|---|
| B01 | T | A written lawful-basis decision per processing purpose (join, play, report, prize hand-over, AI audit, telemetry) for DPDP (s6 or s7(a)/(i)), GDPR (Art 6) and US notice duties. | IN-03, IN-06, EU-03 | Ask for the register; compare with `legal.html` wording. | Signed-off lawful-basis table | critical | lawyer |
| B02 | TD | Consent (where relied on) is free, specific, informed, unambiguous, unticked, with a clear affirmative action; no pre-ticked boxes; not bundled with the service where not needed. | IN-05, EU-04 | Inspect the join/consent UI and the consent text. | Screenshots; DOM check | critical | product |
| B03 | TD | **Withdrawal is as easy as consent**; one tap/link; effect on data is explained. | IN-05, EU-04 | Try to withdraw in-app; D `/unsubscribe/`; T console / organizer route. | Test script and result | high | product |
| B04 | TD | Consent evidence is stored: who (pseudonym), when, which notice version, what was shown, channel; and can be exported. | IN-05, EU-04 | Look at consent tables / join records. | Schema; export sample | high | product |
| B05 | T | Consent/lawful basis does **not** depend on an employee being penalised for declining (voluntary game; no adverse effect). | EU-19, IN-06 | Review organizer-facing guidance and invite wording. | Guidance text | high | product / organizer |
| B06 | T | The organizer's instruction to the platform (processor terms) is accepted at organizer sign-up before any participant data flows. | IN-21, EU-10 | Check the organizer terms flow. | Accepted-terms record with timestamp | critical | product / lawyer |
| B07 | D | Consent campaigns sent to principals do not treat silence, inactivity or a default as consent. | IN-05, VEN-07 | Inspect campaign templates and response logic. | Template; logic review | critical | product |
| B08 | TD | Refusing optional uses (referral, analytics, invitations) does not block the core service. | IN-05, EU-04 | Decline optional items and complete the core flow. | Test result | medium | product |

## C. Purpose limitation and minimisation

| ID | Prod | Requirement | Src | How to verify | Evidence | Sev | Owner |
|---|---|---|---|---|---|---|---|
| C01 | T | Only name and mobile (and invitation relation if on) are collected from participants; no e-mail, location, contacts (as `legal.html` says). | EU-02, IN-05 | Network capture during join; inspect request payloads and DB columns. | HAR file; schema | high | product |
| C02 | TD | Data is used **only** for the stated purposes; no secondary use (analytics, marketing, model training) without a new basis. | EU-02, IN-05 | Grep for other consumers of the participant/principal tables; review sub-processors. | Data-flow diagram | high | product |
| C03 | T | The **hashed mobile number** (salted, one-way) is still personal data; it is deleted with the rest and not reused across games or organizers. | EU-02, IN-01 | Check hash salt scope (per engagement?) and deletion job. | Code reference; deletion log | high | product |
| C04 | T | Every field in the prize record (name, mobile, change history) is needed for hand-over; justify 365 days. | EU-02, IN-10 | Ask for the necessity reasoning (disputes, tax). | Written justification | high | lawyer |
| C05 | D | Principal groups are **counts only** (no personal data) and small-cell counts cannot identify an individual. | AI-02, IN-01 | Review the group tables and the minimum group size rule. | Schema; k-threshold rule | high | product |
| C06 | D | Evidence/proof files uploaded by customers are classified; the platform does not read them for its own purposes. | IN-02, EU-10 | Review access paths and storage policy. | Access-control matrix | high | product |
| C07 | TD | Telemetry/RUM contains no name, number or IP **in what the platform stores**; verify the claim for each store (including Cloudflare logs). | MKT-04, EU-18 | Inspect telemetry payload, D1 schema, vendor log settings. | Payload sample; vendor setting screenshot | high | product / vendor |

## D. Children and minors

| ID | Prod | Requirement | Src | How to verify | Evidence | Sev | Owner |
|---|---|---|---|---|---|---|---|
| D01 | T | A rule on participant age: 18+ only, or a minor plays only on a parent's ticket; the invite and join flow states it. | IN-13, EU-05, US-02 | Read invite text, join screen, rules; try a "family member" path. | Rule text; screenshots | critical | product / organizer |
| D02 | T | "Family members can win or take part for fun" does not silently collect a minor's own data (name + mobile) without verifiable parental consent. | IN-13, EU-05, US-02 | Trace the family-member option end to end. | Test log | critical | product / lawyer |
| D03 | T | No tracking, behavioural monitoring or targeted advertising directed at minors. | IN-13 | Confirm none exist; check analytics and device ID use. | Review note | high | product |
| D04 | D | The product supports **verifiable parental consent** records for school customers (guardian identity, method, date) per Rule 10 routes, and flags which processing relies on the Fourth Schedule exemption. | IN-13 | Review consent campaign types for guardians; school templates. | Template; record schema | critical | product / lawyer |
| D05 | D | Marketing and AI features are not directed at, and do not profile, children whose data a school stores. | IN-13, AI-02 | Review AI projection and digest content. | Review note | high | product |
| D06 | TD | COPPA: actual-knowledge procedure (what happens if a child under 13 is found), written security programme and retention policy (amended rule, 22 Apr 2026). | US-02 | Ask for the procedure and policy documents. | Policy documents | medium | lawyer / product |
| D07 | TD | EU Art 8 age thresholds are mapped per country if EU organizers are accepted. | EU-05 | Look for a country table or an EU exclusion. | Table or exclusion clause | medium | lawyer |

## E. Data principal / data subject rights process

| ID | Prod | Requirement | Src | How to verify | Evidence | Sev | Owner |
|---|---|---|---|---|---|---|---|
| E01 | TD | A **published channel** for access, correction, erasure, withdrawal, nominee and complaint requests, in the notice and on the site. | IN-12, IN-14, EU-08, US-CA-04 | Find the channel from the notice; send a test request. | Test ticket | critical | product |
| E02 | TD | **Response clocks** are tracked: DPDP grievance up to 90 days, GDPR 1 month, CCPA 45 days; clocks start at receipt on any channel. | IN-12, EU-06, US-CA-04 | Inspect ticket SLA logic; D inbound mailbox legal clock (per docs `DPDP_LEGAL_RESPONSE_DAYS` default 90). | SLA config; test run | high | product |
| E03 | T | Because participant data is deleted in 24 hours, requests after deletion get a truthful answer ("no data held; winners record only"); requests during play are routed to the organizer. | IN-14, EU-08 | Read the reply template; check routing. | Template | medium | product |
| E04 | T | The platform can **locate** a person's data without the person's name (hash of the number) and **verify** that the requester controls that number. | IN-14, EU-08 | Walk through an access-request script. | Runbook | high | product |
| E05 | TD | Identity verification for requests is proportionate (no more data than needed) and prevents impersonation (s15). | IN-15, EU-08 | Review the verification step; try a spoofed request. | Test log | high | product |
| E06 | D | The "mydata" page shows only the requesting principal's data and cannot leak another's (cross-tenant and cross-person tests). | IN-14, EU-12 | Review authorisation tests and run attempts. | Test report | critical | product |
| E07 | T | An organizer's "delete all participant data now" and an e-mailed delete request from a **spoofed organizer address** cannot erase data (SPF/DKIM/DMARC, shared secret). | IN-10, EU-12 | Send spoofed message in a test setup; read the inbound handler's authentication. | Test report; DNS records | high | product |
| E08 | TD | Rights requests are logged with outcome, reason for refusal, and date; deletion proof is issued on request. | EU-02, IN-14 | Sample the log. | Log extract | medium | product |
| E09 | TD | Opt-out of sale/share and GPC are honoured, or the site states it does not sell/share and runs no trackers. | US-CA-05, US-ST-02 | Test with a GPC browser; list third-party scripts. | Script inventory | medium | product |

## F. Retention and deletion

| ID | Prod | Requirement | Src | How to verify | Evidence | Sev | Owner |
|---|---|---|---|---|---|---|---|
| F01 | T | **The scheduled deletion job actually runs** (per docs the cron worker was an owner-only open step on 2026-10-03; fallback "nudges" are only a safety net). | IN-10, MKT-04 | Check the cron deployment, last-run times, alerting on failure. | Cron dashboard; alert config | critical | product / vendor |
| F02 | T | Participant names, numbers, seats, device ids, join times, claims are deleted 22 hours after the end, and a **test game proves it** end to end (rows gone from every table and from the report store). | IN-10, EU-02 | Run a staged game and query every table afterwards. | Before/after row counts | critical | product |
| F03 | T | **Backups**: "roll off within 7 days" is true for the actual D1 backup/point-in-time setting; verify the real vendor retention (I recall the free plan 7 days and the paid plan 30 days; **unverified**). | MKT-04, IN-10 | Check Cloudflare D1 Time Travel settings and plan. | Vendor setting screenshot | high | vendor / product |
| F04 | T | After the 365 days the engagement is erased at the stated time, including organizer details and AI audit rows. | IN-10, EU-02 | Review `eraseEverything` test and schedule. | Test output | high | product |
| F05 | T | Retention for winners/prize/AI-audit records is justified in writing and disclosed. | IN-10, EU-02 | See C04, AI-06. | Justification note | high | lawyer |
| F06 | D | Each D data class has a retention rule: principals' consent records, rights tickets, grievances, breach logs, evidence files, inbound mail (per docs `dpdp.mail_inbound` keeps subject, sender and first 4096 characters; the retention decision was "the owner's call"). | IN-10, EU-02 | Fill in a table: class, purpose, period, deletion method. | Retention schedule | high | product / lawyer |
| F07 | D | Customer **off-boarding**: export, then deletion within a stated time; deletion reaches backups, vendors and logs. | EU-10, IN-10 | Run an off-boarding test. | Test log | high | product |
| F08 | TD | Deletion cascades to **processors** (e-mail vendor, AI vendor, storage) and is evidenced. | IN-10, EU-10 | Review vendor retention settings (Resend message bodies; Supabase storage). | Vendor settings | high | vendor |
| F09 | TD | A legal-retention register exists for records the law requires (invoices, TDS, partner payouts) and a rule says these override erasure. | TAX-IN-03, IN-10 | Ask for the register. | Register | medium | lawyer |

## G. Security safeguards

| ID | Prod | Requirement | Src | How to verify | Evidence | Sev | Owner |
|---|---|---|---|---|---|---|---|
| G01 | TD | Encryption at rest and in transit for personal data; T uses AES-256-GCM sealing (per docs); D relies on Supabase/Postgres encryption plus app-level controls; **no secret in code or files** (per docs T mentions a secrets file path; confirm it is excluded from git and from backups). | IN-08, EU-12 | Scan the repo and history for secrets; check git-ignore; inspect where keys live. | Scan report | critical | product |
| G02 | T | Key management: the data key (HKDF of `DATA_KEY`) has an owner, a rotation procedure, and a recovery procedure; loss or leak plans exist. | IN-08, EU-12 | Read the runbook. | Runbook | high | product |
| G03 | TD | Access control: least privilege for staff and for each API key; MFA for admin and vendor consoles. | IN-08, EU-12 | Check roles in Cloudflare, Supabase, Resend, GitHub, Razorpay. | Role export | high | product |
| G04 | TD | **Bearer-secret URLs** (T report link `?k=`, D `/ai/<key>`, `/act/`, `/copy/` tokens, magic links) do not leak: no-referrer, no-store, short expiry, revocation, no logging of the query. | IN-08, AI-04 | Inspect headers and logs; try reuse after expiry. | Header capture; test | high | product |
| G05 | TD | **Logs**: security and access logs exist, detect unauthorised access, are kept at least one year where Rule 6 applies and 180 days in India for CERT-In, and contain no unnecessary personal data. | IN-08, IN-31 | Review log settings in each vendor; reconcile with T's deletion promise. | Log policy | high | product / lawyer |
| G06 | TD | Backups and restore are tested; recovery objectives written. | IN-08, EU-12 | Ask for the last restore test. | Test record | medium | product |
| G07 | TD | **Tenant isolation**: one organizer or customer cannot read another's data (T per engagement; D per organisation, row-level security). | EU-12, IN-07 | Run cross-tenant tests; per docs D has `dpdp-cross-tenant-rpc.test`. | Test report | critical | product |
| G08 | TD | Rate limiting, bot protection and abuse controls on join, sign-in code, and request endpoints. | EU-12 | Test brute force on sign-in codes and invite links. | Test log | high | product |
| G09 | TD | Dependency and vulnerability management; patching cadence; an independent penetration test before go-live and annually. | EU-12, VEN-06 | Ask for the last report. | Report summary | high | vendor |
| G10 | TD | Secure SDLC: code review, CI scans, environment separation; production data not used in tests. | EU-12, IN-07 | Review CI and test data. | CI config | medium | product |
| G11 | D | Evidence/proof uploads are scanned, access-controlled, and served with safe content types. | EU-12 | Test an upload with a harmful file. | Test log | high | product |

## H. Breach response

| ID | Prod | Requirement | Src | How to verify | Evidence | Sev | Owner |
|---|---|---|---|---|---|---|---|
| H01 | TD | A written incident-response plan with severity levels, owners, a 24x7 contact, and rehearsals. | IN-09, EU-13 | Read it; ask for the last drill. | Plan; drill report | critical | product |
| H02 | TD | **Processor-to-customer notice clock** is fixed in the customer contract (e.g. 24 to 48 hours), enabling their 72-hour regulator clocks. | IN-09, IN-21, EU-13 | Read the DPA. | DPA clause | critical | lawyer |
| H03 | TD | **CERT-In 6-hour** reporting route and contact exist. | IN-31 | Check registration of the contact; runbook. | Runbook | high | product |
| H04 | TD | A breach register records facts, effects, actions, notifications, even for non-notifiable events. | EU-13, IN-09 | Review the register template. | Template | medium | product |
| H05 | D | The D breach-log feature collects what Rule 7 and Art 33 need (nature, categories, counts, consequences, mitigation, contact) and tracks the 72-hour clock. | IN-09, EU-13 | Compare form fields with Rule 7 and Art 33(3). | Field mapping | high | product |
| H06 | T | A communication template for participants and organizers exists in plain language. | IN-09, EU-13 | Review template. | Template | medium | product |
| H07 | TD | US state breach laws are mapped for any US residents' data (partners, organizers). | US-05 | Look for a state matrix. | Matrix | low | lawyer |

## I. Processors, sub-processors and contracts

| ID | Prod | Requirement | Src | How to verify | Evidence | Sev | Owner |
|---|---|---|---|---|---|---|---|
| I01 | TD | A **customer DPA** with the processor terms: instructions, confidentiality, security, sub-processors with notice and objection, rights assistance, breach notice, deletion/return, audit; **also carrying the CCPA service-provider terms**. | IN-21, EU-10, US-CA-02 | Read the DPA; compare against Art 28(3) and 11 CCR 7051. | DPA | critical | lawyer |
| I02 | TD | A **public sub-processor list** (Cloudflare, Resend, Supabase, Razorpay, any AI vendor, any analytics) with country, purpose, safeguards, and change notice. | EU-10, IN-17 | Check the page; compare with actual vendors. | URL; vendor inventory | high | product |
| I03 | TD | Signed vendor DPAs with each sub-processor; SCCs/DPF status recorded (Cloudflare: DPF + SCCs per its page; Resend: SCCs/DPF per snippets; Supabase: DPA available). | EU-16, EU-17 | Download each DPA and sign where needed. | Signed DPAs | high | vendor |
| I04 | T | The organizer is told they are the fiduciary/controller and must have their own lawful basis, notice to employees, and works-council agreement where needed. | IN-02, EU-19 | Read organizer terms and onboarding. | Terms; guidance | high | organizer / product |
| I05 | TD | The **platform's own** fiduciary/controller uses (organizer accounts, partners, billing, security logs) are separate and disclosed. | IN-02, EU-02 | Map purposes; check notice A09. | Purpose map | medium | product |
| I06 | TD | Vendors cannot use customer data to train or improve their own models; zero-retention settings are on where available. | AI-01 | Check each AI/e-mail vendor setting. | Settings; contract | high | vendor |
| I07 | TD | Liability and indemnity clauses match reality (see O row on guarantees). | VEN-01, MKT-07 | Read terms. | Terms | medium | lawyer |
| I08 | TD | Vendor concentration: a fallback exists if Cloudflare, Supabase or Resend fails or is blocked in a region. | EU-12 | Ask for the continuity plan. | Plan | low | product |
| I09 | D | The D contract explains the fiduciary/processor split for consent campaigns, rights requests and grievances run by the platform for the customer. | IN-02 | Read the customer terms. | Terms | high | lawyer |

## J. Cross-border transfers

| ID | Prod | Requirement | Src | How to verify | Evidence | Sev | Owner |
|---|---|---|---|---|---|---|---|
| J01 | TD | A **data-location map**: where each store physically sits (Cloudflare D1 region or location hint, Workers edge, Supabase project region, Resend region, AI vendor). | IN-17, EU-16 | Read configuration and vendor consoles. | Map | high | product |
| J02 | TD | India: no restricted destination under the s16 negative list; re-check when Government notifies. | IN-17 | Watch notifications; record check date. | Check log | medium | lawyer |
| J03 | TD | EU/UK: SCCs (EU organizer to India-based platform; platform to US vendors) or DPF reliance, plus a **transfer impact assessment**. | EU-16, UK-01 | Look for SCCs and TIA. | SCCs; TIA | high | lawyer |
| J04 | TD | DPF-dependence is not the sole safeguard while C-703/25 P is pending; SCC fallback documented. | EU-17 | Read vendor DPAs. | DPAs | medium | lawyer |
| J05 | TD | Sector rules (payment data localisation for Razorpay; any education/health rules for D customers) do not require local storage the product lacks. | IN-36, VEN-08 | Ask Razorpay what data stays with them; list sector customers. | Note | medium | lawyer |

## K. Cookies, local storage and tracking

| ID | Prod | Requirement | Src | How to verify | Evidence | Sev | Owner |
|---|---|---|---|---|---|---|---|
| K01 | TD | **Inventory of everything stored or read on the device**: cookies, localStorage, IndexedDB, service-worker caches, device id, session tokens, referral code, "your copy on this device" data. | EU-18, UK-03 | Inspect browser storage on each page and the PWA. | Inventory table | high | product |
| K02 | TD | Each item is classified "strictly necessary / functional / analytics / marketing"; the claim "we use no cookies" is only made if literally true, and the notice mentions other device storage. | EU-18, MKT-04 | Compare inventory to `legal.html` and D privacy page. | Classification | high | product / lawyer |
| K03 | T | The device id for one-ticket-per-phone is justified as strictly necessary (security/fairness) or covered by consent where EU/UK people play. | EU-18 | Read the justification. | Memo | medium | lawyer |
| K04 | D | The referral code kept in browser storage is covered by notice and, for EU/UK visitors, consent or exemption analysis. | EU-18, UK-03 | Inspect the `?ref=` script. | Memo | medium | lawyer |
| K05 | TD | No third-party trackers or ad pixels; GPC, DNT not required but no sale/share. | US-CA-05 | List requests on every page. | Network capture | medium | product |

## L. E-mail and messaging

| ID | Prod | Requirement | Src | How to verify | Evidence | Sev | Owner |
|---|---|---|---|---|---|---|---|
| L01 | TD | Each message type is classified **transactional / relationship / marketing** (sign-in codes, invoices, reports, reminders, D weekly digest, partner mail). | US-03, UK-03 | Inventory templates; classify. | Classification table | high | product |
| L02 | TD | Marketing or promotional content (upsell inside a digest, partner promotion) has opt-in or soft-opt-in where required, an unsubscribe link, sender identity, postal address. | US-03, UK-03 | Read the digest and partner templates. | Template review | high | product |
| L03 | TD | SPF, DKIM, DMARC set up for the sending domain; bounce and complaint handling; no purchased lists. | US-03, EU-12 | Check DNS and Resend dashboard. | DNS records | medium | product |
| L04 | T | Report e-mails contain **links, not personal data**, and the link expiry matches deletion (per docs). | EU-12, IN-08 | Read one real e-mail; test link after expiry. | Sample e-mail | high | product |
| L05 | D | Consent-campaign and unsubscribe mail identify the customer organisation, work in the principal's language, and honour opt-out at once. | VEN-07, US-03 | Run a campaign test. | Test mail | high | product |
| L06 | TD | No SMS or WhatsApp is sent; if added later, TRAI DLT / TCPA consent and revocation are built first. | IN-35, US-04 | Check no SMS provider key exists. | Config review | medium | product |
| L07 | T | The invitation feature (participant sends link to up to 4 people) does not make the platform the sender of unsolicited messages and the shared text contains no personal data about the inviter beyond what is needed. | US-04, US-03 | Read the share text and mechanism. | Screenshots | medium | product |

## M. Employer / employee context

| ID | Prod | Requirement | Src | How to verify | Evidence | Sev | Owner |
|---|---|---|---|---|---|---|---|
| M01 | T | Organizer guidance states: participation voluntary; no penalty for not joining; use work-appropriate prizes; consult HR/legal; works council where applicable. | EU-19, IN-06 | Read the organizer guide and terms. | Guide | high | product |
| M02 | T | The organizer (not the platform) decides the lawful basis for employees; the platform provides a template notice for employees. | IN-06, EU-03 | Check template availability. | Template | medium | product |
| M03 | T | Individual participation data is **not exposed to the employer beyond need**: confirm what the organizer's console and report show about each employee (names and numbers appear in the report per docs). | EU-02, IN-05 | Review report contents; check whether the notice says the organizer sees them. | Report sample | high | product |
| M04 | TD | US: employee and B2B data are in CCPA scope (not in most other states); organizer's California employees get a CCPA notice. | US-CA-01, US-ST-03 | Look for a state-law note in organizer guidance. | Guidance | low | lawyer |

## N. Records, accountability, grievance officer, DPO and representative

| ID | Prod | Requirement | Src | How to verify | Evidence | Sev | Owner |
|---|---|---|---|---|---|---|---|
| N01 | TD | A **records of processing** exists in controller and processor forms. | EU-11 | Request the document. | RoPA | high | product |
| N02 | TD | A named **grievance/contact officer** with a role mailbox (not a personal address) is published; response times stated. | IN-11, IN-12 | Read the legal page; `legal.html` currently lists a personal Gmail address (per docs/page). | URL; mailbox | high | product |
| N03 | TD | DPO assessment: not mandatory under GDPR unless core large-scale monitoring; decision recorded; under DPDP only SDFs need one but a contact is needed. | EU-14, IN-16 | Read decision note. | Note | medium | lawyer |
| N04 | TD | Art 27 representative (EU/UK) decision recorded: either "we do not target the EU/UK" and marketing is consistent, or a representative is appointed. | EU-15, UK-01 | Check site language, currency, targeting. | Decision note | high | lawyer |
| N05 | TD | **DPIA** or similar risk assessment done for: T (participant mobile numbers, prize records, device ids), D (children's consent, AI, public page). | EU-14, US-CA-06 | Read assessments. | DPIA | high | product / lawyer |
| N06 | TD | Data-mapping and a **data inventory** per product, owned and reviewed twice a year. | EU-09, IN-07 | Read inventory and dates. | Inventory | medium | product |
| N07 | TD | **Training**: staff and AI-agents operators know the data rules and incident path. | EU-09 | Ask for a record. | Record | low | product |

## O. Marketing and public claims

| ID | Prod | Requirement | Src | How to verify | Evidence | Sev | Owner |
|---|---|---|---|---|---|---|---|
| O01 | TD | A **claims register**: every compliance, security, privacy and AI claim on the site, e-mail and sales deck, with owner, evidence link, date reviewed. | MKT-01, MKT-04 | Ask for the register; sample 10 claims. | Register | critical | product / lawyer |
| O02 | TD | No claim of being "certified", "approved", "audited", "fully compliant" or "guaranteed" without a named third party and scope; self-assessment is labelled as such (T's page already says "not certified by an outside body"). | MKT-02, MKT-03 | Search all pages for those words. | Search output | critical | product / lawyer |
| O03 | TD | Privacy-page promises are literally true, including edge cases: "never sell", "no cookies", "no IP address", "deleted within 24 hours", "backups roll off within 7 days", "no one else sees your name". | MKT-04 | Test each promise against the system (see C07, F02, F03, K02). | Test log per promise | critical | product |
| O04 | TD | Marketing for India states what DPDP duties are in force and when (substantive duties from 13 May 2027 per reports), and does not suggest a legal deadline that has not been notified. | IN-19 (status), MKT-05 | Read pages for dates. | Text | medium | product |
| O05 | D | "DPDP compliant" claims distinguish the platform's own compliance from the customer's; the product never says using it makes the customer compliant. | VEN-01, VEN-02 | Search for "compliant", "protect", "safe". | Search output | critical | product / lawyer |
| O06 | D | "We sell protection" style wording is removed or reviewed: no guarantee against penalties, no insurance-like promise. | VEN-02 | Read pricing, terms, sales material. | Review note | critical | lawyer |
| O07 | D | The product does not present itself as a **consent manager** or as a legal adviser; "attestation" is labelled "customer's own declaration". | IN-19, VEN-03, VEN-04 | Read public pages and templates. | Review note | high | lawyer |
| O08 | D | Public compliance page or badge: shows scope, date and statement owner; cannot display an unsupported seal. | VEN-05 | Test creating a page with no evidence. | Test | high | product |
| O09 | TD | Security claims (encryption, ISO, SOC, pen-test) name scope and date. | VEN-06, MKT-01 | Read claims. | Reports | high | product |
| O10 | TD | Testimonials, comparison and "AI" claims are substantiated; no AI-washing. | MKT-08, IN-32 | Read claims; request evidence. | Evidence file | medium | product |
| O11 | TD | Dark patterns avoided on sign-up, payments, cancellation and consent. | IN-32 | UX review against the 2023 guidelines list. | Review | medium | product |

## P. Gaming, prize and lottery law

| ID | Prod | Requirement | Src | How to verify | Evidence | Sev | Owner |
|---|---|---|---|---|---|---|---|
| P01 | T | **No money or stake from any participant**, ever: platform blocks or warns on features that collect entry fees, ticket prices, donations or purchases tied to play. | GAME-IN-01, US-GAM-01 | Read organizer settings and payment flows: the only payer is the organizer. | Flow diagram | critical | product |
| P02 | T | Terms state that organizers may not charge participants, and that violating this voids the service. | GAME-IN-01, GAME-IN-04 | Read terms. | Terms | critical | lawyer |
| P03 | T | Written legal analysis: free corporate tambola vs PROG Act 2025 (online money game / online social game); decision about applying for a **determination** under the 2026 Rules. | GAME-IN-01 to 03 | Read memo. | Memo | critical | lawyer |
| P04 | T | State-by-state (India) gambling check for organizers: guidance says private, closed-group, no entry fee; list states with commercial-housie enforcement. | GAME-IN-04 | Read guidance. | Guidance | high | lawyer |
| P05 | T | Country gating: UK, US, EU rules differ; either block unsupported jurisdictions or add per-country rules (UK gaming-licence question unresolved). | UK-04, US-GAM-01, EU-23 | Check geo-blocking and terms. | Country list | high | lawyer |
| P06 | T | Official rules for each game (eligibility, how winners are decided, no purchase necessary, prize description, sponsor) are available to participants. | US-GAM-03 | Read rules page and join flow. | Rules text | medium | product |
| P07 | T | Prize registration/bonding warnings (NY, FL over USD 5,000) in organizer guidance. | US-GAM-02 | Read guidance. | Guidance | medium | product |
| P08 | T | The **fairness mechanism** (public randomness, quorum of phones) is described accurately; no claim of "certified fair", "audited RNG". | MKT-02, MKT-04 | Read rules and marketing. | Text | high | product |
| P09 | T | Prize hand-over and disputes: platform disclaims reward handover (per `legal.html`) and the organizer's terms say who handles disputes; this disclaimer does not contradict the platform's own control. | GAME-IN-04 | Read disclaimer and terms. | Terms | medium | lawyer |
| P10 | TD | The organizer-controlled "winners" cannot be changed by organizer, co-host or AI (per docs); the audit trail makes this verifiable. | AI-03 | Review `WINNERS_AND_AUDIT.md` claims against tests. | Test list | medium | product |

## Q. Payments, tax, GST and TDS

| ID | Prod | Requirement | Src | How to verify | Evidence | Sev | Owner |
|---|---|---|---|---|---|---|---|
| Q01 | TD | Razorpay (or other gateway) handles all card/UPI data; the platform never stores payment credentials; PCI scope documented. | IN-36 | Review integration; look for card fields in DB. | Integration note | high | product |
| Q02 | TD | Who is merchant of record is clear; refunds and failed payments flow is defined; the Razorpay account type permits the business model. | IN-36 | Read Razorpay agreement. | Agreement | high | lawyer |
| Q03 | TD | GST: registration, invoice format, e-invoicing if above threshold, rates and place of supply for foreign organizers. | TAX-IN-02 | Read invoices. | Sample invoice | medium | tax adviser |
| Q04 | T | Organizer guidance warns about **TDS on winnings** (30% over INR 10,000 per transaction; s393(3) of the Income-tax Act 2025) and in-kind prizes. | GAME-IN-06 | Read guidance. | Guidance | high | product / tax adviser |
| Q05 | T | The platform itself does not hold or distribute prizes (so it does not become the payer of winnings). | GAME-IN-06 | Confirm flows. | Flow diagram | high | product |
| Q06 | TD | Invoices and payment records are kept for the legal period and excluded from erasure with a documented reason. | TAX-IN-03 | See F09. | Register | medium | lawyer |
| Q07 | D | Billing data of customers (names, GST numbers, contact) is separate from compliance content and covered by notice A09. | I05 | Check schema. | Schema | medium | product |
| Q08 | TD | Currency, tax and consumer rules for B2C purchases (if individuals can buy) are covered: refund policy, e-commerce disclosures, grievance officer. | IN-32 | Read purchase flow. | Flow; policy | medium | lawyer |

## R. Partner / referral programme data

| ID | Prod | Requirement | Src | How to verify | Evidence | Sev | Owner |
|---|---|---|---|---|---|---|---|
| R01 | TD | Partner terms: commission rules, clawbacks (cancelled on refund or reversal per D docs), eligibility, **independent contractor status**, anti-spam rules for referrers. | TAX-IN-01 | Read `/partner/terms/` and T equivalent. | Terms | high | lawyer |
| R02 | TD | Partner payout details (bank/UPI, PAN, GST) are minimal, protected as sensitive data, and **not visible** to other partners or staff without need. | IN-30, EU-12 | Check schema and access rules. | Access matrix | critical | product |
| R03 | TD | **TDS** on commission (s194H / s393(1), 2% above INR 20,000; 20% without PAN), Form 16A and return filing are in the payout process. | TAX-IN-01 | Read payout runbook; sample payout. | Runbook; sample | high | tax adviser |
| R04 | TD | Referral tracking (link, code in local storage, coupon) is disclosed; the partner cannot access end-customers' personal data. | EU-18, IN-04 | Inspect what partners see. | Screenshots | high | product |
| R05 | TD | Referrers do not send unsolicited messages in the platform's name; a spam policy and enforcement exist. | US-03, US-04, IN-35 | Read policy; check suspension path. | Policy | medium | product |
| R06 | TD | Partner data retention and deletion rules reconcile with tax records. | F09 | Read retention schedule. | Schedule | medium | lawyer |
| R07 | TD | Fraud and self-referral checks; disputes process; partner can see and correct their own data and request deletion. | IN-14, EU-08 | Test a partner request. | Test log | medium | product |

## S. AI assistant specifics

| ID | Prod | Requirement | Src | How to verify | Evidence | Sev | Owner |
|---|---|---|---|---|---|---|---|
| S01 | TD | The AI manual and every API response the AI can read **contain no personal data** (no names, numbers, e-mails, free-text with identifiers); verified by automated tests with planted identifiers. | AI-02, AI-01 | Plant a name and number in a game or record; call every AI-readable route; assert absent. | Test file and run log | critical | product |
| S02 | D | The "personal-data-free projection" survives re-identification review (small counts, rare combinations, free text). | AI-02 | Run the review on real shaped data. | Review report | high | product |
| S03 | TD | AI access keys: scoped, short-lived, revocable, rate-limited; destructive or irreversible actions (erase, publish, pay) require a **human confirmation** (per T docs the AI can only request erase). | AI-04 | Test each action as an AI key. | Test log | critical | product |
| S04 | TD | The short work link (`/ai/<key>`) is treated as a secret: not indexed, no-store, not logged in clear, cannot be guessed. | AI-04, G04 | Check headers, logging, entropy. | Header capture | high | product |
| S05 | TD | **Prompt injection** from untrusted text (participant names, inbound e-mail, evidence files) cannot cause the AI to take actions beyond its scope; content is marked untrusted. | AI-04 | Plant instructions in a name or an inbound mail; observe AI behaviour. | Test report | high | product |
| S06 | TD | AI audit trail records every call, includes IP, user agent, country; disclosed in notice; retention justified; readable by the organizer and by the platform only for stated purposes. | AI-06 | Read notice and table; confirm access controls. | Notice; schema | high | product |
| S07 | D | AI edits and drafts are clearly labelled as drafts, require human approval, keep a version history and can be rolled back. | AI-03, AI-08 | Test an AI edit end to end. | Test log | high | product |
| S08 | D | AI-generated legal text is reviewed by a lawyer before it ships in templates; disclaimers are present. | AI-08, VEN-04 | Check the review record. | Record | high | lawyer |
| S09 | TD | AI vendor terms: no training on data, retention limits, location, sub-processor list; AI vendor appears on the sub-processor list where the platform itself sends data. | AI-01 | Read terms; check settings. | Terms | high | vendor |
| S10 | TD | Users are told an AI can act on their data, what it can and cannot do, and where calls are logged (EU AI Act Art 50 where it applies). | AI-05, EU-21 | Read the notice and manual. | Text | medium | product |

## T. Governance

| ID | Prod | Requirement | Src | How to verify | Evidence | Sev | Owner |
|---|---|---|---|---|---|---|---|
| T01 | TD | A **compliance calendar** of dates that matter: 13 Nov 2026 (consent managers), 13 May 2027 (DPDP duties), 1 Jan 2027 (CCPA ADMT), pending DPF appeal, UK DUAA stages, EU AI Act dates; reviewed monthly. | IN-19 (status), EU-17, US-CA-06 | Read the calendar. | Calendar | high | lawyer |
| T02 | TD | Change control: any new data field, vendor, tracker, AI feature or message type triggers a privacy review before release. | EU-09 | Look for a template or CI gate. | Gate evidence | high | product |
| T03 | TD | Regulatory watch: owner for Gazette notifications (MeitY), CJEU, FTC and state laws; record of each check. | IN-19 | Read log. | Log | medium | lawyer |
| T04 | TD | **Lawyer review** of all legal text (privacy pages, terms, DPA, partner terms, templates) with dated sign-off (per T docs the review is still an owner-only open step). | IN-04, IN-33 | Ask for sign-off emails. | Sign-off | critical | lawyer |
| T05 | TD | Insurance (cyber, tech E&O) matched to claims; no insurance-like promises to customers. | VEN-02 | Read policy. | Policy | low | owner |

## U. Functions specific to the D product

| ID | Prod | Requirement | Src | How to verify | Evidence | Sev | Owner |
|---|---|---|---|---|---|---|---|
| U01 | D | **Duties register** content is traceable to the actual Act/Rules text with section and rule numbers, dated, versioned; **statuses (in force vs not yet)** are accurate. | IN-19 (status), IN-01 to IN-14 | Sample 20 rows; compare to the Gazette. | Comparison log | high | lawyer |
| U02 | D | Consent campaigns: sender identity, notice, language, withdrawal; audit trail of sends and responses; bounce and complaint handling. | IN-05, VEN-07 | Run a campaign test. | Test | high | product |
| U03 | D | Rights requests and grievances: intake from web and e-mail, identity check, clocks, escalation (per docs a legal request escalates at once), reply templates, closure notes. | IN-12, IN-14, E02 | Test each channel. | Test log | high | product |
| U04 | D | **Inbound mailbox** (`dpdp@`): spam, attachments, personal data in bodies; truncation to 4096 characters is deliberate; access controlled; retention decided; digest e-mails do not copy full content. | F06, G04 | Read OPERATIONS and configuration. | Config | high | product |
| U05 | D | Weekly **digest e-mails** show only what is necessary and no personal data; recipients are limited to authorised roles. | L01, C02 | Read a digest. | Sample | medium | product |
| U06 | D | Public page: appears only when customer publishes; shows a date and scope; takedown works. | VEN-05 | Test publish and unpublish. | Test | high | product |
| U07 | D | **mydata**: sign-in method (magic link), session safety, what is shown, what actions exist (access, correction, erasure, nominee). | IN-14, E06 | Test as principal. | Test | high | product |
| U08 | D | Attestations: record who attested, what, when, with which text version; immutable log; clear that it is the customer's declaration. | VEN-03, IN-34 | Inspect schema and UI. | Schema | high | product |
| U09 | D | Evidence files and data map entries are tenant-isolated, encrypted, versioned and downloadable by the customer. | G07, G11 | Test cross-tenant access. | Test | high | product |
| U10 | D | Groups and counts: no re-identification from counts; small groups masked. | C05 | Test with n=1 to 4. | Test | high | product |
| U11 | D | Sales-partner and billing flows (Razorpay, commissions) follow Q and R rows. | R01 to R07, Q01 to Q08 | See those rows. | See rows | high | product |
| U12 | D | Staff access to customer data (support, owner digest) is logged, minimal, approved and reviewed. | G03 | Read access log. | Log | high | product |

---

## Item counts

* Total rows: **168** (40 T-only, 34 D-only, 94 TD).
* Applies to Tambola (T + TD): **134**. Applies to the DPDP product (D + TD): **128**.
* Recount after any edit: `grep -cE '^\| [A-U][0-9]{2} \|' CHECKLIST_100.md` for the total, and the same with `\| TD \|`, `\| T \|`, `\| D \|` after the id.
