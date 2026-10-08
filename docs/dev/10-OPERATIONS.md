# 10 - Operations

No secret value appears in this repository's docs and none may be added here. Names and purposes only.

## 1. Environment variables and secrets

Read via `env.<NAME>` in the Worker / Pages Function. Found by scanning `apps/edge/src`, `apps/cron/src`, `pages/functions`, `apps/edge/src/local.ts`.

| Name | Kind | Purpose | Used in | Set where (production) | If missing |
|---|---|---|---|---|---|
| `DB` | D1 binding | the database | everywhere | `pages/wrangler.toml` `[[d1_databases]]` (binding `DB`, database `corporate-tambola`) | nothing works |
| `ORGANIZER_SECRET` | secret | the **platform (owner) key**; also the fallback key for sealing if `DATA_KEY` is absent and for phone hashing if `PHONE_SALT` is absent | `worker.ts:389`, `pii.ts`, `lifecycle.ts` | Pages secret | with `STRICT_KEYS=1` the service answers 503; otherwise nobody is platform |
| `DATA_KEY` | secret | seals names, numbers, organizer e-mail, lasting AI key, report chunks, audit blobs (AES-256-GCM via HKDF); **never rotate while engagements hold participants**: sealed rows become unreadable | `pii.ts:23`, `visits.ts` (derives `VISIT_KEY` default) | Pages secret | fallback to `ORGANIZER_SECRET` (never plain text); strict mode refuses |
| `PHONE_SALT` | secret | salts the mobile-number hash (one ticket per number, partner contact hashes) | `worker.ts:948`, `partners.ts:36` | Pages secret | falls back to `ORGANIZER_SECRET`, then `"unset"` |
| `CRON_KEY` | secret | the scheduled job's own key (must be >= 16 chars); can call only the lifecycle tick | `worker.ts:931`, `apps/cron` | Pages secret **and** cron Worker secret (same value) | tick refused (403) unless called with the platform key |
| `INBOUND_SECRET` | secret | authenticates the mail provider's inbound webhook (deletion requests) | `worker.ts:890` | Pages secret | route refuses |
| `STRICT_KEYS` | var | `"1"` makes the Worker answer 503 unless `DATA_KEY`, `PHONE_SALT`, `ORGANIZER_SECRET`, `CRON_KEY`, `INBOUND_SECRET` are all set and non-blank | `worker.ts:275` | Pages var | no check (local/tests) |
| `VISIT_KEY` | secret (optional) | keys the HMAC of visitors' addresses on public pages | `visits.ts` | Pages secret | derived from `DATA_KEY` |
| `VISIT_DAILY_WRITES` | var (optional) | cap on visitor-tracking writes per day (default 20,000) | `visits.ts` | var | default |
| `DAILY_WRITE_BUDGET` | var | free-plan D1 write guard (default **80,000**) | `worker.ts:172` | `pages/wrangler.toml` `[vars]` = "80000" | default |
| `JOIN_PER_IP_DAY`, `JOIN_PER_IP_MINUTE` | var (optional) | per-address new-seat caps (defaults 1500 / 200) | `worker.ts:185` | var | defaults |
| `PUBLIC_ORIGIN` | var | the site's own origin used in links, mails and report URLs (`https://corporate-tambola.pages.dev`) | `worker.ts`, `lifecycle.ts`, `partners.ts` | `pages/wrangler.toml` | falls back to the request's origin or `https://corporate-tambola.pages.dev` |
| `GOOGLE_CLIENT_ID` | var (optional, public - not a secret) | the OAuth client id of "Continue with Google". Unset = the button is hidden and `POST /api/auth/google` answers 404. Steps to get it: `docs/GOOGLE_SIGNIN_SETUP.md`. The pages that show the button (`signin`, `index`, `zc`) are the only ones whose CSP allows Google (`pages/build.mjs`, `GOOGLECSP`) |
| `MAIL_FROM` | var | From header (`Corporate Tambola <tambola@veridian-aios.com>`, shared verified Resend domain) | `pay.ts:76,85` | `pages/wrangler.toml` | same default |
| `MAIL_REPLY_TO` | var (optional) | reply-to address | `pay.ts` | var | none |
| `RESEND_API_KEY` | secret | sends mail (Resend). Docs say the key originally copied was the shared full-access DPDP key; a send-only Tambola key was to be created (owner step) | `pay.ts:60` | Pages secret | mails stay in the `outbox` table (local/test behaviour) |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | secret | enable real payments (live or test keys of the Razorpay account) | `pay.ts:39` | Pages secrets | `payMode()` = `off` (or `test` when `TEST_MODE=1`) |
| `RAZORPAY_WEBHOOK_SECRET` | secret | verifies the webhook signature | `pay.ts:235` | Pages secret | webhook answers 503 |
| `RAZORPAY_BASE_URL` | var (tests) | point at a stand-in gateway | `pay.ts:39` | - | `https://api.razorpay.com/v1` |
| `RAZORPAY_INTERNATIONAL` | var | `"1"` enables USD payments | `pay.ts:199` | var | USD refused |
| `COMPANY_JSON` | var | supplier details for invoices (legal name, GSTIN, PAN, state code, address lines, SAC, e-mail, phone); missing parts make invoices DRAFT | `pay.ts:38`, `mode.ts` (allow-list fallback) | `pages/wrangler.toml` `[vars]` (public company data is committed) | invoices are DRAFT |
| `FREE_LAUNCH` | var | `"1"`: engagements up to 100 participants publish already paid | `pay.ts:42` | var | off |
| `PARTNER_COMMISSION_RATE` | var | **lowers** the partner rate below 50% (0 to 0.5) | `partners.ts:53` | var | 0.5 |
| `TEST_MODE` | var | `"1"`: payments fulfil without Razorpay and sign-in/partner codes are echoed in answers. **Local only, never in production** | `pay.ts:43`, `worker.ts:549`, `partners.ts:111` | local env only | off |
| `OWNER_EMAIL`, `TEST_MAIL_ALLOW` | var | TEST-mode e-mail allow-list defaults (comma list) | `mode.ts:64` | var | falls back to company e-mail |
| `CONTROL_R2`, `CONTROL_BASE` | binding + var (optional) | serve the pause file from an R2 bucket behind a cached domain | `worker.ts:50-61` | not configured | Worker serves the file |
| `ANALYZE_AI_URL`, `ANALYZE_AI_KEY`, `ANALYZE_AI_MODEL` | var/secret (optional) | an OpenAI-compatible endpoint the owner's `analyze` route may send **masked** aggregates to | `audit.ts:35,347` | not configured | analysis done locally |
| `REPORT_KEY` | secret | `Authorization: Bearer` for `GET /api/telemetry` | `pages/functions/api/telemetry.ts` | Pages secret (value kept in `config/telemetry-report-key.txt`, git-ignored) | report returns 404 |
| `TARGET` | var (cron Worker) | base URL the cron calls (`https://corporate-tambola.pages.dev`) | `apps/cron/src/index.ts` | `apps/cron/wrangler.toml` `[vars]` | same default |
| `CRON_KEY` (cron) | secret | same value as the Pages `CRON_KEY` | `apps/cron` | `wrangler secret put CRON_KEY` in `apps/cron` | job gets 403 |
| `PORT`, `DB_FILE`, `CT_MODE` | local | local server port (default 8788), SQLite file (default `tambola-local.sqlite`), start in `TEST`/`LIVE` | `local.ts` | shell | defaults |
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_D1_TOKEN` | local tooling | used by `pages/launch.py` and wrangler | - | the owner's laptop environment | cannot deploy |

Secret hygiene: files `config/live-secrets.txt`, `config/platform-key.txt`, `config/telemetry-report-key.txt` exist on the owner's laptop and are git-ignored (`.gitignore`: `config/live-secrets.txt`, `config/platform-key.txt`, `config/telemetry-report-key.txt`, `.env*`, `data*/`, `*.sqlite*`). Do not read or print them. `docs/compliance/KEY_RUNBOOK.md` records the rotation of 2026-10-05 (platform key and salt rotated after an old commit contained them, history scrubbed; the shared Resend key still to be replaced by the owner). Rotation method (names only): `wrangler pages secret bulk <json> --project-name corporate-tambola`, then redeploy (Pages applies secrets on the next deployment). `pages/launch.py` generates `ORGANIZER_SECRET`/`PHONE_SALT` values with the `ctp_` prefix for the platform key (same visual prefix as partner keys, unrelated).

## 2. Local development

Tools: Bun (`bun` on PATH is `C:\Users\Dell\AppData\Roaming\npm\bun`; the real binary is `...\npm\node_modules\bun\node_modules\@oven\bun-windows-x64-baseline\bin\bun.exe`), Node for the .mjs tools, Python 3 for media/launch tools. 8 GB RAM laptop shared with other sessions: see section 3.

```
cd C:\ct\tambola
bun install
bun run build:zgame && bun run build:control      # only if you changed packages/beacon or shared; outputs are committed
TEST_MODE=1 PORT=8799 bun run zlocal               # whole stack on one port; prints the organizer key
#   landing  http://localhost:8799/      console http://localhost:8799/zc.html
#   guest    http://localhost:8799/z.html?e=<id>      big screen /big.html?e=<id>
#   CT_MODE=TEST bun run zlocal   starts the local DB in TEST mode
bun run dev                                         # LEGACY server on :8787 (apps/server); not the deployed product
bun run seed                                        # LEGACY: seeds the legacy server
```

- `apps/edge/src/local.ts`: `startLocal({port, secret, dbFile, webDir, budget, mode})` serves `apps/web/public` + `/api` + `/ai` with `handle()`; `localOrganizerKey()` stores one organizer key beside the database (`<db>.organizer-key`).
- A fresh `:memory:` DB is the default for `startLocal()` from tests; `DB_FILE` makes it persistent **for one run only**: a second start on the same file fails with `duplicate column name: jr` (verified; see `03-DATABASE.md`), so delete the file before restarting.
- Ready-made local tools: `tools/sim/demo-server.ts` (a game in progress with invented people; port 8793), `tools/sim/local-e2e-server.ts` (TEST mode, free engagements, for Playwright), `tools/sim/crowd.ts` (N PhoneRuntimes against the real Worker code in virtual time), `tools/sim/live-*.ts` (real-time runs against the real drand), `tools/sim/payments.ts` (stand-in Razorpay).

## 3. Tests: how to run, RAM rules, known failures

Run **targeted** tests; the full suite is large. Project rule file `C:\ct\HEAVY_JOB_PROTOCOL.md` (shared by every session on the 8 GB laptop, agreed 2026-10-06):

1. At most one background agent per session (two only if no browser/build is running).
2. Any full build, `next build`, Playwright/Chromium or large `bun test` run: first take the lock `mkdir C:/ct/heavy.lock` (if it exists, wait; remove only a lock you created; `rmdir` when done) and only when free RAM is above 1.2 GB. `tests/e2e/lock.mjs acquire|release <name>` implements this for the e2e suite.
3. Never leave dev servers or browsers running idle (PROJEXA's `scripts/windows-dev-process-guard.ps1 -StopPort <port>`; ports 3000/3110/3117 are PROJEXA's).
4. CI does the heavy builds; run targeted tests locally. 5. Batch work into one branch/PR.

| Command | What |
|---|---|
| `bun test apps/edge/test/<file>.test.ts` | one backend suite (fast; D1 is an in-memory SQLite stand-in `apps/edge/test/d1-sqlite.ts`) |
| `bun test packages` | shared logic (beacon, billing, engine, shared) |
| `bun test apps/web/test` | page tests in happy-dom |
| `bun test packages apps tools/control-worker` (`bun run test`) | the root script (everything except e2e) |
| `bun run typecheck` | `tsc --noEmit -p tsconfig.json` (includes edge, server, tools, billing, packages) |
| `bun test tests/e2e/timetravel` | time-travel suite: the real Worker with the clock handed to `handle(req, env, now)` so 22 h / 23 h / 365 d / 45 s pass instantly |
| `cd tests/e2e; E2E_TARGET=local node ../../node_modules/@playwright/test/cli.js test -c playwright.config.ts` (`E2E_MATCH='04-.*'`) | Playwright (system Chrome, max 2 workers) against a local stand-in; needs junctions to `C:\ct\ct\node_modules\@playwright` etc. (`tests/e2e/README.md`) |
| `node tests/e2e/run-live.mjs` | Playwright against the **real site** (takes the RAM lock, switches the site to TEST for the run and **restores LIVE in `finally`**; emergency: `--restore-only`). Do not run casually. |
| `node tests/e2e/make-register.mjs` | rebuilds `docs/E2E_TEST_CASES.md` and `tests/e2e/results/summary.json` from the jsonl result logs |

**Known pre-existing failures** (from `tests/e2e/results/summary.json`, run of 2026-10-06; these time-travel cases assert the *desired* behaviour and fail because the defect is still in code, re-verified by reading code on 2026-10-07): `TT-01`, `TT-02` (F-01 vote forgery by ticket id), `TT-03`, `TT-04`, `TT-05` (F-03 duplicate votes/claims burn the write budget), `TT-06` (F-10 per-address join cap for a big office), `TT-09`, `TT-14`, `TT-15` (F-04 payment fulfilment not atomic), `TT-21` (F-11 25-engagement tick window), `TT-22` (F-08 no upper limit on start time), `TT-24` (F-12 organizer e-mail/account kept after the last engagement is deleted), `TT-34` (G4 announce/pause reach phones only after the console registered its key). 23 time-travel cases pass; Playwright: security 20/21 (SEC-11b fixed since by the Co-host gate), inputs 19/24, public pages 11/13, game GM-01..10 pass; live pass 2/0. Specs `05-visitors-partners` and `06-crowd-api` were written and never executed. Do not "fix the test"; fix the product, or list the item as an accepted risk with the owner.

## 4. Build and deploy recipe (Cloudflare Pages)

```
# 0. get the repo green locally (targeted tests, typecheck), rebuild bundles if you touched shared logic:
bun run build:zgame ; bun run build:control ; bun run build:report
# 1. apply NEW D1 migrations to the live database BEFORE deploying code that reads them (0013, 0014 say so)
wrangler d1 execute corporate-tambola --remote --file apps/edge/migrations/0014_roles.sql     # example
# 2. build the static output and deploy
bun run pages:deploy
#    = bun run pages/build.mjs && cd pages && bunx wrangler@3 pages deploy public --project-name corporate-tambola --branch main --commit-dirty=true
# 3. smoke test (pages/launch.py's checks): /, /z.html, /zc.html, /partner.html, /api/z/ai-manifest, /api/payments/status
```

- **Pages Functions** under `pages/functions` are deployed together with the static output from the `pages/` project root. They bundle `apps/edge/src/worker.ts` through relative imports. `nodejs_compat` flag is required (billing uses `node:crypto` HMAC): in `pages/wrangler.toml` and in the project settings.
- **Secrets/vars** on the Pages project (production and preview) are not in files: set with `wrangler pages secret put NAME --project-name corporate-tambola` / `secret bulk`, or the REST API as in `pages/launch.py:57-62`. They take effect on the **next deployment**.
- **Cron Worker**: `cd apps/cron && bun x wrangler@3 deploy`, then `wrangler secret put CRON_KEY` (same value as Pages). Docs listed this as an owner step needing a token with *Workers Scripts: Edit* (`docs/PRIVACY_AND_LIFECYCLE.md` "Owner-only steps"). Without it, deletion and reports run only as a safety net on organizer traffic and phones' "over" posts.
- **Standalone Worker** (`apps/edge/wrangler.toml`): "NOT deployed yet", placeholder `database_id`; has its own daily cron `17 3 * * *` running `lifecycleTick`, `purgeOld`, `retryOutbox`.
- **Rollback**: Pages keeps every deployment: roll back in the Cloudflare dashboard (`docs/CONTINUITY.md`). D1 has no down-migrations; `wrangler d1 export corporate-tambola --remote --output backup.sql` first when changing data shape.
- **Regenerate generated files before deploying**: `bun run tools/make-trust.ts` (trust.html + llms.txt, after any change to `ai-facts.ts`), `node tools/make-legal-pages.mjs`, `bun tools/make-sitemap.mjs`; `bun run build:*` bundles. Tests catch stale trust/llms (`ai-enablement.test.ts`), stale legal pages (`terms.test.ts`) and sitemap rules (`seo.test.ts`).
- First-time creation of everything: `python pages/launch.py` (needs the three Cloudflare env vars; **loads only `0001_init.sql`**: apply `0002..0014` afterwards).

## 5. Monitoring

- First-party: `rum.js` -> `POST /api/telemetry` (page views, Core Web Vitals, errors, slow/failed API calls) and `GET /api/telemetry?days=7` with `Authorization: Bearer <REPORT_KEY>` for a plain-text report. Free D1 table, 5,000 events/day.
- Visitor journeys: `owner-visits.html` (platform key) / `GET /api/owner/visits/summary`.
- Audit: `GET /api/owner/audit/<chain>/verify` for tamper evidence; `GET /api/owner/audit/access` for who read what.
- `GET /api/payments/status`, `GET /api/mode`, `GET /api/z/ai-manifest` are cheap health probes (`launch.py` smoke test).
- Site mode: `GET /api/mode` must say `LIVE` in production. `tests/e2e/run-live.mjs --restore-only` restores LIVE after an interrupted test.
- `site monitoring + SEO setup` owner clicks (Cloudflare Web Analytics toggle, Search Console, uptime monitor) are owner-only.

## 6. Owner-only items

| Item | Notes |
|---|---|
| Razorpay keys, webhook secret + webhook URL `https://<site>/api/payments/webhook` (events `payment.captured`, `order.paid`) | `docs/RAZORPAY_OWNER_STEPS.md`, `docs/RAZORPAY_COLLECT_AND_PAYOUT.md`. Until set, `payMode()` is `off`. International (USD) additionally needs `RAZORPAY_INTERNATIONAL=1` |
| Complete `COMPANY_JSON` (GSTIN, state code, address, SAC) | otherwise invoices are DRAFT (public company data is already in the committed tomls) |
| Deploy the cron Worker (token with Workers Scripts: Edit) and its `CRON_KEY` | see section 4 |
| Inbound mail route for deletion requests + webhook to `/api/inbound-email` with `x-inbound-secret` | `docs/PRIVACY_AND_LIFECYCLE.md` |
| Replace the shared full-access Resend key by a send-only Tambola key | `docs/compliance/KEY_RUNBOOK.md` |
| Lawyer review of retention/consent/PDF wording and of partner terms; gaming-law memo | `docs/compliance/*` |
| Custom domain (then route `YOUR-DOMAIN/api/*` to the Worker if split, update `PUBLIC_ORIGIN`, sitemap origin, `trust-page.ts` `ORIGIN`, `tools/make-sitemap.mjs`) | currently `corporate-tambola.pages.dev` hard-coded in several files |
| Partner payouts, KYC/TDS decisions | outside the system (`partners.ts:8`) |
| Search Console / Cloudflare Web Analytics clicks / uptime monitor | owner dashboards |

