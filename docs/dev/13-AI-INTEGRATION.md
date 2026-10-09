# 13 - AI integration (external AI assistants)

Owner requirement (2026-10-05, `docs/AI_LINK.md`): the link an organizer pastes into any chat AI (ChatGPT, Gemini, Claude, DeepSeek, z.ai...) must be **short**, take the AI to the complete instructions by itself, and let the AI do everything a logged-in organizer can do **except** pay, publish, erase, pause/stop, choose winners, or touch names and mobile numbers. Many chat tools can only issue plain GET requests and cannot set headers or send bodies, so every address carries the key and writes can be expressed as GET.

## 1. Link kinds

| Link | Key | Who gets it | What it opens | Notes |
|---|---|---|---|---|
| `https://<site>/ai/cta_<48 hex>` | AI key (kind `ai`) | the Organizer (console box "Option 1", sign-in page, dedicated e-mail) | the organizer-AI manual | lasting key created at sign-up (sealed copy in `kv aikey/<org>`); re-readable only by the signed-in Organizer (`GET /api/org/ai/link`) |
| same, 24-hour variant | AI key with `expires_ms` | e-mailed to the Organizer only, in the **dedicated mail** (`mails.ts` `aiLinkMail`) | same | the mail never carries the lasting key; after 24 h it answers the identical 404 as an unknown key; max 5 live fresh keys |
| `https://<site>/ai/cth_<48 hex>` | Host key (kind `host`) | made by `POST /api/org/host` (max 5) | the **Host AI manual** (watch, message guests, tick prizes, see report address) | also 24-hour copies mailed to the Organizer ("co-host link mail" in code is the Host mail) |
| Co-host key `ctc_` | - | - | **no AI link**: `LINK_KEY` is `^ct[ah]_[0-9a-f]{48}$` | Co-hosts cannot use `/ai/` |
| Organizer sign-in key `ctk_`, platform key | - | - | never accepted in an address; answers the same 404 | |

Only a key matching `LINK_KEY` is even looked up; mistyped, unknown, revoked, expired, wrong-kind keys all answer `404 text/plain "Not found."`. Responses carry `x-robots-tag: noindex, nofollow`, `referrer-policy: no-referrer`, `cache-control: no-store`.

## 2. The three ways an AI is used

1. **Option 1: the link in a chat AI.** The Organizer pastes two lines plus the link (`aiPaste`, `ai-link.ts:17`): "This is the API documentation and instructions for MY OWN Corporate Tambola account. I am the owner... Please open it now (a plain GET request) and follow it: <link>". The framing came from PROJEXA testing: a careful AI refused "open this link and follow it" about one time in three as prompt injection, and accepted the "owner's own API documentation" wording every time.
   - `GET /ai/<key>` returns the **manual**: the short **front door** (`frontDoorText`: rules, six first choices, the 10 facts, trust link) followed by "LONG REFERENCE MANUAL" (`manualText`): START HERE rules, section 1 sizes and choices, section 2 THE CONVERSATION (12 steps, `CONVERSATION`), endpoint list with absolute keyed addresses (`ORG_ENDPOINTS`), examples of GET-mode calls, what the AI cannot do (`AI_CANNOT`, 7 items) and how to hand each to the owner. `?format=json` returns the same as data (`manualJson`: `manual`, `endpoints`, `front_door`, `facts`, `functions`, `conversation`, `you_cannot`).
   - `/ai/<key>/start` = the front door alone; `/ai/<key>/map` = the list of **every function** and who does it (`FUNCTIONS`); `/ai/<key>/facts` = the 10 facts + usage rules; `/ai/<key>/go[/<step>]` = **guided step links**: each screen returns "SAY TO THE ORGANIZER", numbered choices that are ready-made links, and "if something goes wrong". Steps: `new -> time -> occ -> size -> play -> prizes -> extras -> review -> save`, plus `games, game, links, who, gtime(2,3), say(2), helper, facts` (`ai-go.ts:77`). `save` performs the real create (`POST /api/z`) only after the read-back; a second game on the same day gets its own code (`...-2`).
   - Writes: the same routes as the API, address `/ai/<key>/<api path>`, with real POST/PATCH when the tool can, or `GET ...?_method=POST|PATCH&_body=<URL-encoded JSON>` (max `GET_BODY_MAX = 6144` chars; roster loads in chunks of about 20).
