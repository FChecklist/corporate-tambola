# 12 - Change guide: "if you want to change X, edit these files and run these tests"

General: read the file's header comment first (most files start with a design note), change the smallest thing, run the **targeted** tests named below (not the full suite; RAM rules in `10-OPERATIONS.md`), do not commit unless asked. Another agent may be editing `worker.ts` / `zc.*` at the same time: re-read before you edit and keep edits small.

## 1. Recipes

### 1.1 Add an API route
1. Decide who may call it (`05-ROLES-AND-PERMISSIONS.md`): public, participant (`pid`), team (`can(a,e)`), person (`can(a,e,true)`), account (master only), owner (platform).
2. Engagement action: add the action name to the regex at `apps/edge/src/worker.ts:939`, add an `if (action === "name" && req.method === "...")` branch **after** the auth lines you need. Non-engagement route: add it in `route0` **before** the `const m = p.match(...)` (order matters, see `04-API-REFERENCE.md` 0.2).
3. Use the helpers: `body(req, max)`, `json()`, `deny(a)`, `spend(env, now, n)` (declare the D1 write cost; return `BUSY()` if false and write nothing), `can/canAi`.
4. If a Host through the AI link may use it, add it to `HOST_ACTIONS` (`worker.ts:399`); if a Co-host may, extend the Co-host gate (`worker.ts:505`).
5. If the audit log should name it, add a case to `classify()` (`apps/edge/src/audit.ts:119`) (otherwise it becomes `edit` / `other_write`).
6. If the AI may use it, add it to the manual (`ORG_ENDPOINTS`/`HOST_ENDPOINTS` in `ai-link.ts`), to `AI_MANIFEST.you_can` (`worker.ts:420`) and (recipe 1.7) to `FUNCTIONS`.
7. Document it in `docs/dev/04-API-REFERENCE.md` (the checker `tools/check-dev-docs.mjs` fails if a route string is missing).
8. Tests: add to `apps/edge/test/<area>.test.ts`; run it plus `usecases.test.ts`, `ai-link.test.ts`, `ai-enablement.test.ts`, `roles.test.ts`, `audit.test.ts`.

### 1.2 Add a role (key kind)
1. Choose a prefix; check `LINK_KEY` (`ai-link.ts:14`) if it should (not) work at `/ai/<key>`. Add the kind to `Auth.kind` (`worker.ts:383`) and to the `kind` type in `authOfKey`.
2. Decide its rights in `can`, `canAi`, `deny` words, the gate at `worker.ts:505` and `PAYER` (`pay.ts:164`) if it may pay (`paidBy` text).
3. Creation route like `POST /api/org/cohost` (`worker.ts:673`): key = prefix + 48 hex, insert into `organizer_key` with `is_test` copied from the org (`COALESCE((SELECT MAX(is_test)...))`), return the key **once**; a limit (like `MAX_HOSTS`) if needed; retire rules in `/api/org/team/retire`.
4. Audit: `Actor` type in `audit.ts:33`, `actorOf` there.
5. Console/pill/UI: `zc.js` (`role()`, `ROLE_LABEL`, `rolePill()`); update `docs/ROLES_AND_CONSOLE_SPEC.md`.
6. Tests: extend `roles.test.ts`; `e2e 01-security-isolation.spec.ts`; docs 05.

### 1.3 Change a price / add a pack
1. `packages/shared/src/pricing.ts` `PACKS` ([participants, INR excl. GST, USD]). `GST` constant is there too.
2. The page copy in `apps/web/public/common.js` (`TB.PACKS`/`TB.price`) and `index.html` (structured data lowPrice/highPrice/offerCount and festive text in `site.js:27`) must match: `branding.test.ts` ("structured data prices equal the real packs") fails otherwise.
3. Docs/FAQ strings that quote prices; `partners.test.ts` has a test with hard-coded commission per pack ("100 = Rs 1,999..."); `pay.test.ts` uses packs.
4. Existing paid entitlements keep their `pack`. `payment.amount` is stored per payment, so history is unaffected.
5. Run: `bun test packages/shared apps/edge/test/pay.test.ts apps/edge/test/partners.test.ts apps/edge/test/branding.test.ts apps/web/test/pages.test.ts`.

