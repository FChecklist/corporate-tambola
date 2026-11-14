# Tambola V2 change plan (13 Nov 2026)

Branch `tambola-v2`, built off live commit **c6897f2**, in its own worktree. Nothing is deployed or pushed. Owner decisions are quoted in the task; where the owner has not decided, the safe default is marked **(default)**.

## 0. How the build is kept away from the play path

The rules of play (number calling, ticket generation, claim detection, scoring, winners) live in `packages/engine`, `packages/beacon`, and in the worker routes `join`, `claims`, `results`, `settle`, `control`, `over`, `won` plus `winners.ts`, `claimhold.ts`, `lifecycle.ts` (end, winners record, erasure). **None of those files is edited by this plan.**

All new server code goes into new files (`apps/edge/src/v2-*.ts`). `worker.ts` gets only **four small hooks**, none of which is on the play path for an ordinary key:

| Hook | Where | What it does for an ordinary key |
|---|---|---|
| H1 | `SCHEMA` (end of the array) | appends `V2_SCHEMA` (additive tables and columns) |
| H2 | `authOfKey` | the key lookup also reads the new scope columns (`scope_eid`, `scope_kind`); an old key has NULL there, so the answer is the same as today |
| H3 | `route0`, right after the Host-setup gate and before any route | `v2Route(...)`: serves the new `/api/z/{id}/v2/*`, `/api/org/v2/*`, `/api/v2/*` routes AND applies the scoped-key gate. For a key that is not scoped it returns "not mine" at once, so every existing route runs exactly as before |
| H4 | `route()` after the existing AI-audit lines | writes the AI label into the game's AI trail for AI-declared master calls (see item 5). Writes to `ai_audit` only; never changes the answer |

Plus view-only static files (`lang/*.js`, `v2.js`, `v2.css`) and one script tag per page.

## 1. Language (G07)

- **Already there:** a per-person language dropdown (`#langsel`) in `z.js`, `zc.js`, `board.js`, `big.js`, remembered in this browser (`localStorage ctz-lang`), driven by `ZG.LANGS` / `ZG.TABLES` (`packages/beacon/src/messages.ts`). English was the only table.
- **Build:** `apps/web/public/lang/hi.js` (Hindi) and `lang/ui.js` (the mechanism): a language is a file that calls `CTLang.add(code, name, {msg:{...}, ui:{...}})`. `msg` is merged into `ZG.TABLES[code]` (claim notices); `ui` is an English-phrase to translated-phrase table applied to the page text only when the person's language is not English (a small text-node pass; with English chosen nothing runs). Adding German later = adding `lang/de.js` and one script tag.
- **Files:** new `lang/ui.js`, `lang/hi.js`; script tags in `z.html`, `zc.html`, `big.html`, `board.html` (the older `play.html` and `screen.html` do not carry it); `pages/build.mjs` FILES list.
- **Routes:** none. The choice never goes to the server, so it cannot touch anyone else's view.
- **Play path:** NO. View only. `zgame.js` (compiled) is not rebuilt; the Hindi table is added at runtime into the existing tables.
- **Migration:** none.

## 2. Receipts and payment history (G18, O18)

- **Routes (new):**
  - `GET /api/z/{id}/v2/receipts` Organizer (master / game key). Payments, invoice numbers and links, credit notes, refunds for one game. Payee line on every row: **IT SERVICES BY RAJAT AGARWAL via Razorpay**.
  - `GET /api/z/{id}/v2/receipts` as a Host: the same rows **without** payer e-mail, gateway ids, bank/UPI reference and invoice links (the invoice link is a bearer link carrying buyer details).
  - `GET /api/org/v2/receipts` Organizer, across all games.
  - `POST /api/z/{id}/v2/receipts/send` e-mails the receipt list to the organizer (invoices are already mailed at payment time by `pay.ts`; this re-sends on request).
- **Files:** new `v2-receipts.ts`; `v2.js` shows a "Receipts" panel in the game history screen.
- **Play path:** NO. Reads `payment`, `invoice`, `refund`, `credit_note`. `pay.ts` is not edited.
- **Migration:** none (reads existing tables).

## 3. Certificates (G40) (default, privacy-safe reading)

