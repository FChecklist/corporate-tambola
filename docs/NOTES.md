# Corporate Tambola — Working Notes

Compiled 2026-10-01 from everything found for this project. These are *my* notes: what the sources say, where they disagree, and what is still unknown. The build plan is in `IMPLEMENTATION.md`.

## 1. Sources read

| Source | Where | Status |
|---|---|---|
| Complete Handout v2.0 (1 Oct 2026) | Drive › KT › TAMBOLA, id `1_Xb7XS…` | **Current. Source of truth for rules, data, architecture, cost, acceptance** |
| Game Rules v1.4 (no SMS, global) | Drive › KT › TAMBOLA, id `1JLMu7R…` | **Current. Player/host/organizer rulebook** |
| `corporate-tambola-complete.html` (858 KB, 1,190 lines) | `reference/prototype/` (copied from Downloads) | **Current. Source of truth for screens, wording, behaviour.** ~670 KB of it is two base64 images (`TICKET_IMG`, `HIW`); the real code is ~500 lines |
| Rules v1.0, v1.1, v1.3 | Drive (marked `_SUPERSEDED`) | Superseded; not re-read in detail |
| `TAMBOLA-CONSOLE-HANDOFF.md`, 4 other prototypes (`tambola-player-app*`, `tambola-pricing*`, `tambola-console-prototype`, `corporate-tambola-prototype`) | `reference/superseded/` | Superseded by v2.0. Only skimmed (headings). Old data model there was Postgres/Supabase-flavoured; **do not use** |

Precedence per the handout: where prototype and handout disagree, **handout wins**; fix the prototype.

## 2. The product in brief

Web-only, mobile-first live Tambola/Housie for closed groups (companies, societies, clubs, families), 90 numbers, 3×9 tickets. Sold **per game** in packs of "engagements" (1 engagement = 1 ticket per mobile number). Players never pay; organizer gives all prizes; we never touch prize money. Identity is a mobile number only (E.164, any country) — no SMS/OTP for players. Organizers verify once by work-email code. All personal data hard-deleted 24 h after the game ends (anonymous summary stays). Selling points: scale, brand breaks (video/slides/speech for everyone at once), verified entry, report, no ads.

Roles: Organizer › Host › Team Lead › Player › Invited colleague › Family member. Invite chain stops at Organizer → Team Lead → colleague → family.

## 3. Rules that decide the engineering (13 non-negotiables, condensed)

1. No player payments/links/wallets. 2. Closed group (list, passes, waiting room). 3. No SMS/OTP for players. 4. One number = one entry; one phone per entry. 5. Server-random draw; nobody can choose/see future numbers. 6. Each number shown once; no past-number list during game. 7. No auto-cut, no prize without a claim; server claim check is final. 8. Entry closes and settings lock at Start. 9. Hard-delete personal data 24 h after end. 10. No mobile number in any URL. 11. E.164 storage, local-time display. 12. Chips/dropdowns/ticks, no `alert/confirm/prompt`, Undo on destructive actions. 13. Never say "admin"/"co-admin" on screen.

## 4. Engine behaviour (from the prototype's code, verified by reading it)

Constants: `AI_GAP` 10 s, `MIN_HOST_GAP` 5 s, `CLAIM_CHECK` 2.4 s, `RESULT_SHOW` 5 s.

