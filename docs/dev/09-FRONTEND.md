# 09 - Frontend

Plain HTML + vanilla JavaScript (no framework, no bundler except three small `bun build` outputs), served as static files. All files in `apps/web/public/`. Global helper namespace `window.TB` (from `common.js`) and `window.ZG` (from `zgame.js`).

## 1. The three bundles (generated, committed)

| Output | Built from | Command (root `package.json`) | Exposes | Used by |
|---|---|---|---|---|
| `apps/web/public/zgame.js` (~124 KB) | `packages/beacon/src/zgame-browser.ts` (re-exports game.ts, config.ts, phone-runtime.ts, prize-engine.ts, index.ts beacon client, control.ts, shared ticket PATTERNS) | `bun run build:zgame` | `window.ZG` | `z.js`, `zc.js`, `big.js`, `demo.js` |
| `apps/web/public/control.js` (~6 KB) | `packages/beacon/src/control-browser.ts` | `bun run build:control` | `window.TBControl` (non-extractable Ed25519 key in IndexedDB db `tambola-control`; `publishControl`) | `zc.js` |
| `apps/web/public/reportgen.js` (~18 KB) | `apps/edge/src/report-browser.ts` (re-exports `layoutReport`, `layoutPeoplePart` of `report-layout.ts` over `pdf.ts`) | `bun run build:report` | report layout functions | `report.js` |

**Rule: after editing anything under `packages/beacon/src`, `packages/shared/src` or `apps/edge/src/report-*.ts`/`pdf.ts`, rebuild the bundle and commit it**; nothing rebuilds them in CI or in `pages/build.mjs`. A stale `zgame.js` means phones run different logic from the tested source. After rebuilding `zgame.js`/`zc.js`/`z.js` also bump the service-worker cache name (section 4).

## 2. Page scripts (how each works)