## 7. Free-plan limits and what the code does about them

| Limit (Cloudflare free) | Value | Code response |
|---|---|---|
| Workers/Functions requests | 100,000 per day | pause poll interval scales with size; above 2,000 participants no pause; announcements ride in the control answer; claims are not stored for > 500; one-row seat list |
| D1 rows written | 100,000 per day | **`spend()` guard at 80,000** (`DAILY_WRITE_BUDGET`): refuse politely before the cap; every write route declares its cost (see `04-API-REFERENCE.md`) |
| Worker CPU | ~10 ms per call | no BLS verification server-side; report built in 250-person chunks; PDF laid out on the organizer's device |
| D1 bound values per statement | ~100 | `CHUNK = 40` in `test-data.ts` |
| Resend free mail | about 3,000/month, 100/day (per `GO_LIVE_ZERO_COST.md`; verify on the plan page) | one mail per purchase; no participant mail ever |
| 1 sending domain | shared `veridian-aios.com` with DPDP | `MAIL_FROM` |

A busy day: the Worker answers 503 "It is very busy right now"; budget resets at 00:00 UTC (`usage.day` is the UTC date).

## 8. Runbooks (common incidents)

| Incident | Check | Action |
|---|---|---|
| Whole site says "The service is not configured" (503) | `STRICT_KEYS=1` and one of the five secrets blank (`missingKeys`, `worker.ts:275`) | Set the missing secret on the Pages project and **redeploy** |
| "It is very busy right now" for everyone | `SELECT writes FROM usage WHERE day=<today UTC>` | If real traffic: wait for UTC midnight, or raise `DAILY_WRITE_BUDGET` only if the Cloudflare plan allows. If abuse: find the address-hash counters `jlim/` and the heavy routes (F-03) |
| A game was paid but phones still hold ("waiting") | `engagement.pack` (0 = unpaid), `kv paidby/<eid>`, payment row status | Webhook delivery: call `POST /api/payments/verify` flow or re-send the Razorpay webhook; `fulfil` is idempotent. A held game restarts ~3 min after payment (`restartedAtMs`) |
| Webhook returns 503 | `RAZORPAY_WEBHOOK_SECRET` missing | Set it, redeploy |
| Payment taken but no entitlement | `payment.status`, Razorpay dashboard | webhook `order.paid` replays are safe; verify amounts match (webhook ignores mismatches on purpose) |
| Organizer lost their key | - | `POST /api/auth/email` code flow; AI link: "Show my AI work link" page (`ai-link.html`) |
| AI link leaked | - | Organizer presses "Replace my AI link" (`POST /api/org/ai/replace`): all AI keys die at once. A new-country alert mail (`newUseAlertMail`) is the early signal |
| Report e-mail not received | `life.report_state`, `kv rpt/<eid>` stage, outbox | Tick runs it again each minute; link valid 22 h; organizer can `GET .../reportlink`, replace with `POST .../reportlink` |
| Deletion not happening | `lifecycle` tick not running (no cron) | Call `POST /api/lifecycle/tick` with the platform key; deploy the cron Worker. A `legal_hold` row suspends deletion on purpose |
| Participant asks for erasure | - | Console "Erase" (`POST .../erase`) or per person `forget` (not while running); or e-mail flow with 6-digit confirmation |
| Test data in production | `GET /api/owner/mode`, `is_test` counts | `POST /api/owner/mode {mode:"LIVE"}`, then `POST /api/owner/purge-test-data {"confirm":"purge test data"}` |
| Pause not reaching phones | console must have registered the key first (G4); size > 2,000 has no pause | Check `GET /api/z/<id>/control`; re-register key; see `docs/AI_LINK_AND_PAUSE_DESIGN.md` |
| Stuck/odd phone ("ticket already on another phone") | `seat.dev` | Organizer/Host `POST .../unbind {seat}`: the first device to return keeps the ticket |
| Secrets leaked | `docs/BREACH_RUNBOOK.md`, `docs/compliance/KEY_RUNBOOK.md` | rotate (do not rotate `DATA_KEY`/`PHONE_SALT` with live data), redeploy |
| Restore drill | `docs/CONTINUITY.md` | restore into a scratch DB; record in that file |
| Local server won't start on an existing SQLite file | error `duplicate column name: jr` (verified) | delete `tambola-local.sqlite*` (or set a new `DB_FILE`) and start again |
