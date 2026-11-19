# V2 audit, round 1 (independent Rule 7c auditor)

Audited commit: 29e5ecb. Result: **FAIL**. Report below as returned; fixes follow in later commits (see PROGRESS-V2.md).

AUDIT: FAIL

I ran all 11 V2 test files one at a time and they pass: v2-keys, v2-ai-label, v2-certs, v2-claims, v2-export, v2-host, v2-join-id, v2-receipts, v2-support, apps/web v2-pages, plus migrations and ai-mail. The AI game key finding below was confirmed with a throwaway probe test kept outside the repo. Nothing in the repo was edited.

## Must fix before deploy

**1. BLOCKER — an AI game key (`ga`) has full master powers, not AI-key powers.**
- `insertGameKey` (`v2-keys.ts:~80`) stores `ga` keys as `kind:"master"`. Every existing `a.kind === "ai"` guard in `worker.ts` therefore stops applying.
- `scopeGate` only blocks 7 action names (`AI_DENY`). It also lets `reportlink` through even after the game is over (`OVER_GET`).
- Probe results with a `ga` key: the real organizer AI key gets 403 or a stripped answer for the same calls.
  - `POST /z/{id}/reportlink` returned 200 with the report URL, which includes the key to every participant's name and mobile number (worker.ts:2248-2252). `GET reportlink` is also open: the AI-only `url:null` branch at worker.ts:2260 is skipped. The first request in the probe returned `url:null` only because the report was not ready yet.
  - `PUT /control/key` returned 200 and registered a signing key. That key can pause, stop or end the game (worker.ts:1470).
  - `POST /v2/claimreview/mode` returned 200, and `POST /v2/claimreview` with a reject decision returned 200 (the real AI key gets 403). `v2-claims.ts:56` blocks only `a.kind==="ai"` or a link.
  - `POST /publish` returned 200 as a master. The AI key gets `needsOrganizer`.
  - `GET /prizes` takes the non-"outside" branch (worker.ts:2266), which returns winner name and mobile. I did not run this with a winner present.
  - `POST /paylink` is open to a master.
- This breaks the AI_MANIFEST line "never gets names or mobile numbers" and the line saying an AI cannot approve claims.
- Smallest fix: in `authOfKey`, return `kind:"ai"` for `scope_kind==='ga'` so all existing AI rules apply. Then allow `ga` explicitly in `v2-export`, `v2-certs`, the claim and key checks, and clone and erase. Alternatively, make the gate an allow-list for `ga`.
- No test covers `ga` against any of these routes. The people-list test checks only GET roster, people, waiting and names.

**2. MAJOR — rollback fails open.**
- The plan says "old code ignores the new columns, rollback = Pages rollback".
- Game keys are stored as `kind='master'` and Host keys as an ordinary `kind='host'`. After a rollback to c6897f2 every `ctg_` key becomes a full-account organizer key. Every `lh` key becomes an unlimited Host key.
- Fix: add a rollback step `UPDATE organizer_key SET revoked=1 WHERE scope_eid IS NOT NULL`. Or store scoped keys with a `kind` the old code rejects.
- Also keep the order the plan states: apply migration 0032 first. After this build, `authOfKey` selects the new columns on every keyed call.

## Owner should know

**3. MAJOR (owner decision) — a no-identity Host key (`lh`) gets the participant report link and winner contacts.**
- `LH_GET` includes `reportlink` and `prizes`. The report link is the key to every participant's name and mobile number, and `prizes` returns winner name and mobile.
- A normal Host must confirm e-mail and mobile first. An `lh` key has no confirmed person.
- Precedent: the existing Host AI link also has `reportlink`.
- Fix: drop `reportlink` from `LH_GET`, and show `prizes` in "outside" mode for `lh`.

**4. MINOR — the claim note is public by ticket number, not by the player's own ticket id.**
- `seatOfPid` ignores the hash part (`unique-ticket.ts:109`), so anyone can read a rejection reason by ticket number.
- The test "a player sees only notes on their own ticket" only proves a malformed id is refused.
- The Host's reason is free text, and nothing warns the Host not to put names in it.

