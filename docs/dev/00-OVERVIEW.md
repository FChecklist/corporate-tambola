# 00 - Overview: what Corporate Tambola is

> Verified against the code on 2026-10-07 (working tree, including uncommitted role work). `path:line` references are to that state; lines drift, names do not.
> Where this document and the code disagree, the code wins (see `README-FOR-AI.md`).

## 1. What it is (one paragraph)

**Corporate Tambola** is a tambola (housie / bingo, numbers 1-90, 3x9 tickets) for company events, played by guests on **their own mobile phones, with no app to install**. A company (the **Organizer**) builds a game ("engagement"), publishes it for free, pays before the start time (price depends on the number of people), shares one link, and the game runs by itself on the guests' phones. The numbers come from **public randomness (the drand "quicknet" beacon)**, so no server and no person draws them, and the **winners are worked out by the phones and accepted only when several different phones agree**. Guests pay nothing. After the game the Organizer gets a PDF report and all guest personal data is deleted within 24 hours.

Product name: `Corporate Tambola` (brand in `apps/edge/src/brand.ts:8`, `packages/billing/src/index.ts` `BRANDS.corporate_tambola`). Legal entity on invoices: IT Services by Rajat Agarwal (`packages/billing`, `COMPANY_JSON` in `pages/wrangler.toml`). Live site: `https://corporate-tambola.pages.dev` (Cloudflare Pages, free plan, no custom domain yet: `pages/wrangler.toml`, `pages/build.mjs`).

Wording rule (owner directive 2026-10-01, `docs/GLOSSARY.md`): say **engagement** (not "game" in code identifiers, tables, URLs) and **participant** (not "player"). Product UI text still says "game" in many places; code says `engagement`. Packs are sold as "Up to N participants".

## 2. Who uses it (actors)

| Actor | What they do | Credential | Where |
|---|---|---|---|
| **Guest / participant** | Opens the guest link on a phone, enters name + mobile number, gets a unique ticket, marks numbers, wins prizes, confirms prize hand-over details | none (a phone-generated device id + the `pid` ticket id returned by join) | `apps/web/public/z.html`, `z.js` |
| **Organizer** (1 per account) | Builds, publishes, pays, runs the game day, reads the report, manages account (keys, e-mail, AI link, close account) | master key `ctk_...` (kind `master`) obtained by signing in with an e-mailed 6-digit code or one-click link | `zc.html` (console), `pay.html`, `report.html` |
| **Host** (up to 5 per account) | Everything inside a game except account-level actions; may add Co-hosts, not Hosts | `cth_...` (kind `host`) | `zc.html?k=...` or the Host's AI work link `/ai/<cth_key>` |
| **Co-host** (unlimited) | Invites people with an own link (sees how many they brought) and may pay; nothing else; sees no guest list | `ctc_...` (kind `cohost`) | `zc.html?k=<ctc_key>` |
| **Organizer's AI assistant** (external: ChatGPT, Claude, Gemini...) | Builds drafts and manages a game through a short link; can never pay, publish, erase, pause, or touch names/numbers | `cta_...` (kind `ai`), used as `/ai/<key>` | `apps/edge/src/ai-link.ts`, `ai-go.ts` |
| **Refer & Earn partner** (also called *sales partner* in code/docs) | Shares a `?ref=` link; earns 50% of the software price on referred paid purchases | `ctp_...` partner key (header `x-partner`) | `partner.html`, `/api/partner/*` |
| **Platform owner** (us) | Operates the service: issues organizers, sees all, sets TEST/LIVE, reads audit log and visit reports, pays out partners | `ORGANIZER_SECRET` ("platform key") | owner routes, `owner-visits.html` |
| **Scheduled job** | Calls the lifecycle tick every minute | `CRON_KEY` | `apps/cron/src/index.ts` |
| **Inbound mail service** | Forwards e-mails asking for deletion | `INBOUND_SECRET` | `POST /api/inbound-email` |
| **Anonymous visitor** | Reads public pages, may be tracked (privacy-safe) by `v.js` | none | `/api/v/b` |

Note: "sales partner" and "Refer and Earn partner" are the **same server entity** (`partner` table). The console role pill distinguishes labels in the UI only (`apps/web/public/zc.js:481`, verify after the console rewrite).

## 3. What / why / when / where / how (plain language)

