# Knowledge: Corporate Tambola (corporate-tambola)

Written 20 Nov 2026 for a future AI session that has never seen this repo (standard: marketing-ledger plans/VERSION-AND-KNOWLEDGE-STANDARD-2026-11-20.md). It describes the CURRENT state only, from the code and existing docs. Anything not found is marked "unknown". Do not publish this file on the website.

## 1. What this is
Housie/Tambola for company events: an organizer makes a game, shares one link, players join on their own phones. The first game of the suite and the source the common engine (corporate-game-core) was copied from at 1.9.0 (tag frozen-1.9.0).
- Live site: https://housie.corporatetambola.com (Cloudflare Pages project `corporate-tambola`). Live version now (from `/version.json`, read 20 Nov 2026): **1.9.0**, commit `be7e4da0e124`, built 2026-11-16 17:28 UTC (22:58 IST).
- Other repos and what they are for: `KNOWLEDGE-MAP.md` in the repo root.

## 2. How it connects
Players and organizers reach the suite like this: home.corporatetambola.com (login gate) -> console.corporatetambola.com (set up, invite, pay) -> moneypenny.corporatetambola.com (credits; the single payment gate) -> IT Services by Rajat Agarwal -> Razorpay. Each game is its own website and takes settings from the console by API; a game calls ONLY Moneypenny for payment, never IT Services or Razorpay. The console-to-game contract is `docs/CONTRACT_V1.md` and `contract/` in corporate-console; the pay contract is `GAME_PAY_CONTRACT.md` (in the console pay-step branch: unknown on the default branch). Moneypenny chat: moneypennychat.corporatetambola.com.

## 3. Map of folders and the files that matter
apps/edge (Cloudflare Pages Functions: pay.ts, approvals.ts, people.ts, lifecycle.ts, ledger.ts, mails.ts, mode.ts, ai-*.ts, owner-stats.ts, migrations 0001..0032 in apps/edge/migrations), apps/web/public (pages and scripts the player and organizer see), apps/server (local dev server), apps/cron (scheduled jobs), packages/engine (game rules), packages/billing, packages/beacon (browser control code), packages/shared, pages/ (build.mjs, version.mjs writes version.json, wrangler.toml, cache-bust.mjs), tools/ (sim, livetest, load tests, control-worker, errorlog), tests/e2e, deploy/ (ROLLBACK_V2.sql, UPDATE_LIVE_DATABASE.sql), docs/ (about 100 files: NOTES, IMPLEMENTATION, DEPLOYS, GATES, ERROR_LOG, AUDIT-V2-ROUND-1..9, dev/10-OPERATIONS.md, dev/03-DATABASE.md).

Files that matter: apps/edge/src/pay.ts; apps/edge/src/people.ts (ID normalisation, see below); apps/edge/src/approvals.ts (waiting room, 30 min lapse); apps/edge/src/lifecycle.ts (deletion); apps/edge/src/mode.ts (TEST/LIVE); apps/edge/src/ledger.ts and ledgerc.ts; pages/version.mjs; pages/build.mjs; docs/DEPLOYS.md; docs/NOTES.md; docs/dev/10-OPERATIONS.md.

## 4. Rules in force
- Suite rules version 1.1 (20 Nov 2026): `docs/SUITE_RULES.md` (on branch docs/suite-rules-v1-1-2026-11-20 until merged); source in the ledger `plans/SUITE-RULES-VERSION-2026-11-20.md`.
- One login (home), one console, one credit/payment system (Moneypenny), one chatbot system; no game or console has its own login, payment or chat; pay only via Moneypenny.
- Invite by ID only: one alphanumeric ID field, no names or personal details; strip every non-alphanumeric and uppercase before matching; not-on-list people need organizer/host approval; optional family invites (default 4) with approval.
- Console voice = "you", polite, simple English; privacy line "designed to follow US privacy laws, EU GDPR and India's DPDP"; all participant information including IDs deleted within 24 hours after the game; billing line only "We keep billing data for audit and tax reasons."
- Fairness wording: "No one knows the next number: not the organizer, not the host, not even the software." Prices with the rupee sign. Prizes: "You (the company) give the prizes directly to the winners."
- Do not claim "100% secure", "most secure gateway", "played by major companies".

## 5. How to run the tests
`bun test packages apps tools/control-worker` (root script `test`), `tsc --noEmit -p tsconfig.json` (`typecheck`), `bun run sim` for simulations, tools/livetest against the real site. Heavy runs: take C:/ct/heavy.lock first (HEAVY_JOB_PROTOCOL).
RAM on the owner's laptop is tight: no full builds or browsers without the heavy lock (C:/ct/HEAVY_JOB_PROTOCOL.md).

## 6. Deploy and roll back
`bun run pages:deploy` builds pages/public (writes version.json) and uploads to Cloudflare Pages project corporate-tambola. Database changes are the numbered files in apps/edge/migrations. deploy/ROLLBACK_V2.sql reverses the v2 database change. Pages keeps every deployment: roll back in the Cloudflare dashboard. The previous-deployment id for the live 1.9.0 deploy: unknown (docs/DEPLOYS.md table was last refreshed 2026-10-14; refresh with tools/list-deploys.mjs, needs Cloudflare token).
Nothing is deployed from a docs-only change. Cloudflare only, no Vercel. Every deploy needs a version bump and a CHANGELOG entry (standard section 1).

## 7. Known issues and open failures
Known by the 20 Nov audits (branches audit/id-invite-edge-2026-11-20, audit/id-invite-web-2026-11-20): the code still keeps - . _ / in employee IDs (normEmp in apps/edge/src/people.ts) which is NOT the owner rule (strip every non-alphanumeric, uppercase); console list screen lacks a paste button. Open pull requests #22-#27 are other sessions' work (ID invite and v2): not described here. Smoke failure map: unknown (not found in this repo).

## 8. Owner-only steps still open
Secrets and keys are the owner's (names only in config/SECRETS_NAMES.md where present). Deploy, domain, payment live mode and the Rs 1 payment test are the owner's decisions via BOSS. Versioning work still to do in this repo: `docs/VERSIONING-TODO.md`.
