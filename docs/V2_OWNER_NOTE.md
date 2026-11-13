# Tambola V2: a note for the owner

Built on branch `tambola-v2` from the live commit **c6897f2**. **Nothing is deployed, pushed, or changed in DNS, secrets or the live database.** The build waits for your go.

The twelve changes you approved on 13 Nov 2026 are built, except number 9 (the Host pressing "Next number"), which you said was not needed. No part of it was built.

## What changed, in plain words

**For organizers**
- **Game keys.** From the game's key page the organizer can make a key that works for ONE game only. It stops 24 hours after that game ends. After the end it can only delete the game's data, download it, fetch the invoice, or make a new game like the old one. Everything else is refused with a kind message. A key can be made for a person or for an AI. Your usual sign-in key (`ctk_`) is **unchanged on purpose**: narrowing it would lock organizers out of their own account.
- **Receipts and payment history**, in the game's history and by e-mail. The payee on every receipt is IT SERVICES BY RAJAT AGARWAL via Razorpay.
- **Certificates** for winners: name or ID, game id, ticket number, prize or line, and a link anyone can use to check it. They are a signed, hash-chained record. Mobile and e-mail are never shown. The public check page keeps only non-personal facts.
- **Download your data**: results, winners, tickets and payments, by key and from the screen.
- **The AI's name in the trail.** The game's own trail of AI calls says "AI" or "AI: ChatGPT".
- **Claim review** (optional, off by default): the Host looks at each claim and approves it or rejects it with a short reason the player sees.
- **Host hand-over.** The organizer can give the Host's seat to someone else. A Host can ask to step down.
- **Support ticket**: raise and read, by key and by screen.
- **A "More tools" button** in the console holds all of the above.

**For Hosts**
- A Host key can be made **without e-mail, mobile or a confirming person**. It has limited rights (watch, tell everyone, hand over prizes) and ends with the game.
- A Host can step down, or ask for a hand-over. During a live game a hand-over happens only when the organizer approves.
- With claim review on, a Host sees each claim and decides.
- A Host sees payment history **without** payment secrets.

**For players**
- Each person picks a **language** for their own view only. It is remembered on their device, and English is the default. English and Hindi are in. Hindi covers the main player words and the new panel; the rest stays in English until more is translated. A new language is one new file.
- Players join with **an ID only**, no mobile asked, when the organizer chooses an ID game. The existing join already did this; V2 adds tests to prove it.
- If a Host does not accept a claim, the player sees a short, kind note.

## What did NOT change in play

No rule of play was touched: number calling, ticket making, claim detection, scoring and winners are as they were. `packages/` (the game engine and the beacon) has **no change at all**. The files that run the join, claim, result, settle, control, over and won routes were not edited. Four shared files received small additions that do nothing for any existing key (see "Diff summary").

## Things you should decide or know

1. **Winner details (consent K4).** The site already keeps a winner's sealed name and mobile for 365 days under an existing consent, which does not match the "everything is deleted within 24 hours" promise on the site. V2 does not use that copy and does not make this worse. Please reconcile the consent and the promise.
2. **An AI key and a game key for an AI** are read as AI keys: no names, mobiles or report link; they cannot publish, pay, approve claims, make keys, erase, or start a new game. The organizer does those.
3. **A call with the organizer's own key counts as "AI" in the trail only when it says it is an AI** (the header `x-ai-model`, which the gateway sends). Calls with the AI key, an AI game key or a Host's AI link are always labelled.
4. **Names in certificates and exports exist only until about 20 hours after the game**, when everyone's details are erased. After that a certificate shows the ticket number only. Download early. This keeps the 24-hour promise.
5. **Stepping down** retires that Host's keys on the whole account (the messages now say so), not just for one game.
6. **Certificates are kept** (non-personal rows) so the check link keeps working; there is no expiry yet.
7. **A game that never ends** keeps its keys until the game is purged.
8. The older practice pages `play.html` and `screen.html` carry no language switch; the live game pages do.

## The migration and the rollback

- **Migration:** `apps/edge/migrations/0032_v2_changes.sql`. Additive only: new tables and three new columns (`scope_eid`, `scope_src`, `scope_kind`) on `organizer_key`, plus an AI-label column on the trail. Nothing existing is changed or dropped.
- **It MUST be applied BEFORE the deploy.** The new code reads the new columns on every keyed call. The ALTERs cannot be run twice.
- **Rollback id:** the Cloudflare Pages deployment that is live just before the deploy (today it is the build of c6897f2; read its id from Pages > corporate-tambola > Deployments, or `node tools/list-deploys.mjs`). Write it down BEFORE deploying.
- **Rollback steps:** (1) run `deploy/ROLLBACK_V2.sql` (it switches off every key made by V2, because the old code would read them as full keys); (2) roll Pages back to that deployment. The new tables and columns can stay; the old code does not read them.