- A certificate shows: winner's name or ID (only while the participant data still exists, i.e. before the 24-hour deletion; after that "Ticket No. N"), game id, ticket number, prize and line won, round, issue date, and a **verification link**.
- The verification record is **signed (HMAC) and hash-chained per game** and keeps only non-personal fields: certificate id, game id, round, pattern, ordinal, ticket (seat) number, prize label, issue time, previous hash, hash. No name, no mobile, no e-mail.
- Mobile and e-mail are never on the certificate and never added to the record. They stay only where the game already keeps them (sealed, deleted with the participant data).
- **Routes (new):** `POST /api/z/{id}/v2/certs/issue` (Organizer; idempotent, one per winning ticket and prize), `GET /api/z/{id}/v2/certs` (list), `GET /api/z/{id}/v2/certs/{cid}.html` (printable certificate, "download"), `GET /api/z/{id}/v2/certs.csv`, **public** `GET /api/v2/verify/{cid}` (JSON: valid or not, non-personal fields, chain position) and `GET /verify.html?c={cid}` (a small page).
- **Files:** new `v2-certs.ts`, `apps/web/public/verify.html`, `verify.js`.
- **Play path:** NO. Reads the `winner` (winners record) table only after the game; writes only its own table.
- **Migration:** `v2_cert` table.
- **Owner conflict recorded, then decided:** existing code keeps a winner's sealed name+mobile (`prize.pii`) for 365 days because the join consent (K4) says so. **Owner ruling, 14 Nov 2026 (K4, CLOSED):** a winner's name, mobile, e-mail (if available), game id and ticket number are KEPT 365 days; this is already written in the Terms and Conditions. The 24-hour limit applies only to the game key's access after a game ends, not to winners' data. This build does not rely on `prize.pii`.

## 4. Data export (G41, O23)

- **Routes (new):** `GET /api/z/{id}/v2/export?part=all|results|winners|tickets|payments&format=json|csv` (download, `content-disposition: attachment`). Organizer / game key only (not a Host; an AI-labelled call).
- Personal fields (names) are included only for a human call and only while they exist; after the 24-hour deletion the export says `personalDataDeleted: true` with the time. An AI-labelled call (item 5) never receives names: ticket numbers only.
- `GET /api/org/v2/export` is not built (one game at a time is what the owner asked: "download it" for the game).
- **Files:** new `v2-export.ts`; "Download data" in `v2.js`.
- **Play path:** NO (read-only).
- **Migration:** none.

## 5. AI name in the audit trail (G52)

