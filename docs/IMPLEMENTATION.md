# Corporate Tambola — Implementation Document

Version 0.1 · 2026-10-01 · Based on Handout v2.0, Rules v1.4, and the prototype `reference/prototype/corporate-tambola-complete.html`. Read `NOTES.md` first for sources, discrepancies and open questions.

**Principle for this project: everything is developed and tested on this laptop, with local database, local code and local storage. Nothing is deployed to any cloud service until the owner says so.** (Same policy as the standing rule: Vercel/Cloudflare are for going live only.)

## 1. Target stack and why it is also the local stack

| Layer | Production (Cloudflare) | Local (same code, no account needed) |
|---|---|---|
| Static site + console + player app | Workers static assets | `wrangler dev` / Vite dev server |
| API | Worker (TypeScript) | `wrangler dev` (workerd) |
| Live game room | Durable Object `GameRoom`, SQLite storage, WebSocket Hibernation, alarms | Same, run by Miniflare/workerd locally, persisted under `.wrangler/state` |
| Accounts / orders / game index | D1 | Local D1 (SQLite file in `.wrangler/state`) |
| Brand-break media | R2 | Local R2 simulator (files on disk) |
| Host live voice | Cloudflare Realtime SFU | **Not available locally** — stub (see §7 phase 6) |
| Email (organizer code, invoices) | Transactional email API | Console/log sink + local file outbox |
| Payments | Razorpay / Stripe | Fake gateway module (always-succeed + failure cases), real one behind same interface |

Why this and not Supabase/DuckDB: see `NOTES.md` §5. Short version: a Durable Object is a per-game single-threaded actor, which gives race-free uniqueness, limits and claim windows without hand-written locking, and it runs identically on this laptop.

**Escape hatch:** write the room logic as a plain TypeScript class (`GameEngine`) with no Cloudflare imports; the Durable Object is a thin adapter. Then the same engine can run in a Node/Bun WebSocket server with `bun:sqlite` if free tiers change, and is directly unit-testable.

## 2. Repository layout (monorepo, Bun workspaces)

```
tambola/
  docs/                      NOTES.md, IMPLEMENTATION.md, later: API.md, TEST-PLAN.md
  reference/                 prototype + superseded material (read-only)
  packages/
    shared/                  types, constants, strings.en.ts, phone.ts (libphonenumber-js),
                             patterns.ts, ticket.ts, pricing.ts, commentary.ts
    engine/                  GameEngine (pure TS): state, rules, claims, calls, limits. No I/O.
  apps/
    worker/                  Cloudflare Worker + GameRoom DO adapter + D1 + R2 + routes
    web/                     static front end (marketing, checkout, organizer console,
                             host/team-lead console, player app) – port of the prototype
  tools/
    loadtest/                WebSocket load simulator
    seed/                    local scenario seeder (the 4 prototype scenarios)
  e2e/                       Playwright tests (port the prototype's 55 checks)
```

Stack choices: TypeScript strict; Bun for install/test; Vite for `web`; Vitest or `bun test` for `shared`/`engine`; Playwright for e2e; `wrangler` for the Worker. UI: port the prototype's HTML/CSS/vanilla JS first (it is the source of truth for look and wording); framework migration is optional and can wait.

## 3. Components in detail

### 3.1 `shared`
- `phone.ts`: `normalize(raw, defaultCountry)` exactly as prototype (+ the 11 required test cases as unit tests); `format`, `mask`.
- `ticket.ts`: generator per NOTES §4, plus `isValidTicket()` (15 numbers, 5 per row, column ranges, ≥1 per column) used in tests.
- `patterns.ts`: PAT, SHAPES, `patternNums()`.
- `commentary.ts`: HOOK, HOOK_INTL, LANGS, `line()`.
- `pricing.ts`: PACKS, GST split, currency selection.
- `strings.en.ts`: **every UI string** (rule 12/§14 of handout).

### 3.2 `engine` (`GameEngine`)
State per game = handout §9 `GameRoom` tables. API (all return `{ok, ...}` or a typed error; all enforce rules server-side):
`addParticipants`, `setRole`, `removeParticipants` (cascade), `createPass`, `cancelPass`, `reissuePass`, `joinByNumber`, `openPass`, `askToJoin`, `admit`, `decline`, `resolveConflict`, `start`, `end`, `draw`, `hostDraw`, `claim`, `emergencyPause`, `resume`, `endBreak`, `purge`, plus `tick(now)` driven by alarms.
Time is **injected** (`now` parameter), never read from the clock, so tests can fast-forward.
Calls use `crypto.getRandomValues` and pick uniformly from remaining numbers (NOTES §6.3).
Port the prototype's `DB` functions one-for-one, then add: ticket uniqueness, server-side rate limiting hook, claim tie-break by call index at receipt.

