# V2 route and key table

Written for the owner's sweep after audit round 7 and given to each later auditor as the starting point. Branch `tambola-v2`. Part 1 states the rules for the keys V2 added and where each is enforced. Part 2 is the full route table read from the code (about 150 routes, the ids returned, the key-minting flows); cells marked `?` were not verified and are listed at its end.

## Part 1. The rules, and where each is enforced

**Where a key becomes an identity: one place.** `authOfKey` (`apps/edge/src/worker.ts`). A key made for ONE game (`organizer_key.scope_eid` set) is accepted only when `gated` is true, that is, when it came in the `x-organizer` header or `Authorization: Bearer`, or the `/ai/<key>` path (rewritten into that header). A key presented any other way (a request body, a query string, any helper flow) is no key at all. Source-scan tests in `v2-route-walk.test.ts` fail if a new place passes `gated` or a new direct lookup of a key by its hash appears.

**The scope gate** (`scopeGate`, `apps/edge/src/v2-keys.ts`) runs first in `route0` for every gated scoped key and is default-deny:

| Key | Made by | Stored as | Read as | Lives until | May call (own game only) | Receives | Can become |
|---|---|---|---|---|---|---|---|
| `gm` game key for a person (`ctg_`) | the organizer, `POST /api/z/{id}/v2/keys` | master, `scope_kind` gm | master for ONE game | 24 h after the game ends | every game action except account routes and `rehearsal`; Host keys without personal data (`v2/host`); after the end only: erase, clone (a new game and a new `gm` key), results, reportlink, `v2/export`, `v2/receipts`, `v2/status`, `v2/keys` | the organizer's own view of that game (names and mobiles included) | nothing wider: not an account key, not a longer key (Google sign-in, device keys, the checkout all treat it as no key); clone gives a key for the NEW game only |
| `ga` game key for an AI (`ctg_`) | the organizer, `v2/keys {ai:true}` | master, `scope_kind` ga | **kind ai** (every AI rule applies) | as `gm` | what the organizer's own AI key may do, for that game; plus `v2/export` and `v2/receipts` (no names, no payment id, no invoice links) | ticket numbers only; the report link is withheld; never roster, people, waiting, me, names, person, forget | nothing; clone, erase and rehearsal are refused ("ask the organizer") |
| `lh` Host key without personal data (`cth_`) | the organizer or a `gm` key, `POST /api/z/{id}/v2/host` | host, `scope_kind` lh, no e-mail or mobile | host | 24 h after the game ends | GET: participants, summary, results, info, prizes (ticket numbers only), life, claims, seats, control, gamelog, changes, presence, myprizes. POST: announce, prizegiven, override. `v2/receipts` (no secrets), `v2/claimreview` (decide claims), `v2/host/stepdown`, `v2/host/handover`, `v2/host/requests`, Support. Nothing else (`host-limited`) | ticket numbers only, no report link | nothing: the Google first-open step, device-key step and e-mail steps refuse or keep its scope |

All three: refused on every other game, on `/api/org/*`, `/api/owner/*`, `/api/auth/*`, `/api/host/*`, `/api/checkout`, and every other account route (403 `key-scope`); `/ai/<ctg_ key>` is refused (404); at exactly end + 24 h the answer is 401 `key-expired`; a deleted or cancelled game counts as ended. A call that declares itself an AI (`x-ai-model`) with a person's key cannot switch claim review, decide claims, make keys or Hosts, or clone, and sees receipts without secrets.

**Enforced by test** (`apps/edge/test/v2-route-walk.test.ts`, one process, about a minute): the route list is read from the source; every action and every `/api/...` path is called with each of the three key kinds, plain, with a 5,000-character padded body, and with the key also in the body and the query; the AI game key must answer like the organizer's AI key; nothing personal may come back to an AI or Host key; the Host key reaches only its list, also through `/ai/...?_method=POST`; after the end and after expiry only the short list remains. Older tests cover each item in detail (`v2-*.test.ts`).

**Ids returned in responses (V2)**

| Id | Who gets it | Other routes that accept it, and what they return |
|---|---|---|
| `paymentId` (`pay_...`) | the organizer's own key (full receipts) only; never a Host, an AI, an AI game key, or a call that declares itself an AI | `GET /api/payments/{id}/receipt` (public) returns the invoice link and gateway reference; hence it is withheld |
| `invoiceNumber`, credit-note numbers | everyone who may read receipts | none accepts it alone (invoice routes take the long `inv_` token only) |
| invoice tokens (`/api/invoice/<token>`) | the organizer's own key only | open the invoice (buyer's name and mobile) |
| certificate id | the organizer's key and the AI game key (list and download with a key); the public sees it only by being given it | `GET /api/v2/verify/{id}` (public) returns non-personal facts only |
| key id (first 10 hex of the hash) | the organizer (key list, `v2/keys`) | `v2/keys/revoke` (organizer's account key only) |
| support ticket id | its raiser's scope (organizer all, game key its game, Host Hosts' tickets, AI AI and Host tickets) | `GET/POST /api/v2/support/{id}` scoped by organization and game in the SQL; `/api/owner/v2/support/{id}` needs the platform key |
| hand-over id | the organizer and the asking Host | `v2/host/requests/{n}` scoped by organization and game |
| ticket numbers, pids | public (the seat list is public) | `v2/claimreview/note?pid=` returns the rejection reason for that ticket (disclosed) |

**Audit-log fields** (`audit.ts`): for a V2 call (paths `/api/z/{id}/v2/...`, `/api/org/v2/...`, `/api/owner/v2/...`, `/api/v2/...`) the log records method, path, status, actor and only the plain choices (decision, ticket, pattern, round, on/off, approve, part, format, game, ordinal). Typed words (reasons, notes, subjects, replies, labels) are never copied. The game's own AI trail (`ai_audit.label`) holds "AI" or "AI: <name>" (up to 40 characters from the caller's header).