## Deploy steps (NOT run; they wait for your go, a rollback id, and zero live games)

```bash
# 0. Be sure no game is live, and note the current Pages deployment id (the rollback id).
# 1. The database change, first:
bun x wrangler@3 d1 execute corporate-tambola --remote --file apps/edge/migrations/0032_v2_changes.sql
# 2. The site:
bun run pages:deploy
# 3. Check: open /version.json, it must show the V2 commit; open a game page, the "More tools" button appears.
```

If anything looks wrong: run `deploy/ROLLBACK_V2.sql` with wrangler as in its header, then roll Pages back to the rollback id.

## New and changed public routes (for the AI gateway)

**Public, no key**
- `GET /api/v2/verify/{certId}`: checks a certificate (non-personal facts only).
- `GET /api/z/{id}/v2/claimreview/note?pid=`: a player's own claim note (only while review is on).
- Static pages: `/verify.html`, `verify.js`, `claimnote.js`, `lang/ui.js`, `lang/hi.js`, `v2.js`.

**Keyed, `/api/z/{id}/v2/...`** (game-scoped)
`keys`, `keys/revoke`, `receipts`, `receipts/send`, `certs`, `certs/issue`, `certs/csv`, `certs/{certId}.html`, `export`, `host`, `host/stepdown`, `host/handover`, `host/requests`, `host/requests/{n}`, `claimreview`, `claimreview/mode`, `aitrail`, `status`.

**Other keyed**
`GET /api/org/v2/receipts`, `GET /api/org/v2/notices`, `POST|GET /api/v2/support`, `GET /api/v2/support/{n}`, and (our own key only) `/api/owner/v2/support[/{n}]`.

**Changed behaviour**
- `GET /api/whoami` answers for a game key: `{gameKey: true, game, over, expiresMs}`.
- `GET /api/org/ai/audit` rows now carry `label`.
- `POST /api/z/{id}/clone` with a game key also returns a `gameKey` for the new game (a person's key only; an AI game key is refused).
- `POST /api/z/{id}/prizegiven` can answer 409 `claim-rejected` (only while review is on and a Host rejected that claim).
- New error answers: 401 `key-expired`; 403 `key-scope`, `game-over`, `host-limited`, `ai-people`.
- A new key prefix, `ctg_`, goes only in the `x-organizer` header or `Authorization: Bearer` (never in an `/ai/<key>` link).

## Diff summary by path (c6897f2 to the V2 head)

| Path | What changed | Core play path? |
|---|---|---|
| `packages/` (engine, beacon) | nothing | no change |
| `apps/edge/src/v2*.ts` (11 new files) | all the new features | not part of play |
| `apps/edge/migrations/0032_v2_changes.sql` | additive tables and columns | no |
| `apps/edge/src/worker.ts` | the hooks: import and `SCHEMA`, the key columns read at sign-in, the scope check and V2 routes run first, the AI label on the trail, the daily clean-up, the AI manual lines, and one line (`prizes`: a Host key without personal data sees ticket numbers only) | the join, claim, result, settle, control, over and won routes: **not edited** |
| `apps/edge/src/winners.ts` | the trail function takes an optional label (same behaviour without it) | trail only |
| `apps/edge/src/lifecycle.ts` | the erase list gains one V2 table, so claim-review notes are erased with the game | erase list only |
| `apps/edge/src/ai-link.ts` | three lines in the AI manual | no |
| `apps/web/public` | language files, the More tools panel, the certificate check page, the claim-note line, guide entries; script tags in `z.html`, `zc.html`, `big.html`, `board.html`; the offline cache number | the game pages only gain script tags |
| `pages/build.mjs` | new files in the list and the `/verify` route | no |
| `deploy/ROLLBACK_V2.sql` | new | no |

## Checks done

- Every item has tests, including the refusals (wrong role, expired key, after the end, AI never sees names, language stays per person, certificate tamper checks, deletion at 24 hours). They are in `apps/edge/test/v2-*.test.ts` and `apps/web/test/v2-pages.test.ts`.
- Suite result against c6897f2: SUITE_RESULT_PLACEHOLDER
- Independent audits (a fresh auditor each round, who did not build it): AUDIT_ROUNDS_PLACEHOLDER
