# 04 - API reference (every HTTP route)

Derived from reading `apps/edge/src/worker.ts` (the router), `pay.ts`, `partners.ts`, `mode.ts`, `visits.ts`, `audit.ts`, `lifecycle.ts`, `winners.ts`, `pages/functions/api/telemetry.ts`, `apps/cron/src/index.ts`. Line numbers are for the working tree of 2026-10-07 (other agents are editing `worker.ts`; search by the quoted route string if a line has moved).

## 0. Conventions

### 0.1 Credentials

| Abbrev | Credential | How sent | Table / secret |
|---|---|---|---|
| **PUB** | none | - | - |
| **PART** | participant: knows their own `pid` (and for prize routes also their device id) | in the JSON body or query | `participant` / `seat` |
| **M** | Organizer master key `ctk_<48 hex>` | header `x-organizer: <key>` or `Authorization: Bearer <key>` | `organizer_key.kind='master'` |
| **AI** | Organizer's AI key `cta_<48 hex>` | same headers, or inside the address `/ai/<key>/...` | kind `ai` |
| **H** | Host key `cth_<48 hex>` | same headers, or `/ai/<key>/...` (narrow rights, "H-link") | kind `host` |
| **C** | Co-host key `ctc_<48 hex>` | same headers (the AI link does **not** accept it) | kind `cohost` |
| **PLAT** | platform (owner) key | same headers; equals secret `ORGANIZER_SECRET` | env |
| **PARTNER** | partner key `ctp_<40 hex>` | header `x-partner` | `partner.key_hash` |
| **CRON** | job key | header `x-cron-key` (must equal `CRON_KEY`, >= 16 chars) | env |
| **MAIL** | inbound mail secret | header `x-inbound-secret` | `INBOUND_SECRET` |
| **TOKEN** | secret inside the URL | path/query | report key, invoice token |

`authOf` (`worker.ts:384`) reads `x-organizer` first, then `Authorization: Bearer`. A key that is revoked or expired (`expires_ms <= now`) is "unknown". A Host key used through the AI link (header `x-ct-link: 1`, set by the AI-link wrapper) gets `viaLink = true` and the narrow rights (`HOST_ACTIONS`, `worker.ts:399,470`).

Ability tests used below (`worker.ts:394-396`):
- **can(e)** ("team"): PLAT, or key of the same org of kind M / AI / H (not C).
- **can(e, master)** ("person"): PLAT, or same-org M, or same-org H when not via AI link. **Never AI, never C.**
- **canAi(e)**: PLAT, M, AI, or H (console). Used by `mark` and `unbind`.
- A Host via the AI link additionally passes only the actions in `HOST_ACTIONS` = `participants, summary, results, info, announce, prizes, prizegiven, reportlink, life` (`worker.ts:963`); every other `/api/z/{id}/...` answers 403.
- A **Co-host** is refused (403) everything except: payment routes (handled before the gate), `GET /api/whoami`, `GET /api/notices`, `GET /api/z/{id}/cohost` (`worker.ts:505`), and (Phase 2) its OWN list under `/api/z/{id}/people*` and `/api/z/{id}/waiting*` (section 4.5).

### 0.2 Common behaviour

- **Order of routing** inside `route0` (`worker.ts:484`): ai-manifest, mode routes, `/api/v/b`, owner visit reports, `/api/report/<eid>`, **payment routes**, Co-host gate, partner routes, schedule, start/auth, org routes, whoami, owner audit, org/close, control, suggestions, engagements (`POST /api/z`, history), inbound-email, notices, lifecycle/purge, then the per-engagement action regex.
- **Body**: JSON, max 4,096 characters unless stated (`body()` `worker.ts:164`); a larger or invalid body is read as "no body" and answers a validation error (finding F-09: the message can be misleading).
- **CORS**: every answer carries `access-control-allow-origin: *` etc. (`CORS`, `worker.ts:193`); `OPTIONS` answers 204. Headers allowed: `content-type, x-organizer, x-partner, authorization, x-ct-vid, x-ct-vs`.
- **Errors**: JSON `{"error": "<plain sentence>"}` with 400 validation, 401/403 refused (`deny()` words depend on the role, `worker.ts:397`), 404 unknown, 409 conflict/state, 413/429 limits, 503 busy (daily write guard `spend`) or not configured (`STRICT_KEYS` missing secrets).
- **Write cost** = the `spend(n)` argument = rows charged against `DAILY_WRITE_BUDGET` (80,000 default). `-` means the route writes nothing or does not call `spend`.
- **Audit**: every request passes through `route()` (`worker.ts:468`): AI-key and Host-link calls are written to `ai_audit`; every classified request is also appended to the hash-chained `audit_log`. A key presented on an unknown route never appears in logs (only its first 10 hash hex = `key_id`).
- **Daily housekeeping** runs on the first `POST /api/z` or `GET /api/history` of each UTC day (`worker.ts:371`) and a lifecycle nudge runs at most once a minute per instance on organizer-side requests (`:370`).
- `cache-control: no-store` on JSON; public cacheable exceptions: `control` (`max-age=3`), `seats` (`max-age=20`), `notices` (`max-age=300`).

### 0.3 Route matching of engagement actions

`/api/z/{id}/<action>` with `{id}` 4-40 chars of `A-Za-z0-9_-` and `<action>` one of  
`join, claims, settle, results, info, participants, erase, reuse, roster, settings, publish, summary, announce, unbind, seats, names, mark, won, over, invites, life, vote, confirm, prizes, prizegiven, myprizes, reportlink, person, forget, cohost, cancel-preview, cancel` (`worker.ts:939`). `control` has its own matcher (id 3-40, `worker.ts:742`). Unknown id -> `404 {"error":"No such engagement."}`; unmatched path -> `404 {error, hint}`.

---

## 1. AI work link (`/ai/...`) - served by `aiLink()` `worker.ts:294`

All answers carry `x-robots-tag: noindex, nofollow`, `referrer-policy: no-referrer`, `cache-control: no-store`, `x-content-type-options: nosniff`. A mistyped, unknown, revoked, expired or wrong-kind key (including `ctk_`, `ctc_`, the platform key) answers the identical `404 text/plain "Not found."` (`linkGone`, `worker.ts:287`). Only keys matching `^ct[ah]_[0-9a-f]{48}$` (`LINK_KEY`) are looked at.

| Method + path | Auth | Returns | Side effects / cost | Handler |
|---|---|---|---|---|
| `GET|HEAD /ai/<key>` | AI or H (via key in address) | complete manual for the role as `text/plain` (`?format=json` for JSON) from `manualText/manualJson` | writes `ai_audit` row; `noteUse` may alert organizer by mail on new place | `worker.ts:305`, `ai-link.ts:91` |
| `GET|HEAD /ai/<key>/start` | AI or H | short "front door" text | audit as above | `:316`, `frontDoorText` `ai-link.ts:214` |
| `GET|HEAD /ai/<key>/map` | **AI only** (H gets 403 text) | every function of `FUNCTIONS` (who does it: ai / handover / human) text or `?format=json` | audit | `:328`, `ai-functions.ts` |
| `GET|HEAD /ai/<key>/facts` | **AI only** | the 10 facts + rules | audit | `:329`, `ai-facts.ts` |
| `GET|HEAD /ai/<key>/go` and `/ai/<key>/go/<step>?...` | **AI only** | guided screens: `new, time, occ, size, play, prizes, extras, review, save, games, game, links, who, gtime, gtime2, gtime3, say, say2, helper, facts` as `{say, choices[], ifWrong, done}` text/JSON | `save` performs real `POST /api/z` (+ settings PATCH) through an internal call with the key | `:338`, `ai-go.ts:77` |
| `GET|HEAD|POST|PATCH|PUT /ai/<key>/<api path>` (optionally `/ai/<key>/api/<path>`) | AI or H | the same as `/api/<api path>` with the key as `x-organizer` and `x-ct-link: 1`; refusals (4xx) for an AI add `next` (what to do instead) | everything the target route does | `:341-366` |
| `GET /ai/<key>/<path>?_method=POST|PATCH&_body=<url-encoded JSON>` | AI or H | performs a POST/PATCH for GET-only AIs; `_body` max 6,144 chars (`GET_BODY_MAX`), else 413 text; invalid JSON 400 text | as target | `:346-352` |
| `OPTIONS /ai/...` | PUB | 204 | - | `:296` |