**What the sweep found**
1. Fixed: the Google sign-in route read a Host key from the request body (round 7). Now `authOfKey` ignores a scoped key unless gated, `mintDeviceKey` copies the scope, and the checkout and proforma lookups leave scoped keys out.
2. Fixed: a game key could call `POST /api/z/{id}/rehearsal`, which makes new Co-host keys that do not stop 24 hours after the game. Now refused for game keys.
3. By design, disclosed: a person's game key can clone the game and gets a key for the new game (each lives to 24 h after its own game); it can make Host keys without personal data and spend the account's credit on its own game (`pay-with-credit`), like the organizer's own key.
4. Existing behaviour, not V2, flagged to BOSS, unchanged: a Host's AI work link gets the report link (`reportlink`), which opens names and mobiles; `POST /api/helpdesk/approve/start` is public and, with its approval token, returns a 30-minute account key; owner routes read two header names (`x-ct-link`, `x-cb-link`).
5. The table's remaining `?` cells (owner desk, help desk, who, logo, schedule, beacon) are in routes a game key cannot reach (the gate refuses them); they are listed at the end of Part 2.

---

# Part 2. The full route table (generated by reading the code; unverified cells are `?`)

# Security route table: tambola-v2 worker (read-only audit, no code run)

Source: `apps/edge/src/worker.ts` (authOf, authOfKey, route, route0, aiLink), `pay.ts`, `credit.ts`, `hostsetup.ts`, `helpdesk.ts`, `partners.ts`, `lifecycle.ts`, `winners.ts`, `people.ts`, `rehearsal.ts`, `clone.ts`, `v2*.ts`, plus a skim of `admin.ts`, `mode.ts`, `audit.ts`, `ai-link.ts`.
Everything here comes from reading the checks in code (can(), canAi(), mayPay(), deny(), a.kind compares), not from comments.

## Legend

- **KEY** = a row of `organizer_key` looked up by sha256("key|"+key). **TOKEN** = anything else (pay link, report key, invoice token, payment id, certificate id, claim/ticket id, help desk link, sign-in code).
- Kinds: **P** platform (env.ORGANIZER_SECRET), **M** master `ctk_`, **A** ai `cta_`, **H** host `cth_`, **C** cohost `ctc_`, **pub** public (no credential).
- Scoped KEYs (scope_eid set, only honoured when read gated from x-organizer / Bearer / `/ai/<key>` header rewrite): **gm** `ctg_` kind master; **ga** `ctg_` read as kind ai (but see Finding on `/ai/`: LINK_KEY only matches `ct[ah]_` so a ctg_ key is NOT accepted by `/ai/<key>`); **lh** `cth_` host key without personal data.
- Scope gate summary (v2-keys.ts scopeGate, runs first in route0 via v2Route): any scoped key on a path other than `/api/z/{scopeEid}/<action>` gets 403 key-scope, except OPEN_OK (`/api/notices`, `/api/auth/config`, `/api/invoice/<id>`, `/api/beacon/*`, `/api/v2/support[/n]`, `/api/v2/verify/<id>`, `/api/z/ai-manifest`, `/api/z/schedule`) and GET `/api/whoami`.
  - gm: every `/api/z/{id}/*` action while the game is live. ga: same minus roster, people, waiting, me, names, person, forget. lh: GET participants, summary, results, info, prizes, life, claims, seats, control, gamelog, changes, presence, myprizes; POST announce, prizegiven, override. `reuse` only with body.from == scope_src. `clone` goes to cloneWithKey.
  - After the game ends: gm/ga only POST erase, POST clone (gm only), GET results, GET reportlink, and `/v2/{export|receipts|status|keys}`. lh keeps its host routes. All scoped keys die 24h after the game end (revoked by v2Purge, and checked live).
- "scoped col" in the kinds column says what gm / ga / lh get on that route.
- Audit column: **log** = written to the internal audit log by `audit.ts classify` (event name given). **ai_audit** = also written to the AI trail (`auditAi` / v2AiLabel). `-` = not logged (classify returns null for a plain GET). Body fields are copied only where stated; V2 routes copy plain choices (label, ai flag, approve flag, decision, round, pattern, ticket) never names, phones, e-mails or free text with digits.
- `?` = not verified; the text after it says what to check.

---

## 1. Public, static, machine-to-machine

| Route | Credential accepted | Kinds | Returns | Mints | Audit |
|---|---|---|---|---|---|
| GET /api/mode | none | pub | the word TEST or LIVE | nothing | - |
| GET /api/notices | none | pub (scoped: OPEN_OK) | public notices | nothing | - |
| GET /api/status/health | none | pub | ok, errors_last_hour, overdue_purge count, maintenance flag | nothing | - |
| GET /api/auth/config | none | pub (scoped: OPEN_OK) | sign-in config (google client id etc) | nothing | - |
| GET /api/z/ai-manifest | none | pub (scoped: OPEN_OK) | static AI manual | nothing | - |
| GET /api/z/schedule | none | pub (scoped: OPEN_OK) | public game schedule list; ? check which fields (no personal data expected) | nothing | - |
| GET /api/beacon/{64hex}/public/... | path segment 64hex (TOKEN, per-game beacon) | pub (scoped: OPEN_OK) | public game beacon; ? check payload | nothing | - |
| POST /api/v/b | none | pub | 204-style quiet ok; visit events (IP masked + HMAC) | nothing | - (own visits table) |
| GET /api/payments/status | none | pub | payments on/off, mode | nothing | - (classify skips it) |
| GET /api/payments/where | none | pub | country/currency guess for the buyer | nothing | - |
| GET /api/partner/check?code= | query `code` (TOKEN, partner code) | pub | whether the code is valid | nothing | log: partner? (GET returns null) |
| POST /api/mail/events | header svix-signature + svix-id + svix-timestamp (webhook secret RESEND_WEBHOOK_SECRET) | machine | 404 if no secret set; 400 bad signature | nothing | - |
| POST /api/inbound-email | header x-inbound-secret | machine | forwards inbound mail to support; ? check what it returns | nothing | log other_write |
| POST /api/lifecycle/tick | P key, or header x-cron-key | P or cron | purge/lifecycle result counts | nothing | - (classify skips) |
| POST /api/purge | P key | P | purge counts | nothing | - |
| GET /api/report/{eid}?k=&part=people&i= | path `eid`, query `k` = REPORT KEY (HMAC of eid with per-game salt, TOKEN) | pub holder of report link | whole game report; part=people returns names + mobiles | nothing | - |
| GET /j/{token} | path token = personal join token (TOKEN) | pub | player's own join page | nothing | - |
| GET /api/v2/verify/{id} | path certificate id (20 hex, TOKEN) | pub (scoped: OPEN_OK) | game, ticket, prize, hash, chain; no name/mobile/e-mail | nothing | - |
| GET /api/v2/claimreview/note?pid= | query `pid` (ticket id TOKEN) | pub | reject reasons for that ticket | nothing | - |
| GET /zc.html, /report.html, /paylink.html, /j/..., other static pages | none (zc.html?k=<key> puts a KEY in the URL query, read by page JS, not the worker) | pub | static HTML/JS | nothing | - |
| GET /api/z/{id}/logo | path id | pub | game logo | nothing | - |
| GET /api/z/{id}/who, /seats, /results, /info | path id (and for who: ? check query) | pub | public game state: results, info (no names), seats; who ? check what it lists | nothing | - |