### 1.4 Add a public page
1. Create `apps/web/public/<page>.html` (copy the head of an existing page: charset, viewport, `<title>`, description, canonical for indexable pages, `fonts.css`, `app.css`; footer links).
2. Add it (and its `.js/.css`) to `FILES` in `pages/build.mjs:7`, and a row in the `PAGES` table (`pages/build.mjs:17`) with the right CSP class and noindex flag. Pages not in `FILES` are not deployed; pages not in `PAGES` get no per-page header.
3. Indexable? add to the sitemap (`node tools/make-sitemap.mjs`), do **not** list it in robots `Disallow`; non-indexable: add `<meta name="robots" content="noindex">` and `Disallow` in `robots.txt`; `seo.test.ts` has both lists (`INDEXABLE`, `NOINDEX`).
4. If it should be tracked by the visit tracker, add the clean path to `PUBLIC_PATHS` (`visits.ts:39`) **and** the list in `v.js:7` (they must stay equal; never track game pages).
5. If part of the game and offline: `FILES` in `zsw.js` + bump `CACHE` (see 2.6).
6. Docs: `08-SITEMAP.md`, `02-FILE-MAP.md` (checker). Tests: `terms.test.ts`/`seo.test.ts`/`pwa.test.ts`/`pages.test.ts`.

### 1.5 Change an engagement setting (config field)
Single validator: `validateCfg` in `packages/beacon/src/config.ts`.
1. Add the field to `EngagementCfg` / helper types; validate in `validateCfg` (reject with a plain sentence; keep "replace, not merge" semantics).
2. Persist: `cfgJson()` (`worker.ts:74`) lists exactly which fields go to `engagement.config`; `cfgOf()` (`worker.ts:132`) and `cfgOfRow()` (`lifecycle.ts:42`) rebuild them (**three places must agree**; note `cfgOfRow` currently omits `opening/closing/name`, which is fine for its uses (winners, report) but remember it).
3. Expose: `pub(e)` (`worker.ts:73`) = what every phone receives; `summary` (`worker.ts:1132`); `settings` response (`:1304`); `POST /api/z` accepts it (`:861`).
4. Phone/console: `PhoneRuntime` view (`phone-runtime.ts`), `z.js`, `zc.js`; rebuild `zgame.js` (recipe 2.5).
5. AI: `SETTINGS_BODY`/`SETTINGS_NOTE` (`ai-link.ts:22-23`), `AI_MANIFEST.you_can` (`worker.ts:426`), `ai-go.ts` if guided.
6. Tests: `config.test.ts`, `worker.test.ts` (settings), `phone-runtime.test.ts`, `pages.test.ts`, `ai-enablement.test.ts` (worked example must be accepted exactly as written: UC-61).

### 1.6 Add a database migration
1. Create `apps/edge/migrations/00NN_<name>.sql` (idempotent where possible: `CREATE ... IF NOT EXISTS`; `ALTER TABLE ... ADD COLUMN` is not idempotent). Header comment: why, and "Apply BEFORE deploying the code that reads it" if code depends on it.
2. Append **the same statements, in the same order, at the end of `SCHEMA`** (`worker.ts:88-128`) - usually in the module's own `*_SCHEMA` array if that module owns the table, otherwise inline at the end (as `label` was added).
3. Append the file name to `FILES` in `apps/edge/test/migrations.test.ts`. Run `bun test apps/edge/test/migrations.test.ts`.
4. **Do not run `apps/edge/tools/gen-migration.ts`** (it overwrites 0001 with the entire current schema).
5. Add retention for any new personal data to `erasePersonal`/`deleteEngagementRows` (`lifecycle.ts`), `retentionSweep` (`worker.ts:1315`) and `test-data.ts`; update `03-DATABASE.md` and `docs/RETENTION.md`.
6. Apply to production first (`10-OPERATIONS.md` section 4). The local SQLite file cannot be re-opened with a changed schema: delete it.

### 1.6b Change who is on a game's lists, links or the waiting room

Edit `apps/edge/src/people.ts` (routes, cleaning, limits) and the `join` / `addSeat` / `settings` blocks of `apps/edge/src/worker.ts`; a schema change goes in `PEOPLE_SCHEMA` AND a new migration file (the two must match, `apps/edge/test/migrations.test.ts`). Names and numbers must stay sealed and unreachable by an AI key (`callerOf` in `people.ts`; a test in `apps/edge/test/ai-enablement.test.ts` checks it). Run `apps/edge/test/people.test.ts`, `privacy.test.ts`, `roles.test.ts`, `worker.test.ts`. Trap: a limit is enforced twice on purpose (a pre-check for the message, a guard inside the seat insert for the race): change both.

### 1.6c Change the Host first open, pay links or Google sign-in

