# 11 - Testing

Runner: `bun test` (built-in, `bun:test`). Test counts below are the number of `test(...)`/`it(...)` calls counted on 2026-10-07 (parametrised or loop-generated tests count once). To count again: `grep -c '^\s*\(test\|it\)(' <file>`.

## 1. Test map: file -> what it covers

### 1.1 Backend (`apps/edge/test`, in-memory SQLite D1 stand-in)

Helpers: `d1-sqlite.ts` (`makeD1()` applies `SCHEMA` to `bun:sqlite`, same prepare/bind/run/all/first/batch shape), `device.ts` (`DEVICE`, `withDevice`: older tests join from one device unless they say otherwise), `settle.ts` (puts a winners result in place by posting enough agreeing votes). Tests call `handle(new Request(...), env, now)` with a **handed-in clock**, so time is simulated.

| File | Tests | Covers (feature / use case) |
|---|---|---|
| `worker.test.ts` | 110 | create/validate, join (dedupe of numbers, one ticket per phone, caps, device 423), claims, quorum voting, public results, winner confirmation/prize given, write budget, 10,000-person join, history, purge, erase, reuse, roster, settings window, AI key rights and audit trail, suggestions board (rights, votes, privacy, limits), static control copy (R2), rounds, seats and late joiners, brand-moment allowance, key list/retire, daily purge trigger |
| `usecases.test.ts` | 58 | UC-1..UC-82 server use cases: sign-in codes, key refusal, publish/pay paths, held/late payment, webhook, credits, GSTIN, mail down, budget, tenant isolation, AI manifest/worked examples/summary read-back, pause profiles by size, announcements, Host via link, scratch lucky draw |
| `free-launch.test.ts` | 17 | the organizer journey: start without payment, drafts, publish free, held unpaid, move start, reminder, entitlement publish, AI hand-over, contact confirmation, 30-day draft forgetting, `FREE_LAUNCH` |
| `pay.test.ts` | 42 | checkout, Razorpay order, verify/webhook (signatures, amounts, idempotency), entitlement per purchase, invoice numbering/GST/DRAFT, mail handling, sign-in codes, bound payment to draft |
| `credit.test.ts` | 27 | Spec 6, no refunds: cancel -> credit with the right amount and expiry, `GET /api/org/credit`, `pay-with-credit` in full / partly (top-up) / with a remainder, oldest-expiring first, once and never below zero, pay-link isolation, payment after a cancel, lapse at the end of day 365 IST, the five mails once each |
| `unplayed.test.ts` | 22 | Spec 5 A: erasure of a game that did not start (and the played-game rule unchanged), closed state, reschedule moves the clock, no payment cut-off, heads-up and after mails, settings kept 30 days, the 30-day limit |
| `clone.test.ts` | 11 | Spec 5 B: `POST /api/z/{id}/clone` (who, what is and is not copied, start pending, draft limit, people list, audit, closed/cancelled sources) |
| `roles.test.ts` | 14 (untracked) | Organizer/Host/Co-host rules (see `05-ROLES-AND-PERMISSIONS.md` section 9) |
| `brand-ticket.test.ts` | 10 | Phase 3 brand on the ticket: name, 8-colour palette, logo type/size/first bytes, injection, settings/info/summary |
| `paylink.test.ts` | 16 | Phase 3 pay link: who makes it, public view, expiry, replacement, checkout bound to the game, paid-by-link, cancel -> credit |
| `google-signin.test.ts` | 10 | Phase 4 "Continue with Google": token checks with a fake signing key (never calls Google), sign-up, sign-in, limits |
| `host-setup.test.ts` | 25 | Phase 4 Host first open: strict harness `makeD1({ strictHosts: true })`; the default harness finishes a new Host's setup by a trigger so other tests can use Host keys |
| `csp-google.test.ts` | 3 | Phase 3/4 headers in `pages/build.mjs` |
| `partners.test.ts` | 25 | refer-and-earn: enrol with e-mail code, no enumeration, limits, commission 50% and repeat rule, self-referral, void/payout/rate, partner visibility |
| `privacy.test.ts` | 25 | sealed data, participant list without names, invitations (limit 4, kinds, races), winners record, game-over votes, report e-mail/link, 22 h/23 h/365 d clocks, erase and e-mail deletion requests, notices |
| `shred.test.ts` | 10 | audit crypto-shredding, chain still verifies, hold, constants (22 h / 23 h) |
| `retention.test.ts` | 6 | `retentionSweep` windows |
| `audit.test.ts` | 17 | audit log: sealing, redaction, AI vendor proof, chain verify (removed/changed/re-pointed), owner-only 404, access log, anonymous aggregate, deletion certificate, legal hold |
| `visits.test.ts` | 29 | visit tracking: address shortening/hash, source classification, bots, PUBLIC_PATHS only, GPC/DNT, caps/budgets, funnel, owner reports, retention roll-up |
| `mode.test.ts` | 24 | TEST/LIVE mode, mail allow-list, `is_test` flags, purge of test data |
| `abuse.test.ts` | 6 | per-address join caps |
| `account.test.ts` | 8 | replace report link, close account, partner close, notification button, privacy/fairness wording |
| `ai-link.test.ts` | 25 | `/ai/<key>` manual, JSON form, routes equal key/header, GET-only `_method/_body`, 404s, rights of AI and Host links, audit |
| `ai-enablement.test.ts` | 12 | front door/map/facts/go, guided new-game and edit paths, function classification (ai/handover/human), refusals say what next, **trust.html and llms.txt equal the generated text** |
| `ai-mail.test.ts` | 13 | dedicated AI-link mails, **no other source may carry an AI link** (source scan), replace, GET/HEAD never mutate |
| `ai-mail-expiry.test.ts` | 8 | 24-hour keys, fresh link, 5-live cap, sealed lasting key, new-place alerts |
| `ai-privacy.test.ts` | 5 | planted names/numbers never reach an AI response; person deletion |
| `ai-signin.test.ts` | 8 | sign-in mail, one-click link single use, expiry, rate limits |
| `branding.test.ts` | 16 | every mail branded, page wording lines, **banned claims**, structured-data prices = `PACKS` |
| `terms.test.ts` | 6 | legal pages, footers, Terms version recorded |
| `keys.test.ts` | 3 | `STRICT_KEYS` |
| `migrations.test.ts` | 1 | migrations 0001..0014 equal `SCHEMA` |