- **Ticket gen:** 3 rows × 9 cols; each row gets 5 filled cells; every column must have ≥1 number; column *c* draws from 1–9 / 10–19 / … / 80–90 (col 0 = 1–9, col 8 = 80–90); numbers sorted ascending within a column.
- **Patterns** (cell indices on the 27-cell grid): Early Five, Top/Middle/Bottom Line, Four Corners (first+last of rows 1 and 3), Star (corners + middle-row centre), Full House, Second Full House.
- **Draw:** shuffle 1..90 once at creation (secret); each draw takes the next. Brand break fires when `called.length == after`, *before* the next draw, never during a claim.
- **Claim:** allowed only while running and not blocked; any claim opens a claim window (pauses everyone, 2.4 s); other claims in the window join it; then results show 5 s; then play resumes (AI: +3 s). Game ends when all prizes won, 90 called, or Organizer ends.
- **Validity:** pattern complete **and** completion index == index of the last called number (claim before the next call); Early Five = the 5th cut called number must be the latest. Second Full House only after first Full House. Prize already won in an earlier window → reject.
- **Sharing:** multiple valid claims in the same window share equally. **Family for fun:** valid but no prize recorded. **Bogey:** +1; 2 bogeys = blocked.
- **Joining:** per-device 5 tries / 10 min; existing number joined on another device → raise "second phone" conflict (Keep first / Move to new phone); on-list → consent; pass-only number via game link → "use your pass"; unknown → waiting room; full → refuse.
- **Limits:** player limit counts every participant row (including unjoined/pass-sent); passes consume a place immediately; cancelling an unused pass frees it. Removal cascades to invitees (with Undo).
- **Purge:** write anonymous summary (players, family, team leads, start/end) then delete participants, waiting, conflicts, log, claims, bogeys.
- **Commentary:** 90 hook lines (India/cricket) + 90 international bingo calls; 6 language templates (Hinglish, Tamlish, Kanglish, Tenglish, English-India, International). Voice = browser SpeechSynthesis, preferring en-IN/hi-IN etc.
- **Phone normalisation:** libphonenumber-js "max": strip separators, reject letters, `00`→`+`, 6–15 digits, try as-is then `+digits`, must be `isValid()`, store E.164, flag "format fixed". Test cases listed in handout §12.
- **Pricing:** 8 packs (100 → 10,000). India: ₹500 … ₹10,000 incl. 18% GST (software = total ÷ 1.18); abroad: US$79 … US$1,999, no tax added. Currency guessed from time zone, switchable.

## 5. Architecture decision (the question you asked)

Handout recommends **Cloudflare-only** (Workers + Durable Objects + D1 + R2 + Realtime SFU). Your message names three alternatives; here is my read.

| Option | Verdict | Why |
|---|---|---|
| **Cloudflare-only** (Workers, one Durable Object per game, D1, R2) | **Recommended, agree with handout** | A game = one room = one single-threaded actor → "same number can't be added twice" and the claim window are naturally race-free. WebSocket Hibernation + alarms fit "tick every 10 s, idle otherwise". Static hosting also on Cloudflare, so no separate Vercel. And **`wrangler dev` runs Workers, Durable Objects (SQLite), D1 and R2 locally**, so "everything on local" is satisfied with the same code that ships. |
| Supabase + GitHub + Cloudflare/Vercel | Not for the live engine | Per handout: free plan pauses after a week idle (risky for a live event), limited realtime connections; Pro $25/mo. Postgres has no equivalent of a per-game serialised actor — you'd hand-roll locking and a separate timer service. Fine for *accounts/orders* but then you run two systems. Also Vercel Hobby is non-commercial. |
| DuckDB + GitHub + Cloudflare/Vercel | Not suitable as the primary DB | DuckDB is an analytical, embedded, single-writer engine. No server, no concurrent writers, no realtime push — wrong shape for a live game. Reasonable *only* for offline analytics on the anonymous summaries. |

Caveat on honesty: the free-tier numbers (100k req/day, 5 GB DO storage, 1,000 GB Realtime egress…) are quoted from the handout, which says "checked Oct 2026" from Cloudflare's pricing pages. I have **not** independently re-verified them today. Re-check before committing, especially Realtime SFU limits for 1,000 simultaneous listeners.

Portability hedge (handout §18): keep to plain WebSockets + SQLite so the room could move to a VPS if free tiers change.

## 6. Issues, gaps and judgement calls I found while reading

These are not in the handout's open-decisions list. Raise them with the owner.