- Host first open: `apps/edge/src/hostsetup.ts` (state, device keys, `/api/host/setup*`) and the gate at the top of `route0` plus `authOfKey` in `apps/edge/src/worker.ts`. Test with `makeD1({ strictHosts: true })` (`apps/edge/test/host-setup.test.ts`); other tests use the default harness, whose trigger finishes a new Host's setup so they can use a Host key at once.
- Pay links: `apps/edge/src/paylink.ts` and the `paylink` branch of `payRoute` in `apps/edge/src/pay.ts`. Tests: `apps/edge/test/paylink.test.ts`.
- Google: `apps/edge/src/google.ts` and `/api/auth/google` in `worker.ts`. Tests inject a fake key set with `trust()` from `apps/edge/test/google-fake.ts`; never call Google from a test. The CSP for the pages that show the button is `GOOGLECSP` in `pages/build.mjs`.
- A new key prefix literal (`cth_`) must stay in `worker.ts` (a test forbids it in other source files); hostsetup.ts receives the new key from the caller.

### 1.7 Add an AI function to the registry
The list `FUNCTIONS` in `apps/edge/src/ai-functions.ts` is the single registry (map, front door, manual refer to it) and is **frozen by a test**.
1. Add `{id, name, who: "ai"|"handover"|"human", what, call?, body?, go?, console?, say}`.
2. Add the matching check to `checks` in `apps/edge/test/ai-enablement.test.ts` (test "each function has a check here..."): `expect(Object.keys(checks).sort()).toEqual(FUNCTIONS.map(f => f.id).sort())` fails otherwise, and the check must prove the classification (AI does it / handover returns `needsOrganizer`/hand-over link / human refused with 403).
3. If the AI needs a guided step: `goScreen`/`gameStep` in `ai-go.ts` (`go: "go/<step>"` must exist, else the test for unknown steps/`/go` fails).
4. Add the endpoint to the manual (`ORG_ENDPOINTS` / `HOST_ENDPOINTS`, `ai-link.ts`) and the `AI_MANIFEST.you_can` list (`worker.ts:420`); the test "the long manual mentions every address used" compares them.
5. Facts (`ai-facts.ts`) change only for product claims; see 2.2.
6. Update `13-AI-INTEGRATION.md`.

## 2. Gotchas and traps