| Script | Size | What it does |
|---|---|---|
| `z.js` | ~42 KB | **The phone game.** Reads `?e=` (or the last engagement in `localStorage ct-last-eid`), `?from=`/`?cat=` (invitation), builds `new ZG.PhoneRuntime(EID, {api, getPublic, beacon:{}, mono:()=>performance.now(), store})`, and renders its `RuntimeView`: join form, waiting room (countdown, calendar `.ics`, setup message), ticket(s) with marking, spoken numbers (`audio.js`), still-to-win counters, break/opening/closing players (YouTube nocookie iframe, `<video>`/`<audio>`, or a link), lucky-draw card (draw or scratch), "Hurray" confetti on a win, late-joiner card, invite card (`GET /invites`), final card with refer-and-earn link, prize confirm card (`GET /myprizes`, `POST /confirm`). Stores per-engagement state in `localStorage` (device id `ctz:device`, sound `ctz-sound`, ticket marks) with try/catch; the phone number is **not** kept (a legacy `ctz-phone` is removed, `z.js:184`). Honors the **demo hook** `window.__CT_DEMO` (section 7). Exposes `window.__rt` (the runtime) for tests. |
| `zc.js` | ~124 KB | **The organizer console** (being rewritten, see section 8 and `05-ROLES-AND-PERMISSIONS.md`). IIFE with a single state object `S`; `call(method, path, body)` sends `x-organizer: <secret>`; holds the key in `sessionStorage ctz-org` only (also accepted via `?k=` / `#host=` / `#cohost=`); `BroadcastChannel("ctz-org-key")` lets a second tab of the same browser inherit the sign-in; `?e=<id>` opens a game; `?do=publish|erase|pause|stop` opens the exact hand-over card; `?quick=1` is the Quick setup form; AI helper mode (`S.shield`, `ctz-shield`) never fetches names and disables CSV. Exposes `window.__zc` (state) for tests. Pause: creates/uses the signing key through `TBControl`, registers it (`PUT control/key`) and publishes signed messages (`POST control`). |
| `big.js` | ~7 KB | Big screen: read-only. Uses `ZG.RoundStore`, `ZG.fetchRound`, `ZG.resolveControl`, `ZG.callRoundR`, `ZG.logFrom` (not `PhoneRuntime`) to derive the numbers from the beacon, plus `GET info`, `control`, `results`; never joins; no personal data. |
| `pay.js` | ~9 KB | Pay page: reads `?e=` and the key from `sessionStorage ctz-org`, shows the price from `/api/z/{id}/info` (cap) and `/api/z/{id}/cohost` (for Co-hosts), `POST /api/checkout`, then `TB.pay` (opens Razorpay Checkout; `common.js:136-146`) and `POST /api/payments/verify`. Works for Organizer, Host or Co-host keys. |
| `site.js` | ~23 KB | Home page: price cards from `TB.PACKS`, currency guess, festive-offer text, FAQ, the create / sign-in bottom sheet (`/api/start`, `/api/auth/email`, `/api/auth/verify`), stores `ctz-ref` from `?ref=` for 30 days and validates it (`/api/partner/check`), `FREE.on` constant (current process: build free, pay at publish). |
| `common.js` | ~11 KB | `window.TB`: `esc`, `ic` (icons), `qs`, `store`, `device`, `orgToken`, `api(method, path, body, headers)` (fetch with JSON), `toast`, `sheet/closeSheet`, `copy`, date/money formatters, `PACKS`/`price` (copy of pricing for display), `guessCurrency/guessCountry`, `pay`, `QR`. **Note**: pricing exists twice (here and in `packages/shared/src/pricing.ts`); a test keeps the page prices equal to `PACKS` (`branding.test.ts`). |
| `partner.js` | ~12 KB | Refer & Earn: enrol (`/api/partner/enroll`, code step `/enroll/verify`), partner key stored in `sessionStorage`, dashboard `/api/partner/me`, `/api/partner/close`. |
| `signin.js` | 2 KB | Sign-in e-mail landing: reads `?t=` token, removes it from the address bar, shows a button that POSTs `/api/auth/link`, then goes to `/ai-link.html` (`?go=ai`) or `/zc.html`. |
| `ai-link.js` | 7 KB | "Show my AI work link": e-mail code sign-in, then `GET /api/org/ai/link`, `POST /ai/replace`, `/ai/fresh`. |
| `report.js` + `reportgen.js` | 4 + 18 KB | Fetches `/api/report/{eid}?k=` in pieces (`base`, then `part=people&i=n`), lays out the PDF(s) in the browser (parts of up to 1,500 people), offers a download. Nothing is built server-side. |
| `preview.js` | 9 KB | "Test your brand moment": everything in `#w=break|opening|closing&k=kind&t=title&u=https-link&s=seconds`; same media player logic as `z.js`; never contacts the server. |
| `demo.js` + `demo-config.js` | 4 KB + tiny | Defines `window.__CT_DEMO` (api stub, in-memory store, `getPublic`, scripted `beacon`, `verify`, `mono`) from `packages/beacon/src/demo-script.ts`; `CT_DEMO_VIDEO` may hold a YouTube link to replace the built-in `demo-break.mp4`; "Run Demo" writes `#r=<first round>` and reloads. A test may set `window.__CT_DEMO_CLOCK`. |
| `audio.js` | 4 KB | Number voice: plays 90 recorded clips if present (`audioClipPath`, pack `v1-en-in-f`), otherwise browser speech synthesis; says the number twice ("Next number is ..., number ..."). |
| `v.js` | 9 KB | **Visit tracking** (public pages only; the list in `v.js:7` equals `PUBLIC_PATHS` in `visits.ts`): `sendBeacon("/api/v/b")` batches every ~15 s, on page hide, and immediately for key actions; GPC/DNT => no id. Never runs in the game. |
| `rum.js` | 3 KB | First-party monitoring: page views, Core Web Vitals, JS errors, failed/slow API calls -> `POST /api/telemetry` (no cookies, no IP, no query string, at most 30 events per page). |
| `pwa.js` | 3 KB | Registers `/zsw.js`, asks for persistent storage, fetches `/api/notices` and shows browser notifications only if the user pressed "Notify me" and allowed them. |
| `theme.js` | 1 KB | Three colour themes (maroon, blue, emerald) via `data-theme`, remembered in `localStorage ct-theme`; default blue. |
| `owner-visits.js` | 5 KB | Owner report viewer; draws with `textContent` only; asks for the platform key in the page. |
| `control.js` | 6 KB | see bundles |
| Legacy: `play.js`, `screen.js`, `console.js`, `confirm.js`, `sw.js` | 71, 21, 123, 13, 4 KB | server-driven pages; not shipped (see `08-SITEMAP.md`) |

CSS: `app.css` (design tokens, base), `z.css` (phone + organizer widgets), `zc.css` (console; uses CSS variables `--bg-tint-blue`, `--text-tint-blue`, `--surface-2` from the approved mock), `big.css` (dark, projector), `site.css`, `partner.css`, `fonts.css` (self-hosted Fraunces, Inter, IBM Plex Mono), legacy `play.css`, `screen.css`, `console.css`. Brand colors differ per file (`app.css` wine/gold tokens, `partner.css` navy/gold, `theme.js` blue default): there is no single design-token source.

## 3. Shared helpers worth knowing