`HEAD` is treated as `GET`. The audit rows written for these GETs use the synthetic paths `/ai/manual` (the manual) and `/ai/start`, `/ai/map`, `/ai/facts`, `/ai/go` (never the key). Opening the manual never changes anything except the audit row (test `ai-mail.test.ts` "opening the manual never changes anything"). The dispatcher for `/ai` is `handle()` `worker.ts:277-282`; non-`/ai` paths go to `handle0`.

---

## 2. Public / site routes

| Route | Auth | Request | Response | Notes / errors | Cost | Handler |
|---|---|---|---|---|---|---|
| `GET /api/mode` | PUB | - | `{mode:"TEST"|"LIVE"}` | any other method 404 | - | `mode.ts:100` |
| `GET /api/whoami` | any valid key (M, AI, H, C, PLAT) | - | `{kind: "master"|"ai"|"host"|"cohost"|"platform"}` | 403 with role message if no/unknown key | - | `worker.ts:654` |
| `GET /api/notices` | PUB (also C) | - | `{notices:[{id,title,body,url?,at}]}` newest 10 younger than 30 days; `cache-control: public, max-age=300` | read by `pwa.js` | - | `:916` |
| `POST /api/notices` | PLAT | `{notices:[{id (2-40 chars), title (<=80), body (<=200), url? (path starting /)}]}` max 10 | `{ok,count}` | 400 on shape; body limit 8,192 | 1 row (no spend) | `:920` |
| `GET /api/z/schedule?at=<ISO with zone>` | PUB | `at` e.g. `2026-10-03T16:00:00+05:30` | `{ok, startRound, startMs, startsInMinutes, startsAtIST, error?}` | 400 if not parseable; `ok:false` + error if in the past. Known issue F-06: no-zone input is read in server zone | - | `:512` |
| `GET /api/z/ai-manifest` | PUB | - | `AI_MANIFEST` JSON: how, role, conversation, packs, choices, `you_can[]`, `payment_faq[]`, `you_cannot[]` | | - | `:488`, `AI_MANIFEST` `:413` |
| `POST /api/v/b` | PUB (same-origin only) | visit beacon (see `visits.ts:112` `parseBeacon`): `{sid,vid,gpc,landing,ref,utm,partner,dv,lang,evs:[{k:pv|sec|act|exit,p,n,v,m,x,num}]}`; `BEACON_MAX_BYTES 6000`, <= 20 events, `PUBLIC_PATHS` only | always `204` (405 for non-POST, 403 cross-site/origin, 413, 429, 4xx by parse) | Never inside the game. GPC/DNT visitors only bump anonymous counters. TEST mode keeps visits `is_test=1` | 2 per event + 2 (own cap `VISIT_DAILY_WRITES` 20,000 and shared guard) | `visits.ts:160`, wired `worker.ts:490` |
| `POST /api/telemetry` | PUB | `{e:[{k:pv|vital|err|api|res, p, n, v, d}]}` max 30 events | `204` | Pages Function with its own D1 table; 5,000 events/day cap | n | `pages/functions/api/telemetry.ts` |
| `GET /api/telemetry?days=7` | `Authorization: Bearer <REPORT_KEY>` | - | plain-text monitoring report | 404 if key missing/wrong | reads | same file |
| `GET /api/report/{eid}?k=<key>&part=people&i=<n>` | TOKEN (`k` = HMAC of engagement id + salt) | no `part`: `{base, totalPeople, chunks, chunkSize:250, partSize:1500}`; `part=people&i=n`: `{people:[...]}` 250 at a time | 403 `{error}` bad key; 404 `{code:"gone"}` after 22 h or not ready | sets `kv rptopen/<eid>` once | 1 (no spend) | `lifecycle.ts:227`, wired `worker.ts:502` |
| `GET /api/invoice/inv_<32 hex>` | TOKEN | - | invoice as `text/html` (`x-robots-tag: noindex`) | 404 JSON if unknown | - | `pay.ts:249` |
| `GET /api/credit-note/cn_<32 hex>` | TOKEN | - | an OLD GST credit note (issued with a refund before spec 6) as `text/html` (`x-robots-tag: noindex`). **No new credit notes are made any more** (there are no refunds); the route stays so old links keep working | 404 JSON if unknown | - | `apps/edge/src/pay.ts` |
| `GET /api/payments/status` | PUB | - | `{mode:"razorpay"|"test"|"off", siteMode, freeLaunch, freeCap:100, brand, legalEntity, missingCompanyDetails[], international}` | | - | `pay.ts:171` |

---

## 3. Sign-in and account (organizer-side, no engagement id)