## 2. Auth (`/api/auth/*`, `/api/start`, `/api/whoami`, `/api/pass`)

| Route | Credential accepted | Kinds | Returns | Mints | Audit |
|---|---|---|---|---|---|
| POST /api/start | body `email`, `pass` (demo-pass TOKEN, 32 hex), `consent` | pub | NEW email: `token` (ctk_ master) + `aiKey` (cta_) + aiMessage, no e-mail check; existing email: `{exists:true}` only | ctk_ master + cta_ ai (createOrganizer) for a new org | log create (copies nothing from body) |
| POST /api/auth/email | body `email`, optional `pass` | pub | sends 6-digit code + link token by e-mail; returns only ok | login_code row + link token (TOKEN) | log login / login_failed |
| POST /api/auth/verify | body `email`, `code` (TOKEN); test logins need runnerOk (x-runner-key) | pub | signInResult: `token` ctk_ (fresh master row); for a Host also a device key via mintDeviceKey | new ctk_ master per sign-in; Host: device `cth_` copy | log login |
| POST /api/auth/link | body `token` (48 hex link TOKEN) | pub | same as verify | new ctk_ master; Host: mintDeviceKey | log login |
| POST /api/auth/google | body `credential` (Google id token), `intent`, and for intent=host body **`hostKey`** (a KEY from the body) | pub (+ host key in body) | signInResult; host intent runs confirmHostEmail | ctk_ master; host intent: device host key (mintDeviceKey) and e-mail sealed onto all rows of that host | log login |
| GET /api/whoami | header x-organizer/Bearer | any (scoped: gate answers first with kind host/ai/master, gameKey:true, game, over, expiresMs) | kind, org, flags | nothing | - (ai_read for ai) |
| POST /api/pass | header (M only), body `token` (demo-pass TOKEN) | M (scoped gm blocked by scope gate: not /api/z) | redeems a demo pass to the account | nothing (grants credit) | log other_write |

## 3. Organizer account (`/api/org/*`), keys and team

| Route | Credential accepted | Kinds | Returns | Mints | Audit |
|---|---|---|---|---|---|
| POST /api/org | header (P) | P only | new account ctk_ key | ctk_ master (new org) | log other_write |
| GET /api/org/keys | header | M (not scoped keys; scope gate 403) | list: id (first 10 hex of hash), kind, revoked, created_ms for ALL org rows including scoped ones | nothing | log (ai_read if ai) |
| POST /api/org/keys/revoke | header, body `id` (10 hex key id) | M | ok | nothing (revokes by substr(hash,1,10), org-bound) | log (copies id) |
| POST /api/org/ai , /api/org/ai/replace | header | M (ai refused) | new cta_ key + aiMessage; ALSO mails a 24h ai key | cta_ ai (revokes other ai keys except created_by 'd'); sealed copy in kv aikey/{org}; mailTempLink 24h key with expires_ms | log (target ai) |
| GET /api/org/ai/link | header | M | the lasting AI key (unsealed from kv) | nothing new, but exposes a long-lived key | log |
| POST /api/org/ai/fresh | header | M | mails a 24h ai key (mailTempLink) | cta_ with expires_ms = now+24h | log |
| POST /api/org/ai/revoke | header | M | ok | revokes ai keys | log |
| GET /api/org/ai/audit | header | M, A, P | AI audit rows (include ip, ua, country, label) | nothing | - / ai_read |
| POST /api/org/host | header, body `email`, `mobile`/`phone`, `label`, `e` (eid) | M only (ai refused; scoped gm blocked) | hostKey (cth_, shown once), link, manualUrl `/ai/<key>`, id (10 hex). Sealed email+pii stored. Also mails a 24h host key to the organizer | cth_ host (host_id=hash, host_state row); mailTempLink 24h host key | log invite (target host); body email/phone NOT copied (? check details field) |
| POST /api/org/host/link | header, body ? (host id / email; ? check exact field) | M | re-keys an UNVERIFIED host row in place, returns new hostKey | `UPDATE organizer_key SET hash=?,host_id=?,created_ms=? WHERE hash=?` (no scope_eid filter; only hst.verified_ms blocks it: lh rows have verified_ms set so 409) | log (target host) |
| GET /api/org/team | header | M, A, H (scoped blocked) | ids (10 hex), role, label; M and H see email/mobile; A gets none; cohost phone masked; includes lh rows | nothing | - / ai_read |
| POST /api/org/cohost | header, body `label`, `phone`, `e`/`eid` | M, H (not viaLink) | ctc_ key shown once | ctc_ cohost key (sealed name+phone, eid) | log (copies label, not phone ?) |
| POST /api/org/team/retire | header, body `id` (10 hex) | M (hosts and cohosts), H (cohosts only) | ok | nothing (revokes + nulls pii/email) | log |
| POST /api/org/replace/..., team replace | ? see worker.ts around lines 1366-1381 | M | ? | ? may mint new host/cohost key | ? |
| POST /api/org/role/accept | header | H, C | accept a role (consent) | nothing | log other_write |
| POST /api/org/close | header, body `confirm` | M | closes account, deletes data | nothing | log delete |
| GET /api/org/credit | header | M, H (not viaLink) | credit balance | nothing | - |
| GET /api/history | header | M, A?, P (org-bound) | org's game list | nothing | - / ai_read |
| GET /api/org/v2/receipts | header | M only, not scoped | all org receipts, full view | nothing | - |
| GET /api/org/v2/notices | header | M only, not scoped | org notices | nothing | - |

## 4. Host and cohost (`/api/host/*`)