- Calls with an AI key (`cta_`) were already in `ai_audit`. New: calls with a **master key or game key that declare themselves AI** (header `x-ai-model: AI: ChatGPT`, which the gateway sends, or a game key created with an AI label) are written to the same trail with a label `AI` or `AI: <caller>`.
- A master key is a person's key too, so a call is labelled only when it declares it is an AI; an undeclared call is a person and is not labelled (documented limit).
- **Routes:** `GET /api/org/ai/audit` now returns `label`; new `GET /api/z/{id}/v2/aitrail` (this game's rows).
- **Files:** `winners.ts` is NOT edited; new `v2-audit.ts` writes the label column and extends the reader. Hook H4.
- **Migration:** `ALTER TABLE ai_audit ADD COLUMN label TEXT`.
- **Play path:** NO.

## 6. Master key (O05)

Today the organizer's sign-in key (`ctk_`, kind `master`) belongs to the whole account. Narrowing that key itself would lock organizers out of their account, so the owner's rule is built as a **game master key**: the key you give to an AI or helper for ONE game. The account sign-in key is unchanged **(default; question to the owner in the owner note)**.

- **Routes (new):** `POST /api/z/{id}/v2/keys {label, ai?: true}` mints a game master key (account organizer key only, shown once), `GET /api/z/{id}/v2/keys` lists (ids, labels, created, never the key), `POST /api/z/{id}/v2/keys/revoke {id}`.
- **Scope:** a game key works only on `/api/z/{its game}/...`. Account routes (team, keys, `/api/org/*`, payments, checkout, other games, history) answer 403 with a clear message.
- **Expiry:** 24 hours after the game's end (`realEndMs`; for a cancelled game, the cancel time). After that the key answers 401 "this key expired 24 hours after its game ended".
- **After the game ends (until expiry) the key may only:** delete the game's data (`erase`), download (`v2/export`, `results`, `reportlink`), fetch the invoice (`v2/receipts`), and create a NEW game from the old game's settings and data (`clone`, optionally `reuse`), which returns a new game key for the new game. Everything else: 403 "This game is over...".
- **Files:** new `v2-keys.ts`; hooks H2/H3. `lifecycle.ts` is not edited; scoped keys of an erased game are removed by `v2Sweep`, called from the existing daily purge (one line in `purgeOld`'s caller) **or** simply left to expire (they hold no personal data).
- **Migration:** `ALTER TABLE organizer_key ADD COLUMN scope_eid TEXT`, `scope_src TEXT`, `scope_kind TEXT`.
- **Play path:** NO.

## 7. Host key without personal data (O08)

- `POST /api/z/{id}/v2/host {label}` (Organizer or game master key; **not** an AI key) makes a Host key for that game: no e-mail, no mobile, no person confirming.
- Safety: limited to that game; the narrow Host rights (the same set a Host's AI link has: watch, announce, prizes, override, report link) plus the new Host routes (claim review, step down, hand-over request, receipts without secrets, support); cannot pay, cancel, erase, clone, manage the team or make keys; expires 24 hours after the game ends; at most five per game and never one of the account's five Host places; revocable by the organizer (`POST /api/org/team/retire` as today, or `v2/keys/revoke`).
- **Files:** new `v2-host.ts`. **Migration:** the scope columns above; `host_state` row marked ready.
- **Play path:** NO.

## 8. Support ticket (O27)

- `POST /api/v2/support {subject, body, game?}` raise; `GET /api/v2/support` list own; `GET /api/v2/support/{id}` read (with replies). Organizer, game key, Host key (own tickets). Owner side: `GET /api/owner/v2/support`, `POST /api/owner/v2/support/{id} {reply?, status?}` (platform key). A new ticket also sends one e-mail to our help address. A small Support box in `v2.js`.
- Retention: 365 days like other organizer records; the box warns not to type players' names or numbers.
- **Files:** new `v2-support.ts`. **Migration:** `v2_support`, `v2_support_msg`. **Play path:** NO.

## 9. Host presses Next number: NOT BUILT (owner: "not needed").

## 10. Claim review (H15) (default)

- Optional per game, **off by default**; stored in a separate key, not in the game settings. With it off, or with no Host action, nothing differs from c6897f2.
- `POST /api/z/{id}/v2/claimreview/mode {on}` (Organizer), `GET /api/z/{id}/v2/claimreview` (Host/Organizer: each claim, with state), `POST /api/z/{id}/v2/claimreview {pid|ticket, pattern, round, decision: approve|reject, reason ≤120}`, public `GET /api/z/{id}/v2/claimnote?pid=` (a player reads the note on their own claim).
- A rejection records the reason (short, shown to the player on their phone page) and stops the **prize hand-over** for that ticket (`prizegiven` answers 409 while rejected; an approval or a later approval lifts it). It does NOT change which ticket the software judged a winner, the numbers, or the public results: winners remain decided by the software (the existing `override` route is the organizer's final say; claim review sits beside it).
- **Files:** new `v2-claims.ts`. **Migration:** `v2_claim_review`. **Play path:** NO (claims, settle and results untouched; `GET claims` is read through the existing route).

## 11. Host hand-over (H18, H25) (default)

- `POST /api/z/{id}/v2/host/stepdown` (a Host): retires that Host's own key (and its device keys) and tells the organizer (e-mail and a notice in the console). Allowed at any time; during a live game the organizer is told at once and the game continues (the software calls the numbers).
- `POST /api/z/{id}/v2/host/handover {note}` (a Host): asks the organizer to assign a successor. `GET /api/z/{id}/v2/host/requests`, `POST .../requests/{rid} {approve: bool, label?}` (Organizer): on approval the old Host key is retired and a new limited Host key (item 7) is made and shown once to the organizer. **During a live game a hand-over happens only after the organizer approves.** When the game is not live the organizer may also assign directly (`v2/host`).
- **Files:** `v2-host.ts`. **Migration:** `v2_handover`. **Play path:** NO.

## 12. Join by ID only (G13)

- c6897f2 already has `verify: "id"` / `"either"` (join with an ID, no mobile) with `idKind`. This build adds **tests** that prove an ID-only join asks for no mobile number, stores none, and keeps the promise (deleted with the participant data), plus a doc line. No code change expected; if a test finds a gap it is fixed in the smallest way and listed in the owner note.
- **Play path:** NO (join path is only tested).

## Migrations (all additive, file `0032_v2_changes.sql`, same text as `V2_SCHEMA`)

`organizer_key` +3 columns, `ai_audit` +1 column, new tables `v2_cert`, `v2_support`, `v2_support_msg`, `v2_claim_review`, `v2_handover`, and indexes. No existing column or table is changed or dropped. Rollback of the data side is not needed (the old code ignores the new columns and tables); rollback of the code is a Pages rollback to the previous deployment id, PRECEDED by `deploy/ROLLBACK_V2.sql` (it switches off every V2-made key, which the old code would read as a full key); run the SQL again after the Pages rollback to close the gap between the two steps.

## Core play path summary

| Changed? | Path |
|---|---|
| **No** | `packages/engine/**`, `packages/beacon/**`, `worker.ts` routes for `join`, `claims`, `results`, `settle`, `control`, `over`, `won`, `seats`, `presence`; `winners.ts`, `claimhold.ts`, `lifecycle.ts`, `people.ts`, `pay.ts`, `clone.ts` |
| **Edited, small, play-neutral** | `worker.ts` hooks H1 to H4; `apps/web/public/*.html` script tags |
| **New** | `apps/edge/src/v2-*.ts`, `apps/web/public/lang/*`, `v2.js`, `v2.css`, `verify.*`, migration 0032, tests |

## As built (corrections to the plan above, 13 Nov 2026)

The build followed the plan; these are the places where the finished code differs from the words above.

- **Files outside `v2-*.ts` that were edited**, all small and play-neutral: `worker.ts` (hooks H1 to H4, the exported `Auth` type gets the scope fields, the daily purge calls `v2Purge`, four lines in the AI manual and `AI_MANIFEST`), `winners.ts` (`auditAi` takes an optional `label` and `listAiAudit` returns it; the plan said it would not be edited), `lifecycle.ts` (one more table in the existing `erasePersonal` list: `v2_claim_review`), `ai-link.ts` (three manual lines), `guide.js` (a V2 block of kind messages), `zsw.js` (offline list, cache name v42), `pages/build.mjs` (ships the new files, `/verify` header rule), `z.html`, `zc.html`, `big.html`, `board.html` (script tags). `v2-audit.ts` and `v2.css` were not needed.
- **Key scopes** are `gm` (a person's game key), `ga` (a game key made for an AI) and `lh` (a Host key made without personal data).
- **Certificates:** `v2_cert` has no `game` column (the game id is its `eid`). The spreadsheet list is `GET /api/z/{id}/v2/certs/csv`.
- **Claim review:** a player reads their note at `GET /api/z/{id}/v2/claimreview/note?pid=` (public); the Host decides with `POST /api/z/{id}/v2/claimreview`.
- **Extra routes:** `GET /api/z/{id}/v2/status` (is the game over, when do game keys expire), `GET /api/org/v2/notices` (step-down and hand-over notices).
- **The language switch** needed one fix on the way: a box's hint text (placeholder) is translated, what a person typed never is.
- **Audit round 1 corrections:** a game key made for an AI (`ga`) now acts exactly as the organizer's AI key everywhere (it is read as an AI key at sign-in), so every existing "an AI may not" rule applies; it may still download the game's data (names never included) and certificates. It cannot make a new game from the old one or erase data after the end; the organizer does that. A Host key made without personal data (`lh`) no longer reaches the participant report link, and sees prizes in the same "outside" form (ticket numbers only) as an AI. `play.html` and `screen.html` are the older practice pages: they carry no language files (the live pages `z.html`, `zc.html`, `big.html`, `board.html` do).
- **Audit rounds 4 and 5:** `audit.ts` (the internal audit log) is also edited: for V2 calls it copies only the plain choices (decision, ticket, pattern, round, on/off), never free text, so nothing typed by a person outlives the 24-hour promise there. Receipts no longer carry a payment id for a Host or an AI (the id opens the public receipt and invoice). An AI key never reads the organizer's support tickets. A call that declares itself an AI (`x-ai-model`) cannot switch claim review, decide claims, or make keys or Hosts, and sees receipts without secrets. Hand-over notes lose a typed mobile number.