- `window.TB.api(method, path, body)` throws `Error` with `.status`; the phone `api` in `z.js:13` additionally maps offline to a plain Error so `PhoneRuntime` can retry.
- Escape every dynamic string with `esc()` before `innerHTML` (tested by `apps/web/test/pages.test.ts` "hostile" cases; `owner-visits.js` uses `textContent`).
- Words: plain, short; no dropdowns (tap chips) in the console; "soft" privacy claims (see banned words in `12-CHANGE-GUIDE.md`).
- a11y: aria-labels on tickets and buttons; tested via DOM harness.

## 4. Service worker / PWA (`zsw.js`, `pwa.js`, `manifest.webmanifest`)

- `zsw.js`: `const CACHE = "ct-game-v16"` and `FILES = [/z.html, /zc.html, /big.html, /z.js, /zc.js, /big.js, /zgame.js, /control.js, /audio.js, /common.js, /app.css, /z.css, /big.css, /fonts.css, /pwa.js, /manifest.webmanifest, icons, 4 fonts]`. Pages: **network first**, saved copy when offline; other files: saved copy at once, refreshed in the background. `/api/*` and every other origin (the drand beacon) are **never touched**.
- **Cache version rule**: "bump when the game files change shape, so every phone saves a matching set" (comment `zsw.js:10`). Practically: change `CACHE` to `ct-game-v11` whenever you **add/remove a file in `FILES`** or ship a change that requires the page, `zgame.js` and `zc.js` to match. Old `ct-game-*` caches are deleted on activate (`zsw.js:37`). Note `zc.js` (rewritten) is in `FILES`, so a console change is also a cache concern.
- Test `apps/web/test/pwa.test.ts`: manifest installable; **every file the service worker saves exists and is shipped by `pages/build.mjs`**; every file the phone page loads is in the saved set; service worker never touches the API; installed app reopens the last game (`start_url: /z.html`); nothing visible of ours except via the browser's own notification permission.
- The dev `sw.js` (legacy) is a different file; do not confuse.

## 5. The build step `pages/build.mjs`

`bun run pages/build.mjs` (or `bun run pages:build`):

1. Deletes and recreates `pages/public/`.
2. Copies the **whitelist `FILES`** (60 entries, line 7) from `apps/web/public/`; throws `missing <file>` if one is absent. Then copies directories `fonts/` and `img/`. **A new page or script is not shipped until you add it here** (and tests `terms.test.ts`/`pwa.test.ts` may check the list).
3. Writes `pages/public/_headers`: per-page CSP/robots (see `08-SITEMAP.md`), cache headers.
4. Writes `pages/public/_routes.json` `{include:["/api/*","/ai/*"]}` so static files never run a Function.
5. `pages/public/` is git-ignored (`.gitignore`).
Deploy: `bun run pages:deploy` = build + `cd pages && bunx wrangler@3 pages deploy public --project-name corporate-tambola --branch main --commit-dirty=true`. The functions folder `pages/functions/` is picked up by Pages from the project root (`pages/`). See `10-OPERATIONS.md`.

## 6. The AI helper shield and hand-over (Option 2)

For an AI that works through a browser: `zc.js` has a switch "AI helper mode" (`#shield`, `sessionStorage ctz-shield`). While on: guest names and numbers are hidden ("Ticket n" instead), names are never fetched (`S.shield` skips `/names`), CSV download disabled, a note explains. Hand-over deep links open the exact confirm card for publish / erase / pause / stop and the human presses the button. `?quick=1` offers a single form with date/time pickers (readable fields for AIs). Tests: `apps/edge/test/ai-enablement.test.ts`, `apps/web/test/pages.test.ts`. (Console internals: as of spec; verify.)

## 7. Demo hook and test hooks

| Hook | Where | Purpose |
|---|---|---|
| `window.__CT_DEMO` | defined by `demo.js:48`, read by `z.js:7` | Replaces `api`, `store`, `getPublic`, beacon fetch, signature verification and the monotonic clock with scripted ones: the REAL phone page runs the demo with no server |
| `window.__CT_DEMO_CLOCK` | `demo.js:10` | a test may supply a faster clock |
| `window.__rt` | `z.js:442` | the `PhoneRuntime` instance (tests/e2e) |
| `window.__zc` | `zc.js:1067` | console state `S` (tests/e2e) |
| `PhoneDeps.noEarlyEnd`, `PhoneDeps.verify` | `phone-runtime.ts:11-24` | tests watch all 90 numbers, or skip BLS |
| `window.TBV` | `v.js` | marks the visit tracker as loaded |
| `window.__ctPwa` | `pwa.js:5` | single registration guard |
| `apps/web/test/harness.ts` | tests | loads real page scripts into happy-dom with `fetch` wired to the real Worker and an in-memory D1 |