### 3.3 `worker` + `GameRoom` Durable Object
- Router sends `/g/:code`, `/p/:code`, `/ws/:gameId` etc. to the right room (lookup code-hash → game id in D1 `game_index`).
- Room: SQLite tables (handout §9), in-memory cache rebuilt on wake, `webSocketMessage` handlers (phone: `claim`; console: `draw/pause/resume/endBreak`), `alarm()` for call timer → claim check → result end → brand-break end → purge (24 h after end) → auto-end safety net.
- Broadcast: `state` on connect, `call`, `pause`, `result`, `break`, `talk`, `ended`; console-only: `waiting`, `conflict`, `joined`, `log`. Past numbers never sent.
- Security (handout §11): random codes from the 31-char alphabet, store SHA-256 only; device-secret cookie (httpOnly, Secure, SameSite=Lax) + hash stored; per-phone, per-IP and per-game rate limits **enforced in the room/Worker**, not the client; role/status/cap/limit re-checked on every write.
- D1: `organizers`, `orders`, `game_index`, `game_summaries` (survives purge).
- R2: signed upload for brand-break media; size/type caps (decide: e.g. ≤100 MB video).

### 3.4 `web`
Port in this order: strings + design tokens → player app (join, ticket, call strip, claim) → organizer console → host/team-lead → marketing/checkout. Prototype scenarios 1–4 become `tools/seed` fixtures against the real local API. Design tokens (burgundy #5A1426, gold #E0B872, ivory #FBF6EC; Fraunces/Inter/IBM Plex Mono) are in the prototype CSS. Mobile first at 360 px, targets ≥ 40 px, aria-live toasts, no browser dialogs.
For fully offline local dev, vendor `libphonenumber-js`, `xlsx` and a QR lib via npm instead of CDN `<script>` tags (the prototype loads them from CDNs).

## 4. Local development setup (to do first)

1. `C:\ct\tambola` already exists with `reference/` and `docs/` and a git repo (local only; no remote yet).
2. `bun init` workspaces; install `wrangler`, `typescript`, `vite`, `vitest`/`bun test`, `@playwright/test`, `libphonenumber-js`, `xlsx`, `qrcode`.
3. Keep the checkout at a short path (Windows path-length issues seen in the other repo). Node v26 and Bun 1.3 are present.
4. **Memory:** ~8 GB RAM total. Run one `wrangler dev` plus Vite plus tests at a time; use `bun test` (light) for engine; run Playwright with a single worker.
5. Do **not** create a Cloudflare account, domain, payment-gateway account or deploy anything until the owner approves; no cost is incurred by any step in this document until phase 8.

## 5. Testing strategy

| Level | What | Tool |
|---|---|---|
| Unit | phone normalise (11 mandated cases), ticket validity (run 10k generated tickets), patterns, pricing/GST, claim validity matrix | bun test |
| Engine property tests | no duplicate number via any path (incl. interleaved/parallel calls), limit never exceeded, cascade removal, invite depth, host restrictions, after-start lockout, 2-bogey block, sharing, family-for-fun, brand break never during claim | bun test with injected clock |
| Integration | Worker + DO via `wrangler dev` / Miniflare: join, passes, conflicts, waiting room, start, full simulated game with N bot sockets | vitest + miniflare |
| E2E | Port the prototype's 55 checks, desktop + 390 px, no horizontal scroll, keyboard-only | Playwright |
| Load | N WebSocket bots; measure number-delivery latency; staged 500 → 1,000 → 2,000 locally; 10,000 only once against real Cloudflare | `tools/loadtest` |
| Privacy | after End+24 h (fast-forwarded alarm) no names/numbers anywhere in DO storage, D1, R2, logs; summary row exists | integration |
| Cost | request counter per game vs. the 100k/day budget (target ≈ 5,000 per 1,000-player game) | loadtest report |

Acceptance = handout §16 (restated in NOTES §8), each item mapped to at least one automated test.

## 6. Build phases (handout §15, with local exit criteria)

| # | Phase | Output | Exit criterion (all local) |
|---|---|---|---|
| 0 | Repo + tooling | workspaces, CI-less local scripts, `bun test` green | skeleton tests pass |
| 1 | `shared` + `engine` core | phone, ticket, patterns, engine join/limit/pass/role logic | unit + property tests pass |
| 2 | Room + Worker foundation | DO with SQLite, WS hibernation, alarms, D1 index, local dev up | scripted join + WS connect works on `wrangler dev` |
| 3 | Organizer flows | fake checkout, email-code login (log sink), setup, upload check/commit, people/roles, share, waiting room, phone alerts, start/end, report, purge alarm | e2e organizer journey (handout §4.1) passes |
| 4 | Player flows | join by link/pass, waiting, errors, device binding, ticket, local cut, family passes, invites | e2e player journey (§4.2) passes |
| 5 | Live engine | draw timer, manual draw, claim window, results, bogeys, sharing, for-fun, emergency pause, end conditions | simulated full game with bots matches §5 rules |
| 6 | Brand breaks | R2 (local) upload, scheduling, playback, host end-early | break fires at call N, never mid-claim |
| 7 | Host voice | **Realtime SFU can't run locally.** Build UI + interface + stub; do a throwaway spike against a real account only with owner approval | stub passes UI tests; spike result recorded |
| 8 | Polish + hardening | commentary audio, accessibility, security review, legal pages, load test | acceptance checklist green except the items needing real Cloudflare |
| 9 | **Go-live (owner-gated)** | Cloudflare account, domain, payment gateway, email provider, deploy | owner approval; real-account 10k load test; 3-month bill watch (US$0–5) |

Rough sizing (my estimate, not from the handout): phases 0–2 about 1–2 weeks, 3–5 about 3–4 weeks, 6–8 about 2–3 weeks of focused work.

## 7. Risks specific to local-first development

- **Local ≠ production** for: Realtime SFU, true Cloudflare limits (CPU 10 ms/request, DO eviction/hibernation timing), and real latency. Mitigate by keeping the engine pure, counting requests in tests, and doing one real-account verification pass in phase 9.
- **Hibernation correctness:** the room must rebuild its state from SQLite after eviction; test by killing the local worker mid-game and resuming.
- **Alarm drift:** only one alarm per DO; the room must multiplex call-timer, claim-check, result-end, break-end, purge and auto-end through a single scheduled-next-event queue. Design this explicitly (small priority queue persisted in SQLite).
- **Prototype port fidelity:** the prototype is the spec for UI; screenshot-compare key screens to catch regressions.
- **Free-tier assumptions** unverified today (NOTES §5) — re-check before phase 9.

## 8. Decisions needed before / during build

Blocking soon: (1) accept "cut is honor-system outside Early Five" or change the model (NOTES §6.1); (2) claim-in-flight tie-break rule (NOTES §6.2); (3) max brand-break media size/type.
Needed by phase 9: payment gateway (Razorpay vs Stripe, and who is the merchant of record for international), email provider, domain + real support email, US$ pricing and tax, auto-end 12 h, backup retention, legal review of wording.

## 9. Immediate next steps (proposed)

1. You review `NOTES.md` §6 and tell me which judgement calls to accept.
2. I scaffold the monorepo (phase 0) and port `phone`, `ticket`, `patterns`, `pricing`, `commentary` into `shared` with the mandated tests.
3. Then `engine` with property tests, before touching Cloudflare tooling.

## 10. CR-01 — ticket mode and multiple houses (added 2026-10-01)

Read `NOTES.md` §9 for the owner request and open questions Q1–Q6. Defaults used below until answered: ticket mode per game (1 or 2), Organizer-only setting, houses 1st–5th (configurable), prize cap 30 lines.

**Settings:** `ticket_mode` ∈ {`single`,`double`} (later `mixed`), locked at Start. Setup UI: chips for ticket mode; for each house type a stepper "How many Full Houses (1–5+)" and "How many Full Two-Ticket Houses (0–5+)"; one prize-text box per line. No typing except prize text.

**Data model changes (room SQLite):**
- `tickets(id, participant_id, idx 0|1, grid_json, serial)` replaces `participants.ticket_json`; `UNIQUE(participant_id, idx)`; ticket uniqueness check across the game.
- `prizes(id, pattern, scope 'ticket'|'two_ticket', ordinal, prize_text, share_rule)`; replaces keyed prizes `k`.
- `claims(…, ticket 'A'|'B'|'AB', pattern, ordinal)`; `winners(…, ticket, pattern, ordinal)`.
- `settings.ticket_mode`.
- Cuts are per ticket on the phone; a claim sends only the relevant ticket's cut list (or both for `AB`).

**Engine changes:**
- `genTicket` called once or twice per participant at join (also guarantee A ≠ B and no duplicate grid in the game).
- `completionIdx(ticket, pattern)` unchanged per ticket; new `completionIdxTwo(A,B)` = max index over all 30 numbers, valid only if all called and cut.
- Ordinal gating: ordinal k opens only after k−1 is awarded (generalises `full2`). Server picks the open ordinal for a claim.
- Same-window sharing applies per prize line. A player may win different prize lines but never the same line twice.
- Bogeys: wrong claim on any ticket = 1 bogey on the player; 2 = blocked (unchanged).
- Game ends when all prize lines are awarded, 90 called, or Organizer ends.
- Brand-break/claim-window logic unchanged.

**UI changes:** ticket screen shows A and B (tab or stacked card) with per-ticket cut state and a combined "Two-ticket" claim row; prize list shows "1st Full House … 5th Full House" and "1st Full Two-Ticket House …" with winners; result banner names ticket and house number; report adds columns Ticket (A/B/AB) and House no.

**Pricing:** blocked on Q2. Engine stores tickets-per-participant; billing counts engagements via a single function `engagementsFor(participant)` so either answer is a one-line change.

**Tests to add:** 2-ticket generation validity (both valid, A≠B); Full Two-Ticket House valid only with all 30 numbers; ordinal gating (3rd cannot be awarded before 2nd); same-window sharing per line; one player winning ticket A full house and ticket B full house; Full House and Two-Ticket House in the same window; bogey counting across tickets; prize-cap enforcement; mode locked after Start; single-ticket games unaffected (regression); report columns.

**Phase impact:** adds work in phases 1 (shared/engine), 3 (setup UI), 4 (ticket UI), 5 (claims). Estimate +1 week. The prototype does not implement any of this, so its screens must be extended first (a clickable update to `corporate-tambola-complete.html` or direct build, your call).


## 11. CR-02 — pre-downloaded audio, brand-break links, privacy, wording (added 2026-10-01)

Terminology: from here, **engagement** = the event and **participant** = the person (see `GLOSSARY.md`). Earlier sections still say game/player.

### 11.1 Yes: all number audio can live on the participant's device
**Verdict: possible with standard web technology, no native app needed.** The caveat is a one-time tap on phones (below).

**How it works**
1. Audio is pre-generated **once**, offline (never at run time): 90 clips per voice language, each the full phrase "Next number is 47. Number 47." (about 4 s, ~16-25 KB at a low Opus/AAC bitrate, so about 1.5-2.5 MB per language). A smaller alternative: 90 number clips plus 2 shared phrase clips ("Next number is", "Number") spliced together, slightly less natural. Recommendation: full phrases.
2. They are **static files** on the same host as the site (static assets: unlimited free requests per the handout), with versioned filenames and `Cache-Control: immutable`.
3. A **Service Worker** installs the app shell (HTML/JS/CSS, ticket UI, rules text) and **precaches the audio pack** for the engagement's voice language when the participant first opens the link ("Getting ready 80%"). Cache Storage/IndexedDB keeps it and it is reused for later engagements (same version = no re-download).
4. Before the engagement the page **decodes the clips into memory** (Web Audio `decodeAudioData`) so playback is instant and uses the participant's RAM, not our server.
5. At each call the server sends one tiny WebSocket message, e.g. `{"c":23,"n":47}` (~25 bytes). The phone plays clip 47, shows the number and runs the countdown. No audio, text or commentary crosses the network during the engagement.
6. Fallbacks: missing clip -> browser `speechSynthesis` ("Next number is 47. Number 47."); audio blocked -> the number is still shown visually.

**Limits (honest)**
- **Autoplay rules (iOS/Safari and Chrome):** audio starts only after a tap. The existing "Join audio" button is that tap; afterwards scheduled playback works. A page reload needs one tap again.
- **Browsers may evict stored files** (Safari clears script-written storage after about 7 days without a visit; any browser may under storage pressure). So the app **re-checks on every open** and re-downloads if missing. We can promise "stays unless the browser removes it", not "stays forever".
- **Private/incognito mode** may not persist; the engagement still works and the pack downloads again each time.
- **Format support:** Opus is fine on current Chrome/Firefox/Edge; Safari depends on version/container. Ship AAC (m4a) as the safe default and test Opus. **Measure on real devices in a short spike before choosing.**
- All sizes above are my estimates, not measurements.

**Server-cost effect:** per participant one cached download (~2 MB) plus one 25-byte push per number. This strengthens the near-zero-cost design.

### 11.2 Design rule: work lives on the participant's device
Everything except the draw, the claim check and the roster runs on the device: UI, ticket(s) (stored locally after join), cutting, audio playback, countdown, brand-break playback, strings, rule pages. The server (engagement room) only keeps the secret draw, broadcasts `{callNo, number}` plus pause/result/break/ended signals, checks claims and enforces entry rules.

### 11.3 Voice calling spec (replaces handout section 5 commentary)
- Each call plays "Next number is XX", a short gap, then "Number XX" (same voice; the number as words, e.g. "forty-seven"). An optional later setting could also say digits ("four, seven"); not in v1 unless requested.
- Spoken time is ~4-5 s, inside the 10 s AI gap and the 5 s minimum host gap. In host-draw mode the next draw is accepted only after max(5 s, clip length).
- Remove `HOOK`, `HOOK_INTL`, `LANGS` and `line()` from `shared/commentary.ts`; add `audio.ts` (clip manifest per voice language plus a version hash).
- "Voice language" replaces "commentary language" (open question: which languages in v1?).
- Host live speaking (Realtime) is unchanged.
- Producing the clips locally: a free offline neural text-to-speech tool (e.g. Piper) or Windows built-in voices are possible; check the licence of whichever voice we ship, and consider a paid voice artist for quality later.

### 11.4 Brand breaks (replaces handout brand-break wording and rulebook section 10 limits)
- **Source:** (a) a company-hosted video URL or a file stored for the company, and/or (b) a YouTube link (embed). Slides and speech types stay.
- **Count:** max **3** per engagement. Setup proposes near-equal positions: 3 breaks -> after calls ~22, 45, 67; 2 -> 30 and 60; 1 -> 45. The organizer can nudge them, spacing stays near-equal, and never during a claim.
- **Length:** the company decides. Technical guard only: show the duration, warn above a recommended size, and a sanity ceiling in config (proposal: 50 MB per hosted file; to confirm).
- **Prefetch:** when the engagement page opens, the device downloads the low-quality hosted videos into Cache Storage with progress shown. Respect `navigator.connection.saveData`, check `navigator.storage.estimate()`, ask before large downloads on mobile data.
- **Playback:** from the local cache (instant, no server load). If not cached: stream; if that fails: show a title card for the break length.
- **YouTube:** embed only, cannot be cached; load the iframe (not the video) a few calls early. The organizer sees a note about this.
- **Low quality:** recommended-spec upload (e.g. 360p H.264 + AAC MP4, ~600 kbps video) with an automatic size/bitrate check. Optional browser-side transcode later. Server-side transcoding is a paid service and out of scope for the free-tier plan.
- Data: `brand_breaks(id, after_call, kind 'file'|'youtube'|'slides'|'speech', title, seconds, media_url, size_bytes, low_q_url NULL, done)`.

### 11.5 Privacy design rule ("we don't transmit any personal information of others to any user")
- Broadcasts to participants contain only call numbers, pause/result/break signals and **ticket IDs plus house numbers** for results. **No names, mobile numbers, departments, inviter names or photos.**
- A participant's own screen shows only their own name and ticket. A pass screen shows nothing about the sender beyond "your organizer" unless the owner approves otherwise.
- A Team Lead sees only their own invitees. Host/Organizer consoles (role-based) see the roster. The report goes only to the Organizer.
- Test: record every message sent to a participant socket across a full engagement and assert none contains any other participant's name or number.

### 11.6 Rename work (apply with CR-01)
Code identifiers use `engagement`/`participant` from the start; URLs `/e/CODE` and `/p/CODE` (pass). A `check-wording` script fails the build if the strings file or docs contain "game" or "player" outside an allow-list.

### 11.7 Phase impact
- Phase 2: service-worker app shell and audio-pack precache scaffold.
- Phase 4: participant app uses local audio and the locally stored ticket.
- Phase 6: brand breaks become link/YouTube plus prefetch plus local playback (was R2 upload only).
- Add a **half-day spike**: measure audio size, format support and latency on a real iPhone, an Android phone and a desktop, plus cache persistence; and a second small spike for video prefetch size and Data Saver handling.