| Route | Auth | Request | Response | Errors / rules | Cost | Handler |
|---|---|---|---|---|---|---|
| `POST /api/start` | PUB | `{email}` | `{ok:true, token, aiKey, aiMessage}` (token = new master key `ctk_...` for the console; `aiKey` = lasting `cta_` key; `aiMessage` = the 2-line paste) **or** `{ok:true, exists:true}` if the e-mail already has an account | 400 invalid e-mail; 429 after 10 new accounts per address per day; 503 busy. Creates account, master + AI key (flagged `is_test` in TEST mode), seals e-mail (`orgmail/`), seals AI key (`aikey/`), records Terms, links earlier visits, sends **one** dedicated mail with a separate 24 h AI key. Known issue F-05: `exists:true` reveals that the e-mail has an account | 6 | `worker.ts:518` |
| `POST /api/auth/email` | PUB | `{email}` | `{ok:true}` (same answer for known/unknown e-mails; in TEST mode `devCode`, `devToken` are returned for the known one). An Organizer gets the sign-in mail (code + one-click link); a **Host with a confirmed e-mail** gets a plain code mail (no link, no AI options) | 429 after 5 codes per hour per address; 503 busy. 6-digit code (10 min) | 2 | `worker.ts` |
| `POST /api/auth/verify` | PUB | `{email, code}` | Organizer: `{ok:true, token}` (new master key; old ones keep working). Host (when the e-mail is not an Organizer's but a confirmed Host's): `{ok:true, token, kind:'host', ready}` - a new key for this device of the same Host | 400 if wrong/expired/5 attempts used | 2 | `worker.ts` |
| `POST /api/auth/link` | PUB | `{token}` (48 hex from the mail link) | `{ok:true, token}` single-use; the GET of the link (mail scanner) consumes nothing | 400 invalid; 429 after 20 bad tries per address per day | 2 | `:564` |
| `GET /api/auth/config` | PUB | - | `{google: <GOOGLE_CLIENT_ID or null>}` - the pages show "Continue with Google" only when it is not null | | - | `worker.ts`, `google.ts` |
| `POST /api/auth/google` | PUB | `{credential (Google ID token), intent: 'signup'\|'signin'\|'host', hostKey? (only for 'host': the Host's link key)}` | signup: `{ok, token, aiKey, aiMessage, created:true}` (new Organizer for that verified e-mail) or `{ok, token, created:false}` (account already exists); signin: `{ok, token, created:false}` for an Organizer, or `{ok, token, kind:'host', ready}` for a Host with a confirmed e-mail; host: `{ok, token, kind:'host', ready, needMobile}` (the e-mail step of the Host first open; the link key is spent and `token` is the key for this device) | **404 when no client id is configured**; 400 `google-failed` (token not valid: signature checked with Web Crypto against Google's keys, `iss`, `aud` = our client id, `exp`, `email_verified`), 400 `host-link-gone` (link used, expired or not a Host link), 403 `email-mismatch` "This link is for a***@acme.com" (Host's Google e-mail differs from the one they were added with), 404 `no-account` (signin with an unknown e-mail), 429 after 20 failures per network per day (the same counter as the sign-in link) or 10 new accounts per network per day. Stores the e-mail only | 2 (3 for host, 6 for a new account) | `worker.ts`, `google.ts` |
| `POST /api/org` | PLAT | - | `{ok:true, organizerKey}` shown once | 403 otherwise | 1 | `:608` |
| `GET /api/org/keys` | M | - | `{keys:[{id (first 10 hex), kind, revoked, created_ms, thisOne}]}` never the keys | 403 non-master | - | `:637` |
| `POST /api/org/keys/revoke` | M | `{id}` (10 hex) | `{ok, revoked}` | 400 bad id; 409 if it is the key in use | 1 | `:643` |
| `POST /api/org/ai` and `POST /api/org/ai/replace` | M only | - | `{ok, aiKey, aiMessage, mailed}` - revokes every AI key (lasting + 24 h) and issues a new lasting one + a fresh 24 h key by mail | 403 for AI/H/C | 3 | `:615` |
| `GET /api/org/ai/link` | M only | - | `{ok, aiMessage}` (the lasting link, or `null` if revoked) | | - | `:623` |
| `POST /api/org/ai/fresh` | M only | - | `{ok, mailed, expiresMs, aiMessage?}` new 24 h AI key e-mailed | 429 if >= 5 live 24 h keys | 3 | `:630` |
| `POST /api/org/ai/revoke` | M only | - | `{ok, revoked}` | | 1 | `:733` |
| `GET /api/org/ai/audit` | M, AI, PLAT | - | `{trail:[{at_ms,eid,key_id,method,path,status,ip,ua,country}]}` newest 300 (PLAT sees `org` too) | 403 for H and C | - | `:694`, `winners.ts:145` |
| `POST /api/org/close` | M only | `{confirm:true}` | `{ok, closed:true, engagementsDeleted:n}` deletes account and every engagement; payments/invoices/commissions stay | 400 without confirm; 409 if a game is running | 8 + 4 x engagements | `:717` |
| `GET /api/history[?mode=test]` | any org key except C; PLAT | - | `{engagements:[{id,created_ms,start_round,call_seconds,closed,draft,participants,startsAtIST}], retentionDays:365}` (max 50, newest first); PLAT sees real ones unless `mode=test` | 403 | - (runs daily housekeeping) | `:881` |

### 3.1 Team (roles) routes

| Route | Auth | Request | Response | Rules | Cost | Handler |
|---|---|---|---|---|---|---|
| `POST /api/org/host` | **M** (an AI key gets 403) | `{label?, email?, mobile?}` - **at least one of e-mail or mobile** (e-mail valid; mobile a valid number, kept sealed); `label` cleaned, <=40 chars | `{ok, hostKey, link, manualUrl, mailed, emailed, id, label, expiresMs, email?, mobileMasked?, waLink?}` - `link` = `<origin>/zc.html?k=<cth_...>`, the Host's one-time first-open link (works 7 days, only until the Host's e-mail is confirmed); with an e-mail it is **e-mailed to the Host** (never to the Organizer); with a mobile `waLink` is a `https://wa.me/<number>?text=...` link that opens WhatsApp with the link ready to send (the console shows a WhatsApp button, the main one when there is no e-mail); `mailed` is the Organizer's dedicated Host AI-link mail (24 h key) | 400 neither given / bad e-mail / bad mobile; 409 more than 5 Hosts | 4 | `worker.ts` |
| `POST /api/org/host/link` | **M only** (AI key 403, Host 403) | `{id}` (10 hex, from the team list) | `{ok, link, hostKey, id, label, emailed, expiresMs, mobileMasked?, waLink?}` - a NEW first-open link; the old link stops at once and the Host's `id` changes | 404 not on team; 409 `host-active` once the Host has confirmed an e-mail (they sign in with it); 400 bad id | 4 | `worker.ts` |
| `GET /api/host/setup` | **H only** (a Host key; Organizer, AI, Co-host get 403) | - | `{needEmail, needMobile, emailMasked?, mobileMasked?, ready}` | | - | `hostsetup.ts` |
| `POST /api/host/setup/email` | **H only** | `{email}` | `{ok:true}` (TEST mode: `devCode`); a 6-digit code (10 min, 5 tries, 5 codes an hour) is mailed to that address | 400 bad e-mail; 409 `email-mismatch` "This link is for a***@acme.com" (the Organizer gave another one) or `already-verified`; 429 | 3 | `hostsetup.ts` |
| `POST /api/host/setup/email/verify` | **H only** | `{code}` | `{ok, token, kind:'host', ready, needMobile}` - the e-mail is confirmed, the link key is spent, `token` is the key for this device (the console must store it and drop the link key); sign-in by e-mail is now possible | 400 wrong/expired code | 3 | `hostsetup.ts` |
| `POST /api/host/setup/mobile` | **H only** | `{mobile}` (typed, not verified, sealed) | `{ok, mobileMasked, ready, needEmail}` | 400 bad number; 409 `already-set` once ready | 2 | `hostsetup.ts` |
| `GET /api/org/team` | M, AI, H (not C) | optional `?e=<game id>` | `{maxHosts:5, hosts:[{id,label,createdMs,setup:'ready'\|'needs-mobile'\|'waiting-for-host'\|'link-expired',emailConfirmed,hasMobile,linkExpiresMs?,email?}], cohosts:[{id,label,createdMs,eid,phoneMasked?,brought}]}` never keys; `id` = first 10 hex of key hash; a Host's device keys are not listed. `email` and `phoneMasked` (`******` + last 4) are shown to M and H only, never to AI. With `?e=` only that game's Co-hosts | | - | `worker.ts`
| `POST /api/org/cohost` | **M, H** (an AI key gets 403: it must not handle a mobile number) | `{label (the Co-host's name, >=2 chars), phone (valid mobile, 10-15 digits), e (game id of this account)}` | `{ok, cohostKey, link, id, label, eid, phoneMasked}`; `link = <origin>/zc.html?k=<ctc_key>` | unlimited; 400 missing name / bad mobile / game not this account's; 409 game cancelled. No e-mail is asked or stored. Name in `label`, mobile sealed in `organizer_key.pii`; the key is **bound to that game** (`organizer_key.eid`): its header, invite link and payment work for that game only. Name and mobile are erased (key retired) with the game's participant data (23 h rule / `POST /erase`) or at cancel | 2 | `:673` |
| `POST /api/org/team/retire` | **M** (Hosts and Co-hosts), **H** (Co-hosts only) | `{id}` (10 hex) | `{ok, revoked:1}` | 404 not on team; 403 if H retires a Host; 409 own key; 400 bad id. The key stops at once; the Host's stored e-mail / the Co-host's sealed mobile are cleared | 1 | `:681` |