**5. MINOR — wording versus behaviour.**
- Stepping down, and approving a hand-over, revoke the Host's whole identity on the account (`hash=? OR host_id=?`). This applies to ordinary Hosts, who are not tied to one game. The message says only "game X", and the new key covers one game.
- After the game ends, game keys can still reach Support (`OPEN_OK`).
- An `lh` key keeps `announce`, `override` and `prizegiven` for 24 hours after the end. A normal Host has the same rights.

**6. NOTE — smaller points.**
- The `ai-mail.test.ts` guard was loosened by whitelisting `v2-host.ts`.
- `v2_cert` rows are never purged. They are non-personal, but retention is unbounded.
- Certificates show a name only until about 20 hours after the game, when the participant data is erased (export names behave the same). The owner should know to download certificates and exports in time.
- A step-down during a live game takes effect at once. I read "approval only for hand-over" as not covering step-down.
- `play.html` and `screen.html` do not load the language files, although the plan listed them.
- Game and Host keys expire only relative to a game end. A game that never ends keeps its keys until the game is purged.
- The join-ID test asserts only `status < 500` for the duplicate ID.

## Judgement calls the brief asked for

- **Item 6, `ctg_` as a new key and `ctk_` unchanged:** reasonable, and safe for account sign-in. Scope-gate behaviour is sound for the `gm` and `lh` kinds:
  - Path variants were refused or 404: double slash, trailing slash, upper case, `%73`, `..`, `//api`.
  - Other games, `/api/org/*` and `/ai/ctg_…` were refused.
  - Keys cannot make keys, expiry lands exactly at end + 24 hours, and a deleted game gives 401.
  - The only real hole is the `ga` privilege issue (finding 1).
- **Items 8, 11, 12:**
  - Item 9 was not built. No `packages/` file changed.
  - Join by ID works through the existing code, with tests added.
  - Support, hand-over and key-id lookups are scoped by org and game. I found no IDOR.
- **Rules of play:** the edits to `lifecycle.ts` (one table in the `erasePersonal` list) and `winners.ts` (an optional audit `label`) are neutral. Migration 0032 equals `V2_SCHEMA` and is additive.
- **Payments:** no new payment path. The e-mailed invoice from `pay.ts` is untouched, so its payee text is not verified by V2.
- **Item 5 (AI label):** a master-key call is labelled only when it declares itself via `x-ai-model`. This is the disclosed limit; a plain master-key call is not labelled.

## Public and changed routes (for the gateway)

**Public, no key:**
- `GET /api/v2/verify/{certId}`
- `GET /api/z/{id}/v2/claimreview/note?pid=`
- Static: `/verify.html`, `verify.js`, `claimnote.js`, `lang/*.js`, `v2.js`

**Keyed `/api/z/{id}/v2/...`:**
- `keys`, `keys/revoke`
- `receipts`, `receipts/send`
- `certs`, `certs/issue`, `certs/csv`, `certs/{id}.html`
- `export`
- `host`, `host/stepdown`, `host/handover`, `host/requests`, `host/requests/{n}`
- `claimreview`, `claimreview/mode`
- `aitrail`, `status`

**Other keyed routes:**
- `/api/org/v2/receipts`, `/api/org/v2/notices`
- `/api/v2/support[/{n}]`
- `/api/owner/v2/support[/{n}]` (platform key only)

**Changed behaviour:**
- `GET /api/whoami` for scoped keys
- `GET /api/org/ai/audit` rows now carry `label`
- `POST /z/{id}/clone` with a game key returns `gameKey`
- `POST /z/{id}/prizegiven` can answer 409 `claim-rejected`
- New error codes: 401 `key-expired`; 403 `key-scope`, `game-over`, `host-limited`, `ai-people`

**Manifest:** AI_MANIFEST and ai-link.ts list receipts, aitrail, support and `whoami`. They do not list the others above. Their claims about AI game keys are false until finding 1 is fixed.

Probe file (outside the repo): `the builder's scratch folder`</result>
<usage><subagent_tokens>245949</subagent_tokens><tool_uses>68</tool_uses><duration_ms>545848</duration_ms></usage>
</task-notification>
</system-reminder>