| Route | Credential accepted | Kinds | Returns | Mints | Audit |
|---|---|---|---|---|---|
| GET /api/host/setup | header | H (not viaLink unless temp key); lh blocked by gate | setup state | nothing | - |
| POST /api/host/setup/mobile | header, body mobile | H | ok | sealed mobile saved (UPDATE pii on hash OR host_id) | log other_write |
| POST /api/host/setup/email | header, body email | H | sends a code | nothing | log |
| POST /api/host/setup/email/verify | header, body `email`, `code` | H | confirms; runs confirmHostEmail | device cth_ key (mintDeviceKey copies scope cols, NOT expires_ms) | log |
| POST /api/host/become-organizer | header | H (not viaLink) | creates an org for this person | createOrganizer: ctk_ + cta_ returned | log create |

## 5. Engagement routes `/api/z/{id}/<action>` and `/api/z`

Scoped col: gm = M-like while live; ga = A-like; lh = host narrow set. After game over see Legend.

| Route | Credential accepted | Kinds (can / canAi / etc.) | Returns | Mints | Audit |
|---|---|---|---|---|---|
| POST /api/z | header | M, A (H refused) | new draft game id | nothing (ai: noteHelperGame) | log create |
| GET /api/z/suggestions[...] | header | any org key or P (status changes: P only) | suggestions | nothing | - |
| GET /api/z/{id}/join (page) / POST join | none; body `phone`, `empId`, `token` (personal link TOKEN), `device`, `from` (invite code, includes first 7 hex of a host/cohost key hash), `cat`, `name`, `email` | pub | ticket pid + device cookie, own ticket | pid (ticket id) | log join (copies none of name/phone ?) |
| GET /api/z/{id}/who | none ? | pub | ? check | nothing | - |
| GET /api/z/{id}/results | none | pub (lh ok, gm ok, ga ok) | winners and ticket numbers, masked | nothing | - |
| GET /api/z/{id}/info | none | pub | public info | nothing | - |
| GET /api/z/{id}/seats | none | pub | seat map | nothing | - |
| POST /api/z/{id}/logo | none ? (check can) | pub per code comment | sets logo? ? check | nothing | log edit |
| GET /api/z/{id}/participants | header | can() (M, H incl viaLink, P; C no). gm, ga, lh ok | participant counts; names? ? check outside=ai/lh reduced | nothing | - / ai_read |
| GET /api/z/{id}/summary | header | can() | summary counts | nothing | - |
| POST /api/z/{id}/announce | header, body message | can() (H via link too) ; gm ga lh ok | ok | nothing | log announce |
| GET /api/z/{id}/prizes | header | can(); outside = ai, scopeKind lh, host viaLink get reduced (names/phones masked to last 2 digits); everybody else including gm and ga? full names and phones | prize list | nothing | - |
| POST /api/z/{id}/prizes | header | can() ? check | sets prizes | nothing | log edit |
| POST /api/z/{id}/prizegiven | header, body ticket/prize | can() (H too); gate prizeHold may 409 if a claim is rejected | ok | nothing | log prize |
| POST /api/z/{id}/override | header | can() AND (P, M or H) | ok | nothing | log edit |
| GET /api/z/{id}/myprizes | query/body pid + device (ticket TOKENS) | pub | the player's own prizes | nothing | - |
| POST /api/z/{id}/confirm | body pid, device | pub (ticket) | confirm prize | nothing | log prize |
| GET /api/z/{id}/life | header | can() | lifecycle state | nothing | - |
| GET /api/z/{id}/reportlink | header | can(): ai gets `url:null`; **M, H via AI link (cth_ + x-ct-link) get the URL**; gm gets URL; ga gets null; lh ? (host viaLink counts as host) | report URL with report key `k` (names + mobiles via part=people) | nothing (returns existing report key) | - |
| POST /api/z/{id}/reportlink | header | can(,true) (M or non-link H) | regenerates salt, returns new url | NEW report key (old one dies) | log edit |
| GET /api/z/{id}/claims | header | canRead (can + cohost) | claims list | nothing | - |
| POST /api/z/{id}/claims, /bogey, /vote, /won, /over, /leave, /datareq | body pid + device (ticket TOKENS) | pub | own result | nothing | log claim / vote / join etc |
| GET /api/z/{id}/gamelog, /changes | header | canRead / can() | game log | nothing | - |
| GET/POST /api/z/{id}/checkin(s), /presence | presence POST body pid; GET header | POST pub; GET can(,true) or cohost | check-ins | nothing | log edit |
| POST /api/z/{id}/mark, /unbind | header | canAi (ai must use a seat number) | ok | nothing | log edit / unbind |
| POST /api/z/{id}/roster | header | can(); **ai refused**; ga denied | people roster (names, phones) | nothing | log edit |
| GET /api/z/{id}/names | header | can(,true) (M or non-link H); ga denied | names | nothing | - |
| GET/POST /api/z/{id}/person, /forget | header | can(,true); ga denied | one person's data / erase | nothing | log erase_request |
| GET/POST /api/z/{id}/people, /waiting, /me | header (organizer/host/cohost) or guest: `x-ct-pid`, `me` query/body field, device | callerOf: ai and viaLink REFUSED; M, P, H, C allowed; guest by pid+device; ga denied | people lists (names, mobiles) | personal join tokens (/j/{token}) via resend/invite | log invite / edit |
| GET /api/z/{id}/people/export | header | as people | export with names | nothing | - |
| POST /api/z/{id}/people/{id}/remove , /resend | header | as people | ok | new personal token on resend | log edit |
| POST /api/z/{id}/invites | body pid + device | pub ticket | invite code | invite code (embeds first 7 hex of host/cohost hash ?) | log invite |
| GET/POST /api/z/{id}/settings | header | can() | game settings | nothing | log edit |
| POST /api/z/{id}/publish | header, body `email`, `phone`, `consent` | can(,true); ai gets a handover message instead | publishes game | nothing | log publish (copies none ?) |
| POST /api/z/{id}/reuse | header, body from | can(); scoped: only from==scope_src | copies people from another game | nothing | log edit |
| POST /api/z/{id}/clone | header, body startRound, withPeople, demo | can(,true); scoped gm: cloneWithKey; ga refused; any x-ai-model refused | new game id; for gm key also `gameKey` for the NEW game | **ctg_ gm key for the new game** (scope_src = old game) | log clone |
| POST /api/z/{id}/erase | header | can(,true); scoped gm/ga ok after game over | erases people data | nothing | log erase_request |
| POST /api/z/{id}/discard | header | P or M | deletes draft | nothing | log edit |
| POST /api/z/{id}/cancel, /reopen, GET /cancel-preview | header | can(,true) | cancel / reopen / preview refund | nothing | log cancel |
| GET /api/z/{id}/cohost | header | can() ; lists org keys incl cohost (ids) | key list | nothing | - |
| GET/POST /api/z/{id}/rehearsals, /rehearsal, /rehearsalclose | header | can(,true); **POST `/rehearsal` is refused for gm and ga keys (`key-scope`, fixed in f233d52)** | rehearsal game | account key only: copyCohosts makes new unscoped ctc_ keys for every active cohost (links `#cohost=<key>`) | log edit |
| GET/PUT/POST /api/z/{id}/control, /control/key, /control/request, /request/clear | GET/POST control: none (signed message is the authorization); PUT key body publicKey; request body action | GET/POST control pub; PUT key can(,true); POST request can() including ai; GET request can(); clear can(,true); H viaLink not allowed on sub-routes | control state | nothing | log pause/resume/stop/erase |
| POST /api/z/{id}/paylink | header | M, H, C (not ai, not viaLink); gm ok | `paylink.html?t=<token>` | **pay link TOKEN (48 hex)** | log pay ? |
| POST /api/z/{id}/pay-with-credit | header | M, H, C (ai refused); gm ok | pays from credit | nothing | log pay |
| POST /api/z/{id}/datareq | body pid + device | pub | data request (access/correction/erasure/status) | nothing | log |
| GET /api/z/{id}/gamelog | header | canRead | log | nothing | - |