---

## 4. Engagement routes

`{id}` is the engagement id. "draft" = `pack=0` and not published; "unpaid" = `pack=0` and published; see `00-OVERVIEW.md`.

### 4.1 Create, list

| Route | Auth | Request | Response | Rules / errors | Cost | Handler |
|---|---|---|---|---|---|---|
| `POST /api/z` | M, AI, PLAT (**H and C refused**) | `{id (4-40), startRound (int), callSeconds (int, multiple of 3, >= 6), cap (1..100000), closed?, tickets?, rewards?, breaks?, rounds?, opening?, closing?, name?}` | `{ok, draft, openUrl}`; already existing id: `{ok:true, existed:true}` (never overwrites, never reveals owner) | 400 `Check the engagement details.` or the `validateCfg` reason; 409 when 10 drafts (`MAX_DRAFTS`); no payment needed: saved as a **draft** unless the org holds an unused **entitlement** big enough (then paid at once) or caller is PLAT. Test-mode accounts get `is_test=1`. Records Terms version | 2 | `:855` |

### 4.2 Participant-facing (PUB or PART)

| Route | Auth | Request | Response | Errors / rules | Cost | Handler |
|---|---|---|---|---|---|---|
| `GET /api/z/{id}/info` | PUB | - | `{startMs, cap, startRound, callSeconds, trackClaims, controlUrl, tickets, rewards, breaks, rounds, invites, opening, closing, name?, brand?, draft?, unpaid? (only to team), locked?, cancelled?, message?, whoCanJoin, waitingFor: "organizer"|null, didNotStart: boolean, erasureMs, credit: number|null, creditExpiresMs: number|null, creditApplied: number|null}` | draft: 403 unless the caller is on the team. `locked:true` = published, unpaid, within 45 s of / past start (phones hold); `waitingFor:"organizer"` is the same moment, in the words of spec 5 ("Waiting for the Organizer or Host to start the game."). `didNotStart:true` + `message:"This game did not start. Your details have been erased."` after the closing. `erasureMs` = when guest data is (was) erased (scheduled end + 23 h, newest schedule). `credit` = the active credit total of the account, only for a caller who may pay (M, H, a Co-host of this game) on an open unpaid game, else `null` (an outside caller never learns it); `creditApplied` = part of it already put on THIS game | - | `apps/edge/src/worker.ts` |
| `POST /api/z/{id}/join` | PUB | `{phone, name?, device (16-64 hex), from?, cat?}`; **`from`** = inviter's seat number, or `1000000000 + <7 hex of co-host key id as integer>` for a Co-host link | `{pid, startRound, callSeconds, trackClaims, ...public settings, jr, again?}` | 400 invalid mobile (10-15 digits)/no device; 403 draft / invite-only (`closed`) and number not on list; 409 full, `device-used`, `invite-full`; 423 `other-phone` (ticket bound to another device); 429/503 `busy` (per-address and budget caps). Same number twice = same participant (`again:true`). Ticket = seat order. One ticket per phone (device hash) | 2 (+2 kv counters) | `:978` |  **Phase 2:** also `{token?}` (a personal link: no number needed); `from` may be the Organizer/Host/Co-host/guest code (`people.ts` `parseFrom`). A number on a list is placed under its real inviter; an unlisted number waits (`whoCanJoin` "list": 403 `{waiting:true, wid, code:"waiting"}`) or joins at once under the link owner up to their limit (over it: 409 `{code:"invite-full", waiting:true, wid}`). A removed person gets 403 `{code:"removed"}`; a used personal link 423 `{code:"link-used", needPhone:true}`; a dead link 404 `link-gone`.
| `GET /api/z/{id}/seats?after=<seq>` | PUB | - | `{ready:false}` before the game begins (start + 2 min), else `{ready:true, seats:[[seq,pid,jr],...], upto}`; the first full read is stored once in `kv seats-base/<id>` and served as-is (`cache-control: public, max-age=20`) | 403 draft. No names, no numbers | 1 first time | `:1029` |
| `POST /api/z/{id}/claims` | PART (`pid`) | `{pid, claims:[{pattern, idx (0-89), round?}]}` max 7 | `{ok, stored}`; `{ok, stored:0, tracked:false}` when cap > 500 | 403 not a participant; ignores invalid; 503 `Busy day` | 1 per stored | `:1081` |
| `GET /api/z/{id}/results` | PUB | - | `{results:[{pattern, ordinal, round, idx, count, winners? (lucky draw only: opaque pids)}]}` | | - | `:1099` |
| `GET /api/z/{id}/invites?pid=` | PART | - | `{on, per, used, unlimited, canInvite, seat, cats}` | 403 unknown pid | - | `:1199` |
| `POST /api/z/{id}/vote` | PART (`pid`) | `{pid, results:[{pattern|"lucky", ordinal 1-5, round, idx 0-89, pids:[...]}]}` 1-3 results, body <= 65,536 | `{ok, counted, accepted, done[], need}` | 400/403; ignores invalid/already-settled; when `quorumFor(people)` identical digests: inserts `settled`, `winner`, `prize` rows. **Known F-01**: only the pid proves who is voting | 3 per result | `:1231`, `winners.ts:31` |
| `POST /api/z/{id}/over` | PART (`pid`) | `{pid}` | `{ok, counted}` | counts only after 20 numbers' time; `min(3, ceil(people/2))` votes end the game early (`life.end_src='phones'`) | 1 | `:1214`, `lifecycle.ts:93` |
| `POST /api/z/{id}/won` | PUB | anything | `{ok:true, stored:0}` (stub kept for older cached pages) | | - | `:1213`, `lifecycle.ts:88` |
| `POST /api/z/{id}/settle` | anyone | - | **always 403** "Winners are decided by the software..." | nobody can post a result | - | `:1215` |
| `POST /api/z/{id}/confirm` | PART (`pid` + `device`) | `{pid, device, name, phone}` | `{ok, changed}` winner confirms prize hand-over details; every change kept in the sealed trail | 403 not that phone; 404 no reward; 400 name/phone | rows+1 | `:1232`, `winners.ts:77` |
| `GET /api/z/{id}/myprizes?pid=&device=` | PART | - | `{prizes:[{round,pattern,ordinal}], name, phone, confirmed}` | 403 not that phone | - | `:1233`, `winners.ts:101` |
| `GET /api/z/{id}/control` | PUB | - | the signed pause file `{pubKey,...,messages[], ann?:{id,text}, locked?}` (`cache-control: public, max-age=3`); `{registered:false}` 404 if none. Adds `locked:true` when the engagement is published, unpaid and within 45 s of start; `cancelled:true` when cancelled; `didNotStart:true` when the game closed as "did not start" | the organizer's latest announcement rides along | - | `:746` |

### 4.3 Team routes on an engagement (can(e) / can(e, master))

"team" = M, AI (unless noted), H(console), PLAT. "person" = M, H(console), PLAT.