### 1.2 Pages (`apps/web/test`, happy-dom with the real page scripts)

`harness.ts` loads `apps/web/public/*.js` into a DOM with `fetch` wired to the real Worker and an in-memory DB.

| File | Tests | Covers |
|---|---|---|
| `pages.test.ts` | 80 | UC-53..UC-57, UC-80/82: home pinned strip, AI link pages, console (role pill, payment pill, nine steps for Organizer, Host "Host 1 of 5", Co-host three steps, `#cohost=`/`#host=`/`?k=`, Your team, no dropdowns, prizes chips, brand moments kinds, scratch card, invites, help), pay page, phone page (waiting room, held, announcement, hurray, late joiner, break/opening/closing players), refer-and-earn page, demo, preview, hand-over links |
| `pwa.test.ts` | 6 | manifest, files saved by the service worker are shipped, no API touched |
| `seo.test.ts` | 6 | sitemap/robots/titles/canonical/structured data |
| `testmode-banner.test.ts` | 3 | TEST banner only inside the console |
| `visits-dom.test.ts` | 10 | `v.js` behaviour and exclusions |

### 1.3 Shared packages

| File | Tests | Covers |
|---|---|---|
| `packages/beacon/test/beacon.test.ts` | 22 | drand client, `verifyRound`, `pickNumber`, `deriveCalls`, `scheduleFor` |
| `config.test.ts` | 30 | `validateCfg` rules (rewards, breaks, brand-moment allowance, invites, quorum) |
| `control.test.ts` | 21 | signed pause/resume/extend/stop, lead times, `acceptLog`, safety profiles |
| `game.test.ts` | 34 | tickets, `settleAll`, lucky winners, schedule with breaks/pauses/rounds |
| `phone-runtime.test.ts` | 36 | the phone loop without UI: join, numbers, votes, pauses, late joiner, breaks, mirrors failing |
| `prize-engine.test.ts`, `late-joiner.test.ts`, `unique-ticket.test.ts`, `demo-script.test.ts` | 7, 3, 7, 6 | incremental engine equals `settleAll`; late joiner counting; no two tickets equal; demo script re-derived from the real functions |
| `houses.test.ts`, `houses-runtime.test.ts` (beacon), `houses-pages.test.ts` (web) | 33, 4, 4 | every house rule, engine equals `settleAll` for all houses, Unlucky (fewest marked, tie-break, exclusions, late joiners), maximum winners and old games, real phones agree with the whole-log settlement |
| `packages/shared/test/shared.test.ts` | 11 | phone normalisation, upload parsing, pricing |
| `packages/billing/test/billing.test.ts` | 16 | GST split, invoice numbers/render, signatures |
| `packages/engine/test/engine.test.ts`, `surprise.test.ts` | 32, 33 | **legacy** server engine |
| `apps/server/test/ai-link.test.ts`, `ai-coverage.test.ts` | 8, 1 | **legacy** server AI link and route coverage |
| `tools/control-worker/worker.test.ts` | 1 | R2 control-file Worker (undeployed) |

### 1.4 End-to-end (`tests/e2e`)

