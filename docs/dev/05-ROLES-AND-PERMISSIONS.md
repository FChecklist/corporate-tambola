# 05 - Roles and permissions

Server-side role code is **done** (`apps/edge/src/worker.ts`, test `apps/edge/test/roles.test.ts`, spec `docs/ROLES_AND_CONSOLE_SPEC.md`). The console UI (`apps/web/public/zc.html|js|css`) is being rewritten by another agent: this document describes the **server rules**, which are authoritative; UI details are "as of spec; verify against `zc.js`".

## 1. Key kinds, prefixes and where they live

| Kind (`organizer_key.kind`) | Prefix | Made by | Count | Lifetime | Stored as | Works at `/ai/<key>`? |
|---|---|---|---|---|---|---|
| `master` (Organizer) | `ctk_` + 48 hex | `/api/start`, `/api/auth/verify`, `/api/auth/link`, payment `fulfil` (new organizer), `POST /api/org` (PLAT) | many sessions per organizer; old keys keep working until retired | lasting | `sha256("key|"+key)` | **No** ("an organizer's own sign-in key ... never accepted in an address", `worker.ts:291`) |
| `ai` | `cta_` + 48 hex | `/api/start` (lasting; sealed copy `kv aikey/<org>`), `replaceAiLink`, `mailTempLink` (24-hour copies, `expires_ms` set) | one lasting + any number of 24 h | lasting or 24 h | hash | Yes (full manual) |
| `host` | `cth_` + 48 hex | `POST /api/org/host` (lasting, max 5), `mailTempLink(kind "host")` (24-hour copy mailed to the Organizer) | up to **5** lasting | lasting | hash | Yes (narrow manual) |
| `cohost` | `ctc_` + 48 hex | `POST /api/org/cohost` | **unlimited** | lasting | hash | **No** (`LINK_KEY = ct[ah]_`) - "a Co-host has no AI link" |
| partner | `ctp_` + 40 hex | `/api/partner/enroll/verify` | one per person | lasting | `sha256("partner|"+key)` in `partner.key_hash` | no, header `x-partner` |
| platform | secret `ORGANIZER_SECRET` | env | 1 | - | compared with `===` | **No** |

Other token prefixes (not credentials of a role): `pay_` payment id, `ent_` entitlement, `inv_` invoice token (URL secret), report key `k=` (HMAC), `tbl_` (legacy server AI link).

Key `id` shown in UIs/audit = first 10 hex of the stored hash (`hash.slice(0,10)`); a Co-host's **chain mark** uses the first 7 hex (`worker.ts:408-411`). Keys are never returned after creation, except: the lasting AI key is re-readable by the signed-in Organizer (`GET /api/org/ai/link`) and Host/Co-host creation returns the key once.

## 2. How a request is authorised (`authOf`)

```mermaid
flowchart TD
  R[request] --> H1{x-organizer or Authorization Bearer present?}
  H1 -- no --> ANON[kind = null: public routes only]
  H1 -- yes --> P{equals ORGANIZER_SECRET?}
  P -- yes --> PLAT[plat = true, kind platform]
  P -- no --> L[SELECT org, kind FROM organizer_key WHERE hash = sha256 'key|'+key, revoked = 0 and not expired]
  L -- none --> ANON
  L -- row --> K{kind}
  K -- master --> M[org, master]
  K -- ai --> AI[org, ai]
  K -- host --> HH{x-ct-link = 1 ?}
  HH -- yes --> HL[org, host, viaLink = true: only HOST_ACTIONS]
  HH -- no --> HC[org, host console: full game rights]
  K -- cohost --> CO[org, cohost: only whoami, notices, /cohost, payment]
```

Code: `authOf` `worker.ts:384`, `authOfKey` `:387`, viaLink marker `:470`, Co-host gate `:505`, ability helpers `can/canAi/deny` `:394-397`, `HOST_ACTIONS` `:399`, `MAX_HOSTS` `:400`.

The internal AI-link wrapper rewrites `/ai/<key>/<path>` into a normal request with `x-organizer: <key>` and `x-ct-link: 1`; the audit trail records it with the `/api/...` path and **no key in the path** (`worker.ts:353-357`).

## 3. Permission matrix (role x action)

Legend: **Y** allowed; **-** refused (403); **hand** = the AI prepares and gives the Organizer a link; **ask** = may only file a request that the Organizer confirms; **link** = Host through the AI link. All "game" rows apply only to engagements of the key's own account.