| Route | Auth | Request | Response | Rules / errors | Cost | Handler |
|---|---|---|---|---|---|---|
| `GET /api/z/{id}/cancel-preview` | PLAT, **M, H** (console; not via the AI link) | - | `{canCancel, reason?, paid, cancelled?, credit: {amountInr, expiresMs} | null}` | **No refunds (spec 6).** `credit` = what the account would be left with: the amount paid for the game (plus any credit that had been applied to it, with its own expiry), `expiresMs` = when it lapses (the earliest of its parts). `canCancel:false` + friendly `reason` when already cancelled, closed as "did not start", or paid and the start time has passed ("use End the game"). Unpaid game: `credit:null`, any time (credit that had been applied to it would come back) | - | `apps/edge/src/cancel.ts` (`cancelPreview`) |
| `POST /api/z/{id}/cancel` | PLAT, **M, H** (AI and Co-host 403) | `{confirmations: 3}` (exactly the number 3, else 400 `code:"confirmations"`) | `{ok, cancelled:true, credit:{id, amountInr, expiresMs} | null, already?}` | 409 when paid and the start time has passed. Sets `engagement.cancelled_ms/cancelled_by`; Co-hosts erased now; guests' data (and lists, waiting requests) erased 23 h after the cancel time by `lifecycleTick`; a PAID game's payment becomes `credit` (365 days from the original payment, `credit.id` is the new credit, or the first credit that got its money back); mails the Organizer and each Host (a Host's cancel says so; the payer is not mailed). No Razorpay call, no refund row, no credit note, partner commission stays. Saying it twice returns `already:true` with the same credit | 14 | `apps/edge/src/cancel.ts` (`cancelGame`) |
| `POST /api/z/{id}/clone` | PLAT, **M, H** (AI key and Co-host 403) | `{startRound?, withPeople?: boolean}` | `{ok, id, openUrl, copied: string[], peopleCopied: n, peopleNote?, needsStart: boolean, startRound, from, message}` | **"Create a new game like this one."** A new DRAFT (new id `<old>-XXXX`, pack 0) with the settings; not payment, status, guests, waiting requests, Co-hosts or personal links. Without `startRound` the date is NOT copied: `needsStart:true`, the draft is "start pending" and cannot be published or paid until `PATCH settings {startRound}` (400 `code:"start-pending"`). `startRound` is validated (future, <= 30 days ahead, else 400 `too-far`). 409 `code:"draft-limit"` at 10 unpaid games. `withPeople:true` copies the people list with NEW personal links while it still exists. Works on cancelled and closed games. Audit event `clone` | 6 (+2 per person copied) | `apps/edge/src/clone.ts` |
| `GET /api/z/{id}/cohost` | PLAT or any key of the same org; designed for **C** (a Co-host key must be bound to this game, else 403) | - | `{name, startMs, cap, joined, brought, price (INR incl. GST or null), payment:{status,paidBy?,paidVia?,paidMs?}, cancelled?, waitingFor, didNotStart, erasureMs, credit, creditExpiresMs, creditApplied, inviteLink|null}` | `inviteLink = /z.html?e=<id>&from=<1e9 + int(key id 7 hex)>` only for a Co-host and a published game | - | `:967` |
| `GET /api/z/{id}/summary` | team (H via link ok) | - | status `draft / published, payment due before the start / published and paid / cancelled by the organizer / did not start (closed)`, start (IST), settings, `payment`, `brandMomentsAllowed`, `participants`, links (console, guest, bigScreen, pay), `nextSteps`, `startsAt` + `payUntil` (the last moment to pay = the erasure time; there is no other cut-off), price, `waitingFor`, `didNotStart`, `erasureMs`, `startPending?`, `credit` (number or null), `creditExpiresMs`, `creditApplied`, a cancelled game's `cancelCredit`, `gameMinutes` | | - | `:1121` |
| `PATCH|POST /api/z/{id}/settings` | team | `{startRound?, callSeconds?, cap?, closed?, tickets?, rounds?, rewards?, breaks?, opening?, closing?, invites?:{on,per 1-4,cats[]}, name?}` - lists **replace** | `{ok, ...saved}` | 409 started (paid and start passed); 402 if cap > paid pack; 409 cap < people already on list; 400 start in the past; 400 `code:"too-far"` when the new start is more than 30 days ahead; 409 `did-not-start` once the game closed; a changed start also clears "start pending" and, for an unpaid game, moves the erasure clock; recomputes pause profile; **H may set `invites`** | 1 | `:1281` |  **Phase 2:** also `{whoCanJoin?: "list" or "anyone" (same switch as closed), guestInvites?: {on, per 1..10, cats?} (alias of invites), coHostLimit?: 10..1000}`; the answer adds `whoCanJoin, coHostLimit, guestInvites`.
| `POST /api/z/{id}/publish` | **person** (M, H console, PLAT); AI gets a hand-over | `{email, phone}` (organizer confirms contact) | AI: `{ok, published, needsOrganizer, consoleUrl|payUrl+shareUrl, message}`; person: `{ok, published:true, paid, startMs, payUrl, shareUrl, confirmed}` | 400 bad contact / start passed; already published -> `{already:true}`; consumes an unused entitlement, or `FREE_LAUNCH` for cap <= 100; mails the organizer | 4 | `:1139` |
| `POST /api/z/{id}/roster` | team except AI (AI -> 403 CONSOLE_ONLY) | `{people:[{phone, name?}]}` 1-100, body <= 32,768 | `{ok, added, skipped, invalid}` | seats without device bound; respects `cap` | 2 per person | `:1262` |
| `POST /api/z/{id}/reuse` | team (AI allowed) | `{from}` earlier engagement of the same org | `{ok, copied}` | 410 `gone` if that list was already deleted; 409 bigger than cap | 2 per row | `:1243` |
| `GET /api/z/{id}/participants?limit=&offset=` | team (H link ok) | - | `{participants:[{pid,jr,role,inv,cat}], total, offset, limit, closed, cap, ...settings}` max 2,000 per page | no names or numbers | - | `:1173` |
| `GET /api/z/{id}/names?pids=a,b` | person | up to 60 pids | `{names:{pid:name}}` | AI refused | - | `:1180` |
| `GET /api/z/{id}/claims` | team | - | `{claims:[...]}` | | - | `:1168` |
| `POST /api/z/{id}/announce` | team (H link ok) | `{text}` <= 160 chars (empty clears) | `{ok, sent:{id,text,at}}` / `{ok, cleared}` | 400 draft; 429 within 5 s of the previous; rides in the control file | 1 | `:1107` |
| `POST /api/z/{id}/mark` | canAi | `{seat|phone, role: organizer|host|co-host|none}` | `{ok}` | AI must give `seat` (else 403 CONSOLE_ONLY); 404 not joined. Marked seats may invite without a limit (the "stay out of lucky draws" claim in the code comment is not implemented, see `KNOWN-DOC-DRIFT.md`) | 1 | `:1187` |
| `POST /api/z/{id}/unbind` | canAi | `{seat|phone}` | `{ok}` clears the device so the person can move phone | AI: `seat` only | 1 | `:1070` |
| `POST /api/z/{id}/person` | person | `{phone}` | `{ok, seat, name, role}` | 404 | - | `:1048` |
| `POST /api/z/{id}/forget` | person | `{phone}` | `{ok, deleted:true}` deletes one person | 409 while the game is running | 4 | `:1048` |
| `GET /api/z/{id}/life` | team (H link ok) | - | `{endMs, endSrc, reportSent, reportState, purged, personalDeleteAtMs, fullDeleteAtMs, backupDays:7, started}` | | - | `:1207` |
| `GET /api/z/{id}/prizes` | team (H link ok) | - | `{prizes:[...]}`; for AI/H-link only ticket numbers, tick flags (no names/numbers) | | - | `:1234`, `winners.ts:114` |
| `POST /api/z/{id}/prizegiven` | team (H link ok) | `{round, pattern, ordinal, seat, given:bool}` | `{ok, givenMs}` | 404 no such reward; `given_by` is `organizer` / `co-host` (written for kind `host`) / `organizer's AI` | 1 | `:1235`, `winners.ts:129` |
| `GET /api/z/{id}/reportlink` | team | - | `{ready, sent, url}`; for AI: `url:null` plus note | | - | `:1222` |
| `POST /api/z/{id}/reportlink` | person | - | `{ok, url}` new link; the old stops | | 2 | `:1216` |
| `POST /api/z/{id}/erase` | person | - | `{ok, erased:n}` removes every participant's data now (keeps winners record, prize details, organizer details) | | n+1 | `:1236` |

### 4.5 People, links and the waiting room (Phase 2, `apps/edge/src/people.ts`, spec `docs/ROLES_AND_CONSOLE_SPEC_3.md`)

Matcher `/api/z/{id}/(people|waiting|me)` plus up to two more path words (`apps/edge/src/worker.ts`, before the single-action matcher). **Who may call:** Organizer and Host (all lists of the game); Co-host (own list; the key must be bound to this game); a level-1 guest (own list, identified by their ticket id: header `x-ct-pid`, query `?me=<pid>` or body `me`, the same trust as `/invites`; refused for a guest invited by a guest, a team seat, a removed seat, or while guest invitations are off). **An AI key, or anything arriving through an AI work link (`x-ct-link`), gets 403 on every route here.** Inviter ids: `o`, `h:<7 hex>`, `c:<7 hex>`, `s:<seat>`. A removed person's number can only come back by being added again by the Organizer or a Host.

| Route | Auth | Request | Response | Rules / errors | Cost |
|---|---|---|---|---|---|
| `GET /api/z/{id}/people` | M, H, C, guest (own list) | `?limit=` (200, max 500) `&offset=` | `{people:[{id, name, maskedPhone, status ("invited", "joined" or "removed"; "waiting" is reserved, requests are in `/waiting`), link, waLink, role?, inviter? (M/H only), approvedBy?}], limit, used, total, cap, offset, waiting, whoCanJoin, role, canExport, commonLink}` | `limit` is the caller's list limit (the game size for M/H); `used` their own list; `link` is `https://<site>/j/<token>`, null once removed | reads |
| `POST /api/z/{id}/people` | same | `{people:[{name, phone}]}` (max 200 per request) | `{added, duplicates, invalid:[{raw, why}], people:[the added ones]}` | numbers cleaned (`cleanPhone`: spaces, dashes, +91, 0, 00; 10-digit Indian mobiles start 6 to 9; other country codes kept); duplicates inside the batch dropped; a number already on any list (or in the game) is a duplicate (first wins); a waiting number is admitted by whoever lists it; M/H may put a removed person back; over the caller's limit 409 `over-limit` (nothing added); over the game size 409 `over-cap`; over 200 413 | 1 write unit per person |
| `GET /api/z/{id}/people/export` | M, H only | `?all=1` for every list | CSV: Name, Mobile (full, with country code), Personal link, WhatsApp link, Status (+ Invited by) | a cell that starts with `=`, `+`, `-` or `@` is prefixed with a quote | reads |
| `GET` or `POST /api/z/{id}/people/me` | M, H, C | `{phone?, name?}` | `{person, role, joined, pid?}` | makes the caller's OWN play seat (a personal link whose seat is flagged organizer, host or co-host automatically: stays out of lucky draws, uses no limit). The mobile comes from the publish step (Organizer) or the key (Host, Co-host); else 400 `need-phone` | 2 |
| `POST /api/z/{id}/people/{pid}/remove` | M, H any person; C and guest only their own | `{withTheirPeople?: boolean}` | `{ok, removed, during}` | before the start: the seat is deleted, the place freed, the link stops, the phone is blocked from re-joining. After the start: M/H only; the seat STAYS in the public list (`seat.blocked=1`), the phone stops, the prize shows `notGiven:"removed"` and cannot be ticked given. A team seat cannot be removed here. A Host's removal e-mails the Organizer (no names). Logged: `person.removed_by/removed_ms` and the audit log (who, when, which id) | 3 per person |
| `POST /api/z/{id}/people/{pid}/resend` | M, H any; C and guest their own | `{phone?}` | `{ok, link, waLink, unlocked}` | new token (the old link dies) and the ticket is unlocked for a new phone; `phone` changes the number only if they have not joined | 2 |
| `GET /api/z/{id}/waiting` | M, H (all); C and guest (requests that came through their link or below it) | - | `{waiting:[{id, firstName, last4, via ("personal-link", "common-link" or "direct"), at, inviter? (M/H), overLimit? (M/H)}]}` | requests use no place | reads |
| `POST /api/z/{id}/waiting/{wid}` | same | `{decision:"admit" or "decline"}` | `{ok, admitted or declined, placedUnder?}` | admit puts the person on the link owner's list (or on the approver's own when that list is full or the request came over the limit) and records `approved_by` and `approved_ms`; 404 not yours; 409 list full, game full or game ended | 3 |
| `POST /api/z/{id}/waiting/all` | same | `{decision:"admit" or "decline"}` | `{admitted, declined, stillWaiting, message?}` | every request the caller may decide, oldest first, same bookkeeping as one by one; admitting stops when the game (or a limited list) is full and the rest stay waiting with a calm message | 3 per request |
| `GET /api/z/{id}/me` | PUB | `?pid=<ticket id>` or `?wid=<request id>` | pid: `{state ("playing" or "removed"), removed, role, seat, canInvite, per, used, whoCanJoin}`; wid: `{state ("waiting", "admitted", "declined" or "lapsed"), with, message}` | no names or numbers; the phone polls this | reads |
| `GET /j/{token}` | PUB (Worker and Pages route) | - | an HTML page with Open Graph tags ("You are invited to <game>") that moves the browser on to `z.html?e=<id>&t=<token>`; unknown, removed or cancelled: a calm 404 page | the phone page must send the token as `token` in `join` | 1 read |