## 6. V2 routes (`/api/z/{id}/v2/*`, `/api/org/v2/*`, `/api/v2/*`, `/api/owner/v2/*`)

V2 routes run behind scopeGate. Reduced views: certs and export give names only to non-AI calls; receipts and export payments full only for `seesAll` (P, or M that is not ga and has no x-ai-model).

| Route | Credential accepted | Kinds | Returns | Mints | Audit |
|---|---|---|---|---|---|
| GET /api/z/{id}/v2/keys | header | account M, or the game's own gm key | list: id (10 hex), label, kind, retired | nothing | -; ai_audit label |
| POST /api/z/{id}/v2/keys | header, body `label` (40 chars), `ai` bool | account M only (gm refused), game not over, max 5 | `key` (ctg_, shown once), id | **ctg_ key kind master, scope_kind gm or ga** | log edit; copies label, ai flag |
| POST /api/z/{id}/v2/keys/revoke | header, body `id` (10 hex) | account M only | ok | nothing (revokes by substr(hash) OR substr(host_id)) | log edit; copies id |
| POST /api/z/{id}/v2/host | header, body `label` | account M or gm (not ga, not viaLink), not over, max 5 | hostKey (cth_ lh), id, link `/zc.html?k=<key>&e=` | **cth_ host key, scope lh, no expires_ms (dies by game end+24h purge)** | log edit; copies label |
| POST /api/z/{id}/v2/host/stepdown | header | H of this game (own keys) | ok; mails organizer | nothing (revokes by hash/host_id) | log edit |
| POST /api/z/{id}/v2/host/handover | header, body note (digit runs masked) | H | ok, organizer notice + mail | handover request id | log edit |
| GET /api/z/{id}/v2/host/requests | header | M sees all; H sees its own | requests | nothing | - |
| POST /api/z/{id}/v2/host/requests/{n} | header, body `approve`, `label` | M | approve: old host revoked, new lh key shown once | **new cth_ lh key** | log edit; copies approve, label |
| GET /api/z/{id}/v2/receipts | header | P, M (full: paymentId, payerEmailMasked, gatewayReference, invoiceUrl, invoicePdfUrl (inv_ tokens), creditNoteUrls); gm full; ga, H, lh reduced (no paymentId, no invoice links, no payer e-mail, no gateway ref) | receipts | nothing, but returns **invoice tokens** and **paymentId** | - ; ai_audit |
| POST /api/z/{id}/v2/receipts/send | header | M full view | mails receipt list to the organizer | nothing | log edit |
| POST /api/z/{id}/v2/certs | header | P, M (same org), ga | issues certificates | certificate id (20 hex) | log edit |
| GET /api/z/{id}/v2/certs, /certs.csv, /certs/{id}.html | header | P, M, ga (same org) | list / csv / one cert; names only for non-AI calls while data held | nothing | - |
| GET /api/z/{id}/v2/export?part=&format= | header, query part (all/results/winners/tickets/payments), format | P, M, gm, ga | names only for non-AI; payments `full` for gm and M, reduced for ga | nothing | -; ai_audit |
| GET /api/z/{id}/v2/claimreview | header | H or M | claim review list | nothing | - |
| POST /api/z/{id}/v2/claimreview (decide) | header, body ticket, pattern, round, decision, reason (digits stripped) | H or M; ai and viaLink refused | ok; prizeHold then blocks prizegiven 409 for rejected | nothing | log edit; copies ticket, pattern, round, decision, reason |
| POST /api/z/{id}/v2/claimreview/mode | header | M or P (not ai) | toggles mode | nothing | log edit |
| GET /api/z/{id}/v2/aitrail | header | P, same-org M, same-org A | AI trail (ai_audit with ip/ua/country/label) | nothing | - |
| GET /api/z/{id}/v2/status | header | P or same-org M | V2 status | nothing | - |
| POST /api/v2/support , GET /api/v2/support[/id] | header | any org key (gm, ga, lh via OPEN_OK); scopeSql: org M sees all org tickets, game key only its game, H role host, A roles ai+host | tickets; support ids | ticket id; mails the company address with organizer reply e-mail (10/day, 20 open) | log other_write; body cleaned text |
| /api/owner/v2/support[/id] (GET list ?status=, ticket, POST reply, status) | header | P only, x-ct-link != 1 | all tickets | nothing | log |
| GET /api/v2/verify/{id} | path (cert id TOKEN) | pub | see section 1 | nothing | - |

## 7. AI work link (`/ai/<key>...`)