1. **Frozen function lists / FACTS single source.** `FUNCTIONS` (ai-functions.ts) and `FACTS` (ai-facts.ts, exactly **10** facts with unique topics; test `FACTS.length` 10) are single sources read by the manual, `/start`, `/map`, `/facts`, `trust.html`, `llms.txt`. Edit them in one place, never copy the wording elsewhere. A fact's `say` text must appear verbatim on `/facts` and in `trust.html`.
2. **Trust page regeneration.** After any change to `ai-facts.ts` (or `trust-page.ts`) run `bun run tools/make-trust.ts` (writes `apps/web/public/trust.html` and `llms.txt`) and commit them; `ai-enablement.test.ts` compares the committed files with the generated text byte for byte (`trust-page.ts` has `TRUST_UPDATED` date; `tools/make-sitemap.mjs` then gives `trust.html` a fresh lastmod). Same idea: `tools/make-legal-pages.mjs` writes `terms/dpa/subprocessors/partner-terms/organizer-guide` (`terms.test.ts`); `bun tools/make-sitemap.mjs` writes `sitemap.xml` (`seo.test.ts`).
3. **CRLF vs LF.** Git's index stores LF but the Windows working tree is mixed (about 86 files CRLF, 209 LF, 8 mixed; `core.autocrlf=true`; e.g. `worker.ts` and `ai-*.ts` are CRLF, `zc.js` is LF). Multi-line exact-match edits and Python/sed patches that search for `"\n"` silently miss in CRLF files. Read the file's endings first (`python -c "print(b'\r\n' in open(f,'rb').read())"`), match them, and open files with `newline=''` when scripting. Tests that normalise whitespace (`migrations.test.ts`) are safe; byte comparisons (trust page) need identical bytes, so regenerate rather than hand-edit.
4. **Python patch escapes.** When patching JS/TS with a Python script, backslashes in the target code (regexes such as `/\d+/`, `"\n"`) are interpreted by Python's own string rules: use raw strings (`r"..."`) or the Edit tool, and re-read the result. A lost backslash turns into a valid-looking but wrong regex that tests may not catch.
5. **`zgame.js` rebuild.** `zgame.js`, `control.js`, `reportgen.js` are committed build outputs: after changing `packages/beacon/src`, `packages/shared/src`, `apps/edge/src/report-*.ts` or `pdf.ts` run `bun run build:zgame` / `build:control` / `build:report`. Nothing else rebuilds them; a stale bundle means phones disagree with the tested source. The three bundle entry files list what is exported: add new exports there.
6. **Service-worker cache bump.** `zsw.js` `CACHE = "ct-game-v10"`: bump when a game file changes shape or the `FILES` set changes, so installed phones fetch a matching set; `pwa.test.ts` also demands every cached file be shipped by `pages/build.mjs`.
7. **Banned-claims words.** `branding.test.ts` scans a named list of files (`trust.html, llms.txt, demo.js, preview.js, ai-facts.ts, ai-go.ts, index.html, legal.html, partner.html, z.js, zc.js, pay.js, site.js, partner.js, ai-link.js, worker.ts, lifecycle.ts, report-layout.ts, mails.ts, ai-link.ts, pay.ts`) for forbidden phrases: `discount applied`, `ISO/IEC 27001`, `Most popular`, `Nobody else sees it`, `We follow India`, `Built in line with`, `compliant` (alone or "fully/is/are compliant"), `does not contain names or mobile`, `We do not keep your participants' data`, `refund policy`, `terms, privacy`. Also: no "best", "100% safe", "unhackable", "cheat-proof", "certified" as claims (`ai-enablement.test.ts`); say "designed to follow", "very hard, not impossible"; every mention of 365 days must sit near winners/prize/organizer/retention wording (`branding.test.ts`) and must not say names and numbers are kept 365 days.
8. **ai-mail guard exclusions.** `ai-mail.test.ts` ("no other source ... can carry an AI link") asserts that in `apps/edge/src` **only** `ai-link.ts, ai-facts.ts, ai-functions.ts, ai-go.ts, trust-page.ts, mails.ts, worker.ts, local.ts` may contain `aiPaste|aiMessage|aiLinkMail|coHostLinkMail|cta_|cth_|/ai/`; the pages `report.html/js, reportgen.js, z.html/js, zgame.js, big.html/js, play.*, pay.html/js, partner.html/js, screen.js` must contain no `cta_|cth_|/ai/|aiMessage`; and `worker.ts` must contain `aiLinkMail(` exactly once and `coHostLinkMail(` exactly once (the latter is the **Host** link mail). So put any new AI-link text in `mails.ts`/`ai-link.ts`, never in `pay.ts`/`lifecycle.ts`/pages.
9. **Everything that writes calls `spend()`.** Forgetting it silently bypasses the free-plan guard; calling it before `INSERT OR IGNORE` of an already-existing row wastes budget (finding F-03).
10. **Never store names/numbers in clear**; seal with `sealPii`/`sealText`, delete in `erasePersonal`. `participant.name` is a legacy always-NULL column.
11. **Keys in logs.** Never log a key; audit uses `key_id` (10 hex). Mail bodies containing keys must pass `secret:true` to `sendMail` so no body is kept on failure.
12. **Phone code must stay deterministic.** `packages/beacon` functions are shared by phones, Worker (lifecycle/winners) and console: no `Date.now()`, no randomness except in `generateTicket` fallbacks, no server-only imports. Changing any numeric constant (`GRACE_ROUNDS`, `LATE_LAG_ROUNDS`, schedule math, `pickNumber` input string `CT1|...`, ticket permutation) **changes every game's numbers/tickets** - never change it while any published engagement exists.
13. **Time**: everything is UTC milliseconds; IST only for display (`istTime`, `fullDeleteAt`). Beacon round `r` is at `(GENESIS + (r-1)*3) s`.
14. **Pause is per size**: `safetyForCap`; no pause above 2,000. Changing `cap` across profiles resets the unused key (`worker.ts:1296`).
15. **Legacy code**: `apps/server`, `packages/engine`, `play/screen/console/confirm` pages are not deployed; do not "fix" the product there. Their tests still run in `bun test`.
16. **`docs/` contradictions**: see `KNOWN-DOC-DRIFT.md` before trusting an older doc.
17. **Hard-coded origin** `https://corporate-tambola.pages.dev` appears in `trust-page.ts`, `tools/make-sitemap.mjs`, `lifecycle.ts:224` (fallback), `apps/cron`, `pages/wrangler.toml`, `llms.txt`/sitemap outputs.
18. **Local server restart**: a persistent SQLite file cannot be re-opened (duplicate column); delete it.
19. **Cancelled games and the e-mail rule.** A cancelled game (`engagement.cancelled_ms`) answers 409 to every write except `erase`/`forget`/`person`/`cancel` (gate right after `paymentOf` in `worker.ts`); a new engagement write route is covered automatically, a new PUBLIC read should say `cancelled` if guests would otherwise see a live game. Never add an e-mail field for a Co-host or a guest: only the Organizer and Hosts have one (`docs/ROLES_AND_CONSOLE_SPEC_2.md`). A new place that stores a Co-host's name/mobile must be erased by `eraseCohostsSql` (`cancel.ts`).