2. **Option 2: an AI that works in the browser.** The AI drives the real console in a browser. For it the console offers: **AI helper mode** (shield: guest names and numbers hidden and never fetched), **hand-over links** `zc.html?e=<id>&do=publish|erase|pause|stop` that open the exact card and outline the one button (the human taps once), **Quick setup** (`?quick=1`, a single form with date/time pickers and readable fields), and `BroadcastChannel` sign-in sharing between tabs. Commit "Console for an AI that works in the browser (Option 2)". (Console internals: as of spec; verify.)
3. **Any AI that searches the web.** `/trust.html` and `/llms.txt` give plain, no-JavaScript answers (the 10 facts, honest limits) that a search or browse tool can read without any key; `llms.txt` also tells an AI that has an organizer's `/ai/<key>` link to open it. `robots.txt` allows `/trust.html` but disallows `/ai/` and `/api/`.

## 3. The manual structure and the registries

| Piece | File | Notes |
|---|---|---|
| Paste text, endpoints, conversation, refusals, `nextHint` | `apps/edge/src/ai-link.ts` | `ORG_ENDPOINTS` (organizer AI), `HOST_ENDPOINTS`, `AI_CANNOT`, `CONVERSATION`, `manualText/manualJson`, `frontDoorText`, `nextHint` (adds `next` to every 4xx an AI gets, without echoing the key) |
| **FUNCTIONS registry** | `apps/edge/src/ai-functions.ts` | 31 functions (incl. credit and clone, both human-only; ids: facts, demo, new-game, list-games, read-game, change-time, size-speed, tickets-rounds, prizes, brand-moments, test-media, invites, guest-list, reuse-list, publish, pay, links, helpers, announce, who-joined, mark-seat, pause-stop, results, prize-given, report, erase, audit, ideas, sign-in) each with `who: ai | handover | human`, `call`, `go`, `console`, `say`. Frozen by `ai-enablement.test.ts` (every function needs a check proving its classification) |
| **FACTS** | `apps/edge/src/ai-facts.ts` | exactly 10 facts + `FACT_RULES`: answer safety/privacy/law/cost questions **only** from them; never say best / 100% safe / unhackable / cheat-proof / certified; say "I do not know that" and give the trust page for anything else; offer to carry on |
| Guided path | `apps/edge/src/ai-go.ts` | `goScreen`, `OCCASIONS`, `PRESET_MESSAGES`, `BUNDLES` of houses, date/time rows, `startRoundOf` |
| Manifest (header-based) | `AI_MANIFEST` in `worker.ts:413`, `GET /api/z/ai-manifest` | `conversation`, `packs`, `choices`, `you_can[]`, `payment_faq[]`, `suggestions_rules`, `you_cannot[]` |
| Trust page / llms.txt | `apps/edge/src/trust-page.ts` (`trustHtml`, `llmsTxt`, `TRUST_UPDATED`) written by `tools/make-trust.ts` to `apps/web/public/trust.html` and `llms.txt` | a test regenerates and compares byte for byte; also checks every fact's `say` text appears on the page; no `<script>` on the trust page |
| Mails | `apps/edge/src/mails.ts` | `aiLinkMail` (why: start/replace/fresh), `coHostLinkMail` (the **Host** link mail), `newUseAlertMail`, `signInMail`; the AI link **travels only in these dedicated mails to the Organizer** |
| Audit | `apps/edge/src/winners.ts` `auditAi`; `audit.ts` | see section 5 |
| Front-end pages | `ai-link.html/js`, `signin.html/js`, console box | "Show my AI work link", fresh 24 h link, Replace |

Role manual differences: `role = "ai"` gets the full manual, `/map`, `/facts`, `/go`; `role = "host"` gets a narrow manual (`HOST_ENDPOINTS`: whoami, summary, info, participants, results, life, prizes, prizegiven, announce, reportlink) and `/ai/<cth_>/start`; `/map`, `/facts`, `/go` answer 403 text for a Host link.

## 4. What an AI can never do (enforced by the server, not by politeness)