| Route | Credential accepted | Kinds | Returns | Mints | Audit |
|---|---|---|---|---|---|
| GET /ai/<key> (manual) and /ai/<key>/start, /map, /facts, /go/* | **path segment `<key>`** (KEY, regex `ct[ah]_[0-9a-f]{48}`) | A, H only; P and M refused (linkGone); ctg_ keys do not match the regex so scoped gm/ga game keys are not accepted here | AI manual/map; rewrites to header, adds x-ct-link:1, calls handle0 | nothing | ai_audit |
| GET /ai/<key>/api/... with `?_method=POST|PATCH&_body=<json>` | path key + **query `_body`** | A, H (H limited to HOST_ACTIONS: participants, summary, results, info, announce, prizes, prizegiven, override, reportlink, life); H viaLink blocked on /api/payments/ and /api/org/(team|cohost) | any underlying route result; **a GET with side effects (writes via query)** | whatever the routed call mints | as the underlying route, label AI |

## 8. Payments, invoices (`/api/checkout`, `/api/payments/*`, `/api/paylink/*`, `/api/invoice/*`, `/api/credit-note/*`, `/api/proforma`)

| Route | Credential accepted | Kinds | Returns | Mints | Audit |
|---|---|---|---|---|---|
| POST /api/checkout | header `x-organizer` only (not Bearer), unscoped (scope_eid IS NULL), kind in M, H, C; or none for a guest buyer. Body eid, pack, email, name, org, phone, taxId, country, ref, K3 consent | pub or account payer | paymentId (pay_+16 hex), Razorpay order; test mode also invoiceUrl and `organizerKey` | paymentId; later new ctk_ master for a new-organizer payment | log pay (? which body fields) |
| POST /api/paylink/{token}/checkout | path pay link TOKEN, body as checkout | pub | same | paymentId | log pay |
| GET /api/paylink/{token} | path token (48 hex) | pub | what the link pays for (game, price) | nothing | - |
| POST /api/payments/test | body as checkout | pub (test mode) | simulated pay; in test mode can return `organizerKey` | ctk_ for new test org | log pay |
| GET /api/payments/{pay_id}/receipt | path paymentId | pub (by id) | publicReceipt: strips organizerKey, sets newOrganizer; invoice link | nothing (invoice link = bearer inv_ token) | - |
| POST /api/payments/{pay_id}/invoice | path paymentId, body name, org, taxId or skip | pub (by id) | issues invoice | **invoice token inv_+32 hex** | log pay |
| GET /api/payments/paytest/{id}, POST /api/payments/paytest | path id / body | pub, rate limited | test pay page | nothing | log pay |
| POST /api/payments/verify | body paymentId, razorpay_* (signature) | pub (signature-checked) | fulfils the order | invoice, **new ctk_ master mailed (not returned) for a new organizer (pay.ts:231)** | log pay |
| POST /api/payments/webhook | Razorpay signature | machine | ok | same fulfil path | log pay |
| POST /api/proforma | header `x-organizer` (unscoped) or body `link` (pay link TOKEN) | pub or account | HTML proforma, no key | nothing | log |
| GET /api/invoice/{inv_} | path invoice TOKEN | pub (OPEN_OK for scoped keys) | invoice page | nothing | - |
| GET /api/invoice/{inv_}.fragment, .pdf | path invoice TOKEN | pub | invoice html / pdf (buyer name, tax id, address) | nothing | - |
| POST /api/invoice/{inv_}/email | path TOKEN, body `to` (max 5) | pub | mails the invoice | nothing | log |
| GET /api/credit-note/{cn_} | path credit-note TOKEN | pub | credit note | nothing | - |

## 9. Help desk (`/api/helpdesk*`)

| Route | Credential accepted | Kinds | Returns | Mints | Audit |
|---|---|---|---|---|---|
| POST /api/helpdesk/join | header x-partner (ctp_ partner KEY) + body ? | partner holder | helper joins desk | helper identity | log partner? |
| GET /api/helpdesk/me | header x-partner | partner holder | the helper's lasting cta_ AI key as `consoleUrl` `/zc.html?k=<aiKey>` and `aiLink` `/ai/<aiKey>` | nothing new (reveals a long-lived ai key to the partner key holder) | - |
| POST /api/helpdesk/invite | header | M | invite link (TOKEN) | link token (`hdlink|`) | log other_write |
| POST /api/helpdesk/request-publish | header x-partner / body | helper | publish approval request (TOKEN `hdpub|`) | approval token mailed to organizer | log |
| GET /api/helpdesk/accept/info?t= | **query `t`** (link TOKEN) | pub | what the helper would get | nothing | - |
| POST /api/helpdesk/accept | header (M), body `t` | M | accepts | **cta_ ai key (created_by 'd')**, sealed in helpdesk_link | log |
| POST /api/helpdesk/stop | **body `t`** (link TOKEN), or M, or partner | link TOKEN holder, M, partner | revokes helper keys | nothing | log |
| GET /api/helpdesk/mine | header | M | desk links | nothing | - |
| GET /api/helpdesk/approve/info | **query/body `t`** (approval TOKEN) | pub | what is being approved | nothing | - |
| POST /api/helpdesk/approve/start | **body `t`** (approval TOKEN), NO header | **pub** | `key` | **ctk_ MASTER key for the whole account (not game scoped), 30 min, created_by 'dp'** | log ? (login?) |
| POST /api/helpdesk/approve/done | body `t` | pub (TOKEN) | publishes, desk Host identity | **device Host key via mintDeviceKey, then UPDATE expires_ms = now+24h, mailed to helper** | log |

## 10. Partner (`/api/partner*`)

| Route | Credential accepted | Kinds | Returns | Mints | Audit |
|---|---|---|---|---|---|
| POST /api/partner/enroll | body email etc | pub | sends code | partner row | log partner |
| POST /api/partner/enroll/verify | body email, code | pub | `ctp_` partner key | ctp_ key (partner_key) | log partner |
| POST /api/partner/signin, /signin/verify, /signin/link | body email, code / link `token` (TOKEN) | pub | ctp_ device key | new ctp_ device key | log partner |
| POST /api/partner/close | header x-partner | partner | closes | nothing | log partner |
| GET /api/partner/me | header x-partner | partner | partner info, commissions | nothing | - |
| GET /api/partners | header (P) | P | all partners | nothing | - |
| POST /api/partners/commission/rate, /payout, /commission/void, /state | header (P) | P | ok | nothing | log partner |

## 11. Owner desk (`/api/owner/*`)

Owner routes use `a.plat` plus a `x-ct-link != 1` check; some check the header named `x-cb-link` instead (admin, price adjust, game-records, releases, ledger). Inconsistency: ? check whether `x-cb-link` is ever set by aiLink (only `x-ct-link` is set there). A platform key delivered through /ai/ is refused anyway (aiLink accepts only A and H), so exposure is low but the names differ.

| Route | Credential accepted | Kinds | Returns | Mints | Audit |
|---|---|---|---|---|---|
| GET/POST /api/owner/mode, /test-mail, /purge-test-data | header | P (not via link) | mode switch | nothing | log (reason copied) |
| GET/POST /api/owner/site, /organizer, /data-requests, /mail-events, /errors | header | P; others get 404 and a denied access row | owner data; organizer lookups | ? (organizer route may reveal or reset an org; check admin.ts for any key mint) | owner access log |
| GET /api/owner/stats | header **x-owner-stats-key** (OWNER_STATS_KEY, its own key) | stats key | counters | nothing | - |
| GET/POST /api/owner/prospect-links | header | P | list prospect links (kv plink), create pass links | **demo-pass TOKEN** (32 hex, `?pass=`) | log |
| GET /api/owner/panel, GET/POST /api/owner/price | header | P (x-cb-link) | game facts; price adjust | nothing | owner access log |
| GET /api/owner/game-records, /releases, /ledger | header | P | records, releases, ledger csv | nothing | owner access log |
| GET /api/owner/visits/summary, /journey/{id} | header, path visitor id | P | visitor analytics (masked IP) | nothing | each read is logged |
| GET /api/owner/audit/... | header | P | internal audit log | nothing | - |
| /api/owner/v2/support | see section 6 | P | | | |

## Ids returned in responses

| Id | Where returned | Who gets it | Other route that accepts it and what that returns |
|---|---|---|---|
| paymentId (pay_+16 hex) | POST /api/checkout, paylink checkout, receipts (full view), export payments (full) | the buyer; M and gm in V2 receipts/export; P. Hosts, ga, AI do not | GET /api/payments/{id}/receipt (public by id, strips organizerKey); POST /api/payments/{id}/invoice (name/org/taxId, issues invoice); POST /api/payments/verify body paymentId; paytest/{id} |
| invoiceNumber / invoice token (inv_+32 hex) | invoice responses, receipts `invoiceUrl`, `invoicePdfUrl`, mail | buyer, organizer M, gm, P | GET /api/invoice/{inv_}[.fragment/.pdf] public bearer; POST /api/invoice/{inv_}/email (any `to`, max 5) |
| credit note token (cn_) | receipts `creditNoteUrls` | M, gm, P | GET /api/credit-note/{cn_} public |
| certificate id (20 hex) | V2 certs list, public verify | P, M, ga; anyone holding it | GET /api/v2/verify/{id} (public: game, ticket, prize, hash, chain); GET /v2/certs/{id}.html (key needed, names only non-AI) |
| key id (first 10 hex of hash) | GET /api/org/keys (all rows incl scoped), /v2/keys, team lists, POST make | M (account), own gm key, H team view (ids) | POST /api/org/keys/revoke (org-wide); POST /v2/keys/revoke (scope_eid=eid; also matches host_id prefix); POST /api/org/team/retire; none can authenticate with it |
| ticket pid, device | POST join response, player cookie | the player; organizer lists | all public ticket routes: claims, bogey, vote, won, over, confirm, myprizes, leave, datareq, invites, presence (pid + device); GET /v2/claimreview/note?pid= public (reasons only) |
| personal join token | people invites, `/j/{token}` link | the person | GET /j/{token}; join body `token` |
| invite code (join `from`) | invites | players | join body `from`; includes first 7 hex of host/cohost key hash (leak of hash prefix) |
| support ticket id (n) | POST /api/v2/support | organizer / game key | GET /api/v2/support/{n} (scopeSql limits) |
| handover request id (n) | POST /v2/host/handover | host, organizer | POST /v2/host/requests/{n} approve (M) mints a new lh key |
| report link (`report.html?e=&k=`, `/api/report/{eid}?k=`) | GET/POST reportlink | M, gm, **H via AI link**, lh? ; ai/ga get null | GET /api/report/{eid}?k=&part=people (names + mobiles, public, key in query) |
| pay link (48 hex) | POST /api/z/{id}/paylink | M, H, C, gm | GET /api/paylink/{t}; POST /api/paylink/{t}/checkout; body `link` on /api/proforma |
| demo-pass token (32 hex) | /api/owner/prospect-links | P | POST /api/start body pass, /api/auth/email body pass, POST /api/pass body token |
| help desk link token (`hdlink|`) / approval token (`hdpub|`) | invite, request-publish (mailed) | helper / organizer | GET accept/info?t=, POST accept, POST stop body t, GET approve/info, POST approve/start (mints ctk_ master 30 min), approve/done |
| sign-in link token (48 hex) | auth/email mail | e-mail owner | POST /api/auth/link body token (mints ctk_) |
| partner key ctp_ | enroll/verify, signin | partner | header x-partner on /api/partner/me, /api/helpdesk/* |

## Credential entry points other than the header

All of these take a key, key-derived value or bearer token from the body, query, path or cookie, not from x-organizer / Bearer, so scopeGate does not see them.

1. `/ai/<key>/...` path: KEY in the path (A and H only, rewritten into a header; scopeGate still applies afterwards because the rewrite is gated). Also query `_method`, `_body` give a GET the power to write.
2. `POST /api/auth/google` body `hostKey` (a cth_ KEY in the body). It calls authOfKey UNGATED and requires `scope_eid IS NULL` and `expires_ms` null before confirmHostEmail and mintDeviceKey. Scoped lh keys are rejected by that check only; check the code path stays so.
3. `POST /api/helpdesk/approve/start` body `t`: public, no header. Returns a ctk_ MASTER key (30 min). The approval token is the only protection.
4. `POST /api/helpdesk/accept` / `stop` body `t`, `GET /api/helpdesk/accept/info?t=`, `approve/info`: help desk TOKENS in body/query.
5. `POST /api/auth/link` body `token`; `POST /api/auth/verify` body `code`; `POST /api/auth/email` body `pass`; `POST /api/start` body `pass`; `POST /api/pass` body `token`: sign-in link, code and demo-pass tokens.
6. `GET /api/report/{eid}?k=&part=people&i=`: report key in the query, returns names and mobiles; no header check at all. Report link also leaks through URL history, logs and Referer.
7. `/api/paylink/{token}[/checkout]`, `/api/proforma` body `link`: pay link TOKEN. `/api/payments/{pay_id}/*`, `/api/payments/verify` body paymentId: payment id TOKEN. `/api/invoice/{inv_}`, `/api/credit-note/{cn_}`: bearer invoice and credit-note tokens.
8. `/api/checkout`, `/api/proforma`: key read from `x-organizer` header ONLY (not Authorization Bearer) and only unscoped rows (`scope_eid IS NULL`); a scoped key is treated as a guest here (no gate involved).
9. Ticket routes: body or query `pid`, `device`, `me` (query on people/me, body `me`), header `x-ct-pid`. Join body `token` (personal link) and `from` (invite code that embeds first 7 hex of a host/cohost key hash).
10. `GET /api/v2/claimreview/note?pid=`, `GET /api/v2/verify/{id}`: public by id.
11. `x-partner` (ctp_ partner key), `x-inbound-secret`, `x-cron-key`, `x-runner-key` (test login), `x-owner-stats-key`, `svix-*` headers, Razorpay signature: other headers, separate secrets.
12. `GET /api/beacon/{64hex}/public/...`: beacon token in the path.
13. `zc.html?k=<key>`: the host/AI console links put the KEY in the URL query (`/zc.html?k=<aiKey>`, `/zc.html?k=<key>&e=`). The worker does not read it, the page JS does; the key lands in browser history and any Referer. Returned by `GET /api/helpdesk/me`, `POST /v2/host`, `POST /api/org/host`.
14. Cookie: no key is read from a cookie by the worker as far as read (? grep for `cookie` in worker.ts/ai-link.ts to confirm; the device id for guests may live in a cookie).

## Key-minting and key-promoting flows

What a **scoped** key becomes is given per flow.

| Flow | What it does to organizer_key | Scoped key becomes |
|---|---|---|
| createOrganizer (POST /api/start, /api/host/become-organizer, new-org payments, POST /api/org) | INSERT ctk_ master and cta_ ai for a new org; may return in the body (/api/start) | Not reachable by a scoped key: /api/start and /api/host/become-organizer are not /api/z/{scopeEid}/ paths and not in OPEN_OK, so scopeGate returns 403 key-scope. |
| signInResult (auth/verify, auth/link, auth/google) | INSERT fresh ctk_ master | n/a, the caller has no key |
| mintDeviceKey (hostsetup.ts) | `INSERT INTO organizer_key(...) SELECT ... FROM organizer_key WHERE hash=hid` copies scope_eid, scope_kind, scope_src, host_id etc but **not expires_ms** | a scoped copy stays scoped (scope gate still bounds it) but loses any expires_ms; a Host key row with expires_ms (24h temp key) becomes a NON-expiring device key (check: helpdesk approve/done then sets expires_ms) |
| confirmHostEmail (hostsetup.ts, via host setup and auth/google host intent) | UPDATE email_sealed on all rows where hash=hid OR host_id=hid, upserts host_state and host_login, then mintDeviceKey | a lh key cannot reach host setup routes (gate), only via google `hostKey` body path with scope_eid IS NULL check |
| POST /api/org/ai, /ai/replace | revoke other ai keys (except created_by 'd'), INSERT new cta_ lasting + 24h temp key mailed | Not reachable by a scoped key (403 key-scope). A gm key cannot call it. |
| POST /api/org/host | INSERT cth_ (sealed email+pii, host_id=hash) + 24h temp host key mailed | not reachable by gm (blocked) |
| POST /api/org/host/link | `UPDATE organizer_key SET hash=?, host_id=?, created_ms=? WHERE hash=?` on an unverified host row (no scope_eid filter) | an lh row has verified_ms, so 409; any scoped row without verified_ms (? check other scoped inserts: gm/ga rows are kind master, not host rows) would be re-keyed and keep its scope |
| POST /api/org/cohost | INSERT ctc_ (sealed pii, eid) | gm cannot reach (/api/org blocked) |
| POST /api/z/{id}/rehearsal (copyCohosts) | INSERT NEW ctc_ cohost key (unscoped) for each active cohost of the real game | **fixed (f233d52): a gm or ga key is refused here; only the organizer's account key makes a practice game** |
| POST /api/z/{id}/clone | cloneGame: no key copying. With gm key: INSERT new ctg_ gm key for the NEW game (insertGameKey, scope_src = old game) | **gm key -> new gm key for a new game; its 24h clock starts from the new game's end, so a chain of clones extends access indefinitely; withPeople:true moves personal data into the new game under the new key** |
| POST /api/z/{id}/v2/keys | INSERT ctg_ gm or ga | only an account M (gm refused) |
| POST /api/z/{id}/v2/host | INSERT cth_ lh (no expires_ms) | an account M or **gm** key can make lh Host keys (up to 5) |
| POST /api/z/{id}/v2/host/requests/{n} approve | revoke old host keys, INSERT new lh key | M (organizer) only |
| POST /api/z/{id}/v2/host/stepdown | revoke own keys | lh -> revoked |
| POST /api/helpdesk/accept | INSERT cta_ (created_by 'd') sealed in helpdesk_link | M only |
| POST /api/helpdesk/approve/start | INSERT ctk_ MASTER 30 min, created_by 'dp' | public caller with the approval token gets an account-wide master key |
| POST /api/helpdesk/approve/done | INSERT desk Host identity, mintDeviceKey then `UPDATE organizer_key SET expires_ms=now+24h WHERE hash=?` | a 24h Host key mailed to the helper |
| POST /api/org/team/retire | revoke host/cohost rows (hash or host_id), null pii/email | n/a |
| cancel.ts eraseCohostsSql | `UPDATE organizer_key SET revoked=1, label=NULL, pii=NULL WHERE eid=? AND ...` | removes cohost keys on game erase/cancel |
| v2Purge (v2.ts:92) | `UPDATE organizer_key SET revoked=1 WHERE scope_eid IS NOT NULL AND revoked=0 AND (...)` 24h after end, deletes orphans | the scoped-key killer; runs on lifecycle tick |
| Pay fulfil (pay.ts:231) | INSERT ctk_ master for a new-organizer payment; key is MAILED with invoice, never returned | n/a |
| POST /api/checkout, /api/proforma | only reads unscoped keys | scoped key is ignored (treated as guest) |

### Gaps and things to verify (marked ?)

- Several rows marked `?` (who, logo, schedule, beacon, helpdesk join/body fields, org host/link body field, team replace): re-read the handler to fill them.
- `x-cb-link` versus `x-ct-link` in owner routes.
- Whether any code path reads a key from a cookie.
- Whether `copyCohosts` should skip scoped callers or give the new Co-host keys an expires_ms.
- Whether prizes GET gives full names and phones to gm keys (code says only ai, lh, host-via-link are reduced).