### 4.4 Control (pause) routes (matcher `worker.ts:742`, id 3-40)

| Route | Auth | Request | Response | Notes | Cost | Handler |
|---|---|---|---|---|---|---|
| `POST /api/z/{id}/control` | PUB (the **signature** is the authorisation) | `{message:{...signed control message}}` | `{ok, seq, duplicate?}` or error | validated by `publishControl`; mirrors to R2 if configured | 1 | `:757` |
| `PUT /api/z/{id}/control/key` | person | `{publicKey (hex), profile?:"fast"}` | `{ok}` | 409 if cap > 2000 (no pause) ; registers the signing public key and safety profile | 1 | `:767` |
| `POST /api/z/{id}/control/request` | team (AI allowed) | `{action: pause|resume|stop|erase, note?}` | `{ok, message}` | records a request the organizer approves in the console; `erase` also mails the organizer once per day | 1 | `:778` |
| `GET /api/z/{id}/control/request` | team | - | `{requests:[{id,action,note,at_ms}]}` | | - | `:791` |
| `POST /api/z/{id}/control/request/clear` | person | - | `{ok}` | | - | `:796` |
| `GET /api/z/{id}/control` | PUB | see 4.2 | | | | `:746` |

---

## 5. Payments

All handled by `payRoute` (`pay.ts:166`), **before the Co-host gate**, so any key kind M / H / C can pay; the AI key cannot.