| File | Prefix | Covers |
|---|---|---|
| `01-security-isolation.spec.ts` | SEC-* | owner endpoints, IDOR, AI link and Co-host limits, revoked keys |
| `02-inputs-and-abuse.spec.ts` | INP-* | invalid/oversized inputs on every entry point |
| `03-public-pages.spec.ts` | PUB-* | every public page in Chrome, price cards, sitemap/robots, PWA offline |
| `04-game-multi-user.spec.ts` | GM-* | a whole engagement with several browser contexts |
| `05-visitors-partners.spec.ts` | VIS-*, PTR-* | visit tracker, partner enrolment (never executed yet) |
| `06-crowd-api.spec.ts` | CRD-* | 100 and 250 people through the API (never executed yet) |
| `timetravel/10-game-integrity.test.ts` .. `13-keys-limits-gaps.test.ts` (+ `lib.ts`) | TT-* | the real Worker with a simulated clock: forged votes, budget burn, payment races, 22 h/23 h/365 d, 45 s lock, crowd sim, key limits; **13 fail on purpose until the defects are fixed** (see `10-OPERATIONS.md` section 3) |
| `lib/harness.ts`, `lib/local-server.ts`, `run-live.mjs`, `lock.mjs`, `make-register.mjs`, `playwright.config.ts` | | harness, local stand-in, safe live run, RAM lock, register builder (`docs/E2E_TEST_CASES.md`) |

### 1.5 Simulations (`tools/sim`, not run by `bun test`)

`crowd.ts` (N phones in virtual time against the real Worker), `phones.ts`, `pause.ts` (signature/freshness with lying mirrors), `live-local.ts`, `live-paid.ts`, `live-unpaid.ts` (real time, real drand, local Worker), `payments.ts`, `ai-persona.ts`/`ai-control.ts` (an AI works the whole job), `browser-e2e.mjs`, `pwa-check.mjs`, `notice-check.mjs`, screenshot helpers.

## 2. Use cases to tests (`docs/USE_CASES.md`)

Every row has an id (UC-n). The test title starts with the same id, so `grep -rn "UC-12" apps packages` finds it. Main homes: `apps/edge/test/usecases.test.ts` (server and money), `apps/edge/test/free-launch.test.ts` (organizer journey), `apps/web/test/pages.test.ts` (UC-53..57 pages), `packages/beacon/test/phone-runtime.test.ts` (phones, timing, pauses), `tools/sim/*` (crowds, real time). Gaps: see `docs/E2E_GAP_SCENARIOS.md`. Doc drift in the use-case table (UC-4 says 6 accounts/day; code and test say 10) is in `KNOWN-DOC-DRIFT.md`.

## 3. How to add a test

1. Pick the home by layer: pure logic -> `packages/*/test`; route behaviour -> `apps/edge/test/<area>.test.ts`; page -> `apps/web/test/pages.test.ts`; time-dependent (hours/days) -> use the handed-in `now` (no sleeping) or `tests/e2e/timetravel/lib.ts` `world()`.
2. Backend test skeleton (copy from `roles.test.ts` / `free-launch.test.ts`):
```ts
import { beforeEach, expect, test } from "bun:test";
import { handle, type Env } from "../src/worker";
import { makeD1 } from "./d1-sqlite";
const T = Date.UTC(2026, 9, 1, 10, 0, 0);
let env: Env;
beforeEach(() => { const d = makeD1(); env = { DB: d.db, ORGANIZER_SECRET: "plat", DATA_KEY: "k".repeat(32), PHONE_SALT: "s", PUBLIC_ORIGIN: "https://tambola.test" } as Env; });
const call = (m: string, p: string, b?: unknown, h: Record<string, string> = {}, now = T) =>
  handle(new Request("http://x" + p, { method: m, headers: { "content-type": "application/json", ...h }, body: b === undefined ? undefined : JSON.stringify(b) }), env, now);
```
3. Name it with the UC id if it implements a row of `docs/USE_CASES.md`; add the row if it is new.
4. A new route that touches the AI link must appear in `apps/edge/test/ai-enablement.test.ts` ("each function has a check here") and in `ai-functions.ts` or the manual; the legacy `apps/server/test/ai-coverage.test.ts` is for the legacy server only.
5. A schema change: add the migration, append it to the `FILES` list in `migrations.test.ts`, append statements to `SCHEMA`; the test fails otherwise (`12-CHANGE-GUIDE.md`).
6. Run only your file with `bun test path/to/file.test.ts` (RAM rules in `10-OPERATIONS.md`).

## 4. Mutation-check practice

There is **no automated mutation tool** in this repo. The practice the project uses and expects (observable in the tests' wording):

- **Assert the desired behaviour, then prove the test can fail.** Before trusting a new test, break the code it guards for a moment (flip a comparison, delete the guard, return early) and confirm the test goes red, then restore. The time-travel suite does this by design: its cases assert the *correct* behaviour and **fail while a known defect exists** (`tests/e2e/results/summary.json`; each failing id carries its finding id such as `F-01`).
- **Sanity first**: `ai-privacy.test.ts` plants identifiable names/numbers and first asserts they really are stored ("the planted identifiers are really stored (sanity)") so the later "never reaches an AI" assertions cannot pass vacuously.
- **Guard tests that scan the source**: `ai-mail.test.ts` ("no other source that builds a mail... can carry an AI link"), `branding.test.ts` (banned claims over named files), `ai-enablement.test.ts` (generated pages equal committed files), `pwa.test.ts` (every cached file is shipped), `migrations.test.ts` (SQL equals `SCHEMA`). A change that breaks them is meant to be loud.
- When you fix a known defect, flip its register entry: re-run `tests/e2e/timetravel` and `node tests/e2e/make-register.mjs`.