1. **"Cut" cannot be fully enforced server-side.** Cuts live only on the phone and are sent only inside a claim. The server can verify the pattern numbers were *called* and the completion timing, but not that the player really tapped them. Rule "nothing is cut for you" is effectively honest-client for non-Early-Five patterns. For Early Five the server only knows the client's cut list. Low risk (closed group, no money), but the docs should not promise more than that. Decide: accept, or send cuts continuously (breaks the cost model).
2. **Late-claim definition vs. network latency.** A claim must arrive before the next call. With a 10 s gap this is generous, but the server must judge by *which call was current when the claim arrived*, not client timestamps; and a claim in flight while a new number is drawn needs a deterministic rule (prototype: `idx` = last call index at receipt). Write this into the room's spec and test it.
3. **Prototype leaks the secret draw.** `g.draw` (the full shuffle) lives in client-side `DB`. Fine for a mock; in production it must exist only in the room. Prefer drawing uniformly from remaining numbers with `crypto.getRandomValues` at each call rather than a pre-shuffled array that sits in storage and gets serialised.
4. **Ticket uniqueness.** Rulebook says a ticket is "unique to one player and one game"; prototype generates randomly with no collision check. Add a uniqueness check inside the room.
5. **Rate limiting is per device in the prototype only** (a localStorage-style `dev.tries`). Server must enforce per phone number *and* per IP/game, otherwise clearing storage resets it.
6. **Impersonation risk is accepted and documented** (handout §18) — an attacker who knows a colleague's number can claim it first. The "Let new phone in" flow is the remedy. Client-facing terms must say so.
7. **Auto-end 12 h** after scheduled start is "to confirm". Also entry-time rules: ticket screen opens 15 min before start (rulebook §3); game closes 15 min after end; purge 24 h after end. The room alarm chain needs all of these.
8. **Time-zone handling:** start time is chosen in the organizer's zone (06:00–23:30, 30-min steps) and displayed locally; store UTC + IANA tz.
9. **Count of engagement vs. place:** the prototype counts every participant row, including unused passes, against the limit. Matches rulebook ("passes… the place is freed on cancel") — keep.
10. **Rulebook typo-level inconsistencies:** rules §5.3 and handout §4.2 agree; handout §5 says family-for-fun claims are "announced" — prototype logs them and shows a "for fun" result. Keep the prototype behaviour.
11. **Contact/support email** is still `care@yourbrand.in` and domain `play.yourgame.example` — placeholders.
12. **Legal:** public wording must stay "Designed for DPDP, GDPR & US privacy laws" — not "compliant" — until a lawyer signs off. Prize-game laws vary by country (organizer responsible). Outside-India tax treatment is unconfirmed (CA).
13. **Margins:** ₹500 for 100 engagements nets ~₹424 before gateway fees (~2–3%). Handout itself flags small-pack margins and a planned 50% channel share.
14. **Local environment limits:** this laptop has ~8 GB RAM. A 10,000-WebSocket local load test is likely not feasible here; plan staged tests (e.g. 1k → 2k locally) and run the 10k acceptance test against a real Cloudflare account once.

## 7. Open decisions (owner) — carried from handout §17

1. US$ prices and non-India tax. 2. Auto-end 12 h after start? 3. Backup retention (≤7 days proposed). 4. Brand-break limits (3 breaks / 3 min). 5. Winner identity-check tick for organizer. 6. First markets (Gulf, UK, Australia, Singapore; US 75-ball not v1). 7. Real support email + product domain. 8. Channel-partner portal / 50% share.

Plus the new ones above: #1 (cut enforcement), #2 (late-claim tie-break), payment gateway choice, email provider choice.

## 8. What "done" means (handout §16, summary)

All number-format tests pass client+server; 2,000-row Excel check < 3 s in browser; no mobile number in any URL; same number never added twice (incl. parallel requests); player limit/Team-Lead cap/family limit/invite depth enforced server-side; host restrictions server-side; second-phone flow; after Start everything says "Entry is closed"; claim/share/bogey/block/for-fun/brand-break/emergency behave per §5; 10,000 phones receive each number < 1 s; 24 h after end no personal data remains; works at 360 px and keyboard-only; no browser dialogs; first-3-months Cloudflare bill US$0–5.