| Route | Auth | Request | Response | Rules | Cost | Handler |
|---|---|---|---|---|---|---|
| `POST /api/checkout` | PUB (anonymous buy), or **M / H / C key** in `x-organizer` together with `eid` | `{pack (one of 100,250,500,750,1000,2500,5000,10000), email, org (>=2 chars), country?, taxId? (GSTIN), currency? INR|USD, ref? (partner code), phone? , eid?}` | Razorpay mode: `{mode:"razorpay", paymentId, razorpay:{keyId, orderId, amount (paise), currency, name, description, prefill, notes, theme}}`; test mode: `{mode:"test", paymentId, result}` and in TEST site mode `testPayment:true,label` | 400 pack/e-mail/org/GSTIN invalid (`^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$`), USD refused unless `RAZORPAY_INTERNATIONAL=1`; 403 `Please sign in again` if key kind not M/H/C (a Co-host key only for its own bound game, else 403); 404 not this org's engagement; 409 already published; 409 game cancelled; 400 too big for any pack; 502 gateway refusal; 503 `payMode` off. With `eid`: the **pack is the smallest that fits the draft's cap** and the payment is bound to the org and the draft; `paidBy` recorded | 2 | `pay.ts:173` |
| `POST /api/payments/test` | same as checkout | same | same | **only while the site is in TEST mode** (403 otherwise); no Razorpay order | 2 (+6 fulfil) | `pay.ts:173` |
| `POST /api/payments/verify` | PUB | `{paymentId, razorpay_order_id, razorpay_payment_id, razorpay_signature}` | the stored result `{ok, orderId, pack, total, tax, currency, invoiceUrl, invoiceNumber, organizerKey?, newOrganizer, published, eid, restartedAtMs}`; or **202** `{confirming:true, paid:false, message:"Confirming your payment..."}` while the gateway says the payment is still `created` | checks HMAC signature **and** asks Razorpay for the real payment (amount and order must match; captures if `authorized`); idempotent. From a valid signature until the gateway confirms, `payment.confirming_ms` is set and the game shows `payment.status:"confirming"` (30 min window); never Paid before the gateway confirms (TEST mode excepted) | 6 | `pay.ts:216` |
| `POST /api/payments/webhook` | Razorpay signature header `x-razorpay-signature` | Razorpay event (`payment.captured`, `order.paid`; `payment.authorized` only sets the "confirming" state) body <= 100,000 | `{ok, fulfilled}` / `{ok, confirming}` / `{ok, ignored}` | 503 if `RAZORPAY_WEBHOOK_SECRET` unset; 400 bad signature; amount mismatch ignored | 6 | `pay.ts:233` |
| `GET /api/org/credit` | **M, H** (not C, AI, a work link) | - | `{credits:[{id, amountInr, remainingInr, createdMs, expiresMs, status:"active"|"used"|"expired", sourceGame, uses:[{game, amountInr, atMs}], currency, lastDay, lapsedInr?, test?}], activeTotalInr, nextExpiryMs|null}` | The account's credit. A credit past `expiresMs` shows as `expired` before the tick has marked it. `expiresMs` is the instant it lapses (00:00 IST after day 365); `lastDay` is the date told to people | - | `apps/edge/src/credit.ts` |
| `POST /api/z/{id}/pay-with-credit` | **M, H, C** of that game (AI and work links 403) | `{}` (optional `currency:"USD"`) | `{ok, paid: boolean, usedInr, toPayInr, restartedAtMs?, already?}` | Oldest-expiring credit first. `paid:true`: the credit covered the whole price (game paid, published, invoice "Paid from credit of invoice N", no Razorpay). `paid:false, toPayInr>0`: all credit was used and the rest is paid with the normal `POST /api/checkout` for the same game (it charges `toPayInr`). Idempotent and atomic: the same answer every time, never more credit than the price. 409 cancelled / `did-not-start` / `confirming`; 400 `start-pending` | 4 | `apps/edge/src/credit.ts` |
| `GET /api/invoice/<token>`, `GET /api/payments/status` | see section 2 | | | | | |

`fulfil` (`pay.ts:101`): creates/finds the organizer by e-mail, writes an **entitlement**, publishes and restarts the bound draft (`pack`, `kv pub/`, `paidby/`; if its start already passed the first number comes 2 minutes after the payment is confirmed: `start_round` moves to the next round and the 2-minute setup window `GRACE_ROUNDS` = 40 follows; `LATE_PAY_LEAD_ROUNDS` in `pay.ts`; a cancelled game is never published by a late payment), numbers an invoice per brand per financial year (TEST: `TEST-<fy>-n`, negative seq, draft), mails the buyer, records any partner commission, records funnel steps. Idempotent: a second call returns the stored result. **Spec 6:** a payment for a cancelled game, or for one that closed as "did not start", is kept as `credit` (`kind late`), buys no pack and publishes nothing; checkout charges the price minus the credit already applied to that game (`meta.creditInr`).

---

### 5.1 Pay links anyone can open (Phase 3, `apps/edge/src/paylink.ts`)

| Route | Auth | Request | Response | Rules | Cost | Handler |
|---|---|---|---|---|---|---|
| `POST /api/z/{id}/paylink` | **M, H, C of that game** (AI key 403) | - | `{url: '<origin>/paylink.html?t=<48 hex>', expiresMs}` (absolute ms, 7 days) | one open link per game: a new one cancels the old; only a hash of the token is stored; 404 not this account\'s game; 403 a Co-host of another game; 409 cancelled or `already-paid`; 400 no pack fits | 2 | `worker.ts`, `paylink.ts` |
| `GET /api/paylink/{token}` | PUB (the token) | optional `?currency=USD` | `{game:{name,startMs}, price:{base,gst,total,currency}, status:'open'\|'paid'\|'expired'\|'cancelled'\|'confirming'}` and nothing else about the game | 404 for any wrong token; `expired` = 7 days passed or replaced; `confirming` = the buyer paid and the gateway has not confirmed | 0 | `pay.ts` |
| `POST /api/paylink/{token}/checkout` | PUB (the token) | `{name (>=2), email, org?, phone?, phoneCode?, country?, taxId? (GSTIN, checked only if given), ref?}` | as `/api/checkout` (`{mode:'razorpay', paymentId, razorpay:{...}}` or the test-mode result) | bound to the link\'s game and the pack that fits it, whatever the payer sends; recorded `paidBy:'link'`; verification, webhook, idempotency, invoice, refund and credit note as for any payment; 409 when not `open`; 400 name/e-mail/GSTIN; 429 after 30 attempts per network per day | 2 | `pay.ts` |

## 6. Partners (Refer & Earn) - `partnerRoute` `partners.ts:62`