- **What**: a real tambola with 1 or 2 tickets per person, 1-5 rounds, prizes per "house" (Early Five, Top line, Middle line, Bottom line, Four corners, Star, Full house, Full two-ticket house), "brand moments" (opening / during-game break / closing showing the company's own message, YouTube link, or video/audio file), lucky draws, invitations, a big-screen page, a PDF report.
- **Why**: companies want an engaging, trustworthy, zero-install game for events. Trust is a selling point: nobody (not the organizer, not us) can choose a number or a winner (`docs/WINNERS_AND_AUDIT.md`, `apps/edge/src/ai-facts.ts` fact 6).
- **When**: building and publishing are free at any time; payment is due **before the start time**; the first number is called **2 minutes after** the start time (`GRACE_ROUNDS = 40` rounds of 3 s: `packages/beacon/src/config.ts`); guest personal data is deleted **23 hours after the game ends** (promise: 24 h), everything else **365 days** after (`apps/edge/src/lifecycle.ts:20`, `:38`).
- **Where**: Cloudflare (free plan): Pages (static files + Pages Functions that wrap one Worker handler), D1 (SQLite), a cron Worker. Guests' phones do the heavy work. Locally it can run as one Bun process with SQLite (`apps/edge/src/local.ts`).
- **How**: see `01-ARCHITECTURE.md` and `07-FLOWS.md`.

## 4. Business model and price packs

Price is **per engagement, by size** (not per ticket, not a subscription). Source of truth: `packages/shared/src/pricing.ts:2` (`PACKS`), `GST = 0.18` at `:5`.

| Pack (up to N participants) | INR software price (excl. GST) | INR incl. 18% GST | USD (all-inclusive, no GST) |
|---|---|---|---|
| 100 | 1,999 | 2,358.82 | 34 |
| 250 | 2,999 | 3,538.82 | 51 |
| 500 | 3,999 | 4,718.82 | 67 |
| 750 | 4,999 | 5,898.82 | 84 |
| 1000 | 5,999 | 7,078.82 | 101 |
| 2500 | 9,999 | 11,798.82 | 169 |
| 5000 | 14,999 | 17,698.82 | 253 |
| 10000 | 24,999 | 29,498.82 | 421 |

- The site shows these as a "Festive offer: 50% off" with a regular price struck out (`apps/web/public/site.js:27`); the **charged price is the table above** (test `apps/edge/test/branding.test.ts` "structured data prices equal the real packs").
- An engagement's `cap` need not equal a pack size; the **smallest pack >= cap** is charged (`worker.ts` summary, `pay.ts:190`). Above 10,000 needs "a custom arrangement" (`pay.ts:191`). Hard server limit of `cap` is 100,000 (`worker.ts:859`).
- **We do not give refunds.** If you cancel a paid game before it starts, your payment stays as credit for your next game for 365 days; unused credit lapses at the end of day 365 (India time). Unused places are not credited once the game has started (`AI_MANIFEST.payment_faq` in `apps/edge/src/worker.ts`; mechanics in `06-BUSINESS-LOGIC.md` section 3c).
- **Refer & Earn**: partners earn **50% of the taxable (pre-GST) value** of a referred, paid purchase, and the same 50% on the same customer's repeat purchases within 365 days (`apps/edge/src/partners.ts:15-18`).
- Cost to us: zero fixed cost by design (Cloudflare free plan, Resend free mail, shared domain). Daily D1 write guard **80,000** of Cloudflare's 100,000 (`worker.ts:172`).
- Optional launch switch `FREE_LAUNCH=1`: engagements up to 100 participants publish already paid (`pay.ts:41`).

## 5. The zero-cost Cloudflare architecture in 6 lines

1. Static files (`apps/web/public`, filtered by `pages/build.mjs` into `pages/public`) are served by **Cloudflare Pages**.
2. `/api/*` and `/ai/*` are served by **Pages Functions** (`pages/functions/api/[[path]].ts`, `pages/functions/ai/[[path]].ts`) that all call the single `handle()` in `apps/edge/src/worker.ts`.
3. State is in **D1** (binding `DB`), 43 tables + one runtime-created `telemetry` table (`03-DATABASE.md`).
4. A separate **cron Worker** (`apps/cron`) POSTs `/api/lifecycle/tick` every minute with a job key.
5. Phones fetch numbers **directly from the public drand beacon** (`api.drand.sh` etc.), never through our servers.
6. Mail goes through **Resend** with a shared verified domain (`veridian-aios.com`), card payments through **Razorpay**.

## 6. Glossary (every term used in this codebase)

| Term | Meaning | Defined in |
|---|---|---|
| **engagement** | One event/game of one organizer: id (4-40 chars `A-Za-z0-9_-`), start time, speed, cap, settings. Table `engagement` | `worker.ts:89`, `:141` |
| **game** | UI word for engagement | `docs/GLOSSARY.md` |
| **participant** / **guest** | A person with a seat in an engagement | `participant`, `seat` tables |
| **seat** | A participant's place number `seq` (1,2,3...) in an engagement; it picks their ticket from the collision-free list | `seat` table, `packages/beacon/src/unique-ticket.ts` |
| **pid** | Participant id `"<seq>x<12 hex>"`, derived as `seq + 'x' + sha256(eid|phone_hash)[:12]` | `worker.ts:950,954`, `PID` regex in `winners.ts:26` |
| **ticket** | 3x9 grid, 15 numbers; 1 or 2 per participant (`tickets` 1/2) | `packages/shared/src/ticket.ts` |
| **house / pattern** | A winning shape or number set: the houses in `PRIZE_HOUSES` (`early5, early7, early10, top, mid, bot, twolines, corners, star, plus, frame, topbottom, midcorners, odd5, even5, low5, high5, full`, `full2` = two-ticket full house) plus `unlucky` (fewest marked at the first Full House) | `config.ts` `PRIZE_HOUSES`, `PatternKey` |
| **reward line** | One winner of one house with the prize text: `{pattern, scope, ordinal, text}` (ordinal 1-5) | `config.ts` `RewardLine` |
| **round** | One of up to 5 plays inside an engagement, each with new numbers and tickets. Later rounds use derived id `<eid>~r<n>` | `config.ts` `roundEid` |
| **call / number call** | The k-th (0-89) number drawn; call k of a round uses beacon round `start + k*stride` | `beacon/src/index.ts:103`, `game.ts` |
| **beacon / drand** | Public, signed randomness published every 3 s; round r at `GENESIS + (r-1)*3` s (GENESIS=1692803367) | `beacon/src/index.ts:10` |
| **start round / startRound** | Beacon round number of the organizer's chosen start time; first number is called `GRACE_ROUNDS` (40 = 2 min) later | `worker.ts:142-146` |
| **grace** | The 2-minute "setting up, waiting for everyone" window before the first number | `GRACE_ROUNDS` |
| **stride** | `callSeconds/3` beacon rounds between two numbers (speeds 6, 9, 12, 15 s) | `game.ts` |
| **break** (mid-game brand moment) | A scheduled pause in the numbers showing a message/video/slides/speech or a lucky draw; `after` = numbers called before it (1-89), `seconds` 15-600 step 3 | `config.ts` `BreakCfg` |
| **opening / closing** | Brand moments before the first number (inside the 2-minute grace, 15-120 s) / on the final screen | `config.ts` `BrandSlot` |
| **brand moment** | Any of opening, break, closing. Allowance **5 per ticket held** (1 opening + 3 during + 1 closing per ticket; 5 with 1 ticket, 10 with 2) | `config.ts` `brandMomentsFor`, `maxMidFor`, `maxEdgeFor` |
| **lucky draw** | A break of kind `lucky` that picks 1, 3, 5 or 10 participants by hashing the beacon randomness with each pid; style `draw` or `scratch` | `game.ts` `luckyWinners` |
| **intermission** | 30 beacon rounds (90 s) between two rounds | `INTERMISSION_ROUNDS` |
| **late joiner** | A participant who joined after the first number: `seat.jr` = join round; their numbers count from `jr + 30` rounds | `LATE_LAG_ROUNDS`, `prize-engine.ts` |
| **quorum** | How many different phones must report identical winners before a result is accepted: `<=6 people: ceil(n/2)`, else `min(25, max(3, ceil(5%)))` | `config.ts` `quorumFor` |
| **voters** | Only a share of phones report results: everyone up to 12 people, else 4 x quorum; silent phones step in if no result appears | `config.ts` `votersFor` |
| **settled** | An accepted (quorum) winners result, row in `settled` | `winners.ts:55` |
| **claim** | Legacy per-phone win claim (stored only for engagements of <= 500; never decides winners) | `worker.ts:1081`, `CLAIM_TRACKING_MAX_CAP` |
| **vote / rvote / rcand** | A phone's reported winners (digest of pattern, ordinal, round, idx, sorted pids), candidate results, and votes | `winners.ts:15` |
| **prize / prize given** | A record per winning seat holding the sealed name+number the winner confirmed, change trail, and "given" tick | `prize` table |
| **overvote** | A phone saying "the game is over"; 3 (or half of a tiny game) end the game early | `lifecycle.ts:93` |
| **life** | One row per engagement: end time, source (`schedule`/`phones`/`organizer`), report sent, purge time | `life` table |
| **draft / published / paid** | Draft = `pack=0` and no `pub/<id>` kv key (invisible); published = `pack=0` + `pub/<id>`, open but unpaid; paid = `pack>0` | `worker.ts:148`, `:964-966` |
| **pack** | Paid size tier (100...10000) stored in `engagement.pack`; 0 = unpaid | `engagement.pack` |
| **entitlement** | A purchased right to one engagement up to `pack` participants (also a *credit* when not yet attached: `eid IS NULL`) | `entitlement` table |
| **lock / held** | A published unpaid engagement is held from 45 s before its start: phones show a waiting screen, no number | `LOCK_LEAD_MS`, `worker.ts:145,975` |
| **platform key** | `ORGANIZER_SECRET`: the owner's key | `worker.ts:389` |
| **master key** | Organizer's own console key `ctk_...` (kind `master`) | `organizer_key` |
| **AI key** | `cta_...` kind `ai`, created at sign-up (lasting, sealed copy in kv `aikey/<org>`) and as 24-hour keys by mail | `worker.ts:222-230` |
| **Host key** | `cth_...` kind `host` | `worker.ts:655` |
| **Co-host key** | `ctc_...` kind `cohost` | `worker.ts:673` |
| **partner key** | `ctp_...` in table `partner.key_hash` (salted by prefix `partner|`) | `partners.ts:129` |
| **work link / AI link** | `https://<site>/ai/<key>`: GET returns the manual; `/ai/<key>/<api path>` runs the API with the key from the address | `worker.ts:294` |
| **front door / map / facts / go** | AI-link sub-pages: short start text, list of all functions, the 10 facts, guided step links | `ai-link.ts`, `ai-functions.ts`, `ai-facts.ts`, `ai-go.ts` |
| **beacon (visits)** | Unrelated meaning: the first-party visit-tracking POST `/api/v/b` | `visits.ts` |
| **pause / control file** | Ed25519-signed pause/resume/extend/stop messages, stored as one small JSON file per engagement and verified by every phone | `beacon/src/control.ts` |
| **chain mark / `from`** | Invite attribution: query param `from=<inviter seat>` (participants) or `from=1000000000+<7 hex of co-host key id>` (Co-hosts) | `worker.ts:409,1006` |
| **TEST / LIVE mode** | Owner-switched service mode; TEST flags all new data `is_test=1` and restricts e-mail to an allow-list | `mode.ts` |
| **sealed** | Encrypted with AES-256-GCM under a key derived from `DATA_KEY` (HKDF) | `pii.ts` |
| **shred / crypto-shredding** | Destroying the per-engagement key that seals participants' audit rows, making them unreadable while the hash chain still verifies | `audit.ts:397`, `0011_participant_shred.sql` |
| **legal hold** | Owner-set flag that suspends deletion of an engagement and its audit log | `legal_hold` |
| **funnel** | Visitor stage: visit, pricing, size, create, account, published, paid | `visits.ts:34` |
| **trust page** | `/trust.html`, generated from the 10 facts; `llms.txt` is generated with it | `trust-page.ts`, `tools/make-trust.ts` |
| **zgame.js** | Browser bundle (`window.ZG`) built from `packages/beacon/src/zgame-browser.ts`: all game logic shared by phone, console, big screen | `package.json` `build:zgame` |
| **control.js** | Browser bundle (`window.TBControl`) of organizer-side signing key helper | `build:control` |
| **reportgen.js** | Browser bundle that lays the report PDF out on the organizer's device | `build:report` |
| **zlocal** | `bun run zlocal`: whole stack on one local port with SQLite | `apps/edge/src/local.ts` |