## 8. TODO list: RE-VERIFY AFTER CONSOLE REWRITE

Another agent is rewriting `apps/web/public/zc.html`, `zc.js`, `zc.css` per `docs/ROLES_AND_CONSOLE_SPEC.md` (the working tree already contains a first version of it: it has the 10 sections (7 Check and publish, 8 Pay), role cards, Team calls and `?k=` login). When it is finished, re-check **exactly** these items in this documentation:

1. `08-SITEMAP.md` section 3: section order/names (9 for Organizer/Host, 3 for Co-host), which sections each role sees, the pinned AI-link strip, help entries ("Who can do what?", "What is the big screen link?").
2. `08-SITEMAP.md` table row for `zc.html`: the scripts/styles it loads and the list of API calls (compare with `grep -o '/api/[^"`]*' zc.js`).
3. `09-FRONTEND.md` section 2 (`zc.js` row): sign-in handling (`ctz-org`, `?k=`, `#host=`, `#cohost=`), `BroadcastChannel`, `ctz-shield`, `?quick=1`, `?do=`; the `window.__zc` hook; file size.
4. `05-ROLES-AND-PERMISSIONS.md`: that the console hides "start a new game" for Hosts (server refuses `POST /api/z` for `host`), hides account cards for Hosts, and shows Co-hosts only their three steps; role pills (`Organizer`, `Host n of 5`, `Co-host`, `Refer and Earn Partner`, `Sales Partner`) and how partner kinds are told apart (`S.kind`, `zc.js:481`).
5. `08-SITEMAP.md`/`09-FRONTEND.md`: payment pill (`Paid`/`Payment pending`) and the one-payment notice strip; Host label "Host n of 5" (how `S.hostN` is found).
6. The invitations hint text and the three levels (spec section "Step 2").
7. `zsw.js`: `FILES` lists `/zc.js` but `/zc.css` is **not** in it today (verified 2026-10-07; the console page then loads its stylesheet from the network only), and bump `CACHE` if the file set changed; re-run `apps/web/test/pwa.test.ts`.
8. `pages/build.mjs` `FILES`: whether new assets (icons, images, fonts) were added by the rewrite and are whitelisted.
9. `apps/web/test/pages.test.ts`, `visits-dom.test.ts`, `testmode-banner.test.ts` and `apps/edge/test/branding.test.ts` (banned claims run over `zc.js`): wording/structure assertions that the rewrite had to update; list which tests changed.
10. `06-BUSINESS-LOGIC.md` section 7/B-rules and `12-CHANGE-GUIDE.md`: any new console-side validation of brand moments (kinds "Type a message / YouTube link / Paste video file link / Paste audio file link"), prize chips ("I will decide later", "No prize" shows "No prize" on tickets: confirm where that text is stored).
11. `KNOWN-DOC-DRIFT.md`: remove items the rewrite fixed (for example the "co-host" wording in console texts).
12. `07-FLOWS.md` flow 1 and flow 4 (step numbering, links the console shows to copy for Hosts/Co-hosts).

**Credit instead of refunds (spec 6), unplayed games (spec 5), phone, big-screen and pay pages (`z.js`, `big.js`, `pay.js`, `paylink.js`):** `z.js` reads `info.didNotStart` (and a join answer with `code:"did-not-start"`) and shows one calm screen "This game did not start. Your details have been erased."; while the control file says `locked` it shows "Waiting for the Organizer or Host to start the game." to everyone, and "Payment pending for this game." to a person whose `/me` answer says `role` is `organizer` or `host`. `big.js` shows the same three states from the control file (`locked`, `cancelled`, `didNotStart`). `pay.js` shows "You have credit of Rs X (valid until <date>). Use it for this game." from `info.credit` / `creditExpiresMs` / `creditApplied` (a Co-host reads the same fields from `/cohost`), calls `POST /api/z/{id}/pay-with-credit`, and charges only the difference at the normal checkout; it no longer says "pay before the start": it says payment is pending and can be made until the guest data is erased. `paylink.js` knows the status `closed`. The service worker cache is `ct-game-v16`.

**Credit instead of refunds (spec 6), unplayed games and clone (spec 5), console side:** the cancel flow keeps three confirmations but speaks of credit (`cancel-preview.credit`, `cancel.credit`); the Pay step shows `summary.credit` with a "Use my credit" button (`POST /api/z/{id}/pay-with-credit`) and "Your account" lists `GET /api/org/credit`; `waitingFor`, `erasureMs` and `didNotStart` on info/summary drive the "Guest data will be erased on ..." line and the "This game did not start" state; "Create a new game like this one" calls `POST /api/z/{id}/clone` and opens the new game on step 1 with the date and time empty (`S.cloneNew`).