| Route | Auth | Request | Response | Rules | Cost | Line |
|---|---|---|---|---|---|---|
| `GET /api/partner/check?code=` | PUB | 8-char code | `{valid}` | 60 tries/day/address | - | `:80` |
| `POST /api/partner/enroll` | PUB | `{phone, email, name?, consent:true, source?:"ticket"}` | `{ok, sent:true, devCode?}` same answer for new/existing | 400; 429 10/day/address; 5 mails/hour/address; mails a 6-digit code (10 min) | 3 | `:88` |
| `POST /api/partner/enroll/verify` | PUB | `{email, code}` | `{ok, code (8 chars), partnerKey (ctp_...), link (/?ref=code)}` key shown once | 400 wrong/expired/5 tries | 3 | `:116` |
| `GET /api/partner/me` | PARTNER | - | `{code, name, state, link, attributionDays:30, totals, rate:0.5, repeatRate:0.5, sales:[{date,pack,currency,status,reason,amount}]}` never who bought | 403 | - | `:147` |
| `POST /api/partner/close` | PARTNER | - | `{ok, closed:true}` deletes the partner row | 403 | - | `:135` |
| `GET /api/partners[?mode=test]` | PLAT | - | `{partners:[{code,name,state,source,enrolled_ms,sales,accrued}]}` | | - | `:162` |
| `POST /api/partners/commission/rate` | PLAT | `{rate: 0..0.5}` | `{ok, applied}` for rows waiting as `pending_rate` | 400 above 0.5 | rows+1 | `:167` |
| `POST /api/partners/payout` | PLAT | `{code, reference (>=3 chars)}` | `{ok, paidRows}` marks `accrued` rows paid | | - | `:176` |
| `POST /api/partners/commission/void` | PLAT | `{paymentId, reason?}` | `{ok, voided}` (pending/accrued only) | | - | `:183` |
| `POST /api/partners/state` | PLAT | `{code, state: active|blocked}` | `{ok}` | | - | `:189` |

---

## 7. Owner-only (PLAT, never through an AI link) - non-owners get the same `404 {"error":"Not found"}` and the attempt is written to `audit_access`

| Route | Request | Response | Handler |
|---|---|---|---|
| `GET /api/owner/mode`, `POST /api/owner/mode` | `{mode:"TEST"|"LIVE", reason?}` | `{mode, changedMs, reason}` / `{ok, mode, was, changedMs, testRecordsLeft?, hint?}` | `mode.ts:98-115` |
| `GET /api/owner/test-mail`, `POST /api/owner/test-mail` | `{add?}` / `{remove?}` e-mail | `{allowed[], fromList}` / `{ok, allowed[]}` | `mode.ts:116` |
| `POST /api/owner/purge-test-data` | `{confirm:"purge test data"}` | `{ok, deleted:{...counts}}` | `mode.ts:126`, `test-data.ts:18` |
| `GET /api/owner/visits/summary?from=&to=&mode=test` | - | visit summary (humans vs bots, sources, funnel, sections...) | `worker.ts:491-500`, `visits.ts:285` |
| `GET /api/owner/visits/journey/<id 32-40 chars>` | - | one visitor's journey | `visits.ts:309` |
| `GET /api/owner/audit/access` | - | `{access:[last 500 owner reads]}` | `worker.ts:698-704` |
| `GET /api/owner/audit/<eid|org:<16hex>|sys>?format=csv|json&limit&offset` | - | rows (opened) JSON or CSV attachment | `worker.ts:708` |
| `GET /api/owner/audit/<chain>/verify` | - | `{ok, rows, brokenAtSeq?...}` hash-chain verification | `:705`, `audit.ts:289` |
| `POST /api/owner/audit/<chain>/analyze` | - | masked aggregate summary (optionally sent to `ANALYZE_AI_URL`) | `:706`, `audit.ts:347` |
| `POST /api/owner/audit/<chain>/hold` | `{on:bool, note?}` | `{ok, held}` legal hold | `:707`, `audit.ts:360` |
| `POST /api/purge` | - | `{ok, purged:n}` runs `purgeOld` | `:935` |
| `GET /api/z/suggestions` / `POST /api/z/suggestions/{n}/status` | status/note | PLAT sees authors; only PLAT sets status (`new, under_review, planned, shipped, declined`) | `:805-851` |

Audit chains: an engagement id, `org:<16 hex>` (rows of one organizer outside an engagement) or `sys` (`/api/owner/audit/sys`: sign-in attempts and other rows that belong to no engagement). The pattern is `worker.ts:699`.

---

## 8. Suggestions board (any org key except C; PLAT read/status)

| Route | Auth | Request | Response | Rules | Cost | Handler |
|---|---|---|---|---|---|---|
| `GET /api/z/suggestions[?status=]` | M, AI, H (org key), PLAT | - | `{suggestions:[{id,kind,title,body,status,note,votes,created_ms,yours,youSupported}]}` newest/most-voted 200 | authors never shown to other orgs | - | `:808` |
| `POST /api/z/suggestions` | M, AI, H | `{kind: feature|improvement|report|bug|other, title (4-120), body (10-2000)}` body <= 8,192 | `{ok, id, stored}` / `{ok, id, duplicate:true}` | 400 e-mail/phone numbers in text; 429 more than 20 per org per 24 h | 2 | `:815` |
| `POST /api/z/suggestions/{n}/vote` | M, AI, H | - | `{ok, counted}` once per org | | 2 | `:834` |
| `POST /api/z/suggestions/{n}/status` | PLAT | `{status, note?}` | `{ok}` | 403 others | 1 | `:845` |

---

## 9. Scheduled and inbound

| Route | Auth | Request | Response | Rules | Cost | Handler |
|---|---|---|---|---|---|---|
| `POST /api/lifecycle/tick` | CRON (`x-cron-key`) or PLAT | `{}` | `{ok, checked, reportSteps, reportsDone, purged, ...}` plus `purged` (engagements removed) | bounded: at most 25 engagements per call, one report step each; also shreds audit parts, sweeps visits once a day | varies | `worker.ts:929`, `lifecycle.ts:294` |
| `POST /api/inbound-email` | MAIL (`x-inbound-secret`) | `{from, subject, text}` body <= 200,000 | `{ok, action: none|confirm-sent|deleted|no-match, engagements?}` | The sender is never trusted alone: first mail only sends a 6-digit code to the organizer's *registered* address; the deletion happens when a reply carrying the code arrives (30 min, one code per 5 min) | 0 (mail only) | `:889` |
| Cloudflare cron `scheduled` of the Worker build | - | - | runs `lifecycleTick`, `purgeOld`, `retryOutbox` | `apps/edge/wrangler.toml` cron `17 3 * * *`; `apps/cron` cron `* * * * *` | | `worker.ts:1351` |

---

## 10. Legacy server (`apps/server`, port 8787) - not part of the deployed product

Routes (registered with `route_()` in `apps/server/src/index.ts`): `GET /api/health`, `POST /api/checkout`, `POST /api/payments/verify`, `POST /api/webhooks/razorpay`, `GET /api/payments/status`, `GET /api/orgs/me/invoices`, `POST /api/auth/email`, `POST /api/auth/verify`, `GET /api/orgs/me`, `GET /api/orgs/me/dashboard`, `GET /api/orgs/me/library`, `POST /api/orgs/me/erase`, `GET|POST|DELETE /api/orgs/me/ai-link`, `/api/e/:code/*` (reuse, me, join, confirm, request, status, console, settings, rewards, breaks, upload, people, waiting, conflicts, start, end, draw, pause, resume, control, moments, endbreak, raise-limit, report), `/api/p/:pass/*`, `/api/r/:code/*`, `/api/ai/drafts/:id/preview|confirm`, `GET /api/app-manifest`, dev-only `/api/dev/*`, WebSocket `/ws`, `/ai/tbl_<64 hex>` (its own AI link). It uses the `packages/engine` engine and is **not** what the Pages site calls.

---

## 11. Quick status-code legend

200 ok; 204 no content (beacons, telemetry, OPTIONS); 400 validation; 402 limit above paid pack / payment `not captured`; 403 not allowed / not a participant / draft closed; 404 unknown; 405 wrong method on AI GET-only addresses; 409 state conflict; 410 data already deleted; 413 too long; 423 ticket on another phone; 429 slow down; 502 payment gateway; 503 busy or not configured.