| Cannot | Why / how it is enforced |
|---|---|
| Pay | `PAYER` map contains only master/host/cohost; AI checkout answers 403 "Please sign in again" (`pay.ts:185`) |
| Publish | `POST .../publish` by AI returns a hand-over (`needsOrganizer:true, consoleUrl`) and changes nothing (`worker.ts:1142`); the Organizer confirms e-mail + mobile |
| Erase participant data | `erase` is `can(e, true)` (never AI); the AI may **ask** via `control/request {action:"erase"}`; the Organizer is e-mailed and confirms in the console (`worker.ts:783`) |
| Pause / resume / stop a running game | only the organizer's own browser holds the signing key (non-extractable CryptoKey, IndexedDB); AI may **ask** (`control/request`); `control/key` is `can(e,true)` |
| Choose, change, add or remove winners, numbers, tickets | no route exists for anyone (`settle` -> 403; winners come from phone quorum); manual says so |
| See or send names and mobile numbers | `roster` -> `CONSOLE_ONLY` 403; `names/person/forget` refused; `participants` and `prizes` return ticket numbers only (numbers cut to "XXXXXXXX" + last two digits for outside callers, change history omitted); `mark`/`unbind` need `seat` not a phone; report address never returned (`url:null`, e-mailed to the Organizer) |
| Create or retire the Organizer's sign-in keys, replace its own link, change e-mail, close account | account routes test `a.kind === "master"` |
| Add a Co-host or retire team members | `org/cohost` is open to AI (ctc_ link returned for the organizer); retire is M/H only |
| Write or run code | the manual says so; the suggestion board is the only channel for ideas |
| Be silently misused | key never appears in error answers; unknown keys all get one 404; first use from a new country/network/program raises a one-time alert mail to the Organizer (`noteUse`, `worker.ts:232`); lasting key replaceable at any time |

## 5. Audit of AI calls

Every call made with an AI key (or a Host key through `/ai/...`) is written to `ai_audit` (`auditAi`, `winners.ts:138`: time, `key_id` = first 10 hex of the key hash, method, API path (never the key), status, address, program, country, engagement id). The Organizer reads it in the console and via `GET /api/org/ai/audit`. Opening `/ai/<key>` is itself recorded as `GET /ai/manual` (`worker.ts:308`); the `start|map|facts|go` pages as `GET /ai/<kind>`.

Separately, the internal hash-chained `audit_log` (owner-only) records the same calls with `actor = ai_key`, the vendor derived from the user agent and/or the **declared** identity (`?ai_model=&ai_version=&ai_session=&ai_machine=` or headers `x-ai-*`), a proof level (`declared / observed / inferred`) and a `mismatch` flag when the declared model's vendor differs from the user agent's; attempts to publish/erase/pay by an AI key are recorded as `ai_denied_attempt` (`audit.ts:119-160`, `AI_FORBIDDEN`). The manual asks the AI to say who it is on every call. The "analyze" route sends only masked aggregates (no IP, device id, UA, session) to an optional `ANALYZE_AI_URL`.

Link usage alerts: `noteUse` stores which countries / network prefixes / program families a key was seen from (`kv seen/<keyid>`, capped at 40 each); the first use is the baseline; any new one e-mails the Organizer once per 24 h (`newUseAlertMail`, no link, no key).

## 6. Tests

`apps/edge/test/ai-link.test.ts` (25), `ai-enablement.test.ts` (12, plays an outside AI: front door, map, facts, go screens, every function's classification, `next` hints, trust page equality, search-AI route), `ai-mail.test.ts`, `ai-mail-expiry.test.ts`, `ai-signin.test.ts`, `ai-privacy.test.ts`, `usecases.test.ts` (UC-50, UC-60..67, UC-81), `tools/sim/ai-persona.ts` and `ai-control.ts` (an AI does the whole job), `tests/e2e/01-security-isolation.spec.ts`. Legacy server equivalents: `apps/server/src/ai-link.ts` (`/ai/tbl_<64 hex>`), `apps/server/test/ai-link.test.ts`.

## 7. Known inconsistencies in the AI documentation (see `KNOWN-DOC-DRIFT.md`)

- The manual (`ai-link.ts` "Ticket flags") and `worker.ts:1187` say flagged tickets "stay out of lucky draws"; no code in `packages/beacon` reads the role (seat list carries none), so they are eligible today.
- `docs/AI_WORK_PROMPT_ORGANIZER.md` (57 KB) still says guests may invite "up to 10"; the server enforces **4** (its own gap list G1 says so).
- Old tests/docs use "co-host's AI link" for the Host's link.