| Action | Organizer (M) | Host console (H) | Host via AI link | Co-host (C) | AI key | Platform | Guest | Source (route / helper) |
|---|---|---|---|---|---|---|---|---|
| Sign in / start account | Y | - | - | - | - | - | Y (public) | `/api/start`, `/api/auth/*` |
| **Create** a game | Y | **-** | - | - | Y | Y | - | `worker.ts:857` (`a.kind === "host"` refused) |
| Change game settings (time, speed, cap, tickets, rounds, prizes, brand moments) | Y | Y | - | - | Y | Y | - | `settings` `can(e)` |
| Switch guest invitations on/off, `per`, categories | Y | Y | - | **-** (must ask) | Y | Y | - | same route; Co-host denied by the gate |
| Read game summary | Y | Y | Y | - (gets `/cohost` header only) | Y | Y | - | `summary` |
| Guest list (ticket ids) | Y | Y | Y | - | Y | Y | - | `participants` |
| Names of a few people | Y | Y | - | - | **-** | Y | - | `names` `can(e, true)` |
| Load guest names/numbers (roster) | Y | Y | - | - | **-** (403 "owner does it in the console") | Y | - | `roster` |
| Reuse an earlier list | Y | Y | - | - | Y | Y | - | `reuse` |
| Mark seat as organizer/host/co-host; allow phone change (`unbind`) | Y | Y | - | - | Y (by ticket number only) | Y | - | `mark`, `unbind` `canAi` |
| **Publish** | Y | Y | - | - | **hand** | Y | - | `publish` `can(e, true)` |
| **Pay** (checkout) | Y | Y | - | **Y** | **-** | - | - | `PAYER` map `pay.ts:164` (kinds master, host, cohost) |
| Announce a message to every phone | Y | Y | Y | - | Y | Y | - | `announce` |
| Tick "prize given" | Y | Y | Y | - | Y | Y | - | `prizegiven` |
| See winners' list (full name/number) | Y | Y | numbers masked / ticket only | - | ticket only | Y | - | `prizes` (`outside` flag) |
| Register the pause signing key | Y | Y | - | - | - | Y | - | `control/key PUT` `can(e, true)` |
| **Pause / resume / extend / stop** (sign) | Y (in own browser) | Y (own browser) | - | - | **ask** | - | - | signature by `control.js` key; AI files `control/request` |
| Ask for pause / resume / stop / erase | Y | Y | - | - | **ask** | Y | - | `control/request` `can(e)` |
| Clear requests | Y | Y | - | - | - | Y | - | `request/clear` |
| **Erase** all participant data now | Y | Y | - | - | **ask** | Y | - | `erase` `can(e, true)` |
| Delete / look up one person | Y | Y | - | - | - | Y | - | `person`, `forget` |
| Report link (read) | Y | Y | Y | - | status only | Y | - | `reportlink GET` |
| Report link (replace) | Y | Y | - | - | - | Y | - | `reportlink POST` |
| Read AI audit trail | Y | **-** | - | - | Y | Y | - | `/api/org/ai/audit` |
| **Account**: list/revoke sign-in keys | Y | **-** | - | - | - | - | - | `a.kind !== "master"` (platform also refused) |
| **Account**: AI link read / replace / fresh / revoke | Y | - | - | - | - | - | - | same |
| **Account**: change e-mail | (none: e-mail is the sign-in identity; not editable by any route) | | | | | | | - |
| **Account**: close account | Y | - | - | - | - | - | - | `/api/org/close` |
| Add a **Host** (max 5; needs the Host's e-mail) | Y | **-** | - | - | Y | - | - | `/api/org/host` `kind master or ai`; link e-mailed to the Host |
| Add a **Co-host** (no limit; name + mobile, for ONE game, no e-mail) | Y | Y | - | - | **-** (a mobile number is never given to an AI) | - | - | `/api/org/cohost` |
| **Cancel a game** (`cancel-preview`, `cancel`, `confirmations: 3`) | Y | Y | - | - | **-** | Y | - | `can(a,e,true)`; paid + started = refused |
| List the team | Y | Y | - | **-** | Y | - | - | `/api/org/team` |
| Retire Hosts and Co-hosts | Y | **Co-hosts only** | - | - | - | - | - | `/api/org/team/retire` |
| Read the small game header | Y | Y | - | **Y** | Y | Y | - | `GET /api/z/{id}/cohost` |
| Get own invite link / "brought" count | - | - | - | Y | - | - | - | `/cohost` returns `inviteLink` only when the key is a Co-host |
| Suggestions board read/write/vote | Y | Y | - | - | Y | read + status | - | `/api/z/suggestions*` |
| History (list of games) | Y | Y | - | - | Y | Y (all) | - | `/api/history` |
| Owner: mode, audit log, visits, test data, partner admin, notices, purge | - | - | - | - | - | **Y** | - | owner routes (404 for everyone else) |
| Join, play, claim, vote, confirm own prize | - | - | - | - | - | - | **Y** | participant routes |

Notes on the matrix:
- "Y" for a Host via the AI link applies only to the nine `HOST_ACTIONS`. Everything else for that Host answers 403 *before* any route logic (`worker.ts:963`).
- A Host in the **console** (kind `host` without `x-ct-link`) has "everything inside a game" (spec), **except** creating a game (`POST /api/z` refuses `host`, `worker.ts:857`) and the account-level routes.
- The platform key is *not* an organizer: it is refused on `/api/org/keys`, `/api/org/ai/*`, `/api/org/close`, `/api/org/host`, `/api/org/cohost`, `/api/org/team` (they test `a.kind` strings, and `platform` is none of them).
- AI key limits come from `deny()` text (`worker.ts:397`) plus the explicit `a.kind === "ai"` branches: roster (CONSOLE_ONLY), publish (hand-over), `person/forget/erase/names/reportlink POST/control key/clear` (`can(e, true)` excludes AI), mark/unbind need a ticket number. The manual's "you cannot" list is `AI_CANNOT` (`ai-link.ts:67`) and `AI_MANIFEST.you_cannot` (`worker.ts:456`).

## 4. Co-host limits (spec + code)

Only: (a) `GET /api/whoami`, (b) `GET /api/notices`, (c) the three payment routes, (d) `GET /api/z/{id}/cohost` (`worker.ts:505`). Everything else: `403 "A Co-host can invite people and pay. Ask the Organizer or a Host for anything else."` (`deny`). A Co-host cannot add anyone, see the guest list, or change the invite setting (they must ask). Their own invite link is `z.html?e=<id>&from=<1_000_000_000 + parseInt(first 7 hex of their key hash, 16)>`; people who join through it are tagged `seat.src = "co:<7hex>"` and counted per Co-host (`broughtBy`, `worker.ts:410`). This works **even when guest invitations are off** and with no quota (`worker.ts:1006-1008`). Revoking the Co-host key stops new joins through the link (the hex is checked against live `cohost` keys).

## 5. AI-key limits

The AI key can build and manage (everything the console does) **except**: pay, publish (hand-over link), erase (can only ask), pause/stop (can only ask: only the organizer's browser holds the signing key), choose/change winners or numbers (nobody can), handle names and mobile numbers (roster, names, person, forget: 403; prizes and participants are ticket-number-only), create/retire the Organizer's own sign-in keys, replace the AI link itself, change the e-mail, close the account, add a Host? (**it may**: `POST /api/org/host` allows `ai`). See `13-AI-INTEGRATION.md` for the full list and the audit.

A Host's AI link (`cth_`) is narrower than the AI key's: no create, no settings, no roster; only the nine `HOST_ACTIONS` (`participants, summary, results, info, announce, prizes, prizegiven, reportlink, life`). `/ai/<cth_>/map|facts|go` answer 403 text (`worker.ts:327`).

## 6. Guest invitation rules ("two-level rule")

Setting (`EngagementCfg.invites = {on, per (1-4), cats[]}`, default `{on:false, per:4, cats:["family","colleagues"]}`; `MAX_INVITES_PER_PERSON = 4` in `config.ts`). Enforced at join (`worker.ts:1002-1020`):

1. Invitations must be **on** and `from` must be an existing seat.
2. **Only two levels**: the inviter is allowed if they are marked (`seat.role` set: Organizer/Host/Co-host) **or** were not themselves invited (`seat.inv === null`). A guest who was invited by a participant plays normally, but their own link records **no inviter** (the join still succeeds).
3. A plain participant may bring at most `per` people (409 `invite-full` beyond; checked inside the insert statement, so simultaneous joiners cannot exceed it). Marked seats (Organizer / Host / Co-host) have **no quota**.
4. `cat` is recorded only if it is one of the allowed categories (`INVITE_CATEGORIES`: family, colleagues, friends, dealers, vendors, customers, partners, franchisees, neighbours, guests).
5. A Co-host link (`from >= 1_000_000_000`) bypasses 1-4 entirely.
6. `GET /api/z/{id}/invites?pid=` tells a phone `{on, per, used, unlimited, canInvite, seat, cats}`.
Tests: `privacy.test.ts` ("one person can invite at most 4", "the organizer, hosts and co-hosts can invite any number"), `roles.test.ts`. Note: the title of one test and `docs/AI_WORK_PROMPT_ORGANIZER.md` say "1 to 10"; the code limit is **4** (listed in `KNOWN-DOC-DRIFT.md`).

## 7. Payment by any role; one payment per game

- `POST /api/checkout` with `x-organizer` of kind **master / host / cohost** and `eid` of a draft of the same org: `paidBy` = `organizer` / `host` / `co-host` (`PAYER`, `pay.ts:164`), stored in the payment `meta`, then at fulfilment in `kv paidby/<eid>` (`pay.ts:127`) and shown as `payment:{status:"paid", paidBy, paidMs}` in `summary` and `/cohost` (`paymentOf`, `worker.ts:403`).
- A key of another org: `404 No such engagement`; an AI key or revoked key: `403 Please sign in again`.
- **One payment is enough**: after the draft is published/paid (`pack != 0`), another checkout for it answers `409 This engagement is already published.`. Two payments that raced create a credit (an unattached entitlement) for the next game (UC-15).
- Anonymous buyers (no key) pay from the pricing page to get a pack and an organizer key; that flow is public (`site.js`).

## 8. Platform owner

Single key `ORGANIZER_SECRET`. It "can act on any engagement" (`can()` returns true for `plat`) - the single-tenant/local mode - **but** none of the account routes. It alone reaches the owner routes (mode, test-mail, purge, visits, audit, partners admin, notices, suggestions status, purge, lifecycle tick). Owner routes ignore a key arriving through the AI link (`x-ct-link: 1`), answering 404, and write `audit_access`.

## 8b. The Host first open and device keys (Phase 4, `apps/edge/src/hostsetup.ts`)

- The Organizer adds a Host with a name and at least one of e-mail or mobile (`POST /api/org/host`). The Host's personal link is a **one-time entry**: it works for 7 days and only until the Host has confirmed an e-mail (6-digit code or Google). A new link from the Organizer (`POST /api/org/host/link`) cancels the old one.
- Until the Host has a confirmed e-mail AND a mobile number, every Host route answers `403 {code:'host-setup'}` except `GET /api/whoami` (which says `ready:false`), `/api/host/setup*`, `/api/auth/*`, `/api/paylink/*` and `GET /api/notices` (gate at the top of `route0` in `worker.ts`). A Host reached through an AI work link keeps its narrow rights and is not gated.
- Confirming the e-mail spends the link key and returns a **device key** (a new `organizer_key` row of kind `host` with `host_id` = the Host's identity row). Later devices sign in with the e-mail code (`/api/auth/email` + `/verify`) or Google (`/api/auth/google`, intent `signin`); `host_login` maps the confirmed e-mail to the Host. If the same e-mail is also an Organizer's, the Organizer's account wins.
- The Host's list owner and the Co-hosts they add are keyed by the identity row (`a.hid`), so every device sees the same lists. Retiring the Host (`POST /api/org/team/retire`) stops the identity row and every device key and deletes the e-mail mapping.
- Pay links (`POST /api/z/{id}/paylink`): Organizer, Host (setup finished) and the Co-host of that game; an AI key gets 403.

## 9. Tests that pin this down

| Test file | Proves |
|---|---|
| `apps/edge/test/roles.test.ts` (new, untracked) | whoami for three roles; team list ids/labels never keys, Co-host 403; Host adds Co-host not Host, sixth Host refused; Co-host adds nobody; retire rules; Host may change game/invites/publish, Co-host may not; Co-host refused guest list/summary/participants/keys; account routes deny Host; Host narrow via link; Co-host reads only `/cohost`; any of the three can pay and `paidBy` shows; one payment enough; other account's key cannot pay; Co-host `brought` counts even with invites off |
| `apps/edge/test/usecases.test.ts` UC-50, UC-81 | AI key can build/read, never publish/pay/erase/settle/mint; Host via link, at most five Hosts |
| `apps/edge/test/account.test.ts` | replace AI link; report link |
| `apps/edge/test/keys.test.ts` | strict mode secrets |
| `tests/e2e/01-security-isolation.spec.ts` | owner endpoints, cross-tenant isolation, AI link and Co-host limits |

## 10. Known gaps in role handling (from reading the code)

- `markGiven` writes `given_by = "co-host"` when the key kind is `host` (`winners.ts:132`): a Host's tick is labelled "co-host" in the report. Cosmetic leftover from the old naming where the watch-only key was called "co-host".
- Several comments and strings in `worker.ts` still say "co-host" when they mean Host (for example the comment at `:655`, `:1107`, the `AI_MANIFEST` text of `org/host`). The `coHostLinkMail` function (`mails.ts:71`) is in fact the **Host** link mail.
- `POST /api/org/team/retire` calls no `spend()`: it writes one row without charging the daily write guard (negligible).
- Hosts cannot create games (`POST /api/z`), although the spec says "everything inside a game"; that follows the spec's account-level reading but the console must hide "start a new game" for Hosts. Verify in `zc.js`.
